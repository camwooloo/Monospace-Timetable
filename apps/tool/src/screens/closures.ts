/**
 * ══════════════════════════════════════════════════════════════════════════
 *  CLOSURES — the only thing that interrupts a year
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ THERE IS NO TERM AND NO HALF-TERM FLAG. `buildHalfTerms()` derives the
 * workbook's half-term sheet from RUNS of non-teaching weeks, so a school
 * enters its holidays once, here, and the "Half Terms" tab draws itself. Terms
 * were a second extent nested inside the year's, and a calendar that had not
 * filled the inner one taught nothing at all.
 *
 * ⭐ AND THE PINS ARE ON THIS SCREEN ON PURPOSE. A pin is the answer to "the
 * cycle came out wrong after that closure", so it belongs beside the closures
 * rather than in the year's rule — and under `pause` a pin RESEEDS THE COUNT
 * rather than being a local exception, which is the half that surprises people
 * and is therefore said on the control.
 */

import {
  buildYear,
  closureKindLabel,
  closureSpan,
  cycleWeekLabel,
  yearWeekLabels,
  isMonday,
  mondayOf,
  weekBandFor,
  CLOSURE_KINDS,
  CLOSURE_TONE,
  MAX_CLOSURES_PER_CALENDAR,
  type ClosureKind,
  type SchoolClosure,
  type SchoolWeekPin,
  type SchoolYear,
} from "../engine";
import { button, card, h, notice } from "../dom";
import { confirmDialog, toast } from "../ui";
import { editYear, newId, yearNow } from "../store";

export function closuresScreen(): HTMLElement {
  const year = yearNow();
  if (!year) return noYear();
  return h("div.stack", null, closureCard(year), pinCard(year));
}

function noYear(): HTMLElement {
  return h(
    "div.stack",
    null,
    card(
      "No year yet",
      null,
      h(
        "div.empty",
        null,
        h("b", null, "Closures belong to a year"),
        "Add an academic year first — a holiday has to be a holiday from something.",
      ),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CLOSURES
   ══════════════════════════════════════════════════════════════════════════ */

function closureCard(year: SchoolYear): HTMLElement {
  const closures = [...(year.closures ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  const backwards = closures.filter((c) => c.end < c.start);

  const rows = closures.map((c) => {
    const bad = c.end < c.start;
    return h(
      "tr",
      null,
      h(
        "td",
        null,
        h("input", {
          type: "text",
          value: c.label,
          placeholder: "Half term",
          onchange: (e: Event) =>
            patch(c.id, (x) => void (x.label = (e.target as HTMLInputElement).value)),
        }),
      ),
      h(
        "td",
        null,
        h(
          "select",
          {
            onchange: (e: Event) =>
              patch(
                c.id,
                (x) => void (x.kind = (e.target as HTMLSelectElement).value as ClosureKind),
              ),
          },
          ...CLOSURE_KINDS.map((k) =>
            h("option", { value: k.value, selected: k.value === c.kind }, k.label),
          ),
        ),
      ),
      h(
        "td",
        null,
        h("input", {
          type: "date",
          value: c.start,
          onchange: (e: Event) =>
            patch(c.id, (x) => void (x.start = (e.target as HTMLInputElement).value)),
        }),
      ),
      h(
        "td",
        null,
        h("input", {
          type: "date",
          value: c.end,
          onchange: (e: Event) =>
            patch(c.id, (x) => void (x.end = (e.target as HTMLInputElement).value)),
        }),
      ),
      /**
       * ⚠️⚠️ A BACKWARDS RUN IS APPLIED, NOT IGNORED, AND THIS COLUMN HAS TO
       * SAY SO.
       *
       * `toRanges()` in the engine normalises a reversed range to
       * `[min(start,end), max(start,end)]` on purpose — its own comment: "a
       * bursar who typed the end date into the start box should see a wrong
       * week, not a silently missing one". So the row IS in force, spanning
       * the two dates the other way round.
       *
       * This cell used to read `Ends before it starts` and nothing else, which
       * reads as "this row is invalid" — i.e. inert. Measured: one closure
       * typed `26 Oct → 7 Sep` closed the first SEVEN weeks of the year and
       * dropped seven week sheets out of the workbook, while the year preview
       * two clicks away just quietly said "38 of them teaching" and this cell
       * implied nothing had happened. Naming the span it is actually read as
       * is what turns that into a typo somebody can see.
       */
      h(
        "td.dim.tiny",
        null,
        bad
          ? h(
              "div.row.tight",
              null,
              h("span.pill.crit", null, "Dates are the wrong way round"),
              h(
                "span",
                { style: { marginLeft: "6px" } },
                `Read as ${closureSpan(c.end, c.start)} — it is in force.`,
              ),
            )
          : h(
              "span",
              { class: `pill ${CLOSURE_TONE[c.kind]}` },
              closureSpan(c.start, c.end),
            ),
      ),
      h(
        "td.act",
        null,
        button("", {
          icon: "trash",
          cls: "icon danger",
          title: `Delete “${c.label || closureKindLabel(c.kind)}”`,
          onclick: () =>
            editYear((y) => {
              y.closures = (y.closures ?? []).filter((x) => x.id !== c.id);
            }),
        }),
      ),
    );
  });

  return card(
    "Closures",
    "Every run of closed days, inclusive at both ends — a single INSET day has the same date twice. There is no “term”: a run of whole closed weeks IS a half term, and the workbook draws its Half Terms tab from these.",
    closures.length >= MAX_CLOSURES_PER_CALENDAR
      ? notice(
          "warn",
          `This year holds ${closures.length} closures, at the engine's ceiling of ${MAX_CLOSURES_PER_CALENDAR}. Weeks past it stop being resolved.`,
        )
      : null,
    /* ⚠️ LOUD, BECAUSE THE ROW IS IN FORCE. See the Effect cell's banner: a
       reversed run is normalised and applied, so the damage is real weeks
       missing from the workbook, and the only other thing that mentions it is
       one dim line at the end of a table row. */
    backwards.length
      ? notice(
          "bad",
          h(
            "b",
            null,
            backwards.length === 1
              ? "One closure has its dates the wrong way round. "
              : `${backwards.length} closures have their dates the wrong way round. `,
          ),
          "They are still in force — a run entered backwards is read from the earlier date to the later one, not ignored — so they are closing ",
          h(
            "b",
            null,
            backwards
              .map((c) => `${c.label || closureKindLabel(c.kind)} (${closureSpan(c.end, c.start)})`)
              .join(", "),
          ),
          ". Swap the two dates if that is not what was meant.",
        )
      : null,
    closures.length === 0
      ? h(
          "div.empty",
          null,
          h("b", null, "No closures yet"),
          "Add the half terms, Christmas, Easter and the bank holidays. The cycle and the half-term sheet both come out of them.",
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
                h("th", null, "Name"),
                h("th", { style: { width: "150px" } }, "Kind"),
                h("th", { style: { width: "160px" } }, "From"),
                h("th", { style: { width: "160px" } }, "To (inclusive)"),
                h("th", { style: { width: "170px" } }, "Effect"),
                h("th", { style: { width: "50px" } }, ""),
              ),
            ),
            h("tbody", null, ...rows),
          ),
        ),
    h(
      "div.row",
      { style: { marginTop: "14px" } },
      button("Add a closure", { icon: "plus", cls: "primary sm", onclick: () => addClosure() }),
      ...CLOSURE_KINDS.map((k) =>
        button(k.label, {
          cls: "sm ghost",
          title: k.hint,
          onclick: () => addClosure(k.value),
        }),
      ),
    ),
    /* ⭐ THE ONE THING PEOPLE GET WRONG, SAID ON THE SCREEN THAT CAUSES IT: a
       bank holiday cancels a DAY and the week still takes its turn; a holiday
       that empties a whole week takes none. ⚠️ ONE LINE EACH — joined into a
       paragraph the four sentences read as a wall and the distinction, which is
       the only reason this text exists, is the thing that gets skipped. */
    h(
      "div",
      { style: { marginTop: "14px", display: "grid", gap: "5px" } },
      ...CLOSURE_KINDS.map((k) =>
        h(
          "p.hint",
          { style: { margin: "0" } },
          h(
            "b",
            { style: { color: "var(--text-dim)" } },
            `${k.label}: `,
          ),
          k.hint,
        ),
      ),
    ),
  );

  function patch(id: string, mutate: (c: SchoolClosure) => void) {
    editYear((y) => {
      const c = (y.closures ?? []).find((x) => x.id === id);
      if (c) mutate(c);
    });
  }

  function addClosure(kind: ClosureKind = "holiday") {
    const start = year.start;
    editYear((y) => {
      y.closures = [
        ...(y.closures ?? []),
        {
          id: newId("cl"),
          label: "",
          kind,
          start,
          /* ⚠️ INCLUSIVE, and the same date twice is a single day. Defaulting
             `end` to `start` is what makes a one-day INSET one click. */
          end: start,
        },
      ];
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PINS
   ══════════════════════════════════════════════════════════════════════════ */

function pinCard(year: SchoolYear): HTMLElement {
  const labels = yearWeekLabels(year);
  const pins = [...(year.pins ?? [])].sort((a, b) => a.monday.localeCompare(b.monday));

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
    weekLabels: labels,
    taughtWeekdays: year.taughtWeekdays,
  });

  const rows = pins.map((p) => {
    const resolved = built.weeks.find((w) => w.monday === p.monday);
    const notAMonday = !isMonday(p.monday);
    const notInYear = !resolved;
    return h(
      "tr",
      null,
      h(
        "td",
        null,
        h("input", {
          type: "date",
          value: p.monday,
          onchange: (e: Event) => {
            const v = (e.target as HTMLInputElement).value;
            patch(p.monday, (x) => void (x.monday = v));
          },
        }),
      ),
      h(
        "td",
        null,
        h(
          "select",
          {
            onchange: (e: Event) =>
              patch(
                p.monday,
                (x) => void (x.cycleWeek = Number((e.target as HTMLSelectElement).value)),
              ),
          },
          ...Array.from({ length: year.cycleLength }, (_v, i) =>
            h(
              "option",
              { value: String(i), selected: i === p.cycleWeek },
              cycleWeekLabel(labels, i, year.cycleLength),
            ),
          ),
        ),
      ),
      h(
        "td",
        null,
        h("input", {
          type: "text",
          value: p.reason ?? "",
          placeholder: "Why (optional)",
          onchange: (e: Event) =>
            patch(p.monday, (x) => {
              const v = (e.target as HTMLInputElement).value.trim();
              x.reason = v || undefined;
            }),
        }),
      ),
      h(
        "td.dim.tiny",
        null,
        notAMonday
          ? /* ⚠️ A PIN ON ANY OTHER DAY MATCHES NO WEEK AND DOES NOTHING AT
               ALL. Silence is the failure mode this line exists to break. */
            h("span.pill.crit", null, "Not a Monday — does nothing")
          : notInYear
            ? h("span.pill.warn", null, "Not a week in this year")
            : h("span.pill.on", null, weekBandFor(resolved!.label)),
      ),
      h(
        "td.act",
        null,
        button("", {
          icon: "trash",
          cls: "icon danger",
          title: "Remove this pin",
          onclick: () =>
            editYear((y) => {
              y.pins = (y.pins ?? []).filter((x) => x.monday !== p.monday);
            }),
        }),
      ),
    );
  });

  return card(
    "Pinned weeks",
    "Force one week's place in the cycle when the rule and the register disagree.",
    notice(
      "warn",
      h("b", null, "Under “pause”, a pin reseeds the count."),
      " It is not a local exception: every week after a pinned one is answered from the pin, not from the anchor. Under “carry on through holidays” it changes only the week it names.",
    ),
    pins.length === 0
      ? h(
          "div.empty",
          null,
          h("b", null, "No pins — and that is the normal state"),
          "Set one only when a week really did run as the other side of the cycle. Correcting the anchor is usually the right fix instead.",
        )
      : h(
          "div.tablewrap",
          { style: { marginTop: "12px" } },
          h(
            "table.list",
            null,
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", { style: { width: "170px" } }, "Week beginning"),
                h("th", { style: { width: "160px" } }, "Is"),
                h("th", null, "Reason"),
                h("th", { style: { width: "190px" } }, "Effect"),
                h("th", { style: { width: "50px" } }, ""),
              ),
            ),
            h("tbody", null, ...rows),
          ),
        ),
    h(
      "div.row",
      { style: { marginTop: "14px" } },
      button("Pin a week", {
        icon: "plus",
        cls: "sm",
        onclick: () => {
          const monday = mondayOf(year.start) ?? year.start;
          if ((year.pins ?? []).some((p) => p.monday === monday)) {
            toast("That week is already pinned. Change the one that is there.", "bad");
            return;
          }
          editYear((y) => {
            y.pins = [...(y.pins ?? []), { monday, cycleWeek: 0 } as SchoolWeekPin];
          });
        },
      }),
      pins.length
        ? button("Clear every pin", {
            icon: "eraser",
            cls: "sm danger",
            onclick: () =>
              confirmDialog(
                "Clear every pin?",
                `${pins.length} pinned week${pins.length === 1 ? "" : "s"} go, and the whole year is answered from the anchor again. Under “pause” that can move every week after the first pin.`,
                "Clear them",
                () => editYear((y) => void (y.pins = [])),
              ),
          })
        : null,
    ),
  );

  function patch(monday: string, mutate: (p: SchoolWeekPin) => void) {
    editYear((y) => {
      const p = (y.pins ?? []).find((x) => x.monday === monday);
      if (p) mutate(p);
    });
  }
}
