"""cine.py — a serious, cinematic sound palette for product reels (no mallets, no bells, no bubbles: a tech product sounds serious).

Everything is synthesized (numpy / scipy, nothing to license) and returns float arrays at 48 kHz, mono (n,) or stereo (2, n).
  strings   a Solina-style string ensemble: detuned saws through a slowly opening low-pass, slow bow-like attack, chorus on the bus
  felt      a felt-hammer piano (inharmonic additive partials, soft low-passed hammer) — the only melodic voice, kept low and sparse
  pulse     a muted saw pluck whose filter closes on every note: the "engine" ostinato of modern tech scores
  sub/kick  a deep heartbeat kick and sub swells (with a little harmonic drive so phone speakers still carry them)
  impact    a cinematic hit: sub boom + body + crack + rumble (the reverb tail is added by the mix)
  riser / air whoosh   filtered-noise motion, never tonal, never a glide you could mistake for a siren
  tick / thock / confirm   dry, tactile UI haptics (a soft body + a hint of click), nothing pitched
  hall_ir / room_ir    convolution reverbs
"""
import numpy as np
from scipy import signal
import foley as F

SR = F.SR
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
_rng = np.random.default_rng(3029)


def tt(dur):
    n = int(dur * SR)
    return n, np.arange(n) / SR


def att(n, a):
    t = np.arange(n) / SR
    return 0.5 - 0.5 * np.cos(np.pi * np.clip(t / max(a, 1e-4), 0, 1))


def stereo(x, pan=0.0):
    """mono → stereo with an equal-power pan (−1 … 1)."""
    a = np.pi / 4 * (np.clip(pan, -1, 1) + 1)
    return np.vstack([x * np.cos(a), x * np.sin(a)]) * np.sqrt(2)


def tvlp(x, fc, block=256, q=.707):
    """time-varying 2nd-order low-pass (RBJ biquad); `fc` is a per-sample cutoff curve (Hz). The filter state is carried across blocks."""
    n = len(x); y = np.zeros(n); zi = np.zeros(2)
    for i in range(0, n, block):
        f = float(np.clip(fc[min(i + block // 2, n - 1)], 30, SR * .45)); w0 = 2 * np.pi * f / SR; al = np.sin(w0) / (2 * q); c = np.cos(w0)
        b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2]) / (1 + al); a = np.array([1, -2 * c / (1 + al), (1 - al) / (1 + al)])
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
    return y


# ═══════════════════════════ tonal voices ═══════════════════════════
def _saw_stack(f, n, cents=(-11, -4, 4, 11), vib=.0025, rate=5.1):
    t = np.arange(n) / SR; y = np.zeros(n)
    for d in cents:
        fd = f * 2 ** (d / 1200) * (1 + vib * np.sin(2 * np.pi * (rate + _rng.random() * .6) * t + _rng.random() * 6.28) * np.clip(t / .9, 0, 1))
        ph = (np.cumsum(fd) / SR + _rng.random()) % 1.0
        y += 2 * ph - 1
    return y / len(cents)


def strings(m, dur, vel=.6, bright=.5, a=.9, r=1.4):
    """one voice of the string ensemble (mono). `bright` 0…1 sets how far the filter opens as the note swells."""
    n, t = tt(dur + r)
    y = _saw_stack(hz(m), n)
    swell = np.clip(t / (a * 1.6), 0, 1) ** 1.4
    fc = 320 + (500 + 3300 * bright) * swell
    y = tvlp(y, fc)
    env = att(n, a) * np.clip((dur + r - t) / r, 0, 1) ** 1.3
    return y * env * vel * .14


def ensemble(x):
    """string-machine chorus on a stereo bus: three slowly modulated delay lines per channel."""
    n = x.shape[1]; t = np.arange(n) / SR; idx0 = np.arange(n, dtype=float); out = np.zeros_like(x)
    for ch in range(2):
        acc = x[ch].copy()
        for rate, depth, ph in ((.31, .0032, 0), (.53, .0024, 2.1), (.79, .0016, 4.0)):
            d = (.011 + depth * np.sin(2 * np.pi * rate * t + ph + ch * 1.5)) * SR
            acc += np.interp(idx0 - d, idx0, x[ch], left=0)
        out[ch] = acc / 4
    return out


def felt(m, vel=.55, dur=3.2, pan=0.0):
    """a felt-hammer piano note: inharmonic partials, a soft hammer thump, long decay. Returns stereo."""
    n, t = tt(dur); f0 = hz(m); y = np.zeros(n)
    for k in range(1, 11):
        fk = f0 * k * np.sqrt(1 + .00035 * k * k)
        if fk > 7000: break
        dec = (1.7 + .45 * k) / (1 + .018 * (m - 48))
        y += (1 / k ** 1.25) * (.62 * np.exp(-t * dec) + .38 * np.exp(-t * (.30 + .07 * k))) * np.sin(2 * np.pi * fk * t + _rng.random() * 6.28)
    thump = F.lp(F.rnd(n), 420) * np.exp(-t / .022) * .35
    y = F.lp((y + thump) * att(n, .003), 1500 + 3200 * vel) * np.clip((dur - t) / .5, 0, 1)
    return stereo(y * .5 * vel, pan)


def pluck(m, dur=.34, vel=.6, f_hi=2600, f_lo=380, decay=.085):
    """a muted saw pluck: the low-pass closes on every note — the pulse of the score."""
    n, t = tt(dur); f = hz(m)
    ph = (f * t + _rng.random()) % 1.0; y = 2 * ph - 1
    y = .8 * y + .5 * np.sin(2 * np.pi * f * .5 * t)
    fc = f_lo + (f_hi - f_lo) * np.exp(-t / .055)
    y = tvlp(y, fc, block=128, q=1.1)
    return y * att(n, .002) * np.exp(-t / decay) * vel * .5


def sub(m, dur=1.4, vel=.8):
    """a sub-bass note with a little 2nd/3rd harmonic so it is still there on a phone speaker."""
    n, t = tt(dur); f = hz(m)
    y = np.sin(2 * np.pi * f * t) + .26 * np.sin(4 * np.pi * f * t) + .07 * np.sin(6 * np.pi * f * t)
    e = att(n, .012) * (.6 + .4 * np.exp(-t * 3)) * np.clip((dur - t) / .18, 0, 1)
    return np.tanh(1.25 * y * e) * .5 * vel


def shimmer(m, dur=3.0, vel=.5, a=.7):
    """an airy high pad (octaves of one note, slow tremolo, nothing below 400 Hz) — the 'light' colour, not a bell."""
    n, t = tt(dur); f = hz(m); y = np.zeros(n)
    for k, amp in ((1, 1.0), (2, .6), (3, .3), (4, .18)):
        for d in (-6, 6):
            y += amp * np.sin(2 * np.pi * f * k * 2 ** (d / 1200) * t + _rng.random() * 6.28) * (.75 + .25 * np.sin(2 * np.pi * (.17 + .05 * k) * t + k))
    y = F.hp(F.lp(y, 5200), 420) * att(n, a) * np.clip((dur - t) / .9, 0, 1) ** 1.2
    return stereo(y * vel * .06)


# ═══════════════════════════ percussion & impacts ═══════════════════════════
def kick(vel=1.0, tail=.38):
    """a deep, round heartbeat kick."""
    n, t = tt(.8)
    f = 44 + 100 * np.exp(-t * 30)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .2) + .28 * np.sin(2 * np.pi * 43 * t) * np.exp(-t / tail)
    y += F.bp(F.rnd(n), 1500, 5500) * np.exp(-t / .0035) * .12
    return np.tanh(1.5 * y * att(n, .002)) * .62 * vel


def tick_hat(vel=.5, open_=False):
    n, t = tt(.09 if open_ else .035)
    return F.hp(F.rnd(n), 6500, 3) * np.exp(-t / (.03 if open_ else .008)) * .3 * vel


def rim(vel=.6):
    """a short, dry, unpitched rim tick (replaces a clap)."""
    n, t = tt(.12)
    return (F.bp(F.rnd(n), 1400, 4200) * np.exp(-t / .012) * .5 + np.sin(2 * np.pi * 420 * t) * np.exp(-t / .016) * .35) * att(n, .0008) * vel * .6


def impact(weight=1.0):
    """a cinematic hit: sub boom with a falling start, a drum-like body, a crack and a rumble. (Its tail is the reverb of the mix.)"""
    n, t = tt(3.0)
    f = 31 + 46 * np.exp(-t * 7.5)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .95) * att(n, .004)
    body = F.modal([92, 138, 207, 301], [.45, .32, .22, .14], [.55, .4, .28, .16], 1.0, detune=.002)
    crack = F.bp(F.rnd(n), 1200, 6500) * np.exp(-t / .02) * .5
    rumble = F.lp(F.rnd(n), 150) * np.exp(-t / .55) * .55
    y = boom * 1.0 + rumble
    y[:len(body)] += body * .5
    y += crack
    return np.tanh(1.2 * y * .8) * .5 * weight


def drum_low(vel=.8):
    """a low drum hit (taiko-ish): the 'heartbeat' accent before a reveal."""
    n, t = tt(1.1)
    y = np.sin(2 * np.pi * np.cumsum(70 - 22 * np.minimum(1, t / .25)) / SR) * np.exp(-t / .3) + F.lp(F.rnd(n), 600) * np.exp(-t / .05) * .35
    return np.tanh(1.3 * y * att(n, .002)) * .55 * vel


# ═══════════════════════════ motion (noise) ═══════════════════════════
def riser(dur, lo=300, hi=9000, level=1.0, curve=2.3):
    """filtered noise that opens and swells to the end; stereo, never tonal."""
    n, t = tt(dur); u = t / dur
    ch = [F.sweep_bp(F.rnd(n), lo, hi, q=.8) for _ in range(2)]
    e = (u ** curve) * np.clip((dur - t) / .02, 0, 1)
    return np.vstack(ch) * e * .55 * level


def whoosh(dur=.5, lo=400, hi=3800, level=1.0, peak=.55, width=1.0):
    """air moving past: a soft stereo band-pass sweep with a rounded asymmetric envelope (+ a veil of high air)."""
    n, t = tt(dur); u = t / dur
    e = np.where(u < peak, (u / peak) ** 1.8, ((1 - u) / (1 - peak)) ** 1.5)
    ch = []
    for _ in range(2):
        x = F.sweep_bp(F.rnd(n), lo, hi, q=.9) * 1.0 + F.hp(F.lp(F.rnd(n), 9000), 4500) * .12
        ch.append(x * e)
    y = np.vstack(ch); mid = y.mean(0)
    y = mid[None, :] * (1 - width) + y * width
    return F.lp(y, 9500) * .5 * level


def downlift(dur=1.2, level=1.0):
    """the breath after an impact: noise closing from bright to dark (never a pitched fall)."""
    n, t = tt(dur); u = t / dur
    ch = [F.sweep_bp(F.rnd(n), 6000, 350, q=.8) for _ in range(2)]
    return np.vstack(ch) * (np.exp(-u * 2.6) * att(n, .02)) * .5 * level


# ═══════════════════════════ UI haptics (dry, tactile, nothing pitched) ═══════════════════════════
def tick(level=1.0, pitch=1.0):
    """a soft haptic tick: a short muted body + a hint of click."""
    n, t = tt(.07)
    body = np.sin(2 * np.pi * 175 * pitch * t) * np.exp(-t / .011) * .55 + np.sin(2 * np.pi * 330 * pitch * t) * np.exp(-t / .006) * .2
    click = F.bp(F.rnd(n), 2000, 6500) * np.exp(-t / .0022) * .5
    return (body + click) * att(n, .0005) * level * .8


def thock(level=1.0):
    """a lower, heavier tap (a deliberate press)."""
    n, t = tt(.14)
    y = np.sin(2 * np.pi * (120 + 60 * np.exp(-t * 60)) * t) * np.exp(-t / .028) * .7 + F.lp(F.rnd(n), 900) * np.exp(-t / .008) * .35 + F.bp(F.rnd(n), 2200, 6000) * np.exp(-t / .0025) * .25
    return y * att(n, .0006) * level


def confirm(level=1.0):
    """the 'it worked' tap: a thock, a little air, and a sub that settles."""
    n, t = tt(.5)
    y = thock(1.0)[:n].copy() if n >= int(.14 * SR) else thock(1.0)
    out = np.zeros(n); out[:len(y)] = y
    out += np.sin(2 * np.pi * 58 * t) * np.exp(-t / .16) * att(n, .006) * .55
    out += F.hp(F.rnd(n), 3500) * np.exp(-t / .05) * att(n, .01) * .08
    return out * level


def ratchet_soft(dur=.28, n=6, level=1.0):
    """a very soft mechanical counter run (the odometer rolling): tiny dry ticks, no pitch."""
    nn = int(dur * SR); y = np.zeros(nn)
    for i in range(n):
        c = tick(.5 + .4 * _rng.random(), .9 + .35 * _rng.random()); k = int(i * dur / n * SR)
        m = min(len(c), nn - k)
        if m > 0: y[k:k + m] += c[:m]
    return y * level


# ═══════════════════════════ reverbs ═══════════════════════════
def hall_ir(rt60=3.3, pre=.024, seed=11):
    """a dark, wide hall: three bands decay at different speeds (highs die first), early reflections, decorrelated L/R."""
    r = np.random.default_rng(seed); n = int(rt60 * 1.2 * SR); t = np.arange(n) / SR
    def band(lo, hi, rt):
        x = r.standard_normal(n); x = F.bp(x, lo, hi) if lo else F.lp(x, hi)
        return x * np.exp(-6.91 * t / rt)
    out = []
    for _ in range(2):
        y = band(0, 380, rt60 * 1.25) * .9 + band(380, 3200, rt60) + band(3200, 9000, rt60 * .5) * .55
        for d, a in ((.011, .5), (.017, .42), (.023, .35), (.031, .3), (.041, .22), (.053, .15)):   # early reflections
            y[int(d * SR * (1 + .2 * r.standard_normal()))] += a * 3
        y[:int(pre * SR)] = 0
        y[:int(.03 * SR)] *= np.linspace(0, 1, int(.03 * SR))
        out.append(y)
    ir = np.vstack(out); ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    return ir


def room_ir(rt60=.65, pre=.008, seed=12):
    r = np.random.default_rng(seed); n = int(rt60 * 1.1 * SR); t = np.arange(n) / SR
    out = []
    for _ in range(2):
        y = F.lp(r.standard_normal(n), 5200) * np.exp(-6.91 * t / rt60); y[:int(pre * SR)] = 0; out.append(y)
    ir = np.vstack(out); ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    return ir


def convolve(x, ir, n_out):
    return np.vstack([signal.fftconvolve(x[c], ir[c])[:n_out] for c in range(2)])
