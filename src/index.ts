export { check, type CheckOptions } from "./check.ts";
export { doctor, renderDoctorReport, type DoctorCheck, type DoctorReport } from "./doctor.ts";
export { Flake, renderFlake, resolveFlakeSpec, type DevShell, type FlakeSpec } from "./flake.ts";
export { Home, type HomeNixOSModuleOptions } from "./home.ts";
export { type Module, moduleFromConfig, rawModule } from "./module.ts";
export { type NixExpr, type NixInput, type NixValue, rawNix } from "./nix/expr.ts";
export { renderNixValue } from "./nix/render.ts";
export {
  NixOS,
  type NixOSConfiguration,
  type NixOSConfigurationOptions,
  type System,
} from "./nixos.ts";
export { type PackageRef, pkgs } from "./packages.ts";
export { sync, type SyncOptions } from "./sync.ts";
