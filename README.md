# Monospace Timetable

**A free tool that turns your school day, your rooms and your standing week
into the formatted timetable spreadsheet — the same workbook
[Monospace](https://github.com/camwooloo) produces, given away so a school
with no budget still gets one.**

No account. No sign-up. No subscription. No server. Nothing leaves your
machine.

### [→ Download it from the Releases page](https://github.com/camwooloo/Monospace-Timetable/releases/latest)

There are two downloads and they do the same job. Pick one:

| File | Size | You need | Runs on |
|---|---|---|---|
| **`timetable.html`** | ~600 KB | **Nothing at all.** A web browser you already have. | Anything — Windows, Mac, ChromeOS, Linux |
| **`timetable.exe`** | ~3 MB | Nothing to install. It is not a setup program. | Windows 10 / 11 |

If you are not sure, **take the `.html`.** It cannot be blocked by policy, it
needs no permission from anybody, and it does everything the program does.

---

## What it does

- **Academic years, terms and half terms** — with closures: INSET days, bank
  holidays, the week of snow.
- **Your school day** — periods in the order you actually run them:
  registration, lessons, break, lunch, whatever your day is.
- **Your rooms** — a column each. Rooms taken out of service are marked and
  locked; rooms retired part-way through the year keep their place, so the
  columns don't shuffle underneath you.
- **A standing week** — one-week timetables, or a two-week A/B cycle.
- **One-off changes** — move a lesson in a single week without touching the
  standing week it came from.
- **Bookings** — one-off room bookings land on the grid alongside the
  standing lessons.
- ⭐ **Change the template, and every week still following it changes too.**
  Fix a Wednesday once, in one place, and the rest of the year follows.
- ⭐ **Lock it with a password**, so the copy you circulate can be read and
  printed but not quietly edited.
- **Colour-coded classes**, consistent across the whole workbook.
- **Hide weeks that have already finished**, so the file people open in June
  opens on June.

### What comes out

One `.xlsx` file, ready to print or put on the staff shared drive: a sheet per
teaching week (38 in a typical year), the cycle-week templates, the half-term
blocks, and an information sheet recording what was built, when, by whom, and
anything that needed a note.

Your school's setup saves as a single `.json` file. It is plain text, it is
yours, and it will open in this tool next year. Put it on a shared drive,
email it, back it up like anything else.

---

## Running it

### `timetable.html` — the one that needs nothing

Download it and **double-click it**. It opens in Edge, Chrome, Firefox or
Safari like any other page.

- Nothing is installed. Nothing is registered. There is no uninstall, because
  there is nothing to uninstall — delete the file and it is gone.
- **It works with the network unplugged.** Everything happens inside your
  browser, on your computer. Nothing is uploaded, at any point, to anywhere.
- It is one file. Put it on a shared drive and let the whole office use it.
  Put it on the intranet. Email it to the head of timetabling.

### `timetable.exe` — the portable Windows program

Download it and **run it**. It is a single file, not an installer.

- No admin rights. No installation. Run it from your Desktop, from a USB
  stick, from a network share.
- **On an old Windows 10 image without the Edge WebView2 runtime it still
  works.** It checks before it opens a window, and if the runtime is missing it
  hands the timetable tool to your default browser and tells you why. You get
  your timetable today and install the runtime whenever you get to it. Nothing
  is nagged and nothing quits.
- It checks the Releases page for a newer version and can update itself. That
  is the only thing it uses the internet for; block it and everything else
  still works. If it is running from a read-only share it will say "download it
  yourself" rather than offering an update button that cannot work.

---

## ⚠️ Windows will warn you about the `.exe`. Expect it.

The first time you run `timetable.exe`, Windows will show a blue box:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.

**This is expected and it is not a virus warning.** To run it anyway: click
**More info**, then **Run anyway**.

**Why it happens.** The program is not code-signed. A code-signing
certificate costs a few hundred pounds a year, every year, and this tool is
free — there is no budget for one here either. Unsigned means Windows has
never seen this file before. It does not mean anything is wrong with it.

**What to check before you click through** — and please do check:

- You downloaded it yourself from
  **`github.com/camwooloo/Monospace-Timetable/releases`**, and nowhere else.
- It did **not** arrive as an email attachment, and you did **not** get it
  from a link somebody sent you. If either is true, delete it and download it
  yourself from the address above.

**If your school's policy forbids running unsigned executables — and plenty
of schools have that policy, quite rightly — use `timetable.html`.** It does
exactly the same job, it is not an executable, and it needs no exception from
anyone.

---

## What it does **not** do

Worth reading before you download, so nobody wastes an afternoon.

- **It is not Monospace.** Monospace is the paid product this came out of —
  projects, boards, tasks, notes, tickets, chat, bookings, an organisation
  directory, real support. This is one feature of it, lifted out and given
  away. There is no upgrade path, no trial and no upsell in here.
- **It does not build the timetable for you.** There is no solver. It will
  not allocate classes to rooms, resolve clashes or optimise anything. You
  already know what is teaching where; this formats it, keeps it consistent
  across the year, and prints it.
- **It is not an MIS and it does not talk to one.** No link to SIMS, Arbor,
  Bromcom or anything else. It does not know your pupils, your staff
  contracts or your options blocks. You tell it the day, the rooms and the
  classes.
- **There are no accounts, no logins, no cloud and no sync.** Two people
  cannot edit at once. It is a file on a computer, like a spreadsheet is.
- **Bookings are recorded, not approved.** There is no request-and-approve
  workflow; it draws the bookings you have already decided on.
- **The `.exe` is Windows only.** There is no Mac or Linux build. The `.html`
  runs everywhere, including on a Mac.

---

## Support

One person writes this, and it costs you nothing. So, honestly:

- **Bug reports and questions are welcome.** [Open an
  issue](https://github.com/camwooloo/Monospace-Timetable/issues) — including
  "I could not work out how to…", which is usually a bug in the tool and not
  in you. Every issue gets read.
- **There is no SLA, and there will not be one.** No guaranteed response
  time, no guaranteed fix, nothing out of hours. Some issues will be fixed
  the same week; some will sit.
- **September is the busiest month for me too.** If your timetable has to be
  out for the first week of term, do not make this tool your only plan in its
  first year. Generate it early, check it against what you did last year, and
  keep the old method until you are happy with this one.
- **If you need a support contract, that is what Monospace is for.** That is
  not a sales pitch — it is the honest answer to "who do I ring at 7am".

---

## Licence

**AGPL-3.0-only.** The full text is in [`LICENSE`](LICENSE).

For a school this means: use it, copy it, change it, give it to the school
down the road. Nothing to sign, nothing to report, no obligation you can trip
over by using it as intended.

Cam Wooloo owns the copyright outright and also licenses the code privately to
Monospace. The dual arrangement, and the two questions about it that are still
open, are written down in [`LICENSING.md`](LICENSING.md).

**The workbooks you produce with this are yours.** The licence covers the
program, not what you make with it.

---

## For developers

The repository is a workspace:

| | |
|---|---|
| **`packages/engine`** | The timetable model and the `.xlsx` writer, in TypeScript, running unchanged in Node and in a browser. It has [its own README](packages/engine/README.md), which is the one to read. |
| **`apps/tool`** | The front end: one self-contained `.html`, which is both the browser download and the document the shell embeds. |
| **`apps/shell`** | The portable Windows program — `wry` + `tao`. Rust owns the window, the updater, file I/O and IPC; the engine runs unchanged inside the webview. |

```bash
npm install        # workspace root
npm run gate       # ⭐ the engine fixture gate — the thing that must not go red
npm test           # the light unit tests
npm run build      # engine first, then apps/tool/dist/timetable.html
```

**There is one document, and both downloads come from it.** The release
workflow builds `apps/tool` once on Linux, attaches that file as
`timetable.html`, and hands the very same bytes to `apps/shell`'s build script
(`MONOSPACE_TIMETABLE_HTML`) to be baked into `timetable.exe`. It is never
built twice. `.github/workflows/release.yml` says why in more detail than you
probably want.

**The fixture gate is the point.** `npm run gate` regenerates the workbook and
compares it, member by member on the raw compressed bytes, against reference
files produced by Monospace's own writer. If it passes, this tool produces the
same spreadsheet the paid product does. If you change anything in the engine
and it goes red, the workbook moved — and you have to say why before you
change the fixtures.

⚠️ **It is `npm run gate`, not `npm test`, and that is deliberate.** The gate is
a plain Node program with no test runner under it: sheet protection is 100,000
synchronous SHA-512 rounds per sheet and nothing yields for tens of seconds,
which starved vitest's reporter channel and killed runs in which every test had
passed. `npm test` still runs the light unit tests, and CI runs both — but a
green `npm test` says nothing about the bytes.

Contributions: please read the
[Contributions section of `LICENSING.md`](LICENSING.md#-contributions-decide-cla-or-dco-before-the-first-one-arrives)
first. Whether patches can be accepted at all is genuinely undecided, and
merging one before it is decided would settle it by accident.
