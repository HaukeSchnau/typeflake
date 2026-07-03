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
- Nix dev environment: repository `flake.nix` with Nub, Node, pnpm, Nix, jq, and nixfmt.
- Effect version: v4 beta line, matching the project vision.
- Nix remains execution truth; TypeScript remains authoring truth.

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

## Tooling Notes

- Local `pnpm install` and Nix-provided `pnpm install` both updated the lockfile but
  exited through a Node/libuv assertion on this machine. `nub install
--ignore-scripts` completed successfully and is the preferred install command.
- Nub's trust policy rejected pinned Effect v4 beta packages because their
  provenance evidence differs from earlier stable releases. The workspace keeps
  `trustPolicy: no-downgrade` enabled and narrowly excludes the pinned beta
  packages in `pnpm-workspace.yaml`.

## Open Questions

- Whether to keep generated `flake.nix` at repository root by default or write to a separate output path during early development.
- How aggressively to type NixOS module config before option extraction lands.
- Whether `typeflake sync` should optionally run `nixfmt` on generated output when available.
