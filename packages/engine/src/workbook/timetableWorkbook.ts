/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TIMETABLE WORKBOOK WRITER — PORTABLE, AND STREAMING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⭐ WHAT CHANGED WHEN THIS LEFT MONOSPACE, AND WHAT DID NOT ────────────
 * This file is Monospace's `src/lib/timetableWorkbook.ts`, and the FOUR
 * differences below are the entire diff. Everything else — every geometry
 * decision, every merge, every argued comment — is byte-for-byte the original,
 * because the fixture gate (`npm run gate`) regenerates a workbook with
 * Monospace's own copy of this file and requires every zip member to match
 * ours. A "tidy-up" here is a gate failure, which is the point.
 *
 *   1. ⚠️ `import "server-only"` IS GONE, and its title with it. That line is
 *      a Next.js build-time tripwire: it throws if the module is ever pulled
 *      into a client bundle. Here the client bundle is the ONLY target that
 *      matters — the single self-contained `.html` a school double-clicks, and
 *      the same document inside the `.exe`. The reason the original had it was
 *      that exceljs is ~940 KB and must not reach a website's visitors; a
 *      desktop tool that exists to write .xlsx files has no such visitors.
 *
 *   2. `node:stream` became `./stream`, which the package resolves to a Node
 *      or a browser implementation. See that file's banner for why the switch
 *      is in package.json rather than in a bundler config.
 *
 *   3. ⭐⭐ exceljs IS IMPORTED AS THE STREAMING WRITER DIRECTLY, NOT THROUGH
 *      THE BARREL — and this is the one that is not obvious. `exceljs`'s
 *      package.json has `"browser": "./dist/exceljs.min.js"`, a prebuilt
 *      bundle with NO `stream` namespace on it at all, so `ExcelJS.stream`
 *      is `undefined` in a browser build and the constructor below throws.
 *      Worse, the barrel also drags in the READER — unzipper, then bluebird —
 *      which crashes on `process.versions` before any of our code runs. A
 *      deep specifier sidesteps a string-form `browser` field entirely, and
 *      pulls in the writer half only.
 *
 *      The `ExcelJS` name survives for TYPES ONLY (`import type`), which is
 *      erased at compile time and reaches no bundle.
 *
 *   4. A `bufferTimetableWorkbook()` entry point beside the streaming one, for
 *      the two callers that want bytes rather than a stream. ⚠️ IT IS NOT A
 *      SECOND WRITER — it is `streamTimetableWorkbook` with a collector on the
 *      end. Cam's rule is one writer everywhere and it is not bent here: the
 *      buffered `ExcelJS.Workbook` is not imported, referenced or reachable
 *      from this package, because it silently ignores `useSharedStrings:false`
 *      and differs from the streaming writer in 47 of 50 zip parts.
 *
 * ── AND EVERYTHING BELOW THIS LINE IS THE ORIGINAL BANNER ─────────────────
 *
 * Renders `TimetableWorkbookModel` (convex/lib/timetableSheet.ts) as the
 * workbook Cam sent: a half-term sheet, one template sheet per cycle week,
 * then one sheet per TEACHING week, each a room-by-period grid.
 *
 * It owns no geometry and no colours — those are in the pure spec beside the
 * model, so the "single named constant set" Cam asked for really is single.
 * Grep this file for a hex literal and you will find none.
 *
 * ── ⭐ WHY STREAMING, WHEN A WEEK SHEET IS ONLY 54 ROWS ────────────────────
 * The inventory export streams because ONE sheet is 20,000 rows. This one
 * streams because there are FORTY-ONE SHEETS. A buffered `Workbook` holds
 * every cell of every sheet — 41 × 54 × 12 ≈ 27,000 styled cell objects, plus
 * the style table — until `xlsx.writeBuffer()`, and then hands the result to
 * a Vercel response capped at 4.5 MB. `WorkbookWriter` finishes each sheet's
 * XML into the zip and forgets it, so peak memory is ONE sheet.
 *
 * ── ⚠️ AND THE ORDER IS LOAD-BEARING, DIFFERENTLY FROM THE OTHER WRITER ───
 * exceljs's streaming worksheet says of `mergeCells`: *"may fail if rows have
 * been committed"* (lib/stream/xlsx/worksheet-writer.js). Every sheet here is
 * dense with merges — the spine, the week band, the date down each day block,
 * every separator strip — so rows are BUILT AND NOT COMMITTED, then merged,
 * then the whole SHEET is committed, which flushes its rows and writes the
 * `<mergeCells>` element after them. Committing rows as they are added, which
 * is what the inventory writer correctly does, would throw here on the first
 * merge and the download would be a corrupt zip.
 *
 * That costs nothing: one 54-row sheet at a time is the buffer, and the
 * streaming win was always across sheets rather than within one.
 *
 * ── AND ONE THING THAT CANNOT BE STREAMED: FAILURE ────────────────────────
 * Once the first byte is out the HTTP status is spent, so a bound hit halfway
 * through cannot become a 500. The walk records why it stopped, the "Export
 * info" sheet says so in words, and `workbook.views` opens the file ON that
 * sheet. A silently short timetable is the worst outcome available: it looks
 * exactly like a complete one, and somebody teaches from it.
 */

/* ⭐ TYPES ONLY — erased at compile time, so the barrel (and its reader, and
   unzipper, and bluebird) never enters any bundle. The VALUE comes from the
   deep specifier on the next line. See diff note 3 in the banner. */
import type ExcelJS from "exceljs";
/* ⚠️ THE `.js` IS REQUIRED AND IS NOT DECORATION. This is a deep specifier
   into a package with no `exports` map, and Node's ESM loader will not guess
   an extension for one — without it `dist/` builds cleanly and throws
   ERR_MODULE_NOT_FOUND the first time anybody imports it. Bundlers resolve it
   either way, so the extensionless form works everywhere except the target
   most likely to be tried first. */
import WorkbookWriter from "exceljs/lib/stream/xlsx/workbook-writer.js";
import {
  collectSink,
  createSink,
  sinkToWeb,
  type ByteSink,
} from "./stream";
import {
  COL_DATE,
  COL_FIRST_ROOM,
  COL_PERIOD,
  COL_SPINE_LEFT,
  DATE_NUMFMT,
  DAYS_PER_WEEK,
  EXPORT_LINKED_AND_PROTECTED_NOTE,
  EXPORT_LINK_NOTE,
  EXPORT_PROTECTION_NOTE,
  HALF_TERM_BLOCK_ROWS,
  HALF_TERM_COLS,
  HALF_TERM_SHEET_LABEL,
  INFO_SHEET_LABEL,
  MAX_CLASS_LEGEND_ROWS,
  ROW_HEIGHT,
  SHEET_FILL,
  SHEET_FONT,
  SHEET_GRIDLINE,
  SHEET_TAB,
  STRUCTURE_INK,
  WIDTH_DATE,
  WIDTH_HALF_TERM_DAY,
  WIDTH_PERIOD,
  WIDTH_ROOM,
  WIDTH_SPINE,
  civilToUtcDate,
  colourForClass,
  columnLetter,
  compareClassCodes,
  describeClassCode,
  inkFor,
  sheetFills,
  tabColourForCycleWeek,
  templateLinkFormula,
  type SheetCell,
  type SheetDay,
  type TimetableWorkbookModel,
} from "../lib/timetableSheet";

/* ══════════════════════════════════════════════════════════════════════════
   ENTRY POINT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Build the workbook into a Node stream and hand back a Web `ReadableStream`
 * ready for `new Response(...)`.
 *
 * The writer runs detached; an unexpected throw destroys the stream so the
 * browser sees a failed download rather than a valid-looking truncated file.
 */
export function streamTimetableWorkbook(
  model: TimetableWorkbookModel,
): ReadableStream<Uint8Array> {
  const pass = createSink();

  void (async () => {
    try {
      await writeWorkbook(model, pass);
    } catch (err) {
      pass.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return sinkToWeb(pass);
}

/**
 * The same workbook, collected into one buffer.
 *
 * ⚠️ SAME WRITER. This is `streamTimetableWorkbook`'s body with a collector on
 * the end rather than a Web stream — the buffered `ExcelJS.Workbook` is not
 * imported anywhere in this package and must not be. See diff note 4.
 *
 * Two callers want this shape and neither can use a `ReadableStream`: the
 * fixture gate, which hashes the bytes, and the desktop shell, which hands a
 * `Uint8Array` over IPC for Rust to write to disk.
 *
 * ⚠️ A THROW REJECTS. The streaming entry point cannot fail loudly — once the
 * first byte is out the HTTP status is spent, which is why the info sheet
 * exists — but a caller holding the whole buffer has not shown anybody
 * anything yet, so here a failure really can be a failure instead of a short
 * file. Do not "improve" this into resolving with partial bytes.
 */
export async function bufferTimetableWorkbook(
  model: TimetableWorkbookModel,
): Promise<Uint8Array> {
  const pass = createSink();
  const collected = collectSink(pass);
  await writeWorkbook(model, pass);
  return collected;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CLASS PALETTE, AS THIS WRITER USES IT
   ══════════════════════════════════════════════════════════════════════════

   `colourForClass()` is pure and does real work — a gamut bisection inside a
   lightness bisection, a few hundred conversions. A week sheet has ~350 cells
   and there are forty of them, but they hold sixty-odd DISTINCT codes, so this
   memo turns ~6,000 solves into ~70. The memo is not state in the sense the
   palette forbids: same code, same answer, and the answer does not depend on
   what was asked before it.

   It doubles as the LEGEND. The info sheet is written last, so by then this
   map knows every code the workbook drew — which is what lets a black-and-white
   print be decoded at all. Both halves are bounded: a calendar with thousands
   of distinct booking labels must not turn the memo into a leak or the legend
   into the longest sheet in the file. */

/** Distinct strings the memo will hold before it stops growing. Past it the
 *  colour is still correct, just recomputed — slow beats unbounded. */
const CLASS_COLOUR_MEMO_MAX = 2000;

type ClassPalette = {
  /** The fill this cell's text earns, or `null` when it names no class. */
  fillFor(text: string | number): string | null;
  /** Every class code drawn, in a deterministic order, capped. */
  legend(): Array<{ code: string; argb: string }>;
  /** True when more codes were drawn than the legend is allowed to list. */
  truncated(): boolean;
};

function createClassPalette(): ClassPalette {
  const memo = new Map<string, string | null>();
  const seen = new Map<string, string>();
  let overflowed = false;

  return {
    fillFor(text) {
      if (typeof text !== "string") return null;
      const cached = memo.get(text);
      const argb = cached !== undefined ? cached : colourForClass(text);
      if (cached === undefined && memo.size < CLASS_COLOUR_MEMO_MAX) {
        memo.set(text, argb);
      }
      if (argb && !seen.has(text)) {
        if (seen.size < MAX_CLASS_LEGEND_ROWS) seen.set(text, argb);
        else overflowed = true;
      }
      return argb;
    },
    legend() {
      return [...seen.keys()]
        .sort(compareClassCodes)
        .map((code) => ({ code, argb: seen.get(code) as string }));
    },
    truncated() {
      return overflowed;
    },
  };
}

async function writeWorkbook(
  model: TimetableWorkbookModel,
  sink: ByteSink,
): Promise<void> {
  const wb = new WorkbookWriter({
    /**
     * ⚠️ THE ONE CAST IN THIS FILE, AND IT IS A TYPE-LEVEL ONE ONLY.
     *
     * exceljs types this parameter as Node's `Stream`, a class that does not
     * exist in a browser. `ByteSink` is the small structural surface exceljs
     * actually USES — it calls `zip.pipe(this.stream)` and nothing else on it —
     * so both implementations satisfy the library at runtime while satisfying
     * only a subset of the declared type.
     *
     * The alternative was widening `ByteSink` to Node's full `Stream`, which
     * would put `@types/node` in the browser build's required types for a
     * shape nothing calls. Casting at the single seam, with the reason
     * written down, beats being structurally dishonest in a shared type.
     */
    stream: sink as unknown as ExcelJS.stream.xlsx.WorkbookWriterOptions["stream"],
    useStyles: true,
    /* Shared strings would deduplicate the class codes — "10D/Bs" appears in
       every week — and would also mean holding every distinct string until the
       final commit, which is the one cost this writer exists to avoid. The
       zip's own deflate recovers most of it anyway. */
    useSharedStrings: false,
  });
  wb.creator = "Monospace";
  wb.created = new Date(model.notes.generatedAt);

  /* Sheet ORDER is the source's: half terms, the templates, then the year.
     A reader opens on the left-most tab, and the school's own file puts the
     reference material there.

     ⭐ EACH SHEET IS COMMITTED BEFORE THE NEXT IS CREATED. That is what bounds
     memory to one sheet: `commit()` flushes the buffered rows and the
     `<mergeCells>` element into the zip and releases them.

     ⚠️ AND THE HALF-TERM SHEET IS NEVER HIDDEN AND NEVER PROTECTED. It is the
     first tab, it carries no cell anybody types into, and it is one of the
     three sheets that make "every sheet is hidden" — the state Excel refuses
     to open a workbook in — unreachable by construction. See
     `TimetableWeekSheet.hidden`. */
  await writeHalfTermsSheet(wb, model).commit();

  /* ⭐ ONE palette for the whole workbook, so a class code drawn on the Week A
     template and again in March is the same colour both times — and so the
     info sheet's legend, written last, knows every code the file contains. */
  const palette = createClassPalette();

  /* ⭐ THE TAB COLOURS. Templates take the source's red; a week takes the
     colour of the CYCLE WEEK it is, which is a number on the model and never
     a letter parsed back out of `w.name`. See `SHEET_TAB`. */
  /**
   * ⭐ THE PASSWORD, WHICH EXISTS ONLY FOR THE LENGTH OF THIS FUNCTION.
   *
   * It arrived in a POST body, it is turned into a SHA-512 hash inside
   * `worksheet.protect()`, and it is never written anywhere else — not to the
   * organisation document, not to a log, not into the workbook. An empty
   * string is NOT a password: it means "protect with no password", which is
   * what the school's own reference file does on all 41 of its sheets.
   */
  const password = model.password || undefined;

  /* ⚠️ `protect()` RETURNS A PROMISE AND MUST BE AWAITED BEFORE `commit()`.
     exceljs's published types say `void`; the implementation hashes the
     password inside a promise and assigns `sheetProtection` in the resolver,
     so committing first writes the sheet's XML with no `<sheetProtection>` in
     it — a silently unprotected file that looks exactly like a protected one.
     Each writer below therefore returns its worksheet and this loop awaits the
     protection before the commit. */
  for (const t of model.templateSheets) {
    const ws = writeGridSheet(wb, model, t.name, t.bandLabel, t.days, palette, {
      tabColour: SHEET_TAB.template,
      /* ⚠️ A TEMPLATE SHEET IS NEVER LINKED AND NEVER HIDDEN. It is the thing
         being linked TO, and a workbook whose templates were hidden would hide
         the only sheet an admin edits to drive the auto-fill. */
      protect: model.options.protectTemplates ? "all" : "none",
    });
    if (model.options.protectTemplates) await protectSheet(ws, password);
    await ws.commit();
  }

  for (const w of model.weeks) {
    const ws = writeGridSheet(wb, model, w.name, w.bandLabel, w.days, palette, {
      tabColour: tabColourForCycleWeek(w.cycleWeek),
      hidden: w.hidden === true,
      /* Set by the ROUTE, and only when the week's day shape provably matches
         its template's — see `daysAlign()`. The writer never decides which
         template a week belongs to. */
      linkTo: w.linkTo,
      protect: model.options.lockPrefilled ? "prefilled" : "none",
    });
    if (model.options.lockPrefilled) await protectSheet(ws, password);
    await ws.commit();
  }

  const infoIndex = 1 + model.templateSheets.length + model.weeks.length;
  await writeInfoSheet(wb, model, palette).commit();

  /* Open on the explanation when there is one to read, and on the timetable
     when there is not. */
  if (!model.notes.complete) {
    wb.views = [
      {
        x: 0,
        y: 0,
        width: 10000,
        height: 20000,
        firstSheet: 0,
        activeTab: infoIndex,
        visibility: "visible",
      },
    ];
  }

  await wb.commit();
}

/**
 * exceljs's published types give `Worksheet.commit()` a `void` return, while
 * the streaming implementation returns a promise that resolves when the
 * sheet's XML has been handed to the zip. Naming the shape here beats an
 * `any` at each call site: awaiting it is what keeps one sheet in memory
 * rather than all forty-one.
 *
 * ⚠️ Do NOT reach for `WorkbookWriter.worksheets` to find the sheet to commit.
 * The implementation stores them in an array indexed by sheet ID starting at
 * 1, so the array has a hole at 0 and `.length` is one more than the sheet
 * count. Each writer below returns its own worksheet instead.
 */
type StreamWorksheet = Omit<ExcelJS.Worksheet, "commit"> & {
  commit(): Promise<void>;
};

/* ══════════════════════════════════════════════════════════════════════════
   STYLE PRIMITIVES — every one of them reads the palette, none invents one
   ══════════════════════════════════════════════════════════════════════════ */

function fill(argb: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const THIN = { style: "thin" as const, color: { argb: SHEET_GRIDLINE } };

/** The full box every grid cell carries. Merged regions get it on each member
 *  cell, which is how the source stores it and how Excel draws the outline. */
function box(): Partial<ExcelJS.Borders> {
  return { top: THIN, left: THIN, bottom: THIN, right: THIN };
}

const CENTRE: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
};

/**
 * ⭐ THE ONLY UNLOCK IN THE FILE.
 *
 * A cell with no protection style inherits the workbook default, which is
 * LOCKED — so "everything is locked except these" needs a mark on the
 * exceptions and nothing on the rest. That is the right way round: forgetting
 * to lock something would be a hole, forgetting to unlock something is a
 * visible nuisance the person reports.
 */
const UNLOCKED: Partial<ExcelJS.Protection> = { locked: false };

/**
 * ⭐ SHEET-LEVEL PROTECTION, WITH THE OPTIONS ARGUED RATHER THAN COPIED.
 *
 * ── ⚠️ WHAT THE EMPTY OPTIONS OBJECT ACTUALLY BUYS ───────────────────────
 * exceljs writes only the attributes that differ from the OOXML defaults, and
 * the OOXML defaults for `sheetProtection` are: selecting cells ALLOWED,
 * everything else — editing, formatting, inserting, deleting, sorting —
 * DISALLOWED. So passing nothing produces exactly "you may look and select,
 * you may not change", which is the policy this feature wants, in the fewest
 * possible bytes. The two flags are passed anyway because they are the two
 * this decision is ABOUT, and `selectLockedCells: true` writes nothing at all
 * (exceljs only emits the attribute for `false`).
 *
 * ── ⭐ AND SELECTION IS ALLOWED, WHERE THE SCHOOL'S OWN FILE FORBIDS IT ───
 * `IT_Room_Timetable_2627_1.xlsx` carries `<sheetProtection selectLockedCells="1"/>`
 * on all 41 sheets: you cannot even click a locked cell there. That is
 * defensible for a look-don't-touch printout and wrong for this file, because
 * ours has cells staff are meant to type in — and a teacher moving a lesson
 * copies the class code out of the cell it is in. Forbidding selection makes
 * copying impossible and makes keyboard navigation skip half the grid. Locked
 * means "you may not change this", not "you may not read this".
 *
 * ── ⚠️ AND IT IS NOT ENCRYPTION ──────────────────────────────────────────
 * With a password exceljs writes SHA-512, a 16-byte salt and 100,000 rounds —
 * stronger than the no-password protection in the school's own file — and it
 * still only guards a flag inside a readable zip. `EXPORT_PROTECTION_NOTE`
 * says so in the file and the panel says so before the click. Nothing here
 * offers password-to-open encryption, which is a different feature and one
 * exceljs cannot write.
 */
async function protectSheet(
  ws: StreamWorksheet,
  password: string | undefined,
): Promise<void> {
  await ws.protect(password as string, {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });
  hoistSheetProtection(ws);
}

/**
 * ⚠️⚠️ WHERE `<sheetProtection>` HAS TO SIT IN A SHEET'S XML, AND WHERE
 * exceljs's STREAMING WRITER PUTS IT.
 *
 * `CT_Worksheet` is an `xsd:sequence`: `sheetProtection` belongs immediately
 * after `sheetData`, BEFORE `autoFilter`, `mergeCells` and
 * `conditionalFormatting`. exceljs's BUFFERED writer knows that and says so in
 * its own source — *"Note: must be after sheetData and before autoFilter"*,
 * lib/xlsx/xform/sheet/worksheet-xform.js. ⚠️ ITS STREAMING WRITER DOES NOT.
 * `WorksheetWriter.commit()` emits the element near the end, after
 * `_writeMergeCells()` and after `_writeConditionalFormatting()`.
 *
 * ⚠️ AND EVERY GRID SHEET IN THIS WORKBOOK MERGES, so `<mergeCells>` is always
 * there and the violation is not conditional — it happens on every sheet
 * either protection option touches. Measured on the generated XML with the
 * same call order this file uses (rows buffered, merge, conditional format,
 * protect, commit): `sheetData … mergeCells … conditionalFormatting …
 * sheetProtection`, i.e. three elements too late. An out-of-sequence element
 * in a sheet part is the "we found a problem with some content" repair prompt,
 * and a repair drops what it could not place — which for a file whose whole
 * point is protection means it opens unprotected, or does not open.
 *
 * So the element is written by hand at the one place it is legal, straight
 * after `</sheetData>`, and the model is cleared so `commit()`'s own late call
 * renders nothing (the xform writes nothing at all for a null model).
 *
 * ⚠️ IT REACHES FOR TWO PRIVATE METHODS AND CHECKS BOTH EXIST FIRST. If a
 * later exceljs renames them — or fixes the order itself — the guard falls
 * through to the library's own behaviour rather than throwing mid-stream, when
 * the HTTP status is already spent and the browser is holding half a zip.
 */
type OrderableWorksheet = {
  sheetProtection?: unknown;
  _writeCloseSheetData?: () => void;
  _writeSheetProtection?: () => void;
};

function hoistSheetProtection(ws: StreamWorksheet): void {
  const target = ws as unknown as OrderableWorksheet;
  const closeSheetData = target._writeCloseSheetData;
  const writeProtection = target._writeSheetProtection;
  if (
    typeof closeSheetData !== "function" ||
    typeof writeProtection !== "function"
  ) {
    return;
  }
  target._writeCloseSheetData = () => {
    closeSheetData.call(target);
    writeProtection.call(target);
    /* Cleared so the library's own call, several elements later, renders
       nothing rather than a second `<sheetProtection>`. */
    target.sheetProtection = null;
  };
}

/** The grey furniture is centred horizontally and left alone vertically. */
const GUTTER_ALIGN: Partial<ExcelJS.Alignment> = { horizontal: "center" };

function structureFont(bold = false): Partial<ExcelJS.Font> {
  return { ...SHEET_FONT, bold, color: { argb: STRUCTURE_INK } };
}

/** ⭐ The only way a value-coloured font is produced anywhere in this file. */
function inputFont(origin: Parameters<typeof inkFor>[0]): Partial<ExcelJS.Font> {
  return { ...SHEET_FONT, color: { argb: inkFor(origin) } };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE GRID SHEET — a template week, or a real one. Same geometry.
   ══════════════════════════════════════════════════════════════════════════

   Rows 1..H are the header band: the room codes, then one row per custom
   field. H is `1 + fieldDefs.length`, which is 4 for the source's three
   fields and is why its panes freeze at row 4.

   Below it, per day: a one-row separator strip, then one row per period.

   ⚠️ THE BLOCK HEIGHT IS THE DAY'S PERIOD COUNT, NOT NINE. The source has
   nine periods on all five days so its blocks are uniform; a calendar with a
   Friday that finishes early genuinely has a shorter Friday block, and
   hardcoding the source's nine would draw two empty rows on it. */

/**
 * ⭐ WHAT MAKES ONE GRID SHEET DIFFER FROM ANOTHER, beyond its content.
 *
 * Four fields rather than four positional arguments, because three of them are
 * optional and `writeGridSheet(wb, model, name, band, days, palette, red,
 * undefined, false, "prefilled")` is a call nobody can read or safely reorder.
 */
type GridSheetOptions = {
  /** The tab's colour, or `undefined` for a week with no cycle position. */
  tabColour: string | undefined;
  /** `state="hidden"` on the workbook entry. Week sheets only. */
  hidden?: boolean;
  /**
   * The FINAL name of the template sheet whose cells this sheet's
   * template-derived cells should point at, or `undefined` for plain values.
   */
  linkTo?: string;
  /**
   * ⭐ WHAT WORKSHEET PROTECTION THIS SHEET GETS.
   *
   *   "none"       nothing. What every sheet of every export got before this.
   *   "all"        the whole sheet, every cell locked — a template, which is
   *                the school's standing timetable and not a scratch pad.
   *   "prefilled"  `cellRights()` in Excel: the lessons and bookings locked,
   *                the free periods left editable. ⚠️ AND NOT EVERY free
   *                period — this writer applies no rule of its own, it reads
   *                `SheetCell.locked`, and a RETIRED room's column comes back
   *                locked in full because `cellRights` answers `retired`
   *                above every question about what is in the cell.
   *
   * ⚠️ IT ONLY SETS THE PER-CELL FLAGS. The sheet-level `protect()` call is
   * awaited by the CALLER, because it returns a promise that must resolve
   * before `commit()` — see the loop in `writeWorkbook`.
   */
  protect: "none" | "all" | "prefilled";
};

function writeGridSheet(
  wb: ExcelJS.stream.xlsx.WorkbookWriter,
  model: TimetableWorkbookModel,
  name: string,
  bandLabel: string,
  days: SheetDay[],
  palette: ClassPalette,
  opts: GridSheetOptions,
): StreamWorksheet {
  const rooms = model.rooms;
  const headerRows = 1 + model.fieldDefs.length;
  const colSpineRight = COL_FIRST_ROOM + rooms.length;
  /* ⭐ THE SCHOOL'S OWN ACCENT, OR THE DEFAULT PURPLE WHEN IT HAS NONE.
     `sheetFills` returns `SHEET_FILL` ITSELF for the default, so a school that
     never opened Customise gets a byte-identical file. The gutter and the
     input white are not accent-derived and are read from it unchanged. */
  const fills = sheetFills(model.accent);

  const ws = wb.addWorksheet(name, {
    /* ⚠️ `properties` AND NOT THE DEPRECATED `tabColor` OPTION, which exceljs
       accepts and answers with a `console.trace` on every sheet. Omitted
       entirely when there is no colour, so the sheet's `<sheetPr>` is written
       exactly as it was before this existed. */
    properties: opts.tabColour ? { tabColor: { argb: opts.tabColour } } : undefined,
    /* ⭐ HIDDEN, NEVER OMITTED. The sheet is written in full — every cell,
       every merge, its tab colour — and carries `state="hidden"` on the
       workbook entry. A school that wants March back right-clicks a tab and
       chooses Unhide; a school handed a workbook that simply stops in March
       has lost it. ⚠️ AND NOT `"veryHidden"`, which needs the VBA editor to
       reverse and is therefore a delete wearing a nicer word. */
    state: opts.hidden ? "hidden" : undefined,
    views: [
      {
        state: "frozen",
        xSplit: 0,
        ySplit: headerRows,
        topLeftCell: `A${headerRows + 1}`,
      },
    ],
  }) as StreamWorksheet;

  ws.columns = [
    { width: WIDTH_SPINE },
    { width: WIDTH_DATE },
    { width: WIDTH_PERIOD },
    ...rooms.map(() => ({ width: WIDTH_ROOM })),
    { width: WIDTH_SPINE },
  ];

  /* ── The header band ─────────────────────────────────────────────────── */

  const head = ws.getRow(1);
  head.height = ROW_HEIGHT;
  const bandCell = head.getCell(COL_DATE);
  bandCell.value = bandLabel;
  bandCell.fill = fill(fills.structure);
  bandCell.font = structureFont(true);
  bandCell.alignment = CENTRE;

  /* C1 is empty and filled — the corner above the period column. */
  const corner = head.getCell(COL_PERIOD);
  corner.fill = fill(fills.structure);
  corner.font = structureFont();

  rooms.forEach((room, i) => {
    const c = head.getCell(COL_FIRST_ROOM + i);
    c.value = room.name;
    c.fill = fill(fills.structure);
    /* ⭐ A ROOM CODE IS STRUCTURE, NOT INPUT. It names a column; it is not a
       value somebody entered into one. Its custom fields below it ARE. */
    c.font = structureFont(true);
    c.alignment = CENTRE;
  });

  model.fieldDefs.forEach((def, fi) => {
    const row = ws.getRow(2 + fi);
    row.height = ROW_HEIGHT;

    const label = row.getCell(COL_PERIOD);
    label.value = def.label;
    label.fill = fill(fills.structure);
    /* Left-aligned, as the source has it — the labels read as a list down
       the column while every value to their right is centred. */
    label.font = structureFont();

    rooms.forEach((room, i) => {
      const c = row.getCell(COL_FIRST_ROOM + i);
      const v = room.fields[def.id];
      if (v !== undefined && v !== "") c.value = v;
      c.fill = fill(fills.structure);
      /* ⭐ ADMIN-ENTERED, SO IT TAKES THE INPUT INK even though it sits on
         the structure band. The rule is provenance, not position — which is
         the whole reason `inkFor` takes an origin and not a cell. */
      c.font = inputFont("field");
      c.alignment = CENTRE;
    });
  });

  /* ── The day blocks ──────────────────────────────────────────────────── */

  let rowNum = headerRows;
  days.forEach((day, dayIndex) => {
    rowNum += 1;
    const sepRow = rowNum;
    writeSeparator(ws, sepRow, colSpineRight, dayIndex === 0);

    /* Blocks alternate between the two structure tints, starting on the
       darker one — measured off the source, where block 1 is @40% and block 2
       is @60%. A single flat purple is visibly not this file. */
    const bandFill =
      dayIndex % 2 === 0 ? fills.structureAlt : fills.structure;

    const blockStart = rowNum + 1;
    day.periods.forEach((period, pi) => {
      rowNum += 1;
      const row = ws.getRow(rowNum);
      row.height = ROW_HEIGHT;

      const dateCell = row.getCell(COL_DATE);
      if (pi === 0) {
        const d = civilToUtcDate(day.date);
        if (d) {
          dateCell.value = d;
          dateCell.numFmt = DATE_NUMFMT;
        } else {
          dateCell.value = day.date;
        }
      }
      dateCell.fill = fill(bandFill);
      dateCell.font = structureFont();
      dateCell.alignment = { ...CENTRE, wrapText: true };
      dateCell.border = box();

      const periodCell = row.getCell(COL_PERIOD);
      periodCell.value = period.label;
      periodCell.fill = fill(bandFill);
      periodCell.font = structureFont();
      periodCell.alignment = CENTRE;
      periodCell.border = box();

      rooms.forEach((_room, ri) => {
        const col = COL_FIRST_ROOM + ri;
        const c = row.getCell(col);
        /* ⚠️ `locked: true` ON THE FALLBACK, NOT AN OMISSION. A cell the model
           does not carry is one this writer knows nothing about, and the
           default for "I do not know" is the same as the default for a cell
           with no protection style at all: LOCKED. `cellFor` in the export
           route answers a missing resolver cell the same way, for the same
           reason. */
        const cell: SheetCell = day.cells[pi]?.[ri] ?? {
          kind: "free",
          locked: true,
        };
        c.border = box();
        c.alignment = CENTRE;

        /**
         * ⭐⭐ THE LOCK, READ OFF THE CELL — AND THE ONLY PLACE PROTECTION IS
         * DECIDED IN THIS FILE.
         *
         * ⚠️ IT IS `cell.locked` AND NOT `cell.kind`, AND THAT DISTINCTION IS
         * THE WHOLE POINT OF THE FIELD. `locked` is `!cellRights(state,
         * rights).canEdit`, asked by the route against the SAME function the
         * published board and `bookingPublished.setCell` ask. Deciding it here
         * from the kind is the "rule in the writer" the field's own banner
         * exists to forbid, and both ways it was wrong:
         *
         *   • a cell somebody had CHANGED on the website (`kind: "value"`,
         *     `origin: "override"`) came out LOCKED, though rule three says any
         *     member may edit it — the exact case this wave was sent to fix,
         *     re-broken one layer down from the fix;
         *   • every cell of a RETIRED room (`active: false`, so `cellRights`
         *     refuses everybody with "that room is out of service") came out
         *     UNLOCKED wherever it was empty, so the one column the file must
         *     not invite typing into was the one it opened.
         *
         * ⚠️ ABOVE THE `blocked` EARLY RETURN, so no branch can forget it.
         * Every branch below sets a fill, so the cell always carries a style
         * and an empty unlocked cell cannot be dropped by the streaming writer
         * — which is the failure the free-cell branch used to warn about.
         */
        if (opts.protect === "prefilled" && !cell.locked) {
          c.protection = UNLOCKED;
        }

        if (cell.kind === "blocked") {
          /* A break, a lunch, or a weekday the school is closed. Structure
             colour says "not a cell you write in" using the same visual
             language as the rest of the furniture.

             ⚠️ AND IT STAYS LOCKED AND STAYS LITERAL under both new options.
             `cellRights()` refuses a break and a closed day to everybody
             including an org admin, and a formula here would drag a closure
             back to whatever the template says runs at that hour. */
          c.fill = fill(bandFill);
          c.font = structureFont();
          return;
        }

        /**
         * ⭐⭐ THE CELLS THAT FOLLOW THE TEMPLATE, and exactly those.
         *
         * A cell is template-derived when it shows the standing lesson
         * (`origin: "lesson"`) or is `kind: "free"` — because a free cell means
         * the template has nothing there either, so a template edit is what
         * should fill it. Both cases are `resolvePublishedRoom` returning the
         * template layer untouched.
         *
         * ⚠️ IT IS `kind === "free"` AND NOT "the cell is empty", AND THE
         * DIFFERENCE IS `cleared`. This comment used to name `resolveWeekGrid`
         * — the resolver the route used before it read `bookingWeekOverrides`
         * at all — which had no `cleared` state to describe, so "shows nothing
         * at all" was a complete account of an empty cell and is now a
         * SUPERSET of the linked ones. A `cleared` cell is an override that
         * deliberately emptied the slot; linking it would point it at the very
         * lesson somebody moved off, and Excel would put the class back on the
         * first recalculation. See `SheetCell`'s own banner.
         *
         * ⚠️ AND A BOOKING IS NOT ONE. `origin: "booking"` is somebody who
         * deliberately took the room for one week; pointing it at the template
         * would drag it back to the standing lesson and silently undo the
         * booking on every sheet. That is the same reason `cellRights()` puts
         * HELD above every other rule. Blocked cells returned above, and the
         * whole question is moot on a template sheet, which is never linked.
         */
        const linkTo = opts.linkTo;
        const linked =
          linkTo !== undefined &&
          (cell.kind === "free" ||
            (cell.kind === "value" && cell.origin === "lesson"));
        const formula = linked
          ? templateLinkFormula(linkTo as string, col, rowNum)
          : null;

        if (cell.kind !== "value") {
          c.fill = fill(SHEET_FILL.input);
          c.font = structureFont();
          /* ⭐ A FREE PERIOD IS LINKED TOO. That is what makes "if these are
             edited it auto fills every week" true for a lesson ADDED to a
             template rather than only for one changed — without it, a new
             lesson would appear on the template and nowhere else. The `IF`
             guard inside `templateLinkFormula` is what stops the empty case
             printing `0` across forty tabs. No `result`: there is nothing to
             cache, and Excel evaluates it to "" on open. */
          if (formula) c.value = { formula };
          /* ⚠️ THE FILL ABOVE IS LOAD-BEARING, not decoration: an EMPTY cell
             carrying only a protection style is at risk of being dropped by
             the streaming writer, and a dropped style inherits the default,
             which is LOCKED — precisely the cells staff are supposed to type
             into. The unlock itself is decided once, above the `blocked`
             branch, from `cell.locked`. */
          return;
        }

        /* ⭐ `result` IS THE CACHED VALUE, so the cell reads correctly in any
           tool that does not evaluate formulas — a preview pane, a script, a
           mail client's viewer — rather than showing blank until Excel
           recalculates. Excel overwrites it on open, which is the point. */
        c.value = formula ? { formula, result: cell.text } : cell.text;

        /* ⭐ THE ONLY PLACE A CLASS COLOUR REACHES A CELL. `null` means the
           text names no class — a free-text booking, "Booked", a typed "-" —
           and then nothing changes: white input fill, blue input ink, exactly
           as before this feature existed. */
        const classFill = palette.fillFor(cell.text);
        if (!classFill) {
          c.fill = fill(SHEET_FILL.input);
          c.font = inputFont(cell.origin);
          return;
        }

        c.fill = fill(classFill);
        /* ⚠️ BLACK ON A CLASS FILL, NOT THE INPUT BLUE — and this is measured,
           not taste. #0000FF against the Year 11 rung of the ladder is 3.4:1,
           which fails WCAG AA outright; the ladder's whole point is that the
           older years are darker, so the blue gets worse exactly where most of
           the timetable is. Black clears 8.3:1 on the darkest fill and 14.1:1
           on the lightest. The fill has taken over the job the ink was doing:
           a coloured cell is a cell somebody filled in, and it says so louder
           than a blue word on white ever did. */
        c.font = structureFont();
      });
    });

    /* The date spans its block — one merge per day, as the source has it. */
    if (day.periods.length > 1) {
      ws.mergeCells(blockStart, COL_DATE, rowNum, COL_DATE);
    }
  });

  const lastRow = Math.max(rowNum, headerRows);

  /* ── The spines. Merged full height, grey, and empty ──────────────────── */
  writeSpine(ws, COL_SPINE_LEFT, lastRow);
  writeSpine(ws, colSpineRight, lastRow);

  /* ── The merges that had to wait until the height was known ───────────── */
  if (headerRows > 1) ws.mergeCells(1, COL_DATE, headerRows, COL_DATE);

  /* ══════════════════════════════════════════════════════════════════════
     ⭐⭐ THE COLOURS THAT SURVIVE AN EDIT
     ══════════════════════════════════════════════════════════════════════

     ⚠️ WITHOUT THIS, LINKING UNDOES THE CLASS COLOURS. Excel formulas copy
     VALUES, not formats: change `10D/Bs` to `11B/Cs` on the Week A template
     and every linked week updates its text and keeps Year 10's fill. The
     colour ladder exists so a year group reads off the grid at a glance, and
     that is exactly the thing that would silently start lying.

     So one rule per class code, per sheet, whose `dxf` fill is
     `colourForClass()` for that code — the SAME function the static fills come
     from, asked the same question, so the app, the export and the rule cannot
     disagree.

     ⚠️ THE dxf FILL COLOUR IS `bgColor`, NOT `fgColor`. A normal cell fill
     takes a solid colour from `fgColor`; a differential format's takes it from
     `bgColor`. Written with `fgColor` the rules validate, open without
     complaint, and colour nothing at all. Measured, both ways, against the
     generated XML.

     ⚠️ AND IT ONLY COVERS CODES THE WORKBOOK ALREADY CONTAINS. A class code
     nobody has taught yet has no rule and comes out white. That is a real
     limit — the alternative is enumerating a code space that has no end — and
     the panel and the info sheet both say it rather than letting somebody
     discover it in September.

     ⭐ AND ONLY WHEN LINKING IS ON. `model.classCodes` is empty otherwise:
     nothing in an unlinked workbook can change after it is written, so the
     static fills are already right and ~2,900 rules would be weight with no
     job. The route decides; this reads the decision. */
  if (model.classCodes.length > 0) {
    const rules: ExcelJS.ConditionalFormattingRule[] = [];
    model.classCodes.forEach((code, i) => {
      const argb = palette.fillFor(code);
      /* `null` means the text names no class, so there is no colour to defend
         and no rule to write. The route filters these out already; this is the
         belt to that braces, and it costs one map lookup. */
      if (!argb) return;
      rules.push({
        type: "cellIs",
        operator: "equal",
        priority: i + 1,
        /* An Excel string literal, with any internal quote doubled. Class
           codes cannot contain one — `parseClassCode` would not have matched —
           but a rule set built from user text should not depend on that. */
        formulae: [`"${code.replace(/"/g, '""')}"`],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb } },
          /* ⭐⭐ AND THE INK MOVES WITH THE FILL. The rule used to restyle the
             FILL ALONE, which is only half of what a static class cell is: the
             writer pairs a class fill with `structureFont()` — BLACK — and
             pairs white with the input BLUE, and the argument for that pairing
             is measured (see the ⚠️ beside `c.font = structureFont()` above:
             #0000FF on the Year 11 rung is 3.4:1 and fails WCAG AA, black
             clears 8.3:1 on the darkest rung).

             ⚠️ SO THE HALF-RULE INVERTED THAT PAIRING ON EXACTLY THE CELLS
             THIS FEATURE EXISTS FOR. A linked cell whose template said
             something that is NOT a class code — "Staff meeting", "INSET" —
             carries the blue input ink, because `colourForClass` returned null
             for it. Retype that template cell to `10D/Bs` and the rule fires,
             paints the Year 10 tint under it, and leaves the ink BLUE: the one
             combination the file's own comment rules out, produced by the one
             feature that can change a cell after export. Verified by generating
             the workbook and reading `dxfs` back — the `<dxf>` held a `<fill>`
             and nothing else.

             Same constant the static branch uses, so a cell that reaches its
             colour through a rule and a cell that was born with it are the same
             two bytes. */
          font: { color: { argb: STRUCTURE_INK } },
        },
      });
    });
    if (rules.length > 0) {
      /* The whole input area in one `sqref`. It sweeps up the merged separator
         strips between day blocks, which is harmless — they are empty and no
         `equal` rule matches empty — and it is one element rather than one per
         day block. */
      ws.addConditionalFormatting({
        ref: `${columnLetter(COL_FIRST_ROOM)}${headerRows + 1}:${columnLetter(
          colSpineRight - 1,
        )}${lastRow}`,
        rules,
      });
    }
  }

  return ws;
}

/**
 * A separator strip: one grey row spanning the date column to the last room.
 *
 * The first one carries a bottom rule only, the rest carry top AND bottom —
 * measured, and it is what makes the very first block read as attached to the
 * header band rather than floating below a line of its own.
 */
function writeSeparator(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  colSpineRight: number,
  first: boolean,
): void {
  const row = ws.getRow(rowNum);
  row.height = ROW_HEIGHT;
  const border: Partial<ExcelJS.Borders> = first
    ? { bottom: THIN }
    : { top: THIN, bottom: THIN };
  for (let c = COL_DATE; c < colSpineRight; c++) {
    const cell = row.getCell(c);
    cell.border = border;
    cell.font = structureFont();
  }
  row.getCell(COL_DATE).fill = fill(SHEET_FILL.gutter);
  ws.mergeCells(rowNum, COL_DATE, rowNum, colSpineRight - 1);
}

function writeSpine(ws: ExcelJS.Worksheet, col: number, lastRow: number): void {
  const top = ws.getRow(1).getCell(col);
  top.fill = fill(SHEET_FILL.gutter);
  top.font = structureFont();
  if (lastRow > 1) ws.mergeCells(1, col, lastRow, col);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE HALF TERMS SHEET — the same skeleton, transposed
   ══════════════════════════════════════════════════════════════════════════

   ⚠️ IT IS NOT A WEEK SHEET WITH DIFFERENT CONTENT. Its columns are DAYS, not
   rooms: A is the first week's cycle label, B..F are that week's Mon–Fri,
   G..K are the following week's, and L is the second week's label. Each
   closure run is one nine-row block — nine because the geometry was copied
   from a week sheet in the school's own file, not because nine means
   anything here.

   Its width is therefore FIXED at twelve columns whatever the room count is,
   and its day columns are their own width. */

/** B..K: the ten weekday columns between the two label spines. */
const HALF_TERM_WEEKDAY_COLS = HALF_TERM_COLS - 2;

function writeHalfTermsSheet(
  wb: ExcelJS.stream.xlsx.WorkbookWriter,
  model: TimetableWorkbookModel,
): StreamWorksheet {
  const fills = sheetFills(model.accent);
  const headerRows = 1 + model.fieldDefs.length;
  const lastCol = HALF_TERM_COLS;

  const ws = wb.addWorksheet(HALF_TERM_SHEET_LABEL, {
    /* The source's half-term tab is red, the same as its two week templates —
       the three reference sheets read as one set at the left of the strip. */
    properties: { tabColor: { argb: SHEET_TAB.template } },
    views: [
      {
        state: "frozen",
        xSplit: 0,
        ySplit: headerRows,
        topLeftCell: `A${headerRows + 1}`,
      },
    ],
  }) as StreamWorksheet;

  ws.columns = [
    { width: WIDTH_SPINE },
    ...Array.from({ length: HALF_TERM_COLS - 2 }, () => ({
      width: WIDTH_HALF_TERM_DAY,
    })),
    { width: WIDTH_SPINE },
  ];

  /* The title band, one merged block across every day column. */
  for (let r = 1; r <= headerRows; r++) {
    const row = ws.getRow(r);
    row.height = ROW_HEIGHT;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      const spine = c === 1 || c === lastCol;
      cell.fill = fill(spine ? SHEET_FILL.gutter : fills.structure);
      cell.font = structureFont(!spine);
      /* The grey spine is centred HORIZONTALLY only — measured. Giving it
         `vertical: middle` too is invisible on an empty cell and shows up as
         a diff against the source for no reason. */
      cell.alignment = spine ? GUTTER_ALIGN : CENTRE;
    }
  }
  ws.getRow(1).getCell(2).value = "Half Terms";

  let rowNum = headerRows;
  model.halfTerms.forEach((block) => {
    rowNum += 1;
    writeFullWidthStrip(ws, rowNum, lastCol);

    const blockStart = rowNum + 1;
    for (let i = 0; i < HALF_TERM_BLOCK_ROWS; i++) {
      rowNum += 1;
      const row = ws.getRow(rowNum);
      row.height = ROW_HEIGHT;

      const left = row.getCell(1);
      if (i === 0) left.value = block.leftLabel;
      left.font = structureFont(true);
      left.alignment = CENTRE;
      left.border = { right: THIN };

      for (let d = 0; d < HALF_TERM_WEEKDAY_COLS; d++) {
        const cell = row.getCell(2 + d);
        if (i === 0) {
          const civil = block.days[d];
          const date = civil ? civilToUtcDate(civil) : null;
          if (date) cell.value = date;
          /* The format goes on even when there is no date: a one-week closure
             leaves G..K empty and the source still formats them, so the two
             halves of the block stay identical cells with one of them blank
             rather than two different kinds of cell. */
          cell.numFmt = DATE_NUMFMT;
        }
        cell.fill = fill(fills.structureAlt);
        cell.font = structureFont();
        cell.alignment = { ...CENTRE, wrapText: true };
        cell.border = { top: THIN, left: THIN, right: THIN };
      }

      const right = row.getCell(lastCol);
      if (i === 0) right.value = block.rightLabel;
      right.font = structureFont(true);
      right.alignment = CENTRE;
      right.border = { left: THIN, right: THIN };
    }

    const blockEnd = rowNum;
    if (blockEnd > blockStart) {
      for (let c = 1; c <= lastCol; c++) {
        ws.mergeCells(blockStart, c, blockEnd, c);
      }
    }
  });

  /* The trailing strip the source closes the sheet with — and it is the one
     row in the workbook with no explicit height, so it renders slightly
     thinner than the rest. Matched, because "why is the last bar a different
     size" is a question worth not raising. */
  rowNum += 1;
  writeFullWidthStrip(ws, rowNum, lastCol, false);

  /* The title spans the day columns whatever the header band's height is —
     a school with no custom fields has a one-row band, and the title still
     has to span it horizontally. Only the two spine merges are conditional,
     because a 1×1 merge is not a merge. */
  ws.mergeCells(1, 2, headerRows, lastCol - 1);
  if (headerRows > 1) {
    ws.mergeCells(1, 1, headerRows, 1);
    ws.mergeCells(1, lastCol, headerRows, lastCol);
  }

  return ws;
}

function writeFullWidthStrip(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  lastCol: number,
  sized = true,
): void {
  const row = ws.getRow(rowNum);
  if (sized) row.height = ROW_HEIGHT;
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(SHEET_FILL.gutter);
    cell.font = structureFont();
    cell.alignment = GUTTER_ALIGN;
  }
  ws.mergeCells(rowNum, 1, rowNum, lastCol);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE INFO SHEET
   ══════════════════════════════════════════════════════════════════════════

   Not in the source file, and added anyway, for two reasons that both outrank
   pixel fidelity:

     1. A bounded export that hits a bound must SAY SO in the artefact. The
        status line is gone by the time the last sheet is written, so the file
        is the only place left to say it, and a timetable that quietly stops in
        March is one somebody teaches from.
     2. It carries the colour key. Cam has asked for a convention the school's
        own file does not use yet; the file should explain itself to the
        person who opens it next. */

function writeInfoSheet(
  wb: ExcelJS.stream.xlsx.WorkbookWriter,
  model: TimetableWorkbookModel,
  palette: ClassPalette,
): StreamWorksheet {
  /* ⚠️ NO TAB COLOUR, ON PURPOSE. Every coloured tab in the source means
     something — red is a template, and the two week tints are the cycle — and
     this sheet is not in the source at all. The one uncoloured tab in the
     strip is a clearer "this one is not part of the timetable" than a fourth
     invented meaning would be. */
  const ws = wb.addWorksheet(INFO_SHEET_LABEL) as StreamWorksheet;
  ws.columns = [{ width: 26 }, { width: 78 }];

  const line = (label: string, value: string, emphasis = false) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = structureFont(true);
    row.getCell(2).font = emphasis
      ? { ...SHEET_FONT, bold: true, color: { argb: STRUCTURE_INK } }
      : structureFont();
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  };

  line("Timetable", model.calendarName);
  line("Organisation", model.orgName);
  line("Exported by", model.notes.generatedBy);
  line("Exported at", new Date(model.notes.generatedAt).toISOString());
  line("Timezone", model.notes.timezone);
  line(
    "Holidays",
    model.notes.holidayMode === "pause"
      ? "The week cycle PAUSES over a closure and resumes where it left off."
      : "The week cycle CONTINUES through a closure.",
  );
  line("Rooms", String(model.rooms.length));
  line("Teaching weeks", String(model.weeks.length));

  writeOptionNotes(ws, model, line);

  ws.addRow([]);
  line("Colour key", "Purple is the sheet itself. A white cell is one nobody has filled in.");
  const key = ws.addRow([
    "",
    "Anything a person entered that is not a class — an ad-hoc booking, a room's details, a \"-\" meaning not applicable — is written in this colour on white.",
  ]);
  key.getCell(2).font = inputFont("lesson");
  key.getCell(2).alignment = { wrapText: true, vertical: "top" };

  writeClassLegend(ws, palette, line);

  if (!model.notes.complete) {
    ws.addRow([]);
    line("⚠️ INCOMPLETE", "This export stopped early. What follows is why.", true);
    for (const r of model.notes.reasons) {
      const row = ws.addRow(["", r]);
      row.getCell(2).font = structureFont();
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }
  }

  return ws;
}

/**
 * ⭐⭐ WHAT WAS SWITCHED ON, SAID IN THE FILE ITSELF.
 *
 * Three of the four options change what the workbook IS rather than what it
 * looks like, and all three are invisible to somebody who did not press the
 * button:
 *
 *   • a linked workbook is a LIVE DOCUMENT. Open it in June, correct a typo on
 *     the Week A template, and every week of the year — including the ones
 *     already taught — changes to match. Anybody who finds a formula where
 *     they expected a class code will otherwise "fix" it back to a value, and
 *     the school loses the feature one cell at a time without ever deciding to.
 *   • hidden sheets look like sheets that were never written. `Unhide` is two
 *     clicks and impossible to guess at.
 *   • protection looks like security and is not.
 *
 * So the file explains itself. This is the same argument the incomplete-export
 * notice below rests on: the status line is gone by the time anybody opens
 * this, and the artefact is the only place left to say anything.
 */
function writeOptionNotes(
  ws: StreamWorksheet,
  model: TimetableWorkbookModel,
  line: (label: string, value: string, emphasis?: boolean) => void,
): void {
  const o = model.options;
  const hidden = model.weeks.filter((w) => w.hidden).length;
  const notes = model.notes.optionNotes ?? [];
  /* ⚠️ `notes.length` IS IN THE TEST DELIBERATELY. Every `optionNote` the
     route can produce today is raised under `linkTemplates`, so this early
     return has never swallowed one — which is exactly the kind of fact that
     stops being true quietly. A note nobody prints is worse than no note: it
     was written because something fell short, and the file would then say
     nothing about it. */
  if (
    !o.linkTemplates &&
    !o.hideEndedWeeks &&
    !o.protectTemplates &&
    !o.lockPrefilled &&
    notes.length === 0
  ) {
    return;
  }

  ws.addRow([]);
  line("How this was exported", "Options set in Timetable → Export.", true);

  if (o.linkTemplates) {
    line("⚠️ Live document", EXPORT_LINK_NOTE, true);
    line(
      "",
      "Typing over a linked cell replaces the link for that one cell — the same thing an override is on the website, except that Excel cannot put it back.",
    );
    /* ⚠️⚠️ THIS SENTENCE USED TO CLAIM BOTH DIRECTIONS AND ONLY ONE IS TRUE.
       A conditional format ADDS a style on top of the cell's own; it cannot
       take one away. So `10D/Bs` retyped to `11B/Cs` re-colours (rule fires),
       and `10D/Bs` retyped to "Staff meeting" does NOT go back to white — no
       rule matches, and the Year 10 fill the cell was BORN with is still
       underneath. The old wording ("a class code that appears nowhere in this
       workbook has no rule and stays white") described a cell that started
       white and was read as describing every cell. See the conditional
       formatting block above for why the static fill stays. */
    line(
      "",
      model.classCodes.length > 0
        ? `Class colours follow the text in ONE direction: ${model.classCodes.length} class codes carry a conditional-format rule, so retyping a cell to one of them paints it that class's colour. Retyping it to anything WITHOUT a rule — a class this workbook does not contain, "Staff meeting", a note — leaves the colour it was exported with. Read those cells by their text, not their fill.`
        : "No class codes were found to colour, so a retyped cell keeps whatever fill it has.",
    );
  }

  if (o.hideEndedWeeks) {
    line(
      "Hidden weeks",
      hidden === 0
        ? "No week had fully ended when this was exported, so nothing is hidden."
        : `${hidden} week${hidden === 1 ? " has" : "s have"} fully ended and ${hidden === 1 ? "is" : "are"} hidden. Nothing was deleted — right-click any tab and choose Unhide. The templates and the half terms are never hidden.`,
    );
  }

  if (o.protectTemplates || o.lockPrefilled) {
    /* ⚠️ THESE THREE SENTENCES ARE MEASURED AGAINST WHAT THE WRITER ACTUALLY
       DID, not against the switch's name. Two claims were wrong:

         · "the template sheets" — `protectTemplates` protects the CYCLE-WEEK
           template tabs. The tab named "Half Terms - Template" is written by
           `writeHalfTermsSheet` and is never protected and never hidden, on
           purpose; a reader who checked the one tab with Template in its name
           found it editable and had no way to know whether the option worked.
         · "the free periods stay editable" — false for a RETIRED room, whose
           whole column `cellRights` refuses to everybody. The route names
           those rooms in `optionNotes`, printed a few rows below this. */
    const what = o.protectTemplates && o.lockPrefilled
      ? "The cycle-week template sheets are read-only, and on the week sheets the timetabled lessons and bookings are locked while the free periods of rooms in service stay editable."
      : o.protectTemplates
        ? "The cycle-week template sheets are read-only. The week sheets are not protected."
        : "On the week sheets the timetabled lessons and bookings are locked and the free periods of rooms in service stay editable. The templates are not protected.";
    line("Protected sheets", what);
    if (o.protectTemplates) {
      line(
        "",
        `"${HALF_TERM_SHEET_LABEL}" is NOT protected, despite its name — nothing is typed into it, and it is one of the sheets that keep this workbook openable when every week tab is hidden.`,
      );
    }
    line("", EXPORT_PROTECTION_NOTE, true);
    line(
      "",
      model.password
        ? "A password was set when this file was exported. It is not stored anywhere in Monospace — whoever exported it is the only person who has it."
        : "No password was set, so anyone can lift the protection from the Review tab.",
    );
  }

  /* ⭐ THE COMBINATION, AND ONLY WHEN IT IS ACTUALLY ON. Neither switch's own
     sentence may describe the other — that rule is what the split of
     `hideEndedWeeks` bought — so the pair gets its own line, from the one
     constant the panel also reads. See `EXPORT_LINKED_AND_PROTECTED_NOTE`. */
  if (o.linkTemplates && o.protectTemplates) {
    line("⚠️ Locked templates", EXPORT_LINKED_AND_PROTECTED_NOTE, true);
  }

  /* ⭐ WHERE AN OPTION FELL SHORT — said HERE, beside the switch that caused
     it, and never in `reasons`. `reasons` means the export stopped early and
     prints "⚠️ INCOMPLETE" over a file that is missing data; a week that holds
     plain values, or a class code past the rule cap, is a complete timetable
     with one convenience trimmed. See `WorkbookNotes.optionNotes`. */
  for (const n of notes) line("", n);
}

/**
 * ⭐ THE LEGEND — and the reason the colouring survives a photocopier.
 *
 * Sixty-odd fills cannot all be told apart in greyscale; nothing can make them
 * be. So the scheme was built to put the signal somewhere a mono print keeps
 * it — the YEAR GROUP is the lightness ladder, and reads as five distinct
 * greys — and everything finer is carried by the code written in the cell.
 * This sheet is the third leg: the code, its own fill behind it, and what it
 * decomposes to. Somebody holding a black-and-white printout can still find
 * out that the sand-coloured block is Year 10 Business Studies.
 *
 * It is written from what the WRITER actually drew, not from the model, so a
 * code that appears on one week's sheet and nowhere else is in it, and a code
 * that was bounded out of the export is not.
 *
 * ⚠️ ONE THING NOW SEEDS IT EARLY: the conditional-formatting block asks the
 * palette for each of `model.classCodes` while writing the FIRST grid sheet, so
 * under linking the legend is complete before the last week is drawn. That does
 * not change what it contains — `classCodes` is gathered from the same cells —
 * only when. Worth knowing if the ordering here is ever relied on.
 */
function writeClassLegend(
  ws: StreamWorksheet,
  palette: ClassPalette,
  line: (label: string, value: string, emphasis?: boolean) => void,
): void {
  const entries = palette.legend();
  if (entries.length === 0) return;

  ws.addRow([]);
  line(
    "Class colours",
    "Every class code has its own fill, and the same one on every sheet of every export. The YEAR GROUP sets how light it is, the SUBJECT sets the hue, and the band and set letter shift it very slightly — so two classes of one subject look like relatives rather than strangers.",
  );
  line(
    "",
    "Printed in black and white the year groups stay ten or more grey levels apart, so they still read; the subject does not, which is why the code is written in the cell as well. This is the key to it.",
  );
  ws.addRow([]);

  for (const { code, argb } of entries) {
    const row = ws.addRow([code, describeClassCode(code)]);
    row.height = ROW_HEIGHT;
    const swatch = row.getCell(1);
    swatch.fill = fill(argb);
    swatch.font = structureFont(true);
    swatch.alignment = CENTRE;
    swatch.border = box();
    row.getCell(2).font = structureFont();
    row.getCell(2).alignment = { vertical: "middle" };
  }

  if (palette.truncated()) {
    line(
      "",
      `Only the first ${MAX_CLASS_LEGEND_ROWS} class codes are listed. The rest are still coloured, and by the same rule.`,
      true,
    );
  }
}
