/** The Nix expressions Typeflake renders. */
export type Expr =
  | { readonly _tag: "Null" }
  | { readonly _tag: "Bool"; readonly value: boolean }
  | { readonly _tag: "Int"; readonly value: number }
  | { readonly _tag: "Float"; readonly value: number }
  /** Literal text and interpolated expressions, in order. */
  | { readonly _tag: "String"; readonly parts: ReadonlyArray<string | Expr> }
  /** A path relative to the rendered file, such as `./package.nix`. */
  | { readonly _tag: "Path"; readonly path: string }
  | { readonly _tag: "List"; readonly items: ReadonlyArray<Expr> }
  | { readonly _tag: "Attrs"; readonly entries: ReadonlyArray<readonly [string, Expr]> }
  | { readonly _tag: "Var"; readonly name: string }
  | { readonly _tag: "Select"; readonly target: Expr; readonly path: ReadonlyArray<string> }
  | { readonly _tag: "Apply"; readonly fn: Expr; readonly arg: Expr }
  | { readonly _tag: "Lambda"; readonly formals: ReadonlyArray<string>; readonly body: Expr }
  | { readonly _tag: "If"; readonly condition: Expr; readonly then: Expr; readonly else: Expr }
  | { readonly _tag: "Raw"; readonly code: string }

export const Null: Expr = { _tag: "Null" }
export const bool = (value: boolean): Expr => ({ _tag: "Bool", value })
export const number = (value: number): Expr => {
  if (!Number.isFinite(value)) throw new RangeError(`Nix has no number ${value}`)
  return Number.isInteger(value) ? { _tag: "Int", value } : { _tag: "Float", value }
}
export const string = (parts: ReadonlyArray<string | Expr>): Expr => ({ _tag: "String", parts })
export const path = (path: string): Expr => {
  if (!/^\.\.?(\/[A-Za-z0-9._+-]+)+$/.test(path)) throw new RangeError(`Not a relative Nix path: ${path}`)
  return { _tag: "Path", path }
}
export const list = (items: ReadonlyArray<Expr>): Expr => ({ _tag: "List", items })
export const attrs = (entries: ReadonlyArray<readonly [string, Expr]>): Expr => ({ _tag: "Attrs", entries })
export const variable = (name: string): Expr => ({ _tag: "Var", name })
export const select = (target: Expr, key: string): Expr =>
  target._tag === "Select"
    ? { _tag: "Select", target: target.target, path: [...target.path, key] }
    : { _tag: "Select", target, path: [key] }
export const apply = (fn: Expr, ...args: ReadonlyArray<Expr>): Expr =>
  args.reduce<Expr>((applied, arg) => ({ _tag: "Apply", fn: applied, arg }), fn)
export const lambda = (formals: ReadonlyArray<string>, body: Expr): Expr => ({ _tag: "Lambda", formals, body })
export const ifThenElse = (condition: Expr, then: Expr, otherwise: Expr): Expr => ({
  _tag: "If",
  condition,
  then,
  else: otherwise,
})
export const raw = (code: string): Expr => ({ _tag: "Raw", code })

/** Variables every Nix file has, which a module therefore doesn't take as arguments. */
const globals = new Set(["builtins", "import", "true", "false", "null", "throw", "abort", "toString", "baseNameOf"])

/** The variables `expr` uses without binding them. */
export const freeVariables = (expr: Expr): ReadonlySet<string> => {
  const free = new Set<string>()
  const visit = (expr: Expr, bound: ReadonlySet<string>): void => {
    switch (expr._tag) {
      case "Var":
        if (!bound.has(expr.name) && !globals.has(expr.name)) free.add(expr.name)
        return
      case "String":
        return expr.parts.forEach((part) => typeof part === "string" || visit(part, bound))
      case "List":
        return expr.items.forEach((item) => visit(item, bound))
      case "Attrs":
        return expr.entries.forEach(([, value]) => visit(value, bound))
      case "Select":
        return visit(expr.target, bound)
      case "Apply":
        visit(expr.fn, bound)
        return visit(expr.arg, bound)
      case "Lambda":
        return visit(expr.body, new Set([...bound, ...expr.formals]))
      case "If":
        visit(expr.condition, bound)
        visit(expr.then, bound)
        return visit(expr.else, bound)
      // Raw code hides its variables; these are the module arguments it is likely to use.
      case "Raw":
        for (const [name] of expr.code.matchAll(/\b(config|lib|pkgs|options|modulesPath)\b/g)) {
          if (!bound.has(name)) free.add(name)
        }
        return
      case "Null":
      case "Bool":
      case "Int":
      case "Float":
      case "Path":
        return
    }
  }
  visit(expr, new Set())
  return free
}

const keywords = new Set(["if", "then", "else", "assert", "with", "let", "in", "rec", "inherit", "or"])

export const attrName = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_'-]*$/.test(name) && !keywords.has(name) ? name : quote(name)

const quote = (text: string): string =>
  `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("${", "\\${").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`

/** How tightly an expression binds: atoms bind tightest, then applications, then everything else. */
const Level = { Expression: 0, Application: 1, Atom: 2 } as const
type Level = (typeof Level)[keyof typeof Level]

/** Formats `expr` the way nixfmt would, close enough for review. */
export const print = (expr: Expr): string => `${printAt(expr, Level.Expression, "")}\n`

const printAt = (expr: Expr, level: Level, indent: string): string => {
  const own = levelOf(expr)
  const printed = printExpr(expr, indent)
  return own < level ? `(${printed})` : printed
}

const levelOf = (expr: Expr): Level => {
  switch (expr._tag) {
    case "Int":
    case "Float":
      return expr.value < 0 ? Level.Application : Level.Atom
    case "Apply":
      return Level.Application
    case "Lambda":
    case "If":
      return Level.Expression
    case "Raw":
      return /^[A-Za-z_][A-Za-z0-9_'.-]*$/.test(expr.code) ? Level.Atom : Level.Expression
    default:
      return Level.Atom
  }
}

const printExpr = (expr: Expr, indent: string): string => {
  const inner = `${indent}  `
  switch (expr._tag) {
    case "Null":
      return "null"
    case "Bool":
      return expr.value ? "true" : "false"
    case "Int":
      return String(expr.value)
    case "Float": {
      const text = String(expr.value)
      return /[.e]/.test(text) ? text : `${text}.0`
    }
    case "String":
      return printString(expr.parts, indent)
    case "Path":
      return expr.path
    case "Var":
      return expr.name
    case "Raw":
      return expr.code
    case "Select":
      return `${printAt(expr.target, Level.Atom, indent)}.${expr.path.map(attrName).join(".")}`
    case "Apply":
      return `${printAt(expr.fn, Level.Application, indent)} ${printAt(expr.arg, Level.Atom, indent)}`
    case "Lambda":
      return `{ ${[...expr.formals, "..."].join(", ")} }:\n${indent}${printAt(expr.body, Level.Expression, indent)}`
    case "If":
      return `if ${printAt(expr.condition, Level.Expression, indent)} then ${printAt(expr.then, Level.Expression, indent)} else ${printAt(expr.else, Level.Expression, indent)}`
    case "List": {
      if (expr.items.length === 0) return "[ ]"
      const items = expr.items.map((item) => printAt(item, Level.Atom, inner))
      const oneLine = `[ ${items.join(" ")} ]`
      return oneLine.length <= 60 && !oneLine.includes("\n") ? oneLine : `[\n${items.map((item) => `${inner}${item}`).join("\n")}\n${indent}]`
    }
    case "Attrs": {
      if (expr.entries.length === 0) return "{ }"
      const lines = expr.entries.map(([key, value]) => {
        const [path, leaf] = collapse([key], value)
        return `${inner}${path.map(attrName).join(".")} = ${printAt(leaf, Level.Expression, inner)};`
      })
      return `{\n${lines.join("\n")}\n${indent}}`
    }
  }
}

/** `a = { b = { c = 1; }; }` reads better as `a.b.c = 1`. */
const collapse = (path: ReadonlyArray<string>, value: Expr): readonly [ReadonlyArray<string>, Expr] =>
  value._tag === "Attrs" && value.entries.length === 1 ? collapse([...path, value.entries[0]![0]], value.entries[0]![1]) : [path, value]

const printString = (parts: ReadonlyArray<string | Expr>, indent: string): string => {
  const text = parts.map((part) => (typeof part === "string" ? part : "\u0000")).join("")
  return text.includes("\n") && indentedKeepsValue(text)
    ? printIndented(parts, indent)
    : `"${parts
        .map((part, index) =>
          typeof part === "string"
            ? dollarBeforeInterpolation(quote(part).slice(1, -1), parts[index + 1], "\\$")
            : `\${${printAt(part, Level.Expression, indent)}}`,
        )
        .join("")}"`
}

/** Nix reads `$${` as a literal `${`, so a `$` right before an interpolation needs escaping. */
const dollarBeforeInterpolation = (text: string, next: string | Expr | undefined, escaped: string): string =>
  next !== undefined && typeof next !== "string" && text.endsWith("$")
    ? `${text.slice(0, -1)}${escaped}`
    : text

/**
 * Whether `''` strings return `text` unchanged once Typeflake indents every line. Nix strips the
 * smallest indentation of the lines that aren't only spaces, and empties the ones that are. So no
 * line may start with a space or a tab, and none may be only spaces. Interpolations count as
 * text (`\0` above). A trailing `'` would merge with the closing `''`.
 */
const indentedKeepsValue = (text: string): boolean =>
  !text.includes("\r") && !text.endsWith("'") && text.split("\n").every((line) => line === "" || !/^[ \t]/.test(line))

const printIndented = (parts: ReadonlyArray<string | Expr>, indent: string): string => {
  const inner = `${indent}  `
  const body = parts
    .map((part, index) =>
      typeof part === "string"
        ? dollarBeforeInterpolation(
            part.replaceAll("''", "'''").replaceAll("${", "''${").replaceAll("\n", `\n${inner}`),
            parts[index + 1],
            "''$",
          )
        : `\${${printAt(part, Level.Expression, inner)}}`,
    )
    .join("")
    // Lines that are empty in the value stay empty rather than holding the indentation.
    .replaceAll(new RegExp(`\n${inner}(?=\n)`, "g"), "\n")
  const closing = body.endsWith(`\n${inner}`) ? `${body.slice(0, -inner.length)}${indent}''` : `${body}''`
  return `''\n${inner}${closing}`
}
