/**
 * ══════════════════════════════════════════════════════════════════════════
 *  EXPORT — the workbook, filled in or blank
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ TWO BUTTONS, TWO PURPOSES, AND THE SECOND IS NOT A DEGRADED FIRST.
 *
 *   **With data**  — everything recorded so far is printed into its cell. This
 *                    is the copy that goes in the file: it says what was done.
 *   **Blank**      — the tick columns print empty even where somebody HAS
 *                    recorded a value. This is the copy that goes on the
 *                    clipboard, and pre-filling it would be handing somebody a
 *                    form that already agrees with itself.
 *
 * A school with nothing recorded yet gets the same bytes from both, which is
 * correct and is why the page says so rather than hiding one of them.
 *
 * ⚠️ THE COLOURS ARE THE FILE'S ACCENT, the same one the timetable's day bands
 * use — set once on the Timetable tab's Colour screen and it moves both. A
 * second colour picker on this tab would let one school produce two workbooks
 * that do not look like they came from the same place.
 */

import {
  bufferRotaWorkbook,
  buildRota,
  groupingsLine,
  type SchoolRota,
} from "../engine";
import { button, card, h, notice } from "../dom";
import { host } from "../host";
import { toast } from "../ui";
import { doc, repaint, rotaNow, setScreen } from "../store";

let busy = false;

export function rotaExportScreen(): HTMLElement {
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
          h("p", null, "Create one on the List screen first."),
          button("Go to the list", { icon: "label", cls: "primary", onclick: () => setScreen("rota-list") }),
        ),
      ),
    );

  const built = buildRota(doc(), rota);
  const noun = rota.itemNoun ?? "Item";

  if (!built.ok)
    return h(
      "div.stack",
      null,
      card(
        "Not ready yet",
        null,
        /* ⭐ THE RESOLVER'S OWN REFUSAL, VERBATIM. It names what is missing and
           what to do about it; a re-worded copy here would be a second
           vocabulary for one problem. */
        notice("warn", built.error),
        h(
          "div.row.tight",
          null,
          button("The list", { icon: "label", cls: "sm", onclick: () => setScreen("rota-list") }),
          button("The rota", { icon: "calendar", cls: "sm ghost", onclick: () => setScreen("rota-schedule") }),
        ),
      ),
    );

  const { periods, year } = built;
  const recorded = Object.keys(rota.records ?? {}).length;
  const live = rota.items.filter((i) => i.active !== false).length;
  const groups = groupingsLine(periods);

  return h(
    "div.stack",
    null,
    card(
      "What comes out",
      `Two sheets: the rota itself, and “${plural(noun)}” listing everything on it with your own facts beside each one.`,
      h(
        "div.tablewrap",
        null,
        h(
          "table.list",
          null,
          h(
            "tbody",
            null,
            line("Rota", rota.name || "Untitled rota"),
            line("Over", year ? year.name : `${rota.start ?? "?"} to ${rota.end ?? "?"}`),
            line("Rows", `${periods.length}`),
            line(plural(noun), `${live} in service${live !== rota.items.length ? `, ${rota.items.length - live} out` : ""}`),
            line("Columns to fill in", `${rota.columns.length}`),
            groups ? line("Sharing a turn", groups) : null,
            line("Recorded so far", recorded === 0 ? "nothing yet" : `${recorded} of ${periods.length * Math.max(1, rota.quota)}`),
          ),
        ),
      ),
    ),
    card(
      "Build it",
      "Both files are the same workbook. The difference is whether what has already been recorded is printed into it.",
      h(
        "div.row.tight",
        null,
        button(busy ? "Building…" : "Export with data", {
          icon: "download",
          cls: "primary",
          disabled: busy,
          title: "Everything recorded so far, printed into its cell",
          onclick: () => void build(rota, true),
        }),
        button(busy ? "Building…" : "Export a blank template", {
          icon: "file",
          cls: "ghost",
          disabled: busy,
          title: "The tick columns print empty, whatever has been recorded",
          onclick: () => void build(rota, false),
        }),
      ),
      recorded === 0
        ? notice(
            "",
            "Nothing has been recorded against this rota yet, so both buttons produce the same file. Keep the blank one for the clipboard.",
          )
        : null,
      notice(
        "",
        h("strong", null, "The colours come from the Colour screen "),
        "on the Timetable tab — one accent for the whole file, so the rota and the timetable look like they came from the same school.",
      ),
    ),
  );
}

const plural = (n: string): string => (/s$/i.test(n) ? `${n}es` : `${n}s`);

function line(label: string, value: string): HTMLElement {
  return h("tr", null, h("th", null, label), h("td", null, value));
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BUILD
   ══════════════════════════════════════════════════════════════════════════ */

async function build(rota: SchoolRota, withData: boolean) {
  if (busy) return;
  const d = doc();
  const built = buildRota(d, rota);
  if (!built.ok) {
    toast(built.error, "bad", 9000);
    return;
  }

  busy = true;
  repaint();
  /* ⚠️ A YIELD BEFORE SYNCHRONOUS WORK, and a TIMEOUT rather than a frame — a
     backgrounded tab never fires `requestAnimationFrame`, and an export started
     and then switched away from is exactly what somebody does while they wait.
     The timetable export carries the same two lines and the same reason. */
  await new Promise((r) => setTimeout(r, 32));

  try {
    const bytes = await bufferRotaWorkbook({
      rota,
      periods: built.periods,
      accent: d.school.accent,
      withData,
      generatedAt: Date.now(),
    });
    const stem = (rota.name || "Rota").replace(/[^A-Za-z0-9 _-]+/g, "").trim() || "Rota";
    const suffix = withData ? "" : " (blank)";
    const name = await host.saveWorkbook(bytes, `${stem}${suffix}.xlsx`);
    if (name === null) return; /* cancelled — not an error, and not shouted about */
    toast(`${name} written.`, "good", 7000);
  } catch (err) {
    /* ⚠️ NAMED, NOT SWALLOWED — a failure in the writer is the one thing a
       school cannot work around, and "something went wrong" gives them nothing
       to send on. */
    toast(
      `The workbook could not be built: ${err instanceof Error ? err.message : String(err)}`,
      "bad",
      12000,
    );
  } finally {
    busy = false;
    repaint();
  }
}
