/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DAY — the rows of every grid, and the shape of every printed sheet
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️⚠️ `ordinal` IS THE IDENTITY AND `order` IS THE POSITION, and they are two
 * fields on purpose: templates and week changes hold the ORDINAL, so
 * reordering the day must not renumber them. Everything on this screen that
 * moves a row writes `order` and never touches `ordinal`.
 *
 * The failure when they are confused is recorded in the format: the workbook
 * prints the day in CREATION order while the screen shows the dragged order,
 * and only the file is wrong.
 *
 * ⭐ AND THE FLAG IS `isTeaching`, NEVER THE LABEL. A school that renames
 * "Break" to "Tutor" must not change what the cell is; a bookable row takes a
 * lesson and a structural row is painted across as a bar.
 */

import {
  bookableLabel,
  periodClock,
  periodPosition,
  sortPeriods,
  weekdayName,
  MAX_PERIODS_PER_CALENDAR,
  TEACHING_WEEKDAYS,
  type SchoolPeriod,
  type SchoolYear,
} from "../engine";
import { button, card, h, notice } from "../dom";
import { confirmDialog, toast } from "../ui";
import { editYear, yearNow } from "../store";

export function dayScreen(): HTMLElement {
  const year = yearNow();
  if (!year) {
    return h(
      "div.stack",
      null,
      card(
        "No year yet",
        null,
        h(
          "div.empty",
          null,
          h("b", null, "The day belongs to a year"),
          "A school really can change its day between years, so the periods are stored per year. Add a year first.",
        ),
      ),
    );
  }
  return h("div.stack", null, periodsCard(year), variantCard(year));
}

/* ══════════════════════════════════════════════════════════════════════════
   THE STANDARD DAY
   ══════════════════════════════════════════════════════════════════════════ */

function periodsCard(year: SchoolYear): HTMLElement {
  /* ⚠️ `sortPeriods` AND NOT `sort((a,b) => a.ordinal - b.ordinal)`. Every
     reader of a day sorts on `periodPosition()`, which is `order ?? ordinal`;
     a second, simpler sort here is the screen and the file disagreeing. */
  const all = sortPeriods(year.periods) as SchoolPeriod[];
  const standard = all.filter((p) => p.weekday === undefined);
  const timed = standard.filter((p) => p.start && p.end).length;
  const untimed = standard.length - timed;

  const rows = standard.map((p, i) =>
    periodRow(p, i, standard.length, year),
  );

  return card(
    "The day",
    "One row per period, in the order they run. This is the shape of every grid on screen and every sheet in the workbook.",
    year.periods.length >= MAX_PERIODS_PER_CALENDAR
      ? notice(
          "warn",
          `This year holds ${year.periods.length} periods, at the engine's ceiling of ${MAX_PERIODS_PER_CALENDAR}.`,
        )
      : null,
    timed > 0 && untimed > 0
      ? notice(
          "warn",
          h("b", null, "Some periods have times and some do not."),
          " That is allowed — but an UNTIMED period can never collide with a booking, because there is no clock on the row to compare an instant against. Times are what buy that.",
        )
      : null,
    standard.length === 0
      ? h(
          "div.empty",
          null,
          h("b", null, "No periods yet"),
          "Nothing can be exported until the day has a shape. Add registration, the lessons, break and lunch.",
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
                h("th", { style: { width: "96px" } }, "Order"),
                h("th", null, "Name"),
                h("th", { style: { width: "120px" } }, "Starts"),
                h("th", { style: { width: "120px" } }, "Ends"),
                h("th", { style: { width: "180px" } }, "Bookable"),
                h("th", { style: { width: "60px" } }, ""),
              ),
            ),
            h("tbody", null, ...rows),
          ),
        ),
    h(
      "div.row",
      { style: { marginTop: "14px" } },
      button("Add a period", {
        icon: "plus",
        cls: "primary sm",
        onclick: () => addPeriod(year, true),
      }),
      button("Add a break", {
        icon: "plus",
        cls: "sm",
        onclick: () => addPeriod(year, false),
      }),
      standard.length
        ? button("Clear the day", {
            icon: "eraser",
            cls: "sm danger",
            onclick: () =>
              confirmDialog(
                "Clear the day?",
                `All ${year.periods.length} rows go. ⚠️ Every template cell and every week change is keyed to a period ORDINAL, so the ones that pointed at these rows stop being drawn — they are still in the file, but nothing can reach them until a period with the same ordinal exists again.`,
                "Clear it",
                () => editYear((y) => void (y.periods = [])),
              ),
          })
        : null,
    ),
  );
}

function periodRow(
  p: SchoolPeriod,
  index: number,
  total: number,
  year: SchoolYear,
): HTMLElement {
  return h(
    "tr",
    null,
    h(
      "td",
      null,
      h(
        "div.row.tight",
        null,
        button("", {
          icon: "up",
          cls: "icon",
          disabled: index === 0,
          title: "Move up",
          onclick: () => move(p.ordinal, -1),
        }),
        button("", {
          icon: "down",
          cls: "icon",
          disabled: index === total - 1,
          title: "Move down",
          onclick: () => move(p.ordinal, 1),
        }),
      ),
    ),
    h(
      "td",
      null,
      h("input", {
        type: "text",
        value: p.name,
        placeholder: "Period 1",
        onchange: (e: Event) =>
          patch(p.ordinal, (x) => void (x.name = (e.target as HTMLInputElement).value)),
      }),
    ),
    h(
      "td",
      null,
      h("input", {
        type: "time",
        value: p.start ?? "",
        onchange: (e: Event) => setClock(p.ordinal, "start", (e.target as HTMLInputElement).value),
      }),
    ),
    h(
      "td",
      null,
      h("input", {
        type: "time",
        value: p.end ?? "",
        onchange: (e: Event) => setClock(p.ordinal, "end", (e.target as HTMLInputElement).value),
      }),
    ),
    h(
      "td",
      null,
      h(
        "div.seg",
        null,
        ...[true, false].map((v) =>
          h(
            "button",
            {
              type: "button",
              "aria-pressed": String(p.isTeaching === v),
              /* ⭐ THE WORDS ARE THE ENGINE'S. "Bookable" and "Structure" are
                 what the board, the grid and the workbook all call these two
                 things; a third wording here would be a fourth vocabulary. */
              onclick: () => patch(p.ordinal, (x) => void (x.isTeaching = v)),
            },
            bookableLabel(v),
          ),
        ),
      ),
    ),
    h(
      "td.act",
      null,
      button("", {
        icon: "trash",
        cls: "icon danger",
        title: `Delete “${p.name}”`,
        onclick: () => removePeriod(year, p),
      }),
    ),
  );

  function move(ordinal: number, delta: number) {
    editYear((y) => {
      /* ⭐ REWRITE `order` ACROSS THE WHOLE DAY, NEVER `ordinal`. The ordinals
         are what the templates point at; renumbering them here would move
         every lesson in the school by one row. */
      const sorted = (sortPeriods(y.periods) as SchoolPeriod[]).filter(
        (x) => x.weekday === undefined,
      );
      const at = sorted.findIndex((x) => x.ordinal === ordinal);
      const to = at + delta;
      if (at < 0 || to < 0 || to >= sorted.length) return;
      const [moved] = sorted.splice(at, 1);
      sorted.splice(to, 0, moved);
      sorted.forEach((x, i) => {
        const live = y.periods.find((q) => q.ordinal === x.ordinal);
        if (live) live.order = i;
      });
    });
  }

  function setClock(ordinal: number, which: "start" | "end", value: string) {
    patch(ordinal, (x) => {
      /* ⚠️ BOTH OR NEITHER. A period with a start and no end has a window the
         resolver cannot build, so it silently stops colliding with bookings
         while looking timed on screen. Clearing one clears the pair. */
      if (!value) {
        x.start = undefined;
        x.end = undefined;
        return;
      }
      x[which] = value;
    });
  }

  function patch(ordinal: number, mutate: (x: SchoolPeriod) => void) {
    editYear((y) => {
      const found = y.periods.find((x) => x.ordinal === ordinal);
      if (found) mutate(found);
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   A DAY THAT RUNS A DIFFERENT SHAPE
   ══════════════════════════════════════════════════════════════════════════ */

function variantCard(year: SchoolYear): HTMLElement {
  const variants = (sortPeriods(year.periods) as SchoolPeriod[]).filter(
    (p) => p.weekday !== undefined,
  );
  const byDay = new Map<number, SchoolPeriod[]>();
  for (const p of variants) {
    const list = byDay.get(p.weekday!) ?? [];
    list.push(p);
    byDay.set(p.weekday!, list);
  }

  return card(
    "A day that runs differently",
    "A Friday that finishes early, say. Rows added here REPLACE the standard day on that weekday — they do not add to it.",
    byDay.size === 0
      ? h(
          "div.empty",
          null,
          h("b", null, "Every day runs the same shape"),
          "Which is the normal case. Add a variant only when one weekday really has a different set of rows.",
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
                h("th", { style: { width: "140px" } }, "Weekday"),
                h("th", null, "Rows"),
                h("th", { style: { width: "60px" } }, ""),
              ),
            ),
            h(
              "tbody",
              null,
              ...[...byDay.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([wd, list]) =>
                  h(
                    "tr",
                    null,
                    h("td", null, weekdayName(wd)),
                    h(
                      "td.dim.tiny",
                      null,
                      list
                        .map(
                          (p) =>
                            `${p.name}${p.start && p.end ? ` (${periodClock(p.start, p.end)})` : ""}`,
                        )
                        .join(" · "),
                    ),
                    h(
                      "td.act",
                      null,
                      button("", {
                        icon: "trash",
                        cls: "icon danger",
                        title: `Remove ${weekdayName(wd)}'s own shape`,
                        onclick: () =>
                          confirmDialog(
                            `Remove ${weekdayName(wd)}'s own shape?`,
                            `${weekdayName(wd)} goes back to the standard day. ${list.length} row${list.length === 1 ? "" : "s"} are deleted.`,
                            "Remove it",
                            () =>
                              editYear((y) => {
                                y.periods = y.periods.filter((p) => p.weekday !== wd);
                              }),
                          ),
                      }),
                    ),
                  ),
                ),
            ),
          ),
        ),
    h(
      "div.row",
      { style: { marginTop: "14px" } },
      ...TEACHING_WEEKDAYS.filter((wd) => !byDay.has(wd)).map((wd) =>
        button(`${weekdayName(wd)} is different`, {
          icon: "plus",
          cls: "sm ghost",
          onclick: () => {
            const standard = (sortPeriods(year.periods) as SchoolPeriod[]).filter(
              (p) => p.weekday === undefined,
            );
            if (standard.length === 0) {
              toast("Set the standard day up first — a variant is a copy of it.", "bad");
              return;
            }
            /* ⭐ SEEDED AS A COPY OF THE STANDARD DAY. A variant starting
               empty is a weekday with no lessons at all, which is a closure
               and not a different shape — and it would silently blank that
               weekday across every grid. */
            editYear((y) => {
              let next = nextOrdinal(y);
              for (const p of standard) {
                y.periods.push({
                  ...structuredClone(p),
                  ordinal: next++,
                  weekday: wd,
                });
              }
            });
            toast(
              `${weekdayName(wd)} now has its own rows, copied from the standard day. Edit them and the other days are untouched.`,
              "good",
            );
          },
        }),
      ),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

/* `SchoolPeriod` and the engine's `PeriodDef` are the same shape on purpose —
   the format stores the day rather than deriving it — so `sortPeriods` takes
   these rows unchanged. The cast on the way back is the only ceremony. */

/**
 * ⚠️ THE NEXT FREE ORDINAL, AND IT IS `max + 1` RATHER THAN `length`.
 *
 * Deleting the middle of the day and adding a row would otherwise re-use an
 * ordinal a template cell still points at — and the new row would silently
 * inherit the deleted one's lessons across every week of the year.
 */
function nextOrdinal(y: SchoolYear): number {
  return y.periods.reduce((max, p) => Math.max(max, p.ordinal), 0) + 1;
}

function addPeriod(year: SchoolYear, isTeaching: boolean) {
  editYear((y) => {
    const ordinal = nextOrdinal(y);
    const standard = y.periods.filter((p) => p.weekday === undefined);
    const order =
      standard.reduce((max, p) => Math.max(max, periodPosition(p)), -1) + 1;
    y.periods.push({
      ordinal,
      name: isTeaching ? `Period ${standard.filter((p) => p.isTeaching).length + 1}` : "Break",
      order,
      isTeaching,
    });
  });
  void year;
}

/**
 * ⚠️ DELETING A PERIOD ORPHANS EVERYTHING KEYED TO ITS ORDINAL, and the file
 * keeps those rows. That is the format's own rule — a template cell points at
 * an ordinal — so the honest thing is to say how many, and to drop them, so a
 * later period that happens to take the same ordinal does not inherit
 * somebody else's lessons.
 */
function removePeriod(year: SchoolYear, p: SchoolPeriod) {
  const templates = (year.templates ?? []).filter(
    (c) => c.periodOrdinal === p.ordinal,
  ).length;
  const changes = (year.weekChanges ?? []).filter(
    (c) => c.periodOrdinal === p.ordinal,
  ).length;
  const cost =
    templates + changes === 0
      ? "Nothing is timetabled in it, so nothing else changes."
      : `${templates} template cell${templates === 1 ? "" : "s"} and ${changes} week change${
          changes === 1 ? "" : "s"
        } are in this row. They go with it — leaving them would let a later period that takes the same number inherit them.`;
  confirmDialog(`Delete “${p.name}”?`, cost, "Delete the period", () => {
    editYear((y) => {
      y.periods = y.periods.filter((x) => x.ordinal !== p.ordinal);
      y.templates = (y.templates ?? []).filter((c) => c.periodOrdinal !== p.ordinal);
      y.weekChanges = (y.weekChanges ?? []).filter((c) => c.periodOrdinal !== p.ordinal);
    });
  });
}
