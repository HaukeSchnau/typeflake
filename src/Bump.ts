import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { type Node, type ObjectExpression, parseSync, Visitor } from "oxc-parser";
import * as Project from "./Project.ts";
import type { Rename } from "./Typegen.ts";

export class UpdateFailed extends Schema.TaggedError<
  UpdateFailed,
  { readonly brand: unique symbol }
>()("UpdateFailed", { command: Schema.String, output: Schema.String }) {
  override get message() {
    return `${this.command} failed:\n${this.output}`;
  }
}

const text = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) =>
  stream.pipe(Stream.decodeText(), Stream.mkString);

/** Runs a command and returns its exit code and what it printed. */
const run = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(ChildProcess.make(command, args, { cwd }));
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      );
      return { exitCode, output: `${stdout}${stderr}` };
    }),
  );

const Lock = Schema.fromJsonString(
  Schema.Struct({
    nodes: Schema.Record(
      Schema.String,
      Schema.Struct({
        locked: Schema.Struct({
          rev: Schema.String.pipe(Schema.optionalKey),
          lastModified: Schema.Finite.pipe(Schema.optionalKey),
        }).pipe(Schema.optionalKey),
      }),
    ),
  }),
);

export interface Change {
  readonly input: string;
  readonly from: string;
  readonly to: string;
}

const describe = (rev: string | undefined, lastModified: number | undefined) =>
  `${rev?.slice(0, 7) ?? "?"}${lastModified === undefined ? "" : ` (${new Date(lastModified * 1000).toISOString().slice(0, 10)})`}`;

/** The inputs whose locked revision differs between two `flake.lock` files. */
const changes = (before: string, after: string) =>
  Effect.gen(function* () {
    const decode = Schema.decodeEffect(Lock);
    const [old, next] = [yield* decode(before), yield* decode(after)];
    return Object.entries(next.nodes).flatMap(([input, node]): ReadonlyArray<Change> => {
      const previous = old.nodes[input]?.locked;
      if (node.locked?.rev === previous?.rev) return [];
      return [
        {
          input,
          from: describe(previous?.rev, previous?.lastModified),
          to: describe(node.locked?.rev, node.locked?.lastModified),
        },
      ];
    });
  });

export interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
  readonly message: string;
}

/** `file(line,column): error TSnnnn: message`, as `tsrs` and `tsc` print it with `--pretty false`. */
const diagnostics = (output: string): ReadonlyArray<Diagnostic> =>
  [
    ...output.matchAll(
      /^(?<file>[^\s(][^(]*)\((?<line>\d+),(?<column>\d+)\): error (?<code>TS\d+): (?<message>.*(?:\n {2}.*)*)/gm,
    ),
  ].flatMap(({ groups = {} }) => {
    const { file, line, column, code, message } = groups;
    if (file === undefined || code === undefined || message === undefined) return [];
    return [{ file, line: Number(line), column: Number(column), code, message }];
  });

/**
 * Typechecks the modules against the declarations in `directory`. A tsconfig there extends the
 * project's, so the project's compiler options hold, and lists the modules and those declarations
 * only.
 */
const check = (root: string, directory: string, modules: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const relative = (file: string) => path.relative(directory, path.join(root, file));
    const generated = (yield* fs.readDirectory(directory)).filter((file) => file.endsWith(".ts"));
    const files = [
      ...modules.map(relative),
      ...generated,
      ...(yield* fs
        .readDirectory(path.join(directory, "files"), { recursive: true })
        .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => [])))
        .filter((file) => file.endsWith(".ts"))
        .map((file) => `files/${file}`),
    ];
    yield* fs.writeFileString(
      path.join(directory, "tsconfig.json"),
      JSON.stringify(
        {
          extends: relative("tsconfig.json"),
          compilerOptions: { rootDirs: [relative("."), "files"], noEmit: true },
          files,
        },
        null,
        2,
      ),
    );
    // tsrs reports what tsc does, with less than half the memory on generated declarations.
    const installed = yield* Effect.filter(["tsrs", "tsc"], (name) =>
      fs.exists(path.join(root, "node_modules/.bin", name)),
    );
    const checker =
      installed[0] === undefined ? "tsc" : path.join(root, "node_modules/.bin", installed[0]);
    const { output } = yield* run(checker, ["-p", directory, "--pretty", "false"], root);
    yield* fs.remove(path.join(directory, "tsconfig.json"));
    // Paths come out relative to the root, where the checker runs.
    return diagnostics(output).filter((found) => !found.file.includes(".typeflake"));
  });

/** Where a module sets an option with a property key: the option's path and the key's offsets. */
interface Occurrence {
  readonly path: ReadonlyArray<string>;
  readonly start: number;
  readonly end: number;
}

const keyName = (property: ObjectExpression["properties"][number]): string | undefined => {
  if (property.type !== "Property") return undefined;
  if (property.key.type === "Identifier" && !property.computed) return property.key.name;
  // A quoted key's raw text is a string literal, `"x-y"`, whose value is the name.
  if (property.key.type === "Literal" && /^["']/.test(property.key.raw ?? ""))
    return String(property.key.value);
  return undefined;
};

/**
 * The option keys in a module's `config`, with the path each sets. The walk follows what a module
 * returns: through `define`, `mkIf` and the other helpers, which keep the path, and into nested
 * objects, which extend it.
 */
const occurrences = (source: string): ReadonlyArray<Occurrence> => {
  const { program } = parseSync("module.ts", source);
  const found: Array<Occurrence> = [];
  const visit = (node: Node | null | undefined, path: ReadonlyArray<string>): void => {
    if (node === null || node === undefined) return;
    switch (node.type) {
      case "ObjectExpression":
        for (const property of node.properties) {
          const name = keyName(property);
          if (name === undefined || property.type !== "Property") continue;
          found.push({ path: [...path, name], start: property.key.start, end: property.key.end });
          visit(property.value, [...path, name]);
        }
        return;
      case "CallExpression":
        return node.arguments.forEach((argument) => visit(argument, path));
      case "ArrayExpression":
        return node.elements.forEach((element) => visit(element, path));
      case "ConditionalExpression":
        visit(node.consequent, path);
        return visit(node.alternate, path);
      case "ParenthesizedExpression":
      case "TSAsExpression":
      case "TSSatisfiesExpression":
        return visit(node.expression, path);
      case "ArrowFunctionExpression":
      case "FunctionExpression":
        return visit(node.body, path);
      case "BlockStatement":
        return node.body.forEach((statement) => visit(statement, path));
      case "ReturnStatement":
        return visit(node.argument, path);
      case "IfStatement":
        visit(node.consequent, path);
        return visit(node.alternate, path);
      default:
        return;
    }
  };
  // `X.module({ config })`: the module's definitions start at the configuration's root.
  new Visitor({
    CallExpression: (node) => {
      if (
        node.callee.type !== "MemberExpression" ||
        node.callee.property.type !== "Identifier" ||
        node.callee.property.name !== "module"
      )
        return;
      const [definitions] = node.arguments;
      if (definitions?.type !== "ObjectExpression") return;
      for (const property of definitions.properties)
        if (property.type === "Property" && keyName(property) === "config")
          visit(property.value, []);
    },
  }).visit(program);
  return found;
};

export interface Renamed {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rename: Rename;
  /** Whether only the last name changes, which `--fix` rewrites in place. */
  readonly fixable: boolean;
}

const sameParent = ({ from, to }: Rename) =>
  from.length === to.length && from.slice(0, -1).every((name, i) => name === to[i]);

const identifier = (name: string) =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);

export interface Rewritten {
  /** Where the module sets a renamed option. */
  readonly found: ReadonlyArray<Omit<Renamed, "file">>;
  /** The module with each rename that only changes the last name applied. */
  readonly fixed: string;
}

/** Finds the renamed options a module's source sets, and rewrites the keys `--fix` can. */
export const rewrite = (source: string, list: ReadonlyArray<Rename>): Rewritten => {
  const byPath = new Map(list.map((rename) => [rename.from.join("."), rename]));
  const hits = occurrences(source).flatMap((occurrence) => {
    const rename = byPath.get(occurrence.path.join("."));
    return rename === undefined ? [] : [{ occurrence, rename }];
  });
  const found = hits.map(({ occurrence, rename }) => {
    const before = source.slice(0, occurrence.start).split("\n");
    return {
      line: before.length,
      column: (before.at(-1)?.length ?? 0) + 1,
      rename,
      fixable: sameParent(rename),
    };
  });
  // From the end, so earlier offsets stay valid.
  const fixed = hits
    .filter(({ rename }) => sameParent(rename))
    .toSorted((a, b) => b.occurrence.start - a.occurrence.start)
    .reduce(
      (text, { occurrence, rename }) =>
        `${text.slice(0, occurrence.start)}${identifier(rename.to.at(-1) ?? "")}${text.slice(occurrence.end)}`,
      source,
    );
  return { found, fixed };
};

/** Renamed options the modules set, and, with `fix`, the renames that only change a key, applied. */
const renamed = (
  root: string,
  modules: ReadonlyArray<string>,
  list: ReadonlyArray<Rename>,
  fix: boolean,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const found: Array<Renamed> = [];
    for (const module of modules) {
      const file = path.join(root, module);
      const source = yield* fs.readFileString(file);
      const result = rewrite(source, list);
      found.push(...result.found.map((hit) => ({ ...hit, file: module })));
      if (fix && result.fixed !== source) yield* fs.writeFileString(file, result.fixed);
    }
    return found;
  });

export interface Options {
  readonly root: string;
  readonly flake: string;
  readonly configurations: ReadonlyArray<string>;
  /** Inputs to update; all of them when empty. */
  readonly inputs: ReadonlyArray<string>;
  /** Rewrite renamed options whose last name is all that changed. */
  readonly fix: boolean;
  /** Keep the update when no module breaks: write `flake.lock` and move the new types into place. */
  readonly apply: boolean;
}

export interface Report {
  readonly changes: ReadonlyArray<Change>;
  /** Errors the modules have with the updated inputs and not with the current ones. */
  readonly errors: ReadonlyArray<Diagnostic>;
  readonly renamed: ReadonlyArray<Renamed>;
  readonly applied: boolean;
}

/**
 * Updates the flake's inputs into a separate lock file, probes the configurations against it, and
 * typechecks every module against the types the update would bring, before anything changes.
 */
export const bump = (options: Options) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(options.root);
    const next = path.join(root, ".typeflake/next");
    yield* fs.remove(next, { recursive: true }).pipe(Effect.ignore);
    yield* fs.makeDirectory(next, { recursive: true });
    const lockFile = path.join(next, "flake.lock");
    const update = yield* run(
      "nix",
      [
        "flake",
        "update",
        ...options.inputs,
        "--flake",
        options.flake,
        "--output-lock-file",
        lockFile,
      ],
      root,
    );
    if (update.exitCode !== 0)
      return yield* UpdateFailed.make({ command: "nix flake update", output: update.output });

    // A flake given as `path:dir`, which a flake in a git checkout needs for untracked files.
    const current = path.join(root, options.flake.replace(/^path:/, ""), "flake.lock");
    const changed = yield* changes(
      yield* fs.readFileString(current),
      yield* fs.readFileString(lockFile),
    );
    const modules = yield* Project.moduleFiles(root);
    const before = yield* check(root, path.join(root, ".typeflake"), modules);
    const { renames } = yield* Project.types(root, options.flake, options.configurations, {
      lockFile,
      outDir: ".typeflake/next",
    });
    const known = new Set(
      before.map((found) => `${found.file}:${found.line}:${found.code}:${found.message}`),
    );
    const errors = (yield* check(root, next, modules)).filter(
      (found) => !known.has(`${found.file}:${found.line}:${found.code}:${found.message}`),
    );
    const found = yield* renamed(root, modules, renames, options.fix);

    const applied = options.apply && errors.length === 0;
    if (applied) {
      yield* fs.copyFile(lockFile, current);
      yield* fs.remove(lockFile);
      const directory = path.join(root, ".typeflake");
      yield* fs.remove(path.join(directory, "files"), { recursive: true }).pipe(Effect.ignore);
      for (const entry of yield* fs.readDirectory(next))
        yield* fs.rename(path.join(next, entry), path.join(directory, entry));
      yield* fs.remove(next, { recursive: true });
    }
    return { changes: changed, errors, renamed: found, applied } satisfies Report;
  });
