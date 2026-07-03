import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { fileURLToPath } from "node:url";
import {
  defaultHomeManagerOptionPaths,
  defaultNixOSOptionPaths,
  flakeInput,
  generateOptionTypeFile,
  generateOptionTypes,
  renderOptionProbeExpression,
  type OptionIR,
  type OptionPath,
  type OptionScope,
} from "../src/index.ts";
import { runCommandString } from "../src/process.ts";
import fixture from "./fixtures/options/pinned-subset.json" with { type: "json" };

const generatedOptionsPath = fileURLToPath(new URL("../src/generated/options.ts", import.meta.url));

const fixtureOptions: readonly OptionIR[] = [...fixture.nixos, ...fixture.homeManager].map(
  (option) => ({
    declarations: option.declarations,
    defaultText: option.defaultText,
    description: option.description,
    exampleText: option.exampleText,
    internal: option.internal,
    path: toOptionPath(option.path),
    readOnly: option.readOnly,
    scope: toOptionScope(option.scope),
    type: option.type,
    visible: toVisible(option.visible),
  }),
);

describe("option bridge", () => {
  it.effect(
    "evaluates pinned NixOS and Home Manager options through the Nix probe",
    () =>
      Effect.gen(function* () {
        const expression = renderOptionProbeExpression({
          homeManager: flakeInput("home-manager"),
          homeManagerOptions: { optionPaths: defaultHomeManagerOptionPaths },
          nixosOptions: { optionPaths: defaultNixOSOptionPaths },
          nixpkgs: flakeInput("nixpkgs"),
          system: "x86_64-linux",
        });

        const output = yield* runCommandString({
          args: ["eval", "--impure", "--json", "--expr", expression],
          command: "nix",
        });

        assert.deepEqual(JSON.parse(output), fixture);
      }).pipe(Effect.provide(NodeServices.layer)),
    30_000,
  );

  it.effect("generates TypeScript option declarations from option metadata", () =>
    Effect.sync(() => {
      const nixosTypes = generateOptionTypes({
        importPath: "../nix/expr.ts",
        options: fixtureOptions,
        rootTypeName: "NixOSGeneratedConfig",
        scope: "nixos",
      });
      const homeTypes = generateOptionTypes({
        importPath: "../nix/expr.ts",
        options: fixtureOptions,
        rootTypeName: "HomeManagerGeneratedConfig",
        scope: "home-manager",
      });

      assert.match(nixosTypes, /readonly services\?:/);
      assert.match(nixosTypes, /readonly enable\?: NixOptionValue<boolean>/);
      assert.match(nixosTypes, /readonly systemPackages\?: NixOptionValue<readonly NixInput\[]>/);
      assert.match(
        homeTypes,
        /readonly stateVersion\?: NixOptionValue<\s+\| "18\.09"\s+\| "19\.03"/,
      );
      assert.match(homeTypes, /readonly git\?:/);
    }),
  );

  it.effect("keeps the generated option fixture in sync with the generator", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const generated = generateOptionTypeFile({
        fixtureScope: "pinned nixpkgs/Home Manager option subset.",
        importPath: "../nix/expr.ts",
        options: fixtureOptions,
        roots: [
          { rootTypeName: "NixOSGeneratedConfig", scope: "nixos" },
          { rootTypeName: "HomeManagerGeneratedConfig", scope: "home-manager" },
        ],
      });

      assert.equal(yield* fs.readFileString(generatedOptionsPath), generated);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

function toOptionPath(path: readonly string[]): OptionPath {
  const [first, ...rest] = path;
  if (first === undefined) {
    throw new Error("Option paths must contain at least one segment");
  }

  return [first, ...rest];
}

function toOptionScope(scope: string): OptionScope {
  switch (scope) {
    case "home-manager":
    case "nixos":
      return scope;
    default:
      throw new Error(`Unexpected option scope: ${scope}`);
  }
}

function toVisible(visible: boolean | string): OptionIR["visible"] {
  if (visible === true || visible === false || visible === "shallow") return visible;

  throw new Error(`Unexpected option visibility: ${visible}`);
}
