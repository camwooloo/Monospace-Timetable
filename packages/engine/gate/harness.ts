/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SMALLEST THING THAT CAN RUN A GATE: NAMED STEPS, AN EXIT CODE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ THERE IS NO TEST RUNNER HERE ON PURPOSE. The gate is a byte comparison
 * that either passes or does not; it needs no worker pool, no reporter and no
 * IPC. It used to run under vitest and the run died like this:
 *
 *     Test Files  1 passed (6)
 *          Tests  29 passed (29)
 *         Errors  1 error
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * — every test that ran, PASSING, and the process still exiting 1.
 * `worksheet.protect()` runs 100,000 SHA-512 rounds SYNCHRONOUSLY, once per
 * sheet, 40 sheets to a workbook and several workbooks to a run. Nothing
 * yields for tens of seconds, so the reporter RPC between the runner and the
 * worker exceeded birpc's default timeout and vitest killed the run. It passed
 * on the machine the fixtures were made on and failed on CI, which is the
 * worst shape a failure can take: nothing is wrong with the code and the
 * signal is about how fast the runner is.
 *
 * ⚠️ THE TWO OBVIOUS FIXES BOTH FAILED, and both are recorded here so nobody
 * spends the afternoon again:
 *   · `pool: "forks"` + `singleFork` — the child PROCESS still blocks its own
 *     reporter channel. It made it worse: 1 of 6 files completed, not 5.
 *   · Raising `testTimeout` / `hookTimeout` / `teardownTimeout` — the wrong
 *     timeout entirely. The one that fires is birpc's, `createRuntimeRpc`
 *     passes no value for it, and no `VITEST_*` variable reaches it.
 *
 * A plain Node process has no channel to time out. That is the whole fix.
 *
 * ── ⭐ WHAT THIS FILE GUARANTEES ─────────────────────────────────────────
 *   · Every step is NAMED and its result is printed as it finishes, so a run
 *     that is merely slow looks different from a run that is stuck.
 *   · A step that throws is recorded and the run CONTINUES, so one failure
 *     does not hide the other nine. The exit code is 1 if any step failed.
 *   · A skipped step is printed as loudly as a failed one and is counted on
 *     the summary line. A gate that quietly checks less is the failure this
 *     whole package exists to prevent, wearing a tick.
 */

import { performance } from "node:perf_hooks";

/** Thrown by `skip()`. Caught by `step()` and reported, never swallowed. */
export class Skipped extends Error {}

/**
 * Bail out of a step that genuinely cannot run here — no Monospace checkout,
 * no `dist/`. ⚠️ THE REASON IS PRINTED IN THE SUMMARY, so "it was skipped" is
 * never something you have to go and find out.
 */
export function skip(why: string): never {
  throw new Skipped(why);
}

/** A failed check. Distinguished from a crash only in how it reads. */
export class GateError extends Error {}

/* ══════════════════════════════════════════════════════════════════════════
   ASSERTIONS

   ⚠️ NOT `node:assert`. Its `deepStrictEqual(a, b, message)` prints the
   message INSTEAD of the diff, and "the set and ORDER of zip members" with no
   diff is not an actionable failure for a 50-part archive. These say WHICH
   element differs and WHAT was on each side, because that is the sentence
   somebody reads at 4pm on a Friday.
   ══════════════════════════════════════════════════════════════════════════ */

export function ok(condition: boolean, what: string): void {
  if (!condition) throw new GateError(what);
}

export function equal<T extends string | number | boolean | undefined>(
  actual: T,
  expected: T,
  what: string,
): void {
  if (actual !== expected) {
    throw new GateError(
      `${what}\n  expected: ${JSON.stringify(expected)}\n  actual  : ${JSON.stringify(actual)}`,
    );
  }
}

/** Two lists of strings, compared as a SEQUENCE — order is part of the claim. */
export function sameList(
  actual: readonly string[],
  expected: readonly string[],
  what: string,
): void {
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    if (actual[i] === expected[i]) continue;
    throw new GateError(
      `${what}\n` +
        `  first difference at index ${i}\n` +
        `    expected: ${JSON.stringify(expected[i] ?? "(nothing — the list is shorter)")}\n` +
        `    actual  : ${JSON.stringify(actual[i] ?? "(nothing — the list is shorter)")}\n` +
        `  lengths: expected ${expected.length}, actual ${actual.length}`,
    );
  }
}

/**
 * Two lists of counts, compared element by element, each element NAMED.
 *
 * ⚠️ THE LABELS ARE THE WHOLE DIFFERENCE FROM `sameList`. This has one caller —
 * the volatile substitution counts in `compare.ts` — and the regression it
 * exists to catch is a writer that stopped emitting `saltValue` at all.
 * Reported positionally that reads "first difference at index 0, expected 1,
 * actual 0", which makes somebody open `zip.ts` to learn what index 0 is. The
 * attribute's own name does not.
 */
export function sameCounts(
  actual: readonly number[],
  expected: readonly number[],
  labels: readonly string[],
  what: string,
): void {
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    if (actual[i] === expected[i]) continue;
    throw new GateError(
      `${what}\n` +
        `  ${labels[i] ?? `(unnamed field ${i})`}\n` +
        `    expected: ${expected[i] ?? "(nothing — the list is shorter)"}\n` +
        `    actual  : ${actual[i] ?? "(nothing — the list is shorter)"}`,
    );
  }
}

/**
 * The first index at which two strings differ, or `null` when they are equal.
 * Used for the normalised-member comparison, where the strings are whole XML
 * parts and "they differ" on its own is useless.
 */
export function firstTextDifference(a: string, b: string): number | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? null : n;
}

/** Two XML parts, compared with the difference LOCATED and quoted. */
export function sameText(actual: string, expected: string, what: string): void {
  const at = firstTextDifference(expected, actual);
  if (at === null) return;
  throw new GateError(
    `${what}\n` +
      `  first difference at character ${at} (expected ${expected.length} chars, got ${actual.length})\n` +
      `    expected … ${JSON.stringify(expected.slice(Math.max(0, at - 60), at + 60))}\n` +
      `    actual   … ${JSON.stringify(actual.slice(Math.max(0, at - 60), at + 60))}`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RUNNER
   ══════════════════════════════════════════════════════════════════════════ */

type Status = "pass" | "fail" | "skip";

type Outcome = {
  name: string;
  status: Status;
  ms: number;
  /** Why it was skipped, or how it failed. */
  note?: string;
};

const RULE = "─".repeat(74);
const HEAVY = "═".repeat(74);

function seconds(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export class Gate {
  private readonly outcomes: Outcome[] = [];
  private readonly startedAt = performance.now();

  constructor(private readonly title: string) {
    console.log(`\n${HEAVY}\n ⭐ ${title}\n${HEAVY}`);
  }

  /** A line of context under the banner — node version, where Monospace is. */
  note(line: string): void {
    console.log(` ${line}`);
  }

  /**
   * Run one named check.
   *
   * ⚠️ IT NEVER RETHROWS. Ten checks are worth more than the first one, and a
   * gate that stops at the first failure hides the shape of a regression that
   * moved several things at once.
   */
  async step(name: string, body: () => void | Promise<void>): Promise<void> {
    console.log(`\n${RULE}\n▸ ${name}`);
    const began = performance.now();
    try {
      await body();
      const ms = performance.now() - began;
      this.outcomes.push({ name, status: "pass", ms });
      console.log(`  ✓ PASS  (${seconds(ms)})`);
    } catch (error) {
      const ms = performance.now() - began;
      if (error instanceof Skipped) {
        this.outcomes.push({ name, status: "skip", ms, note: error.message });
        console.log(`  — SKIPPED: ${error.message}`);
        return;
      }
      const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.outcomes.push({
        name,
        status: "fail",
        ms,
        note: error instanceof Error ? error.message.split("\n")[0] : String(error),
      });
      console.log(`  ✗ FAIL  (${seconds(ms)})\n`);
      console.log(
        text
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n"),
      );
    }
  }

  /**
   * Print the summary and hand back the exit code.
   *
   * ⭐ THE EXIT CODE IS THE POINT. A gate that cannot fail the build is
   * decoration.
   *
   * ⚠️ `expected` IS REQUIRED, AND IT IS NOT BOOKKEEPING. The workflows prove
   * the `gate` SCRIPT still exists; `test/source.test.ts` proves it still
   * points at `gate/run.ts`. Nothing proved the program still CONTAINS its
   * checks — so deleting the byte comparison left a green job and an
   * eleven-row report on a summary the workflow's own comment says nobody
   * opens on a green run. `run.ts` derives the number from the two lists that
   * legitimately vary and a literal for the steps that do not, so adding a
   * check means bumping it deliberately — which is the same "somebody has to
   * look" property the fixtures have.
   */
  finish(expected: number): number {
    const passed = this.outcomes.filter((o) => o.status === "pass").length;
    const failed = this.outcomes.filter((o) => o.status === "fail");
    const skipped = this.outcomes.filter((o) => o.status === "skip");
    const total = seconds(performance.now() - this.startedAt);

    console.log(`\n${HEAVY}`);
    for (const o of this.outcomes) {
      const mark = o.status === "pass" ? "✓" : o.status === "fail" ? "✗" : "—";
      console.log(
        ` ${mark} ${o.name.padEnd(52)} ${seconds(o.ms).padStart(7)}` +
          (o.note ? `\n      ${o.note}` : ""),
      );
    }
    console.log(RULE);
    console.log(
      ` ${this.outcomes.length} checks — ${passed} passed, ${failed.length} failed, ${skipped.length} skipped   (${total})`,
    );
    console.log(HEAVY);

    /* ⭐ AND THE RIGHT NUMBER OF THEM RAN. Reported ALONGSIDE any failures
       rather than instead of them: "a check went missing" and "the workbook
       moved" are different sentences and a run can deserve both. */
    const miscounted = this.outcomes.length !== expected;
    if (miscounted) {
      console.log(
        `\n⛔ THE GATE RAN ${this.outcomes.length} CHECKS, NOT ${expected}.\n` +
          `   A check has been added or removed and \`EXPECTED_CHECKS\` in gate/run.ts\n` +
          `   was not moved with it. If that was deliberate, say so there; if it was\n` +
          `   not, the gate has quietly stopped proving something.\n`,
      );
    }

    if (failed.length) {
      console.log(
        `\n⛔ THE GATE IS RED. The workbook this package generates is no longer the\n` +
          `   workbook Monospace generates, or one of the structural claims about it\n` +
          `   has stopped being true. Somebody has to say WHY before\n` +
          `   \`npm run fixtures:refresh\` is run.\n`,
      );
    }
    return failed.length || miscounted ? 1 : 0;
  }
}
