import * as Ast from "./Ast.ts"
import * as Nix from "./Nix.ts"
import type * as Options from "./Options.ts"

declare const TypeTypeId: unique symbol

/** A module system option type, `lib.types.*`, whose values are `A`. */
export interface Type<out A> extends Nix.Nix<unknown> {
  readonly [TypeTypeId]: { readonly _A: (_: never) => A }
}

const types = Ast.select(Ast.variable("lib"), "types")
const named = <A>(name: string, ...args: ReadonlyArray<Ast.Expr>): Type<A> =>
  Nix.make(Ast.apply(Ast.select(types, name), ...args)) as Type<A>

export const bool: Type<boolean> = named("bool")
export const str: Type<string> = named("str")
export const lines: Type<string> = named("lines")
export const int: Type<number> = named("int")
export const float: Type<number> = named("float")
export const port: Type<number> = named("port")
export const path: Type<Nix.NixPath> = named("path")
export const package_: Type<Nix.Package> = named("package")
export { package_ as package }
export const anything: Type<Nix.NixValue> = named("anything")

export const listOf = <A>(element: Type<A>): Type<ReadonlyArray<A>> => named("listOf", Nix.exprOf(element))
export const attrsOf = <A>(element: Type<A>): Type<{ readonly [name: string]: A }> => named("attrsOf", Nix.exprOf(element))
export const nullOr = <A>(element: Type<A>): Type<A | null> => named("nullOr", Nix.exprOf(element))
export const either = <A, B>(left: Type<A>, right: Type<B>): Type<A | B> => named("either", Nix.exprOf(left), Nix.exprOf(right))
export const enumOf = <const V extends string | number>(values: ReadonlyArray<V>): Type<V> => named("enum", Nix.toExpr(values))
export { enumOf as enum }
export const submodule = <const D extends Options.Declarations>(options: D): Type<Options.Infer<D>> =>
  named("submodule", Ast.attrs([["options", Nix.toExpr(options)]]))
