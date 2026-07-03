import * as Effect from "effect/Effect";
import { assert, describe, it } from "@effect/vitest";
import { Flake, type TypeflakeFlake } from "../src/flake.ts";

const inputs = Flake.inputs({
  nixpkgs: Flake.input("nixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
});

const pure = Flake.make({
  inputs,
  outputs: ({ nixpkgs }) => ({
    nixosConfigurations: {
      demo: nixpkgs,
    },
  }),
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

describe("type-level contracts", () => {
  it("keeps compile-time flake taint and input guarantees", () => {
    const pureTaint: "pure" = pure.taint;
    const effectTaint: "effect" = effectful.taint;
    const impureTaint: "impure" = impure.taint;
    const typedPure: TypeflakeFlake<typeof inputs> = pure;

    assert.equal(pureTaint, "pure");
    assert.equal(effectTaint, "effect");
    assert.equal(impureTaint, "impure");
    assert.equal(typedPure.taint, "pure");
  });
});

Flake.inputs({
  // @ts-expect-error Input object keys must match the explicit Nix input name.
  nixpkgs: Flake.input("notNixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
});

Flake.make({
  inputs: {
    // @ts-expect-error Constructors must also reject input keys that do not match input names.
    nixpkgs: Flake.input("notNixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
  },
  outputs: () => ({}),
});
