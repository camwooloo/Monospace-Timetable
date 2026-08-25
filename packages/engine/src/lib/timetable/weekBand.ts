import { weekBandLabel } from "../timetableSheet";

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE TOP-LEFT CORNER — ONE MODULE, BECAUSE TWO GRIDS PRINT IT
   ══════════════════════════════════════════════════════════════════════════

   Cam: *"what could also be useful is on the website show what week in the top
   left same as the spreadsheet"*.

   His sheets put it in **B1** — the corner cell, at the head of the date
   column and left of the room codes; A is the empty grey spine and C1, above
   the period column, is blank — as `WEEK B`, upper-cased. `TemplateGrid` (the standing
   plan) and `PublishedTimetable` (one week of it) both have that corner and a
   head of department moves between them, so the string has to be built once.
   `caret.ts` next door exists for exactly this reason: the same two grids drew
   the crosshair two ways, and CLAUDE.md records every hand-kept matching pair
   in this codebase drifting while looking correct.

   ── ⚠️ THE LETTER COMES FROM THE CYCLE, NEVER FROM STORED TEXT ───────────
   All 38 week sheets in `IT_Room_Timetable_2627_1.xlsx` say `WEEK B` in B1
   while their own tab says `(A)`, alternating in lockstep the whole year. Cam
   has ruled **the tab authoritative**, and the tab is the cycle: the calendar's
   `weekLabels[cycleWeek]`, which is what `weekSheetLabel` names a tab from and
   what `weekBandLabel` upper-cases here. So this corner reads the OPPOSITE of
   his current file in that one cell, on purpose. Nothing reads B1 back.

   ⚠️ AND IT IS `weekBandLabel` ITSELF, not a local `.toUpperCase()`. That
   function is what the export route writes into the workbook's own B1, so the
   screen and the download are the same bytes by construction.

   ⚠️ THE TWO GRIDS REACHED IT BY DIFFERENT ROADS AND THAT IS FIXED AT THE
   SOURCE NOW. `PublishedTimetable` passes `board.week.label`, resolved on the
   server by `resolveYear`'s `labelOf`; `TemplateGrid` passes its own
   `weekName`. Both of those were hand-written copies of
   `weekLabels[cw] ?? "Week N+1"` — differing in case, and neither knowing the
   one-week-cycle rule this file used to hold alone, which is how a strip tab
   reading `(A)` ended up beside a corner reading `EVERY WEEK`. Both now call
   `cycleWeekLabel()` in convex/lib/timetable.ts, so the corner, the tab, the
   workbook's B1 and the workbook's tab are one string resolved once.

   ── ⚠️ ON SCREEN IT SPANS **BOTH** SPINE COLUMNS, AND THAT IS MEASURED ────
   The workbook's B1 is one cell because column B there is `WIDTH_DATE`, i.e.
   30.71 Excel characters — about 215px, wider than this grid's WHOLE spine on
   a phone. Ours is `GRID_PX.day` = 88px, and `GRID_NARROW_PX.day` = 64px below
   `sm`; take the cell's own `px-2` and the 1px seam off and the label has
   **71px / 47px** to live in.

   ⚠️ SIZED AGAINST 11.5px, WHICH IS THE WORSE OF THE TWO. The two grids do NOT
   draw this at the same size — `PublishedTimetable`'s table is `text-[11.5px]`
   and `TemplateGrid`'s is `text-[11px]` — so every number below is the larger
   one and the template grid has ~4% more room than it says. Weight is
   `font-semibold`, and note there is no Satoshi 600 face (400/500/700/900 are
   self-hosted in globals.css), so the browser resolves it upward. Measured in
   Chrome with the real face loaded, not computed from advance widths:

     WEEK A          45.0px      TIMETABLE 1      73.9px
     EVERY WEEK      74.7px      MAIN TIMETABLE   99.0px
     NO TIMETABLE    85.9px      AUTUMN WEEK A   100.1px

   So only a default "Week A" fits the date column alone, and on a phone it
   fits by 2px. Every other label a calendar can legitimately carry — a
   one-week cycle, a holiday week, or any of the schools `weekLabels` exists
   for, which rename their weeks — overflows a `table-layout: fixed` column
   into the period column beside it. The date + period columns together give
   **175px on a desktop and 135px on a phone**, which holds all of them with
   room over, so both grids draw this as ONE cell spanning the two.
   `TemplateGrid` had the single-column version and was already overflowing for
   a renamed week.

   ⚠️ AND THE CELL STILL CLIPS. `overflow: hidden` + `text-overflow: ellipsis`
   + `white-space: nowrap` on both, because a school may name a week anything.
   Rendered at both geometries, a 37-character label put the corner's
   `scrollWidth` at 292px against a client width of 190px / 150px — i.e. it
   ellipsed — and the table stayed at exactly 1024px / 856px, its `<colgroup>`
   width, rather than pushing the room columns right.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What the corner says on a week the timetable does not run — a holiday, half
 * term, an INSET week. Those weeks have no cycle position at all, so there is
 * no letter to print; the published board's week bar already says this in a
 * pill and this is the same sentence in the same words.
 *
 * ⚠️ The exported workbook has no sheet for these weeks, so there is no
 * printed byte to match. The template grid never reaches it either — a
 * template IS a cycle week.
 */
export const NO_CYCLE_WEEK_LABEL = "No timetable";

/**
 * ⭐⭐ WHAT THE CORNER SAYS ON A WEEK THE TIMETABLE **DOES** RUN BUT THE CYCLE
 * ENGINE COULD NOT PLACE.
 *
 * ⚠️ IT IS NOT THE SAME FACT AS `NO_CYCLE_WEEK_LABEL` AND THE TWO WERE BEING
 * SAID WITH ONE STRING. `ResolvedWeek.cycleWeek` is `null` in two quite
 * different situations:
 *
 *   · the week is not taught — a holiday, half term, an INSET week. There is
 *     no cycle position because there is no timetable. "No timetable" is the
 *     whole truth.
 *   · ⭐ the week IS taught and the engine could not number it.
 *     `continueCycleWeek` returns `null` for an unparseable `anchorMonday`, so
 *     a calendar whose anchor is malformed resolves every one of its teaching
 *     weeks to `cycleWeek: null` with `isTeachingWeek: true`.
 *
 * The second case had TWO wrong answers, one on each surface, and they
 * contradicted each other. The published board passed the null label straight
 * to this function and printed **NO TIMETABLE** over a week the school was
 * teaching. The export route substituted
 * `w.label ?? \`Week ${(w.cycleWeek ?? 0) + 1}\`` and printed **WEEK 1** in
 * the workbook's B1 — inventing a place in a cycle the week has none in, and
 * inventing the FIRST one, so the tab beside it was coloured like every other
 * unplaced week in the year.
 *
 * One denies a taught week; the other invents a cycle position. The honest
 * answer is the third thing, which is that the week runs and the calendar has
 * not said which week of the cycle it is — and it points at the fix, because
 * the only way to reach this state is an anchor the calendar cannot read.
 */
export const UNPLACED_WEEK_LABEL = "Week not set";

/**
 * ⭐ THE STRING IN THE CORNER. `label` is the calendar's own word for the
 * cycle week — `null` on a week that has no cycle position at all.
 *
 * ⚠️ `taught` IS WHAT SEPARATES THE TWO REASONS A LABEL CAN BE NULL, and it
 * is why this takes a third argument rather than reading the label alone. See
 * `UNPLACED_WEEK_LABEL`. Absent means "not taught", which is the common case
 * and the one that was already correct: the two grids' holiday weeks and the
 * week bar's own pill all mean it.
 *
 * ⚠️ AND THE ONE-WEEK-CYCLE RULE HAS LEFT THIS FUNCTION. It used to live here
 * and here alone — "a cycle NARROWED from two to one keeps `weekLabels` as
 * `["Week A"]`, and Week A is a lie about a cycle with no B" — which meant the
 * CORNER said `EVERY WEEK` while the strip tab beside it said `(A)`, and the
 * workbook's B1 disagreed with its own tab in the same way. That rule is now
 * `cycleWeekLabel()` in convex/lib/timetable.ts, applied where the label is
 * RESOLVED rather than where it is printed, so every reader of a week's name
 * gets it: `resolveYear`, the strip tab, `TemplateGrid`, the export's template
 * sheets and this corner. This function upper-cases and nothing else.
 *
 * ⚠️ AND WHATEVER IS DECIDED HERE IS DECIDED FOR THE DOWNLOAD TOO — the export
 * route imports THIS function for the workbook's real B1, so a change here
 * rewrites bytes in a file somebody teaches from.
 */
export function weekBandFor(
  label: string | null | undefined,
  opts?: { taught?: boolean },
): string {
  const text = label?.trim();
  if (text) return weekBandLabel(text);
  return weekBandLabel(
    opts?.taught ? UNPLACED_WEEK_LABEL : NO_CYCLE_WEEK_LABEL,
  );
}
