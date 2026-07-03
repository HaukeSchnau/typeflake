import { nixExpr, type NixExpr } from "../nix/expr.ts";
import { renderNixValue } from "../nix/render.ts";
import type { OptionPath } from "./ir.ts";

export interface OptionProbeScope {
  readonly optionPaths: readonly OptionPath[];
}

export interface OptionProbeOptions {
  readonly homeManager?: NixExpr;
  readonly homeManagerOptions?: OptionProbeScope;
  readonly nixosOptions?: OptionProbeScope;
  readonly nixpkgs: NixExpr;
  readonly system: string;
}

export const defaultNixOSOptionPaths = [
  ["boot", "loader", "grub", "devices"],
  ["environment", "systemPackages"],
  ["fileSystems"],
  ["services", "openssh", "enable"],
  ["system", "stateVersion"],
  ["users", "users"],
] as const satisfies readonly OptionPath[];

export const defaultHomeManagerOptionPaths = [
  ["home", "stateVersion"],
  ["programs", "git", "enable"],
] as const satisfies readonly OptionPath[];

export const renderOptionProbeExpression = (options: OptionProbeOptions): string => {
  const nixosPaths = options.nixosOptions?.optionPaths ?? [];
  const homeManagerPaths = options.homeManagerOptions?.optionPaths ?? [];

  return `let
  nixpkgs = ${options.nixpkgs.code};
  system = ${renderNixValue(options.system)};
  nixpkgsPath = nixpkgs.outPath or nixpkgs;
  pkgs = import nixpkgsPath { inherit system; };

  renderDoc = value:
    if value == null then null
    else if builtins.isString value then value
    else if builtins.isAttrs value && value ? text then value.text
    else builtins.toJSON value;

  getPath = options: path:
    builtins.foldl' (value: key: value.\${key}) options path;

  optionToIR = scope: options: path:
    let option = getPath options path; in {
      inherit path scope;
      declarations = map toString (option.declarations or []);
      defaultText = renderDoc (option.defaultText or null);
      description = renderDoc (option.description or null);
      exampleText = renderDoc (option.example or null);
      internal = option.internal or false;
      readOnly = option.readOnly or false;
      type = option.type.name or option.type.description or "unknown";
      visible = option.visible or true;
    };

  nixosEval = import "\${nixpkgsPath}/nixos/lib/eval-config.nix" {
    inherit system;
    modules = [];
  };
${renderHomeManagerBinding(options)}
in {
  nixos = map (optionToIR "nixos" nixosEval.options) ${renderPathList(nixosPaths)};
  homeManager = ${renderHomeManagerOptions(options, homeManagerPaths)};
}`;
};

export const flakeInput = (name: string): NixExpr<"flakeInput"> =>
  nixExpr(
    "flakeInput",
    `(builtins.getFlake ("git+file://" + toString ./.))
    .inputs.${name}`,
  );

const renderPathList = (paths: readonly OptionPath[]): string => renderNixValue(paths);

const renderHomeManagerBinding = (options: OptionProbeOptions): string => {
  if (options.homeManager === undefined) return "";

  return `  homeManager = ${options.homeManager.code};
  homeManagerEval = homeManager.lib.homeManagerConfiguration {
    inherit pkgs;
    modules = [{
      home.homeDirectory = "/home/typeflake";
      home.stateVersion = "25.11";
      home.username = "typeflake";
    }];
  };
`;
};

const renderHomeManagerOptions = (
  options: OptionProbeOptions,
  paths: readonly OptionPath[],
): string => {
  if (options.homeManager === undefined) return "[]";

  return `map (optionToIR "home-manager" homeManagerEval.options) ${renderPathList(paths)}`;
};
