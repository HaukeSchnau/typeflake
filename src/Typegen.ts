import { isGroup, type NixOption, type NixType, type OptionTree } from "./Probe.ts"

export interface GenerateOptions {
  /** The module class the probe started in, such as `nixos`. */
  readonly rootClass: string
  /** Where the generated file imports Typeflake's own types from. */
  readonly importFrom: string
}

/**
 * TypeScript declarations for the values a probed option tree evaluates to. Every group and submodule
 * becomes an interface named after the first option path it appears at, and identical ones share it.
 */
export const generate = (tree: OptionTree, options: GenerateOptions): string => {
  const declarations: Array<string> = []
  const names = new Set<string>()
  const bodies = new Map<string, string>()
  const classes = new Map<string, string>()
  const optionAliases = new Map<string, string>()
  const referenced = referencedOptions(tree)

  const reserve = (base: string): string => {
    let name = base
    for (let n = 2; names.has(name); n++) name = `${base}${n}`
    names.add(name)
    return name
  }

  const hoist = (kind: "interface" | "type", path: ReadonlyArray<string>, body: string): string => {
    const existing = bodies.get(body)
    if (existing !== undefined) return existing
    const name = reserve(pascal(path))
    bodies.set(body, name)
    declarations.push(kind === "interface" ? `export interface ${name} ${body}` : `export type ${name} = ${body}`)
    return name
  }

  // Long unions, such as the expansion of a recursive settings format, read better and dedupe as aliases.
  const composite = (path: ReadonlyArray<string>, body: string): string =>
    body.length > 80 ? hoist("type", [...path, "value"], body) : body

  // A freeform submodule accepts any other attribute as `freeform`. TypeScript requires every field to
  // fit the index signature, so it also admits the fields' own types.
  const objectBody = (tree: OptionTree, path: ReadonlyArray<string>, freeform?: string): string => {
    const fields = Object.keys(tree)
      .toSorted()
      .flatMap((key) => {
        const node = tree[key]!
        if (isGroup(node)) {
          return [{ key, docs: "", type: hoist("interface", [...path, key], objectBody(node.group, [...path, key])) }]
        }
        if (node.visible === false) return []
        return [{ key, docs: doc(node), type: optionType(node, [...path, key]) }]
      })
    const lines = fields.map((field) => `${field.docs}readonly ${property(field.key)}: ${field.type}`)
    if (freeform !== undefined) {
      lines.push(`readonly [name: string]: ${[...new Set([freeform, ...fields.map((field) => field.type)])].join(" | ")}`)
    }
    return lines.length === 0 ? "{}" : `{\n${lines.map(indent).join("\n")}\n}`
  }

  // An option whose type contains itself gets an alias that the inner reference can name. References
  // only point at options being expanded, so the alias leaves scope with its option.
  const optionType = (option: NixOption, path: ReadonlyArray<string>): string => {
    if (option.id === null || !referenced.has(option.id) || option.type.optionRef !== undefined) {
      return typeOf(option.type, path)
    }
    const name = reserve(pascal(path))
    const outer = optionAliases.get(option.id)
    optionAliases.set(option.id, name)
    declarations.push(`export type ${name} = ${typeOf(option.type, path)}`)
    if (outer === undefined) optionAliases.delete(option.id)
    else optionAliases.set(option.id, outer)
    return name
  }

  const typeOf = (type: NixType, path: ReadonlyArray<string>): string => {
    if (type.truncated === true) return "NixValue"
    if (type.classRef !== undefined) return classes.get(type.classRef) ?? "NixValue"
    if (type.optionRef !== undefined) return optionAliases.get(type.optionRef) ?? "NixValue"
    const nested = type.nested ?? {}
    const inner = (key: string) => (nested[key] === undefined ? "NixValue" : typeOf(nested[key], path))

    switch (type.name.split(" ")[0]) {
      case "bool":
      case "boolByOr":
        return "boolean"
      case "str":
      case "separatedString":
      case "nonEmptyStr":
      case "singleLineStr":
      case "strMatching":
      case "passwdEntry":
        return "string"
      case "int":
      case "float":
      case "number":
      case "port":
      case "unsignedInt":
      case "unsignedInt8":
      case "unsignedInt16":
      case "unsignedInt32":
      case "signedInt8":
      case "signedInt16":
      case "signedInt32":
      case "positiveInt":
      case "intBetween":
      case "numberBetween":
      case "numberNonnegative":
      case "numberPositive":
      case "nonnegativeFloat":
      case "nonzeroInt":
        return "number"
      case "path":
      case "absolute":
      case "absolutePath":
      case "pathInStore":
      case "pathNotInStore":
      case "externalPath":
        return "NixPath"
      case "package":
      case "shellPackage":
        return "Package"
      case "enum":
        return (type.values ?? []).map((value) => JSON.stringify(value)).join(" | ") || "never"
      case "nullOr":
        return composite(path, `${inner("elemType")} | null`)
      case "listOf":
        return composite(path, `ReadonlyArray<${inner("elemType")}>`)
      case "attrsOf":
      case "lazyAttrsOf":
      case "attrsWith":
        return composite(path, `{ readonly [name: string]: ${inner("elemType")} }`)
      case "oneOf":
        return composite(path, [...new Set((type.alternatives ?? []).map((alternative) => typeOf(alternative, path)))].join(" | "))
      case "coercedTo":
        return composite(path, `${inner("coercedType")} | ${inner("finalType")}`)
      case "unique":
      case "uniq":
        return inner("elemType")
      case "attrTag":
        return composite(
          path,
          Object.keys(nested)
            .toSorted()
            .map((tag) => `{ readonly ${property(tag)}: ${inner(tag)} }`)
            .join(" | "),
        )
      case "functionTo":
        return "NixFunction"
      case "anything":
      case "unspecified":
      case "raw":
      case "attrs":
        return "NixValue"
      case "submodule": {
        // `freeformType` types all undeclared attributes together, usually as `attrsOf value`.
        const freeformType = nested.freeformType
        const freeformValue =
          freeformType?.nested?.elemType !== undefined && /^(lazyA|a)ttrs(Of|With)$/.test(freeformType.name)
            ? freeformType.nested.elemType
            : freeformType
        const freeform = freeformValue === undefined ? undefined : typeOf(freeformValue, path)
        if (type.class !== undefined && !classes.has(type.class)) {
          const name = reserve(`${pascal([type.class])}Options`)
          classes.set(type.class, name)
          declarations.push(`export interface ${name} ${objectBody(type.options ?? {}, [type.class], freeform)}`)
          return name
        }
        return hoist("interface", path, objectBody(type.options ?? {}, path, freeform))
      }
      default:
        return `Unsupported<${JSON.stringify(type.name)}>`
    }
  }

  const root = reserve(`${pascal([options.rootClass])}Options`)
  classes.set(options.rootClass, root)
  declarations.unshift(`export interface ${root} ${objectBody(tree, [])}`)

  return [
    "// Generated by Typeflake from a probed option tree. Do not edit.",
    `import type { NixFunction, NixPath, NixValue, Package, Unsupported } from ${JSON.stringify(options.importFrom)}`,
    "",
    declarations.join("\n\n"),
    "",
  ].join("\n")
}

const referencedOptions = (tree: OptionTree): ReadonlySet<string> => {
  const ids = new Set<string>()
  const visitType = (type: NixType): void => {
    if (type.optionRef !== undefined) ids.add(type.optionRef)
    Object.values(type.nested ?? {}).forEach(visitType)
    type.alternatives?.forEach(visitType)
    if (type.options !== undefined) visitTree(type.options)
  }
  const visitTree = (tree: OptionTree): void =>
    Object.values(tree).forEach((node) => (isGroup(node) ? visitTree(node.group) : visitType(node.type)))
  visitTree(tree)
  return ids
}

const doc = (option: NixOption): string => {
  const lines = [
    ...(option.description?.trim().split("\n") ?? []),
    ...(option.default === null ? [] : [`@default ${option.default.replaceAll("\n", " ")}`]),
  ]
  if (lines.length === 0) return ""
  return `/**\n${lines.map((line) => ` * ${line.replaceAll("*/", "*\\/")}`.trimEnd()).join("\n")}\n */\n`
}

const indent = (text: string): string =>
  text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")

const property = (key: string): string => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key))

const pascal = (path: ReadonlyArray<string>): string => {
  const name = path
    .flatMap((segment) => segment.split(/[^A-Za-z0-9]+/))
    .filter((word) => word.length > 0)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join("")
  return /^[0-9]/.test(name) ? `_${name}` : name || "Root"
}
