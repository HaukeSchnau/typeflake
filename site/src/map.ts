import { srv2 } from "../data/srv-2.ts";
import { inputLabel, type Cell, type Group } from "./option-map.ts";

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Placed<A> {
  readonly item: A;
  readonly rect: Rect;
}

// The worst aspect ratio in a row of areas laid along a side of length `side`.
const worst = (areas: ReadonlyArray<number>, side: number): number => {
  const sum = areas.reduce((a, b) => a + b, 0);
  return Math.max(
    ...areas.map((area) =>
      Math.max((side * side * area) / (sum * sum), (sum * sum) / (side * side * area)),
    ),
  );
};

/**
 * Squarified treemap layout (Bruls, Huizing and van Wijk). It lays items out largest first, so the
 * largest lands in the top left corner.
 */
const squarify = <A extends { readonly count: number }>(
  items: ReadonlyArray<A>,
  rect: Rect,
): Array<Placed<A>> => {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const placed: Array<Placed<A>> = [];
  let rest = items
    .toSorted((a, b) => b.count - a.count)
    .map((item) => ({ item, area: item.count * scale }));
  let free = rect;
  while (rest.length > 0) {
    const side = Math.min(free.w, free.h);
    let count = 1;
    while (
      count < rest.length &&
      worst(
        rest.slice(0, count + 1).map((entry) => entry.area),
        side,
      ) <=
        worst(
          rest.slice(0, count).map((entry) => entry.area),
          side,
        )
    ) {
      count++;
    }
    const row = rest.slice(0, count);
    const rowArea = row.reduce((sum, entry) => sum + entry.area, 0);
    if (free.w >= free.h) {
      const w = rowArea / free.h;
      let y = free.y;
      for (const entry of row) {
        const h = entry.area / w;
        placed.push({ item: entry.item, rect: { x: free.x, y, w, h } });
        y += h;
      }
      free = { x: free.x + w, y: free.y, w: free.w - w, h: free.h };
    } else {
      const h = rowArea / free.w;
      let x = free.x;
      for (const entry of row) {
        const w = entry.area / h;
        placed.push({ item: entry.item, rect: { x, y: free.y, w, h } });
        x += w;
      }
      free = { x: free.x, y: free.y + h, w: free.w, h: free.h - h };
    }
    rest = rest.slice(count);
  }
  return placed;
};

const number = new Intl.NumberFormat("en");
const groupGap = 2;
const cellGap = 1;
const chipHeight = 22;

interface Block {
  readonly group: Group;
  readonly cell: Cell;
  readonly element: HTMLElement;
}

const inset = (rect: Rect, by: number): Rect => ({
  x: rect.x + by,
  y: rect.y + by,
  w: Math.max(0, rect.w - 2 * by),
  h: Math.max(0, rect.h - 2 * by),
});

const nameOf = (cell: Cell): string =>
  cell.folded === undefined
    ? cell.path.slice(cell.path.lastIndexOf(".") + 1)
    : `${number.format(cell.folded)} more`;

const share = (count: number, total: number): string => {
  const percent = (100 * count) / total;
  return percent < 0.1 ? "under 0.1%" : `${percent.toFixed(1)}%`;
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const indexOf = (target: EventTarget | null): number => {
  const block = target instanceof Element ? target.closest<HTMLElement>(".block") : null;
  return block === null ? -1 : Number(block.dataset["index"]);
};

/** Draws srv-2's option graph into the figure's `[data-map]` and describes blocks in its `[data-readout]`. */
export const mountMap = (figure: HTMLElement): void => {
  const map = srv2;
  const root = figure.querySelector("[data-map]");
  const readout = figure.querySelector("[data-readout]");
  if (!(root instanceof HTMLElement) || !(readout instanceof HTMLElement)) {
    throw new Error("the map figure needs [data-map] and [data-readout]");
  }
  const measure = document.createElement("canvas").getContext("2d");
  if (measure === null) throw new Error("the map measures its labels on a 2D canvas");
  const restingReadout = [...readout.childNodes].map((node) => node.cloneNode(true));
  let blocks: Array<Block> = [];
  let active = -1;
  // A click or tap keeps a block in the readout after the pointer leaves.
  let pinned = -1;

  const describe = ({ group, cell }: Block): Array<HTMLElement> => {
    const path = element("p", "readout-path");
    const detail = element("p", "readout-detail");
    if (cell.folded !== undefined) {
      path.append(
        `${number.format(cell.folded)} more namespaces in `,
        element("code", "", group.name),
      );
      detail.append(
        `${number.format(cell.count)} options together, each with fewer than ${number.format(map.foldedBelow)}. Largest: `,
        ...cell.top.flatMap((top, i) => [
          i > 0 ? ", " : "",
          element("code", "", top.name),
          ` ${number.format(top.count)}`,
        ]),
        ".",
      );
      return [path, detail];
    }
    path.append(element("code", "", cell.path));
    const declared = cell.inputs.map(inputLabel).join(", ");
    const own = cell.path === group.name ? ` declared directly in ${group.name}` : "";
    detail.append(
      `${number.format(cell.count)} options${own}, ${share(cell.count, map.total)} of the graph. Declared by ${declared}.`,
    );
    if (cell.top.length > 0) {
      detail.append(
        " Largest inside: ",
        ...cell.top.flatMap((top, i) => [
          i > 0 ? ", " : "",
          element("code", "", top.name),
          ` ${number.format(top.count)}`,
        ]),
        ".",
      );
    }
    return [path, detail];
  };

  const show = (index: number): void => {
    blocks[active]?.element.classList.remove("is-active");
    active = index;
    const block = blocks[index];
    if (block === undefined) {
      readout.replaceChildren(...restingReadout.map((node) => node.cloneNode(true)));
      return;
    }
    block.element.classList.add("is-active");
    readout.replaceChildren(...describe(block));
  };

  const render = (): void => {
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (width === 0 || height === 0) return;
    const font = getComputedStyle(root).fontFamily;
    const textWidth = (text: string, weight: number, size: number): number => {
      measure.font = `${weight} ${size}px ${font}`;
      return measure.measureText(text).width;
    };
    const nodes: Array<HTMLElement> = [];
    blocks = [];
    for (const { item: group, rect: groupRect } of squarify(map.groups, {
      x: 0,
      y: 0,
      w: width,
      h: height,
    })) {
      const area = inset(groupRect, groupGap);
      const groupCount = number.format(group.count);
      const chip =
        area.h >= 64 &&
        area.w >= textWidth(group.name, 700, 13) + textWidth(groupCount, 400, 13) + 28;
      for (const [i, { item: cell, rect }] of squarify(group.cells, area).entries()) {
        const box = inset(rect, cellGap);
        const node = element("div", cell.folded === undefined ? "block" : "block folded");
        node.dataset["source"] = cell.source;
        node.dataset["index"] = String(blocks.length);
        node.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;--order:${blocks.length}`;
        const top = chip && i === 0 ? chipHeight : 0;
        const name = nameOf(cell);
        const count = number.format(cell.count);
        if (box.w >= textWidth(name, 600, 12.5) + 14 && box.h >= top + 22) {
          const label = element("span", "block-label", name);
          label.style.paddingTop = `${top + 4}px`;
          if (box.w >= textWidth(count, 400, 12.5) + 14 && box.h >= top + 40) {
            label.append(element("span", "block-count", count));
          }
          node.append(label);
        }
        nodes.push(node);
        blocks.push({ group, cell, element: node });
      }
      if (chip) {
        const node = element("div", "group-chip");
        node.style.cssText = `left:${area.x}px;top:${area.y}px;max-width:${area.w}px`;
        node.append(
          element("span", "group-name", group.name),
          element("span", "group-count", groupCount),
        );
        nodes.push(node);
      }
    }
    root.replaceChildren(...nodes);
    if (active >= 0) blocks[active]?.element.classList.add("is-active");
  };

  root.addEventListener("pointerover", (event) => {
    if (event.pointerType === "mouse") show(indexOf(event.target));
  });
  root.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") show(pinned);
  });
  root.addEventListener("click", (event) => {
    const index = indexOf(event.target);
    pinned = index === pinned ? -1 : index;
    show(index);
  });
  const pin = (index: number): void => {
    pinned = index;
    show(index);
  };
  root.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step !== undefined) pin(Math.min(blocks.length - 1, Math.max(0, active + step)));
    else if (event.key === "Home") pin(0);
    else if (event.key === "End") pin(blocks.length - 1);
    else if (event.key === "Escape") pin(-1);
    else return;
    event.preventDefault();
  });

  // The blocks arrive largest first the first time the map scrolls into view.
  const arrival = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      root.classList.add("is-revealed");
      arrival.disconnect();
    },
    { threshold: 0.25 },
  );
  arrival.observe(root);

  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }).observe(root);
  void document.fonts.ready.then(render);
};
