import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";
import { doctor, renderDoctorReport } from "../src/doctor.ts";

const encoder = new TextEncoder();

const mockHandle = (exitCode: number) =>
  ChildProcessSpawner.makeHandle({
    all: Stream.empty,
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    pid: ChildProcessSpawner.ProcessId(1),
    stderr: Stream.empty,
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode("")),
    unref: Effect.succeed(Effect.void),
  });

const mockSpawnerLayer = (exitCodes: Readonly<Record<string, number>>) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const commandLine =
        "command" in command ? `${command.command} ${command.args.join(" ")}` : "";
      const exitCode = exitCodes[commandLine] ?? 0;
      return Effect.succeed(mockHandle(exitCode));
    }),
  );

describe("doctor", () => {
  it.effect("reports healthy tooling when all commands pass", () =>
    Effect.gen(function* () {
      const report = yield* doctor().pipe(Effect.provide(mockSpawnerLayer({})));

      assert.equal(report.ok, true);
      assert.deepEqual(
        report.checks.map((check) => check.name),
        ["Nix", "Nub", "TypeScript-Go", "Effect TSGO", "Project TypeScript"],
      );
    }),
  );

  it.effect("reports failed commands without failing the Effect", () =>
    Effect.gen(function* () {
      const report = yield* doctor().pipe(
        Effect.provide(mockSpawnerLayer({ "tsgo --version": 1 })),
      );

      assert.equal(report.ok, false);
      assert.equal(report.checks[2]?.ok, false);
      assert.equal(report.checks[2]?.detail, "exit code 1");
      assert.match(renderDoctorReport(report), /FAIL TypeScript-Go: exit code 1/);
    }),
  );
});
