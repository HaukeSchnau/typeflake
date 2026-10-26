import * as Ast from "./Ast.ts";

export const TypeId: unique symbol = Symbol.for("typeflake/Nix");
const ExprId: unique symbol = Symbol.for("typeflake/Nix/expr");

/** A Nix expression that evaluates to an `A`. Typeflake renders it; nothing evaluates it in TypeScript. */
export interface Nix<out A> {
  readonly [TypeId]: { readonly _A: (_: never) => A };
  readonly [ExprId]: Ast.Expr;
}

/** What option values are made of, besides expressions: nothing builds them in TypeScript. */
declare const PackageBrand: unique symbol;
/** A derivation. `Name` is its attribute in `pkgs`, where the probe found it there. */
export interface Package<out Name extends string = string> {
  readonly [PackageBrand]: { readonly name: Name };
}
export interface NixFunction {
  readonly _tag: "NixFunction";
}
/** An option type Typeflake can't map. Only `raw` expressions fit it. */
export interface Unsupported<out Name extends string> {
  readonly _tag: "Unsupported";
  readonly name: Name;
}
export type NixPath = string;
/** A value an option of type `anything` accepts. */
export type NixValue =
  | string
  | number
  | boolean
  | null
  | Package
  | ReadonlyArray<NixValue>
  | { readonly [name: string]: NixValue };

const variance = { _A: (_: never) => _ };

export const make = <A>(expr: Ast.Expr): Nix<A> => ({ [TypeId]: variance, [ExprId]: expr });

export const exprOf = (value: Nix<unknown>): Ast.Expr => value[ExprId];

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- These two parse
   authored TypeScript values into Nix: whatever renders passes through them, already checked
   against option types the generic signature can't name. */
export const isNix = (value: unknown): value is Nix<unknown> =>
  (typeof value === "object" || typeof value === "function") && value !== null && ExprId in value;

/** The expression for a TypeScript value: a Nix expression, or data that Nix can hold. */
export const toExpr = (value: unknown): Ast.Expr => {
  if (isNix(value)) return exprOf(value);
  if (value === null) return Ast.Null;
  switch (typeof value) {
    case "boolean":
      return Ast.bool(value);
    case "number":
      return Ast.number(value);
    case "string":
      return Ast.string([Ast.text(value)]);
    case "object":
      if (Array.isArray(value)) return Ast.list(value.map(toExpr));
      return Ast.attrs(
        Object.entries(value).flatMap(([key, item]) =>
          item === undefined ? [] : [[key, toExpr(item)] as const],
        ),
      );
    default:
      throw new TypeError(`Nix has no ${typeof value} value`);
  }
};
/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters */

/** Nix code Typeflake can't type. Name the type it evaluates to: `raw<boolean>("lib.mkForce true")`. */
export const raw = <A = unknown>(code: string): Nix<A> => make(Ast.raw(code));

/** A path relative to the module's file, which the rendered `.nix` file sits next to. */
export const path = (relative: string): Nix<NixPath> => make(Ast.path(relative));

/** `if condition then a else b`, decided when Nix evaluates it. */
export const ifThenElse = <A>(
  condition: boolean | Nix<boolean>,
  consequent: A | Nix<A>,
  alternative: A | Nix<A>,
): Nix<A> => make(Ast.ifThenElse(toExpr(condition), toExpr(consequent), toExpr(alternative)));

/** What a `nix` string may interpolate: text, or expressions Nix turns into strings. */
export type Interpolation = string | number | Nix<string> | Nix<NixPath> | Nix<Package>;

/**
 * A Nix string. Interpolated expressions stay expressions, and multi-line text is dedented exactly
 * like a Nix `''` string, so Nix code moves into a template literal unchanged.
 */
export const nix = (
  strings: TemplateStringsArray,
  ...values: ReadonlyArray<Interpolation>
): Nix<string> => {
  const parts = strings.flatMap((text, index): ReadonlyArray<Ast.Part> => {
    const value = values[index];
    if (value === undefined) return [Ast.text(text)];
    return [Ast.text(text), isNix(value) ? exprOf(value) : Ast.text(String(value))];
  });
  return make(Ast.string(dedent(parts)));
};

const spaces = (line: string) => line.length - line.replace(/^ +/, "").length;
const blank = (line: string) => /^ *$/.test(line);

/**
 * Nix's rules for `''` strings: only spaces indent. A first line of nothing but spaces goes, every line
 * loses up to the indentation that the lines with other characters share, and a last line of nothing
 * but spaces ends the string. Interpolations count as other characters.
 */
const dedent = (parts: ReadonlyArray<Ast.Part>): ReadonlyArray<Ast.Part> => {
  const source = parts.map((part) => (part._tag === "Text" ? part.text : "\u0000")).join("");
  if (!source.includes("\n")) return parts;
  const lines = source.split("\n");
  const body = blank(lines[0] ?? "") ? lines.slice(1) : lines;
  const widths = body.flatMap((line) => (blank(line) ? [] : [spaces(line)]));
  const width = widths.length === 0 ? 0 : Math.min(...widths);
  const dropped = body.map((line, index) =>
    index === body.length - 1 && blank(line) ? "" : line.slice(Math.min(width, spaces(line))),
  );
  const expressions = parts.flatMap((part) => (part._tag === "Text" ? [] : [part]));
  return dropped
    .join("\n")
    .split("\u0000")
    .flatMap((piece, index): ReadonlyArray<Ast.Part> => {
      const expression = expressions[index - 1];
      const before: ReadonlyArray<Ast.Part> = expression === undefined ? [] : [expression];
      return piece === "" ? before : before.concat(Ast.text(piece));
    });
};

type Leaf =
  | string
  | number
  | boolean
  | null
  | undefined
  | NixFunction
  | Unsupported<string>
  | ReadonlyArray<unknown>;

/**
 * An expression whose fields are expressions too, when it evaluates to an attribute set. Functions
 * keep their signatures: `lib.getExe(pkg)` is typed by `Lib`.
 */
export type NixProxy<A> = Nix<A> &
  (A extends (...args: never) => Nix<unknown>
    ? A
    : A extends Leaf
      ? Nix<A>
      : { readonly [K in keyof A]-?: NixProxy<A[K]> });

/**
 * An expression whose property accesses select attributes and whose calls apply it, so module code
 * reads like the Nix it renders: `config.sops.secrets["api-key"].path`.
 */
export const proxy = <A>(expr: Ast.Expr): NixProxy<A> => {
  const value = make<A>(expr);
  const proxied = new Proxy(function () {}, {
    get: (_, key) => {
      if (key === TypeId) return value[TypeId];
      if (key === ExprId) return value[ExprId];
      if (key === Symbol.toPrimitive) {
        return () => {
          throw new TypeError(
            "A Nix expression has no value in TypeScript; interpolate it with nix`...`",
          );
        };
      }
      // Promises and iteration probe for these; an expression is neither. Proxy traps receive
      // `string | symbol` keys, and only strings select attributes.
      // oxlint-disable-next-line anti-slop/no-runtime-typeof
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return undefined;
      return proxy(Ast.select(expr, key));
    },
    has: (_, key) => key === TypeId || key === ExprId,
    apply: (_, __, args: ReadonlyArray<Nix<unknown> | NixValue>) =>
      proxy(Ast.apply(expr, ...args.map(toExpr))),
  });
  // SAFETY: the handler answers every field with an expression selecting it and every call with an
  // expression applying it, which is what `NixProxy<A>` promises; TypeScript can't see through a Proxy.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion
  return proxied as unknown as NixProxy<A>;
};

/** Nix's global `builtins`. */
export const builtins = proxy<Builtins>(Ast.variable("builtins"));

export interface Builtins {
  readonly readFile: (path: Nix<NixPath>) => Nix<string>;
  readonly toJSON: (value: NixValue | Nix<NixValue>) => Nix<string>;
  readonly fromJSON: (text: string | Nix<string>) => Nix<NixValue>;
}
