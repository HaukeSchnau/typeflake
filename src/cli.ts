#!/usr/bin/env nub

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";
import { check } from "./check.ts";
import { doctor, renderDoctorReport } from "./doctor.ts";
import { DoctorFailed } from "./errors.ts";
import {
  defaultOptionScopes,
  generateProjectOptionTypes,
  probeProjectOptions,
  type OptionScope,
} from "./options.ts";
import { sync } from "./sync.ts";
import packageJson from "../package.json" with { type: "json" };

const { version } = packageJson;

const flakeFileFlags = {
  input: Flag.string("input").pipe(
    Flag.withAlias("i"),
    Flag.withDescription("TypeScript flake entrypoint"),
    Flag.withDefault("flake.ts"),
  ),
  output: Flag.string("output").pipe(
    Flag.withAlias("o"),
    Flag.withDescription("Generated Nix flake path"),
    Flag.withDefault("flake.nix"),
  ),
};

const syncCommand = Command.make("sync", flakeFileFlags, (options) =>
  sync(options).pipe(Effect.flatMap(() => Console.log(`Generated ${options.output}`))),
).pipe(Command.withDescription("Generate a Nix flake from flake.ts"));

const checkCommand = Command.make("check", flakeFileFlags, (options) => check(options)).pipe(
  Command.withDescription("Generate a Nix flake and run nix flake check"),
);

const optionScopeFlag = Flag.choice("scope", ["nixos", "home-manager"]).pipe(
  Flag.atLeast(0),
  Flag.withDescription("Option scope to probe; repeat for multiple scopes"),
);

const optionsProbeCommand = Command.make(
  "probe",
  {
    flake: Flag.string("flake").pipe(
      Flag.withDescription("Project flake root used for locked option metadata"),
      Flag.withDefault("."),
    ),
    homeManagerInput: Flag.string("home-manager-input").pipe(
      Flag.withDescription("Home Manager input name in the project flake"),
      Flag.withDefault("home-manager"),
    ),
    nixpkgsInput: Flag.string("nixpkgs-input").pipe(
      Flag.withDescription("nixpkgs input name in the project flake"),
      Flag.withDefault("nixpkgs"),
    ),
    output: Flag.string("output").pipe(
      Flag.withAlias("o"),
      Flag.withDescription("Stable option metadata JSON output path"),
      Flag.withDefault(".typeflake/options.json"),
    ),
    scope: optionScopeFlag,
    system: Flag.string("system").pipe(
      Flag.withDescription("Nix system used while evaluating option metadata"),
      Flag.withDefault("x86_64-linux"),
    ),
  },
  (options) =>
    probeProjectOptions({
      flake: options.flake,
      homeManagerInput: options.homeManagerInput,
      nixpkgsInput: options.nixpkgsInput,
      output: options.output,
      scopes: normalizeCliScopes(options.scope),
      system: options.system,
    }).pipe(
      Effect.flatMap((document) =>
        Console.log(`Wrote ${document.options.length} option records to ${options.output}`),
      ),
    ),
).pipe(Command.withDescription("Probe project-local pinned Nix option metadata"));

const optionsGenerateCommand = Command.make(
  "generate",
  {
    input: Flag.string("input").pipe(
      Flag.withAlias("i"),
      Flag.withDescription("Stable option metadata JSON input path"),
      Flag.withDefault(".typeflake/options.json"),
    ),
    output: Flag.string("output").pipe(
      Flag.withAlias("o"),
      Flag.withDescription("Generated TypeScript option type output path"),
      Flag.withDefault(".typeflake/options.ts"),
    ),
    strict: Flag.boolean("strict").pipe(
      Flag.withDescription("Fail when generated types contain unsupported option shapes"),
    ),
  },
  (options) =>
    generateProjectOptionTypes(options).pipe(
      Effect.flatMap(({ document, unsupported }) =>
        Console.log(
          `Wrote ${document.options.length} option types to ${options.output}` +
            renderUnsupportedSummary(unsupported.length),
        ),
      ),
    ),
).pipe(Command.withDescription("Generate TypeScript option types from probed metadata"));

const optionsCommand = Command.make("options").pipe(
  Command.withDescription("Probe and generate project-local option types"),
  Command.withSubcommands([optionsProbeCommand, optionsGenerateCommand]),
);

const doctorCommand = Command.make(
  "doctor",
  {
    project: Flag.string("project").pipe(
      Flag.withDescription("TypeScript project checked before loading flake.ts"),
      Flag.withDefault("tsconfig.json"),
    ),
  },
  (options) =>
    Effect.gen(function* () {
      const report = yield* doctor(options);
      yield* Console.log(renderDoctorReport(report));

      if (!report.ok) {
        return yield* new DoctorFailed({
          failedChecks: report.checks
            .filter((doctorCheck) => !doctorCheck.ok)
            .map((doctorCheck) => doctorCheck.name),
        });
      }

      return undefined;
    }),
).pipe(Command.withDescription("Check local Typeflake tooling and compiler health"));

const command = Command.make("typeflake").pipe(
  Command.withDescription("TypeScript and Effect authoring for real Nix flakes"),
  Command.withSubcommands([syncCommand, checkCommand, doctorCommand, optionsCommand]),
);

const normalizeCliScopes = (scopes: readonly OptionScope[]): readonly OptionScope[] =>
  scopes.length === 0 ? defaultOptionScopes : scopes;

const renderUnsupportedSummary = (count: number): string =>
  count === 0 ? "" : ` (${count} unsupported option shapes kept explicit)`;

Command.run(command, { version }).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
