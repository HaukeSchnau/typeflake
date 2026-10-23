# Typeflake

Nix modules written in Effect TypeScript, typed against your own configurations' option graph, and
rendered to ordinary `.nix` files that build without Typeflake.

```ts
import { mkIf, nix, NixOS, Options, path } from "typeflake";

export default NixOS.module({
  options: {
    appStores: { enable: Options.enable("asc and gplay with the Urbs UG store credentials") },
  },
  config: ({ config, lib, pkgs }) => {
    const asc = pkgs.writeShellApplication({
      name: "asc",
      text: nix`
        ASC_PRIVATE_KEY=$(cat ${config.sops.secrets["app-store-connect/api-key"].path})
        exec ${lib.getExe(pkgs.callPackage(path("./asc-package.nix"), {}))} "$@"
      `,
    });
    return mkIf(config.appStores.enable, { environment: { systemPackages: [asc] } });
  },
});
```

`config.sops.secrets` is typed because the probe found sops-nix in the host's configuration, and a
misspelled option inside `mkIf` fails to typecheck like any other. The module renders to the Nix you
would have written by hand.

## Status

Early alpha. What works:

- `src/probe.nix` walks a NixOS, nix-darwin or Home Manager configuration's options, submodules and
  third-party modules included: 41,038 options on one real host in 11 seconds.
- The type generator turns them into TypeScript declarations that register themselves with
  `typeflake`. A sample module checks against all 5.9 MB of them in under half a second.
- `NixOS.module`, `Darwin.module` and `HomeManager.module` render modules. A port of a real module
  produces the same system derivation as the original on NixOS and nix-darwin.

The CLI that probes, generates and renders a whole project is next. Until then the pieces are
library functions. [docs/DESIGN.md](docs/DESIGN.md) has the design, the measurements and what's open.

```sh
npm install typeflake@next
```

## Links

- Website: https://typeflake.schnau.dev
- Source: https://github.com/HaukeSchnau/typeflake (mirrored from git.schnau.dev)
