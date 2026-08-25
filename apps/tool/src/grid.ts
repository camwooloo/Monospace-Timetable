/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE GRID — AND IT IS THE PRINTED DOCUMENT, NOT A PREVIEW OF ONE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Monospace draws this table twice — `TemplateGrid` (the standing week, typed
 * into) and `PublishedTimetable` (one real week, resolved). Both take their
 * geometry and every colour from the engine, and so does the workbook writer.
 * This file is the third reader of the same functions, and it is ONE grid
 * doing both jobs, because the two differ in exactly two places (what a cell
 * is resolved FROM, and what typing in one writes) and in nothing else.
 *
 * ⚠️⚠️ NOT ONE COLOUR IS DECIDED HERE. `gridClassFill` hands back the byte the
 * `.xlsx` prints; `gridSurfaces` hands back the two day tints and the gutter
 * from the school's own accent; `gridInkOn` decides what reads on each of
 * them; `bandForDay` decides which tint a block is; `caretShadow` draws the
 * crosshair. Every one of those is measured, several of them by bisection, and
 * the engine's own rule is **measure, never reason from the constants** — so a
 * local `#` in this file is a bug even when it looks right.
 *
 * ── ⭐ THE LINE-WORK POLICY, WHICH IS THE PART PEOPLE "TIDY" ─────────────
 * ONE AXIS OF RULES, AND IT IS THE COLUMNS. The only horizontal lines in the
 * input area of a day block are the top and bottom edges of a break bar and
 * the boundary between two EMPTY cells. The SPINE keeps its hairline between
 * every period — that is not drift, it is what makes a row countable. The full
 * argument, with the measured contrasts that force it, is the banner over
 * `GRID_RULE_ALPHA` in `timetableSheet.ts`.
 *
 *   room ↔ room, on a row with per-room content        RULED (hairline)
 *   room ↔ room, inside a break / closed bar           not ruled — ONE BAND
 *   period ↔ period, between two cells with a fill     not ruled
 *   period ↔ period, between two EMPTY cells           RULED (hairline)
 *   period ↔ a break bar, either direction             RULED (the bar's edge)
 *   period ↔ period, in the date/period spine          RULED (hairline)
 *   the spine ↔ the first room column                  RULED (strong — seam)
 *   day ↔ day, and the header block ↔ the grid         the GUTTER, no rule
 *   the last room column's outer edge                  not ruled
 *
 * ── ⚠️ AND THE CELLS ARE NOT REDRAWN ON EVERY KEYSTROKE ──────────────────
 * `dom.ts`'s banner says the app redraws whole screens, and it must not do
 * that here: a redraw takes the caret out of the `<input>` mid-word. Typing
 * writes into the document and repaints THAT ONE CELL. The table is rebuilt
 * only when something structural changes — a room, a period, the week.
 */

import {
  bandForDay,
  caretShadow,
  civilOf,
  cycleWeekLabel,
  yearWeekLabels,
  gridClassFill,
  gridElevation,
  gridInkOn,
  gridOverrideFill,
  gridSurfaces,
  periodsForWeekday,
  resolvePublishedRoom,
  resolveTimetableAccent,
  weekBandFor,
  weekdayName,
  weekdayShort,
  periodClock,
  CELL_LOCK_REASON,
  DAYS_PER_WEEK,
  GRID_DIM,
  GRID_NARROW_PX,
  GRID_NARROW_PX_MAX_WIDTH,
  GRID_PX,
  GRID_RULE_ALPHA,
  GRID_SEAM_ALPHA,
  GRID_TYPE,
  MAX_CELL_LABEL,
  WORKBOOK_ROOM_POLICY,
  type GridPx,
  type GridSurfaces,
  type PeriodDef,
  type CellLock,
  type PublishedCell,
  type PublishedCellState,
  type ResolvedWeek,
  type SchoolDocument,
  type SchoolRoomSheet,
  type SchoolYear,
  type TemplateEntry,
  type OverrideEntry,
  type ConcreteOccurrence,
} from "./engine";
import { h } from "./dom";
import { isDark } from "./store";

/* ⭐ THE STATES THAT ARE **NOT THE PLAN** — one colour for all of them, from
   `gridOverrideFill`. `changed` is a one-week override with text, `cleared` is
   one with the text taken off (the class moved), `held` is a real booking. The
   override colour WINS over the class colour: a room swap usually names a
   class and so has a pastel available, and drawing it would make the one
   changed cell look exactly like the sixty unchanged ones. */
const OVERRIDE_STATES = new Set<PublishedCellState>(["changed", "cleared", "held"]);
/** The states whose `label` is text to be coloured per class. */
const STATE_IS_TEXT = new Set<PublishedCellState>(["lesson", "changed"]);
/** Painted straight across the room columns in the day's own tint. */
const BAR_STATES = new Set<PublishedCellState>([
  "structure",
  "closed",
  "not-taught",
  "non-teaching",
]);

/* ══════════════════════════════════════════════════════════════════════════
   ⚠️⚠️ WHY A CELL REFUSES A KEYSTROKE — THE FACT IS THE ENGINE'S, THE ROUTE
   IS THIS APP'S
   ══════════════════════════════════════════════════════════════════════════

   `CELL_LOCK_REASON` is one table in the engine so that, in Monospace, the
   reason a click did nothing and the reason a write was REFUSED are the same
   words. There is no refusing mutation here — there is no server — so that
   half of the argument does not apply, and two of its six sentences end by
   naming a Monospace screen this program does not have:

     retired        "…in organisation settings → Booking"   → here: **Rooms**
     not-bookable   "…in the timetable settings"            → here: **Day**

   A school told to open a screen that is not in the window learns that the
   app is lying to them, which is worse than either wording.

   ⭐ SO THE **FACT** IS NEVER RE-WRITTEN — every sentence below opens with the
   engine's own words about what the cell IS — and only the sentence naming
   where to go is this app's. The four locks whose wording carries no route are
   the engine's string, referenced and not copied, so they cannot drift.

   ⚠️ `Record<CellLock, string>` IS EXHAUSTIVE ON PURPOSE: a seventh lock added
   to the engine fails this build by name rather than falling through to a
   blank tooltip. */
const LOCK_REASON: Record<CellLock, string> = {
  "not-teaching": CELL_LOCK_REASON["not-teaching"],
  held: CELL_LOCK_REASON.held,
  timetabled: CELL_LOCK_REASON.timetabled,
  "no-permission": CELL_LOCK_REASON["no-permission"],
  retired:
    "That room is out of service, so its whole column is locked — free periods included, exactly as the exported workbook locks it. Put it back in service on the Rooms screen.",
  "not-bookable":
    "That row is a break, not a period. Change it on the Day screen if it should hold a lesson.",
};

/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE CALLER ASKS FOR
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The two jobs, and they differ in exactly two things: what the cells are
 * resolved from, and what typing in one writes.
 *
 * ⭐ `template` IS **THE STANDING WEEK**, NOT A PARTICULAR WEEK. It is drawn
 * with `closedWeekdays: []` — see `writeTemplateWeek` below, which carries the
 * export route's argument for why.
 */
export type GridMode =
  | { kind: "template"; cycleWeek: number }
  | { kind: "week"; week: ResolvedWeek };

export type GridOpts = {
  doc: SchoolDocument;
  year: SchoolYear;
  sheet: SchoolRoomSheet;
  mode: GridMode;
  /** Write one cell. `label` empty means the person cleared it. */
  onWrite: (
    roomId: string,
    weekday: number,
    periodOrdinal: number,
    label: string,
  ) => void;
  /** Locked flat — a preview, with no typing at all. */
  readOnly?: boolean;
};

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE THE PAPER SITS ON
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ THE GROUND, READ FROM THE STYLESHEET RATHER THAN RESTATED.
 *
 * `gridSurfaces(paper, …)` mixes the dark bands OVER this colour, so if the
 * app's `--paper` and this value ever disagreed the bands would be computed
 * against a page that is not the page — and the failure would be a contrast
 * floor quietly missed rather than anything visible in review.
 */
function paperColour(): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--paper")
    .trim();
  return v || (isDark() ? "#0e1120" : "#ffffff");
}
function themeInk(): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--text")
    .trim();
  return v || (isDark() ? "#eef1fa" : "#10131f");
}

/** The geometry. Narrow below `sm`, where the two sticky columns are half a
 *  phone before a single room is drawn — see `GRID_NARROW_PX`'s banner. */
function geometry(): GridPx {
  return window.innerWidth < GRID_NARROW_PX_MAX_WIDTH ? GRID_NARROW_PX : GRID_PX;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE STANDING WEEK
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐⭐ A SYNTHETIC WEEK FOR THE TEMPLATE — AND THE `closedWeekdays: []` IS THE
 * WHOLE CORRECTNESS OF TEMPLATE LINKING.
 *
 * The export route builds the template sheet from the first teaching week of
 * the cycle and then overwrites exactly these three fields, because that week
 * carries its OWN closures: a year beginning on a Wednesday makes Monday and
 * Tuesday untaught in week 1, and `resolvePublishedRoom` answers `not-taught`
 * for them without ever reading what the template holds there. The template
 * tab then comes out with a hole punched in the school's standing timetable —
 * and with linking on, every later week of that cycle points at the hole and
 * two whole days evaluate to `""` across half the workbook.
 *
 * ⚠️ `daysAlign()` CANNOT CATCH IT. The row shape matches perfectly; it is the
 * CONTENT that was week-specific.
 *
 * So a template's only structural days are the ones the school NEVER runs.
 */
function standingWeek(year: SchoolYear, cycleWeek: number): ResolvedWeek {
  const taught = year.taughtWeekdays ?? [1, 2, 3, 4, 5];
  return {
    /* The dates are never printed on a template sheet, and a template has no
       Monday of its own. Day 0 keeps the arithmetic total. */
    monday: civilOf(0),
    mondayDay: 0,
    taughtDays: taught.length,
    closedWeekdays: [],
    untaughtWeekdays: Array.from({ length: DAYS_PER_WEEK }, (_v, i) => i + 1).filter(
      (wd) => !taught.includes(wd),
    ),
    closureLabels: [],
    closureKinds: [],
    isTeachingWeek: true,
    cycleWeek,
    label: null,
    pinned: false,
    source: "rule",
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   RESOLVING
   ══════════════════════════════════════════════════════════════════════════ */

type Column = {
  roomId: string;
  name: string;
  active: boolean;
  values: Record<string, string | null>;
  cells: Map<string, PublishedCell>;
};

const cellKey = (weekday: number, ordinal: number) => `${weekday}|${ordinal}`;

function resolveColumns(o: GridOpts): Column[] {
  const { year, sheet, mode } = o;
  const periods: PeriodDef[] = year.periods.map((p) => ({
    ordinal: p.ordinal,
    name: p.name,
    start: p.start,
    end: p.end,
    /* ⚠️ `order` IS CARRIED. `ordinal` is a period's identity and `order` is
       where it sits — drop it and `periodPosition()` falls back to the
       ordinal, so the grid draws the day in CREATION order while the admin
       sees the order they dragged. On screen it looks right, which is the
       worst version of this. */
    order: p.order,
    weekday: p.weekday,
    isTeaching: p.isTeaching,
  }));

  const week = mode.kind === "template" ? standingWeek(year, mode.cycleWeek) : mode.week;

  return sheet.rooms.map((room) => {
    /* ⭐ THE ROOM'S OWN GRID FOR THIS CYCLE WEEK. Stored per cycle week and
       never materialised per week — eight rooms on a two-week cycle is sixteen
       grids for the whole year, which is why a three-year file mails. */
    const templates: TemplateEntry[] = [];
    for (const cell of year.templates ?? []) {
      if (cell.roomId !== room.id) continue;
      if (week.cycleWeek === null || cell.cycleWeek !== week.cycleWeek) continue;
      templates.push({
        id: cell.id,
        cycleWeek: cell.cycleWeek,
        weekday: cell.weekday,
        periodOrdinal: cell.periodOrdinal,
        label: cell.label,
        note: cell.note,
      });
    }

    /* ⚠️ NO OVERRIDES AND NO OCCURRENCES ON A TEMPLATE. A template shows the
       STANDING grid; folding in the bookings that happened to land in one
       week would make it a week sheet with a misleading name, and folding in
       that week's hand-made changes would do it twice over — an override is a
       change to ONE week by definition. */
    const overrides: OverrideEntry[] = [];
    const occurrences: ConcreteOccurrence[] = [];
    if (mode.kind === "week") {
      for (const row of year.weekChanges ?? []) {
        if (row.roomId !== room.id || row.monday !== week.monday) continue;
        overrides.push({
          id: row.id,
          weekday: row.weekday,
          periodOrdinal: row.periodOrdinal,
          label: row.label,
          note: row.note,
          changedBy: row.changedBy,
          changedAt: row.changedAt ?? 0,
        });
      }
      for (const b of year.bookings ?? []) {
        if (b.roomId !== room.id) continue;
        occurrences.push({
          id: b.id,
          startUtc: b.startUtc,
          endUtc: b.endUtc,
          /* ⚠️ `approved` IS THE DEFAULT AND `"confirmed"` IS NOT A STATUS.
             Only `approved` and `pending` put anything in a cell; every other
             string is a booking that silently does not exist. */
          status: b.status ?? "approved",
          label: b.purpose,
        });
      }
    }

    const active = room.active !== false;
    const cells = resolvePublishedRoom({
      week,
      timezone: year.timezone,
      periods,
      templates,
      overrides,
      occurrences,
      /**
       * ⭐ THE ONE VIEWER THIS TOOL HAS: the school's own timetabler, at the
       * keyboard, holding the file. So `mayOverride` is true — "whoever may
       * set the standing lesson may set aside one week of it" — and
       * `cellRights` still refuses the three things it refuses to everybody:
       *
       *   held             a booking holds it. Cancel the booking; typing over
       *                    it would leave the room reserved and the grid
       *                    saying otherwise.
       *   break / closed   structure, not space.
       *   retired          the room is out of service, so its WHOLE column is
       *                    locked, free periods included — exactly what
       *                    `lockPrefilled` writes into the workbook.
       *
       * ⚠️ `overrideAll` STAYS FALSE. It is an organisation-wide switch about
       * OTHER people, and there are no other people here; `mayOverride` is
       * already the answer for this one.
       */
      rights: { active, mayBook: true, mayOverride: true, overrideAll: false },
      /* ⭐ THE WORKBOOK'S POLICY, NOT THE BOARD'S — because this screen IS the
         export. A booking spanning lunch shows on the break row (a printed
         timetable that says a room is free at the one moment it is not is the
         single failure a booking system exists to prevent), and a held cell
         may name its purpose, which on a board would route around a read gate
         and here cannot: the file IS the school's own. */
      policy: WORKBOOK_ROOM_POLICY,
    });

    const map = new Map<string, PublishedCell>();
    for (const c of cells) map.set(cellKey(c.weekday, c.periodOrdinal), c);
    return {
      roomId: room.id,
      name: room.name,
      active,
      values: room.values ?? {},
      cells: map,
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   DRAWING
   ══════════════════════════════════════════════════════════════════════════ */

type RowDef = {
  weekday: number;
  period: PeriodDef;
  firstOfDay: boolean;
  blockLength: number;
  blockIndex: number;
};

/** What one cell is painted. Asked about a cell AND about the cell below it,
 *  so the override-wins-over-class rule cannot exist in two copies. */
function fillOf(cell: PublishedCell | undefined, dark: boolean): string | null {
  if (!cell) return null;
  if (OVERRIDE_STATES.has(cell.state)) return gridOverrideFill(dark).fill;
  return STATE_IS_TEXT.has(cell.state) ? gridClassFill(cell.label, dark) : null;
}

export function renderGrid(o: GridOpts): HTMLElement {
  const dark = isDark();
  const px = geometry();
  const paper = paperColour();
  const ink = themeInk();
  /* ⭐⭐ THE FURNITURE IS THE SCHOOL'S OWN COLOUR. One accent on the document,
     the same one the exported workbook is painted from, so this editor and the
     download stay one document. ⚠️ THE CHIPS DO NOT MOVE WITH IT — that is why
     the dark tints are clamped; see `darkFrameFor`. */
  const accent = resolveTimetableAccent(o.doc.school.accent ?? null);
  const surfaces: GridSurfaces = gridSurfaces(paper, dark, accent);
  const lift = gridElevation(dark);

  /** ⚠️ THE RULE IS CHOSEN AGAINST THE CELL IT IS DRAWN ON. A translucent
   *  border composites over the cell's OWN background, and half these cells
   *  are a printed pastel on a dark page — so a theme token here would be
   *  1.05 : 1 on the chips and correct nowhere. */
  const ruleInk = (fill: string | null, alpha: string) =>
    `color-mix(in srgb, ${gridInkOn(fill, ink)} ${alpha}, transparent)`;
  const hair = (fill: string | null) => `1px solid ${ruleInk(fill, GRID_RULE_ALPHA)}`;
  const seam = (fill: string | null) => `1px solid ${ruleInk(fill, GRID_SEAM_ALPHA)}`;
  /* ⚠️⚠️ THE SAME HAIRLINE, DRAWN AS A SHADOW, ON ONE BOUNDARY: the bottom of
     an EMPTY input cell. A `<td>` here takes its height from the `<input>`
     inside it, so a 1px `border-bottom` makes that row a pixel taller than its
     neighbours — and WHICH rows move with the data, so typing a class into the
     last empty cell of a row shrinks the row and shifts everything below it.
     An inset shadow paints the same pixels and takes part in no layout. */
  const bottomRule = (fill: string | null) =>
    `inset 0 -1px 0 ${ruleInk(fill, GRID_RULE_ALPHA)}`;

  const columns = resolveColumns(o);
  const fields = o.sheet.fields;
  const noFields = fields.length === 0;
  const taught = o.year.taughtWeekdays ?? [1, 2, 3, 4, 5];
  const periods: PeriodDef[] = o.year.periods.map((p) => ({
    ordinal: p.ordinal,
    name: p.name,
    start: p.start,
    end: p.end,
    order: p.order,
    weekday: p.weekday,
    isTeaching: p.isTeaching,
  }));

  /* ── The rows, in day blocks ──
     ⚠️ THE BLOCK INDEX IS THE BLOCK'S POSITION, NEVER THE WEEKDAY NUMBER. A
     week with a day missing to a closure still has to alternate; keying on
     `weekday % 2` made two ADJACENT blocks share a tint whenever a day was
     skipped, which is the one job the alternation has. */
  const rows: RowDef[] = [];
  let blockIndex = 0;
  for (const weekday of taught) {
    const dayPeriods = periodsForWeekday(periods, weekday);
    if (dayPeriods.length === 0) continue;
    dayPeriods.forEach((period, i) => {
      rows.push({
        weekday,
        period,
        firstOfDay: i === 0,
        blockLength: dayPeriods.length,
        blockIndex,
      });
    });
    blockIndex++;
  }

  const width = px.day + px.period + columns.length * px.room;

  /**
   * ⭐⭐ ONE ROW HEIGHT FOR THE WHOLE GRID — AND IT IS NOT SIMPLY `px.row`.
   *
   * The workbook's rows are a uniform 21 units, so the screen's must be uniform
   * too. `height` on a table cell is only a MINIMUM, and the period spine is
   * the one cell every row has: on a row whose period carries a clock it holds
   * TWO lines and grows past `px.row`, on a row without one it holds a single
   * line and sits at the floor.
   *
   * ⚠️ SO A SCHOOL THAT TIMES SOME PERIODS AND LABELS OTHERS GOT TWO ROW
   * HEIGHTS — measured on the engine's own fixture, whose "Period 6" is
   * deliberately untimed: 32px against 35px for the other eight, a step in the
   * middle of every day. That is the same defect `bottomRule` exists to avoid
   * one pixel of, three pixels larger and driven by the school's DATA.
   *
   * The floor is therefore raised for the whole grid the moment ANY period is
   * timed, and the untimed rows centre their single line in it. The two-line
   * figure is derived from the engine's own type scale rather than measured
   * into a constant here, so a change to `GRID_TYPE` carries.
   */
  const anyTimed = periods.some((p) => p.start && p.end);
  const lineOf = (size: number) => Math.round(size * 1.45);
  const rowH = anyTimed
    ? Math.max(
        px.row,
        lineOf(GRID_TYPE.period.fontSize) + lineOf(GRID_TYPE.meta.fontSize) + 4,
      )
    : px.row;

  /**
   * ⭐⭐ THE HEADER BLOCK PINS, AND ITS ROW HEIGHTS ARE THEREFORE EXPLICIT.
   *
   * A week is forty-five rows and ~1,600px tall; the thing that NAMES a column
   * — the room code — is at the top of it. Lose that and the scan is over,
   * which is the whole argument in `GRID_RULE_ALPHA`'s banner for why the
   * COLUMNS keep their rules and the rows do not.
   *
   * ⚠️ `PublishedTimetable` pins its header and `TemplateGrid` deliberately
   * does NOT — and the difference is not a preference, it is whether the grid
   * owns a vertical scrollport. `TemplateGrid` lives inside a settings panel
   * that owns the scroll, so `sticky top-0` there would resolve against a box
   * that never scrolls and pin nothing while reading as though it did. **This
   * grid owns `.gridscroll`**, so it is the `PublishedTimetable` case.
   *
   * ⚠️ AND EACH ROW NEEDS ITS OWN `top`, which means the heights cannot be
   * left to the content: row two has to sit exactly under row one or the block
   * comes apart as it pins. They are derived from the engine's type scale, the
   * same way `rowH` is, so a change to `GRID_TYPE` carries.
   */
  const headRowH = lineOf(GRID_TYPE.room.fontSize) + 4;
  const fieldRowH = lineOf(GRID_TYPE.meta.fontSize) + 4;
  /** Where a field row pins to: under the room codes and the field rows above it. */
  const fieldTop = (i: number) => headRowH + i * fieldRowH;

  /* ── The crosshair ──
     Held here rather than in the store: it is a property of this table on this
     screen, and putting it in the document would repaint the world on a Tab. */
  let caret: { row: number; col: number } | null = null;
  type CellMeta = {
    el: HTMLElement;
    fill: string | null;
    under?: string;
    row: number;
    col: number;
  };
  const cellMetas: CellMeta[] = [];
  const spineMetas: Array<{ el: HTMLElement; fill: string; row: number }> = [];
  const headMetas: Array<{ el: HTMLElement; fill: string; col: number }> = [];

  function applyCaret() {
    for (const m of cellMetas) {
      m.el.style.boxShadow =
        caretShadow(caret?.row === m.row, caret?.col === m.col, m.fill, ink, m.under) ??
        "";
    }
    for (const m of spineMetas) {
      /* The spine's rightward cast rides in the `under` slot — this is the
         rightmost sticky column, and only the outermost column of a sticky
         plane may carry the elevation or it casts onto itself. */
      m.el.style.boxShadow =
        caretShadow(caret?.row === m.row, false, m.fill, ink, lift.spine) ?? lift.spine;
    }
    for (const m of headMetas) {
      m.el.style.boxShadow =
        caretShadow(false, caret?.col === m.col, m.fill, ink, noFields ? lift.header : undefined) ??
        (noFields ? lift.header : "");
    }
  }

  /* ── colgroup ── */
  const cols = h(
    "colgroup",
    null,
    h("col", { style: { width: `${px.day}px` } }),
    h("col", { style: { width: `${px.period}px` } }),
    ...columns.map(() => h("col", { style: { width: `${px.room}px` } })),
  );

  /* ══════════════════════════════════════════════════════════════════════
     THE HEADER BLOCK — rows 1–4 of the workbook, ONE banded unit
     ══════════════════════════════════════════════════════════════════════ */

  const bandLabel =
    o.mode.kind === "template"
      ? weekBandFor(cycleLabelOf(o.year, o.mode.cycleWeek))
      : weekBandFor(o.mode.week.label);

  const structure = (fill: string) => ({
    backgroundColor: fill,
    color: gridInkOn(fill, ink),
  });

  const corner = h(
    "th",
    {
      colspan: String(2),
      class: "cellpad",
      style: {
        ...structure(surfaces.band),
        /* ⭐ THE ONE CELL THAT PINS BOTH WAYS — the top-left of the header
           block and the left edge of the spine at once, which is why
           `gridElevation` has a `corner` at all. */
        position: "sticky",
        left: "0",
        top: "0",
        zIndex: "30",
        height: `${headRowH}px`,
        fontSize: `${GRID_TYPE.room.fontSize}px`,
        fontWeight: String(GRID_TYPE.room.fontWeight),
        letterSpacing: GRID_TYPE.room.letterSpacing,
        borderRight: seam(surfaces.band),
        /* ⚠️ THE CORNER CASTS BOTH WAYS ONLY WHEN IT IS ALSO THE BOTTOM OF THE
           HEADER BLOCK — a school with no custom fields. With fields under it,
           the LAST field row is the block's bottom edge; this cell would
           otherwise cast a shadow onto the rows of its own header. */
        boxShadow: noFields ? lift.corner : lift.spine,
      },
    },
    bandLabel,
  );

  const headRow = h(
    "tr",
    null,
    corner,
    ...columns.map((col, ci) => {
      const th = h(
        "th",
        {
          class: "cellpad",
          title: col.active ? col.name : `${col.name} — out of service`,
          style: {
            ...structure(surfaces.band),
            position: "sticky",
            top: "0",
            zIndex: "25",
            height: `${headRowH}px`,
            fontSize: `${GRID_TYPE.room.fontSize}px`,
            fontWeight: String(GRID_TYPE.room.fontWeight),
            letterSpacing: GRID_TYPE.room.letterSpacing,
            /* ⭐ THE COLUMN TRACK STARTS HERE, drawn by the cell on the LEFT of
               each boundary — and never after the last room, whose right-hand
               edge is the sheet's empty column L. */
            borderRight: ci === columns.length - 1 ? undefined : hair(surfaces.band),
          },
        },
        h(
          "span",
          /* A room out of service is dimmed, in the header block only — which
             is always the lighter `band`, which is what `GRID_DIM.retired` was
             measured against. */
          { style: { opacity: col.active ? "1" : String(GRID_DIM.retired) } },
          col.name,
        ),
      );
      headMetas.push({ el: th, fill: surfaces.band, col: ci });
      return th;
    }),
  );

  const fieldRows = fields.map((fieldDef, fi) => {
    const last = fi === fields.length - 1;
    return h(
      "tr",
      null,
      h(
        "th",
        {
          colspan: "2",
          class: "cellpad right",
          style: {
            ...structure(surfaces.band),
            position: "sticky",
            left: "0",
            top: `${fieldTop(fi)}px`,
            zIndex: "30",
            height: `${fieldRowH}px`,
            fontSize: `${GRID_TYPE.meta.fontSize}px`,
            fontWeight: "400",
            borderRight: seam(surfaces.band),
            boxShadow: last ? lift.corner : lift.spine,
          },
        },
        h("span", { style: { opacity: String(GRID_DIM.label) } }, fieldDef.label),
      ),
      ...columns.map((col, ci) => {
        const raw = col.values[fieldDef.id];
        const td = h(
          "td",
          {
            class: "cellpad",
            style: {
              ...structure(surfaces.band),
              position: "sticky",
              top: `${fieldTop(fi)}px`,
              zIndex: "25",
              height: `${fieldRowH}px`,
              fontSize: `${GRID_TYPE.meta.fontSize}px`,
              borderRight: ci === columns.length - 1 ? undefined : hair(surfaces.band),
            },
          },
          /* ⚠️ AN ABSENT VALUE PRINTS NOTHING, and so does `null`. It is NOT
             "-": a school types "-" to mean "no teacher assigned", and that is
             a value somebody chose. Inventing a placeholder puts words on a
             printed sheet nobody typed. */
          raw === null || raw === undefined
            ? null
            : h("span", { style: { opacity: String(GRID_DIM.label) } }, raw),
        );
        if (last) headMetas.push({ el: td, fill: surfaces.band, col: ci });
        return td;
      }),
    );
  });

  /* ══════════════════════════════════════════════════════════════════════
     THE DAY BLOCKS
     ══════════════════════════════════════════════════════════════════════ */

  const body = h("tbody", { style: { position: "relative", zIndex: "1" } });
  const narrow = px === GRID_NARROW_PX;

  rows.forEach((row, rowIndex) => {
    const dayFill = bandForDay(surfaces, row.blockIndex);
    const bookable = row.period.isTeaching;
    const prevRow = row.firstOfDay ? null : rows[rowIndex - 1];
    const nextRow = rows[rowIndex + 1];
    const nextInDay = nextRow && !nextRow.firstOfDay ? nextRow : null;

    const rowCells = columns.map((c) => c.cells.get(cellKey(row.weekday, row.period.ordinal)));
    /* ⚠️ EVERY CELL, NOT THE FIRST. Under the workbook's policy a booking may
       land on a break row in ONE room, which makes the row a mix — and a bar
       drawn from `cells[0]` alone would paint over the reservation that is the
       whole reason the policy differs. */
    const rowIsBar =
      rowCells.length > 0 && rowCells.every((c) => c && BAR_STATES.has(c.state));

    /* ⚠️ THE BAR'S TWO EDGES, AND NOTHING ELSE. Two consecutive non-bookable
       periods are ONE bar rather than two with a line between them. */
    const prevIsBar =
      prevRow !== null &&
      columns.every((c) => {
        const cell = c.cells.get(cellKey(prevRow.weekday, prevRow.period.ordinal));
        return cell && BAR_STATES.has(cell.state);
      });
    const nextIsBar =
      nextInDay !== null &&
      columns.every((c) => {
        const cell = c.cells.get(cellKey(nextInDay.weekday, nextInDay.period.ordinal));
        return cell && BAR_STATES.has(cell.state);
      });
    const barTop = rowIsBar && prevRow !== null && !prevIsBar;
    const barBottom = rowIsBar && nextInDay !== null && !nextIsBar;

    /* ⭐ THE SEPARATOR STRIP — the workbook's own blank row, merged B..K on the
       grey gutter, and drawn ABOVE EVERY DAY INCLUDING THE FIRST so the header
       block is sealed off by the same seam that separates Monday from Tuesday. */
    if (row.firstOfDay) {
      body.appendChild(
        h(
          "tr",
          { "aria-hidden": "true" },
          h("td", {
            colspan: String(2 + columns.length),
            style: {
              height: `${px.gutter}px`,
              backgroundColor: surfaces.gutter,
              padding: "0",
            },
          }),
        ),
      );
    }

    const tr = h("tr");

    if (row.firstOfDay) {
      tr.appendChild(
        h(
          "th",
          {
            rowspan: String(row.blockLength),
            scope: "rowgroup",
            class: "cellpad",
            style: {
              ...structure(dayFill),
              position: "sticky",
              left: "0",
              zIndex: "10",
              fontSize: `${GRID_TYPE.day.fontSize}px`,
              fontWeight: String(GRID_TYPE.day.fontWeight),
              /* ⚠️ A HAIRLINE AND NOT THE SEAM. This is a boundary INSIDE the
                 spine — the date column against the period column, both in the
                 same band — not the spine against the timetable. And NO
                 elevation: the spine casts from its rightmost column only. */
              borderRight: hair(dayFill),
            },
          },
          narrow ? weekdayShort(row.weekday) : weekdayName(row.weekday),
          o.mode.kind === "week"
            ? h(
                "span",
                {
                  class: "mono",
                  style: {
                    fontSize: `${GRID_TYPE.meta.fontSize}px`,
                    opacity: String(GRID_DIM.label),
                    fontWeight: "400",
                  },
                },
                dateOf(o.mode.week, row.weekday),
              )
            : null,
        ),
      );
    }

    /* ── The period column: the one cell every row has ── */
    const spineTh = h(
      "th",
      {
        scope: "row",
        class: "cellpad",
        title: row.period.start && row.period.end
          ? `${row.period.name} — ${periodClock(row.period.start, row.period.end)}`
          : row.period.name,
        style: {
          ...structure(dayFill),
          position: "sticky",
          left: `${px.day}px`,
          zIndex: "10",
          fontSize: `${GRID_TYPE.period.fontSize}px`,
          fontWeight: String(
            bookable ? GRID_TYPE.period.taught : GRID_TYPE.period.untaught,
          ),
          /* ⚠️ A FLOOR ON THE ROW HEIGHT, AND IT LIVES ON THIS CELL BECAUSE IT
             IS THE ONE CELL EVERY ROW HAS. A bookable row is as tall as the
             `<input>` in it; a break row is as tall as this label — so the
             workbook's uniform 21 came out as two different row heights and
             the break bars were visibly squatter than the lessons.
             ⭐ AND IT IS `rowH`, NOT `px.row` — see the banner over it. */
          height: `${rowH}px`,
          /* ⭐ THE ONE STRONG LINE IN THE GRID — furniture left of it, the
             timetable right of it. */
          borderRight: seam(dayFill),
          /* The spine keeps its row rhythm when the input area no longer does:
             the hairline between two periods, drawn by the upper cell, and
             never at the foot of a day where the gutter takes over. */
          borderBottom: nextInDay ? hair(dayFill) : undefined,
        },
      },
      /* ⚠️ THE OPACITY IS ON THIS WRAPPER, NOT ON THE `<th>`. CSS `opacity`
         fades an element's background with its text, so on the cell it would
         wash the day band out — and a break's label would be a different shade
         from the bar it labels, which is the one thing the painted row exists
         to avoid. */
      h(
        "span",
        { style: { opacity: bookable ? "1" : String(GRID_DIM.label) } },
        row.period.name,
      ),
      /* ⚠️ THE CLOCK ONLY WHEN THERE IS ONE. A school that LABELS its periods
         rather than timing them got "untimed" printed on all forty-five rows,
         doubling the row height to say nothing. */
      row.period.start && row.period.end
        ? h(
            "span",
            {
              class: "mono",
              style: {
                fontSize: `${GRID_TYPE.meta.fontSize}px`,
                opacity: String(GRID_DIM.label),
              },
            },
            periodClock(row.period.start, row.period.end),
          )
        : null,
    );
    spineTh.style.boxShadow = lift.spine;
    spineMetas.push({ el: spineTh, fill: dayFill, row: rowIndex });
    tr.appendChild(spineTh);

    /* ── The room columns ── */
    columns.forEach((col, colIndex) => {
      const cell = rowCells[colIndex];
      const isBar = rowIsBar;

      if (isBar) {
        /* ⭐⭐ A BAR, NOT A ROW OF CELLS. It holds nothing per room, so it has
           NO ROOMS TO SEPARATE and draws no verticals — it reads as one band
           straight across, which is what the gutter between two days already
           does and what the workbook is painting when it fills B..K in the
           day's tint. */
        const td = h(
          "td",
          {
            class: "cellpad",
            title: cell?.lock ? LOCK_REASON[cell.lock] : undefined,
            style: {
              ...structure(dayFill),
              fontSize: `${GRID_TYPE.meta.fontSize}px`,
              borderTop: barTop ? hair(dayFill) : undefined,
              borderBottom: barBottom ? hair(dayFill) : undefined,
            },
          },
          /* The closure's name, once, in the middle of the bar — not repeated
             in every room column, which is the same "every row carries every
             fact" that makes a screen look full and say nothing. */
          colIndex === Math.floor(columns.length / 2) && cell?.label
            ? h("span", { style: { opacity: String(GRID_DIM.label) } }, cell.label)
            : null,
        );
        cellMetas.push({ el: td, fill: null, row: rowIndex, col: colIndex });
        tr.appendChild(td);
        return;
      }

      const fill = fillOf(cell, dark);
      const override = cell ? OVERRIDE_STATES.has(cell.state) : false;
      const editable = !o.readOnly && (cell?.canEdit ?? false);

      /* ⭐ THE ONE HORIZONTAL RULE LEFT BETWEEN TWO LESSONS IS BETWEEN TWO THAT
         AREN'T. An empty cell has no fill and no label to say where it begins,
         so a room free for three periods would be one white block of
         indeterminate height — and a template nobody has typed in yet is 360 of
         them. ⚠️ NOT WHEN THE ROW BELOW IS A BAR: the bar draws its own top
         edge and both would be a doubled 2px line. */
      const belowEmpty =
        !fill &&
        nextInDay !== null &&
        !nextIsBar &&
        !fillOf(
          col.cells.get(cellKey(nextInDay.weekday, nextInDay.period.ordinal)),
          dark,
        );

      const under = [
        /* ⭐ THE EDGE MARKS AN OVERRIDE AND NOTHING ELSE. A bar on every cell
           is not a mark. Colour is also not the only channel: an override is
           bold as well, because a staffroom is not all sighted the same way. */
        override ? `inset 3px 0 0 ${gridOverrideFill(dark).edge}` : null,
        belowEmpty ? bottomRule(null) : null,
      ]
        .filter(Boolean)
        .join(", ");

      const value = cell && STATE_IS_TEXT.has(cell.state) ? (cell.label ?? "") : "";
      const shown = cell?.state === "held" ? (cell.label ?? "Booked") : value;

      const input = h("input", {
        class: "cell",
        type: "text",
        value: shown,
        maxlength: String(MAX_CELL_LABEL),
        spellcheck: "false",
        autocomplete: "off",
        autocapitalize: "characters",
        disabled: !editable,
        title: cell?.lock
          ? LOCK_REASON[cell.lock]
          : cell?.state === "changed" || cell?.state === "cleared"
            ? `Changed for this week${cell.changedBy ? ` by ${cell.changedBy}` : ""}${
                cell.wasLabel ? ` — the timetable says ${cell.wasLabel}` : ""
              }.`
            : undefined,
        style: {
          fontWeight: override ? "700" : String(GRID_TYPE.cell.fontWeight),
          textDecoration: override ? "underline dotted" : undefined,
          textUnderlineOffset: "2px",
        },
      }) as HTMLInputElement;

      const td = h(
        "td",
        {
          style: {
            /* ⭐⭐ THE COLUMN TRACK, AND THE ONLY RULE A LESSON CARRIES. There
               is no `borderTop` and no `borderBottom`: two lessons in the same
               room in consecutive periods are two of the SAME KIND OF THING,
               and the lattice between them is what made this read as a
               spreadsheet. ⚠️ `hair(fill)` and not a theme token — a
               translucent border composites over the cell's OWN background. */
            borderRight: colIndex === columns.length - 1 ? undefined : hair(fill),
            /* ⭐ THE INPUT AREA IS ONE FLAT SURFACE, DAY AFTER DAY. The band
               belongs to the furniture: washing the cells with it too would
               make an empty Tuesday a different colour from an empty Monday
               and put a second rhythm under the class fills, which are the
               only thing allowed to colour this area. */
            backgroundColor: fill ?? paper,
            color: gridInkOn(fill, ink),
            height: `${rowH}px`,
            /* ⚠️ THE RING IS THE CELL'S OWN INK. On a printed pastel six of the
               eight accent presets measure under 1.5 : 1, so `--accent` is not
               a ring on half this grid. */
            "--cell-ring": gridInkOn(fill, ink),
          },
        },
        input,
      );
      td.style.boxShadow = under || "";
      cellMetas.push({
        el: td,
        fill,
        under: under || undefined,
        row: rowIndex,
        col: colIndex,
      });

      /* ── Typing ──
         ⚠️ ON `change`, NOT ON `input`. Writing per keystroke would put a
         `structuredClone` of the whole document between every two characters,
         and — because clearing a cell can DELETE its row — would make "9F/It"
         momentarily "9", "9F", "9F/" … each one a separate edit. */
      input.addEventListener("change", () => {
        o.onWrite(col.roomId, row.weekday, row.period.ordinal, input.value.trim());
      });
      input.addEventListener("focus", () => {
        caret = { row: rowIndex, col: colIndex };
        applyCaret();
      });
      input.addEventListener("keydown", (e) => {
        const key = (e as KeyboardEvent).key;
        /* Enter moves DOWN the day and Tab moves ACROSS the rooms — the two
           axes a person actually reads a timetable along. Tab is left to the
           browser, which already does exactly that. */
        if (key === "Enter" || key === "ArrowDown") {
          if (moveFocus(rowIndex, 1, colIndex)) e.preventDefault();
        } else if (key === "ArrowUp") {
          if (moveFocus(rowIndex, -1, colIndex)) e.preventDefault();
        } else if (key === "Escape") {
          input.blur();
        }
      });
      tr.appendChild(td);
    });

    body.appendChild(tr);
  });

  /**
   * Move the caret vertically.
   *
   * ⚠️ IT SKIPS THE ROWS THAT REFUSE A KEYSTROKE rather than stopping at the
   * first one. A day has a break bar in the middle of it; Enter landing on
   * lunch and going dead is the shape of "the arrow keys stop working
   * halfway down Tuesday".
   */
  function moveFocus(from: number, step: 1 | -1, col: number): boolean {
    for (let r = from + step; r >= 0 && r < rows.length; r += step) {
      const meta = cellMetas.find((m) => m.row === r && m.col === col);
      const el = meta?.el.querySelector("input") as HTMLInputElement | null;
      if (el && !el.disabled) {
        el.focus();
        el.select();
        return true;
      }
    }
    return false;
  }

  const table = h(
    "table.tt",
    { style: { width: `${width}px` } },
    cols,
    /* ⚠️⚠️ `position: relative` ON THE `<thead>`, AND IT IS LOAD-BEARING RATHER
       THAN TIDY. The header block casts a downward shadow and a `<thead>` comes
       BEFORE its `<tbody>` in document order, so without a stacking context of
       its own that shadow is painted over by the first row underneath it — the
       gutter strip — and simply is not there. */
    /* ⚠️⚠️ TWO STACKING CONTEXTS, AND THE ORDER IS THE POINT. The spine's cells
       are `sticky` at z-index 10 inside the BODY; without a context of its own
       the header block would be a sibling at a lower number and a scrolled
       spine cell would paint straight over the pinned room codes. Confining
       each half and ordering the halves is one property each, rather than
       renumbering nine cells against forty-five. */
    h("thead", { style: { position: "relative", zIndex: "2" } }, headRow, ...fieldRows),
    body,
  );
  /* ⚠️ THE CROSSHAIR IS CLEARED ON `focusout` AT THE TABLE, NOT ON EACH INPUT'S
     OWN BLUR. This fires once when focus actually leaves the table; hanging it
     on each input would clear and re-set the crosshair between every two cells
     of a row typed at speed, which reads as a flicker down the whole grid. */
  table.addEventListener("focusout", (e) => {
    if (!table.contains((e as FocusEvent).relatedTarget as Node | null)) {
      caret = null;
      applyCaret();
    }
  });

  /* ⭐ THE MARGIN DOWN BOTH SIDES — the source's empty columns A and L, and it
     is on the FRAME rather than on the scroller inside it. Two of this table's
     columns are `position: sticky` and a sticky inset resolves against the
     scroll container's own box, so padding ON the scroller is padding the spine
     slides underneath the moment the grid moves sideways. */
  return h(
    "div.gridframe",
    { style: { paddingLeft: `${px.pad}px`, paddingRight: `${px.pad}px` } },
    h("div.gridscroll", null, table),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/** ⚠️ `cycleWeekLabel` AND NEVER `weekLabels[cw] ?? "Week N+1"`. A cycle
 *  narrowed from two to one still stores `["Week A"]`, and every other surface
 *  resolves that to "Every week"; the hand-written fallback is what printed a
 *  tab called "Week A" in a workbook whose 38 other tabs said otherwise.
 *
 *  ⚠️ AND `yearWeekLabels(year)` RATHER THAN `year.weekLabels ?? []`. The empty
 *  array is what put `WEEK 1` in this grid's own top-left corner while the tab
 *  strip two inches above it said `Week A`. */
function cycleLabelOf(year: SchoolYear, cycleWeek: number): string {
  return cycleWeekLabel(yearWeekLabels(year), cycleWeek, year.cycleLength);
}

/** The civil date of one weekday of a resolved week, for the day spine. */
function dateOf(week: ResolvedWeek, weekday: number): string {
  const civil = civilOf(week.mondayDay + (weekday - 1));
  const [, m, d] = civil.split("-");
  return `${Number(d)}/${Number(m)}`;
}
