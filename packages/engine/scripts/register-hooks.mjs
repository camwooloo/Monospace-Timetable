/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MAKE `server-only` RESOLVABLE, FOR ONE SCRIPT, IN BOTH MODULE SYSTEMS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `scripts/refresh-fixtures.ts` loads Monospace's UNMODIFIED writer to
 * generate the reference bytes, and that file opens with
 * `import "server-only"` — Next.js's build-time tripwire, whose real package
 * throws the moment it is loaded outside a React Server Components graph.
 *
 * ⚠️ AN INSTALLED STUB CANNOT WIN THAT. The specifier is resolved relative to
 * the importing file, which lives inside the Monospace checkout, so Node finds
 * Monospace's own real `server-only` and never looks here. Only a resolver
 * interception beats it — the same reason `vitest.config.ts` uses an alias.
 *
 * ⚠️ AND IT HAS TO BE INTERCEPTED IN **BOTH** MODULE SYSTEMS. `tsx` transpiles
 * the `.ts` to CommonJS, so the tripwire arrives as a `require()` and sails
 * straight past an ESM-only `resolve` hook. So there are two interceptions of
 * the same one specifier: the ESM hook below and `Module._resolveFilename`.
 *
 * ⭐ BOTH POINT AT THE SAME STUB, `test/stubs/server-only.cjs`, which is also
 * what the vitest alias points at — one stub, three ways of reaching it,
 * rather than three stubs that can drift.
 *
 * ⚠️ EXACTLY ONE SPECIFIER IS INTERCEPTED and everything else passes straight
 * through. A hook that rewrote more could change what the reference writer IS,
 * which is the one thing this gate depends on not happening.
 */

import Module from "node:module";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const STUB_URL = new URL("../test/stubs/server-only.cjs", import.meta.url);
const STUB_PATH = fileURLToPath(STUB_URL);

/* CommonJS — the path `tsx` takes. */
const inner = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return STUB_PATH;
  return inner.call(this, request, ...rest);
};

/* ESM — the path a native `import` takes. */
register("./server-only-hook.mjs", import.meta.url);
