/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PUBLISHED TIMETABLE — WHAT THE STAFFROOM SEES, AND WHO MAY TYPE IN IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam, describing the surface every teacher opens:
 *
 *   *"this timetable view should have the same kind of layout as the
 *   spreadsheet I sent but obviously be more polished as its part of the site,
 *   staff can then only edit the blanks where there is free periods or where
 *   another staff has changed it (admins can override any of them in this view
 *   incase of room changes, maybe have a toggle to allow overriding for all in
 *   org settings for this)"*.
 *
 * ── PURE, AND SHARED ACROSS THE FENCE ────────────────────────────────────
 * No `_generated` imports, so the client imports this file directly — the same
 * trick `convex/lib/timetable.ts` and `convex/lib/itemCatalog.ts` use. Convex
 * cannot import from `src/`, but `src/` can import from `convex/lib/`.
 *
 * That matters more here than anywhere else in Booking, because THE GRID IS A
 * HINT AND THE MUTATION IS THE RULE. Both sides ask `cellRights()` — the
 * client to decide whether a cell looks editable, the server to decide whether
 * a write is allowed — and there is exactly one implementation of the answer.
 * A greyed cell that the mutation would have accepted, or a live-looking cell
 * the mutation refuses, are the two ways this feature can lie, and one
 * function is how neither happens.
 *
 * ⚠️ SHARING THE FUNCTION IS NOT THE SAME AS TRUSTING THE CLIENT. Every input
 * to `cellRights()` on the server is read from the database inside the
 * mutation's own transaction; nothing is taken from the caller except which
 * cell they mean. See `convex/bookingPublished.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE FIVE CELL RULES, WHICH ARE THE POINT OF THE WHOLE FILE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   FREE          nothing timetabled, nothing booked. ANY staff member who may
 *                 book this room may write in it. "staff can then only edit the
 *                 blanks where there is free periods".
 *
 *   LESSON        the standing template shows through — the school's own
 *                 timetable. Ordinary staff may NOT touch it. An org admin,
 *                 or the department that manages that room, may — "admins can
 *                 override any of them in this view incase of room changes" —
 *                 and so may everybody when the organisation has switched
 *                 `bookingOverrideAll` on.
 *
 *   CHANGED       somebody has already written over this cell THIS WEEK.
 *                 Any staff member may edit it: "or where another staff has
 *                 changed it". An ad-hoc note is not the school's timetable and
 *                 does not get the timetable's protection.
 *
 *   CLEARED       an override with no text: the lesson is explicitly NOT
 *                 running here this week, because the class moved. Same rule as
 *                 CHANGED — it IS a change, it just reads as empty.
 *
 *   HELD          a real `bookings` row overlaps the period. ⚠️ NOBODY edits
 *                 this from here, org admins included. The booking ledger is
 *                 the authority on reservations and it has its own cancel gate
 *                 (`canCancelBooking`); a second, weaker path around it is how
 *                 a colleague's minibus trip disappears without them being
 *                 told. The refusal names the way to do it properly.
 *
 * plus two structural refusals that are not really rules about people:
 *
 *   NOT BOOKABLE  Break 1, Break 2, registration. `bookingPeriods.isTeaching`
 *                 is false. Drawn, because the day has to read like a day, and
 *                 never typed in.
 *   NOT TEACHING  a closure, a bank holiday, an INSET, a day the school does
 *                 not run, or a non-teaching week.
 *
 * ⚠️ AND THE ORDER MATTERS. HELD is tested before CHANGED, so an override that
 * somehow sits under a live booking cannot be used to hand the room away; NOT
 * TEACHING is tested before everything, so nobody books Christmas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WHY THE OVERRIDE IS A LAYER AND NEVER A WRITE TO THE TEMPLATE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "An override must not silently destroy the standing timetable." A cell edit
 * writes a `bookingWeekOverrides` row for ONE Monday; the template row is not
 * read, not patched and not deleted. RESET deletes the override, and the
 * lesson is simply there again, because it never went anywhere — it was under
 * the layer the whole time.
 *
 * The alternative (edit the template, remember what it used to say) is the same
 * feature with an undo buffer bolted to it, and the buffer is what is wrong the
 * first time two people edit the same term.
 */

import {
  civilOf,
  periodIsTimed,
  periodsForWeekday,
  periodWindow,
  CALENDAR_FANOUT,
  MAX_PERIODS_PER_CALENDAR,
  TEACHING_WEEKDAYS,
  type CivilDate,
  type ConcreteOccurrence,
  type PeriodDef,
  type ResolvedWeek,
  type TemplateEntry,
} from "./timetable";
import { MAX_ROOMS_PER_SET } from "./bookingRooms";

/* ══════════════════════════════════════════════════════════════════════════
   CEILINGS — this deployment is over its Convex plan limits, and a timetable
   grid is the densest read in the product. Every one of these is a `.take()`
   on an indexed range somewhere in convex/bookingPublished.ts.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ OVERRIDES FOR ONE ROOM IN ONE WEEK — five days times the period ceiling,
 * which is a week in which EVERY cell of that room was changed by hand.
 *
 * It is the WRITE bound as well as a read bound, and deliberately the same
 * number: `setCell` reads this room-week on `by_resource_monday` to find the
 * row it is about to replace, so bounding the insert costs nothing extra. A
 * ceiling checked only on the read side is a ceiling that a writer can walk
 * past, leaving a week the board silently truncates.
 */
export const MAX_OVERRIDES_PER_ROOM_WEEK = 5 * 20;

/**
 * Overrides read for ONE WEEK of the WHOLE SCHOOL, in one range on
 * `by_calendar_monday` — one read rather than one per room.
 *
 * ⚠️ DERIVED, not chosen again: the widest room list the exporter will draw,
 * times the per-room ceiling above. Picking a second number here is how a
 * board ends up able to read fewer rows than the mutations are willing to
 * write.
 */
export const MAX_OVERRIDES_PER_WEEK =
  MAX_ROOMS_PER_SET * MAX_OVERRIDES_PER_ROOM_WEEK;

/**
 * Concrete `bookings` rows read for one week of the whole school, in one range
 * on `by_org_start`. The published grid only ever asks "is this period taken";
 * the ledger, not this number, is what makes that answer correct.
 */
export const MAX_BOOKINGS_PER_WEEK = 1_000;

/**
 * Template rows per room per cycle week — one indexed range each, exactly as
 * `timetableTemplate.weekGrid` and the workbook exporter already do. Five days
 * times the period ceiling.
 *
 * ⚠️ THIS IS THE OUTPUT SIZE, NOT THE RANGE SIZE. See below.
 */
export const CELLS_PER_ROOM_CYCLE_WEEK = MAX_OVERRIDES_PER_ROOM_WEEK;

/**
 * ⚠️⚠️ WHAT THE `by_resource_cycle` RANGE MUST BE ALLOWED TO HOLD, which is
 * NOT the number above.
 *
 * That index is (resource, cycleWeek, weekday) and CARRIES NO CALENDAR, so the
 * board filters `calendarId` out of the rows it gets back. Capping the range at
 * one calendar's worth and filtering afterwards throws away rows the `.take()`
 * had already truncated — and the published grid comes back SILENTLY SHORT, a
 * standing lesson at a time, in index order, so it is Friday that vanishes.
 *
 * The school that triggers it is ordinary: two calendars for the same rooms
 * from about February, when next year's is built beside this one. Nine rows a
 * day over two calendars is ninety of the hundred; three calendars, or a
 * twenty-period day over two, is past it.
 *
 * `CALENDAR_FANOUT` is the SAME constant convex/timetableTemplate.ts reads —
 * it was module-private there, this file picked the one-calendar number
 * independently, and that is precisely the bug. It now lives in
 * convex/lib/timetable.ts so there is one of it.
 */
export const ROOM_CYCLE_RANGE = CELLS_PER_ROOM_CYCLE_WEEK * CALENDAR_FANOUT;

/** …and over ONE DAY of one room, which is what a cell write reads. */
export const ROOM_DAY_RANGE = MAX_PERIODS_PER_CALENDAR * CALENDAR_FANOUT;

/** A label typed into a published cell. The same eighteen-character column the
 *  workbook prints, with room for a full class code and a name. */
export const MAX_CELL_LABEL = 60;
/** The note behind a cell — "moved from N24, projector broken". */
export const MAX_CELL_NOTE = 200;

/* ══════════════════════════════════════════════════════════════════════════
   THE CELL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ DELIBERATELY NOT `GridCellState` FROM convex/lib/timetable.ts.
 *
 * That union serves the per-resource week grid the Templates screen and a
 * department's Booking item draw, and it has no concept of a week override
 * because those screens have no way to make one. Widening it would change the
 * meaning of `GRID_STATE_LABEL` under two components this work is not allowed
 * to touch, for states they can never receive.
 *
 * So this is its own union, and the overlap in names is intentional: a reader
 * moving between the two files should find "closed" meaning closed.
 */
export type PublishedCellState =
  /** Nothing timetabled and nothing booked. The white cell in the workbook. */
  | "free"
  /** The standing template, showing through. Never stored per week. */
  | "lesson"
  /** ⭐ A `bookingWeekOverrides` row WITH text — somebody changed this week. */
  | "changed"
  /** ⭐ A `bookingWeekOverrides` row with NO text — the lesson is not running
   *  here this week, because it moved. Reads empty, is not free. */
  | "cleared"
  /** A real `bookings` row overlaps the period. The ledger's business. */
  | "held"
  /** `isTeaching: false` — break, lunch, registration. Structure, not space. */
  | "structure"
  /** A closure, a bank holiday or an INSET on this day. */
  | "closed"
  /** ⭐ THE SCHOOL DOES NOT RUN THIS DAY, or the day is outside the year. The
   *  name mirrors `GridCellState`'s own `"not-taught"`, which was called
   *  `"out-of-term"` while terms existed — a school with no terms cannot have
   *  a day outside one. */
  | "not-taught"
  /** A non-teaching week — study leave, activities week, a whole-week closure. */
  | "non-teaching";

/** Why a cell cannot be typed in. `null` when it can. */
export type CellLock =
  /** The day is not running: closed, not taught, or a non-teaching week. */
  | "not-teaching"
  /** A break row. The day is drawn through it; nothing is booked in it. */
  | "not-bookable"
  /** ⭐ A real booking holds the period. Not even an admin edits this here. */
  | "held"
  /** The school's standing timetable, and this viewer may not override one. */
  | "timetabled"
  /** ⭐ THE ROOM IS OUT OF SERVICE. Its column stays on the sheet — a grid is
   *  read POSITIONALLY and removing a column moves every room to the right of
   *  it — but nobody books it, its manager included. Retiring a room is how a
   *  scrapped minibus stops taking bookings while its history stays readable,
   *  so a manager exception would defeat the one control that exists for it. */
  | "retired"
  /** This viewer may not book this room — its `whoCanBook` is the managing
   *  department and they are not in it. */
  | "no-permission";

/**
 * The sentence shown on a locked cell. ONE table, read by the grid's tooltip
 * and thrown by the mutation, so the reason a click did nothing and the reason
 * a write was refused are the same words.
 */
export const CELL_LOCK_REASON: Record<CellLock, string> = {
  "not-teaching":
    "The timetable is not running on that day, so there is nothing to book.",
  "not-bookable":
    "That row is a break, not a period. Change the day’s shape in the timetable settings if it should be bookable.",
  retired:
    "That room is out of service. Bring it back in organisation settings → Booking before anything is booked in it.",
  held: "That period is held by a booking. Cancel the booking to free the room — a timetable change here would leave the room still reserved.",
  timetabled:
    "That is the school’s standing timetable. An organisation admin, or the department that runs this room, can change it for this week.",
  "no-permission": "You do not have permission to book this room.",
};

export type PublishedCell = {
  weekday: number;
  periodOrdinal: number;
  state: PublishedCellState;
  /** What is written in the cell. Absent on `free`, `cleared` and the
   *  structural states. On `held` it is deliberately the word "Booked" and
   *  never the booking's purpose — see the note in `resolvePublishedRoom`. */
  label?: string;
  /** ⭐ WHAT THE OVERRIDE DISPLACED, so the grid can say "was 10D/Bs" and
   *  RESET can be offered as a real choice rather than as a leap. Present only
   *  when a template entry is underneath a `changed` or `cleared` cell. */
  wasLabel?: string;
  /** Set on `changed` and `cleared`. Rule three is "another staff has changed
   *  it", so the grid says whose change it is. */
  changedBy?: string;
  changedAt?: number;
  /** The one answer both sides use. */
  canEdit: boolean;
  lock: CellLock | null;
};

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE RULE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What this viewer may do to one room, resolved ONCE per room and passed down
 * to every cell of it.
 *
 * Three booleans, and they come from three different existing gates rather
 * than from anything invented here:
 *
 *   `mayBook`      `canBookResource` — org membership plus the resource's own
 *                  `whoCanBook`, and false outright for a retired room. The
 *                  same gate `createBooking` uses, so "the blanks" means the
 *                  same thing on both surfaces.
 *   `mayOverride`  `canManageResource` — an org owner/admin, or `manage` on
 *                  the department that runs this room. The same gate that
 *                  guards the TEMPLATE itself in
 *                  `timetableTemplate.setTemplateCell`, which is the right
 *                  symmetry: whoever may set the standing lesson may set aside
 *                  one week of it.
 *   `overrideAll`  the organisation's `bookingOverrideAll` switch, off by
 *                  default. It lifts exactly the LESSON rule, for everybody.
 */
export type RoomRights = {
  /** ⚠️ THE ROOM IS IN SERVICE. Separate from `mayBook` even though
   *  `canBookResource` already folds it in, because the two produce DIFFERENT
   *  SENTENCES: "that room is out of service" and "you do not have permission
   *  to book that room" are not the same fact, and telling a manager the
   *  second about a room they run is the kind of copy that generates a support
   *  ticket. */
  active: boolean;
  mayBook: boolean;
  mayOverride: boolean;
  overrideAll: boolean;
};

/**
 * ⭐ THE ONE FUNCTION. Given what a cell IS, say whether this viewer may type
 * in it, and if not, why.
 *
 * Read the order top to bottom — it is the precedence, and every line of it is
 * load-bearing:
 *
 *   1. the day is not running       nobody, ever.
 *   2. the row is not bookable      nobody, ever. A break is not free space.
 *   3. a booking holds it           nobody FROM HERE, admins included.
 *   4. the room is out of service   nobody, ever — and said in those words.
 *  4b. this viewer cannot book      the resource's own policy, before any
 *                                   question about what is in the cell.
 *   5. an override is already there anybody who may book. Rule three.
 *   6. a standing lesson            only an overrider, unless the org has
 *                                   switched `overrideAll` on. Rule two.
 *   7. free                         anybody who may book. Rule one.
 *
 * ⚠️ 3 ABOVE 5. An override sitting under a live booking must not become a way
 * to hand out a room the ledger has already given to somebody else.
 * ⚠️ 4 ABOVE 6. Somebody with no right to book the room at all is told that,
 * rather than being told the cell is timetabled and left to wonder whether a
 * different cell would work.
 */
export function cellRights(
  state: PublishedCellState,
  rights: RoomRights,
): { canEdit: boolean; lock: CellLock | null } {
  if (state === "closed" || state === "not-taught" || state === "non-teaching") {
    return { canEdit: false, lock: "not-teaching" };
  }
  if (state === "structure") return { canEdit: false, lock: "not-bookable" };
  if (state === "held") return { canEdit: false, lock: "held" };
  if (!rights.active) return { canEdit: false, lock: "retired" };
  if (!rights.mayBook) return { canEdit: false, lock: "no-permission" };
  if (state === "changed" || state === "cleared") return { canEdit: true, lock: null };
  if (state === "lesson") {
    return rights.mayOverride || rights.overrideAll
      ? { canEdit: true, lock: null }
      : { canEdit: false, lock: "timetabled" };
  }
  return { canEdit: true, lock: null };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RESOLVER
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE TWO PLACES THE BOARD AND THE WORKBOOK DISAGREE, NAMED ONCE
   ══════════════════════════════════════════════════════════════════════════

   `resolvePublishedRoom` has a second caller now:
   src/app/api/orgs/[orgId]/timetable/export/route.ts, which used to build its
   grids with `resolveWeekGrid` — a function that takes no overrides at all, so
   a class a teacher had moved on this board printed in the workbook as the
   ORIGINAL lesson, and under template-linking printed as a FORMULA pointing at
   it. The exported file had therefore never been a record of what was taught.

   The fix is this function, not a copy of it. But the two surfaces genuinely
   want two answers in exactly two places, and both differences are POLICY
   about a surface rather than disagreement about the rule — so they are named,
   defaulted to the board's answer, and the workbook opts out of each in
   writing.

   ⚠️ ANYTHING BEYOND THESE TWO IS A SECOND IMPLEMENTATION WEARING THIS ONE'S
   NAME. If a third flag looks necessary, the honest move is almost certainly
   that the two surfaces have stopped drawing the same thing.
   ══════════════════════════════════════════════════════════════════════════ */

export type PublishedRoomPolicy = {
  /**
   * ⭐ MAY A BOOKING SHOW ON A ROW THAT IS NOT A TEACHING PERIOD — break,
   * lunch, registration?
   *
   *   `false` (THE BOARD) `structure` is decided ABOVE the booking test. A
   *           room "booked" across break because somebody's 12:00–13:30 window
   *           spans it must not make the break row look like a reservation
   *           anybody can act on. Nothing on this surface is editable there
   *           anyway — `cellRights("structure")` refuses everybody — so the
   *           only thing showing it could do is invite a click that does
   *           nothing.
   *
   *   `true`  (THE WORKBOOK) a printed timetable that says a room is free at
   *           the one moment it is not is the single failure a booking system
   *           exists to prevent. There is nothing to click on paper, and a
   *           lunchtime club running 12:30–13:15 is a real thing to know about
   *           the room. The export route's `cellFor` carries the long version
   *           of this argument; it was a measured bug there once.
   *
   * ⚠️ IT CHANGES `state`, WHICH MEANS IT CHANGES `canEdit` AND `lock` TOO —
   * `held` refuses everybody, `structure` refuses everybody, so in practice
   * the editability is identical and only the words differ. That is checked
   * rather than assumed: if `cellRights` ever lets somebody into a `held`
   * cell, this flag stops being cosmetic and this line stops being true.
   */
  bookingsShowOnNonTeachingRows: boolean;
  /**
   * ⭐ MAY A HELD CELL SAY WHAT IT IS HELD FOR?
   *
   *   `false` (THE BOARD) NEVER. `bookingRead.ts` withholds a purpose from
   *           anybody who did not make the booking and does not run the
   *           resource; a grid the whole school reads must not be a second,
   *           weaker path around that. The board's caller does not even
   *           decrypt the purpose, so there is nothing here to leak.
   *
   *   `true`  (THE WORKBOOK) ⚠️ AND ONLY BECAUSE ITS OCCURRENCES HAVE ALREADY
   *           BEEN THROUGH `readableBooking()`. The export route reads
   *           bookings via `booking.listBookingsForOrg`, which returns
   *           `detail: null` for a viewer who may not see the purpose — so
   *           `ConcreteOccurrence.label` is either a purpose this caller is
   *           entitled to or is absent, and absent still prints "Booked".
   *
   * ⚠️ SETTING THIS TRUE IS AN ASSERTION ABOUT THE CALLER'S OWN READ PATH, not
   * a display preference. A caller that hands raw `bookings` rows to this
   * function and sets it has published every purpose in the school.
   */
  showHeldPurpose: boolean;
};

/** What the published board asks for. The default, so a caller that has never
 *  heard of this type gets the stricter answer on both counts. */
export const BOARD_ROOM_POLICY: PublishedRoomPolicy = {
  bookingsShowOnNonTeachingRows: false,
  showHeldPurpose: false,
};

/** What the exported workbook asks for. Both opt-outs, both argued above. */
export const WORKBOOK_ROOM_POLICY: PublishedRoomPolicy = {
  bookingsShowOnNonTeachingRows: true,
  showHeldPurpose: true,
};

/** One `bookingWeekOverrides` row, in plain values. Ids and Convex types stay
 *  on the other side of the fence, exactly as `TemplateEntry` does. */
export type OverrideEntry = {
  id: string;
  weekday: number;
  periodOrdinal: number;
  /** Absent IS the cleared state. Not an empty string — see the schema note. */
  label?: string;
  note?: string;
  changedBy?: string;
  changedAt: number;
};

/**
 * ⭐ ONE ROOM'S WEEK, RESOLVED — the column of the grid.
 *
 * Precedence, top down, and it is deliberately the same shape as
 * `resolveWeekGrid`'s with one layer inserted:
 *
 *     CLOSED / OUT OF TERM / NON-TEACHING   the day is not running.
 *     NOT BOOKABLE                          a break row.
 *     BOOKING                               the ledger holds it. ⚠️ ABOVE the
 *                                           override, because a reservation is
 *                                           a fact about the room and an
 *                                           override is a note about the
 *                                           lesson.
 *     OVERRIDE                              somebody changed this week.
 *     TEMPLATE                              the standing lesson, inherited.
 *     FREE                                  nothing.
 *
 * ⚠️ THE BOOKING'S PURPOSE IS NEVER SHOWN **ON THE BOARD**, and the board's
 * caller could not show it if it wanted to — `ConcreteOccurrence.label` is left
 * undefined there for exactly that reason. `bookingRead.ts` withholds a purpose
 * from anybody who did not make the booking and does not run the resource, and
 * a grid read by the whole school would be a second, weaker path around that
 * rule. The cell says the room is taken and nothing more, which is the same
 * answer `timetableTemplate.weekGrid` gives. The exported workbook, whose
 * occurrences have already been through `readableBooking()`, opts into the
 * purpose — see `PublishedRoomPolicy.showHeldPurpose`, which is the one place
 * that decision is written down.
 */
export function resolvePublishedRoom(input: {
  week: ResolvedWeek;
  timezone: string;
  periods: PeriodDef[];
  /** Already filtered to this week's cycle week by the caller's index read. */
  templates: TemplateEntry[];
  /** Already filtered to this room and this Monday. */
  overrides: OverrideEntry[];
  occurrences: ConcreteOccurrence[];
  rights: RoomRights;
  /** ⭐ THE TWO SURFACE DIFFERENCES. Absent is the board's answer on both, so
   *  a caller that has never heard of it gets the stricter one. */
  policy?: PublishedRoomPolicy;
}): PublishedCell[] {
  const { week, timezone, periods, templates, overrides, occurrences, rights } =
    input;
  const policy = input.policy ?? BOARD_ROOM_POLICY;
  const cells: PublishedCell[] = [];

  for (const weekday of TEACHING_WEEKDAYS) {
    const date: CivilDate = civilOf(week.mondayDay + (weekday - 1));
    const closed = week.closedWeekdays.includes(weekday);
    const notTaught = week.untaughtWeekdays.includes(weekday);

    for (const p of periodsForWeekday(periods, weekday)) {
      const tpl =
        week.cycleWeek === null
          ? undefined
          : templates.find(
              (t) =>
                t.cycleWeek === week.cycleWeek &&
                t.weekday === weekday &&
                t.periodOrdinal === p.ordinal,
            );
      const ovr = overrides.find(
        (o) => o.weekday === weekday && o.periodOrdinal === p.ordinal,
      );

      let state: PublishedCellState;
      let label: string | undefined;

      if (notTaught) {
        state = "not-taught";
      } else if (closed) {
        state = "closed";
        label = week.closureLabels[0];
      } else if (!week.isTeachingWeek) {
        state = "non-teaching";
        label = week.closureLabels[0];
      } else {
        /* An UNTIMED period cannot collide with anything, and this school's
           periods are untimed — see `periodIsTimed`. The row still draws,
           because it is still part of the day, and the override layer is what
           makes it editable at all. That asymmetry is the whole reason a cell
           edit is not a `bookings` row.

           ⚠️ THE WINDOW IS RESOLVED FOR A BREAK ROW TOO, and only under the
           workbook's policy. On the board `structure` is decided ABOVE this
           test and no window is needed; hoisting the lookup unconditionally
           would spend a `periodWindow` per break row per room per week of the
           school's busiest query for an answer it throws away. */
        const wantsHit = p.isTeaching || policy.bookingsShowOnNonTeachingRows;
        const win =
          wantsHit && periodIsTimed(p)
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
        /* ⭐ WHAT A HELD CELL SAYS. "Booked" is the board's answer and the
           fallback for both: `label` absent means the purpose was WITHHELD by
           `readableBooking`, which is NOT the same as "no reason given", and
           neither is a thing this grid puts words to. See
           `PublishedRoomPolicy.showHeldPurpose`. */
        const heldLabel =
          (policy.showHeldPurpose ? hit?.label : undefined) ?? "Booked";

        if (!p.isTeaching) {
          /* ⚠️ ON THE BOARD, STRUCTURE OUTRANKS A BOOKING. A room "booked"
             across break because somebody's 12:00–13:30 window spans it must
             not make the break row look like a reservation anybody can act on;
             the row is structure and reads as structure. `wantsHit` is false
             there, so `hit` is undefined and this is the only branch reached.
             The workbook takes the other answer, for the reason on the policy
             field: paper cannot be clicked, and a printed sheet saying the room
             is free at the one moment it is not is the failure this whole
             feature exists to prevent. */
          if (hit) {
            state = "held";
            label = heldLabel;
          } else {
            state = "structure";
          }
        } else if (hit) {
          state = "held";
          label = heldLabel;
        } else if (ovr) {
          state = ovr.label ? "changed" : "cleared";
          label = ovr.label;
        } else if (tpl?.label) {
          state = "lesson";
          label = tpl.label;
        } else {
          state = "free";
        }
      }

      const { canEdit, lock } = cellRights(state, rights);
      cells.push({
        weekday,
        periodOrdinal: p.ordinal,
        state,
        label,
        /* Only meaningful under an override, and only when there IS a lesson
           to go back to — otherwise RESET and CLEAR would look like two names
           for the same button. */
        wasLabel:
          (state === "changed" || state === "cleared") && tpl?.label
            ? tpl.label
            : undefined,
        changedBy: ovr && (state === "changed" || state === "cleared") ? ovr.changedBy : undefined,
        changedAt: ovr && (state === "changed" || state === "cleared") ? ovr.changedAt : undefined,
        canEdit,
        lock,
      });
    }
  }

  return cells;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE PILLS — DERIVED, NEVER A HARDCODED LIST
   ══════════════════════════════════════════════════════════════════════════

   Cam: *"tabs/toggle pills in the right for timetable, minibuses, meeting
   rooms etc"*, and the "etc" is the specification. A fixed three-entry list
   would be wrong for every school but his, and wrong for his the day he adds
   a science-lab sheet.

   ⭐ SO THE PILLS ARE THE SCHOOL'S OWN ROOM LISTS. `bookingRoomSets` already
   holds exactly this — a named, ordered set of rooms with the fields that
   print under them — and Cam has already built his. A school that keeps an
   "IT Rooms" list, a "Minibuses" list and a "Meeting Rooms" list gets those
   three words, in that order, because it typed them.

   Two consequences, both deliberate:

     • ⚠️ A LIST WITH NOTHING ON IT GETS NO PILL. "do not show a pill for a
       category with nothing in it" — a sheet whose rooms have all been deleted
       from the estate resolves to zero columns, and a pill leading to an empty
       grid is worse than no pill.
     • THE GRID IS THE SAME GRID for every pill. A minibus sheet is rooms-as-
       columns with minibuses in the columns; there is no second layout to keep
       in step, and the day shape, the cycle and the closures are the school's
       and are shared. That is the property that makes "etc" cheap. */

export type PublishedCategory = {
  roomSetId: string;
  /** The school's own words. Never a label this file invented. */
  name: string;
  /** Rooms that actually resolve — a sheet's array may hold ids the estate no
   *  longer has, and those are dropped rather than counted. */
  roomCount: number;
  managingProjectName?: string;
};

/**
 * The order the pills appear in.
 *
 * ⚠️ NOT the order `bookingRoomSets` happens to come back in, and not
 * alphabetical either: `listRoomSets` sorts by name for a settings list, which
 * would put "Meeting rooms" before "Timetable" and bury the sheet the whole
 * school opens. Rooms first (the biggest sheet is the school's main grid, and
 * that is a fact about how schools build these rather than a guess), then by
 * name so the tail is stable and does not reshuffle as rooms are added.
 */
export function sortCategories(cats: PublishedCategory[]): PublishedCategory[] {
  return [...cats].sort(
    (a, b) => b.roomCount - a.roomCount || a.name.localeCompare(b.name),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PUBLISHING
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ "HAS THIS SCHOOL PUBLISHED ITS TIMETABLE" — the two flags, ANDed once.
 *
 * `bookingPublished` alone is not the answer: an organisation that has since
 * switched Booking off keeps whatever the flag last said, and every caller
 * that forgot to AND them would show a board the org's own admins cannot
 * reach. One function, so the board, the surface, the sidebar probe and the
 * template readers cannot disagree.
 */
export function timetableIsPublished(org: {
  bookingEnabled?: boolean;
  bookingPublished?: boolean;
}): boolean {
  return org.bookingEnabled === true && org.bookingPublished === true;
}

/**
 * The refusal a DRAFT timetable gives an ordinary member. One sentence, thrown
 * by the board and by the two bulk template readers, so "not yet" reads the
 * same wherever it is met.
 */
export const TEMPLATE_DRAFT_REFUSAL =
  "This organisation has not published its timetable yet.";

/**
 * ⭐ WHO SEES THE PUBLISHED BOARD.
 *
 *   UNPUBLISHED   an ORG ADMIN sees it, clearly marked as a draft, because the
 *                 person deciding whether to publish has to be able to look at
 *                 what they would be publishing. Everybody else is REFUSED on
 *                 the server, so a half-built board is not in the websocket
 *                 payload of somebody who was told they cannot see it.
 *   PUBLISHED     every member of the organisation, which is the same gate
 *                 (`requireBookingReader`) the rest of Booking reads on. A
 *                 timetable half the staffroom cannot see goes back on a
 *                 whiteboard.
 *
 * ⚠️ THIS IS A GATE, NOT A STYLE. It is called inside the query, above the
 * reads, and it throws. Rendering nothing on the client while the rows arrive
 * anyway is the shape of hiding a field with CSS.
 *
 * ── ⚠️⚠️ AND IT GATES A SURFACE, NOT THE WHOLE OF THE DATA ────────────────
 * Say this plainly, because the first draft of this file did not and a reader
 * would have trusted it: PUBLICATION IS NOT A CONFIDENTIALITY BOUNDARY AROUND
 * THE SCHOOL'S TIMETABLE. convex/lib/timetableAuth.ts sets the read model for
 * this whole feature — "READ: any member of the organisation" — and the week
 * map, the day shape, the closures, the room lists and a single resource's
 * week grid (`timetableTemplate.weekGrid`, which the department's own Booking
 * item draws and which carries the ledger's bookings as well) are readable by
 * every member whether or not anything has been published.
 *
 * What publication does withhold, on the server, is the BOARD and the two
 * BULK TEMPLATE READS that would hand somebody the entire draft grid in one
 * call — `templateSheet` and `cycleWeekTemplate`, both gated on
 * `timetableIsPublished` OR manage. That is the honest description of the
 * boundary; treating it as more than that is how a future change leans on a
 * guarantee that was never here.
 */
export function canReadPublishedBoard(input: {
  /** ⚠️ THE FEATURE ITSELF, and it beats everything below it. An organisation
   *  that has switched Booking off has no board, and showing its admins one
   *  would make "off" mean "off for other people" — which is not what the
   *  switch says, and is not what its confirm copy promises. */
  bookingEnabled: boolean;
  published: boolean;
  viewerIsOrgAdmin: boolean;
}): boolean {
  if (!input.bookingEnabled) return false;
  return input.published || input.viewerIsOrgAdmin;
}

/** What an admin is told they are looking at while it is unpublished. Written
 *  here so the surface and the settings toggle quote one sentence. */
export const UNPUBLISHED_ADMIN_NOTE =
  "Not published. You can see this because you are an organisation admin — nobody else in the school can open it yet.";

/** What the settings toggle says it will do, in both directions. Publishing
 *  shows a grid; it does not create, move or delete one row of it. */
export const PUBLISH_NOTE = {
  on: "Every member of this organisation can open the timetable and book the free periods. Turning it off later hides it again and deletes nothing.",
  off: "Only organisation admins can open the timetable. Set the year, the day shape and the room lists first, then publish it to the staffroom.",
} as const;
