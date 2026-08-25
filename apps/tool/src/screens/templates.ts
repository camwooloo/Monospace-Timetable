/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TEMPLATES — the school's STANDING timetable, one grid per cycle week
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ STORED PER CYCLE WEEK, NEVER MATERIALISED PER WEEK. Eight rooms on a
 * two-week cycle is sixteen grids for the whole year, and that is the entire
 * reason a three-year file stays small enough to mail.
 *
 * ⚠️ A CLEARED CELL IS A DELETED ROW HERE, and that is the opposite of what a
 * cleared WEEK CHANGE is — see `weeks.ts`. On a template there is no layer
 * underneath to be hidden, so "nothing is timetabled here" is the absence of a
 * row; on a week there is, and an absent label means "the lesson is not
 * running here this week, because it moved".
 */

import {
  cycleWeekLabel,
  yearWeekLabels,
  colourForClass,
  compareClassCodes,
  describeClassCode,
  gridClassFill,
  type SchoolYear,
} from "../engine";
import { button, card, h } from "../dom";
import { renderGrid } from "../grid";
import { closeModal, confirmDialog, openModal, toast } from "../ui";
import { doc, editYear, isDark, newId, repaint, yearNow } from "../store";

/** Which cycle week is on screen. ⚠️ PER SESSION AND NOT IN THE DOCUMENT — a
 *  shared document dirtied by the act of looking at a different tab would put
 *  "unsaved changes" on a file nobody changed. */
let activeCycleWeek = 0;

export function templatesScreen(): HTMLElement {
  const d = doc();
  const year = yearNow();
  if (!year) return missing("The templates belong to a year", "Add an academic year first.");

  const sheet =
    d.roomSheets.find((s) => s.id === (year.roomSheetId ?? d.roomSheets[0]?.id)) ??
    d.roomSheets[0];
  if (!sheet || sheet.rooms.length === 0) {
    return missing(
      "No rooms to print",
      "A timetable with no columns has nothing to draw. Set the room list up first.",
    );
  }
  if (year.periods.length === 0) {
    return missing(
      "The day has no shape yet",
      "The rows of this grid are the periods. Set the day up first.",
    );
  }

  if (activeCycleWeek >= year.cycleLength) activeCycleWeek = 0;
  const labels = yearWeekLabels(year);

  const filled = (year.templates ?? []).filter(
    (c) => c.cycleWeek === activeCycleWeek && (c.label ?? "").trim() !== "",
  );
  const total = countCells(year, sheet.rooms.length);

  const grid = renderGrid({
    doc: d,
    year,
    sheet,
    mode: { kind: "template", cycleWeek: activeCycleWeek },
    onWrite: (roomId, weekday, periodOrdinal, label) =>
      writeTemplateCell(activeCycleWeek, roomId, weekday, periodOrdinal, label),
  });

  return h(
    "div.stack.wide",
    null,
    card(
      "The standing timetable",
      "Type straight into the grid. Enter moves down the day, Tab across the rooms. Every week of the year that carries this cycle week shows exactly this — unless somebody changed that one week.",
      h(
        "div.row",
        { style: { justifyContent: "space-between" } },
        h(
          "div.row.tight",
          null,
          /* ⚠️ ONE TAB PER WEEK OF THE **CYCLE**, NOT PER STORED LABEL.
             Widening a two-week cycle to three leaves `weekLabels` short of
             `cycleLength`, so a tab list built from the labels would be one
             short of the weeks that exist. */
          ...(year.cycleLength > 1
            ? [
                h(
                  "div.seg",
                  null,
                  ...Array.from({ length: year.cycleLength }, (_v, i) =>
                    h(
                      "button",
                      {
                        type: "button",
                        "aria-pressed": String(i === activeCycleWeek),
                        onclick: () => {
                          activeCycleWeek = i;
                          /* ⚠️ `repaint()` AND NOT `edit()`. Looking at a
                             different tab is not a change to the school's
                             timetable, and routing it through `edit` would put
                             "unsaved changes" on a file nobody touched. */
                          repaint();
                        },
                      },
                      cycleWeekLabel(labels, i, year.cycleLength),
                    ),
                  ),
                ),
              ]
            : [h("span.pill", null, cycleWeekLabel(labels, 0, 1))]),
          h(
            "span.mut.tiny",
            { style: { marginLeft: "4px" } },
            `${filled.length} / ${total} filled`,
          ),
        ),
        h(
          "div.row.tight",
          null,
          year.cycleLength > 1
            ? button("Copy this week over…", {
                icon: "copy",
                cls: "sm",
                onclick: () => copyWeek(year, labels),
              })
            : null,
          filled.length
            ? button("Clear this week", {
                icon: "eraser",
                cls: "sm danger",
                onclick: () =>
                  confirmDialog(
                    `Clear ${cycleWeekLabel(labels, activeCycleWeek, year.cycleLength)}?`,
                    `${filled.length} timetabled cell${filled.length === 1 ? "" : "s"} go. Every week of the year carrying this cycle week empties with it. Week changes are NOT touched — a change is a fact about one week, not about the template.`,
                    "Clear the week",
                    () =>
                      editYear((y) => {
                        y.templates = (y.templates ?? []).filter(
                          (c) => c.cycleWeek !== activeCycleWeek,
                        );
                      }),
                  ),
              })
            : null,
        ),
      ),
    ),
    grid,
    legend(year),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WRITING ONE CELL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ A ROW EXISTS ONLY WHERE SOMETHING IS TIMETABLED.
 *
 * Clearing a template cell DELETES its row rather than storing an empty label
 * — the opposite of a week change, and deliberately so. A template has no
 * layer underneath it to hide, so an empty row would mean nothing at all while
 * still counting toward "34 / 360 filled" and still being written into the
 * file that gets mailed.
 */
export function writeTemplateCell(
  cycleWeek: number,
  roomId: string,
  weekday: number,
  periodOrdinal: number,
  label: string,
) {
  editYear((y) => {
    const rows = y.templates ?? [];
    const at = rows.findIndex(
      (c) =>
        c.roomId === roomId &&
        c.cycleWeek === cycleWeek &&
        c.weekday === weekday &&
        c.periodOrdinal === periodOrdinal,
    );
    if (label === "") {
      y.templates = at >= 0 ? rows.filter((_c, i) => i !== at) : rows;
      return;
    }
    if (at >= 0) {
      const next = [...rows];
      next[at] = { ...next[at], label };
      y.templates = next;
      return;
    }
    y.templates = [
      ...rows,
      { id: newId("t"), roomId, cycleWeek, weekday, periodOrdinal, label },
    ];
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   COPY
   ══════════════════════════════════════════════════════════════════════════ */

function copyWeek(year: SchoolYear, labels: string[]) {
  const others = Array.from({ length: year.cycleLength }, (_v, i) => i).filter(
    (i) => i !== activeCycleWeek,
  );
  const from = cycleWeekLabel(labels, activeCycleWeek, year.cycleLength);
  const source = (year.templates ?? []).filter((c) => c.cycleWeek === activeCycleWeek);

  const body = h(
    "div.row.tight",
    null,
    ...others.map((i) => {
      const to = cycleWeekLabel(labels, i, year.cycleLength);
      const destroyed = (year.templates ?? []).filter((c) => c.cycleWeek === i).length;
      return button(`Over ${to}`, {
        cls: "sm",
        title:
          destroyed === 0
            ? `${to} is empty. ${source.length} cells are written into it.`
            : `⚠️ ${destroyed} cell${destroyed === 1 ? "" : "s"} in ${to} are deleted and replaced by ${from}'s ${source.length}.`,
        onclick: () => {
          editYear((y) => {
            const kept = (y.templates ?? []).filter((c) => c.cycleWeek !== i);
            const copies = source.map((c) => ({
              ...structuredClone(c),
              /* ⚠️ A NEW ID PER COPY. Two rows sharing one id is a file whose
                 later readers cannot tell them apart, and the first thing that
                 dedupes by id would silently drop half a week. */
              id: newId("t"),
              cycleWeek: i,
            }));
            y.templates = [...kept, ...copies];
          });
          toast(`${from} copied over ${to} — ${source.length} cells.`, "good");
          closeModal();
        },
      });
    }),
  );

  /* ⭐ A PICKER RATHER THAN A CONFIRM. The destructive part is PER
     DESTINATION — how many cells this particular copy deletes — and it is said
     on each button's own tooltip, so a single "are you sure" covering all of
     them would be answering the wrong question. */
  openModal(
    `Copy ${from} over…`,
    `${source.length} cell${source.length === 1 ? "" : "s"} will be written. ⚠️ Whatever is in the destination is deleted first — this is a replace, not a merge.`,
    body,
    [button("Cancel", { cls: "ghost", onclick: closeModal })],
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE LEGEND
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every class code in the year, in the workbook's own order.
 *
 * ⚠️ `compareClassCodes` AND NOT `.sort()`. The legend's order has to be
 * deterministic and independent of the order the sheets happened to mention
 * the codes in — otherwise one workbook exported twice would list them
 * differently and look as though it had changed.
 */
function legend(year: SchoolYear): HTMLElement | null {
  const codes = new Set<string>();
  for (const c of year.templates ?? []) {
    const label = (c.label ?? "").trim();
    if (label && colourForClass(label)) codes.add(label);
  }
  for (const c of year.weekChanges ?? []) {
    const label = (c.label ?? "").trim();
    if (label && colourForClass(label)) codes.add(label);
  }
  if (codes.size === 0) return null;
  const dark = isDark();
  const sorted = [...codes].sort(compareClassCodes);

  return card(
    "Classes in this year",
    `${sorted.length} codes. The colour is a function of the code and nothing else — the same class is the same colour on this screen, in the downloaded file, and next September.`,
    h(
      "div.legend",
      null,
      ...sorted.map((code) => {
        const fill = gridClassFill(code, dark);
        return h(
          "span.chip",
          { title: describeClassCode(code) },
          h("span.sw", { style: { background: fill ?? "transparent" } }),
          h("span", { style: { color: fill ? undefined : "inherit" } }, code),
        );
      }),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function countCells(year: SchoolYear, rooms: number): number {
  const taught = year.taughtWeekdays ?? [1, 2, 3, 4, 5];
  let cells = 0;
  for (const wd of taught) {
    /* ⚠️ THE BOOKABLE ROWS ONLY. A break row is structure and can never hold a
       lesson, so counting it would make "34 / 360" a fraction of something the
       school cannot fill. */
    cells += year.periods.filter(
      (p) => p.isTeaching && (p.weekday === undefined || p.weekday === wd),
    ).length;
  }
  return cells * rooms;
}

function missing(title: string, why: string): HTMLElement {
  return h(
    "div.stack",
    null,
    card(title, null, h("div.empty", null, h("b", null, title), why)),
  );
}
