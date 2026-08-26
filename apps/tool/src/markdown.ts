/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ A SMALL MARKDOWN RENDERER — for the release notes, and nothing else
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The update dialog showed GitHub's release body as a PLAIN TEXT NODE, so a
 * release note written in markdown printed its own syntax: `## What changed`
 * and `- **Fixed** the thing` arrived on screen exactly like that. This turns
 * it into DOM.
 *
 * ── ⚠️ WHY NOT A LIBRARY ────────────────────────────────────────────────
 * The deliverable is ONE `.html` file that a school double-clicks from a USB
 * stick with the network unplugged. Everything is inlined, so every dependency
 * is bytes in that file for ever — and `marked` plus a sanitiser is ~50 KB to
 * render six kinds of line. This is the six kinds of line.
 *
 * ── ⚠️⚠️ AND WHY THERE IS NO `innerHTML` IN THIS FILE ────────────────────
 * The text comes off the network, out of a GitHub release body. Building DOM
 * nodes means there is no path from that text to executed script AT ALL —
 * not one that a sanitiser has to be correct about, and not one that a later
 * "just render the raw HTML for tables" would quietly reopen. `<script>` in a
 * release note lands on screen as the characters `<script>`.
 *
 * ⚠️ LINKS GO THROUGH `host.openExternal`, NEVER `<a href>`. In the shell the
 * page IS the app: a real link navigates the webview to GitHub and the school's
 * unsaved timetable is gone, with no back button because the window has no
 * furniture. And only `http(s):` is followed — `javascript:` in a release note
 * is exactly the kind of thing that should die here rather than at the shell.
 *
 * It handles what a release note contains: headings, bold, italic, inline code,
 * links, bullet and numbered lists, rules, tables and paragraphs. Anything else
 * lands as its own text, which is the right failure: a school reads a slightly
 * plain sentence rather than nothing.
 */

import { h } from "./dom";
import { host } from "./host";

/* ⭐ THE MARKER RULE LIVES IN `releaseNotes.ts` — pure string work with no
   imports, so it runs under `npm test` with no DOM. Re-exported here because
   this is where it belongs by subject and where a call site looks for it. */
export { APP_NOTES_END, appReleaseNotes } from "./releaseNotes";

/* ══════════════════════════════════════════════════════════════════════════
   BLOCKS
   ══════════════════════════════════════════════════════════════════════════ */

const isRule = (line: string) => /^\s*([-*_])\s*(\1\s*){2,}$/.test(line);
const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isDivider = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function markdown(source: string): HTMLElement {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: HTMLElement[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length === 0) return;
    out.push(h("p", null, ...inline(para.join(" "))));
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      flush();
      continue;
    }

    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) {
      flush();
      /* ⚠️ CLAMPED TO h3–h4. The dialog's own title is the `h2`, and a release
         note that opens with `# 0.6.0` would otherwise print a heading larger
         than the sentence naming the version it belongs to. */
      const tag = head[1].length <= 2 ? "h3" : "h4";
      out.push(h(tag as "h3", null, ...inline(head[2])));
      continue;
    }

    if (isRule(line)) {
      flush();
      out.push(h("hr"));
      continue;
    }

    /* ── Tables ──
       ⚠️ A HEADER AND A DIVIDER, OR IT IS NOT A TABLE. GFM requires the
       dashes row, and treating any pipe line as a table turns a sentence about
       `a | b` into a one-cell grid. */
    if (isTableRow(line) && isTableRow(lines[i + 1] ?? "") && isDivider(lines[i + 1])) {
      flush();
      const head2 = cells(line);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) body.push(cells(lines[i++]));
      i--;
      out.push(
        h(
          "div.tablewrap",
          null,
          h(
            "table.list",
            null,
            h("thead", null, h("tr", null, ...head2.map((c) => h("th", null, ...inline(c))))),
            h("tbody", null, ...body.map((r) => h("tr", null, ...r.map((c) => h("td", null, ...inline(c)))))),
          ),
        ),
      );
      continue;
    }

    /* ── Lists ──
       One pass swallows the whole run, so `<li>`s are never orphaned into
       separate one-item lists — which is what a per-line branch produces and
       what the extra vertical gap between every bullet looks like. */
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const items: string[] = [];
      while (i < lines.length) {
        const m = ordered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i])
          : /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        if (m) {
          items.push(m[1]);
          i++;
          continue;
        }
        /* A wrapped continuation line belongs to the bullet above it. */
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
          continue;
        }
        break;
      }
      i--;
      out.push(
        h(
          ordered ? "ol" : "ul",
          null,
          ...items.map((t) => h("li", null, ...inline(t))),
        ),
      );
      continue;
    }

    para.push(line.trim());
  }
  flush();

  return h("div.md", null, ...out);
}

/* ══════════════════════════════════════════════════════════════════════════
   INLINE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ ONE PASS, LEFT TO RIGHT, AND CODE SPANS WIN. A regex-replace chain over a
 * string would let `**` inside a code span become bold — so the note explaining
 * that a literal `**bold**` prints its asterisks would print it in bold. The
 * single alternation is what makes "first match wins" mean "code first".
 */
const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)\s]+\))/;

function inline(text: string): Node[] {
  const out: Node[] = [];
  let rest = text;

  for (;;) {
    const m = INLINE.exec(rest);
    if (!m || m.index === undefined) break;
    if (m.index > 0) out.push(document.createTextNode(rest.slice(0, m.index)));
    const tok = m[0];

    if (tok.startsWith("`")) {
      out.push(h("code", null, tok.slice(1, -1)));
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(h("strong", null, ...inline(tok.slice(2, -2))));
    } else if (tok.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      out.push(link ? anchor(link[1], link[2]) : document.createTextNode(tok));
    } else {
      out.push(h("em", null, ...inline(tok.slice(1, -1))));
    }

    rest = rest.slice(m.index + tok.length);
  }

  if (rest) out.push(document.createTextNode(rest));
  return out;
}

/**
 * ⚠️ A BUTTON, NOT AN `<a href>` — see the banner. In the shell the page is the
 * app, so a real link navigates the window to GitHub and takes an unsaved
 * timetable with it.
 *
 * ⚠️ AND THE SCHEME IS CHECKED HERE. `javascript:` and `data:` in a release
 * body are not going to be handed to `openExternal` on the strength of the
 * shell being careful; anything that is not plain http(s) prints as its own
 * text, so a reader can see what it said.
 */
function anchor(label: string, url: string): Node {
  if (!/^https?:\/\//i.test(url)) return document.createTextNode(`${label} (${url})`);
  return h(
    "button.mdlink",
    { type: "button", title: url, onclick: () => host.openExternal(url) },
    ...inline(label),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐ "THERE IS MORE BELOW"
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fade the bottom edge of a rendered note while there is more of it to read.
 *
 * ⚠️ THE SCROLLBAR IS NOT ENOUGH AND THE REASON IS THE PLATFORM. On Windows —
 * where the `.exe` runs, in WebView2 — a scrollbar takes real width and is
 * visibly there. On macOS it is an OVERLAY that appears only DURING a scroll:
 * measured here at `offsetWidth - clientWidth === 0`. So a school opening the
 * `.html` on a Mac sees a paragraph clipped in the middle of a sentence with
 * nothing on screen saying why, above two buttons that look like the end of
 * the dialog.
 *
 * ⚠️ AND IT MUST COME OFF AT THE BOTTOM. A permanent mask would fade the last
 * line of the notes for ever — telling somebody who HAS read to the end that
 * they have not.
 *
 * ⚠️ CALLED AFTER THE NODE IS IN THE DOCUMENT, never from `markdown()`, which
 * returns a node with no layout: `scrollHeight` and `clientHeight` are both 0
 * until it is inserted, so the check would always say "it fits".
 */
export function markNoteOverflow(el: HTMLElement) {
  const update = () => {
    const more = el.scrollHeight - el.clientHeight - el.scrollTop > 2;
    el.classList.toggle("more", more);
  };
  el.addEventListener("scroll", update, { passive: true });
  update();
}
