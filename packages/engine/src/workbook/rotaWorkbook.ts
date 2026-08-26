/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE ROTA WORKBOOK — two sheets, transcribed from a real school's file
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `IT_Room_Checking_Rota_2627_v2.xlsx` is the specification. Every measurement
 * below was read out of it rather than chosen: the ten column widths, the
 * 22pt title row and 30pt header row, the `ddd dd mmm yyyy` date format, the
 * three merged banner rows, the per-week merge of the first three columns, and
 * the three fills.
 *
 * ── ⚠️ WHY THIS IS A SEPARATE FILE AND NOT A MODE OF THE TIMETABLE WRITER ──
 * `timetableWorkbook.ts` is checked by `provenance.test.ts:146-191`, which
 * asserts its four documented differences from Monospace's original and its
 * section banners survive — and by `npm run gate`, which regenerates a workbook
 * with Monospace's own copy of that file and compares zip member by zip member.
 * Touching it to add a second layout would put both of those in the way of
 * every future rota change. So the ~30 lines of style primitives are
 * DELIBERATELY RE-DECLARED here rather than lifted into a shared kit: the
 * duplication is the cheaper half of that trade, and it is written down so the
 * next person does not "fix" it.
 *
 * Nothing new may go in `src/lib/` either — all nine files there are byte-pinned
 * to Monospace's `convex/lib/`.
 *
 * ── ⚠️⚠️ TWO ORDERING RULES THAT CORRUPT THE FILE SILENTLY ───────────────
 * 1. Build every row, THEN merge, THEN commit the SHEET. exceljs's streaming
 *    worksheet documents that `mergeCells` "may fail if rows have been
 *    committed" — and this sheet merges three columns per week, 138 merges in
 *    the reference file. Committing rows as you add them throws on the first
 *    merge and leaves a corrupt zip.
 * 2. `await protect()` BEFORE `commit()`. exceljs's published types say
 *    `protect()` returns `void`; it actually hashes inside a promise and
 *    assigns `sheetProtection` in the resolver. Committing first writes a
 *    silently UNPROTECTED sheet that looks exactly like a protected one.
 */

/* ⭐ TYPES ONLY — erased at compile time, so the barrel and its reader never
   enter any bundle. The VALUE comes from the deep specifier below. */
import type ExcelJS from "exceljs";
/* ⚠️ THE `.js` IS REQUIRED. Deep specifier into a package with no `exports`
   map; Node's ESM loader will not guess an extension for one. */
import WorkbookWriter from "exceljs/lib/stream/xlsx/workbook-writer.js";
import { collectSink, createSink, type ByteSink } from "./stream";
import { SHEET_GRIDLINE, sheetFills } from "../lib/timetableSheet";
import { groupingsLine, type RotaColumn, type RotaPeriod, type SchoolRota } from "../model/rota";

/* ══════════════════════════════════════════════════════════════════════════
   GEOMETRY — every number read out of the reference workbook
   ══════════════════════════════════════════════════════════════════════════ */

/** The four fixed columns before the school's own tick-list begins. The fourth
 *  is named after what is being checked — see `SchoolRota.itemNoun`. */
const LEAD_WIDTH = [5, 17, 11, 26] as const;

/** "Room" → "Room(s) to Check". Plural-by-appending-s is deliberate: it matches
 *  the reference file, and a school that wants otherwise types its own noun. */
const leadColumns = (noun: string) =>
  ["Wk", "Week Commencing", "Week", `${noun}(s) to Check`] as const;

/** "Room" → "Rooms". The items sheet's tab, and its title. */
const pluralise = (noun: string) => (noun.endsWith("s") ? noun : `${noun}s`);

const TITLE_ROW_HEIGHT = 22;
const HEADER_ROW_HEIGHT = 30;
/** The reference file's own format. `ddd` gives "Mon", which a school reads. */
const DATE_FORMAT = "ddd dd mmm yyyy";

/** Default width per column kind, when a column does not name its own. */
const KIND_WIDTH: Record<RotaColumn["kind"], number> = {
  tick: 12,
  text: 34,
  number: 11,
  date: 13,
  temperature: 12,
  person: 11,
};

/**
 * ⭐ THE TWO ALTERNATING WEEK FILLS, AND WHY THEY ARE NOT ACCENT TINTS.
 *
 * The reference workbook alternates orange `FAC090` and blue `93CDDD` by cycle
 * week, with grey for a closure. Those two are Office accent6 and accent5
 * tints — a DIFFERENT HUE from the purple everything else on the sheet is a
 * tint of — so they cannot be derived from one accent without changing what
 * that school's file looks like.
 *
 * ⚠️ SO THEY FOLLOW `sheetFills`' OWN RULE: the school's file, byte for byte,
 * while the accent is the default; derived tints once somebody customises. A
 * school that never opens Customise gets exactly the workbook it has today.
 */
const BAND_DEFAULT = "FFFAC090";
const BAND_ALT_DEFAULT = "FF93CDDD";

/** `#rrggbb` mixed `amount` of the way to white, as `FFRRGGBB`. */
function towardsWhite(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const up = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  return `FF${up(0)}${up(2)}${up(4)}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MODEL
   ══════════════════════════════════════════════════════════════════════════ */

export type RotaWorkbookModel = {
  rota: SchoolRota;
  periods: RotaPeriod[];
  /** `#rrggbb`, or absent for the school's default purple. */
  accent?: string | null;
  /**
   * ⚠️ FALSE MEANS A BLANK TEMPLATE — the tick columns print empty even where
   * somebody has already recorded a value. That is a deliberate second export
   * rather than a degraded first one: a school prints the blank one to carry
   * round on a clipboard, and the filled one for the file.
   */
  withData: boolean;
  generatedAt: number;
};

/* ══════════════════════════════════════════════════════════════════════════
   ENTRY POINTS
   ══════════════════════════════════════════════════════════════════════════ */

export async function bufferRotaWorkbook(model: RotaWorkbookModel): Promise<Uint8Array> {
  const sink = createSink();
  const collected = collectSink(sink);
  await writeRotaWorkbook(model, sink);
  return collected;
}

/* ══════════════════════════════════════════════════════════════════════════
   STYLE PRIMITIVES — re-declared here on purpose; see the banner
   ══════════════════════════════════════════════════════════════════════════ */

type StreamWorksheet = Omit<ExcelJS.Worksheet, "commit"> & {
  commit(): Promise<void>;
};

function fill(argb: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const THIN = { style: "thin" as const, color: { argb: SHEET_GRIDLINE } };

function box(): Partial<ExcelJS.Borders> {
  return { top: THIN, left: THIN, bottom: THIN, right: THIN };
}

const CENTRE: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
const LEFT: Partial<ExcelJS.Alignment> = { horizontal: "left", vertical: "middle" };

/* ══════════════════════════════════════════════════════════════════════════
   THE WRITER
   ══════════════════════════════════════════════════════════════════════════ */

async function writeRotaWorkbook(model: RotaWorkbookModel, sink: ByteSink): Promise<void> {
  const wb = new WorkbookWriter({
    /* ⚠️ THE ONE CAST, TYPE-LEVEL ONLY. exceljs types this as Node's `Stream`,
       a class no browser has; `ByteSink` is the small structural surface it
       actually calls. Same seam, same reason, as the timetable writer's. */
    stream: sink as unknown as ExcelJS.stream.xlsx.WorkbookWriterOptions["stream"],
    useStyles: true,
    useSharedStrings: false,
  });
  wb.creator = "Monospace";
  wb.created = new Date(model.generatedAt);

  /* ⭐ EACH SHEET COMMITTED BEFORE THE NEXT IS CREATED — what bounds memory to
     one sheet. Rota first: it is what a school opens the file for. */
  await writeRotaSheet(wb, model).commit();
  await writeItemsSheet(wb, model).commit();
  await wb.commit();
}

function writeRotaSheet(
  wb: InstanceType<typeof WorkbookWriter>,
  model: RotaWorkbookModel,
): StreamWorksheet {
  const { rota, periods } = model;
  const fills = sheetFills(model.accent);
  const isDefaultAccent = fills.structure === "FFCCC0DA";
  const band = isDefaultAccent ? BAND_DEFAULT : towardsWhite(model.accent || "#b1a0c7", 0.45);
  const bandAlt = isDefaultAccent ? BAND_ALT_DEFAULT : towardsWhite(model.accent || "#b1a0c7", 0.7);

  const headers = [...leadColumns(rota.itemNoun?.trim() || "Item"), ...rota.columns.map((c) => c.label)];
  const width = [...LEAD_WIDTH, ...rota.columns.map((c) => c.width ?? KIND_WIDTH[c.kind])];
  const last = headers.length;

  const ws = wb.addWorksheet("Checking Rota", {
    properties: { tabColor: { argb: fills.structureAlt } },
    /* Freeze below the header so the column names stay put over 46 weeks. The
       reference file freezes at A5 — three banner rows plus the header. */
    views: [{ state: "frozen", ySplit: 4 }],
  }) as unknown as StreamWorksheet;

  width.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  /* ── the three banner rows ──────────────────────────────────────────── */
  const title = ws.getRow(1);
  title.height = TITLE_ROW_HEIGHT;
  title.getCell(1).value = rota.name.toUpperCase();
  title.getCell(1).font = { bold: true, size: 14 };
  title.getCell(1).alignment = CENTRE;
  for (let c = 1; c <= last; c++) title.getCell(c).fill = fill(fills.structureAlt);

  const sub = ws.getRow(2);
  /* ⚠️ GENERATED, NOT TYPED. The reference file's subtitle says "Two rooms
     checked each week…" and somebody maintained that number by hand, so it
     could disagree with the quota below it. This reads the quota. */
  sub.getCell(1).value =
    rota.subtitle?.trim() ||
    `${model.periods[0]?.slots.length ?? rota.quota} ${
      (model.periods[0]?.slots.length ?? rota.quota) === 1 ? "item" : "items"
    } checked each ${cadenceWord(rota.cadence)}.`;
  sub.getCell(1).alignment = CENTRE;
  for (let c = 1; c <= last; c++) sub.getCell(c).fill = fill(fills.structure);

  const groups = ws.getRow(3);
  const line = groupingsLine(periods);
  /* Also generated — see `groupingsLine`. Blank when nothing is grouped, which
     is the normal case for a rota with no half-weight items. */
  groups.getCell(1).value = line ? `Grouped and checked together: ${line}` : "";
  groups.getCell(1).alignment = CENTRE;
  for (let c = 1; c <= last; c++) groups.getCell(c).fill = fill(fills.structure);

  /* ── the header ─────────────────────────────────────────────────────── */
  const head = ws.getRow(4);
  head.height = HEADER_ROW_HEIGHT;
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = fill(fills.structure);
    cell.alignment = { ...CENTRE, wrapText: true };
    cell.border = box();
  });

  /* ── the body ───────────────────────────────────────────────────────── */
  const merges: [number, number, number, number][] = [];
  let row = 5;

  for (const period of periods) {
    /* ⚠️ A PERIOD WITH NO SLOTS STILL PRINTS ONE ROW. That is a week the school
       is closed and the rota is skipping; dropping the row would renumber every
       week after it and make the sheet disagree with the calendar beside it. */
    const slots = period.slots.length ? period.slots : [null];
    const top = row;

    slots.forEach((slot, i) => {
      const r = ws.getRow(row);
      const shade = period.teaching
        ? (period.cycleWeek ?? 0) % 2 === 0
          ? band
          : bandAlt
        : fills.gutter;

      if (i === 0) {
        r.getCell(1).value = period.index;
        r.getCell(2).value = new Date(`${period.start}T00:00:00Z`);
        r.getCell(2).numFmt = DATE_FORMAT;
        r.getCell(3).value = period.label ?? "";
      }
      for (let c = 1; c <= 3; c++) {
        r.getCell(c).fill = fill(shade);
        r.getCell(c).alignment = CENTRE;
        r.getCell(c).border = box();
      }

      r.getCell(4).value = slot ? slot.label : "";
      r.getCell(4).alignment = LEFT;
      r.getCell(4).border = box();

      rota.columns.forEach((col, ci) => {
        const cell = r.getCell(5 + ci);
        /* ⚠️ `withData: false` PRINTS BLANK EVEN WHERE A VALUE EXISTS — the
           template export. See the model's own note. */
        const recorded =
          model.withData && slot
            ? rota.records?.[`${period.start}#${i}`]?.[col.id]
            : undefined;
        if (recorded !== undefined && recorded !== null && recorded !== "") {
          cell.value = col.kind === "number" || col.kind === "temperature" ? Number(recorded) : recorded;
          if (col.kind === "date") {
            cell.value = new Date(`${recorded}T00:00:00Z`);
            cell.numFmt = DATE_FORMAT;
          }
        }
        cell.alignment = col.kind === "text" ? LEFT : CENTRE;
        cell.border = box();
      });

      row++;
    });

    /* The first three columns span the period's rows — the reference file's
       138 merges are exactly this, three per week. */
    if (slots.length > 1) {
      for (let c = 1; c <= 3; c++) merges.push([top, c, row - 1, c]);
    }
  }

  /* ⚠️ AFTER EVERY ROW, BEFORE THE COMMIT. See ordering rule 1. */
  for (const [r1, c1, r2, c2] of merges) ws.mergeCells(r1, c1, r2, c2);

  return ws;
}

function writeItemsSheet(
  wb: InstanceType<typeof WorkbookWriter>,
  model: RotaWorkbookModel,
): StreamWorksheet {
  const { rota } = model;
  const fills = sheetFills(model.accent);

  /* The school's own fact columns, in the order the first item lists them —
     the same rule the timetable's room sheet uses for its printed rows. */
  const noun = rota.itemNoun?.trim() || "Item";
  const factKeys = [...new Set(rota.items.flatMap((i) => Object.keys(i.facts ?? {})))];

  /* ⭐ WHO EACH THING ACTUALLY SHARED A TURN WITH, read off the rota that was
     produced rather than typed into a column. The reference workbook has this
     as "Checked With" and maintained it by hand, which is how it can disagree
     with the rota on the sheet beside it. With weights the partner is derived,
     so this is the only honest way to print it — and it prints EVERY partner an
     item had, because auto-grouping does not promise one. */
  const partners = new Map<string, Set<string>>();
  for (const period of model.periods) {
    for (const slot of period.slots) {
      if (slot.itemIds.length < 2) continue;
      for (const id of slot.itemIds) {
        const set = partners.get(id) ?? new Set<string>();
        for (const other of slot.itemIds) {
          if (other !== id) set.add(rota.items.find((x) => x.id === other)?.code ?? other);
        }
        partners.set(id, set);
      }
    }
  }

  /* ⚠️ "In service" EARNS ITS COLUMN ONLY WHEN SOMETHING IS OUT OF IT. A column
     of "Yes" is a column a reader learns to skip, and it pushes the useful ones
     off the printed width. */
  const anyRetired = rota.items.some((i) => i.active === false);
  const headers = [
    noun,
    ...factKeys,
    "Weight",
    "Checked with",
    ...(anyRetired ? ["In service"] : []),
  ];

  const ws = wb.addWorksheet(pluralise(noun), {
    properties: { tabColor: { argb: fills.structure } },
  }) as unknown as StreamWorksheet;

  ws.getColumn(1).width = 12;
  factKeys.forEach((_, i) => {
    ws.getColumn(2 + i).width = 13;
  });
  ws.getColumn(2 + factKeys.length).width = 10;
  ws.getColumn(3 + factKeys.length).width = 14;
  if (anyRetired) ws.getColumn(4 + factKeys.length).width = 12;

  const title = ws.getRow(1);
  title.getCell(1).value = pluralise(noun).toUpperCase();
  title.getCell(1).font = { bold: true, size: 14 };
  title.getCell(1).alignment = CENTRE;
  for (let c = 1; c <= headers.length; c++) title.getCell(c).fill = fill(fills.structureAlt);

  const head = ws.getRow(2);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = fill(fills.structure);
    cell.alignment = CENTRE;
    cell.border = box();
  });

  let row = 3;
  for (const item of rota.items) {
    const r = ws.getRow(row);
    r.getCell(1).value = item.code;
    factKeys.forEach((k, i) => {
      const v = item.facts?.[k];
      /* ⚠️ `null` PRINTS BLANK AND IS NOT "-". A dash is a value a school typed
         to mean "none assigned"; inventing one for an empty box would put words
         on a printed sheet nobody wrote. Same rule as the timetable's rooms. */
      if (v !== null && v !== undefined && v !== "") {
        const n = Number(v);
        r.getCell(2 + i).value = v.trim() !== "" && Number.isFinite(n) && `${n}` === v.trim() ? n : v;
      }
    });
    r.getCell(2 + factKeys.length).value = item.weight ?? 1;
    const with_ = partners.get(item.id);
    /* An em dash, not a blank: "nobody" is an answer here and an empty cell
       reads as "not filled in yet". */
    r.getCell(3 + factKeys.length).value = with_ && with_.size ? [...with_].join(", ") : "—";
    if (anyRetired) r.getCell(4 + factKeys.length).value = item.active === false ? "No" : "Yes";
    for (let c = 1; c <= headers.length; c++) {
      r.getCell(c).alignment = CENTRE;
      r.getCell(c).border = box();
    }
    row++;
  }

  ws.mergeCells(1, 1, 1, headers.length);
  return ws;
}

function cadenceWord(c: SchoolRota["cadence"]): string {
  switch (c) {
    case "daily":
      return "day";
    case "fortnightly":
      return "fortnight";
    case "monthly":
      return "month";
    case "termly":
      return "term";
    default:
      return "week";
  }
}
