export { check, type CheckOptions } from "./check.ts";
export { doctor, renderDoctorReport, type DoctorCheck, type DoctorReport } from "./doctor.ts";
export {
  Flake,
  renderFlake,
  resolveFlakeSpec,
  type DevShell,
  type FlakeSpec,
  type TypeflakeFlake,
} from "./flake.ts";
export { Home, type HomeNixOSModuleOptions } from "./home.ts";
export {
  initProject,
  renderInitSummary,
  type InitOptions,
  type InitPackageManager,
  type InitResult,
} from "./init.ts";
export { type Module, moduleFromConfig, rawModule } from "./module.ts";
export {
  type NixExpr,
  type NixInput,
  type NixValue,
  type UnsupportedNixOptionExpr,
  rawNix,
  unsupportedNixOption,
} from "./nix/expr.ts";
export { renderNixValue } from "./nix/render.ts";
export type {
  HomeManagerGeneratedConfig,
  NixOptionValue,
  NixOSGeneratedConfig,
  UnsupportedNixOption,
} from "./generated/options.ts";
export {
  defaultHomeManagerOptionPaths,
  defaultNixOSOptionPaths,
  flakeInput,
  collectUnsupportedOptions,
  defaultOptionScopes,
  generateOptionTypeFile,
  generateProjectOptionTypes,
  generateOptionTypes,
  makeOptionMetadataDocument,
  optionMetadataDocumentToJson,
  parseOptionMetadataDocument,
  parseOptionProbePayload,
  probeProjectOptions,
  projectFlakeInput,
  readOptionMetadataDocument,
  renderOptionProbeExpression,
  renderGeneratedOptions,
  resolveFlakeReference,
  toTypeScriptType,
  type GenerateOptionTypeFileOptions,
  type GenerateProjectOptions,
  type OptionMetadataDocument,
  type OptionMetadataSource,
  type OptionIR,
  type OptionPath,
  type OptionProbePayload,
  type OptionScope,
  type OptionTypeRoot,
  type OptionTypeIR,
  type ProbeProjectOptions,
} from "./options.ts";
export {
  NixOS,
  type NixOSConfiguration,
  type NixOSConfigurationOptions,
  type System,
} from "./nixos.ts";
export { type PackageRef, pkgs } from "./packages.ts";
export { sync, type SyncOptions } from "./sync.ts";
