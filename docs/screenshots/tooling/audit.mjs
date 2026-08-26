/* Run from the repo root with the built document served on :4173.
   See README.md beside this file. Playwright is installed ad hoc, and
   CHROME may point at an already-cached browser:
     export CHROME="$HOME/Library/Caches/ms-playwright/<rev>/.../chrome-headless-shell"
   Left unset, Playwright uses whichever browser it installed itself. */
import { chromium } from "playwright";
import { doc } from "./seed.mjs";
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await page.evaluate(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), ["monospace.timetable.doc.v1", doc]);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
for (const t of [/restore/i, /not now/i, /^close$/i]) {
  const x = page.locator("#modal button, #guide button", { hasText: t }).first();
  if (await x.count()) { await x.click().catch(()=>{}); await page.waitForTimeout(300); }
}
await page.locator(".tabstrip .seg button", { hasText: "Rota" }).first().click();
await page.waitForTimeout(400);

const report = [];
for (const screen of ["rota-list", "rota-schedule", "rota-columns", "rota-export"]) {
  await page.locator(`.rail-btn[data-screen="${screen}"]`).click();
  await page.waitForTimeout(500);
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("#scroll input, #scroll select, #scroll textarea")) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      // the browser default is rgb(255,255,255) / rgba(0,0,0,0)+white; flag anything near-white
      const m = bg.match(/\d+/g)?.map(Number) ?? [];
      const nearWhite = m.length >= 3 && m[0] > 230 && m[1] > 230 && m[2] > 230 && (m[3] === undefined || m[3] > 0.5);
      // and clipping: scrollWidth beating clientWidth means text is cut off
      const clipped = el.tagName !== "SELECT" && el.scrollWidth > el.clientWidth + 1;
      if (nearWhite || clipped)
        out.push({ tag: el.tagName, cls: el.className, bg, clipped, w: el.clientWidth, sw: el.scrollWidth });
    }
    return out;
  });
  report.push([screen, bad]);
}
for (const [s, bad] of report)
  console.log(`  ${s.padEnd(16)} ${bad.length === 0 ? "✓ no white boxes, no clipped fields" : "✗ " + JSON.stringify(bad.slice(0,3))}`);
await b.close(); process.exit(0);
