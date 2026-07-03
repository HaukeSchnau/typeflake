import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { OptionMetadataParseError, UnsupportedOptionsFound } from "../errors.ts";
import { runCommandString } from "../process.ts";
import {
  collectUnsupportedOptions,
  generateOptionTypeFile,
  type OptionTypeRoot,
} from "./generate.ts";
import type { OptionPath, OptionScope } from "./ir.ts";
import {
  defaultHomeManagerOptionPaths,
  defaultNixOSOptionPaths,
  projectFlakeInput,
  renderOptionProbeExpression,
  type OptionProbeOptions,
} from "./probe.ts";
import {
  makeOptionMetadataDocument,
  optionMetadataDocumentToJson,
  parseOptionMetadataDocument,
  parseOptionProbePayload,
  type OptionMetadataDocument,
} from "./document.ts";

export interface ProbeProjectOptions {
  readonly flake: string;
  readonly homeManagerInput: string;
  readonly homeManagerOptionPaths?: readonly OptionPath[];
  readonly nixosOptionPaths?: readonly OptionPath[];
  readonly nixpkgsInput: string;
  readonly output: string;
  readonly scopes: readonly OptionScope[];
  readonly system: string;
}

export interface GenerateProjectOptions {
  readonly input: string;
  readonly output: string;
  readonly strict?: boolean;
}

export const defaultOptionScopes = [
  "nixos",
  "home-manager",
] as const satisfies readonly OptionScope[];

export const probeProjectOptions = (options: ProbeProjectOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const flakeRoot = path.resolve(options.flake);
    const flakeReference = yield* resolveFlakeReference(flakeRoot);
    const scopes = normalizeScopes(options.scopes);
    const includesNixOS = scopes.includes("nixos");
    const includesHomeManager = scopes.includes("home-manager");

    const probeOptions: OptionProbeOptions = {
      nixpkgs: projectFlakeInput(flakeReference, options.nixpkgsInput),
      system: options.system,
      ...(includesHomeManager
        ? {
            homeManager: projectFlakeInput(flakeReference, options.homeManagerInput),
            homeManagerOptions: {
              optionPaths: options.homeManagerOptionPaths ?? defaultHomeManagerOptionPaths,
            },
          }
        : {}),
      ...(includesNixOS
        ? {
            nixosOptions: {
              optionPaths: options.nixosOptionPaths ?? defaultNixOSOptionPaths,
            },
          }
        : {}),
    };
    const expression = renderOptionProbeExpression(probeOptions);
    const output = yield* runCommandString({
      args: ["eval", "--impure", "--json", "--expr", expression],
      command: "nix",
    });
    const payload = yield* parseProbeOutput(output);
    const document = makeOptionMetadataDocument(
      {
        flake: flakeReference,
        homeManagerInput: includesHomeManager ? options.homeManagerInput : null,
        nixpkgsInput: options.nixpkgsInput,
        scopes,
        system: options.system,
      },
      payload,
    );
    const outputPath = path.resolve(options.output);

    yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
    yield* fs.writeFileString(outputPath, optionMetadataDocumentToJson(document));

    return document;
  });

export const generateProjectOptionTypes = (options: GenerateProjectOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const inputPath = path.resolve(options.input);
    const outputPath = path.resolve(options.output);
    const document = yield* readOptionMetadataDocument(inputPath);
    const unsupported = collectUnsupportedOptions(document.options);

    if (options.strict === true && unsupported.length > 0) {
      return yield* new UnsupportedOptionsFound({
        options: unsupported.map((option) => `${option.scope}:${option.path.join(".")}`),
      });
    }

    yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
    yield* fs.writeFileString(outputPath, renderGeneratedOptions(document));

    return { document, unsupported };
  });

export const readOptionMetadataDocument = (inputPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(inputPath);

    return yield* parseMetadataText(text, inputPath);
  });

export const renderGeneratedOptions = (document: OptionMetadataDocument): string =>
  generateOptionTypeFile({
    fixtureScope: `project-local ${document.source.scopes.join(" + ")} options from ${document.source.flake}.`,
    importPath: "typeflake",
    options: document.options,
    roots: rootsForScopes(document.source.scopes),
  });

export const resolveFlakeReference = (flakeRoot: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const gitRoot = yield* findGitRoot(flakeRoot);
    if (gitRoot === null) return `path:${flakeRoot}`;

    const relative = path.relative(gitRoot, flakeRoot);
    const base = `git+file://${gitRoot}`;
    if (relative === "") return base;

    return `${base}?dir=${encodeFlakeDir(relative, path.sep)}`;
  });

const rootsForScopes = (scopes: readonly OptionScope[]): readonly OptionTypeRoot[] =>
  normalizeScopes(scopes).map((scope) =>
    scope === "nixos"
      ? { rootTypeName: "NixOSGeneratedConfig", scope }
      : { rootTypeName: "HomeManagerGeneratedConfig", scope },
  );

const normalizeScopes = (scopes: readonly OptionScope[]): readonly OptionScope[] => {
  const normalized = [...new Set(scopes)];
  return normalized.length === 0 ? defaultOptionScopes : normalized;
};

const findGitRoot = (start: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let current = path.resolve(start);

    while (true) {
      if (yield* fs.exists(path.join(current, ".git"))) return current;

      const parent = path.dirname(current);
      if (parent === current) return null;

      current = parent;
    }
  });

const encodeFlakeDir = (relative: string, separator: string): string =>
  relative.split(separator).map(encodeURIComponent).join("/");

const parseProbeOutput = (text: string) =>
  Effect.try({
    try: () => parseOptionProbePayload(JSON.parse(text)),
    catch: (cause) => new OptionMetadataParseError({ cause }),
  });

const parseMetadataText = (text: string, path: string) =>
  Effect.try({
    try: () => parseOptionMetadataDocument(JSON.parse(text)),
    catch: (cause) => new OptionMetadataParseError({ cause, path }),
  });
