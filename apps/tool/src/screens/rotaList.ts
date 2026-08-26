/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE LIST — what gets checked, and how big a turn each one takes
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A rota is a list of things and a rule for taking turns. This screen is the
 * list; `rotaSchedule.ts` is the rule and what it produces.
 *
 * ── ⭐ WEIGHTS, NOT PAIRS ────────────────────────────────────────────────
 * Cam's real spreadsheet carries a `Checked With` column naming a partner for
 * each of its six small rooms, maintained BY HAND — which is precisely how it
 * can disagree with the rota printed underneath it. Here an item carries a
 * WEIGHT and the filler groups whatever it needs to to reach the quota, so the
 * pairings are a RESULT rather than an input and cannot drift from the sheet.
 *
 * ⚠️ THE PRICE, SAID OUT LOUD ON THIS SCREEN: which two smalls share a week
 * can move when the list changes. Deterministic — the same list gives the same
 * rota every time — but not frozen the way a hand-typed partner is. A school
 * that has already printed a term's worth needs to know that before they add
 * a room in November, so the notice below says it rather than the release
 * notes saying it.
 *
 * ⚠️ WEIGHT IS "HOW MUCH OF A TURN", NOT "HOW IMPORTANT". A half-weight item
 * is checked WITH another one, not less often — over the whole year every item
 * comes round the same number of times. The field's note says so, because
 * "0.5" reads as "half as much attention" to everybody who has not read this.
 */

import {
  ROTA_PRESETS,
  presetColumns,
  rotaPreset,
  type SchoolRota,
} from "../engine";
import { button, card, field, h, notice, select } from "../dom";
import { confirmDialog, closeModal, openModal, toast } from "../ui";
import {
  addRota,
  doc,
  editRota,
  newId,
  removeRota,
  rotaNow,
  setRotaId,
  setScreen,
} from "../store";

/**
 * ⚠️ A CAP, AND IT IS ABOUT THE SHEET RATHER THAN ABOUT MEMORY. Every rota
 * becomes its own workbook, so the number here is only a guard against a file
 * that has quietly become somebody's asset register. Generous on purpose.
 */
const MAX_ROTAS = 12;
const MAX_ITEMS = 400;

/* ══════════════════════════════════════════════════════════════════════════
   NEW
   ══════════════════════════════════════════════════════════════════════════ */

function newRotaDialog() {
  const rotas = doc().rotas ?? [];
  if (rotas.length >= MAX_ROTAS) {
    toast(`That is the ${MAX_ROTAS}-rota limit for one file.`, "bad", 7000);
    return;
  }

  let chosen = ROTA_PRESETS[0].id;

  const list = h(
    "div.presetgrid",
    null,
    ...ROTA_PRESETS.map((p) =>
      h(
        "button.preset",
        {
          type: "button",
          "aria-pressed": String(chosen === p.id),
          onclick: (e: Event) => {
            chosen = p.id;
            const host = (e.currentTarget as HTMLElement).parentElement;
            for (const b of host?.querySelectorAll("button") ?? [])
              b.setAttribute("aria-pressed", String(b === e.currentTarget));
          },
        },
        h("div.pname", null, p.label),
        h("div.pblurb", null, p.blurb),
        h(
          "div.pmeta",
          null,
          h("span.pill", null, cadenceWord(p.cadence)),
          h("span.pill", null, `${p.quota} per turn`),
          h("span.pill", null, `${p.columns.length} columns`),
        ),
      ),
    ),
  );

  openModal(
    "New rota",
    "Pick the closest one. Everything it sets — the columns, how often, how many at a time — is yours to change afterwards, and changing it does not put the rota back to 'custom'.",
    list,
    [
      button("Cancel", { cls: "ghost", onclick: closeModal }),
      button("Create", {
        cls: "primary",
        onclick: () => {
          const p = rotaPreset(chosen);
          if (!p) return;
          closeModal();
          addRota({
            id: newId("rota"),
            name: p.label,
            preset: p.id,
            cadence: p.cadence,
            quota: p.quota,
            columns: presetColumns(p.id),
            items: [],
            /* ⭐ FOLLOW THE SCHOOL YEAR when there is one, so `Week A` and
               `Half Term` come out of the same calendar the timetable prints
               and the two sheets agree. With no year it falls back to its own
               dates, which is what makes a rota usable in a school that has no
               timetable in this file at all. */
            source: doc().years.length ? "year" : "own",
            runThroughClosures: true,
            itemNoun: p.noun,
            subtitle: p.subtitle,
          });
          setScreen("rota-list");
        },
      }),
    ],
  );
}

const cadenceWord = (c: string): string =>
  c === "daily"
    ? "Daily"
    : c === "weekly"
      ? "Weekly"
      : c === "fortnightly"
        ? "Fortnightly"
        : c === "monthly"
          ? "Monthly"
          : "Termly";

/* ══════════════════════════════════════════════════════════════════════════
   THE SCREEN
   ══════════════════════════════════════════════════════════════════════════ */

export function rotaListScreen(): HTMLElement {
  const rota = rotaNow();
  if (!rota) return emptyState();

  return h(
    "div.stack.wide",
    null,
    picker(rota),
    identity(rota),
    items(rota),
  );
}

function emptyState(): HTMLElement {
  return h(
    "div.stack",
    null,
    card(
      "No rota yet",
      "A rota is a list of things and a rule for taking turns: rooms cleaned two a week, extinguishers checked four a month, a minibus walked round every Friday.",
      h(
        "div.empty",
        null,
        h(
          "p",
          null,
          "Start from one of the presets. Each brings its own columns and a sensible frequency — an IT room check is not the same shape as a fire door check, and the difference is entirely which boxes get ticked.",
        ),
        button("New rota", { icon: "plus", cls: "primary", onclick: newRotaDialog }),
      ),
    ),
    notice(
      "",
      h("strong", null, "It lives in the same file. "),
      "Rotas are saved into the same ",
      h("code", null, ".json"),
      " as the timetable, so one file is the school's year: the standing timetable, and the checks that run alongside it.",
    ),
  );
}

function picker(rota: SchoolRota): HTMLElement {
  const rotas = doc().rotas ?? [];
  return h(
    "div.row",
    null,
    select(
      "Rota",
      rota.id,
      rotas.map((r) => ({ value: r.id, label: r.name || "Untitled rota" })),
      (v) => setRotaId(v),
      rotas.length > 1 ? `${rotas.length} in this file` : undefined,
    ),
    h("div.spacer"),
    button("New rota", { icon: "plus", cls: "sm", onclick: newRotaDialog }),
    button("Delete", {
      icon: "trash",
      cls: "sm ghost danger",
      onclick: () =>
        confirmDialog(
          "Delete this rota?",
          `“${rota.name || "Untitled rota"}” and its ${rota.items.length} ${nounPlural(rota).toLowerCase()} go with it, along with anything recorded against them. The timetable in this file is untouched.`,
          "Delete rota",
          () => {
            removeRota(rota.id);
            toast("Rota deleted.", "", 4200);
          },
        ),
    }),
  );
}

const nounPlural = (r: SchoolRota): string => {
  const n = r.itemNoun?.trim() || "Item";
  return /s$/i.test(n) ? `${n}es` : `${n}s`;
};

function identity(rota: SchoolRota): HTMLElement {
  return card(
    "This rota",
    "The name is yours. The noun is what one row IS — it becomes the sheet name and the heading over the left-hand column, so “Extinguisher” prints “Extinguisher(s) to Check” rather than “Item(s)”.",
    h(
      "div.grid2",
      null,
      field("Name", rota.name, (v) => editRota((r) => void (r.name = v)), {
        placeholder: "IT Room Checking Rota",
      }),
      field(
        "One row is a…",
        rota.itemNoun ?? "",
        (v) => editRota((r) => void (r.itemNoun = v.trim() || undefined)),
        {
          placeholder: "Room",
          note: `Prints as “${nounPlural(rota)}” on the second sheet.`,
        },
      ),
    ),
    field(
      "Line under the title",
      rota.subtitle ?? "",
      (v) => editRota((r) => void (r.subtitle = v.trim() || undefined)),
      {
        placeholder: "Rooms checked each week: cleaned, and any damage reported.",
        note: "The first thing somebody picking up the clipboard reads. Leave it empty for none.",
      },
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE ITEMS
   ══════════════════════════════════════════════════════════════════════════ */

/** The fact columns, gathered from every item — the union, in first-seen
 *  order, exactly as the room sheet does it. A fact one item has and another
 *  does not still gets a column; the gap prints blank. */
function factKeys(rota: SchoolRota): string[] {
  const keys: string[] = [];
  for (const item of rota.items)
    for (const k of Object.keys(item.facts ?? {})) if (!keys.includes(k)) keys.push(k);
  return keys;
}

function items(rota: SchoolRota): HTMLElement {
  const keys = factKeys(rota);
  const noun = rota.itemNoun?.trim() || "Item";
  const smalls = rota.items.filter((i) => (i.weight ?? 1) < 1 && i.active !== false).length;

  const add = () => {
    if (rota.items.length >= MAX_ITEMS) {
      toast(`That is the ${MAX_ITEMS}-${noun.toLowerCase()} limit for one rota.`, "bad", 7000);
      return;
    }
    editRota((r) =>
      void r.items.push({
        id: newId("ri"),
        code: "",
        facts: Object.fromEntries(keys.map((k) => [k, ""])),
      }),
    );
  };

  const patch = (id: string, fn: (i: SchoolRota["items"][number]) => void) =>
    editRota((r) => {
      const i = r.items.find((x) => x.id === id);
      if (i) fn(i);
    });

  return card(
    nounPlural(rota),
    `The list that takes turns. ${noun} codes are what print in the rota, so keep them short — they sit in one cell.`,
    rota.items.length === 0
      ? h(
          "div.empty",
          null,
          h("p", null, `Nothing to check yet. Add the first ${noun.toLowerCase()}.`),
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
                h("th", null, noun),
                h("th", null, "Name"),
                ...keys.map((k) => h("th", null, k)),
                h("th", null, "Weight"),
                h("th", null, "In service"),
                h("th.act", null, ""),
              ),
            ),
            h(
              "tbody",
              null,
              ...rota.items.map((item) =>
                h(
                  "tr",
                  { class: item.active === false ? "retired" : undefined },
                  h(
                    "td.mono",
                    null,
                    h("input.cell", {
                        type: "text",
                      value: item.code,
                      placeholder: "N21",
                      onchange: (e: Event) =>
                        patch(item.id, (i) => void (i.code = (e.target as HTMLInputElement).value.trim())),
                    }),
                  ),
                  h(
                    "td",
                    null,
                    h("input.cell.mid", {
                        type: "text",
                      value: item.name ?? "",
                      placeholder: "optional",
                      onchange: (e: Event) =>
                        patch(item.id, (i) => void (i.name = (e.target as HTMLInputElement).value.trim() || undefined)),
                    }),
                  ),
                  ...keys.map((k) =>
                    h(
                      "td",
                      null,
                      h("input.cell", {
                        type: "text",
                        value: item.facts?.[k] ?? "",
                        onchange: (e: Event) =>
                          patch(item.id, (i) => {
                            if (!i.facts) i.facts = {};
                            i.facts[k] = (e.target as HTMLInputElement).value;
                          }),
                      }),
                    ),
                  ),
                  h(
                    "td",
                    null,
                    h(
                      "select.cell",
                      {
                        onchange: (e: Event) => {
                          const v = Number((e.target as HTMLSelectElement).value);
                          patch(item.id, (i) => void (i.weight = v === 1 ? undefined : v));
                        },
                      },
                      ...[
                        { v: 1, l: "Full turn" },
                        { v: 0.5, l: "Half — shares" },
                        { v: 2, l: "Two turns" },
                      ].map((o) =>
                        h("option", { value: String(o.v), selected: (item.weight ?? 1) === o.v }, o.l),
                      ),
                    ),
                  ),
                  h(
                    "td",
                    null,
                    h(
                      "button.linky",
                      {
                        type: "button",
                        title:
                          item.active === false
                            ? "Put it back into the rota"
                            : "Take it out of the rota without deleting what it has recorded",
                        onclick: () =>
                          patch(item.id, (i) => void (i.active = i.active === false ? undefined : false)),
                      },
                      item.active === false ? "Out" : "In",
                    ),
                  ),
                  h(
                    "td.act",
                    null,
                    button("", {
                      icon: "trash",
                      cls: "icon ghost",
                      title: `Delete ${item.code || "this row"}`,
                      onclick: () =>
                        editRota((r) => void (r.items = r.items.filter((x) => x.id !== item.id))),
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
      button(`Add ${noun.toLowerCase()}`, { icon: "plus", cls: "sm", onclick: add }),
      button("Add a fact column", {
        icon: "label",
        cls: "sm ghost",
        onclick: () => addFactDialog(rota),
      }),
      keys.length > 0
        ? button("Remove a fact column", {
            icon: "eraser",
            cls: "sm ghost",
            onclick: () => removeFactDialog(rota, keys),
          })
        : null,
      h("div.spacer"),
      h(
        "span.mut.tiny",
        null,
        `${rota.items.filter((i) => i.active !== false).length} in service`,
        rota.items.some((i) => i.active === false)
          ? `, ${rota.items.filter((i) => i.active === false).length} out`
          : "",
      ),
    ),
    /* ⭐ THE COST OF WEIGHTS, ON THE SCREEN THAT SETS THEM. See the banner. */
    smalls > 0
      ? notice(
          "warn",
          h("strong", null, "Which two share a turn is worked out, not typed. "),
          `${smalls} of these take half a turn, so the rota pairs them up as it fills each ${cadenceWord(rota.cadence).toLowerCase()} slot. The same list always gives the same rota — but adding or removing a ${noun.toLowerCase()} can change which two are paired from that point on. Worth knowing before you edit the list halfway through a term.`,
        )
      : null,
  );
}

function addFactDialog(rota: SchoolRota) {
  let name = "";
  const input = h("input", {
    placeholder: "No of PCs",
    oninput: (e: Event) => void (name = (e.target as HTMLInputElement).value),
  });
  openModal(
    "Add a fact column",
    "Something printed beside each row on the second sheet — a phone extension, how many machines, who looks after it. It is never part of the turn-taking.",
    h("label.field", null, "Heading", input),
    [
      button("Cancel", { cls: "ghost", onclick: closeModal }),
      button("Add", {
        cls: "primary",
        onclick: () => {
          const key = name.trim();
          if (!key) return;
          closeModal();
          editRota((r) => {
            for (const i of r.items) {
              if (!i.facts) i.facts = {};
              if (!(key in i.facts)) i.facts[key] = "";
            }
          });
        },
      }),
    ],
  );
}

function removeFactDialog(rota: SchoolRota, keys: string[]) {
  let key = keys[0];
  openModal(
    "Remove a fact column",
    "It goes from every row, and what was typed in it goes with it.",
    select("Column", key, keys.map((k) => ({ value: k, label: k })), (v) => void (key = v)),
    [
      button("Cancel", { cls: "ghost", onclick: closeModal }),
      button("Remove", {
        cls: "danger",
        onclick: () => {
          closeModal();
          editRota((r) => {
            for (const i of r.items) if (i.facts) delete i.facts[key];
          });
        },
      }),
    ],
  );
}
