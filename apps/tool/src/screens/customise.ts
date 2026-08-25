/**
 * ══════════════════════════════════════════════════════════════════════════
 *  CUSTOMISE — the school's own colour, and what it does and does not move
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️⚠️ IT MOVES THE FURNITURE ONLY. The day bands, the header block and the
 * gutter are this colour; the CLASS CHIPS DO NOT MOVE AT ALL, because a class
 * colour is a function of the class code and nothing else — that is the whole
 * promise of "same class, same colour".
 *
 * ⭐ WHICH IS WHY THE DARK TINTS ARE CLAMPED AND THE PRINTED ONES ARE NOT. An
 * accent that lightens the bands walks them INTO the chips sitting on them.
 * The printed tints are unclamped because the admin previews them, at size,
 * with the ink on them — the preview below is that preview. The dark ones
 * carry the whole clamp, because nothing previews those, and `darkFrameFor()`
 * defends three MEASURED contrasts (chip↔bandAlt, band↔bandAlt, gutter↔band)
 * on the measured ratio and never on the accent's own lightness.
 *
 * ⚠️ SO DO NOT ADD A "MAKE IT BRIGHTER" SLIDER HERE. The tightest pair is
 * chip↔bandAlt; a black accent puts band↔bandAlt at 1.034 — two identical day
 * blocks — and the clamp is the only thing standing between a school and that.
 */

import {
  bandForDay,
  gridClassFill,
  gridInkOn,
  gridSurfaces,
  normaliseTimetableAccent,
  resolveTimetableAccent,
  DEFAULT_TIMETABLE_ACCENT,
  GRID_DIM,
  GRID_RULE_ALPHA,
  GRID_SEAM_ALPHA,
  GRID_TYPE,
  TIMETABLE_ACCENT_PRESETS,
} from "../engine";
import { button, card, h, notice } from "../dom";
import { toast } from "../ui";
import { doc, edit, isDark, setTheme, theme } from "../store";

export function customiseScreen(): HTMLElement {
  const d = doc();
  const stored = d.school.accent;
  /* ⚠️ `resolveTimetableAccent` AND NEVER `stored ?? DEFAULT`. A `?? DEFAULT`
     here is a SECOND copy of the default, and the two drift the first time one
     of them is edited. It also turns a hand-edited broken colour into the
     default rather than letting it reach a stylesheet. */
  const accent = resolveTimetableAccent(stored);
  const custom = !TIMETABLE_ACCENT_PRESETS.some((p) => p.value === accent);

  return h(
    "div.stack",
    null,
    card(
      "The school's colour",
      "One colour, stored on the file, painting the day bands and the header block on this screen and in the exported workbook. Absent means Office's accent4 — the purple Cam's own file is a tint of — so a school that never opens this gets exactly the workbook it got before the setting existed.",
      h(
        "div.legend",
        { style: { marginBottom: "16px" } },
        ...TIMETABLE_ACCENT_PRESETS.map((p) =>
          h(
            "button.chip",
            {
              type: "button",
              style: {
                cursor: "pointer",
                borderColor:
                  p.value === accent ? "var(--accent)" : "var(--stroke)",
                boxShadow:
                  p.value === accent ? "0 0 0 2px rgba(var(--accent-rgb),.28)" : undefined,
              },
              onclick: () => setAccent(p.value),
            },
            h("span.sw", { style: { background: p.value } }),
            p.name,
          ),
        ),
      ),
      h(
        "div.row",
        null,
        h("input", {
          type: "color",
          value: accent,
          oninput: (e: Event) => setAccent((e.target as HTMLInputElement).value),
        }),
        h("input", {
          type: "text",
          value: accent,
          spellcheck: "false",
          style: { width: "140px", fontFamily: "var(--font-mono)" },
          onchange: (e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            /* ⭐ ONE VALIDATOR, AND IT IS THE ENGINE'S. `#rrggbb` and nothing
               else: no shorthand (`#abc` doubles ambiguously into an exported
               file), no `rgb()`, no eight-digit alpha — the workbook has no
               alpha channel to put it in. Refusing on a strict pattern rather
               than stripping characters until something parses is what makes
               that guarantee legible. */
            const ok = normaliseTimetableAccent(raw);
            if (!ok) {
              toast(
                `“${raw}” is not a colour this file can store. It has to be six hex digits — #4f6d7a.`,
                "bad",
              );
              return;
            }
            setAccent(ok);
          },
        }),
        custom ? h("span.pill.on", null, "Custom") : null,
        accent !== DEFAULT_TIMETABLE_ACCENT
          ? button("Back to the default", {
              cls: "sm ghost",
              onclick: () =>
                edit((next) => {
                  /* ⭐ REMOVED, NOT SET TO THE DEFAULT. A file that stores the
                     default freezes today's default onto itself and survives a
                     change of it — the same rule `normaliseExportOptions`
                     follows for the four switches. */
                  next.school.accent = undefined;
                }),
            })
          : null,
      ),
    ),
    preview(accent),
    notice(
      "warn",
      h("b", null, "The class colours do not move with it."),
      " A class colour is a function of the class code and nothing else, so the same class is the same colour in every school, in every theme and in every year. What this changes is the furniture the classes sit on.",
    ),
    themeCard(),
  );

  function setAccent(value: string) {
    const ok = normaliseTimetableAccent(value);
    if (!ok) return;
    edit((next) => {
      next.school.accent = ok;
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW — the printed tints, at size, with the ink on them
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ THIS IS WHY THE PRINTED TINTS ARE UNCLAMPED. The admin sees them here, at
 * the size they print, with a class chip sitting on them and a break bar drawn
 * across — so an accent that produces a bad sheet is visibly a bad sheet before
 * anybody downloads one. The dark tints get no such preview, which is exactly
 * why they carry the clamp.
 */
function preview(accent: string): HTMLElement {
  const dark = isDark();
  const paper = getComputedStyle(document.documentElement)
    .getPropertyValue("--paper")
    .trim();
  const ink = getComputedStyle(document.documentElement)
    .getPropertyValue("--text")
    .trim();
  const s = gridSurfaces(paper || "#ffffff", dark, accent);

  /* Three real class codes, and one from each end of the year ladder, so the
     preview covers the range `gridInkOn` has to answer for: `CLASS_YEAR_LUMINANCE`
     runs 0.655 down to 0.220, and a sixth form sees the dark end on every
     lesson. A preview of three year-7 pastels would say nothing about it. */
  const codes = ["7A/Ma1", "10D/Bs", "13A/Ch1"];

  const rule = (fill: string | null, alpha: string) =>
    `1px solid color-mix(in srgb, ${gridInkOn(fill, ink)} ${alpha}, transparent)`;

  const bandRow = (label: string, fill: string, code: string | null) =>
    h(
      "tr",
      null,
      h(
        "th",
        {
          style: {
            backgroundColor: fill,
            color: gridInkOn(fill, ink),
            fontSize: `${GRID_TYPE.period.fontSize}px`,
            fontWeight: String(GRID_TYPE.period.taught),
            padding: "0 8px",
            height: "32px",
            textAlign: "center",
            borderRight: rule(fill, GRID_SEAM_ALPHA),
            width: "120px",
          },
        },
        label,
      ),
      ...(code === null
        ? [
            h(
              "td",
              {
                colspan: "3",
                style: {
                  backgroundColor: fill,
                  color: gridInkOn(fill, ink),
                  fontSize: `${GRID_TYPE.meta.fontSize}px`,
                  textAlign: "center",
                  height: "32px",
                  opacity: String(GRID_DIM.label),
                },
              },
              "Break — painted straight across, no verticals",
            ),
          ]
        : codes.map((c, i) => {
            const chip = gridClassFill(c, dark);
            return h(
              "td",
              {
                style: {
                  backgroundColor: chip ?? paper,
                  color: gridInkOn(chip, ink),
                  fontSize: `${GRID_TYPE.cell.fontSize}px`,
                  fontWeight: String(GRID_TYPE.cell.fontWeight),
                  textAlign: "center",
                  height: "32px",
                  width: "104px",
                  borderRight: i === codes.length - 1 ? undefined : rule(chip, GRID_RULE_ALPHA),
                },
              },
              c,
            );
          })),
    );

  return card(
    "How it prints",
    "The two day tints, the gutter between them and a break bar — at the size they print, with real class chips on them. Excel gets these exact bytes.",
    h(
      "div.gridframe",
      { style: { padding: "0 16px" } },
      h(
        "table",
        {
          style: {
            borderCollapse: "separate",
            borderSpacing: "0",
            tableLayout: "fixed",
            margin: "0 auto",
          },
        },
        h(
          "tbody",
          null,
          bandRow("MONDAY", bandForDay(s, 0), "x"),
          bandRow("Break", bandForDay(s, 0), null),
          bandRow("Period 2", bandForDay(s, 0), "x"),
          h(
            "tr",
            { "aria-hidden": "true" },
            h("td", {
              colspan: "4",
              style: { height: "32px", backgroundColor: s.gutter, padding: "0" },
            }),
          ),
          bandRow("TUESDAY", bandForDay(s, 1), "x"),
          bandRow("Period 2", bandForDay(s, 1), "x"),
        ),
      ),
    ),
    h(
      "p.hint",
      { style: { marginTop: "12px", marginBottom: "0" } },
      `Bands ${s.band} and ${s.bandAlt}, gutter ${s.gutter}. ${
        dark
          ? "These are the CLAMPED dark tints — the printed ones are the light theme's. Switch the theme below to see what Excel gets."
          : "These are the bytes the workbook writes."
      }`,
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S OWN THEME
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ THIS IS NOT IN THE FILE, AND THAT IS THE POINT. Which theme somebody
 * looks at the app in is a fact about their eyes and their machine, not about
 * the school's timetable — putting it in the document would dirty the file for
 * the act of looking at it, and let two colleagues fight over the value.
 */
function themeCard(): HTMLElement {
  const t = theme();
  return card(
    "This app",
    "Kept on this machine, never in the file. The workbook is the light theme's colours in every case — that is the printed document.",
    h(
      "div.seg",
      null,
      ...(["dark", "light"] as const).map((v) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": String(t === v),
            onclick: () => setTheme(v),
          },
          v === "dark" ? "Dark" : "Light",
        ),
      ),
    ),
  );
}
