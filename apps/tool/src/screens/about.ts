/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ ABOUT — AND THE SOURCE LINK IS NOT DECORATION, IT IS THE LICENCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This program is AGPL-3.0. **§13 makes an offer of the Corresponding Source
 * non-optional the moment the page is SERVED from a web server rather than
 * downloaded** — and this exact document is meant to be both: the `.html` a
 * school saves to a shared drive, and a page somebody inevitably puts behind a
 * URL. A link that exists only on the downloaded copy would be the wrong way
 * round, and retrofitting it once schools have copies is worse.
 *
 * ⚠️ SO IT IS ALWAYS VISIBLE, ON EVERY TARGET, and it points at the repository
 * that builds THIS file. It is in the rail as well as here, because a licence
 * obligation behind a menu is a licence obligation somebody can ship without.
 */

import { SCHOOL_DOCUMENT_EXTENSION, SCHOOL_DOCUMENT_VERSION } from "../engine";
import { button, card, h, notice } from "../dom";
import { host, isShell } from "../host";
import { toast } from "../ui";
import { openGuide } from "../guide";

export const REPO_URL = "https://github.com/camwooloo/Monospace-Timetable";
/** ⚠️ `monospace.sh` DOES NOT RESOLVE and was the link on all three promotion
 *  points — the one job those links have. The live site is this one. */
export const MONOSPACE_URL = "https://www.monospace.page";

export function aboutScreen(): HTMLElement {
  return h(
    "div.stack",
    null,
    card(
      "Monospace Timetable",
      "The timetable workbook Monospace produces, as a tool a school can run for nothing. No server, no account, no network — the file on your disk is all the data there is.",
      h(
        "div.row",
        null,
        button("Source code", {
          icon: "file",
          cls: "primary",
          onclick: () => host.openExternal(REPO_URL),
        }),
        /* ⭐ THE SECOND WAY BACK INTO THE WALKTHROUGH. The rail has the other
           one. Somebody looking for help opens About — it is the screen with
           the word "about" on it — and finding only a licence there is the
           small failure that ends with them ringing the last person instead. */
        button("Walk me through it", {
          icon: "compass",
          onclick: () => openGuide(0),
        }),
        /* ⭐ ONLY IN THE DESKTOP APP. A browser has nothing to update — the
           page IS the release — and a button that always answers "you have the
           latest" is a button that teaches people not to trust it.
           ⚠️ The answer arrives through `onUpdate` in `main.ts`, not from this
           call: Rust checks on its own thread, because on a school connection
           it is a network round trip that can take a while or never finish. */
        isShell
          ? button("Check for updates", {
              icon: "download",
              onclick: () => {
                toast("Checking for updates…", "", 3000);
                host.checkForUpdate(true);
              },
            })
          : null,
        h("span.mono.tiny.mut", null, REPO_URL),
      ),
      h(
        "p.hint",
        { style: { marginTop: "16px", marginBottom: "0" } },
        /* ⚠️ NO PERSON NAMED HERE. This read "Cam Wooloo owns the copyright",
           which put its own author into a screen a school reads — in the third
           person — where the subject should be the program and what it costs
           them. The copyright notice lives in LICENSE, which is where a
           licence notice belongs and where AGPL-3.0 §4 asks for it. */
        "Licensed AGPL-3.0-only — free to use, free to change, free to share. Section 13 of that licence means anyone who runs this as a website has to offer its source to the people using it, which is why the link above is on every screen rather than in a menu.",
      ),
    ),
    /* ══════════════════════════════════════════════════════════════════
       ⭐⭐ WHAT THIS IS A PIECE OF — the screen's second job
       ══════════════════════════════════════════════════════════════════

       This card replaced a sentence naming the author. About is the one screen
       where a school asks "what IS this, and who is behind it" — the honest
       answer is not a person's name, it is that the timetable engine came out
       of a product and the rest of that product is there if they want it.

       ⚠️ IT IS THE SAME PITCH AS THE README, DELIBERATELY. A school that finds
       this on GitHub and a school that finds it in the app should be told the
       same thing; two versions of one pitch is two things to keep true. Keep
       them in step. */
    card(
      "This is one piece of something bigger",
      "Monospace Timetable is the timetable engine out of Monospace — an all-in-one project management app that happens to suit schools very well.",
      h(
        "p.hint",
        { style: { margin: "0 0 14px" } },
        "A school runs on departments, and Monospace is built that way: IT Support, Site Team, Finance and the rest each get their own space, with the boards, tasks, notes, pages, chat and tickets that department actually needs and nothing it does not.",
      ),
      h(
        "ul",
        { class: "dim", style: { fontSize: "12.5px", lineHeight: "1.7", paddingLeft: "18px", margin: "0 0 16px" } },
        h(
          "li",
          null,
          h("b", null, "Timetable & Booking — "),
          "this generator, plus a live booking board for rooms and minibuses that every department books against, so two departments cannot take the same minibus on the same Tuesday.",
        ),
        h(
          "li",
          null,
          h("b", null, "Inventory — "),
          "sites, buildings, rooms and every asset in them, with warranties, licences, suppliers and depreciation.",
        ),
        h("li", null, h("b", null, "Helpdesk — "), "staff raise tickets, your team works them."),
        h(
          "li",
          null,
          h("b", null, "Pages — "),
          "the internal reference pages a school accumulates: printers, servers, who to ring.",
        ),
      ),
      h(
        "div.row",
        null,
        button("Have a look", {
          icon: "file",
          cls: "primary",
          onclick: () => host.openExternal(MONOSPACE_URL),
        }),
        h("span.mono.tiny.mut", null, "monospace.page"),
      ),
      h(
        "p.hint",
        { style: { marginTop: "14px", marginBottom: "0" } },
        "⚠️ And a year moves between the two either way as a .timetable.json — out of Monospace to build the workbook here, or out of here when a school is ready to move in. Nothing is typed twice.",
      ),
    ),
    card(
      "Your file",
      `Saved as ${SCHOOL_DOCUMENT_EXTENSION} — plain JSON, format ${SCHOOL_DOCUMENT_VERSION}. Open it in a text editor if you like; it is meant to be readable.`,
      h(
        "ul",
        { class: "dim", style: { fontSize: "12.5px", lineHeight: "1.7", paddingLeft: "18px", margin: "0" } },
        h(
          "li",
          null,
          h("b", null, "A file from a newer version will not open. "),
          "That is deliberate. Reading what this copy understands and dropping the rest produces a timetable that looks complete and is wrong, and a school handed a quietly incomplete timetable teaches from it.",
        ),
        h(
          "li",
          null,
          h("b", null, "An older file is brought forward automatically, "),
          "one version at a time, and it always opens.",
        ),
        h(
          "li",
          null,
          h("b", null, "Nothing derived is stored. "),
          "The 39 weeks, the cycle position of each, the half-term blocks and every class colour are calculated from the rule every time the file is opened — so the file cannot disagree with itself.",
        ),
        h(
          "li",
          null,
          h("b", null, "The export password is never in it. "),
          "It is typed for one export and forgotten. A password in the saved file is a password in the mail attachment.",
        ),
      ),
    ),
    card(
      "What the browser can and cannot do",
      null,
      notice(
        "warn",
        h("b", null, "The local backup is a courtesy, not a save. "),
        "This app keeps a copy in the browser so a closed tab does not cost you an afternoon. It lives in one browser profile on one machine, and “clear browsing data” takes it. ",
        h("b", null, "Save the file."),
      ),
      host.kind === "shell"
        ? notice(
            "good",
            h("b", null, "Running as the desktop app. "),
            `Open and Save use real file dialogs, and updates arrive automatically. Version ${host.version}.`,
          )
        : notice(
            "",
            h("b", null, "Running in a browser. "),
            "Open reads a file you pick; Save downloads one. Everything happens on this machine — nothing is uploaded anywhere, and the page works with the network unplugged.",
          ),
    ),
    card(
      "Credit where it is due",
      null,
      h(
        "p.hint",
        { style: { margin: "0" } },
        "The engine — the cycle arithmetic, the class palette, the cell-precedence rules and the .xlsx writer — is Monospace's own code, extracted so it runs in Node and in a browser from one source. The workbook this produces is compared byte for byte against one generated by Monospace's writer on every build; 49 of the 50 zip members are identical, and the one that differs is the clock.",
      ),
    ),
  );
}
