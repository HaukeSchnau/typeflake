import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { decodeOptionTree } from "./Probe.ts";

const probeFile = fileURLToPath(new URL("./probe.nix", import.meta.url));
const lockFile = fileURLToPath(new URL("../flake.lock", import.meta.url));

const Locked = Schema.fromJsonString(
  Schema.Struct({
    nodes: Schema.Struct({
      nixpkgs: Schema.Struct({
        locked: Schema.Struct({
          owner: Schema.String,
          repo: Schema.String,
          rev: Schema.String,
          narHash: Schema.String,
        }),
      }),
    }),
  }),
);

/** Probes the options of `module`, evaluated with the lib of the nixpkgs this repository locks. */
const probe = (module: string) => {
  const { owner, repo, rev, narHash } = Schema.decodeSync(Locked)(readFileSync(lockFile, "utf8"))
    .nodes.nixpkgs.locked;
  const nixpkgs = `builtins.fetchTree { type = "github"; owner = "${owner}"; repo = "${repo}"; rev = "${rev}"; narHash = "${narHash}"; }`;
  const json = execFileSync(
    "nix",
    [
      "eval",
      "--impure",
      "--json",
      "--expr",
      `let lib = import ((${nixpkgs}) + "/lib"); in import ${probeFile} { class = "nixos"; } (lib.evalModules { modules = [ (${module}) ]; }).options`,
    ],
    { encoding: "utf8" },
  );
  return Effect.runSync(decodeOptionTree(json));
};

// The first evaluation fetches the locked nixpkgs when the store lacks it, as on a fresh CI worker.
describe("probe.nix", { timeout: 120_000 }, () => {
  it("records an option that throws as unknown and keeps its siblings", () => {
    const tree = probe(`{ lib, ... }: {
      options.fine = lib.mkOption { type = lib.types.bool; };
      options.broken = lib.mkOption { type = throw "needs pkgs"; };
    }`);
    expect(tree["fine"]).toMatchObject({ type: { name: "bool" } });
    expect(tree["broken"]).toMatchObject({ type: { name: "unknown", truncated: true } });
  });

  it("keeps the rest of a submodule when one of its options throws", () => {
    const tree = probe(`{ lib, ... }: {
      options.users = lib.mkOption {
        type = lib.types.attrsOf (lib.types.submodule {
          options.port = lib.mkOption { type = lib.types.port; };
          options.settings = lib.mkOption { type = throw "needs pkgs"; };
        });
      };
    }`);
    expect(tree["users"]).toMatchObject({
      type: {
        nested: {
          elemType: {
            options: {
              port: { type: { name: "unsignedInt16" } },
              settings: { type: { name: "unknown" } },
            },
          },
        },
      },
    });
  });
});
