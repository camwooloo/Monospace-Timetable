import { gridInkOn } from "../timetableSheet";

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE CROSSHAIR — ONE MODULE, BECAUSE TWO GRIDS DREW IT TWO WAYS
   ══════════════════════════════════════════════════════════════════════════

   `TemplateGrid` (the editor) and `PublishedTimetable` (the board) both mark
   the row and the column the cursor is standing in, for the same reader moving
   between them. They did not agree: the board washed the CELLS as well as the
   spine and the header, the editor washed the spine and the header only, and
   the wash itself was `--accent-soft` in both. Same subject, two behaviours and
   one shared bug. This file is the answer to all three — not a matching pair of
   local copies, which is the arrangement CLAUDE.md records as having drifted
   every time it has been tried.

   ── ⚠️⚠️ WHY IT IS NOT A TINT ANY MORE ──────────────────────────────────
   The wash was `linear-gradient(var(--accent-soft), var(--accent-soft))` —
   13% of the user's accent, composited over whatever the cell already carried.
   Measured through this module against a 2,915-fill sweep of the class palette
   (years 7–11 × 18 subject roots × bands ""/A–D/X/Y × sets 0–4), the three
   furniture surfaces and the empty cell, in all three themes, across the eight
   accent presets:

     accent-soft over a class chip      1.00 – 1.20 : 1
     accent-soft over band / bandAlt    1.02 – 1.25 : 1
     accent-soft over an empty cell     1.08 – 1.24 : 1

   Teal and Green bottom out at **exactly 1.00** on a chip: on the filled part
   of a row — which is most of the grid — the crosshair was not faint, it was
   absent. And it could not be fixed by turning it up. Contrast is a LUMINANCE
   relation, the accent is a free-choice colour out of a picker, and the chips
   are the printed pastels the workbook prints; a wash whose luminance happens
   to match its substrate scores 1.00 at any strength. Turning it up would also
   have darkened a chip on the caret row, taking chip ↔ bandAlt from 3.39 to
   **2.43 : 1** in dark — the tightest pair in the palette and the one
   `darkFrameFor` exists to defend.

   ⚠️ THE SAME OBJECTION KILLS THE ACCENT BARS THIS REPLACED. The spine's
   `inset 2px 0 0 var(--accent)` and the header's `inset 0 -2px 0 var(--accent)`
   were drawn on the day band, which is now derived from the SCHOOL's timetable
   accent while `--accent` is the USER's interface accent. Two free colours, no
   relation: on the light `bandAlt` the Teal preset measures **1.03 : 1**. A
   crosshair whose ends can vanish is not one.

   ── ⭐ WHAT IT IS INSTEAD ────────────────────────────────────────────────
   Two rules along the caret ROW's long edges and two down the caret COLUMN's,
   drawn per cell in `gridInkOn(thatCell'sFill, t.text)` — the function that
   already answers "what reads on this fill" for the label, the cell rules and
   the focus ring on the very same cell. Nothing is tinted, so no chip moves and
   the palette's floors are untouched; the mark is guaranteed by construction on
   any substrate, because the ink is chosen against the substrate.

   ── ⚠️⚠️ AND THE SWEEP HAS TO INCLUDE THE SIXTH FORM ────────────────────
   The numbers below were re-measured over the WHOLE year ladder — years 7–13 ×
   23 subject roots × bands ""/A–G/X/Y × sets 0–4, 8,050 codes and 7,516
   distinct fills — plus the override blue, the three furniture surfaces and the
   empty cell, in all three themes. Then checked against a real Chromium: the
   markup of a `TemplateGrid` cell (a `<td>` carrying the fill and this
   box-shadow, with the transparent `<input>` on top of it), screenshotted and
   sampled pixel by pixel. Analytic and rendered agree to 0.1.

   ⚠️ THE FIRST SWEEP STOPPED AT YEAR 11 AND THAT MOVED THE FLOOR. It read
   3.43 : 1 in light and 4.51 : 1 in dark, and both were the wrong number:
   `CLASS_YEAR_LUMINANCE` runs down to 0.22 for year 13, the same file's own
   `gridInkOn` note is about exactly that ("a SIXTH FORM's fills take it to
   4.32 : 1"), and a school with a sixth form is not an edge case. Over the full
   ladder the darkest chip is `12X/Hi1` #928fb1 in light and `13A/Ch1` #6c8582
   in dark, and at the ORIGINAL 65% they measured 3.08 and 3.48 — which is the
   "3.08, with no margin" case the note below had already rejected at 60%. Same
   rule, one more rung of the ladder, one step up in alpha.

   At `CARET_RULE_ALPHA`:

                       chip          empty   band   bandAlt  gutter  override
     light          3.37 – 5.28      6.36    4.77    3.97     5.35     3.68
     dark           3.78 – 7.10      8.26    6.24    4.79     7.07     4.86
     oled           3.78 – 7.10      8.73    6.87    5.15     7.87     4.86

   Floor 3.37 : 1 over every substrate in every theme, against WCAG 1.4.11's
   3 : 1 for a graphical object — and against the 1.00 it replaces.

   ⚠️ THE ALPHA IS THERE TO HOLD IT DOWN, NOT TO LIFT IT. Full-strength ink
   measures 5.29 – 17.69 : 1, which on a 45-row grid reads as a drawn box rather
   than a cursor. 70% is the softest step that keeps every substrate above 3 : 1
   WITH MARGIN over the whole ladder — 65% leaves the darkest light-mode chip at
   3.08 and the override blue at 3.31, which is passing by rounding rather than
   by design, and the next darker chip is one year group away. */

/** The rule's weight. Matches the accent bars it replaces, so the header and
 *  the spine keep the same visual mass they had. */
const CARET_RULE_PX = 2;

/** How far the ink is let down toward the fill. See the banner — and note that
 *  the number is chosen against the FULL year ladder, sixth form included, not
 *  against years 7–11. */
const CARET_RULE_ALPHA = "70%";

/**
 * The `box-shadow` for one cell of the grid, crosshair included.
 *
 * @param onRow  this cell is in the row the cursor is in — rule its top and
 *               bottom edges, so the row's cells form two continuous lines
 * @param onCol  ditto for the column, on the left and right edges
 * @param fill   what this cell is painted — a class chip, an override, a
 *               furniture band, or `null` for the plain input surface. It
 *               decides the ink and nothing else does.
 * @param themeText  `t.text`, so `gridInkOn` can prefer the theme's own ink
 *               wherever it reads and fall back to the workbook's black only
 *               where it does not.
 * @param under  a shadow the cell already had — the override's 3px edge, say.
 *               Listed LAST, because box-shadows paint first-on-top and a
 *               transient cursor mark should sit over a permanent one rather
 *               than under it.
 *
 * ⚠️ RETURNS `undefined` RATHER THAN `"none"` when there is nothing to draw,
 * so it can be handed straight to a style object without adding a property.
 */
export function caretShadow(
  onRow: boolean,
  onCol: boolean,
  fill: string | null | undefined,
  themeText: string,
  under?: string,
): string | undefined {
  /* ⚠️ THE EMPTY CASE ALLOCATES NOTHING. `TemplateGrid` asks once per cell and
     re-renders on every keystroke, so this runs ~360 times per character — and
     on all but the ~50 cells of the lit row and column the answer is whatever
     the cell already had. Building an array to hand that back is the sort of
     thing that is free once and not free 360 times. */
  if (!onRow && !onCol) return under;

  const ink = `color-mix(in srgb, ${gridInkOn(fill, themeText)} ${CARET_RULE_ALPHA}, transparent)`;
  const parts: string[] = [];
  if (onRow) {
    parts.push(
      `inset 0 ${CARET_RULE_PX}px 0 ${ink}`,
      `inset 0 -${CARET_RULE_PX}px 0 ${ink}`,
    );
  }
  if (onCol) {
    parts.push(
      `inset ${CARET_RULE_PX}px 0 0 ${ink}`,
      `inset -${CARET_RULE_PX}px 0 0 ${ink}`,
    );
  }
  if (under) parts.push(under);
  return parts.join(", ");
}
