/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE RENDERER MAY NOT BUILD HTML FROM A STRING. EVER.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `markdown.ts` renders text that arrives OVER THE NETWORK — a GitHub release
 * body — into an app that holds a school's unsaved timetable, in a shell where
 * the page IS the window. It builds DOM nodes, so there is no path from that
 * text to executed script at all: `<script>` in a release note lands on screen
 * as the characters `<script>`.
 *
 * ⚠️ THIS IS A SOURCE-HYGIENE TEST AND NOT A BEHAVIOUR TEST, ON PURPOSE.
 * Behaviour tests of an escaper prove that the inputs somebody thought of are
 * handled. This proves the SINK does not exist — which is the property that
 * actually holds, and it survives somebody adding a feature the behaviour
 * tests were never written for. The obvious future one is "render the raw HTML
 * for tables", which would look like a small improvement and reopen the whole
 * thing.
 *
 * Verified in a real browser against the real bundle at the time it was
 * written: `<script>`, `<img onerror>`, a `javascript:` link and a
 * `data:text/html` link all landed as text, zero elements were created, and
 * nothing executed. This test is what stops that quietly ceasing to be true.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const SOURCE = readFileSync(
  fileURLToPath(new URL("../src/markdown.ts", import.meta.url)),
  "utf8",
);

/* Every way a string becomes markup. `html:` is `dom.ts`'s own escape hatch —
   a real one, used elsewhere for inlined icon paths, and exactly as dangerous
   here as `innerHTML` is. */
const SINKS = [
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "document.write",
  "createContextualFragment",
  "DOMParser",
  "html:",
];

describe("no path from a release body to markup", () => {
  for (const sink of SINKS) {
    test(`\`${sink}\` appears nowhere in markdown.ts`, () => {
      /* ⚠️ THE COMMENTS ARE STRIPPED FIRST. The banner in that file NAMES these
         sinks to explain why they are absent, and a test that matched raw text
         would fail on the explanation for its own rule — and then be "fixed"
         by deleting the explanation. */
      const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toContain(sink);
    });
  }

  test("and no `eval` or `Function` constructor either", () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\beval\s*\(/);
    expect(code).not.toMatch(/new\s+Function\s*\(/);
  });

  test("a link is only followed when it is plainly http(s)", () => {
    /* The one place a release body reaches an API that leaves the page.
       ⚠️ `^https?:\/\//i` AND NOT `includes("http")` — `javascript:alert(1)//http`
       passes the second. */
    expect(SOURCE).toContain("/^https?:\\/\\//i.test(url)");
  });

  test("links are buttons, because in the shell the page is the app", () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("button.mdlink");
    /* An `<a href>` would navigate the app's own window to GitHub and take an
       unsaved timetable with it, on a frameless window with no back button. */
    expect(code).not.toMatch(/h\(\s*["']a["']/);
    expect(code).not.toContain("href");
  });
});
