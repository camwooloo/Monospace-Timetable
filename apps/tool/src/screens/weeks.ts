/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ ONE WEEK — the layer whose absence printed the lesson in the room it
 *  had been moved OFF
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The template is the standing week. THIS is "somebody changed one week", and
 * it is a separate layer for the same reason the workbook keeps it separate:
 * a change is a fact about ONE week, so it must not be written back into the
 * template, and the template must not be able to overwrite it.
 *
 * ── ⚠️⚠️ THE ONE RULE THAT IS EASY TO GET BACKWARDS ──────────────────────
 * **An absent `label` is the CLEARED state and is NOT an empty string.** It
 * means "this lesson is not running here this week, because it moved". The
 * writer draws it empty AND refuses to link it to the template, because a
 * linked empty cell resurrects the very lesson somebody moved off it the
 * moment Excel recalculates.
 *
 * So clearing a cell here does one of two things, and which one depends on
 * what is underneath:
 *
 *   a template lesson underneath  →  store a row with NO label. The cell is
 *                                    CLEARED: drawn empty, never linked.
 *   nothing underneath            →  DELETE the row. There is nothing to
 *                                    suppress, and a row that suppresses
 *                                    nothing is a row that stops the cell
 *                                    following the template if one is added
 *                                    later.
 */

import {
  buildYear,
  cycleWeekLabel,
  yearWeekLabels,
  shortDate,
  todayCivil,
  weekBandFor,
  weekHasEnded,
  weekRowState,
  weekSpan,
  weekStateNote,
  mondayOf,
  type ResolvedWeek,
  type SchoolYear,
} from "../engine";
import { button, card, h, notice } from "../dom";
import { renderGrid } from "../grid";
import { confirmDialog, toast } from "../ui";
import { doc, editYear, newId, repaint, yearNow } from "../store";

/** Which week is open. ⚠️ PER SESSION, NOT IN THE DOCUMENT — see `templates`. */
let activeMonday: string | null = null;

export function weeksScreen(): HTMLElement {
  const d = doc();
  const year = yearNow();
  if (!year) return missing("Weeks belong to a year", "Add an academic year first.");

  const sheet =
    d.roomSheets.find((s) => s.id === (year.roomSheetId ?? d.roomSheets[0]?.id)) ??
    d.roomSheets[0];
  if (!sheet || sheet.rooms.length === 0 || year.periods.length === 0) {
    return missing(
      "Not enough to draw a week",
      "A week needs the day's shape and a room list. Set those up first.",
    );
  }

  const labels = yearWeekLabels(year);
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

  const teaching = built.weeks.filter((w) => w.isTeachingWeek);
  if (teaching.length === 0) {
    return missing(
      "No teaching weeks",
      "Every week of this year is closed. Check the closures, and the first and last day.",
    );
  }

  /* ⭐ THE WEEK THE SCHOOL IS IN, NOT THE FIRST ONE. `weekHasEnded` is the
     export's own test — the same function `hideEndedWeeks` uses — so "the week
     you are in" means the same thing on this screen and in the file. */
  const todayMonday = mondayOf(todayCivil()) ?? teaching[0].monday;
  const current =
    teaching.find((w) => !weekHasEnded(w.monday, todayMonday)) ??
    teaching[teaching.length - 1];
  if (!activeMonday || !teaching.some((w) => w.monday === activeMonday)) {
    activeMonday = current.monday;
  }
  const week = teaching.find((w) => w.monday === activeMonday)!;

  const changes = (year.weekChanges ?? []).filter((c) => c.monday === week.monday);

  const grid = renderGrid({
    doc: d,
    year,
    sheet,
    mode: { kind: "week", week },
    onWrite: (roomId, weekday, periodOrdinal, label) =>
      writeWeekChange(year, week, roomId, weekday, periodOrdinal, label),
  });

  return h(
    "div.stack.wide",
    null,
    picker(year, teaching, todayMonday, labels),
    card(
      weekSpan(week.monday),
      "Type to change this week only. The standing timetable is untouched, and a cell you change here is left out of the template linking in the exported file — deliberately, because a linked cell would drag the class back to the lesson it was moved off.",
      h(
        "div.row",
        { style: { justifyContent: "space-between" } },
        h(
          "div.row.tight",
          null,
          h("span.pill.on", null, weekBandFor(week.label)),
          week.pinned ? h("span.pill", null, "Pinned by hand") : null,
          h(
            "span.mut.tiny",
            null,
            changes.length === 0
              ? "Nothing changed — this week is exactly the template."
              : `${changes.length} cell${changes.length === 1 ? "" : "s"} changed`,
          ),
        ),
        changes.length
          ? button("Reset this week to the template", {
              icon: "swap",
              cls: "sm danger",
              onclick: () =>
                confirmDialog(
                  `Reset ${weekSpan(week.monday)}?`,
                  `${changes.length} change${changes.length === 1 ? "" : "s"} go, and this week goes back to showing exactly what ${cycleWeekLabel(labels, week.cycleWeek ?? 0, year.cycleLength)} says. Bookings are not touched — a reservation is a fact about the room, not a note about the lesson.`,
                  "Reset the week",
                  () => {
                    editYear((y) => {
                      y.weekChanges = (y.weekChanges ?? []).filter(
                        (c) => c.monday !== week.monday,
                      );
                    });
                    toast("Back to the template.", "good");
                  },
                ),
            })
          : null,
      ),
      week.closedWeekdays.length
        ? notice(
            "warn",
            h("b", null, "Part of this week is closed"),
            ` — ${week.closureLabels.join(", ") || "a closure"}. Those days are drawn as bars and cannot be typed in; the week still takes its turn in the cycle.`,
          )
        : null,
    ),
    grid,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE WEEK PICKER
   ══════════════════════════════════════════════════════════════════════════ */

function picker(
  year: SchoolYear,
  teaching: ResolvedWeek[],
  todayMonday: string,
  labels: string[],
): HTMLElement {
  const changed = new Set((year.weekChanges ?? []).map((c) => c.monday));
  return card(
    "Which week",
    `${teaching.length} teaching weeks. A week with a dot has been changed by hand.`,
    h(
      "div.weeks",
      null,
      ...teaching.map((w) => {
        const ended = weekHasEnded(w.monday, todayMonday);
        const state = weekRowState(w, year.taughtWeekdays);
        return h(
          "button.weekcard",
          {
            type: "button",
            "aria-pressed": String(w.monday === activeMonday),
            title: weekStateNote(state, w, year.taughtWeekdays) ?? weekSpan(w.monday),
            style: ended ? { opacity: "0.6" } : undefined,
            onclick: () => {
              activeMonday = w.monday;
              repaint();
            },
          },
          h(
            "div.wk",
            null,
            weekBandFor(w.label),
            changed.has(w.monday)
              ? h(
                  "span",
                  {
                    style: {
                      color: "var(--accent-2)",
                      marginLeft: "5px",
                      fontSize: "15px",
                      lineHeight: "1",
                    },
                    title: "Changed by hand",
                  },
                  "•",
                )
              : null,
          ),
          h(
            "div.dt",
            null,
            shortDate(w.monday),
            state === "partial" ? " · short week" : "",
            /* ⚠️ "ENDED" IS THE EXPORT'S OWN TEST AND NOT `monday < today`.
               The week you are IN stays visible all week, which is the
               difference `weekHasEnded` encodes and the reason
               `hideEndedWeeks` does not hide the current one. */
            ended ? " · ended" : "",
          ),
        );
      }),
    ),
    h(
      "p.hint",
      { style: { marginTop: "12px", marginBottom: "0" } },
      `Cycle: ${Array.from({ length: year.cycleLength }, (_v, i) => cycleWeekLabel(labels, i, year.cycleLength)).join(" · ")}`,
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WRITING ONE CHANGE
   ══════════════════════════════════════════════════════════════════════════ */

function writeWeekChange(
  year: SchoolYear,
  week: ResolvedWeek,
  roomId: string,
  weekday: number,
  periodOrdinal: number,
  label: string,
) {
  /* What the STANDING timetable says is here — the thing a cleared cell is
     suppressing, and the thing a deleted row would let show through again. */
  const underneath = (year.templates ?? []).find(
    (c) =>
      c.roomId === roomId &&
      c.cycleWeek === week.cycleWeek &&
      c.weekday === weekday &&
      c.periodOrdinal === periodOrdinal &&
      (c.label ?? "").trim() !== "",
  );

  editYear((y) => {
    const rows = y.weekChanges ?? [];
    const at = rows.findIndex(
      (c) =>
        c.roomId === roomId &&
        c.monday === week.monday &&
        c.weekday === weekday &&
        c.periodOrdinal === periodOrdinal,
    );

    /* ── The person typed something ── */
    if (label !== "") {
      if (at >= 0) {
        const next = [...rows];
        next[at] = { ...next[at], label, changedAt: Date.now() };
        y.weekChanges = next;
      } else {
        y.weekChanges = [
          ...rows,
          {
            id: newId("wc"),
            roomId,
            monday: week.monday,
            weekday,
            periodOrdinal,
            label,
            changedAt: Date.now(),
          },
        ];
      }
      return;
    }

    /* ── The person cleared it ── */
    if (!underneath) {
      /* ⭐ NOTHING TO SUPPRESS, SO NO ROW. Keeping an empty row here would
         mean the cell stops following the template if a lesson is added to it
         later — a silent hole that appears weeks after the edit. */
      y.weekChanges = at >= 0 ? rows.filter((_c, i) => i !== at) : rows;
      return;
    }

    /* ⭐⭐ CLEARED, NOT DELETED. `label` is left ABSENT rather than set to "":
       that is the format's cleared state, it means "the lesson moved", and it
       is what makes the writer refuse to link the cell. Deleting the row would
       put the standing lesson straight back. */
    if (at >= 0) {
      const next = [...rows];
      const { label: _drop, ...rest } = next[at];
      next[at] = { ...rest, changedAt: Date.now() };
      y.weekChanges = next;
      return;
    }
    y.weekChanges = [
      ...rows,
      {
        id: newId("wc"),
        roomId,
        monday: week.monday,
        weekday,
        periodOrdinal,
        changedAt: Date.now(),
      },
    ];
  });
}

function missing(title: string, why: string): HTMLElement {
  return h(
    "div.stack",
    null,
    card(title, null, h("div.empty", null, h("b", null, title), why)),
  );
}
