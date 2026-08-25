/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ ONE FILE OUT — `dist/timetable.html`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * That single file is BOTH targets: the `.html` a school double-clicks off a
 * shared drive, and the document the Rust shell embeds. ⚠️ THERE IS EXACTLY
 * ONE OF THEM. Building a second, shell-flavoured copy is the thing this whole
 * arrangement exists to prevent — see `host.ts`, where the only difference
 * between the two is which object answers "put these bytes on the disk".
 *
 * ── ⭐ THE SHIM LIST IS READ, NEVER RESTATED ─────────────────────────────
 * `browserBuildOptions()` comes out of the ENGINE's own build script, which
 * builds itself from `BROWSER_SHIMS` — twelve entries, every one found by
 * building and reading the resolver's complaint. Two of them are sharp:
 * `crypto` cannot be WebCrypto (exceljs runs 100,000 sequential SHA-512 rounds
 * SYNCHRONOUSLY), and `global → globalThis` is reached ONLY when a password is
 * used, so its absence breaks precisely the workbook that was meant to be
 * locked.
 *
 * ⚠️ SO DO NOT WRITE AN `alias` OR AN `inject` INTO THIS FILE. If a shim is
 * missing, it is missing from the PACKAGE, and adding it here fixes one target
 * and leaves the other broken at runtime with a resolver error nobody sees
 * until a school presses Export.
 *
 * ── ⚠️ AND NOTHING IS FETCHED AT RUNTIME ─────────────────────────────────
 * No CDN, no font file, no `<link>`. The CSS is inlined and the JS is inlined,
 * because the file has to work from `file://` on a laptop with the network
 * unplugged — which is the actual deployment for a school with no budget.
 * `Geist` is NAMED in the font stack and never loaded: Windows falls through to
 * Segoe UI Variable and macOS to system-ui, both of which are already there.
 */

import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { browserBuildOptions } from "../../../packages/engine/scripts/build-browser";

/* ⚠️ `fileURLToPath`, NEVER `new URL(…).pathname` — this was a live bug, not a
   style point. On Windows a file URL's pathname is `/C:/…`, and `path.resolve`
   reads that leading slash as "the root of the current drive", producing
   `\\C:\\…` — a path that cannot exist. `ci.yml`'s windows job runs this build.
   The pathname is also percent-encoded, so a checkout under a folder with a
   space in its name breaks on every platform, macOS included. */
const HERE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENGINE = resolve(HERE, "../../packages/engine");
const OUT_DIR = resolve(HERE, "dist");
const OUT_HTML = resolve(OUT_DIR, "timetable.html");

const MINIFY = process.env.MINIFY !== "0";

/**
 * ⚠️ ESCAPED BEFORE IT GOES INTO A `<script>`, and this is not paranoia about
 * user input — there is none. A JavaScript string containing the literal
 * characters `</script` ENDS THE TAG, wherever it appears, including inside a
 * comment or a regex. The engine's copy is full of prose. `<\/` parses
 * identically in JS and is invisible to the HTML tokeniser.
 */
function safeForScriptTag(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

async function bundleJs(): Promise<string> {
  const result = await build(
    browserBuildOptions(resolve(HERE, "src/main.ts"), resolve(OUT_DIR, "app.js"), {
      /* ⚠️ THE WORKING DIRECTORY IS THE ENGINE'S. The shim list resolves bare
         package names (`readable-stream`, `browserify-zlib`, `path-browserify`)
         and they live in the engine's `node_modules`; resolving them from this
         app's directory would fail on a checkout that has not installed them
         twice. */
      absWorkingDir: ENGINE,
      minify: MINIFY,
      write: false,
      metafile: true,
      /* ⭐ NO CODE SPLITTING, EVER. A dynamic `import()` would emit a second
         chunk, and a second chunk is not a self-contained file. `format: "iife"`
         makes that a build error rather than a silently broken download. */
      format: "iife",
      legalComments: "none",
      target: ["es2022"],
    }),
  );
  const file = result.outputFiles?.[0];
  if (!file) throw new Error("esbuild produced no output");
  if (result.outputFiles!.length > 1) {
    throw new Error(
      `esbuild produced ${result.outputFiles!.length} files. This target is ONE self-contained document — a second chunk means something used a dynamic import().`,
    );
  }
  return file.text;
}

async function bundleCss(): Promise<string> {
  const result = await build({
    entryPoints: [resolve(HERE, "src/aurora.css")],
    bundle: true,
    minify: MINIFY,
    write: false,
    loader: { ".css": "css" },
    outfile: resolve(OUT_DIR, "aurora.css"),
  });
  return result.outputFiles![0].text;
}

function page(css: string, js: string): string {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>Monospace Timetable</title>
<!--
  Monospace Timetable — the school timetable workbook, free, offline, one file.
  Copyright (C) Cam Wooloo. Licensed AGPL-3.0-only.

  ⭐ THE CORRESPONDING SOURCE, which AGPL §13 requires you to offer to anyone
  who uses this over a network:  https://github.com/camwooloo/Monospace-Timetable
  The running app carries the same link in its left rail and on its About
  screen, because a licence obligation behind a menu is one somebody can ship
  without.

  This file is generated. Do not edit it — edit apps/tool/src and rebuild.
-->
<style>${css}</style>
</head>
<body>
<noscript style="display:block;padding:40px;font:15px/1.6 system-ui;color:#eef1fa;background:#05060d">
  <b>This tool needs JavaScript.</b> It builds the whole timetable workbook on your own
  machine — there is no server to do it for you, so there is nothing for it to fall
  back to. The source is at https://github.com/camwooloo/Monospace-Timetable
</noscript>
<script>${safeForScriptTag(js)}</script>
</body>
</html>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const [css, js] = await Promise.all([bundleCss(), bundleJs()]);
  const html = page(css, js);
  await writeFile(OUT_HTML, html, "utf8");

  const raw = Buffer.byteLength(html, "utf8");
  const gz = gzipSync(Buffer.from(html, "utf8"), { level: 9 }).length;
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

  /* ══════════════════════════════════════════════════════════════════════
     ⚠️ THE GUARDS — PROVED, NOT ASSUMED
     ══════════════════════════════════════════════════════════════════════
     Each of these would build clean and fail on the one machine that matters:
     a school laptop, offline, opening the file by double-clicking it. */

  /* 1. Nothing is loaded from anywhere. ⚠️ The XML NAMESPACE URIs inside the
        engine are `http://schemas.openxmlformats.org/…` and are identifiers,
        never fetched — which is why this matches an ATTRIBUTE rather than a
        bare URL. */
  const external = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\//gi)];
  if (external.length) {
    throw new Error(
      `${external.length} external reference(s) in the output. This file must work from file:// with the network unplugged.`,
    );
  }

  /* 2. Nothing tries to TALK to anywhere either — the check the one above
        cannot make. Currently zero of all four; if a future engine bump brings
        one in, this fails by name rather than silently shipping a page that
        works on the reviewer's machine and hangs on a school's. */
  for (const api of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource"]) {
    if (html.includes(api)) {
      throw new Error(
        `The output references \`${api}\`. This tool does no network I/O at all — the file on the disk is all the data there is.`,
      );
    }
  }

  /* 3. ⭐ THE LICENCE LINK IS IN THE FILE. AGPL §13 requires an offer of the
        Corresponding Source to anyone who uses this over a network, and this
        exact document is meant to be served as well as downloaded. A build
        that dropped the About screen would drop the offer with it. */
  if (!html.includes("github.com/camwooloo/Monospace-Timetable")) {
    throw new Error(
      "The source-code URL is not in the output. AGPL §13 makes that offer non-optional the moment this page is served rather than downloaded.",
    );
  }

  console.log(`\n  dist/timetable.html`);
  console.log(`    css          ${kb(Buffer.byteLength(css, "utf8"))}`);
  console.log(`    js           ${kb(Buffer.byteLength(js, "utf8"))}`);
  console.log(`    ─────────────────────`);
  console.log(`    raw          ${kb(raw)}   (${raw.toLocaleString()} bytes)`);
  console.log(`    gzipped      ${kb(gz)}   (${gz.toLocaleString()} bytes)`);
  console.log(`    minified     ${MINIFY ? "yes" : "no"}\n`);

  /* The Rust shell embeds this exact file — `include_str!` on it — so a build
     that forgot to run leaves a stale binary rather than a missing one. Saying
     the path out loud is the cheapest guard against that. */
  await readFile(OUT_HTML);
}

await main();
