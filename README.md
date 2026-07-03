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
- project-local `typeflake options probe` and `typeflake options generate`
  commands,
- generated fixture types for a small but broader option subset,
- Attest-backed type assertions for the generated config surface,
- and a golden test that compares real `nix eval --json` output to the committed
  option fixture.

Deployment and broader orchestration are intentionally later milestones. The
first bet to prove is the type model.

## Install

This is a very early alpha. The package is published for experimentation and
name reservation, not for production use yet.

```sh
npm install --save-dev typeflake@next
```

Typeflake currently expects Node.js 22 or newer. It also ships with
TypeScript-Go Native Preview and the Effect TSGO plugin so the CLI can run its
own authoring checks after installation.

For consumer projects on this alpha, use ESM/NodeNext TypeScript settings. While
Effect v4 and TypeScript-Go are both still moving, `skipLibCheck` may be needed
in downstream projects that import Typeflake's declarations.

## Start A Project

Use `init` to create a minimal consumer project skeleton:

```sh
typeflake init
```

It creates `flake.ts`, `tsconfig.json`, `.typeflake/options.ts`, and starter
package scripts without overwriting existing files. Use `--force` only when you
want to replace those starter files.

The generated `flake.ts` imports project-local option types from
`.typeflake/options.ts`. That file starts as a placeholder so the project
typechecks immediately, then gets replaced by real pinned option declarations
after running:

```sh
typeflake options probe --scope nixos
typeflake options generate
typeflake check
```

## Generated Type Lifecycle

Generated option types belong to the consuming project. Typeflake reads that
project's locked flake inputs, asks Nix to evaluate the real option graph, and
then emits TypeScript declarations from the resulting metadata.

```sh
typeflake options probe \
  --flake . \
  --system x86_64-linux \
  --scope nixos \
  --scope home-manager \
  --output .typeflake/options.json

typeflake options generate \
  --input .typeflake/options.json \
  --output .typeflake/options.ts
```

Use `--nixpkgs-input` and `--home-manager-input` when a project uses different
flake input names. After changing `flake.lock`, rerun both commands and then run
the normal checks.

The trust boundary is intentionally simple:

- `flake.lock` pins the Nix universe.
- Nix evaluates the real NixOS/Home Manager module options.
- Typeflake parses that metadata into a typed IR.
- TypeScript checks authoring against generated declarations.
- Nix remains the execution truth for evaluation, checks, and builds.

Unsupported option shapes are never erased into `any`. The generator keeps them
explicit with `UnsupportedNixOption<...>` escape hatches, and
`typeflake options generate --strict` fails if any remain. Use
`unsupportedNixOption(description, rawNixCode)` when you intentionally accept one
of those explicit escape hatches.

## Documents

- [Vision](docs/VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [First Spike](docs/SPIKE.md)
- [Prior Art](docs/PRIOR_ART.md)

## Status

Implementation spike in progress. The repository can render and check a small
flake, run Effect-native CLI commands, and validate a first generated option
type subset.
