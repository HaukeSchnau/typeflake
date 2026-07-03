import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { initProject, renderInitSummary } from "../src/index.ts";

describe("typeflake init", () => {
  it.effect("creates an idempotent consumer project skeleton", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectory({ prefix: "typeflake-init-" });

      const first = yield* initProject({
        directory,
        packageManager: "pnpm",
      });
      const second = yield* initProject({
        directory,
        packageManager: "pnpm",
      });

      assert.deepEqual(first.created, [
        "package.json",
        "tsconfig.json",
        "flake.ts",
        ".typeflake/options.ts",
      ]);
      assert.deepEqual(second.created, []);
      assert.deepEqual(second.skipped, first.created);

      assert.match(yield* fs.readFileString(path.join(directory, "flake.ts")), /NixOSOptions/);
      assert.match(
        yield* fs.readFileString(path.join(directory, ".typeflake/options.ts")),
        /namespace NixOSOptions/,
      );
      assert.match(
        yield* fs.readFileString(path.join(directory, "package.json")),
        /typeflake options probe --scope nixos/,
      );
      assert.match(renderInitSummary(second, directory), /Skipped existing files:/);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("overwrites starter files when force is explicit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectory({ prefix: "typeflake-init-force-" });
      const flakePath = path.join(directory, "flake.ts");

      yield* initProject({ directory, packageManager: "npm" });
      yield* fs.writeFileString(flakePath, "custom");

      const result = yield* initProject({
        directory,
        force: true,
        packageManager: "npm",
      });

      assert.ok(result.created.includes("flake.ts"));
      assert.notEqual(yield* fs.readFileString(flakePath), "custom");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
