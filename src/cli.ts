#!/usr/bin/env nub

import * as Effect from "effect/Effect";
import { check } from "./check.ts";
import { sync } from "./sync.ts";
import packageJson from "../package.json" with { type: "json" };

const { version } = packageJson;

interface ParsedCommand {
  readonly command: string;
  readonly input: string;
  readonly output: string;
}

const parseArgs = (args: readonly string[]): ParsedCommand => {
  const command = args[0] ?? "help";
  let input = "flake.ts";
  let output = "flake.nix";

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if ((arg === "--input" || arg === "-i") && next !== undefined) {
      input = next;
      index += 1;
      continue;
    }

    if ((arg === "--output" || arg === "-o") && next !== undefined) {
      output = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  return { command, input, output };
};

const printHelp = (): void => {
  console.log(`typeflake ${version}

Usage:
  typeflake check [--input flake.ts] [--output flake.nix]
  typeflake sync [--input flake.ts] [--output flake.nix]
  typeflake help
`);
};

const program = Effect.gen(function* () {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.command) {
    case "help":
      printHelp();
      return;
    case "check":
      yield* check({ input: parsed.input, output: parsed.output });
      return;
    case "sync":
      yield* sync({ input: parsed.input, output: parsed.output });
      console.log(`Generated ${parsed.output}`);
      return;
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
});

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
