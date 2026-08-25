# Monospace Timetable

Make a school room timetable, and get a properly formatted Excel workbook out of it.

Free, no account, no upload. Your timetable stays on your computer.

![The standing timetable](docs/screenshots/01-grid-dark.png)

---

## Get it

**[Download the latest release →](https://github.com/camwooloo/Monospace-Timetable/releases/latest)**

| | |
|---|---|
| **`timetable.html`** | One file. Double-click it. Works in any browser, on any computer — Windows, Mac, Chromebook — with nothing installed and no admin rights. |
| **`timetable.exe`** | Portable Windows app. No installer, nothing left in your registry, runs from a USB stick or a network share. Updates itself. |

Both are built from the same code in the same job, so they behave identically.

> **Windows will warn you about the `.exe`.** It says *"Windows protected your PC"* because the file
> isn't code-signed — a certificate costs a few hundred pounds a year and this is free. Click
> **More info → Run anyway**. If your school blocks it, use `timetable.html` instead; it needs no
> permission from anyone.

---

## What you do

Fill in five things down the left-hand side, in order:

- **Year** — first day, last day, and whether you run a one, two or three week cycle
- **Closed** — holidays, INSET days, bank holidays
- **Day** — your periods, breaks and times
- **Rooms** — the room codes, and any columns you want printed under them
- **Grid** — type the standing timetable straight in

Then **Export**, and you have the workbook.

![Setting up the day](docs/screenshots/03-day.png)

---

## Never done this before?

**The app will walk you through it.** Ten steps with Next and Back, and each one
takes you to the screen it is talking about and points at the control you need —
so you are doing it as you read it, rather than reading first and doing it after.

![The walkthrough](docs/screenshots/06-walkthrough.png)

Each step also tells you whether that part is finished, and says plainly which
three are optional — closures, one-off week changes and the colour are all things
you can export a perfectly good workbook without.

It offers itself the first time you open the app. After that it is in the left
rail under **Guide**, so it is there again in August when somebody new picks this
up.

---

## What you get

One sheet per week for the whole year, plus your templates and a half-term overview.

- Colour-coded sheet tabs, so you can see at a glance which week is which
- A colour per class code — the same class is the same colour everywhere
- Alternating day blocks and break rows, so a week reads at arm's length
- Custom columns under each room — *No of PCs*, *Teacher*, *Telephone*, whatever you need

Four optional switches, each of which tells you plainly what it does **and what it costs**:

![The export options](docs/screenshots/02-export.png)

- **Weeks follow the templates** — edit a template in Excel and every week using it fills in
- **Hide ended weeks** — finished weeks are hidden, never deleted
- **Protect the templates** — the standing timetable becomes read-only
- **Lock the timetabled lessons** — staff can fill in free periods and nothing else

And you can set the colour the workbook is built around:

![Choosing the school's colour](docs/screenshots/04-colour.png)

Light theme too, if you prefer:

![Light theme](docs/screenshots/05-grid-light.png)

---

## Your file

**Save** writes a `.json` file wherever you choose — put it on a shared drive and anyone can open it.
The browser keeps a courtesy copy so a closed tab doesn't lose your afternoon, but that copy is not a
save and the app says so.

Nothing is uploaded. There is no server. Turn off the internet and it still works.

---

## This is one feature of something bigger

Monospace Timetable is a slice of **[Monospace](https://monospace.sh)** — an all-in-one project
management app that happens to be very well suited to schools.

A school runs on departments, and Monospace is built that way: **IT Support**, **Site Team**,
**Finance** and the rest each get their own space, with the boards, tasks, notes, pages, chat and
tickets that department actually needs, and nothing it doesn't.

Around them sit the things that belong to the whole school rather than one department:

- **Timetable & Booking** — this generator, plus a live booking board for rooms and minibuses that
  every department books against, so two departments can't take the same minibus on the same Tuesday
- **Inventory** — sites, buildings, rooms and every asset in them, with warranties, licences,
  suppliers and depreciation. The thing Civica Parago does, without the price
- **Helpdesk** — staff raise tickets, your team works them
- **Pages** — the internal reference pages a school accumulates: printers, servers, who to ring

If the timetable generator is useful to you, the rest probably is too.
**[Have a look →](https://monospace.sh)**

---

## Questions and problems

Open an issue. Genuinely, please do — a bug report from a real school is worth more than any amount
of testing here.

**No SLA, no support email.** This is free and maintained by one person who also has a day job. Issues
are read and acted on when there's time; September is a busy month for everyone.

## Licence

[AGPL-3.0](LICENSE). Free to use, free to change, free to share. See [LICENSING.md](LICENSING.md).
