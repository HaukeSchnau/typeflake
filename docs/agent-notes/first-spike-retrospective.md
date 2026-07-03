# First Spike Retrospective

Date: 2026-07-03

## What Went Well

- The core product bet survived contact with code: `flake.ts -> generated Nix
-> Nix evaluation` works as a narrow vertical slice.
- Keeping Nix as the execution truth paid off immediately. `nix flake check`
  caught real integration issues in module rendering and example configuration
  that a TypeScript-only test would have missed.
- The first slices stayed reviewable:
  - `chore: add reproducible tooling`
  - `feat: render basic flakes`
  - `feat: check generated flakes`
- Nub was useful enough to keep. It provided script running and install behavior
  after pnpm hit a local Node/libuv assertion.
- TypeScript strictness exposed design pressure early, especially around package
  references, input widening, readonly arrays, and raw Nix escape hatches.
- The generated example is small but meaningful: it includes a dev shell, NixOS
  module config, and Home Manager wiring.

## Where To Improve

- Use `jj` with more discipline. Jujutsu operations should be one command at a
  time, with status checks between logical steps.
- Start each implementation slice with an explicit verification matrix. The
  feedback loop exists now, but it was discovered while coding instead of
  designed first.
- Promote repeated manual checks into scripts or tests sooner. Temporary
  directories and ad hoc command runs were useful for exploration, but they
  should become fixtures quickly.
- Make generated Nix formatting a first-class concern. The renderer is readable,
  but optional `nixfmt` support would reduce distracting diffs.
- Document local tooling quirks close to the command surface. The pnpm crash and
  Nub trust-policy exceptions should be easy to rediscover.
- Reduce raw string islands as the AST grows. Explicit raw escape hatches are
  good, but the normal path should become more structured and typed over time.

## Future Workflow Improvements

- Add a single "prove the repo" command that runs typecheck, oxlint, oxfmt,
  `typeflake check`, and `nix flake check --no-build`.
- Add renderer fixtures before expanding syntax coverage, especially for module
  lambdas, raw expressions, attr paths, lists, and nested attrsets.
- Add a small `typeflake doctor` command later for missing Nix, missing Nub,
  trust-policy issues, and package manager drift.
- Prefer durable notes for decisions and surprises, not raw terminal output.
- Keep pushing after coherent vertical slices, but make the slice boundary
  visible before coding.

## Follow-Up Tasks

- Add a test harness for renderer fixtures.
- Add `sync --format` or `check --format` support backed by `nixfmt`.
- Decide the default generated output path for local project development.
- Expand the package-reference model with generated known packages and a typed
  explicit fallback.
- Write a short contributor note with the preferred local commands:
  `nub install --ignore-scripts`, `nub run check`, and `nix flake check
--no-build`.
