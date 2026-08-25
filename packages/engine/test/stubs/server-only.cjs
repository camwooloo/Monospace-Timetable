/**
 * ══════════════════════════════════════════════════════════════════════════
 *  A STAND-IN FOR NEXT.JS'S `server-only` TRIPWIRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Monospace's `src/lib/timetableWorkbook.ts` — the file the fixture gate loads
 * to generate its REFERENCE bytes — opens with `import "server-only"`. The
 * real package is a build-time tripwire whose `index.js` throws outside a
 * React Server Components graph, so plain Node cannot load that file at all.
 *
 * ⭐ THE REFERENCE HAS TO BE THE ORIGINAL FILE. Copying Monospace's writer and
 * deleting that line would make the gate compare our writer against our own
 * edit of theirs, which passes no matter what we break. Aliasing the tripwire
 * to this empty module is the minimum intervention that lets the original load
 * with every other byte untouched — and Monospace is treated as read-only
 * throughout: the gate reads it and writes nothing to it.
 *
 * ⚠️ IT IS AN ALIAS AND NOT A `node_modules` STUB, and that is forced rather
 * than chosen: the import is resolved relative to the file doing it, which
 * lives inside the Monospace tree, so a package installed here is never
 * consulted and Monospace's own real `server-only` wins. A resolver alias is
 * the only thing that beats that. `vitest.config.ts` declares it once and
 * `vite-node` gives the fixture-refresh script the same resolver, so there is
 * still one mechanism.
 *
 * ⚠️ AND IT CANNOT MASK A REGRESSION IN WHAT WE SHIP: the engine's own copy of
 * the writer never imports `server-only` — removing that line is documented
 * change #1 in `src/workbook/timetableWorkbook.ts` — so nothing in `src/`
 * resolves through here. `test/fixture.test.ts` asserts that.
 */

/* CommonJS on purpose: `tsx` transpiles the reference writer to CJS, so the
   tripwire arrives as a `require()` and the stub has to answer one. */
module.exports = {};
