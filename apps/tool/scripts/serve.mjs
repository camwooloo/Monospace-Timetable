/**
 * A static server for `dist/`, so the single file can be looked at in a browser
 * during development.
 *
 * ⚠️ IT IS NOT HOW THE THING SHIPS. The deliverable is `dist/timetable.html`
 * opened from `file://` or embedded in the `.exe`; this exists because a
 * headless check needs an origin. **Nothing in the app may depend on being
 * served** — no route here is fetched by the page.
 *
 * ⭐ `/dev-fixture.json` HANDS BACK THE ENGINE'S OWN FIXTURE — the exact
 * document its reference workbooks are built from. It is here so a check can
 * drive the real Open path with a realistic school (291 template cells, a
 * cleared week change, a cancelled booking, a retired room) instead of typing
 * one in. The app never asks for it; a person or a test opens it like any
 * other file.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FILE = resolve(HERE, "../dist/timetable.html");
const FIXTURE = resolve(HERE, "../../../packages/engine/fixtures/school.fixture.json");
const PORT = Number(process.env.PORT ?? 4173);

createServer(async (req, res) => {
  try {
    if ((req.url ?? "/").startsWith("/dev-fixture.json")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(await readFile(FIXTURE));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(FILE));
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(err));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
