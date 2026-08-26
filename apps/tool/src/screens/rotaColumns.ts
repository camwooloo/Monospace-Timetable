/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE COLUMNS — what somebody fills in when they do the check
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ THIS IS THE WHOLE "DIFFERENT LAYOUTS" FEATURE. A fire door check and an IT
 * room check are the same program: a list, a turn order and a set of boxes.
 * The only thing that differs is which boxes, so a preset is a COLUMN SET and
 * there is no layout engine anywhere in either program.
 *
 * ⚠️ `kind` IS NOT DECORATION. It decides what the workbook writes into the
 * cell — a `number` lands as a number and sorts and sums; a `date` gets the
 * date format the rest of the file uses; a `temperature` gets its own width and
 * its degree sign. Matching on the HEADING instead ("does it say Temp?") is the
 * version of this that works until somebody types "Temp °C" and then silently
 * writes text into a column of numbers.
 *
 * ⚠️ APPLYING A PRESET REPLACES THE COLUMNS AND NOTHING ELSE ABOUT THE ROTA —
 * not the list, not the dates, not anything recorded. It also does NOT keep the
 * rota tied to that preset: `preset` is a label. A live link would mean editing
 * one heading either silently failing or silently promoting the rota to
 * "custom", and every school that changed one word would be left guessing which
 * of the two had happened.
 */

import {
  ROTA_PRESETS,
  presetColumns,
  rotaPreset,
  type RotaColumn,
  type RotaColumnKind,
  type SchoolRota,
} from "../engine";
import { button, card, field, h, notice, select } from "../dom";
import { confirmDialog, toast } from "../ui";
import { editRota, newId, rotaNow, setScreen } from "../store";

const KINDS: Array<{ value: RotaColumnKind; label: string; note: string }> = [
  { value: "tick", label: "Tick / Y-N", note: "A narrow box. Ticked, or Y/N written in." },
  { value: "text", label: "Text", note: "Anything. The widest kind." },
  { value: "number", label: "Number", note: "Lands in the cell as a number, so it sorts and sums." },
  { value: "date", label: "Date", note: "Formatted like every other date in the file." },
  { value: "temperature", label: "Temperature", note: "A number with its degree sign." },
  { value: "person", label: "Person", note: "Initials or a name. Sized for initials." },
];

const MAX_COLUMNS = 14;

export function rotaColumnsScreen(): HTMLElement {
  const rota = rotaNow();
  if (!rota)
    return h(
      "div.stack",
      null,
      card(
        "No rota yet",
        null,
        h(
          "div.empty",
          null,
          h("p", null, "Create one on the List screen and its columns appear here."),
          button("Go to the list", { icon: "label", cls: "primary", onclick: () => setScreen("rota-list") }),
        ),
      ),
    );

  return h("div.stack.wide", null, columns(rota), presets(rota));
}

/* ══════════════════════════════════════════════════════════════════════════
   THE EDITOR
   ══════════════════════════════════════════════════════════════════════════ */

function columns(rota: SchoolRota): HTMLElement {
  const move = (i: number, by: number) =>
    editRota((r) => {
      const j = i + by;
      if (j < 0 || j >= r.columns.length) return;
      const [c] = r.columns.splice(i, 1);
      r.columns.splice(j, 0, c);
    });

  const patch = (id: string, fn: (c: RotaColumn) => void) =>
    editRota((r) => {
      const c = r.columns.find((x) => x.id === id);
      if (c) fn(c);
    });

  return card(
    "Columns",
    "Left to right, exactly as they print. Everything to the right of the week is blank on the sheet for somebody to fill in.",
    rota.columns.length === 0
      ? h(
          "div.empty",
          null,
          h("p", null, "No columns. The rota would print the turn order and nowhere to record anything."),
        )
      : h(
          "div.tablewrap",
          null,
          h(
            "table.list",
            null,
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, "Heading"),
                h("th", null, "Kind"),
                h("th", null, "Width"),
                h("th.act", null, ""),
              ),
            ),
            h(
              "tbody",
              null,
              ...rota.columns.map((col, i) =>
                h(
                  "tr",
                  null,
                  h(
                    "td",
                    null,
                    h("input.cell.wide", {
                type: "text",
                      value: col.label,
                      placeholder: "Cleaned (Y/N)",
                      onchange: (e: Event) =>
                        patch(col.id, (c) => void (c.label = (e.target as HTMLInputElement).value)),
                    }),
                  ),
                  h(
                    "td",
                    null,
                    h(
                      "select.cell",
                      {
                        onchange: (e: Event) =>
                          patch(
                            col.id,
                            (c) => void (c.kind = (e.target as HTMLSelectElement).value as RotaColumnKind),
                          ),
                      },
                      ...KINDS.map((k) =>
                        h("option", { value: k.value, selected: k.value === col.kind }, k.label),
                      ),
                    ),
                  ),
                  h(
                    "td",
                    null,
                    h("input.cell.narrow", {
                      type: "number",
                      min: "4",
                      max: "60",
                      value: col.width ? String(col.width) : "",
                      placeholder: "auto",
                      title: "Characters wide on the sheet. Leave it empty and the kind decides.",
                      onchange: (e: Event) => {
                        const raw = (e.target as HTMLInputElement).value.trim();
                        const n = raw ? Math.max(4, Math.min(60, Math.round(Number(raw)))) : 0;
                        patch(col.id, (c) => void (c.width = n || undefined));
                      },
                    }),
                  ),
                  h(
                    "td.act",
                    null,
                    button("", {
                      icon: "up",
                      cls: "icon ghost",
                      title: "Move it left",
                      disabled: i === 0,
                      onclick: () => move(i, -1),
                    }),
                    button("", {
                      icon: "down",
                      cls: "icon ghost",
                      title: "Move it right",
                      disabled: i === rota.columns.length - 1,
                      onclick: () => move(i, 1),
                    }),
                    button("", {
                      icon: "trash",
                      cls: "icon ghost",
                      title: `Delete “${col.label || "this column"}”`,
                      onclick: () =>
                        editRota((r) => void (r.columns = r.columns.filter((x) => x.id !== col.id))),
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
    h(
      "div.row.tight",
      null,
      button("Add column", {
        icon: "plus",
        cls: "sm",
        onclick: () => {
          if (rota.columns.length >= MAX_COLUMNS) {
            toast(
              `${MAX_COLUMNS} columns is the limit — past that the sheet stops fitting on a page.`,
              "bad",
              7000,
            );
            return;
          }
          editRota((r) => void r.columns.push({ id: newId("rc"), label: "", kind: "tick" }));
        },
      }),
      h("div.spacer"),
      h("span.mut.tiny", null, KINDS.find((k) => k.value === rota.columns[0]?.kind)?.note ?? ""),
    ),
    /* ⭐ THE TWO THAT MAKE IT EVIDENCE. Said here rather than enforced: a school
       that wants a rota with no signature is entitled to one, and a rule that
       silently added columns back would be worse than a sentence. */
    !rota.columns.some((c) => c.kind === "person") || !rota.columns.some((c) => c.kind === "date")
      ? notice(
          "warn",
          h("strong", null, "No “who” or no “when”. "),
          "A check that was done but by nobody, on no date, is not evidence of anything. Every preset ends with a person and a date for that reason — worth adding one of each unless you have a reason not to.",
        )
      : null,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PRESETS
   ══════════════════════════════════════════════════════════════════════════ */

function presets(rota: SchoolRota): HTMLElement {
  const from = rotaPreset(rota.preset);
  return card(
    "Start again from a preset",
    from
      ? `This rota started from “${from.label}”. Applying another one replaces the columns — the list, the dates and anything recorded are untouched.`
      : "Applying one replaces the columns — the list, the dates and anything recorded are untouched.",
    h(
      "div.presetgrid",
      null,
      ...ROTA_PRESETS.map((p) =>
        h(
          "button.preset",
          {
            type: "button",
            onclick: () =>
              confirmDialog(
                `Use the ${p.label} columns?`,
                `The ${rota.columns.length} column${rota.columns.length === 1 ? "" : "s"} on this rota will be replaced by ${p.columns.length}. Nothing else about the rota changes.`,
                "Replace columns",
                () => {
                  editRota((r) => {
                    r.columns = presetColumns(p.id);
                    r.preset = p.id;
                  });
                  toast(`Columns replaced from “${p.label}”.`, "good", 5000);
                },
                false,
              ),
          },
          h("div.pname", null, p.label),
          h("div.pblurb", null, p.blurb),
          h(
            "div.pmeta",
            null,
            ...p.columns.map((c) => h("span.pill", null, c.label || c.kind)),
          ),
        ),
      ),
    ),
  );
}
