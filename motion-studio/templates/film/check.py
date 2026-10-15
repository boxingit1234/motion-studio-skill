"""check.py — measure the mix (you cannot listen: measure).   python check.py [out/mix.wav]

Prints: duration / peak / clipping / stereo correlation, RMS per section (edit SECT to your film's beats),
spectrum shares (targets: sub<60 ≈ 8–12 %, mid 1–4 kHz ≥ 12 %), the siren test (smooth tonal glides ≥ 0.18 s: must be []),
and the largest high-frequency jump (a click shows up as an outlier that is not a designed hit).
"""
import json, os, sys
import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
EV = json.load(open(os.path.join(HERE, "events.json"), encoding="utf-8")) if os.path.exists(os.path.join(HERE, "events.json")) else {}
B = 60 / EV.get("BPM", 120)
m, sr = sf.read(sys.argv[1] if len(sys.argv) > 1 else "out/mix.wav"); x = m.mean(1); db = lambda v: 20 * np.log10(v + 1e-9)
rms = lambda a, b: db(np.sqrt((x[int(a * B * sr):int(b * B * sr)] ** 2).mean()))
print(f"duration {len(x)/sr:.3f}s  peak {db(np.abs(m).max()):.2f} dBFS  clipped {(np.abs(m) >= .999).sum()}  L/R corr {np.corrcoef(m[:,0], m[:,1])[0,1]:.2f}")
SECT = [("hook", 0, 6), ("product", 6, 14), ("proof", 14, 24), ("lockup", 24, 29.5)]       # ← your sections (beats)
for n, a, b in SECT: print(f"  {n:<12} b{a:>5}-{b:<5} {rms(a, b):6.1f} dB")
f, p = signal.welch(x, sr, nperseg=8192); tot = p.sum()
print("spectrum " + "  ".join(f"{n} {100*p[(f>=lo)&(f<hi)].sum()/tot:4.1f}%" for n, lo, hi in [("sub<60", 0, 60), ("bass", 60, 250), ("lowmid", 250, 1000), ("mid", 1000, 4000), ("air>4k", 4000, 24000)]))
fq, tq, Z = signal.stft(x, sr, nperseg=4096, noverlap=3584); band = (fq > 250) & (fq < 3500); P = np.abs(Z[band]); fb = fq[band]
pk = fb[P.argmax(0)]; prom = P.max(0) / (np.median(P, 0) + 1e-9); runs = []; i = 0
while i < len(pk) - 2:
    d0 = np.log(pk[i + 1] / pk[i]); j = i
    while j + 1 < len(pk) and prom[j] > 20 and prom[j + 1] > 20 and 0 < abs(np.log(pk[j + 1] / pk[j])) < .07 and np.sign(np.log(pk[j + 1] / pk[j])) == np.sign(d0): j += 1
    if j - i >= 12: runs.append(round(tq[i], 2))
    i = max(j, i + 1)
print("smooth gliding tones (siren test, must be []):", runs)
d = np.abs(np.diff(signal.sosfilt(signal.butter(2, 3000, "high", fs=sr, output="sos"), x)))
print("largest HF jump", f"{d.max():.4f}", "at", f"{d.argmax()/sr:.3f}s (beat {d.argmax()/sr/B:.2f}) — fine if it is a designed hit (hat, impact)")
