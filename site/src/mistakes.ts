export interface Mistake {
  readonly label: string;
  /** The text in code/sample.ts.txt the mistake replaces. */
  readonly find: string;
  readonly replace: string;
  readonly line: number;
  readonly column: number;
  readonly length: number;
  /** The diagnostic number, such as 2322 for TS2322. */
  readonly diagnostic: number;
  readonly message: string;
}

export interface Mistakes {
  /** `tsc --version` of the compiler that reported them. */
  readonly checkedWith: string;
  readonly mistakes: ReadonlyArray<Mistake>;
}
