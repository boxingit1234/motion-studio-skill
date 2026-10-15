# Render pipeline

## Contents
1. The contract
2. Film folder layout
3. `render.mjs` modes
4. Encoding, chunks and ffmpeg gotchas
5. Determinism and verification
6. Reviewing: sheets, the final file
7. Performance numbers

## 1. The contract
`comp.html` must export these, and nothing else drives the picture:
```js
window.DUR = 15;  window.FPS = 30;  window.BPM = 120;   // the film declares its own length and grid
window.renderAt = async (t, q = 1) => { …; return { b: t / B, shot: "hook" }; }   // q = quality multiplier (3D sample count)
window.ready = true;                                       // after fonts, images and sets are loaded
window.auditAt = (t) => ({ texts: [{ id, box:[x0,y0,x1,y1] }], products: [[x0,y0,x1,y1]], safe: [x0,y0,x1,y1] })   // optional, for `render.mjs audit`
```
- **Every style is set from `t`** inside `renderAt`: opacity, transform, text and canvas drawing. CSS stylesheets only hold static layout.
- **No `transition`, no `animation`, no `setTimeout` state.** A cached value from the previous call (e.g. "last caption shown") is a bug that only shows up when frames render out of order. Compute it from the beat.
- **Easing.** Use a small set of easing functions (`out3`, `io`, `sine`, `expo`, a critically damped `spring`). Never randomness at runtime; use seeded `mulberry32` once at build time.
- **Images.** Set `img.decoding = "sync"` and await `img.decode()` before `ready`. First-appearance frames otherwise paint empty.
- **Timeline.** Keep one event table (`E` or `EVENTS`) in beats, exported to `events.json` for the sound script. The picture and the sound read the same numbers, so they can't drift.

## 2. Film folder layout
```
films/<name>/
  comp.html          the picture (2D) or overlays + the 3D canvas (3D)
  film.js world.js pt.js   (3D only) shots + cameras, sets + materials, the path tracer
  lib/browser.mjs    static server (+ /node_modules from the studio) and a GPU Chromium page
  render.mjs         frame / sheet / beats / audit / verify / frames / encode / chunks / concat
  audio.py cine.py foley.py check.py   sound
  make.mjs           audio / frames / encode / finish / all
  CLAIMS.md          every on-screen claim → its source
  assets/            client files (logos, photos, fonts): never ship them to anyone else
  out/               renders, sheets, mixes (disposable)
  package.json       { "type": "module" } so Node can import the film's .js modules for checks
```

## 3. `render.mjs` modes
| Command | Output | Use |
|---|---|---|
| `node render.mjs frame 4.7 [q]` | `out/frame-4.70.png` | look at one frame at full res |
| `node render.mjs sheet 0.5,3,6 [q] [name]` | `out/<name>.jpg` | contact sheet at given seconds (env `COLS`, `TW`) |
| `node render.mjs beats 0.5,2,4.25 [q] [name]` | same | same, in beats (what you'll use most) |
| `node render.mjs audit [stepBeats]` | console | overlap / safe-area check over the whole film (needs `auditAt`) |
| `node render.mjs verify [times] [q]` | console | determinism: frames in and out of order must match |
| `node render.mjs frames [q] [from] [to]` | `out/frames/f_NNNN.png` | full render as PNGs (resumable; fine for short 2D films) |
| `node render.mjs encode` | `out/video.mp4` | PNG frames → H.264 CRF 14 BT.709 |
| `node render.mjs chunks [k0] [k1]` | `out/chunks/c_NNN.mp4` | gentle, resumable long render in 1-s chunks (env `NICE_MS`, `DUTY`) |
| `node render.mjs concat` | `out/video.mp4` | chunks → one file (stream copy) |

Use `q < 1` for sheets: 3D samples scale with `q`, and 2D ignores it.

## 4. Encoding, chunks and ffmpeg gotchas
- **Chromium screenshot PNGs switch between RGB and RGBA mid-stream.** Piping them into ONE ffmpeg graph either rebuilds the graph (a block of frames silently vanishes) or, with `-reinit_filter 0`, mis-strides RGBA into rgb24 (stretched, striped frames). Pick one of:
  - two ffmpeg processes (PNG → raw rgb24, then raw → x264);
  - decoding PNGs yourself (`pngjs`) and piping raw rgb24 (what `chunks` does);
  - writing PNG files and encoding from `f_%04d.png` (what `frames` + `encode` do).
- **Always tag BT.709** (`-colorspace bt709 -color_primaries bt709 -color_trc bt709`, and `scale=out_color_matrix=bt709:out_range=tv` when converting from RGB). Untagged files shift colour on phones.
- **Audio mux.** Pad the audio to the video length (`apad=whole_dur=<video duration>`) and cut with `-t`. Never use `-shortest`: it ate two frames once.
- **Chunks.** Each chunk is 30 frames, `-x264-params keyint=30:min-keyint=30`, same CRF, so `concat -c copy` joins them without re-encoding. A chunk file appears only when it is complete (`.tmp` then rename), so a crash costs at most one second of work.
- **Check every output.**
  - `ffprobe -count_frames` → `nb_read_frames` equals `DUR × FPS`.
  - `format=duration` equals `DUR`.
  - A corruption scan (horizontal `[-1 2 -1]` edge energy per frame; flag > 3× the median) catches mis-strided frames.

## 5. Determinism and verification
- `render.mjs verify` must report identical frames. With 3D, a single pixel differing by 1/255 is GPU rounding and is fine. A visible block means a state leak.
- **Typical leaks:**
  - a font weight loaded late;
  - an image decoded late;
  - a variable cached between calls;
  - a canvas not cleared;
  - a DOM element whose `display` was toggled but whose layout relied on flex.
- **Camera match cuts** can be verified without any rendering. Import the film's shot table in Node and project the same 3D point on both sides of the cut (`templates/film-3d/camcheck.mjs`). It must land on the same pixel.

## 6. Reviewing
- **Contact sheets are your eyes.** Sheet the whole film at one frame per beat (or half beat) before each final render. Sheet densely (every 0.05–0.1 s) around transitions.
- **Look for:**
  - text over product or text over text;
  - clipped letters (diacritics, descenders);
  - a caption lingering into the next scene;
  - a frame where nothing is on screen;
  - hard pops;
  - unreadable contrast.
- **After the final render,** extract frames from the *encoded* mp4 (`ffmpeg -vf "select=not(mod(n\,15))"`) and review those. The encoded file is what the client sees.

## 7. Performance numbers (GTX 1650, 1080×1920)
| Content | Time per frame |
|---|---|
| 2D DOM/canvas comp | 0.2–0.6 s (a 30 s reel renders in 3–6 min) |
| 3D studio set, 28 samples | ≈ 2 s |
| 3D exterior, 28 samples | ≈ 6 s |
| 3D interior with sun through windows, 28 samples | ≈ 13–15 s |
| A full 30 s 3D film | ≈ 1.5–2 h |

Lower-end GPUs scale roughly with their FP32 throughput.
