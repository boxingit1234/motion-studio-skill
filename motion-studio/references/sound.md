# Sound: score and sound design from the same timeline

The music and the sound effects are synthesized in Python (numpy/scipy), so there is nothing to license, nothing to download, and every sound lands exactly on the picture event that causes it.

## Files (in every film template)
- `cine.py`: the **serious palette**:
  - `strings`: a Solina-style ensemble;
  - `felt`: a felt-hammer piano, used low and sparse;
  - `pluck`: a muted pulse ostinato;
  - `kick` / `sub`: a heartbeat kick and sub swells;
  - `impact`, `riser`, `whoosh`, `downlift`: filtered noise, never tonal;
  - `tick` / `thock` / `confirm`: dry UI haptics;
  - `shimmer`, `hall_ir` / `room_ir` + `convolve`.
- `foley.py`: physical-ish foley:
  - `seat_thunk` / `module_land`: heavy objects landing;
  - `servo`: an actuator;
  - `scrape`: a pen on paper or metal on metal;
  - `metal_hit`, `clack`, `relay`;
  - ambiences `amb_room` / `amb_night` / `amb_day` / `amb_studio`;
  - filters `lp` / `hp` / `bp` / `sweep_bp`.
- `audio.py`: the arrangement for this film. It is built from `EV` (beats, mirrored from the comp's event table) and has buses `low pad keys pulse perc fx ui amb` with hall/room sends.
- `check.py`: measurements: loudness per section, spectrum shares, the siren/glide scan, the largest HF jump (clicks).

## How a score is put together
1. **Tempo.** Choose BPM so the film is a whole number of beats; the comp uses the same BPM.
2. **Harmony.**
   - Write a chord table `CH = [(beat, bass_midi, voicing, 8-step pulse pattern), …]`.
   - Change chords on scene changes.
   - Warm major/relative-minor progressions suit products (F/Dm, C/Am).
   - Resolve to the tonic on the logo.
3. **Layers.** Add layers per section:
   - pads always;
   - the pulse from the reveal on;
   - kick + sub on beats 1 and 3 in the "groove" sections;
   - rims and tight hats only where energy is wanted.
4. **Light/dark switches.** Drop the rhythm on the dark cut (or low-pass the whole mix for a "power cut") and bring it back in ONE sample on the next big moment.
5. **Picture events become sounds:**
   - every landing → `module_land` / `seat_thunk`;
   - every docking / confirm → `confirm`;
   - every counter change and dimension line → `tick`;
   - every drawn annotation → `scrape`;
   - every camera whip or dive → `whoosh` / `riser` (with a 60–70 ms faded tail at the cut);
   - the logo → `impact` + `sub` + `shimmer` + felt notes.
6. **Snap.** Snap sounding events to the 16th-note grid (0.25 beat) so they sit in the groove. Then align each to the frame that shows it (`ceil(t·fps)/fps`).
7. **Macro dynamics.** Use a `MACRO` envelope over beats: a quiet opening (≈ −24 dB RMS), lifts on the big cuts, the groove and the lockup as the loudest moments (≈ −16 dB RMS).

## Mix targets (what worked)
- **Spectrum shares** (`check.py`):
  - sub < 60 Hz ≈ 8–12 %;
  - bass 60–250 ≈ 30 %;
  - low-mid ≈ 40 %;
  - mid 1–4 kHz ≥ 12 %;
  - air ≥ 1 %.
  - Too much sub sounds muddy on phones; phones speak in the mids.
- **Master chain:** HP 40 Hz (4th order) → reduce < 95 Hz by half → + presence (1.1–5 kHz) and a little air → gentle tanh saturation → peak at −2 dBFS.
- **Ducking:** a kick-driven duck (~ −2 dB) on pads/keys/pulse.
- **Siren test must report zero glides.** No continuous tonal sweep ≥ 0.18 s anywhere. A person once described a gliding "spark" voice as "a doomsday siren".
- **Taste.** Serious products get the serious palette. Marimbas, bells and bubbly pops were called "minecraftish, kindergarten" for a tech product.

## Finish
`node make.mjs finish`:
1. Measure with `loudnorm` (`print_format=json`).
2. Apply a second-pass linear `loudnorm` to **−14 LUFS integrated, −1.5 dBTP**.
3. `aresample=48000`, then `apad=whole_dur=<video duration>`; AAC 256 k.
4. Copy the video stream.
5. Write a `-share` copy (CRF 21).
6. Re-measure the encoded file (AAC can raise true peak by ~0.5 dB).

## Voice-over (only if asked)
TTS services need a commercial-use plan. A free ElevenLabs tier has no commercial licence. Never print or store an API key in chat or in the repo; keep it in an `.env` the person controls. Place each line in its beat window, duck the music under the voice (mids more than lows), and transcribe the result locally (e.g. faster-whisper) to verify it.

## Score-first films (the music drives the picture)
When the soundtrack is synthesized from a score (instead of placing sounds on picture events), write the score first and export every hit to `score.json`: each pluck (string, time, velocity), clap, drum hit, stamp. The picture reads it, so strings vibrate exactly on their plucks, stamps land on the claps and the film is in sync by construction. Keep the score deterministic (one seeded RNG) so a re-mix never moves an event.
- **Plucked strings (guitar, harp, oud): Karplus–Strong with `scipy.signal.lfilter`.** Delay line `N = floor(P − ½)`, the fractional rest through a first-order allpass, an averaging loss filter with a per-period gain from the target T60, and a noise burst lowpassed for brightness and combed for pick position. Written as one rational transfer function, it runs at C speed. Tuning lands within ±10 cents; nylon T60 ≈ 2 s. Then a "body": three or four peaking EQs (≈ 100 / 200 / 420 Hz, 2.6 kHz) and a 6.5 kHz lowpass.
- **Strums.** A strum is the chord's strings 3–8 ms apart (down = low→high, up = high→low, ups lighter and on the top strings). A *golpe* / chuck is the same strum damped after ~50 ms plus a band-passed tap. A rasgueado is 3–4 strokes ~30 ms apart and an accent stroke. Two players: the same part with an 8–12 ms offset, panned ±0.35.
- **Hand claps.** 2–3 band-passed noise bursts ~6 ms apart. Open claps 1–3.8 kHz with a 10 ms decay; muted claps 250–1100 Hz.

## True-peak limiting for percussive mixes
Mixes full of claps and transients often measure ~−18 LUFS at −1 dBTP: lifting them to −14 LUFS would put peaks above 0. Shave the peaks first with a look-ahead limiter on a 4× oversampled envelope, held ~15 ms and smoothed ~6 ms (no clicks, little pumping). Two passes of ~3 dB each, then peak-normalise to −1.5 dBFS; `make.mjs finish` then lands at −14 LUFS and ≤ −1.5 dBTP after AAC.
