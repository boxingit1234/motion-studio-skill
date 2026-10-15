# 3D product films with the GPU path tracer

Use it when the brief asks for the look of a modern product placement film: the product in a sunlit living room, at a house at dusk, in a dark studio, with real soft shadows, reflections, depth of field and motion blur. It costs hours of GPU time, so agree on it with the person first (see Render etiquette in SKILL.md). Everything lives in `templates/film-3d/`.

## Contents
1. Files and how they fit
2. The tracer (`pt.js`): what it does
3. Building sets and the product (`world.js`)
4. Shots, cameras, transitions (`film.js`)
5. Overlays (`comp.html`)
6. Look development and checks
7. Costs and quality knobs
8. Pitfalls that already cost a re-render

## 1. Files
| File | Role |
|---|---|
| `pt.js` | `PathTracer` (WebGL2 shaders on three-mesh-bvh), `Materials`, `buildSet(parts)` → one BVH per set |
| `world.js` | the material table, helpers, the example product `product(at, {stack, offsets})`, sets `livingSet()`, `houseSet()`, `studioSet()`, lights per set, decal textures |
| `film.js` | BPM/beat grid, camera tracks (Hermite through keys), the dive (`diveCam`), stack choreography (`stackState`), `SHOTS`, `MIXES` (dissolves), `FADE`, `class Film { renderAt, project }` |
| `comp.html` | the canvas + DOM overlays: captions, counters, dimension lines, energy lines, annotation, end card; `window.renderAt` |
| `look.html` + `look.mjs` + `looks.json` | render single look-dev frames of any set with any camera / env (`node look.mjs looks.json name,name`) |
| `bench.html` + `bench.mjs` | GPU speed test (ms per sample at 1080×1920): run it before promising a delivery time |
| `camcheck.mjs` | match-cut checker (pure camera math, no GPU) |

## 2. The tracer
- **One BVH per set.** Every part is merged into one BVH with per-vertex material id, normal and uv.
- **Material fields:**
  - albedo, roughness, metalness;
  - emission × an animatable group gain (`emitGain[group]`);
  - flags: `GLASS` (thin, transmissive), `PROXY` (a visible lamp body that never shadows; its light comes from an analytic light at the same place), `DECAL` (uv-mapped print + 3 LED emission channels).
- **Procedural patterns** (`pattern` id):
  - 1 wood planks, 2 plaster, 3 fabric, 4 PV cells, 5 grass/gravel;
  - 6 concrete, 7 rug, 8 brushed metal, 9 leaves, 10 abstract painting, 11 vertical boards.
- **Lights** (next-event estimation, one picked per bounce by power):
  - `sun`: a cone of irradiance `sunE`;
  - `rect`: an emitter;
  - `portal`: a window rect that brings the sky in for points inside `inMin/inMax`;
  - `sphere`.
  - The sky is procedural (horizon/zenith/ground + glow towards the sun). `portal: true` + `inMin/inMax` make interiors converge 5–10× faster.
- **Camera:** thin lens (`aperture`, `focus`), with the shutter interpolating the camera per sample. This gives real motion blur and no smearing of overlays.
- **Resolve:**
  1. à-trous denoiser on albedo-demodulated light, guided by albedo / normal / depth;
  2. variance smoothed over 3×3 plus a 4 % luminance floor (without it, undersampled pixels stay as black specks);
  3. bloom, AgX tone mapping, sRGB, grade (exposure, contrast, saturation, lift/gain, vignette), subtle per-frame grain.
- **Deterministic:** a pixel's random sequence depends only on (pixel, sample index).

## 3. Sets and the product
- **Units are metres.** Model the product from its **published dimensions** (the spec page) and its own photos (front, 3/4, side). Seams are taken out of each module, so the stack heights stay exact.
- **Track fidelity in `MODEL.md`:** what is exact, what is measured from images, what is approximated, and what is never shown (backs, ports).
- **Rounded, extruded shells** (`shellGeo`) give sharp-but-soft product edges.
  - The extrude bevel grows the shape outward, so it is inset by the bevel. Otherwise the product ends up wider than its spec.
  - Use `toCreasedNormals` for smooth curves with crisp flat faces.
- **Decals** (logo, LED pill, labels) are a canvas texture on a thin quad 0.7 mm in front of the face.
  - Sample them with an **explicit LOD** (`textureLod` from the ray footprint). Implicit derivatives inside the path loop pick a blurry mip and darken the whole quad.
  - Use a manufacturer's mark only as it appears on the product. Never invent product markings.
- **Sets ship with:**
  - a sunset/night living room (oak floor, west glazing with mullions, sofa, arc lamp, plants, a slatted feature wall);
  - a modern house at dusk (gable roof with PV, glazing with a warm interior, entrance niche, sconce, trees made of many small displaced clumps — big blobs look like cartoon broccoli);
  - a dark studio cyclorama (glossy floor, matte coved wall, a top softbox, a front key, a rim and a brand-tinted rim).
- **Keep interiors light:** trees seen through a window need ~100 clumps, not 400. They cost BVH depth on every ray.

## 4. Shots, cameras, transitions
- **Camera tracks.** `KEYS[shot] = [{ b, pos, tgt, fov, ap, focus }]`, interpolated by Hermite with Catmull-Rom tangents in beat time and still at the ends.
  - Keep the product top below the caption zone during pushes. Check it with the projection: `film.project(point)`.
- **The dive** (`diveCam`).
  - One continuous move in log-distance from the room camera to a fixed camera relative to a detail (the LED pill).
  - At the cut the same relative camera is used in the studio, so the detail lands on the same pixel.
  - Settle the camera first (a still key a beat before), then accelerate into the cut.
- **Studio → location match cut.** The location's first key equals the studio's last camera relative to the product (`pos = productAt + studioPos`), then the camera pulls back to reveal the location.
- **Dissolves** (`MIXES`) render both shots and mix them. Fades (`FADE`) go to the brand colour for the end card.
- **`stackState(b)`:** modules docking. The top module lifts out of the way, the new module slides in at its own height, the top module docks. Offsets are pure functions of the beat. The studio BVH is rebuilt only when the offsets change (~60 ms).

## 5. Overlays
- **Captions** are DOM.
  - Letters rise on a critically damped spring, and headlines are fitted by ink width.
  - Scrims are static per shot and only mix across dissolves.
- **Counters** swap digit by digit.
- **The 2D canvas `fx` holds:**
  - docking glints along the new seam;
  - dimension lines drawn from projected corners, with labels from `PRODUCT` in mm;
  - energy lines (projected 3D polylines, glow + travelling pulses);
  - the hand-drawn annotation (a circle around a detail, then a leader, then a label).

## 6. Look development and checks
1. Run `node bench.mjs 16` once per machine: ms/sample at full res tells you the render time.
2. Run `node look.mjs looks.json` for single frames per set/camera/env (≈ 2–30 s each). Tune materials, lights and exposure there before animating.
3. Run `node render.mjs beats … 0.15 sheet` for whole-film sheets at ~4–5 samples (noisy but readable). Do this before every full render.
4. Run `node camcheck.mjs` to confirm match cuts land on the same pixel.
5. Run `node render.mjs verify` to confirm determinism.
6. Render a few full-quality frames (`render.mjs frame t 1`) of the hardest shots (interiors) to check noise and fireflies.

## 7. Costs and quality knobs (GTX 1650)
| Knob | Effect |
|---|---|
| `spp` per shot (28 ≈ final, ~5 for sheets via `q`) | linear in time |
| `bounces` (3 outdoors, 4 indoors) | interiors need 4 |
| `portal` windows | 5–10× less noise indoors |
| `clampInd` | kills indirect fireflies (slightly darker caustics) |
| `NICE_MS` / `DUTY` | gentle mode for a usable desktop (~1.5× slower) |
| Interior frame (28 spp) | ≈ 13–15 s |
| Exterior frame | ≈ 6 s |
| Studio frame | ≈ 2 s |
| Full 30 s film | ≈ 1.5–2 h at full speed |

## 8. Pitfalls that already cost a re-render
- **`isnan()` / `isinf()` are optimised away by the D3D shader compiler** (ANGLE on Windows). Detect NaN/Inf with `floatBitsToUint(x) & 0x7f800000u == 0x7f800000u`.
- **Black specks around small bright lights** come from per-pixel variance = 0 when all of a pixel's samples missed. Fix it with the 3×3 variance prefilter + luminance floor (already in `pt.js`).
- **A product that reads beige/orange in a sunset room.** Add an invisible cool fill rect light towards it, so it keeps its real colour.
- **Bright studio product looking grey.** A top softbox alone lights the top, not the front. Add a large front key and make the backdrop rough (a glossy coved wall shows a distracting highlight band).
- **Text over the product during a push-in.** Aim the camera slightly higher so the product's top edge holds below the title zone, and audit it.
- **A caption fading across a match cut.** End it before the cut: the cut should change only the world, never leave text behind.
- **RGB → YUV in your own ffmpeg pipes.** Be explicit with `scale=out_color_matrix=bt709` when you tag the file BT.709. Recent ffmpeg versions (6+) follow the output tag; older ones default to the BT.601 matrix, which shifts hues slightly. Verify by encoding one PNG and comparing the decoded frame with it (mean abs error ≈ 1.5/255 is just chroma subsampling).
