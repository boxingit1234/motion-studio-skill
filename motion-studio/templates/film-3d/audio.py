"""audio.py — score + sound design for the example 3D product film (30 s, 96 BPM, 48 beats).

Serious, warm palette (cine.py: string ensemble, felt piano, muted pulse, heartbeat kick, impacts, noise risers; foley.py: servo, module landings,
ambiences). Every event is placed from the SAME beat numbers as film.js / comp.html (see EV below — keep them in sync).
  python audio.py out/mix.wav [out/stems]
"""
import os, sys
import numpy as np
import soundfile as sf
from scipy import signal
import foley as F
import cine as C

SR = F.SR
BPM = 96; B = 60 / BPM
DUR = 48 * B; N = int(round(SR * DUR))
bt = lambda b: b * B

# ── events (beats) — mirrored from film.js (DOCK, shots) and comp.html (captions, end card)
EV = dict(
    hook1=1.0, hook2=3.25, reveal=8.0, title=9.25, cut_macro=14.0, ring=14.0, lfp=14.6, cut_fins=17.0, cool=17.2, pull=19.0, groove=20.5, counters=20.6,
    docks=[dict(lift=22.0, slide=22.5, land=23.0, done=23.5, pan=-.5), dict(lift=24.0, slide=24.5, land=25.0, done=25.5, pan=.5)],
    cable=23.65, mods=28.6, dims=[29.6, 29.9, 30.2], cut_house=32.0, ip=33.0, line1=(34.8, 36.4), line2=(36.5, 38.0), lights=(36.4, 38.2), temp=36.3,
    dive=(13.0, 14.9), callout=(15.1, 15.45, 15.75),
    mix=(39.5, 40.25), day=40.6, eve=41.85, fade=(44.0, 45.0), prod=44.85, logo=45.1, partner=45.35, cta=45.65, url=45.9, pulse=46.5,
)
SOC_TICKS = [14.6 + 1.8 * (k - 1) / 7 for k in range(2, 9)]

BUS = ("low", "pad", "keys", "pulse", "perc", "fx", "ui", "amb")
BUSGAIN = {"low": .1, "pad": 3.0, "keys": .72, "pulse": 2.1, "perc": .42, "fx": .42, "ui": 1.25, "amb": 1.0}
bus = {k: np.zeros((2, N)) for k in BUS}
send = {"hall": np.zeros((2, N)), "room": np.zeros((2, N))}
kicks = []


def tail(x, ms=70):
    """a softer end for noise swells that land on a cut (a 20 ms stop reads as a click)."""
    x = np.array(x, np.float64); n = int(ms / 1000 * SR); n = min(n, x.shape[-1]); x[..., -n:] *= (.5 + .5 * np.cos(np.pi * np.arange(n) / n)); return x


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


# ═══════════════════════════ harmony: F major / D minor, warm ═══════════════════════════
def P8(r, a, b): return [r, r + 7, r + 12, r + 7, r, r + 7, a, b]
CH = [
    (0, 41, [53, 57, 60, 64, 67], P8(41, 55, 48)),          # Fmaj9 — the sunset
    (4, 40, [52, 55, 60, 62, 67], P8(40, 55, 47)),          # C/E — "energia rămâne"
    (6, 38, [50, 57, 60, 64, 65], P8(38, 53, 45)),          # Dm9
    (8, 34, [46, 53, 57, 62, 65], P8(34, 50, 41)),          # Bbmaj7 — the reveal
    (10, 41, [53, 60, 65, 67, 69], P8(41, 55, 48)),         # F add9 — the name
    (12, 36, [48, 55, 60, 62, 67], P8(36, 52, 43)),         # C add9 — lift into the cut
    (14, 38, [50, 57, 60, 62, 65], P8(38, 52, 45)),         # Dm9 — the studio
    (17, 34, [46, 53, 58, 62, 65], P8(34, 50, 41)),         # Bb — the fins
    (19, 33, [45, 52, 57, 60, 64], P8(33, 48, 40)),         # Am7 — tension
    (20.5, 38, [50, 57, 62, 65, 69], P8(38, 53, 45)),       # Dm — the groove
    (22, 34, [46, 53, 57, 62, 65], P8(34, 50, 41)),         # Bbmaj7
    (23.5, 41, [53, 57, 60, 65, 69], P8(41, 55, 48)),       # F — 13,8
    (24, 36, [48, 55, 60, 64, 67], P8(36, 52, 43)),         # C
    (25.5, 38, [50, 57, 60, 64, 65], P8(38, 53, 45)),       # Dm9 — 20,7
    (28, 34, [46, 53, 57, 60, 62], P8(34, 50, 41)),         # Bbmaj9 — modular
    (30, 36, [48, 55, 60, 62, 67], P8(36, 52, 43)),         # C add9 → the house
    (32, 41, [53, 57, 60, 64, 67], P8(41, 55, 48)),         # Fmaj9 — dusk
    (34, 40, [52, 55, 60, 64, 67], P8(40, 55, 47)),         # C/E
    (36, 38, [50, 57, 60, 62, 65], P8(38, 53, 45)),         # Dm9 — the lights come on
    (38, 34, [46, 53, 57, 62, 65], P8(34, 50, 41)),         # Bbmaj7
    (40, 41, [53, 57, 60, 64, 67], P8(41, 55, 48)),         # Fmaj9 — evening
    (42, 34, [46, 53, 57, 62, 65], P8(34, 50, 41)),         # Bbmaj7 — "seara o folosești"
    (44, 36, [48, 55, 60, 62, 67], P8(36, 52, 43)),         # C add9 — the fade
    (45, 41, [41, 53, 60, 65, 69, 72], P8(41, 55, 48)),     # F — home
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
        ch = chord_at(b); pat = ch[3]; k = int(round((b - origin) / .5)) % 8
        m = pat[k]; acc = 1.0 if k % 4 == 0 else (.82 if k % 2 == 0 else .68); br = bright(b) if callable(bright) else bright
        place("pulse", C.pluck(m, .36, .62 * acc * level, 1600 + 2600 * br, 360 + 200 * br), bt(b), 1.0, -.15 + .3 * (k % 2), 0, .12)
        b += .5


def heart(b0, b1, origin, level=1.0, rim_on=True, hats=True, only_pos=(0, 2)):
    b = b0
    while b < b1 - 1e-6:
        pos = (b - origin) % 4; lv = level
        if pos in only_pos:
            place("perc", C.kick(.92 * lv), bt(b), 1.0, 0, 0, .05); kicks.append(bt(b))
            r = chord_at(b)[1]; place("low", C.sub(r - 12 + (12 if r < 36 else 0), bt(1.7), .5 * lv), bt(b), 1.0)
        if rim_on and pos in (1, 3): place("perc", C.rim(.5 * lv), bt(b), 1.0, .1, 0, .12)
        if hats:
            on = abs(b - round(b)) < 1e-6
            place("perc", C.tick_hat((.38 if on else .5) * lv, open_=(pos == 3.5)), bt(b), 1.0, -.2 if on else .25)
        b += .5


def amb(kind, b0, b1, level=1.0, fade=.6):
    d = bt(b1 - b0); fn = {"day": F.amb_day, "night": F.amb_night, "room": F.amb_room, "studio": F.amb_studio}[kind]
    x = fn(d + .1, 1.0)[:, :int(d * SR)]; n = x.shape[1]; t = np.arange(n) / SR
    x = x * (np.clip(t / fade, 0, 1) * np.clip((d - t) / fade, 0, 1))[None, :]
    place("amb", x, bt(b0), level)


# ═══════════════════════════ 1 · the sunset room (b0–14) ═══════════════════════════
amb("room", 0, 14.3, 1.0, .4)
pad_chords(0, 14, .35, .9, 1.2, .55)
place("low", C.sub(29, bt(4), .45), 0, 1.0)
for b, m, v in ((0.0, 69, .42), (1.0, 72, .36), (3.25, 76, .4), (4.0, 67, .32), (6.0, 65, .34), (7.0, 69, .3)):     # a sparse felt motif: one note per caption
    place("keys", C.felt(m, v, 3.2, .1), bt(b), 1.0, 0, .75)
pulse_run(8, 14, .55, lambda b: .15 + .5 * (b - 8) / 6, 8)                          # the pulse wakes up with the reveal
heart(10, 14, 10, .55, rim_on=False, hats=False, only_pos=(0,))
place("keys", C.felt(77, .38, 3.0, .2), bt(EV["title"]), 1.0, 0, .8); place("keys", C.felt(65, .3, 3.0, -.2), bt(EV["title"]) + .01, 1.0, 0, .7)
# the dive into the pill: a short anticipation, then air rushing past into the cut
d0, d1 = EV["dive"]
place("fx", tail(C.riser(bt(EV["cut_macro"] - d0), 300, 8500, .75, 2.6)), bt(d0), 1.0, 0, .3)
place("fx", C.whoosh(bt(.9), 500, 4200, .55, .78, 1.3), bt(EV["cut_macro"] - .55), 1.0, 0, .2)

# ═══════════════════════════ 2 · the studio: macro, fins (b14–20.5) ═══════════════════════════
H = bt(EV["cut_macro"])
place("fx", C.impact(.85), H, 1.0, 0, .55); place("perc", C.kick(.9), H, 1.0); kicks.append(H); place("low", C.sub(26, bt(2.8), .8), H, 1.0)
place("pad", C.shimmer(81, bt(2.4), .45, .2), H + .02, 1.0, 0, .9)                    # the ring lights up
amb("studio", 14, 32, .9, .3)
pad_chords(14, 20.5, .3, .8, .7, .5)
pulse_run(14, 17, .38, .15, 14)                                                   # the light/dark switch: the drums drop out in the dark studio …
pulse_run(17, 20.5, .7, .35, 14)
heart(17, 20.5, 17, .6, rim_on=False, hats=False, only_pos=(0,))                    # … and come back with the fins
c0, c1, c2 = EV["callout"]                                                          # the lime annotation is drawn: a pen on paper
place("fx", F.scrape(bt(.45), 2400, 5200, .3, .8), bt(c0), 1.0, .25, 0, .1)
place("fx", F.scrape(bt(.4), 2800, 4600, .26, .7), bt(c1), 1.0, .3, 0, .1)
place("ui", C.tick(.28, 1.2), bt(c2), 1.0, .3, 0, .1)
for k, b in enumerate(SOC_TICKS): place("ui", C.tick(.35 + .03 * k, 1.0 + .06 * k), bt(b), 1.0, .15, 0, .12)   # the level ring fills, one segment per tick
place("fx", C.whoosh(bt(.6), 500, 3600, .35, .5, 1.0), bt(EV["cut_fins"]) - .18, 1.0, -.3)
place("perc", C.kick(.55), bt(EV["cut_fins"]), 1.0); kicks.append(bt(EV["cut_fins"]))
place("fx", tail(C.riser(bt(1.5), 260, 6000, .65, 2.4)), bt(EV["groove"] - 1.5), 1.0, 0, .3)

# ═══════════════════════════ 3 · the stack: the groove and the docks (b20.5–32) ═══════════════════════════
G = bt(EV["groove"])
place("fx", C.impact(.7), G, 1.0, 0, .4); place("low", C.sub(26, bt(2.0), .7), G, 1.0)
pad_chords(20.5, 32, .55, .9, .5, .45)
pulse_run(20.5, 32, 1.0, .6, 20.5)
heart(20.5, 32, 20.5, .95)
for k, d in enumerate(EV["docks"]):
    pn = d["pan"]
    place("fx", F.servo(bt(d["slide"] - d["lift"]), 190, 330, .5), bt(d["lift"]), 1.0, 0, .12)                     # the power module rises
    place("fx", C.whoosh(bt(.55), 380, 3200, .55, .6, 1.0), bt(d["slide"]), 1.0, pn, .15)                           # a battery slides in
    place("fx", F.module_land(.75), bt(d["land"]), 1.0, pn * .5, 0, .2)                                               # … and seats
    place("fx", F.seat_thunk(.9), bt(d["done"]), 1.0, 0, .1, .2)                                                      # the power module docks on top
    place("ui", C.confirm(.55), bt(d["done"]) + .04, 1.0, .1, 0, .15)
    place("pad", C.shimmer(84 + 2 * k, bt(1.6), .38, .2), bt(d["done"]) + .02, 1.0, 0, .9)
    place("ui", C.tick(.32, 1.15), bt(d["done"] + .2), 1.0, -.2, 0, .1)                                               # the counter changes
place("ui", C.tick(.25, .95), bt(EV["counters"]), 1.0, -.2, 0, .1)
for b in EV["dims"]: place("ui", C.tick(.28, 1.25), bt(b), 1.0, .2, 0, .12)
place("fx", tail(C.riser(bt(1.5), 300, 8000, .7, 2.2)), bt(30.5), 1.0, 0, .3)

# ═══════════════════════════ 4 · the house at dusk (b32–40) ═══════════════════════════
Hh = bt(EV["cut_house"])
place("fx", C.impact(.8), Hh, 1.0, 0, .6); place("perc", C.kick(.85), Hh, 1.0); kicks.append(Hh); place("low", C.sub(29, bt(3.0), .8), Hh, 1.0)
place("fx", C.downlift(bt(1.4), .5), Hh + .02, 1.0, 0, .3)
place("fx", C.whoosh(bt(2.6), 260, 1800, .4, .45, 1.6), Hh + .05, 1.0, -.1, .3)      # the camera pulls back to reveal the house
amb("night", 32, 40.6, 1.0, .5)
pad_chords(32, 40.25, .6, 1.0, .7, .55)
pulse_run(32.5, 40, .75, .5, 32)
heart(34, 39.5, 32, .7, rim_on=True, hats=False, only_pos=(0, 2))
for b0, b1 in (EV["line1"], EV["line2"]):                                              # energy flowing along the lines: airy noise swells, never a tonal glide
    place("fx", C.whoosh(bt(b1 - b0) + .3, 600, 2600, .4, .7, 1.4), bt(b0), 1.0, .2, .25)
    for k in range(4): place("ui", C.tick(.16, 1.3 + .05 * k), bt(b0 + (b1 - b0) * (k + 1) / 5), 1.0, -.3 + .2 * k, 0, .1)
L0, L1 = EV["lights"]                                                                  # the windows warm up
for k, m in enumerate((65, 69, 72, 77)): place("pad", C.shimmer(m, bt(L1 - L0) + 1.0, .32, .8), bt(L0) + .05 * k, 1.0, 0, .9)
place("keys", C.felt(72, .34, 3.2, .1), bt(EV["ip"]), 1.0, 0, .75); place("keys", C.felt(69, .3, 3.2, -.1), bt(EV["temp"]), 1.0, 0, .75)
place("fx", C.downlift(bt(1.2), .35), bt(EV["mix"][0]), 1.0, 0, .3)

# ═══════════════════════════ 5 · evening at home (b40–44) and the end card (b44–48) ═══════════════════════════
amb("room", 40, 46.5, .9, .6)
pad_chords(40.25, 45, .45, .95, .9, .6)
pulse_run(40.5, 44, .4, .25, 40)
for b, m, v in ((EV["day"], 69, .42), (EV["eve"], 72, .44), (EV["eve"] + 1.0, 77, .36)): place("keys", C.felt(m, v, 3.4, .0), bt(b), 1.0, 0, .8)
Lg = bt(EV["logo"])
place("fx", C.impact(.7), Lg, 1.0, 0, .6); place("perc", C.kick(.8), Lg, 1.0); kicks.append(Lg); place("low", C.sub(29, bt(3.0), .85), Lg, 1.0)
for k, m in enumerate((41, 53, 60, 65, 69, 72)): place("pad", C.stereo(C.strings(m, DUR - bt(45) + .2, .7, .7, .3, 1.4), -.4 + .16 * k), bt(45), 1.0, 0, .55)
for k, m in enumerate((77, 81, 84)): place("pad", C.shimmer(m, bt(3.0), .45, .5), Lg + .04 * k, 1.0, 0, .9)
for b, m in ((EV["logo"], 65), (EV["partner"], 69), (EV["cta"], 72)):
    place("keys", C.felt(m, .5, 3.4, 0), bt(b), 1.0, 0, .75); place("keys", C.felt(m - 12, .3, 3.0, 0), bt(b), .7, 0, .6)
place("ui", C.tick(.3, 1.0), bt(EV["prod"]), 1.0, 0, 0, .12)
place("ui", C.thock(.45), bt(EV["cta"]), 1.0, 0, 0, .15)
place("ui", C.tick(.3, 1.1), bt(EV["url"]), 1.0, 0, 0, .12)
place("ui", C.confirm(.6), bt(EV["pulse"]), 1.0, .05, 0, .15)

# ═══════════════════════════ mix ═══════════════════════════
t = np.arange(N) / SR
duck = np.ones(N)
for k in kicks:
    i = int(k * SR)
    if i < N: seg = t[i:] - k; duck[i:] = np.minimum(duck[i:], 1 - .22 * np.exp(-seg / .14) * np.minimum(1, seg / .006 + .25))
HALL, ROOM = C.hall_ir(3.2), C.room_ir(.7)
verb = C.convolve(send["hall"], HALL, N) * .22 + C.convolve(send["room"], ROOM, N) * .18
pad_b = C.ensemble(bus["pad"]) * duck
music = bus["low"] + pad_b * .95 + bus["keys"] * duck * .95 + bus["pulse"] * duck * .6 + bus["perc"] * .9
mix = music + bus["ui"] * .9 + bus["fx"] * .95 + bus["amb"] * .7 + verb
# macro dynamics: a quiet golden opening, the studio cut as the first lift, the groove, the house, a soft evening, the end card
MACRO = [(0, .8), (7.5, .82), (13.9, .84), (14.0, 1.0), (17, .9), (20.5, 1.0), (25.5, 1.04), (31.9, .98), (32.0, 1.02), (36, 1.0), (39.5, .86), (40.5, .8), (44, .8), (45.1, .98), (47.0, .9)]
mix = mix * np.interp(t / B, [m[0] for m in MACRO], [m[1] for m in MACRO])[None, :]
fade = int(.7 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.6
fadein = int(.02 * SR); mix[:, :fadein] *= np.linspace(0, 1, fadein)[None, :]
if os.environ.get("MIXDEBUG"):
    for name in BUS + ("verb",):
        x = verb if name == "verb" else (pad_b if name == "pad" else bus[name])
        print(f"{name:<6} rms {20*np.log10(np.sqrt((x**2).mean())+1e-9):6.1f} dB")
mix = F.hp(mix, 42, 4)
mix = mix - .5 * F.lp(mix, 95, 2)                                     # the sub is felt, not shouted
mix = mix + .55 * F.bp(mix, 1100, 5000) + .3 * F.hp(mix, 5500, 2)   # presence + a little air: phones speak in the mids
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.max(np.abs(mix)) / 10 ** (-2 / 20)
out_path = sys.argv[1] if len(sys.argv) > 1 else "out/mix.wav"
os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
sf.write(out_path, mix.T.astype(np.float32), SR, subtype="PCM_24")
print(f"audio {DUR:.2f} s · {BPM} BPM · {len(kicks)} kicks -> {out_path}")
if len(sys.argv) > 2:
    os.makedirs(sys.argv[2], exist_ok=True)
    for name in BUS:
        x = bus[name]; sf.write(os.path.join(sys.argv[2], name + ".wav"), (x / max(np.abs(x).max(), 1e-6) * .9).T.astype(np.float32), SR)
