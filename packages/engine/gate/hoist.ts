/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ PROVING THE `CT_Worksheet` CHECK ACTUALLY CHECKS SOMETHING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The gate asserts that every sheet part obeys `CT_Worksheet`'s element
 * sequence, and it passes. ⚠️ A VALIDATOR THAT HAS ONLY EVER PASSED IS A
 * VALIDATOR NOBODY HAS TESTED — a scanner with an off-by-one in its depth
 * tracking, or a canonical order with the wrong element in it, passes exactly
 * as loudly as a correct one.
 *
 * So this breaks the thing the check exists to catch, and requires the check
 * to notice.
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
 * (both are functions, so its guard passes), builds its wrapper, assigns it —
 * and the assignment goes nowhere. Everything else is untouched: the library
 * writes `<sheetProtection>` in its own late position, exactly as it would
 * have without the fix. That is the real regression, reproduced.
 *
 * ⚠️ AND IT PATCHES A SHARED PROTOTYPE, so the restore is not optional and is
 * not trusted either — `withHoistDisabled` puts the original back in a
 * `finally` AND the caller proves the prototype is the original function
 * again. Under vitest a leaked patch would have poisoned another test file;
 * here it would poison every check that runs afterwards, which is most of
 * them.
 */

import WorksheetWriter from "exceljs/lib/stream/xlsx/worksheet-writer.js";

import { equal, ok } from "./harness";
import { sequenceViolations, worksheetChildren, type SequenceViolation } from "./ctWorksheet";
import { readZip } from "./zip";
import { generateFresh, FULL_CASE } from "./workbooks";

/**
 * 2 cycle-week templates + 38 teaching weeks.
 *
 * ⚠️ THE HALF-TERM SHEET AND THE INFO SHEET ARE NOT IN IT, and that is a fact
 * about the feature rather than about the fixture: neither is ever protected.
 * The half-term sheet carries no cell anybody types into and is one of the
 * three sheets that make "every sheet is hidden" — the state Excel refuses to
 * open a workbook in — unreachable by construction.
 */
export const PROTECTED_GRID_SHEETS = 40;

const prototype = WorksheetWriter.prototype as unknown as Record<string, unknown>;
const original = prototype._writeCloseSheetData;

export type SheetPart = { name: string; xml: string };

export function sheetPartsOf(bytes: Uint8Array): SheetPart[] {
  return readZip(bytes)
    .filter((m) => /^xl\/worksheets\/sheet\d+\.xml$/.test(m.name))
    .map((m) => ({ name: m.name, xml: new TextDecoder().decode(m.content) }));
}

/** Generate the full case with the hoist neutralised, then put it back. */
export async function withHoistDisabled(): Promise<SheetPart[]> {
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
  try {
    /* ⚠️ NEVER THE CACHE. These are different bytes for the same case name. */
    return sheetPartsOf(await generateFresh(FULL_CASE));
  } finally {
    Object.defineProperty(prototype, "_writeCloseSheetData", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

/** ⚠️ Proved, not assumed. See the banner. */
export function assertHoistRestored(): void {
  ok(
    prototype._writeCloseSheetData === original,
    "the sabotage was restored — WorksheetWriter.prototype._writeCloseSheetData is the library's own method again",
  );
}

/** With the hoist off, EVERY protected grid sheet must be reported. */
export function assertSabotageDetected(parts: SheetPart[]): SequenceViolation[] {
  const violations = parts.flatMap((p) => sequenceViolations(p.name, p.xml));
  equal(
    violations.length,
    PROTECTED_GRID_SHEETS,
    `CT_Worksheet violations with the hoist disabled, across ${parts.length} sheet parts`,
  );

  /* ⭐ AND IT IS THE RIGHT VIOLATION, not 40 of something else. Every one must
     be `<sheetProtection>` landing after an element the schema puts later —
     which is the exact defect the hoist exists to prevent. */
  for (const v of violations) {
    equal(v.element, "sheetProtection", `${v.part}: the element reported out of sequence`);
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
   * rather than from the output, and the check said so. Every grid sheet here
   * has conditional formatting because `linkTemplates` is on, which is what
   * makes the answer uniform.
   */
  const afters = [...new Set(violations.map((v) => v.after))];
  equal(afters.length, 1, "the elements <sheetProtection> was reported after");
  equal(afters[0], "conditionalFormatting", "the element <sheetProtection> lands after");
  return violations;
}

/** With the hoist on, the element sits in the one place the schema allows. */
export function assertHoisted(parts: SheetPart[]): number {
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
       slot and still passing the ordering check. */
    equal(children[at - 1], "sheetData", `${p.name}: element before <sheetProtection>`);
    /* And there is exactly one — the hoist nulls the model so the library's
       own late call renders nothing rather than a second element. */
    equal(
      children.filter((c) => c === "sheetProtection").length,
      1,
      `${p.name}: number of <sheetProtection> elements`,
    );
  }
  equal(protectedSheets, PROTECTED_GRID_SHEETS, "sheets carrying <sheetProtection>");
  equal(
    parts.flatMap((p) => sequenceViolations(p.name, p.xml)).length,
    0,
    "CT_Worksheet violations with the hoist enabled",
  );
  return protectedSheets;
}
