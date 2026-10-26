import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { builders } from "../Lib.ts";
import * as Provider from "../Provider.ts";
import { property } from "../Typegen.ts";

// `Builders` types these itself; a second, conflicting type here would intersect with it.
const builtNames: ReadonlySet<string> = new Set(builders);

/**
 * The top-level names in `pkgs`, each typed as the package of that name, so `pkgs.ripgerp` fails
 * and `noUncheckedIndexedAccess` doesn't make `pkgs.git` possibly undefined. Package sets such as
 * `python3Packages` are typed as packages too: telling them apart would mean evaluating every name.
 */
export const provider = Provider.make({
  name: "packages",
  schema: Schema.Array(Schema.String),
  nix: () => Effect.succeed("configuration: builtins.attrNames (configuration.pkgs or { })"),
  combine: (left, right) => [...new Set([...left, ...right])],
  provide: (names) =>
    Effect.succeed({
      ...Provider.nothing,
      declarations: [
        `export interface Packages {\n${names
          .filter((name) => !builtNames.has(name))
          .toSorted()
          .map((name) => `  readonly ${property(name)}: Package<${JSON.stringify(name)}>`)
          .join("\n")}\n}`,
      ],
      register: [["pkgs", "Packages"]],
    }),
});
