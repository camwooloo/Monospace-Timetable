import { defineConfig } from "vitest/config";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TOOL'S OWN SUITE — pure logic only, no DOM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ THE DEFAULT `node` ENVIRONMENT, DELIBERATELY. Most of this app IS the
 * DOM, and a DOM shim here would be a new dependency plus the standing lie
 * that happy-dom and a real browser agree — they do not, about focus, about
 * layout, and about `document.hidden`, which this app has real behaviour
 * riding on.
 *
 * ⭐ SO WHAT BELONGS HERE IS THE PURE PARTS, AND THEY GET SPLIT OUT TO GET
 * HERE. `releaseNotes.ts` exists as its own file precisely because the rule in
 * it is string work that can be pinned; the renderer that uses it is checked
 * in a real browser against the real bundle, because that is the only place a
 * check of it would mean anything.
 *
 * ⚠️ A TEST HERE MUST NOT IMPORT `host.ts` OR ANYTHING THAT REACHES IT.
 * `host.ts` touches `window` at module scope, so the import throws before a
 * single assertion runs — and the failure reads as a broken test rather than
 * as "this file is not testable in node", which is what it is.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
