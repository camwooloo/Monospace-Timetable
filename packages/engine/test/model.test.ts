/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE LIFTED MODEL BUILDER — THE RULES THAT COST SOMEBODY SOMETHING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The fixture gate proves our WRITER matches Monospace's, byte for byte, for
 * one model. ⚠️ IT CANNOT PROVE THE MODEL IS RIGHT: both sides are handed the
 * same model, so a builder that got the timetable wrong would produce two
 * identical wrong workbooks and the gate would be delighted.
 *
 * So these are the model builder's own tests, and each one pins a rule whose
 * comment in `buildModel.ts` records a real defect — the export route's
 * history is the specification here.
 */

import { describe, expect, test } from "vitest";

import { buildTimetableModel } from "../src/model/buildModel";
import type { SheetCell, SheetDay } from "../src/lib/timetableSheet";
import {
  FIXTURE_NOW,
  FIXTURE_PASSWORD,
  makeFixtureDocument,
  makeFixtureDocumentPlain,
} from "./fixtures/schoolDocument";

function build(doc = makeFixtureDocument(), now = FIXTURE_NOW) {
  const r = buildTimetableModel({
    document: doc,
    now,
    generatedBy: "Fixture",
    password: FIXTURE_PASSWORD,
  });
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** Every cell of a day set, flattened, for the assertions that only care that
 *  something is or is not present. */
function cellsOf(days: SheetDay[]): SheetCell[] {
  return days.flatMap((d) => d.cells.flatMap((row) => row));
}

describe("which year gets built", () => {
  /**
   * ⚠️⚠️ `years[0]` IS THE SCHOOL'S OLDEST YEAR. CLAUDE.md records five
   * separate readers of this rule having had that bug, so the fixture keeps
   * 2025/26 FIRST in the file specifically so a regression picks it.
   */
  test("picks the year covering today, never the first in the file", () => {
    const doc = makeFixtureDocument();
    expect(doc.years[0].name, "the fixture's trap is still set").toBe("2025/26");
    expect(build(doc).model.calendarName).toBe("2026/27");
  });

  test("an explicit year id wins", () => {
    const r = buildTimetableModel({
      document: makeFixtureDocument(),
      yearId: "y-2526",
      now: FIXTURE_NOW,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model.calendarName).toBe("2025/26");
  });

  test("an unknown year id is refused rather than silently substituted", () => {
    const r = buildTimetableModel({
      document: makeFixtureDocument(),
      yearId: "y-nope",
      now: FIXTURE_NOW,
    });
    expect(r.ok).toBe(false);
  });
});

describe("the shape of the year", () => {
  test("38 teaching weeks, two cycle-week templates, five half-term blocks", () => {
    const { model } = build();
    expect(model.weeks.length).toBe(38);
    expect(model.templateSheets.map((t) => t.name)).toEqual([
      "Week A - Template",
      "Week B - Template",
    ]);
    /* The reference school's five closure runs. */
    expect(model.halfTerms.length).toBe(5);
  });

  /**
   * ⭐ THE PROOF `pause` WAS NEEDED. February runs "(A) Feb 8th" → half term →
   * "(B) Feb 22nd", which only comes out B if the closed week consumed no
   * cycle position. Under `continue` it would come back A.
   */
  test("the cycle resumes where it left off across a half term", () => {
    const { model } = build();
    const before = model.weeks.find((w) => w.name.includes("February 8th"));
    const after = model.weeks.find((w) => w.name.includes("February 22nd"));
    expect(before, "a week beginning 8 February").toBeTruthy();
    expect(after, "a week beginning 22 February").toBeTruthy();
    expect(before!.cycleWeek).not.toBe(after!.cycleWeek);
  });

  /**
   * ⚠️ A PAUSED WEEK HAS NO CYCLE WEEK — it is not week 0 — so the half-term
   * sheet's corner labels are "—" rather than a letter. And a single-week run
   * leaves the block's second half `null`: filled but empty, exactly as in the
   * source workbook.
   */
  test("half-term blocks label paused weeks '—' and leave short runs null", () => {
    const { model } = build();
    for (const block of model.halfTerms) {
      expect(block.leftLabel).toBe("—");
      expect(block.days.length).toBe(10);
    }
    const singleWeekRuns = model.halfTerms.filter((b) =>
      b.days.slice(5).every((d) => d === null),
    );
    expect(singleWeekRuns.length, "February and May are one week each").toBe(2);
  });
});

describe("the day", () => {
  /**
   * ⚠️ `ordinal` IS IDENTITY, `order` IS POSITION. The fixture's Registration
   * row carries ordinal 9 and order 0 precisely so that a builder which
   * dropped `order` prints the day in creation order — right on screen, wrong
   * in the file, which is the worst version of this defect.
   */
  test("prints the day in `order`, not in `ordinal`", () => {
    const { model } = build();
    const monday = model.weeks[0].days[0];
    expect(monday.periods.map((p) => p.ordinal)).toEqual([
      9, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(monday.periods[0].bookable, "Registration is not bookable").toBe(false);
  });
});

describe("what lands in a cell", () => {
  /**
   * ⭐⭐ THE LUNCHTIME CLUB. A booking running 13:20–14:00 lands on "Break 2",
   * a non-teaching row. ⚠️ THE VERSION THAT RETURNED `blocked` ABOVE EVERY
   * OTHER TEST printed the room free at the one moment it was not — the single
   * failure a booking system exists to prevent.
   */
  test("a booking on a non-teaching row still shows", () => {
    const { model } = build();
    const week = model.weeks.find((w) => w.name.includes("January 11th"));
    expect(week, "the week of 11 January").toBeTruthy();
    const texts = cellsOf(week!.days)
      .filter((c) => c.kind === "value")
      .map((c) => (c as { text: string | number }).text);
    expect(texts).toContain("Code Club");
  });

  /** ⚠️ ABSENT PURPOSE PRINTS "Booked" — the room is taken and nothing else is
   *  said. It is NOT the same as "no reason given". */
  test("a booking with no purpose prints 'Booked'", () => {
    const { model } = build();
    const week = model.weeks.find((w) => w.name.includes("January 11th"))!;
    const texts = cellsOf(week.days)
      .filter((c) => c.kind === "value")
      .map((c) => (c as { text: string | number }).text);
    expect(texts).toContain("Booked");
  });

  /**
   * ⭐⭐ THE CLEARED STATE. An override with no text means "the lesson is not
   * running here this week, because it moved". It must print EMPTY and it must
   * be `kind: "cleared"` rather than `"free"` — a free cell IS linked, and
   * linking a cleared one would resurrect the very lesson somebody moved off it
   * the moment Excel recalculated.
   */
  test("a week change with no label is 'cleared', never 'free'", () => {
    const { model } = build();
    const week = model.weeks.find((w) => w.name.includes("January 11th"))!;
    const cleared = cellsOf(week.days).filter((c) => c.kind === "cleared");
    expect(cleared.length, "the fixture's one cleared cell").toBeGreaterThan(0);
  });

  /** ⭐ A move prints in the room it went TO, and carries `origin: "override"`
   *  so it is neither linked to the template nor locked. */
  test("a moved class is marked as an override, not as a lesson", () => {
    const { model } = build();
    const week = model.weeks.find((w) => w.name.includes("January 11th"))!;
    const overrides = cellsOf(week.days).filter(
      (c) => c.kind === "value" && c.origin === "override",
    );
    expect(overrides.length).toBeGreaterThan(0);
    for (const c of overrides) {
      expect(c.locked, "rule three: an ad-hoc note is not the school's timetable").toBe(false);
    }
  });

  /**
   * ⭐⭐ THE OTHER HALF OF THE STATUS RULE. `approved` and `pending` print;
   * `rejected` and `cancelled` do not, and the standing lesson stays showing.
   *
   * ⚠️ A FIXTURE WITH ONLY THE PRINTING HALF WOULD PASS JUST AS HAPPILY IF THE
   * FILTER WERE DELETED — which is how a cancelled booking would start
   * blanking out a room that is actually teaching.
   */
  test("a cancelled booking leaves the standing lesson alone", () => {
    const { model } = build();
    const week = model.weeks.find((w) => w.name.includes("January 11th"))!;
    const texts = cellsOf(week.days)
      .filter((c) => c.kind === "value")
      .map((c) => (c as { text: string | number }).text);
    expect(texts).not.toContain("Cancelled — must not appear");
  });

  /** ⚠️ A TYPED "-" IS A VALUE SOMEBODY CHOSE — "no teacher assigned" — and is
   *  not a blank. It reaches the file as text and gets no colour. */
  test("a typed '-' survives as a value", () => {
    const { model } = build();
    const texts = cellsOf(model.templateSheets[0].days)
      .filter((c) => c.kind === "value")
      .map((c) => (c as { text: string | number }).text);
    expect(texts).toContain("-");
  });
});

describe("the template sheets", () => {
  /**
   * ⭐⭐ THE STANDING WEEK, NOT THAT PARTICULAR WEEK.
   *
   * The fixture's year opens on a WEDNESDAY, so the first teaching week has an
   * untaught Monday and Tuesday. ⚠️ IF THE TEMPLATE INHERITED THAT, two entire
   * days would be blocked and empty on it — and under linking every week of
   * that cycle writes `IF(template!D8="","",template!D8)` over its Monday, so
   * two days evaluate to "" across half the workbook. `daysAlign()` cannot
   * catch it: the ROW SHAPE matches, it is the CONTENT that was week-specific.
   */
  test("a template's Monday is not blocked by the first week's calendar", () => {
    const { model } = build();
    for (const t of model.templateSheets) {
      const monday = t.days[0];
      const blocked = monday.cells.flat().filter((c) => c.kind === "blocked");
      const teachingRows = monday.periods.filter((p) => p.bookable).length;
      expect(
        blocked.length,
        `${t.name}: Monday must carry the standing timetable, not week one's closure`,
      ).toBeLessThan(teachingRows * monday.cells[0].length);
      /* And it really does hold lessons. */
      expect(
        monday.cells.flat().some((c) => c.kind === "value"),
        `${t.name}: Monday holds standing lessons`,
      ).toBe(true);
    }
  });

  /** ⚠️ NO OCCURRENCES AND NO OVERRIDES ON A TEMPLATE. Folding in the one-off
   *  bookings that happened to land in that particular week would make the
   *  "template" a week sheet with a misleading name. */
  test("a template carries no bookings and no week changes", () => {
    const { model } = build();
    const texts = model.templateSheets.flatMap((t) =>
      cellsOf(t.days)
        .filter((c) => c.kind === "value")
        .map((c) => (c as { text: string | number }).text),
    );
    for (const stray of ["Code Club", "Booked", "GCSE speaking exams", "Mock exam"]) {
      expect(texts, `"${stray}" belongs to a week, not to the standing plan`).not.toContain(stray);
    }
  });
});

describe("what a year with no weekLabels is called", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  ⭐⭐ THE PATH THE FIXTURE GATE CANNOT SEE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `weekLabels` is OPTIONAL, and absent is the state of every year an app
   * creates until somebody types into the label boxes — but
   * `school.fixture.json` sets `["Week A", "Week B"]` explicitly, so the
   * byte-for-byte gate compares the one path a brand new school never takes.
   *
   * ⚠️ AND THAT PATH WAS WRONG. `buildModel` read `year.weekLabels ?? []`,
   * whose empty array reaches `cycleWeekLabel`'s `Week N+1` fallback. Driving
   * the built tool in a browser — add a year, add rooms, fill the grid, press
   * Export — produced a workbook holding `Week 1 - Template` and
   * `(1) September 7th - 11th`, while the app's cycle picker, its tab strip
   * and its own export summary all said Week A / Week B. `yearWeekLabels()` is
   * the single answer now; this pins it from the model's side.
   */
  const stripLabels = (doc: ReturnType<typeof makeFixtureDocument>) => ({
    ...doc,
    years: doc.years.map((y) => ({ ...y, weekLabels: undefined })),
  });

  test("an absent weekLabels prints Week A / Week B, never Week 1 / Week 2", () => {
    const { model } = build(stripLabels(makeFixtureDocument()));
    expect(model.templateSheets.map((t) => t.name)).toEqual([
      "Week A - Template",
      "Week B - Template",
    ]);
    expect(model.weeks[0].name.startsWith("(A) ")).toBe(true);
    expect(model.weeks[1].name.startsWith("(B) ")).toBe(true);
    /* B1 — the corner both grids and the workbook print. */
    expect(model.templateSheets[0].bandLabel).toBe("WEEK A");
  });

  /** ⚠️ AN ARRAY OF BLANKS IS ABSENT TOO. Clearing both label boxes in the app
   *  stores `["", ""]`, which has a length and no names in it. */
  test("weekLabels of all blanks is treated as absent", () => {
    const doc = makeFixtureDocument();
    const blanked = {
      ...doc,
      years: doc.years.map((y) => ({ ...y, weekLabels: ["", ""] })),
    };
    expect(build(blanked).model.templateSheets.map((t) => t.name)).toEqual([
      "Week A - Template",
      "Week B - Template",
    ]);
  });

  /** ⭐ AND A SCHOOL THAT DID NAME ITS WEEKS KEEPS ITS OWN WORDS. */
  test("a school's own names are never overwritten", () => {
    const doc = makeFixtureDocument();
    const named = {
      ...doc,
      years: doc.years.map((y) => ({ ...y, weekLabels: ["Timetable 1", "Timetable 2"] })),
    };
    expect(build(named).model.templateSheets.map((t) => t.name)).toEqual([
      "Timetable 1 - Template",
      "Timetable 2 - Template",
    ]);
  });
});

describe("the options", () => {
  test("with linking on, aligned weeks point at their template's FINAL name", () => {
    const { model } = build();
    const names = new Set(model.templateSheets.map((t) => t.name));
    const linked = model.weeks.filter((w) => w.linkTo);
    expect(linked.length).toBe(model.weeks.length);
    for (const w of linked) {
      expect(names, `${w.name} links to a sheet that exists`).toContain(w.linkTo);
    }
  });

  test("with every option off, nothing is linked or hidden", () => {
    const r = buildTimetableModel({
      document: makeFixtureDocumentPlain(),
      now: FIXTURE_NOW,
      generatedBy: "Fixture",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model.weeks.some((w) => w.linkTo)).toBe(false);
    expect(r.model.weeks.some((w) => w.hidden)).toBe(false);
    /* ⭐ AND NO CONDITIONAL-FORMATTING RULES. Nothing in an unlinked workbook
       can change after it is written, so the static fills are already right
       and every rule would be weight with no job. */
    expect(r.model.classCodes).toEqual([]);
  });

  /** ⭐ HIDDEN ONCE FULLY ENDED, against the school's own clock. */
  test("hideEndedWeeks folds away only weeks that are over", () => {
    const { model } = build();
    const hidden = model.weeks.filter((w) => w.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.length).toBeLessThan(model.weeks.length);
    /* Every hidden week begins before the Monday of the frozen clock. */
    const january = model.weeks.findIndex((w) => w.name.includes("January 11th"));
    expect(january).toBeGreaterThan(0);
    expect(model.weeks.slice(january).every((w) => !w.hidden)).toBe(true);
  });

  /**
   * ⭐⭐ THE RETIRED ROOM. `cellRights` answers `retired` above every question
   * about what is in a cell, so the WHOLE column locks — free periods
   * included. ⚠️ AND THE FILE HAS TO SAY SO: the option's own sentence
   * ("the free periods are left editable") is false about that column, and a
   * clause in a switch's hint is not in front of the person who opens the file
   * next term.
   */
  test("a room out of service is locked whole, and the workbook names it", () => {
    const { model } = build();
    const note = model.notes.optionNotes?.find((n) => n.includes("N26"));
    expect(note, "the option note names the retired room").toBeTruthy();
    expect(note).toContain("out of service");

    const retiredColumn = model.rooms.findIndex((r) => r.name === "N26");
    expect(retiredColumn).toBeGreaterThanOrEqual(0);
    const week = model.weeks.find((w) => w.name.includes("January 11th"))!;
    for (const day of week.days) {
      for (const row of day.cells) {
        expect(row[retiredColumn].locked, "every cell of a retired column").toBe(true);
      }
    }
  });

  /** ⚠️ THE COLUMN STAYS. A grid is read POSITIONALLY, so dropping it would
   *  move every room to the right of it. */
  test("a retired room keeps its place in the column order", () => {
    const { model } = build();
    expect(model.rooms.map((r) => r.name)).toEqual([
      "N21",
      "N22",
      "N23",
      "N24",
      "N25",
      "N26",
    ]);
  });
});

describe("the room facts", () => {
  /**
   * ⚠️ `numericValue()` AND NOT `Number()`. `Number("0x10")` is 16, so a room
   * whose telephone reads `0x10` would print the wrong extension. A school
   * types what it types.
   */
  test("'0x10' stays text while '2101' becomes a number", () => {
    const { model } = build();
    const phone = model.fieldDefs.find((f) => f.label === "Telephone")!.id;
    const byName = new Map(model.rooms.map((r) => [r.name, r.fields]));
    expect(byName.get("N23")![phone]).toBe("0x10");
    expect(byName.get("N21")![phone]).toBe(2101);
  });

  /** ⚠️ `null` MEANS PRINT NOTHING and is NOT "-": a school types "-" to mean
   *  "no teacher assigned", which is a value somebody chose. */
  test("a null value prints nothing while a typed '-' survives", () => {
    const doc = makeFixtureDocument();
    doc.roomSheets[0].rooms[0].values = { "f-teacher": null, "f-pcs": "30" };
    const { model } = build(doc);
    const teacher = model.fieldDefs.find((f) => f.label === "Teacher")!.id;
    expect(model.rooms[0].fields[teacher]).toBeUndefined();
    /* N23's "-" is untouched. */
    expect(model.rooms[2].fields[teacher]).toBe("-");
  });
});

describe("what the info sheet says", () => {
  /**
   * ⚠️ `complete` MEANS "THIS EXPORT STOPPED EARLY" and nothing else. An
   * option that fell short is an `optionNote`; filed as a reason it would tell
   * a school its year was missing data that is all there — and would move the
   * tab the workbook opens on.
   */
  test("a clean build is complete, with the retired-room note as an OPTION note", () => {
    const { model } = build();
    expect(model.notes.complete).toBe(true);
    expect(model.notes.reasons).toEqual([]);
    expect(model.notes.optionNotes?.length).toBeGreaterThan(0);
  });

  test("carries the school's timezone and holiday mode", () => {
    const { model } = build();
    expect(model.notes.timezone).toBe("Europe/London");
    expect(model.notes.holidayMode).toBe("pause");
  });

  /** ⚠️ THE PASSWORD IS NEVER ON `notes`, which is the shape the info sheet is
   *  printed from. A password one field away from a sheet that gets printed is
   *  a password that ends up printed. */
  test("the password is on the model and never on the notes", () => {
    const { model } = build();
    expect(model.password).toBe(FIXTURE_PASSWORD);
    expect(JSON.stringify(model.notes)).not.toContain(FIXTURE_PASSWORD);
  });

  test("the accent is resolved, never passed through raw", () => {
    const doc = makeFixtureDocument();
    doc.school.accent = "not a colour";
    const { model } = build(doc);
    expect(model.accent).toMatch(/^#[0-9a-f]{6}$/);
  });
});
