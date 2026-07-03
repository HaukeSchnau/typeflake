import { rawNix, type NixExpr, type NixValue } from "./nix/expr.ts";
import { renderNixValue } from "./nix/render.ts";

export type Module = NixExpr<"module">;

export const moduleFromConfig = (config: {
  readonly [key: string]: NixValue | undefined;
}): Module => rawNix<Module>(`({ pkgs, ... }: ${renderNixValue(config)})`);

export const rawModule = (code: string): Module => rawNix<Module>(code);
