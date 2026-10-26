# Design

Typeflake writes Nix modules in Effect TypeScript. A module is a `.ts` file that Typeflake renders to an
ordinary `.nix` file next to it. Its types come from the option graph of the project's own
configurations. A module is checked against nixpkgs, Home Manager, third-party modules and the
project's own option declarations, all at the versions `flake.lock` pins.

The first prototype (bookmark `prototype`) rendered static config objects into `flake.nix` and typed
13 hand-picked options. Real modules are functions of `config`, `pkgs` and `lib`. They declare
options and interpolate store paths into strings, and the prototype could express none of that.

## Rules

1. Generated Nix builds with Nix alone, without Node, Bun or a Typeflake Nix library. Deleting the
   `.ts` files leaves a working repository.
2. Types come from the project's configurations, probed with `nix eval`. Generated declarations
   augment a `Register` interface, so `NixOS.module(...)` is typed without annotations.
3. Every Nix expression is typed by the value it evaluates to: `Nix<T>`. No `any`, and no untyped strings in
   typed positions. Option types Typeflake can't map stay visible as `Unsupported<"name">`.
4. Porting a module doesn't change any host's `system.build.toplevel.drvPath`. That is the test for
   every port.

## Decisions

- Modules come first. The existing `flake.nix` imports generated modules like any other. A `flake.ts`
  comes later, on the same AST; flake inputs are a few lines of data and can't be computed anyway.
- `~/infra` is the first consumer: 227 Nix files, NixOS and nix-darwin hosts, Home Manager, disko,
  sops-nix.
- Effect follows Calder. Authoring values are pipeable descriptions with Effect-style type parameters.
  A module body is a plain function, or a generator when it needs generation-time services. Those
  services land in the module's `R`, and the CLI provides them as layers, so a module that reads the
  file system says so in its type. That replaces the prototype's taint labels. The CLI is Effect too,
  with Schema decoding the probe's output.
- Node runs the CLI and imports `*.nix.ts` modules directly, stripping their types, so there is no
  TypeScript compiler at runtime. Typechecking is the editor's and `vp check`'s job. The npm package
  ships JavaScript, since Node doesn't strip types inside `node_modules`.
- The repository follows Hauke's TypeScript conventions: the shared tsconfig, Vite+ for format, lint
  (type-aware oxlint with the Effect presets and the vendored anti-slop plugin) and tests next to
  their modules.
- tsrs, Oxc's Rust port of the TypeScript 7 compiler, builds the package and checks the site and
  the example; `typeflake bump` uses it when a project has it. Its diagnostics and emit match tsc's
  (the build's 38 files are byte-identical). On the example's 7.5 MB of generated declarations it
  checks in 0.73 s with 146 MB, against tsc's 2.55 s and 354 MB. That diverges from the conventions, which take the native TS 7 compiler: both are
  experimental, and so is Typeflake. `vp check` still type-checks through oxlint's own Go checker,
  which also runs the Effect rules; tsrs doesn't load language service plugins, and the Effect
  diagnostics come from a patch to the Go compiler. tsrs is a glibc binary, so NixOS needs
  `nix-ld` for it.

A module, condensed from the port of infra's `modules/features/app-stores`:

```ts
export default NixOS.module({
  options: {
    appStores: { enable: Options.enable("asc and gplay with the Urbs UG store credentials") },
  },
  config: ({ config, lib, pkgs }) => {
    const secrets = config.sops.secrets;
    const asc = pkgs.writeShellApplication({
      name: "asc",
      text: nix`
        ASC_PRIVATE_KEY=$(cat ${secrets["app-store-connect/api-key"].path})
        exec ${lib.getExe(pkgs.callPackage(path("./asc-package.nix"), {}))} "$@"
      `,
    });
    return mkIf(config.appStores.enable, {
      sops: {
        secrets: {
          "app-store-connect/api-key": { owner: config.identity.primaryUser, mode: "0400" },
        },
      },
      environment: { systemPackages: [asc] },
    });
  },
});
```

Typeflake calls `config` once with proxies, and property access builds Nix AST. Nothing is evaluated in
Node. TypeScript can't branch on a `Nix<boolean>`, so conditions go through `mkIf` or `ifThenElse`.

How the pieces fit:

- `Nix<T>` is an expression that evaluates to `T`, with symbol keys so it can't collide with option
  names. `NixProxy<T>` adds its fields as expressions and keeps function signatures, so
  `lib.getExe(pkg)` is typed by `Lib`.
- An option slot accepts `Definition<T> = Data<T> | Nix<T> | Override<Data<T>>`. `mkIf`, `mkForce`
  and the rest take their content type with `NoInfer`, so it comes from the slot. A typo inside `mkIf`
  fails like one outside it, excess properties included.
- TypeScript checks an object literal for keys its type lacks only as an argument, an annotated
  return or an assignment, never as the value a callback returns (microsoft/TypeScript#241). A
  `config` function therefore returns its definitions through `define`, `mkIf` or another helper,
  and its return type rules out a plain object, so a misspelled option next to a correct one fails.
  `config` may also be the definitions themselves, for a module that needs no arguments.
- A callback without parameters is checked before `D` is inferred from `options`, so definitions are
  typed by the probed options alone. A module reads its own options before any probe, but defining
  their values in the same module waits for one.
- `` nix`...` `` dedents exactly like a Nix `''` string, so scripts move from Nix unchanged. The
  printer only writes `''` strings when the dedent provably returns the value. Otherwise it writes
  escaped `"..."` strings, so rendering never changes a string. Tests evaluate both against Nix.
- A module's formals are the variables its body uses: config, lib, pkgs and any `specialArgs` such as
  infra's `self`, which a project types through `Register.args`.
- `Register` is declared in the package's entry module, because `declare module "typeflake"` only
  merges into interfaces that module declares itself. `NixOS.module` has the named type
  `Module.Maker<"nixos">`, so the declaration build doesn't resolve the options against Typeflake's
  own empty `Register`.

## Option probe

`src/probe.nix` walks a configuration's `options` with builtins only:

```sh
nix eval --impure --json .#nixosConfigurations.srv-2.options \
  --apply 'import ./src/probe.nix { class = "nixos"; }'
```

It reads structured type metadata (`nestedTypes`, `functor.payload.values`, `getSubOptions`) and never
parses descriptions. Walking a real host's graph turned up these constraints:

- Some types describe themselves without end (`boot.kernel.sysfs`), and `tryEval` can't catch infinite
  recursion. Like the NixOS manual, the probe reads descriptions only for leaf types and visible
  options' own types, and doesn't inspect hidden options.
- Types have no identity, so recursion is detected through what does. A submodule's module class
  (`homeManager`, `nixos`) becomes a reference the second time. An option's declaration position plus
  its location within its submodule does too (disko's `content`). Position alone isn't unique: helper
  functions such as strongswan's declare many options at one position.
- `oneOf` nests an `either` per alternative, so the probe flattens unions. Other recursion, such as
  `pkgs.formats.json`, is unrolled to depth 6 and ends as `NixValue`.
- `home-manager.users` is `visible = "shallow"`, which only keeps sub-options out of the manual. The
  probe expands it, so one NixOS probe yields both the NixOS and Home Manager types.
- Reading `functor` on every type hits broken custom types (autorandr), so the probe reads it only on
  submodules, enums and paths.
- Some options throw when read. Home Manager's `pkgs` needs `home.stateVersion`, which a submodule's
  options have no value for, so without `useGlobalPkgs` 524 of its options throw. The probe records
  such an option as unknown (`NixValue`) and goes on. It guards each option once with `tryEval` and
  `deepSeq` over the probe's own record, which is plain data, never over a type, which may be
  infinite. A submodule's `nestedTypes` and description read its freeform type, so they get
  shallow guards of their own. srv-2's and m1's probe output didn't change.
- The same `nix eval` lists the top-level names in the configuration's `pkgs`. `Pkgs` types each as
  a package, besides the builders `Lib.ts` types, so `noUncheckedIndexedAccess` no longer makes
  `pkgs.git` possibly `undefined` and `pkgs.ripgerp` fails. Classifying the names would take 25 s
  and 1.9 GB for nixpkgs, so package sets such as `python3Packages` are typed as packages for now.

`src/Typegen.ts` turns the tree into interfaces describing evaluated values. Groups and submodules
become interfaces named after their first option path, and identical ones are shared. A freeform
submodule gets an index signature that also admits its fields' types. What a module may write is
derived with a mapped type, `Definition<T> = Data<T> | Nix<T>`, rather than generated twice. A
`types.path` option accepts a package too, as Nix does, unless the path must be outside the store.
Generated files import only the names they use, so a project's `noUnusedLocals` accepts them.

## The first port

`.typeflake/port` (local, not committed) holds a port of infra's `modules/features/app-stores` against
srv-2's generated types. It typechecks in 0.77 s, and four mistakes injected into it all fail.

To compare, each host swaps the module for a copy of the original or for the rendered port, with
`extendModules` and `disabledModules`, both sitting next to the original's files. Swapping in the copy
only moves `asc` and `gplay` within `environment.systemPackages`, the same 417 packages in another
order, because the swapped module comes last. Against that copy the port's `drvPath` is identical,
on srv-2 and on m1.

## Measurements

Taken on 2026-10-23 against `~/infra` on srv-2, with TypeScript 7.0.2:

|                                | srv-2 (NixOS)            | m1 (darwin)   |
| ------------------------------ | ------------------------ | ------------- |
| Probe                          | 11 s, 940 MB             | 3.4 s, 445 MB |
| Options, Home Manager included | 41,038 (35,962 visible)  |               |
| Probe output                   | 32 MB JSON               | 11 MB JSON    |
| Generated types                | 5.9 MB, 6,400 interfaces | 1.4 MB        |
| Typecheck of a sample module   | 0.48 s, 59 MB            |               |

The sample module touches sshd's freeform settings, nginx virtual hosts, sops-nix secrets, Home Manager
and infra's own options. Ten deliberate mistakes in it all fail to typecheck.

About 240 option positions fall back to `Unsupported`, across 25 custom types. 152 of them are
nixpkgs' `systemd option`.

The website's example, `site/example`, is a made-up flake with a NixOS server (Home Manager and a blog
module) and a nix-darwin laptop. On 2026-10-24 its server had 30,419 visible options and 28,458
package names, `typeflake types` took 13.9 s for both configurations, and `tsc` checked the example
against the 7.0 MB of declarations in 2.6 s. `site/scripts/example.ts` measures it again.

## Open

- Name recursive format types after their description (`JSON value`) instead of unrolling them.
- Map `systemd option`, `dagOf`, disko's `subType` and the other custom types worth typing.
- `Data<T>` still allows writing `readOnly` options.
- Reading an `attrsOf` option through `config` is `| undefined` under `noUncheckedIndexedAccess`.
  That is more honest than it was for `pkgs`: a missing attribute fails at evaluation.
- Long unions are hoisted into aliases such as `ServicesOpensshSettingsPermitRootLoginValue`, which
  hides an enum's values in error messages.
- `NixProxy<boolean>` distributes into `Nix<true> | Nix<false>`, so a boolean in the wrong place
  reports `Nix<boolean> & Nix<false>` and `Override`'s brand.
- Modules shared by NixOS and nix-darwin need a generated type for the options both classes have.
- Union members are deduplicated as text, so the generated unions repeat `| null`.
- When to re-probe: on `flake.lock` changes for now. Options a TypeScript module declares are inferred
  locally, so editing one needs no probe.

## Next

[VISION.md](VISION.md) has the plan and what of it is done: type providers (packages, binaries,
secrets, imported `.nix` files, renamed options) and `typeflake bump` are in. [FLEET.md](FLEET.md)
designs the fleet graph, from the cross-host wiring infra has today.

1. Port a module with submodule options and one shared between NixOS and darwin, through the CLI,
   into infra.
2. The fleet graph's first step: hosts, endpoints and `fleet.lock`, with observability as the first
   wiring case.
3. Later: `flake.ts`, typed flake inputs, nested package sets.
