/**
 * ══════════════════════════════════════════════════════════════════════════
 *  EXPORT — the four switches Cam named, and the workbook itself
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam: *"extra options to lock fields, auto change each week if the templates
 * is changed etc"*. Those are exactly these four:
 *
 *   linkTemplates     the auto-change
 *   protectTemplates  the lock on the standing timetable
 *   lockPrefilled     the lock on the lessons, blanks left editable
 *   hideEndedWeeks    folds away tabs for weeks that are over
 *
 * ⚠️⚠️ NOT ONE WORD BESIDE A SWITCH IS WRITTEN HERE. `EXPORT_OPTION_COPY` in
 * the engine holds the label, the reason and THE COST of each, and the
 * workbook's own info sheet quotes the same sentences — so what a school reads
 * before pressing the button and what it reads inside the file it opens next
 * term are the same words. Two copies of a sentence is two chances to promise
 * something the writer does not do; that has happened, and `lockPrefilled`'s
 * `cost` line still carries the correction.
 *
 * ── ⭐ THE PASSWORD IS A PARAMETER OF ONE EXPORT ─────────────────────────
 * It is typed here, handed to `buildTimetableModel`, passed straight through
 * to `worksheet.protect()`, and forgotten. It is NOT in `SchoolDocument` and
 * never will be: a password in the saved file is a password in the mail
 * attachment. The field is cleared after a successful export for the same
 * reason.
 */

import {
  buildTimetableModel,
  bufferTimetableWorkbook,
  cycleWeekLabel,
  yearWeekLabels,
  normaliseExportOptions,
  resolveExportOptions,
  EXPORT_LINK_NOTE,
  EXPORT_LINKED_AND_PROTECTED_NOTE,
  EXPORT_OPTION_COPY,
  EXPORT_OPTION_KEYS,
  EXPORT_PROTECTION_NOTE,
  type ExportOptionKey,
} from "../engine";
import { button, card, field, h, notice, toggle } from "../dom";
import { toast } from "../ui";
import { host } from "../host";
import {
  currentYear,
  doc,
  edit,
  generatedBy,
  repaint,
  setGeneratedBy,
  setYearId,
  yearNow,
} from "../store";

/** ⚠️ MODULE-LOCAL AND NEVER IN THE DOCUMENT. See the banner. */
let password = "";
let busy = false;

export function exportScreen(): HTMLElement {
  const d = doc();
  const year = yearNow();
  /* ⭐ RESOLVED ONCE. "Absent means off" is answered in `resolveExportOptions`
     and not again per option per call site. */
  const options = resolveExportOptions(d.export);

  const bothOn = options.linkTemplates && options.protectTemplates;

  return h(
    "div.stack",
    null,
    card(
      "What shape of file",
      "Four switches. Each says what it does and what it costs — the same sentences the workbook prints on its own info sheet.",
      ...EXPORT_OPTION_KEYS.map((key) =>
        toggle(
          options[key],
          EXPORT_OPTION_COPY[key].label,
          EXPORT_OPTION_COPY[key].hint,
          EXPORT_OPTION_COPY[key].cost,
          (on) => setOption(key, on),
        ),
      ),
      /* ⭐⭐ THE ONE PAIR THAT PULLS AGAINST ITSELF, SAID OUT LOUD — and only
         when both are actually on. It is NOT refused, and must not be: the
         templates are the school's standing timetable and "read-only unless
         you mean it" is exactly the guard an admin wants on them. What is not
         acceptable is it being silent. */
      bothOn
        ? notice("warn", h("b", null, "These two pull against each other. "), EXPORT_LINKED_AND_PROTECTED_NOTE)
        : null,
      options.linkTemplates ? notice("", h("b", null, "In the file: "), EXPORT_LINK_NOTE) : null,
      options.protectTemplates || options.lockPrefilled
        ? notice("", h("b", null, "About protection: "), EXPORT_PROTECTION_NOTE)
        : null,
    ),
    card(
      "The workbook",
      "One academic year per file, exactly as Monospace produces it.",
      h(
        "div.grid2",
        null,
        h(
          "label.field",
          null,
          "Academic year",
          h(
            "select",
            {
              onchange: (e: Event) => setYearId((e.target as HTMLSelectElement).value),
            },
            ...d.years.map((y) =>
              h("option", { value: y.id, selected: y.id === year?.id }, y.name || "Untitled"),
            ),
          ),
          /* ⚠️ `pickAcademicYear` AND NEVER `years[0]`, which is the school's
             OLDEST. Monospace records five separate readers having had this
             bug; the select opens on the resolved answer. */
          h(
            "span.note",
            null,
            d.years.length > 1
              ? `Opens on ${currentYear(d.years)?.name ?? "the current year"} — the year the school is actually in, never simply the first one in the file.`
              : "",
          ),
        ),
        field(
          "Password on the protected sheets",
          password,
          (v) => {
            password = v;
          },
          {
            type: "password",
            placeholder: "Leave empty for no password",
            note: "Typed for this export only. It is never written into the file you save, and it is forgotten as soon as the workbook is built.",
          },
        ),
        field("Generated by", generatedBy(), (v) => setGeneratedBy(v), {
          placeholder: "Your name",
          note: "Printed on the info sheet. Kept on this machine, not in the file.",
        }),
      ),
      !options.protectTemplates && !options.lockPrefilled && password
        ? notice(
            "warn",
            h("b", null, "Nothing is protected, so the password does nothing."),
            " Switch on “Protect the template sheets” or “Lock the timetabled lessons” for it to have anything to lock.",
          )
        : null,
      /* ⚠️⚠️ SAID BEFORE IT HAPPENS, BECAUSE IT REALLY DOES HAPPEN. exceljs
         derives the sheet-protection hash with 100,000 SEQUENTIAL SHA-512
         rounds PER PROTECTED SHEET, synchronously, and there is no async door
         into it — it is the same code Monospace's server runs, and the whole
         point of this project is that it is unmodified. Measured here on the
         reference school (40 protected sheets, one password): tens of seconds
         with the window not answering.
         ⭐ A WEB WORKER IS THE REAL FIX and is genuinely reachable from a
         single file (`new Worker(URL.createObjectURL(new Blob([…])))`), but it
         is a piece of work rather than a line, so until then the honest thing
         is to warn instead of letting a school think the app has crashed. */
      password && (options.protectTemplates || options.lockPrefilled)
        ? notice(
            "warn",
            h("b", null, "With a password this takes a while, and the window will stop responding while it runs."),
            " Locking a sheet means deriving a key 100,000 times over, once per protected sheet — 40 of them in a normal year. It has not crashed; leave it be.",
          )
        : null,
      h(
        "div.row",
        { style: { marginTop: "18px" } },
        button(busy ? "Building…" : "Export the workbook", {
          icon: "download",
          cls: "go",
          disabled: busy || !year,
          onclick: () => runExport(),
        }),
        h("span.mut.tiny", null, year ? summary(year.id) : "Add a year first."),
      ),
    ),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SWITCHES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ MERGED KEY BY KEY AND PRUNED TO WHAT DIFFERS FROM THE DEFAULT — the
 * engine's own `normaliseExportOptions`, so one switch cannot clear the other
 * three and a school back at every default carries no `export` field at all,
 * exactly as one that never opened this panel does.
 */
function setOption(key: ExportOptionKey, on: boolean) {
  edit((next) => {
    const merged = normaliseExportOptions(next.export ?? undefined, { [key]: on });
    next.export = merged;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   THE EXPORT
   ══════════════════════════════════════════════════════════════════════════ */

function summary(yearId: string): string {
  const d = doc();
  const year = d.years.find((y) => y.id === yearId);
  if (!year) return "";
  const sheet =
    d.roomSheets.find((s) => s.id === (year.roomSheetId ?? d.roomSheets[0]?.id)) ??
    d.roomSheets[0];
  const labels = yearWeekLabels(year);
  const cycle = Array.from({ length: year.cycleLength }, (_v, i) =>
    cycleWeekLabel(labels, i, year.cycleLength),
  ).join(" / ");
  return `${sheet?.rooms.length ?? 0} rooms · ${year.periods.length} periods · ${cycle}`;
}

async function runExport() {
  const d = doc();
  const year = yearNow();
  if (!year || busy) return;

  busy = true;
  /* The button reads `busy` on the next render, so one repaint puts it into
     its working state — rather than three imperative pokes at a DOM node this
     function would then have to find again. */
  repaint();
  /* ⚠️ A YIELD BEFORE THE WORK STARTS. Everything below is SYNCHRONOUS:
     exceljs runs 100,000 sequential SHA-512 rounds per protected sheet, and a
     school with 40 sheets and a password is a real pause — measured at tens of
     seconds. Yielding here is what lets the button reach its "Building…" state
     before the window stops answering. (`setImmediate` inside the writer keeps
     it a MACROtask for the same reason — see the browser shim list.)

     ⚠️⚠️ AND IT IS A TIMEOUT, NOT `requestAnimationFrame`. A hidden tab never
     fires one — so an export started and then backgrounded, which is exactly
     what somebody does while they wait for a slow one, would hang for ever with
     the button stuck on "Building…" and no error anywhere. Two frames' worth of
     wall clock is enough for a paint and cannot fail to arrive. */
  await new Promise((r) => setTimeout(r, 32));

  try {
    const built = buildTimetableModel({
      document: d,
      yearId: year.id,
      /* ⭐ STRAIGHT THROUGH TO `worksheet.protect()`, AND NOWHERE ELSE. */
      password: password || undefined,
      generatedBy: generatedBy() || undefined,
    });
    if (!built.ok) {
      /* ⭐ THE ENGINE'S OWN REFUSAL, VERBATIM. It names what is missing — "no
         periods yet", "no rooms on it yet" — and a re-worded version here
         would be a second vocabulary for the same problem. */
      toast(built.error, "bad", 9000);
      return;
    }

    const bytes = await bufferTimetableWorkbook(built.model);
    const name = await host.saveWorkbook(bytes, built.suggestedFilename);
    if (name === null) return; /* cancelled — not an error, and not shouted about */

    /* ⚠️ THE PASSWORD IS FORGOTTEN THE MOMENT THE FILE EXISTS. It was a
       parameter of one export; leaving it in a field is leaving it on a
       staffroom screen. */
    password = "";

    /* ⚠️ `complete: false` MEANS THE EXPORT STOPPED EARLY, and the workbook
       opens on its info sheet saying so. It is NOT the same as `optionNotes`,
       which are notes about a convenience on a file whose timetable is
       complete to the last cell — so they are reported differently. */
    const notes = built.model.notes;
    if (!notes.complete) {
      toast(
        `${name} written — ⚠️ it opens on its info sheet, which says what stopped short.`,
        "bad",
        12000,
      );
    } else {
      toast(`${name} written.`, "good", 7000);
      for (const note of notes.optionNotes ?? []) toast(note, "", 9000);
    }
  } catch (err) {
    /* ⚠️ NAMED, NOT SWALLOWED. A failure in the writer is the one thing a
       school cannot work around, and "something went wrong" tells them nothing
       to send on. */
    toast(
      `The workbook could not be built: ${
        err instanceof Error ? err.message : String(err)
      }`,
      "bad",
      12000,
    );
  } finally {
    busy = false;
    repaint();
  }
}

