/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE WHOLE VIEW LAYER — 100 LINES, AND THAT IS THE JUSTIFICATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ NO FRAMEWORK. The brief allows one if the bytes can be justified, and
 * they cannot: the engine and its zip stack are ~544 KB of the ~595 KB budget,
 * so a runtime is a fifth of what is left for an app whose densest screen is
 * ONE `<table>` that must be redrawn as a unit anyway. React's own reconciler
 * would be doing keyed diffing over 360 `<input>`s to save what a
 * `replaceChildren` does in a frame.
 *
 * ⚠️ WHAT THAT COSTS, SAID OUT LOUD: a full redraw blows away DOM state —
 * focus, selection, the caret position inside an `<input>`. So the ONE screen
 * that is typed into (the grid) does not redraw on every keystroke: it writes
 * into the document and repaints the single cell. `grid.ts` says so at its own
 * call sites. Everywhere else a redraw is what should happen.
 */

type Kid = Node | string | number | false | null | undefined;

export type Attrs = {
  class?: string;
  style?: Partial<CSSStyleDeclaration> & Record<string, string | number | undefined>;
  html?: string;
  [key: string]: unknown;
};

/**
 * `h("div.card", { ... }, ...children)`.
 *
 * The tag accepts one `.class` suffix chain, because the alternative is
 * `{ class: "..." }` on every second call and this file is read far more often
 * than it is written.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | string,
  attrs?: Attrs | null,
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") {
        el.className = el.className ? `${el.className} ${v}` : String(v);
      } else if (k === "style" && typeof v === "object") {
        for (const [p, val] of Object.entries(v as Record<string, unknown>)) {
          if (val === undefined || val === null) continue;
          /* ⚠️ `setProperty` AND NOT `style[p] =`, so a custom property
             (`--cell-ring`) sets rather than being silently dropped. */
          if (p.startsWith("--")) el.style.setProperty(p, String(val));
          else (el.style as unknown as Record<string, string>)[p] = String(val);
        }
      } else if (k === "html") {
        el.innerHTML = String(v);
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (v === true) {
        el.setAttribute(k, "");
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  add(el, kids);
  return el as HTMLElementTagNameMap[K];
}

function add(el: Node, kids: Kid[]) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(
      typeof kid === "string" || typeof kid === "number"
        ? document.createTextNode(String(kid))
        : kid,
    );
  }
}

/**
 * ⭐ THE ICONS — inline SVG paths, so the file stays self-contained.
 *
 * Lucide's geometry (Monospace uses `lucide-react`), drawn at 24×24 on a
 * `currentColor` stroke so the rail and the buttons colour them by cascade.
 */
const ICONS: Record<string, string> = {
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01M13 4.8v14.4a.8.8 0 0 1-1 .77l-6-1.6A.8.8 0 0 1 5 17.6V6.4a.8.8 0 0 1 .59-.77l6-1.6a.8.8 0 0 1 1 .77Z"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  palette:
    '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a4 4 0 0 0 4-4 10 10 0 0 0-9-11Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21M22 21H7M5 11l9 9"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};

export function icon(name: keyof typeof ICONS | string, size = 20): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] ?? ICONS.info;
  return svg;
}

/** `<button class="btn …">` with an icon and a label. */
export function button(
  label: string,
  opts: {
    icon?: string;
    cls?: string;
    onclick?: () => void;
    disabled?: boolean;
    title?: string;
  } = {},
): HTMLButtonElement {
  const b = h(
    "button",
    {
      class: `btn ${opts.cls ?? ""}`.trim(),
      type: "button",
      disabled: opts.disabled,
      title: opts.title,
      onclick: opts.onclick,
    },
    opts.icon ? icon(opts.icon, 15) : null,
    /* ⚠️ THE LABEL IS WRAPPED, NOT A BARE TEXT NODE. A text node cannot be
       targeted by CSS, and the top bar has to be able to drop to icons alone
       on a phone — where three labelled buttons left the school's name
       truncated to "A…". Wrapped, it can become screen-reader-only instead of
       vanishing, which keeps the accessible name. */
    label ? h("span.lab", null, label) : null,
  ) as HTMLButtonElement;
  return b;
}

/** A labelled input. `onchange` fires on `change`, never on every keystroke —
 *  every screen but the grid redraws on write, and a redraw on keystroke
 *  would take the caret with it. */
export function field(
  label: string,
  value: string,
  onchange: (v: string) => void,
  opts: {
    type?: string;
    note?: string;
    placeholder?: string;
    min?: string;
    max?: string;
    step?: string;
    list?: string;
    disabled?: boolean;
  } = {},
): HTMLLabelElement {
  const input = h("input", {
    type: opts.type ?? "text",
    value,
    placeholder: opts.placeholder,
    min: opts.min,
    max: opts.max,
    step: opts.step,
    list: opts.list,
    disabled: opts.disabled,
    onchange: (e: Event) => onchange((e.target as HTMLInputElement).value),
  });
  return h(
    "label.field",
    null,
    label,
    input,
    opts.note ? h("span.note", null, opts.note) : null,
  ) as HTMLLabelElement;
}

/** A labelled `<select>`. */
export function select<T extends string>(
  label: string,
  value: T,
  options: Array<{ value: T; label: string }>,
  onchange: (v: T) => void,
  note?: string,
): HTMLLabelElement {
  const sel = h(
    "select",
    {
      onchange: (e: Event) => onchange((e.target as HTMLSelectElement).value as T),
    },
    ...options.map((o) =>
      h("option", { value: o.value, selected: o.value === value }, o.label),
    ),
  );
  return h(
    "label.field",
    null,
    label,
    sel,
    note ? h("span.note", null, note) : null,
  ) as HTMLLabelElement;
}

/**
 * One switch, with its reason and its cost underneath.
 *
 * ⚠️ THE THREE STRINGS ARE THE ENGINE'S (`EXPORT_OPTION_COPY`) and are never
 * written here. The panel and the workbook's own info sheet quote the same
 * sentences, which is the point of that table.
 */
export function toggle(
  on: boolean,
  label: string,
  why: string,
  cost: string | null,
  onchange: (v: boolean) => void,
): HTMLElement {
  const knob = h("button.knob", {
    type: "button",
    role: "switch",
    "aria-checked": String(on),
    "aria-label": label,
    onclick: () => onchange(!on),
  });
  return h(
    "div.switch",
    null,
    knob,
    h(
      "div",
      null,
      h("div.lab", null, label),
      h("div.why", null, why),
      cost ? h("div.cost", null, cost) : null,
    ),
  );
}

export function notice(kind: "" | "warn" | "bad" | "good", ...kids: Kid[]) {
  return h(`div.notice${kind ? "." + kind : ""}`, null, ...kids);
}

export function card(title: string, hint: string | null, ...kids: Kid[]) {
  return h(
    "section.card",
    null,
    h("h2", null, title),
    hint ? h("p.hint", null, hint) : null,
    ...kids,
  );
}
