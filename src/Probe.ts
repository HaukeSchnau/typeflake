import * as Schema from "effect/Schema";

/** A module system type, as `probe.nix` reports it. */
export interface NixType {
  readonly name: string;
  readonly description?: string | null;
  /** The walk stopped here, so the type is unknown beyond its name. */
  readonly truncated?: boolean;
  /** A configuration of a module class the walk was already inside. */
  readonly classRef?: string;
  /** The type of an option the walk was already inside, by that option's id. */
  readonly optionRef?: string;
  /** The module class of a submodule that has one. */
  readonly class?: string;
  readonly values?: ReadonlyArray<string | number | boolean | null>;
  /** Whether a path must be in the store (`true`) or outside it (`false`). */
  readonly inStore?: boolean | null;
  readonly nested?: { readonly [key: string]: NixType };
  readonly alternatives?: ReadonlyArray<NixType>;
  readonly options?: OptionTree;
}

export interface NixOption {
  /** The first declaration's position, `file:line:column`. */
  readonly id: string | null;
  readonly visible: boolean | "shallow";
  readonly type: NixType;
  readonly description: string | null;
  readonly default: string | null;
  readonly readOnly: boolean;
  readonly internal: boolean;
  /** Why the option's type is deprecated, such as `types.string`'s. */
  readonly deprecated?: string | null;
}

export interface OptionGroup {
  readonly group: OptionTree;
}

export interface OptionTree {
  readonly [name: string]: NixOption | OptionGroup;
}

const suspendedType = Schema.suspend((): Schema.Codec<NixType> => NixType);

const NixType: Schema.Codec<NixType> = Schema.Struct({
  name: Schema.String,
  description: Schema.NullOr(Schema.String).pipe(Schema.optionalKey),
  truncated: Schema.Boolean.pipe(Schema.optionalKey),
  classRef: Schema.String.pipe(Schema.optionalKey),
  optionRef: Schema.String.pipe(Schema.optionalKey),
  class: Schema.String.pipe(Schema.optionalKey),
  values: Schema.Array(
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]),
  ).pipe(Schema.optionalKey),
  inStore: Schema.NullOr(Schema.Boolean).pipe(Schema.optionalKey),
  nested: Schema.Record(Schema.String, suspendedType).pipe(Schema.optionalKey),
  alternatives: Schema.Array(suspendedType).pipe(Schema.optionalKey),
  options: Schema.suspend((): Schema.Codec<OptionTree> => OptionTree).pipe(Schema.optionalKey),
});

const NixOption = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  visible: Schema.Union([Schema.Boolean, Schema.Literal("shallow")]),
  type: NixType,
  description: Schema.NullOr(Schema.String),
  default: Schema.NullOr(Schema.String),
  readOnly: Schema.Boolean,
  internal: Schema.Boolean,
  deprecated: Schema.NullOr(Schema.String).pipe(Schema.optionalKey),
});

const OptionTree: Schema.Codec<OptionTree> = Schema.Record(
  Schema.String,
  Schema.Union([
    NixOption,
    Schema.Struct({ group: Schema.suspend((): Schema.Codec<OptionTree> => OptionTree) }),
  ]),
);

export const decodeOptionTree = Schema.decodeUnknownEffect(Schema.fromJsonString(OptionTree));

/**
 * What `typeflake types` reads from one configuration: its options, and each provider's findings as
 * JSON, or null where the provider's expression failed.
 */
export const Probed = Schema.Struct({
  options: OptionTree,
  providers: Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
});

export const decodeProbed = Schema.decodeUnknownEffect(Schema.fromJsonString(Probed));

export const isGroup = (node: NixOption | OptionGroup): node is OptionGroup => "group" in node;
