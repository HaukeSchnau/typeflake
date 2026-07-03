const nixValueSymbol = Symbol("typeflake.nixValue");

export interface NixExpr<Kind extends string = string> {
  readonly [nixValueSymbol]: true;
  readonly tag: "raw";
  readonly kind: Kind;
  readonly code: string;
}

export interface NixString {
  readonly [nixValueSymbol]: true;
  readonly tag: "string";
  readonly value: string;
}

export interface NixNumber {
  readonly [nixValueSymbol]: true;
  readonly tag: "number";
  readonly value: number;
}

export interface NixBoolean {
  readonly [nixValueSymbol]: true;
  readonly tag: "boolean";
  readonly value: boolean;
}

export interface NixNull {
  readonly [nixValueSymbol]: true;
  readonly tag: "null";
}

export interface NixList {
  readonly [nixValueSymbol]: true;
  readonly tag: "list";
  readonly items: readonly NixValue[];
}

export interface NixAttrSet {
  readonly [nixValueSymbol]: true;
  readonly tag: "attrset";
  readonly attrs: Readonly<Record<string, NixValue | undefined>>;
}

export type NixValue =
  | NixExpr
  | NixString
  | NixNumber
  | NixBoolean
  | NixNull
  | NixList
  | NixAttrSet;

export type NixInput =
  | NixValue
  | string
  | number
  | boolean
  | null
  | readonly NixInput[]
  | { readonly [key: string]: NixInput | undefined };

export const rawNix = (code: string): NixExpr<"raw"> => ({
  [nixValueSymbol]: true,
  tag: "raw",
  kind: "raw",
  code,
});

export const nixExpr = <Kind extends string>(kind: Kind, code: string): NixExpr<Kind> => ({
  [nixValueSymbol]: true,
  tag: "raw",
  kind,
  code,
});

export const nixAttrPath = <Kind extends string>(
  kind: Kind,
  parts: readonly string[],
): NixExpr<Kind> => ({
  [nixValueSymbol]: true,
  tag: "raw",
  kind,
  code: parts.map(renderAttrPathSegment).join("."),
});

export const nixString = (value: string): NixString => ({
  [nixValueSymbol]: true,
  tag: "string",
  value,
});

export const nixNumber = (value: number): NixNumber => ({
  [nixValueSymbol]: true,
  tag: "number",
  value,
});

export const nixBoolean = (value: boolean): NixBoolean => ({
  [nixValueSymbol]: true,
  tag: "boolean",
  value,
});

export const nixNull: NixNull = {
  [nixValueSymbol]: true,
  tag: "null",
};

export const nixList = (items: readonly NixInput[]): NixList => ({
  [nixValueSymbol]: true,
  tag: "list",
  items: items.map(normalizeNixInput),
});

export const nixAttrSet = (attrs: Readonly<Record<string, NixInput | undefined>>): NixAttrSet => ({
  [nixValueSymbol]: true,
  tag: "attrset",
  attrs: Object.fromEntries(
    Object.entries(attrs).map(([key, value]) => [
      key,
      value === undefined ? undefined : normalizeNixInput(value),
    ]),
  ),
});

export const normalizeNixInput = (value: NixInput): NixValue => {
  if (isNixValue(value)) return value;

  switch (typeof value) {
    case "string":
      return nixString(value);
    case "number":
      return nixNumber(value);
    case "boolean":
      return nixBoolean(value);
    case "object":
      if (value === null) return nixNull;
      if (isReadonlyArray(value)) return nixList(value);
      return nixAttrSet(value);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      throw new Error(`Cannot normalize ${typeof value} as Nix`);
  }

  return absurd(value);
};

export const renderAttrName = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_'-]*$/.test(name) ? name : JSON.stringify(name);

const renderAttrPathSegment = renderAttrName;

const isNixValue = (value: NixInput): value is NixValue =>
  typeof value === "object" &&
  value !== null &&
  nixValueSymbol in value &&
  value[nixValueSymbol] &&
  "tag" in value &&
  (value.tag === "raw" ||
    value.tag === "string" ||
    value.tag === "number" ||
    value.tag === "boolean" ||
    value.tag === "null" ||
    value.tag === "list" ||
    value.tag === "attrset");

const isReadonlyArray = (value: object): value is readonly NixInput[] => Array.isArray(value);

const absurd = (value: never): never => {
  throw new Error(`Unexpected Nix input: ${String(value)}`);
};
