"""review.py — contact sheet of the ENCODED film (what the client will see), no GPU needed.

    python review.py out/<NAME>.mp4 [out/review.jpg] [every_seconds=0.5]
"""
import os, sys, glob, shutil, subprocess, tempfile
from PIL import Image, ImageDraw

src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else "out/review.jpg"; every = float(sys.argv[3]) if len(sys.argv) > 3 else .5
tmp = tempfile.mkdtemp(prefix="review-")
subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps=1/{every},scale=216:-2", os.path.join(tmp, "r_%04d.jpg")], check=True)
fs = sorted(glob.glob(os.path.join(tmp, "r_*.jpg")))
if not fs: sys.exit("no frames extracted")
w, h = Image.open(fs[0]).size; cols = 10; rows = (len(fs) + cols - 1) // cols
S = Image.new("RGB", (cols * (w + 4) + 4, rows * (h + 20) + 4), (20, 20, 20)); g = ImageDraw.Draw(S)
for k, f in enumerate(fs):
    x, y = 4 + (k % cols) * (w + 4), 4 + (k // cols) * (h + 20); S.paste(Image.open(f), (x, y)); g.text((x + 2, y + h + 3), f"{k * every:.1f}s", fill=(230, 230, 230))
os.makedirs(os.path.dirname(out) or ".", exist_ok=True); S.save(out, quality=85); shutil.rmtree(tmp, ignore_errors=True)
print(out, len(fs), "frames")
