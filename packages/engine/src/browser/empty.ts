/**
 * The stand-in for `fs` in a browser bundle.
 *
 * ⚠️ exceljs's `WorkbookWriter` opens with `const fs = require('fs')` and uses
 * it for ONE thing: `WorkbookWriter({ filename })`, which streams the zip to a
 * path on disk. This package never passes `filename` — it always passes
 * `stream` — so the module is required and never called, and an empty object
 * is the honest shape rather than a polyfill pretending a browser has a disk.
 *
 * ⭐ IF SOMETHING EVER *DOES* CALL IT, the failure is a clear
 * "createWriteStream is not a function" at the call site, which is better than
 * a shim that silently writes nowhere and returns a workbook the school thinks
 * was saved.
 */
export default {};
