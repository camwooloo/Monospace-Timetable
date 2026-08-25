/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE FIXTURE GATE — `npm run gate`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The only proof this package still writes the bytes Monospace writes.
 *
 * ⭐ IT IS A PLAIN NODE PROGRAM, DELIBERATELY. It prints its report and exits
 * non-zero; it has no worker pool, no reporter and no IPC, so it has no
 * channel to time out. Under vitest a run in which EVERY TEST PASSED still
 * exited 1 with `[vitest-worker]: Timeout calling "onTaskUpdate"`, because
 * `worksheet.protect()` runs 100,000 SHA-512 rounds synchronously, once per
 * sheet, 40 sheets to a workbook, and nothing yields for tens of seconds. The
 * full history — and the two fixes that failed first — is in `harness.ts`.
 *
 * ⚠️ VITEST IS STILL HERE AND STILL EARNS ITS KEEP: `npm test` runs the model
 * builder's rules, the document reader, the provenance pins and the
 * source-hygiene checks. What left is the heavy byte comparison, which never
 * needed a runner.
 *
 * ── ⭐ WHAT RUNS, AND WHY IN THIS ORDER ──────────────────────────────────
 *   1. the palette — milliseconds, and a colour moving explains half the
 *      failures below, so it goes first
 *   2. our bytes vs each committed reference — THE claim
 *   3. the `CT_Worksheet` sequence, on the bytes step 2 already generated
 *   4. the hoist ENABLED, on those same bytes
 *   5. the hoist DISABLED — the sabotage. After every check that wants a
 *      clean `WorksheetWriter.prototype`, and the restore is then proved
 *   6. the live regeneration, when a Monospace checkout is present
 *   7. the browser bundle: built, then executed unminified, then minified
 *   8. the published `dist/`, imported by Node
 *
 * Cheap and diagnostic first, most expensive last, and nothing that patches a
 * shared prototype before the things that assume it is clean.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { colourForClass, compareClassCodes } from "../src/lib/timetableSheet";
import { compare, printReport } from "./compare";
import { equal, Gate, ok, sameList, skip } from "./harness";
import { CASES, FULL_CASE, modelFor, ourBytes } from "./workbooks";
import { sequenceViolations } from "./ctWorksheet";
import {
  assertHoisted,
  assertHoistRestored,
  assertSabotageDetected,
  sheetPartsOf,
  withHoistDisabled,
} from "./hoist";
import { haveMonospaceSource, monospaceRoot, referenceWorkbook } from "./reference";
import {
  buildSandboxBundles,
  bytesFromSandbox,
  readableStreamCopies,
  SANDBOX_FORMS,
  stopBundler,
  type SandboxBundle,
} from "./browser";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURES = resolve(ROOT, "fixtures");
const DIST = resolve(ROOT, "dist/index.js");

/** GitHub Actions sets this. Used for exactly one rule — see the `dist` step. */
const ON_CI = Boolean(process.env.CI);

/**
 * ⭐⭐ HOW MANY CHECKS THIS PROGRAM IS SUPPOSED TO RUN. `gate.finish()` refuses
 * to go green on any other number.
 *
 * ⚠️ THE WORKFLOWS PROVE THE SCRIPT EXISTS; THIS PROVES THE PROGRAM STILL DOES
 * SOMETHING. `npm run gate` being wired up is asserted in three places — both
 * workflows and `test/source.test.ts` — and none of them can tell whether the
 * byte comparison is still in this file. Delete it and the job stays green
 * with an eleven-row report, on a summary the workflow's own comment says
 * nobody opens on a green run. `browser.ts` already refuses that failure for
 * the sandbox forms, by iterating the DECLARED list rather than the build's
 * result; this is the same refusal for the list as a whole.
 *
 * ⭐ THE TWO LISTS THAT LEGITIMATELY VARY ARE DERIVED, so adding a reference
 * case or a bundle form needs nothing here. The `8` is the steps that are
 * written out once each — palette, CT_Worksheet, hoist on, hoist off, the live
 * regeneration, the bundle build, the readable-stream dedupe, `dist/` — and
 * bumping it is the deliberate act that adding a ninth should be.
 */
const EXPECTED_CHECKS = 8 + CASES.length + SANDBOX_FORMS.length;

function committed(fixture: string): Uint8Array {
  const path = resolve(FIXTURES, fixture);
  ok(
    existsSync(path),
    `${fixture} is missing. Run \`npm run fixtures:refresh\` with a Monospace checkout.`,
  );
  return new Uint8Array(readFileSync(path));
}

async function main(): Promise<number> {
  const gate = new Gate("THE FIXTURE GATE — our bytes against Monospace's");
  gate.note(`node ${process.version} · ${process.platform} ${process.arch}`);
  gate.note(
    haveMonospaceSource()
      ? `Monospace checkout: ${monospaceRoot()} — the live comparison WILL run`
      : `Monospace checkout: none at ${monospaceRoot()} — the live comparison will be skipped`,
  );
  gate.note(
    existsSync(DIST)
      ? `dist/: built — the published-package check WILL run`
      : `dist/: absent${ON_CI ? " — and this is CI, so that is a FAILURE" : " — the published-package check will be skipped"}`,
  );

  /* ────────────────────────────────────────────────────────────────────────
     1. THE PALETTE

     ⭐ EVERY CLASS CODE → ITS HEX, PINNED AS TEXT.

     `colourForClass()` is a gamut bisection inside a lightness bisection over
     a few hundred float literals whose own rule is "measure, never reason from
     the constants". Three separate claims about that palette have failed
     measurement. Pinning the OUTPUT means any change is a diff somebody has to
     look at, rather than a colour quietly moving in every school's workbook.
     ──────────────────────────────────────────────────────────────────────── */
  await gate.step("the palette matches fixtures/palette.txt exactly", () => {
    const text = readFileSync(resolve(FIXTURES, "palette.txt"), "utf8");
    const rows = text
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => {
        const [code, argb] = l.split("\t");
        return { code: JSON.parse(code) as string, argb };
      });

    ok(rows.length > 20, `the palette fixture has rows in it (found ${rows.length})`);

    /* Sorted with the workbook's own comparator, so the fixture's ORDER is
       part of what is pinned — `compareClassCodes` decides the legend's order
       on the info sheet. */
    const sorted = [...rows].sort((a, b) => compareClassCodes(a.code, b.code));
    sameList(
      sorted.map((r) => r.code),
      rows.map((r) => r.code),
      "the palette fixture is in compareClassCodes order",
    );

    for (const { code, argb } of rows) {
      equal(colourForClass(code) ?? "-", argb, `colourForClass(${JSON.stringify(code)})`);
    }

    /* ⚠️ THE `-` ROWS ARE AS LOAD-BEARING AS THE HEXES. A free-text booking,
       the withheld-purpose word "Booked" and a typed "-" must never be
       coloured; a palette fixture listing only the codes that DO colour would
       not notice `colourForClass` starting to colour them. */
    const uncoloured = rows.filter((r) => r.argb === "-").length;
    ok(uncoloured > 4, `strings that must get no fill at all (found ${uncoloured})`);
    console.log(
      `    ${rows.length} class codes pinned, ${rows.length - uncoloured} coloured, ${uncoloured} that must get no fill`,
    );
  });

  /* ────────────────────────────────────────────────────────────────────────
     2. THE CLAIM ITSELF

     `fixtures/reference-*.xlsx` are COMMITTED and were generated by
     Monospace's own writer (`npm run fixtures:refresh`). Every run compares
     against them, on any machine, with no Monospace checkout needed.
     ──────────────────────────────────────────────────────────────────────── */
  for (const c of CASES) {
    await gate.step(`byte-identical to Monospace's writer — ${c.label}`, async () => {
      const reference = committed(c.fixture);
      const ours = await ourBytes(c);
      printReport(`${c.label} — vs fixtures/${c.fixture}`, compare(ours, reference), {
        reference: reference.length,
        ours: ours.length,
      });
    });
  }

  /* ────────────────────────────────────────────────────────────────────────
     3. THE SHEET PARTS ARE SCHEMA-LEGAL

     ⚠️ `CT_Worksheet` IS AN `xsd:sequence`. An element out of place is the
     "we found a problem with some content" repair prompt, and a repair drops
     what it could not place — so for a workbook whose whole point is
     protection, it opens unprotected or not at all.

     ⭐ Step 5 proves THIS check works, by turning the hoist off and requiring
     it to fail. A validator nobody has seen fail is untested.
     ──────────────────────────────────────────────────────────────────────── */
  await gate.step("every sheet part obeys the CT_Worksheet element sequence", async () => {
    let sheets = 0;
    for (const c of CASES) {
      for (const part of sheetPartsOf(await ourBytes(c))) {
        sheets++;
        const bad = sequenceViolations(part.name, part.xml);
        equal(
          bad.length,
          0,
          `${c.label} — ${part.name}:\n${bad.map((v) => "  " + v.message).join("\n")}`,
        );
      }
    }
    /* Both fixtures together: 2 templates + 39 weeks + half terms + info,
       twice over. Asserted so a fixture that silently stopped producing sheets
       cannot pass this check by checking nothing. */
    ok(sheets > 80, `sheet parts checked (found ${sheets}, expected more than 80)`);
    console.log(`    ${sheets} sheet parts checked, 0 violations`);
  });

  /* ──────────────────────────────────────────────────────────────────────── */
  await gate.step(
    "the hoist ENABLED — sheetProtection sits immediately after sheetData",
    async () => {
      const parts = sheetPartsOf(await ourBytes(FULL_CASE));
      const n = assertHoisted(parts);
      console.log(
        `    ${n} sheets carry <sheetProtection>, all immediately after </sheetData>`,
      );
    },
  );

  /* ⚠️ THE SABOTAGE. Everything above wants a clean prototype; nothing below
     touches this one. See `hoist.ts`. */
  await gate.step(
    "the hoist DISABLED — the sequence check reports exactly 40 violations",
    async () => {
      const parts = await withHoistDisabled();
      assertHoistRestored();
      const violations = assertSabotageDetected(parts);
      console.log(
        `    ${violations.length} CT_Worksheet violations across ${parts.length} sheet parts\n` +
          `    e.g. ${violations[0].part}: ${violations[0].message}`,
      );
    },
  );

  /* ────────────────────────────────────────────────────────────────────────
     6. THE COMMITTED FIXTURE COULD BE STALE

     ⚠️ It is a snapshot of a product that is still being worked on. When a
     Monospace checkout is here, the reference is regenerated LIVE and
     compared, so "the fixture matches" and "the product matches" cannot
     quietly become different claims.

     ⚠️ NOTHING IN THE MONOSPACE REPO IS WRITTEN TO. It is a live commercial
     product and this package treats it as read-only; the import is a read.
     ──────────────────────────────────────────────────────────────────────── */
  await gate.step("the committed fixtures still match Monospace's writer today", async () => {
    if (!haveMonospaceSource()) {
      skip(
        `no Monospace checkout at ${monospaceRoot()} — set MONOSPACE_SOURCE to run this. ` +
          `The committed bytes were still compared above; this is the check that they are not STALE.`,
      );
    }
    for (const c of CASES) {
      const live = await referenceWorkbook(modelFor(c));
      const report = compare(live, committed(c.fixture));
      printReport(`live Monospace vs fixtures/${c.fixture} — ${c.label}`, report);
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
     7. THE BROWSER BUILD, EXECUTED

     See `browser.ts`. Built once, then run in a `vm` whose sandbox has ONLY
     browser globals — unminified first because its stack traces are readable,
     then the minified form, which is what a school actually runs.
     ──────────────────────────────────────────────────────────────────────── */
  let bundles: SandboxBundle[] = [];
  await gate.step("the browser bundle builds, in both forms", async () => {
    bundles = await buildSandboxBundles();
    for (const b of bundles) {
      console.log(`    ${b.label}: ${b.kilobytes.toFixed(1)} KB → ${b.filename}`);
    }
    equal(bundles.length, SANDBOX_FORMS.length, "forms built");
  });

  /* ⚠️ THE DECLARED FORMS, NOT WHAT THE BUILD RETURNED. If the step above
     failed, these still appear in the report as SKIPPED and pointing at it —
     a gate that silently runs ten checks instead of twelve is the failure this
     package exists to prevent. */
  for (const form of SANDBOX_FORMS) {
    await gate.step(
      `the ${form.label} bundle runs with only browser globals and writes Monospace's bytes`,
      async () => {
        const b = bundles.find((x) => x.label === form.label);
        if (!b) skip(`${form.label} was not built — see the failure above`);
        const reference = committed(FULL_CASE.fixture);
        const fromBrowser = await bytesFromSandbox(b);
        printReport(
          `${form.label} — vs fixtures/${FULL_CASE.fixture}`,
          compare(fromBrowser, reference),
          { reference: reference.length, ours: fromBrowser.length },
        );
      },
    );
  }

  await gate.step("the bundle contains exactly one readable-stream", () => {
    const b = bundles[0];
    if (!b) skip("the bundles were not built — see the failure above");
    const copies = readableStreamCopies(b.code);
    console.log(`    copies in the bundle: ${copies.length} (${copies.join(", ") || "none"})`);
    equal(copies.length, 1, "distinct readable-stream packages in the bundle");
  });

  /* ────────────────────────────────────────────────────────────────────────
     8. THE PUBLISHED PACKAGE

     ⚠️ EVERY OTHER CHECK IMPORTS `src/`. That proves the code is right and
     proves nothing about what gets PUBLISHED — and the published artefact has
     already been broken once here in a way nothing else would have caught:
     `tsc` emits extensionless relative specifiers, Node's ESM loader refuses
     them, and `dist/index.js` built cleanly and could not be imported at all.
     `scripts/fix-esm-extensions.ts` is the fix; this is the check that it is
     still working.

     ⚠️ IT SKIPS LOCALLY WHEN `dist/` IS ABSENT — the gate has to work on a
     fresh clone before anybody has run `npm run build` — BUT IT FAILS ON CI,
     because the workflow builds the package before running this. That way, if
     the build step is ever dropped from the workflow, the gate says so instead
     of quietly checking one thing fewer.
     ──────────────────────────────────────────────────────────────────────── */
  await gate.step("the published package — Node imports dist/ and writes a workbook", async () => {
    if (!existsSync(DIST)) {
      ok(
        !ON_CI,
        `dist/index.js is missing on CI. The engine job must run \`npm run build --workspace packages/engine\` ` +
          `before the gate, or this check silently stops running.`,
      );
      skip("dist/ has not been built — run `npm run build` in packages/engine");
    }
    const mod = (await import(pathToFileURL(DIST).href)) as {
      buildTimetableModel: typeof import("../src/model/buildModel").buildTimetableModel;
      bufferTimetableWorkbook: typeof import("../src/workbook/timetableWorkbook").bufferTimetableWorkbook;
      SCHOOL_DOCUMENT_VERSION: number;
    };
    equal(mod.SCHOOL_DOCUMENT_VERSION, 1, "dist/ exports SCHOOL_DOCUMENT_VERSION");

    const built = mod.buildTimetableModel({
      document: FULL_CASE.document,
      now: (await import("../test/fixtures/schoolDocument")).FIXTURE_NOW,
      generatedBy: "Fixture",
      password: FULL_CASE.password,
    });
    ok(built.ok, `dist/ built the model: ${built.ok ? "" : built.error}`);
    if (!built.ok) return;

    const bytes = await mod.bufferTimetableWorkbook(built.model);
    /* A zip, and a workbook-sized one. The byte-level claim is made above
       against `src/`; this one is "the published thing runs at all". */
    equal(bytes[0], 0x50, "dist/ output starts with 'P'");
    equal(bytes[1], 0x4b, "dist/ output starts with 'PK'");
    ok(bytes.length > 100_000, `dist/ produced a workbook-sized file (${bytes.length} bytes)`);
    console.log(`    dist/ produced a ${bytes.length}-byte workbook under Node`);
  });

  /* ⚠️ esbuild's service is a child process and it holds the event loop open.
     See `stopBundler`. */
  await stopBundler();

  return gate.finish(EXPECTED_CHECKS);
}

/* ⚠️ `process.exitCode`, NOT `process.exit()`. Killing the process would cut
   stdout off mid-flush on a slow pipe, and the report is the point. */
process.exitCode = await main();

/**
 * ⚠️⚠️ AND THE PROCESS MUST ACTUALLY END.
 *
 * A gate that prints a green report and then never exits is, to CI, a job that
 * runs until the six-hour limit and reports a timeout — indistinguishable from
 * the flake this whole change removed, and harder to diagnose because the log
 * says everything passed. It happened the first time this ran outside vitest:
 * esbuild's service is a child process, the worker used to be torn down around
 * it, and as a plain program nothing released it.
 *
 * ⭐ THE HANDLE IS RELEASED PROPERLY ABOVE. This is the net under that, and it
 * NAMES what is still open rather than just exiting — a stray handle is a bug
 * in this file, not something to paper over quietly. `unref()` means it costs
 * nothing on the normal path: the process is already gone before it fires.
 */
const watchdog = setTimeout(() => {
  const open = [...new Set(process.getActiveResourcesInfo())].join(", ");
  console.error(
    `\n⚠️  The gate finished but something is still holding the event loop open: ${open}\n` +
      `    Exiting with ${process.exitCode ?? 0} anyway. Release it in gate/ rather than raising this timeout.`,
  );
  process.exit(process.exitCode ?? 0);
}, 5_000);
watchdog.unref();
