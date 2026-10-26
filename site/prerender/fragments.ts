import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createHighlighter,
  type DecorationItem,
  type ShikiTransformer,
  type ThemeRegistration,
} from "shiki";
import { example } from "../data/example.ts";
import type { Graph, GraphNode } from "../src/data.ts";

// Colors are CSS variables, so style.css sets them in one place. The Nix grammar doesn't mark
// function calls, so neither language colors them, and both sides of the pair read alike.
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
  /** Whether lines carry their numbers, as in an editor. */
  readonly numbered?: boolean;
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
        if (options.numbered === true) this.addClassToHast(node, "numbered");
      },
      line(node, line) {
        if (changed.has(line)) this.addClassToHast(node, "changed");
        if (options.numbered === true) node.properties["data-line"] = String(line);
        // Lines wrap instead of scrolling, indented past their own indentation.
        node.properties["style"] = `--indent:${lines[line - 1]?.search(/\S|$/) ?? 0}`;
      },
      // A short token such as a path or a domain moves to the next line whole.
      span(node, _line, _col, _lineElement, token) {
        if (token.content.length <= 32 && /^\S*\S[-/.]\S\S*$/.test(token.content))
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

const read = (file: string): string => readFileSync(join(import.meta.dirname, "..", file), "utf8");
// The page shows a rendered file without the header naming its source, which the pane head does.
const rendered = (file: string): string => read(file).replace(/^# Generated by Typeflake.*\n/, "");

const entities = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
]);
const escape = (text: string): string =>
  text.replace(/[&<>"]/g, (char) => entities.get(char) ?? char);

const number = new Intl.NumberFormat("en");

// Parts of the blog module and of the Nix Typeflake rendered from it that correspond. style.css and
// main.ts light both sides of a link together, and index.html has a note for each. A part that no
// longer matches after scripts/example.ts rendered the example again fails the build here.
interface Link {
  readonly id: string;
  readonly ts: ReadonlyArray<string>;
  readonly nix: ReadonlyArray<string>;
}
const links: ReadonlyArray<Link> = [
  { id: "args", ts: ["{ config, pkgs }"], nix: ["{ config, lib, pkgs, ... }"] },
  {
    id: "option",
    ts: [
      'enable: Options.enable("the blog")',
      'domain: Options.make({\n        type: Types.str,\n        description: "Where the blog answers.",\n      })',
    ],
    nix: [
      'enable = lib.mkEnableOption "the blog";',
      'domain = lib.mkOption {\n      type = lib.types.str;\n      description = "Where the blog answers.";\n    };',
    ],
  },
  {
    id: "site",
    ts: ['import site from "./site.nix";', "root: pkgs.callPackage(site, {})"],
    nix: ["root = pkgs.callPackage ./site.nix { };"],
  },
  {
    id: "mkif",
    ts: ["mkIf(config.blog.enable, {"],
    nix: ["config = lib.mkIf config.blog.enable {"],
  },
  { id: "vhost", ts: ["virtualHosts: {\n            blog: {"], nix: ["virtualHosts.blog = {"] },
  {
    id: "domain",
    ts: ["serverName: config.blog.domain"],
    nix: ["serverName = config.blog.domain;"],
  },
  {
    id: "ports",
    ts: ["allowedTCPPorts: [80, 443]"],
    nix: ["networking.firewall.allowedTCPPorts = [ 80 443 ];"],
  },
  { id: "script", ts: ["script: nix`"], nix: ["script = ''"] },
  {
    id: "exe",
    ts: ['${exe(pkgs.lychee, "lychee")}'],
    nix: ['${lib.getExe\' pkgs.lychee "lychee"}'],
  },
];

const linked = (code: string, lang: Lang, side: "ts" | "nix"): string => {
  const marks = links.flatMap((link) =>
    link[side].map((find): Mark => {
      const { from, to } = locate(code, find);
      return { from, to, properties: { class: "link", "data-link": link.id } };
    }),
  );
  return highlight(code, lang, { marks: marks.toSorted((a, b) => a.from - b.from) });
};

// The mistakes: one editor per file of the example, and each mistake made in a copy of its file.
const files = [...new Set(example.mistakes.map((mistake) => mistake.file))];
const offsetOf = (code: string, line: number, column: number): number =>
  code
    .split("\n")
    .slice(0, line - 1)
    .reduce((offset, text) => offset + text.length + 1, 0) +
  column -
  1;

const editorFor = (file: string) =>
  `<template data-editor-clean="${escape(file)}">${highlight(read(`example/${file}`), "typescript", { numbered: true })}</template>`;

const mistakeTemplates = example.mistakes.map((mistake, i) => {
  const source = read(`example/${mistake.file}`);
  const code = source.replace(mistake.find, mistake.replace);
  const from = offsetOf(code, mistake.line, mistake.column);
  const html = highlight(code, "typescript", {
    numbered: true,
    marks: [{ from, to: from + mistake.length, properties: { class: "squiggle" } }],
    changed: [mistake.line],
  });
  const message = mistake.message
    .split("\n")
    .map((line) => `<span class="diagnostic-line">${escape(line)}</span>`)
    .join("");
  return `<template data-mistake-code="${i}">${html}</template>
<template data-mistake-problem="${i}"><p class="diagnostic"><span class="diagnostic-code">TS${mistake.diagnostic}</span> ${message}</p><p class="diagnostic-where">${escape(mistake.file)}:${mistake.line}:${mistake.column}</p></template>`;
});

const mistakeList = example.mistakes.map(
  (mistake, i) =>
    `<li><button type="button" class="mistake" data-mistake="${i}" data-file="${escape(mistake.file)}" aria-pressed="false"><span class="mistake-label">${escape(mistake.label)}</span><span class="mistake-file">${escape(mistake.file.replace(/^.*\//, ""))}</span></button></li>`,
);

const [firstFile = "hosts/server.nix.ts"] = files;

// Counts from the snowflake's data, so the page and the drawing agree. scripts/example.ts wrote it.
const graph: Graph = JSON.parse(read("data/graph.json"));
const { tree, options } = graph;
const find = (nodes: ReadonlyArray<GraphNode>, path: ReadonlyArray<string>): GraphNode => {
  const [head, ...rest] = path;
  const node = nodes.find(([name]) => name === head);
  if (node === undefined) throw new Error(`graph.json has no ${path.join(".")}`);
  const children = node[1];
  if (rest.length === 0) return node;
  if (!Array.isArray(children)) throw new Error(`${head} has no children`);
  return find(children, rest);
};
const optionCount = (node: GraphNode): number => {
  const children = node[1];
  return Array.isArray(children) ? children.reduce((sum, child) => sum + optionCount(child), 0) : 1;
};
const vhostOptions = optionCount(find(tree, ["services", "nginx", "virtualHosts", "<name>"]));

// tsrs reported the mistakes; tsc is there for comparison.
const [checkedBy, tsc] = example.checks;
if (checkedBy?.compiler !== "tsrs" || tsc?.compiler !== "tsc")
  throw new Error("data/example.ts must hold tsrs's check, then tsc's");
// `Version 7.1.0-dev… (tsrs 0.18.0-ts7.1.0-dev…, microsoft/TypeScript@…)`
const tsrsVersion = /tsrs (\d+\.\d+\.\d+)/.exec(checkedBy.version)?.[1] ?? checkedBy.version;

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

const shell = (lines: ReadonlyArray<string>, output?: string): string =>
  `<div class="term">${highlight(lines.join("\n"), "shellscript")}${
    output === undefined ? "" : `<pre class="term-out">${escape(output)}</pre>`
  }</div>`;

// The cycle How it works describes: a module renders to Nix, Nix reports the options, and their
// types check the module. One drawing for wide screens and one for narrow ones.
interface Station {
  readonly title: string;
  readonly detail: string;
}
const write: Station = { title: "modules/blog.nix.ts", detail: "the module you write" };
const nix: Station = { title: "modules/blog.nix", detail: "plain Nix next to it" };
const probe: Station = {
  title: "nix eval",
  detail: `${number.format(example.options)} options, read back`,
};
const declarations: Station = {
  title: ".typeflake/*.ts",
  detail: `${megabytes(example.typesBytes)} of declarations`,
};

const box = (station: Station, x: number, y: number, width: number) =>
  `<g class="loop-station"><rect x="${x}" y="${y}" width="${width}" height="66" rx="10"/><text class="loop-title" x="${x + 18}" y="${y + 28}">${escape(station.title)}</text><text class="loop-detail" x="${x + 18}" y="${y + 50}">${escape(station.detail)}</text></g>`;
const label = (text: string, x: number, y: number, anchor = "middle") =>
  `<text class="loop-verb" x="${x}" y="${y}" text-anchor="${anchor}">${escape(text)}</text>`;
const arrow = (d: string) => `<path class="loop-edge" d="${d}" marker-end="url(#loop-head)"/>`;
const head = `<defs><marker id="loop-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none"/></marker></defs>`;
const loopWide = `<svg class="loop loop-wide" viewBox="0 0 1000 250" role="img" aria-labelledby="loop-wide-title"><title id="loop-wide-title">A module renders to Nix, Nix reports the options, and their types check the module.</title>${head}
${box(write, 20, 20, 290)}${box(nix, 690, 20, 290)}${box(probe, 690, 164, 290)}${box(declarations, 20, 164, 290)}
${arrow("M318 53H680")}${label("typeflake render", 499, 42)}
${arrow("M835 94V156")}${label("imported by flake.nix", 820, 130, "end")}
${arrow("M680 197H318")}${label("typeflake types", 499, 186)}
${arrow("M165 156V94")}${label("types the module", 180, 130, "start")}
</svg>`;
const loopTall = `<svg class="loop loop-tall" viewBox="0 0 360 520" role="img" aria-labelledby="loop-tall-title"><title id="loop-tall-title">A module renders to Nix, Nix reports the options, and their types check the module.</title>${head}
${box(write, 40, 10, 300)}${box(nix, 40, 146, 300)}${box(probe, 40, 282, 300)}${box(declarations, 40, 418, 300)}
${arrow("M190 82V138")}${label("typeflake render", 204, 115, "start")}
${arrow("M190 218V274")}${label("imported by flake.nix", 204, 251, "start")}
${arrow("M190 354V410")}${label("typeflake types", 204, 387, "start")}
${arrow("M40 451H18V43H32")}
</svg>`;

export const fragments = new Map([
  [
    "flake-caption",
    `Every line is an option or a namespace of the example server, a NixOS configuration with Home Manager: ${number.format(options)} options, laid out as one arm and repeated six times.`,
  ],
  ["blog-ts", linked(read("example/modules/blog.nix.ts"), "typescript", "ts")],
  ["blog-nix", linked(rendered("example/modules/blog.nix"), "nix", "nix")],
  ["vhost-options", number.format(vhostOptions)],
  ["loop", `<figure class="loop-figure">${loopWide}${loopTall}</figure>`],
  ["mistake-list", mistakeList.join("\n")],
  ["editor-file", escape(firstFile)],
  ["editor-code", highlight(read(`example/${firstFile}`), "typescript", { numbered: true })],
  ["checked-with", escape(`Checked by ${checkedBy.compiler} ${tsrsVersion}`)],
  ["mistake-templates", [...files.map(editorFor), ...mistakeTemplates].join("\n")],
  ["step-render", shell(["pnpm exec typeflake render"], example.rendered)],
  [
    "step-types",
    shell(
      ["pnpm exec typeflake types \\", "  nixosConfigurations.server darwinConfigurations.laptop"],
      example.typed,
    ),
  ],
  [
    "probe-numbers",
    `For the example that is ${number.format(example.options)} options and ${number.format(example.packages)} package names, ${megabytes(example.typesBytes)} of declarations, in ${example.typesSeconds} seconds.`,
  ],
  ["step-check", shell(["pnpm exec tsrs --noEmit"])],
  [
    "check-numbers",
    `tsrs, the Rust port of TypeScript's compiler, checks the example against all of them in ${checkedBy.seconds} seconds with ${checkedBy.megabytes} MB of memory. tsc takes ${tsc.seconds} seconds and ${tsc.megabytes} MB.`,
  ],
  [
    "step-build",
    shell(
      ["nix eval --raw \\", "  .#nixosConfigurations.server.config.system.build.toplevel.drvPath"],
      example.drvPaths[0],
    ),
  ],
  [
    "start-sh",
    highlight(
      [
        "pnpm add -D typeflake@next tsrs",
        "",
        "# Write modules/blog.nix.ts, and import ./modules/blog.nix in flake.nix.",
        "pnpm exec typeflake render",
        "pnpm exec typeflake types nixosConfigurations.server",
        "pnpm exec tsrs --noEmit",
      ].join("\n"),
      "shellscript",
    ),
  ],
  [
    "start-tsconfig",
    highlight(
      JSON.stringify(
        {
          compilerOptions: { allowArbitraryExtensions: true, rootDirs: [".", ".typeflake/files"] },
          include: ["**/*.nix.ts", ".typeflake/**/*.ts"],
        },
        null,
        2,
      ),
      "json",
    ),
  ],
]);
