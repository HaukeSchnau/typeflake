import "vite-plus/test/config";
import { antipattern, correctness, style } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

const effectRules = Object.fromEntries(
  [correctness, antipattern, style].flatMap((preset) =>
    Object.keys(preset.rules ?? {}).map((rule) => [rule, "error"] as const),
  ),
);

const agentTooling = [
  ".agent/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".continue/**",
  ".cursor/**",
  ".gemini/**",
  ".opencode/**",
  ".pi/**",
  ".roo/**",
  ".windsurf/**",
];

const generated = [
  "dist",
  "**/dist",
  "node_modules",
  "pnpm-lock.yaml",
  "result",
  "*.tsbuildinfo",
  ".alchemy",
  "**/.alchemy",
  "site/data/graph.json",
];

export default defineConfig({
  fmt: {
    ignorePatterns: [...generated, ...agentTooling, "tools/oxlint/anti-slop/**", "**/.typeflake"],
    sortPackageJson: {},
  },
  lint: {
    jsPlugins: [
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
      { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop/effect/index.ts" },
    ],
    // `.typeflake` holds generated types and local experiments, which nothing imports. The site's
    // example checks against types probed from nixpkgs, which site/scripts/example.ts generates.
    ignorePatterns: [
      ...generated,
      ...agentTooling,
      "tools/oxlint/anti-slop/**",
      "**/.typeflake",
      "site/example/**",
    ],
    plugins: ["effecttsgo", "eslint", "oxc", "unicorn", "typescript"],
    categories: {
      correctness: "error",
      perf: "error",
      suspicious: "error",
    },
    rules: {
      ...effectRules,
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
      "anti-slop-effect/no-service-constructor-imports": "error",
      "eslint/eqeqeq": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-non-null-assertion": "error",
      "unicorn/prefer-node-protocol": "error",

      // This treats every exported fixed-arity function as an Effect-style `self` API; enabling it
      // would require dual overloads for AST constructors and authoring helpers.
      "effecttsgo/missing-pipeable-signature": "off",

      // Final dependency provision belongs in tests and executable entry points, which this rule
      // cannot identify without maintaining a growing file allowlist.
      "effecttsgo/strict-effect-provide": "off",

      // JavaScript truthiness is readable in guards.
      "effecttsgo/strict-boolean-expressions": "off",

      // Reusing a precise local name in a nested callback is clearer and TypeScript resolves the
      // scopes unambiguously.
      "eslint/no-shadow": "off",

      // Effect's standard discriminated unions, and the AST's, expose the `_tag` field.
      "eslint/no-underscore-dangle": "off",

      // TypeScript's noImplicitReturns catches missing paths; this rule misreads exhaustive
      // branches and Effect generators whose terminal branches yield errors.
      "typescript/consistent-return": "off",
    },
    overrides: [
      {
        // The CLI reads files, spawns `nix` and parses arguments, which Effect 4 ships only as
        // unstable modules; the lockfile pins the Effect version they come from.
        files: [
          "src/Bump.ts",
          "src/Cli.ts",
          "src/Project.ts",
          "src/Provider.ts",
          "src/providers/*.ts",
        ],
        rules: { "effecttsgo/unstable-api-usage": "off" },
      },
    ],
    env: {
      builtin: true,
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
