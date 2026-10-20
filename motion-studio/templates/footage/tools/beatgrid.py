"""beatgrid.py — measure a song's real tempo, kick phase and drops, and check a finished mix against the edit's beats.

    python tools/beatgrid.py song music/song.mp3 [from_s to_s]   → tempo + kick phase + a bass-per-beat table + drop candidates
                                                                  (env BPM_RANGE=95,145 by default; give a window inside a drop)
                                                                  (writes music/<song>.grid.json)
    python tools/beatgrid.py check out/edit/mix.wav [edit.json]   → how far each kick lands from the promo's beats (ms)

Why not a beat tracker: on house / dance edits librosa's tempo was off by ~1 BPM and its phase by ~0.25 s, which drifts a 30 s promo off the
cuts by half a beat. Here the kick attacks (35–110 Hz band, rising edges of the envelope, exact 1 ms hop) are folded on a BPM sweep: the BPM
whose fold is most coherent wins, and the fold's angle is the phase. Drops = beats where the bass jumps up by ≥ 18 dB after a quiet bar.
"""
import json, os, subprocess, sys
import numpy as np
from scipy import signal

SR = 48000


def load(f, mono=True):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1" if mono else "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def attacks(y):
    """kick attacks: the 35–110 Hz band, a smooth (Hilbert, 60 Hz low-passed) envelope sampled every 1 ms exactly, its rising slope.
    (A max-of-|x| envelope ripples on bass notes and drags a fold 50–70 ms late.)"""
    lo = signal.sosfiltfilt(signal.butter(4, [35, 110], "band", fs=SR, output="sos"), y)
    env = signal.sosfiltfilt(signal.butter(2, 60, "low", fs=SR, output="sos"), np.abs(signal.hilbert(lo)))[::SR // 1000]
    d = np.maximum(0, np.diff(env))
    return lo, d, np.arange(len(d)) / 1000.0


def refine(d, ph, P, a, b):
    """median offset of the steepest attack within ±60 ms of each grid beat (the fold's phase is coarse)."""
    offs = []; thr = np.percentile(d, 97); k = int(np.ceil((a - ph) / P))
    while ph + k * P < b:
        i = int(round((ph + k * P) * 1000))
        if 60 < i < len(d) - 60 and d[i - 60:i + 60].max() >= thr: offs.append(int(np.argmax(d[i - 60:i + 60])) - 60)
        k += 1
    return (float(np.median(offs)) / 1000 if offs else 0.0), len(offs)


def song(f, a=None, b=None):
    y = load(f); lo, d, t = attacks(y)
    a = a if a is not None else 0.0; b = b if b is not None else len(y) / SR
    s = (t >= a) & (t < b); ts, ds = t[s], d[s]
    ds = np.where(ds >= np.percentile(ds, 95), ds, 0)                    # strong attacks only
    lo_bpm, hi_bpm = (float(v) for v in os.environ.get("BPM_RANGE", "95,145").split(","))   # club music; a 5/4 or 3/2 alias can win outside
    best = (0, 120.0)
    for bpm in np.arange(lo_bpm, hi_bpm, .05):                            # coarse
        z = np.abs((ds * np.exp(2j * np.pi * ts * bpm / 60)).sum()) / ds.sum()
        if z > best[0]: best = (z, bpm)
    for bpm in np.arange(best[1] - .1, best[1] + .1, .002):              # fine
        z = np.abs((ds * np.exp(2j * np.pi * ts * bpm / 60)).sum()) / ds.sum()
        if z > best[0]: best = (z, bpm)
    coh, bpm = best; P = 60 / bpm
    w = np.where(ds >= np.percentile(ds, 98), ds, 0)                     # the strongest attacks only (kicks, not bass ripple)
    ph = np.angle((w * np.exp(2j * np.pi * ts / P)).sum()) / (2 * np.pi) * P % P
    off, nk = refine(d, ph, P, a, b); ph = (ph + off) % P
    # bass level per beat (a drop = a big jump after quiet beats)
    k0, k1 = 0, int((len(y) / SR - ph) / P)
    lv = np.array([20 * np.log10(np.sqrt((lo[int((ph + k * P) * SR):int((ph + k * P + .1) * SR)] ** 2).mean()) + 1e-9) for k in range(k0, k1)])
    drops = []
    for k in range(4, len(lv) - 4):                                      # loud for the next 4 beats after a quiet bar
        if lv[k:k + 4].min() > lv.max() - 12 and np.median(lv[k - 4:k]) < lv[k] - 18 and (not drops or ph + k * P - drops[-1] > 8 * P):
            drops.append(round(float(ph + k * P), 3))
    print(f"{os.path.basename(f)}: {bpm:.3f} BPM (fold coherence {coh:.2f}; > .3 is a clear kick), kick phase {ph:.4f} s → beat k at {ph:.4f} + k·{P:.5f}"
          f"  ({nk} kicks used to refine)")
    print("drops (bass jumps):", drops if drops else "none found — read the table")
    print("bass dB per beat (time:dB), 8 beats a row:")
    for i in range(0, len(lv), 8):
        print("  " + "  ".join(f"{ph + k * P:7.2f}:{lv[k]:4.0f}" for k in range(i, min(i + 8, len(lv)))))
    out = os.path.splitext(f)[0] + ".grid.json"
    json.dump({"bpm": round(float(bpm), 3), "phase": round(float(ph), 4), "drops": drops, "coherence": round(float(coh), 3)}, open(out, "w"), indent=1)
    print("wrote", out, "\n→ to put the drop at promo beat B: \"start\": drop - B·60/bpm (× tempo if you time-stretch the song)")


def check(mix, edit="edit.json"):
    ED = json.load(open(edit, encoding="utf-8")); G = ED.get("grid", [{"b": 0, "bpm": ED.get("bpm", 120)}]); t0 = 0.0
    for i, g in enumerate(G):
        g["t"] = t0
        if i + 1 < len(G): t0 += (G[i + 1]["b"] - g["b"]) * 60 / g["bpm"]
    beats = []
    for i, g in enumerate(G):
        tend = G[i + 1]["t"] if i + 1 < len(G) else ED["dur"]; k = 0
        while g["t"] + k * 60 / g["bpm"] < tend: beats.append(g["t"] + k * 60 / g["bpm"]); k += 1
    _, d, _ = attacks(load(mix)); thr = np.percentile(d, 97); offs = []          # (the attack detector lags a real onset by ~5 ms)
    for bt in beats:
        i = int(bt * 1000)
        if 60 < i < len(d) - 60 and d[i - 60:i + 60].max() >= thr: offs.append(int(np.argmax(d[i - 60:i + 60])) - 60)
    o = np.array(offs)
    print(f"{len(o)} kicks on {len(beats)} beats · offset median {np.median(o):+.0f} ms, p10 {np.percentile(o, 10):+.0f}, p90 {np.percentile(o, 90):+.0f}"
          f"  (|median| ≤ 10 ms is on the beat; otherwise shift that song's start by the median)")


if __name__ == "__main__":
    if sys.argv[1] == "song": song(sys.argv[2], *(float(v) for v in sys.argv[3:5]))
    elif sys.argv[1] == "check": check(sys.argv[2], *(sys.argv[3:4]))
    else: print(__doc__)
