/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE ROTA — a list, a cadence, a turn-taking order, and boxes to tick
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every school runs the same shape of job against different lists. IT rooms
 * cleaned and damage reported. Fire extinguishers. Fire doors. PAT testing.
 * Minibus walk-rounds. Legionella flushing. Fridge temperatures. All of them
 * are *a list of things, a frequency, whose turn it is, and a few boxes* — and
 * all of them are currently a spreadsheet somebody copies down forty-six rows
 * and fixes by hand when the INSET day moves.
 *
 * ⚠️ SO THE THING BEING CHECKED IS DELIBERATELY NOT CALLED A ROOM. It is an
 * ITEM, and it carries a code rather than a room number. The first preset is
 * an IT room rota because that is the file this was specified from; naming the
 * type after it would have made every later preset a special case of a room.
 *
 * ── ⭐ WEIGHT, NOT PAIRS ─────────────────────────────────────────────────
 * The reference workbook pairs its small rooms by name — N11 + A4, H22 + T11,
 * T21 + T22 — in a "Checked With" column. This model uses a WEIGHT instead:
 * a full room is 1, a small one is 0.5, and each period is filled until the
 * quota is met. Two halves land together and print as a group.
 *
 * ⚠️ WHICH MEANS THE GROUPINGS CAN MOVE WHEN THE LIST CHANGES, where named
 * pairs never do. That is the accepted cost of the general version, and it is
 * bounded by `generateRota` being PURE AND DETERMINISTIC: the same list in the
 * same order always produces the same rota, so it shifts when somebody edits
 * the list and at no other time.
 *
 * ── ⚠️ AND THE CYCLE KEEPS TURNING THROUGH THE HOLIDAYS, BY DEFAULT ──────
 * The reference workbook assigns rooms through Half Term, Christmas and Easter
 * — weeks 8, 9, 16 and 17 all carry rooms, greyed and labelled. That is not an
 * oversight in the source file, it is how that school runs it, so
 * `runThroughClosures` defaults TRUE and the option exists for schools that
 * stop.
 */

import {
  addDays,
  civilOf,
  dayNumber,
  mondayOfDay,
  type CivilDate,
} from "../lib/timetable";

/* ══════════════════════════════════════════════════════════════════════════
   THE SHAPE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * How often a turn comes round.
 *
 * ⚠️ `daily` IS ACCEPTED BY THE MODEL AND NOT BY THE WEEK-PER-ROW WORKBOOK.
 * A fridge-temperature rota is real and is genuinely daily, but a sheet with
 * one row per day is a different sheet — a month per tab, not a year per tab.
 * The generator produces the periods correctly; the writer refuses the layout
 * rather than printing 365 rows nobody can read. See `rotaWorkbook.ts`.
 */
export type RotaCadence = "daily" | "weekly" | "fortnightly" | "monthly" | "termly";

export const ROTA_CADENCES: readonly RotaCadence[] = [
  "daily",
  "weekly",
  "fortnightly",
  "monthly",
  "termly",
] as const;

/** What a column collects. Decides the cell's width, format and validation. */
export type RotaColumnKind =
  | "tick"
  | "text"
  | "number"
  | "date"
  | "temperature"
  | "person";

export type RotaColumn = {
  id: string;
  label: string;
  kind: RotaColumnKind;
  /** Printed width in Excel characters. Absent takes the kind's default. */
  width?: number;
};

/**
 * One thing that gets checked.
 *
 * ⚠️ `weight` IS A SHARE OF A TURN, NOT A PRIORITY. 1 is a whole turn, 0.5 is
 * half — two of them fill one. It is never zero: a thing worth no turn is a
 * thing that should be `active: false`, and a zero would let the filler loop
 * for ever without ever meeting the quota.
 */
export type RotaItem = {
  id: string;
  /** "N21". Printed in the rota's own column. */
  code: string;
  /** Longer name, when the code is not self-explanatory. Optional. */
  name?: string;
  /** 1 = a whole turn, 0.5 = half. Absent means 1. */
  weight?: number;
  /** The school's own facts, printed on the items sheet — "No of PCs": "33". */
  facts?: Record<string, string | null>;
  notes?: string;
  /** Absent means in service. A retired item takes no turns. */
  active?: boolean;
};

/** What somebody recorded for one scheduled slot. Keyed by column id. */
export type RotaRecord = Record<string, string | null>;

/**
 * One period's worth of scheduled work, as GENERATED.
 *
 * ⚠️ THIS IS DERIVED AND IS NOT STORED IN THE FILE. `generateRota` walks it
 * from the rule every time, exactly as `buildYear` walks the timetable's weeks
 * — a stored answer would let a file written under one version of the filler
 * disagree with the filler that reads it, and the school would have no way to
 * tell which half was stale. What IS stored is the RECORDS, keyed by date and
 * slot, because those are facts somebody typed rather than answers anybody can
 * recompute.
 */
export type RotaPeriod = {
  /** 1-based, as printed in the "Wk" column. */
  index: number;
  /** The Monday (or the day, for a daily cadence) the period starts on. */
  start: CivilDate;
  /** "Week A", "Half Term" — from the school's year when it has one. */
  label: string | null;
  /** Cycle week, when the year has a cycle. Drives the alternating fill. */
  cycleWeek: number | null;
  /** False on a closure. Drives the grey fill, and the skip when configured. */
  teaching: boolean;
  /** The groups scheduled this period. One group is one printed row. */
  slots: RotaSlot[];
};

/** One printed row: the items sharing a turn, and what was recorded for them. */
export type RotaSlot = {
  /** The items in this turn. More than one when weights combine. */
  itemIds: string[];
  /** "N11 + A4". Built from the items' codes, in list order. */
  label: string;
};

export type SchoolRota = {
  id: string;
  /** "IT Room Checking Rota". Printed as the workbook's title. */
  name: string;
  /** Which preset it started from. Purely informational after creation. */
  preset?: string;
  cadence: RotaCadence;
  /** Turns per period, in weight units. The reference file's is 2. */
  quota: number;
  columns: RotaColumn[];
  items: RotaItem[];
  /**
   * ⭐ WHERE THE PERIODS COME FROM. `"year"` follows the academic year the file
   * already holds — its dates, its closures and its Week A / Half Term labels,
   * so a rota reads in the same vocabulary as the timetable beside it.
   * `"own"` carries its own dates, which is what lets a school with no
   * timetable at all still run a fire-door rota.
   */
  source: "year" | "own";
  /** Read when `source` is `"year"`. Absent uses the file's picked year. */
  yearId?: string;
  /** Read when `source` is `"own"`. */
  start?: CivilDate;
  end?: CivilDate;
  /**
   * ⚠️ DEFAULTS TRUE — see the banner. The reference workbook keeps assigning
   * through Half Term, Christmas and Easter, and that is a real school's real
   * practice rather than a bug in the source file.
   */
  runThroughClosures?: boolean;
  /**
   * ⭐ WHAT THE THINGS ARE CALLED. "Room" gives a sheet named Rooms and a column
   * headed "Room(s) to Check"; "Extinguisher" gives Extinguishers and
   * "Extinguisher(s) to Check". Absent gives the generic "Item".
   *
   * ⚠️ THIS IS THE WHOLE OF THE GENERALISATION, ON THE PRINTED SIDE. Without it
   * a school's fire-door rota prints a sheet called "Items" — technically
   * correct, and not what anybody would have typed. One word, and the workbook
   * reads as though it were written for the job.
   */
  itemNoun?: string;
  /** A line under the title, for "Checked by: CDH" and the like. */
  subtitle?: string;
  /** Recorded values, keyed `${period.start}#${slotIndex}`. */
  records?: Record<string, RotaRecord>;
};

/* ══════════════════════════════════════════════════════════════════════════
   THE FILLER
   ══════════════════════════════════════════════════════════════════════════ */

/** A period the caller has already worked out, before slots are filled in. */
export type RotaFrame = {
  start: CivilDate;
  label: string | null;
  cycleWeek: number | null;
  teaching: boolean;
};

const weightOf = (item: RotaItem): number => {
  const w = item.weight;
  /* ⚠️ A NON-POSITIVE WEIGHT IS COERCED TO A WHOLE TURN, never honoured. Zero
     would let the fill loop spin without ever reaching the quota, and a
     negative one would unfill. A thing worth no turn is `active: false`. */
  return typeof w === "number" && w > 0 ? w : 1;
};

const labelFor = (items: RotaItem[]): string =>
  items.map((i) => i.code).join(" + ");

/**
 * ⭐⭐ FILL EVERY PERIOD FROM ONE CONTINUOUS ROUND-ROBIN.
 *
 * The cursor walks the item list once and keeps going, wrapping at the end —
 * it is NOT reset per period. That is what makes the reference workbook's week
 * 8 read `T21 + T22` then `N21`: the list ran out mid-week and carried on from
 * the top. Resetting per period would give every week the same first item.
 *
 * ⚠️ PURE AND DETERMINISTIC. No clock, no randomness, no mutation of the
 * input. The same items in the same order always produce the same rota, which
 * is the only reason weight-based grouping is safe to ship — it moves when
 * somebody edits the list and never on its own.
 */
export function fillRota(
  frames: readonly RotaFrame[],
  items: readonly RotaItem[],
  quota: number,
  runThroughClosures: boolean,
): RotaPeriod[] {
  const active = items.filter((i) => i.active !== false);
  const target = quota > 0 ? quota : 1;

  const out: RotaPeriod[] = [];
  let cursor = 0;

  frames.forEach((frame, i) => {
    const period: RotaPeriod = {
      index: i + 1,
      start: frame.start,
      label: frame.label,
      cycleWeek: frame.cycleWeek,
      teaching: frame.teaching,
      slots: [],
    };

    /* ⚠️ A SKIPPED PERIOD STILL APPEARS, WITH NO SLOTS. It keeps its number and
       its row so the printed sheet still shows the school closed that week —
       dropping the row entirely would renumber every week after it and make
       the sheet disagree with the calendar beside it. */
    const skip = !frame.teaching && !runThroughClosures;
    if (active.length === 0 || skip) {
      out.push(period);
      return;
    }

    let filled = 0;
    /* Bounded by the item count: even at weight 0.5 a period cannot need more
       turns than there are items, and the guard means a pathological list
       cannot hang the export. */
    let guard = 0;
    while (filled < target && guard < active.length * 2 + 2) {
      const group: RotaItem[] = [];
      let groupWeight = 0;

      /* One SLOT is one printed row, and it takes whole items until it has a
         full turn's worth. A 1.0 fills it alone; two 0.5s share it. */
      while (groupWeight < 1 && guard < active.length * 2 + 2) {
        const item = active[cursor % active.length];
        cursor++;
        guard++;
        group.push(item);
        groupWeight += weightOf(item);
      }

      period.slots.push({ itemIds: group.map((g) => g.id), label: labelFor(group) });
      filled += groupWeight;
    }

    out.push(period);
  });

  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PERIODS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Walk the frames for a rota that carries its OWN dates.
 *
 * ⚠️ EVERY PERIOD IS A TEACHING PERIOD HERE. A rota with its own dates has no
 * closure list to consult, so nothing is grey and nothing is skipped. When a
 * school wants its holidays honoured it sets `source: "year"` and the frames
 * come from the academic year, which knows them.
 */
export function ownFrames(
  start: CivilDate,
  end: CivilDate,
  cadence: RotaCadence,
  max = 400,
): RotaFrame[] {
  const a = dayNumber(start);
  const b = dayNumber(end);
  if (a === null || b === null || b < a) return [];

  const step = cadence === "daily" ? 1 : cadence === "fortnightly" ? 14 : 7;
  /* ⚠️ MONTHLY AND TERMLY ARE WALKED IN DAYS, NOT IN CALENDAR MONTHS. 28 and 91
     are approximations on purpose: a rota is "about every month", and a real
     month boundary would make the printed interval jump between 28 and 31 days
     for no benefit anybody checking a fire extinguisher would notice. */
  const stride = cadence === "monthly" ? 28 : cadence === "termly" ? 91 : step;

  /* Weekly-ish cadences start on the Monday of the first week, so the printed
     "Week Commencing" column is always a Monday — which is what the reference
     workbook shows and what a school reads. */
  const first = cadence === "daily" ? a : mondayOfDay(a);

  const frames: RotaFrame[] = [];
  for (let d = first; d <= b && frames.length < max; d += stride) {
    frames.push({ start: civilOf(d), label: null, cycleWeek: null, teaching: true });
  }
  return frames;
}

/**
 * Turn the resolved weeks of an academic year into frames.
 *
 * ⭐ THE LABELS AND THE CYCLE COME STRAIGHT THROUGH, so a rota prints
 * "Week A" and "Half Term" in the same words the timetable uses. Two sheets
 * from one school that disagreed about what a week is called would be worse
 * than either of them being wrong on its own.
 *
 * ⚠️ FORTNIGHTLY AND MONTHLY TAKE EVERY NTH WEEK OF THE YEAR, counted from the
 * first — not "every other TEACHING week". A school that skipped closed weeks
 * in the count would find its fortnightly check landing on a different weekday
 * of the term after every holiday.
 */
export function yearFrames(
  weeks: ReadonlyArray<{
    monday: CivilDate;
    label: string | null;
    cycleWeek: number | null;
    isTeachingWeek: boolean;
    /**
     * ⚠️ THE TWO DAY-LEVEL LISTS, AND THEY ONLY MATTER FOR `daily`.
     *
     * Every other cadence is a WEEK, and a week's own `isTeachingWeek` answers
     * it. A DAILY rota is days, and the week-level flag cannot: a Mon–Thu
     * school teaches four days and a week holding one INSET day teaches four
     * of five. `taughtWeekdaysOf` and the two grids read exactly this pair for
     * exactly this reason — see the granularity trap banner in `timetable.ts`.
     *
     * Optional, because a caller with only week-level facts still gets the old
     * behaviour rather than an error.
     */
    closedWeekdays?: readonly number[];
    untaughtWeekdays?: readonly number[];
  }>,
  cadence: RotaCadence,
): RotaFrame[] {
  const every = cadence === "fortnightly" ? 2 : cadence === "monthly" ? 4 : cadence === "termly" ? 13 : 1;

  const picked = weeks.filter((_, i) => i % every === 0);
  const weekly = picked.map((w) => ({
    start: w.monday,
    label: w.label,
    cycleWeek: w.cycleWeek,
    teaching: w.isTeachingWeek,
  }));

  if (cadence !== "daily") return weekly;

  /**
   * ⚠️⚠️ A DAILY ROTA IS THE TAUGHT WEEKDAYS, NOT MONDAY TO FRIDAY.
   *
   * This emitted five days a week unconditionally while its own comment
   * claimed it emitted "every taught weekday" — so a Mon–Thu school got a
   * Friday row every week of the year, and a week holding one INSET day got a
   * row for the day the school was shut. Somebody would have had to tick, or
   * explain, a check on a day nobody was in the building.
   *
   * ⚠️ THE WEEK-LEVEL FLAG STILL APPLIES ON TOP. A closed WEEK produces its
   * days with `teaching: false` rather than producing none, because the row
   * has to survive for `runThroughClosures` to have anything to run through —
   * the same reason a closed week keeps its row everywhere else.
   */
  const out: RotaFrame[] = [];
  picked.forEach((week, i) => {
    const frame = weekly[i];
    const skip = new Set<number>([
      ...(week.closedWeekdays ?? []),
      ...(week.untaughtWeekdays ?? []),
    ]);
    for (let d = 0; d < 5; d++) {
      /* `d` is an offset from Monday; the lists are weekdays 1-5. */
      if (skip.has(d + 1)) continue;
      const day = addDays(frame.start, d);
      if (!day) continue;
      out.push({ start: day, label: frame.label, cycleWeek: frame.cycleWeek, teaching: frame.teaching });
    }
  });
  return out;
}

/**
 * ⭐⭐ NAME EACH CLOSED FRAME AFTER THE CLOSURE THAT CLOSED IT.
 *
 * A closed week has no cycle position, so `buildYear` gives it `label: null`
 * and a timetable prints the generic "No timetable" in its corner — right,
 * because that corner is answering "which week of the CYCLE is this".
 *
 * ⚠️ A ROTA IS ANSWERING A DIFFERENT QUESTION AND THE GENERIC WORD IS WRONG
 * FOR IT. The reference workbook names weeks 8, 9, 16 and 17 "Half Term",
 * "Christmas" and "Easter". Eight rows all reading "No timetable" tell a
 * school nothing — and the school already typed the right word once, when it
 * entered the closure.
 *
 * ⚠️ THE LONGEST OVERLAP WINS, NOT THE FIRST MATCH. A week holding an INSET
 * day on the Monday and the first four days of Christmas would otherwise be
 * called "INSET" — which a reader takes to mean "the week we came back".
 *
 * ⚠️ AND IT RUNS BEFORE `fillRota`, NEVER AFTER. The filler copies a frame's
 * label onto the period it produces; relabelling the periods afterwards would
 * be a second pass over the same data that a later change to the filler could
 * silently start disagreeing with.
 *
 * ⭐ SHARED BY BOTH PROGRAMS, WHICH IS WHY IT IS HERE rather than in either
 * one's own build step. This file is byte-pinned between the free tool and
 * Monospace (`provenance.test.ts`), so the two cannot start naming the same
 * week differently.
 */
export function labelClosedFrames(
  frames: readonly RotaFrame[],
  closures: ReadonlyArray<{ label: string; start: CivilDate; end: CivilDate }>,
): RotaFrame[] {
  if (closures.length === 0) return frames.map((f) => ({ ...f }));

  const nameFor = (start: CivilDate): string | null => {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (d) days.push(d);
    }
    let best: { label: string; days: number } | null = null;
    for (const c of closures) {
      const covered = days.filter((d) => d >= c.start && d <= c.end).length;
      if (covered === 0) continue;
      if (!best || covered > best.days) best = { label: c.label, days: covered };
    }
    return best?.label?.trim() || null;
  };

  return frames.map((f) =>
    f.teaching || f.label ? { ...f } : { ...f, label: nameFor(f.start) },
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   READING ONE BACK
   ══════════════════════════════════════════════════════════════════════════ */

/** The key a recorded row is stored under. Stable across a regenerate. */
export function recordKey(period: RotaPeriod, slotIndex: number): string {
  return `${period.start}#${slotIndex}`;
}

/**
 * ⚠️ THE GROUPINGS LINE, GENERATED RATHER THAN TYPED. The reference workbook's
 * third row reads "Small rooms are paired and checked together: N11 + A4,
 * H22 + T11, T21 + T22" — a sentence somebody maintained by hand and which
 * therefore disagreed with the rota below it the moment a room moved. This
 * derives it from the rota that was actually produced.
 */
export function groupingsLine(periods: readonly RotaPeriod[]): string {
  const seen = new Set<string>();
  for (const p of periods) {
    for (const s of p.slots) {
      if (s.itemIds.length > 1) seen.add(s.label);
    }
  }
  return seen.size === 0 ? "" : [...seen].join(",  ");
}
