/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ THE DOCUMENT, IN MEMORY — AND THE ONE PLACE IT IS WRITTEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * One `SchoolDocument`, held here, edited through `edit()`, saved and loaded as
 * JSON. There is no server, no database and no sync: the file on the disk is
 * all the data there is, which is the whole design of the format — see the
 * banner on `model/document.ts`.
 *
 * ── ⭐ WHY EVERY EDIT GOES THROUGH ONE FUNCTION ──────────────────────────
 * `edit()` clones, hands the clone to the mutator, stores the result, marks
 * the document dirty, schedules the local backup and repaints. Four things
 * that must happen together, and a screen that reached into `doc` directly
 * would do the first and none of the other three — the classic shape of "I
 * typed it in and it did not save".
 *
 * ⚠️ THE CLONE IS DEEP AND IT IS NOT A PERFORMANCE PROBLEM. The largest
 * realistic document — three years, 8 rooms, a 2-week cycle, 45 periods a week
 * — is ~1,500 template cells and clones in well under a millisecond, and
 * `structuredClone` is native. Editing in place would make undo impossible and
 * would let a half-finished mutation be observed by a repaint.
 *
 * ── ⚠️ AND WHAT LOCALSTORAGE IS FOR, WHICH IS NOT SAVING ─────────────────
 * `LOCAL_KEY` holds a copy so a closed tab, a crash or an accidental refresh
 * does not lose an afternoon. IT IS NOT THE SAVE — the save is a FILE, because
 * a school's timetable living in one browser profile on one machine is a
 * timetable that does not survive a new laptop, and because localStorage is
 * cleared by exactly the "clear browsing data" a school's IT policy runs. The
 * app says so where it offers to restore.
 *
 * ⚠️ AND IT CAN THROW. Private-mode Safari gives a `localStorage` object whose
 * `setItem` raises `QuotaExceededError`, and an unguarded write on every
 * keystroke would take the app down on that browser and no other. Every access
 * here is wrapped and a failure is silent by design: the backup is a courtesy.
 */

import {
  SCHOOL_DOCUMENT_EXTENSION,
  emptySchoolDocument,
  pickAcademicYear,
  readSchoolDocument,
  todayCivil,
  type SchoolDocument,
  type SchoolYear,
} from "./engine";

/**
 * ⭐⭐ "WHICH YEAR DID THEY MEAN?" — ONE RULE, AND IT IS THE ENGINE'S.
 *
 * `pickAcademicYear` takes `{ yearStart, yearEnd }` because it is shared with
 * Monospace's Convex calendar rows; a `SchoolYear` calls the same two fields
 * `start` and `end`. **THIS FUNCTION IS THAT RENAME AND NOTHING ELSE** — the
 * three-step rule (the year covering today → the one about to start → the most
 * recently ended) stays entirely inside the engine, exactly as `buildModel`'s
 * own `pickYear` does it.
 *
 * ⚠️ `years[0]` IS NEVER THE ANSWER. The file's order is the school's, which
 * in practice is creation order, so `[0]` is its OLDEST year. Monospace
 * records five separate readers having had this bug; two of them are in this
 * app (the store and the export screen) and both come through here.
 */
export function currentYear(years: SchoolYear[]): SchoolYear | null {
  if (years.length === 0) return null;
  const picked = pickAcademicYear(
    years.map((y) => ({ ...y, yearStart: y.start, yearEnd: y.end })),
    todayCivil(),
  );
  return picked ? (years.find((y) => y.id === picked.id) ?? null) : null;
}

const LOCAL_KEY = "monospace.timetable.doc.v1";
const LOCAL_META = "monospace.timetable.meta.v1";

export type Screen =
  | "year"
  | "closures"
  | "day"
  | "rooms"
  | "templates"
  | "weeks"
  | "customise"
  | "export"
  | "about";

export type Theme = "dark" | "light";

type State = {
  doc: SchoolDocument;
  /** Which year every screen is editing. ⚠️ NEVER `years[0]` — see `yearNow`. */
  yearId: string | null;
  screen: Screen;
  /** Unsaved changes since the last write to a file. */
  dirty: boolean;
  /** What the file on disk is called, when we know. */
  filename: string | null;
  theme: Theme;
  /** Whose name goes on the workbook's info sheet. Local to this machine —
   *  a desktop app has no session, so it is asked once and remembered here
   *  rather than being written into a file that gets mailed around. */
  generatedBy: string;
};

const state: State = {
  doc: emptySchoolDocument(),
  yearId: null,
  screen: "year",
  dirty: false,
  filename: null,
  theme: "dark",
  generatedBy: "",
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Repaint. ⚠️ Coalesced to one frame: a screen that writes three fields in a
 * loop must not repaint three times, and the grid's cell writes are far more
 * frequent than a frame.
 *
 * ⚠️⚠️ AND `requestAnimationFrame` DOES NOT FIRE IN A BACKGROUND TAB. A repaint
 * scheduled while the tab is hidden would sit pending until somebody came back
 * — which is harmless for pixels and NOT harmless for anything that waits on
 * one. So a hidden document falls through to a timeout instead. Measured: with
 * the pane hidden, clicking a week in the picker changed `activeMonday` and
 * redrew nothing, for ever.
 */
let painting = false;
export function repaint() {
  if (painting) return;
  painting = true;
  const run = () => {
    painting = false;
    for (const fn of listeners) fn();
  };
  if (typeof document !== "undefined" && document.hidden) setTimeout(run, 0);
  else requestAnimationFrame(run);
}

export const doc = () => state.doc;
export const screen = () => state.screen;
export const theme = () => state.theme;
export const isDark = () => state.theme === "dark";
export const isDirty = () => state.dirty;
export const filename = () => state.filename;
export const generatedBy = () => state.generatedBy;

/* ══════════════════════════════════════════════════════════════════════════
   THE ONE WRITER
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ THE ONLY WAY THE DOCUMENT CHANGES. Clone, mutate the clone, store it, mark
 * it dirty, schedule the backup, repaint — five things that have to happen
 * together, and a screen reaching into `doc()` directly would do the first and
 * none of the other four. That is the exact shape of "I typed it in and it did
 * not save".
 *
 * ⚠️ LOOKING AT SOMETHING IS NOT EDITING IT. Which cycle week or which week is
 * on screen goes through `repaint()` and never through here — routing it here
 * would put "unsaved changes" on a file nobody touched, and then a school
 * would learn to click past the warning that matters.
 */
export function edit(mutate: (d: SchoolDocument) => void) {
  const next = structuredClone(state.doc) as SchoolDocument;
  mutate(next);
  state.doc = next;
  state.dirty = true;
  scheduleBackup();
  repaint();
}

/** Replace the whole document — a file was opened, or "New" was pressed. */
export function replaceDocument(next: SchoolDocument, name: string | null) {
  state.doc = next;
  state.filename = name;
  state.dirty = false;
  /* ⭐ `pickAcademicYear` AND NEVER `years[0]`, which is the school's OLDEST.
     CLAUDE.md records five separate readers in Monospace having had exactly
     this bug; opening a file on last year's timetable is the same bug with a
     friendlier face. */
  state.yearId = currentYear(next.years)?.id ?? next.years[0]?.id ?? null;
  scheduleBackup();
  repaint();
}

export function setScreen(s: Screen) {
  if (state.screen === s) return;
  state.screen = s;
  repaint();
}

export function setYearId(id: string | null) {
  state.yearId = id;
  repaint();
}

export function setTheme(t: Theme) {
  state.theme = t;
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(`${LOCAL_META}.theme`, t);
  } catch {
    /* see the banner: the backup is a courtesy */
  }
  repaint();
}

export function setGeneratedBy(name: string) {
  state.generatedBy = name;
  try {
    localStorage.setItem(`${LOCAL_META}.by`, name);
  } catch {
    /* ignored */
  }
  repaint();
}

export function markSaved(name: string | null) {
  state.dirty = false;
  if (name) state.filename = name;
  repaint();
}

/* ══════════════════════════════════════════════════════════════════════════
   WHICH YEAR
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ THE YEAR EVERY SCREEN IS ON.
 *
 * ⚠️ `pickAcademicYear` IS THE FALLBACK AND `years[0]` IS NEVER IT. The file's
 * order is the school's own — creation order in practice — so `[0]` is the
 * OLDEST year it holds, and a tool that opened on it would quietly have the
 * school editing a timetable they finished teaching a year ago.
 */
export function yearNow(): SchoolYear | null {
  const years = state.doc.years;
  if (years.length === 0) return null;
  if (state.yearId) {
    const found = years.find((y) => y.id === state.yearId);
    if (found) return found;
  }
  return currentYear(years) ?? years[0];
}

/** Edit the year every screen is on. A no-op when there is no year, which is
 *  the state a brand new document is deliberately in. */
export function editYear(mutate: (y: SchoolYear) => void) {
  const id = yearNow()?.id;
  if (!id) return;
  edit((d) => {
    const y = d.years.find((yy) => yy.id === id);
    if (y) mutate(y);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   IDS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ OPAQUE, AND NOTHING READS MEANING OUT OF ONE. They exist so a template
 * cell can point at a room and survive its rename — see the format banner.
 * `crypto.randomUUID` is unavailable on `http://` origins in some browsers and
 * this file is opened from `file://`, so the fallback is not decoration.
 */
export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE LOCAL BACKUP — NOT THE SAVE
   ══════════════════════════════════════════════════════════════════════════ */

let backupTimer: number | undefined;
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state.doc));
      localStorage.setItem(
        LOCAL_META,
        JSON.stringify({ at: Date.now(), name: state.filename }),
      );
    } catch {
      /* Quota, private mode, a policy that disables storage. The backup is a
         courtesy and its absence must never take the app down. */
    }
  }, 600) as unknown as number;
}

export function clearBackup() {
  try {
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(LOCAL_META);
  } catch {
    /* ignored */
  }
}

/** What is in the backup, if anything, without loading it. */
export function backupInfo(): { at: number; name: string | null } | null {
  try {
    if (!localStorage.getItem(LOCAL_KEY)) return null;
    const meta = localStorage.getItem(LOCAL_META);
    const parsed = meta ? (JSON.parse(meta) as { at?: number; name?: string }) : {};
    return { at: parsed.at ?? 0, name: parsed.name ?? null };
  } catch {
    return null;
  }
}

/**
 * Load the backup.
 *
 * ⚠️ THROUGH `readSchoolDocument` LIKE ANY OTHER FILE, and that is not
 * ceremony: the backup was written by a possibly OLDER build of this app, in a
 * browser profile that has been sitting there for a term, so it needs the same
 * migration and the same from-the-future refusal a mailed file does. Reading
 * it back as `SchoolDocument` because "we wrote it" is how a format acquires a
 * second, unversioned reader.
 */
export function loadBackup(): { ok: true } | { ok: false; message: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LOCAL_KEY);
  } catch {
    return { ok: false, message: "This browser will not let the app read its local backup." };
  }
  if (!raw) return { ok: false, message: "There is no local backup to restore." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "The local backup is damaged and cannot be read." };
  }
  const read = readSchoolDocument(parsed);
  if (!read.ok) return { ok: false, message: read.issue.message };
  const meta = backupInfo();
  replaceDocument(read.document, meta?.name ?? null);
  /* ⚠️ RESTORED WORK IS UNSAVED WORK. It came out of a browser profile, not
     out of a file, so the file on the disk — if there even is one — does not
     have it. Marking it clean would put "Saved" over an afternoon that exists
     in exactly one place. */
  state.dirty = true;
  repaint();
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════════ */

export function boot() {
  try {
    const t = localStorage.getItem(`${LOCAL_META}.theme`);
    if (t === "light" || t === "dark") state.theme = t;
    state.generatedBy = localStorage.getItem(`${LOCAL_META}.by`) ?? "";
  } catch {
    /* ignored */
  }
  document.documentElement.dataset.theme = state.theme;
}

/** What the file should be called. */
export function suggestedDocName(): string {
  const school = state.doc.school.name.trim();
  const year = yearNow()?.name.trim();
  const parts = [school || "Timetable", year].filter(Boolean).join(" ");
  return `${parts.replace(/[\\/:*?"<>|]+/g, "-")}${SCHOOL_DOCUMENT_EXTENSION}`;
}
