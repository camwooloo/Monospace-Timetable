/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE COMPARISON — AND THE ONLY ONE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The one claim this package has to earn: **our writer produces the same bytes
 * Monospace's does.** Not "an equivalent workbook", not "the same content" —
 * the same bytes, member by member, at the same compression method, in the
 * same order, with exactly three normalisations that are each argued for in
 * `zip.ts`.
 *
 * ⚠️ THE WEAKER VERSIONS OF THIS COMPARISON ARE THE TEMPTING ONES. "Open both
 * in exceljs and compare cell values" passes when the styles diverge. "Diff the
 * unzipped XML" passes when the compression METHOD changes, which is how a
 * dependency swapping its zip backend gets into a release. So the comparison
 * starts from the RAW COMPRESSED BYTES, and a member that had to be normalised
 * is compared as normalised TEXT plus its compression method — never skipped.
 *
 * ⚠️ ONE THING IS DELIBERATELY NOT GATED: the compression LEVEL. zlib does not
 * promise byte-stable output across builds and does not deliver it — the same
 * theme1.xml, from identical source through identical exceljs, packs to 1820
 * bytes on macOS and 1804 on Linux, with the same 7961 raw bytes and the same
 * CRC. Requiring the stored bytes to match made the gate fail on CI for a file
 * nobody had touched, and a gate that cries wolf is a gate people switch off.
 * Method, CRC, length and every byte of content are still required to match;
 * a member that differs only in packing is counted and NAMED in the report.
 *
 * ── ⚠️ THERE IS ONE OF THESE, AND THERE HAS TO BE ────────────────────────
 * The browser sandbox used to carry its own slightly-weaker copy of this
 * function — no `compressedSize` on the fast path, no repacked bucket, so a
 * member that browserify-zlib packed differently would have been reported as
 * "differs for no permitted reason". Two comparisons that are supposed to
 * agree drift, and the weaker one goes green. Every caller — committed
 * fixtures, the live regeneration, both browser bundles — comes through here.
 */

import { equal, GateError, sameCounts, sameList, sameText } from "./harness";
import { bytesEqual, readZip, stripVolatile, VOLATILE, type ZipMember } from "./zip";

export type Report = {
  members: number;
  identicalRaw: number;
  /** Same content and method; zlib packed it differently. See the banner. */
  identicalContent: number;
  identicalNormalised: number;
  repackedMembers: string[];
  normalisedMembers: string[];
  substitutions: Record<string, number>;
};

/**
 * The comparison, and the whole of it.
 *
 * ⚠️ IT FAILS ON THE FIRST DIFFERENCE **WITH THE MEMBER NAMED**, because "two
 * files differ" is not an actionable failure for a 50-part zip.
 */
export function compare(ours: Uint8Array, reference: Uint8Array): Report {
  const a = readZip(reference);
  const b = readZip(ours);

  sameList(
    b.map((m) => m.name),
    a.map((m) => m.name),
    "the set and ORDER of zip members",
  );

  const report: Report = {
    members: a.length,
    identicalRaw: 0,
    identicalContent: 0,
    identicalNormalised: 0,
    repackedMembers: [],
    normalisedMembers: [],
    substitutions: {},
  };

  for (let i = 0; i < a.length; i++) {
    const ref: ZipMember = a[i];
    const our: ZipMember = b[i];

    /* The fast, strict path: the member's stored bytes are identical. This is
       what catches a compression-level change, and it is where all but a
       handful of members land. */
    if (
      ref.method === our.method &&
      ref.crc32 === our.crc32 &&
      ref.compressedSize === our.compressedSize &&
      ref.uncompressedSize === our.uncompressedSize &&
      bytesEqual(ref.compressed, our.compressed)
    ) {
      report.identicalRaw++;
      continue;
    }

    /* ⭐ SAME CONTENT, SAME METHOD, DIFFERENT DEFLATE OUTPUT — and this is not
       a regression, it is zlib.

       The gate originally required the stored bytes to match so that a
       dependency swapping its zip backend could not slip through. That is the
       right instinct and it cost cross-platform determinism: zlib does not
       promise byte-stable output across builds, and it does not deliver it.
       Measured on `xl/theme/theme1.xml`, generated from identical source by
       identical exceljs — macOS 1820 compressed bytes, Linux 1804, with the
       SAME 7961 raw bytes and the SAME CRC 3744504694. The content is provably
       identical; only the packing differs.

       ⚠️ WHAT THIS STILL CATCHES, which is the part that matters: the
       compression METHOD (stored vs deflate — a backend swap changes this),
       the CRC, the uncompressed length, and every byte of the content. What it
       no longer gates is the compression LEVEL. That is the honest trade, and
       the alternative was a gate that fails on Linux for a file nobody
       changed — which teaches everyone to ignore it. */
    if (
      ref.method === our.method &&
      ref.crc32 === our.crc32 &&
      ref.uncompressedSize === our.uncompressedSize &&
      bytesEqual(ref.content, our.content)
    ) {
      report.identicalContent++;
      report.repackedMembers.push(
        `${our.name} (${ref.compressedSize}→${our.compressedSize})`,
      );
      continue;
    }

    /* Otherwise the ONLY acceptable explanation is one of the three volatile
       fields. Normalise both and require the results to match exactly. */
    const sr = stripVolatile(ref.content);
    const so = stripVolatile(our.content);

    /* ⚠️ THE SUBSTITUTION COUNTS ARE COMPARED TOO. Without this, a file that
       stopped writing `saltValue` altogether would pass as "normalised" — the
       pattern simply would not match, on both sides, and the texts would agree
       about a protection attribute that is no longer there. */
    sameCounts(
      so.hits,
      sr.hits,
      VOLATILE.map((v) => `<${v.field}> — ${v.why}`),
      `${our.name}: number of volatile substitutions`,
    );

    const changed = sr.hits.some((n) => n > 0);
    if (!changed) {
      /* Bytes differ and nothing volatile is in this member. That is the
         regression this gate exists for. */
      throw new GateError(
        `${our.name} differs from the reference and contains none of the three volatile fields.\n` +
          `  reference: ${ref.compressedSize} compressed / ${ref.uncompressedSize} raw, method ${ref.method}, crc ${ref.crc32}\n` +
          `  ours     : ${our.compressedSize} compressed / ${our.uncompressedSize} raw, method ${our.method}, crc ${our.crc32}\n` +
          describeTextDifference(sr.text, so.text),
      );
    }

    sameText(so.text, sr.text, `${our.name}, normalised`);
    /* Compression method still has to agree even for a normalised member —
       only the CONTENT was allowed to move, not how it is stored. */
    equal(our.method, ref.method, `${our.name}: compression method`);

    report.identicalNormalised++;
    report.normalisedMembers.push(our.name);
    VOLATILE.forEach((v, k) => {
      if (sr.hits[k] > 0) {
        report.substitutions[v.why] = (report.substitutions[v.why] ?? 0) + sr.hits[k];
      }
    });
  }

  /* ⭐ EVERY MEMBER LANDED IN EXACTLY ONE BUCKET. Asserted rather than
     assumed: a `continue` added to the loop above would otherwise drop a
     member out of the comparison and out of the count at the same time. */
  equal(
    report.identicalRaw + report.identicalContent + report.identicalNormalised,
    report.members,
    "every zip member accounted for",
  );
  return report;
}

function describeTextDifference(reference: string, ours: string): string {
  const n = Math.min(reference.length, ours.length);
  let at = -1;
  for (let i = 0; i < n; i++) {
    if (reference[i] !== ours[i]) {
      at = i;
      break;
    }
  }
  if (at < 0 && reference.length === ours.length) {
    return "  (identical text — so the difference is the COMPRESSION itself, which is a regression in its own right)";
  }
  if (at < 0) at = n;
  return (
    `  first difference at character ${at}:\n` +
    `    reference … ${JSON.stringify(reference.slice(Math.max(0, at - 60), at + 60))}\n` +
    `    ours      … ${JSON.stringify(ours.slice(Math.max(0, at - 60), at + 60))}`
  );
}

/**
 * ⭐ THE NUMBERS, PRINTED. A gate whose result is only "passed" tells you
 * nothing about what it actually checked — so every bucket, every repacked and
 * normalised member BY NAME, and every volatile substitution with its count,
 * goes to stdout on a green run as well as a red one.
 */
export function printReport(
  label: string,
  report: Report,
  sizes?: { reference: number; ours: number },
): void {
  const lines = [
    `    zip members compared        ${report.members}`,
    `    identical raw compressed    ${report.identicalRaw}`,
    `    identical content, repacked ${report.identicalContent}` +
      (report.repackedMembers.length ? ` (${report.repackedMembers.join(", ")})` : ""),
    `    identical after normalising ${report.identicalNormalised}` +
      (report.normalisedMembers.length ? ` (${report.normalisedMembers.join(", ")})` : ""),
    ...Object.entries(report.substitutions).map(([why, n]) => `    ${n} × ${why}`),
  ];
  if (sizes) {
    lines.push(
      `    reference bytes             ${sizes.reference}`,
      `    our bytes                   ${sizes.ours}`,
    );
  }
  console.log(`  ${label}\n${lines.join("\n")}`);
}
