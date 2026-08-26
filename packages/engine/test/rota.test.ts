/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ROTA FILLER — against the real workbook it was specified from
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `IT_Room_Checking_Rota_2627_v2.xlsx` is a real school's real rota, and the
 * cases below are lifted from it rather than invented: fifteen turns' worth of
 * items, two per week, wrapping mid-week, running through the holidays.
 *
 * ⚠️ THE WRAP IS THE ONE THAT MATTERS. That workbook's week 8 reads
 * "T21 + T22" then "N21" — the list ran out mid-week and carried straight on
 * from the top. A filler that reset its cursor each period would give every
 * week the same first item and look perfectly plausible doing it.
 */

import { describe, expect, test } from "vitest";

import { addDays } from "../src/lib/timetable";
import {
  fillRota,
  groupingsLine,
  ownFrames,
  yearFrames,
  type RotaFrame,
  type RotaItem,
} from "../src/model/rota";

/** The reference workbook's rooms, in its own order, with its own smalls. */
const ROOMS: RotaItem[] = [
  { id: "n21", code: "N21" },
  { id: "n24", code: "N24" },
  { id: "n36", code: "N36" },
  { id: "n11", code: "N11", weight: 0.5 },
  { id: "a4", code: "A4", weight: 0.5 },
  { id: "m13", code: "M13" },
  { id: "m25", code: "M25" },
  { id: "m26", code: "M26" },
  { id: "h24", code: "H24" },
  { id: "h25", code: "H25" },
  { id: "h22", code: "H22", weight: 0.5 },
  { id: "t11", code: "T11", weight: 0.5 },
  { id: "g15", code: "G15" },
  { id: "g21", code: "G21" },
  { id: "s21", code: "S21" },
  { id: "t12", code: "T12" },
  { id: "t21", code: "T21", weight: 0.5 },
  { id: "t22", code: "T22", weight: 0.5 },
];

/* ⚠️ REAL MONDAYS, walked with the engine's own date arithmetic. An earlier
   draft built them as `2026-09-${7 + i * 7}` and produced "2026-09-35" from the
   fifth week on — which the filler passed straight through, because a frame's
   `start` is an opaque label to it. The dates only matter where a test reads
   them, but a fixture that contains an impossible date is a fixture that will
   eventually be believed. */
const weeks = (n: number, teaching = true): RotaFrame[] =>
  Array.from({ length: n }, (_, i) => ({
    start: addDays("2026-09-07", i * 7)!,
    label: i % 2 === 0 ? "Week A" : "Week B",
    cycleWeek: i % 2,
    teaching,
  }));

const rows = (periods: ReturnType<typeof fillRota>): string[][] =>
  periods.map((p) => p.slots.map((s) => s.label));

describe("the filler reproduces the reference workbook", () => {
  test("two rooms a week, with the smalls sharing a turn", () => {
    const out = fillRota(weeks(8), ROOMS, 2, true);

    /* Straight off the workbook, weeks 1-8. The pairs fall out of the weights
       and the list order — nothing here names a partner. */
    expect(rows(out)).toEqual([
      ["N21", "N24"],
      ["N36", "N11 + A4"],
      ["M13", "M25"],
      ["M26", "H24"],
      ["H25", "H22 + T11"],
      ["G15", "G21"],
      ["S21", "T12"],
      ["T21 + T22", "N21"],
    ]);
  });

  test("the cursor wraps mid-period rather than restarting", () => {
    const out = fillRota(weeks(9), ROOMS, 2, true);
    /* ⚠️ Week 8's second slot is N21 — the top of the list — and week 9 then
       continues N24, N36. A per-period reset would put N21 first in week 9. */
    expect(rows(out)[7]).toEqual(["T21 + T22", "N21"]);
    expect(rows(out)[8]).toEqual(["N24", "N36"]);
  });

  test("fifteen turns means the cycle repeats every seven and a half weeks", () => {
    const out = fillRota(weeks(16), ROOMS, 2, true);
    /* 15 turns at 2 a week: week 1 slot 1 comes round again at week 8 slot 2,
       and again at week 16 slot 1. */
    expect(rows(out)[0][0]).toBe("N21");
    expect(rows(out)[7][1]).toBe("N21");
    expect(rows(out)[15][0]).toBe("N21");
  });

  test("the groupings line is derived, not typed", () => {
    const out = fillRota(weeks(8), ROOMS, 2, true);
    /* The workbook's third row says exactly this, and said it by hand — which
       is why it could disagree with the rota underneath it. */
    expect(groupingsLine(out)).toBe("N11 + A4,  H22 + T11,  T21 + T22");
  });
});

describe("closed weeks", () => {
  const mixed: RotaFrame[] = [
    { start: "2026-09-07", label: "Week A", cycleWeek: 0, teaching: true },
    { start: "2026-10-26", label: "Half Term", cycleWeek: null, teaching: false },
    { start: "2026-11-02", label: "Week B", cycleWeek: 1, teaching: true },
  ];

  test("run through them by default, as the reference workbook does", () => {
    const out = fillRota(mixed, ROOMS, 2, true);
    expect(out[1].slots.length).toBe(2);
    /* ⚠️ The holiday week still consumes turns, so the week after it does NOT
       start where the week before left off. That is the behaviour the source
       file has and the reason this defaults on. */
    expect(rows(out)).toEqual([
      ["N21", "N24"],
      ["N36", "N11 + A4"],
      ["M13", "M25"],
    ]);
  });

  test("skipped when asked, and the row survives with no slots", () => {
    const out = fillRota(mixed, ROOMS, 2, false);
    expect(out[1].slots).toEqual([]);
    /* The week keeps its number and its row — dropping it would renumber every
       week after it and make the sheet disagree with the calendar. */
    expect(out[1].index).toBe(2);
    expect(out[1].label).toBe("Half Term");
    /* And no turn was consumed, so the next week carries straight on. */
    expect(rows(out)[2]).toEqual(["N36", "N11 + A4"]);
  });
});

describe("the filler is safe on lists that would trap it", () => {
  test("determinism — the same list twice is the same rota twice", () => {
    const a = rows(fillRota(weeks(20), ROOMS, 2, true));
    const b = rows(fillRota(weeks(20), ROOMS, 2, true));
    expect(a).toEqual(b);
  });

  test("a retired item takes no turns", () => {
    const out = fillRota(weeks(2), [...ROOMS.slice(0, 3), { id: "x", code: "X", active: false }], 2, true);
    expect(rows(out).flat().join(" ")).not.toContain("X");
  });

  test("no items at all produces empty periods rather than throwing", () => {
    const out = fillRota(weeks(3), [], 2, true);
    expect(out).toHaveLength(3);
    expect(out.every((p) => p.slots.length === 0)).toBe(true);
  });

  test("a zero weight is coerced to a whole turn and cannot hang the fill", () => {
    /* ⚠️ THE ONE THAT WOULD SPIN FOR EVER. A zero-weight item never advances
       `filled`, so without the coercion the while loop never reaches the quota
       — and the export hangs rather than failing. */
    const out = fillRota(weeks(1), [{ id: "z", code: "Z", weight: 0 }], 2, true);
    expect(out[0].slots.map((s) => s.label)).toEqual(["Z", "Z"]);
  });

  test("one item and a quota of two gives it both turns", () => {
    const out = fillRota(weeks(1), [{ id: "only", code: "ONLY" }], 2, true);
    expect(out[0].slots.map((s) => s.label)).toEqual(["ONLY", "ONLY"]);
  });
});

describe("periods", () => {
  test("own dates start on the Monday of the first week", () => {
    /* 2026-09-09 is a Wednesday; the printed column is always a Monday. */
    const f = ownFrames("2026-09-09", "2026-09-30", "weekly");
    expect(f.map((x) => x.start)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  test("fortnightly steps a fortnight", () => {
    const f = ownFrames("2026-09-07", "2026-10-05", "fortnightly");
    expect(f.map((x) => x.start)).toEqual(["2026-09-07", "2026-09-21", "2026-10-05"]);
  });

  test("own dates are all teaching — there are no closures to consult", () => {
    const f = ownFrames("2026-09-07", "2026-09-28", "weekly");
    expect(f.every((x) => x.teaching)).toBe(true);
    expect(f.every((x) => x.label === null)).toBe(true);
  });

  test("an end before the start is empty, not a crash", () => {
    expect(ownFrames("2026-09-28", "2026-09-07", "weekly")).toEqual([]);
  });

  test("a year's frames carry its labels and cycle through unchanged", () => {
    const f = yearFrames(
      [
        { monday: "2026-09-07", label: "Week A", cycleWeek: 0, isTeachingWeek: true },
        { monday: "2026-10-26", label: "Half Term", cycleWeek: null, isTeachingWeek: false },
      ],
      "weekly",
    );
    expect(f).toEqual([
      { start: "2026-09-07", label: "Week A", cycleWeek: 0, teaching: true },
      { start: "2026-10-26", label: "Half Term", cycleWeek: null, teaching: false },
    ]);
  });

  test("a daily rota skips the days the school is not in", () => {
    /* ⚠️ THIS EMITTED MON-FRI UNCONDITIONALLY while its own comment claimed it
       emitted "every taught weekday" — so a Mon-Thu school got a Friday row
       every week, and a week with one INSET day got a row for the day the
       school was shut. */
    const f = yearFrames(
      [
        {
          monday: "2026-09-07",
          label: "Week A",
          cycleWeek: 0,
          isTeachingWeek: true,
          /* Friday closed by a closure, and this school never runs Wednesday. */
          closedWeekdays: [5],
          untaughtWeekdays: [3],
        },
      ],
      "daily",
    );
    expect(f.map((x) => x.start)).toEqual(["2026-09-07", "2026-09-08", "2026-09-10"]);
  });

  test("a daily rota with no day-level facts still gives all five", () => {
    /* The optional fields are what keep an older caller working unchanged. */
    const f = yearFrames(
      [{ monday: "2026-09-07", label: null, cycleWeek: null, isTeachingWeek: true }],
      "daily",
    );
    expect(f).toHaveLength(5);
  });

  test("a CLOSED week still produces its days, marked not teaching", () => {
    /* ⚠️ The row has to survive or `runThroughClosures` has nothing to run
       through — the same reason a closed week keeps its row everywhere else. */
    const f = yearFrames(
      [{ monday: "2026-10-26", label: "Half Term", cycleWeek: null, isTeachingWeek: false }],
      "daily",
    );
    expect(f).toHaveLength(5);
    expect(f.every((x) => !x.teaching)).toBe(true);
  });

  test("fortnightly over a year takes every other WEEK, closures included", () => {
    /* ⚠️ Counting only teaching weeks would move the check to a different week
       of term after every holiday. */
    const f = yearFrames(
      Array.from({ length: 6 }, (_, i) => ({
        monday: addDays("2026-09-07", i * 7)!,
        label: null,
        cycleWeek: null,
        isTeachingWeek: i !== 2,
      })),
      "fortnightly",
    );
    expect(f.map((x) => x.start)).toEqual(["2026-09-07", "2026-09-21", "2026-10-05"]);
  });
});
