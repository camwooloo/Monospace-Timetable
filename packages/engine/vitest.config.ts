import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE LIGHT SUITE. THE HEAVY GATE LIVES IN `gate/` AND IS NOT A TEST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ WHAT RUNS HERE: the model builder's rules, the document reader, the
 * provenance pins against Monospace's source, and the source-hygiene checks.
 * All of it is arithmetic and file reads, and the whole suite is seconds.
 *
 * ⚠️ WHAT USED TO RUN HERE AND MUST NOT AGAIN: anything that WRITES a
 * workbook. `worksheet.protect()` runs 100,000 SHA-512 rounds SYNCHRONOUSLY,
 * once per sheet, 40 sheets to a workbook and several workbooks to a run.
 * Nothing yields for tens of seconds, which starves the reporter RPC between
 * the runner and the worker, and the run ends with
 *
 *     Test Files  1 passed (6)
 *          Tests  29 passed (29)
 *         Errors  1 error
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * — every test that RAN, passing, and the process still exiting 1. It passed
 * on the machine the fixtures were made on and failed on CI, which is the
 * worst shape a failure can take: nothing is wrong with the code and the
 * signal is about how fast the runner is.
 *
 * ⚠️ THIS FILE ONCE CARRIED THE TWO FIXES FOR THAT, AND NEITHER WORKED. They
 * are recorded here rather than deleted, because both look obviously right:
 *
 *   · `pool: "forks"` with `singleFork` — moves the blocking work into a child
 *     PROCESS, which still blocks its own reporter channel. It made things
 *     WORSE: 1 of 6 files completed instead of 5.
 *   · `testTimeout` / `hookTimeout` / `teardownTimeout` at 180 s — the wrong
 *     timeout entirely. The one that fires is birpc's; `createRuntimeRpc`
 *     passes no value for it and no `VITEST_*` variable reaches it, so there
 *     is no knob to turn.
 *
 * The fix was to stop asking a test runner to sit still for four minutes:
 * `npm run gate` is a plain Node program with no reporter and no IPC, so it
 * has no channel to time out. See `gate/harness.ts`.
 *
 * ⚠️ AND `npm test` GOING GREEN IS NO LONGER EVIDENCE OUR BYTES MATCH
 * MONOSPACE'S. `test/source.test.ts` asserts the gate script still exists, and
 * both workflows assert it before believing a pass — because the one way this
 * split can rot is the gate quietly stopping.
 */
export default defineConfig({
  resolve: {
    alias: {
      /* ⭐ NEXT.JS'S TRIPWIRE, STUBBED — see test/stubs/server-only.cjs.
         Monospace's writer opens with `import "server-only"`, whose real
         package throws outside a React Server Components graph.

         ⚠️ NOTHING UNDER `test/` IMPORTS A MONOSPACE FILE TODAY — the live
         comparison moved to the gate, which does the same interception with
         loader hooks (`scripts/register-hooks.mjs`) because it runs under
         `tsx` and not under vite. This alias is kept so that a test which
         reaches for Monospace's source LATER works, rather than failing deep
         inside somebody else's package; it points at the same one stub, so it
         cannot drift from the hooks.

         ⚠️ IT MUST BE A RESOLVER ALIAS. `server-only` is resolved relative to
         the Monospace file that imports it, so a package installed HERE is
         never consulted and Monospace's own real one wins.

         `fileURLToPath`, not `new URL(...).pathname` — the latter is wrong on
         Windows and wrong on any path containing a space. */
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.cjs", import.meta.url),
      ),
    },
  },
  test: {
    /* ⚠️ NO `pool`, STILL — see the banner. `forks`/`singleFork` was tried
       against the birpc failure and made it strictly worse.

       ⚠️⚠️ BUT `testTimeout` IS RAISED, AND IT IS NOT THE KNOB THE BANNER SAYS
       DOES NOTHING. Those are two different failures and conflating them cost
       a red build:

         · birpc's `onTaskUpdate` timeout — NOT configurable, fires while a
           test is blocking the reporter channel, and reports every test as
           PASSED while exiting 1. That is the one no value here can reach, and
           the reason the heavy work moved to `gate/`.
         · vitest's own per-test timeout — this one, default 5000 ms, reported
           honestly against the single test that exceeded it.

       The second fired on `an explicit year id wins`. Nothing is wrong with
       it: `buildTimetableModel` over the fixture year takes ~1.6 s on the
       machine the fixtures were made on, and the two-core CI runner is around
       2.7× slower, which puts the whole file on the line. Sibling tests in the
       same run finished at 4.37 s — inside 5000 ms by six hundred milliseconds,
       which is not a margin, it is a coin toss.

       ⚠️ SO THIS IS HEADROOM FOR A SLOW MACHINE AND NOT PERMISSION TO PUT SLOW
       WORK HERE. The rule the banner sets stands: if a test needs tens of
       seconds it belongs in `gate/`. 30 s against a 4.4 s worst case is ~7×,
       chosen so a runner having a bad afternoon is not a red build, and still
       far under the point where a genuinely wedged test looks like a hang. */
    testTimeout: 30_000,
    include: ["test/**/*.test.ts"],
  },
});
