// node bench.mjs [N] — GPU path tracer speed + a frame
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { serve, gpuPage } from "./lib/browser.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = parseInt(process.argv[2] || "16");
const { server, url } = await serve(HERE);
const { browser, page } = await gpuPage(1080, 1920);
await page.goto(url("bench.html"));
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
console.log(await page.evaluate((n) => window.bench(n), 2));
console.log(await page.evaluate((n) => window.bench(n), N));
fs.mkdirSync(path.join(HERE, "out"), { recursive: true });
await page.screenshot({ path: path.join(HERE, "out", "bench.png") });
await browser.close(); server.close();
