// Reduces a probe of one host (src/probe.nix output, about 32 MB for srv-2) to the option counts the
// page charts. Declarations are attributed to flake inputs through their store paths, so the flake
// must still lock the inputs the probe evaluated.
//
//   node scripts/reduce-options.ts /tmp/typeflake-spike/srv-2.json ~/infra > data/srv-2.ts && pnpm exec vp fmt data
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as Schema from "effect/Schema";
import type { Cell, Group, OptionMap, Source } from "../src/option-map.ts";

// The parts of src/Probe.ts's schema this script reads.
interface ProbeType {
  readonly name: string;
  readonly nested?: { readonly [key: string]: ProbeType };
  readonly alternatives?: ReadonlyArray<ProbeType>;
  readonly options?: ProbeTree;
}
interface ProbeTree {
  readonly [name: string]: { readonly group: ProbeTree } | ProbeOption;
}
interface ProbeOption {
  readonly id: string | null;
  readonly visible: boolean | "shallow";
  readonly internal: boolean;
  readonly type: ProbeType;
}
const ProbeType: Schema.Codec<ProbeType> = Schema.Struct({
  name: Schema.String,
  nested: Schema.Record(
    Schema.String,
    Schema.suspend((): Schema.Codec<ProbeType> => ProbeType),
  ).pipe(Schema.optionalKey),
  alternatives: Schema.Array(Schema.suspend((): Schema.Codec<ProbeType> => ProbeType)).pipe(
    Schema.optionalKey,
  ),
  options: Schema.suspend((): Schema.Codec<ProbeTree> => ProbeTree).pipe(Schema.optionalKey),
});
const ProbeTree: Schema.Codec<ProbeTree> = Schema.Record(
  Schema.String,
  Schema.Union([
    Schema.Struct({ group: Schema.suspend((): Schema.Codec<ProbeTree> => ProbeTree) }),
    Schema.Struct({
      id: Schema.NullOr(Schema.String),
      visible: Schema.Union([Schema.Boolean, Schema.Literal("shallow")]),
      internal: Schema.Boolean,
      type: ProbeType,
    }),
  ]),
);

// `nix flake archive --json`: each input's store path, and the inputs it has in turn. Inputs that
// aren't fetched, such as devenv-cachix in infra, have no path.
interface ArchivedFlake {
  readonly path?: string;
  readonly inputs?: { readonly [name: string]: ArchivedFlake };
}
const ArchivedFlake: Schema.Codec<ArchivedFlake> = Schema.Struct({
  path: Schema.String.pipe(Schema.optionalKey),
  inputs: Schema.Record(
    Schema.String,
    Schema.suspend((): Schema.Codec<ArchivedFlake> => ArchivedFlake),
  ).pipe(Schema.optionalKey),
});

const [probeFile, flakeDir] = process.argv.slice(2);
if (probeFile === undefined || flakeDir === undefined) {
  throw new Error("usage: node scripts/reduce-options.ts <probe.json> <flake directory>");
}

// Inputs often follow each other, so a store path is named after the shallowest input that has it.
const archive = execFileSync("nix", ["flake", "archive", "--dry-run", "--json", flakeDir], {
  encoding: "utf8",
});
const inputPaths = new Map<string, string>();
let level: ReadonlyArray<ArchivedFlake> = [
  Schema.decodeSync(Schema.fromJsonString(ArchivedFlake))(archive),
];
while (level.length > 0) {
  for (const [name, input] of level.flatMap((flake) => Object.entries(flake.inputs ?? {}))) {
    if (input.path !== undefined && !inputPaths.has(input.path)) inputPaths.set(input.path, name);
  }
  level = level.flatMap((flake) => Object.values(flake.inputs ?? {}));
}

const sourceOfInput = (input: string): Source =>
  input === "nixpkgs" ? "nixpkgs" : input === "home-manager" ? "home-manager" : "inputs";

// The flake's own source is the one store path that isn't one of its inputs. It moves with every
// commit, so it can't be looked up like the inputs.
interface Declaration {
  readonly source: Source;
  readonly input: string;
}
let selfPath: string | undefined;
const declaredBy = (id: string | null): Declaration => {
  const storePath = id?.match(/^\/nix\/store\/[a-z0-9]{32}-[^/]+/)?.[0];
  if (storePath === undefined) throw new Error(`option declared outside the store: ${id}`);
  const input = inputPaths.get(storePath);
  if (input !== undefined) return { source: sourceOfInput(input), input };
  selfPath ??= storePath;
  if (storePath !== selfPath)
    throw new Error(`${storePath} is neither an input of ${flakeDir} nor its only other source`);
  return { source: "self", input: "self" };
};

interface Leaf {
  /** The top-level namespace. */
  readonly group: string;
  readonly path: ReadonlyArray<string>;
  readonly source: Source;
  readonly input: string;
  readonly visible: boolean;
}
const leaves: Array<Leaf> = [];

// Mirrors the NixOS manual's notation: `<name>` for an attribute set's members, `*` for a list's.
const walkType = (type: ProbeType, path: ReadonlyArray<string>): void => {
  if (type.options !== undefined) walkTree(type.options, path);
  for (const [key, inner] of Object.entries(type.nested ?? {})) {
    const segment =
      key !== "elemType"
        ? []
        : type.name === "listOf"
          ? ["*"]
          : /ttrs(Of|With)$/.test(type.name)
            ? ["<name>"]
            : [];
    walkType(inner, [...path, ...segment]);
  }
  for (const alternative of type.alternatives ?? []) walkType(alternative, path);
};
const walkTree = (tree: ProbeTree, path: ReadonlyArray<string>): void => {
  for (const [key, node] of Object.entries(tree)) {
    if ("group" in node) {
      walkTree(node.group, [...path, key]);
      continue;
    }
    const option = [...path, key];
    leaves.push({
      group: path[0] ?? key,
      path: option,
      ...declaredBy(node.id),
      visible: node.visible === true && !node.internal,
    });
    walkType(node.type, option);
  }
};
walkTree(Schema.decodeSync(Schema.fromJsonString(ProbeTree))(readFileSync(probeFile, "utf8")), []);

// A group's blocks are its second-level namespaces, with two exceptions. Home Manager's options all
// sit under one user's submodule, `home-manager.users.<name>`, and nearly all of disko's under
// `disko.devices`, so their blocks are one level further down. An option directly in a namespace
// counts towards the namespace's own block.
const blockDepth = (leaf: Leaf): number => {
  const depth =
    leaf.group === "home-manager" && leaf.path[1] === "users"
      ? 4
      : leaf.group === "disko" && leaf.path[1] === "devices"
        ? 3
        : 2;
  return Math.max(1, Math.min(leaf.path.length - 1, depth));
};

const countBy = <A, K extends string>(
  items: ReadonlyArray<A>,
  key: (item: A) => K | undefined,
): Array<readonly [K, number]> => {
  const counts = new Map<K, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== undefined) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].toSorted((a, b) => b[1] - a[1]);
};

const blockOf = (path: string, items: ReadonlyArray<Leaf>): Omit<Cell, "path" | "top"> => {
  const [source] = countBy(items, (leaf) => leaf.source);
  if (source === undefined) throw new Error(`${path} has no options`);
  return {
    count: items.length,
    source: source[0],
    inputs: countBy(items, (leaf) => leaf.input).map(([input]) => input),
  };
};

const cellOf = (path: string, depth: number, items: ReadonlyArray<Leaf>): Cell => ({
  path,
  ...blockOf(path, items),
  // The sub-namespaces inside, leaving out options declared directly in this one.
  top: countBy(items, (leaf) => (leaf.path.length > depth + 1 ? leaf.path[depth] : undefined))
    .slice(0, 3)
    .map(([name, count]) => ({ name, count })),
});

const total = leaves.length;
// Namespaces below this share of all options join the smaller namespaces' group, and blocks below the
// next one join their group's remainder. Each smaller namespace keeps its own block, so the flake's own
// options, which are few, stay visible.
const groupShare = 0.004;
const cellShare = 0.0006;

const groupOf = (
  name: string,
  depth: (leaf: Leaf) => number,
  items: ReadonlyArray<Leaf>,
  minimum: number,
): Group => {
  // All options in a block share its depth, since the path prefix that names it has that many segments.
  const blocks = [...Map.groupBy(items, (leaf) => leaf.path.slice(0, depth(leaf)).join("."))]
    .map(([path, blockItems]) => ({
      path,
      items: blockItems,
      depth: Math.max(...blockItems.map(depth)),
    }))
    .toSorted((a, b) => b.items.length - a.items.length);
  const kept = blocks.filter((block) => block.items.length >= minimum);
  const rest = blocks.slice(kept.length);
  const cells = (rest.length > 1 ? kept : blocks).map((block) =>
    cellOf(block.path, block.depth, block.items),
  );
  if (rest.length > 1) {
    const path = `${rest.length} more`;
    cells.push({
      path,
      ...blockOf(
        path,
        rest.flatMap((block) => block.items),
      ),
      top: rest.slice(0, 3).map((block) => ({ name: block.path, count: block.items.length })),
      folded: rest.length,
    });
  }
  return { name, count: items.length, cells };
};

const byGroup = [...Map.groupBy(leaves, (leaf) => leaf.group)];
const large = byGroup.filter(([, items]) => items.length >= total * groupShare);
const small = byGroup.filter(([, items]) => items.length < total * groupShare);

const map: OptionMap = {
  host: "srv-2",
  total,
  visible: leaves.filter((leaf) => leaf.visible).length,
  foldedBelow: Math.ceil(total * cellShare),
  sources: countBy(leaves, (leaf) => leaf.source).map(([source, count]) => ({
    source,
    count,
    inputs: countBy(
      leaves.filter((leaf) => leaf.source === source),
      (leaf) => leaf.input,
    ).map(([input, n]) => ({ name: input, count: n })),
  })),
  groups: [
    ...large
      .map(([name, items]) => groupOf(name, blockDepth, items, total * cellShare))
      .toSorted((a, b) => b.count - a.count),
    groupOf(
      `${small.length} smaller namespaces`,
      () => 1,
      small.flatMap(([, items]) => items),
      0,
    ),
  ],
};

process.stdout.write(`// Generated by scripts/reduce-options.ts. Do not edit.
import type { OptionMap } from "../src/option-map.ts"

export const srv2: OptionMap = ${JSON.stringify(map)}
`);
