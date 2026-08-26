/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ THE PRESETS — the whole "different layouts" feature, as one table
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A rota is a list, a cadence, a quota and a set of columns. Everything that
 * makes a fire-door check look different from an IT room check is the COLUMN
 * SET and the noun — so a preset is data, not code, and there is no layout
 * engine anywhere. Adding "Fridge temperature" is a row in this file.
 *
 * ⚠️ A PRESET IS A STARTING POINT, NOT A MODE. Applying one writes its columns,
 * cadence, quota and noun into the rota and then forgets it was ever involved
 * — `SchoolRota.preset` is a LABEL, not a live link. If it were live, editing a
 * column would either silently fail or silently promote the rota to "custom",
 * and every school that changed one word of one heading would be asking which
 * of the two happened.
 *
 * ⚠️ IDS ARE STORED. `preset` goes into the saved file and is printed on the
 * items sheet, so an id here is permanent: rename the `label` freely, never the
 * `id`. Retiring one means leaving it readable, exactly as the timetable's
 * legacy sidebar ids work in Monospace.
 *
 * ── ⭐ WHY EVERY PRESET ENDS WITH "Checked by / Date" ────────────────────
 * Because the sheet is a legal-ish record before it is a convenience. A fire
 * door that was checked but by nobody, on no date, is not evidence of
 * anything, and the one thing every school's paper version already has in
 * common is those two columns at the right-hand end. `person` and `date` are
 * their own kinds so the workbook can widen and format them without matching
 * on a heading string.
 *
 * ⚠️ `daily` EXISTS IN THE CADENCE UNION AND IS NOT USABLE YET. The workbook is
 * one row per period with a date column, so a daily rota over a year is 195
 * rows and reads fine — but the fridge-temperature shape people actually want
 * is a month per sheet with the days across. `FRIDGE` is here so the vocabulary
 * is settled; `rotaWorkbook` prints it as rows like everything else.
 */

import type { RotaCadence, RotaColumn } from "./rota";

export type RotaPreset = {
  id: string;
  label: string;
  /** What one row of the list IS. Drives the items sheet name and the lead
   *  column heading — "Room(s) to Check", "Extinguisher(s) to Check". */
  noun: string;
  blurb: string;
  cadence: RotaCadence;
  /** Weight-units per period. ⚠️ NOT "number of items": two half-weight items
   *  fill one unit between them, which is the whole point of the weights. */
  quota: number;
  /** The line printed under the title. Written in the school's voice, because
   *  it is the first thing a member of staff picking up the clipboard reads. */
  subtitle: string;
  columns: RotaColumn[];
};

const CHECKED_BY: RotaColumn = { id: "by", label: "Checked By", kind: "person" };
const DATE: RotaColumn = { id: "date", label: "Date Checked", kind: "date" };
const NOTES: RotaColumn = { id: "notes", label: "Notes", kind: "text" };

export const ROTA_PRESETS: readonly RotaPreset[] = [
  {
    id: "it-rooms",
    label: "IT room check",
    noun: "Room",
    blurb: "Rooms cleaned on a rolling turn, with damage reported as it is found.",
    cadence: "weekly",
    quota: 2,
    subtitle:
      "Rooms checked each week: cleaned, and any damaged items (keyboards, mice etc.) reported.",
    columns: [
      { id: "cleaned", label: "Cleaned (Y/N)", kind: "tick" },
      { id: "found", label: "Damage Found (Y/N)", kind: "tick", width: 13 },
      { id: "reported", label: "Damage Reported (Y/N)", kind: "tick", width: 14 },
      CHECKED_BY,
      DATE,
      NOTES,
    ],
  },
  {
    id: "extinguishers",
    label: "Fire extinguisher",
    noun: "Extinguisher",
    blurb: "The monthly visual: in place, sealed, in the green.",
    cadence: "monthly",
    quota: 4,
    subtitle:
      "Monthly visual inspection. This does not replace the annual service by a competent person.",
    columns: [
      { id: "present", label: "In Place (Y/N)", kind: "tick" },
      { id: "seal", label: "Seal Intact (Y/N)", kind: "tick", width: 13 },
      { id: "pressure", label: "Pressure OK (Y/N)", kind: "tick", width: 13 },
      { id: "access", label: "Access Clear (Y/N)", kind: "tick", width: 14 },
      CHECKED_BY,
      DATE,
      NOTES,
    ],
  },
  {
    id: "fire-doors",
    label: "Fire door",
    noun: "Door",
    blurb: "Closes onto the latch, seals unbroken, signage on.",
    cadence: "termly",
    quota: 6,
    subtitle: "Each door: released from fully open, it must close onto the latch unaided.",
    columns: [
      { id: "closes", label: "Closes Fully (Y/N)", kind: "tick", width: 13 },
      { id: "seals", label: "Seals Intact (Y/N)", kind: "tick", width: 13 },
      { id: "gaps", label: "Gap ≤ 4mm (Y/N)", kind: "tick", width: 13 },
      { id: "signage", label: "Signage (Y/N)", kind: "tick" },
      { id: "held", label: "Held Open?", kind: "text", width: 14 },
      CHECKED_BY,
      DATE,
      NOTES,
    ],
  },
  {
    id: "minibus",
    label: "Minibus walk-round",
    noun: "Vehicle",
    blurb: "The weekly walk-round: mileage, fuel, tyres, lights, defects.",
    cadence: "weekly",
    quota: 1,
    subtitle:
      "Weekly walk-round check. Any defect found must be reported before the vehicle is next used.",
    columns: [
      { id: "odometer", label: "Odometer", kind: "number", width: 12 },
      { id: "fuel", label: "Fuel", kind: "text", width: 10 },
      { id: "tyres", label: "Tyres OK (Y/N)", kind: "tick", width: 12 },
      { id: "lights", label: "Lights OK (Y/N)", kind: "tick", width: 12 },
      { id: "fluids", label: "Fluids OK (Y/N)", kind: "tick", width: 12 },
      { id: "defects", label: "Defects Reported", kind: "text", width: 26 },
      CHECKED_BY,
      DATE,
    ],
  },
  {
    id: "pat",
    label: "PAT testing",
    noun: "Appliance",
    blurb: "Portable appliances, tested and dated, with the next one due.",
    cadence: "termly",
    quota: 10,
    subtitle: "Portable appliance testing. Record the result and when the next test falls due.",
    columns: [
      { id: "result", label: "Pass / Fail", kind: "text", width: 12 },
      { id: "nextdue", label: "Next Due", kind: "date" },
      { id: "tester", label: "Tester", kind: "person" },
      DATE,
      NOTES,
    ],
  },
  {
    id: "legionella",
    label: "Legionella flush",
    noun: "Outlet",
    blurb: "Little-used outlets run off weekly, with the temperature taken.",
    cadence: "weekly",
    quota: 4,
    subtitle:
      "Little-used outlets run for the recorded time. Take the temperature after it has stabilised.",
    columns: [
      { id: "flushed", label: "Flushed (Y/N)", kind: "tick", width: 12 },
      { id: "minutes", label: "Minutes Run", kind: "number", width: 12 },
      { id: "temp", label: "Temp", kind: "temperature", width: 10 },
      CHECKED_BY,
      DATE,
      NOTES,
    ],
  },
  {
    id: "fridge-temps",
    label: "Fridge temperature",
    noun: "Fridge",
    blurb: "Daily temperatures, in range or acted on.",
    cadence: "daily",
    quota: 2,
    subtitle: "Daily temperature check. Anything out of range needs an action recording beside it.",
    columns: [
      { id: "temp", label: "Temp", kind: "temperature", width: 10 },
      { id: "inrange", label: "In Range (Y/N)", kind: "tick", width: 12 },
      { id: "action", label: "Action Taken", kind: "text", width: 26 },
      CHECKED_BY,
      DATE,
    ],
  },
  {
    id: "blank",
    label: "Blank rota",
    noun: "Item",
    blurb: "Three columns and nothing assumed. Build your own from here.",
    cadence: "weekly",
    quota: 1,
    subtitle: "",
    columns: [CHECKED_BY, DATE, NOTES],
  },
];

export const rotaPreset = (id: string | undefined): RotaPreset | null =>
  ROTA_PRESETS.find((p) => p.id === id) ?? null;

/**
 * ⚠️ `structuredClone` AND NOT THE ROW ITSELF. `ROTA_PRESETS` is module state
 * shared by every rota in the document; handing out the same `columns` array
 * twice means renaming a heading on one rota renames it on the other — and on
 * the next one created, because the constant itself was edited. Measured the
 * hard way in the timetable's own period defaults.
 */
export function presetColumns(id: string | undefined): RotaColumn[] {
  const p = rotaPreset(id);
  return p ? (structuredClone(p.columns) as RotaColumn[]) : [];
}
