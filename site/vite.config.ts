import { defineConfig, type Plugin } from "vite";
import { fragments } from "./prerender/fragments.ts";

// index.html marks where build-time HTML goes with `<!-- @name -->`. Hyphenated words in its prose,
// such as srv-2 and nix-darwin, would otherwise break at the hyphen on a phone.
const page = (): Plugin => ({
  name: "typeflake-page",
  transformIndexHtml(html) {
    const unused = new Set(fragments.keys());
    const out = html
      .replace(
        /(?<=>[^<]*)\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b(?=[^<]*<)/g,
        (word) => `<span class="nb">${word}</span>`,
      )
      .replace(/<!-- @([\w-]+) -->/g, (_, name: string) => {
        const fragment = fragments.get(name);
        if (fragment === undefined)
          throw new Error(`index.html asks for an unknown fragment: ${name}`);
        unused.delete(name);
        return fragment;
      });
    if (unused.size > 0) throw new Error(`index.html doesn't place: ${[...unused].join(", ")}`);
    return out;
  },
});

export default defineConfig({
  plugins: [page()],
  build: { target: "es2023" },
});
