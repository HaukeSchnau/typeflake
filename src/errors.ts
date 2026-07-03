import * as Data from "effect/Data";

export class FlakeImportError extends Data.TaggedError("FlakeImportError")<{
  readonly cause: unknown;
  readonly specifier: string;
}> {}

export class NixCheckFailed extends Data.TaggedError("NixCheckFailed")<{
  readonly exitCode: number;
  readonly target: string;
}> {}

export class TypeScriptCheckFailed extends Data.TaggedError("TypeScriptCheckFailed")<{
  readonly exitCode: number;
  readonly project: string;
}> {}
