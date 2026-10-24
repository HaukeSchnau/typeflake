import type { Register } from "./index.ts";
import type { Interpolation, Nix, NixPath, NixProxy, NixValue, Package } from "./Nix.ts";

type Text = string | Nix<string>;

/** The parts of nixpkgs' `lib` that modules use most. `raw` reaches the rest. */
export interface Lib {
  /** The package's main program, from `meta.mainProgram`. */
  readonly getExe: (pkg: Nix<Package>) => Nix<string>;
  readonly "getExe'": (pkg: Nix<Package>, program: Text) => Nix<string>;
  readonly concatStringsSep: (
    separator: Text,
    strings: ReadonlyArray<Text> | Nix<ReadonlyArray<string>>,
  ) => Nix<string>;
  readonly optionalString: (condition: boolean | Nix<boolean>, text: Text) => Nix<string>;
  readonly makeBinPath: (packages: ReadonlyArray<Nix<Package>>) => Nix<string>;
}

export interface Platform {
  readonly isDarwin: boolean;
  readonly isLinux: boolean;
  readonly system: string;
}

export interface Stdenv {
  readonly hostPlatform: Platform;
}

export interface WriteShellApplication {
  readonly name: Text;
  readonly text: Text;
  readonly runtimeInputs?: ReadonlyArray<Nix<Package>>;
  readonly runtimeEnv?: { readonly [name: string]: Interpolation };
  readonly excludeShellChecks?: ReadonlyArray<string>;
  readonly bashOptions?: ReadonlyArray<string>;
}

/** The functions in `pkgs` that Typeflake types. */
export interface Builders {
  readonly stdenv: Stdenv;
  readonly callPackage: (
    path: Nix<NixPath>,
    overrides: { readonly [name: string]: NixValue | Nix<unknown> },
  ) => NixProxy<Package>;
  readonly writeShellApplication: (options: WriteShellApplication) => NixProxy<Package>;
  readonly writeShellScriptBin: (name: Text, text: Text) => NixProxy<Package>;
  readonly writeText: (name: Text, text: Text) => NixProxy<Package>;
}

/** The names `typeflake types` found in the probed `pkgs`, or any name before a probe. */
type Packages = Register extends { readonly pkgs: infer P }
  ? P
  : { readonly [name: string]: Package };

/** `pkgs`: the builders typed here, and a package for every other name. Module arguments wrap it in `NixProxy`. */
export type Pkgs = Omit<Packages, keyof Builders> & Builders;
