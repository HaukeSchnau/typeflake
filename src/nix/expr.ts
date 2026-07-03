const nixExpressionSymbol = Symbol.for("typeflake.nixExpression");

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

export const rawNix = (code: string): NixExpr<"raw"> => ({
  [nixExpressionSymbol]: true,
  kind: "raw",
  code,
});

export const nixExpr = <Kind extends string>(kind: Kind, code: string): NixExpr<Kind> => ({
  [nixExpressionSymbol]: true,
  kind,
  code,
});

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
  value[nixExpressionSymbol] === true;

export const renderAttrName = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_'-]*$/.test(name) ? name : JSON.stringify(name);

const renderAttrPathSegment = renderAttrName;
