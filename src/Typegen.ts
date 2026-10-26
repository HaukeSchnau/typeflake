import { isGroup, type NixOption, type NixType, type OptionTree } from "./Probe.ts";

export interface GenerateOptions {
  /** The module class the probe started in, such as `nixos`. */
  readonly rootClass: string;
  /** Where the generated file imports Typeflake's own types from. */
  readonly importFrom: string;
  /** Module classes another generated file already registers. */
  readonly registered?: ReadonlySet<string>;
  /**
   * Attribute-set options whose attribute names a provider knows, by option path from the
   * configuration's root: the TypeScript type of the names, such as `Register["sopsSecrets"]`.
   */
  readonly names?: ReadonlyMap<string, string>;
}

export interface Generated {
  readonly source: string;
  /** The module classes this file registers. */
  readonly registered: ReadonlyArray<string>;
}

/**
 * TypeScript declarations for the values a probed option tree evaluates to. Every group and submodule
 * becomes an interface named after the first option path it appears at, and identical ones share it.
 */
export const generate = (tree: OptionTree, options: GenerateOptions): Generated => {
  const declarations: Array<string> = [];
  const names = new Set<string>();
  const bodies = new Map<string, string>();
  const classes = new Map<string, string>();
  const optionAliases = new Map<string, string>();
  const referenced = referencedOptions(tree);

  const reserve = (base: string): string => {
    let name = base;
    for (let n = 2; names.has(name); n++) name = `${base}${n}`;
    names.add(name);
    return name;
  };

  const hoist = (kind: "interface" | "type", path: ReadonlyArray<string>, body: string): string => {
    const existing = bodies.get(body);
    if (existing !== undefined) return existing;
    const name = reserve(pascal(path));
    bodies.set(body, name);
    declarations.push(
      kind === "interface" ? `export interface ${name} ${body}` : `export type ${name} = ${body}`,
    );
    return name;
  };

  // Long unions, such as the expansion of a recursive settings format, read better and dedupe as aliases.
  const composite = (path: ReadonlyArray<string>, body: string): string =>
    body.length > 80 ? hoist("type", [...path, "value"], body) : body;

  // A freeform submodule accepts any other attribute as `freeform`. TypeScript requires every field to
  // fit the index signature, so it also admits the fields' own types. `scope` is the tree of the
  // submodule or configuration the fields belong to, where renamed options find their new path.
  const objectBody = (
    tree: OptionTree,
    path: ReadonlyArray<string>,
    scope: OptionTree,
    freeform?: string,
  ): string => {
    const fields = Object.entries(tree)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .flatMap(([key, node]) => {
        if (isGroup(node)) {
          return [
            {
              key,
              docs: "",
              type: hoist(
                "interface",
                [...path, key],
                objectBody(node.group, [...path, key], scope),
              ),
            },
          ];
        }
        if (node.visible !== false) {
          return [{ key, docs: doc(node), type: optionType(node, [...path, key]) }];
        }
        // nixpkgs keeps a renamed option as a hidden alias of the new one, which the editor shows
        // struck through.
        const renamed = renamedTo(node);
        const target = renamed === undefined ? undefined : find(scope, renamed);
        if (renamed === undefined || target === undefined) return [];
        return [
          {
            key,
            docs: `/**\n * @deprecated Renamed to \`${renamed.join(".")}\`.\n */\n`,
            type: optionType(target, [...path, key]),
          },
        ];
      });
    const lines = fields.map(
      (field) => `${field.docs}readonly ${property(field.key)}: ${field.type}`,
    );
    if (freeform !== undefined) {
      lines.push(
        `readonly [name: string]: ${[...new Set([freeform, ...fields.map((field) => field.type)])].join(" | ")}`,
      );
    }
    return lines.length === 0 ? "{}" : `{\n${lines.map(indent).join("\n")}\n}`;
  };

  // An option whose type contains itself gets an alias that the inner reference can name. References
  // only point at options being expanded, so the alias leaves scope with its option.
  const optionType = (option: NixOption, path: ReadonlyArray<string>): string => {
    if (option.id === null || !referenced.has(option.id) || option.type.optionRef !== undefined) {
      return typeOf(option.type, path);
    }
    const name = reserve(pascal(path));
    const outer = optionAliases.get(option.id);
    optionAliases.set(option.id, name);
    declarations.push(`export type ${name} = ${typeOf(option.type, path)}`);
    if (outer === undefined) optionAliases.delete(option.id);
    else optionAliases.set(option.id, outer);
    return name;
  };

  const typeOf = (type: NixType, path: ReadonlyArray<string>): string => {
    if (type.truncated === true) return "NixValue";
    if (type.classRef !== undefined) return classes.get(type.classRef) ?? "NixValue";
    if (type.optionRef !== undefined) return optionAliases.get(type.optionRef) ?? "NixValue";
    const nested = type.nested ?? {};
    const inner = (key: string) =>
      nested[key] === undefined ? "NixValue" : typeOf(nested[key], path);

    switch (type.name.split(" ")[0]) {
      case "bool":
      case "boolByOr":
        return "boolean";
      case "str":
      case "separatedString":
      case "nonEmptyStr":
      case "singleLineStr":
      case "strMatching":
      case "passwdEntry":
        return "string";
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
        return "number";
      // A derivation is a path too, unless the path must be outside the store.
      case "path":
        return type.inStore === false ? "NixPath" : "NixPath | Package";
      case "absolute":
      case "absolutePath":
      case "pathInStore":
      case "pathNotInStore":
      case "externalPath":
        return "NixPath";
      case "package":
      case "shellPackage":
        return "Package";
      case "enum":
        return (type.values ?? []).map((value) => JSON.stringify(value)).join(" | ") || "never";
      case "nullOr":
        return composite(path, `${inner("elemType")} | null`);
      case "listOf":
        return composite(path, `ReadonlyArray<${inner("elemType")}>`);
      case "attrsOf":
      case "lazyAttrsOf":
      case "attrsWith": {
        const known = options.names?.get(path.join("."));
        return known === undefined
          ? composite(path, `{ readonly [name: string]: ${inner("elemType")} }`)
          : `{ readonly [K in ${known}]?: ${inner("elemType")} }`;
      }
      case "oneOf":
        return composite(
          path,
          [
            ...new Set((type.alternatives ?? []).map((alternative) => typeOf(alternative, path))),
          ].join(" | "),
        );
      case "coercedTo":
        return composite(path, `${inner("coercedType")} | ${inner("finalType")}`);
      case "unique":
      case "uniq":
        return inner("elemType");
      case "attrTag":
        return composite(
          path,
          Object.keys(nested)
            .toSorted()
            .map((tag) => `{ readonly ${property(tag)}: ${inner(tag)} }`)
            .join(" | "),
        );
      case "functionTo":
        return "NixFunction";
      case "anything":
      case "unspecified":
      case "raw":
      case "attrs":
        return "NixValue";
      case "submodule": {
        // `freeformType` types all undeclared attributes together, usually as `attrsOf value`.
        const freeformType = nested.freeformType;
        const freeformValue =
          freeformType?.nested?.elemType !== undefined &&
          /^(lazyA|a)ttrs(Of|With)$/.test(freeformType.name)
            ? freeformType.nested.elemType
            : freeformType;
        const freeform = freeformValue === undefined ? undefined : typeOf(freeformValue, path);
        if (type.class !== undefined && !classes.has(type.class)) {
          const name = reserve(`${pascal([type.class])}Options`);
          classes.set(type.class, name);
          declarations.push(
            `export interface ${name} ${objectBody(type.options ?? {}, [type.class], type.options ?? {}, freeform)}`,
          );
          return name;
        }
        return hoist(
          "interface",
          path,
          objectBody(type.options ?? {}, path, type.options ?? {}, freeform),
        );
      }
      default:
        return `Unsupported<${JSON.stringify(type.name)}>`;
    }
  };

  const root = reserve(`${pascal([options.rootClass])}Options`);
  classes.set(options.rootClass, root);
  declarations.unshift(`export interface ${root} ${objectBody(tree, [], tree)}`);

  const registering = [...classes].filter(([moduleClass]) => !options.registered?.has(moduleClass));
  return {
    source: declarationFile({
      origin: "a probed option tree",
      declarations,
      register: registering,
      importFrom: options.importFrom,
    }),
    registered: registering.map(([moduleClass]) => moduleClass),
  };
};

export interface DeclarationFile {
  /** What the file was generated from, for its header. */
  readonly origin: string;
  readonly declarations: ReadonlyArray<string>;
  /** `Register` fields: the key and its type. */
  readonly register: ReadonlyArray<readonly [string, string]>;
  readonly importFrom: string;
}

/** A generated file: its declarations, and the fields it adds to `Register`. */
export const declarationFile = (file: DeclarationFile): string => {
  const body = file.declarations.join("\n\n");
  // A project may check generated files with `noUnusedLocals`, so they import only what the types
  // use; option descriptions may mention the same words.
  const code = body.replaceAll(/\/\*\*[\s\S]*?\*\//g, "");
  const imports = [
    "NixFunction",
    "NixPath",
    "NixValue",
    "Package",
    "Register",
    "Unsupported",
  ].filter((name) => new RegExp(`\\b${name}\\b`).test(code));
  return [
    `// Generated by Typeflake from ${file.origin}. Do not edit.`,
    ...(imports.length === 0
      ? []
      : [`import type { ${imports.join(", ")} } from ${JSON.stringify(file.importFrom)}`]),
    "",
    body,
    "",
    `declare module ${JSON.stringify(file.importFrom)} {`,
    "  interface Register {",
    ...file.register.map(([key, type]) => `    readonly ${property(key)}: ${type}`),
    "  }",
    "}",
    "",
  ].join("\n");
};

const referencedOptions = (tree: OptionTree): ReadonlySet<string> => {
  const ids = new Set<string>();
  const visitType = (type: NixType): void => {
    if (type.optionRef !== undefined) ids.add(type.optionRef);
    Object.values(type.nested ?? {}).forEach(visitType);
    type.alternatives?.forEach(visitType);
    if (type.options !== undefined) visitTree(type.options);
  };
  const visitTree = (tree: OptionTree): void =>
    Object.values(tree).forEach((node) =>
      isGroup(node) ? visitTree(node.group) : visitType(node.type),
    );
  visitTree(tree);
  return ids;
};

/** The path a renamed option's alias points at, from its description `Alias of {option}\`a.b\`.` */
const renamedTo = (option: NixOption): ReadonlyArray<string> | undefined => {
  const match = /^Alias of \{option\}`(.+)`\.$/.exec(option.description?.trim() ?? "");
  return match?.[1] === undefined ? undefined : optionPath(match[1]);
};

/** `lib.showOption`'s output read back: dots separate names, and quotes hold names with dots. */
const optionPath = (shown: string): ReadonlyArray<string> =>
  [...shown.matchAll(/"((?:[^"\\]|\\.)*)"|([^.]+)/g)].map(
    ([, quoted, plain]) => quoted?.replaceAll(/\\(.)/g, "$1") ?? plain ?? "",
  );

/** The option at `path` in `tree`, through its groups and into submodule options such as `settings`. */
const find = (tree: OptionTree, path: ReadonlyArray<string>): NixOption | undefined => {
  const [head, ...rest] = path;
  const node = head === undefined ? undefined : tree[head];
  if (node === undefined) return undefined;
  if (isGroup(node)) return rest.length === 0 ? undefined : find(node.group, rest);
  if (node.visible === false) return undefined;
  if (rest.length === 0) return node;
  return node.type.options === undefined ? undefined : find(node.type.options, rest);
};

const doc = (option: NixOption): string => {
  const lines = [
    ...(option.description?.trim().split("\n") ?? []),
    ...(option.default === null ? [] : [`@default ${option.default.replaceAll("\n", " ")}`]),
    ...(option.deprecated === undefined || option.deprecated === null
      ? []
      : [`@deprecated ${option.deprecated.replaceAll("\n", " ")}`]),
  ];
  if (lines.length === 0) return "";
  return `/**\n${lines.map((line) => ` * ${line.replaceAll("*/", "*\\/")}`.trimEnd()).join("\n")}\n */\n`;
};

const indent = (text: string): string =>
  text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

export const property = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);

const pascal = (path: ReadonlyArray<string>): string => {
  const name = path
    .flatMap((segment) =>
      segment
        .split(/[^A-Za-z0-9]+/)
        .flatMap((word) => (word === "" ? [] : [word.charAt(0).toUpperCase() + word.slice(1)])),
    )
    .join("");
  return /^[0-9]/.test(name) ? `_${name}` : name || "Root";
};

export interface Rename {
  readonly from: ReadonlyArray<string>;
  readonly to: ReadonlyArray<string>;
}

/** The renamed options of a configuration, outside submodules, whose new option exists. */
export const renames = (tree: OptionTree): ReadonlyArray<Rename> => {
  const found: Array<Rename> = [];
  const visit = (node: OptionTree, path: ReadonlyArray<string>): void => {
    for (const [key, child] of Object.entries(node)) {
      if (isGroup(child)) visit(child.group, [...path, key]);
      else if (child.visible === false) {
        const to = renamedTo(child);
        if (to !== undefined && find(tree, to) !== undefined)
          found.push({ from: [...path, key], to });
      }
    }
  };
  visit(tree, []);
  return found;
};
