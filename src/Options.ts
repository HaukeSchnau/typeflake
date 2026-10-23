import * as Ast from "./Ast.ts";
import type { Definition } from "./Definition.ts";
import * as Nix from "./Nix.ts";
import type { Type } from "./Types.ts";

const DeclarationId: unique symbol = Symbol.for("typeflake/Declaration");

/** An option a module declares, whose values are `A`. */
export interface Declaration<out A> extends Nix.Nix<unknown> {
  readonly [DeclarationId]: { readonly _A: (_: never) => A };
}

export interface Declarations {
  readonly [name: string]: Declaration<unknown> | Declarations;
}

/** The values a module's declarations give its `config`. */
export type Infer<D> = {
  readonly [K in keyof D]: D[K] extends Declaration<infer A> ? A : Infer<D[K]>;
};

const variance = { _A: (_: never) => _ };
const lib = Ast.variable("lib");
const declare = <A>(fn: string, argument: Ast.Expr): Declaration<A> => ({
  ...Nix.make<unknown>(Ast.apply(Ast.select(lib, fn), argument)),
  [DeclarationId]: variance,
});

/** `lib.mkEnableOption`: a boolean, false by default, described as "Whether to enable <name>." */
export const enable = (name: string): Declaration<boolean> =>
  declare("mkEnableOption", Ast.string([Ast.text(name)]));

export interface MakeOptions<A> {
  readonly type: Type<A>;
  readonly default?: Definition<A>;
  /** How the documentation shows the default, when it is an expression. */
  readonly defaultText?: string;
  readonly example?: Definition<A>;
  readonly description?: string;
}

/** `lib.mkOption`. */
export const make = <A>(options: MakeOptions<A>): Declaration<A> => {
  const { defaultText, ...rest } = options;
  const fields = Nix.toExpr(rest);
  const text = Ast.apply(
    Ast.select(lib, "literalExpression"),
    Ast.string([Ast.text(defaultText ?? "")]),
  );
  return declare(
    "mkOption",
    defaultText === undefined || fields._tag !== "Attrs"
      ? fields
      : Ast.attrs([...fields.entries, ["defaultText", text]]),
  );
};
