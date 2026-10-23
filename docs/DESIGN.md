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
- Bun runs the CLI and imports modules directly, so there is no TypeScript compiler at runtime.
  Typechecking is the editor's and `typeflake check`'s job.

A module, as currently planned:

```ts
export default NixOS.module({
  options: { appStores: { enable: Opt.enable("asc and gplay with the Urbs UG store credentials") } },
  config: ({ config, lib, pkgs }) => {
    const secrets = config.sops.secrets
    const asc = pkgs.writeShellApplication({
      name: "asc",
      text: nix`
        ASC_PRIVATE_KEY=$(cat ${secrets["app-store-connect/api-key"].path})
        exec ${lib.getExe(pkgs.callPackage(path("./asc-package.nix"), {}))} "$@"
      `,
    })
    return mkIf(config.appStores.enable, {
      sops: { secrets: { "app-store-connect/api-key": { owner: config.identity.primaryUser, mode: "0400" } } },
      environment: { systemPackages: [asc] },
    })
  },
})
```

Typeflake calls `config` once with proxies, and property access builds Nix AST. Nothing is evaluated in
Bun. TypeScript can't branch on a `Nix<boolean>`, so conditions go through `mkIf`.

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
  submodules and enums.

`src/Typegen.ts` turns the tree into interfaces describing evaluated values. Groups and submodules
become interfaces named after their first option path, and identical ones are shared. A freeform
submodule gets an index signature that also admits its fields' types. What a module may write is
derived with a mapped type, `Definition<T> = Shape<T> | Nix<T>`, rather than generated twice.

## Measurements

Taken on 2026-10-23 against `~/infra` on srv-2, with TypeScript 7.0.2:

| | srv-2 (NixOS) | m1 (darwin) |
|---|---|---|
| Probe | 11 s, 940 MB | 3.4 s, 445 MB |
| Options, Home Manager included | 40,949 (35,873 visible) | |
| Probe output | 32 MB JSON | 11 MB JSON |
| Generated types | 5.9 MB, 6,400 interfaces | 1.4 MB |
| Typecheck of a sample module | 0.48 s, 59 MB | |

The sample module touches sshd's freeform settings, nginx virtual hosts, sops-nix secrets, Home Manager
and infra's own options. Ten deliberate mistakes in it all fail to typecheck.

About 240 option positions fall back to `Unsupported`, across 25 custom types. 152 of them are
nixpkgs' `systemd option`.

## Open

- Name recursive format types after their description (`JSON value`) instead of unrolling them.
- Map `systemd option`, `dagOf`, disko's `subType` and the other custom types worth typing.
- `Shape<T>` still allows writing `readOnly` options.
- Union members are deduplicated as text, so the generated unions repeat `| null`.
- When to re-probe: on `flake.lock` changes for now. Options a TypeScript module declares are inferred
  locally, so editing one needs no probe.

## Next

1. Nix AST and printer, `Nix<T>`, `` nix`...` ``, module rendering. Port `app-stores` without
   changing srv-2's `drvPath`.
2. The `config`, `pkgs` and `lib` proxies, `mkIf` and friends, and option declarations. Port a
   module with submodule options and one shared between NixOS and darwin.
3. The CLI: render every module, re-probe when the lock changes, and fail `check` on drift.
4. Later: `flake.ts`, typed flake inputs, nested package sets.
