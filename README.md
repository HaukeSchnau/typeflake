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

Deployment and broader orchestration are intentionally later milestones. The
first bet to prove is the type model.

## Documents

- [Vision](docs/VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [First Spike](docs/SPIKE.md)
- [Prior Art](docs/PRIOR_ART.md)

## Status

Pre-implementation. The initial repository captures the product direction and
the first technical spike.
