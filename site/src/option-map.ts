/** Who declares an option: nixpkgs, Home Manager, another flake input, or the flake itself. */
export type Source = "nixpkgs" | "home-manager" | "inputs" | "self";

export const sourceLabel: Readonly<Record<Source, string>> = {
  nixpkgs: "nixpkgs",
  "home-manager": "Home Manager",
  inputs: "Other flake inputs",
  self: "infra itself",
};

export const inputLabel = (input: string): string =>
  input === "home-manager" ? "Home Manager" : input === "self" ? "infra itself" : input;

export interface Cell {
  /** The namespace, such as `services.nginx`, or `12 more` for a group's folded remainder. */
  readonly path: string;
  readonly count: number;
  /** The source declaring most of its options. */
  readonly source: Source;
  /** The flake inputs declaring them, most options first. */
  readonly inputs: ReadonlyArray<string>;
  readonly top: ReadonlyArray<{ readonly name: string; readonly count: number }>;
  /** How many namespaces a remainder cell stands for. */
  readonly folded?: number;
}

export interface Group {
  readonly name: string;
  readonly count: number;
  readonly cells: ReadonlyArray<Cell>;
}

export interface OptionMap {
  readonly host: string;
  readonly total: number;
  readonly visible: number;
  /** Blocks with fewer options are folded into their group's remainder. */
  readonly foldedBelow: number;
  readonly sources: ReadonlyArray<{
    readonly source: Source;
    readonly count: number;
    readonly inputs: ReadonlyArray<{ readonly name: string; readonly count: number }>;
  }>;
  readonly groups: ReadonlyArray<Group>;
}
