import * as Ast from "./Ast.ts";
import type { Register } from "./index.ts";
import * as Nix from "./Nix.ts";
import type { Interpolation, NixPath, NixProxy, Package } from "./Nix.ts";
import type { Argument, PackageFile } from "./NixFile.ts";

type Text = string | Nix.Nix<string>;

/** The parts of nixpkgs' `lib` that modules use most. `raw` reaches the rest. */
export interface Lib {
  /** The package's main program, from `meta.mainProgram`. */
  readonly getExe: (pkg: Nix.Nix<Package>) => Nix.Nix<string>;
  /** A program in the package's `bin`. JavaScript can't name it, so modules call `exe`. */
  readonly "getExe'": <const Name extends string>(
    pkg: Nix.Nix<Package<Name>>,
    program: BinaryOf<Name> | Nix.Nix<string>,
  ) => Nix.Nix<string>;
  readonly concatStringsSep: (
    separator: Text,
    strings: ReadonlyArray<Text> | Nix.Nix<ReadonlyArray<string>>,
  ) => Nix.Nix<string>;
  readonly optionalString: (condition: boolean | Nix.Nix<boolean>, text: Text) => Nix.Nix<string>;
  readonly makeBinPath: (packages: ReadonlyArray<Nix.Nix<Package>>) => Nix.Nix<string>;
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
  readonly runtimeInputs?: ReadonlyArray<Nix.Nix<Package>>;
  readonly runtimeEnv?: { readonly [name: string]: Interpolation };
  readonly excludeShellChecks?: ReadonlyArray<string>;
  readonly bashOptions?: ReadonlyArray<string>;
}

/**
 * The programs in a package's `bin`, as `typeflake types` found them in the binary cache, or any
 * name for a package it didn't look up.
 */
export type BinaryOf<Name extends string> = Register extends { readonly binaries: infer Binaries }
  ? Name extends keyof Binaries
    ? Binaries[Name]
    : string
  : string;

/** What a file takes: the arguments its declaration lists, or any for a plain path. */
type ArgumentsOf<File> =
  File extends PackageFile<infer Args> ? Args : { readonly [name: string]: Argument };

/** `pkgs.callPackage`, typed by the file's arguments when the module imports it. */
export type CallPackage = <const File extends Nix.Nix<NixPath>>(
  file: File,
  args: NoInfer<ArgumentsOf<File>>,
) => NixProxy<Package>;

/** The functions in `pkgs` that Typeflake types. */
export interface Builders {
  readonly stdenv: Stdenv;
  readonly callPackage: CallPackage;
  readonly writeShellApplication: (options: WriteShellApplication) => NixProxy<Package>;
  readonly writeShellScriptBin: (name: Text, text: Text) => NixProxy<Package>;
  readonly writeText: (name: Text, text: Text) => NixProxy<Package>;
}

/** The names `typeflake types` found in the probed `pkgs`, or any name before a probe. */
type Packages = Register extends { readonly pkgs: infer P }
  ? P
  : { readonly [name: string]: Package };

/** `pkgs`: the builders typed here, and a package for every other name. Module arguments wrap it in `NixProxy`. */
export type Pkgs = Packages & Builders;

/** The names `Builders` types, which the generated `Packages` leaves to it. */
export const builders = [
  "stdenv",
  "callPackage",
  "writeShellApplication",
  "writeShellScriptBin",
  "writeText",
] as const satisfies ReadonlyArray<keyof Builders>;

/**
 * `lib.getExe' pkg "program"`: the path of a program in the package's `bin`. `typeflake types` lists
 * the programs of the packages a project uses, so a program the package doesn't have fails.
 */
export const exe = <const Name extends string>(
  pkg: Nix.Nix<Package<Name>>,
  program: BinaryOf<Name> | Nix.Nix<string>,
): Nix.Nix<string> =>
  Nix.make(
    Ast.apply(Ast.select(Ast.variable("lib"), "getExe'"), Nix.exprOf(pkg), Nix.toExpr(program)),
  );
