import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import * as Ast from "./Ast.ts";
import * as Nix from "./Nix.ts";

const Pair = Schema.fromJsonString(
  Schema.Tuple([Schema.Array(Schema.String), Schema.Array(Schema.String)]),
);

/** Two lists of strings, as Nix evaluates them. */
const evaluatePair = (code: string) =>
  Schema.decodeSync(Pair)(
    execFileSync("nix-instantiate", ["--eval", "--strict", "--json", "-E", code], {
      encoding: "utf8",
    }),
  );

const v = Nix.raw<string>("v");

/** Template literal text, with `${v}` for interpolations; Nix reads the same text inside `''`. */
const sources = [
  "\n    a\n      b\n    c\n  ",
  "\n  a\n\n  b\n",
  "\n    a\n  \n    b\n  ",
  "\n  a\n      \n  b\n",
  "first line\n  second\n",
  "\n\ta\n\tb\n",
  "\n  a\n  b",
  "\n    x\n  y\n    z\n    ",
  "\n  echo ${v}\n  ${v} at the start\n",
  "single line ${v} here",
];

const template = (source: string) => {
  const strings = source.split("${v}");
  return Nix.nix(Object.assign([...strings], { raw: strings }), ...strings.slice(1).map(() => v));
};

describe("nix", () => {
  it("dedents like Nix's '' strings", () => {
    const ours = sources.map((source) => Ast.print(Nix.exprOf(template(source))).trim());
    const theirs = sources.map((source) => `''${source}''`);
    const [left, right] = evaluatePair(
      `let v = "@"; in [ [ ${ours.map((code) => `(${code})`).join(" ")} ] [ ${theirs.map((code) => `(${code})`).join(" ")} ] ]`,
    );
    expect(left).toEqual(right);
  });

  it("selects and applies through proxies", () => {
    const pkgs = Nix.proxy<{
      readonly callPackage: (
        path: Nix.Nix<string>,
        overrides: { readonly [name: string]: Nix.NixValue },
      ) => Nix.Nix<Nix.Package>;
    }>(Ast.variable("pkgs"));
    const secrets = Nix.proxy<{ readonly "app-store-connect/api-key": { readonly path: string } }>(
      Ast.select(Ast.variable("config"), "secrets"),
    );

    expect(
      Ast.print(
        Nix.toExpr([
          pkgs.callPackage(Nix.path("./a.nix"), {}),
          secrets["app-store-connect/api-key"].path,
        ]),
      ),
    ).toBe(
      `[\n  (pkgs.callPackage ./a.nix { })\n  config.secrets."app-store-connect/api-key".path\n]\n`,
    );
  });
});
