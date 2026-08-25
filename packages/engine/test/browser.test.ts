/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE BROWSER HALF, RUN — NOT MERELY BUILT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ "IT BUNDLES" PROVES ALMOST NOTHING HERE. Every failure this port can have
 * is a RUNTIME one: `ExcelJS.stream` undefined because the barrel resolved to
 * the browser dist; `Buffer is not defined` three frames inside the zip stack;
 * two copies of `readable-stream` failing an `instanceof` inside
 * `zip.pipe()`; `setImmediate` collapsed to a microtask and the window
 * freezing. A bundler reports none of them.
 *
 * So this builds the browser bundle and EXECUTES it in a context that has ONLY
 * browser globals. `vm.createContext` with a curated sandbox is the whole
 * mechanism: `process`, `Buffer`, `setImmediate`, `require` and `module` are
 * ABSENT from it, so anything the bundle needs must have come from
 * `BROWSER_SHIMS` — if a shim is missing, the failure is a `ReferenceError`
 * naming it rather than a silent fallback to Node's real one.
 *
 * ⭐ AND THEN THE BYTES ARE COMPARED THROUGH THE SAME GATE. The workbook the
 * sandbox produces goes through `compare()` against the committed reference
 * that MONOSPACE'S writer generated — so the claim is not "the browser build
 * works", it is "the browser build produces Monospace's file".
 *
 * ── ⚠️ WHAT THIS IS NOT ──────────────────────────────────────────────────
 * It is not a real browser engine, and it does not pretend to be. What it
 * pins is the thing a real browser would break on and CI cannot otherwise
 * see: the shim list, the stream port and the module resolution. Layout,
 * download plumbing and the File System Access API belong to the host
 * package's own tests, on a real browser.
 */

import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import { build } from "esbuild";
import {
  ReadableStream as NodeReadableStream,
  WritableStream as NodeWritableStream,
  TransformStream as NodeTransformStream,
} from "node:stream/web";

import { browserBuildOptions } from "../scripts/build-browser";
import { buildTimetableModel } from "../src/model/buildModel";
import {
  FIXTURE_NOW,
  FIXTURE_PASSWORD,
  makeFixtureDocument,
} from "./fixtures/schoolDocument";
import { readZip, stripVolatile, bytesEqual } from "./zip";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENTRY = "test/fixtures/browserEntry.ts";
const OUT = "build/browser-sandbox.js";
const OUT_MIN = "build/browser-sandbox.min.js";

let bundle = "";
let bundleMin = "";

beforeAll(async () => {
  const result = await build({
    ...browserBuildOptions(ENTRY, OUT, {
      /* ⭐ IIFE SO THE SANDBOX CAN REACH IT. The shipped bundles are ESM; this
         one differs ONLY in format, because `vm` has no module loader. Every
         alias, inject and resolution rule is the same object from
         `browserBuildOptions`, so what runs here is what ships. */
      format: "iife",
      globalName: "TimetableEngineTest",
      metafile: true,
      write: true,
    }),
  });
  bundle = readFileSync(resolve(ROOT, OUT), "utf8");

  const outputs = result.metafile!.outputs;
  const bytes = Object.values(outputs)[0].bytes;
  console.log(`\n  browser bundle for the sandbox: ${(bytes / 1024).toFixed(1)} KB`);

  /**
   * ⭐⭐ AND THE SAME BUNDLE MINIFIED, BECAUSE THAT IS THE FORM THAT SHIPS.
   *
   * ⚠️ `apps/tool` builds with `minify: true` unless `MINIFY=0`, so every
   * school runs minified code — and until this existed, the byte-equality
   * proof only ever ran on the UNMINIFIED bundle. That is a real gap rather
   * than a theoretical one: esbuild's minifier renames every function, and
   * the zip stack under exceljs is full of `instanceof` and constructor-name
   * dispatch. A minifier setting that broke one of them would have produced
   * a green suite and a broken download.
   *
   * It costs one more build and one more sandbox run (~35 s). The alternative
   * is shipping a form of the code that nothing has ever executed.
   */
  const minResult = await build({
    ...browserBuildOptions(ENTRY, OUT_MIN, {
      format: "iife",
      globalName: "TimetableEngineTest",
      minify: true,
      metafile: true,
      write: true,
    }),
  });
  bundleMin = readFileSync(resolve(ROOT, OUT_MIN), "utf8");
  const minBytes = Object.values(minResult.metafile!.outputs)[0].bytes;
  console.log(`  minified bundle (the shipped form): ${(minBytes / 1024).toFixed(1)} KB`);
});

/**
 * ⭐⭐ A BROWSER'S GLOBALS AND NOTHING ELSE.
 *
 * ⚠️ THE ABSENCES ARE THE TEST. `process`, `Buffer`, `setImmediate`,
 * `require`, `module`, `__dirname` and `global` are deliberately NOT here. In
 * a normal Node test they would all exist, the shims would be dead weight, and
 * a bundle that had quietly stopped injecting them would still pass.
 *
 * The web streams come from `node:stream/web`, which IS the WHATWG
 * implementation — the same interface a browser exposes, not a stand-in.
 */
function browserSandbox(): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {
    console,
    TextDecoder,
    TextEncoder,
    ReadableStream: NodeReadableStream,
    WritableStream: NodeWritableStream,
    TransformStream: NodeTransformStream,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    MessageChannel,
    URL,
    /* ⭐ REAL BROWSER GLOBALS, and every one of them was added because the
       sandbox threw without it. `abort-controller`'s browser build reads
       `self.AbortController` and assigns onto the result, so its absence
       surfaces as "Cannot set properties of undefined" from inside
       readable-stream — which is exactly the kind of failure a bundler cannot
       report and this test exists to find. */
    AbortController,
    AbortSignal,
    Event,
    EventTarget,
    DOMException,
    atob,
    btoa,
    /* `randombytes` reaches for `crypto.getRandomValues` in a browser build.
       ⭐ Handing it the REAL one keeps the salt cryptographically strong,
       which is the whole reason the fixture gate has to normalise it. */
    crypto: {
      getRandomValues: <T extends ArrayBufferView>(a: T): T =>
        globalThis.crypto.getRandomValues(a as never) as T,
    },
    performance,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  return sandbox;
}

type SandboxApi = {
  generate: (nowMs: number, password: string) => Promise<Uint8Array>;
};

/**
 * Run one bundle in a fresh browser-only sandbox and hand back its bytes.
 *
 * ⚠️ THE ABSENCES ARE ASSERTED HERE, ONCE, FOR EVERY CALLER — a sandbox that
 * had acquired a `process` would make everything downstream pass for the wrong
 * reason.
 */
async function bytesFromSandbox(code: string, filename: string): Promise<Uint8Array> {
  const sandbox = browserSandbox();

  for (const forbidden of [
    "process",
    "Buffer",
    "setImmediate",
    "require",
    "module",
    "global",
    "__dirname",
  ]) {
    expect(
      Object.prototype.hasOwnProperty.call(sandbox, forbidden),
      `the sandbox must NOT provide ${forbidden}`,
    ).toBe(false);
  }

  const context = createContext(sandbox);
  runInContext(code, context, { filename });

  const api = (sandbox as Record<string, unknown>)
    .TimetableEngineTest as SandboxApi;
  expect(typeof api?.generate, `${filename} exposed its entry point`).toBe(
    "function",
  );

  const raw = await api.generate(FIXTURE_NOW, FIXTURE_PASSWORD);
  /* It crosses the vm boundary as that context's Uint8Array, so copy it into
     one this realm's `instanceof` agrees with before doing anything else. */
  return Uint8Array.from(raw as unknown as ArrayLike<number>);
}

/**
 * The same comparison the fixture gate makes, against the same committed
 * reference that MONOSPACE'S writer generated.
 */
function compareToReference(fromBrowser: Uint8Array, label: string): void {
  const reference = new Uint8Array(
    readFileSync(resolve(ROOT, "fixtures/reference-full.xlsx")),
  );
  const a = readZip(reference);
  const b = readZip(fromBrowser);

  expect(b.map((m) => m.name)).toEqual(a.map((m) => m.name));

  let raws = 0;
  let normalised = 0;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].method === b[i].method &&
      a[i].crc32 === b[i].crc32 &&
      bytesEqual(a[i].compressed, b[i].compressed)
    ) {
      raws++;
      continue;
    }
    const sa = stripVolatile(a[i].content);
    const sb = stripVolatile(b[i].content);
    expect(sb.hits, `${b[i].name}: volatile substitution counts`).toEqual(
      sa.hits,
    );
    expect(sa.hits.some((n) => n > 0), `${b[i].name} differs for no permitted reason`).toBe(true);
    expect(sb.text, `${b[i].name}, normalised`).toEqual(sa.text);
    normalised++;
  }

  console.log(
    `  ${label} vs Monospace's reference: ${raws} members byte-identical raw, ${normalised} identical after normalising, ${a.length} total`,
  );
  expect(raws + normalised).toBe(a.length);
}

describe("the browser build", () => {
  test("runs with only browser globals and writes Monospace's bytes", async () => {
    const fromBrowser = await bytesFromSandbox(bundle, "browser-bundle.js");
    console.log(`  bytes produced in the sandbox: ${fromBrowser.length}`);
    compareToReference(fromBrowser, "unminified");
  });

  /**
   * ⭐⭐ THE FORM A SCHOOL ACTUALLY RUNS.
   *
   * ⚠️ `apps/tool/scripts/build.ts` minifies unless `MINIFY=0`, so the code in
   * `dist/timetable.html` — and therefore the code inside the `.exe` — is the
   * minified bundle, not the one the test above executes. Renaming every
   * function in a graph that contains `readable-stream`'s `instanceof`
   * chains, `archiver`'s constructor dispatch and exceljs's private
   * `_write*` methods is not a no-op by inspection; it is a no-op by
   * MEASUREMENT, and this is the measurement.
   *
   * ⭐ IT COMPARES AGAINST THE SAME REFERENCE BYTES, so "minified still
   * works" is not the claim — "minified still writes Monospace's file" is.
   */
  test("the MINIFIED bundle — the form that ships — writes the same bytes", async () => {
    const fromBrowser = await bytesFromSandbox(
      bundleMin,
      "browser-bundle.min.js",
    );
    console.log(`  bytes produced by the minified bundle: ${fromBrowser.length}`);
    compareToReference(fromBrowser, "minified");
  });

  /**
   * ⭐ THE DEDUPE, CHECKED ON THE REAL BUNDLE.
   *
   * `assertSingleReadableStream` is the runtime guard a host calls at boot.
   * This is the build-time half: if esbuild resolved two copies of
   * `readable-stream`, the bundle carries two definitions of its `Writable`
   * and the first `addWorksheet()` throws an `instanceof` failure with nothing
   * in the message about duplicate packages.
   */
  test("the bundle contains exactly one readable-stream", () => {
    /**
     * esbuild stamps each included file's path as a comment, so the copies can
     * be counted without executing anything.
     *
     * ⚠️ THE PATTERN MATCHES THE PACKAGE **ROOT**, not one file inside it. An
     * earlier version matched `readable-stream/lib/stream.js` and reported
     * "1 copy" for a bundle that had three — v4 at the root and v2 nested
     * under archiver-utils use entirely different filenames, so the copy it
     * was counting was the only one that happened to have that layout. The
     * test passed while the bundle was broken, which is the worst thing a test
     * can do.
     */
    const paths = [
      ...bundle.matchAll(
        /\/\/ (node_modules\/(?:[^\s]*\/)?readable-stream)\//g,
      ),
    ].map((m) => m[1]);
    const distinct = new Set(paths);
    console.log(
      `  readable-stream copies in the bundle: ${distinct.size}` +
        (distinct.size ? ` (${[...distinct].join(", ")})` : ""),
    );
    expect(distinct.size).toBe(1);
  });
});
