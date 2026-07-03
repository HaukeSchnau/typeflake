# First Spike

The first spike should prove the central loop:

```text
flake.ts -> generated flake.nix -> nix flake check
```

The goal is not broad feature coverage. The goal is to verify that the type and
generation model can hold real Nix concepts without becoming either too magical
or too weak.

## Success Criteria

A user can write:

```ts
import { Flake, NixOS, Home, pkgs } from "typeflake";

export default Flake.make({
  inputs: {
    nixpkgs: "github:NixOS/nixpkgs/nixos-unstable",
    homeManager: "github:nix-community/home-manager",
  },

  outputs: ({ nixpkgs, homeManager }) => ({
    nixosConfigurations: {
      framework: NixOS.configuration({
        system: "x86_64-linux",
        modules: [
          NixOS.module({
            services: {
              openssh: {
                enable: true,
              },
            },
            environment: {
              systemPackages: [pkgs.git, pkgs.neovim],
            },
          }),
          Home.nixosModule(homeManager, {
            users: {
              hauke: {
                programs: {
                  git: {
                    enable: true,
                  },
                },
              },
            },
          }),
        ],
      }),
    },

    devShells: {
      "x86_64-linux": {
        default: {
          packages: [pkgs.git, pkgs.nodejs],
        },
      },
    },
  }),
});
```

Then run:

```sh
typeflake sync
typeflake check
```

And get:

- a generated `flake.nix`,
- generated project-local TypeScript types,
- a successful TypeScript check,
- and a real `nix flake check`.

## Workstream 1: Repository Skeleton

- Add TypeScript project configuration.
- Add package structure.
- Add a small CLI entrypoint.
- Add tests for pure serialization.

## Workstream 2: Flake IR

Define a small typed IR for:

- flake inputs,
- flake outputs,
- systems,
- packages,
- dev shells,
- NixOS configurations,
- modules,
- raw Nix expressions.

Do not model the entire ecosystem yet.

## Workstream 3: Nix Renderer

Render the IR to a stable, readable `flake.nix`.

The renderer must avoid ad hoc string concatenation where structure matters. The
initial implementation can use a small Nix AST and pretty-printer.

## Workstream 4: CLI

Add:

- `typeflake sync`
- `typeflake check`

`sync` evaluates `flake.ts` and writes generated artifacts.

`check` runs:

- TypeScript validation,
- Typeflake validation,
- and `nix flake check`.

## Workstream 5: Option Extraction

Implement a narrow option extraction prototype:

- evaluate a NixOS module set,
- extract `options`,
- convert a subset into `OptionIR`,
- generate `.typeflake/types/options.d.ts`.

Start with a small subset:

- `services.openssh.enable`
- `environment.systemPackages`
- `users.users`
- a small Home Manager option such as `programs.git.enable`

Then expand only after the full loop works.

## Workstream 6: Taint Prototype

Add a minimal typed taint model for generation-time effects.

The first version should support:

- pure values,
- environment reads,
- CLI reporting of taints,
- and generated metadata.

Example:

```ts
const username = Env.string("USER");
```

`typeflake sync` should report that the output is tainted by environment input
`USER`.

## Explicit Non-Goals For The Spike

- Deployment.
- Full nixpkgs package typing.
- Full Home Manager typing.
- Full NixOS option coverage.
- nix-darwin.
- A language server.
- A polished public API.
- Replacing raw Nix.

## Verification

The spike is complete when:

- unit tests cover the renderer for the supported IR,
- `typeflake sync` generates deterministic Nix,
- `typeflake check` runs successfully against a tiny real flake,
- at least one generated option type is consumed from `flake.ts`,
- and taint metadata appears for an environment-backed value.
