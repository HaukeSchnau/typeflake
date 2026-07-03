import { nixExpr, type NixExpr, type NixInput } from "./nix/expr.ts";
import { renderNixValue } from "./nix/render.ts";

export type Module = NixExpr<"module">;

export const moduleFromConfig = (config: {
  readonly [key: string]: NixInput | undefined;
}): Module => nixExpr("module", `({ pkgs, ... }: ${renderNixValue(config)})`);

export const rawModule = (code: string): Module => nixExpr("module", code);
