/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ ONE ROTA → ITS PERIODS. The only place that answers "which weeks?"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A rota either FOLLOWS the school year — taking its weeks, its labels and its
 * cycle straight out of the same calendar the timetable prints — or carries its
 * OWN start and end, for a school that runs a fire-door rota and has no
 * timetable in this file at all.
 *
 * ⚠️ ITS OWN FILE, BETWEEN `document.ts` AND `rota.ts`, BECAUSE OF THE IMPORT
 * DIRECTION. `document.ts` imports `SchoolRota` from `rota.ts`, so `rota.ts`
 * cannot import `document.ts` back without a cycle — which is why `fillRota`
 * takes frames rather than a document. This module is allowed to know both.
 *
 * ⚠️ AND IT IS SHARED RATHER THAN INLINED. Three callers need the same answer:
 * the schedule screen, the export screen and the workbook. Two of them
 * computing it separately is the exact shape of the drift CLAUDE.md records
 * everywhere else — a preview that agrees with the file right up until one of
 * them gains a rule.
 *
 * ⭐ `pickAcademicYear` AND NEVER `years[0]`. A rota with `source: "year"` and
 * no `yearId` means "the year we are in", and the file's order is creation
 * order — so `[0]` is the school's OLDEST year. Five readers in Monospace have
 * had this bug; this is not going to be the sixth.
 */

import {
  buildYear,
  pickAcademicYear,
  todayCivil,
  type CivilDate,
} from "../lib/timetable";
import { yearWeekLabels, type SchoolDocument, type SchoolYear } from "./document";
import {
  fillRota,
  labelClosedFrames,
  ownFrames,
  yearFrames,
  type RotaPeriod,
  type SchoolRota,
} from "./rota";

export type RotaBuildResult =
  | { ok: true; periods: RotaPeriod[]; year: SchoolYear | null; note: string | null }
  | { ok: false; error: string };

function pickYear(doc: SchoolDocument, rota: SchoolRota, now: CivilDate): SchoolYear | null {
  if (rota.yearId) return doc.years.find((y) => y.id === rota.yearId) ?? null;
  const picked = pickAcademicYear(
    doc.years.map((y) => ({ ...y, yearStart: y.start, yearEnd: y.end })),
    now,
  );
  return picked ? (doc.years.find((y) => y.id === picked.id) ?? null) : null;
}

export function buildRota(
  doc: SchoolDocument,
  rota: SchoolRota,
  now: CivilDate = todayCivil(),
): RotaBuildResult {
  let note: string | null = null;
  let year: SchoolYear | null = null;

  if (rota.source === "year") {
    year = pickYear(doc, rota, now);
    if (!year) {
      return {
        ok: false,
        error:
          doc.years.length === 0
            ? "This rota follows the school year and there is no academic year in this file yet. Add one on the Timetable tab, or switch the rota to its own dates."
            : "The academic year this rota follows is not in this file any more. Pick another one, or switch the rota to its own dates.",
      };
    }
  }

  const frames = year
    ? yearFrames(
        buildYear({
          yearStart: year.start,
          yearEnd: year.end,
          rule: {
            cycleLength: year.cycleLength,
            anchorMonday: year.anchorMonday,
            anchorWeekIndex: year.anchorWeekIndex,
            holidayMode: year.holidayMode,
          },
          closures: year.closures ?? [],
          pins: year.pins ?? [],
          /* ⚠️ `yearWeekLabels` AND NEVER `year.weekLabels ?? []`. An absent
             array is the state of every year the app creates, and an empty one
             reaches the `Week N+1` fallback — so a rota would print "(1)" and
             "(2)" beside a timetable printing "Week A" and "Week B", from the
             same year, in the same workbook family. `buildModel.ts` carries the
             same warning for the same reason. */
          weekLabels: yearWeekLabels(year),
          taughtWeekdays: year.taughtWeekdays,
        }).weeks,
        rota.cadence,
      )
    : ownFrames(rota.start ?? "", rota.end ?? "", rota.cadence);

  if (!year && (!rota.start || !rota.end)) {
    return {
      ok: false,
      error: "This rota needs a start and an end date before it can take turns.",
    };
  }
  if (frames.length === 0) {
    return {
      ok: false,
      error: year
        ? "That academic year produced no weeks — check its start and end dates."
        : "Those dates produce no periods. Check the end is after the start.",
    };
  }

  const live = rota.items.filter((i) => i.active !== false);
  if (live.length === 0) {
    return {
      ok: false,
      error: `Nothing is in service to take a turn. Add at least one ${(rota.itemNoun ?? "item").toLowerCase()} on the List screen.`,
    };
  }

  /* ⭐ CLOSURES RUN THROUGH BY DEFAULT, because the reference workbook does:
     its weeks 8, 9, 16 and 17 are Half Term, Christmas and Easter and every one
     of them still names two rooms, greyed. A school that wants the turn order
     to pause over the holidays switches it off, and then the week keeps its
     number and its row and simply names nobody — dropping the row would
     renumber every week after it and make the sheet disagree with the
     calendar. */
  const run = rota.runThroughClosures !== false;
  /* ⭐ THE CLOSURE NAMES COME FROM THE PINNED MODEL, not from a copy here —
     `labelClosedFrames` is shared with Monospace so the two programs cannot
     start naming the same week differently. Before the fill, never after. */
  const periods = fillRota(
    labelClosedFrames(frames, year?.closures ?? []),
    rota.items,
    rota.quota,
    run,
  );

  const closed = frames.filter((f) => !f.teaching).length;
  if (closed > 0 && !run) {
    note = `${closed} closed ${closed === 1 ? "period keeps its row and names nobody" : "periods keep their rows and name nobody"}.`;
  }

  return { ok: true, periods, year, note };
}
