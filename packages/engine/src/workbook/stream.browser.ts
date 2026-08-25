/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BYTE SINK, IN A BROWSER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The browser half of `stream.ts`. Same exported names, same shapes, checked
 * against `stream.contract.ts` so the two cannot drift silently.
 *
 * ── ⚠️⚠️ ONE `readable-stream` FOR THE WHOLE GRAPH, AND THIS IS WHY ──────
 * exceljs's own modules `require('readable-stream')` (via `stream-buf`, and
 * via `archiver`/`zip-stream` under it). If the bundler resolves a DIFFERENT
 * copy for this file than it does for those — two versions in the tree, or a
 * mix of the bundler's own `stream` polyfill here and `readable-stream`
 * there — then the object we hand to `WorkbookWriter` is not an instance of
 * the `Writable` its `zip.pipe()` tests for, and the failure is a throw
 * inside the first `addWorksheet()` with nothing in the message about
 * duplicate packages.
 *
 * So: `readable-stream` is a real dependency of this package (not a devDep,
 * not a peer), it is imported here by bare specifier so the resolver dedupes
 * it against exceljs's own requires, and the bundle must be checked to contain
 * exactly one copy. `assertSingleReadableStream()` in `../browser/shims.ts` is
 * the runtime half of that check — cheap, and it fires at startup rather than
 * on the first export a school tries to run.
 *
 * ── ⭐ AND `sinkToWeb` IS HAND-WRITTEN, BECAUSE `Readable.toWeb` IS NOT HERE ─
 * `readable-stream` ships no `toWeb`. The adapter below is the part Node's
 * core version does for free, and the two things it must not get wrong are
 * BACKPRESSURE (a 600 KB workbook is fine, a school with three years and
 * twenty rooms is not necessarily) and ERRORS (a throw mid-zip has to reach
 * the consumer as a stream error, or the download is a silently truncated
 * file — which is the exact failure the writer's own banner calls the worst
 * outcome available).
 */

import { PassThrough } from "readable-stream";
import { collectSink } from "./stream.contract";
import type { ByteSink, Conforms } from "./stream.contract";

export type { ByteSink } from "./stream.contract";

export function createSink(): ByteSink {
  return new PassThrough() as unknown as ByteSink;
}

/**
 * Adapt the Node-shaped sink to a Web `ReadableStream`.
 *
 * ⭐ FLOW IS DRIVEN BY `pull`, NOT BY THE `data` EVENT ALONE. The sink is
 * paused the moment a chunk arrives and only resumed when the consumer asks
 * for more, so a slow reader (a `File System Access` write, a Rust IPC hop)
 * cannot make the whole zip pile up in memory — which is the one thing the
 * streaming writer was chosen to avoid.
 */
export function sinkToWeb(sink: ByteSink): ReadableStream<Uint8Array> {
  let wantMore: (() => void) | null = null;
  let done = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      sink.on("data", (chunk: Uint8Array) => {
        const bytes =
          chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as never);
        controller.enqueue(bytes);
        /* Stop until the consumer pulls. `resume()` is called from `pull`. */
        sink.pause();
      });
      sink.on("end", () => {
        done = true;
        /* A pending `pull` must not hang once the source is finished. */
        const w = wantMore;
        wantMore = null;
        controller.close();
        w?.();
      });
      sink.on("error", (err: Error) => {
        done = true;
        const w = wantMore;
        wantMore = null;
        controller.error(err);
        w?.();
      });
    },
    pull() {
      if (done) return;
      sink.resume();
      /* Resolve on the next chunk (or on end/error, handled above), so the
         stream's queue never runs more than one chunk ahead. */
      return new Promise<void>((resolve) => {
        wantMore = resolve;
        queueMicrotask(() => {
          const w = wantMore;
          wantMore = null;
          w?.();
        });
      });
    },
    cancel(reason) {
      done = true;
      sink.destroy(
        reason instanceof Error ? reason : new Error(String(reason ?? "cancelled")),
      );
    },
  });
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

