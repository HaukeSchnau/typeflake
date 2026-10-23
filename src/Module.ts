import * as Effect from "effect/Effect"
import { type Pipeable, pipeArguments } from "effect/Pipeable"
import * as Ast from "./Ast.ts"
import type { Definition, OptionsOf } from "./Definition.ts"
import type { Register } from "./index.ts"
import type { Lib, Pkgs } from "./Lib.ts"
import * as Nix from "./Nix.ts"
import type { Declarations, Infer } from "./Options.ts"

export const TypeId: unique symbol = Symbol.for("typeflake/Module")

/** A module of `Class` whose rendering may fail with `E` and needs the services `R`. */
export interface Module<out Class extends string, out E = never, out R = never> extends Pipeable {
  readonly [TypeId]: { readonly _E: (_: never) => E; readonly _R: (_: never) => R }
  readonly class: Class
  /** The module as the source of a `.nix` file. */
  readonly render: Effect.Effect<string, E, R>
}

/** The `specialArgs` a project registers, such as infra's `self`. */
type ExtraArgs = Register extends { readonly args: infer A } ? A : {}

/** What a module function receives. Every field is an expression; nothing here has a value yet. */
export type Args<Options> = {
  readonly config: Nix.NixProxy<Options>
  readonly lib: Nix.NixProxy<Lib>
  readonly pkgs: Nix.NixProxy<Pkgs>
} & { readonly [K in keyof ExtraArgs]: Nix.NixProxy<ExtraArgs[K]> }

export interface Definitions<Options, D extends Declarations, Eff extends Effect.Effect<unknown, unknown, unknown>> {
  /** The options the module declares. `config` sees them before a probe does, and only they decide `D`. */
  readonly options?: D
  /**
   * Called once with expressions for the module's arguments. A generator may yield effects, whose
   * services the module then needs to render.
   */
  readonly config: (
    args: Args<NoInfer<Options & Infer<D>>>,
  ) => Definition<NoInfer<Options & Infer<D>>> | Generator<Eff, Definition<NoInfer<Options & Infer<D>>>, never>
}

/** The order modules conventionally list their arguments in; others follow alphabetically. */
const conventional = ["config", "options", "lib", "pkgs", "modulesPath"]
const byConvention = (left: string, right: string) => {
  const rank = (name: string) => (conventional.includes(name) ? conventional.indexOf(name) : conventional.length)
  return rank(left) - rank(right) || left.localeCompare(right)
}

const isGenerator = (value: unknown): value is Generator<Effect.Effect<unknown, unknown, unknown>, unknown, never> =>
  typeof value === "object" && value !== null && typeof (value as { next?: unknown }).next === "function" && Symbol.iterator in value

/** Every argument a module function reads is an expression for that argument. */
const args = new Proxy(
  {},
  { get: (_, name) => (typeof name === "string" ? Nix.proxy(Ast.variable(name)) : undefined) },
)

/**
 * Defines a module of one class. A named interface, so that declaration files keep `OptionsOf<Class>`
 * for the consumer's `Register` to resolve rather than the empty one Typeflake builds with.
 */
export interface Maker<Class extends string> {
  <const D extends Declarations = {}, Eff extends Effect.Effect<unknown, unknown, unknown> = never>(
    definitions: Definitions<OptionsOf<Class>, D, Eff>,
  ): Module<Class, Effect.Error<Eff>, Effect.Services<Eff>>
}

export const make =
  <const Class extends string>(moduleClass: Class): Maker<Class> =>
  <const D extends Declarations = {}, Eff extends Effect.Effect<unknown, unknown, unknown> = never>(
    definitions: Definitions<OptionsOf<Class>, D, Eff>,
  ): Module<Class, Effect.Error<Eff>, Effect.Services<Eff>> => {
    const render = Effect.gen(function* () {
      const result: unknown = definitions.config(args as Args<OptionsOf<Class> & Infer<D>>)
      const config = Nix.toExpr(isGenerator(result) ? yield* Effect.gen(() => result) : result)
      const body =
        definitions.options === undefined && config._tag === "Attrs"
          ? config
          : Ast.attrs([...(definitions.options === undefined ? [] : [["options", Nix.toExpr(definitions.options)] as const]), ["config", config]])
      return Ast.print(Ast.lambda([...Ast.freeVariables(body)].sort(byConvention), body))
    })
    return {
      [TypeId]: { _E: (_) => _, _R: (_) => _ },
      class: moduleClass,
      render: render as Effect.Effect<string, Effect.Error<Eff>, Effect.Services<Eff>>,
      pipe() {
        return pipeArguments(this, arguments)
      },
    }
  }

export const isModule = (value: unknown): value is Module<string, unknown, unknown> =>
  typeof value === "object" && value !== null && TypeId in value
