// render.mjs — frame-exact capture of comp.html with GPU Chromium (Playwright) + ffmpeg.
//   node render.mjs frame 4.7 [q]                 → out/frame-4.70.png            (q = quality multiplier: 3D samples; ignored by 2D)
//   node render.mjs sheet 0.5,3,6 [q] [name]      → out/<name|sheet>.jpg          (labelled contact sheet; env COLS, TW)
//   node render.mjs beats 0,2,4.5 [q] [name]      → same, times in beats
//   node render.mjs events                        → events.json                   (window.EVENTS, for audio.py)
//   node render.mjs audit [stepBeats]             → overlap / safe-area report    (needs window.auditAt)
//   node render.mjs verify [t,t,…] [q]            → frames rendered in and out of order must be identical
//   node render.mjs frames [q] [from] [to]        → out/frames/f_NNNN.png         (resumable; fine for short 2D films)
//   node render.mjs encode                        → out/video.mp4 from out/frames (H.264 CRF 14, BT.709)
//   node render.mjs chunks [k0] [k1]              → out/chunks/c_NNN.mp4          (1-s chunks, resumable; env NICE_MS, DUTY = gentle mode;
//                                                                                    env SUB = motion-blur sub-frames, SHUTTER = 0.5)
//   node render.mjs concat                        → out/video.mp4 from the chunks (stream copy)
// Env W / H override the frame size (default 1080 × 1920).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve, gpuPage } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out"); fs.mkdirSync(OUT, { recursive: true });
const FR = path.join(OUT, "frames");
const W = parseInt(process.env.W || "1080"), H = parseInt(process.env.H || "1920");
const [mode = "sheet", ...args] = process.argv.slice(2);
const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

if (mode === "encode") {
  const fps = JSON.parse(fs.existsSync(path.join(HERE, "events.json")) ? fs.readFileSync(path.join(HERE, "events.json"), "utf8") : "{}").FPS || 30;
  const n = fs.readdirSync(FR).filter((f) => /^f_\d{4}\.png$/.test(f)).length;
  console.log("frames on disk:", n);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(FR, "f_%04d.png"),
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high",
    ...BT709, "-movflags", "+faststart", path.join(OUT, "video.mp4")], { stdio: "inherit" });
  process.exit(r.status);
}
if (mode === "concat") {
  const CH = path.join(OUT, "chunks"), list = fs.readdirSync(CH).filter((f) => /^c_\d{3}\.mp4$/.test(f)).sort();
  fs.writeFileSync(path.join(CH, "list.txt"), list.map((f) => `file '${f}'`).join(String.fromCharCode(10)));
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(CH, "list.txt"), "-c", "copy", "-movflags", "+faststart", path.join(OUT, "video.mp4")], { stdio: "inherit" });
  console.log(`concat ${list.length} chunks →`, r.status === 0 ? "out/video.mp4" : "FAILED");
  process.exit(r.status);
}

const { server, url } = await serve(HERE);
const { browser, page } = await gpuPage(W, H);
await page.goto(url("comp.html"), { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
const DUR = await page.evaluate(() => window.DUR), FPS = await page.evaluate(() => window.FPS || 30), BEAT = 60 / await page.evaluate(() => window.BPM || 120);
const cdp = await page.context().newCDPSession(page);
async function shot(t, q = 1, fmt = "png") {
  const r = await page.evaluate(([t, q]) => window.renderAt(t, q), [t, q]);
  const { data } = await cdp.send("Page.captureScreenshot", fmt === "png" ? { format: "png", optimizeForSpeed: true } : { format: "jpeg", quality: 80 });
  return { buf: Buffer.from(data, "base64"), r: r || {} };
}
const done = async () => { await browser.close(); server.close(); };

if (mode === "events") {
  const ev = await page.evaluate(() => window.EVENTS || {});
  fs.writeFileSync(path.join(HERE, "events.json"), JSON.stringify({ ...ev, DUR, FPS }, null, 1)); console.log("wrote events.json");
} else if (mode === "frame") {
  const t = parseFloat(args[0]), q = parseFloat(args[1] || "1");
  const { buf, r } = await shot(t, q); const f = path.join(OUT, `frame-${t.toFixed(2)}.png`); fs.writeFileSync(f, buf); console.log("wrote", f, r);
} else if (mode === "sheet" || mode === "beats") {
  let ts = args[0].split(",").map(Number); if (mode === "beats") ts = ts.map((b) => b * BEAT);
  const q = parseFloat(args[1] || ".25"), name = args[2] || "sheet";
  const imgs = [], t0 = Date.now();
  for (const t of ts) { const { buf, r } = await shot(t, q, "jpeg"); imgs.push({ t, b: t / BEAT, b64: buf.toString("base64"), shot: r.shot || "" }); process.stdout.write("."); }
  console.log(` ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const cols = Math.min(parseInt(process.env.COLS || "6"), imgs.length), tw = parseInt(process.env.TW || "300"), th = Math.round(tw * H / W);
  const sheet = await browser.newPage({ viewport: { width: cols * (tw + 8) + 8, height: 400 } });
  await sheet.setContent(`<body style="margin:0;background:#1a1a1a;padding:4px;display:flex;flex-wrap:wrap;width:${cols * (tw + 8)}px;font:600 14px system-ui;color:#ddd">
    ${imgs.map((i) => `<div style="margin:4px;width:${tw}px"><img style="width:${tw}px;height:${th}px;display:block" src="data:image/jpeg;base64,${i.b64}"><div style="padding:3px 0">${i.t.toFixed(2)} s · b${i.b.toFixed(2)} · ${i.shot}</div></div>`).join("")}</body>`);
  const f = path.join(OUT, `${name}.jpg`); await sheet.screenshot({ path: f, fullPage: true, type: "jpeg", quality: 88 }); console.log("wrote", f);
} else if (mode === "audit") {
  // every text ink box vs every other text and the product boxes (14 px margin), and vs the safe area
  const step = parseFloat(args[0] || ".25"), issues = [], m = 14;
  const hit = (a, b) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
  for (let b = 0; b < DUR / BEAT; b += step) {
    await page.evaluate((t) => window.renderAt(t, .05), b * BEAT);
    const a = await page.evaluate((t) => window.auditAt ? window.auditAt(t) : null, b * BEAT);
    if (!a) { console.log("comp has no window.auditAt — add one (see references/design-rules.md §6)"); break; }
    const tag = `b${b.toFixed(2)} (${(b * BEAT).toFixed(2)} s)`;
    a.texts.forEach((x, i) => {
      const s = a.safe; if (s && (x.box[0] < s[0] || x.box[2] > s[2] || x.box[1] < s[1] || x.box[3] > s[3])) issues.push(`${tag} SAFE ${x.id} [${x.box}]`);
      for (const p of a.products || []) if (hit(x.box, p)) issues.push(`${tag} OVERLAP ${x.id} × product [${p}]`);
      a.texts.slice(i + 1).forEach((y) => { if (hit(x.box, y.box)) issues.push(`${tag} OVERLAP ${x.id} × ${y.id}`); });
    });
  }
  console.log(issues.length ? issues.join("\n") + `\n${issues.length} issues` : "audit ok");
} else if (mode === "verify") {
  const ts = (args[0] || [.1, .3, .55, .8].map((f) => (f * DUR).toFixed(2)).join(",")).split(",").map(Number), q = parseFloat(args[1] || ".25");
  const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
  const first = {}; for (const t of ts) first[t] = (await shot(t, q)).buf;
  let bad = 0;
  for (const t of [...ts].reverse()) { const b = (await shot(t, q)).buf; if (md5(b) !== md5(first[t])) { bad++; fs.writeFileSync(path.join(OUT, `verify-${t}-a.png`), first[t]); fs.writeFileSync(path.join(OUT, `verify-${t}-b.png`), b); console.log("differs at", t, "(compare out/verify-*.png; ≤ 1/255 on a few pixels = GPU rounding)"); } }
  console.log(bad ? `${bad} frames differ` : `ok: ${ts.length} frames identical in and out of order`);
} else if (mode === "frames") {
  fs.mkdirSync(FR, { recursive: true });
  const q = parseFloat(args[0] || "1"), N = Math.round(DUR * FPS);
  const from = parseInt(args[1] || "0"), to = Math.min(N, parseInt(args[2] || String(N)));
  const t0 = Date.now(); let made = 0;
  for (let i = from; i < to; i++) {
    const f = path.join(FR, `f_${String(i).padStart(4, "0")}.png`);
    if (fs.existsSync(f) && fs.statSync(f).size > 10000) continue;
    const { buf } = await shot(i / FPS, q);
    fs.writeFileSync(f + ".tmp", buf); fs.renameSync(f + ".tmp", f); made++;
    if (made % 30 === 0) { const el = (Date.now() - t0) / 1000; console.log(`frame ${i + 1}/${to}  ${(el / made).toFixed(2)} s/frame  eta ${((to - i - 1) * el / made / 60).toFixed(1)} min`); }
  }
  console.log(`done: ${made} new frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
} else if (mode === "chunks") {
  // long renders: 1-second chunks instead of hundreds of PNGs (antivirus rescans every new file), resumable per chunk.
  //   NICE_MS = pause after every sample pass (3D only; 0 = full speed), DUTY = extra sleep after a frame as a fraction of its render time.
  //   A frame already on disk as out/frames/f_NNNN.png is reused instead of rendered.
  const { PNG } = await import("pngjs");
  const CH = path.join(OUT, "chunks"); fs.mkdirSync(CH, { recursive: true });
  const NICE = parseFloat(process.env.NICE_MS ?? "25"), DUTY = parseFloat(process.env.DUTY ?? ".35");
  await page.evaluate((n) => { window.NICE_MS = n; }, NICE);
  const N = Math.round(DUR * FPS), K = Math.ceil(N / FPS), k0 = parseInt(args[0] || "0"), k1 = Math.min(K, parseInt(args[1] || String(K)));
  const t0 = Date.now(); let made = 0;
  const SUB = parseInt(process.env.SUB || "1"), SHUT = parseFloat(process.env.SHUTTER || ".5");
  for (let k = k0; k < k1; k++) {
    const f = path.join(CH, `c_${String(k).padStart(3, "0")}.mp4`);
    if (fs.existsSync(f)) continue;
    const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-framerate", String(FPS), "-i", "-",
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-x264-params", `keyint=${FPS}:min-keyint=${FPS}`,
      ...BT709, "-f", "mp4", f + ".tmp"], { stdio: ["pipe", "inherit", "inherit"] });
    const closed = new Promise((r) => ff.on("close", r));
    for (let i = k * FPS; i < Math.min(N, (k + 1) * FPS); i++) {
      const old = path.join(FR, `f_${String(i).padStart(4, "0")}.png`), ts = Date.now();
      let rgb;
      if (SUB > 1 && !fs.existsSync(old)) {
        // motion blur: SUB sub-frames spread over SHUTTER of the frame interval (0.5 = a 180° film shutter), averaged.
        // Stepped (stop-motion) elements stay crisp: their sub-frames are identical.
        let acc = null, width = 0, height = 0;
        for (let s = 0; s < SUB; s++) {
          const tt = Math.max(0, i / FPS + ((s + .5) / SUB - .5) * SHUT / FPS);
          const im = PNG.sync.read((await shot(tt, 1)).buf); width = im.width; height = im.height;
          if (!acc) acc = new Uint16Array(width * height * 3);
          for (let p = 0, q = 0; p < im.data.length; p += 4, q += 3) { acc[q] += im.data[p]; acc[q + 1] += im.data[p + 1]; acc[q + 2] += im.data[p + 2]; }
        }
        rgb = Buffer.alloc(width * height * 3); for (let q = 0; q < acc.length; q++) rgb[q] = Math.round(acc[q] / SUB);
      } else {
        const png = fs.existsSync(old) ? fs.readFileSync(old) : (await shot(i / FPS, 1)).buf;
        const { data, width, height } = PNG.sync.read(png);
        rgb = Buffer.alloc(width * height * 3); for (let p = 0, q = 0; p < data.length; p += 4, q += 3) { rgb[q] = data[p]; rgb[q + 1] = data[p + 1]; rgb[q + 2] = data[p + 2]; }
      }
      await new Promise((r) => ff.stdin.write(rgb) ? r() : ff.stdin.once("drain", r));
      if (!fs.existsSync(old)) { made++; if (DUTY > 0) await new Promise((r) => setTimeout(r, (Date.now() - ts) * DUTY)); }
    }
    ff.stdin.end(); await closed; fs.renameSync(f + ".tmp", f);
    console.log(`chunk ${k + 1}/${K} done · ${made} frames rendered · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  }
  console.log("all chunks done");
}
await done();
