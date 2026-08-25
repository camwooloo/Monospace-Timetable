/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BYTE SINK — ONE INTERFACE, TWO IMPLEMENTATIONS, NO BUNDLER CONFIG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `timetableWorkbook.ts` came out of Monospace importing `node:stream`
 * directly. That is the ONE line in it that cannot run in a browser, and it is
 * the whole of the port: exceljs's `WorkbookWriter` wants a Node-shaped
 * writable to `pipe` its zip into, and the browser has no such thing built in.
 *
 * ── ⭐ WHY THE SWITCH IS IN package.json AND NOT IN A BUNDLER CONFIG ──────
 * There are two bundles — a single self-contained `.html` and the same
 * document embedded in the `.exe` — and two bundler configs is two chances to
 * diverge. If one of them forgets the alias, the browser build pulls in
 * `node:stream`, and the failure is not a build error: some bundlers helpfully
 * substitute a polyfill of their own, so you get a SECOND copy of
 * `readable-stream` in the graph and the first `addWorksheet()` throws on an
 * instanceof check that can never pass.
 *
 * So the resolution lives on the package, in two places that say the same
 * thing, because bundlers honour different ones:
 *
 *   "browser": { "./dist/workbook/stream.js": "./dist/workbook/stream.browser.js" }
 *       The object form of the `browser` field, understood by webpack,
 *       esbuild (`--platform=browser`), Vite, Rollup's node-resolve and
 *       browserify. It remaps THIS file wherever it is imported from inside
 *       the package, so `timetableWorkbook.ts` imports "./stream" and never
 *       has to know which target it is on.
 *
 *   "exports": { "./stream": { "browser": …, "default": … } }
 *       The modern conditional-exports form, for anyone importing the subpath
 *       directly, and for bundlers that resolve conditions but ignore the
 *       legacy field.
 *
 * ── ⚠️ THIS FILE IS THE NODE ONE ─────────────────────────────────────────
 * It is not a facade that branches at runtime. A runtime branch would mean
 * `node:stream` is still in the browser graph — reachable, bundled, and
 * exactly the thing being avoided. `stream.browser.ts` is a separate file with
 * the same exported names and the same shapes, and the two are held together
 * by `stream.contract.ts`, which both of them satisfy structurally.
 */

import { PassThrough, Readable } from "node:stream";
import { collectSink } from "./stream.contract";
import type { ByteSink, Conforms } from "./stream.contract";

export type { ByteSink } from "./stream.contract";

/** A writable both exceljs and we can read back out of. */
export function createSink(): ByteSink {
  return new PassThrough() as unknown as ByteSink;
}

/**
 * The Node fast path. `Readable.toWeb` is a core API and handles backpressure,
 * cancellation and errors properly; the browser file has to do it by hand.
 */
export function sinkToWeb(sink: ByteSink): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    sink as unknown as Readable,
  ) as unknown as ReadableStream<Uint8Array>;
}

export { collectSink };

/* ⭐ COMPILE-TIME CONFORMANCE — see `StreamModule`. Emits nothing; exists so
   that a signature changing here and not in the other implementation fails the
   build rather than the target nobody ran locally. */
type _Conforms = Conforms<{
  createSink: typeof createSink;
  sinkToWeb: typeof sinkToWeb;
  collectSink: typeof collectSink;
}>;

