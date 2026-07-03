import { type Module } from "./module.ts";
import { type NixExpr, type NixInput, nixExpr, rawNix } from "./nix/expr.ts";
import { renderNixValue } from "./nix/render.ts";

export interface HomeNixOSModuleOptions {
  readonly users: { readonly [username: string]: NixInput };
}

export const Home = {
  nixosModule(homeManager: NixExpr, options: HomeNixOSModuleOptions): Module {
    return nixExpr(
      "module",
      `({ pkgs, ... }: ${renderNixValue({
        imports: [rawNix(`${homeManager.code}.nixosModules.home-manager`)],
        "home-manager": {
          users: options.users,
        },
      })})`,
    );
  },
};
