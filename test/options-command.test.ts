import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { fileURLToPath } from "node:url";
import { UnsupportedOptionsFound } from "../src/errors.ts";
import {
  generateProjectOptionTypes,
  optionMetadataDocumentToJson,
  probeProjectOptions,
  resolveFlakeReference,
  type OptionIR,
  type OptionMetadataDocument,
} from "../src/index.ts";

const fixtureFlakePath = fileURLToPath(new URL("./fixtures/project-flake", import.meta.url));

describe("project-local option generation commands", () => {
  it.effect("resolves nested fixture flakes through the containing git repository", () =>
    Effect.gen(function* () {
      const reference = yield* resolveFlakeReference(fixtureFlakePath);

      assert.match(reference, /^git\+file:\/\/.+typeflake\?dir=test\/fixtures\/project-flake$/);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("probes a project flake with non-default input names and generates types", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectory({ prefix: "typeflake-options-" });
      const metadataPath = path.join(directory, "options.json");
      const generatedPath = path.join(directory, "options.ts");

      const document = yield* probeProjectOptions({
        flake: fixtureFlakePath,
        homeManagerInput: "fixture-home-manager",
        nixpkgsInput: "fixture-nixpkgs",
        output: metadataPath,
        scopes: ["nixos", "home-manager"],
        system: "x86_64-linux",
      });

      assert.equal(document.source.nixpkgsInput, "fixture-nixpkgs");
      assert.equal(document.source.homeManagerInput, "fixture-home-manager");
      assert.deepEqual(document.source.scopes, ["home-manager", "nixos"]);
      assert.ok(hasOption(document.options, "nixos", ["services", "nginx", "enable"]));
      assert.ok(hasOption(document.options, "home-manager", ["home", "packages"]));

      const { unsupported } = yield* generateProjectOptionTypes({
        input: metadataPath,
        output: generatedPath,
      });
      const generated = yield* fs.readFileString(generatedPath);

      assert.equal(unsupported.length, 0);
      assert.match(generated, /import type \{ NixExpr, NixInput \} from "typeflake"/);
      assert.match(generated, /readonly allowedTCPPorts\?: NixOptionValue<readonly number\[]>/);
      assert.match(generated, /readonly packages\?: NixOptionValue<readonly NixInput\[]>/);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fails clearly in strict mode when option shapes remain unsupported", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectory({ prefix: "typeflake-options-strict-" });
      const metadataPath = path.join(directory, "options.json");
      const generatedPath = path.join(directory, "options.ts");

      yield* fs.writeFileString(metadataPath, optionMetadataDocumentToJson(unsupportedDocument));

      const error = yield* Effect.flip(
        generateProjectOptionTypes({
          input: metadataPath,
          output: generatedPath,
          strict: true,
        }),
      );

      assert.ok(error instanceof UnsupportedOptionsFound);
      assert.deepEqual(error.options, ["nixos:services.mystery.enable"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

const unsupportedDocument: OptionMetadataDocument = {
  options: [
    {
      declarations: [],
      defaultText: null,
      description: "A deliberately unknown fixture option.",
      exampleText: null,
      internal: false,
      path: ["services", "mystery", "enable"],
      readOnly: false,
      scope: "nixos",
      type: {
        description: "mystery value",
        name: "mystery",
        nestedTypes: {},
      },
      visible: true,
    },
  ],
  source: {
    flake: "git+file:///fixture",
    homeManagerInput: null,
    nixpkgsInput: "fixture-nixpkgs",
    scopes: ["nixos"],
    system: "x86_64-linux",
  },
  version: 1,
};

const hasOption = (
  options: readonly OptionIR[],
  scope: OptionIR["scope"],
  path: readonly string[],
): boolean =>
  options.some((option) => option.scope === scope && option.path.join(".") === path.join("."));
