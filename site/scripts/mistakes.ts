// Checks code/sample.ts.txt and ten broken copies of it against the types Typeflake generated for srv-2,
// and records what tsc reports. The generated types are 5.9 MB and stay out of the repository, so
// this runs where they were generated:
//
//   node scripts/mistakes.ts ../.typeflake/spike > data/mistakes.ts && pnpm exec vp fmt data
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Mistakes } from "../src/mistakes.ts";

// The same ten cases as the spike's sample, each made inside one complete configuration.
const edits = [
  {
    label: "A package where a boolean belongs",
    find: "enable: enabled",
    replace: "enable: pkgs.git",
  },
  { label: "A string port", find: "ports: [22]", replace: 'ports: ["22"]' },
  {
    label: "A typo inside the users.users submodule",
    find: "isNormalUser",
    replace: "isNormalUsr",
  },
  { label: "A Home Manager state version that doesn't exist", find: '"25.11"', replace: '"12.34"' },
  {
    label: "A number where sops-nix wants a mode string",
    find: 'mode: "0400"',
    replace: "mode: 400",
  },
  { label: "A typo two submodules deep", find: "proxyPass", replace: "proxyPas" },
  {
    label: "A Nix expression of the wrong type",
    find: "    hostName,",
    replace: "    hostName: port,",
  },
  { label: "A value sshd's settings enum doesn't allow", find: '"no"', replace: '"maybe"' },
  { label: "A string where a package belongs", find: "pkgs.ripgrep]", replace: '"ripgrep"]' },
  { label: "An option infra doesn't declare", find: "appStores:", replace: "appStore:" },
] as const;

const [spike] = process.argv.slice(2);
if (spike === undefined)
  throw new Error("usage: node scripts/mistakes.ts <directory with options.ts and prelude.ts>");

const site = join(import.meta.dirname, "..");
const base = readFileSync(join(site, "code/sample.ts.txt"), "utf8");
const variants = edits.map((edit) => {
  if (base.split(edit.find).length !== 2)
    throw new Error(`"${edit.find}" must occur exactly once in code/sample.ts.txt`);
  return base.replace(edit.find, edit.replace);
});

const dir = mkdtempSync(join(tmpdir(), "typeflake-mistakes-"));
try {
  copyFileSync(join(spike, "options.ts"), join(dir, "options.ts"));
  copyFileSync(join(spike, "prelude.ts"), join(dir, "prelude.ts"));
  const sources = [
    ["base.ts", base],
    ...variants.map((variant, i) => [`mistake-${i}.ts`, variant] as const),
  ] as const;
  for (const [file, source] of sources) writeFileSync(join(dir, file), source);
  // The spike's compiler options, from the repository's tsconfig.json.
  const compilerOptions = {
    target: "ES2024",
    module: "preserve",
    moduleResolution: "bundler",
    lib: ["ES2024"],
    types: [],
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    verbatimModuleSyntax: true,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
  };
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions, files: sources.map(([file]) => file) }),
  );

  const tsc = join(site, "node_modules/.bin/tsc");
  const version = execFileSync(tsc, ["--version"], { encoding: "utf8" }).trim();
  const output = stripVTControlCharacters(
    spawnSync(tsc, ["-p", ".", "--pretty"], { cwd: dir, encoding: "utf8" }).stdout,
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
        message,
      },
    ];
  });
  if (reports.some((report) => report.file === "base.ts"))
    throw new Error(`code/sample.ts.txt has errors:\n${output}`);

  const result: Mistakes = {
    checkedWith: version,
    mistakes: edits.map((edit, i) => {
      const [report, ...more] = reports.filter((found) => found.file === `mistake-${i}.ts`);
      if (report === undefined || more.length > 0)
        throw new Error(`expected one error for "${edit.label}":\n${output}`);
      const { line, column, length, diagnostic, message } = report;
      return {
        label: edit.label,
        find: edit.find,
        replace: edit.replace,
        line,
        column,
        length,
        diagnostic,
        message,
      };
    }),
  };
  process.stdout.write(`// Generated by scripts/mistakes.ts. Do not edit.
import type { Mistakes } from "../src/mistakes.ts"

export const mistakes: Mistakes = ${JSON.stringify(result, null, 2)}
`);
} finally {
  rmSync(dir, { recursive: true });
}
