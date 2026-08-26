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
import { openGuide, startGuide } from "./guide";
import { host, isShell, onShellBoot, onUpdate, type UpdateState } from "./host";
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
  setTab,
  setTheme,
  subscribe,
  suggestedDocName,
  tab,
  theme,
  yearNow,
  type Screen,
  type Tab,
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
import { rotaListScreen } from "./screens/rotaList";
import { rotaScheduleScreen } from "./screens/rotaSchedule";
import { rotaColumnsScreen } from "./screens/rotaColumns";
import { rotaExportScreen } from "./screens/rotaExport";
import { aboutScreen, REPO_URL } from "./screens/about";

/* ══════════════════════════════════════════════════════════════════════════
   THE RAIL
   ══════════════════════════════════════════════════════════════════════════ */

type RailItem = { id: Screen; label: string; icon: string; title: string };

/**
 * ⭐ IN THE ORDER A SCHOOL FILLS THEM IN, which is also the order they depend
 * on each other: the year has to exist before a closure can interrupt it,
 * the day before a grid has rows, the rooms before it has columns, and the
 * templates before a week can be a change TO one.
 *
 * ⚠️ ONE RAIL PER TAB, and `Record<Tab, …>` so the compiler refuses a tab with
 * no rail. The Year and Closed screens are NOT repeated in the Rota rail even
 * though a rota can follow the school year — a second door onto the same screen
 * would leave somebody wondering which of the two "Year"s they had edited.
 * The Rota's own dates live on its own List screen; the school year is the
 * school's, and it is edited where the school year is edited.
 */
const RAILS: Record<Tab, RailItem[]> = {
  timetable: [
    { id: "year", label: "Year", icon: "calendar", title: "The academic year and its cycle" },
    { id: "closures", label: "Closed", icon: "ban", title: "Holidays, bank holidays, INSET" },
    { id: "day", label: "Day", icon: "clock", title: "Periods, breaks and times" },
    { id: "rooms", label: "Rooms", icon: "door", title: "The printed columns and what they record" },
    { id: "templates", label: "Grid", icon: "grid", title: "The standing timetable" },
    { id: "weeks", label: "Weeks", icon: "swap", title: "Change one week" },
    { id: "customise", label: "Colour", icon: "palette", title: "The school's own colour" },
    { id: "export", label: "Export", icon: "download", title: "Build the workbook" },
  ],
  rota: [
    { id: "rota-list", label: "List", icon: "label", title: "What gets checked, and how often each takes a turn" },
    { id: "rota-schedule", label: "Rota", icon: "calendar", title: "The generated turn order, week by week" },
    { id: "rota-columns", label: "Columns", icon: "grid", title: "What gets filled in when somebody checks" },
    { id: "rota-export", label: "Export", icon: "download", title: "Build the rota workbook" },
  ],
};

function rail(): HTMLElement {
  const current = screen();
  const t = theme();
  return h(
    "nav.rail",
    { "aria-label": "Sections" },
    h("div.mark", { title: "Monospace Timetable" }, mark(40)),
    ...RAILS[tab()].map((item) =>
      h(
        "button.rail-btn",
        {
          type: "button",
          /* ⚠️ THE GUIDE RINGS THESE BY `data-screen`, and that is why it is an
             attribute rather than an index into `RAIL`. An index would be
             correct until somebody reorders the rail, and then it would be
             quietly wrong — ringing Rooms while the dock talked about the
             day. */
          "data-screen": item.id,
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
      /* ⭐ RE-OPENABLE, AND FROM THE FURNITURE. The walkthrough offers itself
         once, on a first run with nothing to restore; after that this is the
         only way back to it, and a school that trains a new business manager
         in August needs one. */
      h(
        "button.rail-btn",
        {
          type: "button",
          title: "Walk through it step by step",
          onclick: () => openGuide(0),
        },
        icon("compass"),
        "Guide",
      ),
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
   ⭐ THE TABS
   ══════════════════════════════════════════════════════════════════════════

   Two things in one file: the standing timetable, and the recurring checks
   that run alongside it. Both belong to the same school and the same saved
   `.json`, which is why they are tabs rather than two programs.

   ⚠️ IT IS A CHILD OF `.page`, ABOVE `.topbar` — NOT A ROW ABOVE `#app`.
   `body` is `height: 100%; overflow: hidden` and `#app` is `height: 100%`, so
   a strip added as a sibling above `#app` has its height ADDED to a
   full-height grid and is clipped by the body. That is exactly the layout bug
   the `.page` banner in `aurora.css` records, measured at
   `window.scrollY === 634`. `.page` is already a `min-height: 0` column whose
   only `flex: 1` child is `.scroll`, so a `flex: none` strip is absorbed by
   the scrollport shrinking and nothing else moves.

   ⚠️ AND THE TAB IS DERIVED FROM THE SCREEN, never stored beside it — see
   `TAB_OF` in `store.ts`. That is what keeps `guide.ts` working untouched:
   the guide sets a screen and the rail follows it, where a separately-stored
   tab would have left `applyRing`'s `querySelector` returning `null` and a
   step silently un-ringed with no error anywhere. */

const TABS: Array<{ id: Tab; label: string; icon: string; title: string }> = [
  { id: "timetable", label: "Timetable", icon: "grid", title: "The standing room timetable" },
  { id: "rota", label: "Rota", icon: "check", title: "Recurring checks — rooms, extinguishers, minibuses" },
];

function tabstrip(): HTMLElement {
  const now = tab();
  return h(
    "div.tabstrip",
    null,
    h(
      "div.seg",
      { role: "tablist", "aria-label": "Section" },
      ...TABS.map((t) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-pressed": String(now === t.id),
            "aria-selected": String(now === t.id),
            title: t.title,
            onclick: () => setTab(t.id),
          },
          icon(t.icon, 14),
          t.label,
        ),
      ),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE TITLE BAR — ONLY IN THE SHELL, AND ONLY BECAUSE IT IS FRAMELESS
   ══════════════════════════════════════════════════════════════════════════

   The Rust window is built `with_decorations(false)`, and its comment says the
   title bar is "drawn by the front-end". ⚠️ IT WAS NOT. The four window
   operations existed in the bridge from the start and nothing ever called
   them, so the shipped exe was a window that could not be moved, minimised or
   closed except with Alt+F4.

   ⚠️ NOT DRAWN IN A BROWSER, where the real window furniture is already there
   and a second row of fake buttons would be a lie — `windowClose()` cannot
   close a tab it did not open.

   ⚠️ AND IT SITS ABOVE THE MODAL SCRIM ON PURPOSE (see `aurora.css`). A dialog
   that covered the close button would leave somebody with a confirm on screen
   and no way out of the app but the task manager. */

function titlebar(): HTMLElement {
  const d = doc();
  const year = yearNow();
  return h(
    "div.titlebar",
    null,
    /* ⭐ THE WHOLE STRIP IS THE DRAG HANDLE, buttons excepted — that is what a
       title bar is. `pointerdown` and not `mousedown`: wry forwards pointer
       events, and `drag_window` must start while the button is still down. */
    h(
      "div.tb-grip",
      {
        onpointerdown: (e: PointerEvent) => {
          if (e.button !== 0) return;
          host.windowDrag();
        },
        ondblclick: () => host.windowToggleMaximize(),
      },
      h("div.tb-mark", null, mark(15)),
      h("div.tb-name", null, d.school.name || "Monospace Timetable"),
      year ? h("div.tb-year", null, year.name) : null,
    ),
    h(
      "div.tb-buttons",
      null,
      h(
        "button.tb-btn",
        { type: "button", title: "Minimise", "aria-label": "Minimise", onclick: () => host.windowMinimize() },
        glyph("M 1 6 H 11"),
      ),
      h(
        "button.tb-btn",
        {
          type: "button",
          title: "Maximise",
          "aria-label": "Maximise",
          onclick: () => host.windowToggleMaximize(),
        },
        glyph("M 1.5 1.5 H 10.5 V 10.5 H 1.5 Z"),
      ),
      h(
        "button.tb-btn.tb-close",
        { type: "button", title: "Close", "aria-label": "Close", onclick: () => host.windowClose() },
        glyph("M 1.5 1.5 L 10.5 10.5 M 10.5 1.5 L 1.5 10.5"),
      ),
    ),
  );
}

/** A 12x12 stroke glyph. Windows' own controls are drawn at this weight. */
function glyph(d: string): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="square"/>`;
  return svg;
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
    /* ⚠️ THE SHELL REMEMBERS WHERE THE LAST DOCUMENT LIVED so Ctrl+S does not
       re-prompt. A new timetable has no home, and leaving the old path in place
       would make the very next Save overwrite the school's previous file
       without a dialog. */
    host.forgetDocumentPath();
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
   ⭐⭐ UPDATES — OFFERED, NEVER SILENT, AND NEVER WHILE SOMETHING ELSE IS UP
   ══════════════════════════════════════════════════════════════════════════

   ⚠️ THE RUST SIDE HAS DONE ALL OF THIS SINCE THE FIRST COMMIT and nothing
   called it. `checkUpdate`, `applyUpdate`, the `.old` rollback, the `take()`
   that makes a second click a no-op — all there, all unreachable, because the
   two halves of the bridge never met. v0.2.0 shipped with an updater that
   could not run, which is why nobody was ever offered v0.3.0.

   ⭐ A CHECK ON LAUNCH, ONCE. A school runs this off a shared drive and nobody
   goes looking for a release page; if the app does not say, nothing does.

   ⚠️ AND "UP TO DATE" IS ONLY SAID WHEN SOMEBODY ASKED. On the launch check it
   is silence — an unprompted "you are up to date" on every single start is
   noise people learn to dismiss, and it is the same dialog that will one day
   carry something they need to read. */

let updateOffered = false;

function showUpdate(state: UpdateState) {
  const asked = state.asked;
  if (state.kind === "current") {
    if (asked) toast(`Version ${host.version} is the latest.`, "good");
    return;
  }
  if (state.kind === "failed") {
    /* ⚠️ NEVER FOLDED INTO "up to date". A blocked school network is not a
       current version, and saying so would leave somebody on a broken build
       believing they had checked. */
    if (asked) toast(state.message, "bad", 11000);
    return;
  }

  /* One offer per launch. The check is fired once, but a manual check can land
     on top of an offer already open. */
  if (updateOffered) return;
  updateOffered = true;

  /* ⚠️ DEFERRED WHILE ANOTHER MODAL IS UP. `offerRestore()` runs at the same
     moment on the one launch that matters — somebody closed the app with
     unsaved work — and two sheets stacked is how both get dismissed unread. */
  const show = () => {
    const modal = document.getElementById("modal");
    if (modal?.classList.contains("open")) {
      setTimeout(show, 900);
      return;
    }
    openModal(
      `Version ${state.version} is available`,
      state.notes.trim() ||
        "A newer version of Monospace Timetable has been released.",
      state.canApply
        ? null
        : /* ⚠️ WHY IT CANNOT INSTALL ITSELF, in the shell's own words: a
             read-only share, or Program Files without admin. Without the
             reason this is a button that does nothing and no explanation. */
          h(
            "p.hint",
            null,
            state.reason ||
              "This copy cannot replace itself where it is stored, so the new version has to be downloaded by hand.",
          ),
      [
        button("Not now", { cls: "ghost", onclick: closeModal }),
        state.canApply
          ? button("Update and restart", {
              cls: "primary",
              icon: "download",
              onclick: () => {
                closeModal();
                /* ⚠️ THE APP CLOSES ITSELF WHEN THIS SUCCEEDS — Rust swaps the
                   running exe and relaunches. So the last thing said has to be
                   said now; there is no "done" to come back to. */
                toast("Downloading the update. The app will restart.", "", 12000);
                host.applyUpdate();
              },
            })
          : button("Open the download page", {
              cls: "primary",
              onclick: () => {
                closeModal();
                host.openExternal(state.pageUrl || REPO_URL);
              },
            }),
      ],
    );
  };
  show();
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
          /* Restored work came out of a browser profile, not out of a file —
             so it has no home either, whatever the backup's remembered name
             says. See `forgetDocumentPath`. */
          host.forgetDocumentPath();
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
  "rota-list": rotaListScreen,
  "rota-schedule": rotaScheduleScreen,
  "rota-columns": rotaColumnsScreen,
  "rota-export": rotaExportScreen,
  about: aboutScreen,
};

let root: HTMLElement;

function render() {
  const page = h(
    "div.page",
    null,
    tabstrip(),
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

  /* ⚠️ THE TITLE BAR IS A SIBLING OF `#app`, not a child: `#app` is the
     rail+page grid at `height: 100%`, and putting a strip inside it would make
     the rail start below the bar. `body` is the column. */
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
  if (isShell) {
    /* Its own node, redrawn on each repaint so the school name and year in it
       follow the document. */
    const bar = h("div", { id: "titlebar-host" });
    document.body.appendChild(bar);
    subscribe(() => bar.replaceChildren(titlebar()));
    bar.replaceChildren(titlebar());
    /* The version on the About screen arrives with the boot payload, after
       first paint. */
    onShellBoot(repaint);
    document.documentElement.dataset.shell = "yes";
  }
  document.body.appendChild(root);

  subscribe(render);
  render();

  /* ⚠️ AFTER `subscribe(render)`, AND THAT ORDER IS LOAD-BEARING — the guide
     rings a node by selector after each repaint, and the node does not exist
     until the render above has finished. See the banner in `guide.ts`. */
  startGuide();

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

  /* ⭐ ONE CHECK, ON LAUNCH, SHELL ONLY. Delayed past the first paint so a slow
     or blocked network cannot hold up the app starting — the answer arrives on
     Rust's own thread whenever it arrives. */
  if (isShell) {
    onUpdate(showUpdate);
    setTimeout(() => host.checkForUpdate(), 2500);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
