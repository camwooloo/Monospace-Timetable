/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE ROTA → ITS PERIODS — the document-level half
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `rota.test.ts` proves the FILLER against the reference workbook, given
 * frames. This proves the step before it: turning a saved document and one
 * `SchoolRota` into those frames — which year, which weeks, and what a closed
 * week is called.
 */

import { describe, expect, test } from "vitest";

import { SCHOOL_DOCUMENT_VERSION, type SchoolDocument } from "../src/model/document";
import { buildRota } from "../src/model/rotaBuild";
import type { SchoolRota } from "../src/model/rota";

const ROTA: SchoolRota = {
  id: "rota-1",
  name: "IT Room Checking Rota",
  cadence: "weekly",
  quota: 2,
  source: "year",
  itemNoun: "Room",
  columns: [{ id: "by", label: "Checked By", kind: "person" }],
  items: [
    { id: "a", code: "N21" },
    { id: "b", code: "N24" },
    { id: "c", code: "N36" },
    { id: "d", code: "H22", weight: 0.5 },
    { id: "e", code: "T11", weight: 0.5 },
  ],
};

const YEAR = {
  id: "y1",
  name: "2026/27",
  timezone: "Europe/London",
  start: "2026-09-07",
  end: "2027-07-16",
  cycleLength: 2 as const,
  anchorMonday: "2026-09-07",
  anchorWeekIndex: 0,
  holidayMode: "pause" as const,
  weekLabels: ["Week A", "Week B"],
  roomSheetId: "rs1",
  /* ⚠️ REQUIRED BY `SchoolYear` AND EMPTY ON PURPOSE. A rota needs the year's
     WEEKS, never its periods — which is what makes a rota sellable to a school
     that has entered no timetable at all. `npm test` would not have caught
     this missing: vitest strips types with esbuild and never typechecks, so
     `npm run typecheck` is the gate. It was green here on an uncompilable
     file, exactly as it once was on `interop.test.ts`. */
  periods: [],
  closures: [
    { id: "c1", label: "Half Term", kind: "holiday" as const, start: "2026-10-26", end: "2026-10-30" },
    { id: "c2", label: "Christmas", kind: "holiday" as const, start: "2026-12-21", end: "2027-01-01" },
    { id: "c3", label: "INSET", kind: "inset" as const, start: "2026-12-18", end: "2026-12-18" },
  ],
};

const docWith = (over: Partial<SchoolDocument> = {}): SchoolDocument => ({
  formatVersion: SCHOOL_DOCUMENT_VERSION,
  school: { name: "Ashgrove High School" },
  roomSheets: [{ id: "rs1", name: "IT Rooms", fields: [], rooms: [] }],
  years: [YEAR],
  rotas: [ROTA],
  ...over,
});

const at = (d: SchoolDocument, r: SchoolRota, now = "2026-11-01") => {
  const out = buildRota(d, r, now);
  if (!out.ok) throw new Error(`refused: ${out.error}`);
  return out;
};

describe("which year it follows", () => {
  test("an unpinned rota takes the year we are in, never years[0]", () => {
    /* ⚠️ THE `years[0]` BUG, GUARDED. The file's order is the school's own —
       creation order in practice — so the OLDEST year sits at [0]. Monospace
       records five separate readers having had exactly this. */
    const older = { ...YEAR, id: "y0", name: "2025/26", start: "2025-09-01", end: "2026-07-17" };
    const d = docWith({ years: [older, YEAR] });
    expect(at(d, ROTA).year?.name).toBe("2026/27");
  });

  test("a pinned rota keeps printing the year it names", () => {
    const older = { ...YEAR, id: "y0", name: "2025/26", start: "2025-09-01", end: "2026-07-17" };
    const d = docWith({ years: [older, YEAR] });
    expect(at(d, { ...ROTA, yearId: "y0" }).year?.name).toBe("2025/26");
  });

  test("a pin to a year that has been deleted refuses rather than guessing", () => {
    const out = buildRota(docWith(), { ...ROTA, yearId: "gone" }, "2026-11-01");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("not in this file");
  });

  test("following the year with no years at all sends them somewhere", () => {
    const out = buildRota(docWith({ years: [] }), ROTA, "2026-11-01");
    expect(out.ok).toBe(false);
    /* ⚠️ THE REFUSAL NAMES BOTH WAYS OUT — add a year, or give the rota its
       own dates. A rota is sellable to a school with no timetable at all, so
       "add an academic year" alone would be a dead end. */
    if (!out.ok) {
      expect(out.error).toContain("Timetable tab");
      expect(out.error).toContain("own dates");
    }
  });
});

describe("a closed week is named by the closure that closed it", () => {
  test("Half Term and Christmas, not “No timetable”", () => {
    const built = at(docWith(), ROTA);
    const byIndex = new Map(built.periods.map((p) => [p.index, p]));
    expect(byIndex.get(8)?.label).toBe("Half Term");
    expect(byIndex.get(8)?.teaching).toBe(false);
    expect(byIndex.get(16)?.label).toBe("Christmas");
  });

  test("the longest overlap wins, so an INSET day does not name Christmas week", () => {
    /* ⚠️ THE FIRST MATCH WOULD BE WRONG. Week 16 begins 2026-12-21 and the
       INSET is the Friday before it — but a school that put an INSET INSIDE a
       holiday week would otherwise have the week called "INSET", which reads
       as "the week we came back". */
    const built = at(docWith(), ROTA);
    const inset = built.periods.find((p) => p.start === "2026-12-14");
    expect(inset?.label).toBe("Week B");
    expect(built.periods.find((p) => p.start === "2026-12-21")?.label).toBe("Christmas");
  });

  test("a teaching week keeps the cycle label it already had", () => {
    const built = at(docWith(), ROTA);
    expect(built.periods[0].label).toBe("Week A");
    expect(built.periods[1].label).toBe("Week B");
  });
});

describe("its own dates", () => {
  test("a rota can run with no academic year in the file at all", () => {
    const d = docWith({ years: [] });
    const own: SchoolRota = { ...ROTA, source: "own", start: "2026-09-09", end: "2026-09-30" };
    const built = at(d, own);
    /* The printed column is always a Monday, even though the 9th is a
       Wednesday. */
    expect(built.periods.map((p) => p.start)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
    expect(built.year).toBeNull();
  });

  test("no dates refuses, and says which two are missing", () => {
    const out = buildRota(docWith({ years: [] }), { ...ROTA, source: "own" }, "2026-11-01");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("start and an end");
  });
});

describe("nothing to schedule", () => {
  test("an empty list refuses in the rota's own noun", () => {
    const out = buildRota(docWith(), { ...ROTA, items: [] }, "2026-11-01");
    expect(out.ok).toBe(false);
    /* ⚠️ "room", not "item" — the refusal is read by somebody who has just
       named the thing, and a second vocabulary for it reads as a different
       screen's error leaking through. */
    if (!out.ok) expect(out.error).toContain("room");
  });

  test("a list of retired items counts as empty", () => {
    const items = ROTA.items.map((i) => ({ ...i, active: false }));
    const out = buildRota(docWith(), { ...ROTA, items }, "2026-11-01");
    expect(out.ok).toBe(false);
  });
});

describe("closed weeks on and off", () => {
  test("on by default — the holiday takes its turn, as the reference file does", () => {
    const built = at(docWith(), ROTA);
    expect(built.periods.find((p) => p.index === 8)?.slots.length).toBe(2);
    expect(built.note).toBeNull();
  });

  test("off — the row survives, names nobody, and the count is reported", () => {
    const built = at(docWith(), { ...ROTA, runThroughClosures: false });
    const eight = built.periods.find((p) => p.index === 8);
    expect(eight?.slots).toEqual([]);
    expect(eight?.label).toBe("Half Term");
    expect(built.note).toContain("keep their rows");
  });
});

describe("cadence", () => {
  test("fortnightly halves the rows and stays on the week grid", () => {
    const weekly = at(docWith(), ROTA).periods;
    const fortnightly = at(docWith(), { ...ROTA, cadence: "fortnightly" }).periods;
    expect(fortnightly.length).toBe(Math.ceil(weekly.length / 2));
    expect(fortnightly[1].start).toBe(weekly[2].start);
  });
});
