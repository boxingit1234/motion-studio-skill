// new_film.mjs — start a film from a template.
//   node <skill>/scripts/new_film.mjs <studio-folder> <film-name> [film|film-3d]
// Copies templates/<kind>/ into <studio>/films/<film-name>/ (never overwrites an existing film) and prints the next steps.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [studio, name, kind = "film"] = process.argv.slice(2);
if (!studio || !name) { console.log("usage: node new_film.mjs <studio-folder> <film-name> [film|film-3d]"); process.exit(1); }
if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name)) { console.error("film name: letters, digits, - and _ only"); process.exit(1); }
const src = path.join(SKILL, "templates", kind);
if (!fs.existsSync(src)) { console.error(`no template '${kind}' (have: ${fs.readdirSync(path.join(SKILL, "templates")).join(", ")})`); process.exit(1); }
const studioAbs = path.resolve(studio);
if (!fs.existsSync(path.join(studioAbs, "node_modules", "playwright"))) console.warn(`! ${studioAbs} has no node_modules/playwright yet: run scripts/setup_studio first.`);
const dst = path.join(studioAbs, "films", name);
if (fs.existsSync(dst)) { console.error(`${dst} already exists: pick another name (films are never overwritten)`); process.exit(1); }
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.cpSync(src, dst, { recursive: true });
// the 3D template shares the 2D scripts (render / make / sound); copy them in when missing
if (kind !== "film") for (const f of ["render.mjs", "make.mjs", "audio.py", "check.py", "review.py", "cine.py", "foley.py", "CLAIMS.md", "package.json", "lib/browser.mjs"]) {
  const s = path.join(SKILL, "templates", "film", f), d = path.join(dst, f);
  if (!fs.existsSync(d)) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
}
fs.mkdirSync(path.join(dst, "assets"), { recursive: true }); fs.mkdirSync(path.join(dst, "out"), { recursive: true });
console.log(`created ${dst}

next:
  cd "${dst}"
  node render.mjs beats 0.5,4,8,12,16,20,24,28 0.25 sheet     # look at out/sheet.jpg
  node render.mjs audit 0.25                                   # must say "audit ok"
  node make.mjs audio                                          # events.json → out/mix.wav → measurements
  node make.mjs frames && node make.mjs encode && node make.mjs finish   (short 2D films)
  node render.mjs chunks && node make.mjs concat && node make.mjs finish  (long / 3D films — ask the person first)`);
