/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ WHAT A BROWSER BUNDLE OF THIS PACKAGE NEEDS — AS DATA, IN ONE PLACE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There are TWO browser bundles: the single self-contained `.html` a school
 * double-clicks, and the same document embedded in the `.exe`. ⚠️ TWO BUNDLER
 * CONFIGS IS TWO CHANCES TO DIVERGE, and the divergence would not be a build
 * error — a bundle missing one of these throws inside the first
 * `addWorksheet()`, or crashes on `process.versions` before any of our code
 * runs, and only on the target that forgot.
 *
 * So the requirement is stated ONCE, here, as data. Each bundle reads it and
 * translates it into whatever its own tool wants. `scripts/build-browser.ts`
 * is the worked example (esbuild), and `gate/browser.ts` builds and RUNS
 * the result, so this list is executed rather than merely documented.
 *
 * ── ⭐ AND WHAT IS DELIBERATELY *NOT* SHIMMED ────────────────────────────
 * `node:stream` is not on this list, because it is not a shim: it is a second
 * implementation the PACKAGE resolves, through the `browser` field and the
 * `exports` conditions in package.json. See `src/workbook/stream.ts`. A
 * bundler alias for it would work and would be in the wrong place — it would
 * be a property of one build rather than of the package.
 *
 * `exceljs` itself is NOT aliased either, and its own `browser` field is left
 * ON. Turning it off (or disabling `mainFields`) breaks `inherits`, which
 * legitimately ships a browser build. The reason the barrel is avoided is that
 * `src/workbook/timetableWorkbook.ts` imports the streaming writer by deep
 * specifier, which a string-form `browser` field does not intercept.
 */

/** One thing a browser bundle has to be told, and why. */
export type BrowserShim = {
  /** The bare specifier to replace, or the global to provide. */
  what: string;
  kind: "alias" | "inject" | "define";
  /**
   * What to use instead. A bare package name is a real polyfill from
   * `dependencies`; a `./dist/...` path is one of ours; for a `define` it is
   * the expression the identifier is replaced with.
   */
  module: string;
  /** For `inject`: the named export that becomes the global. */
  binding?: string;
  why: string;
};

/**
 * ⚠️⚠️ THIS LIST IS **MEASURED**, AND IT IS LONGER THAN THE OBVIOUS ANSWER.
 *
 * The short version of this problem — "shim `fs`, `process` and
 * `setImmediate`, and dedupe `readable-stream`" — is what you get from looking
 * at exceljs. It is not the whole graph. `WorkbookWriter` pipes into
 * `archiver` → `zip-stream` → `compress-commons` → `crc32-stream`, and THAT
 * stack reaches `zlib`, `crypto`, `util` and `path` as well. Each was found by
 * building and reading the resolver's complaint, never by reasoning about what
 * a zip writer "probably" needs.
 *
 * ⭐ TWO OF THEM ARE THE INTERESTING ONES:
 *
 *   · `crypto` is NOT optional the moment a school types an export password.
 *     `encryptor.js` runs 100,000 sequential SHA-512 rounds SYNCHRONOUSLY, so
 *     WebCrypto cannot back it — see `crypto-shim.ts`.
 *   · `assert` and `constants` are on NOBODY'S list here, and that is a
 *     result rather than an omission: they are reachable only through
 *     archiver's file-system plugins, which `dead-subgraph` cuts. Cutting it
 *     is what makes the bundle slim AND what makes this list short.
 */
export const BROWSER_SHIMS: BrowserShim[] = [
  {
    what: "stream",
    kind: "alias",
    module: "readable-stream",
    why:
      "⭐ HALF OF THE DEDUPE. archiver-utils does `require('stream').Stream` " +
      "while exceljs's stream-buf does `require('readable-stream')`, so both " +
      "specifiers have to land on one module — see the entry below.",
  },
  {
    /**
     * ⭐⭐ THE OTHER HALF, AND THE ONE THAT ACTUALLY BIT.
     *
     * ⚠️ ALIASING A PACKAGE TO ITSELF LOOKS LIKE A NO-OP AND IS NOT. npm
     * installs `readable-stream` MANY TIMES over — measured in this tree:
     * v4 at the root, v3.6.2 nested under archiver, zip-stream,
     * compress-commons, crc32-stream, bl, tar-stream and exceljs, and v2.3.8
     * nested under archiver-utils, lazystream, jszip and hash-base. Each
     * nested copy resolves to its OWN files, so a bundle happily contains
     * three implementations of `Stream`.
     *
     * ⚠️ AND THE FAILURE NAMES NONE OF THAT. `archiver-utils.isStream()` is
     * `source instanceof Stream`; exceljs hands it a `StreamBuf` built on a
     * DIFFERENT copy's `Duplex`; the check fails and archiver throws
     * "input source must be valid Stream or Buffer instance" from inside the
     * very first `addWorksheet()`. Nothing in the message mentions duplicate
     * packages, and the Node build is unaffected because Node's own `stream`
     * is a singleton.
     *
     * Aliasing the bare specifier makes every importer — nested or not —
     * resolve to the one at the root. ⭐ WHICH IS WHY THIS PACKAGE PINS
     * `readable-stream` TO ^3.6.2 IN `dependencies`: 3.6.2 is the version
     * exceljs and the whole zip stack were written against, so converging on
     * it converges on what they expect rather than on whatever floats up.
     */
    what: "readable-stream",
    kind: "alias",
    module: "readable-stream",
    why:
      "⭐⭐ THE DEDUPE. npm nests a dozen copies of this package; each is a " +
      "distinct `Stream` class, and archiver's `instanceof` check fails on the " +
      "first addWorksheet() with a message that mentions nothing about it.",
  },
  {
    what: "zlib",
    kind: "alias",
    module: "browserify-zlib",
    why:
      "crc32-stream deflates every zip member with `new DeflateRaw`. This is " +
      "the actual compression, so it is as load-bearing as anything here — and " +
      "it is why the fixture gate compares RAW COMPRESSED BYTES: a different " +
      "deflate implementation would show up there and nowhere else.",
  },
  {
    what: "crypto",
    kind: "alias",
    module: "./dist/browser/crypto-shim.js",
    why:
      "exceljs's encryptor.js needs createHash / getHashes / randomBytes for " +
      "sheet protection. ⚠️ A SYNCHRONOUS SHA-512, so WebCrypto cannot do it; " +
      "and a minimal shim rather than crypto-browserify, which brings ciphers " +
      "and public-key crypto this package can never reach.",
  },
  {
    what: "events",
    kind: "alias",
    module: "events",
    why:
      "readable-stream 3 extends EventEmitter from `events`. ⚠️ It only " +
      "appeared once the dedupe above was in place — the copy that was being " +
      "used before reached its EventEmitter a different way, so this is a " +
      "shim the broken build did not need.",
  },
  {
    what: "util",
    kind: "alias",
    module: "util",
    why: "archiver-utils and compress-commons build their classes with util.inherits.",
  },
  {
    what: "path",
    kind: "alias",
    module: "path-browserify",
    why: "archiver-utils joins entry names with it.",
  },
  {
    what: "fs",
    kind: "alias",
    module: "./dist/browser/empty.js",
    why:
      "exceljs's WorkbookWriter opens with `require('fs')` and uses it only " +
      "for the `{ filename }` constructor, which this package never uses — it " +
      "always passes `stream`. Required and never called.",
  },
  {
    what: "process",
    kind: "inject",
    module: "./dist/browser/process-shim.js",
    binding: "process",
    why:
      "readable-stream reads process.nextTick and process.versions. ⚠️ " +
      "nextTick must be a MICROtask or stream events reorder against promises " +
      "and the zip's `finish` can arrive before its last `data`.",
  },
  {
    what: "Buffer",
    kind: "inject",
    /* ⚠️ OUR OWN ONE-LINE RE-EXPORT, NOT THE `buffer` PACKAGE DIRECTLY.
       `buffer` is CommonJS, so a bundler injecting it sees only a `default`
       export and leaves the `Buffer` identifier unbound — the bundle builds
       clean and throws `Buffer is not defined` from inside compress-commons
       the first time a workbook is written. See `buffer-shim.ts`. */
    module: "./dist/browser/buffer-shim.js",
    binding: "Buffer",
    why:
      "⚠️ EASY TO MISS BECAUSE NOTHING IMPORTS IT. exceljs and the zip stack " +
      "use `Buffer` as a GLOBAL — Buffer.concat, Buffer.alloc, " +
      "Buffer.from(password, 'utf16le'), writeUInt32LE — so it is an inject " +
      "rather than an alias, and its absence is a runtime ReferenceError " +
      "rather than a resolver error at build time.",
  },
  {
    /**
     * ⚠️⚠️ A `define`, NOT A POLYFILL, AND IT IS NOT AN ESBUILD QUIRK.
     *
     * `randombytes`' browser build reads `global.crypto`. There is no `global`
     * in a browser — that identifier is a Node-ism several packages assume a
     * bundler will supply, and webpack does while esbuild deliberately does
     * not. Without it the failure is `global is not defined` from inside
     * `randombytes`, which is reached only when a school types an export
     * PASSWORD: every other export works and the one that was supposed to be
     * locked is the one that throws.
     *
     * Mapping it to `globalThis` is the correct answer rather than a patch —
     * `globalThis` is exactly what `global` means, and it exists in every
     * target this package supports.
     */
    what: "global",
    kind: "define",
    module: "globalThis",
    why:
      "randombytes' browser build reads `global.crypto`, and a browser has no " +
      "`global`. ⚠️ Only reached when an export password is used, so its " +
      "absence breaks precisely the protected workbook.",
  },
  {
    what: "setImmediate",
    kind: "inject",
    module: "./dist/browser/set-immediate.js",
    binding: "setImmediate",
    why:
      "readable-stream and the zip stack call it and browsers have no such " +
      "function. ⚠️ It must stay a MACROtask (MessageChannel, not " +
      "queueMicrotask) or a long export freezes the window instead of yielding " +
      "to paint.",
  },
];

/**
 * ⭐ THE PART OF `archiver` A WORKBOOK WRITER CANNOT REACH.
 *
 * `archiver` ships plugins that walk a filesystem — `.directory()`, `.file()`,
 * the tar and json formats — and they drag in `glob`, `readdir-glob`,
 * `graceful-fs`, `lazystream` and `tar-stream`. This package only ever calls
 * `zip.pipe(stream)` and `append()`, so none of it is reachable.
 *
 * ⚠️ CUTTING IT IS NOT A SIZE TWEAK. `assert` and `constants` are reached ONLY
 * through this subgraph, so cutting it is what removes the last two Node
 * builtins from the browser graph. Leaving it in means two more polyfills for
 * code that can never run.
 */
export const DEAD_SUBGRAPH = [
  "glob",
  "readdir-glob",
  "graceful-fs",
  "lazystream",
  "tar-stream",
  "fs-constants",
] as const;

/**
 * ⭐ THE RUNTIME HALF OF THE DEDUPE, for a host that did not use
 * `BROWSER_SHIMS`.
 *
 * exceljs's modules `require('readable-stream')` through `stream-buf`,
 * `archiver` and `zip-stream`; `src/workbook/stream.browser.ts` imports it by
 * bare specifier for the same reason. ⚠️ IF THE BUNDLER RESOLVES TWO COPIES —
 * two versions in the tree, or its own `stream` polyfill on one side and
 * `readable-stream` on the other — the sink handed to `WorkbookWriter` is not
 * an instance of the `Writable` its `zip.pipe()` tests for, and the first
 * `addWorksheet()` throws with nothing in the message about duplicate
 * packages. It cost an afternoon the first time.
 *
 * ⚠️ AN EARLIER VERSION OF THIS COMMENT SAID "there is no alias that fixes
 * this". THAT WAS WRONG, and it was wrong in the direction that cost the most:
 * aliasing the bare specifier `readable-stream` to itself DOES converge every
 * nested copy, because a bundler alias matches on the specifier and not on the
 * importer. It is the `readable-stream` entry in `BROWSER_SHIMS` above.
 *
 * This check remains as the belt to that brace, for a host that builds its own
 * way: cheap, and it fires at startup rather than on the first export a school
 * tries to run.
 *
 * ⚠️ IT IS NOT CALLED AUTOMATICALLY. A module with a side effect at import
 * time cannot be tree-shaken and would run in Node too, where the question is
 * meaningless. The host calls it once, at boot, behind whatever "something is
 * wrong with this build" surface it has.
 */
export function assertSingleReadableStream(
  candidates: ReadonlyArray<{ Readable?: unknown; Writable?: unknown }>,
): void {
  const writables = new Set(candidates.map((c) => c.Writable).filter(Boolean));
  if (writables.size > 1) {
    throw new Error(
      `This build contains ${writables.size} copies of readable-stream. ` +
        "The workbook writer pipes into a stream exceljs type-checks with " +
        "`instanceof`, so two copies mean the first sheet fails to write. " +
        "Dedupe readable-stream in the bundler's resolver — an alias will not " +
        "fix it.",
    );
  }
}

/**
 * A summary a build script can print, so the requirement is visible in the
 * build log of both targets rather than only in this file.
 */
export function describeBrowserShims(): string {
  return BROWSER_SHIMS.map(
    (s) => `  ${s.kind.padEnd(6)} ${s.what.padEnd(13)} → ${s.module}`,
  ).join("\n");
}
