import * as Effect from "effect/Effect";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderFlake, resolveFlakeSpec } from "./flake.ts";

export interface SyncOptions {
  readonly input: string;
  readonly output: string;
}

export const sync = (options: SyncOptions): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const inputPath = resolve(options.input);
      const outputPath = resolve(options.output);
      const moduleUrl = pathToFileURL(inputPath);

      const loaded = (await import(`${moduleUrl.href}?typeflake=${Date.now()}`)) as {
        readonly default?: unknown;
      };
      const spec = await resolveFlakeSpec(loaded.default);
      const rendered = renderFlake(spec);

      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, rendered);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });
