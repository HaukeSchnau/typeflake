# Prior Art

Typeflake should learn from nearby projects without collapsing into the same
shape.

## Alchemy

Alchemy is TypeScript-native infrastructure as code. The newer Alchemy Effect
work frames infrastructure as Effect programs with typed resources, plans,
deploys, and runtime bindings.

Useful inspiration:

- one language for resource intent and orchestration,
- typed resources,
- Effect-powered execution,
- plan/apply style workflows,
- structured errors,
- local inspectable state.

Important difference:

Typeflake is not primarily cloud IaC. Nix already has an evaluator, store,
module system, package universe, and reproducible build graph. Typeflake should
drive and generate Nix, not replace Nix with a separate resource runtime.

Links:

- https://v2.alchemy.run/
- https://github.com/alchemy-run/alchemy
- https://github.com/alchemy-run/alchemy-effect

## nixts

`nixts` is a TypeScript DSL for generating Nix flakes with builder APIs,
package-name autocomplete, and Home Manager option-name autocomplete.

Useful inspiration:

- direct user appetite for TypeScript-authored flakes,
- simple CLI flow from TypeScript to Nix,
- package-name and option-name autocomplete.

Important difference:

Typeflake aims for project-local ecosystem adaptation and semantic type safety,
not mostly static name lists. In particular, Typeflake should avoid silently
falling back to `any` for option values and should extract types from the real
pinned module graph where possible.

Links:

- https://github.com/tlamadon/nixts
- https://www.npmjs.com/package/nixts

## TypeNix

TypeNix applies TypeScript-grade typechecking to `.nix` files by parsing Nix and
feeding equivalent structure into the TypeScript checker and LSP pipeline.

Useful inspiration:

- rich typing for Nix primitives such as `Lib`, `Stdenv`, `Derivation`,
  `Platform`, and `Nixpkgs`,
- fixed-point and override modeling,
- typed package sets,
- annotation-driven escape hatches,
- LSP-quality feedback.

Important difference:

TypeNix makes Nix files type-aware. Typeflake authors flakes and module intent
from TypeScript and emits Nix files. The two can be complementary:

```text
flake.ts -> generated Nix -> nix flake check
                         -> optional TypeNix check
```

Links:

- https://github.com/ryanrasti/typenix
