export type OptionScope = "home-manager" | "nixos";

export type OptionPath = readonly [string, ...string[]];

export interface OptionTypeIR {
  readonly description: string | null;
  readonly name: string;
  readonly nestedTypes: Readonly<Record<string, OptionTypeIR>>;
}

export interface OptionIR {
  readonly declarations: readonly string[];
  readonly defaultText: string | null;
  readonly description: string | null;
  readonly exampleText: string | null;
  readonly internal: boolean;
  readonly path: OptionPath;
  readonly readOnly: boolean;
  readonly scope: OptionScope;
  readonly type: OptionTypeIR;
  readonly visible: boolean | "shallow";
}

export interface OptionSetIR {
  readonly options: readonly OptionIR[];
  readonly scope: OptionScope;
}
