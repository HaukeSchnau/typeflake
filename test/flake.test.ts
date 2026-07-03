import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Flake, renderFlake, resolveFlakeSpec } from "../src/flake.ts";
import { pkgs } from "../src/packages.ts";

const inputs = Flake.inputs({
  nixpkgs: Flake.input("nixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
});

describe("Flake", () => {
  it.effect("renders flakes from named typed inputs", () =>
    Effect.sync(() => {
      assert.equal(
        renderFlake({
          description: "fixture",
          inputs,
          outputs: () => ({
            devShells: {
              "x86_64-linux": {
                default: {
                  packages: [pkgs.git],
                },
              },
            },
          }),
        }),
        `{
  description = "fixture";
  inputs = {
    nixpkgs = {
      url = "github:NixOS/nixpkgs/nixos-unstable";
    };
  };
  outputs = { self, nixpkgs }: {
    devShells = {
      x86_64-linux = {
        default = let pkgs = nixpkgs.legacyPackages.x86_64-linux; in pkgs.mkShell {
          packages = [
            pkgs.git
          ];
        };
      };
    };
  };
}
`,
      );
    }),
  );

  it.effect("tracks pure and effectful flake taint", () =>
    Effect.gen(function* () {
      const pure = Flake.make({
        inputs,
        outputs: () => ({}),
      });
      const effectful = Flake.effect(
        Effect.succeed({
          inputs,
          outputs: () => ({}),
        }),
      );
      const impure = Flake.impure(
        Effect.succeed({
          inputs,
          outputs: () => ({}),
        }),
      );

      assert.equal(pure.taint, "pure");
      assert.equal(effectful.taint, "effect");
      assert.equal(impure.taint, "impure");
      assert.equal((yield* resolveFlakeSpec(pure)).inputs.nixpkgs.name, "nixpkgs");
    }),
  );
});
