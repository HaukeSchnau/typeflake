import * as Effect from "effect/Effect";
import { copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { sync, type SyncOptions } from "./sync.ts";

export interface CheckOptions extends SyncOptions {
  readonly noBuild?: boolean;
}

export const check = (options: CheckOptions): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    yield* sync(options);

    const target = yield* Effect.tryPromise({
      try: () => prepareFlakeTarget(options.output),
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    });

    yield* runNixFlakeCheck(target, options.noBuild ?? true);
  });

const prepareFlakeTarget = async (output: string): Promise<string> => {
  const outputPath = resolve(output);

  if (basename(outputPath) === "flake.nix") {
    return dirname(outputPath);
  }

  const directory = await mkdtemp(join(tmpdir(), "typeflake-check-"));
  await copyFile(outputPath, join(directory, "flake.nix"));
  return directory;
};

const runNixFlakeCheck = (target: string, noBuild: boolean): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolvePromise, reject) => {
        const args = ["flake", "check"];
        if (noBuild) args.push("--no-build");
        args.push(target);

        const child = spawn("nix", args, {
          stdio: "inherit",
        });

        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0) {
            resolvePromise();
            return;
          }

          reject(new Error(`nix flake check exited with code ${code ?? "unknown"}`));
        });
      }),
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });
