---
name: motion-studio
description: >
  Creates finished videos in code: promo reels, product and launch films, animated ads, kinetic-typography pieces,
  explainers, showreels, animated logo stings and end cards, and photoreal 3D product scenes (a product placed in
  a living room, on a house at dusk, in a studio). Delivers a ready-to-post mp4 for Instagram/Facebook Reels,
  TikTok, Shorts, Meta ads, LinkedIn or a website (9:16, 16:9, 1:1, 4:5) with original music and sound design. Use
  it whenever someone wants a new video, reel, clip, ad or motion graphics made for a brand, product, app, site or
  event, especially from a URL, product page, datasheet, PDF, deck or logo files, even if they never mention code,
  animation tools or rendering. Also for Romanian requests (reel, clip, videoclip de prezentare, animație). Not
  for editing, captioning or re-encoding existing footage (Premiere, DaVinci, CapCut), slide decks, website UI or
  CSS animation, interactive 3D web apps, hand-drawn storybook animation, or designing logos.
---

# Motion Studio

Make short films (typically 9:16 1080×1920 reels, also 16:9 / 1:1 / 4:5) entirely in code.
- **Picture.** An HTML page (`comp.html`) whose `window.renderAt(t)` draws the exact frame for time `t`.
- **Capture.** Headless Chromium captures every frame; ffmpeg encodes them.
- **Sound.** Synthesized in Python from the same timeline: music, sound effects and ambience, mastered to −14 LUFS.
- **3D (optional).** Shots come from a small GPU path tracer (`pt.js`), with soft light, real reflections, depth of field and motion blur.

Everything a viewer sees is a pure function of `t`. That is what makes renders repeatable, seekable and resumable.

If the request is to edit, caption, compress or color-fix a video that already exists, or to build slides or a website animation, say this skill is not the right tool and help directly instead.

## What's in this skill

| Path | What it is | Read it when |
|---|---|---|
| `references/setup.md` | One-time install of the studio (Node, ffmpeg, Playwright, Python venv, GPU check) | First use on a machine |
| `references/render-pipeline.md` | The render contract, `render.mjs` modes, chunked renders, ffmpeg gotchas, determinism, contact sheets | Building or rendering any film |
| `references/design-rules.md` | Storytelling, layout, typography, motion and transition rules learned from real client feedback; audits | Before storyboarding and before every review |
| `references/sound.md` | Event-driven score + sound design, mix targets, measurements, loudness finish | When doing audio |
| `references/path-tracer-3d.md` | The 3D path tracer: sets, materials, lights, product modelling at exact dimensions, cameras, match cuts, costs | Only when the film needs 3D scenes |
| `references/claims-and-sources.md` | Getting facts right: official sources, `CLAIMS.md`, what never to claim, capturing websites safely | Any film with product facts, prices, specs or a client brand |
| `templates/film/` | A complete, working 2D reel (15 s, kinetic type, product card, counter, chart, CTA) + render, sound and finish scripts | Start every 2D film from here |
| `templates/film-3d/` | The path tracer + example sets (studio, room, house) + a working 3D film and look-dev tools | Start a 3D film from here |
| `scripts/setup_studio.ps1` / `.sh` | Creates a studio folder and installs everything (asks before downloading) | First use |
| `scripts/new_film.mjs` | Copies a template into `<studio>/films/<name>` | Every new film |

## The workflow

Follow these steps in order. Each one exists because skipping it once cost a client revision.

1. **Brief.**
   - Get the duration, format(s), fps (30 default; 25 for PAL editors), language, CTA and where the film will be posted.
   - Ask for brand files (logo SVG/PNG, fonts, colours, existing posts). Without them, read the brand from their site.
   - If the person says "go all out", still confirm anything that changes the product or the claims. Pacing and style are yours to decide.
2. **Research and facts** (`references/claims-and-sources.md`).
   - Collect every number and claim from official sources into `CLAIMS.md` before writing any copy.
   - When two sources conflict, leave the number out and say so. A wrong spec in an ad is worse than no spec.
3. **Storyboard on a beat grid.**
   - Pick a BPM so the duration is a whole number of beats (e.g. 30 s = 48 beats at 96 BPM; 15 s = 30 beats at 120 BPM).
   - Put every scene change, caption and sound event on that grid (`bar(n, beat)` / `bt(b)`).
   - Write the storyboard as a short table (beat → picture → text → sound) and share it before building if the person is reachable.
4. **Scaffold.** Run `node <skill>/scripts/new_film.mjs <studio> <name> [film|film-3d]`, then edit `comp.html` (2D) or `film.js` + `world.js` + `comp.html` (3D).
5. **Build in small loops.** Render contact sheets at low quality (`node render.mjs beats 0.5,4,8,… 0.25 sheet`) and look at them. Fix, re-sheet. Never judge motion from one frame. Sheet every beat (or half beat) across the whole film before any final render.
6. **Audit** (`node render.mjs audit 0.25`). Text must never overlap the product or other text, and must stay inside the platform safe area. Fix every hit; don't argue with the audit.
7. **Sound.** Run `python audio.py out/mix.wav out/stems`, then `python check.py`: loudness per section, spectrum, siren/glide test, clicks.
8. **Final render. Ask first** (see "Render etiquette").
   - 2D films take minutes: `node make.mjs frames` + `encode`.
   - 3D films take hours: `node render.mjs chunks` + `concat`.
9. **Finish.** `node make.mjs finish` loudness-normalises (−14 LUFS, −1.5 dBTP), muxes onto the picture (the picture is the master clock, never `-shortest`), and writes a light `-share` copy. Check frame count, duration and loudness in the output.
10. **Review the final file, not the comp.** Extract frames from the encoded mp4 (every 0.5 s) into a sheet and look at every one. Then deliver with a short note (Romanian/English as the client speaks): what's in it, where facts come from, what the client must confirm.

## Render etiquette (the person's computer is theirs)

A 3D render keeps the GPU at 100% for an hour or more and makes the machine laggy. Writing hundreds of frame images also makes Windows Defender rescan every file. Someone once had to shout "stop, you're frying my PC". So:

- **Before any job that loads the machine for more than a few minutes, say what it is, how long it takes and how it will feel, then wait for a yes.** Offer:
  - **gentle mode** (`NICE_MS=25 DUTY=.35`): pauses between GPU passes, so the desktop stays usable;
  - **full speed;**
  - **later / overnight.**
- **Prefer `render.mjs chunks`** (1-second mp4 chunks, resumable) over writing every frame as PNG.
- **Launch long renders as detached processes,** so a closed chat doesn't kill them halfway (Windows: `Start-Process node -ArgumentList 'render.mjs','chunks' -WindowStyle Hidden`).
- **When told to stop, stop at once.** Kill the process tree (Windows: `taskkill /T /F /PID …`), confirm with a process list that nothing is left, and say what still uses the machine (e.g. Defender scanning written files) without blaming it on them.
- **Short sheets and single test frames don't need permission.** They take seconds.

## Non-negotiables (each one cost a revision once)

- **`renderAt(t)` is pure.**
  - No state carried between frames, no `Math.random()` (use seeded mulberry32), no CSS transitions or animations, no timers.
  - `node render.mjs verify` renders frames in and out of order; they must match.
- **Load every font weight before frame 0** (`document.fonts.load` for each face used). A face first used mid-film paints invisible for a frame.
- **Never let two text blocks overlap, or text cover the product.**
  - An outgoing title disappears before the next one takes its place.
  - Counters swap sequentially (old out, then new in); two numbers on top of each other look broken.
- **Captions stay on screen ≥ 1.5 s, ≤ 7 words each, one idea per beat.** Make frame 0 a readable thumbnail.
- **Never invent a number, customer, review or result.** Show prices only with a dated proof on screen, and only with the client's OK.
- **Sound is serious unless asked otherwise.** No toy marimbas or bells for a tech product, and no continuous tonal glides: one reel's spark sound was called "a doomsday siren".
- **Use real UI and real assets** (Playwright crops of the client's own site at high DPR). Never redraw a client's UI or logo by hand. Never click buy, submit or send on a real site.
