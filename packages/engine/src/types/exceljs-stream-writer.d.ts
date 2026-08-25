/**
 * ══════════════════════════════════════════════════════════════════════════
 *  TYPES FOR THE ONE exceljs SPECIFIER THIS PACKAGE IMPORTS AS A VALUE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * exceljs ships a single `index.d.ts` describing the BARREL. It says nothing
 * about deep paths, so `exceljs/lib/stream/xlsx/workbook-writer` — the only
 * exceljs module this package imports at runtime — has no declaration and
 * would be an implicit `any`.
 *
 * ⭐ THIS IS AN ALIAS, NOT A SECOND DESCRIPTION. The class is re-exported from
 * exceljs's own `stream.xlsx.WorkbookWriter` type, so a signature change in a
 * future exceljs shows up here as a compile error rather than as a shim that
 * has quietly stopped matching the library. Verified against exceljs 4.4.0's
 * `lib/exceljs.nodejs.js`, where the barrel's `stream.xlsx.WorkbookWriter` is
 * `require('./stream/xlsx/workbook-writer')` — the very same file, so the
 * deep import is the same class and not a lookalike.
 *
 * ⚠️ IT IS A `export =` (CommonJS `module.exports = WorkbookWriter`), so the
 * default import in `timetableWorkbook.ts` needs `esModuleInterop`. That is
 * set in this package's tsconfig and must stay set.
 */

declare module "exceljs/lib/stream/xlsx/workbook-writer.js" {
  import type { stream } from "exceljs";
  const WorkbookWriter: typeof stream.xlsx.WorkbookWriter;
  export = WorkbookWriter;
}
