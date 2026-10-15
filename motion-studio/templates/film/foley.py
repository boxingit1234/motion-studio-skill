"""foley.py — synthesis primitives for product reels: physical-model impacts, ratchets, servos, scrapes, UI haptics, ambience.
Everything returns float32 numpy arrays at 48 kHz (mono unless noted). No samples, nothing to license.
"""
import numpy as np
from scipy import signal

SR = 48000
_rng = np.random.default_rng(2026)


def rnd(n):
    return _rng.standard_normal(n)


def T(n):
    return np.arange(n) / SR


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * .45), "low", fs=SR, output="sos"), x, axis=-1)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "high", fs=SR, output="sos"), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [max(lo, 20), min(hi, SR * .45)], "band", fs=SR, output="sos"), x, axis=-1)


def sweep_bp(x, f0, f1, block=256, q=2.2):
    """band-pass whose centre glides f0→f1 over the clip (exponential)."""
    n = len(x); y = np.zeros(n); zi = np.zeros((2, 2))                     # a 2nd-order band-pass is 2 biquad sections
    for i in range(0, n, block):
        u = (i + block / 2) / n; fc = f0 * (f1 / f0) ** u
        sos = signal.butter(2, [max(fc / (1 + 1 / q), 30), min(fc * (1 + 1 / q), SR * .45)], "band", fs=SR, output="sos")
        y[i:i + block], zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
    return y


def env_ad(n, a=.002, d=.2):
    t = T(n)
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(d, 1e-4))


def fade(n, a, r):
    t = T(n); return np.clip(t / max(a, 1e-4), 0, 1) * np.clip((n / SR - t) / max(r, 1e-4), 0, 1)


def modal(freqs, decays, amps, dur, detune=.004, phase=True):
    """struck object: a sum of damped sinusoids (the modes of a plate / bar / box)."""
    n = int(dur * SR); t = T(n); y = np.zeros(n)
    for f, d, a in zip(freqs, decays, amps):
        f = f * (1 + detune * _rng.standard_normal())
        y += a * np.sin(2 * np.pi * f * t + (_rng.random() * 6.28 if phase else 0)) * np.exp(-t / d)
    return y


def transient(dur=.006, lo=2000, hi=9000, level=1.0):
    n = int(dur * SR); t = T(n)
    return bp(rnd(n), lo, hi) * np.exp(-t / (dur * .35)) * level


def mix_at(base, x, t0, gain=1.0):
    i = int(round(t0 * SR))
    if i < 0:
        x = x[-i:]; i = 0
    m = min(len(x), len(base) - i)
    if m > 0:
        base[i:i + m] += x[:m] * gain
    return base


# ── impacts ───────────────────────────────────────────────────────
def metal_hit(f0=900, bright=1.0, dur=.5, weight=1.0):
    """aluminium / steel part meeting steel: inharmonic ring + a click + a short body thump."""
    ratios = [1, 2.76, 5.40, 8.93, 13.34]
    decays = [.22, .12, .07, .045, .03]
    amps = [1, .65, .38 * bright, .22 * bright, .12 * bright]
    y = modal([f0 * r for r in ratios], decays, amps, dur) * .5
    n = len(y)
    y[:int(.012 * SR)] += transient(.012, 2500, 9500, .9 * bright)[:int(.012 * SR)]
    t = T(n); y += np.sin(2 * np.pi * (70 + 30 * np.exp(-t * 40)) * t) * np.exp(-t / .05) * .35 * weight
    return y


def anchor_hit():
    """bracket seated on concrete: dull body, a little grit, a short metallic ring."""
    n = int(.6 * SR); t = T(n)
    body = np.sin(2 * np.pi * (58 + 40 * np.exp(-t * 30)) * t) * np.exp(-t / .11) * .9
    grit = lp(rnd(n), 900) * np.exp(-t / .045) * .7
    ring = modal([1380, 2210, 3650], [.12, .08, .05], [.5, .3, .18], .4)
    y = body + grit
    y[:len(ring)] += ring * .35
    y[:int(.01 * SR)] += transient(.01, 1500, 6000, .6)[:int(.01 * SR)]
    return y


def seat_thunk(weight=1.0):
    """a heavy module settling: sub thump + hollow box resonances + latch click."""
    n = int(.9 * SR); t = T(n)
    sub = np.sin(2 * np.pi * (52 + 70 * np.exp(-t * 28)) * t) * np.exp(-t / .16) * 1.0
    box = modal([172, 318, 536, 810], [.14, .10, .07, .05], [.8, .55, .35, .2], .6)
    y = sub * weight
    y[:len(box)] += box * .55 * weight
    y += lp(rnd(n), 500) * np.exp(-t / .03) * .5 * weight
    latch = np.zeros(n); k = int(.014 * SR)
    latch[k:k + int(.02 * SR)] = (transient(.02, 1800, 7000, 1.0) + modal([2900, 4700], [.01, .008], [1, .6], .02)[:int(.02 * SR)])
    return y + latch * .55


def module_land(weight=1.0):
    y = seat_thunk(weight)
    # a few settling ticks of the plastic skirts
    for dt, a in [(.07, .35), (.12, .22), (.18, .12)]:
        k = int(dt * SR); c = transient(.006, 1500, 6000, a); y[k:k + len(c)] += c
    return y


def clack(f=2400, level=1.0):
    n = int(.12 * SR); y = modal([f, f * 1.9, f * 3.1], [.012, .008, .005], [1, .5, .3], .12)
    y[:int(.004 * SR)] += transient(.004, 3000, 10000, 1.2)[:int(.004 * SR)]
    return y * level


def rubber_snap(level=1.0):
    """waterproof connector seating: crisp latch tick + a rubber 'thock'."""
    n = int(.25 * SR); t = T(n)
    thock = lp(rnd(n), 650) * np.exp(-t / .022) * .9 + np.sin(2 * np.pi * 330 * t) * np.exp(-t / .03) * .55
    latch = np.zeros(n); k = int(.016 * SR)
    latch[k:k + int(.03 * SR)] = (modal([3300, 5200, 7600], [.012, .008, .006], [1, .55, .3], .03)[:int(.03 * SR)])
    tick = np.zeros(n); tick[:int(.004 * SR)] = transient(.004, 3000, 9000, 1.0)[:int(.004 * SR)]
    return (thock + latch * .8 + tick) * level


def ratchet(dur, n_clicks, start_gap, end_gap, f=2300, level=1.0):
    """pawl clicks that accelerate / decelerate; each click a tiny struck-metal tick. Returns (array, times)."""
    n = int(dur * SR); y = np.zeros(n); times = []; t = 0.0
    for i in range(n_clicks):
        u = i / max(1, n_clicks - 1); gap = start_gap + (end_gap - start_gap) * u
        a = (.55 + .45 * _rng.random()) * (.7 + .3 * u)
        c = modal([f * (1 + .06 * _rng.standard_normal()), f * 1.82, f * 2.9], [.006, .004, .003], [1, .6, .35], .03)
        c = c * a + np.concatenate([np.sin(2 * np.pi * 170 * T(int(.012 * SR))) * np.exp(-T(int(.012 * SR)) / .004) * .5 * a, np.zeros(max(0, len(c) - int(.012 * SR)))])[:len(c)]
        k = int(t * SR)
        if k + len(c) < n:
            y[k:k + len(c)] += c
        times.append(t); t += gap
        if t >= dur: break
    return y * level, times


def scrape(dur, f0=1600, f1=3600, level=1.0, rough=.5):
    n = int(dur * SR); t = T(n)
    amp = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** .8 * (1 + rough * np.sin(2 * np.pi * (28 + 40 * t / dur) * t + 1.3 * np.sin(2 * np.pi * 7 * t)))
    y = sweep_bp(rnd(n), f0, f1, q=1.6) * amp
    res = modal([2100, 3300], [dur, dur], [.15, .1], dur) * amp
    return (y + res * .3) * level


def servo(dur, f0=210, f1=340, level=1.0):
    """electric actuator: FM whine + friction noise, eased in/out."""
    n = int(dur * SR); t = T(n); u = t / dur
    f = f0 + (f1 - f0) * (u ** .8)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph + 1.8 * np.sin(2 * np.pi * 94 * t)) * .45 + np.sin(2 * ph) * .15
    y += sweep_bp(rnd(n), 700, 2400, q=1.2) * .35
    e = np.sin(np.pi * np.clip(u, 0, 1)) ** 1.2
    return y * e * level


def whoosh(dur, f0=500, f1=3800, level=1.0, peak=.45, sharp=1.0):
    n = int(dur * SR); t = T(n); u = t / dur
    x = sweep_bp(rnd(n), f0, f1, q=1.1)
    e = (np.sin(np.pi * np.clip(u, 0, 1)) ** (1.4 * sharp))
    e = np.where(u < peak, (u / peak) ** 2.0, ((1 - u) / (1 - peak)) ** 1.6) if peak != .5 else e
    return x * e * level


def swish(dur=.16, f0=1200, f1=6500, level=1.0):
    return whoosh(dur, f0, f1, level, peak=.7)


def zip_wipe(dur=.4, level=1.0):
    """the lime scan line: a rising doppler-ish zip."""
    n = int(dur * SR); t = T(n); u = t / dur
    f = 300 * (9000 / 300) ** (u ** 1.3)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * .25 + sweep_bp(rnd(n), 500, 9000, q=1.4) * .9
    return s * (np.sin(np.pi * u) ** .7) * level


# ── UI haptics ────────────────────────────────────────────────────
def ui_tick(pitch=1.0, level=1.0):
    n = int(.09 * SR); t = T(n)
    y = (np.sin(2 * np.pi * 2900 * pitch * t) * np.exp(-t / .006) * .6 + np.sin(2 * np.pi * 5200 * pitch * t) * np.exp(-t / .004) * .25)
    y[:int(.002 * SR)] += transient(.003, 4000, 10000, .5)[:int(.002 * SR)]
    return y * level


def ui_pop(pitch=1.0, level=1.0):
    n = int(.16 * SR); t = T(n)
    f = (1100 - 650 * np.minimum(1, t / .08)) * pitch
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .045) * .8 * level


def ui_thud(level=1.0):
    n = int(.3 * SR); t = T(n)
    return (np.sin(2 * np.pi * (62 + 40 * np.exp(-t * 35)) * t) * np.exp(-t / .07) * .8 + lp(rnd(n), 300) * np.exp(-t / .02) * .4) * level


def bell(m, dur=1.6, level=1.0):
    f = 440 * 2 ** ((m - 69) / 12); n = int(dur * SR); t = T(n)
    return (np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4) + .12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 9)) * np.exp(-t * 2.2) * np.minimum(1, t / .003) * .25 * level


def beep(f=1760, dur=.12, level=1.0):
    n = int(dur * SR); t = T(n)
    return np.sin(2 * np.pi * f * t) * fade(n, .004, .03) * .5 * level + np.sin(2 * np.pi * f * 2 * t) * fade(n, .004, .03) * .1 * level


def led_fill(dur, level=1.0):
    """tone that climbs while the LED line fills, with a faint tick train."""
    n = int(dur * SR); t = T(n); u = t / dur
    f = 380 * (1500 / 380) ** (u ** 1.1)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * .5 + np.sin(4 * np.pi * np.cumsum(f) / SR) * .12
    y *= (.55 + .45 * np.sin(2 * np.pi * 9 * t)) * np.minimum(1, t / .05) * np.clip((dur - t) / .08, 0, 1)
    ticks = np.zeros(n)
    for k in np.arange(0, dur, .045):
        i = int(k * SR); c = transient(.003, 4000, 9000, .25)
        ticks[i:i + len(c)] += c[:max(0, n - i)][:len(c)]
    return (y * .6 + ticks) * level


def relay(level=1.0):
    n = int(.4 * SR); t = T(n)
    clk = modal([1900, 3400, 5600], [.01, .007, .005], [1, .7, .4], .06)
    y = np.zeros(n); y[:len(clk)] = clk * .9
    y[:int(.003 * SR)] += transient(.003, 2500, 9000, 1.3)[:int(.003 * SR)]
    k = int(.012 * SR); y[k:] += (np.sin(2 * np.pi * (95 + 40 * np.exp(-t[:n - k] * 50)) * t[:n - k]) * np.exp(-t[:n - k] / .06) * .7)
    y += np.sin(2 * np.pi * 100 * t) * np.exp(-t / .12) * .12 * (1 + np.sin(2 * np.pi * 50 * t))
    return y * level


def power_down(dur=1.0, level=1.0):
    n = int(dur * SR); t = T(n); u = t / dur
    f = 900 * (45 / 900) ** (u ** .7)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * .5 + np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * .18
    s *= np.exp(-u * 2.2)
    noise = lp(rnd(n), 2500) * np.exp(-u * 4) * .35
    crackle = np.zeros(n)
    for k in _rng.random(18) ** 1.6 * dur:
        i = int(k * SR); c = transient(.004, 2000, 9000, .5 * (1 - k / dur)); crackle[i:i + len(c)] += c[:max(0, n - i)][:len(c)]
    return (s + noise + crackle) * level


def reverse_swell(dur, level=1.0):
    n = int(dur * SR); t = T(n)
    x = np.vstack([hp(rnd(n), 1800), hp(rnd(n), 1800)]) * (t / dur) ** 3 * .7
    return x * level


# ── ambience beds ─────────────────────────────────────────────────
def amb_day(dur, level=1.0):
    n = int(dur * SR); t = T(n)
    rumble = lp(rnd(n), 380) * .5
    traffic = bp(rnd(n), 120, 600) * (.5 + .5 * np.sin(2 * np.pi * .21 * t + 1.1)) * .35
    wind = bp(rnd(n), 250, 1100) * (.3 + .7 * np.clip(np.sin(2 * np.pi * .13 * t) + .35 * np.sin(2 * np.pi * .31 * t), 0, 1) ** 2) * .5
    y = rumble + traffic + wind
    for k in _rng.random(5) * dur:                                            # distant birds
        m = int(.09 * SR); tt = T(m); f = 3200 + 700 * np.sin(2 * np.pi * (11 + 8 * _rng.random()) * tt)
        c = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / .09) ** 2 * .05
        i = int(k * SR); y[i:i + m] += c[:max(0, n - i)][:m]
    return np.vstack([y, np.roll(y, 240)]) * .25 * level


def amb_night(dur, level=1.0):
    n = int(dur * SR); t = T(n)
    rumble = lp(rnd(n), 260) * .45
    hum = (np.sin(2 * np.pi * 100 * t) * .08 + np.sin(2 * np.pi * 150 * t) * .04)
    crick = np.sin(2 * np.pi * 4600 * t) * np.clip(np.sin(2 * np.pi * 27 * t), 0, 1) * (.5 + .5 * np.sin(2 * np.pi * .6 * t)) * .05 \
        + np.sin(2 * np.pi * 5100 * t) * np.clip(np.sin(2 * np.pi * 31 * t + 1), 0, 1) * (.5 + .5 * np.sin(2 * np.pi * .45 * t + 2)) * .035
    y = rumble + hum + crick
    return np.vstack([y, np.roll(y, 300)]) * .25 * level


def amb_studio(dur, level=1.0):
    n = int(dur * SR)
    y = hp(rnd(n), 3000) * .02 + lp(rnd(n), 160) * .12
    return np.vstack([y, np.roll(y, 200)]) * .25 * level


def amb_room(dur, level=1.0):
    n = int(dur * SR); t = T(n)
    y = np.sin(2 * np.pi * 100 * t) * .07 + lp(rnd(n), 300) * .12 + hp(rnd(n), 4000) * .008
    return np.vstack([y, np.roll(y, 180)]) * .25 * level
