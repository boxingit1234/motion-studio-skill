// gfx.js — the graphics toolkit for footage promos (a transparent layer that overlay.mjs composites over out/<edit>/base.mp4).
// Everything is drawn on one 2D canvas inside window.renderAt(t), a pure function of t. Items are either a logo image
// ({ img: 'name' } → assets/name@4x.png, made by tools/logo_prep.py) or text ({ text: 'ARTIST', size: 160 }).
// Placement is OPTICAL: images use assets/optical.json (ink centre of mass), text uses its measured ink box — so a logo with a heavy side,
// or a word with a descender, still looks centred.
export const ED = await (await fetch(new URLSearchParams(location.search).get('edit') || 'edit.json', { cache: 'no-store' })).json();
export const [W, H] = ED.size || [1080, 1920];
export const FPS = ED.fps, DUR = ED.dur;
const GRID = ED.grid || [{ b: 0, bpm: ED.bpm || 120 }]; { let t = 0; GRID.forEach((g, i) => { g.t = t; if (i + 1 < GRID.length) t += (GRID[i + 1].b - g.b) * 60 / g.bpm; }); }
export const bt = (b) => { const g = [...GRID].reverse().find((x) => x.b <= b) || GRID[0]; return g.t + (b - g.b) * 60 / g.bpm; };
window.DUR = DUR; window.FPS = FPS; window.BPM = GRID[0].bpm; window.EVENTS = {};
const cv = document.getElementById('c'); cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px';
export const X = cv.getContext('2d');

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const tw = (t, a, b) => clamp((t - a) / (b - a));
export const out3 = (u) => 1 - Math.pow(1 - u, 3);
export const io = (u) => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export const inExpo = (u) => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10));
export const outBack = (u, s = 1.4) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2));

// ── assets
export const IM = {}; let OPT = {};
try { const r = await fetch('assets/optical.json', { cache: 'no-store' }); if (r.ok) OPT = await r.json(); } catch { }
export async function loadImages(names) {
  await Promise.all(names.map((n) => new Promise((ok, bad) => {
    const i = new Image(); i.onload = () => { IM[n] = i; ok(); }; i.onerror = () => bad(new Error('missing asset ' + n));
    i.src = n.endsWith('_sticker') ? `assets/${n}.png` : `assets/${n}@4x.png`;
  })));
}
export let FONT = 'Arial Black, Arial, sans-serif';
export async function useFont(family, url) {                        // load the brand font BEFORE frame 0 (a late font paints blank)
  if (url) { const f = new FontFace(family, `url(${url})`); await f.load(); document.fonts.add(f); }
  await document.fonts.load(`100px ${family}`); FONT = `${family}, ${FONT}`;
}

// ── drawing one item at an optical centre; w = width for images, size for text
function inkBox(c, item) {
  if (item.img) { const im = IM[item.img]; const [ox, oy] = OPT[item.img] || [0, 0]; return { w: im.width, h: im.height, ox, oy }; }
  c.font = `${item.size}px ${item.font || FONT}`; const m = c.measureText(item.text);
  return { m, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
}
export function draw(c, item, cx, cy, w, o = {}) {
  c.save(); if (o.alpha !== undefined) c.globalAlpha = o.alpha; if (o.filter) c.filter = o.filter;
  if (o.scale && o.scale !== 1) { c.translate(cx, cy); c.scale(o.scale, o.scale); c.translate(-cx, -cy); }
  if (o.shadow) { c.shadowColor = o.shadow; c.shadowBlur = o.shadowBlur ?? 30; c.shadowOffsetY = 4; }
  if (o.mode === 'stroke') { c.strokeStyle = o.color || '#fff'; c.lineWidth = o.lineWidth || 3; } else c.fillStyle = o.color || '#fff';
  if (item.img) {
    const im = IM[item.img], h = w * im.height / im.width, [ox, oy] = OPT[item.img] || [0, 0];
    c.drawImage(im, cx - w / 2 - ox * w * .5, cy - h / 2 - oy * h * .5, w, h);       // half-weighted: the box still matters a little
  } else {
    const b = inkBox(c, item); c.textBaseline = 'alphabetic';
    if (item.track) c.letterSpacing = `${item.track}px`;
    const x = cx - b.w / 2 + b.m.actualBoundingBoxLeft, y = cy + (b.m.actualBoundingBoxAscent - b.m.actualBoundingBoxDescent) / 2;
    o.mode === 'stroke' ? c.strokeText(item.text, x, y) : c.fillText(item.text, x, y);
  }
  c.restore();
}

// ── timing envelopes
export function life(t, t0, t1, inD = .3, outD = .16, s0 = 1.08) {
  if (t < t0 || t > t1 + outD) return null;
  const a = out3(tw(t, t0, t0 + inD)), z = io(tw(t, t1, t1 + outD));
  return { alpha: a * (1 - z), scale: (s0 + (1 - s0) * a) * (1 + .06 * z), dy: 22 * (1 - a), blur: 12 * (1 - a) + 10 * z };
}
const BEATS = []; for (let b = 0; bt(b) < DUR + 1; b++) BEATS.push(bt(b));
export function pulseAt(t, amt = .035) { let p = 0; for (const b of BEATS) { if (b > t) break; p = Math.exp(-(t - b) / .09); } return 1 + amt * p; }

// an element: rises out of a blur, holds, leaves with a short blur-out
export function el(t, item, cx, cy, w, t0, t1, o = {}) {
  const L = life(t, t0, t1, o.inD, o.outD, o.s0); if (!L || L.alpha < .003) return;
  draw(X, item, cx, cy + L.dy, w, { alpha: L.alpha * (o.alpha ?? 1), scale: L.scale * (o.pulse ? pulseAt(t) : 1), filter: L.blur > .3 ? `blur(${L.blur.toFixed(1)}px)` : 'none',
    shadow: o.shadow ?? 'rgba(0,0,0,.55)', shadowBlur: o.shadowBlur, color: o.color });
}
// the slam: lands big on a drop (from 1.34×, blurred, with a white glow that fades)
export function slam(t, item, cx, cy, w, t0, t1) {
  if (t < t0 || t > t1 + .2) return;
  const u = tw(t, t0, t0 + .14), z = io(tw(t, t1, t1 + .16)), s = (1.34 - .34 * out3(u)) * (1 + .22 * z) * (1 + .03 * tw(t, t0, t1)), glow = Math.exp(-(t - t0) / .35);
  draw(X, item, cx, cy, w, { alpha: clamp(u * 3) * (1 - z), scale: s, filter: `blur(${(8 * (1 - u) + 8 * z).toFixed(1)}px)`, shadow: `rgba(255,255,255,${.8 * glow})`, shadowBlur: 60 * glow + 18 });
}
// a soft dark band behind type (legibility over bright footage)
export function scrim(y0, y1, a) {
  if (a <= 0) return; const g = X.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.25, `rgba(0,0,0,${a})`); g.addColorStop(.75, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = g; X.fillRect(0, y0, W, y1 - y0);
}

// ── footage inside type: black everywhere except the letters (they show the footage), letters land one per 16th, then the camera
// dives into an ink stroke (exponential zoom to 400×) so the footage opens to full frame exactly on `t1` (the drop).
const M = document.createElement('canvas'); M.width = W; M.height = H; const MX = M.getContext('2d', { willReadFrequently: true });
export function typeMatte(t, t0, t1, zoom0, item, cx, cy, w, opts = {}) {
  if (t < t0 || t >= t1) return;
  const letters = item.text ? [...item.text] : null;
  // the ink point to dive into: the longest ink run on the middle row of the chosen letter (default: the widest letter)
  if (!opts._p) {
    MX.setTransform(1, 0, 0, 1, 0, 0); MX.clearRect(0, 0, W, H); draw(MX, item, cx, cy, w); const row = MX.getImageData(0, Math.round(cy), W, 1).data;
    let best = [cx, 0], run = 0; for (let i = 0; i < W; i++) { if (row[i * 4 + 3] > 200) { run++; if (run > best[1]) best = [i - run / 2, run]; } else run = 0; }
    opts._p = [best[0], cy];
  }
  const p = opts._p, z = Math.exp(Math.log(400) * inExpo(tw(t, zoom0, t1 - .045)));
  MX.setTransform(1, 0, 0, 1, 0, 0); MX.globalCompositeOperation = 'source-over'; MX.clearRect(0, 0, W, H); MX.fillStyle = '#000'; MX.fillRect(0, 0, W, H);
  MX.translate(p[0], p[1]); MX.scale(z, z); MX.translate(-p[0], -p[1]);
  MX.globalCompositeOperation = 'destination-out';
  if (letters && opts.perLetter !== false) {                           // letter-by-letter on 16ths, each one lands from 1.28×
    MX.font = `${item.size}px ${item.font || FONT}`; const full = MX.measureText(item.text), x0 = cx - (full.actualBoundingBoxLeft + full.actualBoundingBoxRight) / 2 + full.actualBoundingBoxLeft;
    let x = x0; letters.forEach((ch, i) => {
      const cw = MX.measureText(ch).width, tl = t0 + i * (bt(1) - bt(0)) / 4;
      if (t >= tl) { const s = 1.28 - .28 * out3(tw(t, tl, tl + .12)), lx = x + cw / 2; MX.save(); MX.translate(lx, cy); MX.scale(s, s); MX.translate(-lx, -cy);
        MX.fillStyle = '#fff'; MX.textBaseline = 'alphabetic'; MX.fillText(ch, x, cy + (full.actualBoundingBoxAscent - full.actualBoundingBoxDescent) / 2); MX.restore(); }
      x += cw;
    });
  } else draw(MX, item, cx, cy, w, { color: '#fff' });
  MX.globalCompositeOperation = 'source-over';
  X.drawImage(M, 0, 0);
}

// ── text behind a person: a giant word/logo, then a cut-out (tools/logo_prep.py sticker) rising in front of it
export function behind(t, t0, t1, item, size, y, cutName, cutH, cx = W / 2, anchorRight = false) {
  if (t < t0 || t >= t1) return;
  const k = tw(t, t0, t1), wipe = out3(tw(t, t0, t0 + .22));
  X.save(); X.beginPath(); X.rect(W / 2 - (W / 2 + 20) * wipe, 0, (W + 40) * wipe, H); X.clip(); draw(X, item, W / 2 - 30 * k, y, size, { alpha: .96 }); X.restore();
  if (!cutName || !IM[cutName]) return;
  const im = IM[cutName], h = cutH, w = h * im.width / im.height, rise = 1 - outBack(tw(t, t0 + .06, t0 + .42), 1.2);
  const s = 1 + .04 * k, x = anchorRight ? W - w + 40 : cx - w / 2, yy = H - h + 60 + rise * 520;
  X.save(); X.translate(x + w / 2, yy + h); X.scale(s, s); X.translate(-(x + w / 2), -(yy + h)); X.shadowColor = 'rgba(0,0,0,.5)'; X.shadowBlur = 40; X.drawImage(im, x, yy, w, h); X.restore();
}

// ── a tilted band of type scrolling across (use plain ASCII separators like "+" or "/": many display fonts have no ✦ glyph)
export function ticker(t, t0, t1, y, ang, text, speed, bg, fg, dir = 1, size = 62) {
  if (t < t0 || t > t1) return;
  const open = out3(tw(t, t0, t0 + .25)) * (1 - io(tw(t, t1 - .2, t1)));
  X.save(); X.translate(W / 2, y); X.rotate(ang * Math.PI / 180);
  const bh = size * 1.68 * open, L = Math.hypot(W, H); X.fillStyle = bg; X.fillRect(-L, -bh / 2, 2 * L, bh); X.beginPath(); X.rect(-L, -bh / 2, 2 * L, bh); X.clip();
  X.font = `${size}px ${FONT}`; X.textBaseline = 'middle'; X.fillStyle = fg;
  const unit = X.measureText(text).width, off = ((t - t0) * speed) % unit;
  for (let x = -L - unit + (dir > 0 ? -off : off) % unit; x < L; x += unit) X.fillText(text, x, size * .06);
  X.restore();
}
// a badge (e.g. "&" or "B2B") in a black disc sitting on a seam
export function badge(t, t0, t1, cx, cy, label, r = 74) {
  const L = life(t, t0, t1, .25, .14, 1.4); if (!L) return;
  X.save(); X.globalAlpha = L.alpha; X.translate(cx, cy); X.scale(L.scale * pulseAt(t), L.scale * pulseAt(t));
  X.beginPath(); X.arc(0, 0, r, 0, Math.PI * 2); X.fillStyle = '#000'; X.fill(); X.lineWidth = 4; X.strokeStyle = '#fff'; X.stroke(); X.restore();
  el(t, label, cx, cy, label.img ? r * .95 : 0, t0, t1, { s0: 1.4, shadow: 'rgba(0,0,0,0)' });
}
export function begin() { X.setTransform(1, 0, 0, 1, 0, 0); X.clearRect(0, 0, W, H); X.filter = 'none'; X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1; }

// ── audit: ink boxes of the text items drawn this frame vs the safe area (Reels / TikTok UI covers the bottom ~20 % and the right edge)
export const SAFE = [60, 150, W - 140, H - 380];
