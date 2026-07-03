import type { OptionIR, OptionPath, OptionScope, OptionTypeIR } from "./ir.ts";

export interface OptionMetadataDocument {
  readonly options: readonly OptionIR[];
  readonly source: OptionMetadataSource;
  readonly version: 1;
}

export interface OptionMetadataSource {
  readonly flake: string;
  readonly homeManagerInput: string | null;
  readonly nixpkgsInput: string;
  readonly scopes: readonly OptionScope[];
  readonly system: string;
}

export interface OptionProbePayload {
  readonly homeManager: readonly OptionIR[];
  readonly nixos: readonly OptionIR[];
}

export const makeOptionMetadataDocument = (
  source: OptionMetadataSource,
  payload: OptionProbePayload,
): OptionMetadataDocument => ({
  options: sortOptions([...payload.nixos, ...payload.homeManager]),
  source: {
    flake: source.flake,
    homeManagerInput: source.homeManagerInput,
    nixpkgsInput: source.nixpkgsInput,
    scopes: sortScopes(source.scopes),
    system: source.system,
  },
  version: 1,
});

export const optionMetadataDocumentToJson = (document: OptionMetadataDocument): string =>
  `${JSON.stringify(document, null, 2)}\n`;

export const parseOptionMetadataDocument = (value: unknown): OptionMetadataDocument => {
  const record = requireRecord(value, "Option metadata document");
  const version = record.version;
  if (version !== 1) {
    throw new Error(`Unsupported option metadata version: ${String(version)}`);
  }

  return {
    options: requireArray(record.options, "options").map(parseOptionIR),
    source: parseSource(record.source),
    version,
  };
};

export const parseOptionProbePayload = (value: unknown): OptionProbePayload => {
  const record = requireRecord(value, "Option probe payload");

  return {
    homeManager: requireArray(record.homeManager, "homeManager").map(parseOptionIR),
    nixos: requireArray(record.nixos, "nixos").map(parseOptionIR),
  };
};

const parseSource = (value: unknown): OptionMetadataSource => {
  const record = requireRecord(value, "source");

  return {
    flake: requireString(record.flake, "source.flake"),
    homeManagerInput:
      record.homeManagerInput === null
        ? null
        : requireString(record.homeManagerInput, "source.homeManagerInput"),
    nixpkgsInput: requireString(record.nixpkgsInput, "source.nixpkgsInput"),
    scopes: requireArray(record.scopes, "source.scopes").map(parseScope),
    system: requireString(record.system, "source.system"),
  };
};

const parseOptionIR = (value: unknown): OptionIR => {
  const record = requireRecord(value, "option");

  return {
    declarations: requireArray(record.declarations, "option.declarations").map((item) =>
      requireString(item, "option.declarations[]"),
    ),
    defaultText: requireNullableString(record.defaultText, "option.defaultText"),
    description: requireNullableString(record.description, "option.description"),
    exampleText: requireNullableString(record.exampleText, "option.exampleText"),
    internal: requireBoolean(record.internal, "option.internal"),
    path: parsePath(record.path),
    readOnly: requireBoolean(record.readOnly, "option.readOnly"),
    scope: parseScope(record.scope),
    type: parseType(record.type),
    visible: parseVisible(record.visible),
  };
};

const parseType = (value: unknown): OptionTypeIR => {
  const record = requireRecord(value, "option.type");
  const nestedTypes = requireRecord(record.nestedTypes, "option.type.nestedTypes");

  return {
    description: requireNullableString(record.description, "option.type.description"),
    name: requireString(record.name, "option.type.name"),
    nestedTypes: Object.fromEntries(
      Object.entries(nestedTypes).map(([key, nestedType]) => [key, parseType(nestedType)]),
    ),
  };
};

const parsePath = (value: unknown): OptionPath => {
  const path = requireArray(value, "option.path").map((item) =>
    requireString(item, "option.path[]"),
  );
  const [first, ...rest] = path;
  if (first === undefined) {
    throw new Error("Option paths must contain at least one segment");
  }

  return [first, ...rest];
};

const parseScope = (value: unknown): OptionScope => {
  switch (value) {
    case "home-manager":
    case "nixos":
      return value;
    default:
      throw new Error(`Unexpected option scope: ${String(value)}`);
  }
};

const parseVisible = (value: unknown): OptionIR["visible"] => {
  if (value === true || value === false || value === "shallow") return value;

  throw new Error(`Unexpected option visibility: ${String(value)}`);
};

const sortOptions = (options: readonly OptionIR[]): readonly OptionIR[] =>
  options.toSorted((left, right) => {
    const scopeOrder = left.scope.localeCompare(right.scope);
    if (scopeOrder !== 0) return scopeOrder;

    return left.path.join(".").localeCompare(right.path.join("."));
  });

const sortScopes = (scopes: readonly OptionScope[]): readonly OptionScope[] =>
  [...new Set(scopes)].toSorted((left, right) => left.localeCompare(right));

const requireRecord = (value: unknown, name: string): Readonly<Record<string, unknown>> => {
  if (isRecord(value)) return value;

  throw new Error(`${name} must be an object`);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireArray = (value: unknown, name: string): readonly unknown[] => {
  if (Array.isArray(value)) return value;

  throw new Error(`${name} must be an array`);
};

const requireString = (value: unknown, name: string): string => {
  if (typeof value === "string") return value;

  throw new Error(`${name} must be a string`);
};

const requireNullableString = (value: unknown, name: string): string | null => {
  if (value === null || typeof value === "string") return value;

  throw new Error(`${name} must be a string or null`);
};

const requireBoolean = (value: unknown, name: string): boolean => {
  if (typeof value === "boolean") return value;

  throw new Error(`${name} must be a boolean`);
};
