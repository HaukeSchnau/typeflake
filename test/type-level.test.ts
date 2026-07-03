import * as Effect from "effect/Effect";
import { assert, describe, it } from "@effect/vitest";
import { attest } from "@arktype/attest";
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
    attest<"pure", typeof pure.taint>();
    attest<"effect", typeof effectful.taint>();
    attest<"impure", typeof impure.taint>();
    attest<TypeflakeFlake<typeof inputs>, typeof pure>();

    assert.equal(pure.taint, "pure");
    assert.equal(effectful.taint, "effect");
    assert.equal(impure.taint, "impure");
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
