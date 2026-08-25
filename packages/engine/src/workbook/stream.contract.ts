/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT A BYTE SINK HAS TO BE, AND THE ONE HELPER THAT NEEDS NO TARGET
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `stream.ts` (Node) and `stream.browser.ts` are two files the bundler picks
 * between, so nothing type-checks them against each other. This is what does:
 * both import `ByteSink` from here and both are asserted to it, so a shape
 * that drifts fails the build rather than the first `addWorksheet()`.
 *
 * ⚠️ THE SURFACE IS DELIBERATELY THE SMALL ONE. exceljs's `WorkbookWriter`
 * calls `zip.pipe(this.stream)` and nothing else on it, and we call the reader
 * half. Typing the full `PassThrough` would let a future edit reach for
 * something `readable-stream` implements differently.
 */

/**
 * A Node-shaped duplex: exceljs pipes the zip INTO it, we read the bytes OUT.
 *
 * ⭐ `pipe` IS TYPED AS `unknown`-returning ON PURPOSE. Node's `PassThrough`
 * and `readable-stream`'s return their own class instances, and pinning the
 * return type to either one is what would make the two files stop matching.
 */
export type ByteSink = {
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  once(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
  pause(): unknown;
  resume(): unknown;
  destroy(err?: Error): unknown;
  write(chunk: unknown): boolean;
  end(): unknown;
  pipe(destination: unknown): unknown;
};

/**
 * Drain a sink into one contiguous buffer.
 *
 * ⚠️ THIS IS NOT A SECOND WRITER, and it must never become one. The streaming
 * `WorkbookWriter` still produces every byte; this only collects what came out
 * of it. Cam's decision — one writer, everywhere — is about which exceljs
 * class builds the zip, and there is still exactly one.
 *
 * It exists because two callers genuinely want bytes rather than a stream:
 * the fixture gate, which has to hash the file, and the desktop shell, which
 * hands a `Uint8Array` across the IPC boundary to Rust to write to disk. Both
 * would otherwise re-implement this loop, and one of them would forget the
 * error listener and hang.
 *
 * ⭐ CHUNKS ARE COPIED INTO A FRESH `Uint8Array`. Node hands out `Buffer`s
 * that are views onto a shared pool, so retaining them retains the pool; and
 * `Buffer` is not a thing the browser half produces at all. One copy at the
 * end is cheaper than being wrong about either.
 */
export function collectSink(sink: ByteSink): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    sink.on("data", (chunk: Uint8Array) => {
      const bytes =
        chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as never);
      chunks.push(bytes);
      total += bytes.byteLength;
    });
    sink.on("error", reject);
    sink.on("end", () => {
      const out = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.byteLength;
      }
      resolve(out);
    });
  });
}

/**
 * ⭐⭐ THE SHAPE BOTH IMPLEMENTATIONS MUST HAVE.
 *
 * `stream.ts` (Node) and `stream.browser.ts` are two files a bundler picks
 * between, so nothing type-checks them against each other by default — and the
 * failure mode of drift is that the target nobody ran locally breaks at
 * runtime. Each file ends with a purely type-level assertion against this, so a
 * function that changes signature on one side and not the other fails the
 * BUILD rather than the school's export.
 *
 * ⚠️ IT IS TYPE-LEVEL AND EMITS NOTHING. A runtime conformance object would be
 * a module side effect, which is the one thing `sideEffects: false` promises
 * there are none of.
 */
export type StreamModule = {
  createSink(): ByteSink;
  sinkToWeb(sink: ByteSink): ReadableStream<Uint8Array>;
  collectSink(sink: ByteSink): Promise<Uint8Array>;
};

/** Used by both implementations: `type _ = Conforms<{ … }>` fails to compile
 *  when the module's own signatures have drifted from `StreamModule`. */
export type Conforms<T extends StreamModule> = T;
