import { nixExpr, type NixExpr } from "./nix/expr.ts";
import { renderNixValue } from "./nix/render.ts";

export type Module = NixExpr<"module">;

export const moduleFromConfig = (config: object): Module =>
  nixExpr("module", `({ pkgs, ... }: ${renderNixValue(config)})`);

export const rawModule = (code: string): Module => nixExpr("module", code);
