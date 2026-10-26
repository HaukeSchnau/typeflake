# Typeflake

Write NixOS, nix-darwin and Home Manager modules in TypeScript, typed by the options your own flake
has, and render them to plain `.nix` files that build with Nix alone.

**Website:** https://typeflake.schnau.dev

```ts
import { exe, mkIf, nix, NixOS, Options, Types } from "typeflake";
import site from "./site.nix";

export default NixOS.module({
  options: {
    blog: {
      enable: Options.enable("the blog"),
      domain: Options.make({ type: Types.str, description: "Where the blog answers." }),
    },
  },
  config: ({ config, pkgs }) =>
    mkIf(config.blog.enable, {
      services: {
        nginx: {
          enable: true,
          virtualHosts: {
            blog: {
              serverName: config.blog.domain,
              forceSSL: true,
              enableACME: true,
              root: pkgs.callPackage(site, {}),
            },
          },
        },
      },
      systemd: {
        services: {
          "blog-links": {
            startAt: "daily",
            script: nix`
              ${exe(pkgs.lychee, "lychee")} https://${config.blog.domain}
            `,
          },
        },
      },
    }),
});
```

`typeflake render` writes `blog.nix` next to this file, the module you would have written by hand.
`services.nginx` is typed because `typeflake types` probed your configuration with `nix eval`, so a
misspelled option, a string where nginx wants a port, or a package nixpkgs doesn't have fails in the
editor. The same goes for Home Manager, nix-darwin, third-party modules and your own options, at the
versions `flake.lock` pins.

The probe types more than options:

- `site.nix` is imported like a TypeScript module. Its declaration lists the arguments the file
  takes, so `callPackage` rejects one it doesn't.
- `exe(pkgs.lychee, "lychie")` fails: `typeflake types` lists the programs of the packages your
  project uses, from the binary cache, without building them.
- The secret names sops-nix can define come from the keys of your secrets files, which sops leaves
  readable.
- Options nixpkgs renamed still typecheck, struck through as deprecated.

## Get started

You need Node 24 or newer, Nix with flakes, and a flake with NixOS, nix-darwin or Home Manager
configurations.

```sh
pnpm add -D typeflake@next

# Write modules/blog.nix.ts, and import ./modules/blog.nix in flake.nix.
pnpm exec typeflake render
pnpm exec typeflake types nixosConfigurations.server
```

Render first: the probe evaluates your configuration, which imports the rendered files. Then include
the generated declarations in `tsconfig.json`. The other two settings let modules import `.nix`
files, whose declarations `typeflake types` writes to `.typeflake/files/`:

```json
{
  "compilerOptions": { "allowArbitraryExtensions": true, "rootDirs": [".", ".typeflake/files"] },
  "include": ["**/*.nix.ts", ".typeflake/**/*.ts"]
}
```

Run `typeflake render --check` in CI so the `.nix` files never fall behind their modules. Commit them;
your flake builds from them, and `.typeflake/` stays out of the repository.

Before you update `flake.lock`, `typeflake bump nixosConfigurations.server` updates the inputs into
a separate lock file, probes against it and typechecks every module against the types the update
brings. It lists the new errors and the renamed options you use; `--fix` rewrites renames that only
change an option's last name, and `--apply` keeps the update when nothing breaks.

A `config` function returns its definitions through `define({...})`, `mkIf` or another helper.
TypeScript only checks an object literal for misspelled keys when it is an argument, so a plain object
returned from a function would let a typo through.

## Status

Early alpha. Probing, type generation, rendering and the CLI work end to end, and the API will change
before 1.0. The largest configuration tried so far has 41,038 options and probes in 11 seconds. A
module ported from a production flake builds the same `drvPath` as the original on NixOS and
nix-darwin.

[docs/DESIGN.md](docs/DESIGN.md) has the design, the measurements and what is still open.

## License

MIT. Source at https://github.com/HaukeSchnau/typeflake, mirrored from git.schnau.dev.
