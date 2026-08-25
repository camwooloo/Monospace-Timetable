/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ CAN MONOSPACE STILL READ WHAT THIS TOOL WRITES?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A school can carry a year either way: out of Monospace into this tool to
 * build a workbook, or out of this tool into Monospace when they stop being a
 * school with a spreadsheet. The file in the middle is `SchoolDocument`, and
 * the two programs hold SEPARATE copies of the format —
 * `src/model/document.ts` here, `convex/lib/timetableDocument.ts` there.
 *
 * ⚠️ SO NOTHING MECHANICAL STOPS THEM DRIFTING. `provenance.test.ts` beside
 * this pins the nine files that ARE copies, byte for byte; the format is not
 * one of them yet. This test is the substitute: it takes a document this
 * tool's own fixture produces and puts it through MONOSPACE'S reader, which is
 * the thing that will actually refuse a school's file.
 *
 * A field renamed on one side and not the other, an optional turned required,
 * a constraint tightened — all of them land here as a red test rather than as
 * an admin being told "that file is not a timetable file".
 *
 * ⚠️ SKIPPED WITHOUT A MONOSPACE CHECKOUT, like `provenance.test.ts`, and for
 * the same reason: it is one of the two tests that genuinely cannot run
 * without one. ⭐ THAT MEANS CI RUNS NEITHER — neither repository provides the
 * other's source — so this is a LOCAL gate and somebody has to actually run
 * `npm test` here with the two repositories as siblings. Say so when changing
 * either format.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { haveMonospaceSource, monospaceRoot } from "../gate/reference";
import { makeFixtureDocument } from "./fixtures/schoolDocument";
import { SCHOOL_DOCUMENT_VERSION, readSchoolDocument } from "../src/model/document";

const readerPath = () =>
  resolve(monospaceRoot(), "convex/lib/timetableDocument.ts");

/** Monospace's half of the format, if this machine has a checkout of it. */
const reachable = () => haveMonospaceSource() && existsSync(readerPath());

describe.skipIf(!reachable())("Monospace reads what this tool writes", () => {
  /* Imported through the path rather than a package specifier, because
     Monospace is not a dependency of anything here — it is a sibling checkout
     that may or may not exist. `vite` resolves the absolute path fine and the
     module is pure (its only imports are `./timetable` and `./timetableSheet`,
     both of which live beside it). */
  const load = async () =>
    (await import(/* @vite-ignore */ readerPath())) as {
      readSchoolDocumentStrict: (input: unknown) => {
        ok: boolean;
        issue?: { code: string; message: string; yearName?: string };
        document?: unknown;
      };
      MONOSPACE_DOCUMENT_VERSION: number;
    };

  test("the two builds agree about the format version", async () => {
    const { MONOSPACE_DOCUMENT_VERSION } = await load();
    expect(
      MONOSPACE_DOCUMENT_VERSION,
      "Monospace reads a different format version from the one this tool writes. " +
        "That is not a warning: Monospace refuses any version but its own BY NAME, " +
        "so every file this tool saves would be rejected by the website.",
    ).toBe(SCHOOL_DOCUMENT_VERSION);
  });

  test("a document this tool produces is accepted whole", async () => {
    const { readSchoolDocumentStrict } = await load();
    const doc = makeFixtureDocument();
    /* Round-tripped through JSON first, because that is what actually crosses
       between the two programs — a `Map`, a `Date` or an `undefined` that
       survives in memory here would not survive the file. */
    const result = readSchoolDocumentStrict(JSON.parse(JSON.stringify(doc)));

    expect(
      result.ok,
      result.ok
        ? ""
        : `Monospace refused this tool's own fixture: [${result.issue?.code}] ${result.issue?.message}`,
    ).toBe(true);
  });

  test("every year in the fixture survives, not just the first", async () => {
    const { readSchoolDocumentStrict } = await load();
    const doc = makeFixtureDocument();
    const result = readSchoolDocumentStrict(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    const read = result.document as { years: unknown[] };
    /* ⚠️ COUNTED, because a reader that silently kept only `years[0]` would
       pass every other assertion here — and `[0]` is the school's OLDEST year,
       which is the bug this codebase has recorded five separate readers
       having. */
    expect(read.years).toHaveLength(doc.years.length);
  });

  test("a cleared week change stays cleared", async () => {
    const { readSchoolDocumentStrict } = await load();
    const doc = makeFixtureDocument();
    const clearedHere = doc.years
      .flatMap((y) => y.weekChanges ?? [])
      .filter((w) => w.label === undefined).length;
    expect(
      clearedHere,
      "the fixture no longer contains a CLEARED week change, so this test proves nothing — put one back",
    ).toBeGreaterThan(0);

    const result = readSchoolDocumentStrict(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    const read = result.document as {
      years: Array<{ weekChanges?: Array<{ label?: string }> }>;
    };
    const clearedThere = read.years
      .flatMap((y) => y.weekChanges ?? [])
      .filter((w) => w.label === undefined).length;

    /* ⚠️⚠️ THE ONE THAT MATTERS MOST. An absent label means "this lesson is not
       running here this week, because it moved". If Monospace read it back as
       an empty STRING the cell would stop being cleared and start being a
       lesson called nothing — and the workbook would link it to the template,
       resurrecting on the next recalculation the very lesson somebody moved
       off it. */
    expect(
      clearedThere,
      "a cleared week change (absent label) did not survive Monospace's reader as absent",
    ).toBe(clearedHere);
  });

  /* ══════════════════════════════════════════════════════════════════════
     ⭐⭐ AND THE OTHER DIRECTION, WHICH IS THE ONE THAT ACTUALLY SHIPS FILES

     The tests above prove Monospace can READ what this tool writes. This one
     proves the tool can read what MONOSPACE writes — which is the direction a
     school uses first ("take data I've already input into monospace and put it
     into the spreadsheet"), and the direction where a mapping bug produces a
     file that downloads perfectly and refuses to open.

     The round trip is real rather than synthetic: the fixture is turned into
     the shape Monospace's gather hands its mapper, run through that mapper,
     JSON-round-tripped, and read back by THIS package's own reader.
     ══════════════════════════════════════════════════════════════════════ */
  const loadMapper = async () =>
    (await import(/* @vite-ignore */ resolve(monospaceRoot(), "convex/lib/timetableTransfer.ts"))) as {
      documentFromMonospace: (parts: unknown) => {
        document: unknown;
        derivedValues: number;
        orphanedCells: number;
      };
    };

  /** The fixture, dressed as the rows Monospace would have gathered. */
  function asMonospaceParts() {
    const doc = makeFixtureDocument();
    const year = doc.years[1];
    const sheet = doc.roomSheets.find((s) => s.id === year.roomSheetId) ?? doc.roomSheets[0];
    return {
      doc,
      year,
      sheet,
      parts: {
        schoolName: doc.school.name,
        accent: doc.school.accent,
        exportOptions: doc.export,
        sheet: {
          name: sheet.name,
          fields: sheet.fields.map((f) => ({ id: f.id, label: f.label, kind: f.kind })),
          rooms: sheet.rooms.map((r) => ({
            id: r.id,
            name: r.name,
            active: r.active !== false,
            values: Object.entries(r.values ?? {}).map(([fieldId, value]) => ({
              fieldId,
              value,
              derived: false,
            })),
          })),
        },
        calendar: {
          name: year.name,
          timezone: year.timezone,
          yearStart: year.start,
          yearEnd: year.end,
          cycleLength: year.cycleLength,
          anchorMonday: year.anchorMonday,
          anchorWeekIndex: year.anchorWeekIndex,
          holidayMode: year.holidayMode,
          /* `bookingCalendars.weekLabels` is REQUIRED, so Monospace always has
             a value here even when the tool's file omitted one. */
          weekLabels: year.weekLabels ?? ["Week A", "Week B"],
          taughtWeekdays: year.taughtWeekdays ?? [1, 2, 3, 4, 5],
        },
        periods: year.periods,
        closures: (year.closures ?? []).map((c) => ({
          label: c.label,
          kind: c.kind,
          start: c.start,
          end: c.end,
        })),
        /* Every Monday, with the pins on the rows that carry them — the shape
           `bookingWeeks` has. */
        weeks: (year.pins ?? []).map((p) => ({
          monday: p.monday,
          pinned: true,
          pinnedCycleWeek: p.cycleWeek,
          pinnedTeaching: p.isTeachingWeek,
          pinReason: p.reason,
          cycleWeek: p.cycleWeek,
        })),
        templates: (year.templates ?? []).map((t) => ({
          roomId: t.roomId,
          cycleWeek: t.cycleWeek,
          weekday: t.weekday,
          periodOrdinal: t.periodOrdinal,
          label: t.label,
          note: t.note,
        })),
        weekChanges: (year.weekChanges ?? []).map((w) => ({
          roomId: w.roomId,
          monday: w.monday,
          weekday: w.weekday,
          periodOrdinal: w.periodOrdinal,
          label: w.label,
          note: w.note,
        })),
      },
    };
  }

  test("a document Monospace writes opens in this tool", async () => {
    const { documentFromMonospace } = await loadMapper();
    const { parts } = asMonospaceParts();
    const built = documentFromMonospace(parts);

    /* ⚠️ NO ORPHANS. A lesson naming a room the file does not contain makes the
       whole document unopenable — the reader refuses it — so a non-zero count
       here is a mapping bug, not a warning. */
    expect(built.orphanedCells, "lessons pointed at rooms not in the file").toBe(0);

    const onDisk = JSON.parse(JSON.stringify(built.document));
    const read = readSchoolDocument(onDisk);
    expect(
      read.ok,
      read.ok ? "" : `this tool refused Monospace's own file: ${read.issue.message}`,
    ).toBe(true);
    if (!read.ok) return;

    /* ⚠️ AND NOTHING UNRECOGNISED. `unknownKeys` is how the tool reports a
       field it would DROP on the next save — so a non-empty list here is
       Monospace writing something that silently disappears the first time a
       school opens the file and presses Save. */
    expect(read.unknownKeys, "Monospace wrote keys this tool would drop on save").toEqual([]);
  });

  test("the whole timetable survives the crossing, cell for cell", async () => {
    const { documentFromMonospace } = await loadMapper();
    const { year, sheet, parts } = asMonospaceParts();
    const built = documentFromMonospace(parts);
    const read = readSchoolDocument(JSON.parse(JSON.stringify(built.document)));
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const out = read.document.years[0];
    expect(out.templates ?? []).toHaveLength(year.templates?.length ?? 0);
    expect(out.weekChanges ?? []).toHaveLength(year.weekChanges?.length ?? 0);
    expect(out.closures ?? []).toHaveLength(year.closures?.length ?? 0);
    expect(out.periods).toHaveLength(year.periods.length);
    expect(read.document.roomSheets[0].rooms).toHaveLength(sheet.rooms.length);

    /* ⚠️ REFERENTIAL INTEGRITY, checked rather than assumed: the ids are
       MINTED by the mapper, so a lesson can only find its room if the minting
       and the translation agree. */
    const roomIds = new Set(read.document.roomSheets[0].rooms.map((r) => r.id));
    for (const c of out.templates ?? []) {
      expect(roomIds.has(c.roomId), `lesson ${c.id} names a room that is not in the file`).toBe(true);
    }
    for (const w of out.weekChanges ?? []) {
      expect(roomIds.has(w.roomId), `change ${w.id} names a room that is not in the file`).toBe(true);
    }
    expect(out.roomSheetId).toBe(read.document.roomSheets[0].id);

    /* ⚠️ NO CONVEX IDS IN THE FILE. The format's own rule, and the reason the
       mapper mints positional ones. A `bookableResources` id is 32 chars of
       base32; a minted one is "room-3". */
    for (const r of read.document.roomSheets[0].rooms) {
      expect(r.id).toMatch(/^room-\d+$/);
    }

    /* The cleared week change, again, on this side of the crossing. */
    const clearedIn = (year.weekChanges ?? []).filter((w) => w.label === undefined).length;
    const clearedOut = (out.weekChanges ?? []).filter((w) => w.label === undefined).length;
    expect(clearedOut, "a cleared week change did not survive the crossing").toBe(clearedIn);
  });

  test("a pin on a CLOSED week keeps its stored number, not the resolved null", async () => {
    const { documentFromMonospace } = await loadMapper();
    const { parts } = asMonospaceParts();
    /* The week is not taught, so Monospace resolves `cycleWeek: null` — and
       under `pause` the pin still reseeds the running count. Dropping it, or
       writing 0 for it, rotates every week after it on re-import. */
    const p = { ...parts, weeks: [{
      monday: "2027-02-15",
      pinned: true,
      pinnedCycleWeek: 1,
      pinnedTeaching: false,
      pinReason: "half term",
      cycleWeek: null,
    }] };
    const built = documentFromMonospace(p);
    const pins = (built.document as { years: Array<{ pins?: Array<{ cycleWeek: number; isTeachingWeek?: boolean }> }> }).years[0].pins ?? [];
    expect(pins).toHaveLength(1);
    expect(pins[0].cycleWeek, "the STORED pin number was lost").toBe(1);
    expect(pins[0].isTeachingWeek).toBe(false);
  });

  test("a pinned week whose stored number did not arrive is a refusal, not a guess", async () => {
    const { documentFromMonospace } = await loadMapper();
    const { parts } = asMonospaceParts();
    /* ⚠️ THE STATE A SPLIT DEPLOY PUTS THE APP IN. Monospace ships its Next
       front-end on push and its Convex backend separately, so the route can be
       live against a `yearPreview` that predates `pinnedCycleWeek`. The field
       then arrives `undefined` for every pin. The old fallback wrote
       `cycleWeek ?? 0`, which is `0` for any pin on a NON-TEACHING week —
       exactly the pins that reseed the cycle under `pause`. */
    const built = documentFromMonospace({
      ...parts,
      weeks: [
        { monday: "2027-02-15", pinned: true, cycleWeek: null, pinReason: "snow" },
        { monday: "2027-02-22", pinned: true, pinnedCycleWeek: 1, cycleWeek: 1 },
      ],
    });
    expect(built.pinsUnreadable, "the unreadable pin was not counted").toBe(1);
    const pins =
      (built.document as { years: Array<{ pins?: Array<{ monday: string }> }> }).years[0].pins ?? [];
    expect(pins.map((p) => p.monday), "the unreadable pin must not be guessed at").toEqual([
      "2027-02-22",
    ]);
  });

  test("blank week labels are omitted, so both sides fall back to the same names", async () => {
    const { documentFromMonospace } = await loadMapper();
    const { parts } = asMonospaceParts();
    /* `bookingCalendars.weekLabels` is required, so a school that never named
       its weeks can still have `["", ""]` stored. Written out verbatim, this
       tool would read them as ABSENT and show "Week A"/"Week B" while
       Monospace showed two blanks — the same year, named two ways. */
    const built = documentFromMonospace({
      ...parts,
      calendar: { ...parts.calendar, weekLabels: ["", ""] },
    });
    const y = (built.document as { years: Array<{ weekLabels?: string[] }> }).years[0];
    expect(y.weekLabels).toBeUndefined();
  });
});
