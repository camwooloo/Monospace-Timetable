/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ROTA ITSELF — how often, how many, over which weeks, and the result
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ THE TURN ORDER IS DERIVED AND NEVER STORED. Same list, same cadence, same
 * quota → same rota, every time, in both programs. Storing it would let the
 * saved file disagree with the engine that reads it, which is the whole
 * argument the format banner makes about the week map — and it is worse here,
 * because a stored rota would go stale the moment somebody added a room and
 * would keep printing the old one with no way to tell.
 *
 * ⚠️ SO THE TABLE BELOW IS NOT AN EDITOR. It is what the workbook will contain,
 * shown at the size it will be. What you change to change it is the list, the
 * cadence and the quota — all of which are one click away.
 *
 * ⚠️ AND IT ASKS `buildRota`, WHICH IS ALSO WHAT THE EXPORT ASKS. A preview
 * that computed its own frames would agree with the file exactly until one of
 * the two gained a rule, and then it would be a preview of nothing.
 */

import {
  ROTA_CADENCES,
  buildRota,
  groupingsLine,
  shortDate,
  type RotaCadence,
  type RotaPeriod,
  type SchoolRota,
} from "../engine";
import { button, card, field, h, notice, select, toggle } from "../dom";
import { doc, editRota, rotaNow, setScreen } from "../store";

const CADENCE_LABEL: Record<RotaCadence, string> = {
  daily: "Every school day",
  weekly: "Every week",
  fortnightly: "Every other week",
  monthly: "Every fourth week",
  termly: "Every thirteenth week",
};

const CADENCE_NOTE: Record<RotaCadence, string> = {
  daily: "One row per taught weekday. A year of these is long — it reads best printed a term at a time.",
  weekly: "One row per week of the year, closed weeks included.",
  fortnightly: "Every other WEEK of the year — not every other teaching week, so it keeps landing on the same point of the term after a holiday.",
  monthly: "Every fourth week. Close enough to monthly to be countable, and it never drifts off the week grid.",
  termly: "Every thirteenth week — roughly once a term in a 39-week year.",
};

export function rotaScheduleScreen(): HTMLElement {
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
          h("p", null, "Create one on the List screen and the turn order appears here."),
          button("Go to the list", { icon: "label", cls: "primary", onclick: () => setScreen("rota-list") }),
        ),
      ),
    );

  return h("div.stack.wide", null, rules(rota), when(rota), result(rota));
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RULE
   ══════════════════════════════════════════════════════════════════════════ */

function rules(rota: SchoolRota): HTMLElement {
  const noun = (rota.itemNoun ?? "item").toLowerCase();
  return card(
    "How the turns are taken",
    "Two numbers decide the whole rota: how often it comes round, and how much gets checked each time.",
    h(
      "div.grid2",
      null,
      select(
        "How often",
        rota.cadence,
        ROTA_CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c] })),
        (v) => editRota((r) => void (r.cadence = v)),
        CADENCE_NOTE[rota.cadence],
      ),
      field(
        "How many each time",
        String(rota.quota),
        (v) => {
          const n = Math.max(1, Math.min(50, Math.round(Number(v) || 1)));
          editRota((r) => void (r.quota = n));
        },
        {
          type: "number",
          min: "1",
          max: "50",
          step: "1",
          /* ⚠️ THE UNIT IS TURNS, NOT ROWS. Two half-weight items fill ONE of
             these between them, so "2" on a list with smalls in it can print
             three names in a week. Saying "2 rooms" here would make that read
             as a bug the first time somebody saw it. */
          note: `Counted in turns, not in names: two half-turn ${noun}s share one.`,
        },
      ),
    ),
    /* ⭐ ON BY DEFAULT, because the reference workbook keeps assigning through
       Half Term, Christmas and Easter. The switch exists because that is a
       school-by-school decision and not a fact about rotas. */
    toggle(
      rota.runThroughClosures !== false,
      "Keep going through the holidays",
      "Closed weeks still take their turn, so the rota runs continuously — which is what a rota that gets done in the holidays looks like.",
      "Switched off, a closed week keeps its row and names nobody, and the turn order picks up where it left off afterwards.",
      (v) => editRota((r) => void (r.runThroughClosures = v)),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE DATES
   ══════════════════════════════════════════════════════════════════════════ */

function when(rota: SchoolRota): HTMLElement {
  const d = doc();
  const years = d.years;

  return card(
    "Over which weeks",
    "A rota either runs across the school year — taking its week letters and its holidays from the same calendar the timetable prints — or over dates of its own.",
    h(
      "div.seg",
      null,
      ...(
        [
          { v: "year" as const, l: "Follow the school year" },
          { v: "own" as const, l: "Its own dates" },
        ]
      ).map((o) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": String(rota.source === o.v),
            /* ⚠️ DISABLED RATHER THAN HIDDEN when the file has no year. A
               control that vanishes leaves somebody looking for it; one that
               is there and explains itself sends them to the Timetable tab. */
            disabled: o.v === "year" && years.length === 0,
            title:
              o.v === "year" && years.length === 0
                ? "There is no academic year in this file yet — add one on the Timetable tab."
                : undefined,
            onclick: () => editRota((r) => void (r.source = o.v)),
          },
          o.l,
        ),
      ),
    ),
    rota.source === "year"
      ? years.length === 0
        ? notice(
            "warn",
            "This file has no academic year yet, so there are no weeks to run over. Add one on the Timetable tab, or give this rota its own dates.",
          )
        : select(
            "Academic year",
            rota.yearId ?? "",
            [
              /* ⭐ "THE YEAR WE ARE IN" IS A REAL CHOICE AND IT IS THE DEFAULT.
                 A rota pinned to 2026/27 by id keeps printing 2026/27 in
                 September 2027; left unpinned it rolls over with the school,
                 which is what a standing rota does. */
              { value: "", label: "Whichever year we are in" },
              ...years.map((y) => ({ value: y.id, label: y.name })),
            ],
            (v) => editRota((r) => void (r.yearId = v || undefined)),
            rota.yearId
              ? "Pinned. It will keep printing this year after the school has moved on."
              : "Rolls over on its own each September.",
          )
      : h(
          "div.grid2",
          null,
          field("First week begins", rota.start ?? "", (v) => editRota((r) => void (r.start = v || undefined)), {
            type: "date",
            note: "Any day in the first week — the printed column is always its Monday.",
          }),
          field("Last week ends", rota.end ?? "", (v) => editRota((r) => void (r.end = v || undefined)), {
            type: "date",
          }),
        ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT COMES OUT
   ══════════════════════════════════════════════════════════════════════════ */

function result(rota: SchoolRota): HTMLElement {
  const built = buildRota(doc(), rota);

  if (!built.ok)
    return card("The rota", null, notice("warn", built.error));

  const { periods, note } = built;
  const groups = groupingsLine(periods);
  const noun = (rota.itemNoun ?? "item").toLowerCase();

  return card(
    "The rota",
    `${periods.length} ${periods.length === 1 ? "row" : "rows"}, worked out from the list. This is what the workbook will contain — to change it, change the list, the cadence or the quota.`,
    groups
      ? notice(
          "",
          h("strong", null, "Sharing a turn: "),
          groups,
          h(
            "span.mut.tiny",
            null,
            "  — worked out from the weights, not typed.",
          ),
        )
      : null,
    note ? notice("", note) : null,
    h(
      "div.tablewrap.tall",
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
            h("th", null, "#"),
            h("th", null, "Beginning"),
            h("th", null, "Week"),
            h("th", null, `${rota.itemNoun ?? "Item"}(s) to check`),
          ),
        ),
        h("tbody", null, ...periods.map(row)),
      ),
    ),
    h(
      "div.row.tight",
      null,
      h(
        "span.mut.tiny",
        null,
        `Every ${noun} in service comes round the same number of times over the year.`,
      ),
      h("div.spacer"),
      button("Export it", { icon: "download", cls: "sm", onclick: () => setScreen("rota-export") }),
    ),
  );
}

function row(p: RotaPeriod): HTMLElement {
  return h(
    "tr",
    /* ⚠️ THE CLOSED ROWS ARE DIMMED AND STILL THERE, exactly as they are in the
       workbook. A closed week that vanished from the preview would make the two
       disagree about how many rows there are, and the row number is what a
       school counts by. */
    { class: p.teaching ? undefined : "dim" },
    h("td.dim.tiny", null, String(p.index)),
    h("td.mono", null, shortDate(p.start)),
    h(
      "td",
      null,
      p.label
        ? h("span.chip", null, p.label)
        : h("span.mut.tiny", null, "—"),
    ),
    h(
      "td",
      null,
      p.slots.length === 0
        ? h("span.mut.tiny", null, "nobody — closed")
        : h(
            "span",
            null,
            ...p.slots.map((s, i) =>
              h("span.mono", null, i > 0 ? "   " : "", s.label),
            ),
          ),
    ),
  );
}
