// browser.mjs — static server (the film folder + the studio's node_modules under /node_modules/) and a GPU Chromium page.
// The film lives in <studio>/films/<name>/, so the studio root is two levels up.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf" };

export async function serve(root) {
  const studio = path.resolve(root, "../..");
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const base = p.startsWith("/node_modules/") ? studio : root;
    const f = path.join(base, p === "/" ? "comp.html" : p);
    if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: (p) => `http://127.0.0.1:${server.address().port}/${p}` };
}

export async function gpuPage(W, H) {
  // GPU flags: D3D11 ANGLE on Windows (the real GPU, not SwiftShader); macOS / Linux pick their default backend.
  const args = ["--font-render-hinting=none", "--force-color-profile=srgb", "--enable-gpu", "--ignore-gpu-blocklist",
    "--force_high_performance_gpu", "--disable-gpu-watchdog", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  if (process.platform === "win32") args.push("--use-angle=d3d11");
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("console", (m) => { const t = m.type(); if (t === "error" || t === "warning" || t === "log") console.log(`[page:${t}]`, m.text().slice(0, 4000)); });
  return { browser, page };
}
