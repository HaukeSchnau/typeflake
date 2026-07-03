import { type Module } from "./module.ts";
import type { HomeManagerGeneratedConfig } from "./generated/options.ts";
import { type NixExpr, nixExpr, rawNix } from "./nix/expr.ts";
import { renderNixValue } from "./nix/render.ts";

export interface HomeNixOSModuleOptions {
  readonly users: { readonly [username: string]: Home.Config };
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

export namespace Home {
  export type Config = HomeManagerGeneratedConfig;
}
