# `@monospace-timetable/tool`

**One self-contained HTML document.** It is the `timetable.html` a school
downloads *and* the page the Rust shell embeds — there is exactly one of them,
and `src/host.ts` is the whole of the difference.

```bash
npm install
npm run build        # → dist/timetable.html
npm run build:dev    # the same, unminified, for reading
npm run typecheck
npm run serve        # a dev origin on :4173. NOT how it ships.
```

Licensed **AGPL-3.0-only**. Cam Wooloo owns the copyright.

---

## Measured

| | raw | gzipped (-9) | brotli |
|---|---|---|---|
| `dist/timetable.html` | **630.6 KB** — 645,710 B | **189.1 KB** — 193,662 B | 160.5 KB — 164,327 B |
| — of which CSS | 16.3 KB | | |
| — of which JS | 613.1 KB | | |
| unminified (`build:dev`) | 1,479.3 KB | 272.1 KB | |

The engine and its zip stack are ~545 KB of that. **The app is ~68 KB**, which
is the entire justification for `src/dom.ts` being the view layer instead of a
framework: a runtime would be a fifth of everything left.

---

## ⭐ The screen IS the export — measured, not asserted

Every colour and every geometry constant comes through `src/engine.ts` from the
engine, which is the same source the `.xlsx` writer reads. Checked in a real
browser against the engine's own pinned values:

| on screen | `fixtures/palette.txt` / `sheetFills("#4f6d7a")` |
|---|---|
| `7A/Cs` → `rgb(158,227,184)` | `FF9EE3B8` |
| `9F/It` → `rgb(227,177,164)` | `FFE3B1A4` |
| `10E/Cs` → `rgb(134,188,152)` | `FF86BC98` |
| `11B/It` → `rgb(218,143,123)` | `FFDA8F7B` |
| band → `rgb(185,197,202)` | `structure` `#b9c5ca` |
| bandAlt → `rgb(149,167,175)` | `structureAlt` `#95a7af` |
| gutter → `rgb(217,217,217)` | `gutter` `#d9d9d9` |

And the export itself, run in the browser from this document, on the reference
school's 2026/27 year:

| | bytes | zip members | worksheet parts |
|---|---|---|---|
| all four options on, password `staffroom` | 256,074 | 50 local / 50 central | 42 |
| all four options on, no password | 248,834 | 50 / 50 | 42 |

Fifty is the same member count the engine's fixture gate compares, and the EOCD
record is present and consistent in both.

---

## The grid

`src/grid.ts` is one table doing both of Monospace's jobs — `TemplateGrid` (the
standing week, typed into) and `PublishedTimetable` (one real week, resolved) —
because they differ in exactly two things: what a cell is resolved **from**, and
what typing in one **writes**. Everything else is shared, which is what stops the
two drifting the way Monospace records them drifting.

**The line-work policy** is the engine's and is reproduced in the file's banner:
one axis of rules, and it is the columns. Read `GRID_RULE_ALPHA`'s banner in
`timetableSheet.ts` before changing any of it — over Cam's own 59 fills, 52% of
adjacent-chip pairs measure under 1.24 : 1, so "the fills separate themselves" is
false about half the time.

**Cells resolve through `resolvePublishedRoom` and lock through `cellRights`.**
Not a local rule: a retired room's whole column is locked, free periods included,
which is exactly what `lockPrefilled` writes into the workbook. Verified against
the fixture — the cancelled booking does not appear, the booking with no purpose
prints "Booked", and the cleared override draws empty and blue.

---

## Things that bit, and are now written down where they bit

| | |
|---|---|
| `display: flex` on a `<th>` | takes the cell out of the table formatting context — the whole grid collapsed into one stacked column. |
| `min-height: auto` | a grid/flex item is as tall as its content by default, so `.page` grew to 1,354px inside a 720px track and the **window** scrolled instead of the content. `body { overflow: hidden }` hides the symptom, which is what made it hard to see. |
| `scroll-behavior: smooth` | every write redraws the page and restores `scrollTop` onto a fresh element — under smooth behaviour that *animates from 0* after every keystroke. |
| `requestAnimationFrame` | never fires in a hidden tab. The repaint falls back to a timeout; the export's pre-flight yield is a timeout outright, or backgrounding a slow export hangs it for ever with the button stuck on "Building…". |
| two row heights | `height` on a table cell is a MINIMUM, so a school that times some periods and labels others got 35px and 32px rows in the same day. One `rowH` for the grid, derived from `GRID_TYPE`. |
| `</script` in a string | ends the tag wherever it appears, comments included — and the engine's source is full of prose. Escaped at build time. |

---

## The shell

`src/host.ts` carries the IPC contract in full. In short: Rust injects
`window.__TIMETABLE_HOST__ = { kind: "shell", version }` and answers
`window.ipc.postMessage` requests by calling `window.__timetableReply(id, …)`
exactly once each. **Four** operations — `openDoc`, `saveDoc`, `saveWorkbook`,
`openUrl` — and no more, because a protocol two programs share has to be
implemented twice and can go out of step. The workbook crosses as **base64**,
because wry's IPC is a string channel and a 250 KB `Uint8Array` as a JSON array
of integers is ~1.2 MB of text.

⚠️ **`cancelled` is not an error.** A school pressing Escape on a save dialog has
not hit a fault, and a red toast saying so teaches them the app is broken.

---

## What the build refuses to ship

`scripts/build.ts` fails rather than producing a file that would work on the
reviewer's machine and not on a school's:

1. **any external `src` / `href`** — this has to run from `file://` with the
   network unplugged;
2. **`fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`** — the tool does no
   network I/O at all;
3. **a missing source-code URL** — AGPL §13 makes that offer non-optional the
   moment the page is served rather than downloaded;
4. **more than one output chunk** — a dynamic `import()` is not a self-contained
   file.

The browser shim list is **read from the engine**, never restated here:
`browserBuildOptions()` comes out of the engine's own build script, which builds
itself from `BROWSER_SHIMS`. A shim added to one target and not the other is a
runtime failure on the target that forgot.
