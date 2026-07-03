import { moduleFromConfig, type Module } from "./module.ts";
import type { NixOSGeneratedConfig } from "./generated/options.ts";
import { nixExpr, rawNix, type NixExpr, type NixInput } from "./nix/expr.ts";
import { renderList, renderNixValue } from "./nix/render.ts";

export type System =
  | "aarch64-darwin"
  | "aarch64-linux"
  | "x86_64-darwin"
  | "x86_64-linux"
  | (string & {});

export interface NixOSConfigurationOptions {
  readonly system: System;
  readonly modules: readonly Module[];
}

export type NixOSConfiguration = NixExpr<"nixosConfiguration">;

export const NixOS = {
  config(config: NixOS.Config): NixOS.Config {
    return config;
  },

  module: moduleFromConfig,

  configuration(options: NixOSConfigurationOptions): NixOSConfiguration {
    const rendered = renderNixValue({
      modules: rawNix(renderList(options.modules, 1)),
      system: options.system,
    });

    return nixExpr("nixosConfiguration", `nixpkgs.lib.nixosSystem ${rendered}`);
  },
};

export type NixOSModuleConfig = { readonly [key: string]: NixInput | undefined };

export namespace NixOS {
  export type Config = NixOSGeneratedConfig;
}
