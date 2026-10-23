#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Project from "./Project.ts";

const root = Flag.String("root").pipe(
  Flag.withDescription("The project directory"),
  Flag.withDefault("."),
);

const render = Command.make(
  "render",
  {
    root,
    check: Flag.Boolean("check").pipe(
      Flag.withDescription("Fail when a rendered file is out of date instead of writing it"),
      Flag.withDefault(false),
    ),
  },
  ({ root, check }) =>
    Effect.gen(function* () {
      const rendered = yield* Project.renderAll(root);
      if (check) {
        yield* Project.check(root, rendered);
        return yield* Console.log(`${rendered.length} rendered files are up to date`);
      }
      yield* Project.write(root, rendered);
      yield* Console.log(
        rendered.map(({ file }) => `rendered ${file}`).join("\n") || "no *.nix.ts modules found",
      );
    }),
).pipe(Command.withDescription("Render every *.nix.ts module to the .nix file next to it"));

const types = Command.make(
  "types",
  {
    root,
    flake: Flag.String("flake").pipe(
      Flag.withDescription("The flake whose configurations to probe"),
      Flag.withDefault("."),
    ),
    configurations: Argument.String("configuration").pipe(
      Argument.withDescription("A flake output such as nixosConfigurations.srv-2"),
      Argument.atLeast(1),
    ),
  },
  ({ root, flake, configurations }) =>
    Project.types(root, flake, configurations).pipe(
      Effect.flatMap((registered) => Console.log(`wrote .typeflake/ for ${registered.join(", ")}`)),
    ),
).pipe(
  Command.withDescription(
    "Probe configurations' options and generate their types into .typeflake/",
  ),
);

const PackageJson = Schema.fromJsonString(Schema.Struct({ version: Schema.String }));

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { version } = yield* Schema.decodeEffect(PackageJson)(
    yield* fs.readFileString(new URL("../package.json", import.meta.url).pathname),
  );
  yield* Command.run(Command.make("typeflake").pipe(Command.withSubcommands([render, types])), {
    version,
  });
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
