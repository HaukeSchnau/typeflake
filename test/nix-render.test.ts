import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { rawNix } from "../src/nix/expr.ts";
import { renderNixValue } from "../src/nix/render.ts";

describe("Nix renderer", () => {
  it.effect("renders primitive values and sorted attrsets", () =>
    Effect.sync(() => {
      assert.equal(
        renderNixValue({
          zed: true,
          alpha: "hello",
          count: 3,
          empty: null,
          skipped: undefined,
        }),
        `{
  alpha = "hello";
  count = 3;
  empty = null;
  zed = true;
}`,
      );
    }),
  );

  it.effect("renders attrsets with tag keys as user data", () =>
    Effect.sync(() => {
      assert.equal(
        renderNixValue({
          tag: "string",
          value: "still an attrset",
        }),
        `{
  tag = "string";
  value = "still an attrset";
}`,
      );
    }),
  );

  it.effect("renders lists with raw expressions and nested attrsets", () =>
    Effect.sync(() => {
      assert.equal(
        renderNixValue([
          rawNix("pkgs.git"),
          {
            enable: true,
            name: "git",
          },
        ]),
        `[
  pkgs.git
  {
    enable = true;
    name = "git";
  }
]`,
      );
    }),
  );

  it.effect("indents multiline raw expressions inside attrsets", () =>
    Effect.sync(() => {
      assert.equal(
        renderNixValue({
          outputs: rawNix(`{ self }: {
  packages.default = self;
}`),
        }),
        `{
  outputs = { self }: {
    packages.default = self;
  };
}`,
      );
    }),
  );
});
