/* Run from the repo root with the built document served on :4173.
   See README.md beside this file. Playwright is installed ad hoc, and
   CHROME may point at an already-cached browser:
     export CHROME="$HOME/Library/Caches/ms-playwright/<rev>/.../chrome-headless-shell"
   Left unset, Playwright uses whichever browser it installed itself. */
import { chromium } from "playwright";
import { doc } from "./seed.mjs";

const KEY = "monospace.timetable.doc.v1";
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 800, height: 501 }, deviceScaleFactor: 2 });
const shots = [];

const dismiss = async () => {
  for (const sel of ["#modal button", "#guide button"]) {
    for (const label of [/restore/i, /not now/i, /^close$/i, /^done$/i]) {
      const b = page.locator(sel, { hasText: label }).first();
      if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(350); }
    }
  }
};
/* ⚠️ TOASTS ARE TIMED, so a screenshot taken too soon carries "Restored. It
   still needs saving to a file." across the bottom of a marketing image. Wait
   for the node to leave the DOM rather than guessing at a delay. */
const settle = async () => {
  await page.waitForFunction(() => !document.querySelector(".toast, #toasts > *"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
};
const shot = async (name) => { await settle(); await page.screenshot({ path: `shots/${name}.png` }); shots.push(name); };
const tab = (n) => page.locator(".tabstrip .seg button", { hasText: n }).first();
const rail = (s) => page.locator(`.rail-btn[data-screen="${s}"]`);

await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await page.evaluate(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), [KEY, doc]);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
await dismiss();

await tab("Rota").click();
await page.waitForTimeout(400);

/* ── the rota itself, which is the picture worth having ── */
await rail("rota-schedule").click();
await page.waitForTimeout(600);
await page.evaluate(() => {
  const h = [...document.querySelectorAll("#scroll h2")].find((x) => /^The rota$/.test(x.textContent || ""));
  if (h) h.scrollIntoView({ block: "start" });
});
await shot("07-rota-schedule");

await rail("rota-list").click();
await page.waitForTimeout(600);
await page.evaluate(() => {
  const h = [...document.querySelectorAll("#scroll h2")].find((x) => /Rooms/i.test(x.textContent || ""));
  if (h) h.scrollIntoView({ block: "start" });
});
await shot("08-rota-list");

await rail("rota-export").click();
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById("scroll")?.scrollTo(0, 0));
await shot("09-rota-export");

/* ── the preset picker, from an empty document ── */
await page.evaluate((k) => { localStorage.removeItem(k); localStorage.removeItem("monospace.timetable.meta.v1"); }, KEY);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1100);
await dismiss();
await tab("Rota").click();
await page.waitForTimeout(500);
/* ⚠️ DISPATCHED, NOT CLICKED. Playwright waits for the element to be "stable",
   and the empty state sits inside a card whose entrance transition never quite
   settles for its actuality check — so a real click times out on an element
   that is perfectly visible. */
await page.evaluate(() => {
  const b = [...document.querySelectorAll("#scroll button")].find((x) => /new rota/i.test(x.textContent || ""));
  b?.click();
});
await page.waitForTimeout(700);
await shot("10-rota-presets");

console.log("  captured: " + shots.join(", "));
await browser.close();
process.exit(0);
