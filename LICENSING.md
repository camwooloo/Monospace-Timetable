# Licensing

**This is a record of intent written by the copyright holder, who is not a
lawyer. It is not legal advice, and the section marked "has not had a
solicitor" means exactly that.**

Last reviewed: 2026-08-25.

---

## The short version

| Who | Terms |
|---|---|
| Everyone | **AGPL-3.0-only** — the full text is in [`LICENSE`](LICENSE). |
| **Monospace** (Cam's commercial product) | A **separate private grant**, described below, on terms other than the AGPL. |
| Anyone else wanting non-AGPL terms | Nothing yet. Ask. |

All of that is possible for one reason: **Cam Wooloo holds the copyright in
this code outright.** A copyright holder may licence the same work to
different people on different terms as many times as they like. That is the
entire mechanism, and it survives only for as long as the copyright stays in
one pair of hands — which is what the [Contributions](#-contributions-decide-cla-or-dco-before-the-first-one-arrives)
section is about.

---

## Why AGPL, and not MIT

The purpose of this project is that **a school with no budget still gets the
timetable workbook**. AGPL serves that directly:

- A school may download it, run it, modify it, and hand it to the school down
  the road. Running it internally carries no obligation beyond keeping the
  licence with the copy. **No school will ever trip over the AGPL by using
  this tool as intended.**
- Anyone who takes the code, improves it, and runs the result **as a service
  other people use over a network** must offer those users the source of what
  they are running. That is §13, the clause that makes AGPL different from
  GPL.

The thing being prevented is narrow and specific: this being taken, closed,
and sold back to schools that cannot afford it. MIT would permit that. AGPL
does not.

It also costs nothing to give away, because of the grant below.

---

## The private grant to Monospace

Much of this code originates in **Monospace**, which is closed-source and
commercial. Cam wrote both, and owns both.

> **Grant.** Cam Wooloo grants the Monospace product, and the legal entity
> that owns it, a perpetual, irrevocable, worldwide, royalty-free licence to
> use, modify, combine and distribute any part of this repository authored by
> Cam Wooloo, under terms of Cam's choosing, **without the obligations of the
> AGPL**. This grant is not sublicensable to third parties and is not offered
> to anyone else.

Writing it down rather than leaving it implied is the whole point of this
file. Three reasons:

1. **Future Cam needs to know what was granted**, in what words, and when.
   An unwritten intention is not a grant.
2. **Diligence reads documents, not intentions.** An investor, an acquirer or
   a large customer asking "is your product encumbered by an AGPL
   dependency?" needs an answer they can put in a file.
3. **If it is ever disputed**, a dated grant in a public repository is
   evidence. A memory is not.

⚠️ **Two things about this grant are unfinished.** It names "the legal entity
that owns Monospace" without naming it, because the entity should be written
in explicitly once it is settled; and a grant from a sole owner to their own
company may need to be a signed agreement between two legal persons to be
worth anything at all. Both are on the solicitor's list below.

---

## ⚠️ Contributions: decide CLA or DCO **before the first one arrives**

**Nothing is decided. Decide it before merging anyone else's code, not
after.**

The moment somebody else's patch is merged, **they** own the copyright in
their part of it. From then on, licensing this project on any terms other
than the AGPL needs their permission too — and the private grant above can no
longer honestly cover the whole codebase.

Relicensing afterwards means finding every contributor and getting each one to
agree. Some will have changed jobs, some will be pseudonymous, some will be
unreachable, and it takes only one refusal. **Projects have been permanently
stuck this way.** It is close to unfixable, which is why it has to be settled
in advance.

The three real options:

### CLA — Contributor Licence Agreement
The contributor signs a document granting Cam a broad licence to their
contribution, **explicitly including the right to relicense it**.

- ✅ The only option that keeps dual licensing fully intact as the project
  grows.
- ❌ Heaviest. It is a legal document people must actually sign, it needs
  drafting properly, and a meaningful number of contributors will decline on
  principle. For a small tool it can be more friction than the contributions
  are worth.

### DCO — Developer Certificate of Origin
A `Signed-off-by:` line in each commit, certifying the contributor has the
right to submit the work under the project's licence. Light, familiar, no
paperwork.

- ✅ Almost no friction. Well understood. Enforceable by a bot.
- ⚠️ **It does NOT grant relicensing rights.** A DCO contribution arrives
  under the AGPL and stays under the AGPL. Under a DCO alone, the private
  grant to Monospace can only ever cover **the code Cam wrote**, and every
  merged patch shrinks the part of the repository Monospace can lawfully use.
  This is the trap: a DCO looks like it solves the problem and does not solve
  this one.

### Accept no outside code
Bug reports and feature requests welcome; patches politely declined.

- ✅ The cheapest way to keep the copyright in one pair of hands, and entirely
  respectable for a small tool with one maintainer.
- ❌ Turns away help, and has to be said out loud in the README and in the
  pull request template, with the reason, or it just reads as rudeness.

**Until one of the three is chosen, the safe posture is: issues yes, merged
patches no.** Merging one pull request without a policy in place *is* the
decision — made by accident, and irreversibly.

There is deliberately no `CONTRIBUTING.md` and no pull request template in
this repository yet, because writing either one would quietly settle this.

---

## ⚠️ The AGPL question for a hosted product has not had a solicitor

Monospace is a **hosted** product. AGPL §13 — "Remote Network Interaction" —
is precisely the clause that bears on hosted software, and it is the reason
AGPL was written at all.

The intended answer is that the question never arises for Monospace, because
Monospace does not use this code under the AGPL: it uses it under the private
grant above, from the person who owns it. **That reasoning has not been
checked by anyone qualified.** It is a lay reading by the copyright holder,
and it is written here so that its status is not mistaken for a settled
position.

Specifically unresolved, and worth a solicitor's hour before Monospace ships
any code from this repository, or before anyone else is offered non-AGPL
terms:

- Does a grant written by a sole owner to their own company need to be a
  formal, signed agreement between two legal persons to have effect?
- Which legal entity is the grantee, and does it need naming explicitly?
- Is Monospace's use "conveying" under §5–6, "remote network interaction"
  under §13, both, or neither — and does the grant make the distinction moot
  in fact as well as in intention?
- What happens to the grant if the copyright is assigned, or the company is
  sold, or the two are separated?
- Do the licences of the third-party dependencies constrain the combination?
  (`exceljs` is MIT and gives no trouble; the rest of the tree has not been
  audited line by line.)
- If a CLA is chosen later, does it need to be retroactive, and how?

**None of the above is answered here on purpose.** Guessing at it in a
document like this one is worse than admitting it is open.

---

## What is covered, and what is not

- [`LICENSE`](LICENSE) is the GNU Affero General Public License v3.0,
  reproduced **verbatim**. It has not been edited, trimmed or annotated, and
  it must not be — the licence text itself only permits verbatim copies.
- **`packages/engine`** is AGPL-3.0-only, and says so in its own
  `package.json`.
- **Third-party dependencies keep their own licences.** The AGPL applies to
  this project's code, not to everything it is built with.
- **The workbooks this tool produces belong to the school that produced
  them.** The licence covers the program, not the output. Nothing in the AGPL
  reaches a timetable.

---

## Getting in touch about licensing

Open an issue, or contact Cam directly. Requests for non-AGPL terms are
considered on the merits — the copyright is in one pair of hands, which is
exactly what makes that possible.
