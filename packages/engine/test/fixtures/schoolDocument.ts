/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIXTURE SCHOOL — CHOSEN TO REACH EVERY BRANCH THE WRITER HAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A fixture that only exercises the happy grid proves the two writers agree
 * about the happy grid. Each choice below is here to reach a branch that has
 * had a defect in it, so that a regression in one of them fails the gate
 * rather than shipping.
 *
 *   · A **TWO-WEEK CYCLE UNDER `pause`**, with the reference school's own
 *     closure runs. Its February is the proof `pause` was needed at all:
 *     "(A) Feb 8th" → half term → "(B) Feb 22nd" only comes out B if the
 *     closed week consumed no cycle position.
 *   · **FIVE CLOSURE RUNS, THREE OF A FORTNIGHT AND TWO OF A SINGLE WEEK**,
 *     so `buildHalfTerms` has both to chunk and the half-term sheet has a
 *     block with a `null` second half.
 *   · **A YEAR STARTING MID-WEEK.** 2026-09-02 is a Wednesday, so week one has
 *     an untaught Monday and Tuesday — which is the exact shape that used to
 *     punch a hole in the TEMPLATE sheet and, under linking, evaluate two
 *     whole days to "" on half the tabs.
 *   · **A RETIRED ROOM.** `cellRights` answers `retired` above every question
 *     about what is in a cell, so its whole column locks, free periods
 *     included — and the option note has to name it.
 *   · **NON-TEACHING ROWS** (registration, two breaks) so structure fill is
 *     drawn, plus **A BOOKING THAT LANDS ON ONE** — the lunchtime club that
 *     used to be silently thrown away, printing a room as free at the one
 *     moment it is not.
 *   · **AN UNTIMED PERIOD.** It can carry a template lesson and a week change
 *     (both keyed to the ordinal) and can never collide with a booking. That
 *     asymmetry is deliberate and is worth a fixture.
 *   · **A WEEK CHANGE WITH NO LABEL** — the CLEARED state. It must print empty
 *     AND refuse to link, because a linked empty cell resurrects the lesson
 *     somebody moved off it the moment Excel recalculates.
 *   · **A CLASS CODE, A FREE-TEXT BOOKING AND A TYPED "-"** in the same grid,
 *     because `colourForClass` gives the first a colour and the other two
 *     none, and the conditional-formatting rule set must agree.
 *   · **A NUMERIC CUSTOM FIELD HOLDING `0x10`**, which `numericValue()` must
 *     leave as text where `Number()` would make it 16.
 *   · **A DUPLICATE-PRONE SHEET NAME**, so `assignSheetNames` has something to
 *     deduplicate and the template-link formulas have to name the FINAL name.
 *
 * ⚠️ IT IS DELIBERATELY NOT CAM'S REAL FILE. `IT_Room_Timetable_2627_1.xlsx`
 * is a real school's data. The geometry it taught us is in the spec's
 * comments; the fixture is invented and shares only the shape.
 */

import type { SchoolDocument, SchoolTemplateCell } from "../../src/model/document";

/** Frozen clock, so `hideEndedWeeks` and `pickAcademicYear` are deterministic.
 *  2027-01-13T09:00:00Z — mid-year, so some weeks have ended and some have
 *  not, which is the only setting in which `hideEndedWeeks` proves anything. */
export const FIXTURE_NOW = Date.UTC(2027, 0, 13, 9, 0, 0);

const ROOMS = [
  { id: "r-n21", name: "N21", pcs: 30, phone: "2101", teacher: "J Barnes" },
  { id: "r-n22", name: "N22", pcs: 28, phone: "2102", teacher: "A Okafor" },
  { id: "r-n23", name: "N23", pcs: 15, phone: "0x10", teacher: "-" },
  { id: "r-n24", name: "N24", pcs: 32, phone: "2104", teacher: "S Whitfield" },
  { id: "r-n25", name: "N25", pcs: 24, phone: "2105", teacher: "M Devlin" },
] as const;

/** ⭐ THE RETIRED ONE. Kept in the list, kept in its place, locked whole. */
const RETIRED = {
  id: "r-n26",
  name: "N26",
  pcs: 12,
  phone: "2106",
  teacher: "—",
} as const;

/**
 * The day. Nine rows, which with five day blocks and a four-row header band is
 * the reference workbook's 54.
 *
 * ⚠️ ORDINALS ARE NOT POSITIONS. `Registration` was added last and carries
 * ordinal 9 while sitting first — which is precisely the state that used to
 * print the day in creation order in the file and dragged order on screen.
 */
const PERIODS = [
  { ordinal: 9, name: "Registration", order: 0, isTeaching: false, start: "08:45", end: "09:00" },
  { ordinal: 1, name: "Period 1", order: 1, isTeaching: true, start: "09:00", end: "10:00" },
  { ordinal: 2, name: "Period 2", order: 2, isTeaching: true, start: "10:00", end: "11:00" },
  { ordinal: 3, name: "Break 1", order: 3, isTeaching: false, start: "11:00", end: "11:20" },
  { ordinal: 4, name: "Period 3", order: 4, isTeaching: true, start: "11:20", end: "12:20" },
  { ordinal: 5, name: "Period 4", order: 5, isTeaching: true, start: "12:20", end: "13:20" },
  { ordinal: 6, name: "Break 2", order: 6, isTeaching: false, start: "13:20", end: "14:00" },
  { ordinal: 7, name: "Period 5", order: 7, isTeaching: true, start: "14:00", end: "15:00" },
  /* ⭐ UNTIMED, ON PURPOSE. A school that labels its last row rather than
     timing it. No booking can ever collide with this one. */
  { ordinal: 8, name: "Period 6", order: 8, isTeaching: true },
] as const;

const TEACHING_ORDINALS = [1, 2, 4, 5, 7, 8];

/** Realistic-looking codes: a year group, a set, a subject. `colourForClass`
 *  reads structure out of these, so they must look like the real thing. */
const CLASS_CODES = [
  "7A/Cs", "7B/Cs", "8C/Bs", "8D/It", "9E/It", "9F/It",
  "10D/Bs", "10E/Cs", "11B/It", "11C/Bs", "12/Cs1", "13/It2",
];

function buildTemplates(): SchoolTemplateCell[] {
  const out: SchoolTemplateCell[] = [];
  const all = [...ROOMS, RETIRED];
  for (let cw = 0; cw < 2; cw++) {
    for (let ri = 0; ri < all.length; ri++) {
      for (let weekday = 1; weekday <= 5; weekday++) {
        for (let pi = 0; pi < TEACHING_ORDINALS.length; pi++) {
          const ordinal = TEACHING_ORDINALS[pi];
          /* A deterministic spread, with holes: not every room teaches every
             period, so `free` cells exist and get linked and unlocked. */
          const seed = cw * 37 + ri * 17 + weekday * 7 + pi * 3;
          if (seed % 5 === 0) continue;
          out.push({
            id: `t-${cw}-${ri}-${weekday}-${ordinal}`,
            roomId: all[ri].id,
            cycleWeek: cw,
            weekday,
            periodOrdinal: ordinal,
            label: CLASS_CODES[seed % CLASS_CODES.length],
          });
        }
      }
    }
  }
  /* ⭐ THREE CELLS THAT ARE NOT CLASS CODES, in the same grid as ones that
     are. `colourForClass` gives these none, so they must get no fill and no
     conditional-formatting rule. */
  out.push({
    id: "t-freetext-1",
    roomId: "r-n21",
    cycleWeek: 0,
    weekday: 3,
    periodOrdinal: 7,
    label: "Staff briefing",
  });
  /* ⚠️ ON A SLOT THE SPREAD ABOVE LEAVES EMPTY (`seed % 5 === 0`), because
     `resolvePublishedRoom` takes the FIRST template entry matching a cell — a
     second one for the same (room, cycle week, weekday, period) is shadowed and
     never reaches the file. The first version of this fixture collided that way
     and the test for it failed, which is the fixture earning its keep. */
  out.push({
    id: "t-dash-1",
    roomId: "r-n22", // ri = 1
    cycleWeek: 0,
    weekday: 4, // seed = 0 + 17 + 28 + 0 = 45, and 45 % 5 === 0
    periodOrdinal: 1, // pi = 0
    /* ⚠️ A TYPED "-" IS A VALUE SOMEBODY CHOSE. It means "no teacher
       assigned"; it is not a blank and must not be turned into one. */
    label: "-",
  });
  out.push({
    id: "t-untimed-1",
    roomId: "r-n23",
    cycleWeek: 1,
    weekday: 4,
    /* ⭐ ON THE UNTIMED ROW. A template lesson reaches it (keyed by ordinal);
       a booking never could. */
    periodOrdinal: 8,
    label: "12/Cs1",
  });
  return out;
}

export function makeFixtureDocument(): SchoolDocument {
  const rooms = [...ROOMS, RETIRED].map((r) => ({
    id: r.id,
    name: r.name,
    active: r.id !== RETIRED.id,
    values: {
      "f-teacher": r.teacher,
      "f-pcs": String(r.pcs),
      /* ⚠️ `0x10` ON N23. `numericValue()` must leave it as text;
         `Number("0x10")` is 16 and would print the wrong extension. */
      "f-phone": r.phone,
    },
  }));

  return {
    formatVersion: 1,
    school: {
      name: "Ashgrove High School",
      /* Not the default purple, so the accent path is actually exercised —
         a fixture on the default would pass with the accent ignored. */
      accent: "#4f6d7a",
    },
    /* ⭐ ALL FOUR ON. Linking exercises the formulas and the conditional
       formatting; the two protection switches exercise `protectSheet` and the
       `sheetProtection` hoist on every grid sheet; hiding exercises
       `weekHasEnded` against the frozen clock. */
    export: {
      linkTemplates: true,
      hideEndedWeeks: true,
      protectTemplates: true,
      lockPrefilled: true,
    },
    roomSheets: [
      {
        id: "sheet-it",
        name: "IT Rooms",
        fields: [
          { id: "f-teacher", label: "Teacher", kind: "text" },
          { id: "f-pcs", label: "No of PCs", kind: "number" },
          { id: "f-phone", label: "Telephone", kind: "number" },
        ],
        rooms,
      },
    ],
    years: [
      /**
       * ⚠️ AN OLDER YEAR SITS FIRST IN THE FILE, and it is here to make
       * `pickAcademicYear` earn its place: `years[0]` would build the wrong
       * workbook, silently, and that is the bug CLAUDE.md records five
       * separate readers having had.
       */
      {
        id: "y-2526",
        name: "2025/26",
        timezone: "Europe/London",
        start: "2025-09-03",
        end: "2026-07-17",
        cycleLength: 2,
        anchorMonday: "2025-09-01",
        anchorWeekIndex: 0,
        holidayMode: "pause",
        weekLabels: ["Week A", "Week B"],
        periods: PERIODS.map((p) => ({ ...p })),
        roomSheetId: "sheet-it",
        templates: [],
      },
      {
        id: "y-2627",
        name: "2026/27",
        timezone: "Europe/London",
        /* ⭐ A WEDNESDAY. Week one's Monday and Tuesday are outside the year
           and must be structure on the week sheets and NOT on the template. */
        start: "2026-09-02",
        /* ⭐ CHOSEN SO THE YEAR COMES OUT AT **38 TEACHING WEEKS** — the
           reference workbook's own count. That makes the fixture's sheet strip
           the same shape as the file this whole spec was measured from: a
           half-term sheet, two cycle-week templates, 38 week sheets, and the
           info sheet this writer adds. It is also what makes the number in
           `hoist.test.ts` meaningful: 2 templates + 38 weeks = 40 grid sheets
           that take protection, so a disabled hoist misplaces exactly 40
           elements. */
        end: "2027-07-16",
        cycleLength: 2,
        anchorMonday: "2026-08-31",
        anchorWeekIndex: 0,
        /* ⭐ `pause`. See the February run below. */
        holidayMode: "pause",
        weekLabels: ["Week A", "Week B"],
        taughtWeekdays: [1, 2, 3, 4, 5],
        closures: [
          { id: "c-1", label: "Autumn half term", kind: "holiday", start: "2026-10-26", end: "2026-11-06" },
          { id: "c-2", label: "Christmas", kind: "holiday", start: "2026-12-21", end: "2027-01-01" },
          /* ⭐ ONE WEEK. The proof of `pause`. */
          { id: "c-3", label: "February half term", kind: "holiday", start: "2027-02-15", end: "2027-02-19" },
          { id: "c-4", label: "Easter", kind: "holiday", start: "2027-03-29", end: "2027-04-09" },
          /* ⭐ ONE WEEK, and it leaves a half-term block with a null second
             half — the `pair[1]` that must render as filled-but-empty. */
          { id: "c-5", label: "May half term", kind: "holiday", start: "2027-05-31", end: "2027-06-04" },
          /* A single INSET day: `start === end`, a hole in ONE week that must
             NOT reach the template sheet. */
          { id: "c-6", label: "INSET day", kind: "inset", start: "2026-11-09", end: "2026-11-09" },
          /* A bank holiday landing inside a teaching week. */
          { id: "c-7", label: "May Day", kind: "bank", start: "2027-05-03", end: "2027-05-03" },
        ],
        pins: [
          /* ⚠️ A PIN RESEEDS THE COUNT UNDER `pause`. Placed deliberately so
             the fixture carries a week whose source is "pin" rather than
             "rule". */
          { monday: "2027-03-15", cycleWeek: 0, reason: "Published map says A" },
        ],
        periods: PERIODS.map((p) => ({ ...p })),
        roomSheetId: "sheet-it",
        templates: buildTemplates(),
        weekChanges: [
          /* ⭐ A MOVE. Prints in the room it went TO, unlinked and unlocked. */
          {
            id: "wc-1",
            roomId: "r-n21",
            monday: "2027-01-11",
            weekday: 2,
            periodOrdinal: 2,
            label: "9F/It",
            changedBy: "A Okafor",
            changedAt: Date.UTC(2027, 0, 8, 14, 30),
          },
          /* ⭐⭐ CLEARED — no label. The lesson is not running here this week
             because it moved. Must print empty and must NOT be linked. */
          {
            id: "wc-2",
            roomId: "r-n24",
            monday: "2027-01-11",
            weekday: 2,
            periodOrdinal: 2,
            changedBy: "A Okafor",
            changedAt: Date.UTC(2027, 0, 8, 14, 30),
          },
          /* On the untimed row, which a booking could never reach. */
          {
            id: "wc-3",
            roomId: "r-n22",
            monday: "2027-03-15",
            weekday: 4,
            periodOrdinal: 8,
            label: "Mock exam",
            changedAt: Date.UTC(2027, 2, 10, 9, 0),
          },
        ],
        bookings: [
          /* A plain reservation with a purpose. Outranks the standing lesson. */
          {
            id: "b-1",
            roomId: "r-n25",
            startUtc: Date.UTC(2027, 0, 12, 9, 0),
            endUtc: Date.UTC(2027, 0, 12, 10, 0),
            localDate: "2027-01-12",
            status: "approved",
            purpose: "GCSE speaking exams",
          },
          /* ⭐⭐ THE LUNCHTIME CLUB. 13:20–14:00 lands on "Break 2", a
             non-teaching row. Under `WORKBOOK_ROOM_POLICY` it MUST show —
             the version that returned `blocked` above every other test printed
             the room free at the one moment it was not. */
          {
            id: "b-2",
            roomId: "r-n23",
            startUtc: Date.UTC(2027, 0, 13, 13, 20),
            endUtc: Date.UTC(2027, 0, 13, 14, 0),
            localDate: "2027-01-13",
            status: "approved",
            purpose: "Code Club",
          },
          /* ⚠️ NO PURPOSE. Prints "Booked" — the room is taken and nothing
             else is said. NOT "no reason given". */
          {
            id: "b-3",
            roomId: "r-n21",
            startUtc: Date.UTC(2027, 0, 14, 11, 20),
            endUtc: Date.UTC(2027, 0, 14, 12, 20),
            localDate: "2027-01-14",
            status: "approved",
          },
          /* ⭐⭐ A CANCELLED BOOKING, WHICH MUST LEAVE THE STANDING LESSON
             SHOWING. It is the other half of the status rule: `approved` and
             `pending` print, `rejected` and `cancelled` do not — and a fixture
             with only the printing half would pass just as happily if the
             filter were deleted. */
          {
            id: "b-4",
            roomId: "r-n24",
            startUtc: Date.UTC(2027, 0, 15, 9, 0),
            endUtc: Date.UTC(2027, 0, 15, 10, 0),
            localDate: "2027-01-15",
            status: "cancelled",
            purpose: "Cancelled — must not appear",
          },
        ],
      },
    ],
  };
}

/**
 * The same school with every option OFF.
 *
 * ⭐ IT IS A SEPARATE FIXTURE BECAUSE IT IS A DIFFERENT WRITER PATH, not a
 * smaller one: no `protect()` (so no salt, no hash, and the `sheetProtection`
 * hoist never runs), no formulas, no conditional formatting, no hidden tabs.
 * A gate that only ever ran with the options on would not notice the plain
 * workbook breaking, which is the file most schools will actually get.
 */
export function makeFixtureDocumentPlain(): SchoolDocument {
  const doc = makeFixtureDocument();
  return { ...doc, export: {} };
}

/**
 * ⚠️ THE PASSWORD IS A FIXTURE PARAMETER AND IS NEVER IN THE DOCUMENT. It
 * exists for one export and is not stored — see `SchoolDocument`'s banner.
 * It is here so the gate exercises the SHA-512 path, whose salt is the reason
 * two of the three normalisations exist.
 */
export const FIXTURE_PASSWORD = "staffroom";
