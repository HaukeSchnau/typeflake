import * as Module from "./Module.ts";

/**
 * The probed option types of each module class, by class: generated declarations add `nixos`,
 * `darwin` and `homeManager`, and a project adds `args` for its `specialArgs`. It lives here because
 * `declare module "typeflake"` only merges into interfaces this module declares itself.
 */
export interface Register {}

export * as Ast from "./Ast.ts";
export {
  type Definition,
  mkAfter,
  mkBefore,
  mkDefault,
  mkForce,
  mkIf,
  mkMerge,
  mkOverride,
  type Override,
  type Data,
} from "./Definition.ts";
export type { Lib, Pkgs } from "./Lib.ts";
export * as Module from "./Module.ts";
export {
  builtins,
  ifThenElse,
  type Nix,
  nix,
  type NixFunction,
  type NixPath,
  type NixProxy,
  type NixValue,
  type Package,
  path,
  raw,
  type Unsupported,
} from "./Nix.ts";
export * as Options from "./Options.ts";
export * as Probe from "./Probe.ts";
export * as Typegen from "./Typegen.ts";
export * as Types from "./Types.ts";

export const NixOS = { module: Module.make("nixos") };
export const Darwin = { module: Module.make("darwin") };
export const HomeManager = { module: Module.make("homeManager") };
