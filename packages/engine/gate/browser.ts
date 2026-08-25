/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE BROWSER HALF, RUN — NOT MERELY BUILT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ "IT BUNDLES" PROVES ALMOST NOTHING HERE. Every failure this port can have
 * is a RUNTIME one: `ExcelJS.stream` undefined because the barrel resolved to
 * the browser dist; `Buffer is not defined` three frames inside the zip stack;
 * two copies of `readable-stream` failing an `instanceof` inside `zip.pipe()`;
 * `setImmediate` collapsed to a microtask and the window freezing. A bundler
 * reports none of them.
 *
 * So this builds the browser bundle and EXECUTES it in a context that has ONLY
 * browser globals. `vm.createContext` with a curated sandbox is the whole
 * mechanism: `process`, `Buffer`, `setImmediate`, `require` and `module` are
 * ABSENT from it, so anything the bundle needs must have come from
 * `BROWSER_SHIMS` — if a shim is missing, the failure is a `ReferenceError`
 * naming it rather than a silent fallback to Node's real one.
 *
 * ⭐ AND THEN THE BYTES GO THROUGH THE SAME `compare()` AS EVERYTHING ELSE,
 * against the committed reference that MONOSPACE'S writer generated — so the
 * claim is not "the browser build works", it is "the browser build produces
 * Monospace's file".
 *
 * ── ⚠️ WHY THIS IS IN THE GATE AND NOT IN VITEST ─────────────────────────
 * It is the single most expensive thing this package does — ~31 s per sandbox
 * run on the machine the fixtures were made on, because `create-hash` computes
 * 40 × 100,000 SHA-512 rounds in JavaScript rather than in OpenSSL, and none
 * of it yields. Under vitest that starved the reporter RPC and killed a run in
 * which every test had passed. See `harness.ts`.
 *
 * ── ⚠️ WHAT THIS IS NOT ──────────────────────────────────────────────────
 * It is not a real browser engine, and it does not pretend to be. What it pins
 * is the thing a real browser would break on and CI cannot otherwise see: the
 * shim list, the stream port and the module resolution. Layout, download
 * plumbing and the File System Access API belong to the host package's own
 * tests, on a real browser.
 */

import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, stop } from "esbuild";
import {
  ReadableStream as NodeReadableStream,
  WritableStream as NodeWritableStream,
  TransformStream as NodeTransformStream,
} from "node:stream/web";

import { browserBuildOptions } from "../scripts/build-browser";
import { FIXTURE_NOW, FIXTURE_PASSWORD } from "../test/fixtures/schoolDocument";
import { equal, ok } from "./harness";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENTRY = "test/fixtures/browserEntry.ts";

export type SandboxBundle = {
  label: string;
  code: string;
  filename: string;
  kilobytes: number;
};

/**
 * ⭐ THE TWO FORMS, DECLARED WHERE THE REPORT CAN SEE THEM.
 *
 * ⚠️ `run.ts` iterates THIS, not the build's result. If the build step fails,
 * the two sandbox comparisons must still appear in the report — as SKIPPED,
 * pointing at the failure above — rather than silently not existing. A gate
 * that quietly runs ten checks instead of twelve is the exact failure mode
 * this package exists to prevent, and "the summary is shorter than it was" is
 * not something anybody notices.
 */
export const SANDBOX_FORMS = [
  { label: "unminified", out: "build/browser-sandbox.js", minify: false },
  /**
   * ⭐⭐ THE SAME BUNDLE MINIFIED, BECAUSE THAT IS THE FORM THAT SHIPS.
   *
   * ⚠️ `apps/tool` builds with `minify: true` unless `MINIFY=0`, so every
   * school runs minified code — and until this existed, the byte-equality
   * proof only ever ran on the UNMINIFIED bundle. That is a real gap rather
   * than a theoretical one: esbuild's minifier renames every function, and the
   * zip stack under exceljs is full of `instanceof` and constructor-name
   * dispatch. A minifier setting that broke one of them would have produced a
   * green suite and a broken download.
   *
   * It costs one more build and one more sandbox run. The alternative is
   * shipping a form of the code that nothing has ever executed.
   */
  { label: "minified (the shipped form)", out: "build/browser-sandbox.min.js", minify: true },
] as const;

/**
 * Build both forms once.
 *
 * ⭐ IIFE SO THE SANDBOX CAN REACH IT. The shipped bundles are ESM; these
 * differ ONLY in format, because `vm` has no module loader. Every alias,
 * inject and resolution rule is the same object from `browserBuildOptions`, so
 * what runs here is what ships.
 */
export async function buildSandboxBundles(): Promise<SandboxBundle[]> {
  const out: SandboxBundle[] = [];
  for (const form of SANDBOX_FORMS) {
    const result = await build({
      ...browserBuildOptions(ENTRY, form.out, {
        format: "iife",
        globalName: "TimetableEngineTest",
        minify: form.minify,
        metafile: true,
        write: true,
      }),
    });
    const bytes = Object.values(result.metafile!.outputs)[0].bytes;
    out.push({
      label: form.label,
      code: readFileSync(resolve(ROOT, form.out), "utf8"),
      filename: form.out,
      kilobytes: bytes / 1024,
    });
  }
  return out;
}

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
type Sandbox = {
  globals: Record<string, unknown>;
  /**
   * ⚠️ CLOSE WHAT THE BUNDLE OPENED. `src/browser/set-immediate.ts` creates a
   * module-scope `MessageChannel` — the standard un-clamped macrotask trick, and
   * the right thing for a browser, where the tab closing takes it away. Nothing
   * closes a `vm` context, so after the sandbox has produced its bytes the port
   * is still listening and Node's event loop is still alive because of it. The
   * gate printed "12 passed" and then hung, which to CI is a six-hour timeout on
   * a run that had already succeeded. So the gate tears down what it handed in.
   */
  close: () => void;
};

function browserSandbox(): Sandbox {
  const channels: MessageChannel[] = [];
  class TrackedMessageChannel extends MessageChannel {
    constructor() {
      super();
      channels.push(this);
    }
  }

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
    /* Tracked, not the real global — see `Sandbox.close`. Everything else
       about it is Node's own implementation. */
    MessageChannel: TrackedMessageChannel,
    URL,
    /* ⭐ REAL BROWSER GLOBALS, and every one of them was added because the
       sandbox threw without it. `abort-controller`'s browser build reads
       `self.AbortController` and assigns onto the result, so its absence
       surfaces as "Cannot set properties of undefined" from inside
       readable-stream — which is exactly the kind of failure a bundler cannot
       report and this check exists to find. */
    AbortController,
    AbortSignal,
    Event,
    EventTarget,
    DOMException,
    atob,
    btoa,
    /* `randombytes` reaches for `crypto.getRandomValues` in a browser build.
       ⭐ Handing it the REAL one keeps the salt cryptographically strong,
       which is the whole reason the gate has to normalise it. */
    crypto: {
      getRandomValues: <T extends ArrayBufferView>(a: T): T =>
        globalThis.crypto.getRandomValues(a as never) as T,
    },
    performance,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  return {
    globals: sandbox,
    close: () => {
      for (const c of channels) {
        c.port1.onmessage = null;
        c.port1.close();
        c.port2.close();
      }
      channels.length = 0;
    },
  };
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
export async function bytesFromSandbox(b: SandboxBundle): Promise<Uint8Array> {
  const { globals: sandbox, close } = browserSandbox();

  for (const forbidden of [
    "process",
    "Buffer",
    "setImmediate",
    "require",
    "module",
    "global",
    "__dirname",
  ]) {
    ok(
      !Object.prototype.hasOwnProperty.call(sandbox, forbidden),
      `the sandbox must NOT provide ${forbidden}`,
    );
  }

  const context = createContext(sandbox);
  try {
    runInContext(b.code, context, { filename: b.filename });

    const api = (sandbox as Record<string, unknown>).TimetableEngineTest as SandboxApi;
    equal(typeof api?.generate, "function", `${b.filename} exposed its entry point`);

    const raw = await api.generate(FIXTURE_NOW, FIXTURE_PASSWORD);
    /* It crosses the vm boundary as that context's Uint8Array, so copy it into
       one this realm's `instanceof` agrees with before doing anything else. */
    return Uint8Array.from(raw as unknown as ArrayLike<number>);
  } finally {
    close();
  }
}

/**
 * ⚠️ esbuild KEEPS A CHILD PROCESS ALIVE AND IT HOLDS THE EVENT LOOP OPEN.
 *
 * Under vitest nobody noticed: the worker was torn down and the service went
 * with it. As a plain program the gate printed all twelve results, said
 * "12 passed", and then sat there forever — which on CI is a job that burns
 * its six-hour limit and reports a timeout for a run that had already passed.
 * `run.ts` calls this once the bundles are built, and keeps a last-resort
 * watchdog for anything else that ever does the same thing.
 */
export async function stopBundler(): Promise<void> {
  await stop();
}

/**
 * ⭐ THE DEDUPE, CHECKED ON THE REAL BUNDLE.
 *
 * `assertSingleReadableStream` is the runtime guard a host calls at boot. This
 * is the build-time half: if esbuild resolved two copies of `readable-stream`,
 * the bundle carries two definitions of its `Writable` and the first
 * `addWorksheet()` throws an `instanceof` failure with nothing in the message
 * about duplicate packages.
 *
 * esbuild stamps each included file's path as a comment, so the copies can be
 * counted without executing anything.
 *
 * ⚠️ THE PATTERN MATCHES THE PACKAGE **ROOT**, not one file inside it. An
 * earlier version matched `readable-stream/lib/stream.js` and reported "1
 * copy" for a bundle that had three — v4 at the root and v2 nested under
 * archiver-utils use entirely different filenames, so the copy it was counting
 * was the only one that happened to have that layout. It passed while the
 * bundle was broken, which is the worst thing a check can do.
 */
export function readableStreamCopies(code: string): string[] {
  const paths = [
    ...code.matchAll(/\/\/ (node_modules\/(?:[^\s]*\/)?readable-stream)\//g),
  ].map((m) => m[1]);
  return [...new Set(paths)];
}
