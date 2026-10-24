# Typeflake

Write NixOS, nix-darwin and Home Manager modules in TypeScript, typed by the options your own flake
has, and render them to plain `.nix` files that build with Nix alone.

**Website:** https://typeflake.schnau.dev

```ts
import { mkIf, nix, NixOS, Options, path, Types } from "typeflake";

export default NixOS.module({
  options: {
    blog: {
      enable: Options.enable("the blog"),
      domain: Options.make({ type: Types.str, description: "Where the blog answers." }),
    },
  },
  config: ({ config, lib, pkgs }) =>
    mkIf(config.blog.enable, {
      services: {
        nginx: {
          enable: true,
          virtualHosts: {
            blog: {
              serverName: config.blog.domain,
              forceSSL: true,
              enableACME: true,
              root: pkgs.callPackage(path("./site.nix"), {}),
            },
          },
        },
      },
      systemd: {
        services: {
          "blog-links": {
            startAt: "daily",
            script: nix`
              ${lib.getExe(pkgs.lychee)} https://${config.blog.domain}
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
the generated declarations in `tsconfig.json`:

```json
{ "include": ["**/*.nix.ts", ".typeflake/*.ts"] }
```

Run `typeflake render --check` in CI so the `.nix` files never fall behind their modules. Commit them;
your flake builds from them, and `.typeflake/` stays out of the repository.

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
