// film.js — example 3D product film: 30 s, 96 BPM (48 beats), 1080 × 1920, 30 fps.
// Shots: sunset room reveal → dive into the LED pill (match cut) → dark studio macro → modules dock (counters) →
// match cut to the house at dusk + pull back + energy lines → night interior → end card. Replace KEYS / SHOTS / timings with your story.
// Every value on screen is a pure function of t (seek-safe). Picture = path-traced sets (pt.js / world.js); overlays = DOM + a 2D canvas.
import * as THREE from "three";
import { PathTracer, buildSet, disposeSet } from "./pt.js";
import * as Wd from "./world.js";

export const BPM = 96, B = 60 / BPM, BEATS = 48, DUR = BEATS * B, FPS = 30, W = 1080, H = 1920;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const P = (x, a, b) => clamp((x - a) / (b - a));
export const E = {
  io: (u) => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  out3: (u) => 1 - Math.pow(1 - u, 3),
  in2: (u) => u * u,
  expo: (u) => u >= 1 ? 1 : 1 - Math.pow(2, -10 * u),
  sm: (u) => u * u * (3 - 2 * u),
  sine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  back: (u, s = 1.4) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
};

// ───────────────────────── camera tracks: Hermite through keys (Catmull-Rom tangents in beat time, still at the ends) ─────────────────────────
function herm(keys, b, f) {
  const n = keys.length;
  if (b <= keys[0].b) return f(keys[0]);
  if (b >= keys[n - 1].b) return f(keys[n - 1]);
  let i = 0; while (b > keys[i + 1].b) i++;
  const k0 = keys[i], k1 = keys[i + 1], h = k1.b - k0.b, u = (b - k0.b) / h;
  const m = (j) => (j === 0 || j === n - 1 || keys[j].hold) ? 0 : (f(keys[j + 1]) - f(keys[j - 1])) / (keys[j + 1].b - keys[j - 1].b);
  const m0 = m(i) * h, m1 = m(i + 1) * h, y0 = f(k0), y1 = f(k1), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1;
}
function camAt(keys, b) {
  const g = (k) => (o) => o[k];
  const v = (k) => [0, 1, 2].map((i) => herm(keys, b, (o) => o[k][i]));
  return { pos: v("pos"), target: v("tgt"), fov: herm(keys, b, g("fov")), aperture: herm(keys, b, (o) => o.ap || 0), focus: herm(keys, b, (o) => o.focus || 3), roll: herm(keys, b, (o) => o.roll || 0) };
}

// ───────────────────────── environments ─────────────────────────
const LIV = Wd.LIVING;
const envSunset = { sunDir: [-1, .2, .3], sunE: [17, 10, 4.6], sunAngle: .012, skyTop: [.2, .28, .5], skyHor: [1.1, .7, .42], skyGround: [.18, .15, .12], glowCol: [2.6, 1.3, .45], glowPow: 5, skyGain: 1, portal: true, inMin: LIV.inMin, inMax: LIV.inMax, bounces: 4 };
const envNight = { sunDir: [-1, -.1, .4], sunE: [0, 0, 0], skyTop: [.008, .012, .03], skyHor: [.04, .045, .07], skyGround: [.01, .01, .01], glowCol: [.06, .04, .03], glowPow: 4, skyGain: 1, portal: true, inMin: LIV.inMin, inMax: LIV.inMax, bounces: 4 };
const envDusk = (k) => ({ sunDir: [-.6, -.05, -.8], sunE: [0, 0, 0], skyTop: [.012, .028, .09], skyHor: [.52, .32, .27].map((x) => x * lerp(1, .55, k)), skyGround: [.05, .05, .05], glowCol: [1.1, .42, .14].map((x) => x * lerp(1, .5, k)), glowPow: 4, skyGain: lerp(1, .8, k), skyExp: .3, bounces: 3 });
const envStudio = { sunE: [0, 0, 0], skyTop: [0, 0, 0], skyHor: [0, 0, 0], skyGround: [0, 0, 0], bounces: 4 };

// ───────────────────────── the stack choreography (studio, b20–b32) ─────────────────────────
// one module + the control module → the control module lifts, a second module slides in, the control module docks; again for the third.
export const DOCK = [{ lift: 22.0, slide: 22.5, land: 23.0, done: 23.5, from: -1 }, { lift: 24.0, slide: 24.5, land: 25.0, done: 25.5, from: 1 }];
const { HB } = Wd.PRODUCT;
export function stackState(b) {
  if (b < DOCK[0].lift) return { stack: ["B", "P"], offsets: [], n: 1 };
  const k = b < DOCK[1].lift ? 0 : 1, d = DOCK[k], n = k + 2;            // n battery modules once this dock is complete
  const stack = [...Array(n).fill("B"), "P"], offsets = stack.map(() => ({}));
  const newIdx = n - 1, pNominal = n * HB, pStart = (n - 1) * HB, pHigh = pStart + .45;
  // power module height
  let py;
  if (b < d.slide) py = lerp(pStart, pHigh, E.io(P(b, d.lift, d.slide)));
  else if (b < d.land) py = pHigh;
  else py = lerp(pHigh, pNominal, E.out3(P(b, d.land, d.done)));
  offsets[n] = { dy: py - pNominal };
  // the new battery slides in at its own height
  const s = P(b, d.slide - .1, d.land);
  offsets[newIdx] = { dx: d.from * 1.7 * (1 - E.out3(s)) };
  return { stack, offsets, n, k };
}

// ───────────────────────── shots ─────────────────────────
const KEYS = {
  room: [
    { b: 0, pos: [2.45, 1.5, 2.15], tgt: [-3.2, 1.0, -.7], fov: 56 },
    { b: 4.5, pos: [2.1, 1.42, 1.3], tgt: [-2.5, .95, -2.3], fov: 54 },
    { b: 8, pos: [1.45, 1.32, -.05], tgt: [.85, .85, -3.4], fov: 48, ap: .005, focus: 3.4 },
    { b: 11, pos: [1.0, 1.22, -.95], tgt: [1.15, .96, -3.35], fov: 45, ap: .008, focus: 2.4 },
    { b: 13, pos: [.85, 1.15, -1.4], tgt: [1.21, 1.03, -3.3], fov: 44, ap: .01, focus: 1.9 },
  ],
  macro: [
    { b: 14.9, pos: [-.1997, .4699, .4993], tgt: [-.01, .435, .1275], fov: 40, ap: .004, focus: .42 },   // = the end of the dive
    { b: 17, pos: [.12, .45, .48], tgt: [.035, .435, .1275], fov: 38, ap: .004, focus: .36 },
  ],
  // framing: the counters own the top third, the stack lives between y ≈ 700 and 1550 px; the camera backs off as the stack grows
  stack: [
    { b: 17, pos: [-.66, .24, .3], tgt: [-.29, .22, -.04], fov: 32, ap: .0015, focus: .5 },
    { b: 18.6, pos: [-.56, .32, .04], tgt: [-.29, .3, -.08], fov: 32, ap: .0015, focus: .3 },
    { b: 20.5, pos: [1.14, .95, 3.14], tgt: [0, .7, 0], fov: 34, ap: .003, focus: 3.35 },
    { b: 23.5, pos: [1.0, 1.2, 4.44], tgt: [0, .965, 0], fov: 34, ap: .003, focus: 4.55 },
    { b: 25.5, pos: [-.9, 1.15, 4.46], tgt: [0, .965, 0], fov: 34, ap: .003, focus: 4.55 },
    { b: 29, pos: [1.3, 1.0, 5.1], tgt: [0, .813, 0], fov: 34, ap: .002, focus: 5.27 },
    { b: 32, pos: [1.45, 1.0, 5.05], tgt: [0, .813, 0], fov: 34, ap: .002, focus: 5.27 },
  ],
  house: [
    { b: 32, pos: [5.55 + 1.45, .08 + 1.0, 4.1475 + 5.05], tgt: [5.55, .08 + .813, 4.1475], fov: 34, ap: .002, focus: 5.27 },   // = the studio's last frame
    { b: 34.6, pos: [12.6, 2.7, 16.6], tgt: [2.8, 2.45, 3.8], fov: 46, ap: 0, focus: 13 },
    { b: 40.5, pos: [11.0, 2.3, 14.2], tgt: [3.5, 2.2, 3.8], fov: 46, ap: 0, focus: 12 },
  ],
  night: [
    { b: 39.5, pos: [-3.9, 1.38, 1.95], tgt: [.6, .9, -3.0], fov: 50, ap: .005, focus: 6.4 },
    { b: 48, pos: [-3.05, 1.3, 1.05], tgt: [.95, .85, -3.2], fov: 49, ap: .006, focus: 5.4 },
  ],
};
// ── the dive (b13 → b14.9): the camera falls into the LED pill; at b14 the room becomes the dark studio around the SAME pill (match cut)
export const DIVE = { b0: 13, b1: 14.9, cut: 14 };
export const PILL = { room: [1.22, 1.155, -3.21], studio: [-.03, .435, .1275] };
const v3 = (a) => new THREE.Vector3(...a);
const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
function diveCam(b, pill) {
  const c0 = camAt(KEYS.room, DIVE.b0), P0 = v3(PILL.room);
  const rel0 = v3(c0.pos).sub(P0), d0 = rel0.length(), dir0 = rel0.clone().normalize(), toff0 = v3(c0.target).sub(P0);
  const dirE = new THREE.Vector3(-.17, .035, .3725).normalize(), dE = .41, toffE = new THREE.Vector3(.02, 0, 0);
  const s = smoother(P(b, DIVE.b0, DIVE.b1));
  const d = Math.exp(lerp(Math.log(d0), Math.log(dE), s));
  const dir = dir0.clone().lerp(dirE, s).normalize(), toff = toff0.clone().lerp(toffE, s);
  const Pp = v3(pill), pos = Pp.clone().addScaledVector(dir, d), tgt = Pp.clone().add(toff);
  return { pos: pos.toArray(), target: tgt.toArray(), fov: lerp(c0.fov, 40, s), aperture: lerp(c0.aperture, .004, s), focus: pos.distanceTo(tgt), roll: 0 };
}
const breathe = (b, base, depth = .45, period = 4) => base * (1 - depth / 2 + depth / 2 * Math.sin(b / period * Math.PI * 2 - Math.PI / 2));
export const SHOTS = [
  { id: "room", b0: 0, b1: 14, set: "living", spp: 28,
    env: () => envSunset, lights: () => Wd.livingLights(0), gains: () => [1, 0, 1, 1, 1, 1, 1, 1],
    decal: (b) => ({ g: [breathe(b, .55), .6, .9], soc: 1 }), cam: (b) => b < DIVE.b0 ? camAt(KEYS.room, b) : diveCam(b, PILL.room),
    post: { exposure: 1.05, contrast: 1.04, sat: 1.02, vig: .3, lift: [.004, .006, .01], gain: [1, .99, .97] } },
  { id: "macro", b0: 14, b1: 17, set: "studio", spp: 28,
    env: () => envStudio, lights: () => Wd.studioLights(1, [.55, .7, .35]), gains: () => [1, 1, 1, 1, .25, 1, 1, 1],
    decal: (b) => ({ g: [lerp(.15, 1.6, E.out3(P(b, 14, 14.6))), 1.4, 1.3], soc: Math.floor(1 + 7 * P(b, 14.6, 16.4) + 1e-6) / 8 }),
    cam: (b) => b < DIVE.b1 ? diveCam(b, PILL.studio) : camAt(KEYS.macro, b), studio: () => ({ stack: ["B", "P"], offsets: [] }),
    post: { exposure: .82, contrast: 1.06, sat: 1, vig: .35, bloomGain: .09 } },
  { id: "stack", b0: 17, b1: 32, set: "studio", spp: 28,
    env: () => envStudio, lights: () => Wd.studioLights(1, [.55, .7, .35]), gains: () => [1, 1, 1, 1, .25, 1, 1, 1],
    decal: (b) => ({ g: [breathe(b, 1.2, .5, 2), 1.2, 1.2], soc: 1 }), cam: (b) => camAt(KEYS.stack, b), studio: (b) => stackState(b),
    post: { exposure: 1.0, contrast: 1.06, sat: 1, vig: .35, bloomGain: .08 } },
  { id: "house", b0: 32, b1: 40.25, set: "house", spp: 28,
    env: (b) => envDusk(P(b, 32, 40)), lights: (b) => Wd.houseLights(lerp(.35, 1, E.io(P(b, 36.4, 38.2)))),
    gains: (b) => { const lit = lerp(.35, 1, E.io(P(b, 36.4, 38.2))); return [1, lit, lit, 1, 1, 1, 1, 1]; },
    decal: (b) => ({ g: [breathe(b, 1.3, .5, 2), 1.3, 1.4], soc: 1 }), cam: (b) => camAt(KEYS.house, b),
    post: { exposure: 1.45, contrast: 1.05, sat: 1.05, vig: .3, lift: [.004, .006, .012] } },
  { id: "night", b0: 40.25, b1: 48, set: "living", spp: 28,
    env: () => envNight, lights: () => Wd.livingLights(1), gains: () => [1, 1, 1, 1, 1, 1, 1, 1],
    decal: (b) => ({ g: [breathe(b, 1.2, .5, 3), 1.2, 1.3], soc: b < 42.5 ? .75 : .625 }), cam: (b) => camAt(KEYS.night, b),
    post: { exposure: 1.05, contrast: 1.05, sat: 1.02, vig: .38, bloomGain: .08 } },
];
// cross-dissolves (the "from" shot is rendered past its end, the "to" shot before its start)
export const MIXES = [{ a: "house", b: "night", b0: 39.5, b1: 40.25 }];
export const FADE = { b0: 44, b1: 45, col: [11 / 255, 15 / 255, 20 / 255] };   // to the brand's dark colour for the end card
const byId = Object.fromEntries(SHOTS.map((s) => [s.id, s]));
export function shotAt(b) { return SHOTS.find((s) => b >= s.b0 && b < s.b1) || SHOTS[SHOTS.length - 1]; }

// ───────────────────────── the renderer ─────────────────────────
export class Film {
  constructor(canvas) {
    this.pt = new PathTracer(canvas, W, H);
    const d = Wd.decalTextures({ label: "BRAND" }); this.pt.setDecal(d.albedo, d.emit); this.pt.u.socC.value.set(...Wd.DECAL.socC);
    this.sets = {}; this.studioKey = null;
    this.basePost = { ...this.pt.post };
  }
  set(name, st) {
    if (name !== "studio") {
      if (!this.sets[name]) { const s = name === "living" ? Wd.livingSet() : Wd.houseSet(); const S = buildSet(s.parts); S.anchors = s.anchors; S.extra = s; this.sets[name] = S; }
      return this.sets[name];
    }
    const key = JSON.stringify([st.stack, st.offsets.map((o) => o ? [+(o.dx || 0).toFixed(5), +(o.dy || 0).toFixed(5)] : 0)]);
    if (key !== this.studioKey) {
      disposeSet(this.sets.studio);
      const s = Wd.studioSet({ stack: st.stack, offsets: st.offsets });
      const S = buildSet(s.parts); S.anchors = s.anchors; this.sets.studio = S; this.studioKey = key;
    }
    return this.sets.studio;
  }
  // render one shot at beat b into target (an LDR render target)
  async shot(s, b, spp, target, seed) {
    const st = s.studio ? s.studio(b) : null;
    const S = this.set(s.set, st);
    const pt = this.pt;
    if (!pt.u.matTex.value) pt.u.matTex.value = Wd.MAT.texture();
    if (this.lastSet !== S) { pt.setSet(S, null); this.lastSet = S; }
    pt.setEnv(s.env(b)); pt.setLights(s.lights(b)); pt.u.emitGain.value = s.gains(b);
    const d = s.decal(b); pt.u.decalGain.value = d.g; pt.u.socLevel.value = d.soc;
    const sh = .5 / FPS / B;                                                   // 180° shutter, in beats
    const c0 = s.cam(b - sh / 2), c1 = s.cam(b + sh / 2);
    pt.setCamera(c0, c1);
    this.cam = s.cam(b); this.anchors = S.anchors; this.stackNow = st;
    Object.assign(pt.post, this.basePost, s.post || {}, { frameSeed: Math.round(b * B * FPS) % 977 });
    await pt.render(spp, { seed, sync: 1, yieldMs: (typeof window !== "undefined" && window.NICE_MS) || 0 });
    pt.resolve(target);
  }
  async renderAt(t, q = 1) {
    const b = t / B;
    const mix = MIXES.find((m) => b >= m.b0 && b < m.b1);
    const pt = this.pt;
    if (mix) {
      const sa = byId[mix.a], sb = byId[mix.b];
      await this.shot(sa, b, Math.max(4, Math.round(sa.spp * q)), pt.outA, 1);
      const camA = this.cam, ancA = this.anchors;
      await this.shot(sb, b, Math.max(4, Math.round(sb.spp * q)), pt.outB, 1);
      const k = E.sine(P(b, mix.b0, mix.b1));
      pt.compose(pt.outA, pt.outB, k);
      this.mixState = { k, camA, ancA };
    } else {
      const s = shotAt(b);
      await this.shot(s, b, Math.max(4, Math.round(s.spp * q)), pt.outA, 1);
      pt.compose(pt.outA, null, 0, E.sine(P(b, FADE.b0, FADE.b1)) * .86, FADE.col);
      this.mixState = null;
    }
    this.shotNow = shotAt(b);
    return { b, shot: this.shotNow.id };
  }
  // world → screen (px) with the current camera
  project(p, cam = this.cam) {
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...cam.pos), new THREE.Vector3(...cam.target), new THREE.Vector3(0, 1, 0));
    const R = new THREE.Matrix3().setFromMatrix4(m).transpose();
    const v = new THREE.Vector3(p.x - cam.pos[0], p.y - cam.pos[1], p.z - cam.pos[2]).applyMatrix3(R);
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    if (v.z >= -1e-4) return null;
    const xn = v.x / -v.z / (th * W / H), yn = v.y / -v.z / th;
    return { x: (xn * .5 + .5) * W, y: (1 - (yn * .5 + .5)) * H, z: -v.z };
  }
}
