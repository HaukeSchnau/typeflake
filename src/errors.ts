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

export class DoctorFailed extends Data.TaggedError("DoctorFailed")<{
  readonly failedChecks: readonly string[];
}> {}

export class OptionMetadataParseError extends Data.TaggedError("OptionMetadataParseError")<{
  readonly cause: unknown;
  readonly path?: string;
}> {}

export class UnsupportedOptionsFound extends Data.TaggedError("UnsupportedOptionsFound")<{
  readonly options: readonly string[];
}> {}

export class InitWriteFailed extends Data.TaggedError("InitWriteFailed")<{
  readonly cause: unknown;
  readonly path: string;
}> {}
