/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ WHERE A RELEASE NOTE STOPS AND THE DOWNLOAD ADVICE STARTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every release body is two documents glued together:
 *
 *   1. What changed in this version — which is what the update dialog is for.
 *   2. The standing "which file do I want / Windows will warn you about the
 *      .exe" guidance, which the release PAGE needs on every single release
 *      because the person reading it is meeting an unsigned binary for the
 *      first time.
 *
 * Somebody reading the update dialog has already got the app, so (2) is three
 * screens of advice they cannot act on, in front of the two sentences they can.
 *
 * ── ⚠️ ITS OWN FILE, AND THE REASON IS THAT IT CAN BE TESTED ─────────────
 * This is pure string work with NO imports, so it runs under `node` with no
 * DOM. `markdown.ts` — which it belongs with by subject — imports `dom.ts` and
 * `host.ts`, and `host.ts` touches `window` at module scope, so importing it
 * outside a browser throws. Splitting the pure half out is what puts the rule
 * below under `npm test` instead of under "somebody checked once".
 *
 * `markdown.ts` re-exports both names, so nothing else has to know.
 */

/**
 * ⭐ AN HTML COMMENT, so GitHub renders exactly nothing where it sits.
 *
 * ⚠️ A BARE `---` WAS THE OBVIOUS MARKER AND IS WRONG. A release note is
 * allowed as many horizontal rules as it likes, and the first day one used one,
 * the dialog would silently start truncating what changed — with no error
 * anywhere and nobody to notice, because the person who would notice is the
 * one who wrote the note and already knows what it said.
 */
export const APP_NOTES_END = "<!-- app:end -->";

/**
 * ⚠️ THE FALLBACK IS FOR RELEASES ALREADY PUBLISHED. v0.1.0 through v0.5.0 have
 * bodies with no marker in them — an auto-generated commit list with the
 * guidance appended — and they are on GitHub for ever. This heading is a
 * literal in that appended block, so cutting at it gets the old releases right
 * too, and a note that never mentions it is simply shown whole.
 *
 * ⚠️ IT MUST STAY IN STEP WITH `.github/workflows/release.yml`. If that heading
 * is ever reworded, this string does not follow it — it is a fossil of what the
 * appended block said when those releases were cut, and rewording it would
 * break the old releases to tidy the new ones. Add to the workflow's `body`,
 * never rename its headings.
 */
const LEGACY_TAIL = "### Which file do I want?";

/** The part of a GitHub release body the app should show. */
export function appReleaseNotes(body: string): string {
  const marked = body.indexOf(APP_NOTES_END);
  let text = marked >= 0 ? body.slice(0, marked) : body;
  if (marked < 0) {
    const legacy = text.indexOf(LEGACY_TAIL);
    if (legacy >= 0) text = text.slice(0, legacy);
  }
  /* A trailing rule is the seam between the two documents, not content. */
  return text.replace(/\n[-*_]{3,}[ \t]*\n*\s*$/, "").trim();
}
