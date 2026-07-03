const nixExpressionSymbol: unique symbol = Symbol.for(
  "typeflake.nixExpression",
) as typeof nixExpressionSymbol;

export interface NixExpr<Kind extends string = string> {
  readonly [nixExpressionSymbol]: true;
  readonly kind: Kind;
  readonly code: string;
}

export type NixValue =
  | NixExpr
  | string
  | number
  | boolean
  | null
  | readonly NixValue[]
  | { readonly [key: string]: NixValue | undefined };

export const rawNix = <A = unknown>(code: string): NixExpr<"raw"> & A =>
  ({
    [nixExpressionSymbol]: true,
    kind: "raw",
    code,
  }) as NixExpr<"raw"> & A;

export const nixAttrPath = <Kind extends string>(
  kind: Kind,
  parts: readonly string[],
): NixExpr<Kind> => ({
  [nixExpressionSymbol]: true,
  kind,
  code: parts.map(renderAttrPathSegment).join("."),
});

export const isNixExpr = (value: unknown): value is NixExpr =>
  typeof value === "object" &&
  value !== null &&
  nixExpressionSymbol in value &&
  (value as NixExpr)[nixExpressionSymbol] === true;

export const renderAttrName = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_'-]*$/.test(name) ? name : JSON.stringify(name);

const renderAttrPathSegment = renderAttrName;
