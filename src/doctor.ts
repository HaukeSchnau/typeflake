import * as Effect from "effect/Effect";
import { runCommandExitCode } from "./process.ts";
import { effectTsgoCommand, tsgoCommand } from "./tooling.ts";

export interface DoctorOptions {
  readonly project?: string;
}

export interface DoctorCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheck[];
  readonly ok: boolean;
}

export const doctor = (options: DoctorOptions = {}) =>
  Effect.gen(function* () {
    const project = options.project ?? "tsconfig.json";
    const checks = yield* Effect.all(
      [
        checkCommand("Nix", "nix", ["--version"]),
        checkCommand("Node", "node", ["--version"]),
        checkCommand("TypeScript-Go", tsgoCommand(), ["--version"]),
        checkCommand("Effect TSGO", effectTsgoCommand(), ["get-exe-path"]),
        checkCommand("Project TypeScript", tsgoCommand(), ["--noEmit", "--project", project]),
      ],
      { concurrency: "unbounded" },
    );

    return {
      checks,
      ok: checks.every((check) => check.ok),
    };
  });

export const renderDoctorReport = (report: DoctorReport): string =>
  [
    "Typeflake doctor",
    ...report.checks.map((check) => `${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`),
  ].join("\n");

const checkCommand = (name: string, command: string, args: readonly string[]) =>
  runCommandExitCode({ args, command }).pipe(
    Effect.match({
      onFailure: (cause): DoctorCheck => ({
        detail: String(cause),
        name,
        ok: false,
      }),
      onSuccess: (exitCode): DoctorCheck => ({
        detail: exitCode === 0 ? `${command} ${args.join(" ")}` : `exit code ${exitCode}`,
        name,
        ok: exitCode === 0,
      }),
    }),
  );
