import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as Project from "./Project.ts";

let root = "";
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("moduleFiles", () => {
  it("skips node_modules and doesn't follow symlinks", async () => {
    root = mkdtempSync(join(tmpdir(), "typeflake-project-"));
    mkdirSync(join(root, "hosts/node_modules"), { recursive: true });
    writeFileSync(join(root, "hosts/server.nix.ts"), "");
    writeFileSync(join(root, "hosts/node_modules/dependency.nix.ts"), "");
    // A link back up, like pnpm's links between packages, would list the tree again at every level.
    symlinkSync("..", join(root, "hosts/up"));

    const files = await Effect.runPromise(
      Project.moduleFiles(root).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(files).toEqual(["hosts/server.nix.ts"]);
  });
});
