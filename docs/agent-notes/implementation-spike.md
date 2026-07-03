# Implementation Spike Notes

## Active Goal

Build the first Typeflake implementation spike:

- reproducible development tooling,
- typed Flake IR,
- deterministic `flake.ts -> flake.nix` renderer,
- small Nub-powered CLI,
- and early validation hooks.

## Current Decisions

- Package manager: pnpm.
- Script/runtime runner: Nub.
- Lint/format: oxlint and oxfmt.
- Typechecking: Oxlint native type-aware mode with `oxlint-tsgolint` and
  `--type-check`, not `tsc`.
- Effect language tooling: `@effect/tsgo` plus the `@effect/language-service`
  plugin in `tsconfig.json`.
- Effect diagnostics: `tsgo --noEmit --project tsconfig.json` is part of
  `nub run check` because Oxlint type-aware mode does not currently surface
  Effect language-service diagnostics.
- Nix dev environment: repository `flake.nix` with Nub, Node, pnpm, Nix, jq, and nixfmt.
- Effect version: v4 beta line, matching the project vision.
- Nix remains execution truth; TypeScript remains authoring truth.
- Effect-native authoring model:
  - `Flake.make` is pure-only.
  - `Flake.effect` is the explicit effectful authoring path and preserves
    Effect error/context tainting in the type.
  - `Flake.impure` is the explicit tainted path for authoring that performs
    non-deterministic or environment-dependent work before producing a flake.
  - `sync` and `check` use Effect services for filesystem, path, and child
    process boundaries.
  - CLI/runtime errors use tagged errors instead of global `Error` in the
    Effect failure channel.
  - `sync` runs `tsgo --noEmit --project tsconfig.json` before dynamically
    importing `flake.ts`, so the compiler validates the authoring surface before
    runtime loading.
- Nix value model:
  - Public authoring APIs accept `NixInput` at trust boundaries.
  - `normalizeNixInput` converts ergonomic authoring values into a closed
    discriminated `NixValue` AST before rendering.
  - Raw Nix remains an explicit typed escape hatch through `NixExpr<Kind>`.
- Flake inputs:
  - Inputs are authored with `Flake.input(name, url)` and collected with
    `Flake.inputs(...)`.
  - The input object key must match the explicit input name at compile time,
    removing the previous input-ref map assertion.
- Testing:
  - Runtime tests use `@effect/vitest`.
  - Exact positive type-level assertions use `@arktype/attest` inside Vitest.
    Negative compile-fail contracts still use `@ts-expect-error`.
  - Type-level contracts live in Vitest files so `tsgo` validates them during
    `nub run check`.
  - Attest runs through Vitest global setup in `test/setup-attest.ts` and writes
    transient assertion cache files under ignored `.attest/`.
  - Regression tests cover input-name mismatch rejection at both helper and
    constructor boundaries, user attrsets with `tag` keys, renderer output, taint
    values, and doctor process handling.
  - `@effect/vitest@4.0.0-beta.93` currently needs an explicit
    `@vitest/runner@4.1.4` package extension because its published package
    metadata imports that package at runtime but lists it only as a devDependency.
  - `@arktype/attest@0.56.2` requires a `typescript` devDependency for its
    compiler-API type capture. This does not replace the project check policy:
    oxlint native type-aware checks and Effect TSGO remain in `nub run check`.

## Current Plan

1. Add reproducible tooling and push to `main`.
2. Add core TypeScript model for Nix expressions, packages, modules, flakes, and raw escape hatches.
3. Add a minimal Nix AST/printer and renderer.
4. Add `typeflake sync` and `typeflake check`.
5. Add a tiny example `examples/basic/flake.ts`.
6. Verify with typecheck, lint, format, and generated Nix.

## Verification Status

- Tooling skeleton: verified with `nub run check` and `nix flake check --no-build`.
- Core implementation: first vertical slice implemented.
- Nix execution check: generated `examples/basic/flake.generated.nix` passed `nix flake check --no-build`
  after copying it to a temporary `flake.nix`.
- CLI check command: `nub run typeflake check --input examples/basic/flake.ts --output
examples/basic/flake.generated.nix` passes and performs the temporary generated-flake check internally.
- First-spike retrospective captured in
  [first-spike-retrospective.md](./first-spike-retrospective.md).
- Effect-native tooling pass:
  - `nub install --ignore-scripts` completed.
  - `nub run tsgo:patch` patched native-preview with Effect TSGO.
  - `nub run check` passes using `oxlint --type-aware --type-check` and
    `tsgo --noEmit --project tsconfig.json`.
  - `nub run typeflake check --input examples/basic/flake.ts --output
examples/basic/flake.generated.nix` passes.
  - `nix flake check --no-build` passes for the project flake.
- Hardened type-model slice:
  - `nub run check` passes, including oxlint type-aware checks, Effect TSGO
    diagnostics, Effect Vitest runtime tests, type-level tests, and oxfmt check.
    Current suite: 4 test files, 9 tests.
  - `nub run typeflake doctor` passes against real local tools.
  - `nub run typeflake check --input examples/basic/flake.ts --output
examples/basic/flake.generated.nix` passes and verifies the generated Nix flake.
  - `nix flake check --no-build` passes for the project flake.
  - Independent review found three issues before commit; fixed by enforcing
    checked input names at constructor boundaries, branding internal Nix AST
    values with a private symbol so user `tag` attrsets remain data, and making
    doctor tests command-sensitive rather than spawn-order-sensitive.
- Attest type-test pass:
  - `nub run check` passes with Attest's TypeScript assertion capture enabled.
  - Positive taint and flake-shape assertions moved from assignment-based checks
    to exact `attest<expected, actual>()` assertions.

## Tooling Notes

- Local `pnpm install` and Nix-provided `pnpm install` both updated the lockfile but
  exited through a Node/libuv assertion on this machine. `nub install
--ignore-scripts` completed successfully and is the preferred install command.
- Nub's trust policy rejected pinned Effect v4 beta packages because their
  provenance evidence differs from earlier stable releases. The workspace keeps
  `trustPolicy: no-downgrade` enabled and narrowly excludes the pinned beta
  packages in `pnpm-workspace.yaml`.
- The external `@effect/cli` package currently publishes against Effect v3 peer
  ranges. For this v4-beta spike, the CLI uses Effect v4's native
  `effect/unstable/cli` modules instead of adding a v3 peer island.
- `pnpm install --ignore-scripts` still refreshes the lockfile successfully but
  exits through the local Node/libuv assertion after install. Use `nub install
--ignore-scripts` for normal workflow; pnpm should be treated as a fallback only
  on this machine.
- `make-synchronized@0.8.0`, reached through Attest's Prettier integration,
  needs a package extension so `prettier@3.6.2` is visible from its runtime
  island under Nub/pnpm's isolated install layout.

## Open Questions

- Whether to keep generated `flake.nix` at repository root by default or write to a separate output path during early development.
- How aggressively to type NixOS module config before option extraction lands.
- Whether `typeflake sync` should optionally run `nixfmt` on generated output when available.
