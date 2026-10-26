import { Calder, Task, cmd } from "@calder-ci/core";
import { Pnpm, Project } from "@calder-ci/std";
import { Schema } from "effect";
import { flake } from "./flake.ts";

const shell = flake.devShells.ci;
const install = Pnpm.install({ shell });

/** The library's types, its declaration build and the tests, some of which evaluate rendered Nix. */
const check = Task.make("check", { shell, setup: install, run: cmd`pnpm run check` });
const test = Task.make("test", { shell, setup: install, run: cmd`pnpm test` });
const checks = [check, test];

/** typeflake.schnau.dev (site/alchemy.run.ts), with a preview per pull request. */
const site = Project.alchemy({
  flake,
  stack: {
    shell,
    setup: install,
    dir: "site",
    env: "cloudflare",
    outputs: { name: "Typeflake", schema: Schema.Struct({ url: Schema.String }) },
  },
  checks,
  previews: { url: (_pr, outputs) => outputs.url },
});

// npm releases are published from GitHub (.github/workflows/publish.yml), which npm trusts without a
// token; it doesn't trust Calder.
export default Calder.project({ rules: site.rules });
