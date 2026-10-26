/** An option namespace with what it holds, an option with the index of its type, or an option whose submodules hold more. */
export type GraphNode =
  | readonly [name: string, children: ReadonlyArray<GraphNode>]
  | readonly [name: string, type: number]
  | readonly [name: string, children: ReadonlyArray<GraphNode>, type: number];

/** The example server's option tree, as `scripts/example.ts` reduced it for the snowflake. */
export interface Graph {
  readonly options: number;
  /** TypeScript types, which nodes refer to by index. */
  readonly types: ReadonlyArray<string>;
  readonly tree: ReadonlyArray<GraphNode>;
}

export interface Mistake {
  readonly label: string;
  /** The module the mistake is made in, relative to site/example. */
  readonly file: string;
  /** The text in that module the mistake replaces. */
  readonly find: string;
  readonly replace: string;
  readonly line: number;
  readonly column: number;
  readonly length: number;
  /** The diagnostic number, such as 2322 for TS2322. */
  readonly diagnostic: number;
  readonly message: string;
}

export interface Check {
  readonly compiler: "tsrs" | "tsc";
  /** What `--version` printed. */
  readonly version: string;
  /** The median of three runs. */
  readonly seconds: number;
  /** Peak resident memory, the median of three runs. */
  readonly megabytes: number;
}

/** What scripts/example.ts measured and recorded on site/example. */
export interface Example {
  /** The date of the run, `YYYY-MM-DD`. */
  readonly measuredOn: string;
  /** Visible options of the server, Home Manager's included. */
  readonly options: number;
  /** Top-level names in the server's `pkgs`. */
  readonly packages: number;
  /** What `typeflake render` printed. */
  readonly rendered: string;
  /** What `typeflake types` printed. */
  readonly typed: string;
  /** How long `typeflake types` took for both configurations. */
  readonly typesSeconds: number;
  readonly typesBytes: number;
  /** Each compiler's check of the example, tsrs first: it reported the mistakes. */
  readonly checks: ReadonlyArray<Check>;
  /** The `drvPath` of each configuration's system, evaluated by Nix alone. */
  readonly drvPaths: ReadonlyArray<string>;
  readonly mistakes: ReadonlyArray<Mistake>;
}
