import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { FlakeImportError, TypeScriptCheckFailed } from "./errors.ts";
import { type FlakeModule, renderFlake, resolveFlakeSpec } from "./flake.ts";
import { runCommandExitCode } from "./process.ts";
import { tsgoCommand } from "./tooling.ts";

export interface SyncOptions {
  readonly input: string;
  readonly output: string;
  readonly project?: string;
}

export const sync = (options: SyncOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const inputPath = path.resolve(options.input);
    const outputPath = path.resolve(options.output);
    const moduleUrl = yield* path.toFileUrl(inputPath);

    yield* runTypeScriptCheck(options.project ?? "tsconfig.json");

    const loaded = yield* loadFlakeModule(moduleUrl);
    const spec = yield* resolveFlakeSpec(loaded.default);
    const rendered = renderFlake(spec);

    yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
    yield* fs.writeFileString(outputPath, rendered);
  });

const loadFlakeModule = (moduleUrl: URL) =>
  Effect.gen(function* () {
    const cacheBust = yield* Clock.currentTimeMillis;
    const specifier = `${moduleUrl.href}?typeflake=${cacheBust}`;

    return yield* Effect.tryPromise({
      try: () => importFlakeModule(specifier),
      catch: (cause) => new FlakeImportError({ cause, specifier }),
    });
  });

const importFlakeModule: (specifier: string) => Promise<FlakeModule> = (specifier) =>
  import(specifier);

const runTypeScriptCheck = (project: string) =>
  Effect.gen(function* () {
    const exitCode = yield* runCommandExitCode({
      args: ["--noEmit", "--project", project],
      command: tsgoCommand(),
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });

    if (exitCode !== 0) {
      return yield* new TypeScriptCheckFailed({ exitCode, project });
    }

    return undefined;
  });
