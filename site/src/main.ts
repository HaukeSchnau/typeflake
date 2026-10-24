import "@fontsource-variable/recursive/mono.css";
import "./style.css";
import { mountFlake } from "./flake.ts";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const required = <E extends Element>(
  selector: string,
  type: abstract new () => E,
  root: ParentNode = document,
): E => {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`index.html has no ${type.name} at ${selector}`);
  return found;
};

// The install command.
const copy = required("[data-copy]", HTMLButtonElement);
copy.addEventListener("click", () => {
  const command = required("[data-copy-source]", HTMLElement).textContent ?? "";
  navigator.clipboard.writeText(command).then(
    () => {
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1600);
    },
    () => (copy.textContent = "Select it to copy"),
  );
});

// The module and its Nix: a highlighted part lights its counterpart, a thread joins them, and its
// note shows.
const pair = required("[data-pair]", HTMLElement);
const threads = required("[data-threads]", SVGSVGElement, pair);
const notes = [...pair.querySelectorAll<HTMLElement>("[data-note]")];
const [left, right] = [...pair.querySelectorAll<HTMLElement>(".pane")];
let pinned = "";

/** Where `part` is, if its pane shows it. */
const visible = (part: Element, pane: DOMRect) => {
  const box = part.getBoundingClientRect();
  return box.bottom > pane.top && box.top < pane.bottom ? box : undefined;
};

const thread = (id: string) => {
  threads.replaceChildren();
  if (id === "" || left === undefined || right === undefined) return;
  const frame = pair.getBoundingClientRect();
  const leftBox = left.getBoundingClientRect();
  const rightBox = right.getBoundingClientRect();
  // Side by side only; stacked panes have no gutter to cross.
  if (rightBox.left < leftBox.right) return;
  threads.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
  const from = [...left.querySelectorAll(`.link[data-link="${id}"]`)].flatMap((part) => {
    const box = visible(part, leftBox);
    return box === undefined ? [] : [box];
  });
  const to = [...right.querySelectorAll(`.link[data-link="${id}"]`)].flatMap((part) => {
    const box = visible(part, rightBox);
    return box === undefined ? [] : [box];
  });
  const [end] = to;
  if (end === undefined) return;
  // Each thread leaves its part to the right, crosses the gutter, and enters the other part.
  const gutterStart = leftBox.right - frame.left;
  const gutterEnd = rightBox.left - frame.left;
  const bend = (gutterEnd - gutterStart) * 0.6;
  for (const start of from) {
    const x0 = Math.min(start.right, leftBox.right) - frame.left + 4;
    const y0 = start.top + start.height / 2 - frame.top;
    const x1 = end.left - frame.left - 4;
    const y1 = end.top + end.height / 2 - frame.top;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      `M${x0} ${y0}H${gutterStart}C${gutterStart + bend} ${y0} ${gutterEnd - bend} ${y1} ${gutterEnd} ${y1}H${x1}`,
    );
    threads.append(path);
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
    ] as const) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "3");
      threads.append(dot);
    }
  }
};

const lightLink = (id: string): void => {
  for (const part of pair.querySelectorAll<HTMLElement>(".link"))
    part.classList.toggle("is-lit", part.dataset["link"] === id);
  for (const note of notes) note.hidden = note.dataset["note"] !== id;
  thread(id);
};
const linkOf = (target: EventTarget | null): string | undefined =>
  target instanceof Element ? target.closest<HTMLElement>(".link")?.dataset["link"] : undefined;

// Only the TypeScript side takes focus, so the keyboard reaches each note once.
for (const part of left?.querySelectorAll<HTMLElement>(".link") ?? []) part.tabIndex = 0;
pair.addEventListener("pointerover", (event) => {
  if (event.pointerType === "mouse") lightLink(linkOf(event.target) ?? pinned);
});
pair.addEventListener("pointerleave", () => lightLink(pinned));
pair.addEventListener("click", (event) => {
  const id = linkOf(event.target) ?? "";
  pinned = id === pinned ? "" : id;
  lightLink(pinned);
});
pair.addEventListener("focusin", (event) => lightLink(linkOf(event.target) ?? pinned));
pair.addEventListener("focusout", () => lightLink(pinned));
for (const pre of pair.querySelectorAll("pre"))
  pre.addEventListener("scroll", () => thread(pinned));
addEventListener("resize", () => thread(pinned));

// The mistakes: each button swaps in its broken copy of a module, with what tsc reported.
const editor = required("[data-editor]", HTMLElement);
const editorFile = required("[data-editor-file]", HTMLElement, editor);
const editorCode = required("[data-editor-code]", HTMLElement, editor);
const problems = required("[data-problems]", HTMLElement, editor);
const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-mistake]")];
const noProblems = problems.innerHTML;
const card = document.createElement("div");
card.className = "hover-card";
card.setAttribute("aria-hidden", "true");

const make = (index: string | undefined): void => {
  const button = buttons.find((candidate) => candidate.dataset["mistake"] === index);
  const file = button?.dataset["file"] ?? editorFile.textContent ?? "";
  for (const candidate of buttons)
    candidate.setAttribute("aria-pressed", String(candidate === button));
  const code =
    index === undefined
      ? required(`[data-editor-clean="${file}"]`, HTMLTemplateElement)
      : required(`[data-mistake-code="${index}"]`, HTMLTemplateElement);
  editorFile.textContent = file;
  editorCode.innerHTML = code.innerHTML;
  editor.classList.toggle("has-error", index !== undefined);
  if (index === undefined) {
    problems.innerHTML = noProblems;
    return;
  }
  const problem = required(`[data-mistake-problem="${index}"]`, HTMLTemplateElement);
  problems.innerHTML = problem.innerHTML;
  card.innerHTML = required(".diagnostic", HTMLElement, problem.content).outerHTML;

  // The card sits under the squiggle, like an editor's hover, and the changed line scrolls into view.
  const pre = required("pre", HTMLElement, editorCode);
  const squiggle = editorCode.querySelector<HTMLElement>(".squiggle");
  const line = editorCode.querySelector<HTMLElement>(".line.changed");
  if (line !== null) pre.scrollTop = line.offsetTop - pre.clientHeight / 3;
  if (squiggle !== null) {
    editorCode.append(card);
    const codeBox = editorCode.getBoundingClientRect();
    const box = squiggle.getBoundingClientRect();
    const leftEdge = Math.min(
      box.left - codeBox.left,
      codeBox.width - Math.min(440, codeBox.width),
    );
    card.style.left = `${Math.max(8, leftEdge)}px`;
    card.style.top = `${box.bottom - codeBox.top + 6}px`;
  }
  const frame = editor.getBoundingClientRect();
  if (frame.top < 0 || frame.bottom > innerHeight)
    editor.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
};

for (const button of buttons) {
  button.addEventListener("click", () =>
    make(button.getAttribute("aria-pressed") === "true" ? undefined : button.dataset["mistake"]),
  );
}

// The snowflake, its readout and the option search. It waits for the tree, so it comes last.
const figure = required("[data-flake]", HTMLElement);
const readoutPath = required("[data-readout-path]", HTMLElement);
const readoutType = required("[data-readout-type]", HTMLElement);
const hint = readoutPath.innerHTML;
const input = required("[data-find]", HTMLInputElement);
const results = required("[data-find-results]", HTMLUListElement);

const flake = await mountFlake(
  required(".flake-stage", HTMLElement, figure),
  required("[data-flake-canvas]", HTMLCanvasElement, figure),
  (node) => show(node),
);

function show(node: number | undefined) {
  if (node === undefined || node === 0) {
    readoutPath.innerHTML = hint;
    readoutType.textContent = "";
    return;
  }
  readoutPath.textContent = flake.pathOf(node);
  readoutType.textContent = flake.describe(node);
}

let found: ReadonlyArray<number> = [];
let active = -1;
const choose = (index: number) => {
  active = index;
  for (const [i, item] of [...results.children].entries())
    item.setAttribute("aria-selected", String(i === index));
  const node = found[index];
  if (node === undefined) return;
  input.setAttribute("aria-activedescendant", `find-${index}`);
  flake.light(node);
  show(node);
};
const close = () => {
  results.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
};
input.addEventListener("input", () => {
  found = flake.search(input.value);
  results.replaceChildren(
    ...found.map((node, i) => {
      const item = document.createElement("li");
      item.id = `find-${i}`;
      item.role = "option";
      item.setAttribute("aria-selected", "false");
      const path = document.createElement("span");
      path.className = "find-path";
      path.textContent = flake.pathOf(node);
      const type = document.createElement("span");
      type.className = "find-type";
      type.textContent = flake.describe(node);
      item.append(path, type);
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        choose(i);
      });
      return item;
    }),
  );
  results.hidden = found.length === 0;
  input.setAttribute("aria-expanded", String(found.length > 0));
  if (found.length > 0) choose(0);
});
input.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (found.length > 0)
      choose((active + (event.key === "ArrowDown" ? 1 : found.length - 1)) % found.length);
  } else if (event.key === "Escape") close();
  else if (event.key === "Enter") {
    event.preventDefault();
    close();
  }
});
input.addEventListener("blur", close);
input.addEventListener("focus", () => {
  if (found.length > 0) {
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
});
