import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

interface CommandResult {
  readonly stdout: string;
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repoRoot = process.cwd();
  const tarball = yield* pack(repoRoot);
  const workspace = yield* fs.makeTempDirectory({
    directory: tmpdir(),
    prefix: "typeflake-package-smoke-",
  });

  yield* Effect.acquireUseRelease(
    Effect.succeed({ tarball, workspace }),
    ({ tarball: packedTarball, workspace: smokeWorkspace }) =>
      runPackageSmoke(smokeWorkspace, packedTarball),
    ({ tarball: packedTarball, workspace: smokeWorkspace }) =>
      Effect.all(
        [
          fs.remove(smokeWorkspace, { recursive: true }),
          fs.remove(packedTarball).pipe(Effect.ignore),
        ],
        { concurrency: 2 },
      ),
  );

  yield* Effect.sync(() => path.basename(tarball));
});

const runPackageSmoke = (workspace: string, tarball: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const typeflake = path.join(workspace, "node_modules/.bin/typeflake");

    yield* run("npm", ["init", "-y"], { cwd: workspace, quiet: true });
    yield* run("npm", ["pkg", "set", "type=module"], { cwd: workspace, quiet: true });
    yield* run("npm", ["install", "--save-dev", tarball], { cwd: workspace, quiet: true });
    yield* run(typeflake, ["init", "--package-manager", "npm"], { cwd: workspace });

    const secondInit = yield* run(typeflake, ["init", "--package-manager", "npm"], {
      capture: true,
      cwd: workspace,
    });

    assertIncludes(secondInit.stdout, "Skipped existing files:");
    assertIncludes(yield* fs.readFileString(path.join(workspace, "flake.ts")), 'from "typeflake"');
    assertIncludes(
      yield* fs.readFileString(path.join(workspace, ".typeflake/options.ts")),
      "NixOSOptions",
    );

    yield* run(typeflake, ["--version"], { cwd: workspace });
    yield* run("node", ["-e", packageImportCheck], { cwd: workspace });
    yield* run(
      path.join(workspace, "node_modules/.bin/tsgo"),
      ["--noEmit", "--project", "tsconfig.json"],
      { cwd: workspace },
    );
    yield* run(typeflake, ["sync", "--output", "flake.generated.nix"], { cwd: workspace });
    assertIncludes(
      yield* fs.readFileString(path.join(workspace, "flake.generated.nix")),
      "nixosConfigurations",
    );
  });

const pack = (repoRoot: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const result = yield* run("npm", ["pack", "--json", "--ignore-scripts"], {
      capture: true,
      cwd: repoRoot,
    });
    const filename = parsePackFilename(result.stdout);

    return path.join(repoRoot, filename);
  });

const run = (
  command: string,
  args: readonly string[],
  options: {
    readonly capture?: boolean;
    readonly cwd: string;
    readonly quiet?: boolean;
  },
) =>
  Effect.sync(() => {
    const result = spawnSync(command, [...args], {
      cwd: options.cwd,
      encoding: "utf8",
      stdio: options.capture ? "pipe" : options.quiet === true ? "ignore" : "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
    }

    return {
      stdout: result.stdout ?? "",
    } satisfies CommandResult;
  });

const parsePackFilename = (stdout: string): string => {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error("npm pack did not return an array");
  }

  const first: unknown = parsed.at(0);
  if (!isRecord(first) || typeof first.filename !== "string") {
    throw new Error("npm pack did not return a filename");
  }

  return first.filename;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const assertIncludes = (content: string, expected: string): void => {
  if (!content.includes(expected)) {
    throw new Error(`Expected content to include ${JSON.stringify(expected)}`);
  }
};

const packageImportCheck =
  'import("typeflake").then((m) => console.log(Boolean(m.Flake), Boolean(m.NixOS), Boolean(m.initProject)))';

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
