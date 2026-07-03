# Typeflake

Typeflake is an experiment in writing Nix flakes, NixOS systems, Home Manager
profiles, and dev shells with TypeScript and Effect while keeping Nix as the
execution truth.

The source of intent is `flake.ts`. Typeflake evaluates that TypeScript program,
validates it, and emits ordinary, inspectable Nix artifacts such as `flake.nix`
and generated modules. Nix still evaluates, builds, and checks the result.

## Product Thesis

Nix the ecosystem is excellent. Nix the language and tooling can be hard to
write at scale. Typeflake keeps the ecosystem and execution model, but adds:

- TypeScript-native authoring ergonomics.
- project-local types generated from the pinned flake/module universe.
- explicit typed escape hatches for raw Nix.
- Effect-powered validation, diagnostics, and command orchestration.
- taint tracking for generation-time effects such as environment, filesystem,
  process, network, time, and host state.

## Initial Scope

The first milestone focuses on:

- `flake.ts` as the primary entrypoint.
- generated `flake.nix`.
- NixOS configurations.
- Home Manager configurations.
- dev shells.
- option extraction from the real pinned Nix module graph.
- a tiny CLI with `sync` and `check`.

## Current Shape

TypeScript remains the composition system. Typeflake provides typed boundaries
for Nix concepts and generates ordinary Nix artifacts:

```ts
import { Flake, Home, NixOS, pkgs } from "typeflake";

const systemConfig = NixOS.config({
  services: {
    openssh: {
      enable: true,
    },
  },
  environment: {
    systemPackages: [pkgs.git, pkgs.neovim],
  },
  system: {
    stateVersion: "25.11",
  },
});

const homeConfig = {
  home: {
    stateVersion: "25.11",
  },
  programs: {
    git: {
      enable: true,
    },
  },
} satisfies Home.Config;

export default Flake.make({
  inputs: Flake.inputs({
    nixpkgs: Flake.input("nixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
    homeManager: Flake.input("homeManager", "github:nix-community/home-manager"),
  }),
  outputs: ({ homeManager }) => ({
    nixosConfigurations: {
      framework: NixOS.configuration({
        system: "x86_64-linux",
        modules: [
          NixOS.module(systemConfig),
          Home.nixosModule(homeManager, {
            users: {
              hauke: homeConfig,
            },
          }),
        ],
      }),
    },
  }),
});
```

The option bridge now has a narrow working vertical slice:

- a Nix-side probe that evaluates pinned NixOS and Home Manager option metadata,
- generated fixture types for a small option subset,
- Attest-backed type assertions for the generated config surface,
- and a golden test that compares real `nix eval --json` output to the committed
  option fixture.

Deployment and broader orchestration are intentionally later milestones. The
first bet to prove is the type model.

## Documents

- [Vision](docs/VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [First Spike](docs/SPIKE.md)
- [Prior Art](docs/PRIOR_ART.md)

## Status

Implementation spike in progress. The repository can render and check a small
flake, run Effect-native CLI commands, and validate a first generated option
type subset.
