"""srcsheet.py — timestamped contact sheets of the sources (one row per clip, a frame every STEP seconds)."""
import subprocess, sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
def _font(size):
    for f in ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default()


SRC = json.load(open("sources.json", encoding="utf-8"))
keys = sys.argv[1].split(","); step = float(sys.argv[2]); out = sys.argv[3]
TH = 150; font = _font(11)
rows = []
for k in keys:
    f = SRC[k]["file"]; dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)
    dur = min(dur, SRC[k].get("max", 1e9)); ts = np.arange(0.2, dur - .1, step)
    tiles = []
    for t in ts:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", f, "-frames:v", "1", "-vf", f"scale=-2:{TH}", "-f", "image2", "-c:v", "png", "-"], capture_output=True).stdout
        im = Image.open(__import__("io").BytesIO(raw)).convert("RGB"); d = ImageDraw.Draw(im); d.rectangle([0, 0, 38, 13], fill=(0, 0, 0)); d.text((2, 1), f"{t:.1f}", fill=(255, 255, 0), font=font); tiles.append(im)
    w = sum(t.width + 2 for t in tiles) + 50; row = Image.new("RGB", (w, TH), (25, 25, 25)); ImageDraw.Draw(row).text((3, 60), k, fill=(255, 255, 255), font=font)
    x = 50
    for t in tiles: row.paste(t, (x, 0)); x += t.width + 2
    rows.append(row)
W = max(r.width for r in rows); sheet = Image.new("RGB", (W, len(rows) * (TH + 4)), (10, 10, 10))
for i, r in enumerate(rows): sheet.paste(r, (0, i * (TH + 4)))
sheet.save(out, quality=84); print(out, sheet.size)
