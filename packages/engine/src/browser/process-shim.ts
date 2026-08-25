/**
 * ══════════════════════════════════════════════════════════════════════════
 *  A `process` FOR THE FOUR THINGS THE GRAPH ACTUALLY READS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NOT A GENERAL POLYFILL, on purpose. `process` polyfills are large, and a
 * big one hides which fields are load-bearing — so when a dependency starts
 * reading a fifth one, nobody finds out until a school's export throws. Each
 * field here is present because something in the graph reads it, and a missing
 * one should be a loud `undefined` rather than a plausible lie.
 *
 * What reads what, measured on exceljs 4.4.0 and its zip stack:
 *
 *   `versions.node`   ⭐ exceljs's own `excel.js` barrel does
 *                     `parseInt(process.versions.node.split('.')[0], 10) < 10`
 *                     at module load and THROWS below 10. This package imports
 *                     the streaming writer directly and so never loads that
 *                     file — but `readable-stream` reads `versions` too, and a
 *                     version string is one line.
 *   `nextTick`        `readable-stream` schedules its callbacks with it. It
 *                     must be a MICROTASK: a `setTimeout(0)` version reorders
 *                     stream events relative to promises and the zip's
 *                     `finish` can arrive before its last `data`.
 *   `env`             read for feature flags; an empty object is correct.
 *   `cwd`             read by path handling that this package never reaches;
 *                     returns "/" rather than throwing.
 *   `browser`         the flag several Node-shaped libraries branch on.
 */

const nextTick = (cb: (...args: unknown[]) => void, ...args: unknown[]): void => {
  /* ⚠️ A MICROTASK, NOT A TIMER. See the banner. */
  queueMicrotask(() => cb(...args));
};

export const process = {
  browser: true,
  env: {} as Record<string, string | undefined>,
  argv: [] as string[],
  version: "v20.0.0",
  versions: { node: "20.0.0" } as Record<string, string>,
  platform: "browser",
  nextTick,
  cwd: () => "/",
  emitWarning: () => {},
  on: () => {},
  once: () => {},
  off: () => {},
  removeListener: () => {},
  listeners: () => [] as unknown[],
};

export default process;
