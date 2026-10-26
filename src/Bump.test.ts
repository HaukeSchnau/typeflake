import { describe, expect, it } from "vite-plus/test";
import { rewrite } from "./Bump.ts";

const module = `import { define, mkIf, NixOS } from "typeflake";

export default NixOS.module({
  config: ({ config }) =>
    mkIf(config.services.web.enable, {
      services: { web: { listenPort: 80, oldRoot: "/srv" } },
      programs: { "old-name": { enable: true } },
    }),
});
`;

describe("rewrite", () => {
  it("renames keys that only change their last name, and reports the ones that move", () => {
    const { found, fixed } = rewrite(module, [
      { from: ["services", "web", "listenPort"], to: ["services", "web", "port"] },
      { from: ["services", "web", "oldRoot"], to: ["services", "web", "settings", "root"] },
      { from: ["programs", "old-name"], to: ["programs", "new-name"] },
    ]);

    expect(found.map(({ line, column, fixable }) => [line, column, fixable])).toEqual([
      [6, 26, true],
      [6, 42, false],
      [7, 19, true],
    ]);
    expect(fixed).toContain(`services: { web: { port: 80, oldRoot: "/srv" } }`);
    expect(fixed).toContain(`programs: { "new-name": { enable: true } }`);
  });

  it("leaves a key alone where it isn't the renamed option", () => {
    const { found } = rewrite(`NixOS.module({ config: define({ users: { listenPort: 1 } }) })`, [
      { from: ["services", "web", "listenPort"], to: ["services", "web", "port"] },
    ]);

    expect(found).toEqual([]);
  });
});
