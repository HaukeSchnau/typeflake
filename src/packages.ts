import { nixAttrPath, type NixExpr } from "./nix/expr.ts";

export type PackageRef<AttrPath extends string = string> = NixExpr<"package"> & {
  readonly attrPath: AttrPath;
};

interface KnownTopLevelPackages {
  readonly git: PackageRef<"git">;
  readonly neovim: PackageRef<"neovim">;
  readonly nodejs: PackageRef<"nodejs">;
}

export const pkg = <const AttrPath extends string>(attrPath: AttrPath): PackageRef<AttrPath> => {
  const parts = attrPath.split(".");
  return {
    ...nixAttrPath("package", ["pkgs", ...parts]),
    attrPath,
  };
};

export const pkgs: KnownTopLevelPackages = {
  git: pkg("git"),
  neovim: pkg("neovim"),
  nodejs: pkg("nodejs"),
};
