/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT `src/` MAY NOT CONTAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Four statements about the source, each of which would break a target that
 * CI cannot otherwise see failing, and each of which reads as an ordinary
 * import when you skim past it.
 *
 * ⭐ THESE ARE FILE READS AND THEY BELONG IN VITEST. They take single-figure
 * milliseconds, and a regression in one of them is the kind you want reported
 * in the fast loop rather than four minutes into the byte gate. The heavy
 * comparison — our bytes against Monospace's — is `npm run gate`, a plain
 * Node program; see `gate/run.ts` for why it is not a test.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC = resolve(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry: string) => {
    const full = resolve(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("what the source may not contain", () => {
  /**
   * ⚠️ THE STUB THAT LETS THE REFERENCE LOAD MUST NOT BE LOAD-BEARING FOR US.
   * `server-only` is intercepted so Monospace's unmodified writer can be
   * imported by the gate — documented change #1 is that OUR writer does not
   * have that import. If it ever came back, the gate would still pass while
   * the browser build broke, because the gate's loader hook would resolve it
   * and a bundler would not.
   */
  test("nothing in src/ imports server-only", () => {
    /* ⚠️ AN IMPORT, NOT THE WORDS. Two files under src/ DISCUSS `server-only`
       in their banners — the spec explains why it is pure, and the writer
       documents removing it — and a substring test would fail on the very
       comments that record the decision. It is the statement that must not
       come back. */
    const IMPORT =
      /(?:^|\n)\s*(?:import\s+["']server-only["']|import\s[^\n;]*from\s+["']server-only["']|require\(\s*["']server-only["']\s*\))/;
    const offenders = walk(SRC).filter(
      (f) => f.endsWith(".ts") && IMPORT.test(readFileSync(f, "utf8")),
    );
    expect(offenders, "files under src/ importing server-only").toEqual([]);
  });

  /**
   * ⚠️ AND THE BARREL MUST NOT COME BACK EITHER. `import ExcelJS from "exceljs"`
   * as a VALUE resolves, in a browser bundle, to `dist/exceljs.min.js` — which
   * has no `stream` namespace at all — and drags in the reader, unzipper and
   * bluebird, which crashes on `process.versions`. Documented change #3.
   */
  test("the writer imports exceljs only as a type and by deep specifier", () => {
    const writer = readFileSync(resolve(SRC, "workbook/timetableWorkbook.ts"), "utf8");
    expect(writer).toContain('import type ExcelJS from "exceljs"');
    expect(writer).toContain(
      'import WorkbookWriter from "exceljs/lib/stream/xlsx/workbook-writer.js"',
    );
    /* A value import of the barrel would look exactly like the type one minus
       the keyword, so it is tested for by absence. */
    expect(writer).not.toMatch(/^import ExcelJS from "exceljs"/m);
    /* ⭐ AND NO SECOND WRITER, EVER. The buffered `ExcelJS.Workbook` silently
       ignores `useSharedStrings: false` and differs in 47 of 50 zip parts. */
    expect(writer).not.toMatch(/new ExcelJS\.Workbook\b/);
  });

  /** ⚠️ `node:stream` is the one line that cannot run in a browser. It belongs
   *  in `stream.ts` and nowhere else, so the `browser` field can swap it. */
  test("node:stream appears only in the Node half of the stream port", () => {
    const offenders = walk(SRC).filter(
      (f) =>
        f.endsWith(".ts") &&
        !f.endsWith("/workbook/stream.ts") &&
        /["']node:(stream|fs|path|zlib|crypto)["']/.test(readFileSync(f, "utf8")),
    );
    expect(offenders, "files under src/ importing a node: builtin").toEqual([]);
  });

  /**
   * ⭐⭐ AND THE GATE IS STILL WIRED UP.
   *
   * ⚠️ THE HEAVY COMPARISON NO LONGER RUNS UNDER `npm test`, which means a
   * green test run is no longer evidence that our bytes match Monospace's. The
   * one way that becomes silent is the `gate` script going missing — so the
   * package manifest is checked here, in the suite somebody runs by reflex,
   * and the workflows assert the same thing before believing a pass.
   */
  test("package.json still has a gate script, and it is a plain Node program", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const gate = pkg.scripts?.gate;
    expect(gate, "packages/engine must keep a `gate` script — CI runs it by name").toBeTruthy();
    expect(gate).toContain("gate/run.ts");
    /* ⚠️ NOT UNDER A RUNNER. The whole reason the gate was extracted is that a
       runner's reporter RPC cannot survive 100,000 synchronous SHA-512 rounds
       × 40 sheets. See `gate/harness.ts`. */
    expect(gate).not.toMatch(/\bvitest\b|\bjest\b|\bmocha\b/);
    /* ⚠️ The `server-only` interception is what lets the live comparison load
       Monospace's writer. Drop the flag and, on a machine that HAS a Monospace
       checkout, the gate goes red with Next.js's tripwire in the stack rather
       than with anything about this project. */
    expect(gate, "the gate must register the server-only hooks").toContain(
      "scripts/register-hooks.mjs",
    );
  });
});
