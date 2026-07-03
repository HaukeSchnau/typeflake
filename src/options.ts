export {
  generateOptionTypeFile,
  generateOptionTypes,
  toTypeScriptType,
  type GenerateOptionTypeFileOptions,
  type GenerateOptionTypesOptions,
  type OptionTypeRoot,
} from "./options/generate.ts";
export {
  defaultHomeManagerOptionPaths,
  defaultNixOSOptionPaths,
  flakeInput,
  renderOptionProbeExpression,
  type OptionProbeOptions,
  type OptionProbeScope,
} from "./options/probe.ts";
export type { OptionIR, OptionPath, OptionScope, OptionSetIR } from "./options/ir.ts";
