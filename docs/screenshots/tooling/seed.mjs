/* A realistic school: the reference IT room rota, on a real 2026/27 year. */
const PCS = {N21:"33",N24:"33",N36:"15",M25:"33",H24:"33",H25:"33",G15:"32",G21:"33",M13:"30",M26:"29",S21:"26",T12:"24",H22:"10",T11:"17",T21:"12",T22:"12",N11:"10",A4:"19"};
const TEL = {N21:"3514",N24:"3517",N36:"3525",M25:"3562",H24:"3494",H25:"3504",G15:"3462",G21:"3532",M13:"3577",M26:"3563",S21:"3560",T12:"3547",H22:"3543",T11:"3546",T21:"3548",T22:"3549",N11:"3508",A4:"3489"};
const small = new Set(["N11","A4","H22","T11","T21","T22"]);
const order = ["N21","N24","N36","N11","A4","M13","M25","M26","H24","H25","H22","T11","G15","G21","S21","T12","T21","T22"];

export const doc = {
  formatVersion: 1,
  school: { name: "Ashgrove High School" },
  roomSheets: [{
    id: "sheet-1", name: "IT Rooms",
    fields: [{ id: "f1", label: "No of PCs", kind: "number" }, { id: "f2", label: "Telephone", kind: "text" }],
    rooms: order.map((c, i) => ({ id: `room-${i+1}`, name: c, values: { f1: PCS[c], f2: TEL[c] } })),
  }],
  years: [{
    id: "year-1", name: "2026/27", timezone: "Europe/London",
    start: "2026-09-07", end: "2027-07-16",
    cycleLength: 2, anchorMonday: "2026-09-07", anchorWeekIndex: 0, holidayMode: "pause",
    weekLabels: ["Week A", "Week B"], taughtWeekdays: [1,2,3,4,5],
    closures: [
      { id: "c1", label: "Half Term", kind: "holiday", start: "2026-10-26", end: "2026-10-30" },
      { id: "c2", label: "Christmas", kind: "holiday", start: "2026-12-21", end: "2027-01-01" },
      { id: "c3", label: "Half Term", kind: "holiday", start: "2027-02-15", end: "2027-02-19" },
      { id: "c4", label: "Easter", kind: "holiday", start: "2027-04-05", end: "2027-04-16" },
    ],
    periods: [
      { ordinal: 0, name: "Tutor",    start: "08:45", end: "09:05", order: 0, isTeaching: false },
      { ordinal: 1, name: "Period 1", start: "09:05", end: "10:05", order: 1, isTeaching: true },
      { ordinal: 2, name: "Period 2", start: "10:05", end: "11:05", order: 2, isTeaching: true },
      { ordinal: 3, name: "Break",    start: "11:05", end: "11:25", order: 3, isTeaching: false },
      { ordinal: 4, name: "Period 3", start: "11:25", end: "12:25", order: 4, isTeaching: true },
      { ordinal: 5, name: "Lunch",    start: "12:25", end: "13:10", order: 5, isTeaching: false },
      { ordinal: 6, name: "Period 4", start: "13:10", end: "14:10", order: 6, isTeaching: true },
      { ordinal: 7, name: "Period 5", start: "14:10", end: "15:10", order: 7, isTeaching: true },
    ],
    roomSheetId: "sheet-1",
    templates: [],
  }],
  rotas: [{
    id: "rota-1",
    name: "IT Room Checking Rota",
    preset: "it-rooms",
    cadence: "weekly", quota: 2, source: "year", yearId: "year-1",
    itemNoun: "Room",
    subtitle: "Two rooms checked each week: cleaned, and any damaged items (keyboards, mice etc.) reported.",
    columns: [
      { id: "cleaned",  label: "Cleaned (Y/N)", kind: "tick" },
      { id: "found",    label: "Damage Found (Y/N)", kind: "tick", width: 13 },
      { id: "reported", label: "Damage Reported (Y/N)", kind: "tick", width: 14 },
      { id: "by",       label: "Checked By", kind: "person" },
      { id: "date",     label: "Date Checked", kind: "date" },
      { id: "notes",    label: "Notes", kind: "text" },
    ],
    items: order.map((c, i) => ({
      id: `ri-${i+1}`, code: c,
      ...(small.has(c) ? { weight: 0.5 } : {}),
      facts: { "No of PCs": PCS[c], Telephone: TEL[c] },
    })),
  }],
};
