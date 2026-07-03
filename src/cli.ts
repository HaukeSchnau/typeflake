#!/usr/bin/env nub

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";
import { check } from "./check.ts";
import { doctor, renderDoctorReport } from "./doctor.ts";
import { DoctorFailed } from "./errors.ts";
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
  Command.withSubcommands([syncCommand, checkCommand, doctorCommand]),
);

Command.run(command, { version }).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
