/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SHELL — the 88px rail, the top bar, and one screen at a time
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ ONE DOCUMENT, TWO TARGETS. This file is the standalone `timetable.html` a
 * school downloads AND the page the Rust shell embeds. Everything that could
 * differ between them is behind `host` (see `host.ts`), and nothing else in
 * the app is allowed to ask which one it is running in.
 *
 * ⚠️ THE RAIL IS AURORA'S 88px, deliberately — this has to look like it
 * belongs beside Discord-Quests and Rustify, and the rail is the single most
 * recognisable thing about that family.
 */

import { button, h, icon } from "./dom";
import { mark } from "./logo";
import { host } from "./host";
import { closeModal, confirmDialog, openModal, toast } from "./ui";
import {
  backupInfo,
  boot,
  clearBackup,
  doc,
  filename,
  isDirty,
  loadBackup,
  markSaved,
  repaint,
  replaceDocument,
  screen,
  setScreen,
  setTheme,
  subscribe,
  suggestedDocName,
  theme,
  yearNow,
  type Screen,
} from "./store";
import { emptySchoolDocument, readSchoolDocument } from "./engine";
import { yearScreen } from "./screens/year";
import { closuresScreen } from "./screens/closures";
import { dayScreen } from "./screens/day";
import { roomsScreen } from "./screens/rooms";
import { templatesScreen } from "./screens/templates";
import { weeksScreen } from "./screens/weeks";
import { customiseScreen } from "./screens/customise";
import { exportScreen } from "./screens/exportScreen";
import { aboutScreen } from "./screens/about";

/* ══════════════════════════════════════════════════════════════════════════
   THE RAIL
   ══════════════════════════════════════════════════════════════════════════ */

type RailItem = { id: Screen; label: string; icon: string; title: string };

/**
 * ⭐ IN THE ORDER A SCHOOL FILLS THEM IN, which is also the order they depend
 * on each other: the year has to exist before a closure can interrupt it,
 * the day before a grid has rows, the rooms before it has columns, and the
 * templates before a week can be a change TO one.
 */
const RAIL: RailItem[] = [
  { id: "year", label: "Year", icon: "calendar", title: "The academic year and its cycle" },
  { id: "closures", label: "Closed", icon: "ban", title: "Holidays, bank holidays, INSET" },
  { id: "day", label: "Day", icon: "clock", title: "Periods, breaks and times" },
  { id: "rooms", label: "Rooms", icon: "door", title: "The printed columns and what they record" },
  { id: "templates", label: "Grid", icon: "grid", title: "The standing timetable" },
  { id: "weeks", label: "Weeks", icon: "swap", title: "Change one week" },
  { id: "customise", label: "Colour", icon: "palette", title: "The school's own colour" },
  { id: "export", label: "Export", icon: "download", title: "Build the workbook" },
];

function rail(): HTMLElement {
  const current = screen();
  const t = theme();
  return h(
    "nav.rail",
    { "aria-label": "Sections" },
    h("div.mark", { title: "Monospace Timetable" }, mark(40)),
    ...RAIL.map((item) =>
      h(
        "button.rail-btn",
        {
          type: "button",
          "aria-current": current === item.id ? "page" : null,
          title: item.title,
          onclick: () => setScreen(item.id),
        },
        icon(item.icon),
        item.label,
      ),
    ),
    h(
      "div.rail-foot",
      null,
      h("div.rail-sep"),
      h(
        "button.rail-btn",
        {
          type: "button",
          title: t === "dark" ? "Switch to the light theme" : "Switch to the dark theme",
          onclick: () => setTheme(t === "dark" ? "light" : "dark"),
        },
        icon(t === "dark" ? "sun" : "moon"),
        t === "dark" ? "Light" : "Dark",
      ),
      /* ⚠️ THE LICENCE LINK IS IN THE FURNITURE, NOT IN A MENU. AGPL §13 —
         see `about.ts`. */
      h(
        "button.rail-btn",
        {
          type: "button",
          "aria-current": current === "about" ? "page" : null,
          title: "About, and the source code",
          onclick: () => setScreen("about"),
        },
        icon("info"),
        "About",
      ),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE TOP BAR
   ══════════════════════════════════════════════════════════════════════════ */

function topbar(): HTMLElement {
  const d = doc();
  const year = yearNow();
  const name = filename();
  const dirty = isDirty();

  return h(
    "header.topbar",
    null,
    h(
      "div",
      null,
      h("h1", null, d.school.name || "Untitled school"),
      h(
        "div.sub",
        null,
        year ? year.name : "No academic year yet",
        name ? ` · ${name}` : "",
        /* ⚠️ SAID IN WORDS RATHER THAN AS A DOT. "Unsaved" is a fact a school
           has to act on, and a coloured dot beside a filename is the thing
           everybody has learned to stop seeing. */
        dirty ? " · unsaved changes" : name ? " · saved" : "",
      ),
    ),
    h("div.spacer"),
    /* ⚠️ EACH CARRIES A `title`, because on a phone these drop to their icons
       alone — see the top-bar rule in `aurora.css`. */
    button("Open", {
      icon: "folder",
      cls: "sm",
      title: "Open a timetable file (⌘O)",
      onclick: openFile,
    }),
    button("Save", {
      icon: "save",
      cls: "sm primary",
      title: "Save this timetable to a file (⌘S)",
      onclick: saveFile,
    }),
    button("New", {
      icon: "file",
      cls: "sm ghost",
      title: "Start a new timetable",
      onclick: newFile,
    }),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FILES
   ══════════════════════════════════════════════════════════════════════════ */

async function openFile() {
  const go = async () => {
    let opened;
    try {
      opened = await host.openDocument();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "bad", 9000);
      return;
    }
    if (!opened) return; /* cancelled */

    let parsed: unknown;
    try {
      parsed = JSON.parse(opened.text);
    } catch {
      toast(
        `“${opened.name}” is not readable as JSON. If it has been edited by hand, a missing comma is the usual cause.`,
        "bad",
        11000,
      );
      return;
    }

    /* ⭐ THE ONLY WAY IN, and it is the engine's. It refuses a file from the
       future by NAMING BOTH VERSIONS, migrates an older one a version at a
       time, and reports keys this build did not recognise rather than dropping
       them quietly. */
    const read = readSchoolDocument(parsed);
    if (!read.ok) {
      toast(read.issue.message, "bad", 14000);
      return;
    }
    replaceDocument(read.document, opened.name);
    for (const note of read.notes) toast(note, "", 8000);
    if (read.unknownKeys.length) {
      /* ⚠️ REPORTED, NOT SWALLOWED. A same-version file reaching this means
         somebody hand-edited it — which a text format invites — and saving
         would drop what they added. */
      toast(
        `“${opened.name}” carries settings this copy does not understand (${read.unknownKeys.join(", ")}). Saving will drop them.`,
        "bad",
        14000,
      );
    } else {
      toast(`${opened.name} opened.`, "good");
    }
    setScreen(doc().years.length ? "templates" : "year");
  };

  if (isDirty()) {
    confirmDialog(
      "Open another file?",
      "This one has changes that have not been written to disk. They go when the new file loads.",
      "Discard and open",
      () => void go(),
    );
    return;
  }
  await go();
}

async function saveFile() {
  const json = JSON.stringify(doc(), null, 2);
  try {
    const name = await host.saveDocument(json, filename() ?? suggestedDocName());
    if (name === null) return; /* cancelled */
    markSaved(name);
    toast(`${name} saved.`, "good");
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), "bad", 9000);
  }
}

function newFile() {
  const go = () => {
    replaceDocument(emptySchoolDocument(), null);
    clearBackup();
    setScreen("year");
    /* ⚠️ A NEW DOCUMENT IS DELIBERATELY NOT VALID TO EXPORT — no periods, no
       rooms. A seeded fake year would be a school's first timetable containing
       somebody else's Tuesday. */
    toast("New timetable. Start with the year.", "good");
  };
  if (isDirty()) {
    confirmDialog(
      "Start a new timetable?",
      "The one on screen has changes that have not been written to disk.",
      "Discard and start over",
      go,
    );
    return;
  }
  go();
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RESTORE OFFER
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ OFFERED, NEVER SILENT. Loading the backup automatically would put an
 * afternoon's work on screen with no filename and no way to tell it from the
 * file the school thinks it opened — so the choice is theirs, once, at start.
 */
function offerRestore() {
  const info = backupInfo();
  if (!info) return;
  const when = info.at ? new Date(info.at).toLocaleString() : "an earlier session";
  openModal(
    "There is unsaved work here",
    `This browser has a copy of ${info.name ? `“${info.name}”` : "a timetable"} from ${when}. It is a courtesy backup, not a save — it lives in this browser profile on this machine and “clear browsing data” takes it.`,
    null,
    [
      button("Start fresh", {
        cls: "ghost",
        onclick: () => {
          clearBackup();
          closeModal();
        },
      }),
      button("Restore it", {
        cls: "primary",
        onclick: () => {
          const r = loadBackup();
          closeModal();
          if (!r.ok) {
            toast(r.message, "bad", 11000);
            return;
          }
          /* ⚠️ RESTORED WORK IS UNSAVED WORK. It came out of a browser
             profile, not out of a file, so the file on disk does not have it
             — the store marks it dirty and this says so. */
          toast("Restored. It still needs saving to a file.", "good", 8000);
          setScreen(doc().years.length ? "templates" : "year");
        },
      }),
    ],
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════════════ */

const SCREENS: Record<Screen, () => HTMLElement> = {
  year: yearScreen,
  closures: closuresScreen,
  day: dayScreen,
  rooms: roomsScreen,
  templates: templatesScreen,
  weeks: weeksScreen,
  customise: customiseScreen,
  export: exportScreen,
  about: aboutScreen,
};

let root: HTMLElement;

function render() {
  const page = h(
    "div.page",
    null,
    topbar(),
    h("div.scroll", { id: "scroll" }, SCREENS[screen()]()),
  );
  /* ⚠️ THE SCROLL POSITION IS KEPT ACROSS A REDRAW OF THE SAME SCREEN. Every
     write repaints the whole page (see `dom.ts`'s banner), and a grid that
     jumped to the top every time somebody typed a class code would be
     unusable — which is the cost of the no-framework decision, paid here in
     four lines rather than by a reconciler. */
  const previous = document.getElementById("scroll");
  const top = previous?.scrollTop ?? 0;
  const left = previous?.scrollLeft ?? 0;
  /* The horizontal scroll of the grid itself, which is its own scrollport. */
  const prevGrid = document.querySelector<HTMLElement>(".gridscroll");
  const gridLeft = prevGrid?.scrollLeft ?? 0;
  const gridTop = prevGrid?.scrollTop ?? 0;

  root.replaceChildren(rail(), page);

  const scroll = document.getElementById("scroll");
  if (scroll) {
    scroll.scrollTop = top;
    scroll.scrollLeft = left;
  }
  const grid = document.querySelector<HTMLElement>(".gridscroll");
  if (grid) {
    grid.scrollLeft = gridLeft;
    grid.scrollTop = gridTop;
  }
}

function start() {
  boot();
  root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(h("div.bg", { "aria-hidden": "true" }));
  document.body.appendChild(root);

  subscribe(render);
  render();

  /* ⚠️ THE BROWSER'S OWN "ARE YOU SURE" IS THE ONLY THING THAT CAN STOP A
     CLOSED TAB, and it is fired only when there is really something to lose.
     A page that always asks is a page people learn to click through. */
  window.addEventListener("beforeunload", (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* Cmd/Ctrl-S saves, because a document-shaped app that ignores it is a
     document-shaped app people lose work in. */
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void saveFile();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      void openFile();
    }
  });

  /* The grid's geometry narrows below `sm`, so a resize past that boundary has
     to redraw. Debounced, because a drag is a hundred of these. */
  let resizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(repaint, 150) as unknown as number;
  });

  offerRestore();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
