/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THE UPDATE DIALOG SHOWS OF A RELEASE BODY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Two things can go wrong here and both are silent: showing the three screens
 * of download advice that the release PAGE needs and the dialog does not, or
 * truncating a release note at its own first horizontal rule.
 */

import { describe, expect, test } from "vitest";

import { APP_NOTES_END, appReleaseNotes } from "../src/releaseNotes";

const GUIDANCE = [
  "",
  "---",
  "",
  "### Which file do I want?",
  "",
  "| | |",
  "|---|---|",
  "| **`timetable.html`** | Needs **nothing**. |",
  "",
  "### ⚠️ Windows will warn you about the `.exe`",
  "",
  'You will see **"Windows protected your PC"**.',
].join("\n");

describe("the marker", () => {
  test("everything below it is cut", () => {
    const body = `## What changed\n\n- Rota, a second tab.\n\n${APP_NOTES_END}${GUIDANCE}`;
    const out = appReleaseNotes(body);
    expect(out).toBe("## What changed\n\n- Rota, a second tab.");
    expect(out).not.toContain("Which file");
    expect(out).not.toContain("Windows protected");
  });

  test("a note may contain as many rules as it likes", () => {
    /* ⚠️ THE WHOLE REASON THE MARKER IS AN HTML COMMENT AND NOT A BARE `---`.
       Cut on the first rule and this note loses two thirds of itself, with no
       error and nobody positioned to notice. */
    const body = `One\n\n---\n\nTwo\n\n---\n\nThree\n\n${APP_NOTES_END}${GUIDANCE}`;
    expect(appReleaseNotes(body)).toBe("One\n\n---\n\nTwo\n\n---\n\nThree");
  });

  test("the seam's own trailing rule is not content", () => {
    const body = `Fixed the thing.\n\n---\n${APP_NOTES_END}${GUIDANCE}`;
    expect(appReleaseNotes(body)).toBe("Fixed the thing.");
  });
});

describe("releases published before the marker existed", () => {
  /* ⚠️ v0.1.0 → v0.5.0 ARE ON GITHUB FOR EVER and none of them carries the
     marker. Somebody on v0.3.0 who updates today reads one of these. */
  const legacy = [
    "## What's Changed",
    "* fix(shell): the window is draggable by @camwooloo in #12",
    "",
    "**Full Changelog**: https://github.com/camwooloo/Monospace-Timetable/compare/v0.4.0...v0.5.0",
    GUIDANCE,
  ].join("\n");

  test("the appended guidance is still cut, by its heading", () => {
    const out = appReleaseNotes(legacy);
    expect(out).toContain("What's Changed");
    expect(out).toContain("Full Changelog");
    expect(out).not.toContain("Which file");
    expect(out).not.toContain("Windows protected");
  });

  test("and the rule above that heading goes with it", () => {
    expect(appReleaseNotes(legacy).endsWith("v0.4.0...v0.5.0")).toBe(true);
  });
});

describe("bodies that are not two documents", () => {
  test("a note with no marker and no guidance is shown whole", () => {
    const body = "## 0.6.0\n\nJust the one thing.\n\n- Fixed it.";
    expect(appReleaseNotes(body)).toBe(body);
  });

  test("an empty body is empty, so the dialog can fall back to its own sentence", () => {
    expect(appReleaseNotes("")).toBe("");
    expect(appReleaseNotes("\n\n \t\n")).toBe("");
  });

  test("a body that is nothing but the marker and the guidance is empty", () => {
    expect(appReleaseNotes(`${APP_NOTES_END}${GUIDANCE}`)).toBe("");
  });
});
