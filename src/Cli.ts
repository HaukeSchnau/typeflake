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
import { registerImports } from "./NixFile.ts";
import * as Bump from "./Bump.ts";
import * as Project from "./Project.ts";

// Modules import the `.nix` files they use; Node loads each as its path.
registerImports();

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
      Effect.flatMap(({ registered }) =>
        Console.log(`wrote .typeflake/ for ${registered.join(", ")}`),
      ),
    ),
).pipe(
  Command.withDescription(
    "Probe configurations' options and generate their types into .typeflake/",
  ),
);

const bump = Command.make(
  "bump",
  {
    root,
    flake: Flag.String("flake").pipe(
      Flag.withDescription("The flake whose inputs to update"),
      Flag.withDefault("."),
    ),
    input: Flag.String("input").pipe(
      Flag.withDescription("An input to update; all of them when left out"),
      Flag.atLeast(0),
    ),
    fix: Flag.Boolean("fix").pipe(
      Flag.withDescription("Rewrite renamed options whose last name is all that changed"),
      Flag.withDefault(false),
    ),
    apply: Flag.Boolean("apply").pipe(
      Flag.withDescription("Write flake.lock and the new types when no module breaks"),
      Flag.withDefault(false),
    ),
    configurations: Argument.String("configuration").pipe(
      Argument.withDescription("A flake output to probe, such as nixosConfigurations.srv-2"),
      Argument.atLeast(1),
    ),
  },
  ({ root, flake, input, fix, apply, configurations }) =>
    Effect.gen(function* () {
      const report = yield* Bump.bump({ root, flake, configurations, inputs: input, fix, apply });
      const lines = [
        report.changes.length === 0
          ? "No input changes."
          : report.changes
              .map((change) => `${change.input}  ${change.from} → ${change.to}`)
              .join("\n"),
        "",
        report.errors.length === 0
          ? "Every module typechecks against the update."
          : [
              `${report.errors.length} ${report.errors.length === 1 ? "error" : "errors"} the update brings:`,
              ...report.errors.map(
                (error) =>
                  `  ${error.file}:${error.line}:${error.column}  ${error.code}  ${error.message}`,
              ),
            ].join("\n"),
        ...(report.renamed.length === 0
          ? []
          : [
              "",
              `${report.renamed.length} renamed ${report.renamed.length === 1 ? "option" : "options"} in use:`,
              ...report.renamed.map(
                (found) =>
                  `  ${found.file}:${found.line}:${found.column}  ${found.rename.from.join(".")} → ${found.rename.to.join(".")}${found.fixable ? (fix ? "  (fixed)" : "  (--fix rewrites it)") : ""}`,
              ),
            ]),
        "",
        report.applied
          ? "Updated flake.lock and .typeflake/."
          : apply
            ? "Kept flake.lock: fix the errors first. The new types are in .typeflake/next/."
            : "Nothing changed. Run again with --apply to update flake.lock and .typeflake/.",
      ];
      yield* Console.log(lines.join("\n"));
      if (report.errors.length > 0) return yield* BumpBreaks.make({});
    }),
).pipe(
  Command.withDescription(
    "Update the flake's inputs on the side and typecheck every module against the types they bring",
  ),
);

/** `typeflake bump` exits with an error when the update breaks a module; the report says where. */
class BumpBreaks extends Schema.TaggedError<BumpBreaks, { readonly brand: unique symbol }>()(
  "BumpBreaks",
  {},
) {
  override get message() {
    return "the update breaks modules";
  }
}

const PackageJson = Schema.fromJsonString(Schema.Struct({ version: Schema.String }));

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { version } = yield* Schema.decodeEffect(PackageJson)(
    yield* fs.readFileString(new URL("../package.json", import.meta.url).pathname),
  );
  yield* Command.run(
    Command.make("typeflake").pipe(Command.withSubcommands([render, types, bump])),
    {
      version,
    },
  );
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
