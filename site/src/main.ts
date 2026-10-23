import "@fontsource-variable/atkinson-hyperlegible-next/wght.css";
import "@fontsource-variable/atkinson-hyperlegible-mono/wght.css";
import "./style.css";
import { mountMap } from "./map.ts";

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

// The module and its Nix: a highlighted part lights its counterpart and shows its note.
const pair = required("[data-pair]", HTMLElement);
const notes = [...pair.querySelectorAll<HTMLElement>("[data-note]")];
let pinned = "";

const light = (id: string): void => {
  for (const part of pair.querySelectorAll<HTMLElement>(".link"))
    part.classList.toggle("is-lit", part.dataset["link"] === id);
  for (const note of notes) note.hidden = note.dataset["note"] !== id;
};
const linkOf = (target: EventTarget | null): string | undefined =>
  target instanceof Element ? target.closest<HTMLElement>(".link")?.dataset["link"] : undefined;

// Only the TypeScript side takes focus, so the keyboard reaches each note once.
for (const part of pair.querySelectorAll<HTMLElement>(".pane:first-child .link")) part.tabIndex = 0;
pair.addEventListener("pointerover", (event) => {
  if (event.pointerType === "mouse") light(linkOf(event.target) ?? pinned);
});
pair.addEventListener("pointerleave", () => light(pinned));
pair.addEventListener("click", (event) => {
  const id = linkOf(event.target) ?? "";
  pinned = id === pinned ? "" : id;
  light(pinned);
});
pair.addEventListener("focusin", (event) => light(linkOf(event.target) ?? pinned));
pair.addEventListener("focusout", () => light(pinned));

// Ten mistakes: each button swaps in its broken copy of sample.ts and what tsc printed for it.
const sample = required("[data-sample]", HTMLElement);
const terminal = required(".out", HTMLElement);
const output = required("[data-out]", HTMLElement, terminal);
const work = required("[data-mistake-work]", HTMLElement);
const reset = required("[data-mistake-reset]", HTMLButtonElement);
const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-mistake]")];
const working = { code: sample.innerHTML, output: output.innerHTML };

const choose = (index: string | undefined): void => {
  const code =
    index === undefined
      ? undefined
      : required(`[data-mistake-code="${index}"]`, HTMLTemplateElement);
  const message =
    index === undefined
      ? undefined
      : required(`[data-mistake-output="${index}"]`, HTMLTemplateElement);
  for (const button of buttons)
    button.setAttribute("aria-pressed", String(button.dataset["mistake"] === index));
  reset.hidden = index === undefined;
  sample.innerHTML = code?.innerHTML ?? working.code;
  output.innerHTML = message?.innerHTML ?? working.output;
  terminal.classList.toggle("has-error", index !== undefined);

  const pre = required("pre", HTMLElement, sample);
  const changed = sample.querySelector<HTMLElement>(".line.changed");
  if (changed !== null) pre.scrollTop = changed.offsetTop - pre.clientHeight / 2;
  const box = work.getBoundingClientRect();
  if (index !== undefined && (box.top < 0 || box.bottom > innerHeight)) {
    work.scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth" });
  }
};

for (const button of buttons) {
  button.addEventListener("click", () =>
    choose(button.getAttribute("aria-pressed") === "true" ? undefined : button.dataset["mistake"]),
  );
}
reset.addEventListener("click", () => {
  choose(undefined);
  buttons[0]?.focus();
});

mountMap(required(".map-figure", HTMLElement));
