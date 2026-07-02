# Architecture

Typeflake is organized around one central pipeline:

```text
flake.ts
  -> Effect program
  -> typed Typeflake IR
  -> generated Nix artifacts
  -> Nix eval/check/build
  -> structured diagnostics
```

The TypeScript program is the authoring interface. Nix remains the evaluator and
builder.

## Design Principles

### Adapt Protocols, Not Projects

The Nix ecosystem is too large to wrap by hand. Typeflake should adapt the
protocols that projects already speak:

- NixOS/Home Manager/nix-darwin module option declarations.
- flake output conventions.
- package attrsets such as `legacyPackages.${system}`.
- overlays.
- standard module combinators.

Any third-party project that exposes normal `nixosModules`, `homeManagerModules`,
`darwinModules`, `overlays`, `packages`, or `devShells` should become usable
without a custom Typeflake integration.

### Project-Local Generation

Types should be generated for the user's actual pinned universe, not for every
possible Nix expression.

Inputs:

- `flake.lock`
- selected systems
- selected modules
- special args
- relevant Typeflake config

Outputs:

- generated option schemas
- generated TypeScript declarations
- generated Nix artifacts
- cache metadata

The cache key should include the lock hash, system, module list, and special
args that affect evaluation.

### One Intermediate Representation

Nix option metadata should flow through a single internal representation:

```ts
interface OptionIR {
  path: readonly string[];
  type: NixTypeIR;
  description?: string;
  default?: unknown;
  example?: unknown;
  declarations: readonly SourceLocation[];
  readOnly: boolean;
  internal: boolean;
}
```

The same IR can later power:

- TypeScript declarations,
- Effect Schema validation,
- docs,
- LSP completions,
- migration tools,
- UI forms,
- and better diagnostics.

## Type Model

### Nix Values

Typeflake should distinguish plain serializable values from Nix expressions.

```ts
type NixExpr<Tag, A = unknown> = {
  readonly _tag: Tag;
  readonly value: A;
};
```

Important expression types:

- `Derivation`
- `PackageRef<System, AttrPath>`
- `Module`
- `Overlay`
- `NixPath`
- `NixFunction<Input, Output>`

### Options

Nix option types should map into TypeScript and Effect Schema where possible:

```text
types.bool         -> boolean
types.str          -> string
types.int          -> Int
types.enum [...]   -> literal union
types.nullOr t     -> T | null
types.listOf t     -> readonly T[]
types.attrsOf t    -> Record<string, T>
types.submodule    -> generated nested shape
types.either a b   -> A | B
types.package      -> PackageRef<System, string>
types.path         -> NixPath | string
```

Unsupported option types should become explicit unsupported types, not `any`.

```ts
type UnsupportedNixType<Description extends string> =
  NixExpr<"unsupported", unknown> & {
    readonly __unsupportedNixType: Description;
  };
```

### Packages

Packages should be represented as typed references to Nix attrpaths, not as
materialized JavaScript objects.

```ts
pkgs.git;
pkgs.python312Packages.numpy;
```

These should serialize to ordinary Nix expressions such as:

```nix
pkgs.git
pkgs.python312Packages.numpy
```

### Nix Functions

Arbitrary Nix functions usually do not expose enough type metadata. Typeflake
should not pretend otherwise.

The core should type common functions and combinators, then expose explicit
annotations for custom functions:

```ts
const packageFile = nixFn<
  { lib: Lib; stdenv: Stdenv },
  Derivation
>("./package.nix");
```

## Effect Model

The CLI and evaluation runtime should be an Effect application.

Likely services:

- `FileSystem`
- `NixCommand`
- `NixEvaluator`
- `TypeGenerator`
- `ArtifactWriter`
- `Diagnostics`
- `TaintRegistry`
- `Cache`

Likely errors:

- `TypeScriptError`
- `NixEvalError`
- `NixBuildError`
- `UnsupportedNixTypeError`
- `GeneratedArtifactDriftError`
- `TaintPolicyError`
- `MissingNixCommandError`

## Taint Model

Generation-time effects should carry taints in the type system.

```ts
type Taint =
  | "pure"
  | "env"
  | "filesystem"
  | "process"
  | "network"
  | "time"
  | "host";

type Gen<A, T extends Taint = "pure"> =
  Effect.Effect<A> & { readonly __taint?: T };
```

Taints should compose. A flake produced from `Env.string("USER")` is not pure.

```ts
const username = Env.string("USER");

export default Flake.make(Effect.gen(function* () {
  const user = yield* username;
  return { /* outputs */ };
}));
```

`typeflake sync` should record and display taints in generated metadata.

## Generated Artifacts

Initial generated files:

- `flake.nix`
- `.typeflake/metadata.json`
- `.typeflake/types/options.d.ts`
- `.typeflake/types/packages.d.ts`

The generated Nix should be readable, stable, and formatted.

## Relationship To TypeNix

TypeNix applies the TypeScript typechecker to `.nix` files. Typeflake authors
flake/module intent in TypeScript and emits `.nix` files.

These tools are complementary:

```text
Typeflake -> generated Nix -> Nix evaluator
                         \-> optional TypeNix check
```

Typeflake should borrow ideas from TypeNix around:

- typed Nix primitives,
- fixed-point and overlay modeling,
- annotation-driven escape hatches,
- package set typing,
- and LSP-quality feedback.

It should not duplicate TypeNix's core mission unless that becomes necessary.

