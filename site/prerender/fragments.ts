import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mistakes } from "../data/mistakes.ts";
import { srv2 } from "../data/srv-2.ts";
import { sourceLabel } from "../src/option-map.ts";
import {
  createHighlighter,
  type DecorationItem,
  type ShikiTransformer,
  type ThemeRegistration,
} from "shiki";

// Colors are CSS variables, so style.css sets them for light and dark in one place. The Nix grammar
// doesn't mark function calls, so neither language colors them, and both sides of the pair read alike.
const color = (name: string, scope: ReadonlyArray<string>, fontStyle?: string) => ({
  scope: [...scope],
  settings: { foreground: `var(--code-${name})`, fontStyle },
});
const theme: ThemeRegistration = {
  name: "typeflake",
  type: "light",
  colors: { "editor.foreground": "var(--code-foreground)", "editor.background": "transparent" },
  tokenColors: [
    color("comment", ["comment", "punctuation.definition.comment"], "italic"),
    color("string", ["string", "string.unquoted.path", "constant.character.escape"]),
    color("constant", [
      "constant.numeric",
      "constant.language",
      "support.type.builtin",
      "constant.other.option",
    ]),
    color("keyword", [
      "keyword",
      "storage",
      "keyword.other.nix",
      "punctuation.definition.template-expression",
      "punctuation.section.embedded",
    ]),
    color("punctuation", ["punctuation", "meta.brace", "keyword.operator"]),
    color("type", ["entity.name.type", "support.type.primitive", "entity.name.command"]),
    // Code interpolated into a string is code again, and keys and names stay plain.
    color("foreground", [
      "meta.embedded",
      "meta.template.expression",
      "meta.object-literal.key",
      "meta.object-literal.key entity.name.function",
      "support.type.property-name",
      "string.unquoted.argument",
      "variable",
      "entity.other.attribute-name",
      "entity.name.function",
    ]),
    color("punctuation", [
      "meta.embedded punctuation",
      "meta.template.expression punctuation",
      "meta.embedded keyword.operator",
    ]),
    color("keyword", [
      "meta.embedded punctuation.section.embedded",
      "punctuation.definition.template-expression",
    ]),
    color("string", [
      "meta.embedded string",
      "meta.template.expression string",
      "meta.object-literal.key string",
    ]),
  ],
};
const highlighter = await createHighlighter({
  themes: [theme],
  langs: ["typescript", "nix", "json", "shellscript"],
});

type Lang = "typescript" | "nix" | "json" | "shellscript";

interface Mark {
  readonly from: number;
  readonly to: number;
  readonly properties: Readonly<Record<string, string>>;
}

interface HighlightOptions {
  readonly marks?: ReadonlyArray<Mark>;
  /** One-based lines that get the `changed` class. */
  readonly changed?: ReadonlyArray<number>;
}

/** Splits a mark into one decoration per line it covers, skipping each line's indentation. */
const decorations = (code: string, marks: ReadonlyArray<Mark>): Array<DecorationItem> =>
  marks.flatMap((mark) => {
    const items: Array<DecorationItem> = [];
    let lineStart = code.lastIndexOf("\n", mark.from - 1) + 1;
    while (lineStart < mark.to) {
      const lineEnd =
        code.indexOf("\n", lineStart) === -1 ? code.length : code.indexOf("\n", lineStart);
      const indent = code.slice(lineStart, lineEnd).search(/\S|$/);
      const from = Math.max(mark.from, lineStart + indent);
      const to = Math.min(mark.to, lineEnd);
      if (to > from)
        items.push({ start: from, end: to, properties: { ...mark.properties }, alwaysWrap: true });
      lineStart = lineEnd + 1;
    }
    return items;
  });

const highlight = (code: string, lang: Lang, options: HighlightOptions = {}): string => {
  const changed = new Set(options.changed);
  const lines = code.split("\n");
  const transformers: Array<ShikiTransformer> = [
    {
      pre(node) {
        node.properties["tabindex"] = "0";
      },
      line(node, line) {
        if (changed.has(line)) this.addClassToHast(node, "changed");
        // Lines wrap instead of scrolling, indented past their own indentation.
        node.properties["style"] = `--indent:${lines[line - 1]?.search(/\S|$/) ?? 0}`;
      },
      // A short token such as a secret's name or a path moves to the next line whole.
      span(node, _line, _col, _lineElement, token) {
        if (token.content.length <= 32 && /\S[-/.]\S/.test(token.content))
          this.addClassToHast(node, "keep");
      },
    },
  ];
  return highlighter.codeToHtml(code.replace(/\n$/, ""), {
    lang,
    theme: "typeflake",
    decorations: decorations(code, options.marks ?? []),
    transformers,
  });
};

/** The offsets of `find` in `code`, which must occur there exactly once. */
const locate = (code: string, find: string) => {
  const from = code.indexOf(find);
  if (from === -1 || code.indexOf(find, from + 1) !== -1)
    throw new Error(`expected exactly one ${JSON.stringify(find)}`);
  return { from, to: from + find.length };
};

// The samples are text for the page, and the .txt names keep tools from checking them as source.
const read = (file: string): string =>
  readFileSync(join(import.meta.dirname, "../code", file), "utf8");

const entities = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
]);
const escape = (text: string): string =>
  text.replace(/[&<>"]/g, (char) => entities.get(char) ?? char);

// Parts of the module and of the Nix Typeflake rendered from it that correspond. style.css and main.ts
// light both sides of a link together, and index.html has a note for each. code/app-stores.nix is
// what `module.render` printed for code/app-stores.nix.ts.txt on 2026-10-23; render it again when the
// printer changes, and a part that no longer matches fails the build here.
interface Link {
  readonly id: string;
  readonly ts: ReadonlyArray<string>;
  readonly nix: ReadonlyArray<string>;
}
const links: ReadonlyArray<Link> = [
  { id: "args", ts: ["{ config, lib, pkgs }"], nix: ["{ config, lib, pkgs, ... }"] },
  {
    id: "option",
    ts: [
      'options: {\n    appStores: {\n      enable: Options.enable("asc and gplay with the Urbs UG store credentials")',
    ],
    nix: [
      'options.appStores.enable = lib.mkEnableOption "asc and gplay with the Urbs UG store credentials";',
    ],
  },
  {
    id: "secrets",
    ts: ["const secrets = config.sops.secrets", '${secrets["app-store-connect/api-key"].path}'],
    nix: ['${config.sops.secrets."app-store-connect/api-key".path}'],
  },
  {
    id: "asc",
    ts: ['const asc = pkgs.writeShellApplication({\n      name: "asc",', "[asc]"],
    nix: ['(pkgs.writeShellApplication {\n        name = "asc";'],
  },
  { id: "text", ts: ["text: nix`"], nix: ["text = ''"] },
  {
    id: "exe",
    ts: ['${lib.getExe(pkgs.callPackage(path("./asc-package.nix"), {}))}'],
    nix: ["${lib.getExe (pkgs.callPackage ./asc-package.nix { })}"],
  },
  {
    id: "mkif",
    ts: ["mkIf(config.appStores.enable, {"],
    nix: ["config = lib.mkIf config.appStores.enable {"],
  },
  {
    id: "secret",
    ts: ['sops: {\n        secrets: {\n          "app-store-connect/api-key": {'],
    nix: ['sops.secrets."app-store-connect/api-key" = {'],
  },
  {
    id: "owner",
    ts: ["owner: config.identity.primaryUser,"],
    nix: ["owner = config.identity.primaryUser;"],
  },
  { id: "mode", ts: ['mode: "0400",'], nix: ['mode = "0400";'] },
  {
    id: "packages",
    ts: ["environment: { systemPackages:"],
    nix: ["environment.systemPackages = ["],
  },
];

const linked = (file: string, lang: Lang, side: "ts" | "nix"): string => {
  const code = read(file);
  const marks = links.flatMap((link) =>
    link[side].map((find): Mark => {
      const { from, to } = locate(code, find);
      return { from, to, properties: { class: "link", "data-link": link.id } };
    }),
  );
  return highlight(code, lang, { marks: marks.toSorted((a, b) => a.from - b.from) });
};

const sample = read("sample.ts.txt");

const offsetOf = (code: string, line: number, column: number): number =>
  code
    .split("\n")
    .slice(0, line - 1)
    .reduce((offset, text) => offset + text.length + 1, 0) +
  column -
  1;

const mistakeCode = mistakes.mistakes.map((mistake, i) => {
  const code = sample.replace(mistake.find, mistake.replace);
  const from = offsetOf(code, mistake.line, mistake.column);
  const changed = sample.slice(0, locate(sample, mistake.find).from).split("\n").length;
  const html = highlight(code, "typescript", {
    marks: [{ from, to: from + mistake.length, properties: { class: "squiggle" } }],
    changed: [changed],
  });
  return `<template data-mistake-code="${i}">${html}</template>`;
});

const mistakeOutput = mistakes.mistakes.map(
  (mistake, i) =>
    `<template data-mistake-output="${i}"><span class="out-loc">sample.ts:${mistake.line}:${mistake.column}</span> <span class="out-err">error TS${mistake.diagnostic}</span>: ${escape(mistake.message)}</template>`,
);

const mistakeList = mistakes.mistakes.map(
  (mistake, i) =>
    `<li><button type="button" class="mistake" data-mistake="${i}" aria-pressed="false">${escape(mistake.label)}</button></li>`,
);

const number = new Intl.NumberFormat("en");

const legend = srv2.sources.map(
  (source) =>
    `<li><span class="swatch" data-source="${source.source}"></span><span class="legend-name">${sourceLabel[source.source]}</span> <span class="legend-count">${number.format(source.count)}</span>${
      source.source === "inputs"
        ? ` <span class="legend-inputs">(${source.inputs.map((input) => `${escape(input.name)} ${number.format(input.count)}`).join(", ")})</span>`
        : ""
    }</li>`,
);

const mapTable = `<table class="counts">
<thead><tr><th scope="col">Namespace</th><th scope="col" class="num">Options</th><th scope="col">Largest inside</th></tr></thead>
<tbody>${srv2.groups
  .map(
    (group) =>
      `<tr><th scope="row"><code>${escape(group.name)}</code></th><td class="num">${number.format(group.count)}</td><td>${group.cells
        .filter((cell) => cell.folded === undefined)
        .slice(0, 3)
        .map((cell) => `<code>${escape(cell.path)}</code> ${number.format(cell.count)}`)
        .join(", ")}</td></tr>`,
  )
  .join("")}</tbody>
<tfoot><tr><th scope="row">All</th><td class="num">${number.format(srv2.total)}</td><td>${number.format(srv2.visible)} visible</td></tr></tfoot>
</table>
`;

// `tsc --version` can carry build metadata, such as an effect-tsgo patch, that isn't TypeScript's.
const typescriptVersion = mistakes.checkedWith.replace(/^Version /, "").replace(/\+.*$/, "");

export const fragments = new Map([
  ["map-legend", legend.join("\n")],
  ["map-table", mapTable],
  ["install-sh", highlight(read("install.sh"), "shellscript")],
  ["hero-ts", linked("app-stores.nix.ts.txt", "typescript", "ts")],
  ["hero-nix", linked("app-stores.nix", "nix", "nix")],
  ["sample", highlight(sample, "typescript")],
  ["mistake-templates", [...mistakeCode, ...mistakeOutput].join("\n")],
  ["mistake-list", mistakeList.join("\n")],
  ["checked-with", escape(`TypeScript ${typescriptVersion}`)],
  ["probe-sh", highlight(read("probe.sh"), "shellscript")],
  ["probe-json", highlight(read("probe.json.txt"), "json")],
  ["options-ts", highlight(read("options.ts.txt"), "typescript")],
  ["drv-path-sh", highlight(read("drv-path.sh"), "shellscript")],
]);
