/**
 * Types for `exceljs/lib/stream/xlsx/worksheet-writer`.
 *
 * ⚠️ ONLY THE TEST IMPORTS THIS MODULE, and only to reach the two PRIVATE
 * methods `hoistSheetProtection()` wraps — so that `hoist.test.ts` can turn
 * the hoist off and prove the `CT_Worksheet` check notices. The engine itself
 * never imports it: the writer reaches those methods through the worksheet
 * object exceljs hands it, guarded by a `typeof … === "function"` check
 * precisely so a rename in a future exceljs degrades rather than throws.
 */
declare module "exceljs/lib/stream/xlsx/worksheet-writer.js" {
  const WorksheetWriter: {
    prototype: Record<string, unknown>;
    new (...args: never[]): unknown;
  };
  export = WorksheetWriter;
}
