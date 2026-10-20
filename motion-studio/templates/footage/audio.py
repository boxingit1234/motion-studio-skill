"""audio.py — the promo's music from edit.json["music"] (+ "sfx"), on the edit's beat grid.

    EDIT=edit.json python audio.py out/edit/mix.wav

music: [{"file", "start" (song seconds), "at" / "until" (promo beats), "tempo" (atempo factor, pitch kept: match a second song's BPM),
          "tail" (seconds of reverb tail after a hard out), "out_beats" (DJ out: a rising high-pass over the last beats),
          "echo" (the last beat echoes out), "in_beats" (the next song rises underneath)}]
sfx:   [{"file", "at" (beat) | "peak_at" (beat: the file's loudest moment lands there), "gain" (dB)}]
Pick each "start" from tools/beatgrid.py (measured kick phase + drops), not from a beat tracker. Peak-normalised to −1.5 dBFS; make.mjs
finish sets −14 LUFS with one exact gain. Verify with: python tools/beatgrid.py check <mix.wav> (kicks vs promo beats).
"""

import json, os, subprocess, sys
import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ED = json.load(open(os.path.join(HERE, os.environ.get("EDIT", "edit.json")), encoding="utf-8"))
SR = 48000; DUR = ED["dur"]; N = int(round(DUR * SR))
GRID = ED.get("grid", [{"b": 0, "bpm": ED.get("bpm", 120)}]); _t = 0.0
for i, gs in enumerate(GRID):
    gs["t"] = _t
    if i + 1 < len(GRID): _t += (GRID[i + 1]["b"] - gs["b"]) * 60 / gs["bpm"]
def time_of(b):
    gs = [g for g in GRID if g["b"] <= b][-1] if b >= GRID[0]["b"] else GRID[0]
    return gs["t"] + (b - gs["b"]) * 60 / gs["bpm"]
def beat_len(b): return 60 / [g for g in GRID if g["b"] <= b][-1]["bpm"]
rng = np.random.default_rng(3)

def load(f, start, dur, tempo=1.0):
    """the song from `start` (song seconds); `tempo` > 1 plays it faster with the pitch kept (ffmpeg atempo), `dur` is output seconds."""
    af = ["-af", f"atempo={tempo:.6f}"] if abs(tempo - 1) > 1e-6 else []
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.4f}", "-i", os.path.join(HERE, f), "-t", f"{dur * tempo + .1:.4f}", *af, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)

def hp_sweep(x, f0, f1):
    """time-varying 2nd-order high-pass, cutoff rising exponentially f0 → f1 across x (block-wise, 256-sample blocks, state carried)."""
    out = np.zeros_like(x); n = len(x); blk = 256; zi = None
    for i in range(0, n, blk):
        u = i / max(1, n - 1); fc = f0 * (f1 / f0) ** (u ** 1.6)
        sos = signal.butter(2, fc, "high", fs=SR, output="sos")
        if zi is None: zi = np.zeros((sos.shape[0], 2, 2))
        for c in range(2):
            out[i:i + blk, c], zi[:, :, c] = signal.sosfilt(sos, x[i:i + blk, c], zi=zi[:, :, c])
    return out

mix = np.zeros((N, 2))
L = int(1.3 * SR); tt = np.arange(L) / SR
IR = np.stack([rng.standard_normal(L) * np.exp(-tt / .32) for _ in range(2)], 1); IR[:, 0] = signal.lfilter(*signal.butter(1, 6000, "low", fs=SR), IR[:, 0]); IR[:, 1] = signal.lfilter(*signal.butter(1, 6000, "low", fs=SR), IR[:, 1])
IR /= np.abs(IR).sum(0).max() / 4
for seg in ED["music"]:
    a = int(round(time_of(seg["at"]) * SR)); e = min(N, int(round(time_of(seg["until"]) * SR))); n = e - a; B = beat_len(seg["until"] - .01)
    x = load(seg["file"], seg["start"], n / SR + .05, seg.get("tempo", 1.0))[:n]
    x = np.pad(x, ((0, max(0, n - len(x))), (0, 0)))
    if "tail" in seg:
        bar = int(4 * B * SR)
        x[-bar:] = hp_sweep(x[-bar:], 25, 900)
        last = x[-int(B * SR):]                                              # the last beat feeds the reverb tail
        wet = np.stack([signal.fftconvolve(last[:, c], IR[:, c]) for c in range(2)], 1)
        tl = int(seg["tail"] * SR); w = wet[len(last):len(last) + tl] * np.linspace(1, 0, tl)[:, None] ** 2
        mix[e:e + len(w)] += w[:max(0, N - e)]
    if "out_beats" in seg:                                                 # DJ out: the bass leaves over the last beats (rising high-pass)
        k = int(seg["out_beats"] * B * SR); x[-k:] = hp_sweep(x[-k:], 30, 650)
        u = np.linspace(0, 1, k)[:, None]; x[-k:] *= 1 - .2 * u ** 2
    if seg.get("echo"):                                                    # ...and its last beat echoes out (3/4-beat delay, feedback, thinning)
        last = x[-int(B * SR):].copy(); d = int(.75 * B * SR); L = int(3.5 * B * SR); y = np.zeros((L + len(last), 2)); fb = .48
        for r in range(1, 8):
            o = r * d
            if o >= len(y): break
            tap = last * fb ** r; m = min(len(tap), len(y) - o); y[o:o + m] += tap[:m]
        y = signal.sosfilt(signal.butter(2, [350, 5000], "band", fs=SR, output="sos"), y, axis=0)
        tail = y[len(last):] * np.linspace(1, 0, L)[:, None] ** 1.5 * .85
        x[-int(B * SR):] += y[:int(B * SR)] * .6                            # the echo starts inside the last beat
        mix[e:e + len(tail)] += tail[:max(0, N - e)]
    if "in_beats" in seg:                                                  # DJ in: the next track rises under the outgoing one
        k = int(seg["in_beats"] * B * SR); u = np.linspace(0, 1, k)[:, None]; x[:k] *= u ** 1.2
    x[:int(.008 * SR)] *= np.linspace(0, 1, int(.008 * SR))[:, None]
    mix[a:e] += x
for fx in ED.get("sfx", []):                                              # whooshes / impacts: each one's loudest moment lands on its beat
    if not os.path.exists(os.path.join(HERE, fx["file"])): print(f"  sfx missing, skipped: {fx['file']}"); continue
    y = load(fx["file"], 0, 6.0)
    env = np.convolve(np.abs(y).mean(1), np.ones(int(.02 * SR)) / int(.02 * SR), "same"); pk = int(np.argmax(env))
    if "peak_at" in fx: a = int(round(time_of(fx["peak_at"]) * SR)) - pk
    else: a = int(round(time_of(fx["at"]) * SR))
    y = y * 10 ** (fx.get("gain", -12) / 20)
    if a < 0: y = y[-a:]; a = 0
    m = min(len(y), N - a)
    if m > 0: mix[a:a + m] += y[:m]
    print(f"  sfx {os.path.basename(fx['file'])}: peak {pk / SR:.2f}s in the file, placed at {a / SR:.3f}s ({fx.get('gain', -12)} dB)")
t = np.arange(N) / SR
mix *= np.clip(t / .04, 0, 1)[:, None]
mix *= np.clip((DUR - t) / .35, 0, 1)[:, None] ** 1.2                    # a short fade on the last frames
def tp_limit(x, cut_db, hold=.015, smooth=.006):
    from scipy.signal import resample_poly
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    n = x.shape[0]; up = np.abs(resample_poly(x, 4, 1, axis=0)).max(1); env = up[:n * 4].reshape(n, 4).max(1)
    thr = env.max() * 10 ** (-cut_db / 20); gr = 1 - np.minimum(1, thr / np.maximum(env, 1e-9))
    gr = uniform_filter1d(maximum_filter1d(gr, int(hold * SR) | 1), int(smooth * SR) | 1)
    return x * (1 - gr)[:, None]
mix = tp_limit(mix, 2.0)
from scipy.signal import resample_poly
tp = np.abs(resample_poly(mix, 4, 1, axis=0)).max()                       # normalise the TRUE peak (inter-sample), not the sample peak
mix *= 10 ** (-2.0 / 20) / (tp + 1e-9)
out = sys.argv[1] if len(sys.argv) > 1 else "out/mix.wav"
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
sf.write(out, mix.astype(np.float32), SR, subtype="PCM_24")
db = lambda v: 20 * np.log10(np.sqrt((v ** 2).mean()) + 1e-9)
for seg in ED["music"]: print(f"  {os.path.basename(seg['file'])}: song {seg['start']:.3f}s at beat {seg['at']} ({time_of(seg['at']):.3f}s) → beat {seg['until']}")
print(f"audio {DUR:.3f} s → {out} · RMS per 2 s:", " ".join(f"{db(mix[int(i * SR):int((i + 2) * SR)]):.0f}" for i in range(0, int(DUR), 2)))
