/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BROWSER BUNDLE — THE WORKED EXAMPLE OF `BROWSER_SHIMS`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bundles an entry point for the browser, applying `BROWSER_SHIMS` from
 * `src/browser/shims.ts` rather than restating them. ⚠️ THAT DIRECTION IS THE
 * POINT: the requirement lives on the package and this script READS it, so the
 * `.html` target and the `.exe` target cannot drift by editing one config.
 *
 * ⭐ `platform: "browser"` LEAVES exceljs's OWN `browser` FIELD ON, which is
 * wanted — `inherits` legitimately ships a browser build and disabling
 * `mainFields` breaks it. The barrel is avoided by the DEEP SPECIFIER in
 * `timetableWorkbook.ts`, which a string-form `browser` field does not
 * intercept, rather than by fighting resolution here.
 */

import { build, type BuildOptions } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSER_SHIMS, DEAD_SUBGRAPH, describeBrowserShims } from "../src/browser/shims";

/* ⚠️ `fileURLToPath`, NEVER `new URL(…).pathname` — this was a live bug, not a
   style point. On Windows a file URL's pathname is `/C:/…`, and `path.resolve`
   reads that leading slash as "the root of the current drive", producing
   `\\C:\\…` — a path that cannot exist. `ci.yml`'s windows job runs this build.
   The pathname is also percent-encoded, so a checkout under a folder with a
   space in its name breaks on every platform, macOS included. */
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const req = createRequire(import.meta.url);

export function browserBuildOptions(
  entry: string,
  outfile: string,
  extra: Partial<BuildOptions> = {},
): BuildOptions {
  const alias: Record<string, string> = {};
  const inject: string[] = [];
  const define: Record<string, string> = {};

  for (const shim of BROWSER_SHIMS) {
    if (shim.kind === "define") {
      define[shim.what] = shim.module;
      continue;
    }
    /* ⚠️ TWO KINDS OF `module`. A bare package name is a real polyfill and is
       passed through untouched; one of OURS is declared against `dist/`, which
       is what a consumer of the published package sees, and maps back to
       `src/` when building from source — the same file, one compile step
       earlier. */
    const ours = shim.module.startsWith("./");
    const target = ours
      ? resolve(ROOT, shim.module.replace("./dist/", "./src/").replace(/\.js$/, ".ts"))
      : shim.module;

    if (shim.kind === "alias") {
      /* An alias may name a package; esbuild resolves it like any import. */
      alias[shim.what] = target;
      continue;
    }
    /* ⚠️ `inject` TAKES FILE PATHS, NOT PACKAGE NAMES. esbuild opens each entry
       as a file, so a bare specifier has to be resolved first — and for
       `buffer` that resolution is itself a trap, which is why the shim names
       `buffer/index.js`. See its own comment. */
    inject.push(ours ? target : req.resolve(target));
  }

  /* ⭐ THE PART OF archiver A WORKBOOK WRITER CANNOT REACH. Cutting it is what
     removes `assert` and `constants` from the graph entirely — see
     `DEAD_SUBGRAPH`. */
  for (const dead of DEAD_SUBGRAPH) {
    alias[dead] = resolve(ROOT, "./src/browser/empty-fs.ts");
  }

  return {
    entryPoints: [resolve(ROOT, entry)],
    outfile: resolve(ROOT, outfile),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    alias,
    inject,
    define,
    /* ⚠️ `Buffer` AND `setImmediate` ARE INJECTED AS GLOBALS, so esbuild has to
       be told which named export of the injected module becomes which global.
       For a default-exporting module that is automatic; `buffer` exports
       `Buffer` by name, which is why the shim list carries `binding`. */
    /* ⭐ THE BROWSER HALF OF THE STREAM PORT. `platform: "browser"` makes
       esbuild honour the `browser` field in package.json, which is where the
       `stream.js` → `stream.browser.js` mapping lives. Building from SOURCE
       there is no `dist/`, so the same mapping is stated here against `src/`;
       a published consumer needs nothing, because package.json already says
       it. */
    ...extra,
  };
}

async function main() {
  const outfile = process.argv[3] ?? "build/browser-bundle.js";
  const entry = process.argv[2] ?? "src/index.ts";
  console.log("browser shims applied:\n" + describeBrowserShims());
  const result = await build({
    ...browserBuildOptions(entry, outfile, {
      minify: process.env.MINIFY === "1",
      metafile: true,
    }),
  });
  const bytes = Object.values(result.metafile!.outputs)[0].bytes;
  console.log(`\nwrote ${outfile} — ${(bytes / 1024).toFixed(1)} KB`);
}

if (process.argv[1]?.endsWith("build-browser.ts")) await main();
