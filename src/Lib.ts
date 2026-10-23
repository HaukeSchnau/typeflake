import type { Interpolation, Nix, NixPath, NixProxy, NixValue, Package } from "./Nix.ts"

type Text = string | Nix<string>

/** The parts of nixpkgs' `lib` that modules use most. `raw` reaches the rest. */
export interface Lib {
  /** The package's main program, from `meta.mainProgram`. */
  readonly getExe: (pkg: Nix<Package>) => Nix<string>
  readonly "getExe'": (pkg: Nix<Package>, program: Text) => Nix<string>
  readonly concatStringsSep: (separator: Text, strings: ReadonlyArray<Text> | Nix<ReadonlyArray<string>>) => Nix<string>
  readonly optionalString: (condition: boolean | Nix<boolean>, text: Text) => Nix<string>
  readonly makeBinPath: (packages: ReadonlyArray<Nix<Package>>) => Nix<string>
}

export interface Platform {
  readonly isDarwin: boolean
  readonly isLinux: boolean
  readonly system: string
}

export interface Stdenv {
  readonly hostPlatform: Platform
}

export interface WriteShellApplication {
  readonly name: Text
  readonly text: Text
  readonly runtimeInputs?: ReadonlyArray<Nix<Package>>
  readonly runtimeEnv?: { readonly [name: string]: Interpolation }
  readonly excludeShellChecks?: ReadonlyArray<string>
  readonly bashOptions?: ReadonlyArray<string>
}

/** `pkgs`: any attribute is a package, besides the builders typed here. Module arguments wrap it in `NixProxy`. */
export type Pkgs = { readonly [name: string]: Package } & {
  readonly stdenv: Stdenv
  readonly callPackage: (path: Nix<NixPath>, overrides: { readonly [name: string]: NixValue | Nix<unknown> }) => NixProxy<Package>
  readonly writeShellApplication: (options: WriteShellApplication) => NixProxy<Package>
  readonly writeShellScriptBin: (name: Text, text: Text) => NixProxy<Package>
  readonly writeText: (name: Text, text: Text) => NixProxy<Package>
}
