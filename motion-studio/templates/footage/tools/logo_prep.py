"""logo_prep.py — make logos and cut-outs ready for the graphics layer.

    python tools/logo_prep.py crisp  <in.png> <name>              → assets/<name>@4x.png   (white, re-thresholded at 4×: crisp edges at any size)
    python tools/logo_prep.py sticker <in.png> <name> [bottom,right] → assets/<name>_sticker.png (a person cut-out with a white outline;
                                                                     listed edges are cut off by the frame, so they get no outline)
    python tools/logo_prep.py optical                             → assets/optical.json (every assets/*@4x.png: the ink's centre of mass)

Logos lifted from a poster/PSD are often small (300–800 px) with soft edges; scaled up in a 1080-wide frame they look blurry. Re-thresholding
the alpha at 4× gives clean vector-like edges. optical.json lets gfx.js place each logo on its OPTICAL centre: a logo with a heavy left
side (or a script with a long tail) looks off-centre when its bounding box is centred.
"""
import glob, json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

os.makedirs("assets", exist_ok=True)


def crisp(src, name, k=4, lo=.38, hi=.62):
    im = Image.open(src).convert("RGBA"); im = im.crop(im.getbbox()); w, h = im.size
    pad = Image.new("RGBA", (w + 8, h + 8), (0, 0, 0, 0)); pad.alpha_composite(im, (4, 4))
    a = np.asarray(pad.resize(((w + 8) * k, (h + 8) * k), Image.LANCZOS), np.float32)[..., 3] / 255
    a = np.clip((a - lo) / (hi - lo), 0, 1); a = a * a * (3 - 2 * a)
    out = Image.fromarray((np.dstack([np.ones_like(a)] * 3 + [a]) * 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(.6))
    out = out.crop(out.getbbox()); out.save(f"assets/{name}@4x.png"); print("wrote", f"assets/{name}@4x.png", out.size)


def sticker(src, name, cut="bottom", scale=1.6, stroke=11):
    im = Image.open(src).convert("RGBA"); im = im.crop(im.getbbox()); im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    pad = 40; W, H = im.width + 2 * pad, im.height + 2 * pad
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0)); base.alpha_composite(im, (pad, pad))
    a = np.asarray(base)[..., 3] > 100; ys, xs = np.nonzero(a); bottom, right = ys.max(), xs.max()
    ring = ndimage.binary_dilation(a, iterations=stroke) & ~a
    if "bottom" in cut: ring[bottom - 30:, :] = False
    if "right" in cut: ring[:, right - 30:] = False
    o = np.zeros((H, W, 4), np.uint8); o[ring] = (255, 255, 255, 255)
    res = Image.new("RGBA", (W, H), (0, 0, 0, 0)); res.alpha_composite(Image.fromarray(o).filter(ImageFilter.GaussianBlur(.8))); res.alpha_composite(base)
    res = res.crop((0, 0, right + 1 if "right" in cut else W, bottom + 1 if "bottom" in cut else H))
    res.save(f"assets/{name}_sticker.png"); print("wrote", f"assets/{name}_sticker.png", res.size)


def optical():
    out = {}
    for f in sorted(glob.glob("assets/*@4x.png")):
        a = np.asarray(Image.open(f))[..., 3].astype(float) / 255; H, W = a.shape; ys, xs = np.mgrid[0:H, 0:W]; m = a.sum()
        out[os.path.basename(f)[:-7]] = [round((xs * a).sum() / m / W - .5, 4), round((ys * a).sum() / m / H - .5, 4)]
    json.dump(out, open("assets/optical.json", "w"), indent=1); print("wrote assets/optical.json", out)


if __name__ == "__main__":
    m = sys.argv[1]
    if m == "crisp": crisp(sys.argv[2], sys.argv[3])
    elif m == "sticker": sticker(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "bottom")
    elif m == "optical": optical()
    else: print(__doc__)
