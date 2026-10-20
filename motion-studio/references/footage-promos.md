# Footage promos (event / club / artist reels cut from supplied clips)

The client sends real footage (a DJ set, a past party, an artist's clips), a song and the event's poster. You deliver a 15–30 s
reel cut on the music with graphics on top. Template: `templates/footage/` (`node <skill>/scripts/new_film.mjs <studio> <name> footage`).

Pipeline: `tools/edit_render.py` renders the footage (`edit.json` → `out/<edit>/base.mp4`), `comp.html` + `gfx.js` draw a transparent
graphics layer that `overlay.mjs` composites on top, `audio.py` builds the music (song segments, DJ transitions, sfx), `make.mjs finish`
sets −14 LUFS. Several promos live side by side as `edits/<name>.json` → `out/<name>/` (`EDIT=edits/b.json node make.mjs all`).

## What clients asked for (and what they rejected)

- **Real people having fun, cut to the music.** Animated posters and narrated "story" captions were called cringe. Few words, big.
- **Study the reference they send** (cut lengths, where text sits, what stays on screen) before building: count its cuts per beat
  (an ffmpeg frame-difference scan finds them), and copy the structure, not the pixels.
- **Make the artist recognisable.** "You can't really see it's him": pick shots where the face is visible, frame on the face
  (`"focus": "face"`), and use the poster's own cut-out photo when the footage is weak.
- **The persistent info must be readable on a phone:** the date and the venue logo at 650–820 px wide in a 1080 frame, not 360.
- **Everything centred optically** (see below) — "things are not centred" was a rejection reason.
- **"Go all out" means motion design on top of the cut**, not more text: footage inside the type, text behind the person, grids that
  build on the beat, splits, tickers, a speed ramp, one strong lockup.
- **Each artist's promo shows only that artist**; a both-artists promo hands over between their songs like a DJ would.
- **Never use**: screen recordings, clips showing another artist's name or last year's concept, or text the client struck out (keep
  a written list and mark those clips `"banned": true` in `sources.json` — the renderer refuses them).

## Workflow

1. **Inventory.** `python tools/srcsheet.py A1,A2,… 1.0 out/src.jpg` (a frame a second per clip). Note the good seconds, flashes,
   logos on T-shirts, other artists' names on screens, the second a clip turns into something else (`"max"`).
2. **Faces.** `python tools/faces.py scan` (OpenCV Haar cascades, `pip install opencv-python-headless`) writes `faces.json`;
   `"focus": "face"` then centres each crop so the face sits ~38 % from the top. Check a few detections on a sheet: hands and lights can
   fool it.
3. **Music.** `python tools/beatgrid.py song music/song.mp3 [from to]` → real BPM, kick phase, drops. Then `start = drop − B·60/bpm`
   puts the drop on promo beat B.
   - Beat trackers were off by ~1 BPM and 0.25 s on club edits: always use the measured fold.
   - Songs with off-beat bass (balkan, reggaeton): pass a window inside a drop, or the phase can lock half a beat off.
   - Two songs: stretch the second one onto the first's tempo (`"tempo"`, ffmpeg atempo keeps the pitch; ±2 % is inaudible).
4. **Shot list on the grid** (`edit.json`): the hook (beats 0–2), the drop with the artist's name slamming, a cut per beat (or half beat in
   builds), a grid, a split or strip, a ramp, then the lockup for the last 4–6 s.
5. **Look at sheets** (`python tools/edit_render.py sheet`, `SEC=1 node overlay.mjs sheet 0.5,1.2,…`) before rendering.
6. **Render**: `node make.mjs all` (or `part`s in parallel — at most 2 at once; each holds two 1080p frame buffers per stream).
   Re-render single shots with `python tools/edit_render.py splice 3,9` instead of everything.
7. **Verify the delivery file**: `python tools/beatgrid.py check out/<edit>/mix.wav` (median within ±10 ms), frame count, decode,
   **an audio stream with signal** (`volumedetect`), no black / frozen runs, a frame every 0.5 s as a sheet.
   App previews often play muted: if someone says "no audio", decode the track before re-exporting.

## The DJ transition between two songs (both-artists promos)
- Put both on one tempo (stretch the first or second song) so the cuts never drift.
- End the first song at the end of an 8-bar phrase. Over its last 4 beats: a rising high-pass (30 → 650 Hz) and, on the last beat, a
  3/4-beat echo that thins out (`"out_beats": 4, "echo": true`).
- Underneath, the second song's pre-drop bar rises (`"in_beats": 4`), and its drop lands on the downbeat right after.
- Avoid dropping the second song into its breakdown: energy falls off a cliff. Check the keys: a semitone apart clashes when they
  overlap; the pre-drop bar of the second song should be short and mostly drums.
- The picture does the same: a diagonal split whose seam sweeps from artist A to artist B over those 4 beats, an "&" badge on the seam.

## Graphics techniques (gfx.js)

| Technique | Function | Notes |
|---|---|---|
| Footage inside the type, then a dive into it | `typeMatte` | Letters land on 16ths; an exponential zoom (to 400×) into an ink stroke opens to full frame exactly on the drop. Make sure the zoom is complete before the cut. |
| The name slams on the drop | `slam` | From 1.34× with blur and a fading white glow, 0.14 s. |
| Text behind a person | `behind` | A giant word/logo wipes open, the poster cut-out (`logo_prep.py sticker`, white outline) rises in front with a little overshoot. Edges the frame cuts get no outline. |
| Tickers | `ticker` | Two tilted bands crossing, black on white / white on black. Use ASCII separators: many display fonts lack ✦. |
| Persistent marks | `el` + `scrim` | Venue on top, date low; hide them under full-screen graphics. Keep them away from faces. |
| Grids that build | shot `"cells"` with `"on"` | 2×2 or 3×3, a cell per 8th/16th with a 2-frame flash; `grid_zoom` pushes into one cell at the end. |
| Splits | shot `"cells"` + `"split"` | A straight seam at an angle, its position keyed on beats. |
| Lockup | `el` sequence | Venue logo, artist(s), date, address/RSVP, all on optical centres, over a blurred, darkened backdrop. |

**Optical centring.** `tools/logo_prep.py optical` writes each logo's ink centre of mass; `draw()` places logos on it (half-weighted)
and text on its measured ink box. A wordmark with a heavy left side looked 30 px off when its box was centred. Also centre GROUPS
(e.g. `ARTIST & ARTIST`): compute the group's left/right ink edges, not each element's position.

**Logos from a PSD/PNG poster** are usually small: `logo_prep.py crisp` re-thresholds the alpha at 4× for clean edges at any size.
Read the PSD's layers with a PSD reader (or ask for the separate files); never redraw a client's logo.

## Gotchas
- Sources at 25/50/60 fps are streamed at 2× the output fps so ramps and slow motion pick exact frames; "120 fps" phone clips are
  often 30 fps VFR — check with ffprobe before planning slow motion.
- Landscape phone clips in a vertical promo: crop tight on the subject (zoom ≥ 1.2, `"focus": "face"`); at very tight crops a 1066 px
  wide source gets soft — say so and ask for better footage.
- A giant white logo over a bright (gold/white) shot disappears: slam it over a darker shot, or add a scrim.
- `"blur"` + `"gain": .5` turns any clip into a backdrop for type or cut-outs.
- Keep one `edits/<name>.json` per promo and keep the previous versions (`*_v1.json`) when revising.
