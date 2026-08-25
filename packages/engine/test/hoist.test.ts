/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ PROVING THE `CT_Worksheet` CHECK ACTUALLY CHECKS SOMETHING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `fixture.test.ts` asserts that every sheet part obeys `CT_Worksheet`'s
 * element sequence, and it passes. ⚠️ A VALIDATOR THAT HAS ONLY EVER PASSED IS
 * A VALIDATOR NOBODY HAS TESTED — a scanner with an off-by-one in its depth
 * tracking, or a canonical order with the wrong element in it, passes exactly
 * as loudly as a correct one.
 *
 * So this test breaks the thing the check exists to catch, and requires the
 * check to notice.
 *
 * ── ⭐ WHAT IS BROKEN, AND HOW ───────────────────────────────────────────
 * `hoistSheetProtection()` in the writer moves `<sheetProtection>` from where
 * exceljs's STREAMING writer puts it (near the end, after `<mergeCells>` and
 * `<conditionalFormatting>`) to the one place `CT_Worksheet` allows it:
 * immediately after `</sheetData>`. It does that by wrapping the worksheet's
 * `_writeCloseSheetData` and nulling the model so the library's own late call
 * renders nothing.
 *
 * ⚠️ THE SABOTAGE IS NOT "DELETE THE FUNCTION". The hoist has a deliberate
 * guard — if a future exceljs renames those private methods, or fixes the
 * order itself, it falls through to the library's behaviour rather than
 * throwing mid-stream when the HTTP status is already spent. Removing the
 * methods would trip THAT path and produce a workbook with no
 * `<sheetProtection>` at all, which is a different defect and would not
 * exercise the sequence check.
 *
 * ⭐ SO THE WRAPPER IS NEUTRALISED INSTEAD, by giving the prototype an
 * accessor whose SETTER SWALLOWS THE ASSIGNMENT. The hoist reads both methods
 * (both are functions, so its guard passes), builds its wrapper, assigns
 * it — and the assignment goes nowhere. Everything else is untouched: the
 * library writes `<sheetProtection>` in its own late position, exactly as it
 * would have without the fix. That is the real regression, reproduced.
 */

import { afterEach, expect, test } from "vitest";
import WorksheetWriter from "exceljs/lib/stream/xlsx/worksheet-writer.js";

import { buildTimetableModel } from "../src/model/buildModel";
import { bufferTimetableWorkbook } from "../src/workbook/timetableWorkbook";
import {
  FIXTURE_NOW,
  FIXTURE_PASSWORD,
  makeFixtureDocument,
} from "./fixtures/schoolDocument";
import { readZip } from "./zip";
import { sequenceViolations, worksheetChildren } from "./ctWorksheet";

/**
 * 2 cycle-week templates + 38 teaching weeks.
 *
 * ⚠️ THE HALF-TERM SHEET AND THE INFO SHEET ARE NOT IN IT, and that is a fact
 * about the feature rather than about the fixture: neither is ever protected.
 * The half-term sheet carries no cell anybody types into and is one of the
 * three sheets that make "every sheet is hidden" — the state Excel refuses to
 * open a workbook in — unreachable by construction.
 */
const PROTECTED_GRID_SHEETS = 40;

const prototype = WorksheetWriter.prototype as unknown as Record<
  string,
  unknown
>;
const original = prototype._writeCloseSheetData;

function disableHoist(): void {
  Object.defineProperty(prototype, "_writeCloseSheetData", {
    configurable: true,
    get() {
      return original;
    },
    /* ⚠️ THE WHOLE SABOTAGE. `hoistSheetProtection` does
       `target._writeCloseSheetData = wrapper`; an accessor on the prototype
       means that assignment calls this setter instead of creating an own
       property, and this setter does nothing. The hoist runs, its guard
       passes, and it has no effect. */
    set() {
      /* swallowed */
    },
  });
}

afterEach(() => {
  Object.defineProperty(prototype, "_writeCloseSheetData", {
    configurable: true,
    writable: true,
    value: original,
  });
});

async function sheetPartsOf(): Promise<Array<{ name: string; xml: string }>> {
  const built = buildTimetableModel({
    document: makeFixtureDocument(),
    now: FIXTURE_NOW,
    generatedBy: "Fixture",
    password: FIXTURE_PASSWORD,
  });
  if (!built.ok) throw new Error(built.error);
  const bytes = await bufferTimetableWorkbook(built.model);
  return readZip(bytes)
    .filter((m) => /^xl\/worksheets\/sheet\d+\.xml$/.test(m.name))
    .map((m) => ({ name: m.name, xml: new TextDecoder().decode(m.content) }));
}

test("with the hoist disabled, the sequence check reports exactly 40 violations", async () => {
  disableHoist();
  const parts = await sheetPartsOf();

  const violations = parts.flatMap((p) => sequenceViolations(p.name, p.xml));

  console.log(
    `\n  hoist DISABLED: ${violations.length} CT_Worksheet violations across ${parts.length} sheet parts` +
      (violations[0] ? `\n    e.g. ${violations[0].part}: ${violations[0].message}` : ""),
  );

  expect(violations.length).toBe(PROTECTED_GRID_SHEETS);

  /* ⭐ AND IT IS THE RIGHT VIOLATION, not 40 of something else. Every one must
     be `<sheetProtection>` landing after an element the schema puts later —
     which is the exact defect the hoist exists to prevent. */
  for (const v of violations) {
    expect(v.element).toBe("sheetProtection");
  }

  /**
   * ⭐ THE ELEMENT IT LANDS AFTER, **MEASURED**. exceljs's streaming writer
   * emits `<sheetProtection>` past both `_writeMergeCells()` and
   * `_writeConditionalFormatting()`, so the writer's own banner describes it
   * as "three elements too late".
   *
   * ⚠️ THE REPORTED `after` IS THEREFORE ALWAYS `conditionalFormatting` AND
   * NEVER `mergeCells` — the check names the LAST element the schema puts
   * earlier, and conditional formatting is later in the sequence than merges.
   * This assertion was first written as both, by reasoning from the banner
   * rather than from the output, and the test said so. Every grid sheet here
   * has conditional formatting because `linkTemplates` is on, which is what
   * makes the answer uniform.
   */
  const afters = new Set(violations.map((v) => v.after));
  expect([...afters]).toEqual(["conditionalFormatting"]);
});

test("with the hoist enabled, sheetProtection sits immediately after sheetData", async () => {
  const parts = await sheetPartsOf();

  let protectedSheets = 0;
  for (const p of parts) {
    const children = worksheetChildren(p.xml);
    const at = children.indexOf("sheetProtection");
    if (at < 0) continue;
    protectedSheets++;
    /* ⚠️ NOT MERELY "BEFORE mergeCells". `CT_Worksheet` puts `sheetCalcPr`
       between `sheetData` and `sheetProtection`, and this writer emits none,
       so the correct position here is exactly adjacent. Asserting adjacency
       rather than mere ordering is what would catch the element drifting one
       slot and still passing the ordering test. */
    expect(children[at - 1], `${p.name}: element before <sheetProtection>`).toBe(
      "sheetData",
    );
    /* And there is exactly one — the hoist nulls the model so the library's
       own late call renders nothing rather than a second element. */
    expect(
      children.filter((c) => c === "sheetProtection").length,
      `${p.name}: number of <sheetProtection> elements`,
    ).toBe(1);
  }

  console.log(
    `\n  hoist ENABLED: ${protectedSheets} sheets carry <sheetProtection>, all immediately after </sheetData>`,
  );
  expect(protectedSheets).toBe(PROTECTED_GRID_SHEETS);
  expect(parts.flatMap((p) => sequenceViolations(p.name, p.xml))).toEqual([]);
});
