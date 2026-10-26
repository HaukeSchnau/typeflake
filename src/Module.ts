import * as Effect from "effect/Effect";
import { type Pipeable, pipeArguments } from "effect/Pipeable";
import * as Predicate from "effect/Predicate";
import * as Ast from "./Ast.ts";
import type { Data, Definition, OptionsOf, Override } from "./Definition.ts";
import type { Register } from "./index.ts";
import type { Lib, Pkgs } from "./Lib.ts";
import * as Nix from "./Nix.ts";
import type { ModuleFile } from "./NixFile.ts";
import type { Declarations, Infer } from "./Options.ts";

export const TypeId: unique symbol = Symbol.for("typeflake/Module");

/** A module of `Class` whose rendering may fail with `E` and needs the services `R`. */
export interface Module<out Class extends string, out E = never, out R = never> extends Pipeable {
  readonly [TypeId]: { readonly _E: (_: never) => E; readonly _R: (_: never) => R };
  readonly class: Class;
  /** The module as the source of a `.nix` file. */
  readonly render: Effect.Effect<string, E, R>;
}

/** The `specialArgs` a project registers, such as infra's `self`. */
type ExtraArgs = Register extends { readonly args: infer A } ? A : {};

/** What a module function receives. Every field is an expression; nothing here has a value yet. */
export type Args<Options> = {
  readonly config: Nix.NixProxy<Options>;
  readonly lib: Nix.NixProxy<Lib>;
  readonly pkgs: Nix.NixProxy<Pkgs>;
} & { readonly [K in keyof ExtraArgs]: Nix.NixProxy<ExtraArgs[K]> };

/** What a module function returns: definitions made with `define`, `mkIf` or another helper, or an expression. */
export type Defined<T> = Override<Data<T>> | Nix.Nix<T>;

export interface Definitions<
  Options,
  D extends Declarations,
  Eff extends Effect.Effect<unknown, unknown, unknown>,
> {
  /** Modules written in Nix, imported with `import legacy from "./legacy.nix"`. */
  readonly imports?: ReadonlyArray<ModuleFile>;
  /** The options the module declares. `config` reads them before a probe does, and only they decide `D`. */
  readonly options?: D;
  /**
   * The module's definitions, or a function that makes them from expressions for the module's
   * arguments. A generator function may yield effects, whose services the module then needs to render.
   * Definitions are typed by the probed options only, since a callback without parameters is checked
   * before `D` is known.
   */
  readonly config:
    | Definition<Options>
    | ((
        args: Args<NoInfer<Options & Infer<D>>>,
      ) => Defined<Options> | Generator<Eff, Defined<Options>, never>);
}

/**
 * The errors and services of the effects a generator yields, written exactly as `Effect.gen` computes
 * them so that a generic `Eff` relates to its result.
 */
type YieldedError<Eff> = [Eff] extends [never]
  ? never
  : [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>]
    ? E
    : never;
type YieldedServices<Eff> = [Eff] extends [never]
  ? never
  : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>]
    ? R
    : never;

/** The order modules conventionally list their arguments in; others follow alphabetically. */
const conventional = ["config", "options", "lib", "pkgs", "modulesPath"];
const rank = (name: string) =>
  conventional.includes(name) ? conventional.indexOf(name) : conventional.length;
const byConvention = (left: string, right: string) =>
  rank(left) - rank(right) || left.localeCompare(right);

/** Whether `config` returned a generator rather than its definitions directly. */
const isGenerator = <Y, R>(value: R | Generator<Y, R, never>): value is Generator<Y, R, never> =>
  Predicate.isIterable(value) && Predicate.hasProperty(value, "next");

/** Every argument a module function reads is an expression for that argument. */
const args = new Proxy(
  {},
  {
    // Proxy traps receive `string | symbol` keys, and only strings name arguments.
    // oxlint-disable-next-line anti-slop/no-runtime-typeof
    get: (_, name) => (typeof name === "string" ? Nix.proxy(Ast.variable(name)) : undefined),
  },
);

/**
 * Defines a module of one class. A named interface, so that declaration files keep `OptionsOf<Class>`
 * for the consumer's `Register` to resolve rather than the empty one Typeflake builds with.
 */
export interface Maker<Class extends string> {
  <const D extends Declarations = {}, Eff extends Effect.Effect<unknown, unknown, unknown> = never>(
    definitions: Definitions<OptionsOf<Class>, D, Eff>,
  ): Module<Class, YieldedError<Eff>, YieldedServices<Eff>>;
}

export const make =
  <const Class extends string>(moduleClass: Class): Maker<Class> =>
  <const D extends Declarations = {}, Eff extends Effect.Effect<unknown, unknown, unknown> = never>(
    definitions: Definitions<OptionsOf<Class>, D, Eff>,
  ): Module<Class, YieldedError<Eff>, YieldedServices<Eff>> => {
    const render = Effect.gen(function* () {
      const made = definitions.config;
      // An expression is a callable proxy, so only a function that isn't one makes the definitions.
      const result =
        Predicate.isFunction(made) && !Nix.isNix(made)
          ? // SAFETY: `args` answers every argument with an expression for it, which is what `Args`
            // promises; TypeScript can't see through a Proxy.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            made(args as Args<OptionsOf<Class> & Infer<D>>)
          : made;
      const config = Nix.toExpr(isGenerator(result) ? yield* Effect.gen(() => result) : result);
      const { imports = [], options } = definitions;
      const body =
        imports.length === 0 && options === undefined && config._tag === "Attrs"
          ? config
          : Ast.attrs([
              ...(imports.length === 0 ? [] : [["imports", Nix.toExpr(imports)] as const]),
              ...(options === undefined ? [] : [["options", Nix.toExpr(options)] as const]),
              ["config", config],
            ]);
      return Ast.print(Ast.lambda([...Ast.freeVariables(body)].toSorted(byConvention), body));
    });
    return {
      [TypeId]: { _E: (_) => _, _R: (_) => _ },
      class: moduleClass,
      render,
      pipe() {
        return pipeArguments(this, arguments);
      },
    };
  };

export const isModule = (value: unknown): value is Module<string, unknown, unknown> =>
  Predicate.hasProperty(value, TypeId);
