"""faces.py — find the face in a source frame so every shot can be framed on the person (run with an interpreter that has OpenCV).

    python tools/faces.py <requests.json> <faces.json>        (or: python tools/faces.py scan [step=0.5] → faces.json for every source)

requests.json: [[key, file, t], ...]. For each, the frame at t is decoded, OpenCV's Haar cascades (frontal + profile, both directions) run on a
1/2-size grey copy, and the most plausible face (largest; ties → nearest the frame centre) is written as normalised centre + size in the
display orientation: faces.json {"key@t": [cx, cy, w] or null}.
"""
import json, subprocess, sys
import numpy as np
try:
    import cv2
except ImportError:
    sys.exit("faces.py needs OpenCV: <studio>/.venv python -m pip install opencv-python-headless")

if sys.argv[1] == "scan":                                   # every source in sources.json, a frame every `step` seconds
    step = float(sys.argv[2]) if len(sys.argv) > 2 else .5; SRC = json.load(open("sources.json", encoding="utf-8")); req = []
    for key, v in SRC.items():
        if key.startswith("_") or v.get("banned"): continue
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", v["file"]], capture_output=True, text=True).stdout)
        d = min(d, v.get("max", 1e9)); t = step
        while t < d - .2: req.append([key, v["file"], round(t, 2)]); t += step
    sys.argv[2:] = ["faces.json"]
else:
    req = json.load(open(sys.argv[1], encoding="utf-8"))
out = {}
fr = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
fa = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
pr = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
for key, f, t in req:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", f, "-frames:v", "1", "-f", "image2", "-c:v", "png", "-"], capture_output=True).stdout
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None: out[f"{key}@{t}"] = None; continue
    H, W = img.shape[:2]; s = 640 / max(H, W); small = cv2.resize(img, (int(W * s), int(H * s))); g = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
    mn = int(min(small.shape[:2]) * .06)
    cands = []
    for c, w8 in ((fr, 1.0), (fa, 1.0), (pr, .8)):
        for flip in (False, True) if c is pr else (False,):
            gg = cv2.flip(g, 1) if flip else g
            for (x, y, w, h) in c.detectMultiScale(gg, 1.08, 5, minSize=(mn, mn)):
                if flip: x = gg.shape[1] - x - w
                cands.append(((x + w / 2) / g.shape[1], (y + h / 2) / g.shape[0], w / g.shape[1], w8))
    if not cands: out[f"{key}@{t}"] = None; continue
    # merge overlapping detections; score = size × weight × hits, mildly preferring the upper-middle of the frame
    best = None
    for cx, cy, w, w8 in cands:
        hits = sum(1 for c2 in cands if abs(c2[0] - cx) < w * .6 and abs(c2[1] - cy) < w * .6)
        sc = w * w8 * (1 + .5 * (hits - 1)) * (1.2 - abs(cx - .5) * .4) * (1.15 - abs(cy - .4) * .3)
        if best is None or sc > best[0]: best = (sc, cx, cy, w)
    out[f"{key}@{t}"] = [round(best[1], 4), round(best[2], 4), round(best[3], 4)]
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), indent=0)
found = sum(v is not None for v in out.values()); print(f"faces: {found}/{len(out)} frames")
