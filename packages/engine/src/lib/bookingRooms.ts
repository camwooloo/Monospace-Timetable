/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ROOM SHEET'S VOCABULARY AND CEILINGS — PURE, AND SHARED WITH THE UI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No `_generated` imports, so the client can import it across the fence the
 * same way `convex/lib/itemCatalog.ts` and `convex/lib/timetable.ts` are
 * imported: Convex cannot import from `src/`, but `src/` can import from
 * `convex/lib/`. One table of caps and labels, so the number the mutation
 * refuses at and the number the form warns at cannot drift apart.
 *
 * ── ⚠️ THE ONE RULE THIS FILE EXISTS TO HOLD ─────────────────────────────
 * ABSENT IS NOT "-". The real workbook this feature was built from types "-"
 * in the Teacher row for the three rooms that have no teacher assigned — that
 * is a VALUE somebody chose, and it prints. A room with NO VALUE prints
 * NOTHING. Inventing a placeholder for the empty case ("—", "N/A", "n/a")
 * would collide with a value a school already uses and would put words on a
 * printed sheet that nobody typed.
 *
 * `normaliseFieldValue` is the whole enforcement: it returns `undefined` for
 * blank input, and callers DELETE the key rather than storing "". Storing an
 * empty string and storing nothing print identically, and keeping both would
 * be a distinction with no meaning that some future reader would try to give
 * one.
 */

import {
  MAX_ROOMS_PER_SHEET,
  MAX_CUSTOM_FIELDS,
} from "./timetableSheet";

/* ══════════════════════════════════════════════════════════════════════════
   CEILINGS — every read in convex/bookingRooms.ts is bounded by one of these
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ Rooms across one sheet — TAKEN FROM THE EXPORT WRITER'S OWN CEILING and
 * not chosen again here.
 *
 * `convex/lib/timetableSheet.ts` bounds a workbook at `MAX_ROOMS_PER_SHEET`
 * because every room costs a Convex round trip per cycle week to fetch its
 * template, on a deployment already over its plan limits. If the setup screen
 * let an admin put more rooms on a list than the exporter will draw, the
 * printed sheet would be SILENTLY SHORT — the failure nobody notices until a
 * teacher looks for a room that is not on the page. One number, imported.
 */
export const MAX_ROOMS_PER_SET = MAX_ROOMS_PER_SHEET;
/** Fact rows under the room header — the same constant the writer lays out
 *  the header band with. The workbook uses three. */
export const MAX_FIELDS_PER_SET = MAX_CUSTOM_FIELDS;
/** The school's whole catalogue of facts, across every sheet. */
export const MAX_FIELDS_PER_ORG = 12;
/** Sheets per school — IT rooms, science labs, minibuses, the halls. */
export const MAX_ROOM_SETS_PER_ORG = 20;

/** Bookable resources offered in the "add a room" picker. */
export const MAX_ROOM_CHOICES = 200;
/** Inventory places offered in the same picker. */
export const MAX_LOCATION_CHOICES = 200;
/**
 * How many resources a field DELETION sweeps looking for stale values.
 * ⚠️ Correctness does not depend on finishing: a value whose definition is
 * gone is invisible, because every reader joins through the field list. This
 * is hygiene, and a bounded sweep that stops is better than an unbounded one
 * that fails the transaction.
 */
export const MAX_VALUE_SWEEP = 500;

/** Rooms added from Inventory in one call — each may create a resource. */
export const MAX_ROOMS_PER_ADD = 25;

/* ══════════════════════════════════════════════════════════════════════════
   LENGTHS
   ══════════════════════════════════════════════════════════════════════════ */

export const MAX_SET_NAME = 60;
export const MAX_FIELD_LABEL = 40;
/**
 * A value is a cell in a printed grid eighteen characters wide. "DLD/HKO" is
 * the longest in the source workbook. Sixty leaves room for a full name and
 * refuses a paragraph, which would silently ruin the column width for every
 * other room on the sheet.
 */
export const MAX_FIELD_VALUE = 60;
export const MAX_ROOM_NAME = 80;

/* ══════════════════════════════════════════════════════════════════════════
   THE TWO KINDS, AND THE THREE SOURCES
   ══════════════════════════════════════════════════════════════════════════ */

export const FIELD_KINDS = ["text", "number"] as const;
export type RoomFieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_KIND_LABEL: Record<RoomFieldKind, string> = {
  text: "Text",
  number: "Number",
};

/** ⚠️ Says "aligned" and not "validated", because it is not validated — see
 *  the `kind` comment in convex/schema.ts. A number field still accepts "-". */
export const FIELD_KIND_HINT: Record<RoomFieldKind, string> = {
  text: "Anything — initials, a name, a note. Left-aligned.",
  number: "Right-aligned and exported as a number when it is one. “-” is still allowed, because a school writes it.",
};

export const FIELD_SOURCES = [
  "manual",
  "locationCode",
  "locationCapacity",
] as const;
export type RoomFieldSource = (typeof FIELD_SOURCES)[number];

export const FIELD_SOURCE_LABEL: Record<RoomFieldSource, string> = {
  manual: "Typed in",
  locationCode: "Room code, from Inventory",
  locationCapacity: "Capacity, from Inventory",
};

export const FIELD_SOURCE_HINT: Record<RoomFieldSource, string> = {
  manual: "Somebody fills it in per room. The only option for a fact the register does not hold — there is no telephone extension in Inventory.",
  locationCode:
    "Read from the linked place every time it is drawn, never copied. Rooms that are not linked to a place print blank.",
  locationCapacity:
    "Read from the linked place every time it is drawn, never copied. Rooms that are not linked to a place print blank.",
};

export function isFieldKind(value: string): value is RoomFieldKind {
  return (FIELD_KINDS as readonly string[]).includes(value);
}

export function isFieldSource(value: string): value is RoomFieldSource {
  return (FIELD_SOURCES as readonly string[]).includes(value);
}

/** A bound field is drawn read-only and resolved from the estate per room. */
export function isDerived(source: RoomFieldSource): boolean {
  return source !== "manual";
}

/* ══════════════════════════════════════════════════════════════════════════
   THE VALUE RULES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ Trim, cap, and turn blank into ABSENT.
 *
 * `undefined` out means DELETE THE KEY. It does not mean "leave it alone" and
 * it does not mean "store an empty string" — see the header. Callers must
 * treat the two branches as different writes, which is why this returns
 * `undefined` rather than "".
 */
export function normaliseFieldValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_FIELD_VALUE);
}

/**
 * Does this value want a numeric cell in the exported workbook?
 *
 * Asked of the VALUE and not of the field, deliberately: a Telephone field
 * holding "-" for one room and 3514 for the rest should write a text cell for
 * the one and numeric cells for the others, which is what the source workbook
 * actually contains. A field-level answer would have to pick one and be wrong
 * for the other.
 */
export function numericValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  /* `Number("")` is 0 and `Number(" ")` is 0 — both already excluded above.
     `Number("0x10")` is 16, which is not a number a school typed, so require
     a plain decimal. */
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Quoted to the admin above the value grid, so the "-" rule is stated where
 *  somebody is about to type one rather than only in this file. */
export const BLANK_VALUE_NOTE =
  "Leave a box empty and that room prints blank. If you want the sheet to say something for a room that has none — most schools type “-” — type it: it is a value like any other, and it is kept exactly as you write it.";

/** Shown under the room list. It is the sentence that stops somebody assuming
 *  a sheet is a permission. */
export const SHEET_IS_A_VIEW_NOTE =
  "A room list decides what prints. It does not change who may book a room or who runs it — putting a minibus on this sheet gives nobody a minibus.";
