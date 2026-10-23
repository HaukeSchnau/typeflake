import * as Ast from "./Ast.ts"
import type { Definition } from "./Definition.ts"
import * as Nix from "./Nix.ts"
import type { Type } from "./Types.ts"

declare const DeclarationId: unique symbol

/** An option a module declares, whose values are `A`. */
export interface Declaration<out A> extends Nix.Nix<unknown> {
  readonly [DeclarationId]: { readonly _A: (_: never) => A }
}

export interface Declarations {
  readonly [name: string]: Declaration<unknown> | Declarations
}

/** The values a module's declarations give its `config`. */
export type Infer<D> = { readonly [K in keyof D]: D[K] extends Declaration<infer A> ? A : Infer<D[K]> }

const lib = Ast.variable("lib")

/** `lib.mkEnableOption`: a boolean, false by default, described as "Whether to enable <name>." */
export const enable = (name: string): Declaration<boolean> =>
  Nix.make(Ast.apply(Ast.select(lib, "mkEnableOption"), Ast.string([name]))) as Declaration<boolean>

export interface MakeOptions<A> {
  readonly type: Type<A>
  readonly default?: Definition<A>
  /** How the documentation shows the default, when it is an expression. */
  readonly defaultText?: string
  readonly example?: Definition<A>
  readonly description?: string
}

/** `lib.mkOption`. */
export const make = <A>(options: MakeOptions<A>): Declaration<A> => {
  const { defaultText, ...rest } = options
  const fields = Nix.toExpr(rest)
  const withText =
    defaultText === undefined || fields._tag !== "Attrs"
      ? fields
      : Ast.attrs([...fields.entries, ["defaultText", Ast.apply(Ast.select(lib, "literalExpression"), Ast.string([defaultText]))]])
  return Nix.make(Ast.apply(Ast.select(lib, "mkOption"), withText)) as Declaration<A>
}
