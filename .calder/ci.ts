import { Calder, On } from "@calder-ci/core";
import { Npm, Pnpm, Project, Vp } from "@calder-ci/std";
import { Schema } from "effect";
import { flake } from "./flake.ts";

const shell = flake.devShells.ci;
const install = Pnpm.install({ shell });

/** `vp check` (format, lint and the library's types) and the whole `vp test` suite. */
const checks = Vp.tasks({ shell, setup: install });

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

/**
 * A commit that raises the version stages it on npm. npm accepts tokenless publishing only from
 * GitHub, GitLab.com and CircleCI, so a maintainer approves each staged release with 2FA.
 */
const release = Npm.publish({ shell, setup: install, token: "npm", after: checks });

export default Calder.project({ rules: [...site.rules, On.push("main", [release])] });
