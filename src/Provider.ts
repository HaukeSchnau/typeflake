import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";

/**
 * Something outside the option graph that `typeflake types` turns into types: the names in `pkgs`,
 * the programs in a package, the keys in a secrets file. A provider reads each configuration in the
 * probe's own `nix eval`, then may look further, such as into the binary cache, before it declares
 * types.
 */
export interface Provider {
  readonly name: string;
  /** A Nix function of the configuration. Its result, as JSON, is what the provider found there. */
  readonly nix: (context: Context) => Effect.Effect<string, ProviderFailed, Services>;
  /** Declares types from what it found in each configuration that had it. */
  readonly provide: (
    found: ReadonlyArray<string>,
    context: Context,
  ) => Effect.Effect<Provided, ProviderFailed, Services>;
}

export type Services = FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner;

export interface Context {
  /** The project directory. */
  readonly root: string;
  /** The project's `.nix` files, relative to the root, which modules render to or import. */
  readonly nixFiles: ReadonlyArray<string>;
  /** The project's `*.nix.ts` modules, relative to the root. */
  readonly modules: ReadonlyArray<string>;
}

export interface Provided {
  /** Declarations for `.typeflake/providers.ts`. */
  readonly declarations: ReadonlyArray<string>;
  /** `Register` fields: the key and its type. */
  readonly register: ReadonlyArray<readonly [string, string]>;
  /** Attribute-set options whose names this knows, by option path: the type of the names. */
  readonly names: ReadonlyArray<readonly [string, string]>;
  /** Other files to write, by path relative to `.typeflake/`. */
  readonly files: ReadonlyArray<readonly [string, string]>;
}

export const nothing: Provided = { declarations: [], register: [], names: [], files: [] };

export class ProviderFailed extends Schema.TaggedError<
  ProviderFailed,
  { readonly brand: unique symbol }
>()("ProviderFailed", { provider: Schema.String, reason: Schema.String }) {
  override get message() {
    return `the ${this.provider} provider failed: ${this.reason}`;
  }
}

export interface Definition<A> {
  readonly name: string;
  /** How the provider's Nix result decodes. */
  readonly schema: Schema.Codec<A>;
  readonly nix: (context: Context) => Effect.Effect<string, ProviderFailed, Services>;
  /** Joins what two configurations had, such as the names both their `pkgs` hold. */
  readonly combine: (left: A, right: A) => A;
  readonly provide: (
    found: A,
    context: Context,
  ) => Effect.Effect<Provided, ProviderFailed, Services>;
}

export const make = <A>(definition: Definition<A>): Provider => {
  // An expression returns null for a configuration without what it looks for, such as sops-nix.
  const decode = Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.NullOr(definition.schema)),
  );
  return {
    name: definition.name,
    nix: definition.nix,
    provide: (found, context) =>
      Effect.gen(function* () {
        const decoded = yield* Effect.forEach(found, (json) =>
          decode(json).pipe(
            Effect.mapError((error) =>
              ProviderFailed.make({ provider: definition.name, reason: String(error) }),
            ),
          ),
        );
        const [first, ...rest] = decoded.filter((found) => found !== null);
        if (first === undefined) return nothing;
        return yield* definition.provide(rest.reduce(definition.combine, first), context);
      }),
  };
};

/**
 * Each provider's expression, guarded so that one that throws leaves its result null. `tryEval`
 * catches only `throw` and failed assertions, so an expression checks for attributes with `or` and
 * `?` and for types with `builtins.is*` itself.
 */
export const probeExpression = (expressions: ReadonlyArray<readonly [string, string]>): string =>
  `{ ${expressions
    .map(
      ([name, nix]) =>
        `${JSON.stringify(name)} = let result = builtins.tryEval (let found = (${nix}) configuration; in builtins.deepSeq found (builtins.toJSON found)); in if result.success then result.value else null;`,
    )
    .join(" ")} }`;
