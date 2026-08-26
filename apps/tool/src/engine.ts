/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE ONE DOOR TO THE ENGINE — AND IT IS THE ENGINE'S OWN SOURCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every colour, every label, every geometry constant and every rule this app
 * draws with comes through this file, and this file imports the engine's
 * `src/` by relative path. Nothing here computes anything.
 *
 * ── ⚠️ WHY A RELATIVE PATH AND NOT `@monospace-timetable/engine` ─────────
 * The package's `exports` map publishes exactly four entry points — `.`,
 * `./stream`, `./browser-shims` and `package.json` — and its `.` barrel
 * deliberately re-exports the *workbook* half of the spec. The GRID half is
 * not in it: `gridSurfaces`, `bandForDay`, `GRID_PX`, `GRID_NARROW_PX`,
 * `gridElevation`, `gridOverrideFill`, `GRID_DIM`, `GRID_RULE_ALPHA`,
 * `GRID_SEAM_ALPHA`, `GRID_TYPE`, `caretShadow`, `EXPORT_OPTION_COPY` and the
 * `vocab` words all live inside `src/lib/` without a public specifier.
 *
 * There were two ways to reach them and only one of them is honest:
 *
 *   ✗ COPY THE CONSTANTS. That is the failure mode Monospace's own CLAUDE.md
 *     records over and over — a hand-kept matching pair that drifts while
 *     looking correct, and here it would drift the SCREEN away from the FILE,
 *     which is the one promise this whole product makes. `gridClassFill`
 *     returns the printed byte; a second copy of it is a school whose grid and
 *     workbook disagree about what colour 9F/It is.
 *
 *   ✓ IMPORT THE ENGINE'S SOURCE. It is in the same repository, it is built
 *     by the same esbuild pass, and `packages/engine/src/lib/*` is Monospace's
 *     pure spec with no DOM, no Convex and no React in it. One copy, compiled
 *     once, and a change to the engine is a change to this app by
 *     construction.
 *
 * ⚠️ SO DO NOT "TIDY" THIS INTO A PACKAGE SPECIFIER unless the engine's
 * `exports` map and its `index.ts` grow the grid half FIRST. Widening the
 * engine's public surface is the right fix; a parallel constant is not.
 *
 * ⚠️ AND DO NOT IMPORT THE ENGINE ANYWHERE ELSE IN THIS APP. One door means
 * one place to look when the engine moves, and it means the deep relative
 * paths are written once rather than recomputed from every screen's depth.
 */

/* ── The file a school saves ───────────────────────────────────────────── */
export {
  SCHOOL_DOCUMENT_VERSION,
  SCHOOL_DOCUMENT_EXTENSION,
  readSchoolDocument,
  emptySchoolDocument,
  /* ⭐ THE ONE ANSWER TO "what does this year call its cycle weeks". Ten
     readers answered it two ways and the two that write the FILE gave the
     other answer — read its banner before reaching for `year.weekLabels`. */
  yearWeekLabels,
  CYCLE_LENGTHS,
} from "../../../packages/engine/src/index";
export type {
  SchoolDocument,
  SchoolYear,
  SchoolRoomSheet,
  SchoolRoom,
  SchoolField,
  SchoolPeriod,
  SchoolClosure,
  SchoolWeekPin,
  CycleLength,
  HolidayMode,
  ClosureKind,
} from "../../../packages/engine/src/index";

/* ── Document → workbook model → bytes ─────────────────────────────────── */
export { buildTimetableModel } from "../../../packages/engine/src/index";
export { bufferTimetableWorkbook } from "../../../packages/engine/src/index";

/* ── The year: rules in, weeks out ─────────────────────────────────────── */
export {
  buildYear,
  cycleWeekLabel,
  defaultWeekLabels,
  pickAcademicYear,
  todayCivil,
  periodsForWeekday,
  periodPosition,
  sortPeriods,
  civilOf,
  mondayOf,
  isMonday,
  MAX_WEEKS_PER_CALENDAR,
  MAX_CLOSURES_PER_CALENDAR,
  MAX_PERIODS_PER_CALENDAR,
  TEACHING_WEEKDAYS,
} from "../../../packages/engine/src/index";
export type {
  PeriodDef,
  ResolvedWeek,
  TemplateEntry,
  ConcreteOccurrence,
} from "../../../packages/engine/src/index";

/* ── One room's week, resolved — the function the board draws itself with,
      and the one the workbook writer's model is assembled from. ────────── */
export {
  resolvePublishedRoom,
  cellRights,
  WORKBOOK_ROOM_POLICY,
  CELL_LOCK_REASON,
  MAX_CELL_LABEL,
} from "../../../packages/engine/src/index";
export type {
  PublishedCell,
  PublishedCellState,
  CellLock,
  OverrideEntry,
} from "../../../packages/engine/src/index";

/* ── The school's own colour ───────────────────────────────────────────── */
export {
  DEFAULT_TIMETABLE_ACCENT,
  TIMETABLE_ACCENT_PRESETS,
  normaliseTimetableAccent,
  resolveTimetableAccent,
} from "../../../packages/engine/src/index";

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ THE PALETTE AND THE GEOMETRY — THE SCREEN *IS* THE EXPORT
   ══════════════════════════════════════════════════════════════════════════
   `gridClassFill` hands back the byte the workbook prints, in every theme.
   Both grids in Monospace read these; so does the writer. Read the banners in
   `timetableSheet.ts` before touching a single one of them, and MEASURE —
   three separate claims about this palette have failed measurement. */
export {
  colourForClass,
  compareClassCodes,
  describeClassCode,
  gridClassFill,
  gridInkOn,
  gridOverrideFill,
  gridSurfaces,
  gridElevation,
  bandForDay,
  GRID_PX,
  GRID_NARROW_PX,
  GRID_NARROW_PX_MAX_WIDTH,
  GRID_DIM,
  GRID_RULE_ALPHA,
  GRID_SEAM_ALPHA,
  GRID_TYPE,
  weekHasEnded,
  resolveExportOptions,
  normaliseExportOptions,
  EXPORT_OPTION_KEYS,
  EXPORT_OPTION_COPY,
  EXPORT_LINK_NOTE,
  EXPORT_PROTECTION_NOTE,
  EXPORT_LINKED_AND_PROTECTED_NOTE,
  MAX_ROOMS_PER_SHEET,
  MAX_CUSTOM_FIELDS,
  DAYS_PER_WEEK,
} from "../../../packages/engine/src/index";
export type {
  GridSurfaces,
  GridPx,
  ExportOptionKey,
} from "../../../packages/engine/src/index";

/* ── The crosshair, and the corner cell's words ────────────────────────── */
export { caretShadow } from "../../../packages/engine/src/index";
export { weekBandFor } from "../../../packages/engine/src/index";

/* ── The words. ⚠️ NOT RE-WRITTEN LOCALLY: "INSET day" and "Half term" and
      "Every week" are the school's vocabulary and the workbook's. ───────── */
export {
  HOLIDAY_MODES,
  holidayModeCopy,
  CLOSURE_KINDS,
  closureKindLabel,
  CLOSURE_TONE,
  weekdayName,
  weekdayShort,
  periodClock,
  bookableLabel,
  shortDate,
  weekSpan,
  closureSpan,
  weekRowState,
  weekStateNote,
} from "../../../packages/engine/src/index";

export { numericValue } from "../../../packages/engine/src/index";

/* ── ⭐ ROTA ─────────────────────────────────────────────────────────────
   The recurring-check half: a list, a cadence, a quota and a column set. It
   shares the date arithmetic and the calendar vocabulary with the timetable
   and nothing else — `bufferRotaWorkbook` is a SEPARATE writer, for the reason
   written over it. Same rule as everything above: go through the barrel. */
export {
  ROTA_CADENCES,
  ROTA_PRESETS,
  bufferRotaWorkbook,
  buildRota,
  fillRota,
  groupingsLine,
  ownFrames,
  presetColumns,
  recordKey,
  rotaPreset,
  yearFrames,
} from "../../../packages/engine/src/index";
export type {
  RotaCadence,
  RotaColumn,
  RotaColumnKind,
  RotaFrame,
  RotaItem,
  RotaPeriod,
  RotaBuildResult,
  RotaPreset,
  RotaRecord,
  RotaSlot,
  SchoolRota,
} from "../../../packages/engine/src/index";
