/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE WALKTHROUGH — ten steps, over the real app and never beside it
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The people who use this are not timetablers by trade. They are a school
 * business manager in August with the last person's spreadsheet and no idea
 * which of the eight things in the rail comes first. So the guide does not
 * describe the app: it DRIVES it. Each step switches to the screen it is
 * talking about, rings that screen's rail button, and says what to do on the
 * page now underneath it.
 *
 * ⚠️ WHICH IS WHY IT IS A DOCK AND NOT A MODAL. A modal that has to be
 * dismissed before the thing it described can be done is a modal people read
 * once and never re-open — and the reading and the doing then happen from
 * memory. This sits in the corner and the app stays live behind it.
 *
 * ── ⚠️⚠️ THE PART THAT WILL BITE YOU: EVERY WRITE REBUILDS THE PAGE ────────
 * `dom.ts` says it plainly — there is no framework, and a write blows the DOM
 * away and draws it again. So:
 *
 *   · the dock lives OUTSIDE `#app`, beside `#modal` and `#toasts`, or it
 *     would be destroyed by the first keystroke on the screen it is describing;
 *   · the ring is a CLASS on a live node, re-applied after every repaint,
 *     never a floating box at measured coordinates — coordinates go stale on
 *     the next redraw and there are dozens per minute on the grid;
 *   · this module subscribes AFTER `main.ts` does, because the Set of
 *     listeners runs in insertion order and the node to ring does not exist
 *     until the render that made it has finished.
 *
 * ⚠️ AND NOTHING IN HERE MAY CALL `repaint()` DURING A RENDER. `setScreen`
 * does, so it is reached only from a click or a key — never from the listener
 * — or the first step would drive the app into a repaint loop.
 *
 * ── ⭐ THE PROGRESS CHIPS ARE READ FROM THE DOCUMENT, NOT REMEMBERED ───────
 * "Done" on a step means the document actually has that thing in it right now,
 * so a guide re-opened next August is honest about a half-finished file rather
 * than replaying wherever somebody stopped clicking. Three of the ten are
 * marked OPTIONAL rather than todo, because closures, week changes and the
 * colour are all things a valid workbook can be exported without, and a red
 * mark against them would send people looking for work that is not there.
 *
 * ⚠️ THESE CHIPS ARE NOT THE EXPORT'S REFUSAL and must never grow into it.
 * The engine names what is missing when a build is attempted ("no periods
 * yet", "no rooms on it yet") and `exportScreen.ts` shows that sentence
 * verbatim. A second, cheerier opinion about readiness living here is how two
 * vocabularies for one problem start.
 */

import { button, h, icon } from "./dom";
import { mark } from "./logo";
import {
  backupInfo,
  doc,
  filename,
  isDirty,
  setScreen,
  subscribe,
  yearNow,
  type Screen,
} from "./store";
import type { SchoolDocument, SchoolYear } from "./engine";

/** Set once the guide has been finished or dismissed. Never read for anything
 *  but the auto-open: re-opening it by hand always starts at step one. */
const SEEN_KEY = "monospace.timetable.guide.v1";

type Mark = "done" | "todo" | "optional";
type Progress = { mark: Mark; text: string };

type Step = {
  /** The screen this step is about. Switched to when the step is shown. */
  screen: Screen;
  title: string;
  /** What to do. One short paragraph — this is read standing up. */
  body: string;
  /** Why it is like that. The half that stops somebody "fixing" it later. */
  why?: string;
  /**
   * A selector on the live page to ring. ⚠️ Re-queried after every repaint,
   * so it must match something the CURRENT render produced — a rail button or
   * a top-bar control, never a node inside a list that may be empty.
   */
  spot?: string;
  progress?: (d: SchoolDocument, y: SchoolYear | null) => Progress;
};

const done = (text: string): Progress => ({ mark: "done", text });
const todo = (text: string): Progress => ({ mark: "todo", text });
const some = (text: string): Progress => ({ mark: "optional", text });

/** The room sheet a year prints. ⚠️ `roomSheets[0]` is the documented fallback
 *  when a year names none — not a guess, and not the "current" sheet. */
function sheetFor(d: SchoolDocument, y: SchoolYear | null) {
  if (!y) return d.roomSheets[0] ?? null;
  return d.roomSheets.find((s) => s.id === y.roomSheetId) ?? d.roomSheets[0] ?? null;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/* ══════════════════════════════════════════════════════════════════════════
   THE TEN

   ⭐ IN THE ORDER THE RAIL IS IN, which is the order they depend on each
   other — see the RAIL banner in `main.ts`. A guide that visited them in a
   different order would be teaching a second sequence.
   ══════════════════════════════════════════════════════════════════════════ */

const STEPS: Step[] = [
  {
    screen: "year",
    title: "This takes about twenty minutes",
    body:
      "Five things down the left-hand side, in order, and then Export. You end up with one Excel workbook holding every week of the year, and a file of your own you can open again next August.",
    why: "Nothing leaves this machine. There is no account and no server — with the network unplugged it works exactly the same.",
  },
  {
    screen: "year",
    title: "Start with the year",
    body:
      "The first day back and the last day of the summer term, and whether you run a one, two or three week cycle. Everything else hangs off these dates.",
    why: "The weeks and which of them is Week A are worked out from this rule every time the file opens, so the two can never drift apart.",
    spot: '.rail-btn[data-screen="year"]',
    progress: (_d, y) =>
      y ? done(`${y.name} is set up`) : todo("No year yet — this one is required"),
  },
  {
    screen: "closures",
    title: "Then when you are closed",
    body:
      "Holidays, INSET days, bank holidays. Enter them once here and the workbook's half-term overview draws itself from the runs of closed weeks.",
    why: "If the cycle comes back on the wrong letter after a holiday, the pin on this screen is the fix — it says which week the school actually returned on.",
    spot: '.rail-btn[data-screen="closures"]',
    progress: (_d, y) => {
      const n = y?.closures?.length ?? 0;
      return n ? done(plural(n, "closure")) : some("None yet — add them as you know them");
    },
  },
  {
    screen: "day",
    title: "The shape of your day",
    body:
      "Your periods and breaks, with their times. These become the rows of every sheet in the workbook.",
    why: "Mark a row as a break and it prints as a bar across the day instead of somewhere a lesson can go. It is the flag that decides that, not what you call the row — so you can rename Break to Tutor without changing what it is.",
    spot: '.rail-btn[data-screen="day"]',
    progress: (_d, y) => {
      const n = y?.periods?.length ?? 0;
      return n ? done(plural(n, "row")) : todo("No periods yet — this one is required");
    },
  },
  {
    screen: "rooms",
    title: "The rooms, and what prints under them",
    body:
      "The room codes become the printed columns. Underneath each one you can print your own facts — No of PCs, Teacher, Telephone, whatever your sheet carries.",
    why: "A room list belongs to the school rather than to one year, so you make it once and each year says which list it prints.",
    spot: '.rail-btn[data-screen="rooms"]',
    progress: (d, y) => {
      const n = sheetFor(d, y)?.rooms.length ?? 0;
      return n ? done(plural(n, "room")) : todo("No rooms yet — this one is required");
    },
  },
  {
    screen: "templates",
    title: "Type the standing timetable",
    body:
      "What runs in each room, in each period, in a normal week. One grid per week of your cycle — so a two-week school fills in Week A and Week B, and that is the whole year.",
    why: "A class code keeps the same colour everywhere it appears, on screen and in the workbook, so a room's Tuesday reads at arm's length.",
    spot: '.rail-btn[data-screen="templates"]',
    progress: (_d, y) => {
      const n = y?.templates?.length ?? 0;
      return n ? done(plural(n, "lesson")) : todo("Empty — this is the timetable itself");
    },
  },
  {
    screen: "weeks",
    title: "When one week is different",
    body:
      "A mock fortnight, a trip, a room out of use. Change that week here and the standing timetable underneath is left alone.",
    why: "Clearing a cell here means “not running this week”, which is not the same as “nothing is timetabled here”. The workbook draws it empty and deliberately will not link it back to the template — otherwise the lesson somebody moved off it reappears the moment Excel recalculates.",
    spot: '.rail-btn[data-screen="weeks"]',
    progress: (_d, y) => {
      const n = y?.weekChanges?.length ?? 0;
      return n ? done(plural(n, "change")) : some("None — most years need very few");
    },
  },
  {
    screen: "customise",
    title: "Your school's colour",
    body:
      "The workbook is built around one colour. Set it to the school's and the day bands, the header block and the gutter follow.",
    why: "Class colours do not move with it. The same class is the same colour whatever you pick here, which is the point of them.",
    spot: '.rail-btn[data-screen="customise"]',
    progress: (d) =>
      d.school.accent ? done(`Set to ${d.school.accent}`) : some("Using the default purple"),
  },
  {
    screen: "export",
    title: "Build the workbook",
    body:
      "Four switches, each of which tells you what it does and what it costs, and then the button that writes the file. Leave all four off and you get the plain workbook.",
    why: "It is built here, on this machine, and saved where you say. A big year with a password on it takes a few seconds — the button says so while it works.",
    spot: '.rail-btn[data-screen="export"]',
    progress: (d, y) => {
      const rooms = sheetFor(d, y)?.rooms.length ?? 0;
      const periods = y?.periods?.length ?? 0;
      if (!y) return todo("Needs a year first");
      if (!periods) return todo("Needs the day filled in");
      if (!rooms) return todo("Needs a room list");
      return done("Ready to export");
    },
  },
  {
    screen: "export",
    title: "Last — save your own file",
    body:
      "Save writes a small file of your own alongside the workbook. Put it on a shared drive and next year starts from it rather than from a blank page.",
    why: "The copy this browser keeps is a courtesy against a closed tab, not a save. It lives in one browser profile on one machine, and “clear browsing data” takes it.",
    spot: ".topbar .btn.primary",
    /* ⚠️ A FILENAME IS NOT A SAVE, and this chip said it was. Restoring the
       browser's courtesy backup brings the NAME back with the work — so a
       document recovered after a crash reported "Saved as timetable.json"
       while holding an afternoon of changes no file on the disk had. The top
       bar has always said "unsaved changes" a few inches above; this now
       agrees with it. */
    progress: () => {
      const name = filename();
      if (!name) return todo("Not saved to a file yet");
      return isDirty()
        ? todo(`${name} — with changes not written to it`)
        : done(`Saved as ${name}`);
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════════════════════ */

let open = false;
let at = 0;
let host: HTMLElement | null = null;
/** The node currently wearing the ring, so it can be cleaned off even after
 *  the render that produced it has been thrown away. */
let ringed: Element | null = null;

export const isGuideOpen = () => open;

export function openGuide(step = 0) {
  open = true;
  at = Math.max(0, Math.min(STEPS.length - 1, step));
  show();
}

/**
 * Move to the screen this step is about, then draw.
 *
 * ⚠️⚠️ THE DRAW IS NOT LEFT TO `setScreen`, AND THIS WAS A LIVE BUG.
 * `setScreen` returns early when the screen is already the one asked for — so
 * opening the guide on step one, whose screen is `year` and which is also the
 * screen a fresh launch starts on, changed nothing, repainted nothing, and the
 * walkthrough never appeared at all. The last two steps are both `export` and
 * failed the same way. Drawing here is unconditional; the repaint, if there is
 * one, only reaches `refresh()` afterwards and finds the step already drawn.
 */
function show() {
  setScreen(STEPS[at].screen);
  draw();
}

export function closeGuide(remember = true) {
  open = false;
  if (remember) {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* Private mode, quota, a policy that disables storage. The guide
         re-offering itself is a far smaller failure than the app not opening,
         so this is silent — as every other localStorage write here is. */
    }
  }
  clearRing();
  draw();
}

function go(delta: number) {
  const next = at + delta;
  if (next < 0 || next >= STEPS.length) return;
  at = next;
  show();
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RING
   ══════════════════════════════════════════════════════════════════════════ */

function clearRing() {
  ringed?.classList.remove("guide-ring");
  ringed = null;
  /* Belt and braces: a node that was ringed and then replaced by a repaint is
     gone, but a stale class on a SURVIVING node would sit there for ever. */
  for (const el of document.querySelectorAll(".guide-ring")) {
    el.classList.remove("guide-ring");
  }
}

function applyRing() {
  clearRing();
  if (!open) return;
  const sel = STEPS[at].spot;
  if (!sel) return;
  const el = document.querySelector(sel);
  if (!el) return;
  el.classList.add("guide-ring");
  ringed = el;
  /* The rail is its own scrollport and is short on a laptop, so the button
     being described can genuinely be below the fold. */
  if (typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE DOCK
   ══════════════════════════════════════════════════════════════════════════ */

function ensureHost(): HTMLElement {
  if (!host) {
    host = h("div", { id: "guide" });
    document.body.appendChild(host);
  }
  return host;
}

const MARK_LABEL: Record<Mark, string> = {
  done: "Done",
  todo: "To do",
  optional: "Optional",
};

/** The live progress chip for the current step, or nothing if it has none. */
function chip(): HTMLElement | null {
  const p = STEPS[at].progress?.(doc(), yearNow());
  if (!p) return null;
  return h(
    `div.guide-state.${p.mark}`,
    null,
    icon(p.mark === "done" ? "check" : "dot", 14),
    h("b", null, MARK_LABEL[p.mark]),
    h("span", null, p.text),
  );
}

function dock(): HTMLElement {
  const step = STEPS[at];
  const first = at === 0;
  const last = at === STEPS.length - 1;

  return h(
    "div.guide-card",
    {
      role: "dialog",
      "aria-label": `Walkthrough, step ${at + 1} of ${STEPS.length}`,
      /* ⚠️ KEYED BY STEP so the browser treats each step as a NEW element and
         re-runs the entrance animation. Without it the dock is one node whose
         text changes, and the movement between steps — the whole of "fluent"
         here — simply does not happen. */
      "data-step": String(at),
    },
    h(
      "div.guide-top",
      null,
      h("div.guide-mark", null, mark(22)),
      h(
        "div.guide-of",
        null,
        h("b", null, `Step ${at + 1}`),
        ` of ${STEPS.length}`,
      ),
      h("div.spacer"),
      h(
        "button.guide-x",
        {
          type: "button",
          title: "Close the walkthrough",
          "aria-label": "Close the walkthrough",
          onclick: () => closeGuide(),
        },
        "✕",
      ),
    ),
    h(
      "div.guide-bar",
      { "aria-hidden": "true" },
      ...STEPS.map((_, i) =>
        h(`div.guide-tick${i <= at ? ".on" : ""}`, null),
      ),
    ),
    h("h2", null, step.title),
    h("p.guide-body", null, step.body),
    step.why ? h("p.guide-why", null, step.why) : null,
    /* ⚠️ A STABLE SLOT, REFRESHED IN PLACE. The chip is the one part of this
       card that changes while the step does not — it reads the document, and
       the document changes as somebody does what the step told them to. See
       `refresh()` for why it must not be redrawn by rebuilding the card. */
    h("div.guide-slot", null, chip()),
    h(
      "div.guide-acts",
      null,
      button("Back", {
        icon: "left",
        cls: "ghost sm",
        disabled: first,
        onclick: () => go(-1),
      }),
      h("div.spacer"),
      /* ⚠️ `fwd` REVERSES THE ICON AND THE LABEL. `button()` puts the icon
         first, which is right for Back and wrong for Next — a chevron pointing
         forwards belongs after the word it is pointing past. Done in CSS
         rather than by giving `button()` a side, because this is the only
         place in the app that wants it. */
      last
        ? button("Finish", { icon: "check", cls: "primary sm fwd", onclick: () => closeGuide() })
        : button("Next", { icon: "right", cls: "primary sm fwd", onclick: () => go(1) }),
    ),
  );
}

/** Which step the card currently on screen was built for. */
let drawn = -1;

/** Full rebuild. Only for opening, closing, and changing step. */
function draw() {
  const el = ensureHost();
  if (!open) {
    el.replaceChildren();
    el.classList.remove("open");
    drawn = -1;
    return;
  }
  el.classList.add("open");
  el.replaceChildren(dock());
  drawn = at;
  applyRing();
}

/**
 * What a repaint of the APP does to the guide — and it is deliberately not a
 * redraw.
 *
 * ⚠️⚠️ REBUILDING THE CARD HERE WOULD RE-RUN ITS ENTRANCE ANIMATION ON EVERY
 * KEYSTROKE. `dom.ts` redraws the whole page on every write, and the screen
 * somebody spends an hour on is the grid, where that is once per character
 * typed. The card would slide up from underneath itself, forty times a minute,
 * while they typed. So a repaint refreshes only the two things that can
 * actually have changed: the ring, whose node the repaint just destroyed and
 * rebuilt, and the progress chip, which reads the document.
 */
function refresh() {
  if (!open) return;
  if (drawn !== at) {
    draw();
    return;
  }
  host?.querySelector(".guide-slot")?.replaceChildren(...[chip()].filter(Boolean) as Node[]);
  applyRing();
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ CALLED AFTER `subscribe(render)` IN `main.ts`, AND THE ORDER IS LOAD-
 * BEARING. Listeners run in insertion order, and `applyRing` has to query a
 * DOM the app's own render has already rebuilt.
 */
export function startGuide() {
  subscribe(refresh);

  window.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      closeGuide();
      return;
    }
    /* ⚠️ ARROWS ARE THE GRID'S FIRST. Its cell inputs bind Up/Down to move
       between periods, and a global handler that stole them would break typing
       a timetable in — which is the one screen somebody is on for an hour. */
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  });

  /* ⚠️ NOT WHILE THERE IS A RESTORE OFFER ON SCREEN. `offerRestore()` opens a
     modal on exactly the boot where somebody closed a tab mid-timetable — a
     person who has plainly used this before — and two overlapping things to
     read is how both get dismissed unread. */
  let seen = true;
  try {
    seen = localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    /* Storage unavailable: treat it as seen. Offering the walkthrough on every
       single launch, for ever, to somebody whose browser cannot remember the
       answer is worse than never offering it. */
  }
  if (!seen && !backupInfo()) openGuide(0);
}
