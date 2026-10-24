import graphUrl from "../data/graph.json?url";
import type { Graph, GraphNode } from "./data.ts";

/**
 * The example server's option tree as a snowflake. One arm is the real tree: each node is a segment,
 * and its children branch off it at sixty degrees, alternating sides, spaced by the square root of
 * how many options they hold. The page draws that arm six times and mirrors each copy, so every
 * branch of the flake is the same option.
 */
interface Tree {
  readonly count: number;
  readonly names: ReadonlyArray<string>;
  readonly parent: Int32Array;
  /** Index into `Graph.types`, or -1 for a namespace. */
  readonly type: Int32Array;
  /** Options at or below the node. */
  readonly options: Int32Array;
  /** Nodes are in preorder, so a node's subtree is `[node, end)`. */
  readonly end: Int32Array;
  readonly leaf: Uint8Array;
  readonly depth: Uint8Array;
  /** How much a crowd of siblings dims the node, multiplied down the tree. */
  readonly fade: Float32Array;
}

// The arm's shape, tuned by eye on the example: spacing exponent, branch length exponent, shrink
// per level, the stretch of a branch its children use, and the crowd size before siblings dim.
const spacing = 0.5;
const lengthExponent = 0.35;
const shrink = 0.5;
const shortest = 0.18;
const spread = [0.1, 0.97] as const;
const crowd = 12;
const turn = Math.PI / 3;

/** A node's second field is its children, or the type of an option without any. */
const isBranch = (field: GraphNode[1]): field is ReadonlyArray<GraphNode> => Array.isArray(field);

const flatten = (graph: Graph): Tree => {
  const names: Array<string> = [];
  const parent: Array<number> = [];
  const type: Array<number> = [];
  const options: Array<number> = [];
  const end: Array<number> = [];
  const leaf: Array<number> = [];
  const depth: Array<number> = [];
  const fade: Array<number> = [];
  const visit = (node: GraphNode, up: number, level: number, dim: number): number => {
    const index = names.length;
    const [name, second, third] = node;
    const children = isBranch(second) ? second : [];
    names.push(name);
    parent.push(up);
    type.push(isBranch(second) ? (third ?? -1) : second);
    leaf.push(children.length === 0 ? 1 : 0);
    depth.push(level);
    fade.push(dim);
    options.push(0);
    end.push(0);
    const childDim = dim * Math.min(1, Math.sqrt(crowd / Math.max(1, children.length)));
    let count = children.length === 0 ? 1 : 0;
    for (const child of children) count += visit(child, index, level + 1, childDim);
    options[index] = count;
    end[index] = names.length;
    return count;
  };
  visit(["", graph.tree], -1, 0, 1);
  return {
    count: names.length,
    names,
    parent: Int32Array.from(parent),
    type: Int32Array.from(type),
    options: Int32Array.from(options),
    end: Int32Array.from(end),
    leaf: Uint8Array.from(leaf),
    depth: Uint8Array.from(depth),
    fade: Float32Array.from(fade),
  };
};

/** Segment ends of the arm along +x, with the stem one unit long. */
interface Arm {
  readonly x0: Float32Array;
  readonly y0: Float32Array;
  readonly x1: Float32Array;
  readonly y1: Float32Array;
}

const weightOf = (tree: Tree, node: number): number => (tree.options[node] ?? 1) ** spacing;

const layOut = (tree: Tree): Arm => {
  const x0 = new Float32Array(tree.count);
  const y0 = new Float32Array(tree.count);
  const x1 = new Float32Array(tree.count);
  const y1 = new Float32Array(tree.count);
  const place = (node: number, x: number, y: number, angle: number, length: number): void => {
    x0[node] = x;
    y0[node] = y;
    x1[node] = x + Math.cos(angle) * length;
    y1[node] = y + Math.sin(angle) * length;
    const children: Array<number> = [];
    for (let child = node + 1; child < (tree.end[node] ?? 0); child = tree.end[child] ?? child + 1)
      children.push(child);
    const total = children.reduce((sum, child) => sum + weightOf(tree, child), 0);
    let before = 0;
    children.forEach((child, i) => {
      const share = weightOf(tree, child) / total;
      const along = spread[0] + (spread[1] - spread[0]) * (before + share / 2);
      before += share;
      const side = i % 2 === 0 ? 1 : -1;
      const ratio = (tree.options[child] ?? 1) / (tree.options[node] ?? 1);
      const childLength =
        tree.leaf[child] === 1
          ? Math.min(length * 0.3, 0.009)
          : length * shrink * Math.max(shortest, ratio ** lengthExponent);
      place(
        child,
        x + Math.cos(angle) * length * along,
        y + Math.sin(angle) * length * along,
        angle + side * turn,
        childLength,
      );
    });
  };
  place(0, 0, 0, 0, 1);
  return { x0, y0, x1, y1 };
};

const alphaOf = (tree: Tree, node: number): number =>
  (tree.leaf[node] === 1 ? 0.25 : Math.max(0.05, 0.6 - (tree.depth[node] ?? 0) * 0.07)) *
  (tree.fade[node] ?? 1);
const widthOf = (tree: Tree, node: number, scale: number): number =>
  (tree.leaf[node] === 1 ? 0.45 : Math.max(0.35, 1.9 - (tree.depth[node] ?? 0) * 0.32)) * scale;

/** The twelve copies: each arm rotated into place, and mirrored. */
const copies = Array.from({ length: 12 }, (_, i) => ({
  angle: Math.floor(i / 2) * turn,
  mirror: i % 2 === 0 ? 1 : -1,
}));

const frost = "214, 232, 247";

export interface Flake {
  /** Lights `node` and its options, or nothing. */
  readonly light: (node: number | undefined) => void;
  readonly pathOf: (node: number) => string;
  readonly describe: (node: number) => string;
  readonly search: (query: string) => ReadonlyArray<number>;
}

export const mountFlake = async (
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  onPoint: (node: number | undefined, pinned: boolean) => void,
): Promise<Flake> => {
  // scripts/example.ts wrote the file from a `Graph`.
  const data: Graph = await (await fetch(graphUrl)).json();
  const tree = flatten(data);
  const arm = layOut(tree);

  const overlay = document.createElement("canvas");
  overlay.className = "flake-light";
  overlay.setAttribute("aria-hidden", "true");
  stage.append(overlay);

  const lines = document.createElement("canvas");
  const glow = document.createElement("canvas");
  let size = 0;
  let ratio = 1;
  let radius = 0;
  let grid = new Map<number, Array<number>>();
  const cell = 6;

  const key = (x: number, y: number) => Math.floor(x / cell) * 100_000 + Math.floor(y / cell);

  // Every segment goes into the grid cells along it, so pointing near a branch finds it.
  const index = () => {
    grid = new Map();
    for (let node = 0; node < tree.count; node++) {
      const ax = (arm.x0[node] ?? 0) * radius;
      const ay = (arm.y0[node] ?? 0) * radius;
      const bx = (arm.x1[node] ?? 0) * radius;
      const by = (arm.y1[node] ?? 0) * radius;
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell / 2)));
      const seen = new Set<number>();
      for (let step = 0; step <= steps; step++) {
        const k = key(ax + ((bx - ax) * step) / steps, ay + ((by - ay) * step) / steps);
        if (seen.has(k)) continue;
        seen.add(k);
        const bucket = grid.get(k);
        if (bucket === undefined) grid.set(k, [node]);
        else bucket.push(node);
      }
    }
  };

  const draw = () => {
    const box = stage.getBoundingClientRect();
    size = Math.round(box.width);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    radius = size * 0.47;
    for (const target of [canvas, overlay, lines]) {
      target.width = Math.round(size * ratio);
      target.height = Math.round(size * ratio);
    }
    glow.width = Math.max(1, Math.round((size * ratio) / 6));
    glow.height = glow.width;

    // Segments of one color and width share a path, so each copy strokes a few dozen paths.
    const scale = size / 720;
    const buckets = new Map<string, { alpha: number; width: number; path: Path2D }>();
    for (let node = 0; node < tree.count; node++) {
      const alpha = Math.round(alphaOf(tree, node) * 60) / 60;
      if (alpha <= 0) continue;
      const width = Math.round(widthOf(tree, node, scale) * 8) / 8;
      const id = `${alpha}:${width}`;
      let bucket = buckets.get(id);
      if (bucket === undefined) {
        bucket = { alpha, width, path: new Path2D() };
        buckets.set(id, bucket);
      }
      bucket.path.moveTo((arm.x0[node] ?? 0) * radius, (arm.y0[node] ?? 0) * radius);
      bucket.path.lineTo((arm.x1[node] ?? 0) * radius, (arm.y1[node] ?? 0) * radius);
    }
    const context = lines.getContext("2d");
    if (context === null) return;
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    for (const copy of copies) {
      context.setTransform(ratio, 0, 0, ratio, (size * ratio) / 2, (size * ratio) / 2);
      context.rotate(copy.angle);
      context.scale(1, copy.mirror);
      for (const { alpha, width, path } of buckets.values()) {
        context.strokeStyle = `rgba(${frost}, ${alpha})`;
        context.lineWidth = width;
        context.stroke(path);
      }
    }
    // A blur without `filter`, which Safari's canvas lacks: shrink the lines and stretch them back.
    const soft = glow.getContext("2d");
    if (soft === null) return;
    soft.imageSmoothingQuality = "high";
    soft.drawImage(lines, 0, 0, glow.width, glow.height);
    index();
  };

  const compose = (reveal: number) => {
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    if (reveal < 1) {
      context.beginPath();
      context.arc(
        canvas.width / 2,
        canvas.height / 2,
        radius * ratio * 1.08 * reveal,
        0,
        Math.PI * 2,
      );
      context.clip();
    }
    context.globalCompositeOperation = "lighter";
    context.imageSmoothingQuality = "high";
    context.globalAlpha = 0.75;
    context.drawImage(glow, 0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;
    context.drawImage(lines, 0, 0);
    context.restore();
  };

  draw();
  // The flake grows once from its center, the way the crystal would.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) compose(1);
  else {
    const start = performance.now();
    const grow = (now: number) => {
      // A frame's timestamp can precede the `performance.now()` taken before it was requested.
      const t = Math.min(1, Math.max(0, (now - start) / 1600));
      compose(1 - (1 - t) ** 3);
      if (t < 1) requestAnimationFrame(grow);
    };
    requestAnimationFrame(grow);
  }

  let lit: number | undefined;
  const light = (node: number | undefined) => {
    lit = node;
    const context = overlay.getContext("2d");
    if (context === null) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, overlay.width, overlay.height);
    if (node === undefined) return;
    const chain: Array<number> = [];
    for (let up = node; up > 0; up = tree.parent[up] ?? 0) chain.push(up);
    const below = (tree.end[node] ?? node + 1) - node;
    context.lineCap = "round";
    for (const copy of copies) {
      context.setTransform(ratio, 0, 0, ratio, (size * ratio) / 2, (size * ratio) / 2);
      context.rotate(copy.angle);
      context.scale(1, copy.mirror);
      const segment = (n: number) => {
        context.moveTo((arm.x0[n] ?? 0) * radius, (arm.y0[n] ?? 0) * radius);
        context.lineTo((arm.x1[n] ?? 0) * radius, (arm.y1[n] ?? 0) * radius);
      };
      context.beginPath();
      for (let n = node + 1; n < node + below; n++) segment(n);
      context.strokeStyle = "rgba(255, 255, 255, 0.55)";
      context.lineWidth = 0.7;
      context.stroke();
      context.beginPath();
      for (const n of chain) segment(n);
      context.strokeStyle = "rgba(255, 255, 255, 0.95)";
      context.lineWidth = 1.6;
      context.shadowColor = "rgba(160, 210, 255, 0.9)";
      context.shadowBlur = 8 * ratio;
      context.stroke();
      context.shadowBlur = 0;
      context.beginPath();
      context.arc((arm.x1[node] ?? 0) * radius, (arm.y1[node] ?? 0) * radius, 2.6, 0, Math.PI * 2);
      context.fillStyle = "#fff";
      context.fill();
    }
  };

  // A point on the page, folded back onto the arm through each copy, to the nearest segment.
  const nearest = (clientX: number, clientY: number): number | undefined => {
    const box = canvas.getBoundingClientRect();
    const px = clientX - box.left - box.width / 2;
    const py = clientY - box.top - box.height / 2;
    if (Math.hypot(px, py) > radius * 1.05) return undefined;
    let best: number | undefined;
    let bestDistance = 8;
    for (const copy of copies) {
      const cos = Math.cos(-copy.angle);
      const sin = Math.sin(-copy.angle);
      const x = px * cos - py * sin;
      const y = (px * sin + py * cos) * copy.mirror;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const node of grid.get(key(x + dx * cell, y + dy * cell)) ?? []) {
            const ax = (arm.x0[node] ?? 0) * radius;
            const ay = (arm.y0[node] ?? 0) * radius;
            const bx = (arm.x1[node] ?? 0) * radius;
            const by = (arm.y1[node] ?? 0) * radius;
            const length = (bx - ax) ** 2 + (by - ay) ** 2;
            const t =
              length === 0
                ? 0
                : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length));
            const distance = Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
            if (distance < bestDistance) {
              bestDistance = distance;
              best = node;
            }
          }
        }
      }
    }
    return best;
  };

  let pinned: number | undefined;
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const node = nearest(event.clientX, event.clientY) ?? pinned;
    if (node === lit) return;
    light(node);
    onPoint(node, node === pinned);
  });
  canvas.addEventListener("pointerleave", () => {
    light(pinned);
    onPoint(pinned, true);
  });
  canvas.addEventListener("click", (event) => {
    pinned = nearest(event.clientX, event.clientY);
    light(pinned);
    onPoint(pinned, true);
  });

  let resizing = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizing);
    resizing = requestAnimationFrame(() => {
      if (Math.round(stage.getBoundingClientRect().width) === size) return;
      draw();
      compose(1);
      light(lit);
    });
  }).observe(stage);

  const pathOf = (node: number): string => {
    const names: Array<string> = [];
    for (let up = node; up > 0; up = tree.parent[up] ?? 0) names.push(tree.names[up] ?? "");
    return names.toReversed().join(".");
  };
  const format = new Intl.NumberFormat("en");
  const describe = (node: number): string => {
    const type = tree.type[node] ?? -1;
    const count = tree.options[node] ?? 0;
    const inside = `${format.format(count)} ${count === 1 ? "option" : "options"}`;
    if (type === -1) return inside;
    const typed = data.types[type] ?? "";
    return tree.leaf[node] === 1 ? typed : `${typed}, ${inside} inside`;
  };

  let paths: ReadonlyArray<string> | undefined;
  const search = (query: string): ReadonlyArray<number> => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return [];
    paths ??= Array.from({ length: tree.count }, (_, node) => pathOf(node).toLowerCase());
    const found: Array<number> = [];
    for (let node = 1; node < tree.count; node++) {
      if ((paths[node] ?? "").includes(needle)) found.push(node);
    }
    // Names that are the query come first, then the shortest paths.
    const exact = (node: number) => ((tree.names[node] ?? "").toLowerCase() === needle ? 0 : 1);
    return found
      .toSorted(
        (a, b) => exact(a) - exact(b) || (paths?.[a]?.length ?? 0) - (paths?.[b]?.length ?? 0),
      )
      .slice(0, 8);
  };

  return {
    light: (node) => {
      pinned = node;
      light(node);
    },
    pathOf,
    describe,
    search,
  };
};
