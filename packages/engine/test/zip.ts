/**
 * ══════════════════════════════════════════════════════════════════════════
 *  A ZIP READER PRECISE ENOUGH TO CATCH A COMPRESSION-LEVEL CHANGE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The gate is "every zip member byte-identical", and there are two ways to
 * check that, only one of which is strong enough.
 *
 *   ⚠️ THE WEAK WAY: unzip both files and diff the XML. That passes when the
 *      two writers produce the same content by different deflate settings —
 *      which is exactly the regression the gate is supposed to catch, because
 *      a school's file changing size and bytes for no visible reason is how
 *      you discover a dependency swapped its zip backend under you.
 *
 *   ⭐ THE STRONG WAY, WHICH IS THIS ONE: compare the RAW COMPRESSED BYTES of
 *      each member, plus its compression method, CRC-32 and both sizes. Two
 *      files that deflate the same content at different levels differ here on
 *      the first member and say so.
 *
 * So this parses the archive itself rather than handing it to a library that
 * would hide the very fields being tested. It reads the End of Central
 * Directory, walks the central directory, and for each entry re-reads the
 * LOCAL header to find where the member's bytes actually start.
 *
 * ⚠️ NO ZIP64, NO ENCRYPTION, NO MULTI-DISK. exceljs's archiver writes none of
 * them for a workbook of this size, and a reader that quietly coped with a
 * format the writer cannot produce would be untested code in a test.
 */

import { inflateRawSync } from "node:zlib";

export type ZipMember = {
  name: string;
  /** 0 = stored, 8 = deflate. ⭐ COMPARED: a switch to stored is a change. */
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  /** ⭐ THE BYTES AS THEY SIT IN THE ARCHIVE. This is what makes a compression
   *  -level change visible. */
  compressed: Uint8Array;
  /** Inflated, for the three normalised members and for readable diffs. */
  content: Uint8Array;
};

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}
function u32(b: Uint8Array, at: number): number {
  return (
    (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0
  );
}

/** Read every member, in central-directory order — which is the order the
 *  writer emitted them and is itself part of what is being compared. */
export function readZip(buf: Uint8Array): ZipMember[] {
  /* The EOCD is at the end, after a comment of up to 65,535 bytes. Scan back
     from the last possible position. */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (u32(buf, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");

  const count = u16(buf, eocd + 10);
  let at = u32(buf, eocd + 16);

  const out: ZipMember[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(buf, at) !== CEN_SIG) {
      throw new Error(`central directory entry ${n} has a bad signature`);
    }
    const method = u16(buf, at + 10);
    const crc32 = u32(buf, at + 16);
    const compressedSize = u32(buf, at + 20);
    const uncompressedSize = u32(buf, at + 24);
    const nameLen = u16(buf, at + 28);
    const extraLen = u16(buf, at + 30);
    const commentLen = u16(buf, at + 32);
    const localAt = u32(buf, at + 42);
    const name = new TextDecoder().decode(
      buf.subarray(at + 46, at + 46 + nameLen),
    );

    /* ⚠️ THE LOCAL HEADER'S OWN extra FIELD MAY BE A DIFFERENT LENGTH from the
       central one — archiver writes a data descriptor and pads differently —
       so the member's offset is computed from the LOCAL header and never from
       the central one. Getting this wrong reads a few bytes of header as
       content and every comparison fails for the wrong reason. */
    if (u32(buf, localAt) !== LOC_SIG) {
      throw new Error(`local header for ${name} has a bad signature`);
    }
    const locNameLen = u16(buf, localAt + 26);
    const locExtraLen = u16(buf, localAt + 28);
    const dataAt = localAt + 30 + locNameLen + locExtraLen;

    const compressed = buf.subarray(dataAt, dataAt + compressedSize);
    const content =
      method === 0
        ? compressed
        : new Uint8Array(inflateRawSync(Buffer.from(compressed)));

    out.push({
      name,
      method,
      crc32,
      compressedSize,
      uncompressedSize,
      compressed,
      content,
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE THREE THINGS THAT MAY DIFFER, AND NOTHING ELSE
   ══════════════════════════════════════════════════════════════════════════

   Two runs of the same writer over the same model produce the same bytes,
   with exactly three exceptions. Each is listed with why it is genuinely
   non-deterministic — and "it was easier" is not on the list. Anything else
   differing is a regression, INCLUDING a compression-level change.

   ⚠️ NORMALISING IS NOT THE SAME AS IGNORING. Each pattern below still has to
   MATCH: `stripVolatile` reports how many substitutions it made, and the gate
   asserts the count is the same on both sides. A file that stopped writing a
   `saltValue` at all would otherwise sail through as "normalised". */

export type Volatile = { pattern: RegExp; replacement: string; why: string };

export const VOLATILE: Volatile[] = [
  {
    /**
     * ⭐ 1. THE PROTECTION SALT. `worksheet.protect()` generates 16 random
     * bytes per sheet, per run. That is the correct behaviour — a fixed salt
     * would make every Monospace workbook in the world share one — so it can
     * never be deterministic and must be normalised instead.
     */
    pattern: /saltValue="[^"]*"/g,
    replacement: 'saltValue="<SALT>"',
    why: "random 16-byte salt, regenerated per sheet per run",
  },
  {
    /**
     * ⭐ 2. THE HASH DERIVED FROM IT. SHA-512 over the password and the salt,
     * 100,000 rounds. Different salt, different hash, necessarily. ⚠️ IT IS
     * NORMALISED **BECAUSE** THE SALT IS, and for no other reason: if the two
     * files ever disagreed about the ROUNDS or the ALGORITHM those attributes
     * are still compared, because they are not in this pattern.
     */
    pattern: /hashValue="[^"]*"/g,
    replacement: 'hashValue="<HASH>"',
    why: "SHA-512 of the password and the random salt",
  },
  {
    /**
     * ⭐ 3. THE MODIFIED TIMESTAMP. ⚠️ AND *ONLY* `modified` — `created` is
     * deterministic and is compared.
     *
     * exceljs's `WorkbookWriter` constructor does
     * `this.created = options.created || new Date()` and then
     * `this.modified = options.modified || this.created`. The writer passes
     * neither, then assigns `wb.created = new Date(model.notes.generatedAt)`
     * AFTERWARDS — which re-points `created` and leaves `modified` holding the
     * construction-time clock. So `dcterms:created` follows the model (and is
     * checked), and `dcterms:modified` is the wall clock of the run.
     */
    pattern: /<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/g,
    replacement: "<dcterms:modified><MODIFIED></dcterms:modified>",
    why: "wall clock at WorkbookWriter construction",
  },
];

export type Stripped = { text: string; hits: number[] };

/** Apply the three, counting each. The counts are compared too. */
export function stripVolatile(content: Uint8Array): Stripped {
  let text = new TextDecoder().decode(content);
  const hits: number[] = [];
  for (const v of VOLATILE) {
    let n = 0;
    text = text.replace(v.pattern, () => {
      n++;
      return v.replacement;
    });
    hits.push(n);
  }
  return { text, hits };
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
