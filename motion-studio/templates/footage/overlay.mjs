// overlay.mjs — the comp (transparent graphics) over out/base.mp4 (the footage).
//   env EDIT (default edit.json), OUTD (default out/<edit name>), COMP (comp.html), SEC=1 → sheet times in seconds instead of beats
//   node overlay.mjs sheet 0,4,8.5,16.2 [name]   → <OUTD>/<name|sheet>.jpg   composited previews (times in beats)
//   node overlay.mjs audit [step]                → overlap / safe-area report of the graphics
//   node overlay.mjs events                      → events.json
//   node overlay.mjs render                      → out/video.mp4          every frame: transparent PNG piped into ffmpeg, overlaid in RGB
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve, gpuPage } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), EDIT = process.env.EDIT || "edit.json";
const OUT = path.join(HERE, process.env.OUTD || path.join("out", path.basename(EDIT, ".json"))), BASE = path.join(OUT, "base.mp4");
const [EW, EH] = JSON.parse(fs.readFileSync(path.join(HERE, EDIT), "utf8")).size || [1080, 1920];
const W = EW, H = EH, [mode = "sheet", ...args] = process.argv.slice(2);
const { server, url } = await serve(HERE);
const { browser, page } = await gpuPage(W, H);
await page.goto(url((process.env.COMP || "comp.html") + "?edit=" + EDIT), { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
const DUR = await page.evaluate(() => window.DUR), FPS = await page.evaluate(() => window.FPS), BEAT = 60 / await page.evaluate(() => window.BPM);
const N = Math.round(DUR * FPS);
const shot = async (t) => { const r = await page.evaluate((t) => window.renderAt(t), t); const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true }); return { png: Buffer.from(data, "base64"), r }; };
const done = async () => { await browser.close(); server.close(); };

if (mode === "events") {
  const ev = await page.evaluate(() => window.EVENTS); fs.writeFileSync(path.join(HERE, "events.json"), JSON.stringify({ ...ev, DUR, FPS }, null, 1)); console.log("wrote events.json");
} else if (mode === "sheet") {
  // the footage frame goes behind the transparent stage as the page background, so the screenshot is the composite
  const bs = args[0].split(",").map(Number), name = args[1] || "sheet", imgs = [];
  for (const b of bs) {
    const f = Math.min(N - 1, Math.round((process.env.SEC ? b : b * BEAT) * FPS));
    const jpg = spawnSync("ffmpeg", ["-v", "error", "-i", BASE, "-vf", `select=eq(n\\,${f})`, "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", "-q:v", "3", "-"], { maxBuffer: 1 << 26 }).stdout;
    await page.evaluate((d) => { document.body.style.background = `url(data:image/jpeg;base64,${d}) center/cover`; }, jpg.toString("base64"));
    const { r } = await page.evaluate((t) => window.renderAt(t).then((r) => ({ r })), f / FPS);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
    imgs.push({ b, t: f / FPS, b64: data, shot: r.shot }); process.stdout.write(".");
  }
  await page.evaluate(() => { document.body.style.background = "transparent"; });
  const cols = Math.min(parseInt(process.env.COLS || "6"), imgs.length), tw = parseInt(process.env.TW || "300"), th = Math.round(tw * H / W);
  const sheet = await browser.newPage({ viewport: { width: cols * (tw + 8) + 8, height: 400 } });
  await sheet.setContent(`<body style="margin:0;background:#1a1a1a;padding:4px;display:flex;flex-wrap:wrap;width:${cols * (tw + 8)}px;font:600 14px system-ui;color:#ddd">
    ${imgs.map((i) => `<div style="margin:4px;width:${tw}px"><img style="width:${tw}px;height:${th}px;display:block" src="data:image/jpeg;base64,${i.b64}"><div style="padding:3px 0">${i.t.toFixed(2)} s · b${i.b} · ${i.shot}</div></div>`).join("")}</body>`);
  const f = path.join(OUT, `${name}.jpg`); await sheet.screenshot({ path: f, fullPage: true, type: "jpeg", quality: 88 }); console.log(" wrote", f);
} else if (mode === "audit") {
  const step = parseFloat(args[0] || ".25"), issues = [], m = 14, hit = (a, b) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
  for (let b = 0; b < DUR / BEAT; b += step) {
    await page.evaluate((t) => window.renderAt(t), b * BEAT); const a = await page.evaluate((t) => window.auditAt(t), b * BEAT); const tag = `b${b.toFixed(2)}`;
    a.texts.forEach((x, i) => {
      const s = a.safe; if (x.box[0] < s[0] || x.box[2] > s[2] || x.box[1] < s[1] || x.box[3] > s[3]) issues.push(`${tag} SAFE ${x.id} [${x.box}]`);
      for (const p of a.products) if (hit(x.box, p)) issues.push(`${tag} OVERLAP ${x.id} × product [${p}]`);
      a.texts.slice(i + 1).forEach((y) => { if (hit(x.box, y.box)) issues.push(`${tag} OVERLAP ${x.id} × ${y.id}`); });
    });
  }
  console.log(issues.length ? issues.join("\n") + `\n${issues.length} issues` : "audit ok");
} else if (mode === "render") {
  const nb = parseInt(spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", BASE], { encoding: "utf8" }).stdout);
  if (nb !== N) console.log(`warning: base.mp4 has ${nb} frames, the comp ${N}`);
  const fc = "[0:v]scale=in_color_matrix=bt709:in_range=tv,format=gbrp[b];[1:v]format=gbrap[o];[b][o]overlay=0:0:format=gbrp,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-i", BASE, "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-filter_complex", fc,
    "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-frames:v", String(N), "-movflags", "+faststart", path.join(OUT, "video.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  const closed = new Promise((r) => ff.on("close", r)); const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const { png } = await shot(i / FPS);
    await new Promise((r) => ff.stdin.write(png) ? r() : ff.stdin.once("drain", r));
    if ((i + 1) % 150 === 0) console.log(`overlay ${i + 1}/${N} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end(); const code = await closed; console.log(code === 0 ? `wrote ${path.relative(HERE, OUT)}/video.mp4 (${N} frames)` : `ffmpeg failed (${code})`);
}
await done();
