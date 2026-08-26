/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE SCHOOL DOCUMENT — THE FILE A SCHOOL SAVES, AND THEREFORE A FORMAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Monospace builds `TimetableWorkbookModel` inside a Next.js route handler
 * from ~90 Convex reads. There is no Convex here and no server: the school
 * types its year into a window and presses save, and what lands on the disk is
 * THIS. So it is not an internal type — it is a file format, it will be in
 * mail attachments and on shared drives and in a `Timetable 2027 FINAL.json`
 * somebody renamed, and it will be hard to change once schools have files.
 *
 * That is worth saying plainly because the temptation is to treat it as an
 * intermediate structure and reshape it whenever the builder wants something
 * different. Every rule below exists to make an old file still open.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ HOW AN OLDER FILE IS READ — THE WHOLE RULE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `formatVersion` is a positive INTEGER, currently `SCHOOL_DOCUMENT_VERSION`.
 * `readSchoolDocument()` is the only way in, and it does four things in this
 * order:
 *
 *   1. ⚠️ A FILE FROM THE FUTURE IS REFUSED, NOT BEST-EFFORTED. If
 *      `formatVersion` is greater than this build knows, the read fails and
 *      names both numbers. It is tempting to "read what we understand" — do
 *      not. A file whose new fields are silently dropped produces a workbook
 *      that is complete-looking and WRONG, which is the failure mode the
 *      writer's own info sheet exists to prevent, arriving one layer earlier
 *      and with nothing to print it on. A school that cannot open a file
 *      updates the app; a school handed a quietly incomplete timetable teaches
 *      from it.
 *
 *   2. ⭐ AN OLDER FILE IS MIGRATED, ONE VERSION AT A TIME. `MIGRATIONS[n]`
 *      turns a version-`n` document into a version-`n+1` one. They run in
 *      sequence, each is pure, and none of them edits its input in place — so
 *      a failure part-way leaves the caller's parsed JSON untouched and the
 *      chain is testable one step at a time. A migration may never be edited
 *      after it ships: it describes files that already exist. Add another.
 *
 *   3. ⭐ EVERY OPTIONAL FIELD HAS A DEFAULT, AND ABSENCE IS THE OLD FILE'S
 *      MAIN COMPATIBILITY MECHANISM. Adding an OPTIONAL field with a default
 *      that reproduces the previous behaviour needs no version bump and no
 *      migration — which is how most changes should land. A version bump is
 *      for a field changing MEANING or SHAPE, and that is rare and expensive.
 *      This is the same discipline `resolveExportOptions` and
 *      `resolveActivityLogging` follow in Monospace, for the same reason.
 *
 *   4. ⚠️ UNKNOWN KEYS ARE KEPT AND REPORTED, NOT DROPPED. They are stashed on
 *      the result so the app can say "this file has settings this copy does
 *      not understand; saving will lose them" instead of losing them quietly.
 *      Rule 1 means this should be unreachable — but a hand-edited file is a
 *      thing schools do, and the point of a text format is that they can.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WHAT IS DELIBERATELY *NOT* IN HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   · NO RESOLVED WEEKS. The year is stored as its RULE — bounds, cycle
 *     length, anchor, holiday mode, closures, pins — and `buildYear()` derives
 *     the 39 weeks on every open. Storing the derived answer would mean a file
 *     saved under one version of the cycle engine and opened under another
 *     disagrees with itself, and the school would have no way to tell which
 *     half was stale. Derived data is never stored; that is why the engine is
 *     pure.
 *
 *   · NO PASSWORD. `TimetableWorkbookModel.password` exists for the length of
 *     one export and is never written down — its own banner in
 *     `timetableSheet.ts` argues this at length. A password in the saved file
 *     is a password in the mail attachment.
 *
 *   · NO COLOURS PER CLASS. `colourForClass()` derives them, deterministically,
 *     from the class code. A stored palette is a palette that drifts from the
 *     one the writer computes; see `fixtures/palette.txt`, which pins the
 *     derivation instead.
 *
 *   · NO CONVEX IDS AND NO `_id`. Ids here are opaque strings the app makes
 *     up. They exist so templates and bookings can point at rooms and survive
 *     a rename; nothing reads meaning out of them.
 */

import type { SchoolRota } from "./rota";
import {
  CYCLE_LENGTHS,
  DEFAULT_TAUGHT_WEEKDAYS,
  defaultWeekLabels,
  type CivilDate,
  type ClosureKind,
  type CycleLength,
  type HolidayMode,
} from "../lib/timetable";
import type { ExportOptionKey } from "../lib/timetableSheet";

/**
 * The version this build writes and the highest it can read.
 *
 * ⚠️ BUMPING THIS IS A COMMITMENT. Every previous version must keep opening,
 * forever, which means a migration and a fixture. See the banner.
 */
export const SCHOOL_DOCUMENT_VERSION = 1;

/** What a saved file is called by default. Not enforced; a school may rename. */
export const SCHOOL_DOCUMENT_EXTENSION = ".timetable.json";

/* ══════════════════════════════════════════════════════════════════════════
   THE PARTS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A run of closed days. ⭐ THE ONLY THING THAT INTERRUPTS A YEAR — there is no
 * term and no half-term flag, because `buildHalfTerms()` derives the half-term
 * sheet from runs of non-teaching weeks. Same shape as `ClosureInput`, which
 * is what it is handed to `buildYear()` as.
 */
export type SchoolClosure = {
  id: string;
  label: string;
  kind: ClosureKind;
  start: CivilDate;
  /** ⚠️ INCLUSIVE. A single INSET day has `start === end`. */
  end: CivilDate;
};

/**
 * A week whose cycle position the school has forced.
 *
 * ⚠️ UNDER `pause` A PIN RESEEDS THE COUNT rather than being a local
 * exception — `resolveYear`'s own comment calls this the half that surprises
 * people, and a saved file makes it durable, so the app must say so where a
 * pin is entered.
 */
export type SchoolWeekPin = {
  /** ⚠️ MUST BE A MONDAY. `isMonday()` is the test; a non-Monday silently
   *  matches no week and the pin does nothing at all. */
  monday: CivilDate;
  cycleWeek: number;
  isTeachingWeek?: boolean;
  reason?: string;
};

/**
 * One row of the day. Same shape as `PeriodDef`, stored rather than derived.
 *
 * ⚠️ `ordinal` IS THE IDENTITY AND `order` IS THE POSITION, and they are two
 * fields on purpose: templates and bookings hold the ORDINAL, so reordering
 * the day must not renumber them. The export route's own banner records what
 * happens when `order` is dropped in transit — the workbook prints the day in
 * creation order while the screen shows the dragged order, and only the file
 * is wrong.
 *
 * ⚠️ TIMES ARE OPTIONAL. A school that labels its periods rather than timing
 * them is the school this was measured from. An UNTIMED period can carry a
 * template lesson and a week change (both keyed to the ordinal) but can never
 * collide with an ad-hoc booking, because there is no clock on the row to
 * compare an instant against.
 */
export type SchoolPeriod = {
  ordinal: number;
  name: string;
  /** "09:00", wall clock in the year's timezone. Both or neither. */
  start?: string;
  end?: string;
  order?: number;
  /** Set only for a day that runs a different shape — a Friday finishing
   *  early. Absent means every taught day. */
  weekday?: number;
  /** ⭐ BOOKABLE. False for registration, break, lunch. Drawn as structure and
   *  never offered as free space. ⚠️ IT IS THIS FLAG AND NEVER THE LABEL: a
   *  school that renames "Break" to "Tutor" must not change what the cell is. */
  isTeaching: boolean;
};

/** A custom column of facts about rooms — "No of PCs", "Teacher", "Telephone". */
export type SchoolField = {
  /** Stable key. Values are keyed on it, so renaming `label` is free. */
  id: string;
  label: string;
  /**
   * ⭐ DECIDES WHETHER "33" LANDS IN THE CELL AS A NUMBER OR AS TEXT.
   * The reference workbook stores PC counts and extension numbers as numbers,
   * and a column that is text here and numeric there is the difference that
   * shows up the first time somebody sorts on it.
   *
   * ⚠️ AND THE COERCION IS `numericValue()`, NOT `Number()`. A room whose
   * telephone reads `0x10` prints `0x10`; a school types what it types.
   */
  kind: "text" | "number";
};

/** One printed column. */
export type SchoolRoom = {
  id: string;
  /** "N21". The column header — short by nature, it is a room code. */
  name: string;
  /**
   * ⭐ IN SERVICE. A retired room KEEPS ITS COLUMN and `cellRights()` locks
   * every cell of it, free periods included — because a grid is read
   * positionally and dropping a column moves every room to the right of it.
   * Absent means `true`: a file written before anybody retired anything.
   */
  active?: boolean;
  /**
   * Field id → what the admin typed, as typed.
   *
   * ⚠️ AN ABSENT KEY MEANS PRINT NOTHING, and so does `null`. It is NOT "-":
   * a school types "-" to mean "no teacher assigned", and that is a value
   * somebody chose. Inventing a placeholder puts words on a printed sheet
   * nobody typed.
   */
  values?: Record<string, string | null>;
};

/**
 * A room list. Org-level in Monospace and school-level here, because the
 * estate belongs to the school — a minibus sheet and an IT-room sheet are two
 * of these, not two years.
 */
export type SchoolRoomSheet = {
  id: string;
  /** "IT Rooms". Used in the app's picker; never printed in the workbook. */
  name: string;
  /** ⚠️ PRINT ORDER, and the file's order is the print order. */
  fields: SchoolField[];
  rooms: SchoolRoom[];
};

/**
 * One cell of a standing week — the timetable as it runs every Week A.
 *
 * ⭐ STORED PER CYCLE WEEK, NEVER MATERIALISED PER WEEK. Eight rooms on a
 * two-week cycle is sixteen grids for the whole year, and that is the entire
 * reason a three-year file stays small enough to mail.
 */
export type SchoolTemplateCell = {
  id: string;
  roomId: string;
  cycleWeek: number;
  /** 1 = Monday … 5 = Friday. */
  weekday: number;
  /** ⚠️ THE PERIOD'S `ordinal`, NEVER ITS POSITION. See `SchoolPeriod`. */
  periodOrdinal: number;
  /** "10D/Bs". Absent means the cell is empty in the standing plan. */
  label?: string;
  note?: string;
};

/**
 * ⭐⭐ SOMEBODY CHANGED ONE WEEK — the layer whose absence was silent in
 * Monospace for a while, and printed the lesson in the room it was moved OFF.
 *
 * ⚠️ AN ABSENT `label` IS THE CLEARED STATE and is NOT an empty string: it
 * means "this lesson is not running here this week, because it moved". The
 * writer draws it empty AND refuses to link it to the template, because a
 * linked empty cell resurrects the very lesson somebody moved off it the
 * moment Excel recalculates.
 */
export type SchoolWeekChange = {
  id: string;
  roomId: string;
  /** ⚠️ THE MONDAY OF THE WEEK THIS IS A CHANGE TO. Must be a Monday. */
  monday: CivilDate;
  weekday: number;
  periodOrdinal: number;
  label?: string;
  note?: string;
  changedBy?: string;
  /** Epoch ms. Absent means unknown, which an imported file legitimately is. */
  changedAt?: number;
};

/**
 * A one-off reservation from the ledger — a room booked for something that is
 * not the timetable.
 *
 * ⚠️ IT OUTRANKS BOTH THE TEMPLATE AND THE WEEK CHANGE, because a reservation
 * is a fact about the ROOM and an override is a note about the LESSON. See
 * `resolvePublishedRoom`'s precedence banner.
 *
 * ⚠️ AND IT IS MATCHED BY CLOCK TIME, so it can only land on a period that has
 * one. An untimed period never collides with a booking; that is honest rather
 * than a gap, and it is what period times buy.
 */
export type SchoolBooking = {
  id: string;
  roomId: string;
  /** Epoch ms. */
  startUtc: number;
  endUtc: number;
  /**
   * ⚠️ THE CIVIL DATE IN THE SCHOOL'S OWN ZONE, which is the bucket boundary
   * the grid is drawn on — not UTC's midnight. Absent is derived from
   * `startUtc` and the year's timezone by `localDateOf()`, which is what the
   * app should do when importing from something that does not carry it.
   */
  localDate?: CivilDate;
  /**
   * ⚠️⚠️ THE FOUR VALUES ARE `pending`, `approved`, `rejected`, `cancelled`,
   * AND ONLY THE FIRST TWO PUT ANYTHING IN A CELL.
   *
   * `resolvePublishedRoom` matches on
   * `status === "approved" || status === "pending"` — so a `rejected` or
   * `cancelled` booking correctly leaves the room showing its standing lesson,
   * and ⚠️ SO DOES ANY OTHER STRING. A value the set does not contain is not
   * an error; it is a booking that silently does not exist, which is the worst
   * shape a format can have.
   *
   * That is not hypothetical: this field was first documented as
   * `"confirmed" / "cancelled"`, an importer written to that would have
   * produced a workbook with every reservation missing, and the fixture that
   * used "confirmed" is what caught it.
   *
   * ⭐ ABSENT MEANS `approved`. A file that carries bookings at all is a file
   * whose bookings are meant to print, and the alternative — defaulting to a
   * value that shows nothing — is the silent failure again.
   */
  status?: "pending" | "approved" | "rejected" | "cancelled";
  /**
   * What it is for. ⚠️ ABSENT PRINTS "Booked" — which says the room is taken
   * and says nothing else, and is NOT the same as "no reason given".
   */
  purpose?: string;
};

/**
 * One academic year.
 *
 * ⚠️ A SCHOOL KEEPS UP TO THREE and Monospace enforces that on CREATION only
 * (`MAX_CALENDARS_PER_ORG`), with a much higher READ ceiling, precisely so
 * that lowering the cap can never make an existing year vanish from a picker.
 * ⭐ THIS FILE HAS NO CAP AT ALL, on the same reasoning taken to its end: a
 * file is not a database and refusing to open one because it holds four years
 * would be a school losing its data to a constant.
 */
export type SchoolYear = {
  id: string;
  /** "2026/27". Used for the workbook filename and the info sheet. */
  name: string;
  /** IANA zone — "Europe/London". Decides when a week has ended and which
   *  civil day a booking falls on. */
  timezone: string;
  /** ⚠️ CLIPPED PER DAY, NOT PER WEEK. A year beginning on a Wednesday has a
   *  first week whose Monday and Tuesday are simply not in it. */
  start: CivilDate;
  end: CivilDate;
  cycleLength: CycleLength;
  /** ⚠️ MUST BE A MONDAY, and must sit inside [start, end] — outside it the
   *  walk starts from the nearest end and the whole year is phase-shifted. */
  anchorMonday: CivilDate;
  /**
   * ⭐ SEPARATE FROM `anchorMonday` ON PURPOSE. "We came back on the wrong
   * week" is then a one-field correction rather than moving a date, which
   * under `pause` re-parents the entire running count.
   */
  anchorWeekIndex: number;
  /**
   * `pause` — the cycle stops counting through a closure and resumes where it
   * left off. `continue` — every week is answered independently from the
   * anchor. ⚠️ THE REFERENCE SCHOOL NEEDS `pause`: its February runs
   * "(A) Feb 8th" → half term → "(B) Feb 22nd", which only comes out B if the
   * closed week consumed no cycle position.
   */
  holidayMode: HolidayMode;
  /** ["Week A", "Week B"]. Absent uses `defaultWeekLabels(cycleLength)`.
   *  ⚠️ A CYCLE NARROWED TO ONE still stores its old labels; `cycleWeekLabel`
   *  resolves that to "Every week" and it must not be resolved here too. */
  weekLabels?: string[];
  /** Which of Mon–Fri the school runs. Absent means all five. */
  taughtWeekdays?: number[];
  closures?: SchoolClosure[];
  pins?: SchoolWeekPin[];
  /**
   * ⭐ THE DAY, PER YEAR — matching where it lives in Monospace, and honest:
   * a school really can change its day between years. An app offering "one day
   * shape across the years" COPIES this between years; it does not share it,
   * because a shared day would let editing next year's break time silently
   * rewrite a year already taught.
   */
  periods: SchoolPeriod[];
  /** Which room sheet this year prints. Absent uses the first one. */
  roomSheetId?: string;
  templates?: SchoolTemplateCell[];
  weekChanges?: SchoolWeekChange[];
  bookings?: SchoolBooking[];
};

/**
 * ⭐ WHAT SHAPE OF FILE THE SCHOOL ASKED FOR — stored PARTIAL and pruned to
 * what differs from the default, exactly as `normaliseExportOptions` does on
 * the organisation document. A school that wants the plain workbook stores
 * `{}` rather than four falses, which would freeze today's defaults onto the
 * file and survive a change of default.
 *
 * The four are Cam's "extra options to lock fields, auto change each week if
 * the template is changed": `linkTemplates` is the auto-change,
 * `protectTemplates` and `lockPrefilled` are the locks, `hideEndedWeeks` folds
 * away tabs for weeks that are over.
 */
export type SchoolExportOptions = Partial<Record<ExportOptionKey, boolean>>;

/** The whole file. */
export type SchoolDocument = {
  formatVersion: number;
  school: {
    name: string;
    /**
     * ⭐ THE TIMETABLE ACCENT — `#rrggbb`, lowercase, six digits, no alpha.
     * Absent means `DEFAULT_TIMETABLE_ACCENT`, so a school that never opens
     * Customise gets exactly the workbook it got before the setting existed.
     *
     * ⚠️ IT MOVES THE FURNITURE ONLY. Class chips never move with it, and the
     * printed tints are unclamped while the dark ones carry the whole clamp —
     * see the palette banner in `timetableSheet.ts`, and do not reason about
     * any of it from the constants.
     */
    accent?: string;
  };
  export?: SchoolExportOptions;
  /** ⚠️ ORDER IS THE SCHOOL'S, AND `[0]` IS NEVER "THE CURRENT YEAR".
   *  `pickAcademicYear()` is the one rule for that and it has five readers in
   *  Monospace, every one of which has had this bug at some point. */
  roomSheets: SchoolRoomSheet[];
  /**
   * ⭐ RECURRING CHECK ROTAS — IT rooms, fire doors, PAT testing, minibuses.
   *
   * ⚠️ OPTIONAL, AND ITS ABSENCE IS EXACTLY TODAY'S BEHAVIOUR, which is why it
   * costs NO format version bump and no migration — rule 3 of this file's own
   * banner. An older build handed a newer file still opens it, reports `rotas`
   * in `unknownKeys`, and tells the school that saving will drop it.
   */
  rotas?: SchoolRota[];
  years: SchoolYear[];
};

/* ══════════════════════════════════════════════════════════════════════════
   READING ONE
   ══════════════════════════════════════════════════════════════════════════ */

/** What a migration is: version `n` in, version `n+1` out, purely. */
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * ⚠️ INDEXED BY THE VERSION BEING UPGRADED **FROM**. `MIGRATIONS[1]` turns a
 * v1 file into a v2 one. Empty today because v1 is the first version, and
 * that is the correct kind of empty: the machinery is here and tested by
 * `readSchoolDocument` refusing a v0 and a v2, so the first real bump is a
 * one-line addition rather than a design.
 *
 * ⚠️ A SHIPPED MIGRATION IS NEVER EDITED. It describes files that exist on
 * schools' disks. If it is wrong, the fix is the next one along.
 */
const MIGRATIONS: Record<number, Migration> = {};

export type SchoolDocumentIssue = {
  /** Machine-readable, for the app to branch on. */
  code:
    | "not-an-object"
    | "bad-version"
    | "from-the-future"
    | "no-years"
    | "unknown-keys"
    | "bad-year"
    | "bad-room-sheet";
  message: string;
};

export type ReadResult =
  | {
      ok: true;
      document: SchoolDocument;
      /**
       * ⚠️ KEYS THIS BUILD DID NOT RECOGNISE, kept so the app can warn that
       * saving will drop them. Reaching this with a same-version file means
       * somebody hand-edited it, which a text format invites.
       */
      unknownKeys: string[];
      /** Non-fatal notes worth showing — a migration that ran, say. */
      notes: string[];
    }
  | { ok: false; issue: SchoolDocumentIssue };

/* ⚠️⚠️ TWO PLACES, ALWAYS. A key added here and NOT to the field-by-field
   literal that `readSchoolDocument` returns stops being reported as unknown AND
   is still silently dropped on every open/save round trip — the worst of both,
   because the school is no longer even warned. */
const TOP_LEVEL_KEYS = new Set([
  "formatVersion",
  "school",
  "export",
  "roomSheets",
  "rotas",
  "years",
]);

/**
 * ⭐ THE ONLY WAY IN. Parse with `JSON.parse` first; this takes the result.
 *
 * It validates SHAPE, not sanity: a year whose anchor is not a Monday, or
 * whose closures overlap, opens fine and the engine says so downstream where
 * there is a workbook to print the complaint on. Refusing to open a file for
 * a fixable data problem strands the only copy of it.
 */
export function readSchoolDocument(input: unknown): ReadResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      issue: {
        code: "not-an-object",
        message:
          "That file is not a timetable document. A timetable file is a JSON object with a “formatVersion” in it.",
      },
    };
  }

  let doc = { ...(input as Record<string, unknown>) };
  const raw = doc.formatVersion;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    return {
      ok: false,
      issue: {
        code: "bad-version",
        message:
          "That file does not say which timetable format it is in, so it cannot be read safely.",
      },
    };
  }

  if (raw > SCHOOL_DOCUMENT_VERSION) {
    return {
      ok: false,
      issue: {
        code: "from-the-future",
        message: `That file was saved by a newer version of this app (format ${raw}; this copy reads up to ${SCHOOL_DOCUMENT_VERSION}). Update the app and open it again — reading it here would quietly drop whatever is new in it, and a timetable that is missing something without saying so is worse than one that will not open.`,
      },
    };
  }

  const notes: string[] = [];
  for (let v = raw; v < SCHOOL_DOCUMENT_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) {
      return {
        ok: false,
        issue: {
          code: "bad-version",
          message: `That file is in format ${v}, and this copy has no way to bring it forward. That is a bug rather than anything you did.`,
        },
      };
    }
    doc = migrate(doc);
    doc.formatVersion = v + 1;
    notes.push(`Brought forward from format ${v} to ${v + 1}.`);
  }

  const unknownKeys = Object.keys(doc).filter((k) => !TOP_LEVEL_KEYS.has(k));

  const school =
    typeof doc.school === "object" && doc.school !== null
      ? (doc.school as SchoolDocument["school"])
      : { name: "" };

  const roomSheets = Array.isArray(doc.roomSheets)
    ? (doc.roomSheets as SchoolRoomSheet[])
    : [];
  const years = Array.isArray(doc.years) ? (doc.years as SchoolYear[]) : [];

  const rotas = Array.isArray(doc.rotas) ? (doc.rotas as SchoolRota[]) : [];

  /* ⚠️⚠️ THESE TWO REFUSALS USED TO BE UNCONDITIONAL AND A ROTA-ONLY FILE COULD
     NOT BE OPENED AT ALL. A school running a fire-door rota and nothing else has
     no academic year and no room list, and refusing it would have made the
     second feature unusable on its own — which is the whole point of it being a
     second feature rather than a timetable screen.

     So a file has to hold SOMETHING, and either is enough. A file holding
     neither is still refused, because that is a file with no content at all and
     "opened successfully" would be a lie about it. */
  if (years.length === 0 && rotas.length === 0) {
    return {
      ok: false,
      issue: {
        code: "no-years",
        message:
          "That file holds no academic year and no rota, so there is nothing in it to open.",
      },
    };
  }
  if (years.length > 0 && roomSheets.length === 0) {
    return {
      ok: false,
      issue: {
        code: "bad-room-sheet",
        message:
          "That file holds an academic year with no room list, so there are no columns to print. Add the rooms first.",
      },
    };
  }

  return {
    ok: true,
    document: {
      formatVersion: SCHOOL_DOCUMENT_VERSION,
      school: { name: String(school.name ?? ""), accent: school.accent },
      export:
        typeof doc.export === "object" && doc.export !== null
          ? (doc.export as SchoolExportOptions)
          : undefined,
      roomSheets,
      /* ⚠️ HERE TOO — see the banner on TOP_LEVEL_KEYS. This literal is what is
         actually returned; a key missing from it is a key dropped on save. */
      rotas: rotas.length ? rotas : undefined,
      years,
    },
    unknownKeys,
    notes,
  };
}

/**
 * An empty document, for "New timetable".
 *
 * ⚠️ IT IS DELIBERATELY NOT VALID TO EXPORT — no periods, no rooms. The app
 * walks the school through those, and the builder's refusals name what is
 * missing. A seeded fake year would be a school's first timetable containing
 * somebody else's Tuesday.
 */
export function emptySchoolDocument(name = ""): SchoolDocument {
  return {
    formatVersion: SCHOOL_DOCUMENT_VERSION,
    school: { name },
    roomSheets: [{ id: "rooms", name: "Rooms", fields: [], rooms: [] }],
    years: [],
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ WHAT THIS YEAR CALLS ITS CYCLE WEEKS — ONE READER, NOT TEN
   ══════════════════════════════════════════════════════════════════════════

   `weekLabels` is OPTIONAL on a `SchoolYear`, and "absent" is not a rare edge:
   it is the state of every year an app creates until somebody types into the
   two label boxes. So every reader has to answer "and if it is absent?", and
   there were TEN of them answering it two different ways:

     · `year.weekLabels && year.weekLabels.length ? … : defaultWeekLabels(n)`
       — the four screens (closures, templates, weeks, export) and the label
       fields on the year screen. Answer: **Week A / Week B**.
     · `year.weekLabels ?? []` — `buildModel` twice, the year screen's own
       resolved-weeks preview, and the grid's top-left corner. That empty array
       reaches `cycleWeekLabel`, whose documented fallback is `Week N+1`.
       Answer: **Week 1 / Week 2**.

   ⚠️ AND THE SECOND GROUP IS THE ONE THAT WRITES THE FILE. Measured on a
   school built through the UI from scratch: the app's cycle picker offered
   "Week A" and "Week B", the tab strip above the standing grid said Week A /
   Week B, the export screen's summary line said `Week A / Week B` — and the
   workbook that came out held `Week 1 - Template`, `Week 2 - Template`,
   `(1) September 7th - 11th` and `WEEK 1` in B1. The screen was not the
   export, which is the one promise this product makes.

   ⚠️ THE FIXTURE COULD NOT CATCH IT. `fixtures/school.fixture.json` carries
   `weekLabels: ["Week A", "Week B"]` explicitly, so the byte-for-byte gate
   compares the one path a real new school never takes.

   ── ⭐ WHY THE FALLBACK IS **NOT** MOVED INTO `cycleWeekLabel` ────────────
   `Week N+1` is right THERE and must stay: that function takes a labels array
   and an index, and its job is to answer for an index the array does not
   reach — a two-week cycle widened to three, where week 3 has no stored name
   and borrowing week 1's would be a lie. This function answers a different
   question — "what does this YEAR call its weeks" — where absent means nobody
   has renamed anything and the default set is the honest answer.

   ⚠️ IT DOES NOT PAD A SHORT ARRAY, on purpose. A cycle widened from two to
   three legitimately stores two labels; `cycleWeekLabel` already handles the
   third, and padding here would store a name the school never typed and then
   defeat the "trim only, never pad" rule the cycle picker keeps.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The names this year's cycle weeks go by — the school's own, when it has
 * typed any, and `defaultWeekLabels(cycleLength)` when it has not.
 *
 * ⭐ EVERY READER OF `year.weekLabels` GOES THROUGH HERE, including the two
 * inside `buildModel` that decide what the workbook's tabs are called.
 *
 * ⚠️ AN ARRAY OF BLANKS COUNTS AS ABSENT, which `length` alone would not
 * catch. Clearing both label boxes stores `["", ""]` — a length-2 array whose
 * every entry is empty — and the placeholder in those boxes says "Week A". A
 * cleared box means "I have not named this", not "call it Week 1".
 */
export function yearWeekLabels(
  year: Pick<SchoolYear, "weekLabels" | "cycleLength">,
): string[] {
  const stored = year.weekLabels;
  if (stored && stored.some((s) => typeof s === "string" && s.trim())) {
    return stored;
  }
  return defaultWeekLabels(year.cycleLength);
}

/** Every cycle length the engine supports, for a picker that cannot invent a
 *  fourth. Re-exported so the app never hard-codes `[1, 2, 3]`. */
export { CYCLE_LENGTHS, DEFAULT_TAUGHT_WEEKDAYS };
export type { CivilDate, CycleLength, HolidayMode, ClosureKind };
