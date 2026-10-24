# typeflake.schnau.dev

A Vite page without a framework. `prerender/fragments.ts` highlights the code at build time and fills
the `<!-- @name -->` markers in `index.html`; `src/` is the little JavaScript the page runs. Calder
deploys it to Cloudflare through `alchemy.run.ts`, with a preview per pull request.

Everything the page says about Typeflake is real output on `example/`, a made-up flake with a NixOS
server and a Mac:

- The module pair and the editor read `example/` directly.
- `data/example.ts` holds what the CLI printed, the measurements and what `tsc` reported for each
  mistake. `data/graph.json` is the server's option tree, which the snowflake draws.

`scripts/example.ts` renders and probes the example and writes both files again. It needs Nix and
the built package:

```sh
pnpm build                      # at the repository root
node scripts/example.ts         # in site/, about a minute
pnpm exec vp fmt data
```

Run it after changing the example, the renderer, the probe or the type generator. A linked part of the
module pair that no longer matches the rendered Nix fails the build.

`public/social.png` is a screenshot of the hero at 1200 by 630, without the navigation, the install
command and the readout.

```sh
pnpm dev     # http://localhost:5173
pnpm build   # dist/
```
