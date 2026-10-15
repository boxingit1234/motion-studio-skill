// world.js — materials, an example modular product and three sets (living room at sunset/night, house at dusk, dark studio).
// Units: metres. Build YOUR product from its PUBLISHED dimensions (official spec page) and its own product photos;
// write what is measured vs approximated in MODEL.md. The example below is a generic stackable wall unit:
//   footprint W × D, a top "control" module of height HP with an LED pill on its front, battery-like modules of height HB.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Materials, F } from "./pt.js";
import { toCreasedNormals, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const PRODUCT = { W: .590, D: .255, HP: .150, HB: .360 };   // ← your product's published dimensions
const M4 = () => new THREE.Matrix4();
const T = (x, y, z) => M4().makeTranslation(x, y, z);
const RY = (a) => M4().makeRotationY(a);
const RX = (a) => M4().makeRotationX(a);
const RZ = (a) => M4().makeRotationZ(a);
const S = (x, y, z) => M4().makeScale(x, y, z);
const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), M4());

// ───────────────────────── materials (one table for every set) ─────────────────────────
export const MAT = new Materials();
{
  const m = (n, o) => MAT.add(n, o);
  // product
  m("productShell", { albedo: [.86, .86, .85], rough: .34 });
  m("productDecal", { albedo: [.86, .86, .85], rough: .34, flags: F.DECAL });
  m("productBody", { albedo: [.5, .51, .52], rough: .5 });
  m("productFin", { albedo: [.66, .67, .68], rough: .4, pattern: 8 });
  m("productDark", { albedo: [.035, .035, .037], rough: .6 });
  // living room
  m("oak", { albedo: [.6, .43, .28], rough: .45, pattern: 1, p: [.19, 1.6, 0, 0] });
  m("plaster", { albedo: [.86, .84, .8], rough: .92, pattern: 2, p: [2.5, 0, 0, 0] });
  m("ceiling", { albedo: [.88, .87, .85], rough: .95, pattern: 2, p: [2, 0, 0, 0] });
  m("walnut", { albedo: [.36, .22, .13], rough: .55 });
  m("felt", { albedo: [.05, .045, .04], rough: 1 });
  m("glass", { flags: F.GLASS, tint: [.9, .92, .93] });
  m("frame", { albedo: [.06, .065, .07], rough: .45, metal: .6 });
  m("boucle", { albedo: [.8, .76, .7], rough: .95, pattern: 3 });
  m("linen", { albedo: [.62, .56, .48], rough: .95, pattern: 3 });
  m("rug", { albedo: [.84, .81, .75], rough: .95, pattern: 7, p: [3.2, 0, 0, 0] });
  m("brass", { albedo: [.85, .65, .38], rough: .3, metal: 1 });
  m("blackMetal", { albedo: [.04, .04, .04], rough: .35, metal: .8 });
  m("shadeOut", { albedo: [.9, .89, .86], rough: .5 });
  m("shadeIn", { albedo: [1, .9, .75], rough: .9, emit: [9, 6.3, 3.6], group: 1, flags: F.PROXY });
  m("downlight", { albedo: [1, 1, 1], rough: .9, emit: [14, 10.5, 7], group: 1, flags: F.PROXY });
  m("ceramic", { albedo: [.78, .74, .68], rough: .4 });
  m("terracotta", { albedo: [.62, .36, .24], rough: .8 });
  m("leaf", { albedo: [.12, .25, .08], rough: .55, pattern: 9 });
  m("stem", { albedo: [.25, .2, .12], rough: .8 });
  m("art", { albedo: [.8, .7, .6], rough: .85, pattern: 10 });
  m("book1", { albedo: [.55, .48, .38], rough: .8 });
  m("book2", { albedo: [.2, .25, .28], rough: .8 });
  m("marble", { albedo: [.86, .85, .83], rough: .2 });
  m("deck", { albedo: [.55, .54, .52], rough: .8, pattern: 6 });
  m("grass", { albedo: [.16, .22, .08], rough: .95, pattern: 5, p: [1.5, 0, 0, 0] });
  m("hedge", { albedo: [.07, .14, .05], rough: .9, pattern: 9 });
  m("bark", { albedo: [.18, .15, .12], rough: .9 });
  m("canopy", { albedo: [.075, .12, .05], rough: .9, pattern: 9 });
  // house
  m("cladding", { albedo: [.1, .1, .105], rough: .7, pattern: 11, p: [.12, 0, 0, 0] });
  m("roof", { albedo: [.08, .08, .085], rough: .55 });
  m("pv", { albedo: [.025, .035, .07], rough: .15, pattern: 4, p: [6, 10, 0, 0] });
  m("concrete", { albedo: [.5, .49, .47], rough: .85, pattern: 6 });
  m("gravel", { albedo: [.42, .41, .39], rough: .95, pattern: 5, p: [9, 0, 0, 0] });
  m("cedar", { albedo: [.5, .32, .18], rough: .6, pattern: 11, p: [.09, 0, 0, 0] });
  m("interiorWarm", { albedo: [.75, .68, .58], rough: .9, pattern: 2, p: [2, 0, 0, 0] });
  m("pendant", { albedo: [1, .9, .7], rough: .9, emit: [18, 12, 6], group: 2, flags: F.PROXY });
  m("sconce", { albedo: [1, .9, .7], rough: .9, emit: [22, 15, 8], group: 3, flags: F.PROXY });
  // studio
  m("cyc", { albedo: [.03, .032, .036], rough: .7 });
  m("cycFloor", { albedo: [.028, .03, .034], rough: .26 });
  m("softbox", { albedo: [1, 1, 1], rough: 1, emit: [6, 6, 6], group: 4, flags: F.PROXY });
}

// ───────────────────────── helpers ─────────────────────────
const parts = [];
const add = (arr, geo, mat, m) => arr.push({ geo, mat: MAT.id(mat), m });
const box = (arr, w, h, d, x, y, z, mat, extra) => add(arr, new THREE.BoxGeometry(w, h, d), mat, extra ? mul(T(x, y, z), extra) : T(x, y, z));
const rbox = (arr, w, h, d, r, x, y, z, mat, extra) => add(arr, new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)), mat, extra ? mul(T(x, y, z), extra) : T(x, y, z));
const cyl = (arr, rt, rb, h, x, y, z, mat, seg = 32, extra) => add(arr, new THREE.CylinderGeometry(rt, rb, h, seg, 1), mat, extra ? mul(T(x, y, z), extra) : T(x, y, z));
const sph = (arr, r, x, y, z, mat, seg = 24) => add(arr, new THREE.SphereGeometry(r, seg, Math.round(seg * .7)), mat, T(x, y, z));
// a rounded-rectangle footprint (front corners radius rf, back corners rb) extruded upward: x∈[-w/2,w/2], z∈[z0,z1], y∈[0,h]
function shellGeo(w, d, h, rf, rb, bevel) {
  // the bevel grows the shape outward by bevelSize → inset the shape by it, so the outer extent is exactly w × d × h
  const bs = bevel * .9; rf = Math.max(rf - bs, .001); rb = rb ? Math.max(rb - bs, .001) : 0;
  const s = new THREE.Shape(), x0 = -w / 2 + bs, x1 = w / 2 - bs, z0 = bs, z1 = d - bs;
  // shape in (x, -z) so the extrusion along +z (→ +y after rotation) keeps the front at +z
  s.moveTo(x0 + rb, -z0);
  s.lineTo(x1 - rb, -z0); if (rb) s.quadraticCurveTo(x1, -z0, x1, -z0 - rb);
  s.lineTo(x1, -z1 + rf); s.absarc(x1 - rf, -z1 + rf, rf, 0, -Math.PI / 2, true);
  s.lineTo(x0 + rf, -z1); s.absarc(x0 + rf, -z1 + rf, rf, -Math.PI / 2, -Math.PI, true);
  s.lineTo(x0, -z0 - rb); if (rb) s.quadraticCurveTo(x0, -z0, x0 + rb, -z0);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * .9, bevelSegments: 3, curveSegments: 10 });
  // RX(−90°): (x, y, z) → (x, z, −y): the extrusion axis becomes +y, shape y (= −z) becomes world z
  g.applyMatrix4(RX(-Math.PI / 2)); g.applyMatrix4(T(0, bevel, 0));
  return toCreasedNormals(g, Math.PI / 5);
}

// ───────────────────────── decal textures (the control module's front: an LED pill, a label, an accent line) ─────────────────────────
// quad 0.20 × 0.08 m, canvas 1024 × 410 → 5120 px/m. Pill 166 × 52 mm; left ring Ø11 mm; right "level" ring Ø15 mm (8 segments).
// Replace the label with the product's own print (as on its photos). Use a manufacturer's mark only as it appears on the product itself.
export const DECAL = { w: .20, h: .08, cx: -.03, socC: [845 / 1024, .5] };
export function decalTextures({ label = "BRAND", accent = "rgba(205,30,40,1)" } = {}) {
  const W = 1024, H = 410, k = 5120, cx = 512, cy = 205;
  const pill = (g, inset = 0) => { const pw = .166 * k - inset * 2, ph = .052 * k - inset * 2, r = ph / 2; g.beginPath(); g.moveTo(cx - pw / 2 + r, cy - ph / 2); g.lineTo(cx + pw / 2 - r, cy - ph / 2); g.arc(cx + pw / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2); g.lineTo(cx - pw / 2 + r, cy + ph / 2); g.arc(cx - pw / 2 + r, cy, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); };
  const lx = cx - .166 * k / 2 + .019 * k, rx = cx + .166 * k / 2 - .02 * k;
  // albedo (RGBA over the white shell)
  const a = document.createElement("canvas"); a.width = W; a.height = H; const g = a.getContext("2d");
  g.clearRect(0, 0, W, H);
  g.fillStyle = "rgba(225,226,226,1)"; pill(g, 4); g.fill();                              // pill face: a hair darker than the shell
  g.strokeStyle = "rgba(150,152,154,1)"; g.lineWidth = .0019 * k; pill(g); g.stroke();
  g.lineWidth = .0011 * k; g.beginPath(); g.arc(lx, cy, .0055 * k, 0, Math.PI * 2); g.stroke();
  g.lineWidth = .0016 * k; for (let i = 0; i < 8; i++) { const a0 = -Math.PI / 2 + i * Math.PI / 4 + .12, a1 = a0 + Math.PI / 4 - .24; g.beginPath(); g.arc(rx, cy, .0075 * k, a0, a1); g.stroke(); }
  g.fillStyle = "rgba(128,130,133,1)"; g.font = `700 ${Math.round(.0062 * k)}px Arial`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, cx, cy - .002 * k);
  g.fillStyle = accent; g.fillRect(cx - .015 * k, cy + .052 * k / 2 - .0034 * k, .03 * k, .0016 * k);
  // emission channels: R = pill outline + left ring, G = level ring (segments lit by socLevel), B = accent line
  const e = document.createElement("canvas"); e.width = W; e.height = H; const h = e.getContext("2d");
  h.fillStyle = "#000"; h.fillRect(0, 0, W, H); h.globalCompositeOperation = "lighter";
  h.strokeStyle = "rgb(255,0,0)"; h.lineWidth = .0017 * k; pill(h); h.stroke();
  h.lineWidth = .001 * k; h.beginPath(); h.arc(lx, cy, .0055 * k, 0, Math.PI * 2); h.stroke();
  h.strokeStyle = "rgb(0,255,0)"; h.lineWidth = .0015 * k; for (let i = 0; i < 8; i++) { const a0 = -Math.PI / 2 + i * Math.PI / 4 + .12, a1 = a0 + Math.PI / 4 - .24; h.beginPath(); h.arc(rx, cy, .0075 * k, a0, a1); h.stroke(); }
  h.fillStyle = "rgb(0,0,255)"; h.fillRect(cx - .015 * k, cy + .052 * k / 2 - .0034 * k, .03 * k, .0016 * k);
  const ta = new THREE.CanvasTexture(a), te = new THREE.CanvasTexture(e);
  for (const t of [ta, te]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; }
  return { albedo: ta, emit: te, canvas: a };
}

// ───────────────────────── the product ─────────────────────────
// stack: list of modules from the bottom: 'B' battery, 'P' power. offsets: per module {dx, dy, dz} (for assembly animation)
// returns { parts, anchors } with world-space anchors (pill centre, top, each module's front centre)
export function product(at, { stack = ["B", "B", "B", "P"], offsets = [], skipFins = false } = {}) {
  const out = []; const { W, D, HP, HB } = PRODUCT; const g = .0028;      // seam
  let y = 0; const anchors = { modules: [] };
  const base = at;                                                      // Matrix4: product origin = floor centre of the footprint, front = +z
  stack.forEach((kind, i) => {
    const h = kind === "P" ? HP : HB, o = offsets[i] || {};
    const yy = y + (o.dy || 0), xx = o.dx || 0, zz = o.dz || 0;
    const loc = (m) => mul(base.clone(), T(xx, yy, zz), m);
    const hh = h - g;
    // front shell (white), full width, 62 mm deep, rounded front corners
    add(out, shellGeo(W, .062, hh, .026, 0, kind === "P" ? .006 : .0016), "productShell", loc(T(0, g / 2, D / 2 - .062)));
    // body behind it
    add(out, new THREE.BoxGeometry(W - .018, hh - .002, D - .062), kind === "P" ? "productShell" : "productBody", loc(T(0, g / 2 + hh / 2, -.031)));
    if (kind === "P") {
      // top cover: white, full width over the fins, softly rounded
      add(out, new RoundedBoxGeometry(W, .014, D - .062 + .006, 3, .006), "productShell", loc(T(0, g / 2 + hh - .007, -.031 + .003)));
      // the decal quad on the front face (pill, mark, red line)
      const q = new THREE.PlaneGeometry(DECAL.w, DECAL.h);
      add(out, q, "productDecal", loc(T(DECAL.cx, g / 2 + hh / 2, D / 2 + .0007)));
      anchors.pill = new THREE.Vector3(DECAL.cx, yy + g / 2 + hh / 2, zz + D / 2).applyMatrix4(base);
    }
    // side fins (both sides): 2.2 mm plates every 5.5 mm, running the module's height
    if (!skipFins) {
      const fh = kind === "P" ? hh - .02 : hh - .006, n = Math.floor((D - .07) / .0055);
      const fin = new THREE.BoxGeometry(.009, fh, .0022);
      for (const sx of [-1, 1]) for (let k = 0; k < n; k++) {
        const z = -D / 2 + .006 + k * .0055;
        add(out, fin, "productFin", loc(T(sx * (W / 2 - .0045), g / 2 + (kind === "P" ? hh - .014 - fh / 2 : hh / 2), z)));
      }
    }
    if (i === 0 && kind === "B") {
      // design groove 68 mm above the floor (an example detail: copy such lines from the real product's photos) and a dark recessed plinth
      add(out, new THREE.BoxGeometry(W - .06, .0022, .004), "productDark", loc(T(0, .068, D / 2 + .0005)));
      add(out, new THREE.BoxGeometry(W - .05, .012, D - .05), "productDark", loc(T(0, -.004, 0)));
    }
    anchors.modules.push({ kind, y0: yy, h, front: new THREE.Vector3(xx, yy + h / 2, zz + D / 2).applyMatrix4(base) });
    y += h;
  });
  anchors.top = new THREE.Vector3(0, y, D / 2).applyMatrix4(base);
  anchors.height = y;
  return { parts: out, anchors };
}

// ───────────────────────── set A: the living room (+ the garden outside the glass) ─────────────────────────
// Room interior x ∈ [−5, 3], y ∈ [0, 2.9], z ∈ [−3.5, 2.5]. West glazing at x = −5. the product against the slatted wall (z = −3.5) at x = 1.3.
export const LIVING = { inMin: [-5, -.01, -3.5], inMax: [3, 2.9, 2.5], productAt: [1.25, 0, -3.5 + .035 + PRODUCT.D / 2] };
export function livingSet() {
  const p = [];
  // shell
  box(p, 8.4, .1, 6.4, -1, -.05, -.5, "oak");
  box(p, 8.4, .1, 6.4, -1, 2.95, -.5, "ceiling");
  box(p, 8.4, 2.9, .12, -1, 1.45, -3.56, "plaster");          // back wall
  box(p, 8.4, 2.9, .12, -1, 1.45, 2.56, "plaster");           // front wall
  box(p, .12, 2.9, 6.4, 3.06, 1.45, -.5, "plaster");          // right wall
  // west glazing x = −5: opening z ∈ [−3.2, 2.2], y ∈ [0, 2.72]; jambs, head, mullions, glass
  box(p, .3, .18, 6.4, -5.1, 2.81, -.5, "plaster");
  box(p, .3, 2.9, .3, -5.1, 1.45, -3.35, "plaster");
  box(p, .3, 2.9, .3, -5.1, 1.45, 2.35, "plaster");
  for (const z of [-3.2, -1.85, -.5, .85, 2.2]) box(p, .07, 2.72, .05, -5.0, 1.36, z, "frame");
  box(p, .07, .05, 5.4, -5.0, 2.7, -.5, "frame"); box(p, .07, .04, 5.4, -5.0, .02, -.5, "frame");
  box(p, .012, 2.7, 5.4, -5.0, 1.36, -.5, "glass");
  // slatted wall behind the product: x ∈ [−.6, 3.0]
  box(p, 3.6, 2.9, .012, 1.2, 1.45, -3.494, "felt");
  for (let x = -.56; x < 2.98; x += .075) box(p, .046, 2.9, .024, x, 1.45, -3.476, "walnut");
  // the product: three modules + the control module
  const L = product(T(...LIVING.productAt));
  p.push(...L.parts);
  // sofa (facing −z), x ∈ [−3.7, −1.1], back towards +z
  const sx = -2.4, sz = .55;
  rbox(p, 2.6, .22, .98, .05, sx, .17, sz, "boucle");
  rbox(p, 1.25, .17, .78, .07, sx - .64, .36, sz - .07, "boucle"); rbox(p, 1.25, .17, .78, .07, sx + .64, .36, sz - .07, "boucle");
  rbox(p, 2.6, .5, .24, .1, sx, .5, sz + .37, "boucle");
  rbox(p, .24, .58, .98, .1, sx - 1.32, .33, sz, "boucle"); rbox(p, .24, .58, .98, .1, sx + 1.32, .33, sz, "boucle");
  rbox(p, .5, .45, .14, .07, sx - .9, .62, sz + .2, "linen", RX(-.25)); rbox(p, .45, .42, .13, .07, sx + .95, .6, sz + .2, "linen", RX(-.2));
  for (const [x, z] of [[-1.2, -.42], [1.2, -.42], [-1.2, .42], [1.2, .42]]) cyl(p, .02, .02, .06, sx + x, .03, sz + z, "blackMetal", 10);
  // coffee table + rug
  box(p, 3.2, .012, 2.3, -2.4, .006, -.65, "rug");
  cyl(p, .52, .52, .04, -2.35, .38, -.75, "oak", 48); cyl(p, .17, .21, .34, -2.35, .19, -.75, "oak", 32);
  cyl(p, .07, .05, .16, -2.15, .48, -.7, "ceramic", 24); box(p, .3, .03, .22, -2.55, .415, -.85, "book1"); box(p, .28, .025, .2, -2.55, .44, -.84, "book2", RY(.1));
  // credenza + art on the back wall, x ∈ [−4.4, −1.4]
  box(p, 2.9, .5, .44, -2.9, .37, -3.27, "walnut");
  for (const x of [-4.25, -1.55]) for (const z of [-3.1, -3.44]) cyl(p, .015, .015, .12, x, .06, z, "blackMetal", 8);
  cyl(p, .09, .12, .42, -3.9, .83, -3.25, "ceramic", 32); cyl(p, .1, .1, .22, -1.9, .73, -3.27, "terracotta", 32);
  box(p, .34, .2, .24, -3.1, .72, -3.3, "book1"); box(p, .3, .18, .22, -3.1, .91, -3.3, "book2");
  box(p, 1.5, 1.05, .04, -2.9, 1.68, -3.47, "blackMetal"); box(p, 1.42, .97, .02, -2.9, 1.68, -3.445, "art");
  // arc floor lamp beside the sofa (shade over the coffee table)
  cyl(p, .17, .17, .05, -.75, .025, 1.0, "marble", 40);
  {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.75, .05, 1.0), new THREE.Vector3(-.85, 2.6, .1), new THREE.Vector3(-1.95, 1.95, -.55));
    add(p, new THREE.TubeGeometry(curve, 60, .012, 10, false), "brass", M4());
    const shade = new THREE.SphereGeometry(.22, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    add(p, shade, "shadeOut", T(-1.95, 1.8, -.55));
    add(p, new THREE.CircleGeometry(.215, 40), "shadeIn", mul(T(-1.95, 1.8, -.55), RX(Math.PI / 2)));
  }
  // downlights (night)
  for (const [x, z] of [[-3.4, -1.6], [-1.4, -1.6], [-3.4, 1.2], [-1.4, 1.2], [.8, -2.2], [2.1, -2.2], [.8, .8], [2.1, .8]]) add(p, new THREE.CircleGeometry(.05, 24), "downlight", mul(T(x, 2.895, z), RX(Math.PI / 2)));
  // a tall plant in the window corner
  plant(p, -4.45, -2.75, 1.0);
  plant(p, 2.55, -2.95, .75);
  // outside: terrace, lawn, hedge, trees
  box(p, 4, .1, 12, -7.05, -.06, -.5, "deck");
  box(p, 40, .1, 40, -25, -.12, -.5, "grass");
  rbox(p, .9, 1.25, 14, .3, -10.5, .55, -.5, "hedge");
  for (const [x, z, s] of [[-13, -3, 1.2], [-15, 2.5, 1.4], [-18, -6, 1.6], [-17, 6, 1.3], [-21, 0, 1.8], [-12, 7, 1.0]]) tree(p, x, z, s, 110);   // seen soft through the glass
  return { parts: p, anchors: L.anchors };
}
function plant(p, x, z, s) {
  cyl(p, .23 * s, .18 * s, .5 * s, x, .25 * s, z, "terracotta", 32);
  const rnd = mulberry(Math.round((x + 10) * 100 + z * 7));
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, h = (.7 + rnd() * 1.1) * s, lean = .15 + rnd() * .35;
    const top = new THREE.Vector3(x + Math.cos(a) * lean * h * .5, .45 * s + h, z + Math.sin(a) * lean * h * .5);
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, .45 * s, z), new THREE.Vector3(x + Math.cos(a) * .05, .45 * s + h * .6, z + Math.sin(a) * .05), top);
    add(p, new THREE.TubeGeometry(c, 8, .007 * s, 5, false), "stem", M4());
    // a big oval leaf: a bent plane at the top of the stem
    const lg = new THREE.PlaneGeometry(.22 * s, .42 * s, 4, 6); const pos = lg.attributes.position;
    for (let k = 0; k < pos.count; k++) { const u = pos.getX(k) / (.11 * s), v = pos.getY(k) / (.21 * s); const w = Math.sqrt(Math.max(0, 1 - v * v)) * (1 - .25 * v); pos.setX(k, pos.getX(k) * w); pos.setZ(k, -Math.abs(u) * .04 * s - v * v * .03 * s); }
    lg.computeVertexNormals();
    const tilt = .5 + rnd() * .7;
    add(p, lg, "leaf", mul(T(top.x, top.y, top.z), RY(-a + Math.PI / 2), RX(-tilt), T(0, .19 * s, 0)));
  }
}
// leafy clumps: displaced icospheres (a few shared variants), scattered in an ellipsoid → a broken, natural silhouette
const CLUMPS = (() => { const r = mulberry(4242), out = [];
  for (let v = 0; v < 6; v++) { let g = new THREE.IcosahedronGeometry(1, 1); g.deleteAttribute("normal"); g.deleteAttribute("uv"); g = mergeVertices(g); const pos = g.attributes.position;
    const ph = [r() * 9, r() * 9, r() * 9];
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const f = .82 + .22 * Math.sin(x * 3.1 + ph[0]) * Math.sin(y * 2.7 + ph[1]) * Math.sin(z * 3.4 + ph[2]) + .08 * r(); pos.setXYZ(i, x * f, y * f, z * f); }
    g.computeVertexNormals(); out.push(g); }
  return out; })();
function tree(p, x, z, s, clumps = 420) {
  const rnd = mulberry(Math.round(x * 31 + z * 17 + 999));
  const H = (3.2 + rnd() * 1.2) * s;
  cyl(p, .08 * s, .15 * s, H, x, H / 2, z, "bark", 10);
  for (let i = 0; i < 6; i++) {                                     // a few limbs
    const a = rnd() * Math.PI * 2, y0 = H * (.45 + rnd() * .35), L = (.9 + rnd() * .8) * s;
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y0, z), new THREE.Vector3(x + Math.cos(a) * L * .4, y0 + L * .5, z + Math.sin(a) * L * .4), new THREE.Vector3(x + Math.cos(a) * L, y0 + L * .9, z + Math.sin(a) * L));
    add(p, new THREE.TubeGeometry(c, 6, .035 * s, 5, false), "bark", M4());
  }
  const cy = H + .6 * s, rx = (1.7 + rnd() * .5) * s, ry = (1.5 + rnd() * .6) * s;
  const big = 420 / clumps;
  for (let i = 0; i < clumps; i++) {
    let u, v, w; do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; w = rnd() * 2 - 1; } while (u * u + v * v + w * w > 1);
    const d = Math.sqrt(u * u + v * v + w * w), push = .55 + .45 * Math.sqrt(d);   // denser towards the surface
    const r = (.09 + rnd() * .1) * s * Math.sqrt(big);
    const m = mul(T(x + u / d * push * rx * d, cy + v / d * push * ry * d, z + w / d * push * rx * d), RY(rnd() * 6.28), RX(rnd() * 6.28), S(r, r * (.8 + rnd() * .3), r));
    add(p, CLUMPS[i % CLUMPS.length], "canopy", m);
  }
}
export function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// lights of the living room. day (sunset through the glass) → night (lamp + downlights)
export function livingLights(night) {
  const L = [];
  const day = 1 - night;
  if (day > .001) {
    L.push({ type: "sun", w: 3 * day }); L.push({ type: "portal", c: [-5.0, 1.36, -.5], u: [0, 0, 2.7], v: [0, 1.36, 0], E: [.9, .92, .93], w: 2.2 * day + .05 });
    // a cool, invisible fill towards the slatted wall so the product keeps its white against the sunset
    L.push({ type: "rect", c: [.1, 1.5, -1.3], u: [.45, 0, .25], v: [0, .7, 0], E: [2.3 * day, 2.5 * day, 2.85 * day], w: .9 * day });
  }
  else L.push({ type: "portal", c: [-5.0, 1.36, -.5], u: [0, 0, 2.7], v: [0, 1.36, 0], E: [.9, .92, .93], w: .3 });
  if (night > .001) {
    L.push({ type: "sphere", c: [-1.95, 1.74, -.55], r: .09, E: [190 * night, 130 * night, 72 * night], w: 2.5 });
    for (const [x, z] of [[-3.4, -1.6], [-1.4, -1.6], [-3.4, 1.2], [-1.4, 1.2], [.8, -2.2], [2.1, -2.2], [.8, .8], [2.1, .8]]) L.push({ type: "sphere", c: [x, 2.84, z], r: .04, E: [260 * night * .55, 195 * night * .55, 130 * night * .55], w: .55 });
  }
  return L;
}

// ───────────────────────── set B: the house at dusk ─────────────────────────
// Facade at z = 4 (faces +z, the camera side). Footprint x ∈ [−7, 7], z ∈ [−4, 4]; eaves 3.0 m; ridge 5.6 m along x.
export const HOUSE = { productAt: [5.55, .08, 4.0 + .02 + PRODUCT.D / 2] };
export function houseSet() {
  const p = [];
  // ground
  box(p, 80, .1, 80, 0, -.05, 10, "grass");
  box(p, 16, .08, 2.2, 0, -.0, 5.1, "concrete");          // terrace along the facade
  box(p, 3.2, .06, 14, 3.2, -.01, 13, "gravel");           // path / drive
  box(p, 1.4, .16, 1.0, 5.55, .0, 4.6, "concrete");        // plinth for the product
  // walls (cladding), with the glazing opening x ∈ [−5.6, 1.6], y ∈ [.1, 2.75]
  const wallH = 3.0;
  box(p, 1.4, wallH, .2, -6.3, wallH / 2, 3.9, "cladding");
  box(p, 7.2, .25, .2, -2, wallH - .125, 3.9, "cladding");
  box(p, 5.4, wallH, .2, 4.3, wallH / 2, 3.9, "cladding");
  box(p, .2, wallH, 8, -7.0, wallH / 2, 0, "cladding"); box(p, .2, wallH, 8, 7.0, wallH / 2, 0, "cladding"); box(p, 14.2, wallH, .2, 0, wallH / 2, -3.9, "cladding");
  // entrance niche in cedar at x ∈ [2.4, 3.9]
  box(p, 1.5, 2.7, .05, 3.15, 1.35, 4.02, "cedar");
  box(p, .9, 2.2, .04, 3.15, 1.1, 4.05, "frame");
  // glazing + mullions
  for (const x of [-5.6, -3.8, -2.0, -.2, 1.6]) box(p, .06, 2.65, .08, x, 1.425, 4.0, "frame");
  box(p, 7.2, .06, .08, -2, 2.75, 4.0, "frame"); box(p, 7.2, .06, .08, -2, .1, 4.0, "frame");
  box(p, 7.2, 2.65, .012, -2, 1.425, 3.98, "glass");
  // interior seen through the glass: warm room, a sofa, a table, pendants
  box(p, 13.6, .05, 7.6, 0, .02, 0, "oak");
  box(p, 13.6, .05, 7.6, 0, 2.9, 0, "ceiling");
  box(p, 13.6, 2.9, .05, 0, 1.45, -3.7, "interiorWarm");
  box(p, .05, 2.9, 7.6, -6.85, 1.45, 0, "interiorWarm"); box(p, .05, 2.9, 7.6, 2.3, 1.45, 0, "interiorWarm");
  rbox(p, 2.4, .7, .9, .1, -3.6, .35, -2.6, "boucle"); rbox(p, 2.4, .5, .25, .08, -3.6, .65, -3.0, "boucle");
  box(p, 2.0, .05, .95, -.6, .75, -.8, "oak"); for (const x of [-1.5, .3]) box(p, .06, .73, .8, x, .37, -.8, "oak");
  box(p, 1.6, 1.0, .04, -3.6, 1.7, -3.66, "art");
  for (const x of [-1.1, -.6, -.1]) { cyl(p, .004, .004, .9, x, 2.45, -.8, "blackMetal", 6); sph(p, .1, x, 1.95, -.8, "pendant", 24); }
  add(p, new THREE.PlaneGeometry(5, 3), "downlight", mul(T(-3.0, 2.86, -1.5), RX(Math.PI / 2)));   // soft ceiling glow (group 1)
  plant(p, -6.2, -3.0, 1.0);
  // roof: gable along x, slopes to ±z, overhang .45
  const rise = 2.6, run = 4.0 + .45, slope = Math.atan2(rise, 4.0), L = run / Math.cos(slope);
  for (const sz of [1, -1]) {
    const zc = run / 2, yc = wallH + rise - zc * Math.tan(slope);
    const m = mul(T(0, yc + .08 / Math.cos(slope), sz * zc), RX(sz * slope));
    add(p, new THREE.BoxGeometry(15.0, .16, L + .06), "roof", m);
  }
  // gable ends
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape(); s.moveTo(-4, 0); s.lineTo(4, 0); s.lineTo(0, rise); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: .2, bevelEnabled: false }); g.applyMatrix4(RY(Math.PI / 2));
    add(p, g, "cladding", T(sx * 7.0 - .1, wallH, 0));
  }
  // PV on the front slope: 2 rows × 8 modules (1.134 × 1.762 m, portrait)
  {
    const cos = Math.cos(slope), sin = Math.sin(slope);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) {
      const along = .45 + r * 1.80 + .881;                 // panel centre, metres up the slope from the eave line (z = 4, y = 3)
      const x = -5.4 + c * 1.16 + .58, off = .16 + .09;   // above the roof slab
      const y = wallH + along * sin + cos * off, z = 4.0 - along * cos + sin * off;
      const g = new THREE.BoxGeometry(1.134, .035, 1.762);  // uv of the top face = the cell grid
      add(p, g, "pv", mul(T(x, y, z), RX(slope)));
    }
  }
  // the product on its plinth by the entrance, three battery modules
  const Lp = product(T(...HOUSE.productAt));
  p.push(...Lp.parts);
  // wall light above it
  box(p, .12, .2, .1, 5.55, 2.35, 4.05, "blackMetal");
  add(p, new THREE.CircleGeometry(.035, 20), "sconce", mul(T(5.55, 2.245, 4.06), RX(Math.PI / 2)));
  // trees and hedges
  for (const [x, z, s] of [[-10, -2, 1.3], [-12, 3, 1.5], [10.5, -1, 1.4], [12, 4, 1.2], [-3, -9, 1.8], [4, -10, 1.6], [-14, -8, 1.7], [15, -6, 1.8], [0, -14, 2.0], [-20, 0, 2]]) tree(p, x, z, s);
  rbox(p, 5, .9, .7, .3, -9.5, .4, 7.5, "hedge"); rbox(p, 4, .8, .7, .3, 9.5, .35, 7.0, "hedge");
  return { parts: p, anchors: Lp.anchors, roofSlope: slope };
}
export function houseLights(lit) {
  // dusk sky + interior pendants / ceiling glow + the sconce over the product
  const L = [];
  L.push({ type: "sphere", c: [-1.1, 1.95, -.8], r: .1, E: [80 * lit, 54 * lit, 27 * lit], w: 1 });
  L.push({ type: "sphere", c: [-.6, 1.95, -.8], r: .1, E: [80 * lit, 54 * lit, 27 * lit], w: 1 });
  L.push({ type: "sphere", c: [-.1, 1.95, -.8], r: .1, E: [80 * lit, 54 * lit, 27 * lit], w: 1 });
  L.push({ type: "rect", c: [-3.0, 2.855, -1.5], u: [2.5, 0, 0], v: [0, 0, -1.5], E: [3.2 * lit, 2.3 * lit, 1.5 * lit], w: 2 });
  L.push({ type: "sphere", c: [5.55, 2.22, 4.12], r: .035, E: [900, 610, 320], w: 2.5 });
  return L;
}

// ───────────────────────── set C: the studio (dark cyclorama) ─────────────────────────
export function studioSet(productArgs = {}, at = T(0, 0, 0)) {
  const p = [];
  // floor + coved back wall (radius 1.6) + upper wall
  box(p, 16, .1, 10, 0, -.05, 1, "cycFloor");
  const cove = new THREE.CylinderGeometry(1.6, 1.6, 16, 48, 1, true, Math.PI, Math.PI / 2);
  add(p, cove, "cyc", mul(T(0, 1.6, -4 + 1.6), RZ(Math.PI / 2)));
  box(p, 16, 6, .1, 0, 1.6 + 3, -4.05, "cyc");
  // softbox above (proxy; its light is the analytic rect light)
  add(p, new THREE.PlaneGeometry(2.4, 1.2), "softbox", mul(T(0, 3.2, .2), RX(Math.PI / 2)));
  add(p, new THREE.PlaneGeometry(1.4, 2.0), "softbox", mul(T(-2.6, 1.4, 3.2), RY(Math.PI * .8)));
  const L = product(at, productArgs);
  p.push(...L.parts);
  return { parts: p, anchors: L.anchors };
}
export function studioLights(rim = 1, accent = [.6, .8, .2]) {
  return [
    { type: "rect", c: [0, 3.18, .2], u: [1.2, 0, 0], v: [0, 0, -.6], E: [11, 11, 11.5], w: 3 },
    { type: "rect", c: [-2.6, 1.4, 3.2], u: [.7 * Math.cos(Math.PI * .8), 0, -.7 * Math.sin(Math.PI * .8)], v: [0, 1.0, 0], E: [26, 26, 27], w: 4 },
    { type: "rect", c: [-2.2, 1.3, -.6], u: [0, 1.1, 0], v: [.25, 0, .25], E: [7 * rim, 7.2 * rim, 7.6 * rim], w: 1.5 },
    { type: "rect", c: [2.3, 1.2, -1.0], u: [0, 1.0, 0], v: [-.2, 0, .3], E: [accent[0] * 5 * rim, accent[1] * 5 * rim, accent[2] * 5 * rim], w: 1.2 },
  ];
}
