import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { NixCheckFailed } from "./errors.ts";
import { runCommandExitCode } from "./process.ts";
import { sync, type SyncOptions } from "./sync.ts";

export interface CheckOptions extends SyncOptions {
  readonly noBuild?: boolean;
}

export const check = (options: CheckOptions) =>
  Effect.gen(function* () {
    yield* sync(options);

    const target = yield* prepareFlakeTarget(options.output);
    yield* runNixFlakeCheck(target, options.noBuild ?? true);
  });

const prepareFlakeTarget = (output: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const outputPath = path.resolve(output);

    if (path.basename(outputPath) === "flake.nix") {
      return path.dirname(outputPath);
    }

    const directory = yield* fs.makeTempDirectory({ prefix: "typeflake-check-" });
    yield* fs.copyFile(outputPath, path.join(directory, "flake.nix"));
    return directory;
  });

const runNixFlakeCheck = (target: string, noBuild: boolean) =>
  Effect.gen(function* () {
    const args = noBuild ? ["flake", "check", "--no-build", target] : ["flake", "check", target];
    const exitCode = yield* runCommandExitCode({
      args,
      command: "nix",
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });

    if (exitCode !== 0) {
      return yield* new NixCheckFailed({ exitCode, target });
    }

    return undefined;
  });
