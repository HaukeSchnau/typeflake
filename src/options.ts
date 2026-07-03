export {
  defaultOptionScopes,
  generateProjectOptionTypes,
  probeProjectOptions,
  readOptionMetadataDocument,
  renderGeneratedOptions,
  resolveFlakeReference,
  type GenerateProjectOptions,
  type ProbeProjectOptions,
} from "./options/commands.ts";
export {
  makeOptionMetadataDocument,
  optionMetadataDocumentToJson,
  parseOptionMetadataDocument,
  parseOptionProbePayload,
  type OptionMetadataDocument,
  type OptionMetadataSource,
  type OptionProbePayload,
} from "./options/document.ts";
export {
  collectUnsupportedOptions,
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
  projectFlakeInput,
  renderOptionProbeExpression,
  type OptionProbeOptions,
  type OptionProbeScope,
} from "./options/probe.ts";
export type { OptionIR, OptionPath, OptionScope, OptionSetIR, OptionTypeIR } from "./options/ir.ts";
