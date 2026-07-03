import { isNixExpr, renderAttrName, type NixExpr, type NixValue } from "./expr.ts";

export interface RenderOptions {
  readonly indent?: number;
}

export const renderNixValue = (value: NixValue, options: RenderOptions = {}): string =>
  renderValue(value, options.indent ?? 0);

const renderValue = (value: NixValue, indent: number): string => {
  if (isNixExpr(value)) return indentRaw(value.code, indent);

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`Cannot render non-finite number as Nix: ${value}`);
      }
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    case "object":
      if (value === null) return "null";
      if (isReadonlyArray(value)) return renderList(value, indent);
      return renderAttrSet(value, indent);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      throw new Error(`Cannot render ${typeof value} as Nix`);
  }

  throw new Error("Cannot render unsupported Nix value");
};

export const renderList = (items: readonly NixValue[], indent: number): string => {
  if (items.length === 0) return "[]";

  const childIndent = indent + 1;
  const pad = indentation(indent);
  const childPad = indentation(childIndent);
  const rendered = items.map((item) => `${childPad}${renderValue(item, childIndent)}`).join("\n");

  return `[\n${rendered}\n${pad}]`;
};

export const renderAttrSet = (
  attrs: { readonly [key: string]: NixValue | undefined },
  indent: number,
): string => {
  const entries = Object.entries(attrs).filter(
    (entry): entry is [string, NixValue] => entry[1] !== undefined,
  );
  if (entries.length === 0) return "{}";

  const childIndent = indent + 1;
  const pad = indentation(indent);
  const childPad = indentation(childIndent);
  const rendered = entries
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) => `${childPad}${renderAttrName(key)} = ${renderValue(value, childIndent)};`,
    )
    .join("\n");

  return `{\n${rendered}\n${pad}}`;
};

export const renderModule = (module: NixExpr<"module">): string => module.code;

const indentation = (level: number): string => "  ".repeat(level);

const isReadonlyArray = (value: object): value is readonly NixValue[] => Array.isArray(value);

const indentRaw = (code: string, indent: number): string => {
  const lines = code.split("\n");
  if (lines.length === 1) return code;

  const pad = indentation(indent);
  const [first, ...rest] = lines;
  return [first, ...rest.map((line) => (line.length === 0 ? line : `${pad}${line}`))].join("\n");
};
