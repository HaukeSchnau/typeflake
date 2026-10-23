import { describe, expect, it } from "vite-plus/test";
import type { NixOption, NixType, OptionTree } from "./Probe.ts";
import { generate } from "./Typegen.ts";

const option = (type: NixType, id: string | null = null): NixOption => ({
  id,
  visible: true,
  type,
  description: null,
  default: null,
  readOnly: false,
  internal: false,
});

const generateNixos = (tree: OptionTree) =>
  generate(tree, { rootClass: "nixos", importFrom: "typeflake" }).source;

describe("generate", () => {
  it("types a freeform submodule's other attributes by the freeform element type", () => {
    const source = generateNixos({
      settings: option({
        name: "submodule",
        nested: { freeformType: { name: "attrsOf", nested: { elemType: { name: "int" } } } },
        options: { Port: option({ name: "bool" }) },
      }),
    });

    expect(source).toContain(
      "export interface Settings {\n  readonly Port: boolean\n  readonly [name: string]: number | boolean\n}",
    );
  });

  it("aliases an option that contains itself, and points the inner one at the alias", () => {
    const content: NixType = {
      name: "submodule",
      options: {
        content: option(
          { name: "nullOr", optionRef: "luks.nix:5:3#content" },
          "luks.nix:5:3#content",
        ),
      },
    };
    const source = generateNixos({ content: option(content, "luks.nix:5:3#content") });

    expect(source).toContain("export type Content = Content2");
    expect(source).toContain("export interface Content2 {\n  readonly content: Content\n}");
  });

  it("refers to a module class's root once the walk is inside it", () => {
    const source = generateNixos({
      specialisation: option({ name: "submodule", classRef: "nixos" }),
      users: option({
        name: "submodule",
        class: "homeManager",
        options: {
          home: { group: { stateVersion: option({ name: "enum", values: ["25.11", "26.05"] }) } },
        },
      }),
    });

    expect(source).toContain("readonly specialisation: NixosOptions");
    expect(source).toContain("readonly users: HomeManagerOptions");
    expect(source).toContain(
      'export interface HomeManagerHome {\n  readonly stateVersion: "25.11" | "26.05"\n}',
    );
  });
});
