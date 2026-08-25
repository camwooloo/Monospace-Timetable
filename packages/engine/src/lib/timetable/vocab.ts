/**
 * ══════════════════════════════════════════════════════════════════════════
 *  TIMETABLE VOCABULARY — the words, and nothing that computes a week
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NO ARITHMETIC LIVES HERE. Every cycle-week number, every teaching-week
 * decision and every wall-clock-to-instant conversion comes from
 * `convex/lib/timetable.ts`, which is pure and imported directly by the client
 * — the same trick `src/components/inventory/DepreciationPreview.tsx` uses to
 * run the server's own depreciation engine in a form. Convex cannot import
 * from `src/`, but the client CAN import from `convex/lib/`.
 *
 * A second implementation of the cycle on this side of the wire would
 * eventually draw a Week A over a Week B, and the place a school would find
 * out is the staffroom.
 *
 * What IS here: labels, date formatting, and the copy that explains the two
 * arithmetics. The explanation is the part of this feature most likely to be
 * paraphrased into something subtly untrue, so it is written once.
 */

import {
  civilOf,
  closureWeekEffect,
  dayNumber,
  normaliseTaughtWeekdays,
  TEACHING_WEEKDAYS,
  WEEKDAY_NAMES,
  type ClosureKind,
  type GridCellState,
  type HolidayMode,
} from "../timetable";

/* ══════════════════════════════════════════════════════════════════════════
   THE TWO ARITHMETICS, IN THE USER'S WORDS
   ══════════════════════════════════════════════════════════════════════════ */

export const HOLIDAY_MODES: Array<{
  value: HolidayMode;
  label: string;
  /** One line, on the switch. */
  short: string;
  /** The paragraph, under it. Says what actually happens, with an example,
   *  because "pause" and "continue" sound interchangeable until one of them
   *  moves thirty-nine weeks. */
  long: string;
}> = [
  {
    value: "pause",
    label: "Pause over holidays",
    short: "The cycle picks up where it left off.",
    long: "A half-term week is skipped entirely, and the week after it carries on from the week before. Break up on Week A and you come back on Week B. This is what most schools mean, and it is why adding a closure in January can change every week after it.",
  },
  {
    value: "continue",
    label: "Carry on through holidays",
    short: "The week number keeps counting, holidays included.",
    long: "Holiday weeks still take their turn in the cycle, they are just not taught. Break up on Week A and, after a one-week holiday, you come back on Week A again. The number depends only on the date, so adding a closure later never moves another week.",
  },
];

export function holidayModeCopy(mode: HolidayMode) {
  return HOLIDAY_MODES.find((m) => m.value === mode)!;
}

/* ══════════════════════════════════════════════════════════════════════════
   LABELS
   ══════════════════════════════════════════════════════════════════════════ */

export const CLOSURE_KINDS: Array<{
  value: ClosureKind;
  label: string;
  hint: string;
}> = [
  {
    value: "holiday",
    label: "Holiday",
    hint: "Half term, Christmas, Easter. A week these empty completely takes no turn in the cycle.",
  },
  {
    value: "bank",
    label: "Bank holiday",
    hint: "A single day. That day's lessons are cancelled; the week still counts.",
  },
  {
    value: "inset",
    label: "INSET",
    hint: "A staff day. Same as a bank holiday for the cycle: the week still counts.",
  },
  {
    value: "closure",
    label: "Closure",
    hint: "Snow, an election, a burst pipe. Use “whole week” for study leave or activities week.",
  },
];

export function closureKindLabel(kind: ClosureKind): string {
  return CLOSURE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Indexes `useTones()` directly, so a closure reads the same colour wherever
 *  it appears. */
export const CLOSURE_TONE: Record<ClosureKind, "warn" | "crit" | "neut" | "prog"> = {
  holiday: "warn",
  bank: "prog",
  inset: "neut",
  closure: "crit",
};

/** Mon = 1 … Fri = 5. */
export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] ?? `Day ${weekday}`;
}

export function weekdayShort(weekday: number): string {
  return weekdayName(weekday).slice(0, 3);
}

/** "Mon, Tue, Wed, Thu" — and an honest phrase rather than an empty gap when
 *  a list somehow arrives empty. */
export function weekdayList(weekdays: number[]): string {
  if (weekdays.length === 0) return "no days";
  return weekdays.map(weekdayShort).join(", ");
}

/* ══════════════════════════════════════════════════════════════════════════
   PERIODS — a label, a position, a bookable flag, and OPTIONAL times
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ HOW AN UNTIMED PERIOD READS.
 *
 * Times are optional on a period on purpose — Cam's school labels its periods
 * rather than timing them — so every surface that prints a period's clock has
 * to have an answer for "there isn't one". This is that answer, in ONE place:
 * three screens each inventing their own is three screens that will eventually
 * say "undefined–undefined", "—" and "" for the same row.
 *
 * ⚠️ BOTH ENDS OR NEITHER. `periodIsTimed` in convex/lib/timetable.ts is the
 * server's identical test, and the write path refuses to store half a window,
 * so a one-ended period should not exist; if one ever does it reads as untimed
 * here rather than as half a time.
 */
export function periodClock(
  start: string | undefined,
  end: string | undefined,
  untimed = "Untimed",
): string {
  return start && end ? `${start}\u2013${end}` : untimed;
}

/** The word for the flag, in the product's own vocabulary. The stored field is
 *  `isTeaching` for historical reasons; nothing user-facing says that. */
export function bookableLabel(bookable: boolean): string {
  return bookable ? "Bookable" : "Not bookable";
}

/* ══════════════════════════════════════════════════════════════════════════
   DATES — display only. The arithmetic is in convex/lib/timetable.ts.
   ══════════════════════════════════════════════════════════════════════════ */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Sep 2026" — the heading over a month's worth of weeks in the year ribbon.
 *  The year is on it because an academic year spans two of them and "Jan" with
 *  no year is the one label a reader has to stop and work out. */
export function monthKey(civil: string): string {
  return civil.slice(0, 7);
}
export function monthLabel(civil: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(civil);
  if (!m) return civil;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * `2026-09-07` → `7 Sep`. Parsed by SPLITTING THE STRING, never by
 * `new Date(s)` — that parses a bare `YYYY-MM-DD` as UTC midnight and then
 * renders it in the viewer's zone, so anybody west of Greenwich sees the day
 * before. This feature exists partly to avoid exactly that class of bug; it
 * would be poor to reintroduce it in the labels.
 */
export function shortDate(civil: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civil);
  if (!m) return civil;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]}`;
}

export function longDate(civil: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civil);
  if (!m) return civil;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "7–11 Sep", "29 Sep – 3 Oct". The span a week covers, Monday to Friday. */
export function weekSpan(monday: string): string {
  const day = dayNumber(monday);
  if (day === null) return monday;
  const friday = civilOf(day + 4);
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(monday);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(friday);
  if (!a || !b) return monday;
  if (a[2] === b[2]) return `${Number(a[3])}–${Number(b[3])} ${MONTHS[Number(a[2]) - 1]}`;
  return `${shortDate(monday)} – ${shortDate(friday)}`;
}

/** Today, as a civil date in the VIEWER's zone. Used only to highlight "this
 *  week" in the preview — a cosmetic decision, so the viewer's own idea of
 *  today is the right one to use. */
export function todayCivil(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A closure's dates, as one phrase. Single days do not read as a range. */
export function closureSpan(start: string, end: string): string {
  return start === end ? longDate(start) : `${shortDate(start)} – ${longDate(end)}`;
}

/**
 * ⭐ WHAT THE TICK BOX USED TO ASK, ANSWERED FROM THE DATES.
 *
 * The arithmetic is `closureWeekEffect` in convex/lib/timetable.ts — none of it
 * happens here, per the banner at the top of this file. All this does is put
 * the numbers into a sentence, in the same words the year screen uses, so a
 * person entering half term reads "no lessons in either week — the cycle picks
 * up after them" instead of being asked a question they have already answered.
 *
 * ⚠️ THE YEAR IS PASSED IN AND IT IS NOT OPTIONAL DECORATION. A closure typed
 * outside [yearStart, yearEnd] — an August INSET week on the wrong calendar —
 * changes nothing, and without the bounds this promised "empties a whole week …
 * the week after carries on from the week before" about it. Being told a thing
 * happened and then shown a year in which it did not is worse than being asked
 * the tick box's question.
 *
 * ⚠️ AND "IT DOES NOTHING" IS ANSWERED IN WORDS, not by returning `null`. Only
 * a date that will not parse is silent, because then the user has not finished
 * typing. `null` for a closure that lands on no teaching day left the form with
 * an empty line exactly where the consequence belongs.
 */
export function closureEffect(
  start: string,
  end: string,
  taughtWeekdays?: readonly number[],
  /** The calendar's own first and last day. */
  year?: { start: string; end: string },
): string | null {
  const e = closureWeekEffect(start, end, taughtWeekdays, year);
  if (!e) return null;
  if (e.weeksTouched === 0) {
    return "Covers no teaching day — it falls outside the year, on a weekend, or on days this school does not run. Nothing in the cycle changes.";
  }
  const days = `${e.daysRemoved} ${e.daysRemoved === 1 ? "teaching day" : "teaching days"}`;
  if (e.weeksEmptied === 0) {
    return `Cancels ${days}. ${
      e.weeksTouched === 1 ? "That week" : "Those weeks"
    } still ${e.weeksTouched === 1 ? "takes its" : "take their"} turn in the cycle.`;
  }
  if (e.weeksEmptied === e.weeksTouched) {
    return `Empties ${e.weeksEmptied === 1 ? "a whole week" : `${e.weeksEmptied} whole weeks`} — ${days}. ${
      e.weeksEmptied === 1 ? "It takes" : "They take"
    } no turn in the cycle, so the week after carries on from the week before.`;
  }
  return `Cancels ${days} across ${e.weeksTouched} weeks, emptying ${
    e.weeksEmptied === 1 ? "one of them" : `${e.weeksEmptied} of them`
  }. Only the emptied ${e.weeksEmptied === 1 ? "week takes" : "weeks take"} no turn in the cycle.`;
}

/* ══════════════════════════════════════════════════════════════════════════
   WEEK STATE — one place that decides how a week reads
   ══════════════════════════════════════════════════════════════════════════ */

export type WeekRowState = "teaching" | "partial" | "closed" | "pinned";

/**
 * ⚠️ `pinned` IS NOT ONE OF THESE STATES, and it used to pre-empt all of them.
 *
 * A pin says where the NUMBER came from; the state says what is ON that week.
 * They are independent facts — a pinned week can perfectly well have a bank
 * holiday in it — and returning "pinned" first meant such a week lost its
 * granularity sentence entirely, which is the one sentence on this screen
 * worth reading. The row draws "Pinned by hand" from `w.pinned` separately, so
 * this no longer needs to say it.
 *
 * ⭐⭐ THE DENOMINATOR IS THE SCHOOL'S OWN WEEK, NOT FIVE.
 *
 * `weekFacts` files a day the school never teaches under `untaughtWeekdays`,
 * so a Mon–Thu school carries Friday there on EVERY week of the year and
 * `taughtDays` tops out at four. Comparing that against a hardcoded five made
 * every ordinary week of such a school read "partial", all thirty-nine of
 * them, and the one week that really was short became indistinguishable from
 * the thirty-eight that were not. Which days the school runs is configuration
 * — `taughtWeekdays` on the calendar, already resolved server-side — so it is
 * passed in and never defaulted to a second copy of Mon–Fri here.
 *
 * ⚠️ THERE IS NO `"out-of-term"` ROW STATE ANY MORE. It meant "not one of the
 * five weekdays is inside a term", which needed terms to be reachable at all;
 * the only way to reach it now would be a school that teaches on no day, and
 * `normaliseTaughtWeekdays` refuses to return an empty set precisely so that
 * cannot happen. A week with no taught days is CLOSED, which is the word for
 * it and the word the year screen already used.
 */
export function weekRowState(
  w: {
    isTeachingWeek: boolean;
    taughtDays: number;
    closedWeekdays: number[];
    untaughtWeekdays: number[];
  },
  /** Which of Mon–Fri this school teaches. Absent means all five. */
  taughtWeekdays?: readonly number[],
): WeekRowState {
  if (!w.isTeachingWeek) return "closed";
  return w.taughtDays < normaliseTaughtWeekdays(taughtWeekdays).length
    ? "partial"
    : "teaching";
}

/**
 * ⚠️ THE GRANULARITY SENTENCE, WRITTEN ONCE.
 *
 * It is the thing about this feature that surprises people, so it is stated
 * plainly on the row it applies to rather than left in a help page: a week
 * with a bank holiday in it STILL COUNTS.
 */
export function weekStateNote(
  state: WeekRowState,
  w: { taughtDays: number; closedWeekdays: number[]; untaughtWeekdays: number[] },
  /** Which of Mon–Fri this school teaches. Absent means all five. */
  taughtWeekdays?: readonly number[],
): string | null {
  switch (state) {
    case "partial": {
      /* ⚠️ A DAY CAN BE SHORT FOR TWO DIFFERENT REASONS AND THEY ARE NOT THE
         SAME SENTENCE. This used to say "those lessons are just cancelled" for
         every short week, which is a lie about the first week back: on a year
         that begins on a Wednesday, Monday and Tuesday are before it starts
         and no lesson was ever scheduled to cancel. A bursar reading "3 of 5 days taught, those
         lessons are cancelled" against the first week back would reasonably
         conclude the calendar was wrong. Both halves are counted and only the
         true ones are said. */
      const taught = normaliseTaughtWeekdays(taughtWeekdays);
      const closedDays = w.closedWeekdays.filter(
        (d) => !w.untaughtWeekdays.includes(d),
      ).length;
      /* ⚠️ THE OTHER REASON A DAY IS MISSING, AND IT IS NOT NEWS: a day this
         school never runs, or a day either side of the year's first and last.
         `weekFacts` files both under `untaughtWeekdays`, so counting the raw
         list told a Mon–Thu school "1 falls outside the year" about its Friday
         on every week — the permanent arrangement dressed up as this week's
         news. Only days the school runs can be missing from it, and only the
         year's own two edge weeks can be short for the second reason. */
      const outsideYear = w.untaughtWeekdays.filter((d) => taught.includes(d)).length;
      const why =
        closedDays > 0 && outsideYear > 0
          ? `${closedDays} ${closedDays === 1 ? "day is" : "days are"} closed and ${outsideYear} ${outsideYear === 1 ? "falls" : "fall"} outside the year`
          : closedDays > 0
            ? `${closedDays === 1 ? "that day's" : "those days'"} lessons are cancelled`
            : "the year starts or ends partway through the week";
      /* ⭐ "of 4" on a Mon–Thu school. The denominator is what the school
         runs, so the fraction reads as a shortfall rather than as a permanent
         accusation. */
      return `${w.taughtDays} of ${taught.length} days taught — ${why}. The week still takes its turn in the cycle.`;
    }
    case "closed":
      return "No teaching this week, so it takes no turn in the cycle.";
    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   GRID CELL STATE — inherited against overridden, in words
   ══════════════════════════════════════════════════════════════════════════

   ⭐ The seven states come from ONE function on the server —
   `resolveWeekGrid()` in convex/lib/timetable.ts, which resolves
   `override ?? template ?? free` and marks each cell — so the legend and the
   grid cannot disagree about what a cell is.

   These labels live here, and NOT beside a grid, because TWO grids draw them:
   the calendar's own Template screen (`src/components/timetable/TemplateGrid`)
   and the Timetable view inside a department's Booking item
   (`src/components/booking/TimetableWeek`). A second copy of a label table is
   how this codebase has twice ended up with a set that stayed right and words
   that drifted — see the deleted `addOptions` in MobileDashboard. */

export const GRID_STATE_LABEL: Record<GridCellState, string> = {
  free: "",
  template: "inherited",
  booked: "booked",
  series: "recurring",
  closed: "closed",
  "not-taught": "not taught",
  "non-teaching": "no timetable",
};

export const GRID_STATE_TONE: Record<
  GridCellState,
  "muted" | "info" | "warn" | "prog" | "crit" | "neut"
> = {
  free: "muted",
  template: "info",
  booked: "warn",
  series: "prog",
  closed: "crit",
  "not-taught": "neut",
  "non-teaching": "neut",
};
