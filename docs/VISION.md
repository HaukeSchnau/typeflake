# Vision

Typeflake is a TypeScript and Effect authoring layer for the Nix ecosystem.

The project starts from a simple belief:

> Nix is the execution truth. TypeScript is the ergonomic and type-safe
> authoring truth.

Typeflake should let existing Nix and NixOS users express systems, homes, dev
environments, and eventually deployment workflows in familiar Nix concepts with
substantially better authoring ergonomics.

## Who It Is For

The first target user is an existing Nix or NixOS user who already understands
the ecosystem, but wants a better way to author and maintain configurations.

This project is not initially optimized for people learning Nix from scratch.
It should become approachable over time, but v0 can assume that the user knows
what flakes, modules, packages, options, and derivations are.

## Product Boundary

Typeflake begins as:

- typed authoring,
- validation,
- generated Nix artifacts,
- and a small CLI around the feedback loop.

It should grow into deployment and orchestration once the type model proves
itself.

Typeflake is not trying to replace:

- the Nix evaluator,
- the Nix store,
- the NixOS module system,
- nixpkgs,
- Home Manager,
- nix-darwin,
- or flakes.

Those are the substrate. Typeflake adapts them.

## Core Promises

### Stay Close To Nix

The public API should preserve Nix vocabulary:

- `flake.ts`
- `inputs`
- `outputs`
- `packages`
- `apps`
- `devShells`
- `nixosConfigurations`
- `homeConfigurations`
- `modules`
- `overlays`
- `mkIf`
- `mkMerge`
- `mkDefault`
- `mkForce`
- `callPackage`
- `legacyPackages`

The goal is not to rename Nix into an unrelated TypeScript framework. The goal
is to make Nix concepts easier to write, compose, typecheck, validate, and
inspect.

### Generated Nix Is Inspectable

Generated Nix should be ordinary Nix. Users should be able to read it, run
standard Nix commands against it, and understand what Typeflake produced.

Generated files are build artifacts, not the source of intent. They may be
committed by projects that want that audit trail, but users should not need to
hand-edit them.

### Explicit Escape Hatches

Nix is dynamic and huge. Typeflake should not pretend it can statically model
everything.

When the system cannot infer or represent something safely, users should be able
to cross the boundary explicitly:

```ts
rawNix<Derivation>("pkgs.callPackage ./package.nix {}");
```

Unknown or unsupported Nix shapes should not silently become `any`. They should
be visible in types and force a deliberate escape hatch.

### Type Safety With Honest Boundaries

Typeflake should pursue exceptional type safety where Nix exposes structure:

- module option declarations,
- option types,
- flake output conventions,
- package attrpaths,
- known combinators,
- generated project-local schemas,
- and Effect errors.

It should remain honest where Nix does not expose enough information, especially
for arbitrary functions.

### Effects Are Allowed, But Tainted

`flake.ts` can be an Effect program. Real effects are useful for discovery,
generation, validation, and orchestration.

However, impurity must be visible at the TypeScript boundary and normalized
before handing off to Nix. A generated flake should not secretly depend on the
current time, host state, network, environment, or filesystem.

Typeflake should track generation-time taints such as:

- `env`
- `filesystem`
- `process`
- `network`
- `time`
- `host`

The CLI should surface these taints and eventually allow policies such as
"pure only" or "allow env USER and filesystem project root".

## First Proof

The first meaningful proof is:

1. A user writes `flake.ts`.
2. `typeflake sync` evaluates it and emits `flake.nix`.
3. Typeflake extracts option metadata from the pinned module graph.
4. Typeflake generates project-local TypeScript types.
5. `typeflake check` runs TypeScript validation and `nix flake check`.
6. A real NixOS configuration can be built from the generated flake.

If that loop works, the project has a heartbeat.
