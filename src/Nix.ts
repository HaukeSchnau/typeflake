import * as Ast from "./Ast.ts"

export const TypeId: unique symbol = Symbol.for("typeflake/Nix")
const ExprId: unique symbol = Symbol.for("typeflake/Nix/expr")

/** A Nix expression that evaluates to an `A`. Typeflake renders it; nothing evaluates it in TypeScript. */
export interface Nix<out A> {
  readonly [TypeId]: { readonly _A: (_: never) => A }
  readonly [ExprId]: Ast.Expr
}

/** What option values are made of, besides expressions: nothing builds them in TypeScript. */
declare const PackageBrand: unique symbol
export interface Package {
  readonly [PackageBrand]: "Package"
}
export interface NixFunction {
  readonly _tag: "NixFunction"
}
/** An option type Typeflake can't map. Only `raw` expressions fit it. */
export interface Unsupported<out Name extends string> {
  readonly _tag: "Unsupported"
  readonly name: Name
}
export type NixPath = string
/** A value an option of type `anything` accepts. */
export type NixValue = string | number | boolean | null | Package | ReadonlyArray<NixValue> | { readonly [name: string]: NixValue }

const variance = { _A: (_: never) => _ }

export const make = <A>(expr: Ast.Expr): Nix<A> => ({ [TypeId]: variance, [ExprId]: expr })

export const isNix = (value: unknown): value is Nix<unknown> =>
  (typeof value === "object" || typeof value === "function") && value !== null && ExprId in value

export const exprOf = (value: Nix<unknown>): Ast.Expr => value[ExprId]

/** The expression for a TypeScript value: a Nix expression, or data that Nix can hold. */
export const toExpr = (value: unknown): Ast.Expr => {
  if (isNix(value)) return exprOf(value)
  if (value === null) return Ast.Null
  switch (typeof value) {
    case "boolean":
      return Ast.bool(value)
    case "number":
      return Ast.number(value)
    case "string":
      return Ast.string([value])
    case "object":
      if (Array.isArray(value)) return Ast.list(value.map(toExpr))
      return Ast.attrs(Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : [[key, toExpr(item)] as const])))
    default:
      throw new TypeError(`Nix has no ${typeof value} value`)
  }
}

/** Nix code Typeflake can't type. Name the type it evaluates to: `raw<boolean>("lib.mkForce true")`. */
export const raw = <A = unknown>(code: string): Nix<A> => make(Ast.raw(code))

/** A path relative to the module's file, which the rendered `.nix` file sits next to. */
export const path = (relative: string): Nix<NixPath> => make(Ast.path(relative))

/** `if condition then a else b`, decided when Nix evaluates it. */
export const ifThenElse = <A>(condition: boolean | Nix<boolean>, then: A | Nix<A>, otherwise: A | Nix<A>): Nix<A> =>
  make(Ast.ifThenElse(toExpr(condition), toExpr(then), toExpr(otherwise)))

/** What a `nix` string may interpolate: text, or expressions Nix turns into strings. */
export type Interpolation = string | number | Nix<string> | Nix<NixPath> | Nix<Package>

/**
 * A Nix string. Interpolated expressions stay expressions, and multi-line text is dedented exactly
 * like a Nix `''` string, so Nix code moves into a template literal unchanged.
 */
export const nix = (strings: TemplateStringsArray, ...values: ReadonlyArray<Interpolation>): Nix<string> => {
  const parts = strings.flatMap((text, index): ReadonlyArray<string | Ast.Expr> => {
    const value = values[index]
    if (index === values.length) return [text]
    return [text, typeof value === "string" || typeof value === "number" ? String(value) : toExpr(value)]
  })
  return make(Ast.string(dedent(parts)))
}

/**
 * Nix's rules for `''` strings: only spaces indent. A first line of nothing but spaces goes, every line
 * loses up to the indentation that the lines with other characters share, and a last line of nothing
 * but spaces ends the string. Interpolations count as other characters.
 */
const dedent = (parts: ReadonlyArray<string | Ast.Expr>): ReadonlyArray<string | Ast.Expr> => {
  const source = parts.map((part) => (typeof part === "string" ? part : "\u0000")).join("")
  if (!source.includes("\n")) return parts
  const lines = source.split("\n")
  const body = /^ *$/.test(lines[0]!) ? lines.slice(1) : lines
  const widths = body.filter((line) => !/^ *$/.test(line)).map((line) => /^ */.exec(line)![0].length)
  const width = widths.length === 0 ? 0 : Math.min(...widths)
  const dropped = body.map((line) => line.slice(Math.min(width, /^ */.exec(line)![0].length)))
  if (/^ *$/.test(body.at(-1)!)) dropped[dropped.length - 1] = ""
  const expressions = parts.filter((part): part is Ast.Expr => typeof part !== "string")
  return dropped
    .join("\n")
    .split("\u0000")
    .flatMap((piece, index) => (index === 0 ? [piece] : [expressions[index - 1]!, piece]))
    .filter((part) => part !== "")
}

type Leaf = string | number | boolean | null | undefined | NixFunction | Unsupported<string> | ReadonlyArray<unknown>

/**
 * An expression whose fields are expressions too, when it evaluates to an attribute set. Functions
 * keep their signatures: `lib.getExe(pkg)` is typed by `Lib`.
 */
export type NixProxy<A> = Nix<A> &
  (A extends (...args: never) => unknown ? A : A extends Leaf ? unknown : { readonly [K in keyof A]-?: NixProxy<A[K]> })

/**
 * An expression whose property accesses select attributes and whose calls apply it, so module code
 * reads like the Nix it renders: `config.sops.secrets["api-key"].path`.
 */
export const proxy = <A>(expr: Ast.Expr): NixProxy<A> => {
  const value = make<A>(expr)
  return new Proxy(function () {}, {
    get: (_, key) => {
      if (key === TypeId) return value[TypeId]
      if (key === ExprId) return value[ExprId]
      if (key === Symbol.toPrimitive) {
        return () => {
          throw new TypeError("A Nix expression has no value in TypeScript; interpolate it with nix`...`")
        }
      }
      // Promises and iteration probe for these; an expression is neither.
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return undefined
      return proxy(Ast.select(expr, key))
    },
    has: (_, key) => key === TypeId || key === ExprId,
    apply: (_, __, args: ReadonlyArray<unknown>) => proxy(Ast.apply(expr, ...args.map(toExpr))),
  }) as unknown as NixProxy<A>
}

/** Nix's global `builtins`. */
export const builtins = proxy<Builtins>(Ast.variable("builtins"))

export interface Builtins {
  readonly readFile: (path: Nix<NixPath>) => Nix<string>
  readonly toJSON: (value: unknown) => Nix<string>
  readonly fromJSON: (text: string | Nix<string>) => Nix<NixValue>
}
