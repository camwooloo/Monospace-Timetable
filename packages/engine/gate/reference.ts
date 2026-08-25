/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE REFERENCE SIDE OF THE GATE — MONOSPACE'S OWN WRITER, UNMODIFIED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The gate compares our writer against Monospace's. For that to prove
 * anything, the reference has to be the ORIGINAL FILE — not a copy of it that
 * has been edited to run here, which would be comparing our writer against our
 * own edit of theirs and would pass no matter what we broke.
 *
 * So this imports `src/lib/timetableWorkbook.ts` straight out of the
 * Monospace working tree, at whatever absolute path it lives, and:
 *
 *   · ⚠️ NOTHING IN THE MONOSPACE REPO IS WRITTEN TO. It is a live commercial
 *     product and this package treats it as read-only. The import is a read.
 *   · The ONE thing that has to be resolved for it to load at all is
 *     `import "server-only"`, Next.js's build-time tripwire, which is
 *     intercepted by `scripts/register-hooks.mjs` and answered with the empty
 *     stub at `test/stubs/server-only.cjs`. That is the minimum intervention;
 *     see that file's banner.
 *   · `exceljs` and `node:stream` resolve normally — the reference runs on
 *     Node, which is what it was written for.
 *
 * ⚠️ BOTH ENTRY POINTS THAT REACH THIS FILE MUST REGISTER THOSE HOOKS — the
 * gate (`gate/run.ts`) and `scripts/refresh-fixtures.ts`, both launched as
 * `node --import tsx --import ./scripts/register-hooks.mjs …`. Without them
 * Monospace's own real `server-only` is what resolves, and it throws on load.
 *
 * ── ⚠️ AND IT IS NOT REQUIRED FOR THE GATE TO RUN ──────────────────────
 * The reference BYTES are committed under `fixtures/`, so `npm run gate` on a
 * machine with no Monospace checkout still compares our output against them
 * and still fails on a regression — it reports the live comparison as SKIPPED,
 * by name, rather than passing quietly. This module is what REFRESHES those
 * fixtures, and refreshing is a deliberate act — `npm run fixtures:refresh` —
 * because a fixture that regenerates itself on every run is not a fixture.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TimetableWorkbookModel } from "../src/lib/timetableSheet";

/**
 * Where Monospace is checked out.
 *
 * Defaults to the sibling directory, which is how it sits on Cam's machine
 * and in the layout this repo assumes. `MONOSPACE_SOURCE` overrides it.
 */
export function monospaceRoot(): string {
  return (
    process.env.MONOSPACE_SOURCE ??
    resolve(fileURLToPath(new URL("../../..", import.meta.url)), "..", "Monospace")
  );
}

export function monospaceWriterPath(): string {
  return resolve(monospaceRoot(), "src/lib/timetableWorkbook.ts");
}

/** Whether the reference writer can be reached from here. */
export function haveMonospaceSource(): boolean {
  return existsSync(monospaceWriterPath());
}

type SourceWriter = {
  streamTimetableWorkbook: (
    model: TimetableWorkbookModel,
  ) => ReadableStream<Uint8Array>;
};

/**
 * Generate the reference bytes with Monospace's writer.
 *
 * ⚠️ IT ONLY EXPOSES A STREAM. The original has no buffered entry point —
 * `bufferTimetableWorkbook` is one of our four documented additions — so the
 * collecting happens HERE, on the reference side, using the Web stream the
 * original returns. That keeps the comparison honest: the reference is not
 * given a helper we wrote.
 */
export async function referenceWorkbook(
  model: TimetableWorkbookModel,
): Promise<Uint8Array> {
  /* ⚠️ THE SPECIFIER IS A VARIABLE AND NOTHING BUNDLES THIS FILE, so the
     import is resolved at run time by whatever loader hooks the process
     registered — which is exactly how `server-only` gets intercepted. It used
     to run under vitest, where the same job was done by a resolver alias in
     `vitest.config.ts` and a bare `@vite-ignore` would have broken it by
     turning this into a native import that escaped the module graph. There is
     no vite in the picture any more; `scripts/register-hooks.mjs` does the
     interception in both module systems. */
  const mod = (await import(
    pathToFileURL(monospaceWriterPath()).href
  )) as SourceWriter;

  const stream = mod.streamTimetableWorkbook(model);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
