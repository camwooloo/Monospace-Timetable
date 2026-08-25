/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TWO REFERENCE CASES, AND ONE GENERATION OF EACH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ TWO CASES, BECAUSE THEY ARE TWO WRITER PATHS AND NOT TWO SIZES. The
 * password case runs `protect()` (salt, SHA-512, and the `sheetProtection`
 * hoist on every grid sheet), the formulas and the conditional formatting; the
 * plain case runs none of them and is the file most schools will actually get.
 * A gate that only ever ran with the options on would not notice the plain
 * workbook breaking.
 *
 * ── ⭐ WHY THE BYTES ARE GENERATED ONCE ──────────────────────────────────
 * Under vitest each test generated its own copy, so the full case — 40 sheets
 * × 100,000 SHA-512 rounds — was written FIVE times in one run: the fixture
 * comparison, the `CT_Worksheet` sequence check, the hoist-enabled check and
 * both browser sandboxes. Three of those five wanted the same bytes.
 *
 * ⚠️ CACHING IS SAFE HERE AND WOULD NOT BE EVERYWHERE. Every consumer treats
 * the array as READ-ONLY, and the three fields that genuinely differ between
 * two runs (the per-sheet salt, the hash derived from it, and
 * `dcterms:modified`) are exactly the three `stripVolatile` normalises — so
 * reusing one generation cannot make a comparison pass that a fresh one would
 * fail. The generations that must stay INDEPENDENT still are: the live
 * regeneration runs Monospace's writer, both browser bundles run their own
 * copy of ours inside a `vm`, and the hoist-disabled case is deliberately not
 * cached because it is a DIFFERENT workbook wearing the same case name.
 */

import { buildTimetableModel } from "../src/model/buildModel";
import { bufferTimetableWorkbook } from "../src/workbook/timetableWorkbook";
import type { TimetableWorkbookModel } from "../src/lib/timetableSheet";
import {
  FIXTURE_NOW,
  FIXTURE_PASSWORD,
  makeFixtureDocument,
  makeFixtureDocumentPlain,
} from "../test/fixtures/schoolDocument";

export type Case = {
  label: string;
  /** The committed reference under `fixtures/`. */
  fixture: string;
  document: ReturnType<typeof makeFixtureDocument>;
  password: string | undefined;
};

export const CASES: Case[] = [
  {
    /* All four options on, with a password: formulas, conditional formatting,
       hidden tabs, SHA-512 sheet protection and the `sheetProtection` hoist on
       every grid sheet. */
    label: "every option on, with a password",
    fixture: "reference-full.xlsx",
    document: makeFixtureDocument(),
    password: FIXTURE_PASSWORD,
  },
  {
    /* ⭐ A DIFFERENT WRITER PATH, not a smaller one: no `protect()`, so no
       salt, no hash and the hoist never runs; no formulas; no conditional
       formatting. It is also the file most schools will actually get. */
    label: "every option off",
    fixture: "reference-plain.xlsx",
    document: makeFixtureDocumentPlain(),
    password: undefined,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   ⚠️ CONSIDERED AND DECLINED: A SHORT PROTECTED YEAR
   ══════════════════════════════════════════════════════════════════════════

   The obvious way to make this cheaper is to split the two cases by SIZE
   rather than by writer path — a handful of weeks for the PROTECTED reference,
   the full 38-week year left unprotected — on the grounds that protection is a
   per-sheet property and proving it forty times over proves nothing the sixth
   time did not. The arithmetic is real. Measured on the machine the fixtures
   were made on:

     building the model                             1,628 ms  (no protection in it)
     writing it, protection on, NO password           121 ms
     writing it, protection on, WITH a password     2,143 ms  ⭐ 94% is SHA-512
     the whole gate                                  82.5 s
     of which the two browser sandbox runs           64.0 s   ⭐ the same hashing,
                                                              in JavaScript

   Six protected grid sheets instead of forty would take roughly 48 s off an
   83 s run. It was still declined, for three reasons that outlast the saving:

     1. ⚠️ `hideEndedWeeks` DOES NOT SURVIVE THE SHRINK. `FIXTURE_NOW` is
        mid-January precisely so some weeks have ended and some have not — the
        only setting in which hiding proves anything. A short year is either
        entirely before that clock (every week sheet hidden, which is the state
        Excel REFUSES TO OPEN a workbook in and which the design makes
        unreachable by construction) or entirely after it (nothing hidden, and
        the option is untested). Keeping it meaningful means inventing a second
        fixture school straddling the clock and arguing it as carefully as the
        first — which is a fixture-design job, not an optimisation.
     2. ⚠️ IT WOULD REQUIRE REGENERATING THE COMMITTED REFERENCES in the same
        change that moved the gate out of vitest. If CI then went red, nothing
        would say which of the two did it — and only a machine with a Monospace
        checkout can re-derive the answer.
     3. The failure being fixed was never "too slow". It was a reporter RPC
        timing out inside a test runner. With the runner gone, four minutes on
        a shared CI runner is simply a four-minute job.

   ⭐ THE SAVING THAT WAS TAKEN COSTS NOTHING: generating each case ONCE (see
   `ourBytes` above) removed two protected writes and one plain one from every
   run, ~7 s, without changing a single assertion.

   If you do come back to this: the references must still be MONOSPACE'S bytes
   (`npm run fixtures:refresh` against the read-only checkout), `PROTECTED_GRID_
   SHEETS` in `gate/hoist.ts` moves with the week count, and the browser sandbox
   would then have to run BOTH references — protection is only on one of them
   and geometry only at scale on the other.
   ══════════════════════════════════════════════════════════════════════════ */

/** The full case — the one with protection on. Named, because three checks
 *  want specifically it and `CASES[0]` is the kind of index this project has
 *  been bitten by before. */
export const FULL_CASE: Case = CASES[0];

export function modelFor(c: Case): TimetableWorkbookModel {
  const built = buildTimetableModel({
    document: c.document,
    now: FIXTURE_NOW,
    generatedBy: "Fixture",
    password: c.password,
  });
  if (!built.ok) throw new Error(`${c.label}: ${built.error}`);
  return built.model;
}

/**
 * Generate the workbook with OUR writer, WITHOUT the cache.
 *
 * ⚠️ The hoist-disabled check needs this: it sabotages the writer's prototype
 * first, so the bytes it wants are emphatically not the bytes anybody else
 * wants for the same case.
 */
export function generateFresh(c: Case): Promise<Uint8Array> {
  return bufferTimetableWorkbook(modelFor(c));
}

const cache = new Map<string, Promise<Uint8Array>>();

/** Generate the workbook with our writer — once per case, per run. */
export function ourBytes(c: Case): Promise<Uint8Array> {
  let hit = cache.get(c.label);
  if (!hit) {
    hit = generateFresh(c);
    cache.set(c.label, hit);
  }
  return hit;
}
