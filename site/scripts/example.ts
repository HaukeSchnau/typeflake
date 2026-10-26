// Regenerates what the page says about site/example from real runs: the rendered .nix files, the
// option tree the snowflake draws, the measurements, and what tsc reports for each mistake. Needs Nix
// and the built package (`pnpm build` at the repository root), then from site/:
//
//   node scripts/example.ts && pnpm exec vp fmt data
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Example, Graph, GraphNode, Mistake } from "../src/data.ts";

const site = join(import.meta.dirname, "..");
const root = join(site, "..");
const example = join(site, "example");
const cli = join(root, "src/Cli.ts");
const probeFile = join(root, "src/probe.nix");
const tsc = join(site, "node_modules/.bin/tsc");
const configurations = ["nixosConfigurations.server", "darwinConfigurations.laptop"];

// The example's own tsconfig and modules, each with one edit. The page names them by their labels.
const edits = [
  {
    file: "hosts/server.nix.ts",
    label: "A NixOS option with the wrong case",
    find: 'hostName: "server"',
    replace: 'hostname: "server"',
  },
  {
    file: "hosts/server.nix.ts",
    label: "A value sshd doesn't allow",
    find: 'PermitRootLogin: "no"',
    replace: 'PermitRootLogin: "never"',
  },
  {
    file: "hosts/server.nix.ts",
    label: "A typo inside a user",
    find: "isNormalUser",
    replace: "isNormalUsr",
  },
  {
    file: "hosts/server.nix.ts",
    label: "A Home Manager release that doesn't exist",
    find: 'home: { stateVersion: "26.05" }',
    replace: 'home: { stateVersion: "26.04" }',
  },
  {
    file: "hosts/server.nix.ts",
    label: "A package nixpkgs doesn't have",
    find: "pkgs.ripgrep]",
    replace: "pkgs.ripgerp]",
  },
  {
    file: "modules/blog.nix.ts",
    label: "A program lychee doesn't ship",
    find: 'exe(pkgs.lychee, "lychee")',
    replace: 'exe(pkgs.lychee, "lychie")',
  },
  {
    file: "modules/blog.nix.ts",
    label: "An argument site.nix doesn't take",
    find: "pkgs.callPackage(site, {})",
    replace: 'pkgs.callPackage(site, { title: "Blog" })',
  },
  {
    file: "hosts/server.nix.ts",
    label: "The blog's own option, misspelled",
    find: "blog: { enable: true",
    replace: "blog: { enabel: true",
  },
  {
    file: "modules/blog.nix.ts",
    label: "A port written as a string",
    find: "allowedTCPPorts: [80, 443]",
    replace: 'allowedTCPPorts: [80, "443"]',
  },
  {
    file: "modules/blog.nix.ts",
    label: "A boolean where nginx wants a name",
    find: "serverName: config.blog.domain",
    replace: "serverName: config.blog.enable",
  },
  {
    file: "hosts/laptop.nix.ts",
    label: "A Dock position macOS doesn't have",
    find: 'orientation: "left"',
    replace: 'orientation: "top"',
  },
] as const;

const run = (command: string, args: ReadonlyArray<string>, cwd = example) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    // The probe prints about 20 MB of JSON.
    maxBuffer: 2 ** 30,
  });

const seconds = (start: number) => Math.round((performance.now() - start) / 100) / 10;

// 1. Render, then probe: the flake imports the rendered files, and their options join the probe.
const rendered = run("node", [cli, "render"]).trim();
const typesStart = performance.now();
const typed = run("node", [cli, "types", "--flake", "path:.", ...configurations]).trim();
const typesSeconds = seconds(typesStart);

const drvPaths = configurations.map((configuration) =>
  run("nix", [
    "eval",
    "--raw",
    `path:.#${configuration}.config.system.build.toplevel.drvPath`,
  ]).trim(),
);

// 2. The option tree of the server, as the snowflake draws it.
interface ProbeType {
  readonly name: string;
  readonly inStore?: boolean | null;
  readonly truncated?: boolean;
  readonly values?: ReadonlyArray<string | number | boolean | null>;
  readonly nested?: { readonly [key: string]: ProbeType };
  readonly alternatives?: ReadonlyArray<ProbeType>;
  readonly options?: ProbeTree;
}
interface ProbeOption {
  readonly visible: boolean | "shallow";
  readonly internal: boolean;
  readonly type: ProbeType;
}
interface ProbeTree {
  readonly [name: string]: { readonly group: ProbeTree } | ProbeOption;
}

const probed: ProbeTree = JSON.parse(
  run("nix", [
    "eval",
    "--impure",
    "--json",
    "path:.#nixosConfigurations.server.options",
    "--apply",
    `import ${probeFile} { class = "nixos"; }`,
  ]),
);

// The type the generated declarations give an option, with interface names spelled out.
const display = (type: ProbeType): string => {
  const inner = (key: string) => {
    const nested = type.nested?.[key];
    return nested === undefined ? "NixValue" : display(nested);
  };
  if (type.truncated === true) return "NixValue";
  switch (type.name.split(" ")[0]) {
    case "bool":
    case "boolByOr":
      return "boolean";
    case "str":
    case "separatedString":
    case "nonEmptyStr":
    case "singleLineStr":
    case "strMatching":
    case "passwdEntry":
      return "string";
    case "int":
    case "float":
    case "number":
    case "port":
    case "unsignedInt":
    case "unsignedInt8":
    case "unsignedInt16":
    case "unsignedInt32":
    case "signedInt8":
    case "signedInt16":
    case "signedInt32":
    case "positiveInt":
    case "intBetween":
    case "numberBetween":
    case "numberNonnegative":
    case "numberPositive":
    case "nonnegativeFloat":
    case "nonzeroInt":
      return "number";
    case "path":
      return type.inStore === false ? "NixPath" : "NixPath | Package";
    case "absolutePath":
    case "pathNotInStore":
      return "NixPath";
    case "package":
    case "shellPackage":
      return "Package";
    case "enum": {
      const values = (type.values ?? []).map((value) => JSON.stringify(value));
      return values.length > 5 ? `${values.slice(0, 4).join(" | ")} | …` : values.join(" | ");
    }
    case "nullOr":
      return `${inner("elemType")} | null`;
    case "listOf":
      return `ReadonlyArray<${inner("elemType")}>`;
    case "attrsOf":
    case "lazyAttrsOf":
    case "attrsWith":
      return `{ readonly [name: string]: ${inner("elemType")} }`;
    case "oneOf":
      return [...new Set((type.alternatives ?? []).map(display))].join(" | ");
    case "coercedTo":
      return `${inner("coercedType")} | ${inner("finalType")}`;
    case "unique":
    case "uniq":
      return inner("elemType");
    case "functionTo":
      return "NixFunction";
    case "anything":
    case "unspecified":
    case "raw":
    case "attrs":
      return "NixValue";
    case "submodule":
      return "{ … }";
    default:
      return `Unsupported<${JSON.stringify(type.name)}>`;
  }
};

const subOptions = (type: ProbeType): ProbeTree | undefined => {
  if (type.options !== undefined && Object.keys(type.options).length > 0) return type.options;
  const element = type.nested?.["elemType"];
  if (element !== undefined) return subOptions(element);
  for (const alternative of type.alternatives ?? []) {
    const found = subOptions(alternative);
    if (found !== undefined) return found;
  }
  return undefined;
};

const types: Array<string> = [];
const typeIds = new Map<string, number>();
const typeId = (type: ProbeType): number => {
  const text = display(type);
  const known = typeIds.get(text);
  if (known !== undefined) return known;
  typeIds.set(text, types.length);
  types.push(text);
  return types.length - 1;
};

let options = 0;
const branch = (tree: ProbeTree): Array<GraphNode> =>
  Object.entries(tree)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .flatMap(([name, node]): Array<GraphNode> => {
      if ("group" in node) return [[name, branch(node.group)]];
      if (node.visible === false || node.internal) return [];
      options++;
      const sub = subOptions(node.type);
      if (sub === undefined) return [[name, typeId(node.type)]];
      // An attribute set or list of submodules holds them under a name the user picks.
      const children = branch(sub);
      return [
        [
          name,
          node.type.name === "submodule" ? children : [["<name>", children]],
          typeId(node.type),
        ],
      ];
    });
const tree = branch(probed);
const graph: Graph = { options, types, tree };
writeFileSync(join(site, "data/graph.json"), JSON.stringify(graph));

// 3. Every mistake in one program, as copies of the module next to the original.
const dir = mkdtempSync(join(tmpdir(), "typeflake-example-"));
try {
  cpSync(example, dir, { recursive: true });
  // The copy resolves `typeflake` and extends the repository's tsconfig from where it is.
  mkdirSync(join(dir, "node_modules"));
  symlinkSync(root, join(dir, "node_modules/typeflake"));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      // tsconfig.json allows comments, and the example's has whole-line ones.
      ...JSON.parse(
        readFileSync(join(example, "tsconfig.json"), "utf8").replaceAll(/^\s*\/\/.*$/gm, ""),
      ),
      extends: join(root, "tsconfig.json"),
    }),
  );
  const variants = edits.map((edit, i) => {
    const source = readFileSync(join(example, edit.file), "utf8");
    if (source.split(edit.find).length !== 2)
      throw new Error(`"${edit.find}" must occur exactly once in ${edit.file}`);
    const file = edit.file.replace(/\.nix\.ts$/, `.mistake-${i}.nix.ts`);
    writeFileSync(join(dir, file), source.replace(edit.find, edit.replace));
    return file;
  });

  const version = run(tsc, ["--version"]).trim();
  const checkStart = performance.now();
  const clean = spawnSync(tsc, ["-p", example, "--noEmit"], { encoding: "utf8" });
  const checkSeconds = seconds(checkStart);
  if (clean.status !== 0) throw new Error(`the example has errors:\n${clean.stdout}`);

  const output = stripVTControlCharacters(
    spawnSync(tsc, ["-p", ".", "--noEmit", "--pretty"], { cwd: dir, encoding: "utf8" }).stdout,
  );
  // `file:line:column - error TSnnnn: message`, continuation lines, then the line and its squiggle.
  const reports = [
    ...output.matchAll(
      /^(?<file>\S+):(?<line>\d+):(?<column>\d+) - error TS(?<code>\d+): (?<message>[^\n]*(?:\n {2,}[^\n]*)*)\n\n[^\n]*\n(?<squiggle> *~+)/gm,
    ),
  ].flatMap(({ groups = {} }) => {
    const { file, line, column, code, message, squiggle } = groups;
    if (file === undefined || message === undefined || squiggle === undefined) return [];
    return [
      {
        file,
        line: Number(line),
        column: Number(column),
        length: squiggle.trim().length,
        diagnostic: Number(code),
        message: message.replace(/\n {2,}/g, "\n"),
      },
    ];
  });

  const mistakes = edits.map((edit, i): Mistake => {
    const [report, ...more] = reports.filter((found) => found.file === variants[i]);
    if (report === undefined || more.length > 0)
      throw new Error(`expected one error for "${edit.label}":\n${output}`);
    const { label, file, find, replace } = edit;
    const { line, column, length, diagnostic, message } = report;
    return { label, file, find, replace, line, column, length, diagnostic, message };
  });

  const size = (configuration: string) =>
    statSync(join(example, ".typeflake", `${configuration}.ts`)).size;
  const result: Example = {
    measuredOn: new Date().toISOString().slice(0, 10),
    typescript: version.replace(/^Version /, "").replace(/\+.*$/, ""),
    options,
    packages: Number(
      run("nix", [
        "eval",
        "path:.#nixosConfigurations.server.pkgs",
        "--apply",
        "pkgs: builtins.length (builtins.attrNames pkgs)",
      ]).trim(),
    ),
    rendered,
    typed,
    typesSeconds,
    typesBytes:
      configurations.reduce((sum, configuration) => sum + size(configuration), 0) +
      statSync(join(example, ".typeflake/providers.ts")).size,
    checkSeconds,
    drvPaths,
    mistakes,
  };
  writeFileSync(
    join(site, "data/example.ts"),
    `// Generated by scripts/example.ts. Do not edit.
import type { Example } from "../src/data.ts"

export const example: Example = ${JSON.stringify(result, null, 2)}
`,
  );
} finally {
  rmSync(dir, { recursive: true });
}
