/**
 * ══════════════════════════════════════════════════════════════════════════
 *  `Buffer`, AS A NAMED ESM EXPORT — WHICH IS THE WHOLE POINT OF THIS FILE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The npm `buffer` package could be injected directly, and it does not work.
 * ⚠️ AND IT FAILS SILENTLY AT BUILD TIME: esbuild adds the import to every
 * module that mentions `Buffer` and then leaves the identifier ALONE, because
 * substitution needs a matching NAMED EXPORT and `buffer` is CommonJS — so
 * esbuild only sees a `default`. The bundle builds, looks right, and throws
 * `Buffer is not defined` from inside `compress-commons` the first time a
 * workbook is written.
 *
 * This one line of ESM is what gives esbuild the named export to bind to.
 *
 * ⭐ WHY `Buffer` IS NEEDED AT ALL, in a package with no Node in it: exceljs
 * and the zip stack use it as a GLOBAL rather than importing it —
 * `Buffer.alloc(0)`, `Buffer.from(Array(2))`, `Buffer.concat`,
 * `Buffer.from(password, 'utf16le')` and `writeUInt32LE`. Nothing imports it,
 * so nothing in the graph reveals the dependency until it runs.
 */

import { Buffer } from "buffer";

export { Buffer };
export default Buffer;
