# Implementation Spike Notes

## Active Goal

Build the first Typeflake implementation spike and extend it with the first
project-local option-generation slices:

- reproducible development tooling,
- typed Flake IR,
- deterministic `flake.ts -> flake.nix` renderer,
- small Nub-powered CLI,
- early validation hooks,
- real NixOS/Home Manager option probing,
- project-local `typeflake options probe` / `typeflake options generate`,
- generated option-type fixtures,
- and typed config boundaries that lean on TypeScript composition instead of a
  separate Typeflake module system.

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
- Published package build: `prepack` runs `tsdown` and emits ESM plus
  declarations under ignored `dist/`; the source repo does not commit generated
  package output.
- Published bin: npm strips an executable target that points directly at
  `dist/cli.mjs`, so `bin/typeflake.js` is a stable checked-in wrapper that
  imports the built CLI.
- Published CLI tools: `@typescript/native-preview` and `@effect/tsgo` are
  runtime dependencies because installed `typeflake` resolves their package-local
  binaries directly for `doctor` and project type checks.
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
- Option bridge:
  - TypeScript remains the module/composition system. Typeflake should expose
    typed config boundaries such as `NixOS.config` and `Home.Config`, not a
    parallel module-authoring API.
  - Option metadata comes from real Nix evaluation of the selected project's
    pinned nixpkgs and Home Manager inputs.
  - Project flake references use `git+file://<repo-root>?dir=<subdir>` when the
    selected flake is inside a Git repo; this avoids local `.git` file type
    issues seen with plain `path:` references on this machine.
  - `typeflake options probe` writes stable option metadata JSON.
  - `typeflake options generate` reads that metadata and emits deterministic
    TypeScript declarations.
  - The current generated option types are deliberately a small fixture subset,
    not a hand-authored permanent surface.
  - Unsupported or under-modeled Nix option types should stay explicit through
    `UnsupportedNixOption<...>` / `NixExpr` escape hatches until richer option
    typing exists. `--strict` fails if unsupported shapes remain.
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

1. Add reproducible tooling and push to `main`. Done.
2. Add core TypeScript model for Nix expressions, packages, modules, flakes, and raw escape hatches. Done.
3. Add a minimal Nix AST/printer and renderer. Done.
4. Add `typeflake sync` and `typeflake check`. Done.
5. Add a tiny example `examples/basic/flake.ts`. Done.
6. Add the first option-introspection bridge for NixOS + Home Manager. Done.
7. Generate a pinned option fixture and expose typed config boundaries. Done.
8. Verify with typecheck, lint, runtime tests, type tests, generated Nix, and the repository flake check. Done.
9. Add project-local option probe/generate commands backed by a nested fixture flake lock. Done.
10. Prepare and publish a public npm alpha for name reservation and early
    testing. In progress.

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
- Option-introspection slice:
  - `nub run check` passes, including oxlint type-aware checks, Effect TSGO,
    Effect Vitest runtime tests, Attest type tests, and oxfmt.
    Current suite after project-local generation: 6 test files, 15 tests.
  - `test/options.test.ts` runs a real `nix eval --impure --json --expr ...`
    probe against pinned nixpkgs/Home Manager inputs and compares the result to
    `test/fixtures/options/pinned-subset.json`.
  - The generated option fixture file is compared exactly against
    `generateOptionTypeFile(...)`, so generator drift is caught by tests.
  - `test/options-command.test.ts` probes
    `test/fixtures/project-flake/flake.lock` with non-default input names
    (`fixture-nixpkgs`, `fixture-home-manager`) to prove generation comes from
    the selected project flake, not Typeflake's own flake input names.
  - Expanded option typing covers booleans, strings/string-pattern types,
    package lists, numeric lists, attrsets, submodule-shaped values as
    `NixInput`, and explicit unsupported fallbacks.
  - Generated config typing is exposed through `NixOS.config`, `NixOS.Config`,
    and `Home.Config`.
  - Manual CLI smoke test passed:
    `nub run typeflake options probe --flake test/fixtures/project-flake
--nixpkgs-input fixture-nixpkgs --home-manager-input fixture-home-manager
--system x86_64-linux --scope nixos --scope home-manager --output
<tmp>/options.json`, followed by `nub run typeflake options generate
--input <tmp>/options.json --output <tmp>/options.ts`.
  - `nub run typeflake doctor` passes against real local tools.
  - `nub run typeflake check --input examples/basic/flake.ts --output
examples/basic/flake.generated.nix` passes and verifies the generated Nix
    flake.
  - `nix flake check --no-build` passes for the project flake.
- NPM alpha packaging:
  - `npm view typeflake name version description --json` returned 404 before
    publishing, so the package name appeared available on 2026-07-03.
  - Fresh tarball install smoke passed in a temporary ESM consumer project:
    `typeflake --version`, `typeflake --help`, importing `typeflake`,
    consumer `tsgo --noEmit`, and installed `typeflake doctor --project
tsconfig.json`.
  - `npm publish --dry-run --tag next` passes the full publish lifecycle and
    includes `bin/typeflake.js`; the only npm publish warning is expected
    unauthenticated dry-run output.
  - `tsdown` currently emits a non-fatal declaration sourcemap warning from
    `rolldown-plugin-dts:fake-js`; build exits successfully.
  - `npm whoami` reported `ENEEDAUTH`, so final publish requires user npm
    login and any account 2FA flow.

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
- How to scale from the pinned fixture subset to broad option extraction without
  making generation slow or producing unreadable types.
- How much richer type metadata can be recovered from Nix option definitions,
  especially enum literal values, `either`, and generated submodule field shapes.
- Whether `typeflake sync` should optionally run `nixfmt` on generated output when available.
