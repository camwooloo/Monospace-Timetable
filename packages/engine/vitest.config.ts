import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * ⚠️ THESE TESTS BLOCK THE EVENT LOOP FOR MINUTES AT A TIME, and that is not
 * something to tune away — it is what they are testing.
 *
 * `worksheet.protect()` runs 100,000 SHA-512 rounds SYNCHRONOUSLY, once per
 * sheet, and the fixture generates 42 of them. Nothing yields. On a worker
 * thread that starves Vitest's own RPC, and the run ends with
 *
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * — every test PASSING and the process still exiting 1. It passed on the
 * machine the fixtures were made on and failed on CI, which is the worst shape
 * a test failure can take: nothing is wrong with the code and the signal is
 * pure noise about how fast the runner is.
 *
 * `forks` puts the blocking work in a child PROCESS rather than a worker
 * thread, so the reporter channel is not competing with it, and `singleFork`
 * keeps the heavy files from running at once — they are CPU-bound, so
 * parallelism bought nothing here anyway.
 *
 * The timeouts are generous on purpose: the browser-bundle test really does
 * take ~35s per run on this hardware and longer on a shared runner. A timeout
 * tight enough to be "strict" would just be the same flake wearing a
 * different message.
 */
export default defineConfig({
  resolve: {
    alias: {
      /* ⭐ NEXT.JS'S TRIPWIRE, STUBBED — see test/stubs/server-only.cjs, whose
         banner has always said this alias lives here. It did not: the file did
         not exist, and a Node loader hook was doing the job for the one script
         that registers it. So the fixture gate's live-comparison test — the one
         that catches a fixture going stale against the product it mirrors —
         failed the moment it ran under plain `vitest`, which is every time
         anyone has a Monospace checkout.

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
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 180_000,
    hookTimeout: 180_000,
    teardownTimeout: 180_000,
  },
});
