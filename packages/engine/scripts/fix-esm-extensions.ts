/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ADD THE `.js` NODE'S ESM LOADER INSISTS ON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TypeScript does not rewrite import specifiers. Under `moduleResolution:
 * "Bundler"` — which is what lets the source say `./stream` and lets the
 * package's `browser` field do the two-target switch — `tsc` emits
 * `from "./model/document"` verbatim, and Node's ESM loader refuses an
 * extensionless relative specifier. ⚠️ THE PACKAGE BUILDS CLEANLY AND THEN
 * CANNOT BE IMPORTED, which is a failure with no error message until somebody
 * tries it.
 *
 * ── ⭐ WHY THIS RATHER THAN WRITING `.js` IN THE SOURCE ───────────────────
 * Writing `from "./timetable.js"` in the source is the idiomatic fix, and it
 * would mean editing the import lines of `src/lib/*.ts` — which are COPIES OF
 * MONOSPACE'S FILES, byte for byte apart from the path rewrites that were
 * unavoidable. `test/provenance.test.ts` holds them to exactly that, so every
 * further character of drift makes the next re-sync from Monospace harder to
 * verify. Keeping the divergence at zero where it can be zero is worth a
 * twenty-line build step.
 *
 * ── ⚠️ WHY NOT BUNDLE `dist/` INSTEAD ────────────────────────────────────
 * A bundled `dist/index.js` would resolve everything at build time and need no
 * extensions — and would INLINE `workbook/stream.js`, which is the one file
 * `package.json`'s `browser` field has to be able to point AT. The two-target
 * design requires the emitted file layout to survive.
 *
 * ⚠️ IT ONLY TOUCHES RELATIVE SPECIFIERS. A bare package name (`exceljs`,
 * `readable-stream`) must be left exactly as written — `exceljs/lib/stream/
 * xlsx/workbook-writer` already ends in no extension on purpose, and appending
 * one would break the deep import that makes the browser build work at all.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");

/** `from "./x"` / `from "../x"` — and nothing that already has an extension. */
const RELATIVE = /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']*?)\2/g;

function fixed(source: string, dir: string): string {
  return source.replace(RELATIVE, (whole, lead, quote, spec) => {
    if (/\.(js|mjs|cjs|json|css)$/.test(spec)) return whole;
    /* ⭐ A DIRECTORY SPECIFIER BECOMES `/index.js`, not `.js`. tsc does emit
       these for a folder with an index, and appending `.js` would name a file
       that does not exist. */
    const asDir = resolve(dir, spec, "index.js");
    const suffix = existsSync(asDir) ? "/index.js" : ".js";
    return `${lead}${quote}${spec}${suffix}${quote}`;
  });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let touched = 0;
for (const file of walk(DIST)) {
  /* ⭐ `.d.ts` TOO. A declaration file whose imports lack extensions makes
     TypeScript's own `node16`/`nodenext` consumers fail to resolve the types,
     which is the same bug one layer up and even quieter. */
  if (!/\.(js|d\.ts)$/.test(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = fixed(before, resolve(file, ".."));
  if (after !== before) {
    writeFileSync(file, after);
    touched++;
  }
}
console.log(`fixed ESM specifiers in ${touched} emitted files`);
