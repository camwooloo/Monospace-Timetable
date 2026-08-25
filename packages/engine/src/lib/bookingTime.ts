/**
 * ══════════════════════════════════════════════════════════════════════════
 *  BOOKING TIME — THE GRAIN, THE WINDOW, AND THE WALL CLOCK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This file is PURE. No `_generated` import, no `convex/values`, no `ctx`,
 * nothing that only exists on a server — the same rule, for the same reason,
 * as convex/lib/depreciation.ts and convex/lib/itemCatalog.ts. Convex cannot
 * import from `src/`, but the client CAN import from `convex/lib/`, so the
 * grid the user drags on and the ledger the server writes are quantised by
 * one function. A client that computes slot boundaries with a second
 * implementation is a client that will eventually draw a free slot over a
 * booked one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ WHY A GRAIN EXISTS AT ALL — THIS IS THE CORRECTNESS ARGUMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Convex has NO UNIQUE CONSTRAINTS. Verified from the installed package:
 * `schema.d.ts` exposes `index`, `searchIndex` and `vectorIndex` and nothing
 * else. There is no `.unique()`. So the database cannot be asked to reject a
 * second booking of the same minibus — the refusal has to be written.
 *
 * Mutations are serializable transactions with OCC and automatic retry. What
 * is NOT established, and what nobody should ship a school's minibus rota on,
 * is whether a transaction's read set includes the INDEX RANGES it scanned.
 * If it does not, then "scan [start, end) for an overlapping booking, find
 * none, insert" is a phantom read: two transactions both scan, both find
 * nothing, both insert, both commit. Two valid confirmations, one vehicle.
 *
 * So the overlap question is re-expressed as a question no reading of the
 * semantics can get wrong. **Quantise the resource's time into fixed grains
 * and give each occupied grain its own document.** A booking writes N rows.
 * The check is then N EXACT-EQUALITY index probes on `(resourceId, slotStart)`
 * — specific documents, by key, which is precisely what document-level OCC
 * covers under any reading. Two concurrent bookings of the same grain read the
 * same key and one of them loses.
 *
 * The cost is honest and bounded: a booking occupies at most
 * MAX_SLOTS_PER_BOOKING rows, and one that would need more is refused rather
 * than silently written half-way.
 *
 * ── HALF-OPEN INTERVALS, EVERYWHERE, NO EXCEPTIONS ────────────────────────
 * A booking covers `[startUtc, endUtc)`. Overlap is
 * `aStart < bEnd && bStart < aEnd`. A booking ending at 10:00 and one starting
 * at 10:00 DO NOT conflict. Get this wrong once and every back-to-back period
 * in the school clashes with the one before it, which is the failure mode most
 * likely to be reported as "the booking system is broken" on day one.
 *
 * The grain arithmetic below is half-open too: the slot list runs
 * `slotStart, slotStart + grain, …` while `< slotEnd`, so a booking that ends
 * exactly on a boundary does not occupy the grain that starts there.
 *
 * ── QUANTISATION IS CONSERVATIVE, AND THAT IS A PRODUCT DECISION ──────────
 * The start is FLOORED to its grain and the end is CEILED. A 09:20–15:40
 * booking on a 30-minute resource holds 09:00–16:00.
 *
 *   • It can never MISS a real overlap. Two intervals that genuinely overlap
 *     share at least one grain, always. That direction is the safe one and it
 *     is the direction that matters.
 *   • It can report a conflict between two bookings that do not literally
 *     overlap — 10:00–10:10 and 10:20–10:30 on a 30-minute grain. For a
 *     minibus that is arguably the truth (nobody hands a vehicle back and
 *     collects it again inside half an hour), and for a room the answer is to
 *     set a finer grain. Either way the caller is told the window actually
 *     held, by `quantiseWindow`, so the UI can say "holds the minibus
 *     09:00–16:00" instead of quietly widening it.
 *
 * ── THE GRAIN IS EPOCH-ANCHORED, AND WHICH GRAINS ARE LEGAL FOLLOWS ───────
 * Grains are anchored to the Unix epoch (`floor(t / grainMs) * grainMs`), not
 * to the resource's local midnight, because local midnight is a timezone
 * computation and this file's arithmetic must stay total and pure.
 *
 * That is exact for every UTC offset that is a whole multiple of the grain.
 * SLOT_GRAINS is therefore restricted to divisors of an hour plus whole-hour
 * grains up to four hours — and the UK, this feature's market, is UTC+0/+1, so
 * every legal grain lands on a wall-clock boundary there. In a zone offset by
 * :30 or :45 a 2-hour grain lands mid-hour in local terms. It is still
 * CORRECT — a grain is a bucket, not a label — it just does not line up with
 * the grid a user would draw. Anything coarser than four hours is refused
 * rather than approximated, which is why "all day" is not a grain.
 */

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Legal values for `bookableResources.slotMinutes`. See the epoch-anchoring
 *  note above for why the list stops at four hours and why every member either
 *  divides an hour or is a whole number of hours. */
export const SLOT_GRAINS = [5, 10, 15, 20, 30, 60, 120, 240] as const;
export type SlotGrain = (typeof SLOT_GRAINS)[number];

/** 15 minutes suits rooms; vehicles are usually set to 30 or 60. */
export const DEFAULT_SLOT_MINUTES: SlotGrain = 30;

/**
 * The hard ceiling on how many ledger rows ONE booking may write.
 *
 * At the finest grain (5 min) that is 16h40m; at 30 minutes it is a hundred
 * hours; at four hours it is thirty-three days. A single booking longer than
 * that is a resource being taken out of service, which is a different action
 * (`active: false`) with different semantics — not a booking with a very long
 * end date that quietly writes thousands of rows into a deployment already
 * over its plan limits.
 */
export const MAX_SLOTS_PER_BOOKING = 200;

/** Sanity bounds on an instant, so a fat-fingered or hostile epoch value
 *  cannot ask for a hundred million grains before the count is checked.
 *  2000-01-01 and 2100-01-01. */
export const MIN_BOOKABLE_MS = 946_684_800_000;
export const MAX_BOOKABLE_MS = 4_102_444_800_000;

/** The resource's timezone when none is given. A minibus lives at a school and
 *  the school has one timezone — see `bookableResources.timezone`. */
export const DEFAULT_TIMEZONE = "Europe/London";

const MINUTE_MS = 60_000;

/* ══════════════════════════════════════════════════════════════════════════
   GRAIN
   ══════════════════════════════════════════════════════════════════════════ */

export function isSlotGrain(minutes: number): minutes is SlotGrain {
  return (SLOT_GRAINS as readonly number[]).includes(minutes);
}

/** Snap an arbitrary number to the nearest legal grain, rounding UP so the
 *  stored grain is never finer than what was asked for (a finer grain means
 *  more ledger rows per booking, which is the direction that costs money). */
export function normaliseSlotMinutes(minutes: number | undefined): SlotGrain {
  if (minutes === undefined || !Number.isFinite(minutes)) return DEFAULT_SLOT_MINUTES;
  if (isSlotGrain(minutes)) return minutes;
  for (const g of SLOT_GRAINS) if (g >= minutes) return g;
  return SLOT_GRAINS[SLOT_GRAINS.length - 1];
}

/* ══════════════════════════════════════════════════════════════════════════
   OVERLAP
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Half-open overlap. `[aStart, aEnd)` against `[bStart, bEnd)`.
 *
 * Not used by the conflict path — that is the ledger's job, and this function
 * is exactly the range-scan reasoning the ledger exists to avoid depending on.
 * It is here for the honest uses: filtering a day's already-loaded rows, and
 * the reconciliation cron's second opinion.
 */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/* ══════════════════════════════════════════════════════════════════════════
   QUANTISATION — the ledger's keys
   ══════════════════════════════════════════════════════════════════════════ */

export type QuantisedWindow = {
  /** The requested instants, unchanged. What the user actually asked for, and
   *  what every duration is computed from. */
  startUtc: number;
  endUtc: number;
  /** The window actually HELD once floored and ceiled to the grain. Show this
   *  to the user; it is what other people will be refused against. */
  slotStart: number;
  slotEnd: number;
  grainMinutes: SlotGrain;
  /** One epoch-ms key per occupied grain. These are the ledger's rows, and the
   *  exact-equality probes the conflict check makes. */
  slots: number[];
};

export type QuantiseFailure = {
  /** A stable code so callers can vary their copy without matching strings. */
  code: "backwards" | "out-of-range" | "too-many-slots";
  message: string;
  /** Only on "too-many-slots". How many grains the request would have taken. */
  slotCount?: number;
};

export type QuantiseResult =
  | { ok: true; window: QuantisedWindow }
  | { ok: false; error: QuantiseFailure };

/**
 * Turn a requested window into the ledger keys it occupies, or say why it
 * cannot be one.
 *
 * Returns a result rather than throwing: this runs on the client to draw a
 * preview as somebody drags, and an exception is not a preview. The server
 * turns a failure into a ConvexError at its own boundary.
 */
export function quantiseWindow(
  startUtc: number,
  endUtc: number,
  slotMinutes: number,
): QuantiseResult {
  const grainMinutes = normaliseSlotMinutes(slotMinutes);
  const grainMs = grainMinutes * MINUTE_MS;

  if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc)) {
    return {
      ok: false,
      error: { code: "out-of-range", message: "That is not a valid time." },
    };
  }
  /* Half-open intervals mean a zero-length booking occupies no grains at all,
     so it is refused here rather than written as a row that holds nothing and
     therefore conflicts with nobody. */
  if (endUtc <= startUtc) {
    return {
      ok: false,
      error: {
        code: "backwards",
        message: "A booking has to end after it starts.",
      },
    };
  }
  if (
    startUtc < MIN_BOOKABLE_MS ||
    endUtc > MAX_BOOKABLE_MS ||
    startUtc > MAX_BOOKABLE_MS
  ) {
    return {
      ok: false,
      error: {
        code: "out-of-range",
        message: "That date is outside the range this calendar can hold.",
      },
    };
  }

  const slotStart = Math.floor(startUtc / grainMs) * grainMs;
  const slotEnd = Math.ceil(endUtc / grainMs) * grainMs;
  const slotCount = Math.round((slotEnd - slotStart) / grainMs);

  if (slotCount > MAX_SLOTS_PER_BOOKING) {
    return {
      ok: false,
      error: {
        code: "too-many-slots",
        slotCount,
        message: `That booking is too long to hold in one go — it would reserve ${slotCount} slots and the limit is ${MAX_SLOTS_PER_BOOKING}. Split it, or take the resource out of service instead.`,
      },
    };
  }

  const slots: number[] = [];
  for (let t = slotStart; t < slotEnd; t += grainMs) slots.push(t);

  return {
    ok: true,
    window: { startUtc, endUtc, slotStart, slotEnd, grainMinutes, slots },
  };
}

/**
 * The grains a READ window touches, for drawing a day or a week.
 *
 * Bounded by `max` and reports `capped`, because "show me the next year of
 * this room at five-minute resolution" is one request away and would otherwise
 * be a hundred thousand keys. Callers use it to size a grid, never to decide a
 * conflict.
 */
export function grainsInRange(
  fromUtc: number,
  toUtc: number,
  slotMinutes: number,
  max: number,
): { slots: number[]; capped: boolean; grainMinutes: SlotGrain } {
  const grainMinutes = normaliseSlotMinutes(slotMinutes);
  const grainMs = grainMinutes * MINUTE_MS;
  const slots: number[] = [];
  if (!Number.isFinite(fromUtc) || !Number.isFinite(toUtc) || toUtc <= fromUtc) {
    return { slots, capped: false, grainMinutes };
  }
  const first = Math.floor(fromUtc / grainMs) * grainMs;
  const last = Math.ceil(toUtc / grainMs) * grainMs;
  for (let t = first; t < last; t += grainMs) {
    if (slots.length >= max) return { slots, capped: true, grainMinutes };
    slots.push(t);
  }
  return { slots, capped: false, grainMinutes };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE WALL CLOCK
   ══════════════════════════════════════════════════════════════════════════

   `startUtc` / `endUtc` as epoch milliseconds are THE AUTHORITY. Every
   overlap, every duration and every ledger key is computed from them and from
   nothing else. The local strings below are a DENORMALISATION for rendering
   and export, derived at write time and re-derivable at any point.

   This is deliberately the opposite of `calendarItems`, which stores wall
   clock strings and converts on the client — and whose `convertItemTimes`
   rewrites the four time fields and never touches `item.date`, so a 23:00
   London event viewed from Auckland renders at 10:00 ON THE WRONG DAY. That
   defect is live today for any cross-timezone org and is out of scope here;
   it is named because it is the pattern not to copy.

   THE TIMEZONE LIVES ON THE RESOURCE, not on the booker and not on the
   booking. A minibus lives at a school and the school has one timezone. It is
   also why a duration is always `endUtc - startUtc`: a vehicle out from 22:00
   Saturday to 09:00 Sunday across the October clock change is out for TWELVE
   hours, not eleven, and only the epoch difference says so. */

export type WallClock = {
  /** `YYYY-MM-DD` in the resource's timezone, on the START instant. */
  localDate: string;
  /** `HH:MM`, 24-hour. */
  localStart: string;
  localEnd: string;
  /** True when the end lands on a later local date than the start. The grid
   *  has to draw such a booking twice and a day view that filters on
   *  `localDate` alone would lose the second half. */
  crossesMidnight: boolean;
};

/** Cheap probe: does this runtime have working IANA timezone support at all?
 *  Computed once. If it does not, every derivation below falls back to UTC
 *  rather than throwing — a resource that cannot be created because the host
 *  lacks ICU is a worse outcome than a wall-clock string that is an hour out
 *  in British Summer Time and is recomputable. */
const TZ_SUPPORTED: boolean = (() => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }).format(0);
    return true;
  } catch {
    return false;
  }
})();

/**
 * Is this a timezone this runtime understands? Used to validate
 * `bookableResources.timezone` at write time — the one moment a bad value can
 * be refused with the user watching, rather than discovered later by every
 * read.
 *
 * Returns TRUE for everything when the runtime has no timezone database,
 * because refusing every value would make the feature unusable and the stored
 * string is still meaningful to the client that will render it.
 */
export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  if (!TZ_SUPPORTED) return true;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

function partsIn(ms: number, timezone: string): Parts {
  if (TZ_SUPPORTED) {
    try {
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      const out: Record<string, string> = {};
      for (const p of fmt.formatToParts(new Date(ms))) out[p.type] = p.value;
      const y = Number(out.year);
      const m = Number(out.month);
      const d = Number(out.day);
      /* `hourCycle: "h23"` should give 00–23, but a runtime that ignores it
         and emits "24" for midnight would otherwise store an impossible
         "24:00". Fold it rather than trusting the formatter. */
      const hh = Number(out.hour) % 24;
      const mm = Number(out.minute);
      if ([y, m, d, hh, mm].every((n) => Number.isFinite(n))) {
        return { y, m, d, hh, mm };
      }
    } catch {
      /* fall through to UTC */
    }
  }
  const dt = new Date(ms);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    hh: dt.getUTCHours(),
    mm: dt.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Derive the rendering denormalisation. Total — it never throws, because it
 *  runs inside a mutation that is about to write a row and a formatter is not
 *  a reason to lose a booking. */
export function wallClock(
  startUtc: number,
  endUtc: number,
  timezone: string,
): WallClock {
  const a = partsIn(startUtc, timezone);
  const b = partsIn(endUtc, timezone);
  const dateOf = (p: Parts) => `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  const timeOf = (p: Parts) => `${pad2(p.hh)}:${pad2(p.mm)}`;
  return {
    localDate: dateOf(a),
    localStart: timeOf(a),
    localEnd: timeOf(b),
    crossesMidnight: dateOf(a) !== dateOf(b),
  };
}

/** `YYYY-MM-DD` for one instant in one zone. The day-grid's key. */
export function localDateOf(ms: number, timezone: string): string {
  const p = partsIn(ms, timezone);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}
