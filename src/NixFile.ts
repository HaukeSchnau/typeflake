import { registerHooks } from "node:module";
import * as Ast from "./Ast.ts";
import * as Nix from "./Nix.ts";

const FileId: unique symbol = Symbol.for("typeflake/NixFile");

/**
 * A `.nix` file a module imports with `import site from "./site.nix"`. It renders as the path
 * literal, relative to the module's own file, which the rendered `.nix` file sits next to.
 * `typeflake types` writes a declaration for each imported file that names what it is: a package
 * function and the arguments it takes, or a module.
 */
export interface NixFile<
  out Kind extends "package" | "module",
  out Args,
> extends Nix.Nix<Nix.NixPath> {
  readonly [FileId]: { readonly _Kind: (_: never) => Kind; readonly _Args: (_: never) => Args };
}

/** A file `pkgs.callPackage` can call, with the arguments it can be given. */
export type PackageFile<Args> = NixFile<"package", Args>;

/** A file `imports` can list. */
export type ModuleFile = NixFile<"module", never>;

/** What an argument of a package file can be given. */
export type Argument = Nix.NixValue | Nix.Nix<unknown>;

const variance = { _Kind: (_: never) => _, _Args: (_: never) => _ };

/** The value an import of `relative` stands for. The import hook calls it; modules import files. */
export const file = (relative: string): NixFile<"package" | "module", never> => ({
  ...Nix.make<Nix.NixPath>(Ast.path(relative)),
  [FileId]: variance,
});

const marker = "typeflake-nix";

/**
 * Lets Node import `.nix` files from modules. TypeScript reads `typeflake types`' declarations for
 * them instead, through `allowArbitraryExtensions` and `rootDirs`. The CLI registers this before it
 * imports modules; a test that renders modules registers it too.
 */
export const registerImports = (): void => {
  registerHooks({
    resolve: (specifier, context, next) => {
      if (!/^\.\.?\/.*\.nix$/.test(specifier) || context.parentURL === undefined)
        return next(specifier, context);
      const url = new URL(specifier, context.parentURL);
      url.searchParams.set(marker, specifier);
      return { url: url.href, format: "module", shortCircuit: true };
    },
    load: (url, context, next) => {
      const specifier = new URL(url).searchParams.get(marker);
      if (specifier === null) return next(url, context);
      // The import's specifier is the path from the module's file, which is also where the
      // rendered `.nix` file is.
      return {
        format: "module",
        shortCircuit: true,
        source: `import { file } from ${JSON.stringify(import.meta.url)};\nexport default file(${JSON.stringify(specifier)});\n`,
      };
    },
  });
};
