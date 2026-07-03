import { nixAttrPath, type NixExpr } from "./nix/expr.ts";

export type PackageRef<AttrPath extends string = string> = NixExpr<"package"> & {
  readonly attrPath: AttrPath;
};

interface KnownTopLevelPackages {
  readonly git: PackageRef<"git">;
  readonly neovim: PackageRef<"neovim">;
  readonly nodejs: PackageRef<"nodejs">;
}

type PackageSet<Path extends string = ""> = PackageRef<Path> & {
  readonly [key: string]: PackageSet<Path extends "" ? string : `${Path}.${string}`>;
} & (Path extends "" ? KnownTopLevelPackages : {});

const createPackageProxy = (parts: readonly string[]): PackageSet => {
  const expr = nixAttrPath("package", ["pkgs", ...parts]) as PackageRef;

  return new Proxy(expr, {
    get(target, property, receiver) {
      if (typeof property === "symbol" || property in target) {
        return Reflect.get(target, property, receiver);
      }

      if (property === "attrPath") {
        return parts.join(".");
      }

      return createPackageProxy([...parts, property]);
    },
  }) as PackageSet;
};

export const pkgs = createPackageProxy([]);
