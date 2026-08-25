/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE MODEL BUILDER — LIFTED OUT OF MONOSPACE'S EXPORT ROUTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Monospace builds `TimetableWorkbookModel` inside
 * `src/app/api/orgs/[orgId]/timetable/export/route.ts`, and that file is two
 * things wound together: ~90 gated Convex reads, and a pure assembly of what
 * they returned. Only the second half is a timetable engine. This is that
 * half, taking PLAIN OBJECTS — a `SchoolDocument` — and returning the model
 * the writer renders.
 *
 * ── ⭐ WHAT WAS LEFT BEHIND, AND WHY IT IS NOT MISSING ────────────────────
 * Everything in the route between the handshake and step 7 is I/O and its
 * failure modes: `connectOrgRoute`, the per-query ACL gates, the 5,000-row
 * booking budget, the 40-second deadline, the keyset cursor that must advance,
 * the `weekOverrides` refusal that degrades rather than 403-ing. Not one of
 * them has a meaning here. There is no network, no other tenant to be refused
 * on behalf of, and no serverless clock: the file is on the disk and it is all
 * of the data there is.
 *
 * ⚠️ SO THE `reasons` LIST IS SHORTER, AND THAT IS A REAL DIFFERENCE rather
 * than a simplification. `WorkbookNotes.complete` still means "this export
 * stopped early" and still prints "⚠️ INCOMPLETE" and still opens the workbook
 * on the info sheet. What can now cause it is exactly two things, both from
 * `buildYear()`: the year hit `MAX_WEEKS_PER_CALENDAR`, or the week map has a
 * gap in it. The bound-hit sentences are carried over word for word for those
 * two, because a school reading them should not be able to tell which program
 * generated the file.
 *
 * ── ⚠️ AND EVERY *PURE* RULE IS CARRIED OVER EXACTLY ──────────────────────
 * `buildDays`, `emptyDays`, `cellFor`, `asResolvedWeek` and `buildHalfTerms`
 * below are the route's own functions with their comments intact, because
 * those comments are the specification: each one records a measurement or a
 * defect that cost real work. In particular —
 *
 *   · `cellFor` is a MAPPING, not a rule. Every decision it looks like it is
 *     making was made by `resolvePublishedRoom`, which is the function the
 *     published board draws itself with. The version that decided things had a
 *     hole nothing could see.
 *   · the template sheet is built from a week with `closedWeekdays: []`, so
 *     one week's INSET day cannot punch a hole in the school's STANDING
 *     timetable — which under linking is data loss across the whole file.
 *   · `cycleWeekLabel` and never `weekLabels[cw] ?? "Week N+1"`, so a cycle
 *     narrowed from two to one says "Every week" on the template tab and on
 *     all 38 week tabs rather than on 38 of the 39.
 *   · `pickAcademicYear` and never `years[0]`, which is the school's OLDEST.
 */

import {
  civilOf,
  cycleWeekLabel,
  dayNumber,
  mondayOf,
  mondayOfDay,
  buildYear,
  periodsForWeekday,
  pickAcademicYear,
  todayCivil,
  type ConcreteOccurrence,
  type PeriodDef,
  type ResolvedWeek,
  type TemplateEntry,
} from "../lib/timetable";
import {
  cellRights,
  resolvePublishedRoom,
  WORKBOOK_ROOM_POLICY,
  type OverrideEntry,
  type PublishedCell,
  type RoomRights,
} from "../lib/bookingPublished";
import {
  HALF_TERM_WEEKS_PER_BLOCK,
  DAYS_PER_WEEK,
  MAX_CF_CLASS_RULES,
  assignSheetNames,
  colourForClass,
  compareClassCodes,
  daysAlign,
  periodLabelValue,
  resolveExportOptions,
  templateSheetLabel,
  weekHasEnded,
  weekSheetLabel,
  type SheetCell,
  type SheetDay,
  type TimetableExportOptions,
  type TimetableFieldDef,
  type TimetableRoom,
  type TimetableWorkbookModel,
} from "../lib/timetableSheet";
import { localDateOf } from "../lib/bookingTime";
import { weekBandFor } from "../lib/timetable/weekBand";
import { numericValue } from "../lib/bookingRooms";
import { resolveTimetableAccent } from "../lib/timetableAccent";
import { yearWeekLabels } from "./document";
import type {
  SchoolDocument,
  SchoolRoomSheet,
  SchoolYear,
} from "./document";

/**
 * ⭐⭐ WHO THE WORKBOOK IS LOCKED FOR — one viewer, named, and it is not the
 * person pressing Export.
 *
 * `lockPrefilled` is "`cellRights()` expressed in Excel", and `cellRights()`
 * takes a person. A file has no session: it is opened next term by whoever is
 * handed it, so the rights it is written against have to be a POLICY rather
 * than a lookup. This is that policy — AN ORDINARY MEMBER OF STAFF WHO MAY
 * BOOK THIS ROOM — and it produces exactly what the option's copy promises:
 *
 *   free            editable   "staff can then only edit the blanks"
 *   changed/cleared editable   ⭐ rule three — an ad-hoc note is not the
 *                              school's timetable and does not get its
 *                              protection.
 *   lesson          locked     the standing timetable.
 *   held            locked     the ledger's business, admins included.
 *   break / closed  locked     structure. Not space.
 *
 * ⚠️ `overrideAll` IS DELIBERATELY FALSE. On the board that switch says
 * ordinary staff may change a standing lesson, where the change is per week,
 * attributed, and reversible with one click. A spreadsheet cell is none of
 * those three: the "override" is a typed-over cell in a file on a laptop, and
 * it never reaches the school's timetable at all. A workbook that unlocked
 * every lesson because the board is permissive would be a form with nothing
 * left to fill in.
 *
 * ⚠️ `active` IS THE ROOM'S OWN, NOT A CONSTANT. A retired room keeps its
 * column — a grid is read POSITIONALLY and removing a column moves every room
 * to the right of it — and `cellRights` locks the whole column, which is what
 * "out of service" means on paper too.
 */
const workbookRights = (active: boolean): RoomRights => ({
  active,
  mayBook: true,
  mayOverride: false,
  overrideAll: false,
});

/** One printed column: the room its grid comes from, and the admin's facts
 *  about it. Built from the room sheet and from nothing else. */
type RoomColumn = {
  roomId: string;
  name: string;
  /** In service. Read by `workbookRights`, and by the `lockPrefilled` option
   *  note that NAMES the rooms whose whole column is locked — because a column
   *  that refuses every keystroke has to be explained to the person who meets
   *  it. */
  active: boolean;
  fields: Record<string, string | number>;
};

export type BuildModelInput = {
  document: SchoolDocument;
  /** Which academic year. Absent uses `pickAcademicYear` — NEVER `years[0]`. */
  yearId?: string;
  /**
   * ⚠️ STRAIGHT THROUGH TO `worksheet.protect()`, AND NOWHERE ELSE. Not
   * stored in the document, not logged, not printed on the info sheet. It is
   * a parameter of one export, which is why it is here and not in
   * `SchoolDocument`.
   */
  password?: string;
  /** Whose name goes on the info sheet. A desktop app has no session, so the
   *  app asks once and remembers it locally, or leaves it blank. */
  generatedBy?: string;
  /**
   * ⭐ THE CLOCK, INJECTED. `hideEndedWeeks` and `pickAcademicYear` both read
   * it, and a fixture that regenerated a different workbook every day would be
   * no fixture at all. Absent means now.
   */
  now?: number;
};

export type BuildModelResult =
  | { ok: true; model: TimetableWorkbookModel; suggestedFilename: string }
  | { ok: false; error: string };

/**
 * ⭐ THE WHOLE BUILD, PURELY. Same input, same bytes — which is what makes the
 * fixture gate possible at all.
 */
export function buildTimetableModel(input: BuildModelInput): BuildModelResult {
  const { document: doc } = input;
  const now = input.now ?? Date.now();
  const reasons: string[] = [];

  /* ── 1. Which year ──
        ⚠️ `pickAcademicYear` AND NEVER `years[0]`. The file's order is
        creation order, so `[0]` is the school's OLDEST year — the bug
        CLAUDE.md records five separate readers having had. */
  const year = pickYear(doc.years, input.yearId, now);
  if (!year) {
    return {
      ok: false,
      error: "That academic year is not in this file.",
    };
  }

  /* ── 2. What shape of file the school asked for ──
        RESOLVED once, here, so "absent means off" is answered in
        `resolveExportOptions()` and not again per option per call site. */
  const options: TimetableExportOptions = resolveExportOptions(doc.export);

  /* ── 3. The year: weeks, periods, the cycle labels ──
        ⭐ DERIVED, NEVER STORED. See the file-format banner: a saved answer
        would let the file disagree with the engine that reads it. */
  const built = buildYear({
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
    /* ⭐ `yearWeekLabels` AND NEVER `year.weekLabels ?? []`. Absent labels are
       the state of every year an app creates, and an empty array here reaches
       `cycleWeekLabel`'s `Week N+1` fallback — so the workbook's tabs came out
       `(1)` / `(2)` while every screen that offered them said Week A / Week B.
       See the banner on `yearWeekLabels`. */
    weekLabels: yearWeekLabels(year),
    taughtWeekdays: year.taughtWeekdays,
  });
  if (built.capped) {
    reasons.push(
      "The academic year hit an internal ceiling, so weeks may be missing from the end of this workbook.",
    );
  }
  if (!built.contiguous) {
    reasons.push(
      "The week map has a gap in it. Under 'pause' holidays that changes the cycle week of everything after the gap — check the calendar before relying on this file.",
    );
  }

  /**
   * ⚠️ `order` IS CARRIED, AND IT IS NOT OPTIONAL DECORATION.
   *
   * `ordinal` is a period's IDENTITY and `order` is WHERE IT SITS — two fields
   * precisely so that a reorder can move the row without re-pointing the
   * standing entries that hold its number. Every reader of a day sorts on
   * `periodPosition()`, which is `order ?? ordinal`.
   *
   * Drop `order` here and that fallback fires silently: `periodsForWeekday`
   * re-sorts by ORDINAL, so the workbook prints the day in the order the rows
   * were CREATED rather than the order the admin dragged them into. On screen
   * it is right, which is the worst version of this.
   */
  const periods: PeriodDef[] = year.periods.map((p) => ({
    ordinal: p.ordinal,
    name: p.name,
    start: p.start,
    end: p.end,
    order: p.order,
    weekday: p.weekday,
    isTeaching: p.isTeaching,
  }));
  if (periods.length === 0) {
    return {
      ok: false,
      error:
        "This timetable has no periods yet, so there is no day shape to export. Add the periods first.",
    };
  }

  /* ── 4. Which rooms, and which facts under them ── */
  const sheet = pickRoomSheet(doc.roomSheets, year.roomSheetId);
  if (!sheet) {
    return {
      ok: false,
      error:
        "This file has no room list, so there is nothing to print. Set one up first, choosing which rooms print and what to record about each.",
    };
  }
  if (sheet.rooms.length === 0) {
    return {
      ok: false,
      error: `"${sheet.name}" has no rooms on it yet, so there is nothing to print.`,
    };
  }

  const fieldDefs: TimetableFieldDef[] = sheet.fields.map((f) => ({
    id: f.id,
    label: f.label,
  }));
  /* `kind` decides whether "33" lands as a number or as text. The reference
     workbook stores its PC counts and extension numbers as numbers, and a
     column that is text in our file and numeric in theirs is exactly the
     difference that shows up the first time somebody sorts on it. */
  const numericField = new Set(
    sheet.fields.filter((f) => f.kind === "number").map((f) => f.id),
  );

  const columns: RoomColumn[] = sheet.rooms.map((room) => {
    const fields: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(room.values ?? {})) {
      /* ⚠️ `null` MEANS PRINT NOTHING, and is NOT "-". The school types "-"
         to mean "no teacher assigned" and that arrives here as the string
         "-", which is a value somebody chose. Inventing a placeholder for
         null would put words on a printed sheet nobody typed. */
      if (value === null || value === undefined) continue;
      /* ⚠️ `numericValue()` AND NOT `Number()`. The rule for "does this value
         want a numeric cell" is written once, in `bookingRooms.ts`, and is
         deliberately stricter than `Number()`, which reads "0x10" as 16 and
         "1e3" as 1000. A room whose Telephone says `0x10` must print `0x10`;
         a school types what it types. */
      const asNumber = numericField.has(key) ? numericValue(value) : null;
      fields[key] = asNumber === null ? value : asNumber;
    }
    return {
      roomId: room.id,
      name: room.name,
      /* Absent means in service — a file written before anybody retired
         anything must not retire everything. */
      active: room.active !== false,
      fields,
    };
  });

  const rooms: TimetableRoom[] = columns.map((c) => ({
    name: c.name,
    fields: c.fields,
  }));

  /* ── 5. The standing grids: one per room per cycle week ──
        NOT one per room per WEEK. `resolvePublishedRoom` applies a cycle
        week's grid to every week carrying that number, which is the entire
        reason the template is never materialised. */
  const templates: TemplateEntry[][][] = columns.map((room) => {
    const perCycle: TemplateEntry[][] = [];
    for (let cw = 0; cw < year.cycleLength; cw++) perCycle.push([]);
    for (const cell of year.templates ?? []) {
      if (cell.roomId !== room.roomId) continue;
      if (cell.cycleWeek < 0 || cell.cycleWeek >= year.cycleLength) continue;
      perCycle[cell.cycleWeek].push({
        id: cell.id,
        cycleWeek: cell.cycleWeek,
        weekday: cell.weekday,
        periodOrdinal: cell.periodOrdinal,
        label: cell.label,
        note: cell.note,
      });
    }
    return perCycle;
  });

  /* ── 6. The concrete bookings that OVERRIDE the standing grid ── */
  const teaching = built.weeks.filter((w) => w.isTeachingWeek);
  /**
   * ⚠️ KEYED BY ROOM **AND WEEK**, not by room alone.
   *
   * `resolvePublishedRoom` does a linear `occurrences.find()` per cell.
   * Handing it one room's whole year is 45 cells × every booking × 39 weeks ×
   * 20 rooms — tens of millions of comparisons for a grid 45 cells wide.
   * Bucketing by the Monday of the booking's own LOCAL date makes each call
   * see only that week.
   *
   * `localDate` is the civil date in the school's timezone, so the bucket
   * boundary is the school's midnight rather than UTC's — the same boundary
   * the grid is drawn on.
   */
  const occurrences = new Map<string, ConcreteOccurrence[]>();
  for (const b of year.bookings ?? []) {
    const localDate = b.localDate ?? localDateOf(b.startUtc, year.timezone);
    const d = dayNumber(localDate);
    const key = `${b.roomId}|${d === null ? "?" : mondayOfDay(d)}`;
    const list = occurrences.get(key) ?? [];
    list.push({
      id: b.id,
      startUtc: b.startUtc,
      endUtc: b.endUtc,
      /* ⚠️ `approved` IS THE DEFAULT AND `"confirmed"` IS NOT A STATUS.
         `resolvePublishedRoom` shows a booking only for `approved` or
         `pending`; every other string — including a plausible-looking one —
         resolves to nothing at all, so a file whose bookings do not print
         looks exactly like a file with no bookings. See `SchoolBooking.status`. */
      status: b.status ?? "approved",
      /* ⭐ ABSENT PRINTS "Booked" — which says the room is taken and says
         nothing else, and is NOT the same as "no reason given". `cellFor`
         never makes that substitution; the resolver does. */
      label: b.purpose,
    });
    occurrences.set(key, list);
  }

  /* ── 6b. THE WEEK CHANGES — what somebody actually did to the timetable ──
        ⚠️ BUCKETED BY ROOM **AND** MONDAY for the same reason as the
        occurrences above: `resolvePublishedRoom` does a linear
        `overrides.find()` per cell. The key is the row's own stored Monday —
        no date arithmetic, because the row already names the week it is a
        change TO. */
  const overridesBy = new Map<string, OverrideEntry[]>();
  for (const row of year.weekChanges ?? []) {
    const key = `${row.roomId}|${row.monday}`;
    const list = overridesBy.get(key) ?? [];
    list.push({
      id: row.id,
      weekday: row.weekday,
      periodOrdinal: row.periodOrdinal,
      label: row.label,
      note: row.note,
      changedBy: row.changedBy,
      changedAt: row.changedAt ?? 0,
    });
    overridesBy.set(key, list);
  }

  /* ── 7. Resolve every teaching week ──
        `resolvePublishedRoom` is PURE and shared with the board, so the grid
        this file writes and the grid a UI draws come from one function. */
  const weekSheets = teaching.map((w) => {
    const week = asResolvedWeek(w);
    const grids = columns.map((room, ri) =>
      indexCells(
        resolvePublishedRoom({
          week,
          timezone: year.timezone,
          periods,
          templates:
            week.cycleWeek === null ? [] : (templates[ri][week.cycleWeek] ?? []),
          overrides: overridesBy.get(`${room.roomId}|${w.monday}`) ?? [],
          occurrences: occurrences.get(`${room.roomId}|${w.mondayDay}`) ?? [],
          rights: workbookRights(room.active),
          policy: WORKBOOK_ROOM_POLICY,
        }),
      ),
    );
    return {
      monday: w.monday,
      /* ⚠️ NOT `?? \`Week ${(w.cycleWeek ?? 0) + 1}\``, WHICH INVENTED A CYCLE
         POSITION. A teaching week the engine could not place has a `null`
         label; it is carried through and answered once, by `weekBandFor`. */
      label: w.label,
      /* ⭐ THE RESOLVED CYCLE POSITION, carried through to the tab colour, and
         never a substitute. A week the engine could not place has `null` here
         and gets an uncoloured tab, which says so; defaulting it to 0 would
         paint it Week A. */
      cycleWeek: w.cycleWeek,
      days: buildDays(week, periods, grids),
    };
  });

  /* ── 8. The template sheets — one per cycle week ── */
  const templateSheets: Array<{
    name: string;
    bandLabel: string;
    cycleWeek: number;
    days: SheetDay[];
  }> = [];
  const taughtWeekdays = year.taughtWeekdays ?? [1, 2, 3, 4, 5];
  for (let cw = 0; cw < year.cycleLength; cw++) {
    const first = teaching.find((w) => w.cycleWeek === cw);
    /* ⚠️ `cycleWeekLabel` AND NOT `weekLabels[cw] ?? \`Week ${cw+1}\``. On a
       cycle NARROWED from two to one, `weekLabels` is still `["Week A"]` and
       every other surface resolves that to "Every week"; the hand-written
       fallback printed a tab called "Week A - Template" with WEEK A in its own
       B1, in the same workbook as 38 tabs saying otherwise. */
    const label = cycleWeekLabel(
      yearWeekLabels(year),
      cw,
      year.cycleLength,
    );
    if (!first) {
      /* A cycle week the year never reaches is a real configuration (a
         three-week cycle on a short calendar). An empty template sheet beats a
         missing one — the tab is where a school looks. */
      templateSheets.push({
        name: templateSheetLabel(label),
        bandLabel: weekBandFor(label),
        cycleWeek: cw,
        days: emptyDays(periods, columns.length, taughtWeekdays),
      });
      continue;
    }
    /**
     * ⭐⭐ THE STANDING WEEK, NOT THAT PARTICULAR WEEK — and this is the whole
     * correctness of template-linking, not a tidy-up.
     *
     * `asResolvedWeek(first)` carries that week's OWN `closedWeekdays` (an
     * INSET day, a bank holiday) and its `untaughtWeekdays`. The first
     * teaching week of a cycle is very often exactly the clipped one — a year
     * beginning on a Wednesday makes Monday and Tuesday untaught in week 1 —
     * and `resolvePublishedRoom` answers `not-taught` / `closed` for those
     * weekdays without reading what the template holds there. So the template
     * tab came out with those weekdays blocked and EMPTY: a hole punched in
     * the school's standing timetable by one week's calendar.
     *
     * ⚠️ WITH LINKING ON THAT HOLE IS DATA LOSS ACROSS THE WHOLE FILE. Every
     * later week of the same cycle writes
     * `IF('Week A - Template'!D8="","",'Week A - Template'!D8)` over its Monday
     * lessons, the target is empty, and two entire days evaluate to "" on half
     * the tabs. The cached `result` hides it until the first recalculation —
     * which is the one thing this feature exists to cause. `daysAlign()` cannot
     * catch it: the ROW SHAPE matches perfectly, it is the CONTENT that was
     * week-specific.
     *
     * A template is the standing timetable, so the only weekdays it may draw
     * as structure are the ones the school never runs.
     */
    const week: ResolvedWeek = {
      ...asResolvedWeek(first),
      closedWeekdays: [],
      untaughtWeekdays: Array.from(
        { length: DAYS_PER_WEEK },
        (_v, i) => i + 1,
      ).filter((wd) => !taughtWeekdays.includes(wd)),
      closureLabels: [],
    };
    const grids = columns.map((room, ri) =>
      indexCells(
        resolvePublishedRoom({
          week,
          timezone: year.timezone,
          periods,
          templates: templates[ri][cw] ?? [],
          /* ⚠️ NO OCCURRENCES AND NO OVERRIDES. A template sheet shows the
             STANDING grid; folding in the one-off bookings that happened to
             land in that particular week would make the "template" a week
             sheet with a misleading name, and folding in that week's
             hand-made changes would do it twice over — an override is a change
             to ONE week by definition. */
          overrides: [],
          occurrences: [],
          rights: workbookRights(room.active),
          policy: WORKBOOK_ROOM_POLICY,
        }),
      ),
    );
    templateSheets.push({
      name: templateSheetLabel(label),
      bandLabel: weekBandFor(label),
      cycleWeek: cw,
      days: buildDays(week, periods, grids),
    });
  }

  /* ── 9. Names, deduplicated across the WHOLE workbook ──
        Templates first, so a template keeps its unsuffixed name if a week
        sheet ever collides with it. */
  const names = assignSheetNames([
    ...templateSheets.map((t) => t.name),
    ...weekSheets.map((w) => weekSheetLabel(w.label, w.monday)),
  ]);
  templateSheets.forEach((t, i) => {
    t.name = names[i];
  });

  /* ── 10. The options, applied — the only place any of them is decided ── */

  /**
   * ⚠️ NOT `reasons`, AND THE DIFFERENCE IS NOT COSMETIC. Everything in
   * `reasons` means the export STOPPED EARLY, sets `complete: false`, prints
   * "⚠️ INCOMPLETE" and makes the workbook OPEN on the info sheet rather than
   * the timetable. An option that fell short is a note about a convenience on
   * a file whose timetable is complete to the last cell; filed as a reason it
   * would tell a school its year was missing data that is all there.
   */
  const optionNotes: string[] = [];

  /**
   * ⭐ WHICH TEMPLATE SHEET EACH CYCLE WEEK IS, BY ITS FINAL NAME.
   *
   * ⚠️ AFTER `assignSheetNames`, and that is not a detail. A formula naming
   * the name a sheet had BEFORE deduplication points at a sheet that does not
   * exist, which Excel opens as `#REF!` in nine hundred cells.
   *
   * ⚠️ AND IT IS KEYED ON `cycleWeek`, NEVER ON ARRAY ORDER OR ON A LETTER
   * PARSED BACK OUT OF A NAME. A school may have renamed its weeks to
   * "Timetable 1 / Timetable 2"; the cycle is a number and it is the only
   * thing that says which template a week follows.
   */
  const templateByCycle = new Map<number, { name: string; days: SheetDay[] }>();
  for (const t of templateSheets) {
    templateByCycle.set(t.cycleWeek, { name: t.name, days: t.days });
  }

  /**
   * ⭐ TODAY, AS THE SCHOOL RECKONS IT, AND THE MONDAY OF IT.
   *
   * `weekHasEnded` compares two Mondays, so the clock is read exactly once and
   * in the school's own timezone. `todayCivil()` is deliberately NOT used
   * here: it is right for "which academic year did they mean", where a day
   * either way cannot change the answer, and wrong for "is the week I am
   * standing in over".
   */
  const todayMonday = mondayOf(localDateOf(now, year.timezone));

  let unalignedWeeks = 0;
  /**
   * ⭐⭐ TEACHING WEEKS WITH NO CYCLE POSITION — the OTHER reason a week holds
   * plain values, and it once said nothing at all. `unalignedWeeks` counts
   * `tpl && !aligned` and therefore could never count this one.
   *
   * ⚠️ IT IS NOT A `reason`. Every cell on those sheets is correct as
   * exported and nothing stopped early; what fell short is the CONVENIENCE the
   * switch promised. Only counted under `linkTemplates`, because with linking
   * off nothing is linked and there is nothing to note.
   */
  let unplacedWeeks = 0;
  const weeks = weekSheets.map((w, i) => {
    const tpl = w.cycleWeek === null ? undefined : templateByCycle.get(w.cycleWeek);
    /* ⚠️ LINKED ONLY WHEN THE ROWS PROVABLY LINE UP. Both sheets are laid out
       from the same `periods`, so they do — today. `daysAlign` is what stops
       that staying true by luck. */
    const aligned = tpl ? daysAlign(w.days, tpl.days) : false;
    if (options.linkTemplates && tpl && !aligned) unalignedWeeks++;
    /* ⚠️ `!tpl` AND NOT `w.cycleWeek === null`, though today they are the same
       set. Asking the question the LINK actually depends on means a cycle week
       that ever failed to find its template sheet is counted here instead of
       vanishing. */
    if (options.linkTemplates && !tpl) unplacedWeeks++;
    return {
      name: names[templateSheets.length + i],
      /* ⚠️ `taught: true` IS NOT A GUESS — this array is `teaching.map(...)`.
         It is what separates the two reasons a label can be null: a HOLIDAY
         has no cycle position and says so, while a taught week the engine
         could not place is a gap in the rule and must not be dressed up as
         one. */
      bandLabel: weekBandFor(w.label, { taught: true }),
      cycleWeek: w.cycleWeek,
      days: w.days,
      /* ⭐ HIDDEN ONCE FULLY ENDED. A week the engine could not place
         (`monday` is still real) is treated like any other. */
      hidden:
        options.hideEndedWeeks &&
        todayMonday !== null &&
        weekHasEnded(w.monday, todayMonday),
      linkTo: options.linkTemplates && tpl && aligned ? tpl.name : undefined,
    };
  });

  if (unalignedWeeks > 0) {
    optionNotes.push(
      `${unalignedWeeks} week${unalignedWeeks === 1 ? "" : "s"} could not be linked to a template because the day shapes did not match, so ${unalignedWeeks === 1 ? "it holds" : "they hold"} plain values. Every cell in ${unalignedWeeks === 1 ? "it" : "them"} is correct as exported.`,
    );
  }
  /**
   * ⭐⭐ THE COLUMNS THAT ARE LOCKED WHOLE, NAMED — because the option's own
   * sentence cannot be true about them. For a RETIRED room "the free periods
   * are left editable" is false and has to be: `cellRights` answers `retired`
   * above every question about what is in the cell, so every cell of that
   * column comes back locked, free periods included.
   *
   * ⚠️ THE COLUMN STAYS. What was missing was anybody being TOLD: the file
   * offered a column that looks exactly like the others and refuses every
   * keystroke.
   */
  if (options.lockPrefilled) {
    const retired = columns.filter((c) => !c.active).map((c) => c.name);
    if (retired.length > 0) {
      const one = retired.length === 1;
      optionNotes.push(
        `${retired.join(", ")} ${one ? "is" : "are"} out of service, so ${one ? "that whole column is" : "those whole columns are"} locked on every week sheet — the free periods in ${one ? "it" : "them"} too. That is what the booking board does with ${one ? "it" : "them"} as well: nobody may book a room that is out of service.`,
      );
    }
  }
  if (unplacedWeeks > 0) {
    const one = unplacedWeeks === 1;
    optionNotes.push(
      `${unplacedWeeks} teaching week${one ? "" : "s"} ${one ? "has" : "have"} no place in the week cycle, so ${one ? "it is" : "they are"} linked to no template and ${one ? "holds" : "hold"} plain values. ${one ? "Its" : "Their"} top-left corner reads “${weekBandFor(null, { taught: true })}”. Every cell in ${one ? "it" : "them"} is correct as exported; the cause is the academic year's start-of-cycle date.`,
    );
  }

  /**
   * ⭐⭐ EVERY DISTINCT CLASS CODE IN THE WORKBOOK — the rule set the
   * conditional formatting is built from.
   *
   * ⚠️ IT HAS TO BE GATHERED HERE. The writer streams: September's sheet is in
   * the zip before June's has been looked at, so a rule set built as the
   * writer went would give the two sheets different rules and the same class
   * two colours in one file.
   *
   * ⚠️ AND ONLY WHEN LINKING IS ON. Nothing in an unlinked workbook can change
   * after it is written, so its static fills are already right and every rule
   * would be weight with no job.
   */
  const classCodes: string[] = [];
  if (options.linkTemplates) {
    const seen = new Set<string>();
    let overflowed = false;
    const scan = (days: SheetDay[]) => {
      for (const day of days) {
        for (const row of day.cells) {
          for (const c of row) {
            /* A number is a period label's business, never a class code, and
               `colourForClass` is the one authority on what names a class — a
               free-text booking, "Booked" and a typed "-" all return null and
               get no rule, exactly as they get no fill. */
            if (c.kind !== "value" || typeof c.text !== "string") continue;
            if (seen.has(c.text)) continue;
            if (!colourForClass(c.text)) continue;
            if (seen.size >= MAX_CF_CLASS_RULES) {
              overflowed = true;
              return;
            }
            seen.add(c.text);
          }
        }
      }
    };
    for (const t of templateSheets) scan(t.days);
    for (const w of weekSheets) scan(w.days);
    classCodes.push(...[...seen].sort(compareClassCodes));
    if (overflowed) {
      optionNotes.push(
        `More than ${MAX_CF_CLASS_RULES} distinct class codes appear in this year, so only the first ${MAX_CF_CLASS_RULES} keep their colour when a template is edited. Every cell is still coloured correctly as exported.`,
      );
    }
  }

  const model: TimetableWorkbookModel = {
    calendarName: year.name,
    orgName: doc.school.name,
    rooms,
    fieldDefs,
    templateSheets,
    halfTerms: buildHalfTerms(built.weeks),
    weeks,
    /* ⭐ RESOLVED HERE AND ONCE. An absent accent, and a stored value that
       somehow is not a colour, both come back as the default purple — so a
       school that never opens Customise gets exactly the file it got before
       the setting existed. */
    accent: resolveTimetableAccent(doc.school.accent),
    options,
    classCodes,
    password: input.password,
    notes: {
      generatedBy: input.generatedBy ?? "",
      generatedAt: now,
      holidayMode: year.holidayMode,
      timezone: year.timezone,
      complete: reasons.length === 0,
      reasons,
      optionNotes,
    },
  };

  return {
    ok: true,
    model,
    suggestedFilename: `timetable-${slugish(doc.school.name)}-${slugish(year.name)}.xlsx`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   PICKING
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The one the caller named; failing that the one covering today, because a
 * school with three years on file wants this one; failing that the year about
 * to start, and past the last of them the most recently ended.
 *
 * ⚠️ THE LAST TWO ARE NOT "the first". `pickAcademicYear` is the one rule and
 * `years[0]` is the school's OLDEST year.
 */
function pickYear(
  years: SchoolYear[],
  requested: string | undefined,
  now: number,
): SchoolYear | null {
  if (requested) return years.find((y) => y.id === requested) ?? null;
  const picked = pickAcademicYear(
    years.map((y) => ({ ...y, yearStart: y.start, yearEnd: y.end })),
    todayCivil(new Date(now)),
  );
  return picked ? (years.find((y) => y.id === picked.id) ?? null) : null;
}

/** The one the year names, or the first. ⚠️ A ROOM SHEET IS A VIEW OF THE
 *  ESTATE and the estate belongs to the school, so this is the one place
 *  `[0]` is right: room sheets are not academic years and have no "current". */
function pickRoomSheet(
  sheets: SchoolRoomSheet[],
  requested: string | undefined,
): SchoolRoomSheet | null {
  if (requested) return sheets.find((s) => s.id === requested) ?? null;
  return sheets[0] ?? null;
}

/** A filename fragment: lowercase, ASCII-ish, no separators to confuse a
 *  `Content-Disposition` or a Windows path. */
function slugish(raw: string): string {
  const out = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return out || "timetable";
}

/* ══════════════════════════════════════════════════════════════════════════
   BUILDING THE SHEETS
   ══════════════════════════════════════════════════════════════════════════ */

type CellIndex = Map<string, PublishedCell>;

function indexCells(cells: PublishedCell[]): CellIndex {
  const m: CellIndex = new Map();
  for (const c of cells) m.set(`${c.weekday}:${c.periodOrdinal}`, c);
  return m;
}

function buildDays(
  week: ResolvedWeek,
  periods: PeriodDef[],
  grids: CellIndex[],
): SheetDay[] {
  const days: SheetDay[] = [];
  for (let weekday = 1; weekday <= DAYS_PER_WEEK; weekday++) {
    const dayPeriods = periodsForWeekday(periods, weekday);
    days.push({
      date: civilOf(week.mondayDay + (weekday - 1)),
      periods: dayPeriods.map((p) => ({
        /* ⭐ CARRIED SO TEMPLATE-LINKING CAN BE CHECKED. See `daysAlign()`. */
        ordinal: p.ordinal,
        label: periodLabelValue(p.name),
        bookable: p.isTeaching,
      })),
      cells: dayPeriods.map((p) =>
        grids.map((g) => cellFor(g.get(`${weekday}:${p.ordinal}`), p)),
      ),
    });
  }
  return days;
}

/**
 * A template sheet for a cycle week the calendar never reaches — a three-week
 * cycle on a calendar too short to reach week 3, which is a real configuration
 * rather than a broken one.
 *
 * The day shape is still drawn, because the tab is where a school looks and an
 * empty grid says "nothing is timetabled here" far better than a missing tab
 * does. Break rows stay blocked; everything else is free.
 *
 * ⚠️ AND A DAY THE SCHOOL DOES NOT TEACH IS BLOCKED STRAIGHT ACROSS, exactly
 * as `resolvePublishedRoom` marks it `not-taught` on every real week sheet.
 * Which days those are is configuration, so this function has to be told;
 * without it a Mon–Thu school got white, apparently bookable Friday cells on
 * its template tabs and structure-filled ones on all forty week tabs — the
 * same day, two answers, and the wrong one on the sheet a school reads first.
 */
function emptyDays(
  periods: PeriodDef[],
  roomCount: number,
  taughtWeekdays: readonly number[],
): SheetDay[] {
  const days: SheetDay[] = [];
  for (let weekday = 1; weekday <= DAYS_PER_WEEK; weekday++) {
    const dayPeriods = periodsForWeekday(periods, weekday);
    const taught = taughtWeekdays.includes(weekday);
    days.push({
      /* No real date to show. `civilToUtcDate` rejects the empty string and
         the writer falls back to printing it, which leaves the cell blank —
         which is the truth. */
      date: "",
      periods: dayPeriods.map((p) => ({
        ordinal: p.ordinal,
        label: periodLabelValue(p.name),
        bookable: p.isTeaching,
      })),
      cells: dayPeriods.map((p) =>
        Array.from({ length: roomCount }, (): SheetCell =>
          /* ⚠️ REQUIRED BY THE TYPE, AND NOT READ ON THIS SHEET — do not
             reason from these values. `locked` is only consulted by the writer
             under `protect === "prefilled"`, and that governs the WEEK sheets;
             a TEMPLATE sheet is locked or not as a whole. They are written
             truthfully rather than defaulted, because `CellLockState` is
             required precisely so a new constructor cannot forget it. */
          taught && p.isTeaching
            ? { kind: "free", locked: false }
            : { kind: "blocked", locked: true },
        ),
      ),
    });
  }
  return days;
}

/**
 * ⭐ WHERE PROVENANCE BECOMES COLOUR AND WHERE `cellRights()` BECOMES A LOCK —
 * and the only place either happens.
 *
 * ── ⭐⭐ IT IS A MAPPING, NOT A RULE ──────────────────────────────────────
 * ⚠️ EVERY DECISION BELOW IS MADE BY `resolvePublishedRoom` — the function the
 * published board draws itself with. This turns its answer into ink. That
 * matters because the version of this function that DECIDED things had a hole
 * nothing could see: the resolver it called (`resolveWeekGrid`) has no
 * overrides input, so a cell a teacher had changed arrived here as
 * `state: "template"` holding the ORIGINAL lesson, and it faithfully printed
 * it.
 *
 * The five states that reach a cell, and what each becomes:
 *
 *   lesson    the standing timetable. Linked under `linkTemplates`, LOCKED
 *             under `lockPrefilled`.
 *   changed   ⭐ somebody moved a class this week. NOT linked (it is not the
 *             template — pointing it at one would drag the class back) and NOT
 *             locked (rule three: an ad-hoc note is not the school's
 *             timetable). Both follow from the origin and from `cellRights`,
 *             not from a branch here.
 *   cleared   ⭐ an override with NO text — "the lesson is not running here
 *             this week, because it moved". Prints empty, and `kind: "cleared"`
 *             rather than `"free"` for exactly one reason: a free cell IS
 *             linked, and linking a cleared one would resurrect the very lesson
 *             somebody moved off it the moment Excel recalculated.
 *   held      a real booking. `label` absent means the purpose was withheld,
 *             not that nobody gave one, and the resolver has already turned
 *             that into "Booked".
 *   free      nothing. Linked, unlocked.
 *
 * ── ⚠️ "NOT A TEACHING PERIOD" IS NOT "NOTHING CAN BE HERE" ──────────────
 * This function once opened with `if (!period.isTeaching) return blocked;`
 * above every other test, so anything resolved onto a break, a registration or
 * a lunch was thrown away before it was looked at. A lunchtime club running
 * 12:30–13:15 lands on "Break 2"; the on-screen grid drew it and the workbook
 * silently drew an empty structure box — a printed timetable saying the room
 * is free at the one moment it is not, which is the single failure a booking
 * system exists to prevent. That answer now lives in
 * `WORKBOOK_ROOM_POLICY.bookingsShowOnNonTeachingRows`.
 *
 * ⭐ AND `isTeaching` IS THE ADMIN'S OWN SWITCH. ⚠️ THE SHADING IS DECIDED BY
 * THAT FLAG AND BY NO LABEL. Matching on the word "Break" would have worked on
 * exactly one school's file and broken on the first one that wrote "Lunch",
 * "Registration" or "Tutor".
 */
function cellFor(cell: PublishedCell | undefined, period: PeriodDef): SheetCell {
  /**
   * ⭐ THE LOCK, FROM `cellRights()` AND NEVER FROM A RULE WRITTEN HERE.
   * `resolvePublishedRoom` has already asked it, per cell, against
   * `workbookRights`. A cell the resolver never produced (a period outside
   * this day's shape) cannot be typed in either; `cellRights` refuses
   * `structure` to everybody, so LOCKED is the same answer by the same rule.
   */
  const locked = cell ? !cell.canEdit : true;

  /** What an empty cell in this period looks like. */
  const empty: SheetCell = period.isTeaching
    ? { kind: "free", locked }
    : { kind: "blocked", locked };
  if (!cell) return empty;

  switch (cell.state) {
    case "lesson":
      return cell.label
        ? { kind: "value", text: cell.label, origin: "lesson", locked }
        : empty;
    case "changed":
      /* A `changed` cell always carries text — `resolvePublishedRoom` splits
         `changed` from `cleared` on exactly that — so the fallback is
         unreachable and is here so a future widening of the state cannot print
         `undefined`. */
      return cell.label
        ? { kind: "value", text: cell.label, origin: "override", locked }
        : { kind: "cleared", locked };
    case "cleared":
      /* Empty on purpose. See the banner and `SheetCell`'s own. */
      return { kind: "cleared", locked };
    case "held":
      /* `label` is "Booked" when the purpose was withheld — which says the room
         is taken and says nothing else. The resolver made that substitution;
         this does not repeat it. */
      return {
        kind: "value",
        text: cell.label ?? "Booked",
        origin: "booking",
        locked,
      };
    case "closed":
    case "not-taught":
    case "non-teaching":
      /* A whole-day or whole-week closure outranks anything standing in it:
         the lesson is not running, and the source draws nothing there. */
      return { kind: "blocked", locked };
    case "structure":
      /* A break row with nothing on it. Under the workbook's policy a booking
         that DOES land on one comes through as `held` above, so reaching here
         means the row really is empty. */
      return { kind: "blocked", locked };
    case "free":
      return empty;
    default:
      return empty;
  }
}

/**
 * `buildYear` returns `ResolvedWeek` already, so this is a passthrough that
 * exists to keep the shape explicit at the seam.
 *
 * ⚠️ IT IS NOT A CAST. Monospace's version filled `closureKinds: []` because
 * its preview query did not send them; here they are real, and
 * `resolvePublishedRoom` reads none of them either way. Written out rather
 * than spread so that widening the resolver later fails to compile here
 * instead of reading a lie.
 */
function asResolvedWeek(w: ResolvedWeek): ResolvedWeek {
  return {
    monday: w.monday,
    mondayDay: w.mondayDay,
    taughtDays: w.taughtDays,
    closedWeekdays: w.closedWeekdays,
    untaughtWeekdays: w.untaughtWeekdays,
    closureLabels: w.closureLabels,
    closureKinds: w.closureKinds,
    isTeachingWeek: w.isTeachingWeek,
    cycleWeek: w.cycleWeek,
    label: w.label,
    pinned: w.pinned,
    pinReason: w.pinReason,
    source: w.source,
  };
}

/**
 * ⭐ THE HALF-TERM SHEET, WHICH IS THE HOLIDAY EVIDENCE MADE VISIBLE.
 *
 * The reference file lists five closure runs — 26 Oct–6 Nov, 21 Dec–1 Jan,
 * 15–19 Feb, 29 Mar–9 Apr, 31 May–4 Jun — laid out two weeks to a block. Three
 * of them are a fortnight and two are a single week, and the single weeks are
 * exactly what proves the engine needed `pause`: the school's February runs
 * "(A) February 8th" → half term → "(B) February 22nd", which only comes out B
 * if the cycle stopped counting for the closed week.
 *
 * So the blocks are RUNS of consecutive non-teaching weeks, chunked into pairs,
 * which reproduces the source exactly on the source's own data and generalises
 * to a school with a three-week Easter.
 *
 * ⚠️ THE CYCLE LABELS IN COLUMNS A AND L ARE "—" UNDER PAUSE, and that is
 * correct rather than missing: a paused week HAS no cycle week — it is not
 * week 0 — so there is no letter to print. Under `continue` the engine gives
 * one and it is printed.
 */
function buildHalfTerms(
  weeks: Array<{
    monday: string;
    mondayDay: number;
    label: string | null;
    isTeachingWeek: boolean;
  }>,
) {
  const runs: Array<typeof weeks> = [];
  let current: typeof weeks = [];
  for (const w of weeks) {
    if (w.isTeachingWeek) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push(w);
    }
  }
  if (current.length > 0) runs.push(current);

  const blocks = [];
  for (const run of runs) {
    for (let i = 0; i < run.length; i += HALF_TERM_WEEKS_PER_BLOCK) {
      const pair = run.slice(i, i + HALF_TERM_WEEKS_PER_BLOCK);
      const days: (string | null)[] = [];
      for (let k = 0; k < HALF_TERM_WEEKS_PER_BLOCK; k++) {
        for (let d = 0; d < DAYS_PER_WEEK; d++) {
          const w = pair[k];
          days.push(w ? civilOf(w.mondayDay + d) : null);
        }
      }
      blocks.push({
        leftLabel: pair[0]?.label ?? "—",
        rightLabel: pair[1]?.label ?? "—",
        days,
      });
    }
  }
  return blocks;
}

