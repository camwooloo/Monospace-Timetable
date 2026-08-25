/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ `CT_Worksheet` IS AN `xsd:sequence`, AND EXCEL ENFORCES IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A sheet part's children are not a bag; they are an ORDERED SEQUENCE, and an
 * element out of place is the "we found a problem with some content" repair
 * prompt. A repair drops what it could not place — so for a workbook whose
 * whole point is protection, an out-of-sequence `<sheetProtection>` means the
 * file opens UNPROTECTED, or does not open.
 *
 * ⚠️ AND exceljs's STREAMING WRITER GETS THIS WRONG. Its buffered writer knows
 * the rule and says so in its own source ("must be after sheetData and before
 * autoFilter", `lib/xlsx/xform/sheet/worksheet-xform.js`); `WorksheetWriter.
 * commit()` emits the element near the END, after `_writeMergeCells()` and
 * after `_writeConditionalFormatting()`. Every grid sheet in this workbook
 * merges, so the violation is not conditional — it happens on every sheet
 * either protection option touches.
 *
 * `hoistSheetProtection()` in the writer is the fix: it wraps
 * `_writeCloseSheetData` so the element lands immediately after `</sheetData>`,
 * the one place it is legal, and nulls the model so the library's own late
 * call renders nothing.
 *
 * ⭐ THIS FILE IS THE CHECK THAT THE FIX IS STILL THERE — and `gate/hoist.ts`
 * is the check that THIS check works, by turning the hoist off and requiring
 * it to fail. A validator nobody has seen fail is a validator nobody has
 * tested.
 */

/**
 * The sequence from ECMA-376 Part 1, §18.3.1.99. Order is the whole content of
 * this constant; the names are otherwise unremarkable.
 */
export const CT_WORKSHEET_SEQUENCE = [
  "sheetPr",
  "dimension",
  "sheetViews",
  "sheetFormatPr",
  "cols",
  "sheetData",
  "sheetCalcPr",
  "sheetProtection",
  "protectedRanges",
  "scenarios",
  "autoFilter",
  "sortState",
  "dataConsolidate",
  "customSheetViews",
  "mergeCells",
  "phoneticPr",
  "conditionalFormatting",
  "dataValidations",
  "hyperlinks",
  "printOptions",
  "pageMargins",
  "pageSetup",
  "headerFooter",
  "rowBreaks",
  "colBreaks",
  "customProperties",
  "cellWatches",
  "ignoredErrors",
  "smartTags",
  "drawing",
  "legacyDrawing",
  "legacyDrawingHF",
  "drawingHF",
  "picture",
  "oleObjects",
  "controls",
  "webPublishItems",
  "tableParts",
  "extLst",
] as const;

const RANK = new Map<string, number>(
  CT_WORKSHEET_SEQUENCE.map((n, i) => [n, i] as [string, number]),
);

export type SequenceViolation = {
  part: string;
  /** The element that appeared too late — or too early. */
  element: string;
  /** The element it followed, which the schema says it must precede. */
  after: string;
  /** Where it should have gone, in schema terms. */
  message: string;
};

/**
 * The top-level children of `<worksheet>`, in document order.
 *
 * ⚠️ A HAND-ROLLED SCAN AND NOT A REGEX OVER THE WHOLE FILE. `<row>` and `<c>`
 * live inside `<sheetData>` and a naive pattern would report thousands of
 * "unknown elements"; and `<mergeCell>` (singular) inside `<mergeCells>` is
 * one character from a name that IS in the sequence. Depth has to be tracked.
 */
export function worksheetChildren(xml: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) break;
    /* Skip declarations, comments and CDATA wholesale. */
    if (xml.startsWith("<?", lt) || xml.startsWith("<!", lt)) {
      const close = xml.indexOf(">", lt);
      i = close < 0 ? xml.length : close + 1;
      continue;
    }
    const gt = xml.indexOf(">", lt);
    if (gt < 0) break;
    const inner = xml.slice(lt + 1, gt);
    const closing = inner.startsWith("/");
    const selfClosing = inner.endsWith("/");
    const name = (closing ? inner.slice(1) : inner).trim().split(/[\s/>]/)[0];

    if (closing) {
      depth--;
    } else {
      /* depth 0 is <worksheet> itself; its children are seen at depth 1. */
      if (depth === 1) out.push(name);
      if (!selfClosing) depth++;
    }
    i = gt + 1;
  }
  return out;
}

/**
 * Every place the document order contradicts the schema order.
 *
 * ⭐ IT REPORTS ONE VIOLATION PER OFFENDING ELEMENT, not per pair, so the
 * count is "how many elements are in the wrong place" — which is the number
 * `gate/hoist.ts` asserts.
 */
export function sequenceViolations(
  part: string,
  xml: string,
): SequenceViolation[] {
  const children = worksheetChildren(xml);
  const out: SequenceViolation[] = [];
  let highest = -1;
  let highestName = "";
  for (const name of children) {
    const rank = RANK.get(name);
    if (rank === undefined) {
      out.push({
        part,
        element: name,
        after: highestName,
        message: `<${name}> is not a child CT_Worksheet allows at all.`,
      });
      continue;
    }
    if (rank < highest) {
      out.push({
        part,
        element: name,
        after: highestName,
        message: `<${name}> appears after <${highestName}>, but CT_Worksheet's sequence requires it before.`,
      });
      continue;
    }
    highest = rank;
    highestName = name;
  }
  return out;
}
