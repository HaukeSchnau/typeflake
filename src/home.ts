import { type Module } from "./module.ts";
import { type NixExpr, rawNix, type NixValue } from "./nix/expr.ts";
import { renderNixValue } from "./nix/render.ts";

export interface HomeNixOSModuleOptions {
  readonly users: { readonly [username: string]: NixValue };
}

export const Home = {
  nixosModule(homeManager: NixExpr, options: HomeNixOSModuleOptions): Module {
    return rawNix<Module>(
      `({ pkgs, ... }: ${renderNixValue({
        imports: [rawNix(`${homeManager.code}.nixosModules.home-manager`)],
        "home-manager": {
          users: options.users,
        },
      })})`,
    );
  },
};
