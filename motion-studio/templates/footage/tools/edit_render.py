"""edit_render.py — the footage pass: edit.json (or EDIT=<file>) → out/<edit name>/base.mp4, frame-exact on the music's beat grid.

    python tools/edit_render.py sheet          → out/<edit>/edit_sheet.jpg (first / middle / last frame of every shot; SHOTS=3,7 for some)
    python tools/edit_render.py part 0 14      → out/<edit>/parts/base_00.mp4   (shots 0–13; run 2 parts in parallel at most)
    python tools/edit_render.py join           → out/<edit>/base.mp4 (+ frame count check)
    python tools/edit_render.py splice 3,9     → re-render only those shots inside the existing base.mp4

edit.json: fps, dur, size [w, h] (default 1080×1920), grid (piecewise tempo: [{"b": 0, "bpm": 124.0}, {"b": 36, "bpm": 122.0}]), shake
(beat ranges with a small kick shake), shots. A shot starts on beat `b` and lasts until the next shot. Shot kinds:
  · single clip:  {"b", "src", "t", "speed" | "ramp": [from, to], "zoom": [z0, z1], "focus": [x, y] | "face", "look", "strength", "gain",
                   "punch", "ca", "flash", "whiteout": [u0, u1], "blur", "bloom", "strip": {...}, "trans": {"type": "iris", "f", "c"}}
  · grid:         {"b", "cells": [{"src", "t", "rect": [x0, y0, x1, y1], "on": beat offset, ...}], "gutter", "grid_zoom": {"c", "z": [[beat, z], ...]}}
  · split:        {"b", "cells": [A, B], "split": {"angle", "p": [[beat, share of A], ...], "seam"}}
sources.json: {"KEY": {"file", "phone": true (flat phone footage gets a contrast/saturation lift), "banned": true, "max": seconds, "note"}}.
"focus": "face" frames the crop on the face found by tools/faces.py (faces.json); without a detection it falls back to [.5, .42].

Per shot the source is streamed at twice the output fps; each output frame picks its source frame from the speed curve (so ramps and
slow motion are exact on 50/60 fps sources). Then framing (zoom / focus / punch / shake), the look (`natural`, `mono`, or a colour wash),
bloom, a colour split on the first frames of a cut, flash frames / a whiteout, vignette, grain.
"""

import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
def _font(size):
    for f in ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default()



HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDIT = os.environ.get("EDIT", "edit.json"); NAME = os.path.splitext(os.path.basename(EDIT))[0]
ED = json.load(open(os.path.join(HERE, EDIT), encoding="utf-8"))
SRC = json.load(open(os.path.join(HERE, "sources.json"), encoding="utf-8"))
FPS, DUR = ED["fps"], ED["dur"]
FACES = json.load(open(os.path.join(HERE, "faces.json"), encoding="utf-8")) if os.path.exists(os.path.join(HERE, "faces.json")) else {}
NF = int(round(DUR * FPS))
# beat map: piecewise constant tempo (each song keeps its own BPM unless it is time-stretched)
GRID = ED.get("grid", [{"b": 0, "bpm": ED.get("bpm", 120)}])
_t = 0.0
for i, gs in enumerate(GRID):
    gs["t"] = _t
    if i + 1 < len(GRID): _t += (GRID[i + 1]["b"] - gs["b"]) * 60 / gs["bpm"]
def time_of(b):
    gs = [g for g in GRID if g["b"] <= b][-1] if b >= GRID[0]["b"] else GRID[0]
    return gs["t"] + (b - gs["b"]) * 60 / gs["bpm"]
def beat_of(t):
    gs = [g for g in GRID if g["t"] <= t][-1] if t >= 0 else GRID[0]
    return gs["b"] + (t - gs["t"]) * gs["bpm"] / 60
def beat_len(b): return 60 / ([g for g in GRID if g["b"] <= b][-1] if b >= 0 else GRID[0])["bpm"]
W, H = ED.get("size", [1080, 1920])
SRC_FPS = 2 * FPS
OUTD = os.path.join(HERE, "out", NAME); os.makedirs(OUTD, exist_ok=True)
fr = lambda b: min(NF, int(round(time_of(b) * FPS)))
HUE = {"none": None, "violet": (.55, .22, 1.0), "blue": (.12, .38, 1.0), "magenta": (1.0, .16, .78), "red": (1.0, .08, .10), "gold": (1.0, .72, .25),
       "teal": (0.0, .85, .80), "pink": (1.0, .36, .62), "mono": (1.0, 1.0, 1.0)}

def face_focus(src, t0, dur, z):
    """median face position of `src` over [t0, t0 + dur] from faces.json, as a crop centre that puts the face ~38 % from the top."""
    pts = [v for k, v in FACES.items() if v and k.split("@")[0] == src and t0 - .3 <= float(k.split("@")[1]) <= t0 + dur + .3]
    if not pts: return [.5, .42]
    cx = float(np.median([p_[0] for p_ in pts])); cy = float(np.median([p_[1] for p_ in pts]))
    return [cx, cy + .12 / max(z, 1.0)]


shots = ED["shots"]
for i, s in enumerate(shots):
    s["f0"] = fr(s["b"]); s["f1"] = fr(shots[i + 1]["b"]) if i + 1 < len(shots) else NF; s["n"] = s["f1"] - s["f0"]
    for c in [s] + s.get("cells", []):
        if c.get("focus") == "face" and "src" in c:
            dur = s["n"] / FPS * (c.get("speed", 1.0) if "ramp" not in c else max(c["ramp"]))
            c["focus"] = face_focus(c["src"], c["t"], dur, c.get("zoom", [1.0, 1.0])[0])


def speeds(s, n):
    if "ramp" in s:
        a, b = s["ramp"]; u = np.linspace(0, 1, max(n, 1)); u = u * u * (3 - 2 * u); return a + (b - a) * u
    return np.full(n, s.get("speed", 1.0))


class Stream:
    """frames of one source from t0 at 50 fps, forward only. Vertical sources at 1080×1920, landscape ones 1920 wide."""
    def __init__(self, key, t0, dur):
        src = SRC[key]; f = src["file"]
        if src.get("banned"): raise ValueError(f"{key} is banned: {src.get('note', '')}")
        if "max" in src and t0 + dur > src["max"]: raise ValueError(f"{key}: {t0:.2f}+{dur:.2f} s runs past its safe end {src['max']}")
        info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", f], capture_output=True, text=True).stdout
        st = json.loads(info)["streams"][0]; w, h = st["width"], st["height"]
        rot = abs(int(next((d.get("rotation", 0) for d in st.get("side_data_list", []) if "rotation" in d), 0)))
        if rot in (90, 270): w, h = h, w
        if w < h: self.SW, self.SH = W, H
        else: self.SW, self.SH = 1920, int(round(1920 * h / w / 2)) * 2
        vf = f"fps={SRC_FPS},scale={self.SW}:{self.SH}:flags=bicubic,format=rgb24"
        cmd = ["ffmpeg", "-v", "error", "-ss", f"{t0:.4f}", "-i", f, "-t", f"{dur + .3:.4f}", "-vf", vf, "-an", "-f", "rawvideo", "-"]
        self.p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=2 ** 24)                    # small: big buffers × parallel parts run out of memory
        self.size = self.SW * self.SH * 3; self.idx = -1; self.cur = None; self.phone = src.get("phone", False)

    def get(self, j):
        while self.idx < j:
            raw = self.p.stdout.read(self.size)
            if len(raw) < self.size: break
            self.cur = np.frombuffer(raw, np.uint8).reshape(self.SH, self.SW, 3); self.idx += 1
        return self.cur

    def close(self):
        try: self.p.stdout.close(); self.p.kill()
        except Exception: pass


def shot_frames(s, n, with_strip=True):
    if s.get("src") == "black":
        for _ in range(n): yield None, None, False
        return
    sp = speeds(s, n); tau = np.concatenate([[0], np.cumsum(sp[:-1])]) / FPS
    st = Stream(s["src"], s["t"], tau[-1] + 1 / FPS); stp = None
    if with_strip and "strip" in s:
        q = s["strip"]; sp2 = np.full(n, q.get("speed", 1.0)); tau2 = np.concatenate([[0], np.cumsum(sp2[:-1])]) / FPS
        stp = (Stream(q["src"], q["t"], tau2[-1] + 1 / FPS), tau2)
    try:
        for k in range(n):
            a = st.get(int(round(tau[k] * SRC_FPS)))
            b = stp[0].get(int(round(stp[1][k] * SRC_FPS))) if stp else None
            yield a, b, st.phone
    finally:
        st.close()
        if stp: stp[0].close()


yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIG = (1 - .30 * np.clip(((xx - W / 2) / (W * .62)) ** 2 + ((yy - H * .5) / (H * .62)) ** 2, 0, 1) ** 1.3)[..., None]
LUMW = np.float32([.299, .587, .114])
GRAIN = [np.random.default_rng(k).standard_normal((H // 2, W // 2), np.float32).repeat(2, 0).repeat(2, 1)[..., None] * .022 for k in range(8)]


def in_shake(b): return any(a <= b < c for a, c in ED.get("shake", []))


def frame_box(img, s, k, g, out=(W, H), shake=True):
    SH, SW = img.shape[:2]; ow, oh = out
    z0, z1 = s.get("zoom", [1.0, 1.0]); u = min(1.0, k / max(1, s["n"] - 1))
    z = z0 + (z1 - z0) * (u * u * (3 - 2 * u))
    z *= 1 + s.get("punch", 0) * np.exp(-k / 3.0)
    b = beat_of(g / FPS); dx = dy = 0.0
    if shake and in_shake(b):
        ph = (b - int(b)) * beat_len(b) * FPS; e = np.exp(-ph / 2.2)
        z *= 1 + .022 * e
        r = np.random.default_rng(int(b) * 31 + 7); dx, dy = (r.random(2) - .5) * 2 * ED.get("shake_amp", 14) * e
    fx, fy = s.get("focus", [.5, .45])
    asp = ow / oh
    bw, bh = (SH * asp, SH) if SW / SH > asp else (SW, SW / asp)                    # largest box of the output aspect
    bw, bh = bw / z, bh / z
    x0 = min(max(fx * SW - bw / 2 + dx * SW / ow, 0), SW - bw); y0 = min(max(fy * SH - bh / 2 + dy * SH / oh, 0), SH - bh)
    im = Image.fromarray(img).resize((ow, oh), Image.BICUBIC if bw < ow else Image.BILINEAR, box=(x0, y0, x0 + bw, y0 + bh))
    return np.asarray(im, np.float32) / 255


def mono_grade(x, k=1.0):
    """a poster-like black & white: luminance, an S-curve with deep blacks and soft whites, a breath of warmth in the highlights."""
    L = np.clip(x @ LUMW, 0, 1)
    L = np.clip((L - .03) / .9, 0, 1); L = L * L * (3 - 2 * L) * .55 + L * .45      # S-curve
    m = L[..., None] * np.float32([1.0, .985, .955]) + (1 - L[..., None]) * np.float32([0, .004, .012])
    return x * (1 - k) + m * k


def look(x, name, strength=.85, phone=False):
    if phone:                                                              # phone footage: flatter and greyer than graded camera clips
        L = (x @ LUMW)[..., None]; x = np.clip(L + (x - L) * 1.28, 0, 1); x = np.clip((x - .045) / .93, 0, 1) ** 1.12
    if name == "mono":
        return mono_grade(x, strength)
    if name in (None, "natural"):
        L = (x @ LUMW)[..., None]; x = np.clip(L + (x - L) * 1.08, 0, 1)
        x = np.clip((x - .025) / .975, 0, 1) ** 1.05
        return np.clip(x + (1 - L) * np.float32([-.008, .004, .016]) + L * np.float32([.02, .006, -.016]), 0, 1)
    C = np.float32(HUE[name]); L = np.clip(x @ LUMW, 0, 1)[..., None]
    t = np.clip((L - .03) / .8, 0, 1) ** .85
    base = np.clip(C * t * 1.3, 0, 1); w = np.clip((t - .62) / .38, 0, 1) ** 1.5
    mono = base * (1 - w) + (C * .35 + .65) * w
    return np.clip((x * (1 - strength) + mono * strength - .02) / .98, 0, 1)


def bloom(x, amt):
    small = x[::8, ::8]; L = small @ LUMW
    hi = small * np.clip((L - .55) / .45, 0, 1)[..., None]
    im = Image.fromarray((np.clip(hi, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)).resize((W, H), Image.BILINEAR)
    return np.clip(x + np.asarray(im, np.float32) / 255 * amt, 0, 1)


def strip_layer(q, img2, k, n, g, phone):
    """a tilted band showing a (landscape) clip in natural colour: content cropped to the band's own aspect, rotated, with a soft shadow."""
    hh = int(q.get("h", .25) * H); L = int(W * 1.25); ang = q.get("angle", -6)
    slide = q.get("slide", 0) * (k / max(1, n - 1) - .5)
    c = frame_box(img2, q | {"n": n}, k, g, out=(L, hh), shake=False)
    c = look(c, q.get("look", "natural"), .85, phone)
    rgba = Image.fromarray((c * 255).astype(np.uint8)).convert("RGBA")
    rot = rgba.rotate(ang, resample=Image.BICUBIC, expand=True)
    cy = q.get("y", .55) * H
    ox = int(W / 2 + slide - rot.width / 2); oy = int(cy - rot.height / 2)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0)); canvas.alpha_composite(rot, (ox, oy))
    a = np.asarray(canvas, np.float32) / 255
    sh = Image.fromarray((a[..., 3] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18))
    return a[..., :3], a[..., 3:4], np.roll(np.asarray(sh, np.float32)[..., None] / 255, 14, 0)


def cell_frames(s, n):
    """for a shot with "cells": per output frame, the source frames of every cell (each with its own source, time and speed)."""
    sts = []
    for c in s["cells"]:
        sp = np.full(n, c.get("speed", 1.0)); tau = np.concatenate([[0], np.cumsum(sp[:-1])]) / FPS
        sts.append((Stream(c["src"], c["t"], tau[-1] + 1 / FPS), tau))
    try:
        for k in range(n): yield [st.get(int(round(tau[k] * SRC_FPS))) for st, tau in sts], [st.phone for st, _ in sts]
    finally:
        for st, _ in sts: st.close()


def ease(u): u = min(1.0, max(0.0, u)); return u * u * (3 - 2 * u)


def keyed(keys, u):
    """piecewise eased interpolation of [[u, value], ...]."""
    if u <= keys[0][0]: return keys[0][1]
    for (u0, v0), (u1, v1) in zip(keys, keys[1:]):
        if u <= u1: return v0 + (v1 - v0) * ease((u - u0) / max(1e-6, u1 - u0))
    return keys[-1][1]


def compose_cells(s, k, g, frames, phones):
    n = s["n"]; bl = beat_len(s["b"]); kb = k / FPS / bl                      # beats since the shot started
    if "split" in s:                                                        # two full-frame clips with a straight seam at an angle, animated
        sp = s["split"]; a_, b_ = s["cells"]
        A = look(frame_box(frames[0], a_ | {"n": n}, k, g), a_.get("look", "natural"), a_.get("strength", .85), phones[0]) * a_.get("gain", 1.0)
        B = look(frame_box(frames[1], b_ | {"n": n}, k, g), b_.get("look", "natural"), b_.get("strength", .85), phones[1]) * b_.get("gain", 1.0)
        ang = np.deg2rad(sp.get("angle", 0)); nx, ny = np.cos(ang), np.sin(ang)        # seam normal (0 deg = a vertical seam, A on the left)
        d = (xx - W / 2) * nx + (yy - H / 2) * ny; lo, hi = d.min(), d.max()
        p = keyed(sp["p"], kb)                                              # the share of the frame owned by A (1 = all A)
        c = lo + (hi - lo) * p
        m = np.clip((c - d) / 1.5 + .5, 0, 1)[..., None]
        x = A * m + B * (1 - m)
        if 0 < p < 1: x = np.where((np.abs(d - c) < sp.get("seam", 4))[..., None], np.float32(1.0), x)
        return x
    x = np.zeros((H, W, 3), np.float32); gut = s.get("gutter", 8)
    for i, c in enumerate(s["cells"]):
        if kb < c.get("on", 0): continue
        x0, y0, x1, y1 = c["rect"]
        X0, Y0, X1, Y1 = int(x0 * W + gut / 2), int(y0 * H + gut / 2), int(x1 * W - gut / 2), int(y1 * H - gut / 2)
        if x0 == 0: X0 = 0
        if y0 == 0: Y0 = 0
        if x1 == 1: X1 = W
        if y1 == 1: Y1 = H
        cw, ch = X1 - X0, Y1 - Y0
        y = frame_box(frames[i], c | {"n": n}, k, g, out=(cw, ch), shake=False)
        y = look(y, c.get("look", s.get("look", "natural")), c.get("strength", .85), phones[i]) * c.get("gain", 1.0)
        since = (kb - c.get("on", 0)) * bl * FPS
        if since < 2: y = y + (1 - y) * (.75 * (1 - since / 2))             # each cell pops in with a flash
        x[Y0:Y1, X0:X1] = y
    if "grid_zoom" in s:                                                    # push into one cell until it fills the frame
        gz = s["grid_zoom"]; z = keyed(gz["z"], kb)
        if z > 1.001:
            cx, cy = gz.get("c", [.5, .5]); bw, bh = W / z, H / z
            x0 = min(max(cx * W - bw / 2, 0), W - bw); y0 = min(max(cy * H - bh / 2, 0), H - bh)
            im = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + bw, y0 + bh))
            x = np.asarray(im, np.float32) / 255
    return x


def shot_iter(i, upto=None):
    """finished frames (float RGB) of shot i, transitions included."""
    s = shots[i]; n = s["n"] if upto is None else min(s["n"], upto); g0 = s["f0"]
    tr = s.get("trans"); prev = continuation(shots[i - 1], tr["f"]) if tr and i > 0 else None
    src = cell_frames(s, n) if "cells" in s else shot_frames(s, n)
    for k, item in enumerate(src):
        g = g0 + k
        if "cells" in s:
            fr, ph = item; x = finish(s, k, g, None, None, False, pre=compose_cells(s, k, g, fr, ph))
        else:
            a, b2, ph = item; x = finish(s, k, g, a, b2, ph)
        if prev is not None and k < tr["f"]:
            pa, pph = next(prev); sp = shots[i - 1]; y = finish(sp, sp["n"] + k, g, pa, None, pph)
            m, rim = iris_mask(tr, k); x = np.clip(x * m + y * (1 - m) + rim, 0, 1)
        yield x


def continuation(sp, m):
    """the previous shot sp running on for m frames past its cut (for transitions)."""
    n = sp["n"]; spd = speeds(sp, n); spd = np.concatenate([spd, np.full(m, spd[-1])])
    tau = np.concatenate([[0], np.cumsum(spd[:-1])]) / FPS
    st = Stream(sp["src"], sp["t"] + tau[n], tau[-1] - tau[n] + 2 / FPS)
    try:
        for j in range(m): yield st.get(int(round((tau[n + j] - tau[n]) * SRC_FPS))), st.phone
    finally: st.close()


def iris_mask(tr, k):
    """an expanding circle (the moon motif): radius eased 0 → past the corners over tr["f"] frames, with a glowing rim."""
    cx, cy = tr.get("c", [.5, .4]); cx *= W; cy *= H
    u = min(1.0, (k + 1) / tr["f"]); u = u * u * (3 - 2 * u)
    R = u * np.hypot(max(cx, W - cx), max(cy, H - cy)) * 1.02
    d = np.hypot(xx - cx, yy - cy)
    m = np.clip((R - d) / 3.0 + .5, 0, 1)[..., None]
    rim = np.exp(-((d - R) / 10.0) ** 2)[..., None] * (1 - u) * tr.get("rim", .9)
    return m, rim


def finish(s, k, g, img, img2, phone, pre=None):
    if pre is not None: x = pre
    elif img is None: x = np.zeros((H, W, 3), np.float32)
    else:
        x = frame_box(img, s, k, g)
        x = look(x, s.get("look", "natural"), s.get("strength", .85), phone)
        x = x * s.get("gain", 1.0)
    if s.get("blur"):                                                       # a soft backdrop (type / cut-outs go on top)
        x = np.asarray(Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(s["blur"])), np.float32) / 255
    if img2 is not None:
        q = s["strip"]; rgb, m, shadow = strip_layer(q, img2, k, s["n"], g, SRC[q["src"]].get("phone", False))
        x = x * (1 - .55 * shadow) ; x = x * (1 - m) + rgb * m
    if img is not None or pre is not None: x = bloom(x, s.get("bloom", .45))
    ca = s.get("ca", 0)
    if ca and k < 3:
        d = int(round(ca * (1 - k / 3))); x = x.copy(); x[..., 0] = np.roll(x[..., 0], d, 1); x[..., 2] = np.roll(x[..., 2], -d, 1)
    fl = s.get("flash", 0)
    if k < fl: x = x + (1 - x) * (.85 * (1 - k / fl))
    if "whiteout" in s:                                                     # the shot burns out to white over its last part
        a0, a1 = s["whiteout"]; u = min(1.0, k / max(1, s["n"] - 1)); w = np.clip((u - a0) / max(1e-6, a1 - a0), 0, 1) ** 2
        x = x + (1 - x) * w
    if img is not None or pre is not None: x = x * VIG
    x = x + GRAIN[g % len(GRAIN)]
    return np.clip(x, 0, 1)


def run_sheet():
    TW, TH = 150, 266; font = _font(11); cols = 12; cells = []
    only = [int(v) for v in os.environ["SHOTS"].split(",")] if os.environ.get("SHOTS") else range(len(shots))
    for i in only:
        s = shots[i]; ks = [0, s["n"] // 2, s["n"] - 1] if s["n"] > 5 else [0, s["n"] - 1]; frames = {}
        for k, x in enumerate(shot_iter(i, max(ks) + 1)):
            if k in ks: frames[k] = x
        for k in ks: cells.append((s, k, frames[k]))
    sheet = Image.new("RGB", (cols * TW, ((len(cells) + cols - 1) // cols) * (TH + 28)), (18, 18, 18)); dr = ImageDraw.Draw(sheet)
    for j, (s, k, x) in enumerate(cells):
        X, Y = (j % cols) * TW, (j // cols) * (TH + 28)
        sheet.paste(Image.fromarray((x * 255).astype(np.uint8)).resize((TW, TH)), (X, Y))
        dr.text((X + 3, Y + TH + 2), f"b{s['b']:g}+{k} {s.get('src', 'cells')}@{s.get('t', 0):g}", fill=(240, 240, 240), font=font)
        dr.text((X + 3, Y + TH + 14), f"{s.get('look', 'natural')} {s['n']}f", fill=(160, 160, 160), font=font)
    p = os.path.join(OUTD, "edit_sheet.jpg"); sheet.save(p, quality=86); print("wrote", p)


def run_part(i0, i1):
    PD = os.path.join(OUTD, "parts"); os.makedirs(PD, exist_ok=True); out = os.path.join(PD, f"base_{i0:02d}.mp4")
    if os.path.exists(out): print("exists", out); return
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-framerate", str(FPS), "-i", "-",
                            "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "13",
                            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-f", "mp4", out + ".tmp"], stdin=subprocess.PIPE)
    g = shots[i0]["f0"]
    for i in range(i0, min(i1, len(shots))):
        s = shots[i]
        for x in shot_iter(i):
            enc.stdin.write((x * 255 + .5).astype(np.uint8).tobytes()); g += 1
        print(f"shot {i + 1}/{len(shots)}  b{s['b']:g}  {s.get('src', 'cells')}@{s.get('t', 0):g}  {s['n']} frames", flush=True)
    enc.stdin.close(); enc.wait(); os.replace(out + ".tmp", out); print("wrote", out)


def run_splice(idx):
    """re-render only shots `idx` into the existing base.mp4 (decode it, swap their frames, re-encode once) → base.mp4."""
    src = os.path.join(OUTD, "base.mp4"); tmp = os.path.join(OUTD, "base_splice.mp4")
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", "scale=in_color_matrix=bt709:in_range=tv,format=rgb24", "-f", "rawvideo", "-"], stdout=subprocess.PIPE, bufsize=W * H * 3 * 2)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-framerate", str(FPS), "-i", "-",
                            "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "12",
                            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", tmp], stdin=subprocess.PIPE)
    todo = {i: shots[i] for i in idx}; g = 0
    while g < NF:
        hit = next((i for i, s in todo.items() if s["f0"] == g), None)
        if hit is not None:
            s = todo[hit]
            for x in shot_iter(hit):
                enc.stdin.write((x * 255 + .5).astype(np.uint8).tobytes()); dec.stdout.read(W * H * 3); g += 1
            print(f"spliced shot {hit} b{s['b']:g} {s.get('src', 'cells')}@{s.get('t', 0):g} ({s['n']} frames)", flush=True)
        else:
            enc.stdin.write(dec.stdout.read(W * H * 3)); g += 1
    enc.stdin.close(); enc.wait(); dec.kill(); os.replace(tmp, src)
    n = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", src], capture_output=True, text=True).stdout.strip()
    print(f"spliced {len(idx)} shots -> {src} ({n} frames, expected {NF})")


def run_join():
    PD = os.path.join(OUTD, "parts"); parts = sorted(f for f in os.listdir(PD) if f.startswith("base_") and f.endswith(".mp4"))
    open(os.path.join(PD, "list.txt"), "w").write("".join(f"file '{f}'\n" for f in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(PD, "list.txt"), "-c", "copy", "-movflags", "+faststart", os.path.join(OUTD, "base.mp4")])
    n = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", os.path.join(OUTD, "base.mp4")], capture_output=True, text=True).stdout.strip()
    print(f"joined {len(parts)} parts -> {OUTD}/base.mp4 ({n} frames, expected {NF})")


mode = sys.argv[1] if len(sys.argv) > 1 else "part"
if mode == "sheet": run_sheet()
elif mode == "part": run_part(int(sys.argv[2]) if len(sys.argv) > 2 else 0, int(sys.argv[3]) if len(sys.argv) > 3 else len(shots))
elif mode == "join": run_join()
elif mode == "splice": run_splice([int(v) for v in sys.argv[2].split(",")])
