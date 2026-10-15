"""audio.py — the score + sound design of this film, placed from the comp's own event table.

    node render.mjs events            # writes events.json from window.EVENTS (beats)
    python audio.py out/mix.wav [out/stems]

Everything is synthesized (cine.py = serious music palette, foley.py = physical sounds): nothing to license or download.
Adapt the four sections below to your film: harmony table, sections (what plays when), picture events → sounds, mix.
Rules that came from real reviews: no continuous tonal glides (a "siren"), no toy sounds (marimba/bells) for serious products,
every sound that marks a picture event lands ON that event (snap to 1/16 beat and to the frame), −14 LUFS is applied by make.mjs finish.
"""
import json, os, sys
import numpy as np
import soundfile as sf
import foley as F
import cine as C

HERE = os.path.dirname(os.path.abspath(__file__))
EV = json.load(open(os.path.join(HERE, "events.json"), encoding="utf-8"))
SR = F.SR
BPM = EV.get("BPM", 120); B = 60 / BPM
DUR = EV.get("DUR", EV.get("BEATS", 30) * B); N = int(round(SR * DUR)); BEATS = DUR / B
FPS = EV.get("FPS", 30)
bt = lambda b: b * B
frame = lambda t: np.ceil(t * FPS - 1e-6) / FPS          # a sound marking a picture event starts on the frame that shows it

BUS = ("low", "pad", "keys", "pulse", "perc", "fx", "ui", "amb")
BUSGAIN = {"low": .06, "pad": 2.6, "keys": .9, "pulse": 2.4, "perc": .38, "fx": .42, "ui": 1.3, "amb": 1.0}     # balance: tune with MIXDEBUG=1
bus = {k: np.zeros((2, N)) for k in BUS}
send = {"hall": np.zeros((2, N)), "room": np.zeros((2, N))}
kicks = []


def tail(x, ms=70):
    """softer end for noise swells that land on a cut (a 20 ms stop reads as a click)."""
    x = np.array(x, np.float64); n = min(int(ms / 1000 * SR), x.shape[-1]); x[..., -n:] *= (.5 + .5 * np.cos(np.pi * np.arange(n) / n)); return x


def place(name, x, t, gain=1.0, pan=0.0, hall=0.0, room=0.0):
    i = int(round(t * SR)); x = np.asarray(x, np.float64)
    if x.ndim == 1: x = C.stereo(x, pan)
    if i < 0: x = x[:, -i:]; i = 0
    m = min(x.shape[1], N - i)
    if m <= 0: return
    seg = x[:, :m] * gain * BUSGAIN[name]
    bus[name][:, i:i + m] += seg
    if hall: send["hall"][:, i:i + m] += seg * hall
    if room: send["room"][:, i:i + m] += seg * room


# ═════════ 1 · harmony: (beat, bass root midi, string voicing, 8-step pulse pattern) — change chords on scene changes ═════════
def P8(r, a, b): return [r, r + 7, r + 12, r + 7, r, r + 7, a, b]
CH = [
    (0, 41, [53, 57, 60, 64, 67], P8(41, 55, 48)),       # Fmaj9  — the hook
    (6, 34, [46, 53, 57, 62, 65], P8(34, 50, 41)),       # Bbmaj7 — the product
    (14, 38, [50, 57, 60, 62, 65], P8(38, 53, 45)),      # Dm9    — the proof (light switch)
    (20, 36, [48, 55, 60, 62, 67], P8(36, 52, 43)),      # Cadd9
    (24, 41, [41, 53, 60, 65, 69, 72], P8(41, 55, 48)),  # F      — home: the logo
]
def chord_at(b):
    c = CH[0]
    for x in CH:
        if b >= x[0] - 1e-6: c = x
    return c
def next_change(b, limit): return min([x[0] for x in CH if x[0] > b + 1e-6] + [limit])


def pad_chords(b0, b1, bright=.5, gain=1.0, a=.9, hall=.45):
    b = b0
    while b < b1 - 1e-6:
        nb = next_change(b, b1); v = chord_at(b)[2]; dur = bt(nb - b) + .35
        for k, m in enumerate(v):
            y = C.strings(m, dur, vel=.62 * (1 - .05 * k), bright=bright, a=a, r=1.2)
            place("pad", C.stereo(y, -.35 + .7 * k / max(1, len(v) - 1)), bt(b), gain / np.sqrt(len(v) / 3), 0, hall)
        b = nb


def pulse_run(b0, b1, level=1.0, bright=.5, origin=0.0):
    b = b0
    while b < b1 - 1e-6:
        pat = chord_at(b)[3]; k = int(round((b - origin) / .5)) % 8; acc = 1.0 if k % 4 == 0 else (.82 if k % 2 == 0 else .68)
        br = bright(b) if callable(bright) else bright
        place("pulse", C.pluck(pat[k] + 12, .36, .62 * acc * level, 1600 + 2600 * br, 360 + 200 * br), bt(b), 1.0, -.15 + .3 * (k % 2), 0, .12)   # an octave up: phones play mids
        b += .5


def heart(b0, b1, origin, level=1.0, rim_on=True, hats=True, only_pos=(0, 2)):
    b = b0
    while b < b1 - 1e-6:
        pos = (b - origin) % 4
        if pos in only_pos:
            place("perc", C.kick(.92 * level), bt(b), 1.0, 0, 0, .05); kicks.append(bt(b))
            r = chord_at(b)[1]; place("low", C.sub(r - 12 + (12 if r < 36 else 0), bt(1.7), .5 * level), bt(b), 1.0)
        if rim_on and pos in (1, 3): place("perc", C.rim(.5 * level), bt(b), 1.0, .1, 0, .12)
        if hats:
            on = abs(b - round(b)) < 1e-6
            place("perc", C.tick_hat((.38 if on else .5) * level, open_=(pos == 3.5)), bt(b), 1.0, -.2 if on else .25)
        b += .5


def amb(kind, b0, b1, level=1.0, fade=.6):
    d = bt(b1 - b0); fn = {"day": F.amb_day, "night": F.amb_night, "room": F.amb_room, "studio": F.amb_studio}[kind]
    x = fn(d + .1, 1.0)[:, :int(d * SR)]; n = x.shape[1]; t = np.arange(n) / SR
    x = x * (np.clip(t / fade, 0, 1) * np.clip((d - t) / fade, 0, 1))[None, :]
    place("amb", x, bt(b0), level)


# ═════════ 2 · sections (example film: hook 0–6, product 6–14, proof 14–24, lockup 24–30) ═════════
amb("studio", 0, BEATS, .8, .4)
pad_chords(0, BEATS, .45, .95, 1.0, .55)
place("keys", C.felt(69, .4, 3.2, .1), 0, 1.0, 0, .75)                                   # the hook is readable on frame 0: one note under it
place("keys", C.felt(72, .38, 3.2, -.1), frame(bt(EV["hook2"])), 1.0, 0, .75)
pulse_run(6, 14, .7, lambda b: .2 + .5 * (b - 6) / 8, 6)
heart(10, 14, 10, .6, rim_on=False, hats=False, only_pos=(0,))
place("fx", tail(C.riser(bt(1.5), 300, 7000, .55, 2.3)), bt(EV["card"] - 1.5), 1.0, 0, .3)
place("fx", C.impact(.6), frame(bt(EV["card"])), 1.0, 0, .45); place("pad", C.shimmer(81, bt(2.0), .4, .2), bt(EV["card"]), 1.0, 0, .9)
place("fx", tail(C.riser(bt(2.0), 300, 8500, .7, 2.4)), bt(EV["toPaper"] - 2.0), 1.0, 0, .3)
# the light switch: impact, the groove comes in
L = frame(bt(EV["toPaper"]))
place("fx", C.impact(.85), L, 1.0, 0, .55); place("perc", C.kick(.9), L, 1.0); kicks.append(L); place("low", C.sub(26, bt(2.5), .8), L, 1.0)
pulse_run(14, 24, 1.0, .8, 14)
heart(14, 24, 14, .95)
# the lockup
G = frame(bt(EV["brand"]))
place("fx", C.impact(.7), G, 1.0, 0, .6); place("perc", C.kick(.8), G, 1.0); kicks.append(G); place("low", C.sub(29, bt(3.0), .85), G, 1.0)
for k, m in enumerate((77, 81, 84)): place("pad", C.shimmer(m, bt(3.0), .45, .5), G + .04 * k, 1.0, 0, .9)

# ═════════ 3 · picture events → sounds ═════════
for b in EV["chips"]: place("ui", C.tick(.32, 1.1), frame(bt(b)), 1.0, -.2, 0, .1)                    # each chip
for k, b in enumerate(EV["numSteps"]): place("ui", C.tick(.36, 1.0 + .08 * k), frame(bt(b + (.2 if k else 0))), 1.0, .2, 0, .1)   # each new number
c0, c1, c2 = EV["note"]                                                                                # the drawn annotation: a pen on paper
place("fx", F.scrape(bt(.6), 2400, 5200, .3, .8), frame(bt(c0)), 1.0, .25, 0, .1)
place("fx", F.scrape(bt(.5), 2800, 4600, .26, .7), frame(bt(c1)), 1.0, .3, 0, .1)
place("ui", C.thock(.45), frame(bt(EV["cta"])), 1.0, 0, 0, .15)
place("ui", C.tick(.3, 1.1), frame(bt(EV["url"])), 1.0, 0, 0, .12)
place("ui", C.confirm(.6), frame(bt(EV["tap"])), 1.0, .05, 0, .15)

# ═════════ 4 · mix ═════════
t = np.arange(N) / SR
duck = np.ones(N)
for k in kicks:
    i = int(k * SR)
    if i < N: seg = t[i:] - k; duck[i:] = np.minimum(duck[i:], 1 - .22 * np.exp(-seg / .14) * np.minimum(1, seg / .006 + .25))
verb = C.convolve(send["hall"], C.hall_ir(3.2), N) * .22 + C.convolve(send["room"], C.room_ir(.7), N) * .18
pad_b = C.ensemble(bus["pad"]) * duck
music = bus["low"] + pad_b * .95 + bus["keys"] * duck * .95 + bus["pulse"] * duck * .6 + bus["perc"] * .9
mix = music + bus["ui"] * .9 + bus["fx"] * .95 + bus["amb"] * .7 + verb
MACRO = [(0, .8), (5.9, .84), (6, .95), (13.9, .9), (14, 1.04), (23.9, 1.0), (24.5, 1.0), (BEATS - .5, .9)]     # quiet opening, lifts on the big cuts
mix = mix * np.interp(t / B, [m[0] for m in MACRO], [m[1] for m in MACRO])[None, :]
fade = int(.6 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.6
fin = int(.02 * SR); mix[:, :fin] *= np.linspace(0, 1, fin)[None, :]
if os.environ.get("MIXDEBUG"):
    for name in BUS: print(f"{name:<6} rms {20*np.log10(np.sqrt((bus[name]**2).mean())+1e-9):6.1f} dB")
mix = F.hp(mix, 42, 4)
mix = mix - .5 * F.lp(mix, 95, 2)                                     # the sub is felt, not shouted (phones)
mix = mix + .55 * F.bp(mix, 1100, 5000) + .3 * F.hp(mix, 5500, 2)   # presence + air: phones speak in the mids
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.max(np.abs(mix)) / 10 ** (-2 / 20)
out = sys.argv[1] if len(sys.argv) > 1 else "out/mix.wav"
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
sf.write(out, mix.T.astype(np.float32), SR, subtype="PCM_24")
print(f"audio {DUR:.2f} s · {BPM} BPM · {len(kicks)} kicks -> {out}")
if len(sys.argv) > 2:
    os.makedirs(sys.argv[2], exist_ok=True)
    for name in BUS:
        x = bus[name]; sf.write(os.path.join(sys.argv[2], name + ".wav"), (x / max(np.abs(x).max(), 1e-6) * .9).T.astype(np.float32), SR)
