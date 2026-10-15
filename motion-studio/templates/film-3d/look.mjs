// node look.mjs looks.json [name,name] — renders look-dev frames → out/look/<name>.png + out/look/sheet.jpg
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { serve, gpuPage } from "./lib/browser.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(HERE, process.argv[2] || "looks.json"), "utf8"));
const only = process.argv[3] ? process.argv[3].split(",") : null;
const OUT = path.join(HERE, "out", "look"); fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve(HERE);
const { browser, page } = await gpuPage(1080, 1920);
await page.goto(url("look.html"));
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const done = [];
for (const [name, o] of Object.entries(spec)) {
  if (only && !only.includes(name)) continue;
  const r = await page.evaluate((o) => window.look(o), o);
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: f });
  console.log(name, r.ms, "ms", JSON.stringify(r.anchors));
  done.push(f);
}
await browser.close(); server.close();
// contact sheet (half size)
if (done.length > 1) {
  const args = []; done.forEach((f) => args.push("-i", f));
  const n = done.length, filt = done.map((_, i) => `[${i}]scale=360:640[s${i}]`).join(";") + ";" + done.map((_, i) => `[s${i}]`).join("") + `hstack=inputs=${n}`;
  spawnSync("ffmpeg", ["-v", "error", "-y", ...args, "-filter_complex", filt, path.join(OUT, "sheet.jpg")], { stdio: "inherit" });
}
