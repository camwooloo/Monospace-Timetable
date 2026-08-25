/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ACADEMIC YEAR — the RULE, never the answer
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ NOTHING DERIVED IS STORED. The year is bounds + cycle length + anchor +
 * holiday mode, and `buildYear()` walks the 39 weeks on every open. A saved
 * answer would let a file written under one version of the cycle engine
 * disagree with the engine that reads it, and the school would have no way to
 * tell which half was stale. So the week list below is a PREVIEW of a
 * calculation, not a thing being edited.
 */

import {
  CYCLE_LENGTHS,
  buildYear,
  cycleWeekLabel,
  defaultWeekLabels,
  yearWeekLabels,
  isMonday,
  mondayOf,
  shortDate,
  weekBandFor,
  weekRowState,
  weekdayName,
  weekStateNote,
  holidayModeCopy,
  HOLIDAY_MODES,
  MAX_WEEKS_PER_CALENDAR,
  TEACHING_WEEKDAYS,
  type CycleLength,
  type HolidayMode,
  type SchoolYear,
} from "../engine";
import { button, card, field, h, notice, select } from "../dom";
import { confirmDialog, toast } from "../ui";
import { doc, edit, editYear, newId, setYearId, yearNow } from "../store";

/** ⚠️ THE SAME THREE THE ENGINE OFFERS, READ FROM IT. A picker that hard-codes
 *  `[1, 2, 3]` is a picker that can invent a fourth the engine cannot resolve. */
const CYCLE_LABEL: Record<number, string> = {
  1: "One week",
  2: "Two weeks (A / B)",
  3: "Three weeks (A / B / C)",
};

export function yearScreen(): HTMLElement {
  const d = doc();
  const year = yearNow();

  const head = card(
    "The school",
    "The name on the workbook and on its info sheet.",
    h(
      "div.grid2",
      null,
      field("School name", d.school.name, (v) =>
        edit((next) => {
          next.school.name = v;
        }),
      ),
      h(
        "label.field",
        null,
        "Academic years",
        h(
          "div.row.tight",
          null,
          d.years.length === 0
            ? h("span.mut.tiny", null, "None yet.")
            : h(
                "select",
                {
                  onchange: (e: Event) => setYearId((e.target as HTMLSelectElement).value),
                  style: { width: "auto", minWidth: "150px" },
                },
                ...d.years.map((y) =>
                  h(
                    "option",
                    { value: y.id, selected: y.id === year?.id },
                    y.name || "Untitled year",
                  ),
                ),
              ),
          button("Add a year", { icon: "plus", cls: "sm", onclick: addYear }),
        ),
        h(
          "span.note",
          null,
          /* ⚠️ THE FILE HAS NO CAP, DELIBERATELY. Monospace caps CREATION at
             three; refusing to OPEN a file because it holds four years would
             be a school losing its data to a constant. */
          "A school usually keeps two or three. This file has no limit — it must always open.",
        ),
      ),
    ),
  );

  if (!year) {
    return h(
      "div.stack",
      null,
      head,
      card(
        "No year yet",
        null,
        h(
          "div.empty",
          null,
          h("b", null, "Start with the year"),
          "Everything else — the closures, the day, the templates — belongs to a year. Add one and the rest of the app opens up.",
          h("div", { style: { marginTop: "16px" } }, button("Add a year", { icon: "plus", cls: "primary", onclick: addYear })),
        ),
      ),
    );
  }

  return h("div.stack", null, head, bounds(year), cycle(year), preview(year));
}

/* ══════════════════════════════════════════════════════════════════════════
   ADDING ONE
   ══════════════════════════════════════════════════════════════════════════ */

function addYear() {
  const d = doc();
  /* ⭐ THE DAY IS COPIED FROM THE PREVIOUS YEAR, NOT SHARED WITH IT. A school
     really can change its day between years, and a SHARED day would let
     editing next year's break time silently rewrite a year already taught.
     The format banner spells this out; "one day shape across the years" is a
     copy at creation, once. */
  const previous = d.years[d.years.length - 1];
  const today = new Date();
  const sept = new Date(today.getFullYear(), 8, 1);
  const start = iso(sept);
  const end = iso(new Date(today.getFullYear() + 1, 6, 17));
  const y: SchoolYear = {
    id: newId("year"),
    name: `${sept.getFullYear()}/${String((sept.getFullYear() + 1) % 100).padStart(2, "0")}`,
    timezone: previous?.timezone ?? guessZone(),
    start,
    end,
    cycleLength: previous?.cycleLength ?? 2,
    /* ⚠️ MUST BE A MONDAY. `isMonday()` is the test; a non-Monday silently
       matches no week, and the whole cycle is phase-shifted by nothing at all. */
    anchorMonday: mondayOf(start) ?? start,
    anchorWeekIndex: 0,
    holidayMode: previous?.holidayMode ?? "pause",
    weekLabels: previous?.weekLabels ? [...previous.weekLabels] : undefined,
    taughtWeekdays: previous?.taughtWeekdays ? [...previous.taughtWeekdays] : undefined,
    periods: previous ? structuredClone(previous.periods) : [],
    roomSheetId: previous?.roomSheetId ?? d.roomSheets[0]?.id,
    closures: [],
    pins: [],
    templates: [],
    weekChanges: [],
    bookings: [],
  };
  edit((next) => {
    next.years.push(y);
  });
  setYearId(y.id);
  toast(
    previous
      ? `Added ${y.name}. The day shape was copied from ${previous.name} — change it here and ${previous.name} is untouched.`
      : `Added ${y.name}.`,
    "good",
  );
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function guessZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  } catch {
    return "Europe/London";
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BOUNDS
   ══════════════════════════════════════════════════════════════════════════ */

function bounds(year: SchoolYear): HTMLElement {
  const anchorOk = isMonday(year.anchorMonday);
  /**
   * ⚠️⚠️ THE RANGE IS THE YEAR'S **WEEKS**, NOT ITS DAYS, AND THAT IS THE WHOLE
   * BUG THIS LINE ONCE HAD.
   *
   * `mondaysBetween()` — which is what `buildYear` walks — starts at
   * `mondayOf(start)` and ends at `mondayOf(end)`, because a week is named by
   * its Monday and the year is clipped per DAY: a year opening on Wednesday
   * 3 September still HAS a first week, and that week's Monday is 1 September,
   * two days before `year.start`.
   *
   * Comparing the anchor against `year.start` therefore called the first week
   * of the year "outside" it. Measured: pressing "Add a year" on a fresh
   * document produced `start = 1 September`, `anchorMonday = mondayOf(start)`
   * — the correct anchor, and the one the engine's own reference fixture uses
   * (`start 2025-09-03`, `anchorMonday 2025-09-01`) — and drew an amber
   * "The anchor sits outside the year" under it. Every new year, in six years
   * out of seven, greeted with a warning that was not true, which is how a
   * school learns to click past the warnings that are.
   */
  const firstMonday = mondayOf(year.start) ?? year.start;
  const lastMonday = mondayOf(year.end) ?? year.end;
  const anchorInside =
    year.anchorMonday >= firstMonday && year.anchorMonday <= lastMonday;

  return card(
    "When the year runs",
    "The first and last teaching day. Weeks are clipped per DAY, not per week — a year that begins on a Wednesday has a first week whose Monday and Tuesday are simply not in it.",
    h(
      "div.grid2",
      null,
      field("Name", year.name, (v) => editYear((y) => void (y.name = v)), {
        note: "“2026/27”. It names the workbook and its info sheet.",
      }),
      field("First day", year.start, (v) => editYear((y) => void (y.start = v)), {
        type: "date",
      }),
      field("Last day", year.end, (v) => editYear((y) => void (y.end = v)), {
        type: "date",
      }),
      field("Time zone", year.timezone, (v) => editYear((y) => void (y.timezone = v)), {
        note: "Decides which civil day a booking falls on.",
        list: "zones",
      }),
    ),
    h(
      "datalist",
      { id: "zones" },
      ...["Europe/London", "Europe/Dublin", "Europe/Paris", "UTC"].map((z) =>
        h("option", { value: z }),
      ),
    ),
    year.start > year.end
      ? notice(
          "bad",
          "The last day is before the first. ",
          h("b", null, "Nothing will build until that is the other way round."),
        )
      : null,
    !anchorOk
      ? notice(
          "bad",
          h("b", null, "The anchor is not a Monday."),
          " A week is named by its Monday, so an anchor on any other day matches no week at all and the whole cycle falls back to the rule — silently.",
        )
      : !anchorInside
        ? notice(
            "warn",
            h("b", null, "The anchor sits outside the year."),
            " The walk starts from the nearest end instead, which phase-shifts every week.",
          )
        : null,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CYCLE
   ══════════════════════════════════════════════════════════════════════════ */

function cycle(year: SchoolYear): HTMLElement {
  const labels = yearWeekLabels(year);
  const taught = year.taughtWeekdays ?? [...TEACHING_WEEKDAYS];

  const labelFields = Array.from({ length: year.cycleLength }, (_v, i) =>
    field(
      `Week ${i + 1} is called`,
      /* ⚠️ `cycleWeekLabel` AND NOT `weekLabels[i]`. Widening a two-week cycle
         to three leaves `weekLabels` SHORT of `cycleLength`, so the third week
         has no stored name at all and needs a printable one rather than a
         borrowed one. */
      cycleWeekLabel(labels, i, year.cycleLength),
      (v) =>
        editYear((y) => {
          const next = [...(y.weekLabels ?? defaultWeekLabels(y.cycleLength))];
          while (next.length < y.cycleLength) next.push("");
          next[i] = v;
          y.weekLabels = next;
        }),
      { placeholder: `Week ${["A", "B", "C"][i] ?? i + 1}` },
    ),
  );

  return card(
    "The week cycle",
    "Which week of the cycle each teaching week is, and what to call them.",
    h(
      "div.grid2",
      null,
      select<string>(
        "Cycle length",
        String(year.cycleLength),
        CYCLE_LENGTHS.map((n) => ({ value: String(n), label: CYCLE_LABEL[n] ?? `${n} weeks` })),
        (v) =>
          editYear((y) => {
            const n = Number(v) as CycleLength;
            y.cycleLength = n;
            /* ⚠️ TRIM ONLY, NEVER PAD. A school that narrows from three to two
               and back must find "Week C" where it left it — and `weekLabels`
               being short of `cycleLength` is a state every reader already
               handles, through `cycleWeekLabel`. */
            if (y.weekLabels && y.weekLabels.length > n) {
              y.weekLabels = y.weekLabels.slice(0, n);
            }
          }),
        "One week means every week is the same. Two is the usual A/B.",
      ),
      field(
        "Anchor Monday",
        year.anchorMonday,
        (v) => editYear((y) => void (y.anchorMonday = v)),
        {
          type: "date",
          note: "The Monday whose cycle position you are certain of. It must be a Monday.",
        },
      ),
      select<string>(
        "…and that week is",
        String(year.anchorWeekIndex),
        Array.from({ length: year.cycleLength }, (_v, i) => ({
          value: String(i),
          label: cycleWeekLabel(labels, i, year.cycleLength),
        })),
        (v) => editYear((y) => void (y.anchorWeekIndex = Number(v))),
        /* ⭐ SEPARATE FROM THE ANCHOR DATE ON PURPOSE. "We came back on the
           wrong week" is then a one-field correction rather than moving a date,
           which under `pause` re-parents the entire running count. */
        "“We came back on the wrong week” is this field, not the date.",
      ),
      select<HolidayMode>(
        "Through a holiday the cycle…",
        year.holidayMode,
        HOLIDAY_MODES.map((m) => ({ value: m.value, label: m.label })),
        (v) => editYear((y) => void (y.holidayMode = v)),
      ),
      ...labelFields,
    ),
    h(
      "div",
      { style: { marginTop: "14px" } },
      h("label.field", null, "Days the school teaches"),
      h(
        "div.row.tight",
        { style: { marginTop: "6px" } },
        ...TEACHING_WEEKDAYS.map((wd) => {
          const on = taught.includes(wd);
          return button(weekdayName(wd), {
            cls: `sm ${on ? "" : "ghost"}`,
            onclick: () =>
              editYear((y) => {
                const set = new Set(y.taughtWeekdays ?? [...TEACHING_WEEKDAYS]);
                if (set.has(wd)) set.delete(wd);
                else set.add(wd);
                /* ⚠️ A YEAR WITH NO TAUGHT DAYS IS NOT A YEAR. Refusing the
                   last one here is kinder than a workbook of empty tabs. */
                if (set.size === 0) {
                  toast("A school has to teach at least one day.", "bad");
                  return;
                }
                y.taughtWeekdays = [...set].sort((a, b) => a - b);
              }),
          });
        }),
      ),
      /* ⭐ THE PARAGRAPH, NOT THE ONE-LINER. "Pause" and "continue" sound
         interchangeable until one of them moves thirty-nine weeks, so the
         engine writes both and this is the surface that has room for the long
         one. Never re-worded here. */
      h(
        "span.note",
        { style: { display: "block", marginTop: "10px", maxWidth: "78ch" } },
        holidayModeCopy(year.holidayMode).long,
      ),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW — a calculation, drawn
   ══════════════════════════════════════════════════════════════════════════ */

function preview(year: SchoolYear): HTMLElement {
  const built = buildYear({
    yearStart: year.start,
    yearEnd: year.end,
    rule: {
      cycleLength: year.cycleLength,
      anchorMonday: year.anchorMonday,
      anchorWeekIndex: year.anchorWeekIndex,
      holidayMode: year.holidayMode,
    },
    closures: year.closures ?? [],
    pins: year.pins ?? [],
    /* ⚠️ `yearWeekLabels` AND NOT `year.weekLabels ?? []`. The empty array is
       what made this preview name the weeks `WEEK 1` / `WEEK 2` while the
       picker directly above it offered `Week A` / `Week B`. */
    weekLabels: yearWeekLabels(year),
    taughtWeekdays: year.taughtWeekdays,
  });
  const teaching = built.weeks.filter((w) => w.isTeachingWeek).length;

  const taught = year.taughtWeekdays;
  const rows = built.weeks.map((w) => {
    /* ⚠️ THE DENOMINATOR IS THE SCHOOL'S OWN WEEK, NOT FIVE. A Mon–Thu school
       carries Friday in `untaughtWeekdays` on EVERY week, so against a
       hardcoded five all thirty-nine read "partial" and the one week that
       really was short became indistinguishable from the thirty-eight that
       were not. */
    const state = weekRowState(w, taught);
    const tone = state === "closed" ? "crit" : state === "partial" ? "warn" : "";
    return h(
      "tr",
      null,
      h("td.mono", null, shortDate(w.monday)),
      h(
        "td",
        null,
        h(`span.pill${tone ? "." + tone : ""}`, null, weekBandFor(w.label)),
        /* ⭐ A PIN IS NOT A STATE. It says where the NUMBER came from; the
           state says what is ON the week, and a pinned week can perfectly well
           have a bank holiday in it. Drawn separately for that reason. */
        w.pinned ? h("span.pill.on", { style: { marginLeft: "6px" } }, "Pinned") : null,
      ),
      h("td.dim.tiny", null, weekStateNote(state, w, taught) ?? ""),
    );
  });

  return card(
    "The year, resolved",
    `${built.weeks.length} weeks, ${teaching} of them teaching. This is a calculation from the rule above and from the closures — it is never stored, so it cannot go stale.`,
    built.capped
      ? notice(
          "warn",
          h("b", null, `The year hit ${MAX_WEEKS_PER_CALENDAR} weeks.`),
          " Weeks may be missing from the end of it, and the workbook will say so on its info sheet.",
        )
      : null,
    !built.contiguous
      ? notice(
          "warn",
          h("b", null, "The week map has a gap in it."),
          " Under “pause” holidays that changes the cycle week of everything after the gap — check the closures before relying on this.",
        )
      : null,
    h(
      "div.tablewrap",
      { style: { marginTop: "12px", maxHeight: "44vh" } },
      h(
        "table.list",
        null,
        h(
          "thead",
          null,
          h("tr", null, h("th", null, "Week beginning"), h("th", null, "Cycle"), h("th", null, "Note")),
        ),
        h("tbody", null, ...rows),
      ),
    ),
    h(
      "div.row",
      { style: { marginTop: "14px", justifyContent: "flex-end" } },
      button("Delete this year", {
        icon: "trash",
        cls: "danger sm",
        onclick: () =>
          confirmDialog(
            `Delete ${year.name}?`,
            `Its closures, its day shape, its templates and every week change in it go with it. ${
              (year.templates ?? []).length
            } template cells and ${(year.weekChanges ?? []).length} week changes. Nothing else in the file is touched.`,
            "Delete the year",
            () => {
              edit((next) => {
                next.years = next.years.filter((y) => y.id !== year.id);
              });
              setYearId(null);
              toast(`${year.name} deleted.`);
            },
          ),
      }),
    ),
  );
}
