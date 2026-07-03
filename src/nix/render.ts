import { normalizeNixInput, renderAttrName, type NixExpr, type NixValue } from "./expr.ts";

export interface RenderOptions {
  readonly indent?: number;
}

export const renderNixValue = (value: unknown, options: RenderOptions = {}): string =>
  renderValue(normalizeNixInput(value), options.indent ?? 0);

const renderValue = (value: NixValue, indent: number): string => {
  switch (value.tag) {
    case "raw":
      return indentRaw(value.code, indent);
    case "string":
      return JSON.stringify(value.value);
    case "number":
      if (!Number.isFinite(value.value)) {
        throw new Error(`Cannot render non-finite number as Nix: ${value.value}`);
      }
      return String(value.value);
    case "boolean":
      return value.value ? "true" : "false";
    case "null":
      return "null";
    case "list":
      return renderList(value.items, indent);
    case "attrset":
      return renderAttrSet(value.attrs, indent);
  }

  return absurd(value);
};

export const renderList = (items: readonly unknown[], indent: number): string => {
  const normalized = items.map(normalizeNixInput);
  if (normalized.length === 0) return "[]";

  const childIndent = indent + 1;
  const pad = indentation(indent);
  const childPad = indentation(childIndent);
  const rendered = normalized
    .map((item) => `${childPad}${renderValue(item, childIndent)}`)
    .join("\n");

  return `[\n${rendered}\n${pad}]`;
};

export const renderAttrSet = (
  attrs: { readonly [key: string]: unknown },
  indent: number,
): string => {
  const entries = Object.entries(attrs).filter(
    (entry): entry is [string, unknown] => entry[1] !== undefined,
  );
  if (entries.length === 0) return "{}";

  const childIndent = indent + 1;
  const pad = indentation(indent);
  const childPad = indentation(childIndent);
  const rendered = entries
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${childPad}${renderAttrName(key)} = ${renderValue(normalizeNixInput(value), childIndent)};`,
    )
    .join("\n");

  return `{\n${rendered}\n${pad}}`;
};

export const renderModule = (module: NixExpr<"module">): string => module.code;

const indentation = (level: number): string => "  ".repeat(level);

const indentRaw = (code: string, indent: number): string => {
  const lines = code.split("\n");
  if (lines.length === 1) return code;

  const pad = indentation(indent);
  const [first, ...rest] = lines;
  return [first, ...rest.map((line) => (line.length === 0 ? line : `${pad}${line}`))].join("\n");
};

const absurd = (value: never): never => {
  throw new Error(`Unexpected Nix expression: ${String(value)}`);
};
