/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ENGINE — ONE SOURCE, NODE AND BROWSER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Everything a host needs to turn a school's saved file into the workbook
 * Monospace produces. There is no server in here, no Convex, no React and no
 * DOM: `src/lib/` is Monospace's pure timetable spec copied byte for byte,
 * `src/model/` is its export route's assembly half taking plain objects, and
 * `src/workbook/` is its streaming writer with four documented changes.
 *
 * ⭐ THE ONE WRITER. `bufferTimetableWorkbook` and `streamTimetableWorkbook`
 * are the same `WorkbookWriter` with different plumbing on the end. The
 * buffered `ExcelJS.Workbook` is not imported anywhere in this package and
 * must never be: it silently ignores `useSharedStrings: false` and differs
 * from the streaming writer in 47 of 50 zip parts.
 */

/* ── The file a school saves ───────────────────────────────────────────── */
export {
  SCHOOL_DOCUMENT_VERSION,
  SCHOOL_DOCUMENT_EXTENSION,
  readSchoolDocument,
  emptySchoolDocument,
  yearWeekLabels,
  CYCLE_LENGTHS,
  DEFAULT_TAUGHT_WEEKDAYS,
} from "./model/document";
export type {
  SchoolDocument,
  SchoolYear,
  SchoolRoomSheet,
  SchoolRoom,
  SchoolField,
  SchoolPeriod,
  SchoolClosure,
  SchoolWeekPin,
  SchoolTemplateCell,
  SchoolWeekChange,
  SchoolBooking,
  SchoolExportOptions,
  SchoolDocumentIssue,
  ReadResult,
  CivilDate,
  CycleLength,
  HolidayMode,
  ClosureKind,
} from "./model/document";

/* ── Document → workbook model ─────────────────────────────────────────── */
export { buildTimetableModel } from "./model/buildModel";
export type { BuildModelInput, BuildModelResult } from "./model/buildModel";

/* ── Model → bytes ─────────────────────────────────────────────────────── */
export {
  streamTimetableWorkbook,
  bufferTimetableWorkbook,
} from "./workbook/timetableWorkbook";

/* ══════════════════════════════════════════════════════════════════════════
   THE SPEC, RE-EXPORTED
   ══════════════════════════════════════════════════════════════════════════

   A host needs these to draw the same grid on screen that it writes to the
   file — which is the rule the whole of `src/lib/` exists to enforce. ⚠️ Reach
   for these rather than reimplementing: CLAUDE.md's receipts are all of
   hand-kept matching pairs drifting while looking correct. */
export {
  buildYear,
  resolveYear,
  weekFacts,
  cycleWeekLabel,
  defaultWeekLabels,
  pickAcademicYear,
  todayCivil,
  periodsForWeekday,
  periodPosition,
  sortPeriods,
  periodIsTimed,
  civilOf,
  dayNumber,
  mondayOf,
  mondayOfDay,
  isMonday,
  isCivilDate,
  addDays,
  diffYears,
  taughtWeekdaysOf,
  normaliseTaughtWeekdays,
  MAX_WEEKS_PER_CALENDAR,
  MAX_CLOSURES_PER_CALENDAR,
  MAX_PERIODS_PER_CALENDAR,
  WEEKDAY_NAMES,
  TEACHING_WEEKDAYS,
  PIN_SEMANTICS_NOTE,
} from "./lib/timetable";
export type {
  PeriodDef,
  ResolvedWeek,
  WeekFacts,
  WeekPin,
  ClosureInput,
  CalendarRule,
  TemplateEntry,
  ConcreteOccurrence,
} from "./lib/timetable";

export {
  resolvePublishedRoom,
  cellRights,
  BOARD_ROOM_POLICY,
  WORKBOOK_ROOM_POLICY,
  CELL_LOCK_REASON,
  MAX_CELL_LABEL,
  MAX_CELL_NOTE,
} from "./lib/bookingPublished";
export type {
  PublishedCell,
  PublishedCellState,
  CellLock,
  RoomRights,
  OverrideEntry,
} from "./lib/bookingPublished";

export {
  DEFAULT_TIMETABLE_ACCENT,
  TIMETABLE_ACCENT_PRESETS,
  normaliseTimetableAccent,
  resolveTimetableAccent,
  timetableAccentFromBrand,
} from "./lib/timetableAccent";

export {
  colourForClass,
  compareClassCodes,
  describeClassCode,
  gridClassFill,
  gridInkOn,
  weekBandLabel,
  weekSheetLabel,
  templateSheetLabel,
  assignSheetNames,
  resolveExportOptions,
  normaliseExportOptions,
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_OPTION_KEYS,
  DAYS_PER_WEEK,
  MAX_CF_CLASS_RULES,
} from "./lib/timetableSheet";
export type {
  TimetableWorkbookModel,
  TimetableWeekSheet,
  TimetableExportOptions,
  StoredExportOptions,
  ExportOptionKey,
  TimetableRoom,
  TimetableFieldDef,
  SheetCell,
  SheetDay,
  WorkbookNotes,
} from "./lib/timetableSheet";

export { weekBandFor, UNPLACED_WEEK_LABEL } from "./lib/timetable/weekBand";
export { localDateOf } from "./lib/bookingTime";
export { numericValue, FIELD_KINDS } from "./lib/bookingRooms";
export type { RoomFieldKind } from "./lib/bookingRooms";

/* ══════════════════════════════════════════════════════════════════════════
   THE GRID HALF OF THE SPEC
   ══════════════════════════════════════════════════════════════════════════

   The block above re-exports what a host needs to WRITE the workbook. These
   are what it needs to DRAW the same thing on screen — the geometry, the
   rule alphas, the day banding, the caret, and the words. They were reachable
   only by importing `packages/engine/src/lib/*` directly, which meant the one
   consumer had to know the package's internal layout and the public surface
   quietly disagreed with what the package is for.

   ⚠️ ADD TO THIS LIST RATHER THAN DEEP-IMPORTING. A host that reaches past the
   barrel is a host that can be broken by a file move, and — worse — one that
   can quietly grow its own copy of a constant. Every receipt in Monospace's
   CLAUDE.md is a hand-kept matching pair drifting while looking correct. */
export {
  caretShadow,
} from "./lib/timetable/caret";
export {
  CLOSURE_KINDS,
  CLOSURE_TONE,
  HOLIDAY_MODES,
  bookableLabel,
  closureKindLabel,
  closureSpan,
  holidayModeCopy,
  periodClock,
  shortDate,
  weekRowState,
  weekSpan,
  weekStateNote,
  weekdayName,
  weekdayShort,
} from "./lib/timetable/vocab";
export {
  EXPORT_LINKED_AND_PROTECTED_NOTE,
  EXPORT_LINK_NOTE,
  EXPORT_OPTION_COPY,
  EXPORT_PROTECTION_NOTE,
  GRID_DIM,
  GRID_NARROW_PX,
  GRID_NARROW_PX_MAX_WIDTH,
  GRID_PX,
  GRID_RULE_ALPHA,
  GRID_SEAM_ALPHA,
  GRID_TYPE,
  MAX_CUSTOM_FIELDS,
  MAX_ROOMS_PER_SHEET,
  bandForDay,
  gridElevation,
  gridOverrideFill,
  gridSurfaces,
  weekHasEnded,
} from "./lib/timetableSheet";
export type {
  GridPx,
  GridSurfaces,
} from "./lib/timetableSheet";

/* ── ⭐ ROTA — the recurring-check half ──────────────────────────────────
   Its own model, its own filler and its own workbook writer, sharing only the
   date arithmetic and the calendar vocabulary with the timetable.

   ⚠️ `bufferRotaWorkbook` IS A SEPARATE WRITER, NOT A MODE OF
   `bufferTimetableWorkbook`. That one is byte-pinned by `provenance.test.ts`
   and regenerated member-by-member by `npm run gate`; a second layout inside it
   would put both in the way of every future rota change. The ~30 duplicated
   lines of style primitives are the deliberate price. */
export {
  ROTA_CADENCES,
  fillRota,
  groupingsLine,
  ownFrames,
  recordKey,
  yearFrames,
} from "./model/rota";
export type {
  RotaCadence,
  RotaColumn,
  RotaColumnKind,
  RotaFrame,
  RotaItem,
  RotaPeriod,
  RotaRecord,
  RotaSlot,
  SchoolRota,
} from "./model/rota";
export { ROTA_PRESETS, presetColumns, rotaPreset } from "./model/rotaPresets";
export { buildRota } from "./model/rotaBuild";
export type { RotaBuildResult } from "./model/rotaBuild";
export type { RotaPreset } from "./model/rotaPresets";
export { bufferRotaWorkbook } from "./workbook/rotaWorkbook";
export type { RotaWorkbookModel } from "./workbook/rotaWorkbook";
