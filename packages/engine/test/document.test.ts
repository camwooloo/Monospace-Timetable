/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FILE FORMAT — WHAT IT ACCEPTS, WHAT IT REFUSES, AND WHY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `SchoolDocument` is what a school saves, so it is a format and not an
 * internal type. These tests pin the compatibility rules, because those are
 * the ones that are cheap to hold now and impossible to add later.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  SCHOOL_DOCUMENT_VERSION,
  emptySchoolDocument,
  readSchoolDocument,
} from "../src/model/document";
import { buildTimetableModel } from "../src/model/buildModel";
import { FIXTURE_NOW, makeFixtureDocument } from "./fixtures/schoolDocument";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("reading a school document", () => {
  test("accepts one this build wrote", () => {
    const result = readSchoolDocument(makeFixtureDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.formatVersion).toBe(SCHOOL_DOCUMENT_VERSION);
    expect(result.unknownKeys).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  /**
   * ⚠️⚠️ THE RULE THAT MATTERS MOST, AND THE ONE IT IS MOST TEMPTING TO SOFTEN.
   *
   * A file from a newer build is REFUSED, not best-efforted. Reading what we
   * understand and dropping the rest produces a workbook that looks complete
   * and is wrong — the same failure the writer's info sheet exists to prevent,
   * arriving one layer earlier with nothing to print the warning on. A school
   * that cannot open a file updates the app; a school handed a quietly
   * incomplete timetable teaches from it.
   */
  test("refuses a file from a newer version, naming both numbers", () => {
    const future = {
      ...makeFixtureDocument(),
      formatVersion: SCHOOL_DOCUMENT_VERSION + 1,
    };
    const result = readSchoolDocument(future);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("from-the-future");
    expect(result.issue.message).toContain(String(SCHOOL_DOCUMENT_VERSION + 1));
    expect(result.issue.message).toContain(String(SCHOOL_DOCUMENT_VERSION));
  });

  test("refuses a file with no version at all", () => {
    const { formatVersion: _drop, ...rest } = makeFixtureDocument();
    const result = readSchoolDocument(rest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("bad-version");
  });

  test("refuses something that is not a document", () => {
    for (const junk of [null, 42, "hello", [], undefined]) {
      const result = readSchoolDocument(junk);
      expect(result.ok, `readSchoolDocument(${JSON.stringify(junk)})`).toBe(false);
      if (!result.ok) expect(result.issue.code).toBe("not-an-object");
    }
  });

  /**
   * ⭐ UNKNOWN KEYS ARE REPORTED, NOT DROPPED SILENTLY. Rule 1 should make this
   * unreachable — but a hand-edited file is a thing schools do, and the point
   * of a text format is that they can.
   */
  test("reports keys it does not understand instead of losing them quietly", () => {
    const result = readSchoolDocument({
      ...makeFixtureDocument(),
      somethingNewer: { a: 1 },
      andAnother: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unknownKeys.sort()).toEqual(["andAnother", "somethingNewer"]);
  });

  test("refuses a file with no academic year and one with no rooms", () => {
    const noYears = readSchoolDocument({ ...makeFixtureDocument(), years: [] });
    expect(noYears.ok).toBe(false);
    if (!noYears.ok) expect(noYears.issue.code).toBe("no-years");

    const noRooms = readSchoolDocument({
      ...makeFixtureDocument(),
      roomSheets: [],
    });
    expect(noRooms.ok).toBe(false);
    if (!noRooms.ok) expect(noRooms.issue.code).toBe("bad-room-sheet");
  });

  /**
   * ⭐ VALIDATION IS OF SHAPE, NOT SANITY. A year whose anchor is not a Monday
   * opens fine and the engine says so downstream, where there is a workbook to
   * print the complaint on. ⚠️ REFUSING TO OPEN A FILE FOR A FIXABLE DATA
   * PROBLEM STRANDS THE ONLY COPY OF IT.
   */
  test("opens a file whose data is wrong rather than stranding it", () => {
    const doc = makeFixtureDocument();
    doc.years[1].anchorMonday = "2026-09-03"; // a Thursday
    const result = readSchoolDocument(doc);
    expect(result.ok).toBe(true);
  });

  test("a new document is empty rather than seeded with somebody else's Tuesday", () => {
    const doc = emptySchoolDocument("Ashgrove High School");
    expect(doc.formatVersion).toBe(SCHOOL_DOCUMENT_VERSION);
    expect(doc.years).toEqual([]);
    expect(doc.roomSheets[0].rooms).toEqual([]);
    /* ⚠️ AND IT IS NOT EXPORTABLE YET, deliberately: the refusal names what is
       missing so the app can walk the school through it. */
    const built = buildTimetableModel({ document: doc, now: FIXTURE_NOW });
    expect(built.ok).toBe(false);
  });
});

describe("the committed example file", () => {
  /**
   * ⭐ `fixtures/school.fixture.json` is the format's worked example, and it is
   * checked by being USED rather than by being described — it is the exact
   * input the reference workbooks were generated from.
   */
  test("fixtures/school.fixture.json reads, and is the fixture the gate uses", () => {
    const onDisk = JSON.parse(
      readFileSync(resolve(ROOT, "fixtures/school.fixture.json"), "utf8"),
    );
    const result = readSchoolDocument(onDisk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unknownKeys).toEqual([]);
    /* Byte-for-byte the same document the in-code fixture builds, so the
       committed example cannot drift away from what the gate exercises. */
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(makeFixtureDocument())));
  });
});
