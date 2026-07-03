import * as Effect from "effect/Effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export type ProcessStdio = "ignore" | "inherit";

export interface RunCommandOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly stderr?: ProcessStdio;
  readonly stdin?: ProcessStdio;
  readonly stdout?: ProcessStdio;
}

export const runCommandExitCode = (options: RunCommandOptions) =>
  Effect.gen(function* () {
    const process = yield* ChildProcessSpawner.ChildProcessSpawner;
    const command = ChildProcess.make(options.command, options.args, {
      stderr: options.stderr ?? "ignore",
      stdin: options.stdin ?? "ignore",
      stdout: options.stdout ?? "ignore",
    });
    const exitCode = yield* process.exitCode(command);

    return Number(exitCode);
  });
