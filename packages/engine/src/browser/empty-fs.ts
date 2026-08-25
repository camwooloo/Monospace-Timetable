/**
 * ⚠️ THIS IS A SECOND EMPTY MODULE AND IT IS NOT A DUPLICATE OF `empty.ts`.
 *
 * `empty.ts` stands in for `fs`, which exceljs requires and never calls.
 * This one stands in for the ARCHIVER SUBGRAPH that only the file-system
 * plugins reach: `glob`, `readdir-glob`, `graceful-fs`, `lazystream`,
 * `tar-stream`, `fs-constants`. They are pulled in by `archiver`'s
 * `.directory()` / `.file()` / tar / json plugins, none of which a workbook
 * writer that pipes into a stream can reach.
 *
 * ⭐ CUTTING THEM IS WHAT MAKES THE BUNDLE SLIM, and it also removes the last
 * two Node builtins from the graph — `assert` and `constants` are reached ONLY
 * through this subgraph. So this alias is not a size optimisation bolted on
 * afterwards; it is why the shim list is as short as it is.
 *
 * ⚠️ IT IS A `Proxy` RATHER THAN `{}` SO A MISTAKE IS LOUD. If some future
 * exceljs really does reach one of these, the failure is
 * "archiver tried to use `glob`, which this browser build deliberately does
 * not include" at the call site — not `undefined is not a function` three
 * frames away.
 */

const dead = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "__esModule") return false;
      if (prop === Symbol.toPrimitive || typeof prop === "symbol") return undefined;
      return () => {
        throw new Error(
          `This browser build of the timetable engine deliberately omits archiver's ` +
            `file-system plugins, and something just called "${String(prop)}" on one. ` +
            `The workbook writer only ever pipes into a stream, so reaching this is a bug ` +
            `— see src/browser/empty-fs.ts.`,
        );
      };
    },
  },
);

export default dead;
