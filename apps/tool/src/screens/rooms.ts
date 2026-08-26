/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ROOM LISTS — the printed columns, and the admin's own facts under them
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam's real workbook carries "No of PCs", "Teacher" and "Telephone" under the
 * room codes. Those are not built in: a school defines its own columns, and
 * `kind` decides whether "33" lands in the cell as a NUMBER or as text.
 *
 * ⚠️ AND THE COERCION IS `numericValue()`, NOT `Number()`. `Number()` reads
 * "0x10" as 16 and "1e3" as 1000; a room whose Telephone says `0x10` prints
 * `0x10`, because a school types what it types. The preview column below asks
 * the engine rather than guessing.
 *
 * ⭐ A ROOM LIST IS SCHOOL-LEVEL, NOT YEAR-LEVEL, because the estate belongs
 * to the school — a minibus sheet and an IT-room sheet are two of these, not
 * two years. The year says which one it prints.
 */

import {
  numericValue,
  MAX_CUSTOM_FIELDS,
  MAX_ROOMS_PER_SHEET,
  type SchoolField,
  type SchoolRoom,
  type SchoolRoomSheet,
} from "../engine";
import { button, card, h, notice } from "../dom";
import { confirmDialog, toast } from "../ui";
import { doc, edit, editYear, newId, yearNow } from "../store";

export function roomsScreen(): HTMLElement {
  const d = doc();
  const year = yearNow();
  /* ⚠️ "THE FIRST ONE" IS THE FORMAT'S OWN DEFAULT for a year with no
     `roomSheetId`, so it is what the picker has to show — not the first one
     the app happens to have created. */
  const sheetId = year?.roomSheetId ?? d.roomSheets[0]?.id;
  const sheet = d.roomSheets.find((s) => s.id === sheetId) ?? d.roomSheets[0];

  if (!sheet) {
    return h(
      "div.stack",
      null,
      card(
        "No room list",
        null,
        h(
          "div.empty",
          null,
          h("b", null, "Every file has at least one room list"),
          "This one has none, which should not be possible. Start a new file.",
        ),
      ),
    );
  }

  return h(
    "div.stack",
    null,
    picker(sheet),
    fieldsCard(sheet),
    roomsCard(sheet),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WHICH LIST
   ══════════════════════════════════════════════════════════════════════════ */

function picker(sheet: SchoolRoomSheet): HTMLElement {
  const d = doc();
  const year = yearNow();
  return card(
    "Room lists",
    "The estate belongs to the school, so these sit outside the years. Each year prints one of them.",
    h(
      "div.row",
      null,
      h(
        "select",
        {
          style: { width: "auto", minWidth: "180px" },
          onchange: (e: Event) => {
            const id = (e.target as HTMLSelectElement).value;
            /* ⭐ WRITING IT ON THE YEAR IS THE ONLY WAY TO SELECT ONE. There
               is no app-level "current sheet": which list a year prints is
               part of the file, so switching here really does change the
               workbook, and the label says so. */
            editYear((y) => void (y.roomSheetId = id));
          },
        },
        ...d.roomSheets.map((s) =>
          h("option", { value: s.id, selected: s.id === sheet.id }, s.name || "Untitled list"),
        ),
      ),
      h(
        "input",
        {
          type: "text",
          value: sheet.name,
          placeholder: "IT Rooms",
          style: { width: "220px" },
          onchange: (e: Event) => {
            const v = (e.target as HTMLInputElement).value;
            edit((next) => {
              const s = next.roomSheets.find((x) => x.id === sheet.id);
              if (s) s.name = v;
            });
          },
        },
      ),
      button("New list", {
        icon: "plus",
        cls: "sm",
        onclick: () => {
          const id = newId("sheet");
          edit((next) => {
            next.roomSheets.push({ id, name: "New list", fields: [], rooms: [] });
          });
          editYear((y) => void (y.roomSheetId = id));
        },
      }),
      d.roomSheets.length > 1
        ? button("Delete this list", {
            icon: "trash",
            cls: "sm danger",
            onclick: () =>
              confirmDialog(
                `Delete “${sheet.name}”?`,
                `${sheet.rooms.length} room${sheet.rooms.length === 1 ? "" : "s"} go with it. ⚠️ Template cells and week changes point at ROOM IDS, so anything timetabled in these rooms stops being drawn — in every year that printed this list.`,
                "Delete the list",
                () => {
                  edit((next) => {
                    next.roomSheets = next.roomSheets.filter((s) => s.id !== sheet.id);
                    /* A year pointing at a list that no longer exists falls
                       back to the first one, which is the format's own rule
                       for an absent `roomSheetId` — so it is cleared rather
                       than left dangling. */
                    for (const y of next.years) {
                      if (y.roomSheetId === sheet.id) y.roomSheetId = undefined;
                    }
                  });
                  toast(`“${sheet.name}” deleted.`);
                },
              ),
          })
        : null,
    ),
    year
      ? h(
          "p.hint",
          { style: { marginTop: "12px", marginBottom: "0" } },
          `${year.name} prints “${sheet.name}”.`,
        )
      : null,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CUSTOM FIELDS
   ══════════════════════════════════════════════════════════════════════════ */

function fieldsCard(sheet: SchoolRoomSheet): HTMLElement {
  const rows = sheet.fields.map((f, i) =>
    h(
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
            disabled: i === 0,
            title: "Move up",
            onclick: () => moveField(sheet.id, i, -1),
          }),
          button("", {
            icon: "down",
            cls: "icon",
            disabled: i === sheet.fields.length - 1,
            title: "Move down",
            onclick: () => moveField(sheet.id, i, 1),
          }),
        ),
      ),
      h(
        "td",
        null,
        h("input", {
          type: "text",
          value: f.label,
          placeholder: "No of PCs",
          onchange: (e: Event) =>
            patchField(sheet.id, f.id, (x) => {
              /* ⚠️ RENAMING IS FREE. Values are keyed on `id`, never on the
                 label, so a school can call the column whatever it likes
                 without losing a single room's data. */
              x.label = (e.target as HTMLInputElement).value;
            }),
        }),
      ),
      h(
        "td",
        null,
        h(
          "div.seg",
          null,
          ...(["text", "number"] as const).map((k) =>
            h(
              "button",
              {
                type: "button",
                "aria-pressed": String(f.kind === k),
                title:
                  k === "number"
                    ? "Lands in the cell as a number, so Excel can sort and total it."
                    : "Lands as text, exactly as typed.",
                onclick: () => patchField(sheet.id, f.id, (x) => void (x.kind = k)),
              },
              k === "number" ? "Number" : "Text",
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
          title: `Delete “${f.label}”`,
          onclick: () =>
            confirmDialog(
              `Delete “${f.label || "this column"}”?`,
              `Every room's value for it goes. ${sheet.rooms.filter((r) => r.values?.[f.id] != null).length} of ${sheet.rooms.length} rooms have one.`,
              "Delete the column",
              () =>
                edit((next) => {
                  const s = next.roomSheets.find((x) => x.id === sheet.id);
                  if (!s) return;
                  s.fields = s.fields.filter((x) => x.id !== f.id);
                  for (const r of s.rooms) {
                    if (r.values) delete r.values[f.id];
                  }
                }),
            ),
        }),
      ),
    ),
  );

  return card(
    "What to record about a room",
    "One printed row under each room code, in this order. A typical IT sheet uses “No of PCs”, “Teacher” and “Telephone”.",
    sheet.fields.length >= MAX_CUSTOM_FIELDS
      ? notice(
          "warn",
          `${sheet.fields.length} columns, at the workbook's ceiling of ${MAX_CUSTOM_FIELDS}.`,
        )
      : null,
    sheet.fields.length === 0
      ? h(
          "div.empty",
          null,
          h("b", null, "No columns yet"),
          "The room codes will print on their own, which is a perfectly good sheet. Add a column when there is something worth saying about every room.",
        )
      : h(
          "table.list",
          null,
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", { style: { width: "96px" } }, "Order"),
              h("th", null, "Label"),
              h("th", { style: { width: "180px" } }, "Kind"),
              h("th", { style: { width: "60px" } }, ""),
            ),
          ),
          h("tbody", null, ...rows),
        ),
    h(
      "div.row",
      { style: { marginTop: "14px" } },
      button("Add a column", {
        icon: "plus",
        cls: "sm",
        disabled: sheet.fields.length >= MAX_CUSTOM_FIELDS,
        onclick: () =>
          edit((next) => {
            const s = next.roomSheets.find((x) => x.id === sheet.id);
            s?.fields.push({ id: newId("f"), label: "", kind: "text" });
          }),
      }),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE ROOMS
   ══════════════════════════════════════════════════════════════════════════ */

function roomsCard(sheet: SchoolRoomSheet): HTMLElement {
  const rows = sheet.rooms.map((room, i) => roomRow(sheet, room, i));

  return card(
    "Rooms",
    "One printed column each, in this order.",
    sheet.rooms.length > MAX_ROOMS_PER_SHEET
      ? notice(
          "warn",
          h("b", null, `${sheet.rooms.length} rooms.`),
          ` The workbook prints ${MAX_ROOMS_PER_SHEET} columns per sheet — past that they will not fit the page the school prints on.`,
        )
      : null,
    sheet.rooms.length === 0
      ? h(
          "div.empty",
          null,
          h("b", null, "No rooms yet"),
          "Nothing can be exported without them: a timetable with no columns has nothing to print.",
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
                h("th", { style: { width: "130px" } }, "Code"),
                ...sheet.fields.map((f) => h("th", null, f.label || "—")),
                h("th", { style: { width: "160px" } }, "In service"),
                h("th", { style: { width: "60px" } }, ""),
              ),
            ),
            h("tbody", null, ...rows),
          ),
        ),
    h(
      "div.row",
      { style: { marginTop: "14px" } },
      button("Add a room", {
        icon: "plus",
        cls: "primary sm",
        onclick: () =>
          edit((next) => {
            const s = next.roomSheets.find((x) => x.id === sheet.id);
            s?.rooms.push({ id: newId("r"), name: "", active: true, values: {} });
          }),
      }),
    ),
  );
}

function roomRow(sheet: SchoolRoomSheet, room: SchoolRoom, index: number): HTMLElement {
  const active = room.active !== false;
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
          title: "Move left in the printed sheet",
          onclick: () => moveRoom(sheet.id, index, -1),
        }),
        button("", {
          icon: "down",
          cls: "icon",
          disabled: index === sheet.rooms.length - 1,
          title: "Move right in the printed sheet",
          onclick: () => moveRoom(sheet.id, index, 1),
        }),
      ),
    ),
    h(
      "td",
      null,
      h("input", {
        type: "text",
        value: room.name,
        placeholder: "N21",
        onchange: (e: Event) =>
          patchRoom(sheet.id, room.id, (x) => {
            x.name = (e.target as HTMLInputElement).value;
          }),
      }),
    ),
    ...sheet.fields.map((f) => fieldCell(sheet, room, f)),
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
              "aria-pressed": String(active === v),
              /* ⭐ A RETIRED ROOM KEEPS ITS COLUMN. A grid is read
                 POSITIONALLY and dropping a column moves every room to the
                 right of it — so "out of service" locks the whole column
                 instead, free periods included, which is what it means on
                 paper too. */
              title: v
                ? "Prints as normal."
                : "Keeps its column — a grid is read positionally — and every cell of it is locked, free periods included.",
              onclick: () => patchRoom(sheet.id, room.id, (x) => void (x.active = v)),
            },
            v ? "In service" : "Retired",
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
        title: `Delete ${room.name || "this room"}`,
        onclick: () => removeRoom(sheet, room),
      }),
    ),
  );
}

function fieldCell(
  sheet: SchoolRoomSheet,
  room: SchoolRoom,
  f: SchoolField,
): HTMLElement {
  const raw = room.values?.[f.id];
  const value = raw ?? "";
  /* ⚠️ THE PREVIEW ASKS THE ENGINE. `numericValue` is deliberately stricter
     than `Number()`, and this is the one place a school can see which of their
     values will land as a number before the workbook is written. */
  const asNumber = f.kind === "number" ? numericValue(value) : null;
  return h(
    "td",
    null,
    h("input", {
      type: "text",
      value,
      placeholder: f.kind === "number" ? "0" : "",
      title:
        f.kind === "number"
          ? asNumber === null
            ? value
              ? `“${value}” is not a plain number, so it prints as text.`
              : "Prints nothing."
            : `Prints as the number ${asNumber}.`
          : undefined,
      style: asNumber !== null ? { textAlign: "right" } : undefined,
      onchange: (e: Event) =>
        patchRoom(sheet.id, room.id, (x) => {
          const v = (e.target as HTMLInputElement).value;
          x.values = { ...(x.values ?? {}) };
          /* ⚠️ AN EMPTY BOX MEANS PRINT NOTHING, AND IT IS NOT "-". A school
             types "-" to mean "no teacher assigned" and that is a value
             somebody chose; inventing a placeholder puts words on a printed
             sheet nobody typed. So an empty box DELETES the key rather than
             storing "". */
          if (v === "") delete x.values[f.id];
          else x.values[f.id] = v;
        }),
    }),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WRITES
   ══════════════════════════════════════════════════════════════════════════ */

function patchField(sheetId: string, fieldId: string, mutate: (f: SchoolField) => void) {
  edit((next) => {
    const f = next.roomSheets.find((s) => s.id === sheetId)?.fields.find((x) => x.id === fieldId);
    if (f) mutate(f);
  });
}

function patchRoom(sheetId: string, roomId: string, mutate: (r: SchoolRoom) => void) {
  edit((next) => {
    const r = next.roomSheets.find((s) => s.id === sheetId)?.rooms.find((x) => x.id === roomId);
    if (r) mutate(r);
  });
}

/** ⚠️ THE FILE'S ORDER **IS** THE PRINT ORDER, for both of these. */
function moveField(sheetId: string, index: number, delta: number) {
  edit((next) => {
    const s = next.roomSheets.find((x) => x.id === sheetId);
    if (!s) return;
    const to = index + delta;
    if (to < 0 || to >= s.fields.length) return;
    const [moved] = s.fields.splice(index, 1);
    s.fields.splice(to, 0, moved);
  });
}

function moveRoom(sheetId: string, index: number, delta: number) {
  edit((next) => {
    const s = next.roomSheets.find((x) => x.id === sheetId);
    if (!s) return;
    const to = index + delta;
    if (to < 0 || to >= s.rooms.length) return;
    const [moved] = s.rooms.splice(index, 1);
    s.rooms.splice(to, 0, moved);
  });
}

/**
 * ⚠️ DELETING A ROOM TAKES ITS TIMETABLE WITH IT, and the count is said before
 * the click rather than after. Everything keyed to a room id — templates, week
 * changes, bookings, in EVERY year that prints this list — has nothing to
 * point at once the room is gone.
 *
 * ⭐ RETIRING IS ALMOST ALWAYS THE RIGHT ANSWER INSTEAD, so it is offered in
 * the same dialog: the column stays, the history stays readable, and nothing
 * can be booked in it.
 */
function removeRoom(sheet: SchoolRoomSheet, room: SchoolRoom) {
  const d = doc();
  let templates = 0;
  let changes = 0;
  let bookings = 0;
  for (const y of d.years) {
    if ((y.roomSheetId ?? d.roomSheets[0]?.id) !== sheet.id) continue;
    templates += (y.templates ?? []).filter((c) => c.roomId === room.id).length;
    changes += (y.weekChanges ?? []).filter((c) => c.roomId === room.id).length;
    bookings += (y.bookings ?? []).filter((c) => c.roomId === room.id).length;
  }
  const name = room.name || "this room";
  const cost =
    templates + changes + bookings === 0
      ? "Nothing is timetabled in it, so nothing else changes."
      : `${templates} template cell${templates === 1 ? "" : "s"}, ${changes} week change${
          changes === 1 ? "" : "s"
        } and ${bookings} booking${bookings === 1 ? "" : "s"} go with it, across every year that prints this list.`;
  confirmDialog(
    `Delete ${name}?`,
    `${cost}\n\nIf the room still exists and simply is not in use, retire it instead: the column stays where it is, its timetable stays readable, and every cell of it is locked.`,
    "Delete the room",
    () =>
      edit((next) => {
        const s = next.roomSheets.find((x) => x.id === sheet.id);
        if (!s) return;
        s.rooms = s.rooms.filter((x) => x.id !== room.id);
        for (const y of next.years) {
          y.templates = (y.templates ?? []).filter((c) => c.roomId !== room.id);
          y.weekChanges = (y.weekChanges ?? []).filter((c) => c.roomId !== room.id);
          y.bookings = (y.bookings ?? []).filter((c) => c.roomId !== room.id);
        }
      }),
  );
}
