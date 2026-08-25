/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ CAN MONOSPACE STILL READ WHAT THIS TOOL WRITES?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A school can carry a year either way: out of Monospace into this tool to
 * build a workbook, or out of this tool into Monospace when they stop being a
 * school with a spreadsheet. The file in the middle is `SchoolDocument`, and
 * the two programs hold SEPARATE copies of the format —
 * `src/model/document.ts` here, `convex/lib/timetableDocument.ts` there.
 *
 * ⚠️ SO NOTHING MECHANICAL STOPS THEM DRIFTING. `provenance.test.ts` beside
 * this pins the nine files that ARE copies, byte for byte; the format is not
 * one of them yet. This test is the substitute: it takes a document this
 * tool's own fixture produces and puts it through MONOSPACE'S reader, which is
 * the thing that will actually refuse a school's file.
 *
 * A field renamed on one side and not the other, an optional turned required,
 * a constraint tightened — all of them land here as a red test rather than as
 * an admin being told "that file is not a timetable file".
 *
 * ⚠️ SKIPPED WITHOUT A MONOSPACE CHECKOUT, like `provenance.test.ts`, and for
 * the same reason: it is one of the two tests that genuinely cannot run
 * without one. ⭐ THAT MEANS CI RUNS NEITHER — neither repository provides the
 * other's source — so this is a LOCAL gate and somebody has to actually run
 * `npm test` here with the two repositories as siblings. Say so when changing
 * either format.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { haveMonospaceSource, monospaceRoot } from "../gate/reference";
import { makeFixtureDocument } from "./fixtures/schoolDocument";
import { SCHOOL_DOCUMENT_VERSION } from "../src/model/document";

const readerPath = () =>
  resolve(monospaceRoot(), "convex/lib/timetableDocument.ts");

/** Monospace's half of the format, if this machine has a checkout of it. */
const reachable = () => haveMonospaceSource() && existsSync(readerPath());

describe.skipIf(!reachable())("Monospace reads what this tool writes", () => {
  /* Imported through the path rather than a package specifier, because
     Monospace is not a dependency of anything here — it is a sibling checkout
     that may or may not exist. `vite` resolves the absolute path fine and the
     module is pure (its only imports are `./timetable` and `./timetableSheet`,
     both of which live beside it). */
  const load = async () =>
    (await import(/* @vite-ignore */ readerPath())) as {
      readSchoolDocumentStrict: (input: unknown) => {
        ok: boolean;
        issue?: { code: string; message: string; yearName?: string };
        document?: unknown;
      };
      MONOSPACE_DOCUMENT_VERSION: number;
    };

  test("the two builds agree about the format version", async () => {
    const { MONOSPACE_DOCUMENT_VERSION } = await load();
    expect(
      MONOSPACE_DOCUMENT_VERSION,
      "Monospace reads a different format version from the one this tool writes. " +
        "That is not a warning: Monospace refuses any version but its own BY NAME, " +
        "so every file this tool saves would be rejected by the website.",
    ).toBe(SCHOOL_DOCUMENT_VERSION);
  });

  test("a document this tool produces is accepted whole", async () => {
    const { readSchoolDocumentStrict } = await load();
    const doc = makeFixtureDocument();
    /* Round-tripped through JSON first, because that is what actually crosses
       between the two programs — a `Map`, a `Date` or an `undefined` that
       survives in memory here would not survive the file. */
    const result = readSchoolDocumentStrict(JSON.parse(JSON.stringify(doc)));

    expect(
      result.ok,
      result.ok
        ? ""
        : `Monospace refused this tool's own fixture: [${result.issue?.code}] ${result.issue?.message}`,
    ).toBe(true);
  });

  test("every year in the fixture survives, not just the first", async () => {
    const { readSchoolDocumentStrict } = await load();
    const doc = makeFixtureDocument();
    const result = readSchoolDocumentStrict(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    const read = result.document as { years: unknown[] };
    /* ⚠️ COUNTED, because a reader that silently kept only `years[0]` would
       pass every other assertion here — and `[0]` is the school's OLDEST year,
       which is the bug this codebase has recorded five separate readers
       having. */
    expect(read.years).toHaveLength(doc.years.length);
  });

  test("a cleared week change stays cleared", async () => {
    const { readSchoolDocumentStrict } = await load();
    const doc = makeFixtureDocument();
    const clearedHere = doc.years
      .flatMap((y) => y.weekChanges ?? [])
      .filter((w) => w.label === undefined).length;
    expect(
      clearedHere,
      "the fixture no longer contains a CLEARED week change, so this test proves nothing — put one back",
    ).toBeGreaterThan(0);

    const result = readSchoolDocumentStrict(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    const read = result.document as {
      years: Array<{ weekChanges?: Array<{ label?: string }> }>;
    };
    const clearedThere = read.years
      .flatMap((y) => y.weekChanges ?? [])
      .filter((w) => w.label === undefined).length;

    /* ⚠️⚠️ THE ONE THAT MATTERS MOST. An absent label means "this lesson is not
       running here this week, because it moved". If Monospace read it back as
       an empty STRING the cell would stop being cleared and start being a
       lesson called nothing — and the workbook would link it to the template,
       resurrecting on the next recalculation the very lesson somebody moved
       off it. */
    expect(
      clearedThere,
      "a cleared week change (absent label) did not survive Monospace's reader as absent",
    ).toBe(clearedHere);
  });
});
