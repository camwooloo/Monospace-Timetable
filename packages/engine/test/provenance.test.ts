/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ WHAT WE COPIED FROM MONOSPACE, AND EXACTLY HOW FAR IT HAS DRIFTED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `src/lib/` is Monospace's pure timetable spec, copied. Those files carry
 * measurements that cost three attempts to get right — the OKLab bisection
 * whose own rule is "measure, never reason from the constants", the workbook
 * geometry transcribed cell by cell from a real school's file, the five cell
 * rules. ⚠️ THE COMMENTS ARE THE SPECIFICATION, so a "tidy-up" here is a
 * silent loss of the reasoning, and a helpful reformat makes the next re-sync
 * from Monospace impossible to verify.
 *
 * So the divergence is PINNED. For each copied file this asserts either that
 * it is byte-identical to Monospace's, or that the ONLY differing lines are
 * import-path rewrites that are listed here one by one.
 *
 * ⭐ AND IT DOUBLE-CHECKS THE FIXTURE GATE'S PREMISE. The gate proves our
 * WRITER matches Monospace's for one model; it says nothing about the SPEC
 * both sides share, because both sides import their own copy. If
 * `timetableSheet.ts` here drifted from Monospace's, the gate would compare
 * two workbooks built from two different palettes and — because our model
 * builder feeds both — would not notice.
 *
 * ⚠️ SKIPPED WITHOUT A MONOSPACE CHECKOUT, because it is the one test that
 * genuinely cannot run without one. Everything else in the suite compares
 * against committed fixtures.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { haveMonospaceSource, monospaceRoot } from "./reference";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

type Copied = {
  /** Path under `packages/engine/`. */
  ours: string;
  /** Path under the Monospace checkout. */
  theirs: string;
  /**
   * Every line that is allowed to differ, as `[theirs, ours]`.
   *
   * ⚠️ AN EMPTY LIST MEANS BYTE-IDENTICAL and is the strongest statement this
   * test can make. ⭐ SIX OF THE NINE ARE IN THAT STATE — every file under
   * `convex/lib/`, including `timetableSheet.ts` and its palette — because
   * their imports were already relative in a way that survived the move. The
   * three that differ are the client-side helpers, whose `../../../convex/lib/`
   * prefixes had nowhere to point.
   */
  rewrites: Array<[string, string]>;
};

/**
 * ⚠️ THE REWRITES ARE ALL PATHS AND NOTHING ELSE. Monospace lives at
 * `convex/lib/` with the client reaching in from `src/lib/timetable/`; here
 * everything is under one `src/lib/`, so the `../../../convex/lib/` prefixes
 * collapse. Not one line of logic or comment is on this list, and if a future
 * change needs to add one, that is the moment to ask whether the copy should
 * become a fork instead.
 */
const COPIED: Copied[] = [
  { ours: "src/lib/timetable.ts", theirs: "convex/lib/timetable.ts", rewrites: [] },
  { ours: "src/lib/timetableAccent.ts", theirs: "convex/lib/timetableAccent.ts", rewrites: [] },
  { ours: "src/lib/bookingTime.ts", theirs: "convex/lib/bookingTime.ts", rewrites: [] },
  {
    ours: "src/lib/timetableSheet.ts",
    theirs: "convex/lib/timetableSheet.ts",
    rewrites: [],
  },
  {
    ours: "src/lib/bookingRooms.ts",
    theirs: "convex/lib/bookingRooms.ts",
    rewrites: [],
  },
  {
    ours: "src/lib/bookingPublished.ts",
    theirs: "convex/lib/bookingPublished.ts",
    rewrites: [],
  },
  {
    ours: "src/lib/timetable/weekBand.ts",
    theirs: "src/lib/timetable/weekBand.ts",
    rewrites: [
      [
        'import { weekBandLabel } from "../../../convex/lib/timetableSheet";',
        'import { weekBandLabel } from "../timetableSheet";',
      ],
    ],
  },
  {
    ours: "src/lib/timetable/caret.ts",
    theirs: "src/lib/timetable/caret.ts",
    rewrites: [
      [
        'import { gridInkOn } from "../../../convex/lib/timetableSheet";',
        'import { gridInkOn } from "../timetableSheet";',
      ],
    ],
  },
  {
    ours: "src/lib/timetable/vocab.ts",
    theirs: "src/lib/timetable/vocab.ts",
    rewrites: [['} from "../../../convex/lib/timetable";', '} from "../timetable";']],
  },
];

describe.skipIf(!haveMonospaceSource())("the copied spec", () => {
  for (const file of COPIED) {
    test(`${file.ours} differs from Monospace's only where it must`, () => {
      const theirs = readFileSync(resolve(monospaceRoot(), file.theirs), "utf8");
      let ours = readFileSync(resolve(ROOT, file.ours), "utf8");

      /* Undo each declared rewrite, in reverse, and require what is left to be
         byte-identical. ⭐ THAT DIRECTION MATTERS: it proves the rewrite is
         exactly what we said it was, rather than merely that some line
         changed. */
      for (const [from, to] of file.rewrites) {
        expect(ours, `${file.ours} should contain the rewritten line`).toContain(to);
        ours = ours.replace(to, from);
      }

      expect(
        ours === theirs,
        file.rewrites.length === 0
          ? `${file.ours} must be byte-identical to Monospace's ${file.theirs}. ` +
              `The comments in it are the specification — several record measurements ` +
              `that cost three attempts. If a change is genuinely needed, add it to ` +
              `this file's \`rewrites\` with a reason.`
          : `${file.ours} differs from ${file.theirs} beyond the ${file.rewrites.length} ` +
              `declared import rewrite(s).`,
      ).toBe(true);
    });
  }

  /**
   * ⭐ THE WRITER IS THE ONE COPY WITH REAL EDITS — the four documented in its
   * own banner. This does not diff it line by line (that would be a second
   * copy of the diff, kept by hand, drifting); it checks that the banner still
   * NAMES four changes and that each one is actually in force. The fixture
   * gate is what proves nothing else moved.
   */
  test("the writer's four documented changes are all still in force", () => {
    const ours = readFileSync(
      resolve(ROOT, "src/workbook/timetableWorkbook.ts"),
      "utf8",
    );
    const theirs = readFileSync(
      resolve(monospaceRoot(), "src/lib/timetableWorkbook.ts"),
      "utf8",
    );

    /* 1. server-only is gone from ours and present in theirs. */
    expect(theirs).toMatch(/^import "server-only";/m);
    expect(ours).not.toMatch(/^import "server-only";/m);

    /* 2. node:stream became the two-target port.
       ⚠️ THE TEST IS ON THE IMPORT STATEMENT, NOT ON THE STRING. Our banner
       DISCUSSES `node:stream` at length — it is documented change #2 — so a
       substring test fails on the very comment that records the decision. */
    expect(theirs).toMatch(/^import .*from "node:stream";/m);
    expect(ours).not.toMatch(/^import .*from "node:stream";/m);
    expect(ours).toMatch(/from "\.\/stream"/);

    /* 3. exceljs by deep specifier, as a value; barrel as a type only. */
    expect(theirs).toMatch(/^import ExcelJS from "exceljs";/m);
    expect(ours).toMatch(/^import type ExcelJS from "exceljs";/m);
    expect(ours).toContain("exceljs/lib/stream/xlsx/workbook-writer.js");

    /* 4. the buffered entry point, which theirs does not have. */
    expect(theirs).not.toContain("bufferTimetableWorkbook");
    expect(ours).toContain("export async function bufferTimetableWorkbook");

    /* ⚠️ AND THE BODY IS STILL THEIRS. A crude but effective floor: the two
       files should still be within a few percent of the same length, and every
       one of the writer's own section banners should still be present. A
       rewrite would blow past this long before a reviewer noticed. */
    for (const banner of [
      "THE GRID SHEET",
      "STYLE PRIMITIVES",
      "hoistSheetProtection",
      "CLASS PALETTE",
    ]) {
      expect(ours, `the writer still carries its "${banner}" section`).toContain(
        banner,
      );
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE NODE TARGET, FROM THE BUILT PACKAGE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ EVERY OTHER TEST IMPORTS `src/`, THROUGH VITEST'S TRANSFORM. That proves
 * the code is right and proves nothing about what gets PUBLISHED — and the
 * published artefact has already been broken once here in a way nothing else
 * would have caught: `tsc` emits extensionless relative specifiers, Node's ESM
 * loader refuses them, and `dist/index.js` built cleanly and could not be
 * imported at all. `scripts/fix-esm-extensions.ts` is the fix; this is the
 * test that it is still working.
 *
 * ⭐ IT SKIPS WHEN `dist/` IS ABSENT rather than failing, because `npm test`
 * has to work on a fresh clone before anybody has run `npm run build`.
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIST = resolve(ROOT, "dist/index.js");

describe.skipIf(!existsSync(DIST))("the built package", () => {
  test("Node can import dist/ and write a workbook from it", async () => {
    const mod = (await import(pathToFileURL(DIST).href)) as {
      buildTimetableModel: typeof import("../src/model/buildModel").buildTimetableModel;
      bufferTimetableWorkbook: typeof import("../src/workbook/timetableWorkbook").bufferTimetableWorkbook;
      SCHOOL_DOCUMENT_VERSION: number;
    };

    expect(mod.SCHOOL_DOCUMENT_VERSION).toBe(1);

    const { makeFixtureDocument, FIXTURE_NOW, FIXTURE_PASSWORD } = await import(
      "./fixtures/schoolDocument"
    );
    const built = mod.buildTimetableModel({
      document: makeFixtureDocument(),
      now: FIXTURE_NOW,
      generatedBy: "Fixture",
      password: FIXTURE_PASSWORD,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const bytes = await mod.bufferTimetableWorkbook(built.model);
    /* A zip, and a workbook-sized one. The byte-level claim is the fixture
       gate's job; this one is "the published thing runs at all". */
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes.length).toBeGreaterThan(100_000);
    console.log(`\n  dist/ produced a ${bytes.length}-byte workbook under Node`);
  });
});
