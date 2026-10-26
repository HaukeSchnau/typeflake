import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { parse } from "yaml";
import * as Ast from "../Ast.ts";
import * as Provider from "../Provider.ts";

const Found = Schema.Struct({
  /** The YAML and JSON files sops-nix reads secrets from. */
  files: Schema.Array(Schema.String),
  /** Secrets named other than a key in their file: with their own `key`, or a format without keys. */
  other: Schema.Array(Schema.String),
});

/** A sops file as YAML or JSON: maps of maps, down to encrypted values. */
interface Keys {
  readonly [key: string]: Keys | string | number | boolean | null | ReadonlyArray<unknown>;
}
const Keys: Schema.Codec<Keys> = Schema.Record(
  Schema.String,
  Schema.Union([
    Schema.suspend((): Schema.Codec<Keys> => Keys),
    Schema.String,
    Schema.Finite,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(Schema.Unknown),
  ]),
);

const isKeys = Schema.is(Keys);

/**
 * The paths sops-nix names a file's secrets by: its keys, with nested ones joined by `/`. sops
 * encrypts only values, so the keys are readable. `sops` itself holds the file's metadata.
 */
const keysOf = (keys: Keys, prefix = ""): ReadonlyArray<string> =>
  Object.entries(keys).flatMap(([key, inner]) => {
    if (prefix === "" && key === "sops") return [];
    const path = `${prefix}${key}`;
    return isKeys(inner) ? keysOf(inner, `${path}/`) : [path];
  });

const expression = Ast.print(
  Ast.raw(`configuration:
let
  sops = configuration.config.sops or null;
  names = builtins.attrNames sops.secrets;
  keyed = secret: builtins.elem secret.format [ "yaml" "json" ];
  default = if (sops.defaultSopsFile or null) == null then [ ] else [ (toString sops.defaultSopsFile) ];
in
if sops == null then null else {
  files = default ++ builtins.concatMap (name: let secret = sops.secrets.\${name}; in if keyed secret then [ (toString secret.sopsFile) ] else [ ]) names;
  other = builtins.filter (name: let secret = sops.secrets.\${name}; in secret.key != name || !(keyed secret)) names;
}`),
);

/**
 * The secrets sops-nix can define: the keys of the files it reads, so a misspelled secret fails in
 * the editor instead of when the host activates. The names cover every configuration probed.
 */
export const provider = Provider.make({
  name: "secrets",
  schema: Found,
  nix: () => Effect.succeed(expression),
  combine: (left, right) => ({
    files: [...new Set([...left.files, ...right.files])],
    other: [...new Set([...left.other, ...right.other])],
  }),
  provide: (found) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const keys = yield* Effect.forEach(found.files, (file) =>
        fs.readFileString(file).pipe(
          Effect.flatMap((text) => Schema.decodeUnknownEffect(Keys)(parse(text))),
          Effect.map((keys) => keysOf(keys)),
          Effect.mapError((error) =>
            Provider.ProviderFailed.make({
              provider: "secrets",
              reason: `${file}: ${String(error)}`,
            }),
          ),
        ),
      );
      const names = [...new Set([...keys.flat(), ...found.other])].toSorted();
      if (names.length === 0) return Provider.nothing;
      return {
        ...Provider.nothing,
        register: [["sopsSecrets", names.map((name) => JSON.stringify(name)).join(" | ")]],
        names: [["sops.secrets", 'Register["sopsSecrets"]']],
      };
    }),
});
