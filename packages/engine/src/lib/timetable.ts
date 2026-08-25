/**
 * ══════════════════════════════════════════════════════════════════════════
 *  TIMETABLE — THE TWO ARITHMETICS, THE CIVIL CALENDAR, AND THE WALL CLOCK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This file is PURE. No `_generated` import, no `convex/values`, no `ctx`,
 * nothing that only exists on a server — the same rule, for the same reason,
 * as convex/lib/bookingTime.ts, convex/lib/depreciation.ts and
 * convex/lib/itemCatalog.ts. Convex cannot import from `src/`, but the client
 * CAN import from `convex/lib/`, so the year the bursar eyeballs on screen and
 * the week map the server materialises are produced by ONE function. A second
 * implementation on the client is a client that will eventually draw Week A
 * over a Week B.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THERE ARE TWO ARITHMETICS HERE. THEY ARE NOT ONE FUNCTION AND A FLAG.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam's *"set the holidays and whether to skip the week cycle or not"* sounds
 * like a boolean. It is two different computations with two different
 * complexity classes and two different failure modes, and pretending otherwise
 * is how the second one ends up subtly wrong.
 *
 *   CONTINUE — the week number advances THROUGH the holidays.
 *
 *       cycleWeek(d) = (⌊(mondayOf(d) − anchorMonday) / 7⌋ + anchorWeekIndex)
 *                      mod cycleLength
 *
 *     O(1), total, and A PURE FUNCTION OF THE DATE. It does not read the
 *     holiday list at all. Two calendars with the same anchor and different
 *     holidays agree on every week. `continueCycleWeek()` below is the whole
 *     of it.
 *
 *   PAUSE — the cycle RESUMES WHERE IT LEFT OFF after a holiday.
 *
 *     NOT a pure function of the date. It is a RUNNING COUNT of TAUGHT weeks
 *     since the anchor, so the answer for 12 March depends on the entire
 *     holiday list between September and March. Insert one half-term week in
 *     October and, on a two-week cycle, every week after it swaps A↔B.
 *     `resolveYear()` below walks the year in order because there is no
 *     closed form to walk instead.
 *
 * ⚠️ THAT DIFFERENCE PROPAGATES INTO EVERYTHING ELSE IN THIS FEATURE:
 *   • CONTINUE can answer a single week without loading the year. PAUSE
 *     cannot, which is the entire reason `bookingWeeks` is materialised.
 *   • A PIN under CONTINUE is a one-week exception; under PAUSE it RESEEDS
 *     the count and shifts every week after it. Both are correct and the UI
 *     has to say which is happening — see `PIN_SEMANTICS_NOTE`.
 *   • A retroactive closure under CONTINUE moves nothing; under PAUSE it
 *     rotates the rest of the year. That is why the diff preview exists.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THERE ARE NO TERMS. THE YEAR IS TWO DATES AND A LIST OF CLOSURES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam, as a user with a year actually configured: *"some things I think
 * should be removed are Terms as every week is a term that isn't a holiday
 * (inset day etc)"*. He is describing the model, not the screen.
 *
 * So the extent of a school year is `yearStart` and `yearEnd` — A FIRST AND A
 * LAST DATE, which `bookingCalendars` already carried, `mondaysBetween`
 * already walked and `MAX_YEAR_DAYS` already bounded. Everything inside it is
 * taught unless something says otherwise. There were TWO extents before, one
 * nested inside the other, and the outer one was the only one anybody had to
 * fill in for the year to materialise at all.
 *
 * ⚠️ TERMS WERE NOT MERELY REDUNDANT, THEY WERE A TRAP THAT HAD ALREADY
 * SPRUNG. `weekFacts` required a day to be INSIDE a term to count as taught,
 * so a calendar with no terms resolved every week non-teaching, every cycle
 * week `null`, and a whole year of dashes. That is the state Cam's live
 * calendar was in: 46 weeks, 5 correct closures, ZERO terms, nothing taught.
 * The screen he called "loads of stuff which looks bad" was 46 rows of a year
 * that had been silently switched off by a second extent nobody knew to fill.
 *
 * A day is now TAUGHT when all three hold, and there is nothing else to fill:
 *   · it is Mon–Fri and one of the weekdays this school runs
 *     (`taughtWeekdays`, default all five);
 *   · it falls inside [yearStart, yearEnd];
 *   · no closure covers it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE GRANULARITY TRAP — `isTeachingWeek` IS A WEEK-LEVEL FACT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A HALF-TERM WEEK pauses the cycle. A BANK-HOLIDAY MONDAY DOES NOT — that
 * week still counts, and Monday's lessons are simply cancelled. A single INSET
 * Friday does not either.
 *
 * Pause per closed DAY and a two-week cycle gives you Monday = Week A and
 * Tuesday = Week B inside one calendar week. No school on earth works that
 * way, and it is the single most likely way to get this feature wrong,
 * because "skip closed days" is the sentence a reasonable person writes.
 *
 * So the rule, stated once and implemented once, in `weekFacts()`:
 *
 *   isTeachingWeek(week) = the week contains AT LEAST ONE taught weekday.
 *
 * Four days taught and one bank holiday is a teaching week. Zero days taught
 * is not. That is the whole test.
 *
 * ⚠️ IT USED TO HAVE A SECOND CLAUSE — a `wholeWeek` tick box on the closure
 * form, which forced the week non-teaching however many days were open. Cam:
 * *"when creating a closure I dont think we need that tick box as its just
 * confusing"*. It IS confusing, because the answer is already in the dates:
 * a closure that takes every taught day out of a week leaves `taughtDays` at
 * zero and the week is non-teaching without anybody being asked. Every one of
 * the five closures in production carried the flag and not one of them needed
 * it — all five cover Mon–Fri of every week they touch. The flag survives on
 * `bookingClosures` as a DEAD FIELD (dropping a column on a live database is
 * destructive) and nothing reads it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ CIVIL DATES, NOT EPOCH MILLISECONDS — THIS IS THE DST DEFENCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every week calculation in this file runs on CIVIL DATES ("YYYY-MM-DD")
 * converted to integer DAY NUMBERS, and never on epoch milliseconds.
 *
 * The reason is one line long: in Europe/London, one week is not always
 * 604,800,000 ms. Add 7 × 86,400,000 to the local midnight before the March
 * change and you land at 01:00, not midnight; do it thirty-nine times across a
 * year and two of your Mondays are the Sunday before. A day-number is pure
 * proleptic-Gregorian integer arithmetic — it has no timezone, no offset and
 * no clock change, so `monday + 7` is always the next Monday, in every zone,
 * forever.
 *
 * Epoch milliseconds appear in exactly one place: `zonedTimeToUtc()`, which
 * turns "Tuesday period 3, 11:20, Europe/London" into the instant a booking
 * actually starts. That function handles the two hours a year a wall clock is
 * not a function of the date at all — the spring hour that does not exist and
 * the autumn hour that happens twice — and says which it did.
 *
 * This is deliberately the opposite of `calendarItems`, whose
 * `convertItemTimes` rewrites four time fields and never touches `item.date`,
 * so a 23:00 London event viewed from Auckland renders at 10:00 ON THE WRONG
 * DAY. That defect is live today and out of scope here; it is named because it
 * is the pattern not to copy.
 */

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS AND SHAPES
   ══════════════════════════════════════════════════════════════════════════ */

/** 1, 2 or 3 weeks. Cam asked for exactly these. A four-week cycle is not a
 *  harder problem, but the labels, the copy and the template grid are all
 *  sized for three and widening it silently would leave `weekLabels` short. */
export const CYCLE_LENGTHS = [1, 2, 3] as const;
export type CycleLength = (typeof CYCLE_LENGTHS)[number];

export type HolidayMode = "pause" | "continue";

/**
 * Mon = 1 … Sun = 7, ISO-8601.
 *
 * ⚠️ THIS IS THE PRINTABLE FRAME, NOT THE SCHOOL'S WEEK. Mon–Fri is the widest
 * week this feature draws — the exported workbook's geometry is five day
 * blocks, transcribed from the school's own file — and WHICH of those five a
 * school actually teaches is now configuration, on
 * `bookingCalendars.taughtWeekdays`. Read `normaliseTaughtWeekdays` before
 * reaching for this constant: a school running Mon–Thu has a Friday in this
 * array and not in its own.
 */
export const TEACHING_WEEKDAYS = [1, 2, 3, 4, 5] as const;

/**
 * ⭐ WHICH DAYS THE SCHOOL TEACHES, when it has not said.
 *
 * Absent means Mon–Fri, so every calendar written before this field existed
 * keeps the exact year it had. There is no backfill and there does not need to
 * be one — the same read-time-default rule `resolveActivityLogging` uses.
 */
export const DEFAULT_TAUGHT_WEEKDAYS: readonly number[] = TEACHING_WEEKDAYS;

/**
 * Clean a stored or submitted taught-day list: inside the printable frame,
 * de-duplicated, ascending.
 *
 * ⚠️ AN EMPTY LIST FALLS BACK TO Mon–Fri RATHER THAN MEANING "TEACH NOTHING".
 * A calendar that teaches on no day resolves every week non-teaching, which
 * under PAUSE freezes the cycle count for the whole year and silently
 * suppresses every recurring booking in it. That is never what somebody meant
 * by unticking the last box, so the write path refuses it at the door and this
 * reader refuses to honour it if one ever gets stored.
 */
export function normaliseTaughtWeekdays(input?: readonly number[]): number[] {
  if (!input || input.length === 0) return [...DEFAULT_TAUGHT_WEEKDAYS];
  const seen = new Set<number>();
  for (const raw of input) {
    const wd = Math.round(raw);
    if ((TEACHING_WEEKDAYS as readonly number[]).includes(wd)) seen.add(wd);
  }
  if (seen.size === 0) return [...DEFAULT_TAUGHT_WEEKDAYS];
  return [...seen].sort((a, b) => a - b);
}
export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * The hard ceiling on how many `bookingWeeks` rows one calendar materialises.
 *
 * An academic year is 39 teaching weeks and about 52 calendar weeks. 60 leaves
 * room for a year defined generously at both ends and refuses a calendar that
 * spans three years by accident — which on a deployment already over its plan
 * limits is a row budget, not a nicety.
 */
export const MAX_WEEKS_PER_CALENDAR = 60;

/** Bank holidays, INSET days, half terms, snow days and the odd polling
 *  station. Two hundred is a decade of these; a calendar that needs more is
 *  describing something other than a school year. */
export const MAX_CLOSURES_PER_CALENDAR = 200;
/** Periods in a teaching day, including registration and both breaks. */
export const MAX_PERIODS_PER_CALENDAR = 20;

/**
 * ⚠️⚠️ HOW MANY CALENDARS' ROWS ONE `by_resource_cycle` RANGE MAY HOLD.
 *
 * `bookingTemplateSlots.by_resource_cycle` is (resource, cycleWeek, weekday)
 * and CARRIES NO CALENDAR, so every read of it filters on `calendarId` after
 * the range. The range therefore has to be wide enough to hold EVERY
 * calendar's rows for that resource, or the filter throws away rows the
 * `.take()` already truncated — and the grid comes back silently short.
 *
 * That is not hypothetical: a school keeps next year's calendar beside this
 * one from about February, and both hold a grid for the same rooms. At a
 * one-calendar ceiling a twenty-period day filled the range with 2026/27 and
 * returned NOTHING for 2027/28.
 *
 * ⚠️⚠️ TWELVE IS NOT THE CALENDAR CAP, AND MUST NOT BE "CORRECTED" TO IT.
 * It was written when the cap was ten, as "ten with slack". The CREATE cap is
 * now three (`MAX_CALENDARS_PER_ORG` in convex/timetable.ts) — but a cap only
 * governs NEW rows, and orgs created under the old limit may hold up to ten.
 * Lowering this to three would truncate their template grids silently, which
 * is the precise failure the paragraph above describes. Twelve still covers
 * every calendar any org can hold.
 *
 * ⭐ THE INVARIANT, since the two numbers now live apart: this must be >=
 * whatever `CALENDAR_READ_CEILING` (convex/timetable.ts) will admit. That is
 * 20 today and 12 < 20 — which is safe ONLY because no stored org can exceed
 * the historical cap of ten. Raise the create cap above twelve and this has to
 * rise with it, or the grid comes back short with nothing raised.
 *
 * It costs nothing when it is not needed: `.take(n)` reads the rows that
 * exist, not `n` of them.
 *
 * ⭐ IT LIVES HERE, IN THE PURE MODULE, BECAUSE THREE FILES READ THAT INDEX —
 * convex/timetableTemplate.ts, convex/bookingPublished.ts and the workbook
 * exporter behind them. It was a module-private constant in the first of those
 * and the published board, written later, picked the one-calendar number
 * again. A second copy of a ceiling is how one surface silently reads fewer
 * rows than another.
 */
export const CALENDAR_FANOUT = 12;

/**
 * ⚠️ QUOTED TO THE USER, NOT PARAPHRASED. The pin's behaviour differs between
 * the two arithmetics and it is not obvious from the switch, so the sentence
 * lives beside the code that makes it true.
 */
export const PIN_SEMANTICS_NOTE = {
  continue:
    "Pinning a week changes that week only. Every later week keeps the number the date gives it.",
  pause:
    "Pinning a week also shifts every teaching week after it, because in pause mode the number is a running count rather than a property of the date.",
} as const satisfies Record<HolidayMode, string>;

/** `YYYY-MM-DD`, in the calendar's own timezone. Never an instant. */
export type CivilDate = string;

export type ClosureKind = "holiday" | "inset" | "bank" | "closure";

/**
 * ⭐ THE ONLY THING THAT INTERRUPTS A YEAR. There is no second shape — no
 * term, no half term, no "the timetable does not run" flag. A closure is a run
 * of days, and how many of a week's taught days it removes is the whole of
 * what it means for the cycle.
 */
export type ClosureInput = {
  id: string;
  label: string;
  kind: ClosureKind;
  start: CivilDate;
  /** Inclusive. A single INSET day has `start === end`. */
  end: CivilDate;
};

/**
 * ⭐ THE EXTENT OF THE YEAR, as day numbers. Days outside it are not taught —
 * which is what makes a year that begins on a Wednesday begin on a Wednesday
 * without needing a term to say so.
 */
export type YearBounds = { startDay: number; endDay: number };

export type CalendarRule = {
  cycleLength: CycleLength;
  /** Validated to BE a Monday on write. See `isMonday`. */
  anchorMonday: CivilDate;
  /**
   * ⭐ SEPARATE FROM `anchorMonday` ON PURPOSE. "We came back on the wrong
   * week" is then a one-field correction — change 0 to 1 — rather than moving
   * the anchor date, which under PAUSE silently re-parents the entire year's
   * running count and under CONTINUE shifts the phase of every week at once.
   * Two fields, two different mistakes, two different fixes.
   */
  anchorWeekIndex: number;
  holidayMode: HolidayMode;
};

/** What an admin has forced for one week. The resolver checks pins FIRST. */
export type WeekPin = {
  monday: CivilDate;
  cycleWeek: number;
  /** A pin may also declare the week non-teaching (a closure nobody entered
   *  yet — the snow day announced at 6am). Absent leaves the derived answer. */
  isTeachingWeek?: boolean;
  reason?: string;
};

/** The derived, rule-free facts about one calendar week. */
export type WeekFacts = {
  monday: CivilDate;
  mondayDay: number;
  /** Mon–Fri the school runs, inside the year, and not closed. 0–5. */
  taughtDays: number;
  /** Weekdays 1–5 that are closed by at least one closure. */
  closedWeekdays: number[];
  /**
   * ⭐ WEEKDAYS 1–5 THAT ARE NOT TAUGHT FOR A STRUCTURAL REASON — either the
   * school never runs that day, or the day falls outside [yearStart, yearEnd].
   *
   * ⚠️ ONE LIST, TWO REASONS, ON PURPOSE — the same argument the file already
   * made for folding untaught weekdays in with out-of-term ones. Every reader
   * that matters (`taughtWeekdaysOf`, `weekHosts`/`hostsNow`, `diffYears`,
   * `resolveWeekGrid`) asks exactly one question of it: "can a lesson happen
   * on this day, ever?" A second day-level set would have to be added to each
   * of them by hand, and the failure mode of missing one is a minibus booked
   * out on a day the school does not run.
   *
   * It was called `outOfTermWeekdays` while terms existed. The name is gone
   * with them; a school with no terms cannot have a day outside one.
   */
  untaughtWeekdays: number[];
  /** Every closure label touching Mon–Fri of this week, de-duplicated. */
  closureLabels: string[];
  closureKinds: ClosureKind[];
  /** ⚠️ WEEK GRANULARITY. Read the trap banner at the top of this file. */
  isTeachingWeek: boolean;
};

export type WeekSource = "pin" | "rule" | "non-teaching";

export type ResolvedWeek = WeekFacts & {
  /** `null` means the timetable does not run this week, so it has no cycle
   *  week at all. It is NOT week 0 and must never render as one. */
  cycleWeek: number | null;
  label: string | null;
  pinned: boolean;
  pinReason?: string;
  source: WeekSource;
};

/* ══════════════════════════════════════════════════════════════════════════
   CIVIL DATE ARITHMETIC — integers, no timezone, no DST, total
   ══════════════════════════════════════════════════════════════════════════

   Howard Hinnant's days-from-civil / civil-from-days, which are exact for the
   whole proleptic Gregorian calendar in integer arithmetic. There is no Date
   object anywhere in this section, deliberately: `new Date("2026-03-29")`
   parses as UTC midnight and `new Date(2026, 2, 29)` parses as LOCAL midnight,
   and which one a line got is invisible at the call site.
   ══════════════════════════════════════════════════════════════════════════ */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCivil(
  date: string,
): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  /* Round-trip so 2026-02-30 is rejected rather than silently becoming the
     2nd of March, which is what every "just construct a Date" version does. */
  const n = daysFromCivil(y, mo, d);
  const back = civilFromDays(n);
  if (back.y !== y || back.m !== mo || back.d !== d) return null;
  return { y, m: mo, d };
}

export function isCivilDate(date: string): boolean {
  return parseCivil(date) !== null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatCivil(y: number, m: number, d: number): CivilDate {
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

/** Days since 1970-01-01. Negative before it. Exact, integer, no Date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

/** `YYYY-MM-DD` → day number, or `null` if it is not a real date. */
export function dayNumber(date: CivilDate): number | null {
  const p = parseCivil(date);
  return p ? daysFromCivil(p.y, p.m, p.d) : null;
}

/** Day number → `YYYY-MM-DD`. */
export function civilOf(day: number): CivilDate {
  const c = civilFromDays(day);
  return formatCivil(c.y, c.m, c.d);
}

/** ISO weekday of a day number: Mon = 1 … Sun = 7.
 *  Day 0 (1970-01-01) was a Thursday, hence the +3. */
export function weekdayOfDay(day: number): number {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

export function weekdayOf(date: CivilDate): number | null {
  const n = dayNumber(date);
  return n === null ? null : weekdayOfDay(n);
}

export function isMonday(date: CivilDate): boolean {
  return weekdayOf(date) === 1;
}

/** The Monday of the week containing this day number. */
export function mondayOfDay(day: number): number {
  return day - (weekdayOfDay(day) - 1);
}

/** The Monday of the week containing this date, as a date. */
export function mondayOf(date: CivilDate): CivilDate | null {
  const n = dayNumber(date);
  return n === null ? null : civilOf(mondayOfDay(n));
}

export function addDays(date: CivilDate, days: number): CivilDate | null {
  const n = dayNumber(date);
  return n === null ? null : civilOf(n + days);
}

/** Inclusive on both ends, the way a term and a closure are both written. */
export function withinInclusive(
  day: number,
  start: number,
  end: number,
): boolean {
  return day >= start && day <= end;
}

/** Positive modulo. `-1 % 2` is `-1` in JavaScript and Week −1 is not a week. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⏱ THE WALL CLOCK → THE INSTANT
   ══════════════════════════════════════════════════════════════════════════

   Everything above is timezone-free. This is the one place a timezone enters,
   and it is the one place DST can bite.

   A TEMPLATE STORES WALL CLOCK PLUS AN IANA ZONE, NEVER AN OFFSET. "Period 3
   starts 11:20 in Europe/London" is stable across the year; "period 3 starts
   at 11:20+00:00" is period 2 from the last Sunday in March. That single
   sentence is the difference between a timetable that works in the summer term
   and one that is an hour out for four months.
   ══════════════════════════════════════════════════════════════════════════ */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTime(hhmm: string): { hh: number; mm: number } | null {
  const m = TIME_RE.exec(hhmm);
  if (!m) return null;
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

export function isTimeOfDay(hhmm: string): boolean {
  return parseTime(hhmm) !== null;
}

/** Minutes since local midnight — for ordering periods and measuring them.
 *  NOT a duration across a DST boundary; use `endUtc − startUtc` for that. */
export function minutesOfDay(hhmm: string): number | null {
  const p = parseTime(hhmm);
  return p ? p.hh * 60 + p.mm : null;
}

/** Same cheap probe as convex/lib/bookingTime.ts, for the same reason: a
 *  runtime with no ICU must degrade to UTC rather than throw, because a
 *  timetable that cannot be read at all is worse than one an hour out in a
 *  configuration nobody runs. */
const TZ_SUPPORTED: boolean = (() => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }).format(0);
    return true;
  } catch {
    return false;
  }
})();

/**
 * The zone's offset from UTC, in ms, AT a given instant. Positive east.
 *
 * The standard formatToParts round-trip: render the instant in the zone, read
 * the wall clock back, re-interpret it as if it were UTC, and subtract. It is
 * exact for whole-minute offsets, which is every offset since 1972.
 */
function offsetAt(utcMs: number, timezone: string): number {
  if (!TZ_SUPPORTED) return 0;
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const out: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date(utcMs))) out[p.type] = p.value;
    const y = Number(out.year);
    const m = Number(out.month);
    const d = Number(out.day);
    const hh = Number(out.hour) % 24;
    const mm = Number(out.minute);
    const ss = Number(out.second);
    if (![y, m, d, hh, mm, ss].every((n) => Number.isFinite(n))) return 0;
    const asUtc = daysFromCivil(y, m, d) * 86_400_000 + (hh * 3600 + mm * 60 + ss) * 1000;
    return asUtc - utcMs;
  } catch {
    return 0;
  }
}

/**
 * What happened to a wall-clock time when it was pinned to the line.
 *
 *   "none"       — an ordinary day. 363 days a year.
 *   "ambiguous"  — the autumn Sunday. 01:30 happens twice; THE FIRST IS TAKEN
 *                  (the one still on summer time), which is RFC 5545's rule
 *                  and the one every calendar client agrees on.
 *   "skipped"    — the spring Sunday. 01:30 does not exist at all; the time is
 *                  SHIFTED FORWARD BY THE GAP, so 01:30 becomes 02:30.
 *
 * ⚠️ IT IS RETURNED, NOT SWALLOWED. A UK school day is 08:00–16:00 and the UK
 * changes its clocks at 01:00, so this can only ever fire for a night booking
 * — but "cannot happen" is exactly the reasoning that produces a booking an
 * hour long that was meant to be two, with nothing anywhere saying why. The
 * caller stores the flag and the preview screen shows it.
 */
export type ClockAdjustment = "none" | "ambiguous" | "skipped";

export type ZonedResult = { utc: number; adjusted: ClockAdjustment };

/**
 * "Tuesday the 10th, 11:20, Europe/London" → the epoch millisecond it is.
 *
 * Total: an unparseable date or time returns `null` rather than throwing,
 * because this runs inside a preview the user is watching being drawn.
 */
export function zonedTimeToUtc(
  date: CivilDate,
  hhmm: string,
  timezone: string,
): ZonedResult | null {
  const c = parseCivil(date);
  const t = parseTime(hhmm);
  if (!c || !t) return null;

  /* The wall clock read as though it were UTC. Not the answer — the input to
     finding the answer. */
  const naive =
    daysFromCivil(c.y, c.m, c.d) * 86_400_000 + (t.hh * 60 + t.mm) * 60_000;

  if (!TZ_SUPPORTED) return { utc: naive, adjusted: "none" };

  /* Sample the offset either side of the target. ±26h is wider than any
     transition and wider than any offset (max ±14h), so both the pre- and
     post-transition offsets are always in this pair. */
  const candidates = Array.from(
    new Set([
      offsetAt(naive - 26 * 3_600_000, timezone),
      offsetAt(naive + 26 * 3_600_000, timezone),
    ]),
  );

  /* An offset is the RIGHT one iff interpreting the wall clock with it lands
     on an instant that really is at that offset. On an ordinary day exactly
     one passes. */
  const valid = candidates.filter((o) => offsetAt(naive - o, timezone) === o);

  if (valid.length === 1) return { utc: naive - valid[0], adjusted: "none" };

  if (valid.length > 1) {
    /* AMBIGUOUS — the hour that happens twice. The LARGER offset gives the
       EARLIER instant, which is the first occurrence: still on summer time. */
    return { utc: naive - Math.max(...valid), adjusted: "ambiguous" };
  }

  /* SKIPPED — the hour that does not exist. The SMALLER offset gives the LATER
     instant, i.e. the requested wall time shifted forward past the gap:
     01:30 on the spring Sunday becomes 02:30. */
  return { utc: naive - Math.min(...candidates), adjusted: "skipped" };
}

/** The instant a lesson starts and ends, with the worse of the two clock
 *  adjustments reported. Half-open `[start, end)`, like everything else in
 *  this feature — see convex/lib/bookingTime.ts. */
export function periodWindow(
  date: CivilDate,
  startHHMM: string,
  endHHMM: string,
  timezone: string,
): { startUtc: number; endUtc: number; adjusted: ClockAdjustment } | null {
  const a = zonedTimeToUtc(date, startHHMM, timezone);
  const b = zonedTimeToUtc(date, endHHMM, timezone);
  if (!a || !b) return null;
  if (b.utc <= a.utc) return null;
  const adjusted: ClockAdjustment =
    a.adjusted !== "none" ? a.adjusted : b.adjusted;
  return { startUtc: a.utc, endUtc: b.utc, adjusted };
}

/* ══════════════════════════════════════════════════════════════════════════
   WEEK FACTS — the year's extent and its closures, at WEEK granularity
   ══════════════════════════════════════════════════════════════════════════ */

type Ranged = { id: string; startDay: number; endDay: number };

function toRanges<T extends { id: string; start: CivilDate; end: CivilDate }>(
  rows: T[],
): Array<T & Ranged> {
  const out: Array<T & Ranged> = [];
  for (const r of rows) {
    const s = dayNumber(r.start);
    const e = dayNumber(r.end);
    if (s === null || e === null) continue;
    /* A range entered backwards is normalised rather than dropped: a bursar
       who typed the end date into the start box should see a wrong week, not
       a silently missing one. */
    out.push({ ...r, startDay: Math.min(s, e), endDay: Math.max(s, e) });
  }
  return out;
}

/**
 * Everything about one calendar week that does NOT depend on the cycle rule.
 *
 * ⚠️ The teaching-week decision lives here and nowhere else. Read the
 * granularity banner at the top before changing the last line of it.
 */
export function weekFacts(
  monday: CivilDate,
  closures: ClosureInput[],
  /** Which of Mon–Fri this school teaches. Absent means all five. */
  taughtWeekdays?: readonly number[],
  /** ⭐ THE YEAR'S EXTENT. Absent means "do not clip" — the caller has already
   *  chosen the Mondays, and every weekday in them is inside the year. Only
   *  `buildYear` passes it, because only `buildYear` knows the bounds. */
  bounds?: YearBounds,
): WeekFacts | null {
  const mondayDay = dayNumber(monday);
  if (mondayDay === null) return null;

  const taught = normaliseTaughtWeekdays(taughtWeekdays);
  const closureRanges = toRanges(closures);

  const closedWeekdays: number[] = [];
  const untaughtWeekdays: number[] = [];
  const labels: string[] = [];
  const kinds: ClosureKind[] = [];
  let taughtDays = 0;

  /* Only Mon–Fri. A Saturday letting is a booking, not a lesson, and a
     Saturday closure must not make a week non-teaching. */
  for (const wd of TEACHING_WEEKDAYS) {
    const day = mondayDay + (wd - 1);

    /* ⚠️ TWO STRUCTURAL REASONS, ONE LIST, AND THEY ARE CHECKED BEFORE THE
       CLOSURES ON PURPOSE. A day the school never runs, and a day outside the
       year, both contribute no closure label — an INSET day on a Friday a
       Mon–Thu school never runs is not news, and neither is a bank holiday in
       the August before the year starts. */
    const runsThisDay = taught.includes(wd);
    const insideYear =
      !bounds || withinInclusive(day, bounds.startDay, bounds.endDay);
    if (!runsThisDay || !insideYear) {
      untaughtWeekdays.push(wd);
      continue;
    }

    let closed = false;
    for (const c of closureRanges) {
      if (!withinInclusive(day, c.startDay, c.endDay)) continue;
      closed = true;
      if (!labels.includes(c.label)) labels.push(c.label);
      if (!kinds.includes(c.kind)) kinds.push(c.kind);
    }
    if (closed) closedWeekdays.push(wd);
    else taughtDays++;
  }

  /* ⭐⭐ THE GRANULARITY RULE, IN ONE LINE, AND NOTHING ELSE IN IT. Four days
     taught and a bank holiday Monday is a TEACHING WEEK. Zero days taught is
     not. A closure that empties a week is what a half term IS — it needs no
     flag saying so, which is why the tick box is gone. */
  const isTeachingWeek = taughtDays > 0;

  return {
    monday,
    mondayDay,
    taughtDays,
    closedWeekdays,
    untaughtWeekdays,
    closureLabels: labels,
    closureKinds: kinds,
    isTeachingWeek,
  };
}

/**
 * ⭐ WHAT A CLOSURE WOULD DO TO THE WEEKS IT TOUCHES — the tick box's job,
 * done by reading the dates.
 *
 * Cam: *"when creating a closure I dont think we need that tick box as its
 * just confusing"*. The box asked "does the timetable run in the weeks this
 * touches?" and the answer was always already in the two dates the user had
 * just typed. This computes it so the form can SAY the answer instead of
 * asking for it.
 *
 * ⚠️ IT IS DELIBERATELY BLIND TO OTHER CLOSURES. This is the sentence under an
 * add-a-closure form, so it describes what THIS closure does on its own; two
 * closures that between them empty a week is a case the year preview shows
 * properly, and guessing at it here would need the whole calendar loaded into
 * a form that has not been submitted yet.
 *
 * ⚠️⚠️ IT IS *NOT* BLIND TO THE YEAR, AND MUST NOT BE. `weekFacts` above skips
 * a day outside [yearStart, yearEnd] BEFORE it looks at the closures, so a
 * closure typed for the August before term — a summer INSET week somebody
 * enters on the wrong calendar — removes nothing and rotates nothing. Counted
 * without the bounds this said *"Empties a whole week … the week after carries
 * on from the week before"* about a change that `diffYears` scores at zero
 * weeks, in the one sentence that replaced the tick box. `weeksEmptied` is
 * likewise measured against THE DAYS OF THAT WEEK THAT ARE IN THE YEAR, not
 * against all five, so the year's own first and last weeks can still read as
 * emptied when a closure takes out the part of them that is taught.
 */
export function closureWeekEffect(
  start: CivilDate,
  end: CivilDate,
  taughtWeekdays?: readonly number[],
  /** The year's extent, as the calendar stores it. Absent means "do not clip"
   *  — the same contract `weekFacts`' `bounds` has. */
  year?: { start: CivilDate; end: CivilDate },
): { weeksTouched: number; weeksEmptied: number; daysRemoved: number } | null {
  const a = dayNumber(start);
  const b = dayNumber(end);
  if (a === null || b === null) return null;
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  const taught = normaliseTaughtWeekdays(taughtWeekdays);

  /* An unparseable bound clips nothing rather than clipping everything: a
     calendar with a broken date should make this sentence vague, not wrong. */
  const ys = year ? dayNumber(year.start) : null;
  const ye = year ? dayNumber(year.end) : null;
  const bounds: YearBounds | undefined =
    ys === null || ye === null
      ? undefined
      : { startDay: Math.min(ys, ye), endDay: Math.max(ys, ye) };
  const inYear = (day: number) =>
    !bounds || withinInclusive(day, bounds.startDay, bounds.endDay);

  let weeksTouched = 0;
  let weeksEmptied = 0;
  let daysRemoved = 0;
  /* Bounded by the year ceiling for the same reason everything else here is:
     a closure spanning a decade is a typo, and it must cost a fixed amount to
     say so rather than spinning in a form's render. */
  const first = mondayOfDay(from);
  for (let m = first, guard = 0; m <= to && guard < MAX_WEEKS_PER_CALENDAR; m += 7, guard++) {
    let hit = 0;
    let taughtThisWeek = 0;
    for (const wd of taught) {
      const day = m + (wd - 1);
      if (!inYear(day)) continue;
      taughtThisWeek++;
      if (day >= from && day <= to) hit++;
    }
    if (hit === 0) continue;
    weeksTouched++;
    daysRemoved += hit;
    if (hit === taughtThisWeek) weeksEmptied++;
  }
  return { weeksTouched, weeksEmptied, daysRemoved };
}

/** Every Monday from `from`'s week to `to`'s week, inclusive, capped. */
export function mondaysBetween(
  from: CivilDate,
  to: CivilDate,
  max: number = MAX_WEEKS_PER_CALENDAR,
): { mondays: CivilDate[]; capped: boolean } {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a === null || b === null) return { mondays: [], capped: false };
  const first = mondayOfDay(Math.min(a, b));
  const last = mondayOfDay(Math.max(a, b));
  const mondays: CivilDate[] = [];
  for (let d = first; d <= last; d += 7) {
    if (mondays.length >= max) return { mondays, capped: true };
    mondays.push(civilOf(d));
  }
  return { mondays, capped: false };
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ ARITHMETIC 1 — CONTINUE. O(1), pure in the date.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The cycle week of a Monday, when the cycle runs THROUGH the holidays.
 *
 *   cycleWeek = (weeksSinceAnchor + anchorWeekIndex) mod cycleLength
 *
 * It never reads a term and never reads a closure. Two schools with the same
 * anchor and completely different holidays agree on every week of the year,
 * which is exactly what "continue" means and exactly why it is the mode that
 * survives a retroactive closure with nothing to recompute.
 *
 * Returns `null` only for an unparseable date.
 */
export function continueCycleWeek(
  monday: CivilDate,
  rule: CalendarRule,
): number | null {
  const m = dayNumber(monday);
  const a = dayNumber(rule.anchorMonday);
  if (m === null || a === null) return null;
  /* Normalise both to their Mondays so a mis-entered anchor cannot put the
     whole year a fraction of a week out of phase. `anchorMonday` is validated
     on write, but this function is also called from the client on values that
     have not been through that gate yet. */
  const weeks = Math.round((mondayOfDay(m) - mondayOfDay(a)) / 7);
  return mod(weeks + rule.anchorWeekIndex, rule.cycleLength);
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ ARITHMETIC 2 — PAUSE. A running count. NOT pure in the date.
   ══════════════════════════════════════════════════════════════════════════

   There is no closed form. The number for 12 March is "how many TAUGHT weeks
   have there been since the anchor", and that is a property of the holiday
   list, not of the date. So the year is walked in order, once, and the answer
   for every week comes out of the same walk — which is precisely why
   `bookingWeeks` is materialised rather than computed per render.

   The walk runs OUTWARD FROM THE ANCHOR in both directions, because a
   calendar's first week is usually before the anchor (an INSET day in the last
   week of August, the anchor on the first Monday of term) and the count has to
   be right there too.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve a whole year's weeks under either arithmetic.
 *
 * `weeks` must be in ascending Monday order and CONTIGUOUS — every Monday, not
 * only the teaching ones. A gap silently changes the PAUSE count, so it is
 * checked and reported rather than trusted.
 *
 * `pins` are checked FIRST, always, under both arithmetics. A pin is the
 * escape hatch for the thing no rule survives: the snow day announced at 6am,
 * and the Week A / Week B map the school has already published and would
 * rather type in than argue about.
 */
export function resolveYear(
  weeks: WeekFacts[],
  rule: CalendarRule,
  pins: WeekPin[] = [],
  weekLabels: string[] = [],
): { weeks: ResolvedWeek[]; contiguous: boolean } {
  const pinBy = new Map<string, WeekPin>();
  for (const p of pins) pinBy.set(p.monday, p);

  let contiguous = true;
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].mondayDay !== weeks[i - 1].mondayDay + 7) contiguous = false;
  }

  /* ⭐ ONE RESOLVER, SHARED WITH EVERY OTHER READER OF `weekLabels`. See
     `cycleWeekLabel` — it carries the `?? "Week N+1"` fallback AND the
     one-week-cycle rule that four separate copies of this line did not. */
  const labelOf = (cw: number | null): string | null =>
    cw === null ? null : cycleWeekLabel(weekLabels, cw, rule.cycleLength);

  /* A pin may declare the week non-teaching, and that has to be settled before
     either arithmetic runs — under PAUSE it decides whether the count moves. */
  const teaching = weeks.map((w) => {
    const pin = pinBy.get(w.monday);
    return pin?.isTeachingWeek ?? w.isTeachingWeek;
  });

  const out: ResolvedWeek[] = weeks.map((w, i) => ({
    ...w,
    isTeachingWeek: teaching[i],
    cycleWeek: null,
    label: null,
    pinned: false,
    source: "non-teaching" as WeekSource,
  }));

  if (rule.holidayMode === "continue") {
    /* ── ARITHMETIC 1. Every week answered independently. ── */
    for (let i = 0; i < out.length; i++) {
      const pin = pinBy.get(out[i].monday);
      if (pin) {
        /* ⚠️ `teaching[i]` GATES THE NUMBER, exactly as it does under PAUSE.
           A pin on a week that is not taught — half term, or a week a pin
           itself declared non-teaching — leaves the week with NO cycle week,
           because `null` is this file's word for "the timetable does not run
           this week" and a holiday rendering as "Week A" is the one thing
           `ResolvedWeek.cycleWeek` promises never to do. The two arithmetics
           disagreed here: PAUSE gated it, CONTINUE did not, so the same pin on
           the same holiday week painted a week number under one mode and not
           the other. */
        out[i].cycleWeek = teaching[i] ? mod(pin.cycleWeek, rule.cycleLength) : null;
        out[i].pinned = true;
        out[i].pinReason = pin.reason;
        out[i].source = "pin";
      } else if (!teaching[i]) {
        out[i].cycleWeek = null;
        out[i].source = "non-teaching";
      } else {
        out[i].cycleWeek = continueCycleWeek(out[i].monday, rule);
        out[i].source = "rule";
      }
      out[i].label = labelOf(out[i].cycleWeek);
    }
    return { weeks: out, contiguous };
  }

  /* ── ARITHMETIC 2. One ordered walk, outward from the anchor. ──────────
     `next` is the index the NEXT taught week will take. Seeded at the anchor
     and carried forward; carried BACKWARD by the same amount for the weeks
     before it. A holiday week consumes nothing, which is the whole of "the
     cycle resumes where it left off". */
  const anchorDay = dayNumber(rule.anchorMonday);
  const anchorMondayDay = anchorDay === null ? null : mondayOfDay(anchorDay);

  /* Where the anchor sits in this list. If the anchor is before the list, the
     walk starts at index 0 with the count already advanced past the weeks in
     between — which it cannot know, so the anchor is REQUIRED to be inside the
     calendar's own range (enforced on write in convex/timetable.ts). If it is
     outside anyway, the walk starts from the nearest end and says so by
     leaving `contiguous` alone: the numbers will be self-consistent, just
     phase-shifted, and the year preview is where a human notices. */
  let anchorIndex = out.findIndex((w) => w.mondayDay === anchorMondayDay);
  if (anchorIndex < 0) {
    anchorIndex =
      anchorMondayDay !== null && out.length > 0 && anchorMondayDay < out[0].mondayDay
        ? 0
        : Math.max(0, out.length - 1);
  }

  /* Forward, from the anchor. */
  let next = mod(rule.anchorWeekIndex, rule.cycleLength);
  for (let i = anchorIndex; i < out.length; i++) {
    const pin = pinBy.get(out[i].monday);
    if (pin) {
      const cw = mod(pin.cycleWeek, rule.cycleLength);
      out[i].cycleWeek = teaching[i] ? cw : null;
      out[i].pinned = true;
      out[i].pinReason = pin.reason;
      out[i].source = "pin";
      /* ⚠️ THE PIN RESEEDS THE COUNT. This is the half of PIN_SEMANTICS_NOTE
         that surprises people: under PAUSE a pin is not a local exception, it
         is a new starting point, because the count has no other state. Say it
         in the UI; do not make somebody discover it in March. */
      next = teaching[i] ? mod(cw + 1, rule.cycleLength) : cw;
    } else if (!teaching[i]) {
      out[i].cycleWeek = null;
      out[i].source = "non-teaching";
    } else {
      out[i].cycleWeek = next;
      out[i].source = "rule";
      next = mod(next + 1, rule.cycleLength);
    }
    out[i].label = labelOf(out[i].cycleWeek);
  }

  /* Backward, from just before the anchor. `prev` is the index the PREVIOUS
     taught week took. */
  let prev = mod(rule.anchorWeekIndex, rule.cycleLength);
  for (let i = anchorIndex - 1; i >= 0; i--) {
    const pin = pinBy.get(out[i].monday);
    if (pin) {
      const cw = mod(pin.cycleWeek, rule.cycleLength);
      out[i].cycleWeek = teaching[i] ? cw : null;
      out[i].pinned = true;
      out[i].pinReason = pin.reason;
      out[i].source = "pin";
      prev = cw;
    } else if (!teaching[i]) {
      out[i].cycleWeek = null;
      out[i].source = "non-teaching";
    } else {
      prev = mod(prev - 1, rule.cycleLength);
      out[i].cycleWeek = prev;
      out[i].source = "rule";
    }
    out[i].label = labelOf(out[i].cycleWeek);
  }

  return { weeks: out, contiguous };
}

/**
 * Build a whole calendar's resolved year from its raw parts, in one call.
 *
 * The single entry point the server materialiser and the client preview both
 * use. If they ever call different things, they will eventually disagree, and
 * the one place a school notices is the staffroom.
 */
export function buildYear(input: {
  /** ⭐ THE EXTENT, AND THE ONLY EXTENT. See the banner at the top of the file:
   *  terms were a second one nested inside this, and a calendar that had not
   *  filled the inner one taught nothing at all. */
  yearStart: CivilDate;
  yearEnd: CivilDate;
  rule: CalendarRule;
  closures: ClosureInput[];
  pins?: WeekPin[];
  weekLabels?: string[];
  /** Which of Mon–Fri the school teaches. Absent means all five. */
  taughtWeekdays?: readonly number[];
  max?: number;
}): { weeks: ResolvedWeek[]; capped: boolean; contiguous: boolean } {
  const { mondays, capped } = mondaysBetween(
    input.yearStart,
    input.yearEnd,
    input.max ?? MAX_WEEKS_PER_CALENDAR,
  );
  /* ⚠️ THE BOUNDS ARE CLIPPED PER DAY, NOT PER WEEK. `mondaysBetween` walks
     whole weeks from the Monday of `yearStart`, so a year that begins on a
     Wednesday has a first week whose Monday and Tuesday are before it. Those
     two days are not in the year and must not be taught — which is exactly
     what a term used to express and is now one comparison. */
  const startDay = dayNumber(input.yearStart);
  const endDay = dayNumber(input.yearEnd);
  const bounds: YearBounds | undefined =
    startDay === null || endDay === null
      ? undefined
      : { startDay: Math.min(startDay, endDay), endDay: Math.max(startDay, endDay) };
  const facts: WeekFacts[] = [];
  for (const m of mondays) {
    const f = weekFacts(m, input.closures, input.taughtWeekdays, bounds);
    if (f) facts.push(f);
  }
  const resolved = resolveYear(
    facts,
    input.rule,
    input.pins ?? [],
    input.weekLabels ?? [],
  );
  return { weeks: resolved.weeks, capped, contiguous: resolved.contiguous };
}

/** Default labels for a cycle: A, B, C. Used when the calendar has not been
 *  given its own — some schools say "Week 1 / Week 2" and some say "A / B". */
export function defaultWeekLabels(cycleLength: CycleLength): string[] {
  const letters = ["A", "B", "C"];
  return Array.from({ length: cycleLength }, (_, i) =>
    cycleLength === 1 ? "Every week" : `Week ${letters[i]}`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ WHAT ONE CYCLE WEEK IS CALLED — ONE ANSWER, NOT FOUR
   ══════════════════════════════════════════════════════════════════════════

   `weekLabels` is free text on the calendar and every reader of it had written
   the same fallback out by hand — `weekLabels[cw] ?? "Week N+1"` — in
   `resolveYear`, in convex/timetable.ts, in the export route's template-sheet
   loop and in `TemplateGrid`. Four copies of a one-line rule is the shape
   CLAUDE.md has receipts for, and this one had already drifted: one of them
   lower-cased the word ("week 2").

   ── ⚠️ AND THE DRIFT THAT MATTERED WAS A FIFTH COPY WITH AN EXTRA RULE ────
   `weekBandFor` in src/lib/timetable/weekBand.ts — the top-left corner of both
   grids AND of the exported workbook — carried a rule none of the four knew
   about: on a ONE-WEEK cycle whose stored label is still a default, it printed
   "Every week" instead. That is right, and the reason is real: `setRule`
   narrowing a two-week cycle to one keeps `weekLabels.slice(0, 1)`, which is
   still `["Week A"]` — a label that was true when it was written and is not any
   more, because there is no Week B to tell it from. `defaultWeekLabels(1)`
   already calls that week "Every week".

   ⚠️ BUT IT WAS APPLIED IN ONE PLACE OUT OF FIVE, so a school that narrowed
   its cycle got a week strip tab reading `(A) September 7th - 11th` beside a
   corner reading `EVERY WEEK`, and the same disagreement between the workbook's
   tab and its own B1 cell. Both statements are true of the same single week and
   neither misleads, which is why it was left alone for a while — but "the two
   labels for this week are produced by different rules" is a fact that gets
   worse, not better, as things are built on it.

   So the rule moves HERE, above every reader, and `weekBandFor` keeps none of
   its own. The tab and the corner now agree because they are the same string.

   ── ⭐ IT OVERRIDES ONLY A LABEL THAT IS STILL A DEFAULT ─────────────────
   A school that deliberately named its single week "Main timetable" keeps its
   own word. Replacing that would be this function deciding it knew better than
   the person who typed it.

   ⚠️ IT CANNOT TELL "left over from a two-week cycle" FROM "typed the words
   Week A into a one-week cycle", and it does not try: both are exactly the
   default text of a cycle that no longer exists, and preferring the honest
   description of the week the school actually runs is the better of two
   guesses. This was already the accepted trade in `weekBandFor`; moving the
   rule does not change it, it only applies it everywhere.
   ══════════════════════════════════════════════════════════════════════════ */

/** Every label a cycle can carry before anybody renames it — A, B and C. */
const CYCLE_DEFAULT_LABELS: readonly string[] = defaultWeekLabels(3);

export function cycleWeekLabel(
  weekLabels: readonly string[] | undefined,
  cycleWeek: number,
  cycleLength: number,
): string {
  /* ⚠️ THE FALLBACK IS `Week N+1` AND NOT `weekLabels[0]`. Widening a two-week
     cycle to three leaves `weekLabels` SHORT of `cycleLength` — see the week
     picker in TemplateGrid — so the third week has no stored name at all and
     needs a printable one rather than a borrowed one. */
  const stored = weekLabels?.[cycleWeek];
  const text = stored?.trim();
  if (!text) return `Week ${cycleWeek + 1}`;
  if (cycleLength === 1 && CYCLE_DEFAULT_LABELS.includes(text)) {
    return defaultWeekLabels(1)[0];
  }
  return text;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ "WHICH ACADEMIC YEAR DID THEY MEAN?" — ONE RULE, FIVE READERS
   ══════════════════════════════════════════════════════════════════════════

   A school keeps last year's calendar alongside this year's — up to three of
   them, since the cap — so anything that defaults to "the" calendar has to say
   which. FIVE places pick one without being told:

     · src/app/api/orgs/[orgId]/timetable/export/route.ts — which year the
       workbook is built from when no `?calendar=` is given;
     · src/components/timetable/TimetablePanel.tsx — which year the whole
       settings panel opens on, and therefore which year every Closures and
       Templates edit lands in;
     · src/components/timetable/TimetableExportSection.tsx — which year its
       "Academic year" select shows as chosen. It reads the panel's selection
       above and always sends `?calendar=`, which is what keeps the select and
       the bytes in agreement by construction rather than by luck.
     · src/components/booking/TimetableWeek.tsx — which year a room's week
       grid is read from in the departmental Booking item;
     · convex/bookingPublished.ts — TWICE, and the two are not the same call.
       `year` picks the week strip on the PUBLISHED BOARD for today, while
       `board`/`pickCalendar` picks for THE DAY BEING ASKED ABOUT, so that
       stepping forward off the end of July finds next year instead of saying
       "no week to show" for twelve months. That second caller is the whole
       reason the day is an argument and not a clock read.

   ⚠️ EVERY ONE OF THOSE HAS AT SOME POINT USED `calendars[0]` INSTEAD. It is
   the obvious-looking default and it is always wrong: see below.

   THEY HAD DIFFERENT RULES, and the result is the worst kind of export bug:
   the route picked the year covering today, the select displayed
   `calendars[0]`, and `timetable.listCalendars` returns them in index order —
   which is creation order, so `[0]` is the school's OLDEST year. In a school's
   second year the dropdown said "2026/27" and the file that landed on the desk
   was 2027/28. Nothing errored and nothing looked wrong until somebody read
   the dates inside.

   So the rule lives here, in the pure layer both sides can import (the client
   already imports this module), and neither side owns a copy of it.

   ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE RULE IS THREE STEPS, AND THE LAST TWO ARE THE FIX
   ══════════════════════════════════════════════════════════════════════════

     1. THE YEAR COVERING THE DAY. Term time. Unambiguous, and the answer for
        the ~190 days a year anybody is at school.
     2. NO YEAR COVERS IT → THE YEAR ABOUT TO START: the earliest `yearStart`
        still ahead of the day. In the gap between two years a school means
        the one it is about to teach. Nobody stands in the last week of August
        meaning last June.
     3. EVERY YEAR ON FILE HAS ALREADY ENDED → THE MOST RECENT ONE: the latest
        `yearEnd`. A school that has stopped adding calendars means the last
        year it taught, not the first one it ever made.

   ⚠️⚠️ IT USED TO END `?? calendars[0]`, AND THAT IS A MEASURED BUG RATHER
   THAN AN UNTIDINESS. `listCalendars` returns index order — creation order —
   so `calendars[0]` is the OLDEST year the school ever made. Run against the
   real three-year set [2025/26, 2026/27, 2027/28] with today = 2026-08-20
   (the summer holidays, in the gap between two years, which is where the
   calendar actually is as this is written), the old function returned
   2025/26. The published board filled its week strip with LAST year's weeks
   and landed on a teaching week in July 2026 — a month in the past, on the
   page every member of the school can open. Step 2 returns 2026/27, the year
   that starts in a fortnight. Step 3 only ever runs for a school whose
   newest calendar has expired, and it now hands back that newest one instead
   of its first ever.

   ⚠️ THIS CHANGES WHICH YEAR AN UNQUALIFIED EXPORT BUILDS, AND THAT IS THE
   POINT. `route.ts` calls this when `?calendar=` is absent, so a workbook
   exported during the summer used to be built from the oldest year on file
   and now comes from the one about to start. Same for the settings panel's
   opening year, and therefore for which year a Closures edit lands in if the
   admin never touches the select. All five readers move together, which is
   the reason there is one function.

   ⚠️ NO ORDER IS ASSUMED OF `calendars`. Steps 2 and 3 are min/max scans, not
   `[0]` and not `[length - 1]`: the rows arrive in creation order from
   `listCalendars` and in index order from a `by_org` range, and neither is
   sorted by date. A school that builds 2027/28 before it gets round to
   2026/27 must still get the same answer.

   Overlapping years are a data error and step 1 resolves them exactly as it
   always has — the first covering row in the order given.

   ⚠️ `today` IS PASSED IN, never read from the clock inside. A client and a
   server in different timezones must not disagree about the answer; one
   reader deliberately passes a day that is NOT today (see `board` above); and
   a function that reads the clock cannot be tested against a year boundary,
   which is the one date this is ever wrong on. The boundary cases below are
   all exercised in the verification: the day before a year opens, its first
   day, its last day, the day after, and the middle of the gap. */
export function pickAcademicYear<
  T extends { yearStart: CivilDate; yearEnd: CivilDate },
>(calendars: readonly T[], today: CivilDate): T | null {
  if (calendars.length === 0) return null;

  /* 1. The year that covers the day. */
  const covering = calendars.find(
    (c) => c.yearStart <= today && today <= c.yearEnd,
  );
  if (covering) return covering;

  /* 2. In a gap — the year ABOUT TO START. Earliest `yearStart` still ahead
     of the day, found by scan because the rows are in creation order. */
  let next: T | null = null;
  for (const c of calendars) {
    if (c.yearStart > today && (next === null || c.yearStart < next.yearStart)) {
      next = c;
    }
  }
  if (next) return next;

  /* 3. Nothing left to come — the MOST RECENTLY ENDED year. Latest `yearEnd`,
     and emphatically not `calendars[0]`, which is the oldest. */
  let last: T | null = null;
  for (const c of calendars) {
    if (last === null || c.yearEnd > last.yearEnd) last = c;
  }
  return last;
}

/** Today as a civil date, for the one argument `pickAcademicYear` takes.
 *  Separate so the picking rule stays pure and the clock read is one call
 *  either side can make. */
export function todayCivil(now: Date = new Date()): CivilDate {
  return now.toISOString().slice(0, 10);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE DIFF — what a calendar change does to a year
   ══════════════════════════════════════════════════════════════════════════

   The preview the plan asks for starts here, in the pure layer, because the
   week-level half of the answer needs no database at all: two resolved years,
   compared. The occurrence-level half — "moves 214 occurrences across 31
   bookings, 6 now clash" — needs the ledger and lives in
   convex/timetableSeries.ts.
   ══════════════════════════════════════════════════════════════════════════ */

export type WeekChange = {
  monday: CivilDate;
  from: number | null;
  to: number | null;
  fromLabel: string | null;
  toLabel: string | null;
  fromTeaching: boolean;
  toTeaching: boolean;
  /**
   * ⚠️ THE DAY-LEVEL HALF. Mon–Fri actually taught, before and after. A week
   * can keep its number, keep teaching, and still stop hosting a Friday
   * lesson — see the `"days"` kind below.
   */
  fromTaughtWeekdays: number[];
  toTaughtWeekdays: number[];
  /** `"days"` means the NUMBER did not move; the taught days did. */
  kind: "cycle" | "teaching" | "days" | "both";
};

/**
 * Mon–Fri this week actually teaches: run by the school, inside the year, and
 * not closed.
 *
 * ⚠️ THIS IS THE SET `weekHosts` DECIDES ON, so it is the set `diffYears` has
 * to compare. Comparing only `cycleWeek` and `isTeachingWeek` is the
 * granularity trap pointing the other way: a week whose Friday closed keeps
 * its number and keeps teaching, so a week-granular diff reports nothing at
 * all while every Friday occurrence in it has silently stopped being hosted.
 */
export function taughtWeekdaysOf(week: WeekFacts): number[] {
  return TEACHING_WEEKDAYS.filter(
    (wd) =>
      !week.closedWeekdays.includes(wd) && !week.untaughtWeekdays.includes(wd),
  );
}

function sameDays(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/**
 * Which weeks a proposed change moves.
 *
 * ⚠️ IT REPORTS THREE KINDS OF MOVEMENT, NOT TWO. The cycle week, the teaching
 * flag, AND the set of taught weekdays — because `weekHosts` in
 * convex/timetableSeries.ts (and the identical `hostsNow` in
 * convex/lib/timetableRead.ts) test the day, not only the week. The Mondays
 * this function returns are the ONLY Mondays `diffOccurrences` walks and the
 * only ones `rewriteBatch` reconciles, so a change this function cannot see is
 * a change that is applied to the calendar and never to the bookings.
 *
 * Concretely: add an INSET Friday, and without the day comparison the preview
 * says "no booking moves", the commit needs no confirmation, and the minibus
 * stays booked out on a day the school is shut — holding its slots against
 * everybody else.
 *
 * ⚠️ `fromDay` FREEZES THE PAST. Weeks whose Monday is before it are compared
 * and reported as unchanged whatever the rule now says, because a minibus that
 * went out on Week A went out on Week A. Passing `undefined` compares
 * everything and is for the year preview's "what would this look like", never
 * for anything that then writes.
 */
export function diffYears(
  before: ResolvedWeek[],
  after: ResolvedWeek[],
  fromDay?: number,
): WeekChange[] {
  const beforeBy = new Map(before.map((w) => [w.monday, w]));
  const out: WeekChange[] = [];
  for (const a of after) {
    if (fromDay !== undefined && a.mondayDay < fromDay) continue;
    const b = beforeBy.get(a.monday);
    if (!b) continue;
    const cycleMoved = b.cycleWeek !== a.cycleWeek;
    const teachingMoved = b.isTeachingWeek !== a.isTeachingWeek;
    const fromTaughtWeekdays = taughtWeekdaysOf(b);
    const toTaughtWeekdays = taughtWeekdaysOf(a);
    const daysMoved = !sameDays(fromTaughtWeekdays, toTaughtWeekdays);
    if (!cycleMoved && !teachingMoved && !daysMoved) continue;
    out.push({
      monday: a.monday,
      from: b.cycleWeek,
      to: a.cycleWeek,
      fromLabel: b.label,
      toLabel: a.label,
      fromTeaching: b.isTeachingWeek,
      toTeaching: a.isTeachingWeek,
      fromTaughtWeekdays,
      toTaughtWeekdays,
      /* The number moving is the headline when it moves; `"days"` is what is
         left when it did not. */
      kind: cycleMoved && teachingMoved
        ? "both"
        : cycleMoved
          ? "cycle"
          : teachingMoved
            ? "teaching"
            : "days",
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE WEEK GRID — `override ?? template ?? free`, resolved at READ TIME
   ══════════════════════════════════════════════════════════════════════════

   ⚠️ THE TEMPLATE IS NEVER MATERIALISED INTO EVERY WEEK.

   3 cycle weeks × 8 periods × 5 days × 50 resources × 39 weeks is 234,000 rows
   per school per year, on a deployment already over its plan limits, to store
   a fact that is one lookup away. The template is stored ONCE per cycle week
   and resolved here, against whatever concrete bookings actually exist.

   The precedence, and it is the whole of the model:

     CLOSED / OUT OF TERM   the day is not taught. Nothing runs, including the
                            template. This wins over everything.
     BOOKING                a real `bookings` row overlapping the period. The
                            OVERRIDE — somebody has actually taken the room.
     TEMPLATE               the standing entry for this cycle week. INHERITED.
     FREE                   nothing.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ ONE ROW OF THE SCHOOL DAY: A LABEL, A POSITION, AND A BOOKABLE FLAG.
 *
 * Cam's own file, measured cell by cell:
 *
 *     Tutor · 1 · 2 · Break 1 · 3 · 4 · Break 2 · 5 · After School
 *
 * — nine rows, of which two are not bookable. "Where the breaks are" is
 * therefore not a separate concept at all: it is which rows have `isTeaching`
 * off. Nothing anywhere matches on the word "Break", so a school that calls it
 * Lunch, Registration or Tutor gets the same treatment.
 *
 * ⚠️ `ordinal` IS THE IDENTITY AND `order` IS THE POSITION, and they are two
 * fields on purpose.
 *
 * `bookingTemplateSlots.periodOrdinal` and `bookingSeries.periodOrdinal` point
 * at a period BY ORDINAL — there is no foreign key to the document. So if
 * reordering renumbered ordinals, dragging "Break 1" above "2" would silently
 * re-point every standing entry and every recurring booking at a DIFFERENT row
 * of the day, with no diff to show and nothing in the UI to explain it. Keeping
 * the ordinal fixed and moving a separate `order` makes a reorder cost exactly
 * nothing: no booking moves, because no booking's key changed.
 *
 * ⚠️ `isTeaching` IS THE BOOKABLE FLAG. The stored name predates the word the
 * product uses; the UI says "Bookable", the exported workbook says `bookable`,
 * and `convex/lib/timetableSheet.ts` maps one to the other. Renaming the field
 * would mean migrating live documents for no user-visible gain, which is the
 * rule CLAUDE.md sets for exactly this case. It is ALSO not "a lesson happens
 * here": After School is bookable and is not a lesson.
 */
export type PeriodDef = {
  /** ⚠️ STABLE. The key templates and recurring bookings hold. Never
   *  renumbered by a reorder — see the block above. */
  ordinal: number;
  name: string;
  /** ⚠️ Both times are OPTIONAL, and deliberately so: this school LABELS its
   *  periods rather than timing them, and demanding a clock time would make an
   *  admin invent one. When both are set they are wall clock in the calendar's
   *  zone and they are what makes an untimed ad-hoc booking collide with a
   *  lesson; when they are absent the row is a position in the day and nothing
   *  more, and no clash can be computed against it. */
  start?: string;
  end?: string;
  /** ⭐ WHERE THE ROW SITS. Absent falls back to `ordinal`, which is what
   *  every period written before this field existed does. */
  order?: number;
  /** Set for a day that runs a different shape — a Friday that finishes early.
   *  Absent means "every teaching day". */
  weekday?: number;
  /** ⭐ BOOKABLE. False for registration, break, lunch: drawn so the grid reads
   *  like a real day, and never offered as free space. */
  isTeaching: boolean;
};

/** Where a period sits in the day. `order` when it has one, its ordinal when
 *  it does not — so a calendar that predates `order` reads exactly as before. */
export function periodPosition(p: Pick<PeriodDef, "ordinal" | "order">): number {
  return p.order ?? p.ordinal;
}

/** Sort periods into the order the day runs in. Position first, ordinal as the
 *  tie-break, so two rows that somehow share a position are still stable. */
export function sortPeriods<T extends Pick<PeriodDef, "ordinal" | "order">>(
  periods: T[],
): T[] {
  return [...periods].sort(
    (a, b) => periodPosition(a) - periodPosition(b) || a.ordinal - b.ordinal,
  );
}

/** Both ends set, so a window can actually be computed. A period with one time
 *  and not the other is untimed — half a window is not a window. */
export function periodIsTimed(
  p: Pick<PeriodDef, "start" | "end">,
): p is Pick<PeriodDef, "start" | "end"> & { start: string; end: string } {
  return !!p.start && !!p.end;
}

export type TemplateEntry = {
  id: string;
  cycleWeek: number;
  weekday: number;
  periodOrdinal: number;
  label?: string;
  note?: string;
};

export type ConcreteOccurrence = {
  id: string;
  startUtc: number;
  endUtc: number;
  status: string;
  label?: string;
  /** Set when the row came from a recurring series, so the grid can show
   *  "from the template" rather than "somebody booked this". */
  seriesId?: string;
};

export type GridCellState =
  | "free"
  | "template"
  | "booked"
  | "series"
  | "closed"
  /** ⭐ THE SCHOOL DOES NOT RUN THIS DAY, or the day is outside the year.
   *  Called `"out-of-term"` while terms existed; a school with no terms cannot
   *  have a day outside one. */
  | "not-taught"
  | "non-teaching";

export type GridCell = {
  weekday: number;
  periodOrdinal: number;
  periodName: string;
  /** Absent on an UNTIMED period. The cell is still drawn — it is a row of the
   *  day — but nothing can be matched into it by time. */
  start?: string;
  end?: string;
  state: GridCellState;
  /** What is IN the cell — a booking's purpose, or the template's label. */
  label?: string;
  /** ⭐ INHERITED vs OVERRIDDEN, which is the thing the plan asks the UI to
   *  show. True when a concrete row is sitting on top of a template entry. */
  overridesTemplate: boolean;
  /** The template entry underneath, when there is one, so the UI can say what
   *  was displaced. */
  templateLabel?: string;
  occurrenceId?: string;
  templateId?: string;
};

/**
 * Where one occurrence of a recurring booking actually lands.
 *
 * ⭐ THE PERIOD GRID WINS OVER THE STORED TIMES when the series names a
 * period. That is what makes "period 5 every Week A Tuesday" survive the
 * school moving period 5 ten minutes later: the rule names the period, and the
 * period names the clock. A series that stores only 14:05–15:05 is a series
 * that is wrong the day the bell times change and nobody knows why.
 *
 * ⚠️ AND THE TIMES ARE WALL CLOCK IN THE CALENDAR'S ZONE. `periodWindow`
 * resolves them against the real offset on that date, so period 5 is period 5
 * on both sides of the March clock change — see `zonedTimeToUtc`.
 */
export function seriesOccurrenceWindow(input: {
  monday: CivilDate;
  weekday: number;
  startTime: string;
  endTime: string;
  periodOrdinal?: number;
  periods: PeriodDef[];
  timezone: string;
}): {
  date: CivilDate;
  startUtc: number;
  endUtc: number;
  adjusted: ClockAdjustment;
} | null {
  const mondayDay = dayNumber(input.monday);
  if (mondayDay === null) return null;
  if (input.weekday < 1 || input.weekday > 7) return null;
  const date = civilOf(mondayDay + (input.weekday - 1));

  let start = input.startTime;
  let end = input.endTime;
  if (input.periodOrdinal !== undefined) {
    const p = periodsForWeekday(input.periods, input.weekday).find(
      (x) => x.ordinal === input.periodOrdinal,
    );
    /* A period the calendar no longer has falls back to the stored times
       rather than dropping the occurrence: a deleted period must not silently
       delete a term's worth of minibus bookings.
       ⚠️ AND SO DOES AN UNTIMED ONE. A school that labels its periods without
       timing them has nothing here for the bell to say, so the series keeps the
       times it was created with. `timetablePeriods.previewDayShape` counts
       exactly these when somebody clears a period's times, because from the
       user's side the lesson has quietly stopped following the bell. */
    if (p && periodIsTimed(p)) {
      start = p.start;
      end = p.end;
    }
  }

  const win = periodWindow(date, start, end, input.timezone);
  return win ? { date, ...win } : null;
}

export function periodsForWeekday(periods: PeriodDef[], weekday: number): PeriodDef[] {
  const specific = periods.filter((p) => p.weekday === weekday);
  const general = periods.filter((p) => p.weekday === undefined);
  /* A weekday-specific period REPLACES the general one with the same ordinal —
     a Friday period 5 that ends at 14:30 is the same slot, differently timed,
     not a sixth lesson. */
  const byOrdinal = new Map<number, PeriodDef>();
  for (const p of general) byOrdinal.set(p.ordinal, p);
  for (const p of specific) {
    const base = byOrdinal.get(p.ordinal);
    /* ⭐ THE VARIANT INHERITS THE ROW'S POSITION. A Friday-only period 5 sits
       where period 5 sits; letting it carry its own `order` would let one day
       print its rows in a different sequence from every other day, which is a
       different day shape wearing the same ordinals. `timetablePeriods` keeps
       the whole ordinal group's `order` in step on write, and this line means a
       variant written before that still lands in the right place. */
    byOrdinal.set(p.ordinal, { ...p, order: base?.order ?? p.order });
  }
  return sortPeriods([...byOrdinal.values()]);
}

/**
 * One resource's week, resolved.
 *
 * `week` supplies the closures and the cycle week; `templates` should already
 * be filtered to that cycle week (the caller reads them by index, so filtering
 * here would be a second, weaker filter over rows it had no need to fetch).
 */
export function resolveWeekGrid(input: {
  week: ResolvedWeek;
  timezone: string;
  periods: PeriodDef[];
  templates: TemplateEntry[];
  occurrences: ConcreteOccurrence[];
}): GridCell[] {
  const { week, timezone, periods, templates, occurrences } = input;
  const cells: GridCell[] = [];

  for (const weekday of TEACHING_WEEKDAYS) {
    const date = civilOf(week.mondayDay + (weekday - 1));
    const closed = week.closedWeekdays.includes(weekday);
    const notTaught = week.untaughtWeekdays.includes(weekday);

    for (const p of periodsForWeekday(periods, weekday)) {
      const base: GridCell = {
        weekday,
        periodOrdinal: p.ordinal,
        periodName: p.name,
        start: p.start,
        end: p.end,
        state: "free",
        overridesTemplate: false,
      };

      const tpl =
        week.cycleWeek === null
          ? undefined
          : templates.find(
              (t) =>
                t.cycleWeek === week.cycleWeek &&
                t.weekday === weekday &&
                t.periodOrdinal === p.ordinal,
            );
      if (tpl) {
        base.templateId = tpl.id;
        base.templateLabel = tpl.label;
      }

      /* Precedence, top down. A closed day is closed even if a booking exists
         in it — that booking is a letting or a mistake, and either way the
         lesson is not running. */
      if (notTaught) {
        base.state = "not-taught";
        cells.push(base);
        continue;
      }
      if (closed) {
        base.state = "closed";
        base.label = week.closureLabels[0];
        cells.push(base);
        continue;
      }
      if (!week.isTeachingWeek) {
        base.state = "non-teaching";
        base.label = week.closureLabels[0];
        cells.push(base);
        continue;
      }

      /* ⚠️ AN UNTIMED PERIOD CANNOT COLLIDE WITH ANYTHING, and saying so is
         the honest answer rather than a gap. The overlap test below is by
         INSTANT — it is what makes an ad-hoc 12:30–13:15 booking show up on
         the row called "Break 2" — and a row with no clock has no instants to
         compare. It still draws, because it is still part of the day. */
      const win = periodIsTimed(p)
        ? periodWindow(date, p.start, p.end, timezone)
        : null;
      const hit = win
        ? occurrences.find(
            (o) =>
              (o.status === "approved" || o.status === "pending") &&
              o.startUtc < win.endUtc &&
              win.startUtc < o.endUtc,
          )
        : undefined;

      if (hit) {
        base.state = hit.seriesId ? "series" : "booked";
        base.label = hit.label;
        base.occurrenceId = hit.id;
        /* ⭐ The inherited/overridden badge. A one-off booking sitting on a
           template cell is an OVERRIDE; a series occurrence generated FROM the
           template is not. */
        base.overridesTemplate = !!tpl && !hit.seriesId;
      } else if (tpl) {
        base.state = "template";
        base.label = tpl.label;
      }

      cells.push(base);
    }
  }

  return cells;
}
