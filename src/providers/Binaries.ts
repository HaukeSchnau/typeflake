import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Ast from "../Ast.ts";
import * as Nix from "../Nix.ts";
import * as Provider from "../Provider.ts";
import { property } from "../Typegen.ts";

/** Where store paths are listed when this machine doesn't have them. */
const cache = "https://cache.nixos.org/";

const StorePaths = Schema.Record(Schema.String, Schema.String);
const Listing = Schema.fromJsonString(
  Schema.Struct({ entries: Schema.Record(Schema.String, Schema.Unknown) }),
);

/** `pkgs.<name>` in the project's Nix, including what modules rendered. */
const referenced = (context: Provider.Context) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = new Set<string>();
    for (const file of context.nixFiles) {
      const source = yield* fs
        .readFileString(`${context.root}/${file}`)
        .pipe(Effect.orElseSucceed(() => ""));
      for (const [, name] of source.matchAll(/\bpkgs\.([A-Za-z_][\w'-]*)/g))
        if (name !== undefined) names.add(name);
    }
    return [...names].toSorted();
  });

/** The entries of `<path>/bin`: from the store when it has the path, else from the binary cache. */
const programs = (storePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const local = yield* fs.readDirectory(`${storePath}/bin`).pipe(Effect.option);
    if (local._tag === "Some") return local.value;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const listing = yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make("nix", ["store", "ls", "--store", cache, "--json", `${storePath}/bin`]),
        );
        const [stdout, exitCode] = yield* Effect.all(
          [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
          { concurrency: "unbounded" },
        );
        return exitCode === 0 ? stdout : "";
      }),
    );
    const decoded = yield* Schema.decodeEffect(Listing)(listing).pipe(Effect.option);
    return decoded._tag === "Some" ? Object.keys(decoded.value.entries) : undefined;
  }).pipe(Effect.orElseSucceed(() => undefined));

/**
 * The programs in each package a project's Nix uses, so `lib.getExe' pkgs.ripgrep "rgg"` fails. The
 * binary cache lists a store path's files without building it. A package neither the store nor the
 * cache has stays untyped.
 */
export const provider = Provider.make({
  name: "binaries",
  schema: StorePaths,
  nix: (context) =>
    referenced(context).pipe(
      Effect.map(
        (names) =>
          `configuration: let pkgs = configuration.pkgs or { }; in builtins.listToAttrs (builtins.concatMap (name: let path = builtins.tryEval (let value = pkgs.\${name}; in if builtins.isAttrs value && value ? outPath then toString value.outPath else null); in if path.success && path.value != null then [ { inherit name; value = path.value; } ] else [ ]) (builtins.filter (name: pkgs ? \${name}) ${Ast.print(Nix.toExpr(names)).trim()}))`,
      ),
      Effect.mapError((error) =>
        Provider.ProviderFailed.make({ provider: "binaries", reason: String(error) }),
      ),
    ),
  combine: (left, right) => ({ ...right, ...left }),
  provide: (paths) =>
    Effect.gen(function* () {
      const found = yield* Effect.forEach(
        Object.entries(paths),
        ([name, path]) => Effect.map(programs(path), (bin) => [name, bin] as const),
        { concurrency: 8 },
      );
      const lines = found.flatMap(([name, bin]) =>
        bin === undefined
          ? []
          : [
              `  readonly ${property(name)}: ${bin.length === 0 ? "never" : bin.map((program) => JSON.stringify(program)).join(" | ")}`,
            ],
      );
      if (lines.length === 0) return Provider.nothing;
      return {
        ...Provider.nothing,
        declarations: [`export interface Binaries {\n${lines.join("\n")}\n}`],
        register: [["binaries", "Binaries"]],
      };
    }),
});
