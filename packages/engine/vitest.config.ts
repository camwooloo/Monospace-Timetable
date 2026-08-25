import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * ⚠️ ONE ALIAS, AND IT IS NOT A PORTABILITY SHIM.
 *
 * It exists for a single file that is not ours: the fixture gate loads
 * Monospace's `src/lib/timetableWorkbook.ts` — unmodified, from a read-only
 * checkout — to generate the reference bytes, and its first line is
 * `import "server-only"`, a Next.js build-time tripwire that throws in plain
 * Node. See `test/stubs/server-only.ts` for why this is an alias rather than
 * an installed package, and why the reference has to be the original file.
 *
 * ⭐ `vite-node` RUNS `scripts/refresh-fixtures.ts` THROUGH THIS SAME CONFIG,
 * so the alias is declared once and both paths that load the reference writer
 * resolve identically.
 *
 * ⚠️ NOTHING ELSE BELONGS HERE. The engine's own Node/browser split is a
 * property of `package.json` — `exports` conditions and the `browser` field —
 * precisely so that it is not a property of whichever bundler is pointed at
 * it. A shim added to this file would fix the tests and not the two real
 * bundles, which is worse than not having it.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.cjs", import.meta.url),
      ),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
