import * as Ast from "./Ast.ts";
import type { Register } from "./index.ts";
import * as Nix from "./Nix.ts";

/** Before the first probe, any attribute set fits. */
export interface Unprobed {
  readonly [name: string]: Nix.NixValue | Unprobed;
}

export type OptionsOf<Class extends string> = Class extends keyof Register
  ? Register[Class]
  : Unprobed;

const OverrideId: unique symbol = Symbol.for("typeflake/Override");

/** A definition wrapped by the module system, such as `mkIf`, whose content is `S`. */
export interface Override<out S> extends Nix.Nix<unknown> {
  readonly [OverrideId]: { readonly _S: (_: never) => S };
}

type Leaf =
  | string
  | number
  | boolean
  | null
  | Nix.Package
  | Nix.NixFunction
  | Nix.Unsupported<string>;

/** What a module may write where an option evaluates to `T`. */
export type Definition<T> = Data<T> | Nix.Nix<T> | Override<Data<T>>;

/** A definition written out as TypeScript data, whose parts are definitions in turn. */
export type Data<T> = T extends Leaf
  ? T
  : T extends ReadonlyArray<infer E>
    ? ReadonlyArray<Definition<E>>
    : { readonly [K in keyof T]?: Definition<T[K]> };

const variance = { _S: (_: never) => _ };
const lib = Ast.variable("lib");
const wrap = <S>(fn: string, ...args: ReadonlyArray<Ast.Expr>): Override<S> => ({
  ...Nix.make<unknown>(Ast.apply(Ast.select(lib, fn), ...args)),
  [OverrideId]: variance,
});

// The content types are inferred from where a definition goes, never from the content itself, so
// a typo inside `mkIf` fails like one outside it.

/** Defines `value` only while `condition` holds, without evaluating `value` otherwise. */
export const mkIf = <S>(condition: boolean | Nix.Nix<boolean>, value: NoInfer<S>): Override<S> =>
  wrap("mkIf", Nix.toExpr(condition), Nix.toExpr(value));

export const mkMerge = <S>(values: ReadonlyArray<NoInfer<S>>): Override<S> =>
  wrap("mkMerge", Nix.toExpr(values));

/** Overrides definitions of a priority below 50. */
export const mkForce = <S>(value: NoInfer<S>): Override<S> => wrap("mkForce", Nix.toExpr(value));

/** Yields to any definition of a priority below 1000. */
export const mkDefault = <S>(value: NoInfer<S>): Override<S> =>
  wrap("mkDefault", Nix.toExpr(value));

export const mkOverride = <S>(priority: number, value: NoInfer<S>): Override<S> =>
  wrap("mkOverride", Ast.number(priority), Nix.toExpr(value));

/** Orders list and string definitions before the others. */
export const mkBefore = <S>(value: NoInfer<S>): Override<S> => wrap("mkBefore", Nix.toExpr(value));

/** Orders list and string definitions after the others. */
export const mkAfter = <S>(value: NoInfer<S>): Override<S> => wrap("mkAfter", Nix.toExpr(value));
