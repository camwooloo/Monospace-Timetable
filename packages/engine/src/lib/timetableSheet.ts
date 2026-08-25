/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TIMETABLE WORKBOOK — SHAPE, PALETTE AND SHEET NAMES, IN ONE PURE FILE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam sent a real school's IT room timetable — `IT_Room_Timetable_2627.xlsx`,
 * 41 sheets, a 2-week A/B cycle — and said the export "should be exactly how
 * exported it room booking spreadsheets should be". So this file is a
 * TRANSCRIPTION of that workbook's geometry and colour, measured cell by cell,
 * and `src/lib/timetableWorkbook.ts` is the writer that renders it.
 *
 * This file is PURE, for the same reason convex/lib/timetable.ts and
 * convex/lib/exportSpec.ts are: no `_generated`, no `convex/values`, no
 * `server-only`, no `exceljs`. Convex cannot import from `src/`, but the
 * client CAN import from `convex/lib/` — so a "your sheets will be named
 * like this" preview in org settings and the bytes the route actually writes
 * come from ONE implementation of `assignSheetNames()`. A second copy is a
 * copy that will eventually disagree, and the disagreement would be a
 * download that does not match what the user was shown.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT WAS MEASURED, AND WHERE THE BRIEF WAS WRONG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every claim below was read out of the file with exceljs, not assumed:
 *
 *   • 41 sheets: "Half Terms - Template", "Week A - Template",
 *     "Week B - Template", then 38 TEACHING-week sheets. The half-term weeks
 *     have NO sheet — one sheet per teaching week, not per calendar week.
 *   • A week sheet is 54 rows × 12 columns. Rows 1–4 are the header band;
 *     then five day blocks of nine period rows, each preceded by a
 *     one-row separator, at rows 5/15/25/35/45.
 *   • ⚠️ THE SPINE COLUMNS A AND L ARE EMPTY. They are merged A1:A54 /
 *     L1:L54 and carry a grey fill and nothing else. The week label
 *     ("WEEK A") lives in B1:B4, merged, above the date column. An earlier
 *     reading had the labels in the spine; they are not there.
 *   • ⚠️ THERE ARE TWO STRUCTURE TINTS, NOT ONE. Day blocks ALTERNATE
 *     between accent4 @40% and accent4 @60% — blocks 1/3/5 light, 2/4 lighter
 *     — and the header band is the @60%. A single flat purple is visibly not
 *     this file.
 *   • ⚠️ THE SOURCE'S WEEK LABEL IS INVERTED. Every sheet named "(A) …"
 *     carries "WEEK B" in B1, and every "(B) …" carries "WEEK A" — including
 *     both templates, which is how it propagated. It is a copy-paste fault in
 *     the school's own file. `weekBandLabel()` writes the sheet's OWN cycle
 *     label; replicating a bug faithfully is not fidelity.
 *   • Column widths, exactly: A 32.7109375, B 30.7109375, C..K 18,
 *     L 32.7109375. Every row is 21 high. Panes frozen below the header band.
 *   • FOUR fills and ONE font colour, censused across all 41 sheets:
 *     white FFFFFF (11,180 cells — the input area), CCC0DA (3,561),
 *     B1A0C7 (3,170) and the grey gutter D9D9D9 (288). Every cell is black.
 *     There is no per-class colouring anywhere in it — see the colour banner
 *     below. (An earlier note here said "exactly TWO fills", which contradicts
 *     the two structure tints four lines above it and forgot the gutter; the
 *     writer has always emitted all four, and a census of its output matches
 *     the four counts above cell for cell.)
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ THE COLOUR RULE — AND THE ONE PLACE IT IS DECIDED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam: *"all input data should be a different colour (obviously same class,
 * same colour) like it is on that spreadsheet and data users input should all
 * be the same colour"*.
 *
 * ⚠️ THE SOURCE FILE DOES NOT DO THIS YET. A census of all 41 sheets found
 * 17,802 cells of black text and no other font colour at all. So what "like it
 * is on that spreadsheet" describes is the STRUCTURE / INPUT-AREA split —
 * purple furniture, white cells you type into — and the different-coloured
 * text is the part being ASKED FOR rather than copied.
 *
 * The rule this file implements, therefore:
 *
 *   STRUCTURE  furniture and the words that name it — room codes, period
 *              labels, dates, week bands, custom-field LABELS. Black.
 *   INPUT      every value a PERSON put there — a timetabled class, an ad-hoc
 *              booking, a custom field's VALUE. One ink, whatever it is.
 *
 * ⭐ It is keyed by ORIGIN, not by position, which is the whole point:
 * `INPUT_INK` is a `Record<InputOrigin, …>` whose three entries all point at
 * `INPUT_INK_DEFAULT` today. Giving timetabled lessons and ad-hoc bookings
 * different colours later is EDITING ONE OBJECT — no call site changes,
 * because no call site names a colour. That is why `inkFor()` exists rather
 * than a `bold: true` sprinkled through the writer.
 *
 * The ink is `0000FF`. That is the spreadsheet convention that predates all of
 * us — blue means "somebody typed this", black means "this is the sheet" —
 * and it clears 4.9:1 against the lighter purple the custom-field values sit
 * on as well as against white. A subtler navy would be legible and would not
 * READ as a different colour at a glance, which is the entire request.
 */

import { CYCLE_LENGTHS, civilOf, dayNumber, type CivilDate } from "./timetable";
/* The STORE and its FORMAT, so the mutation, the settings control, the two
   grids and the workbook writer all agree what a stored accent IS before this
   file derives anything from it. That module deliberately holds no colour
   maths — the maths is here — so the dependency only ever points this way. */
import {
  DEFAULT_TIMETABLE_ACCENT,
  resolveTimetableAccent,
} from "./timetableAccent";

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE PALETTE — CHANGE IT HERE AND NOWHERE ELSE
   ══════════════════════════════════════════════════════════════════════════

   ARGB literals rather than `{ theme: 7, tint: 0.6 }` on purpose. The source
   stores theme colours, and a theme colour renders against WHOSE theme the
   reader's Excel supplies: accent4 is this purple in the Office 2007 theme
   the school's file carries and a mustard yellow in the 2013+ default. exceljs
   writes its own theme part, so a themed export would come out the wrong
   colour on a correctly-written file. Literals cannot drift.

   The three tinted values are the Office swatches for the source's colours —
   accent4 #8064A2 at "Lighter 40%" and "Lighter 60%", and white at
   "Darker 15%". They are written out rather than computed because the
   ECMA-376 tint transform rounds in integer HLS and a plausible float
   implementation lands one or two units off (CCC1DA for CCC0DA), which is
   invisible in review and wrong in the file. */

/** The one purple everything structural is derived from — and now the DEFAULT
 *  for it. `organisations.timetableAccent` may replace it per school; see
 *  `sheetFills()` below and `gridSurfaces()` further down, which are the only
 *  two readers of it left. It stays the literal `DEFAULT_TIMETABLE_ACCENT`
 *  names, in the ARGB form the writer wants. */
export const STRUCTURE_BASE = "FF8064A2";

export const SHEET_FILL = {
  /** Header band, and the ALTERNATE day blocks. accent4 "Lighter 60%". */
  structure: "FFCCC0DA",
  /** The primary day block, and every break row. accent4 "Lighter 40%". */
  structureAlt: "FFB1A0C7",
  /** ⭐ THE INPUT AREA. A cell a person may type a class or a booking into,
   *  and the only white in the grid — which is what makes "where do I write"
   *  answerable at a glance. */
  input: "FFFFFFFF",
  /** The spine columns and the separator strips. White "Darker 15%". */
  gutter: "FFD9D9D9",
} as const;

/** The four fills a sheet is painted from, for ONE accent. Same keys as
 *  `SHEET_FILL`, which is this for the default. */
export type SheetFillSet = {
  readonly structure: string;
  readonly structureAlt: string;
  readonly input: string;
  readonly gutter: string;
};

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE PRINTED FILLS FOR A SCHOOL'S OWN ACCENT — AND WHY THEY ARE NOT
   CLAMPED
   ══════════════════════════════════════════════════════════════════════════

   `organisations.timetableAccent` (convex/lib/timetableAccent.ts) replaces the
   base purple. ONE colour in, a family out: the two tints are DERIVED, exactly
   as the Office swatches derive them, so an admin cannot pick three unrelated
   colours and produce a sheet whose bands stop reading as one document.

   ── ⚠️ THE DEFAULT IS RETURNED AS THE LITERALS, NOT RE-DERIVED ───────────
   `#CCC0DA` and `#B1A0C7` are the ECMA-376 tint transform's own answers, and
   that transform rounds in integer HLS: the float reconstruction below lands
   on `#CCC1DA` and `#B3A2C7` — one and two units off. So a school on the
   default gets `SHEET_FILL` ITSELF, byte for byte, and the exported workbook
   is the file it has always been. That is not a fast path bolted on; it is the
   guarantee, and it is why the check is on the RESOLVED accent rather than on
   `accent === undefined`. Picking "School purple" out of the swatch row stores
   `#8064a2`, and that has to produce the same bytes as never opening Customise
   at all.

   ── AND THE DERIVATION IS THE LINEAR MIX, NOT THE HLS ONE ────────────────
   `TimetableCustomise`'s live preview draws these two tints as CSS
   `color-mix(in srgb, base 40%, #ffffff)`. That IS the arithmetic below, so
   the preview labelled "How the workbook will look" is true of the download to
   the byte for every custom accent. Reproducing ECMA-376's integer-HLS
   rounding here instead would buy one or two units of fidelity to Office and
   pay for it by making that caption a lie — and the caption is load-bearing;
   see the banner over `gridSurfaces`, where it is the reason the PRINTED side
   carries no contrast clamp at all.

   ── ⚠️ WHAT AN EXTREME ACCENT COSTS ON PAPER, MEASURED AND ACCEPTED ──────
   "Lighter 40%" cannot produce anything darker than `#666666` (a black
   accent), and over a 4,913-point accent lattice:

     workbook, black ink on the bands        worst 3.66 : 1
     light grid, `t.text` #1b1b1f on them    worst 2.99 : 1
                                             353 accents under AA, 1 under 3

   Under WCAG AA at the dark end of the range, never near unreadable, and
   bounded by construction rather than by luck. At the other end a near-white
   accent gives a header band that does not separate from the white input area
   (1.00 : 1 at `#ffffff`).

   ⭐ BOTH ENDS ARE VISIBLE IN THE PREVIEW BEFORE SAVE, drawn at full size on
   white with the black ink on it, which is the whole reason the control has
   one. The screen furniture is clamped precisely because NOTHING previews it.
   ⚠️ And the light grid is not "fixed" by giving it a computed ink either:
   `gridInkOn` on that #666666 band picks WHITE, and the workbook prints BLACK,
   so the repair would cost the screen-equals-printout identity to buy 0.67 of
   a ratio point at the far end of a colour the admin chose while looking at
   it. See the note over `structureCell` in TemplateGrid.tsx. */
export function sheetFills(accent?: string | null): SheetFillSet {
  const resolved = resolveTimetableAccent(accent);
  if (resolved === DEFAULT_TIMETABLE_ACCENT) return SHEET_FILL;
  return {
    structure: towardsWhite(resolved, 0.6),
    structureAlt: towardsWhite(resolved, 0.4),
    input: SHEET_FILL.input,
    gutter: SHEET_FILL.gutter,
  };
}

/** `#rrggbb` mixed `amount` of the way to white, as `FFRRGGBB`. Office calls
 *  0.6 "Lighter 60%"; CSS calls it `color-mix(in srgb, base 40%, #ffffff)`.
 *  They are the same number and this is it. */
function towardsWhite(hex: string, amount: number): string {
  const [r, g, b] = bytesOf(hex);
  const up = (c: number) =>
    Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `FF${up(r)}${up(g)}${up(b)}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE TAB COLOURS — THE ONE COLOUR IN THIS FILE THAT IS NOT A FILL
   ══════════════════════════════════════════════════════════════════════════

   Cam: *"on the export the sheets are not colour coded like on the spreadsheet
   I gave you"*. Measured rather than assumed: ALL 41 of his tabs carry a
   colour and ours carried NONE — `tabColor` appeared nowhere in the writer.
   His three template tabs are pure red, and the 38 week tabs alternate two
   colours down the whole year in lockstep with the cycle.

   ⚠️ ARGB LITERALS, FOR EXACTLY THE REASON THE FILL BANNER ABOVE GIVES. He
   stores these as `<tabColor theme="9" tint="0.4"/>` and `theme="8"`, and a
   theme index resolves against WHOSE theme the reader's Excel supplies.
   exceljs writes its own theme part, so a themed tab would come out the wrong
   colour on a correctly-written file. Resolved against the Office 2007 theme
   his workbook actually carries:

       theme 9 = accent6 #F79646 @ "Lighter 40%"  ->  #FAC090   the (A) weeks
       theme 8 = accent5 #4BACC6 @ "Lighter 40%"  ->  #93CDDD   the (B) weeks
       pure red                                       #FF0000   the templates

   ⚠️ AND THEY DO NOT MOVE WITH THE SCHOOL'S ACCENT, WHICH THE BANDS DO.
   `sheetFills()` re-derives the two purple bands from
   `organisations.timetableAccent` because they are two tints of ONE base and
   have to stay relatives. These are not tints of anything: they are two
   DIFFERENT Office accents used as a two-state flag, and re-deriving them from
   the school's colour would make Week A and Week B tabs two tints of one hue —
   which is the single thing this colour exists to tell apart.

   ⚠️ A CYCLE IS 1, 2 OR 3 WEEKS — `CYCLE_LENGTHS`. His file is a 2-week cycle,
   so it settles A and B and says nothing about C. C is accent3 at the same
   "Lighter 40%": the same Office accent row, the same tint, so it reads as the
   third member of a set somebody chose rather than as a colour from nowhere.
   Its value is the ECMA-376 integer-HLS tint transform's own answer for
   #9BBB59 at that tint — and that transform was trusted only after it
   reproduced #FAC090 and #93CDDD exactly from accent6 and accent5 AT THIS
   TINT, which the float reconstruction this file already warns about does not.

   ⚠️ AN EARLIER DRAFT OF THIS BANNER ALSO CLAIMED #CCC0DA FROM accent4 AT
   THIS TINT, AND THAT IS WRONG — measured, not argued. #CCC0DA (this file's
   own default band) is accent4 at "Lighter 60%"; accent4 at "Lighter 40%" is
   #B3A2C8. The transform reproduces BOTH, each from its own tint, which is
   what the check was worth. It is recorded rather than deleted because a
   validation claim that names the wrong tint reads as confirmation twice: once
   when it is written and again by whoever trusts it.
   A one-week cycle paints every week tab #FAC090, which is right: there is no
   other week for it to be told apart from. */
export const SHEET_TAB = {
  /** Every template tab — the half-term sheet and one per cycle week. */
  template: "FFFF0000",
  /** ⭐ INDEXED BY CYCLE WEEK. Never by the letter parsed back out of a sheet
   *  name: `weekLabels` is free text, so a school running "Timetable 1 /
   *  Timetable 2" has no letter to read, and the name is downstream of the
   *  cycle anyway. See `tabColourForCycleWeek()`. */
  cycle: ["FFFAC090", "FF93CDDD", "FFC3D69C"],
} as const;

/* A fourth cycle length added to `CYCLE_LENGTHS` without a fourth colour in
   `SHEET_TAB.cycle` would silently paint two cycle weeks the same tab — the one
   thing the tab colour exists to prevent. This fails the build by name instead,
   and it is a TYPE and emits nothing. */
type _Assert<T extends true> = T;
type _TabColoursCoverEveryCycleLength = _Assert<
  (typeof CYCLE_LENGTHS)[number] extends 1 | 2 | 3 ? true : false
>;

/**
 * The tab colour for a week sitting at `cycleWeek` of the cycle, or
 * `undefined` for a week that has none.
 *
 * ⚠️ `undefined` IS A REAL ANSWER AND NOT A FALLBACK. `ResolvedWeek.cycleWeek`
 * is `null` when the timetable does not run that week, and an uncoloured tab
 * says exactly that. Painting it week A's colour would put a lie on the tab
 * strip, which is the one place a reader navigates the file from.
 */
export function tabColourForCycleWeek(
  cycleWeek: number | null | undefined,
): string | undefined {
  if (cycleWeek === null || cycleWeek === undefined) return undefined;
  return (SHEET_TAB.cycle as readonly string[])[cycleWeek];
}

/** Every rule in the grid. Thin, and this exact grey. */
export const SHEET_GRIDLINE = "FF3F3F3F";

/** Furniture, and the words that name it. */
export const STRUCTURE_INK = "FF000000";

/**
 * ⭐ THE INPUT INK. One constant, three names pointing at it.
 *
 * Splitting timetabled lessons from ad-hoc bookings is a one-line edit to
 * `INPUT_INK` below and touches nothing else, because the writer only ever
 * asks `inkFor(origin)`.
 */
const INPUT_INK_DEFAULT = "FF0000FF";

/** Where a value in the grid came from. Not a style — a provenance. */
export type InputOrigin =
  /** A standing entry on the cycle-week template: the timetable itself. */
  | "lesson"
  /**
   * ⭐ A `bookingWeekOverrides` row — somebody changed THIS week on the
   * published board. "9F/It in N21, w/c 12 Jan".
   *
   * ⚠️ IT IS ITS OWN ORIGIN AND NOT `"lesson"`, even though the two print
   * identically today. Provenance is what every downstream rule keys on: an
   * override must not be LINKED to a template (it is not the template) and
   * must not be LOCKED under `lockPrefilled` (rule three of `cellRights()`
   * says any member may retype it). Folding it into `"lesson"` would have made
   * both of those decisions by accident, in the writer, where nobody would
   * find them.
   */
  | "override"
  /** A concrete `bookings` row — somebody took the room. */
  | "booking"
  /** An admin-defined per-room field: "No of PCs", "Teacher", "Telephone". */
  | "field";

export const INPUT_INK: Record<InputOrigin, string> = {
  lesson: INPUT_INK_DEFAULT,
  /* Same ink as a lesson, deliberately and for now: the ONE measured ink in
     this file is the blue, and inventing a second colour for overrides is a
     contrast claim nobody has measured. The point of `inkFor` is that giving
     it one later is an edit to this object and to nothing else. */
  override: INPUT_INK_DEFAULT,
  booking: INPUT_INK_DEFAULT,
  field: INPUT_INK_DEFAULT,
};

export function inkFor(origin: InputOrigin): string {
  return INPUT_INK[origin];
}

export const SHEET_FONT = { name: "Calibri", size: 11 } as const;

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE CLASS PALETTE — ONE FILL PER CLASS CODE, DERIVED AND NOT ASSIGNED
   ══════════════════════════════════════════════════════════════════════════

   Cam: *"all input data should be a different colour (obviously same class,
   same colour)"*, and, offered the options, he picked A COLOUR PER CLASS CODE.
   So a lesson cell is no longer white: it carries a fill derived from the code
   written in it — the same fill on every sheet, in every export, next term and
   next year, because nothing here depends on what else is in the workbook.

   ── WHAT IS ACTUALLY IN HIS FILE, RE-MEASURED ────────────────────────────
   ⚠️ THERE ARE NOW TWO UPLOADS AND THIS CENSUS IS OF THE FIRST ONE. The block
   below counts `IT_Room_Timetable_2627.xlsx`. Cam has since sent
   `IT_Room_Timetable_2627_1.xlsx`, which is BIGGER: still 41 sheets, but
   **68 distinct class codes** — 64 lesson (5,180 cells) and 4 tutor (800
   cells, `10DLD` `10JLS` `11RRW` `9TMS`) in rows 5+ of columns D–K. Read back
   with exceljs, same as this. Everything below still describes the palette
   correctly; only the counts belong to the earlier file, and the fill census
   for the 68 is in the screen-palette banner under `colourForClass`.

   Read back out of `IT_Room_Timetable_2627.xlsx` with exceljs rather than
   taken on trust, because the brief this was built from had two of these
   wrong in ways that would have produced a wrong feature:

     • 4,720 CLASS cells in the room columns below the header band (rows 5+,
       columns D–K) of the 41 sheets, holding 62 distinct codes: 60 LESSON
       codes (4,320 cells) and 2 TUTOR codes (400 cells). A further 2,932
       cells in that region hold numbers — room capacities, half-term dates —
       and name no class.
       ⚠️ RE-COUNTED. This block previously read "68 distinct values: 64
       lesson, 4 tutor", which is not what the file holds, and it was quoted
       downstream as "68 distinct fills from 68 distinct codes, no collisions"
       — a claim that was false for a second reason as well; see the table
       further down.
     • The codes decompose. YEAR 7–11, a BAND letter (A B C D E F G X), a
       SUBJECT root after the slash, and sometimes a SET digit: "10B/Bs",
       "8X/Cp1", "9G/Cs2". FOURTEEN subject roots —
       Bs Cd Cp Cs Dt Et It Lu Pp Pt Ss Su Ta Wd.
     • ⚠️ "-" IS NOT IN THE GRID AT ALL, and it is not the commonest value in
       it. It appears 120 times and every single one is on ROW 3 — the
       "Teacher" custom-field row — three per sheet across forty sheets. It is
       a field value meaning "nobody", not a lesson. "HKO" is likewise not a
       subject: it is half of "DLD/HKO", one field value naming two teachers.
       A rule that read those as class codes would have painted the header
       band in lesson colours.
     • Even so, `-` IS HANDLED as a placeholder rather than ignored, because
       the day a school types it into a lesson cell it must print as itself —
       not as a colour, and not as a blank.
     • TUTOR codes are a different kind of thing: "11RRW" and "10JLS", the two
       of them, on the Tutor period of every sheet. They name a PERSON, not a
       subject, so there is no subject for a hue to come from and they do not
       get one.
     • ⚠️ ONE CODE IN THE FILE HAS A LEADING SPACE: " 8X/Cp3", twenty cells of
       it, and "8X/Cp3" without the space appears nowhere. `parseClassCode`
       trims, so it colours as the class it is — but the legend lists it as
       typed, because a legend that silently tidied the text would stop
       matching the cell the reader is looking at.

   ── THE AXES ─────────────────────────────────────────────────────────────
   Nothing is picked per class. `colourForClass()` is pure, sees only the code,
   and keeps no state — so a class that first appears next September gets its
   colour without anybody choosing one, and gets the same colour it would have
   got this year.

     LUMINANCE ← the YEAR GROUP.  A fixed ladder, `CLASS_YEAR_LUMINANCE`.
     HUE       ← the SUBJECT ROOT. Its two letters, onto an arc of the wheel.
     CHROMA    ← the SUBJECT ROOT again, by a second and independent map,
                 three levels. It exists to pull apart two subjects whose hues
                 land close; without it Et and Ss came out 0.5° apart, which
                 is to say identical.
     a lattice ← the BAND and SET, over 20 cells of small hue and chroma
                 offsets. Deliberately faint — see below.

   ── ⭐ WHY THE LADDER IS IN LUMINANCE AND NOT IN "LIGHTNESS" ─────────────
   Because the thing being defended is a GREYSCALE PRINT, and a mono printer
   sees luminance. A palette laid out at constant OKLab lightness still varies
   wildly in luminance across hues — yellow is far brighter than blue at the
   same L — so a year ladder built on L would arrive at the printer shuffled.
   The ladder therefore names a TARGET LUMINANCE and the solver works
   backwards: take the hue, take the chroma as a fraction of the most the sRGB
   gamut allows AT that luminance and hue, then bisect OKLab lightness until
   the rendered cell hits the target. The year is exact in greyscale whatever
   the subject.

   ── ⚠️ WHAT GREYSCALE CAN AND CANNOT CARRY, MEASURED ─────────────────────
   60 fills DO collapse on a mono printer and no palette fixes that; the eye
   resolves fewer than a dozen greys on a printed page. So the colour is
   ADDITIVE and never the only signal — the class code stays written in the
   cell, at full length, and the "Export info" sheet now prints a LEGEND of
   every code in the workbook on its own fill, which is the mono reader's way
   back.

   What the ladder does buy, measured over the school's real 62 codes:

     year  7  →  8-bit grey 210–212      year 10  →  176–177
     year  8  →  200–202                 year 11  →  162–163
     year  9  →  188–190

   Eleven to fourteen levels BETWEEN year groups, two or three WITHIN one. So
   on a photocopy the year group is still legible, and consistent on every
   sheet, and two classes of DIFFERENT years never land on the same grey. Two
   classes of the SAME year do, by design: they are separated by hue, which is
   exactly the distinction a mono printer throws away and the text carries.

   ⚠️ THE RUNGS ARE ALSO PLACED TO MISS THE FURNITURE'S OWN GREYS. #D9D9D9,
   #CCC0DA and #B1A0C7 print at 217, 197 and 167, and an earlier ladder put
   Year 11 on 166 — one level off the tint every break row is painted in, so a
   photocopied Year 11 lesson and a photocopied lunch break came out the same
   tone. The ladder was searched for the placement staying furthest from all
   three while keeping every step to ten levels or more; three to five levels
   of clearance is the best on offer, and this is where it lands. It is not a
   lot, and it does not have to be: a structure cell in the room columns is
   always EMPTY and a class cell always has a code in it.

   ── AND WHY THE BAND AND SET BARELY MOVE IT ──────────────────────────────
   `10D/Bs` and `10E/Bs` differ by a few units of blue. That is deliberate:
   same subject, same year, so the brief's "related classes read as related"
   makes them relatives and not strangers. The variant table exists so that no
   two distinct codes ever produce the SAME fill — Cam asked for a colour per
   class code, and that has to be true rather than nearly true — but it makes
   no claim to being visible at a glance. The letter in the cell is what tells
   `10D/Bs` from `10E/Bs`.

   ⚠️ "BARELY" IS NOT "NOT AT ALL", AND THE DIFFERENCE ONCE COST A BUG. There
   was a dark ramp between this palette and the screen, and the variant was
   applied on the PRINT side of it, so it arrived at under a byte and rounded
   away: `11D/Bs` and `11E/Bs` really were one colour on the dark grid. The
   ramp is gone (see its tombstone above `gridClassFill`) and every theme now
   draws the printed byte, so the variant is exactly as faint everywhere as it
   is on paper — ΔE 0.0123 between two variants of one family in his file, 9.97°
   of hue across a family's variants — and there is no longer a second space for
   it to be measured in. The banner over `CLASS_SHIFT_RADIUS` has the rest.

   ── MEASURED, OVER ALL 62 CODES IN HIS FILE ──────────────────────────────
   Not reasoned about: a workbook was generated from his codes and read back
   with two independent readers.

     · 62 distinct fills from 62 distinct codes. No collisions — and each code
       carries the SAME fill on all 42 grid sheets, the same fill on its legend
       swatch, and the same fill again on a re-export whose cells were shuffled
       into different rows, columns and sheets.
     · Black text on every one of them at 8.2:1 to 14.2:1. WCAG AA wants 4.5.
     · Smallest gap between two DIFFERENT SUBJECTS in one year, among the
       codes he actually uses: ΔE 0.025, a little over the just-noticeable
       difference for patches this size.
       ⚠️ Over all FOURTEEN of his subject roots, whether or not they share a
       year in the current file, the closest pair is ΔE 0.0147 (year 7, It and
       Wd) — under the JND. That is the SUBJECT HUE MAP's limit, not the
       variant table's, and it is why `CLASS_CHROMA_FRACTIONS` has three
       levels; tightening it further means re-tuning `CLASS_HUE_A/B` and
       `CLASS_CHROMA_A/B` against all fourteen at once, not nudging one.
     · Smallest gap of all — two variants of one subject in one year:
       ΔE 0.0026. Distinct, as promised; invisible, as intended.
     · Nearest approach to the furniture in colour: ΔE 0.043 from #B1A0C7,
       0.054 from the grey gutter, 0.069 from #CCC0DA, 0.181 from the base
       purple. `CLASS_HUE_ARC` is 312° and not 360° precisely for this: the
       48° wedge around the structure purple at hue ~305 is reserved, and no
       class may be given it.

   ── AND OUTSIDE HIS FILE, MEASURED THE SAME WAY ──────────────────────────
     · His own alphabet, generalised — 14 subjects × bands A–G and X × sets
       0–4 × years 7–11, 2,800 codes: 2,800 distinct fills, no collisions.
     · Widened to every band ""/A–Z and every set 0–9, 18,900 codes: 16
       collisions (0.08%), all of them year 7 or 8, all of them one subject
       root meeting another (Wd against Bs or Su) on a band the school does
       not use. Cross-FAMILY, therefore — within a (year, subject) the table
       is exact and 26,460 codes produce 26,460 fills. Same cause as the
       ΔE 0.0147 above: two subject roots too close on the arc.

   ⚠️ SHEET_FILL, INPUT_INK and STRUCTURE_INK above are UNTOUCHED by any of
   this. A cell whose text names no class keeps the white input fill and the
   blue input ink exactly as it had them. */

/** Years 7…13 → the WCAG relative luminance its fills are solved to.
 *
 *  ⚠️ THE INDEX IS `(year - 7) mod 7`, NOT a clamp. A clamp put every primary
 *  year on rung 0 and made a whole school one shade; the modulo gives years
 *  1–6 rungs 1–6 and only collides across a seven-year gap (year 1 with year
 *  8), which takes an all-through school to notice. */
export const CLASS_YEAR_LUMINANCE = [
  0.655, 0.5825, 0.51, 0.4375, 0.365, 0.2925, 0.22,
] as const;

/** Where the class wheel starts, and how much of it there is. The 48° it does
 *  NOT cover is the wedge around the structure purple at hue ~305. */
export const CLASS_HUE_START = 330;
export const CLASS_HUE_ARC = 312;

/* The subject root's two letters become a position on that arc, and one of
   three chroma levels, through two independent Kronecker maps. The multipliers
   are irrational so the sequence never repeats, and these four were chosen
   ONCE, by maximising the smallest gap between the fourteen subjects in Cam's
   file — the principled default (the plastic-number pair) put Et and Ss on the
   same colour exactly. Written as literals rather than as `Math.sqrt(11) % 1`
   so the palette cannot move if a runtime rounds differently. */
/** frac(√11). */
const CLASS_HUE_A = 0.3166247903553998;
/** frac(e). */
const CLASS_HUE_B = 0.7182818284590451;
/** frac(√2). */
const CLASS_CHROMA_A = 0.41421356237309515;
/** 1/ρ, the plastic number's reciprocal. */
const CLASS_CHROMA_B = 0.7548776662466927;

/** Fractions of the most chroma the gamut allows at that luminance and hue.
 *  Three levels, because two subjects on a near-identical hue need somewhere
 *  else to differ. They stop well short of 1.0 on purpose: at the gamut edge
 *  the fills came out fluorescent, which is not what a school prints. */
const CLASS_CHROMA_FRACTIONS = [0.3, 0.44, 0.58] as const;

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE BAND/SET VARIANT — AND WHY IT IS DONE IN BYTES, NOT IN OKLCH
   ══════════════════════════════════════════════════════════════════════════

   ⚠️ THIS REPLACES A 20-CELL HUE/CHROMA LATTICE THAT DID NOT WORK, and the
   way it failed is worth keeping written down, because the shape of the
   mistake is inviting.

   That lattice placed a variant with `(band × 3 + set × 7) mod 20`. The strides
   are coprime to 20, which makes the sequence look well spread — and is beside
   the point, because 20 cells cannot hold the band/set space. On the school's
   OWN alphabet, bands A–G plus X against sets 0–4 is 40 combinations landing on
   20 cells: TWELVE cells held two or three each. `7A/Bs`, `7C/Bs2` and `7E/Bs4`
   came out the same byte, and so did `9A/Wd1` and `9C/Wd3` — measured, in a
   generated workbook, not reasoned about. Cam asked for a colour per class
   code and half the band/set space did not have one. (`10/Bs` with no band
   letter at all collided with `10A/Bs` too: both indexed at 0.)

   ── ⚠️ AND WIDENING THE LATTICE CANNOT FIX IT ────────────────────────────
   The obvious repair — more cells, bigger spreads — was tried and measured
   before this was written. A neighbourhood of hue and chroma small enough to
   keep `10D/Bs` looking like a relative of `10E/Bs` DOES NOT CONTAIN ENOUGH
   DISTINCT 8-BIT COLOURS. Indexing band on hue and set on chroma directly,
   over 26 bands × 10 sets:

     spread 12° / 0.30 chroma  →  9,855 collisions in 18,200 codes
     spread 24° / 0.60         →  5,050
     spread 40° / 1.00         →  3,364   (and by now visibly not relatives)

   So the variant is applied AFTER the solve, as a small integer offset to the
   three rendered bytes, out of a table in which every entry is distinct. That
   is the only space in which "a different colour" is a statement about the
   thing actually written to the file rather than about a real-valued
   intermediate that rounding is free to collapse.

   ── WHAT IS GUARANTEED, EXACTLY ──────────────────────────────────────────
   Within one (year, subject root): every band of "" or a single letter A–Z,
   against every set 0–9, gets its OWN cell of the table — 27 × 10 = 270 of
   them, indexed arithmetically, no modulo, no hash, no collision. That is the
   domain a school timetable produces. Outside it — a three-letter band, set
   12 — the code is hashed into a SEPARATE region of the table, so an exotic
   code can never take an ordinary one's colour, only another exotic one's.

   Across different (year, subject) families, separation is carried by the
   luminance ladder and the hue arc, which are far wider than ±8 bytes; the
   census in the tests below finds no cross-family collision. It is not
   claimed as a theorem, because the subject hue is derived from the root's
   first TWO letters — "11A/Photography" and "11A/Physics" are one colour, and
   deliberately so. */

/** How far a variant may push a rendered channel. ±8/255 is a shade, not a
 *  colour: the cell still reads as its subject and its year.
 *
 *  ⭐ ONE RADIUS, AND NOW ONLY ONE SPACE FOR IT TO ACT IN. `withClassVariant`
 *  runs on the PRINT bytes, and every theme draws the print bytes, so a variant
 *  costs exactly the same perceptual distance in the workbook, the light grid,
 *  the dark grid and OLED. Measured, widest gap between two variants of one
 *  family: ΔE 0.0123 over the codes in Cam's file, 0.0166 over his whole
 *  alphabet, 0.0211 over the full 270-cell band/set space — the same three
 *  numbers everywhere.
 *
 *  ⚠️ IT WAS NOT ALWAYS ONE SPACE, AND THE SECOND ONE WAS NOT FREE. While the
 *  dark ramp existed the same offsets measured 0.0144 / 0.0194 / 0.0245 there —
 *  1.17× print, tolerable — but the table is chosen to be luminance-NEUTRAL, so
 *  what it moves is CHROMA, and the ramp had already taken chroma down by about
 *  0.55. The same byte offset therefore subtended a much bigger ANGLE: a
 *  family's variants spanned 9.97° of hue on paper and 22.43° on the dark grid
 *  over his own codes. ⭐ THAT IS THE NUMBER TO RE-MEASURE FIRST if a
 *  theme-specific fill is ever reintroduced — not the ΔE, which looked fine.
 *
 *  ⚠️ AND IT CANNOT USEFULLY BE SHRUNK. The exact band/set region needs 270
 *  luminance-neutral offsets and there are only 225 inside radius 4; radius 5
 *  is the floor, and the 270 the school's own alphabet reaches already span
 *  5.39 bytes. Sweeping the radius over 8 / 7 / 6 / 5 changes not one LESSON
 *  fill, because the 270 smallest cells are the same 270 cells — but it does
 *  change all four TUTOR fills, because a smaller radius shrinks the candidate
 *  pool and therefore `CLASS_SHIFT_COUNT`, and a tutor's index is
 *  `hash32(initials) % CLASS_SHIFT_COUNT` rather than an exact slot. */
const CLASS_SHIFT_RADIUS = 8;
/** ⭐ HOW MUCH 8-BIT GREY A VARIANT MAY MOVE, IN LEVELS, AND WHY IT IS 1.
 *
 *  The year ladder puts eleven to fourteen grey levels between year groups. A
 *  variant free to push all three channels the same way would move grey by up
 *  to 8 — most of the way to the next rung — and `10D/Bs` would photocopy as
 *  a year 11. So the table keeps only the offsets that are very nearly
 *  LUMINANCE-NEUTRAL: they move chroma and leave the rung where it is. A rung
 *  that spanned one grey level across its subjects now spans two or three, and
 *  the narrowest gap to the NEXT rung is still eight levels — so the ladder
 *  reads exactly as it did, and no two years overlap.
 *
 *  ⭐ AND "EIGHT LEVELS" IS NOW THE ONLY NUMBER, because every theme draws the
 *  print bytes. Measured over years 7–13 × 14 subjects × 9 bands × 5 sets, min
 *  grey level of a rung against max of the next:
 *
 *      every theme   7.54  8.43  9.43  10.44  12.32  14.44
 *
 *  ⚠️ THIS USED TO BE TWO ROWS AND THE SECOND ONE GOVERNED. The dark ramp
 *  compressed the ladder by 0.6, taking those margins to 2.24 / 2.66 / 3.50 /
 *  3.62 / 4.46 / 5.23 — still positive, so no two years overlapped, but with an
 *  order of magnitude less room than print. That row is gone with the ramp and
 *  the margin is back to 7.54 at the tightest. If a theme-specific fill ever
 *  returns, THIS TABLE GETS ITS SECOND ROW BACK and the second row is the one
 *  that decides whether the constant below may move.
 *
 *  ⚠️ SO DO NOT LET THIS CONSTANT DRIFT UP, and note that the table builder
 *  below WIDENS IT ON ITS OWN when the pool cannot fill 270 cells. Measured on
 *  the compressed row, tolerance 2 took 2.24 to 0.78 and tolerance 3 to 0.25 —
 *  print would never have noticed either. The builder says which tolerance it
 *  stopped on for exactly that reason. */
const CLASS_SHIFT_GREY_TOLERANCE = 1;
/** Entries the table offers, out of the (2·8+1)³ = 4,913 candidates — of which
 *  807 are luminance-neutral to within a level, so 768 leaves headroom rather
 *  than scraping the bottom of the barrel. */
const CLASS_SHIFT_CELLS = 768;
/** Band slots: no band letter, then A–Z. `10/Bs` is not `10A/Bs`. */
const CLASS_BAND_SLOTS = 27;
/** Set slots: 0–9. A set 10 is not a set, it is a typo or a room number. */
const CLASS_SET_SLOTS = 10;
/** The arithmetically-indexed region. Cells past it are for hashed outliers. */
const CLASS_EXACT_CELLS = CLASS_BAND_SLOTS * CLASS_SET_SLOTS;

/* ── ⚠️ THE TABLE, AND THE MISTAKE THAT KEEPS GETTING MADE HERE ───────────
   TWICE NOW a hue/chroma lattice has been written in this spot and twice it
   has produced two classes with one colour. The second time it arrived as a
   RECONSTRUCTION: `variantOffset()` survived a bad merge without the constants
   it read, and the repair invented `(band × 1 + set × 7) mod 15` to fit the
   shape of the function rather than the requirement. Fifteen cells for 27 × 10
   band/set combinations, so it aliased immediately, and it aliased ON CAM'S
   OWN FILE: `7A/Cp1` = `7X/Cp2`, `8A/Cp1` = `8X/Cp2`, `9F/It` = `9G/It2`, and
   five more — eight pairs out of the 62 codes in it, measured in a generated
   workbook. Bands A and X are 23 apart and 23 ≡ 8 (mod 15), so every band-X
   class landed on a band-A class one set below it.

   ⚠️ AND A THIRD TIME, DIFFERENTLY: the table was right and the PLACE it was
   applied was wrong. `colourForClass` shifted the print bytes and the dark grid
   ramped THAT, so the ramp's compression ate the shift and 11D/Bs came out
   equal to 11E/Bs on the theme Cam uses — 1,467 distinct fills for 2,800 codes
   on the synthetic sweep. Same failure, same symptom, a different half of the
   pipeline: `withClassVariant` runs on whichever bytes are the output, and
   there is now exactly one set of output bytes (the ramp has been removed —
   see its tombstone above `gridClassFill`). If a fourth attempt is ever made
   here, MEASURE IN EVERY THEME; light passing has twice been mistaken for the
   palette passing.

   ⚠️ THE FIX IS NOT A BIGGER LATTICE. Do not "tune the slot counts". Any
   parameterisation in OKLCH ends at `Math.round(… * 255)`, and a neighbourhood
   small enough to keep `10D/Bs` looking like a relative of `10E/Bs` does not
   hold 270 distinct 8-bit colours — measured, over 26 bands × 10 sets:

     spread 12° / 0.30 chroma  →  9,855 collisions in 18,200 codes
     spread 24° / 0.60         →  5,050
     spread 40° / 1.00         →  3,364   (and by now visibly not relatives)

   So the variant is chosen IN THE OUTPUT SPACE: a table of integer offsets to
   the three rendered bytes, every entry distinct by construction, applied
   after the solve. "A different colour" is then a statement about what is
   written to the file rather than about a real-valued intermediate that
   rounding is free to collapse.

   The table is built once, at module load, from a pure enumeration — no
   literals to drift, and no dependence on call order. It is sorted by
   MAGNITUDE, so cell 0 is `(0,0,0)` (the unmodified family colour, which is
   what `10/Bs` with no band and no set gets) and the ordinary band/set space
   is served by the smallest offsets in it. The largest entry is 10.4 bytes
   away from the family centre.

   ⚠️ THE ONE INVARIANT: the table must hold at least CLASS_EXACT_CELLS entries,
   or the exact band/set index runs off the end and the aliasing comes back —
   which is the whole bug this replaced, returning silently and looking like a
   tuning change. Rather than trust the four constants above to stay mutually
   consistent, the builder WIDENS THE GREY TOLERANCE until it has enough. At
   the values here it never widens (radius 8 at tolerance 1 yields 807
   candidates for a cap of 768); the loop exists so that halving the radius in
   a later edit costs a shade of print fidelity instead of costing correctness,
   and says which one it spent in the constant it stops on. */
const CLASS_SHIFT_TABLE: ReadonlyArray<readonly [number, number, number]> =
  (() => {
    const enumerate = (tolerance: number) => {
      const found: Array<[number, number, number]> = [];
      const r = CLASS_SHIFT_RADIUS;
      for (let dr = -r; dr <= r; dr++) {
        for (let dg = -r; dg <= r; dg++) {
          for (let db = -r; db <= r; db++) {
            /* Rec. 709 on the BYTES rather than on linear light: an
               approximation, but the right one — it is what keeps the sum of
               the three nudges from moving the rung, and being out by a
               fraction of a level does not matter when the budget is a whole
               level. */
            const grey = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
            if (Math.abs(grey) > tolerance) continue;
            found.push([dr, dg, db]);
          }
        }
      }
      return found;
    };

    let tolerance = CLASS_SHIFT_GREY_TOLERANCE;
    let candidates = enumerate(tolerance);
    /* A bounded walk, not a `while (…)`: at the widest the predicate admits
       every candidate in the cube, so this terminates on the arithmetic rather
       than on the data. */
    while (candidates.length < CLASS_EXACT_CELLS && tolerance < CLASS_SHIFT_RADIUS) {
      tolerance += 1;
      candidates = enumerate(tolerance);
    }

    /* Magnitude first, then the components, so the order is total and the same
       everywhere — `sort` is only stable per spec since ES2019 and this must
       not depend on that. */
    candidates.sort((a, b) => {
      const ma = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
      const mb = b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
      return ma - mb || a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    });
    return candidates.slice(0, CLASS_SHIFT_CELLS);
  })();

/** What the table actually came out at. Every index is taken modulo THIS and
 *  never modulo `CLASS_SHIFT_CELLS`, which is only the cap asked for. */
const CLASS_SHIFT_COUNT = CLASS_SHIFT_TABLE.length;

/** FNV-1a, 32-bit. Used only where there is nothing to index — an exotic band,
 *  a set of 12, a tutor's initials. It replaces a SUM of letter values, which
 *  collides on every anagram: `10ABC` and `10CAB` were one colour, and so was
 *  every pair of tutor groups twenty apart. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * ⭐ WHICH CELL OF THE TABLE A LESSON'S BAND AND SET GET. **EXACT** over the
 * domain a school timetable produces: a band of "" or one letter A–Z against a
 * set 0–9 is 27 × 10 = 270 combinations and there are 270 cells, indexed
 * arithmetically. No modulo, no hash, no collision — that is the property the
 * two lattices could not have and the reason this is a table.
 *
 * Outside it — a three-letter band, a set of 12 — the code is hashed into a
 * SEPARATE region, so an exotic code can never take an ordinary one's colour,
 * only another exotic one's.
 */
function lessonShiftIndex(band: string, set: number): number {
  const exact =
    band.length <= 1 &&
    Number.isInteger(set) &&
    set >= 0 &&
    set < CLASS_SET_SLOTS;
  if (exact) {
    const bandSlot = band ? letterIndex(band.toLowerCase().charCodeAt(0)) + 1 : 0;
    return bandSlot * CLASS_SET_SLOTS + set;
  }
  const spare = CLASS_SHIFT_COUNT - CLASS_EXACT_CELLS;
  return CLASS_EXACT_CELLS + (hash32(`${band} ${set}`) % spare);
}

/** Registration is not a subject, so it gets one near-neutral family instead
 *  of an invented hue — but on the SAME year ladder as everything else, so
 *  "which year is in this room first thing" still reads on a photocopy.
 *
 *  ⚠️ Its variant is a HASH and not an index, because teacher initials are not
 *  a bounded domain the way a band letter is, so there is nothing to index —
 *  and this is the ONE place in the palette where "a colour per code" is a
 *  probability rather than a guarantee. It used to be the SUM of the letter
 *  values over fifteen cells, which is two weak hashes stacked: `10ABC` and
 *  `10CAB` sum alike, so does every anagram, and so does every pair fifteen
 *  apart. Over `hash32` and the whole 768-cell table, a year's dozen tutor
 *  groups — they share a base, so the table is all that separates them — carry
 *  an expected 0.09 collisions instead of very nearly one per year. Lessons do
 *  not rely on this; `lessonShiftIndex` is exact. */
const TUTOR_HUE = 78;
const TUTOR_CHROMA_FRACTION = 0.1;

/** Written instead of a class and meaning "not applicable". It is a real
 *  entry somebody typed — it prints — but it names no class, so it takes no
 *  class colour and keeps the input ink. */
const PLACEHOLDER_VALUES = new Set(["-", "--", "–", "—", "n/a", "na"]);

/** The legend on the "Export info" sheet. A bound, because that sheet is
 *  written after every other one and a pathological calendar must not turn it
 *  into the longest sheet in the workbook. */
export const MAX_CLASS_LEGEND_ROWS = 200;

/** What a cell's text turned out to name. */
export type ClassCode =
  | { kind: "lesson"; year: number; band: string; subject: string; set: number }
  | { kind: "tutor"; year: number; initials: string }
  /** "-" and its friends: printed, never coloured, never treated as empty. */
  | { kind: "placeholder" }
  /** A booking's free text, "Booked", a teacher's initials — anything else. */
  | { kind: "other" };

/** "10B/Bs" → year 10, band B, subject Bs, set 0. "8X/Cp1" → set 1.
 *
 *  The subject runs to ten letters rather than the two this school uses, so
 *  "11A/Photography" is a lesson and not free text. Nothing wider, and nothing
 *  containing a space: past that it stops being a code and starts being a
 *  sentence, and a sentence belongs on the white input fill. */
const LESSON_RE = /^(\d{1,2})\s*([A-Za-z]{0,3})\s*\/\s*([A-Za-z]{1,10})\s*(\d{0,2})$/;
/** "11RRW" → year 11, initials RRW. No slash, so it is not a lesson. */
const TUTOR_RE = /^(\d{1,2})\s*([A-Za-z]{2,5})$/;

/**
 * ⭐ THE CLASSIFIER. Pure, and keyed on the TEXT alone — never on which row
 * the cell sits in.
 *
 * That matters both ways round. A lunchtime club booked onto the Tutor period
 * is not a tutor group, and a tutor code copied onto period 3 still is one;
 * deciding by position would have got both wrong. It also means the
 * custom-field rows need no special case: "RW" has no leading year, "DLD/HKO"
 * has no leading digit, "-" is a placeholder, and a telephone extension is a
 * number rather than a string.
 */
export function parseClassCode(raw: string | number): ClassCode {
  if (typeof raw !== "string") return { kind: "other" };
  const text = raw.trim();
  if (!text) return { kind: "other" };
  if (PLACEHOLDER_VALUES.has(text.toLowerCase())) return { kind: "placeholder" };

  const lesson = LESSON_RE.exec(text);
  if (lesson) {
    return {
      kind: "lesson",
      year: Number(lesson[1]),
      band: lesson[2].toUpperCase(),
      subject: lesson[3],
      set: lesson[4] ? Number(lesson[4]) : 0,
    };
  }

  const tutor = TUTOR_RE.exec(text);
  if (tutor) {
    return {
      kind: "tutor",
      year: Number(tutor[1]),
      initials: tutor[2].toUpperCase(),
    };
  }

  return { kind: "other" };
}

/**
 * A class code, resolved into the two things every renderer needs SEPARATELY:
 * the FAMILY colour it belongs to, and WHICH VARIANT of that family it is.
 *
 * ⭐ THE SEPARATION IS THE POINT, and it is not decoration — even now that
 * every theme writes the SAME bytes for one class. The variant has to land on
 * whichever bytes are the output, and handing back a single already-shifted
 * colour is what once let the dark grid ramp a byte that already carried a
 * variant, compressing the variant away and giving two classes one colour. See
 * the banner over `withClassVariant`. Keeping the unshifted family recoverable
 * costs nothing and is what made removing that ramp a two-line change; putting
 * the two halves back together would quietly re-arm the bug for whoever adds
 * the next transform.
 *
 * `null` means "this text names no class" — a placeholder, a free-text
 * booking, a room's details. It does NOT mean the cell is empty.
 */
function classFamilyOf(
  raw: string | number,
): { family: string; shiftIndex: number } | null {
  const parsed = parseClassCode(raw);

  if (parsed.kind === "lesson") {
    const letters = parsed.subject.toLowerCase();
    const first = letterIndex(letters.charCodeAt(0));
    const second = letterIndex(
      letters.length > 1 ? letters.charCodeAt(1) : letters.charCodeAt(0),
    );

    const arcPosition = frac((first + 1) * CLASS_HUE_A + (second + 1) * CLASS_HUE_B);
    const level = Math.min(
      CLASS_CHROMA_FRACTIONS.length - 1,
      Math.floor(
        frac((first + 1) * CLASS_CHROMA_A + (second + 1) * CLASS_CHROMA_B) *
          CLASS_CHROMA_FRACTIONS.length,
      ),
    );

    /* ⭐ THE FAMILY — (year, subject root) — DECIDES THE COLOUR, and the band
       and set only nudge the rendered bytes. So every Cp class of a year is one
       recognisable colour, and no two of them are the same one. */
    return {
      family: solveFamilyFill(
        luminanceForYear(parsed.year),
        wrapHue(CLASS_HUE_START + arcPosition * CLASS_HUE_ARC),
        CLASS_CHROMA_FRACTIONS[level],
      ),
      shiftIndex: lessonShiftIndex(parsed.band, parsed.set),
    };
  }

  if (parsed.kind === "tutor") {
    return {
      family: solveFamilyFill(
        luminanceForYear(parsed.year),
        TUTOR_HUE,
        TUTOR_CHROMA_FRACTION,
      ),
      shiftIndex: hash32(parsed.initials) % CLASS_SHIFT_COUNT,
    };
  }

  return null;
}

/**
 * ⭐ THE ONE FUNCTION THAT DECIDES A CLASS COLOUR **ON PAPER** — the ARGB the
 * workbook writer fills the cell with.
 *
 * `null` means "this text names no class" — a placeholder, a free-text
 * booking, a room's details — and the caller must then leave the cell on the
 * white input fill with the input ink. It does NOT mean the cell is empty.
 *
 * ⚠️ ITS BYTES ARE FROZEN, AND EVERY SCREEN NOW DRAWS THEM. `gridClassFill` is
 * this function's own arithmetic, in light, dark and OLED alike, so the printed
 * sheet and the grid are the same document to the byte and a change here
 * changes a file people print.
 *
 * ⚠️ WHICH IS WHY EVERY CHANGE TO THE SCREEN PALETTE IS DIFFED AGAINST A REAL
 * EXPORT. Deleting the dark ramp did not touch this function, and that was
 * proved rather than asserted: a workbook was generated through
 * `streamTimetableWorkbook` before and after, read back with exceljs, and every
 * cell's fill, font colour and value compared — 3,702 cells, 73 distinct fills,
 * zero differences. Do that again next time.
 */
export function colourForClass(raw: string | number): string | null {
  const parts = classFamilyOf(raw);
  return parts ? argbOf(withClassVariant(parts.family, parts.shiftIndex)) : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE SCREEN PALETTE — ONE DOCUMENT, IN A DARK FRAME
   ══════════════════════════════════════════════════════════════════════════

   Cam, looking at an EMPTY template grid in dark mode: *"this timetable
   template looks awful and hard to edit, it should look more like that
   spreadsheet format i gave you before with the alternating colours and
   classes filling in with a pastelle like colour, same class = same colour,
   then all user input data is a more stand out colour, all the same"*.

   And then, on the grid that answered it: *"the colours of each class are
   really dull and boring, they should be more like the ones from the
   spreadsheet"*.

   ⭐⭐ THE RULING, AND IT IS HIS: **A CLASS CELL IS THE PRINTED BYTE, IN EVERY
   THEME.** `gridClassFill` no longer varies the fill by theme at all — light,
   dark and OLED draw exactly what the workbook writes, and `gridInkOn` flips
   the ink to black to sit on it. The furniture around them — bands, gutters,
   spine — stays dark. Pastel chips, like paper, in a dark frame.

   He was offered richer, more chromatic DARK fills instead, and a per-theme
   split, and picked this after being shown that his spreadsheet has no class
   colours at all and that the dark fills he was looking at measure as greys.
   The cost is priced at the bottom of this banner and he took it.

   ── ⚠️ WHAT "DULL AND BORING" ACTUALLY MEASURED AS ───────────────────────
   Over the 68 codes in `IT_Room_Timetable_2627_1.xlsx`, the fills this
   replaces:

                    OKLab L        chroma         mean C   e.g.
     light          0.700–0.869    0.009–0.130    0.064    #a6b2ca #c9aa95
     dark / oled    0.374–0.478    0.000–0.069    0.035    #454b56 #4f4b2b

   ⭐ AT L ≈ 0.42 A CHROMA OF 0.035 IS VISUALLY GREY. Not "muted" — grey. And
   the light fills were never the complaint: they already sit within a few
   units of the tints the school's own workbook uses. This was a DARK-MODE-ONLY
   fault, produced by a ramp that is now a tombstone further down the file.

   ── ⭐ AND HIS SPREADSHEET HAS NO CLASS COLOURS IN IT ────────────────────
   Every fill in all 41 sheets, re-measured: `#CCC1DA` (accent4 tint 0.60 — the
   room header and the alternate day blocks), `#B3A2C7` (tint 0.40 — the other
   day blocks), `#D9D9D9` (seven grey spacers) and white. Class cells are WHITE
   with BLACK text. So *"the ones from the spreadsheet"* cannot mean a set of
   class colours lifted out of it; it means the LOOK of it — light, low-chroma
   tints on a white ground. `#CCC1DA` is L 0.828 C 0.037 and `#B3A2C7` is
   L 0.739 C 0.056, and the class palette's own L 0.700–0.869 at C 0.009–0.130
   sits in exactly that band. The printed byte is not a compromise with what he
   asked for; it IS what he asked for.

   ── WHAT THE SOURCE FILE DOES WITH STRUCTURE, RE-READ CELL BY CELL ───────
   `IT_Room_Timetable_2627_1.xlsx`, styles resolved through the theme part:

     rows 1–4      the room codes and the three custom-field rows, ONE banded
                   unit, on `structure` (accent4 @ Lighter 60%).
     day blocks    NINE rows each, and they ALTERNATE: blocks 1/3/5 on
                   `structureAlt`, blocks 2/4 on `structure`.
     the band      covers the date column, the period column AND the break
                   rows — a break row is painted in ITS OWN DAY'S colour, so
                   it reads as the spine running across the sheet rather than
                   as an empty cell somebody forgot.
     separators    rows 5/15/25/35/45, merged B..K, on the grey `gutter` — a
                   real strip between days, not a hairline.
     the rest      white. The input area is the only white in the document.

   ⭐ SO THE ALTERNATION IS BY DAY BLOCK, ON THE FURNITURE ONLY. Not per row
   and not per column, and this file will not do either:

     · per ROW would fight the class fills, which are the one thing allowed to
       colour the input area, and would beat on the eye at 45 rows;
     · per COLUMN would give rooms a rhythm they do not have — rooms are
       unordered peers, and a reader who navigates by stripe rather than by
       the sticky room header is being taught the wrong habit;
     · BOTH is a chessboard, which is worse than neither.

   What is genuinely hard in a 45-row grid is "which day am I in", and the day
   is what the band answers. Periods within a day are already named, and
   ribbed every few rows by a painted break.

   ── ⚠️ THE THREE CANDIDATES, AND WHICH ONE THIS IS ───────────────────────
   All three were built and measured over the school's own codes and over a
   synthetic sweep, before any of them was picked:

     A  ⭐ THE PRINT FILL, OPAQUE, IN EVERY THEME — what is implemented, and
        what was REJECTED the first time round on two grounds. One of them was
        wrong: "`t.text` is unreadable on it" is a statement about `t.text`,
        and `gridInkOn` already had the answer (fall back to the ink the
        printed document uses on that very colour — black). The other is real
        and is the glare paragraph below; Cam was shown it and chose this.
     B  the print fill at low alpha over the theme surface — WHAT THIS APP
        SHIPPED FIRST, and it measures badly. At α 0.26 over #17171b the
        palette's chroma collapses from 0.009–0.130 to 0.002–0.037 (a third),
        and because the ground itself is faintly blue the HUE of the low-chroma
        fills swings by up to 107° — a registration group came out a different
        colour from the one it prints in. ⚠️ NEVER GO BACK TO THIS; see rule 1
        on the tombstone.
     C  the same hue and the same pastel-ness at a LOWER luminance — an affine
        OKLab ramp with the chroma riding the lightness. Correct, careful, and
        the thing Cam called dull. It is the tombstone.

   ── ⭐ MEASURED AFTER THE CHANGE, ON HIS 68 REAL CODES ───────────────────
   Read back through the module, not reasoned about.

     theme       distinct fills   was        worst ink on a chip   was
     light       68 / 68          68 / 68    6.69 : 1 (#1b1b1f)    6.69 : 1
     dark        68 / 68          68 / 68    8.18 : 1 (#000000)    5.91 : 1
     oled        68 / 68          68 / 68    8.18 : 1 (#000000)    5.91 : 1

   Distinctness in dark is now TRIVIAL rather than argued: the dark bytes ARE
   the light bytes, and light has always been 68 / 68. Said plainly because it
   is not a result — it is the absence of a place for the old bug to live.

   ⭐ AND THE SYNTHETIC COLLISIONS ARE GONE WITH IT. Over the 2,800 codes of
   his own alphabet (years 7–11 × 14 subjects × bands A–G and X × sets 0–4) the
   ramp cost 21 CROSS-FAMILY pairs on the dark grid, and 15 more over a wider
   3,528; both are now 0, because there is one output space instead of two:

                     light            dark / oled       dark, with the ramp
     2,800 codes     2,800 distinct   2,800 distinct    2,779 (21 cross-family)
     3,528 codes     3,528 distinct   3,528 distinct    3,513 (15 cross-family)

   ── ⭐ AND THE YEAR LADDER GOT ITS MARGIN BACK ──────────────────────────
   The ladder is solved in LUMINANCE because a mono printer reads luminance
   (see `CLASS_YEAR_LUMINANCE`), and the ramp compressed it by 0.6 — so on the
   dark grid the rungs sat 1.57 grey levels apart at the tightest on his codes,
   and 0.67 over years 7–13. They are now the printed rungs in every theme:

     8-bit grey, his codes    year 7 210.1–212.3 … year 11 161.5–163.4
     gap to the next rung     8.12 / 9.76 / 10.83 / 12.42   (dark was
                              2.68 / 4.14 / 4.34 / 5.45)

   ⚠️ "8-BIT GREY" HERE IS RELATIVE LUMINANCE RE-ENCODED TO A BYTE, which is
   what a mono printer and `luminanceOf` both see — NOT the Rec. 709 sum of the
   three sRGB bytes. The two differ by several levels and the second one is not
   the ladder's metric; measure the wrong one and the rungs look tighter than
   they are.

   ── ⚠️⚠️ THE COST, WHICH IS GLARE, STATED IN NUMBERS ────────────────────
   A grid of near-paper cells on OLED at night is the obvious price of what he
   chose, and it is not small:

     chip 8-bit grey, mean          182.5        was 77.3
     chip relative luminance, mean  0.477        was 0.076  ← 6.3× the light

   ⚠️ THE COVERAGE FIGURE HERE WAS WRONG WHEN THIS SHIPPED, AND IT WAS WRONG IN
   THE DIRECTION THAT FLATTERS THE CHOICE. It read "**23%** of the drawn grid …
   the room columns are 56% of the grid's pixel area at `GRID_PX`". The 56% is
   not reproducible at any room count his file has: `GRID_PX` is a spine of
   88 + 118 and his sheets carry EIGHT rooms of 108, so the room columns are
   **80.7% of the grid's width** and, over the 45 period rows, **72.0% of its
   area**. 56% would need 3.2 rooms. The fill rate it was multiplied by is
   right — 5,681 of 13,680 room-column cells over his 38 week sheets (38 × 45
   rows × 8 rooms) is **41.5%**, re-counted with exceljs. So:

     chips cover **30%** of the drawn grid, not 23%.

   Weighting each surface by the area it covers — header band, five gutters, the
   day-block spine, and the room columns at that 41.5% — the MEAN RELATIVE
   LUMINANCE of the whole grid comes out:

     light   0.706      dark   0.159      oled   0.154
                        dark   0.040  ← with the muddy chips
                        oled   0.034  ← with the muddy chips

   ⚠️ THOSE ARE ALSO NOT THE NUMBERS THIS BANNER SHIPPED (0.659 / 0.135 / 0.129
   against 0.042 / 0.036), for the same reason: the area weights were wrong.
   Every correction moves the same way — MORE emitted light than was claimed.
   The reading above counts every non-chip room cell as the theme's own paper,
   which is the DIMMEST defensible reading; painting the non-bookable rows in
   their day band, as both grids actually do, takes dark to 0.171.

   ⭐ SO: **4.0× brighter** than the dark grid it replaces (4.5× on OLED), and
   still **4.4× dimmer** than light mode (4.6× on OLED). It will read like a
   printed page under a lamp in a dark room, which is the thing he asked for,
   and on OLED at night it is a real step up in emitted light — a bigger one
   than the paragraph this replaces admitted to.

   ⚠️ AND IT IS NOT DIMMED, ON PURPOSE. A dim big enough to matter is a dim big
   enough to stop being paper: halving the emitted light needs the mean chip
   from 8-bit grey 182 down to ~126, which is candidate C again with different
   constants. A dim small enough to keep the look — say 5 grey levels — moves
   the whole-grid mean by 5.3% (not the 1.4% claimed here before, same bad area
   weights), which is still far less than it costs: the byte-for-byte identity
   with the printout that everything below is in service of. The knob that
   actually governs glare here is the THEME (0.706 vs 0.159) and the fill rate
   of the timetable, not a few points of chip lightness.

   ── ⭐ LIGHT MODE IS THE PRINTOUT, BYTE FOR BYTE — AND SO IS EVERYTHING ──
   `gridClassFill` runs `withClassVariant` on the family colour, which IS
   `colourForClass`'s own arithmetic and not a second copy of it. The app's
   light card is #ffffff, which is the paper the fills were solved against, so
   a screenshot of the grid and a screenshot of the workbook are the same
   pixels — in any theme now, since the fill no longer depends on one.

   ⚠️ AND "THE EXPORT IS UNCHANGED" WAS PROVED RATHER THAN ASSUMED. A workbook
   was generated through `streamTimetableWorkbook` before and after this change
   — all 69 of the code strings his file holds (68 distinct; one is typed with
   a leading space) placed across template, week and half-term sheets, plus the
   placeholder, free-text, blocked and free cases — read back with exceljs, and
   every cell's fill, font colour and value diffed: **3,702 cells, 73 distinct
   fills, ZERO differences.** Re-run that before touching anything in this
   banner. The screen and the printed sheet being one document is the property
   the whole file exists to hold.

   ── AND THE FURNITURE, WHICH DID NOT MOVE ────────────────────────────────
   `STRUCTURE_BASE` is one purple and the two tints are it at 40% and 60% over
   white — that is exactly what "Lighter 60%"/"Lighter 40%" mean. So on a dark
   ground the same two fills are the same purple at a lower alpha over the
   theme's own surface, tuned so the RATIOS match the paper document:

     paper   band↔paper 1.73   bandAlt↔paper 2.41   band↔bandAlt 1.39
     dark    band↔paper 1.47   bandAlt↔paper 2.05   band↔bandAlt 1.40
     oled    band↔paper 1.44   bandAlt↔paper 2.07   band↔bandAlt 1.44

   `t.text` on the bands: 9.91/7.13 light, 10.90/7.83 dark, 12.36/8.53 oled.
   What DID change is how the chips read against them, and it changed for the
   better — the table is over `gridSurfaces`.

   ⚠️ STRUCTURE INK IS `t.text` AND NEVER `t.textSecondary` OR `t.textMuted`.
   Every word in the source document is black, and it has to be: #5b5b63 on
   #B1A0C7 is 2.79:1 and #6f6f79 is 2.34:1, both of which fail outright. A
   break row's label is dimmed by being a break, not by being grey.  */

/** ⭐ THE ONE COLOUR FOR "SOMEBODY CHANGED THIS", and it is the workbook's own.
 *
 *  The file already declares a user-input colour — `INPUT_INK`, blue, the
 *  spreadsheet convention that black is the sheet and blue is what a person
 *  typed into it. This is that blue as a FILL, because on a screen a fill is
 *  what reads at a glance and an ink is what reads at arm's length.
 *
 *  ⚠️ IT HAS TO SURVIVE BEING SURROUNDED BY SIXTY PASTELS, so it was picked by
 *  measurement rather than by taste. Over the school's 68 codes its OKLab
 *  distance to the NEAREST class fill is 0.0890, and over the synthetic 2,646
 *  (years 7–13 × 14 subjects × 9 bands × 3 sets) 0.0445 — seventeen to
 *  thirty-four times the closest pair the class palette allows itself (0.0026).
 *
 *  ⚠️ ONE NUMBER PER THEME, NOW THAT THERE IS ONE FILL PER THEME. This
 *  paragraph used to quote a second, better figure "(dark)" for each of those —
 *  0.072 and 0.040 — and a `t.text` ratio of 10.97:1 on the dark grid. All
 *  three described `#2f57a4`, the lifted fill that went with the ramp; two of
 *  them were already stale against it (it measured 0.1139 and 0.0994), and the
 *  fill itself no longer exists. Dark and OLED now draw `#6e9bee`, so they get
 *  the light numbers exactly. ⭐ AND `t.text` IS NOT THE INK THERE: #f2f2f4 on
 *  #6e9bee is **2.48:1**, so `gridInkOn` falls back to black at 7.59:1, the
 *  same flip it makes on every class chip. Its banner has the rest.
 *
 *  ⚠️ AND COLOUR IS NOT THE ONLY CHANNEL. `PublishedTimetable` also draws an
 *  override BOLD, dotted-underlined, and with a solid 3px edge — which is why
 *  an ordinary class fill does NOT get an edge. A bar on every cell is not a
 *  mark. (`TemplateGrid` draws no override at all: it is the standing plan, and
 *  an override is a departure from one. It does not import `gridOverrideFill`,
 *  so "both grids" — which this note and the one below it used to say — was
 *  never true of the edge.) */
export const OVERRIDE_BASE = "FF6E9BEE";

/** The edge on an override cell. Full-strength, and it has to differ from the
 *  fill it sits on — so it is the base DARKENED, and ONE value now that the
 *  fill is one value in every theme.
 *
 *  ⚠️ AND "DIFFER" IS 3:1, THE WCAG FLOOR FOR A GRAPHICAL OBJECT, MEASURED
 *  AGAINST THE FILL IT SITS ON. It was #2f68d2 on #6e9bee — **1.88 : 1** — a
 *  bar the same weight as its own background, which is a bar nobody sees. This
 *  one is 3.47 : 1 on #6e9bee.
 *
 *  ⚠️ AGAINST THE FILL, AND ONLY AGAINST THE FILL. `PublishedTimetable` — the
 *  one grid that draws an override at all — draws it as `inset 3px 0 0`, so it
 *  is painted INSIDE the cell, over the override fill, and never abuts the page. Just as well: on the dark card it is 1.86 : 1
 *  against the page and 2.06 : 1 on OLED. This note used to claim 8.73 : 1
 *  "on the dark card" and argue from it that the bar reads "against the rule
 *  beside it" — that was the LIFTED dark edge, which went with
 *  `OVERRIDE_DARK_L`, and it was never the number the mark depends on. */
const OVERRIDE_EDGE = "#1f4287";

/**
 * ⭐ THE PIXEL GEOMETRY, SHARED BY BOTH GRIDS.
 *
 * `TemplateGrid` and `PublishedTimetable` are the same document at two
 * moments — the standing plan and one week of it — and a reader moves between
 * them. They had independently chosen day columns of 92 and 74, period columns
 * of 132 and 96 and room columns of 108 and 104, so the two drew visibly
 * different tables of the same thing. One set of numbers, here, beside the
 * palette they also share.
 */
/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ AND THE PROPORTIONS ARE THE SHEET'S, NOT A GUESS AT "ROOMIER"
   ══════════════════════════════════════════════════════════════════════════

   Cam: *"the actual booking on the website also looks very cramped and should
   look more like the spreadsheet with better spacing between days of the week,
   spacing on the left and right, rooms that aren't as wide and centering on
   all inputs, each period should also be a little taller"*.

   Five asks, and his own workbook answers all five — so these numbers are read
   off it rather than nudged upwards until they felt better. Excel widths are
   characters of Calibri 11 (7px each, +5 of cell padding) and heights are
   points (× 96/72):

       col A / col L   32.7109375  ->  234px   EMPTY MARGIN, both sides
       col B           30.7109375  ->  220px   the date spine
       col C           18          ->  131px   the period column
       cols D..K       18          ->  131px   a room  — THE SAME AS COL C
       every row       21pt        ->   28px   including the separator row,
                                               which is a FULL ROW, not a rule

   What that says, and what this set now does:

     · A ROOM IS NO WIDER THAN THE PERIOD COLUMN. His are equal; ours were 108
       against 118, and worse than that on the published board, which drew the
       table `w-full` so eight rooms SHARED a 1,600px dashboard and came out
       ~174px each while the editor drew the same rooms at 108. That is the
       "rooms that aren't as wide" — and it is also the two grids disagreeing,
       which they are not allowed to do. Both are `table-layout: fixed` at
       `room` now, and the slack goes to the margins instead of into the
       columns.
     · THE DAY SEPARATOR IS A ROW. `gutter` was 8px — a hairline. It is `row`
       now, exactly as the sheet has it, and that is "better spacing between
       days of the week".
     · A PERIOD ROW IS TALLER. 27 -> 32. His is 28px against a 131px column;
       ours is 32 against 104, so the CELL is proportionally taller than his.
       ⚠️ AND IT NEARLY CLOSES A GAP THAT WAS ALREADY THERE: a period that
       carries a CLOCK is two lines and measures 34px whatever this number
       says, so at 27 every clocked row silently grew by seven pixels and the
       grid was two heights at once. At 32 it grows by two. (Cam's own school
       LABELS its periods rather than timing them, which is why nobody had
       noticed.)
     · THERE IS A MARGIN DOWN BOTH SIDES. `pad`, which is his empty columns A
       and L. Not 234px, because a browser window is not A3 landscape: the
       table also carries `margin: 0 auto`, so on a screen wider than the grid
       the real margin is half the slack and this is only the floor.

   ⚠️ WHAT IT COSTS, MEASURED IN A BROWSER RATHER THAN ESTIMATED. A week is 45
   period rows and 5 separators, so every pixel on `row` is 45 down the page and
   every pixel on `gutter` is 5. The tbody goes 1,255px -> 1,600px and the whole
   table 1,355px -> 1,720px, over a header block that is ~120px either way. On a
   school whose periods carry CLOCKS the rows were already 34px, so there the
   cost is the separators alone: 1,670px -> 1,810px.

   It did not fit a laptop viewport before — nothing puts a 1,255px table in the
   ~570px a dashboard panel has — and it does not now; it scrolls about 27%
   further. That is the trade Cam asked for in the words "so it's all easier on
   the eyes", and it is the one number here that is a judgement rather than a
   measurement.

   ⚠️ AND THE SPINE DID NOT GROW. 88 + 118 = 206 became 88 + 104 = 192, because
   the period column came DOWN to meet the room column. The narrow spine is
   untouched at 64 + 88 = 152. See `GRID_NARROW_PX`. */

/** The six numbers a grid is drawn from. Widths and heights in CSS pixels. */
export type GridPx = {
  /** The sticky day / date spine. */
  readonly day: number;
  /** The sticky period column, offset by `day`. */
  readonly period: number;
  /** One room column. FIXED, not a minimum — see the banner above. */
  readonly room: number;
  /** One period row. */
  readonly row: number;
  /** The strip between two day blocks. */
  readonly gutter: number;
  /**
   * The margin down the left and the right of the grid — the source's empty
   * columns A and L.
   *
   * ⚠️ IT GOES OUTSIDE THE SCROLLPORT, NOT ON IT. Both grids' first two
   * columns are `position: sticky`, and a sticky inset is resolved against the
   * scroll container's own box — so padding ON the scroller is padding the
   * spine slides underneath the moment the grid is scrolled. The padding
   * belongs to the element WRAPPING the scroller, which makes the scrollport
   * itself narrower and inset, and then there is nothing for the spine to
   * slide into. (It also sidesteps the older question of whether a block
   * scroll container includes its end padding in scrollable overflow.)
   */
  readonly pad: number;
};

export const GRID_PX: GridPx = {
  /** The day spine. Holds "Monday", or "Mon" over a date. */
  day: 88,
  /** The period column. "After School" over a clock is the widest thing in it,
   *  and measures ~66px + 16px of cell padding — so this is not tight at 104,
   *  and 104 is what makes it EQUAL TO A ROOM, as the sheet has it. */
  period: 104,
  /** One room column, and the same width as the period column. */
  room: 104,
  /** One period row. A week is forty-five of them. */
  row: 32,
  /** The strip between two day blocks — the workbook's separator row, and now
   *  literally a row high rather than a rule. */
  gutter: 32,
  /** The margin either side. His is 234px; this is the floor, and `margin:
   *  0 auto` on the table hands over any real slack on top of it. */
  pad: 16,
} as const;

/**
 * ⭐⭐ THE SAME GRID ON A PHONE — AND THE SPINE IS THE WHOLE PROBLEM.
 *
 * ⚠️ THE DAY AND PERIOD COLUMNS ARE `position: sticky`, so they are subtracted
 * from the viewport before a single room is drawn. `GRID_PX` above is a spine
 * of 88 + 104 = 192px (it was 206 before the period column came down to meet
 * the room column); on a 375px phone that is half the screen spent on
 * furniture and 183px left, which is **1.8 room columns**. A room timetable
 * that cannot show two rooms side by side is a list, and a list is the
 * document this replaces.
 *
 * ⚠️ AND IT IS REACHED ON A PHONE. `PublishedTimetable` is what
 * `MobileDashboard` mounts for an org's booking tab — not a desktop-only
 * screen — and unifying the two grids' geometry moved that spine from the
 * board's own 74 + 96 = 170px UP to 206px, so the phone lost 36px of rooms to
 * a change made for desktop consistency.
 *
 * So the numbers narrow under `GRID_NARROW_PX_MAX_WIDTH`, and they narrow on
 * the axis that costs nothing: below `sm` the day column already shows "Mon"
 * rather than "Monday", and "After School" fits 88px at this type size. The
 * spine comes to 152px and a 375px phone gets 2.5 room columns — better than
 * either grid had before they were unified, and unchanged by the reshaping
 * above: the spine is the one number that was NOT allowed to grow.
 */
export const GRID_NARROW_PX: GridPx = {
  /** "Mon" over "7 Sep". The weekday is abbreviated at this width anyway. */
  day: 64,
  /** "After School" at 11.5px is ~66px, plus the cell's own 16px of padding. */
  period: 88,
  /** "10D/Bs" is ~40px. Equal to the period column, as the sheet has it — and
   *  narrowing it 92 -> 88 buys back four pixels a column, which on a 375px
   *  phone is 2.53 room columns against 2.42. Measured, not computed. */
  room: 88,
  /** ⭐ THE VERTICAL NUMBERS ARE THE WIDE ONES, DELIBERATELY. A phone scrolls
   *  vertically no matter what these are, and a 32px row is a better touch
   *  target than a 27px one — the crowding a phone actually suffers from is
   *  horizontal, and that is what the three numbers above answer. */
  row: GRID_PX.row,
  gutter: GRID_PX.gutter,
  /** ⚠️ ZERO, AND THAT IS THE POINT. The spine already takes 152 of a 375px
   *  phone; 16px of margin each side would cost a third of a room column to
   *  buy whitespace on the one screen with none to spare. The margin is a
   *  desktop affordance because only desktop has the room for it. */
  pad: 0,
} as const;

/** The viewport at which the narrow numbers stop applying — Tailwind's `sm`,
 *  which is also where both grids switch the weekday back to its full name. */
export const GRID_NARROW_PX_MAX_WIDTH = 640;

/* ── Bytes ──────────────────────────────────────────────────────────────── */

/** "FFRRGGBB", "RRGGBB" or "#rrggbb" → three channels. */
function bytesOf(colour: string): [number, number, number] {
  const hex = colour.replace("#", "").slice(-6);
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function hexOf(r: number, g: number, b: number): string {
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/**
 * `colour` at `alpha` over an OPAQUE `ground`, resolved to an opaque hex.
 *
 * ⚠️ RESOLVED, NOT LEFT AS `rgba()`. A translucent cell in a grid whose rows
 * are `position: sticky` composites against whatever happens to scroll under
 * it, so the same fill changes shade as the page moves. It also cannot be
 * measured, and everything above is measured.
 */
function mixOver(colour: string, ground: string, alpha: number): string {
  const [r, g, b] = bytesOf(colour);
  const [gr, gg, gb] = bytesOf(ground);
  return hexOf(
    r * alpha + gr * (1 - alpha),
    g * alpha + gg * (1 - alpha),
    b * alpha + gb * (1 - alpha),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   🪦 THE DARK RAMP — REMOVED, AND WHAT IT WAS
   ══════════════════════════════════════════════════════════════════════════

   Deleted from this spot: `toLinear`, `fromLinear`, `toOklab`, `fromOklab`,
   `inGamut`, `solve`, `screenDarkFill`, `atLightness`, and the two constants
   `DARK_RAMP_OFFSET = -0.045` / `DARK_RAMP_SLOPE = 0.6`. Together they mapped
   a printed pastel onto a dark page: OKLab lightness through one affine ramp,
   hue untouched by construction (the scale was radial), and the CHROMA scaled
   by exactly the factor the lightness moved by — so the C/L ratio, which is
   what the eye reads as "pastel", was reproduced rather than approached.

   It was good arithmetic answering a question that is no longer being asked.
   Cam looked at what it produced — L 0.374–0.478 at chroma 0.000–0.069 — and
   called it *"really dull and boring"*, which is what a chroma of 0.035 at
   that lightness is. Class cells are the printed byte in every theme now, so
   there is nothing left to ramp.

   ⚠️ AND RETUNING IT WAS NOT THE FIX. The fills he wants are LIGHT; the only
   (slope, offset) that turns a light fill into a light fill is (1, 0), which is
   this file with the ramp taken out. Raising the slope also runs straight into
   the ceiling the ramp was already pressed against — at slope 0.68 the ink on
   the lightest fill fell under WCAG AA.

   ⚠️⚠️ THREE THINGS THE RAMP KNEW. If a per-theme fill is ever wanted again,
   these are not negotiable and each one cost a measured bug:

     1. ⭐ NEVER RENDER THE PALETTE AS `rgba(fill, α)` OVER THE PAGE. Both
        grids did, at α 0.22 and 0.24. At α 0.26 over #17171b the chroma
        collapses from 0.009–0.130 to 0.002–0.037, and because the ground is
        itself faintly blue the HUE of the low-chroma fills swings by up to
        **107°** — a registration group came out a different colour from the
        one it prints in. A translucent cell in a grid whose rows are
        `position: sticky` also composites against whatever happens to scroll
        under it, so the same fill changes shade as the page moves, and it
        cannot be measured at all. Resolve to an opaque hex, or do not do it.
     2. ⭐ THE BAND/SET VARIANT GOES ON THE **OUTPUT** BYTES, NEVER BEFORE A
        RAMP. Ramping a colour that already carried its variant compressed
        eight bytes of separation to under one, and two classes came out one
        colour: 1,467 distinct fills for 2,800 codes on the dark grid, while
        light scored 2,800. `withClassVariant` still enforces this and its
        banner still explains it; that discipline is why removing the ramp was
        a two-line change instead of a rewrite.
     3. ⭐ A LIGHTNESS SOLVE MAY NOT CLIP A CHANNEL. Letting a conversion clamp
        red to zero swings the hue — the same failure as (1), arrived at
        differently. `solve()` bisected the chroma down the radius instead,
        which moves nothing but saturation. Ten of sixty-six fills hit the sRGB
        boundary the one time this was got wrong, and a soft sage green came
        out bottle green with the red channel at zero.

   ⚠️ NOT PART OF THIS, AND VERY MUCH ALIVE: `oklchToLinear`,
   `lightnessForLuminance`, `maxChromaAt` and `luminanceOf` at the bottom of
   the file. They are how a family colour is solved to a target LUMINANCE in
   the first place — the year ladder, and the thing a greyscale printer reads.
   `mixOver` above is alive too: `gridSurfaces` mixes the furniture with it. */

/* ── What the two grids ask for ─────────────────────────────────────────── */

/**
 * ⚠️ THE MEMO, AND WHY THIS FUNCTION NEEDS ONE MORE THAN THE WORKBOOK DOES.
 *
 * `colourForClass` is a gamut bisection inside a lightness bisection. The
 * workbook writer memoises for exactly this reason (`createClassPalette`), and
 * it draws a sheet ONCE — a grid re-renders on every keystroke, every week step
 * and every theme change, with up to 900 cells on it. Uncached, typing one
 * character into the template editor re-solved the palette nine hundred times.
 * (There used to be a second gamut bisection stacked on this one for the dark
 * grid, which is gone with the ramp; the memo is not — the first one is enough
 * to matter at 900 cells a keystroke.)
 *
 * Same code, same answer, and the answer does not depend on what was asked
 * before it — so this is a cache and not state. Bounded, because a calendar
 * full of free-text bookings must not turn it into a leak; past the cap the
 * colour is still right, just recomputed.
 */
const GRID_FILL_MEMO = new Map<string, string | null>();
const GRID_FILL_MEMO_MAX = 2000;

/**
 * ⭐⭐ THE CLASS FILL, FOR A SCREEN — AND IT IS THE PRINTED BYTE, IN EVERY
 * THEME. Opaque, and the same for a given code forever: this is
 * `colourForClass`'s own arithmetic, not a second copy of it.
 *
 * ⚠️ `isDark` NO LONGER CHANGES THE ANSWER. It is kept in the signature
 * because every call site passes it, because both grids read it anyway for the
 * furniture, and because a theme-specific fill — if one is ever wanted again —
 * is decided HERE and nowhere else. See the tombstone above for the ramp that
 * used to be applied on this line, why it was removed rather than retuned, and
 * the three rules that would govern any replacement.
 *
 * `null` means the text names no class — free text, "Booked", a typed "-" —
 * and the cell keeps the plain input surface, exactly as the workbook writer
 * does with the same `null`.
 */
export function gridClassFill(
  label: string | null | undefined,
  isDark: boolean,
): string | null {
  void isDark;
  if (!label) return null;
  /* ⚠️ THE THEME IS NO LONGER PART OF THE KEY, and removing it was not a
     tidy-up. While dark had its own ramp the key HAD to carry the theme, or a
     dark grid would have been handed the paper colour for every code a light
     grid had already asked for. One code now has one fill, so keying on the
     theme would hold two identical entries and halve a bounded cache. If a
     theme-specific fill ever comes back, PUT THE THEME BACK IN THE KEY FIRST. */
  const cached = GRID_FILL_MEMO.get(label);
  if (cached !== undefined) return cached;

  /* ⭐⭐ THE VARIANT GOES ON THE FAMILY COLOUR, AND THAT ORDER IS LOAD-BEARING
     EVEN NOW THAT NOTHING COMPRESSES AFTERWARDS. `classFamilyOf` hands back
     the unshifted (year, subject) solve and the band/set slot separately, so
     distinctness is ARITHMETIC — one base, distinct integer offsets — rather
     than a property of how some later transform happened to round. That is the
     invariant that survived the ramp being deleted, and it is what makes
     "same class = same colour, and no two classes the same one" true by
     construction in whatever space this ends up being drawn in. */
  const parts = classFamilyOf(label);
  const fill = parts ? withClassVariant(parts.family, parts.shiftIndex) : null;
  if (GRID_FILL_MEMO.size < GRID_FILL_MEMO_MAX) GRID_FILL_MEMO.set(label, fill);
  return fill;
}

/** ⭐ THE ONE OVERRIDE COLOUR. Not per class, not per person, not per reason:
 *  one colour for everything that is not the plan — and now ONE COLOUR IN
 *  EVERY THEME, for the same reason the class chips are.
 *
 *  ⚠️⚠️ IT USED TO BE LIFTED TO OKLab L 0.47 ON A DARK GRID, by a constant
 *  `OVERRIDE_DARK_L` that has gone with the ramp. That existed because the
 *  class fills had been taken DOWN to meet the page, and the one cell meaning
 *  "this is not the plan" had to stay above them. The fills are now the printed
 *  pastels at L 0.700–0.869, so L 0.47 put it BELOW every class on the grid —
 *  and, measured in the metric this palette is argued in, it landed nearer the
 *  FURNITURE than a class:
 *
 *                              nearest class   nearest furniture
 *    #2f57a4 (was)  dark        ΔE 0.1139       ΔE 0.1078  ← the day band
 *    #2f57a4 (was)  oled        ΔE 0.1139       ΔE 0.1195
 *    #6e9bee (now)  dark        ΔE 0.0890       ΔE 0.2902
 *    #6e9bee (now)  oled        ΔE 0.0890       ΔE 0.3110
 *    #6e9bee        light       ΔE 0.0890       ΔE 0.1060  ← unchanged, shipped
 *
 *  ⚠️ THE FIRST TWO ROWS READ 0.2643 WHEN THIS CHANGE SHIPPED AND THAT NUMBER
 *  WAS NOT MEASURED. Re-run against the module, `#2f57a4` is ΔE 0.1139 from the
 *  nearest ramped class fill in dark AND in oled — 2.3× nearer than claimed. Say
 *  what the corrected table says and no more: on the DARK grid the old override
 *  was nearer the furniture than any class (0.1078 vs 0.1139) but only by 6%,
 *  and on OLED it was not nearer at all (0.1195 vs 0.1139). The lift was a bad
 *  arrangement; it was not the rout the original row implied.
 *
 *  ⭐ "NEAREST FURNITURE" IS STILL THE NUMBER THAT DECIDES IT, because a
 *  `cleared` override carries NO TEXT — the class moved rooms and the cell is
 *  simply blue. A mark that sits ΔE 0.108 from `bandAlt` and 0.114 from a class
 *  is a mark with no margin in either direction: it could be read as a piece of
 *  the day band that had wandered into the room columns, and that is the
 *  opposite of what the cell means. The printed blue does not split the
 *  difference — it reproduces in dark exactly the arrangement light has always
 *  shipped, and takes the clearance from the furniture to 2.7× what the lift
 *  had. Against a field of pastels it is still the one saturated cell
 *  (C 0.132, where the chips run 0.009–0.130).
 *
 *  ⚠️ AND ΔE 0.0890 IS NOT A NEW RISK. It is the light-mode separation this
 *  file has always called sufficient — thirty-four times the palette's own
 *  closest pair (0.0026) — and colour is not the only channel: the grid that
 *  draws overrides draws them BOLD, dotted-underlined and with a 3px edge,
 *  which is why an ordinary class fill gets no edge at all.
 *
 *    `t.text` on it        6.20 : 1 light (#1b1b1f); 7.59 : 1 dark and OLED
 *                          (#000000, chosen by `gridInkOn`'s own fallback —
 *                          the override is a chip like any other now)
 *    against the empty     2.77 : 1 light, 6.46 : 1 dark, 7.15 : 1 oled
 *
 *  ⚠️ SOLVED ONCE, AT MODULE LOAD, and handed back as the SAME OBJECT every
 *  call. A grid asks per cell, so returning a fresh literal would allocate one
 *  per cell per render and put a new identity into every dependency list that
 *  ever holds it. */
const OVERRIDE_RENDERED = {
  fill: `#${OVERRIDE_BASE.slice(-6).toLowerCase()}`,
  edge: OVERRIDE_EDGE,
} as const;

/** ⚠️ `isDark` IS ACCEPTED AND IGNORED, exactly as `gridClassFill` ignores it,
 *  and for the same reason: the override cell belongs to the paper document the
 *  chips belong to. Kept in the signature because `PublishedTimetable` — the one
 *  caller, twice per cell, for the fill and again for the edge — already holds
 *  `isDark` for the furniture, and because this is where a theme-specific
 *  override would be decided. */
export function gridOverrideFill(isDark: boolean): { fill: string; edge: string } {
  void isDark;
  return OVERRIDE_RENDERED;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE INK ON A FILLED CELL — CHOSEN BY MEASUREMENT, NOT BY POLICY
   ══════════════════════════════════════════════════════════════════════════

   ⚠️ "THE THEME'S OWN INK ON EVERY FILL" IS SAFE IN NO THEME, and the reason
   is the year ladder. `CLASS_YEAR_LUMINANCE` runs from 0.655 (year 7) down to
   0.220 (year 13), and EVERY theme now draws the PRINT fill byte for byte —
   so in light mode a year 13 cell is a mid-dark colour with `t.text` #1b1b1f
   on it:

     year  7  11.35 : 1        year 11   6.67 : 1
     year  8  10.20 : 1        year 12   5.48 : 1
     year  9   9.02 : 1        year 13   4.32 : 1   ← 502 of its 504 codes
     year 10   7.82 : 1                              fail WCAG AA outright

   The school whose file this was built from teaches years 7–11 and never sees
   it. A sixth form does, on every one of its lessons, and so does year 6 of an
   all-through school — the rung index is `(year - 7) mod 7`, so years 1–6 land
   on rungs 1–6 and year 6 IS the year 13 rung.

   ⭐⭐ AND IN DARK AND OLED IT NOW FAILS ON **EVERY** CHIP, WHICH IS THE
   FEATURE AND NOT A REGRESSION. `t.text` there is #f2f2f4 and the chips are
   pastels at L 0.700–0.869; near-white on near-white is 1.30 : 1 at the top of
   the ladder and 2.22 : 1 at the bottom. So the fallback below fires on all
   68 of Cam's codes and on all 6,552 of the synthetic sweep, and what it falls
   back TO is `#000000` — which is exactly what `timetableWorkbook.ts` writes
   on a cell carrying a class fill (`STRUCTURE_INK`). ⭐ The dark grid does not
   invent an ink for the paper chips; it prints the one the paper uses.

   ⚠️ THIS BANNER USED TO SAY THE SWAP FIRED "on NONE in dark or OLED" and that
   "the fallback in dark is `#ffffff`". Both were true of the ramped fills and
   both are now false; the class fills moved and the ink moved with them. It is
   the same three lines of code — nothing here was rewritten to make the flip
   happen, which is the point of choosing an ink by measurement rather than by
   naming one per theme.

   ⚠️ THE THRESHOLD IS 5.0 AND NOT 4.5, and the half-point is spent on the
   crosshair. Both grids wash the focused row and column with `--accent-soft`,
   13% of the user's accent over whatever the cell already is, which costs up
   to half a ratio point. Measured over Cam's 68 codes and over 6,552
   (years 1–13 × 14 subjects × 9 bands × 4 sets), across all eight
   `ACCENT_PRESETS`:

                          worst   washed    swap fires on
     his 68, light        6.69    5.85      0 / 68
     his 68, dark/oled    8.18    7.15      68 / 68   (was 5.91 / 5.13)
     6,552,  light        5.29    4.82      1,008 / 6,552
     6,552,  dark/oled    5.29    4.82      6,552 / 6,552  (was 5.82 / 5.05)

   ⭐ THE TWO THEMES NOW SHARE A WORST CASE BECAUSE THEY SHARE A FILL AND AN
   INK. On his own file the dark grid gained 2.3 points of contrast; over the
   synthetic sweep it gave back 0.5, landing on light's long-standing 5.29 /
   4.82 rather than on a number of its own. Both clear WCAG's 4.5; the 4.82 is
   the tightest thing in this file and it belongs to years 12–13, which is
   whose ladder rung it is.

   ⚠️ SO WHAT A CHANGE HERE REALLY COSTS IS THAT 4.82. `CLASS_YEAR_LUMINANCE`
   is the constant that governs it — not the ink rule, which is already picking
   the better of black and white. Re-run the sweep if a rung moves. */

/** WCAG relative luminance of an opaque colour. */
function relativeLuminance(colour: string): number {
  const [r, g, b] = bytesOf(colour).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG AA for body text, plus the half-point the crosshair wash costs. */
const GRID_INK_MIN_RATIO = 5;

/** Memoised for the reason `GRID_FILL_MEMO` is: a grid asks once per cell, up
 *  to nine hundred times, on every keystroke and every theme change. */
const GRID_INK_MEMO = new Map<string, string>();
const GRID_INK_MEMO_MAX = 2000;

/**
 * ⭐ THE INK FOR A CELL CARRYING `fill`. The theme's own text colour wherever
 * it can be read on that fill, and otherwise the better of black and white —
 * which, on a class chip, is black in EVERY theme: the chips are the printed
 * pastels, and black is the ink the exported workbook prints on the very same
 * colour. See the banner above for how often that fallback fires and why the
 * count moved from "never in dark" to "always in dark".
 *
 * `fill` of `null` means the cell is on the plain input surface, which is the
 * theme's own paper, so the theme's own ink is right by construction.
 */
export function gridInkOn(
  fill: string | null | undefined,
  themeText: string,
): string {
  if (!fill) return themeText;
  const key = `${themeText} ${fill}`;
  const cached = GRID_INK_MEMO.get(key);
  if (cached !== undefined) return cached;

  const ink =
    contrastRatio(themeText, fill) >= GRID_INK_MIN_RATIO
      ? themeText
      : contrastRatio("#000000", fill) >= contrastRatio("#ffffff", fill)
        ? "#000000"
        : "#ffffff";
  if (GRID_INK_MEMO.size < GRID_INK_MEMO_MAX) GRID_INK_MEMO.set(key, ink);
  return ink;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ HOW FAR A LABEL ON THE FURNITURE MAY BE DIMMED
   ══════════════════════════════════════════════════════════════════════════

   Both grids dim a label rather than greying it, because CSS `opacity` on the
   TEXT keeps the band behind it at full strength while `t.textMuted` on the
   band does not clear AA at all (#6f6f79 on #B1A0C7 is 2.06 : 1). But an
   opacity IS a contrast reduction, and these were picked by eye at 0.55, 0.70
   and 0.75, which on the STRONGER band in LIGHT mode measures:

     0.55  →  2.85 : 1     0.70  →  3.97 : 1     0.75  →  4.43 : 1

   all three under AA, on the date under every weekday, the label of every
   break row and the clock under every period. Two values, measured against the
   worst case there is — `bandAlt` #B1A0C7 in light mode, which is the darker
   of the two tints on the lightest page:

     0.80  →  4.91 : 1  on bandAlt,  6.26 : 1  on band
     0.70  →  3.97 : 1  on bandAlt,  4.77 : 1  on band

   so `label` is for anything that can land on either band, and `retired` — a
   deliberately fainter "this room is out of service" — is only ever drawn on
   the header block, which is always the lighter `band`. */
export const GRID_DIM = {
  /** A date, a break's name, a period's clock, a field's label. */
  label: 0.8,
  /** A room that is out of service, in the header block only. */
  retired: 0.7,
} as const;

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE LINE-WORK — WHAT THE SCREEN GRID RULES, AND WHAT IT DOES NOT
   ══════════════════════════════════════════════════════════════════════════

   Cam: *"it should still look similar to the spreadsheet but a more polished
   web like design with less grid lines maybe"*.

   ⚠️ NOTHING IN THIS SECTION IS IN THE WORKBOOK. Excel has no way to separate
   two cells except a rule, so it draws a faint one round every cell in the
   sheet and `SHEET_GRIDLINE` prints exactly that. A web grid has fills,
   spacing and alignment as well — and this grid's fills go EDGE TO EDGE, so
   most of the lattice was drawing a boundary the colour had already drawn.
   These constants govern the SCREEN only; `SHEET_GRIDLINE` and the workbook
   writer are untouched by any of it.

   ── ⭐ THE POLICY, IN ONE SENTENCE ───────────────────────────────────────
   **ONE AXIS OF RULES, AND IT IS THE COLUMNS; the only horizontal lines left
   in the INPUT AREA of a day block are the top and bottom edges of a break bar
   and the boundary between two EMPTY cells.**

   ⚠️ "INPUT AREA" IS LOAD-BEARING IN THAT SENTENCE AND NOT A HEDGE. The SPINE
   keeps its hairline between every period, in every row of every block — it is
   in the table below, it is `borderBottom` on the period cell in both grids,
   and it is deliberate: the spine is what names a row, so it is the one place
   the row rhythm still has to be countable. A reader who takes the headline to
   cover the whole width will read that rule as drift and delete it.

     room ↔ room, on a row that holds per-room content    RULED (hairline)
     room ↔ room, inside a break / closed / no-timetable bar   not ruled
     period ↔ period, between two cells that have a fill       not ruled
     period ↔ period, between two EMPTY cells             RULED (hairline)
     period ↔ a break bar, either direction               RULED (the bar's edge)
     period ↔ period, in the date/period spine            RULED (hairline)
     the spine ↔ the first room column                    RULED (strong)
     day ↔ day, and the header block ↔ the grid           the GUTTER, no rule
     the last room column's outer edge                    not ruled

   ── ⭐ THE ONE HORIZONTAL RULE LEFT BETWEEN TWO LESSONS IS BETWEEN TWO THAT
      AREN'T ─────────────────────────────────────────────────────────────
   **A rule is drawn where the cell has neither a fill nor a label to say where
   it begins.** Two stacked chips of near-identical colour still put two centred
   labels 32px apart and the reader can count them; two stacked EMPTY cells put
   nothing at all, and a room free for three periods becomes one white block of
   indeterminate height. It is also the whole of the TEMPLATE EDITOR before
   anybody has typed in it — 360 blank cells, which is the state the editor is
   first met in — so this is what stops "fewer rules" from emptying that screen
   out. The line-work fades as the timetable fills, and comes back exactly where
   the fills stop carrying it.

   ── ⚠️ WHY THE COLUMNS AND NOT THE ROWS, WHICH IS THE ONE ASYMMETRY ──────
   Both axes are read. The difference is what a reader loses and how far away
   the label is:

     · the thing that names a ROW — the period — is one or two columns to the
       left, is `position: sticky`, and keeps its own hairline between every
       row. A row is never more than eight rows from a full-width gutter.
     · the thing that names a COLUMN — the room code — is in the header block,
       up to forty-five rows above, and a week is 1,700px tall. Lose the column
       and the scan is over.

   ⚠️ AND IT IS NOT SAFE TO LEAN ON THE FILLS FOR THIS, WHICH IS THE MEASURED
   PART. Two DISTINCT class chips are not guaranteed to differ: over Cam's own
   59 fills the 1,711 pairs run **1.00 – 1.74 : 1 and 52% of them are under
   1.24**, which is the weakest rule this design ships (see `GRID_RULE_ALPHA`).
   So "adjacent lessons separate themselves" is false about half the time, in
   BOTH directions — the columns are kept because they are needed, not because
   the rows were measured differently.

   ── ⚠️ AND WHY THE BREAK BAR KEEPS ITS TWO EDGES ────────────────────────
   A bar is painted in the day's own band, straight across the room columns,
   exactly as the workbook does it. Against the chips that sit above and below
   it that band measures:

                  chip ↔ band        chip ↔ bandAlt
       light      1.03 – 2.29         1.03 – 1.65     ← needs the edge
       dark       3.07 – 8.32         2.20 – 5.95
       oled       3.47 – 9.39         2.41 – 6.53

   1.03 : 1 in light is a break row bleeding into the lesson above it, so the
   edges stay — in every theme, because one grid with two structures is worse
   than one extra hairline. What the bar LOSES is its internal verticals: it
   holds nothing per room, so it has no rooms to separate, and it now reads as
   one band the way the gutter between two days already does. */

/**
 * How far the ink is let down toward the fill for a rule. The one alpha, so a
 * rule is drawn the same weight wherever it survives.
 *
 * ⚠️ MEASURED AGAINST ITS OWN SUBSTRATE, which is why it is one number and not
 * a token: the rule is `gridInkOn(thatCell'sFill)` at this alpha, so it is
 * chosen against the cell it is drawn on. Over the whole year ladder plus the
 * three furniture surfaces, the override blue and the empty cell:
 *
 *     light 1.24 – 1.33     dark 1.28 – 1.52     oled 1.28 – 1.51
 *
 * ⭐ **1.24 : 1 IS THEREFORE THE WEAKEST BOUNDARY THIS DESIGN SHIPS**, and it
 * is the number the policy banner above compares the class palette against.
 */
export const GRID_RULE_ALPHA = "14%";

/**
 * ⭐ THE ONE STRONG LINE — the spine against the first room column.
 *
 * With the lattice gone this is the only rule in the grid that says something
 * structural rather than dimensional: everything left of it is furniture and
 * everything right of it is the timetable. It used to be `t.border`, which is
 * `rgba(255,255,255,0.07)` in dark and `rgba(23,23,23,0.075)` in light — the
 * same token this file already records as "no edge at all" on 240 empty cells.
 * It is now the same construction as every other rule (`gridInkOn` of the fill
 * it is drawn on, so it is chosen against the day band it sits in) at a higher
 * alpha. Measured over the whole year ladder, the three furniture surfaces,
 * the override blue and the empty cell:
 *
 *     light 1.62 – 1.92     dark 1.75 – 2.56     oled 1.75 – 2.57
 *
 * against `t.border`'s 1.02 – 1.24 in dark, which is what a reader was
 * supposed to be finding the spine by.
 */
export const GRID_SEAM_ALPHA = "30%";

/**
 * ⭐⭐ THREE KINDS OF THING, DRAWN THREE WAYS.
 *
 * Cam's grid holds room codes, period names and class codes, and they were all
 * 11px and all either 400 or 600 — so the furniture read as loudly as the
 * timetable. With the lattice gone, type and alignment carry what a border was
 * carrying, and the hierarchy has to be real:
 *
 *   `cell`   the CLASS CODE. The data, and now the largest and heaviest thing
 *            in the grid. `tabular-nums` so "10D/Bs" and "9F/It" line up.
 *   `room`   the room code in the header block. A LABEL for a column: smaller
 *            than the data it heads, and tracked out so a five-character code
 *            reads as a code rather than as a short word.
 *   `period` the period name in the spine. A label for a row, and quieter than
 *            the data — it was 500 on a break row too.
 *   `day`    the weekday at the head of a block. The block's title.
 *   `meta`   a date, a clock, a field value. Always under `GRID_DIM.label`.
 *
 * ⚠️ SIZES ONLY GO DOWN ON THE FURNITURE. The spine is 88px wide on a phone
 * and "After School" has to fit it — `GRID_NARROW_PX` measured that at 11.5px,
 * so 11 is slack and never tight. The one INCREASE is `cell`, and only in
 * `TemplateGrid`, which drew its cells at 11px while the published board has
 * always drawn them at 11.5 — the two grids agreeing on the number they should
 * always have agreed on.
 */
export const GRID_TYPE = {
  /** A class code in a cell. */
  cell: { fontSize: 11.5, fontWeight: 500 },
  /** A room code in the header block. */
  room: { fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em" },
  /** A period name in the spine — 500 when it is taught, 400 when it is not. */
  period: { fontSize: 11, taught: 500, untaught: 400 },
  /** The weekday at the head of a day block. */
  day: { fontSize: 11.5, fontWeight: 600 },
  /** A date under a weekday, a clock under a period, a room's field value. */
  meta: { fontSize: 10 },
} as const;

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE TWO STICKY PLANES, AND THE ONLY THING THAT SAYS THEY ARE STICKY
   ══════════════════════════════════════════════════════════════════════════

   The date/period spine and the header block both stay put while the grid
   moves under them, and neither had any elevation — so on a wide sheet the
   room columns slid UNDER the spine with nothing to say it was happening, and
   the seam read as an ordinary rule that content happened to stop at.

   ⚠️ TRUE OF THREE PLANES OUT OF FOUR, AND THE FOURTH IS DRAWN THIS WAY ON
   PURPOSE. Both grids' spines are `position: sticky` horizontally and both
   really do pin. `PublishedTimetable`'s header block is `sticky top-0` inside
   its own `overflow-auto` scrollport and pins too. `TemplateGrid`'s header
   block does NOT and must not — the settings panel owns the vertical scroll,
   so a sticky header there would pin nothing (the note on its `<thead>` spells
   this out). It still casts `header`, because what the cast does at rest is
   seal the block off from the gutter strip below it, which is the job on both
   grids; on one of them that is the whole job. Do not "fix" the asymmetry by
   making that `<thead>` sticky.

   ⚠️ IT IS A PERMANENT SHADOW AND NOT A SCROLL-TRIGGERED ONE. A shadow that
   appears at `scrollLeft > 0` is a scroll listener on both grids, a re-render
   per frame on the densest table in the product, and — on the machine this is
   reviewed on, where `prefers-reduced-motion` is forced ON — a thing that only
   reads correctly while it is moving. These planes ARE above the grid at rest,
   so they are drawn that way at rest.

   ⚠️ IT IS BLACK IN BOTH DIRECTIONS AND THAT IS WEAKEST ON OLED, where the
   page is already #0a0a0c. Measured as a darkening of the paper directly under
   the cast, at full strength: light 1.45 : 1, dark 1.11, oled 1.03.

   ⭐ AND THAT IS THE RIGHT WAY ROUND, WHICH IS THE PART WORTH CHECKING. The
   header block's bottom edge is now the GUTTER at rest and this shadow when the
   grid is scrolled under it — there is no rule there any more — so the question
   is whether a pinned header can bleed into the lessons passing beneath it:

                band ↔ chip      the shadow
       light     1.03 – 2.29        1.45      ← the shadow is the edge
       dark      3.07 – 8.32        1.11      ← the fills are the edge
       oled      3.47 – 9.39        1.03

   The theme where the fills stop separating is exactly the theme where the
   shadow is strongest, and 1.45 clears `GRID_RULE_ALPHA`'s 1.24 — the weakest
   rule this design ships. The spine needs no such argument: its right-hand edge
   is `GRID_SEAM_ALPHA`, a real rule, at 1.62 – 2.57 in every theme.

   ⭐ ONE FROZEN OBJECT PER THEME, so the strings are identical in both grids
   and hold their identity across renders. */
const GRID_ELEVATION = {
  light: {
    spine: "6px 0 6px -6px rgba(23,23,23,0.16)",
    header: "0 6px 6px -6px rgba(23,23,23,0.16)",
    corner:
      "6px 0 6px -6px rgba(23,23,23,0.16), 0 6px 6px -6px rgba(23,23,23,0.16)",
  },
  dark: {
    spine: "6px 0 6px -6px rgba(0,0,0,0.55)",
    header: "0 6px 6px -6px rgba(0,0,0,0.55)",
    corner: "6px 0 6px -6px rgba(0,0,0,0.55), 0 6px 6px -6px rgba(0,0,0,0.55)",
  },
} as const;

/**
 * The elevation the two sticky planes cast.
 *
 * @param isDark the theme, exactly as `gridSurfaces` takes it.
 * @returns `spine` — cast to the RIGHT, off the period column, which is the
 *          rightmost of the two sticky columns; `header` — cast DOWNWARD, off
 *          the last row of the header block; `corner` — both, for the one cell
 *          that is the bottom-right of the header block and the right edge of
 *          the spine at once.
 *
 * ⚠️ ONLY THE OUTERMOST ROW / COLUMN OF EACH PLANE MAY CARRY IT. The date
 * column casting `spine` would cast it onto the period column beside it, and
 * the room-code row casting `header` would cast it onto the field rows under
 * it — a shadow inside the thing it is supposed to lift.
 */
export function gridElevation(isDark: boolean) {
  return isDark ? GRID_ELEVATION.dark : GRID_ELEVATION.light;
}

/** The furniture, resolved against the surface the grid is actually drawn on.
 *  `paper` is the theme's own card colour — the input area, and the ground
 *  every band is mixed over. */
export type GridSurfaces = {
  /** The header block, and day blocks 2 and 4. The workbook's `structure`. */
  readonly band: string;
  /** Day blocks 1, 3 and 5. The workbook's `structureAlt`, and the stronger
   *  of the two in every theme. */
  readonly bandAlt: string;
  /** The strip between two day blocks. Neutral, because it belongs to no day. */
  readonly gutter: string;
};

/* ⚠️ `readonly`, AND IT IS LOAD-BEARING NOW RATHER THAN TIDY. `gridSurfaces`
   memoises and hands the SAME object back to every caller with the same
   (paper, theme, accent) — so one caller writing to a field would repaint
   somebody else's grid. Nothing does; the compiler now keeps it that way. */

/** Light is the printed document's own two tints, written out rather than
 *  re-derived: the ECMA-376 tint transform rounds in integer HLS and a float
 *  reconstruction lands a unit off (#CCC1DA for #CCC0DA), which is invisible
 *  in review and means the screen and the file no longer match. */
const DARK_BAND_ALPHA = 0.34;
const DARK_BAND_ALT_ALPHA = 0.58;
/**
 * White over the surface. The paper document darkens white by 15% for its
 * gutter; a dark theme has to go the other way.
 *
 * ⚠️ AND ONLY FAR ENOUGH TO SIT **BETWEEN THE PAPER AND THE BANDS**, which is
 * where the printed document puts it and is what this number is for. By
 * luminance the source file reads paper > gutter > structure > structureAlt —
 * white 1.000, #D9D9D9 0.700, #CCC0DA 0.564, #B1A0C7 0.393 — so the seam is a
 * step off the page TOWARDS the furniture, never past it.
 *
 * At 0.13 the dark gutter came out #353539 against a band of #3b3149: a
 * contrast of **1.00 : 1**, the same luminance to two decimal places. The strip
 * that separates Monday from Tuesday was invisible for the whole width of the
 * day spine — the one column a reader scans to find a day — and the ordering
 * was inverted, the seam having climbed on top of the furniture it separates.
 *
 * 0.08 restores the order and the separation, measured against every
 * neighbour the strip actually touches:
 *
 *                 vs band   vs bandAlt   vs paper
 *     light        1.23        1.71        1.41     ← the printed document
 *     dark         1.17        1.64        1.25
 *     oled         1.21        1.74        1.19
 *
 * ⚠️ DO NOT "MAKE IT CLEARER" BY RAISING IT. Past ~0.16 the strip climbs back
 * through `band` and then through `bandAlt`, so it collides with one or the
 * other on the way; at 0.30 it clears both and is a light-grey bar across a
 * black page five times a screen, which is louder than the days it separates.
 */
const DARK_GUTTER_ALPHA = 0.08;

/**
 * ⭐⭐ THE FURNITURE STAYS DARK, AND THAT IS WHAT MAKES THE FRAME A FRAME.
 *
 * The class chips are the printed pastels in every theme now (see the banner at
 * the head of the screen-palette section), so on a dark grid the contrast
 * between a chip and the band it sits in runs THE OTHER WAY ROUND from the
 * printed document: on paper the band is the darker of the two by a hair, and
 * here it is darker by a mile. Measured over Cam's 68 codes:
 *
 *            chip vs band   chip vs bandAlt   chip vs gutter   chip vs paper
 *   light     1.03 – 1.48     1.04 – 1.63      1.05 – 1.82      1.48 – 2.57
 *   dark      4.75 – 8.26     3.40 – 5.90      5.57 – 9.68      6.96 – 12.10
 *   oled      5.37 – 9.32     3.73 – 6.48      6.49 – 11.27     7.71 – 13.39
 *
 * ⭐ SO THE STRUCTURE READS HARDER IN DARK THAN ON PAPER, not softer — the
 * obvious worry about a light-chip grid measures as the reverse of itself. The
 * tightest pair anywhere is a chip against `bandAlt` at 3.40 : 1, above the
 * 3 : 1 WCAG asks of a graphical boundary, so the day blocks, the break rows
 * painted across in their own day's tint, and the seams between days all still
 * separate. What the reader loses is that a break row no longer reads as a
 * slightly stronger shade of the same document; it reads as a dark bar. That
 * is the frame, and it is the trade the treatment is named for.
 *
 * ⚠️ DO NOT "BALANCE" THIS BY LIGHTENING THE BANDS. The ratios BETWEEN the
 * three furniture tints are what carry the alternation and they are tuned to
 * the paper document's own — band↔bandAlt 1.39 on paper, 1.40 dark, 1.44 oled.
 * Raising the bands to meet the chips flattens that AND pushes the gutter back
 * through the band, which is the exact bug `DARK_GUTTER_ALPHA` records above.
 *
 * ⚠️⚠️ AND EVERY NUMBER IN THIS TABLE ASSUMES `STRUCTURE_BASE` — WHICH IS NOW
 * ONLY THE DEFAULT. A school may store its own `timetableAccent`, the dark
 * bands are that colour mixed over the page, and moving it moves all three
 * furniture tints while THE CHIPS DO NOT MOVE AT ALL. So the chip↔band column
 * above is a function of the accent, and the 3.40 is the number to defend. It
 * is defended by `darkFrameFor()` below, on the measured ratio and never on
 * the accent's own lightness. Read that banner before touching any constant in
 * this one.
 */
export function gridSurfaces(
  paper: string,
  isDark: boolean,
  /** The org's timetable accent, RESOLVED or absent — see
   *  convex/lib/timetableAccent.ts. Absent is `STRUCTURE_BASE`, so every
   *  caller that has not been given one keeps exactly the surfaces it had. */
  accent?: string | null,
): GridSurfaces {
  const key = `${paper}|${isDark ? 1 : 0}|${accent ?? ""}`;
  const cached = GRID_SURFACE_MEMO.get(key);
  if (cached !== undefined) return cached;

  let surfaces: GridSurfaces;
  if (!isDark) {
    const fills = sheetFills(accent);
    surfaces = {
      band: `#${fills.structure.slice(-6).toLowerCase()}`,
      bandAlt: `#${fills.structureAlt.slice(-6).toLowerCase()}`,
      gutter: `#${fills.gutter.slice(-6).toLowerCase()}`,
    };
  } else {
    const frame = darkFrameFor(accent, paper);
    surfaces = {
      band: mixOver(frame, paper, DARK_BAND_ALPHA),
      bandAlt: mixOver(frame, paper, DARK_BAND_ALT_ALPHA),
      gutter: mixOver("FFFFFF", paper, DARK_GUTTER_ALPHA),
    };
  }
  if (GRID_SURFACE_MEMO.size < GRID_SURFACE_MEMO_MAX) {
    GRID_SURFACE_MEMO.set(key, surfaces);
  }
  return surfaces;
}

/**
 * ⚠️ MEMOISED, AND FOR TWO REASONS THAT ARRIVED TOGETHER WITH THE ACCENT.
 *
 * COST: the default costs 0.5 µs and a custom accent costs **108 µs** — two
 * thirty-step bisections, each step three contrast ratios. `TemplateGrid` calls
 * this once per render and re-renders on every keystroke, so uncached that is a
 * tenth of a millisecond per character to answer a question whose inputs did
 * not change. (Small, and the palette's other two memos exist for exactly this
 * argument at a larger scale; this one is a third of a line.)
 *
 * IDENTITY: the same object every call, which `OVERRIDE_RENDERED` above already
 * argues for — a fresh literal per render is a new identity in every dependency
 * list that ever holds it. Nothing mutates the returned object; both grids read
 * it and pass it to `bandForDay`.
 *
 * Bounded because the key holds an arbitrary hex out of the database. Three
 * papers × two themes × however many accents a session sees is single figures
 * in practice; past the cap the answer is still right, just recomputed.
 */
const GRID_SURFACE_MEMO = new Map<string, GridSurfaces>();
const GRID_SURFACE_MEMO_MAX = 64;

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE DARK FRAME'S ACCENT — CLAMPED ON THREE MEASURED CONTRASTS
   ══════════════════════════════════════════════════════════════════════════

   The banner above states the constraint; this is the answer to it.

   ⭐ THE DECISION, FIRST, BECAUSE IT IS THE PART A REVIEWER NEEDS: AN ACCENT
   THAT CANNOT SATISFY THE FLOORS IS **NOT REFUSED — ITS DARK TINTS ARE MOVED
   UNTIL IT CAN**. Three reasons, in the order they decided it:

     1. ⭐ THE PRINTED DOCUMENT IS PREVIEWED AND THE DARK FRAME IS NOT.
        Customise draws the workbook's own two tints, at size, on white, under
        the caption "How the workbook will look", and the admin is looking at
        it when they choose. A colour that ruins the printed sheet is refused
        by the person, in the loop, with the evidence in front of them. There
        is no preview of the dark grid anywhere in the product — so a rule
        nobody can see is the one that has to be computed. **Clamp what nobody
        can see; leave alone what the admin is looking at.** That asymmetry is
        the whole design: `sheetFills()` above carries NO clamp.
     2. REFUSING WOULD ARRIVE WITHOUT ITS REASON. The one validator a refusal
        could live in is `normaliseTimetableAccent`, which is also what greys
        out Save — so a school's own brand colour would fail with the words
        "Not a hex colour yet" beside a perfectly good hex. A wrong sentence is
        worse than a moved tint.
     3. THE COMPROMISE IS CONFINED TO THE THEME THAT NEEDS IT. Darkening here
        changes nothing about the workbook, the light grid or the preview. The
        accent still chooses the frame's HUE in dark; what it stops choosing is
        the frame's LIGHTNESS, and the chips are why.

   ── ⚠️ WHAT IS MEASURED, AND AGAINST WHAT ───────────────────────────────
   Three ratios, all computed, none approximated by a brightness heuristic:

     A  chip ↔ bandAlt   ≥ what the DEFAULT accent scores in this same theme.
                         The ceiling. `bandAlt` is the lighter tint and the
                         tightest pair anywhere, so this is the WCAG 1.4.11
                         floor with the shipped purple's own margin on top:
                         3.387 : 1 dark, 3.718 : 1 oled. Stated as "no accent
                         may read worse against the chips than the purple this
                         workbook has always printed".
     B  band ↔ bandAlt   ≥ 1.30. The alternation — the ONE thing that separates
                         Monday from Tuesday. Floor, not ceiling: a very dark
                         accent collapses it (a black accent measures
                         **1.03 : 1**, two identical day blocks).
     C  gutter ↔ band    ≥ 1.08, and the gutter is accent-independent (white
                         over the page), so this is the ORDERING rule
                         `DARK_GUTTER_ALPHA` records: paper < gutter < band <
                         bandAlt. Without it, 24 accents in a 4,913-point sweep
                         put the seam AT the day blocks' own luminance —
                         1.001 : 1, the exact bug that constant was written for,
                         arrived at from the other side.

   A pulls the frame DOWN; B and C pull it UP. Both directions are monotone in
   one scalar, so the permitted set is an interval and the answer is a clamp
   into it rather than a search.

   ── ⚠️ THE FLOORS ARE WHERE THEY ARE BECAUSE OF WHERE THEY STOP WORKING ──
   Measured over a 17³ = 4,913-point accent lattice, both dark themes, with A
   held at the default's own score:

     C = 1.06 or 1.08   every accent satisfies all three. Ordering holds.
     C = 1.10           3 accents have an EMPTY window (dark).
     C = 1.15           354 (dark), 2 (oled).
     C = 1.173          3,424 (dark) — 1.173 is what the default itself scores,
                        which is exactly why it cannot be the floor: it makes
                        the shipped purple a CORNER of the window and every
                        hue that reaches it differently infeasible.

   B = 1.30 is the largest round value that leaves all nine Customise presets
   untouched by it — Violet `#7c3aed` scores 1.344 and Slate `#5b6a7d` 1.350 on
   their own, and a preset that has to be corrected is a preset that should not
   have been offered. It sits above the 1.17 the gutter seam ships at and
   defends as visible, and below the 1.389 the printed document itself carries.

   ── ⭐ MEASURED AFTER THE CLAMP, over the same 4,913 accents ─────────────
                             dark            oled
     chip ↔ bandAlt   worst   3.387           3.718     ← A, exactly
     chip ↔ band      worst   4.682           5.328
     band ↔ bandAlt   worst   1.300           1.300     ← B, exactly
     gutter ↔ band    worst   1.080           1.080     ← C, exactly
     empty windows            0               0
     ordering broken          0 / 4,913       0 / 4,913

   ⭐ SO THE ALTERNATION'S WORST CASE OVER EVERY PERMITTED ACCENT IS 1.300 : 1,
   against 1.399 for the shipped purple and 1.389 on paper. Nine of nine
   presets are above 1.34 and are never lifted by B at all.

   ── ⚠️ IF THE WINDOW IS EVER EMPTY, A WINS ──────────────────────────────
   It cannot be, at these three constants, over that lattice — but the code
   must still say what it does, and it takes the ceiling: A is the WCAG one and
   a grid whose chips have stopped separating from the band they sit in is
   worse than a grid whose Mondays and Tuesdays are hard to tell apart. */

/**
 * ⭐ THE DARKEST FILL THE CLASS PALETTE PUTS ON A DEFENDED GRID.
 *
 * The chips do not move, so the whole of test A is ONE luminance — and it is
 * not a guess: `CLASS_YEAR_LUMINANCE` SOLVES each family to a target, so the
 * darkest chip is the lowest rung in play, less what the gamut bisection, the
 * 8-bit rounding and the luminance-neutral band/set variant take off it.
 * Measured through this module over years 7–11 × 14 subject roots × bands
 * ""/A–G/X × sets 0–4 plus the four tutor codes — 3,154 codes, 3,031 distinct
 * fills — the minimum is 0.357756. Rounded DOWN, which is the conservative
 * direction: a darker reference makes the clamp tighter, never looser.
 *
 * ⚠️ YEARS 7–11, WHICH IS THE LADDER THE 68 IN CAM'S FILE OCCUPY, AND NOT
 * 7–13. Rungs 12 and 13 are darker (0.2925 and 0.220), and the SHIPPED DEFAULT
 * already scores 2.24 : 1 against them — under WCAG's 3 : 1, on a grid nobody
 * has changed. That is a pre-existing property of the year ladder (the same
 * one `gridInkOn`'s banner records for a sixth form) and it is not this
 * clamp's to fix: including those rungs here would move the floor below what
 * the default achieves, so EVERY accent including the default would be
 * "corrected", and the workbook's own purple would be the first casualty. The
 * guarantee this makes is a relative one and it is stated as one.
 */
const CHIP_REFERENCE_LUMINANCE = 0.3577;

/** WCAG 1.4.11, the floor under a graphical boundary. It is a floor under test
 *  A and never the value of it, because the default scores well above it — but
 *  if the year ladder is ever moved far enough that it does not, this is what
 *  the accents get held to instead of following it down. */
const GRAPHICAL_MIN_RATIO = 3;

/** Test B. The alternation between two adjacent day blocks. */
const BAND_ALTERNATION_MIN_RATIO = 1.3;

/** Test C. The seam against the day block beside it — the ordering rule. */
const GUTTER_BAND_MIN_RATIO = 1.08;

/** Fixed, for the reason every other search in this file is fixed: a
 *  tolerance loop lets a runtime whose `Math.pow` rounds a shade differently
 *  take one more step and land on a different byte. 30 halvings of a range of
 *  2 is 2e-9, far under one 8-bit level. */
const FRAME_SOLVE_STEPS = 30;

/**
 * The frame colour at position `u` on the line BLACK → accent → WHITE.
 * `u = 1` is the accent itself, `u < 1` scales it towards black, `u > 1` mixes
 * it towards white. Monotone in luminance across the whole range, which is
 * what lets the three tests be clamped rather than searched.
 *
 * ⚠️ DOWN THE LINE IS A SCALE AND UP IT IS A MIX, and that asymmetry is not an
 * oversight. Scaling preserves the accent's chromaticity exactly — which is
 * what `mixOver` is already doing with a near-black page — so the common case,
 * an accent too light for the chips, keeps its hue to the byte. Going the
 * other way there is nothing to preserve: an accent dark enough to fail test B
 * has almost no chroma left at that level, and its PRINTED tints are already
 * washed towards white by the same amount (a black accent prints `#666666`).
 * A grey dark frame for a black accent is faithful, not a compromise.
 */
function frameAt(accent: string, u: number): string {
  const [r, g, b] = bytesOf(accent);
  if (u <= 1) return hexOf(r * u, g * u, b * u);
  const k = u - 1;
  return hexOf(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
}

/**
 * ⭐ THE ACCENT THE DARK BANDS ARE ACTUALLY MIXED FROM. See the banner above.
 *
 * ⚠️ THE DEFAULT RETURNS `STRUCTURE_BASE` UNTOUCHED, and it must: the general
 * path below lands on the same three bytes (it is checked — `u = 1` is inside
 * the window by construction, since test A's floor IS the default's own
 * score), but "the shipped grid does not move" should not rest on a bisection
 * agreeing with itself. It also takes the path every school that never opens
 * Customise takes from 108 microseconds to under 1.
 */
function darkFrameFor(accent: string | null | undefined, paper: string): string {
  const resolved = resolveTimetableAccent(accent);
  if (resolved === DEFAULT_TIMETABLE_ACCENT) return STRUCTURE_BASE;

  const gutter = mixOver("FFFFFF", paper, DARK_GUTTER_ALPHA);
  const gutterLum = relativeLuminance(gutter);
  /* Test A's floor, in THIS theme: what the shipped purple scores here. The
     two dark themes have different papers and therefore different answers
     (3.387 and 3.718), and each is held to its own. */
  const chipFloor = Math.max(
    GRAPHICAL_MIN_RATIO,
    chipRatioAgainst(mixOver(STRUCTURE_BASE, paper, DARK_BAND_ALT_ALPHA)),
  );

  const at = (u: number) => {
    const frame = frameAt(resolved, u);
    const band = mixOver(frame, paper, DARK_BAND_ALPHA);
    const bandAlt = mixOver(frame, paper, DARK_BAND_ALT_ALPHA);
    return {
      frame,
      /* A — decreasing in u. */
      chip: chipRatioAgainst(bandAlt),
      /* B — non-decreasing in u. */
      alternation: contrastRatio(band, bandAlt),
      /* C — non-decreasing in u, and ZERO below the gutter rather than the
         ratio, so "the band is on the wrong side of the seam" fails the test
         instead of passing it from underneath. */
      seam: relativeLuminance(band) > gutterLum ? contrastRatio(gutter, band) : 0,
    };
  };

  /* The ceiling: the largest u that still clears A. */
  let upper = 2;
  if (at(2).chip < chipFloor) {
    let lo = 0;
    let hi = 2;
    for (let i = 0; i < FRAME_SOLVE_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid).chip >= chipFloor) lo = mid;
      else hi = mid;
    }
    upper = lo;
  }

  /* The floor: the smallest u that clears B and C together. */
  const clearsLow = (u: number) => {
    const m = at(u);
    return (
      m.alternation >= BAND_ALTERNATION_MIN_RATIO &&
      m.seam >= GUTTER_BAND_MIN_RATIO
    );
  };
  let lower = 0;
  if (!clearsLow(0)) {
    let lo = 0;
    let hi = 2;
    for (let i = 0; i < FRAME_SOLVE_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (clearsLow(mid)) hi = mid;
      else lo = mid;
    }
    lower = hi;
  }

  /* An empty window cannot happen at these constants over the lattice this was
     swept on; when it does, A wins. See the banner. */
  if (lower > upper) return at(upper).frame;
  return at(Math.min(Math.max(1, lower), upper)).frame;
}

/** Test A, as one number: the darkest chip against a furniture fill. */
function chipRatioAgainst(fill: string): number {
  return (
    (CHIP_REFERENCE_LUMINANCE + 0.05) / (relativeLuminance(fill) + 0.05)
  );
}

/**
 * ⭐ WHICH OF THE TWO TINTS A DAY BLOCK IS PAINTED IN — and it is the block's
 * POSITION in the week, never the weekday number.
 *
 * ⚠️ A week that does not start on Monday, or that has a day missing to a
 * closure, still has to alternate. Keying on `weekday % 2` made the first
 * block of such a week the same tint as the header above it, and made two
 * ADJACENT blocks share a tint whenever a day was skipped — which is the one
 * job the alternation has.
 */
export function bandForDay(surfaces: GridSurfaces, blockIndex: number): string {
  return blockIndex % 2 === 0 ? surfaces.bandAlt : surfaces.band;
}

/**
 * The legend's order. Deterministic and independent of the order the sheets
 * happened to mention the codes in — otherwise one workbook exported twice
 * would list them differently and look as though it had changed.
 */
export function compareClassCodes(a: string, b: string): number {
  const first = parseClassCode(a);
  const second = parseClassCode(b);
  const rank = (code: ClassCode) =>
    code.kind === "lesson" ? 0 : code.kind === "tutor" ? 1 : 2;
  if (rank(first) !== rank(second)) return rank(first) - rank(second);
  if (first.kind === "lesson" && second.kind === "lesson") {
    if (first.year !== second.year) return first.year - second.year;
    if (first.subject !== second.subject) {
      return first.subject.localeCompare(second.subject);
    }
    if (first.band !== second.band) return first.band.localeCompare(second.band);
    if (first.set !== second.set) return first.set - second.set;
  } else if (
    first.kind === "tutor" &&
    second.kind === "tutor" &&
    first.year !== second.year
  ) {
    return first.year - second.year;
  }
  return a.localeCompare(b);
}

/** What the legend says about a code, in words, beside its swatch. */
export function describeClassCode(raw: string): string {
  const parsed = parseClassCode(raw);
  if (parsed.kind === "lesson") {
    const band = parsed.band ? `, band ${parsed.band}` : "";
    const set = parsed.set ? `, set ${parsed.set}` : "";
    return `Year ${parsed.year}, subject ${parsed.subject}${band}${set}`;
  }
  if (parsed.kind === "tutor") {
    return `Year ${parsed.year} tutor group ${parsed.initials}`;
  }
  return raw;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE COLOUR MATHS — private, and the only place a channel is computed
   ══════════════════════════════════════════════════════════════════════════

   OKLab (Björn Ottosson, 2020) rather than HSL, because HSL's "lightness" is
   not lightness: #FFFF00 and #0000FF are both L=50% and nothing about them
   matches. The year ladder is only worth having if it survives a change of
   hue, and in HSL it does not. */

const letterIndex = (code: number) => Math.min(25, Math.max(0, code - 97));
const frac = (value: number) => value - Math.floor(value);
const wrapHue = (deg: number) => ((deg % 360) + 360) % 360;

function luminanceForYear(year: number): number {
  const rungs = CLASS_YEAR_LUMINANCE.length;
  return CLASS_YEAR_LUMINANCE[(((year - 7) % rungs) + rungs) % rungs];
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/**
 * OKLCH → LINEAR sRGB, unrounded, plus whether it landed inside the gamut.
 *
 * ⚠️ IT RETURNS LINEAR AND NOT 8-BIT ON PURPOSE, and this was a real bug
 * before it did. The searches below compare luminances, and 8-bit rounding
 * quantises luminance in steps of about 0.005 — the same size as the tolerance
 * they were testing. That made the predicate non-monotonic NOISE, so the
 * bisection landed wherever the rounding happened to fall: `7A/Cp1` came out a
 * yellow-green and `7A/Cp4`, two degrees of hue away, came out grey. Rounding
 * happens once, at the very end, in `solveFill`.
 */
function oklchToLinear(
  lightness: number,
  chroma: number,
  hueDeg: number,
): { linear: [number, number, number]; inGamut: boolean } {
  const radians = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const linear: [number, number, number] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return {
    linear,
    inGamut: linear.every((value) => value >= 0 && value <= 1),
  };
}

/** What a greyscale printer, and WCAG, see. Rec. 709 on linear light. */
function luminanceOf(linear: [number, number, number]): number {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/* ⚠️ FIXED ITERATION COUNTS, NOT TOLERANCE LOOPS. A `while (err > eps)` would
   let a runtime whose `Math.pow` rounds a shade differently take one more step
   and land on a different byte; a fixed bisection cannot. Same code, same
   colour, on every machine that ever writes this workbook. */
const LIGHTNESS_STEPS = 22;
const GAMUT_STEPS = 18;
/** Nothing in sRGB is more chromatic than this in OKLab terms. */
const MAX_OKLAB_CHROMA = 0.4;

/** The OKLab lightness at which this hue and chroma render at that luminance.
 *  Luminance rises monotonically with lightness, so a bisection is exact. */
function lightnessForLuminance(
  target: number,
  chroma: number,
  hue: number,
): number {
  let low = 0;
  let high = 1.2;
  for (let i = 0; i < LIGHTNESS_STEPS; i++) {
    const mid = (low + high) / 2;
    if (luminanceOf(oklchToLinear(mid, chroma, hue).linear) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** The most chroma that still renders inside sRGB at that target luminance.
 *  In gamut is monotone in chroma along a constant-luminance, constant-hue
 *  line — the cross-section is convex — so this bisection is exact too. */
function maxChromaAt(target: number, hue: number): number {
  let low = 0;
  let high = MAX_OKLAB_CHROMA;
  for (let i = 0; i < GAMUT_STEPS; i++) {
    const chroma = (low + high) / 2;
    const lightness = lightnessForLuminance(target, chroma, hue);
    if (oklchToLinear(lightness, chroma, hue).inGamut) low = chroma;
    else high = chroma;
  }
  return low;
}

/**
 * ⭐ THE FAMILY COLOUR — the (year, subject root) solve ON ITS OWN, with NO
 * band/set variant on it, as `#rrggbb`.
 *
 * ⚠️ THE SPLIT FROM `withClassVariant` BELOW IS THE WHOLE STRUCTURE OF THIS
 * PALETTE, and it was one function until a measured bug forced it apart. See
 * the banner over `withClassVariant`: the variant has to be added to the bytes
 * that are ACTUALLY WRITTEN, and there was a time when the printed sheet and
 * the dark grid wrote different ones. They no longer do — but keeping the
 * unshifted family recoverable is free, and it is what let that transform be
 * removed without touching a single printed byte.
 */
function solveFamilyFill(
  target: number,
  hue: number,
  chromaFraction: number,
): string {
  const chroma = maxChromaAt(target, hue) * Math.min(1, Math.max(0, chromaFraction));
  const { linear } = oklchToLinear(
    lightnessForLuminance(target, chroma, hue),
    chroma,
    hue,
  );
  return hexOf(
    ...(linear.map((value) =>
      Math.round(Math.min(1, Math.max(0, linearToSrgb(value))) * 255),
    ) as [number, number, number]),
  );
}

/**
 * ⭐⭐ THE BAND/SET VARIANT, ADDED TO RENDERED BYTES — IN WHICHEVER SPACE
 * THOSE BYTES ARE THE OUTPUT. There is one such space today; there were two,
 * and the rule is written for the case where there are two again.
 *
 * ⚠️⚠️ THIS IS THE FIX FOR A MEASURED BUG AND THE PLACEMENT IS THE FIX. The
 * variant used to be applied ONCE, to the PRINT bytes, and the dark grid was
 * then made by ramping that already-shifted colour through an affine OKLab
 * ramp — which compressed lightness by 0.6 and took chroma down with it. An
 * eight-byte separation between `11D/Bs` and `11E/Bs` came out of that ramp
 * under one byte and rounded back together, so on the theme Cam actually uses:
 *
 *     light      68 / 68 distinct     ← the printout, correct
 *     dark/OLED  65 / 68              ← 11D/Bs = 11E/Bs, 11D/Cs = 11E/Cs,
 *                                       8A/Cp1 = 8A/Cp2
 *
 * and over the synthetic 2,800 it was **1,467 / 2,800** — half the palette. It
 * looked like a near miss and was not: "same class, same colour" carries the
 * converse, and a rendered colour shared by two codes breaks it.
 *
 * ⚠️ AND THE OLD 68/68 IN LIGHT WAS NOT LUCK BUT THE DARK ONE WOULD HAVE BEEN.
 * Sweeping the chroma-ride exponent over 0 / 0.25 / 0.4 / 0.5 / 0.6 / 0.75 / 1
 * gives 67 / 68 / 65 / 65 / 68 / 64 / 65 distinct in dark. The shipped
 * constants scored 68 on that sweep and 65 on this workbook — i.e. the number
 * moved with the data, which is the signature of an accident. DO NOT REPAIR
 * THIS BY HUNTING A LUCKIER CONSTANT; the constant is not what makes it true.
 *
 * With the variant applied here instead, distinctness is ARITHMETIC: two codes
 * of one family are the SAME base bytes plus two DIFFERENT table entries, and
 * distinct integers added to one integer cannot be equal. It holds in every
 * theme, for every ramp, and it held when the ramp was deleted outright —
 * which is the strongest evidence available that it is the right shape.
 *
 * ⚠️ THE BASE IS PULLED INSIDE [radius, 255-radius] BEFORE THE OFFSET so that
 * addition never has to clamp. A clamp is exactly what would break the
 * guarantee: at 255 a `+8` and a `+4` are the same byte, and two classes would
 * quietly share a colour again at the light end of the ladder. Measured, the
 * solved channels run 97–231 on Cam's 68 codes and 75–243 over years 1–13, so
 * the guard does not fire today; it is here so that changing the ladder, the
 * chroma fractions, or adding a transform after the solve, cannot make it fire
 * silently.
 */
function withClassVariant(colour: string, shiftIndex: number): string {
  const shift =
    CLASS_SHIFT_TABLE[
      ((shiftIndex % CLASS_SHIFT_TABLE.length) + CLASS_SHIFT_TABLE.length) %
        CLASS_SHIFT_TABLE.length
    ];
  const [r, g, b] = bytesOf(colour).map((byte, i) => {
    const guarded = Math.min(
      255 - CLASS_SHIFT_RADIUS,
      Math.max(CLASS_SHIFT_RADIUS, byte),
    );
    return guarded + shift[i];
  }) as [number, number, number];
  return hexOf(r, g, b);
}

/** `#rrggbb` → the `FFRRGGBB` literal exceljs wants. */
function argbOf(colour: string): string {
  return `FF${colour.slice(-6).toUpperCase()}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   GEOMETRY — measured, then generalised in the two places it had to be
   ══════════════════════════════════════════════════════════════════════════ */

/** A = the left spine. Empty, grey, merged the height of the sheet. */
export const COL_SPINE_LEFT = 1;
/** B = the date, merged down each day block. */
export const COL_DATE = 2;
/** C = the period label. */
export const COL_PERIOD = 3;
/** D = the first room. Rooms run rightwards; the right spine follows them. */
export const COL_FIRST_ROOM = 4;

export const WIDTH_SPINE = 32.7109375;
export const WIDTH_DATE = 30.7109375;
export const WIDTH_PERIOD = 18;
export const WIDTH_ROOM = 18;
/** The half-term sheet is transposed and uses one width for all ten days. */
export const WIDTH_HALF_TERM_DAY = 19.85546875;
export const ROW_HEIGHT = 21;

/** Mon–Fri. The source has no weekend column and neither does the engine. */
export const DAYS_PER_WEEK = 5;

/**
 * The source's day block is nine rows because that school runs nine periods.
 * ⚠️ OURS IS THE PERIOD COUNT FROM THE CALENDAR — see `MAX_PERIODS_PER_CALENDAR`
 * and `periodsForWeekday()`. A Friday that finishes early is genuinely a
 * shorter block, and hardcoding nine would draw two empty rows on it.
 */

/** The half-term sheet's blocks carry no periods, so they keep the source's
 *  fixed height — the geometry is borrowed from a week sheet, not meant. */
export const HALF_TERM_BLOCK_ROWS = 9;
/** B..K on the half-term sheet: two weeks of five weekdays, always. */
export const HALF_TERM_WEEKS_PER_BLOCK = 2;
export const HALF_TERM_COLS = 1 + HALF_TERM_WEEKS_PER_BLOCK * DAYS_PER_WEEK + 1;

/**
 * How many rooms one workbook will draw. The source has eight.
 *
 * This is a WIDTH bound, not a politeness: every room costs one Convex round
 * trip per cycle week to fetch its template, and this deployment is over its
 * plan limits. Twenty is more IT rooms than the schools in question have and
 * still only sixty reads on a three-week cycle.
 */
export const MAX_ROOMS_PER_SHEET = 20;

/** Custom-field rows sit between the room codes and the first separator.
 *  Three in the source; the cap stops a header band taller than a day. */
export const MAX_CUSTOM_FIELDS = 8;

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE EXPORT OPTIONS — CHOSEN ONCE, KEPT, AND HONEST ABOUT THEMSELVES
   ══════════════════════════════════════════════════════════════════════════

   Cam: *"maybe this automatic editing when changing the template and automatic
   hiding of weeks should be toggles in the export menu of timetable in the
   settings … would be nice to give users options in the export menu to make it
   feel more polished and they get more of what they want"*.

   So the Export section is a small options panel rather than one button, and
   the choices are STORED — `organisations.timetableExport`. A school exports
   this file every half term and a panel that forgets is the opposite of
   polished. The precedent is `timetableAccent` one field over: org-level,
   written by a gated mutation, validated server-side, absent means the
   default.

   ── ⭐⭐ EVERY DEFAULT IS OFF, AND THAT IS THE ARGUMENT FOR THEM ──────────
   All four off produces the workbook this route already writes, byte for byte.
   That is not timidity, it is the only defensible rollout: every school that
   has ever exported this file gets the same file tomorrow, and each new
   behaviour is something an admin turned on having read what it does.

   Each one also has its own reason:

     `linkTemplates`   ⚠️ AN EXPORT IS A RECORD OF WHAT WAS TAUGHT. Linking
                       turns it into a LIVE DOCUMENT that rewrites history when
                       somebody edits a template — open last year's file, fix a
                       typo on the Week A template, and every week of that
                       finished year silently changes to match. Opting in to
                       that is entirely reasonable. Being opted in silently is
                       not. See `EXPORT_LINK_NOTE`, which the workbook itself
                       carries so the next person does not "fix" it back.

     `hideEndedWeeks`  ⚠️ A FRESH EXPORT OF A FINISHED YEAR MUST NOT COME BACK
                       EMPTY. The three-year cap actively encourages a school
                       to keep last year, and every week of last year has
                       ended — so ON by default would hand somebody a workbook
                       whose entire timetable is hidden. Hiding is also the one
                       option whose value depends on WHEN you press the button,
                       which is a poor thing to have happen without asking.

                       ⚠️⚠️ AND IT IS ABOUT THE **FILE** AND NOTHING ELSE. It
                       used to be about both — one stored boolean read by this
                       route AND by the published board's week strip — so an
                       admin tidying up a DOWNLOAD silently took the autumn
                       term out of the live strip for every teacher in the
                       school, from a switch sitting under a heading reading
                       "What this file does". The board has its own switch now:
                       `TimetableBoardOptions.hideEndedWeeks` below. Two
                       surfaces, two settings, exactly as Cam described them.

     `protectTemplates` Sheet protection is NOT encryption (`EXPORT_PROTECTION_NOTE`).
                       Defaulting a security-shaped feature to on teaches a
                       school to trust something that does not hold.

     `lockPrefilled`   It is only meaningful once somebody has decided the
                       workbook is a form to be filled in rather than a
                       printout, and that is a decision, not a default.

   ── ⚠️ THE PASSWORD IS NOT HERE, AND MUST NOT BE ─────────────────────────
   It is typed at export time and never stored. Storing it means keeping a
   user-chosen password at rest — one a person will have reused — in exchange
   for saving them one field, and this deployment would then owe it encryption,
   rotation and a way to clear it. See the POST handler on the export route for
   why it travels in a body and never in a query string.
   ══════════════════════════════════════════════════════════════════════════ */

/** The four switches, resolved. Every reader takes THIS, never the stored
 *  shape — so "absent means off" is answered in exactly one place. */
export type TimetableExportOptions = {
  /**
   * Week cells that stand as the template laid them down become formulas
   * pointing at the template sheet, so editing the template in Excel fills
   * every week that uses it.
   */
  linkTemplates: boolean;
  /**
   * Week sheets that have fully ended are written `state="hidden"`.
   *
   * ⚠️ THE **WORKBOOK'S** TABS, AND NOT THE WEBSITE'S. See
   * `TimetableBoardOptions` for the board's own switch and for why the two are
   * deliberately not one value any more.
   */
  hideEndedWeeks: boolean;
  /** The CYCLE-WEEK template sheets get Excel worksheet protection. ⚠️ NOT
   *  the tab called "Half Terms - Template" (`HALF_TERM_SHEET_LABEL`), which
   *  this option has never protected — see `EXPORT_OPTION_COPY`. */
  protectTemplates: boolean;
  /** Week sheets get protection with the template-laid cells LOCKED and the
   *  free periods left editable — `cellRights()` expressed in Excel. ⚠️ WHICH
   *  IS NOT "every free period": `cellRights` answers `retired` above every
   *  question about what is in a cell, so a room that is out of service has
   *  its WHOLE column locked, free periods included. The copy beside the
   *  switch says so and the export route names those rooms in the file. */
  lockPrefilled: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: TimetableExportOptions = {
  linkTemplates: false,
  hideEndedWeeks: false,
  protectTemplates: false,
  lockPrefilled: false,
};

/**
 * What is actually on the organisation document.
 *
 * ⚠️ PARTIAL, AND PRUNED TO WHAT DIFFERS FROM THE DEFAULT — the same rule
 * `normaliseActivityLogging` follows, and for the same reason: an org that
 * wants the plain export stores `{}` rather than four falses that would freeze
 * today's defaults onto the document and survive a change of default.
 */
export type StoredExportOptions = Readonly<Record<string, boolean>>;

/** Every key, as a value — so `resolve` and `normalise` cannot fall out of
 *  step with the type when a fifth option is added. */
export const EXPORT_OPTION_KEYS = [
  "linkTemplates",
  "hideEndedWeeks",
  "protectTemplates",
  "lockPrefilled",
] as const satisfies ReadonlyArray<keyof TimetableExportOptions>;

export type ExportOptionKey = (typeof EXPORT_OPTION_KEYS)[number];

/** Stored → resolved. Absent, `undefined`, and a document written before this
 *  field existed all mean the default; a key the taxonomy does not know is
 *  ignored rather than fatal, which is the point of the `v.record`. */
export function resolveExportOptions(
  stored?: StoredExportOptions | null,
): TimetableExportOptions {
  const out = { ...DEFAULT_EXPORT_OPTIONS };
  if (!stored) return out;
  for (const k of EXPORT_OPTION_KEYS) {
    const v = stored[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * A patch from a browser → what to store.
 *
 * ⚠️ MERGED KEY BY KEY OVER WHAT IS ALREADY THERE, never a whole-object
 * replace: one switch must not clear the other three. Keys the taxonomy does
 * not know are dropped, and every key equal to its default is PRUNED, so the
 * document says only what the admin actually changed.
 */
export function normaliseExportOptions(
  stored: StoredExportOptions | null | undefined,
  patch: StoredExportOptions,
): Record<string, boolean> | undefined {
  const merged = resolveExportOptions(stored);
  for (const k of EXPORT_OPTION_KEYS) {
    const v = patch[k];
    if (typeof v === "boolean") merged[k] = v;
  }
  const out: Record<string, boolean> = {};
  let any = false;
  for (const k of EXPORT_OPTION_KEYS) {
    if (merged[k] !== DEFAULT_EXPORT_OPTIONS[k]) {
      out[k] = merged[k];
      any = true;
    }
  }
  /* `undefined` REMOVES the field. An org back at every default carries no
     field at all, exactly as one that never opened the panel does. */
  return any ? out : undefined;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE BOARD'S OWN SWITCH — A SECOND SETTING, NOT A SECOND READER
   ══════════════════════════════════════════════════════════════════════════

   Cam named TWO places, and the second half of the sentence is its own
   instruction: *"…should be toggles in the export menu of timetable in the
   settings AND automatic hiding of previous weeks could be an option IN
   GENERAL FOR THE TIMETABLE BOOKING."*

   ── ⚠️⚠️ WHAT WAS WRONG, IN ONE SENTENCE ────────────────────────────────
   `hideEndedWeeks` was stored ONCE and read by BOTH the export route and
   `src/components/booking/PublishedTimetable.tsx`. So an admin who ticked a
   switch to tidy up a DOWNLOAD — under a panel heading reading "What this file
   does", beside a sentence about Excel tabs — silently removed the autumn term
   from the live week strip of every teacher in the school. The code documented
   the tension instead of resolving it: the old copy "has to name BOTH
   surfaces", which is a label apologising for a bug.

   ── ⭐⭐ THE DEFAULT, AND IT IS THE OPPOSITE OF THE EXPORT'S ─────────────
   ⚠️ ON. It shipped as OFF and that was wrong — measurably, see
   `DEFAULT_BOARD_OPTIONS`. The two surfaces are argued the SAME way and reach
   DIFFERENT constants, which is exactly why they are two settings:

     · the default is "what this surface already did", so that turning a
       behaviour into an option changes nobody's screen on the day it ships;
     · the EXPORT already did nothing — the route wrote every week tab
       visible — and ON by default would hand somebody a fresh download of a
       FINISHED year with its whole timetable hidden. So: OFF.
     · the BOARD already hid, unconditionally: `endedCount > 0 && endedCount <
       weeks.length` is the shipped strip, and Cam asked for it ("auto hide
       completed weeks"). So: ON. OFF would not have left the board alone, it
       would have deleted the feature for every school at once — 27 tabs
       becoming 52 in March, and the "N finished" button gone with them.

   Opting in is fine, being opted in silently is not — AND THE CONVERSE IS
   ALSO TRUE, which is the half this originally missed: being opted OUT
   silently is the same bug pointing the other way.

   ── ⭐⭐ THREE STATES, AND NO LEGACY FOLD ────────────────────────────────
   `organisations.bookingHideEndedWeeks` is `v.optional(v.boolean())` and the
   THREE states are all load-bearing — this is the `activityLogging` shape
   CLAUDE.md documents, in its smallest possible form:

     `true`       the board hides. Somebody said so.
     `false`      the board does not hide. Somebody said so.
     ABSENT       ⭐ NOBODY HAS EVER EXPRESSED AN OPINION ABOUT THE BOARD, so
                  it gets `DEFAULT_BOARD_OPTIONS` — the strip the school
                  already had.

   ⚠️⚠️ AND `timetableExport.hideEndedWeeks` IS NOT CONSULTED, WHICH IS A
   DELETION AND NOT AN OVERSIGHT. `resolveBoardOptions` took a second argument
   — the export record — and read its `hideEndedWeeks` when this field was
   absent, to honour a deployment carrying the value from the brief period the
   two switches were ONE boolean. That branch could not be reached, and three
   long banners defending it made it look load-bearing:

     · ⭐ THE ARGUMENT THAT HOLDS: the shared-switch build was never deployed,
       so no stored organisation document carries
       `timetableExport.hideEndedWeeks` in the first place. There is nothing
       for the branch to read on any document that exists.
     · ⚠️ AND THE ARGUMENT THAT DOES NOT, WRITTEN DOWN SO NOBODY REACHES FOR
       IT AGAIN: "`timetableExportPrefs.save` patches BOTH fields in one
       `ctx.db.patch`, so that document shape cannot exist." That was true of
       the handler that STAMPED, and the same change that deleted this branch
       deleted the stamp — `save` now patches each half only when the call
       names it, so an export-only save leaves `bookingHideEndedWeeks` absent
       and the shape it denied is a shape the handler produces. The branch is
       still right to be gone; this is simply not why.

   Which left a branch whose only effect, if it ever HAD fired, was the exact
   coupling this field exists to end: an admin moving the FILE switch would
   have moved the live week strip with it. Deleting it is one less way for
   that bug to come back, and it takes the "stamp the board's current value
   whenever an export switch moves" write in `timetableExportPrefs.save` with
   it — that write existed to neutralise this branch, and with the branch gone
   it did nothing but turn ABSENT into a stored default, flattening three
   states into two for every org that ever opened the export panel.
   ══════════════════════════════════════════════════════════════════════════ */

/** What the published board does with weeks that have ended. One switch
 *  today; a type rather than a bare boolean so a second board preference does
 *  not have to re-open every signature between here and the strip. */
export type TimetableBoardOptions = {
  /** Week tabs that have fully ended are folded out of the strip, behind a
   *  "N ended" button that puts them back for this viewer, this visit. */
  hideEndedWeeks: boolean;
};

/**
 * ⭐⭐ ON, AND IT IS THE ONLY DEFAULT THAT DOES NOT SILENTLY CHANGE SOMEBODY'S
 * SCREEN. ⚠️ IT WAS `false` AND THAT WAS MEASURED WRONG.
 *
 * The four EXPORT defaults are off because off is the workbook the route
 * already wrote — every school gets the same file tomorrow. Applying the same
 * reasoning to the board reaches the OPPOSITE constant, because the board's
 * "what it already did" is not "nothing":
 *
 *     const canHide = endedCount > 0 && endedCount < weeks.length;
 *
 * That is the shipped strip. Hiding was UNCONDITIONAL — Cam asked for it
 * ("auto hide completed weeks") and it went in — so a switch defaulting to
 * `false` does not leave the board alone, it TURNS THE FEATURE OFF for every
 * school at once. Measured over a 52-week year with the usual holidays: the
 * strip goes 27 tabs → 52 on the first day of March, 10 → 52 in late June, and
 * the "N finished" button disappears with them. Nobody asked for that, and the
 * person who would have to explain it is an admin who never touched a switch.
 *
 * ⚠️ "MAKE X AN OPTION" IS NOT "TURN X OFF". Cam's words are *"automatic
 * hiding of previous weeks could be an OPTION in general for the timetable
 * booking"* — a school that wants the whole year back may now have it, which
 * it could not before. The option is the new thing; the behaviour is not.
 *
 * The export's argument still stands on its own and is unchanged: a fresh
 * download of a finished year must not come back with every tab hidden.
 * Two surfaces, two settings, and now two defaults, each argued from what its
 * own surface already did.
 */
export const DEFAULT_BOARD_OPTIONS: TimetableBoardOptions = {
  hideEndedWeeks: true,
};

/**
 * ⭐ THE ONE PLACE THE THREE STATES ARE COLLAPSED. Every reader takes the
 * resolved shape, so "absent means the default" is answered here and never
 * again — the same rule `resolveExportOptions` follows for its own four, and
 * the same rule `resolveActivityLogging` follows for its forty-five.
 *
 * `stored` is `organisations.bookingHideEndedWeeks` and it is the ONLY input.
 *
 * ⚠️ IT TOOK A SECOND ARGUMENT — the export record, read when this field was
 * absent — and that branch could not change an answer, because the build in
 * which these two switches were ONE boolean never shipped: no stored document
 * holds `timetableExport.hideEndedWeeks` for it to read. ⚠️ AND NOT because
 * "`save` writes both fields in one patch" — that was true of the handler that
 * stamped, and the same change deleted the stamp; see the banner above. A
 * one-line fallback that cannot change an answer is not a safety net; it is a
 * copy of the coupling this field was split to end, kept alive by comments.
 *
 * ⚠️ ABSENT MEANS THE DEFAULT, AND THE DEFAULT IS **ON**. Not `false`: the
 * strip hid unconditionally before there was a switch, so "nobody has said
 * anything" has to answer with what the school already had.
 */
export function resolveBoardOptions(
  stored: boolean | null | undefined,
): TimetableBoardOptions {
  if (typeof stored === "boolean") return { hideEndedWeeks: stored };
  return { ...DEFAULT_BOARD_OPTIONS };
}

/**
 * ⭐ THE WORDS BESIDE THE BOARD'S SWITCH. Written here beside the export's own
 * copy so the two can be read against each other — which is the check that
 * matters, because the failure this split fixes was two surfaces sharing one
 * sentence.
 *
 * ⚠️ NEITHER SENTENCE MAY DESCRIBE WHAT THE OTHER SURFACE DOES. That is not a
 * style rule: an option whose copy has to explain something it does not
 * control is an option that is controlling something it should not.
 *
 * ⚠️ BUT EACH ONE MUST SAY WHICH SURFACE IT IS ABOUT, AND BOTH DO — "This is
 * about the website, not the download" here, "This does not change the
 * timetable on the website" in `EXPORT_OPTION_COPY.hideEndedWeeks`. An earlier
 * draft of this banner forbade naming the other surface at all, and the two
 * strings below it broke that rule on the line after it was written. They are
 * right and the rule was too wide: the two switches carry nearly the same
 * words and governed ONE value until recently — a one-clause disclaimer is the
 * cheapest thing that stops a reader taking them for one switch. Denying a
 * behaviour is not describing one.
 *
 * ⭐ WHERE THIS ONE IS RENDERED: org settings → General → Booking, beside
 * "Publish the timetable" and "Let anyone override a timetabled lesson" —
 * `BoardWeekStripSwitch` in src/components/OrgSettingsPanel.tsx. NOT the
 * export panel, which is where it first shipped and which is the screen an
 * admin opens to produce a download.
 *
 * ⚠️ SO THE DISCLAIMERS ARE NO LONGER ABOUT TWO CONTROLS A READER CAN SEE AT
 * ONCE, and they still earn their place: an admin who has read both screens
 * this half term is exactly the person who will remember one switch and not
 * two. The clause is cheap and the confusion is not.
 */
export const BOARD_OPTION_COPY: {
  label: string;
  hint: string;
  cost: string;
} = {
  label: "Hide ended weeks on the booking board",
  hint: "On the timetable everyone in the school opens, the week strip lists only the week you are in and the weeks still ahead. A week folds away on the Monday after it finishes.",
  cost: "This is about the website, not the download. Nothing is deleted and nobody is locked out: the strip grows a “N ended” button that puts every week back, and typing a date still lands on it.",
};

/**
 * ⭐ THE WORDS BESIDE EACH SWITCH, WRITTEN ONCE.
 *
 * Cam: *"Every option must be honest about what it does in one short sentence
 * beside it, not in a tooltip nobody opens."* The panel renders these and
 * writes none of its own — the same rule `ActivityRecording.tsx` follows
 * against `EVENT_META`, for the reason CLAUDE.md gives about hand-kept
 * matching pairs.
 *
 * ⚠️ `cost` IS NOT A SOFTENED VERSION OF `hint`. It is what the option takes
 * AWAY, and it is shown whether or not the switch is on, because an option
 * whose downside only appears after you enable it is a trap wearing a label.
 */
export const EXPORT_OPTION_COPY: Record<
  ExportOptionKey,
  { label: string; hint: string; cost: string }
> = {
  linkTemplates: {
    label: "Weeks follow the templates",
    hint: "Every week cell that shows the standing timetable becomes a formula pointing at the template sheet, so editing a template in Excel fills in every week that uses it.",
    cost: "The file stops being a record of what was taught. Editing a template changes what a finished week says it did.",
  },
  hideEndedWeeks: {
    /* ⚠️ "IN THIS FILE" IS THE WHOLE POINT OF THE WORDING. The label used to
       read "Hide weeks that have ended" full stop, while the switch behind it
       also governed the live board — see the banner on
       `TimetableBoardOptions`. Naming the surface in the label is what stops
       the two switches being read as one, and it survives them being moved
       apart: the board's now lives in org settings → Booking, so this label is
       what a reader has in front of them when they are trying to remember
       whether they already changed the other one. */
    label: "Hide ended weeks in the file",
    hint: "Week tabs are written hidden once the week has fully ended — the week you are in stays visible all week. Templates and half terms are never hidden.",
    cost: "Nothing is deleted. Right-click any tab in Excel and choose Unhide to get them back. This does not change the timetable on the website.",
  },
  protectTemplates: {
    label: "Protect the template sheets",
    /* ⚠️ "THE CYCLE-WEEK TEMPLATES" AND NOT "THE TEMPLATE TABS". The workbook
       contains a tab literally called "Half Terms - Template"
       (`HALF_TERM_SHEET_LABEL`) and this option has never protected it — it is
       the school's holiday reference, nobody types in it, and it is one of the
       three sheets that keep a workbook openable when every week is hidden.
       The old wording pointed at a tab with the word Template on it and said
       it would be read-only; a reader checking the file found it editable and
       had no way to tell whether the switch had worked. */
    hint: "The cycle-week template tabs — Week A, Week B — become read-only, so nobody edits the school's standing timetable by leaning on a key.",
    cost: "This is not encryption. Anyone determined can strip it in a minute; it stops accidents, not people. The Half Terms tab is not protected, despite its name: nothing is typed into it.",
  },
  lockPrefilled: {
    label: "Lock the timetabled lessons",
    /* ⚠️ "A ROOM IN SERVICE" EARNS ITS CLAUSE. This read "the free periods are
       left editable" flat, and that is false for a RETIRED room's column:
       `cellRights` answers `retired` above every question about what is in the
       cell, so every cell of that column is locked — free periods included —
       and it is meant to be. The workbook prints the column because a grid is
       read positionally and dropping it would move every room to its right.
       The export route also NAMES those rooms in the file's option notes, so
       the reader who meets a column that refuses every keystroke is told which
       ones and why. */
    hint: "On every week sheet the timetabled lessons and the bookings are locked and the free periods of a room that is in service are left editable, so somebody filling this in can only fill in the blanks. A room that is out of service has its whole column locked, exactly as the booking board refuses it.",
    /* ⭐⭐ AND IT IS NOW GENUINELY `cellRights()`, WHICH IT PREVIOUSLY WAS NOT.
       This line used to say the opposite — "a week somebody changed on the
       site is printed as its timetabled lesson, so it locks like one" — and
       that was the honest description of a REAL GAP: the export never read
       `bookingWeekOverrides` at all. It does now, through
       `resolvePublishedRoom`, the same function the board draws itself with.
       So the five cell rules are expressible here and the file expresses them:
       a cell a colleague changed is somebody's ad-hoc note, not the school's
       timetable, and rule three says any member may retype it — so it is left
       UNLOCKED, exactly as the board leaves it. See `workbookRights` in the
       export route for the one viewer this file is locked for. */
    cost: "Also not encryption, and the same password lifts both locks. A week somebody has changed on the website is left unlocked here too, because on the site anybody may retype it.",
  },
};

/**
 * ⭐ THE BANNER THE WORKBOOK CARRIES ABOUT LINKING, so the next person to open
 * it knows the file is live and does not "fix" the formulas back to values.
 * Written into the Export info sheet by the writer.
 */
/* ⭐⭐ AND IT NAMES BOTH LAYERS AGAIN, BECAUSE BOTH ARE NOW IN THE FILE.
   The sentence originally said "cells someone has booked OR TYPED OVER"; that
   was corrected to name only bookings, because the export was built by
   `resolveWeekGrid`, which layers BOOKINGS over the template and has no
   overrides input at all — so a cell a member had retyped on the published
   board was not in the workbook in any form, and the standing lesson was
   printed (and, under linking, LINKED) in its place. The correction was the
   right call at the time: promising a reader their edit survived as a plain
   value, over a cell that held somebody else's lesson, is the one sentence
   that would make a person trust the wrong cell.

   ⚠️ THE FIX WAS THE CODE, NOT THE COPY. Week grids are now resolved by
   `resolvePublishedRoom` — the board's own function, layering
   `bookingWeekOverrides` over the template in the same HELD-before-CHANGED
   order — so an overridden cell is in the file, is a plain value, and is
   deliberately NOT linked: it is not the template, and pointing it at one
   would drag the class back to the lesson it was moved off. A CLEARED cell
   (the lesson explicitly not running that week) is not linked either, and that
   is the sharper case — linking an empty cell is what makes a lesson ADDED to
   a template appear on every week, so linking a cleared one would resurrect
   the very lesson somebody moved. */
export const EXPORT_LINK_NOTE =
  "The week sheets READ FROM the template sheets. Editing a template changes every week that uses it, including weeks that have already happened — this file is a live document, not a record. Cells a booking holds, and cells somebody changed on the website, are left as plain values and do not follow.";

/**
 * ⭐ AND THE ONE ABOUT PROTECTION. It says what Excel worksheet protection
 * does and, more importantly, what it does not — Cam is selling this to
 * schools and must not believe the templates are sealed.
 *
 * ⚠️ AND IT NEVER OFFERS PASSWORD-TO-OPEN ENCRYPTION, which is a different
 * feature, is real, and is one exceljs cannot write.
 */
export const EXPORT_PROTECTION_NOTE =
  "Sheet protection stops accidental edits. It is NOT encryption: the file is not encrypted, its contents are readable by anything that can open a zip, and the protection can be removed by anyone who wants to. Use it to stop a slip of the keyboard, never to keep a secret.";

/**
 * ⭐⭐ THE ONE PAIR OF SWITCHES THAT PULLS AGAINST ITSELF, SAID OUT LOUD.
 *
 * `linkTemplates` exists so that EDITING A TEMPLATE fills in every week that
 * uses it. `protectTemplates` makes the template sheets read-only. Both on is
 * a workbook that advertises an auto-fill driven from a sheet it has just
 * locked — and with a password on it, the only person who can drive it is
 * whoever pressed Export.
 *
 * ⚠️ IT IS NOT REFUSED, AND MUST NOT BE. It is a perfectly sensible file to
 * want: the templates are the school's standing timetable, "read-only unless
 * you mean it" is exactly the guard an admin wants on them, and the auto-fill
 * still works the moment the protection is lifted. What is not acceptable is
 * it being SILENT — the four switches sit under a heading promising to say
 * what each does, and neither sentence can mention the other without becoming
 * the "one label apologising for two behaviours" this whole wave exists to
 * undo. So the interaction gets its own sentence, in one place, shown by the
 * panel and printed in the file, and only when both are actually on.
 *
 * The panel's own rejected-options list already names this failure mode —
 * "an option whose job is to combine badly" — about a control that was never
 * built. This is the pair that shipped.
 */
export const EXPORT_LINKED_AND_PROTECTED_NOTE =
  "These two pull against each other: the week sheets read FROM the template sheets, and the template sheets are read-only. Nothing auto-fills until somebody lifts the protection on a template tab first — and if a password was set, only whoever exported this file can.";

/** How many class codes get a conditional-formatting rule per sheet. The
 *  reference workbook holds ~70 distinct codes; this bounds a calendar full of
 *  free-text bookings from turning styles.xml into the largest part of the
 *  zip. Past it the colours are still correct on export, they just stop
 *  following a later edit. */
export const MAX_CF_CLASS_RULES = 200;

/**
 * ⭐⭐ DO THESE TWO SHEETS HAVE THE SAME ROWS? — the check that makes
 * template-linking safe rather than merely true.
 *
 * A week sheet and its template sheet are laid out by the same code from the
 * same `periods`, so row 12 of one is the same weekday and the same period as
 * row 12 of the other, and a formula can therefore point at its OWN address on
 * another sheet. That is true today. It is also exactly the kind of fact that
 * stays true right up until a day shape becomes per-week, at which point every
 * linked cell in the file quietly points one row off and a Tuesday period 3
 * starts showing Tuesday period 2's class.
 *
 * So the route asks this before it sets `linkTo`, and a week whose shape does
 * not match its template is written with literal values instead. Comparing
 * `ordinal` and not `label` because a school may call two rows "Break".
 */
export function daysAlign(a: SheetDay[], b: SheetDay[]): boolean {
  if (a.length !== b.length) return false;
  for (let d = 0; d < a.length; d++) {
    const pa = a[d].periods;
    const pb = b[d].periods;
    if (pa.length !== pb.length) return false;
    for (let i = 0; i < pa.length; i++) {
      if (pa[i].ordinal !== pb[i].ordinal) return false;
    }
  }
  return true;
}

/**
 * ⭐⭐ "COMPLETED" MEANS FULLY ENDED — CAM'S OWN RULING, AND ONE FUNCTION.
 *
 * *"a week hides only once it has FULLY ENDED — the Monday after it finishes.
 * The current week stays visible all week, including Friday afternoon."*
 *
 * Both arguments are the MONDAY of a week, so the test needs no clock: "the
 * Monday of today's week has moved past this one" IS "this week has fully
 * ended". ISO dates compare correctly as strings.
 *
 * ⚠️ IT LIVES HERE SO THE WEBSITE AND THE WORKBOOK CANNOT DISAGREE. The week
 * strip on the published board applies exactly this rule to decide which tabs
 * to fold away; a workbook that hid a different set of weeks from the screen
 * it was exported from is the kind of quiet disagreement CLAUDE.md records
 * every hand-kept pair in this codebase eventually producing.
 *
 * ⚠️ AND "TODAY" IS THE SCHOOL'S, NOT THE SERVER'S. Callers resolve it in the
 * calendar's own timezone — see `localDateOf` in convex/lib/bookingTime.ts.
 * A UK school exported from a US datacentre would otherwise lose the week it
 * is standing in.
 */
export function weekHasEnded(monday: CivilDate, todayMonday: CivilDate): boolean {
  return monday < todayMonday;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ REFERENCES INTO ANOTHER SHEET — quoting, once, correctly
   ══════════════════════════════════════════════════════════════════════════ */

/** 1 → "A", 26 → "Z", 27 → "AA". */
export function columnLetter(index: number): string {
  let n = Math.max(1, Math.floor(index));
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * `'Week A - Template'!D8`.
 *
 * ⚠️ ALWAYS QUOTED, AND THE APOSTROPHE IS DOUBLED. Every sheet name this
 * workbook produces contains a space, a bracket or a hyphen — "Week A -
 * Template", "(A) September 7th - 11th" — so the quotes are never optional;
 * quoting unconditionally means there is no rule to get wrong for the one name
 * that would not have needed them. Inside the quotes Excel escapes a literal
 * apostrophe by doubling it, and `sanitiseSheetName` only strips apostrophes
 * from the ENDS, so "St John''s week" is reachable from a school's own week
 * label.
 *
 * The XML escaping on top of this (`&apos;`) is exceljs's job and it does it.
 */
export function sheetCellRef(
  sheetName: string,
  column: number,
  row: number,
): string {
  const quoted = sheetName.replace(/'/g, "''");
  return `'${quoted}'!${columnLetter(column)}${row}`;
}

/**
 * ⭐ THE FORMULA A LINKED WEEK CELL HOLDS.
 *
 * ⚠️ THE `IF` IS NOT DECORATION. `='Week A - Template'!D8` pointed at an EMPTY
 * template cell displays **0**, not blank — Excel's oldest gotcha — so a free
 * period on every week sheet of a linked workbook would read "0" across forty
 * tabs. The guard is the standard idiom rather than the shorter `&""` trick
 * because an admin WILL click one of these cells and read it, and it also
 * keeps a numeric room label numeric.
 */
export function templateLinkFormula(
  sheetName: string,
  column: number,
  row: number,
): string {
  const ref = sheetCellRef(sheetName, column, row);
  return `IF(${ref}="","",${ref})`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MODEL THE WRITER RENDERS
   ══════════════════════════════════════════════════════════════════════════

   Deliberately free of Convex ids and Convex types: the writer takes THIS and
   the route is the only thing that knows where it came from. That is what
   makes the workbook testable without a database, and it is the seam the
   room-setup work lands on — see `TimetableRoom.fields`. */

/**
 * ⭐ CAM'S CUSTOM FIELDS — rows 2–4 of the source workbook.
 *
 * *"there should then be custom fields it admins can fill like number of pcs,
 * teacher and telephone (they choose these)"*: an ADMIN-CHOSEN, ORDERED list
 * of definitions, and one value per room per field.
 *
 * The definitions live in `bookingRoomFields` and the values in
 * `bookableResources.roomFieldValues`, individually encrypted; a
 * `bookingRoomSets` document says WHICH of each print on a given sheet and in
 * what order. `bookingRooms.roomSheet` resolves all three and is the ONLY
 * thing the export route reads them through — so the setup screen and the
 * workbook cannot disagree about order, membership, or what a blank box
 * means.
 *
 * ⚠️ This model deliberately restates the shape in ids and plain values,
 * because the WRITER must not depend on Convex types. `id` is the field
 * document's id and never its label, so renaming "Telephone" to "Extension"
 * moves no data and breaks no sheet.
 */
export type TimetableFieldDef = {
  /** Stable key. Values are keyed on it, so renaming the label is free. */
  id: string;
  /** "No of PCs", "Teacher", "Telephone" — the admin's own words. */
  label: string;
};

export type TimetableRoom = {
  /** "N21". The column header, and short by nature — it is a room code. */
  name: string;
  /** Field id → what the admin typed. Absent is an empty cell, not a zero. */
  fields: Record<string, string | number>;
};

/**
 * ⭐⭐ MAY SOMEBODY TYPE IN THIS CELL — `cellRights()`, ANSWERED ONCE.
 *
 * The `lockPrefilled` option is "`cellRights()` expressed in Excel", and this
 * field is what makes that sentence true rather than aspirational. The route
 * asks `cellRights(state, rights)` — the SAME function the published board
 * asks to decide whether a cell looks editable and the SAME function
 * `bookingPublished.setCell` asks before it accepts a write — and puts the
 * answer here. The writer reads it and applies no rule of its own.
 *
 * ⚠️ THE ALTERNATIVE WAS A RULE IN THE WRITER, and it would have been wrong
 * within a wave. "Unlock the empty ones and the overrides" is a restatement of
 * five cell rules in a file that knows nothing about weeks, rooms or people —
 * exactly the hand-kept pair CLAUDE.md records this codebase producing over and
 * over. The one that was already live: a cell somebody had CHANGED on the
 * website printed as its original timetabled lesson and locked like one.
 *
 * ⚠️ REQUIRED, NOT OPTIONAL, on every variant. A default would let a new
 * constructor of a `SheetCell` forget it, and forgetting it defaults to LOCKED
 * — which is precisely the cells staff are supposed to be able to fill in.
 */
type CellLockState = {
  /** `!cellRights(state, rights).canEdit`. Read only when the sheet is being
   *  protected at all; harmless and ignored otherwise. */
  locked: boolean;
};

/** One cell of the input area. `null` means genuinely empty — free. */
export type SheetCell =
  | ({ kind: "value"; text: string | number; origin: InputOrigin } & CellLockState)
  /** A break, a lunch, a closed day: structure-coloured and not bookable. */
  | ({ kind: "blocked" } & CellLockState)
  /**
   * ⭐⭐ EMPTY, AND EMPTY ON PURPOSE — the board's CLEARED state. An override
   * row with no text: "the lesson is not running in this room this week,
   * because the class moved".
   *
   * ⚠️ IT IS A SEPARATE KIND FROM `"free"` FOR EXACTLY ONE REASON, AND IT IS A
   * CORRECTNESS REASON. A free cell is LINKED when template-linking is on —
   * that is what makes a lesson ADDED to a template appear on every week that
   * uses it. Doing the same to a cleared cell would point it at the very
   * lesson somebody deliberately moved off it, and the class would reappear on
   * that week the moment Excel recalculated. Both cells print blank, so the
   * distinction is invisible in the file and has to live in the type — where
   * the compiler makes the writer state an answer for it.
   *
   * Otherwise it behaves as free: white input fill, and left editable under
   * `lockPrefilled`, because `cellRights()` says any member may type in it.
   */
  | ({ kind: "cleared" } & CellLockState)
  | ({ kind: "free" } & CellLockState);

export type SheetPeriodRow = {
  /**
   * ⭐ THE PERIOD'S IDENTITY, and the reason template-linking can be CHECKED
   * rather than assumed.
   *
   * A week sheet and its template sheet have the same rows because both are
   * built from `periodsForWeekday()` over the same `periods` — so cell D8 on
   * one is the same period of the same weekday as D8 on the other. That is
   * true, and it is exactly the kind of true-by-coincidence a formula pointing
   * at the wrong row would inherit silently. Carrying the ordinal lets the
   * writer ASSERT the two rows are the same period before it writes a
   * reference, and fall back to a literal value if they ever stop being.
   *
   * ⚠️ NOT `label`. A school may call two rows "Break"; `ordinal` is the
   * stable key templates and recurring bookings are stored against — see
   * `PeriodDef.ordinal` in convex/lib/timetable.ts.
   */
  ordinal: number;
  /** What column C shows. A bare integer is written as a NUMBER, as the
   *  source does — "1" left as text sorts and formats differently. */
  label: string | number;
  /** False for break, lunch and registration: drawn so the day reads like a
   *  real day, and never bookable. Structure-coloured across the room columns. */
  bookable: boolean;
};

export type SheetDay = {
  /** The civil date shown in column B, merged down the block. */
  date: CivilDate;
  periods: SheetPeriodRow[];
  /** `periods.length` rows × one entry per room, row-major. */
  cells: SheetCell[][];
};

export type TimetableWeekSheet = {
  /** Already unique and Excel-legal — see `assignSheetNames()`. */
  name: string;
  /** "WEEK A". What B1 says, spanning the header band. */
  bandLabel: string;
  /**
   * ⭐ WHERE THIS WEEK SITS IN THE CYCLE — 0, 1, 2, or `null` for a week the
   * timetable does not run. It is what the TAB COLOUR is read from.
   *
   * ⚠️ REQUIRED, AND NOT DERIVED FROM `name` OR `bandLabel`. Both are
   * downstream of the cycle and both are free text a school may have renamed
   * ("Timetable 1 / Timetable 2"), so parsing an "(A)" back out of a sheet
   * name would colour tabs correctly for the default labels and silently stop
   * for anyone who changed them. Required rather than optional so a caller
   * cannot forget it and get every tab painted week A's colour.
   */
  cycleWeek: number | null;
  days: SheetDay[];
  /**
   * ⭐ WRITTEN `state="hidden"` RATHER THAN LEFT OUT — see the banner on
   * `TimetableExportOptions.hideEndedWeeks`. A finished year must stay a
   * complete record; hiding is two clicks to undo and deleting is not.
   *
   * ⚠️ ONLY WEEK SHEETS CARRY THIS FIELD, AND THAT IS THE WHOLE DEFENCE
   * AGAINST THE CORRUPT-WORKBOOK CASE. Excel refuses to open a workbook in
   * which every sheet is hidden, and a finished academic year is exactly that
   * case — every one of its weeks has ended. The half-term sheet, the
   * templates and the Export info sheet have no way to be hidden, so at least
   * three sheets are always visible by construction rather than by a
   * special case somebody could later tidy away.
   */
  hidden?: boolean;
  /**
   * ⭐ THE TEMPLATE SHEET THIS WEEK FOLLOWS — its FINAL name, after
   * `assignSheetNames()` has deduplicated it, because a formula naming a sheet
   * that got a " (2)" suffix points at nothing.
   *
   * Absent means "write literal values": linking is off, or the week has no
   * cycle position, or the calendar never reaches that cycle week. The route
   * resolves it from the week's `cycleWeek` and NEVER by parsing a letter back
   * out of a sheet name — see the banner on `cycleWeek` above.
   */
  linkTo?: string;
};

/** One closure run, laid out as up to two weeks of five weekdays. */
export type HalfTermBlock = {
  /** Column A: the cycle label of the first week, or "—" when the calendar
   *  pauses and a closed week therefore HAS no cycle week. */
  leftLabel: string;
  /** Column L, same rule, for the second week. */
  rightLabel: string;
  /** Up to ten civil dates, Mon–Fri then Mon–Fri. Short runs leave the tail
   *  `null`, which is a filled-but-empty cell exactly as in the source. */
  days: (CivilDate | null)[];
};

export type TimetableWorkbookModel = {
  /** "2026/27" — the calendar's name, used for the filename. */
  calendarName: string;
  orgName: string;
  rooms: TimetableRoom[];
  fieldDefs: TimetableFieldDef[];
  /**
   * "Week A - Template", one per cycle week, in cycle order. `cycleWeek` is
   * the index it is the template FOR.
   *
   * ⚠️ AND IT DOES NOT COLOUR THE TAB, WHICH `TimetableWeekSheet.cycleWeek`
   * DOES. Every template tab is `SHEET_TAB.template` — the source's red — and
   * the writer passes that constant without reading this field: the three
   * reference sheets are one set at the left of the strip, and colouring them
   * by cycle would put them back in the alternation they are meant to sit
   * outside of. The field is carried so the two sheet kinds state the same
   * fact the same way, and so a template that ever needs its cycle (a legend,
   * a header) has it without the route being changed again.
   */
  templateSheets: Array<{
    name: string;
    bandLabel: string;
    cycleWeek: number;
    days: SheetDay[];
  }>;
  halfTerms: HalfTermBlock[];
  weeks: TimetableWeekSheet[];
  /**
   * ⭐ THE SCHOOL'S TIMETABLE ACCENT, RESOLVED — the colour every band, header
   * strip and break row in this file is a tint of. See `sheetFills()`.
   *
   * ⚠️ OPTIONAL, AND ABSENT MEANS THE DEFAULT PURPLE, so a caller that has not
   * been taught about it writes exactly the workbook it wrote before. Pass
   * `listCalendars`' `accent`, which is already resolved server-side — never a
   * raw `organisations.timetableAccent`, which may be absent or (from a
   * hand-edited document) not a colour at all.
   */
  accent?: string;
  /**
   * ⭐ WHAT THE ADMIN CHOSE, RESOLVED. The writer takes the resolved four and
   * never a stored partial, so "absent means off" is answered once — in
   * `resolveExportOptions()` — and not again per option per call site.
   */
  options: TimetableExportOptions;
  /**
   * ⭐ EVERY DISTINCT CLASS CODE IN THE WHOLE WORKBOOK, for the conditional
   * formatting that keeps a linked cell's colour right after somebody edits a
   * template.
   *
   * ⚠️ IT HAS TO COME FROM THE ROUTE AND CANNOT BE GATHERED BY THE WRITER.
   * The writer STREAMS: sheet one is committed into the zip before sheet forty
   * has been looked at, so a rule set built from "codes seen so far" would give
   * September a shorter list than June and the same class two different
   * treatments in one file. The route holds every cell before the first byte
   * is written, so it is the only place the answer exists.
   *
   * Bounded by `MAX_CF_CLASS_RULES`. Empty when linking is off — the static
   * fills are already right when nothing can change after export, and ~2,900
   * rules is not a thing to spend on a file that cannot use them.
   */
  classCodes: string[];
  /**
   * ⭐ THE EXPORT PASSWORD, AND THE ONLY PLACE IT EXISTS.
   *
   * Typed into the panel, sent in the POST body of the export route, hashed by
   * `worksheet.protect()`, and gone when the request ends. It is NOT on
   * `notes`, which is the shape the Export info sheet is printed from — a
   * password one field away from a sheet that gets printed is a password that
   * ends up printed.
   *
   * ⚠️ ABSENT AND EMPTY BOTH MEAN "PROTECT WITH NO PASSWORD", which is what
   * the school's own reference workbook does on all 41 of its sheets: the
   * sheets refuse edits and anybody may lift the refusal. That is a real and
   * useful setting, not a degraded one — most of what this feature prevents is
   * a slip of the keyboard.
   *
   * ⚠️ AND IT IS NEVER STORED. See the banner on `TimetableExportOptions`.
   */
  password?: string;
  /** What the info sheet says. Never thrown away silently. */
  notes: WorkbookNotes;
};

export type WorkbookNotes = {
  generatedBy: string;
  generatedAt: number;
  holidayMode: "pause" | "continue";
  timezone: string;
  /** False when a bound was hit. The file SAYS so; it never ends quietly. */
  complete: boolean;
  reasons: string[];
  /**
   * ⭐ WHAT AN OPTION COULD NOT FULLY DELIVER — AND DELIBERATELY NOT A
   * `reason`.
   *
   * `reasons` means "this export STOPPED EARLY": a room whose grid was too
   * large to read, a booking page the deadline cut off, weeks missing from the
   * end. `complete` is `reasons.length === 0`, and a false `complete` prints
   * "⚠️ INCOMPLETE — This export stopped early" and OPENS THE FILE on the info
   * sheet instead of the timetable.
   *
   * ⚠️ SO AN OPTION FALLING SHORT MUST NEVER GO IN THERE. "three weeks hold
   * plain values because their day shape did not match" and "past 200 class
   * codes the colours stop following an edit" are notes about a convenience,
   * on a workbook whose timetable is complete to the last cell. Filed as
   * reasons they would shout that a school's year is missing data, about a
   * file that is missing none — and would move the tab it opens on. They are
   * printed under "How this was exported", beside the switch that caused them.
   */
  optionNotes?: string[];
};

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ SHEET NAMES
   ══════════════════════════════════════════════════════════════════════════

   "(A) September 7th - 11th", and when that would not fit,
   "(B) Sept 28th - Oct 2nd".

   The source's rule, recovered by checking every one of its 38 names: BUILD
   THE FULL FORM, AND ABBREVIATE THE MONTHS ONLY IF IT DOES NOT FIT IN 31.

     "(B) September 28th - October 2nd"   32 chars → "(B) Sept 28th - Oct 2nd"
     "(A) November 30th - December 4th"   32 chars → "(A) Nov 30th - Dec 4th"
     "(A) June 28th - July 2nd"           24 chars → left alone

   which is why "June"/"July" survive unabbreviated in a file that shortens
   September. It is not a per-month table; it is a length test. And 31 is
   Excel's own limit on a sheet name, so the rule and the constraint are the
   same number by construction rather than by coincidence. */

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** UK short forms. Four letters for September, because the source says
 *  "Sept"; months already four letters or fewer are not abbreviated at all,
 *  which is what leaves "(A) June 28th - July 2nd" alone. */
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "June",
  "July", "Aug", "Sept", "Oct", "Nov", "Dec",
] as const;

/** Excel's hard limit on a worksheet name. */
export const MAX_SHEET_NAME = 31;

/** Excel forbids these outright, and a name of only spaces. */
const ILLEGAL_SHEET_CHARS = /[:\\/?*[\]]/g;

export function ordinal(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * "September 7th - 11th" / "Sept 28th - Oct 2nd" for the Mon–Fri of a week.
 *
 * `short` picks the month table; the caller tries long first and falls back,
 * which is the source's rule stated as code rather than as a comment.
 */
export function weekRangeLabel(monday: CivilDate, short: boolean): string {
  const months = short ? MONTHS_SHORT : MONTHS_FULL;
  const mondayDay = dayNumber(monday);
  if (mondayDay === null) return monday;
  const friday = civilOf(mondayDay + (DAYS_PER_WEEK - 1));

  const [ay, am, ad] = monday.split("-").map(Number);
  const [by, bm, bd] = friday.split("-").map(Number);
  void ay;
  void by;

  const from = `${months[am - 1]} ${ordinal(ad)}`;
  /* The second month is named ONLY when the week crosses one, which is what
     makes the common case "September 7th - 11th" and not "September 7th -
     September 11th". */
  const to = am === bm ? ordinal(bd) : `${months[bm - 1]} ${ordinal(bd)}`;
  return `${from} - ${to}`;
}

/**
 * "A" from "Week A"; the whole label when it is not of that shape.
 *
 * `weekLabels` is free text on the calendar — a school running "Timetable 1 /
 * Timetable 2" gets "(Timetable 1)", which is long but honest, and the length
 * test above will abbreviate the months to make room.
 */
export function cycleLetterOf(weekLabel: string): string {
  const m = /^week\s+(.+)$/i.exec(weekLabel.trim());
  return (m ? m[1] : weekLabel).trim() || "?";
}

/** What B1 says. The sheet's OWN label, upper-cased as the source has it —
 *  and NOT the source's inverted value. See the banner. */
export function weekBandLabel(weekLabel: string): string {
  return weekLabel.trim().toUpperCase();
}

/** The ideal name, before uniqueness and before Excel's rules. */
export function weekSheetLabel(
  /**
   * ⚠️ NULLABLE, AND THE NULL IS NOT AN OVERSIGHT. A taught week the cycle
   * engine could not place has no label, and the tab must not invent a letter
   * for it — `(A)` on a week that is not Week A is worse than no letter at
   * all, because a tab letter is what a teacher navigates by. It gets the date
   * range alone, which is true, and `weekBandFor` says the rest in the corner.
   */
  weekLabel: string | null | undefined,
  monday: CivilDate,
): string {
  const text = weekLabel?.trim();
  if (!text) {
    const bare = weekRangeLabel(monday, false);
    return bare.length <= MAX_SHEET_NAME ? bare : weekRangeLabel(monday, true);
  }
  const letter = cycleLetterOf(text);
  const long = `(${letter}) ${weekRangeLabel(monday, false)}`;
  if (long.length <= MAX_SHEET_NAME) return long;
  return `(${letter}) ${weekRangeLabel(monday, true)}`;
}

/**
 * Excel-legal, non-empty, ≤ 31 characters. Does NOT deduplicate — that is
 * `assignSheetNames`, because uniqueness is a property of the set.
 */
export function sanitiseSheetName(raw: string): string {
  let name = raw.replace(ILLEGAL_SHEET_CHARS, " ").replace(/\s+/g, " ").trim();
  /* Excel refuses a name that starts or ends with an apostrophe, and refuses
     "History" outright — it is the reserved name of the revision log. */
  name = name.replace(/^'+/, "").replace(/'+$/, "").trim();
  if (name.length > MAX_SHEET_NAME) name = name.slice(0, MAX_SHEET_NAME).trim();
  if (!name) name = "Sheet";
  if (name.toLowerCase() === "history") name = "History (weeks)";
  return name;
}

/**
 * ⭐ THE COLLISION RULE.
 *
 * Two sheets in one workbook may not share a name, and Excel compares them
 * CASE-INSENSITIVELY — so "Week A - Template" and "WEEK A - TEMPLATE" are the
 * same name and a workbook carrying both fails to open. It is not a
 * theoretical worry here: a calendar may legally run past 12 months (the
 * engine caps at 60 weeks, not 52), two weeks a year apart produce the same
 * "(A) September 7th - 11th", and truncating a long free-text week label to
 * 31 characters can collapse two distinct names into one.
 *
 * So: sanitise, then suffix " (2)", " (3)" … trimming the BASE to keep the
 * whole thing inside 31. The suffix goes on the end because the discriminating
 * part of these names — the dates — is also at the end, and trimming from the
 * front would leave "(A) September" twice.
 *
 * Callers pass every sheet in workbook order, templates first, so the
 * un-suffixed name always lands on the sheet a user is most likely to look
 * for.
 *
 * ⚠️ AND IT RESERVES THE TWO FIXED SHEET NAMES BEFORE IT STARTS. The writer
 * always emits "Half Terms - Template" and "Export info", and callers pass
 * only the template and week sheets — so those two names were never in the
 * set uniqueness was computed over. A cycle week labelled "Half Terms" makes
 * `templateSheetLabel()` produce "Half Terms - Template" a second time, and
 * the workbook then carries two sheets of that name: exceljs itself refuses
 * to read the result back ("Worksheet name already exists") and Excel refuses
 * to open it. The download is a 200 with a valid zip that no reader will
 * accept, which is the worst failure available to a file — verified by
 * building one.
 *
 * They are reserved HERE rather than by the caller passing them in, because
 * the caller cannot forget what it does not have to remember, and because a
 * "your sheets will be named like this" preview must reserve exactly the same
 * two names as the bytes do.
 */
export function assignSheetNames(raw: string[]): string[] {
  const taken = new Set<string>([
    sanitiseSheetName(HALF_TERM_SHEET_LABEL).toLowerCase(),
    sanitiseSheetName(INFO_SHEET_LABEL).toLowerCase(),
  ]);
  return raw.map((r) => {
    const base = sanitiseSheetName(r);
    if (!taken.has(base.toLowerCase())) {
      taken.add(base.toLowerCase());
      return base;
    }
    for (let n = 2; n < 1000; n++) {
      const suffix = ` (${n})`;
      const trimmed = base.slice(0, MAX_SHEET_NAME - suffix.length).trim();
      const candidate = `${trimmed}${suffix}`;
      if (!taken.has(candidate.toLowerCase())) {
        taken.add(candidate.toLowerCase());
        return candidate;
      }
    }
    /* A thousand identical names is not a calendar; the engine's 60-week cap
       makes it unreachable. Falling back to something unique beats throwing
       mid-stream, when the HTTP status is already spent. */
    const fallback = sanitiseSheetName(`Sheet ${taken.size + 1}`);
    taken.add(fallback.toLowerCase());
    return fallback;
  });
}

/** "Week A - Template". The source's three template tabs, generalised to a
 *  cycle of any length. */
export function templateSheetLabel(weekLabel: string): string {
  return `${weekLabel.trim()} - Template`;
}

export const HALF_TERM_SHEET_LABEL = "Half Terms - Template";
export const INFO_SHEET_LABEL = "Export info";

/**
 * The source stores "1" as a NUMBER and "Break 1" as text. Column C is
 * centred either way, so this buys nothing visually — but a period column
 * that is text in our file and numeric in theirs is exactly the kind of
 * difference that shows up when somebody sorts or references it.
 */
export function periodLabelValue(name: string): string | number {
  const t = name.trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : t;
}

/** The long-date format the source's column B carries, verbatim. */
export const DATE_NUMFMT = "[$-F800]dddd, mmmm dd, yyyy";

/**
 * `YYYY-MM-DD` → a Date at UTC midnight.
 *
 * ⚠️ UTC, NOT LOCAL. The source's date cells read back as exactly
 * `2026-09-07T00:00:00.000Z`, and a serialiser handed a local-midnight Date
 * west of Greenwich writes the day before. Everything upstream of here is a
 * civil date precisely so that this is the only line where a Date exists at
 * all — see the DST banner in convex/lib/timetable.ts.
 */
export function civilToUtcDate(date: CivilDate): Date | null {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!p) return null;
  return new Date(Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3])));
}
