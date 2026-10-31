#!/usr/bin/env python3
"""Optional: renders each character's finish sound ONCE, offline (the app just plays the files; nothing is synthesized at runtime).
Without rendered clips, Pi Desktop falls back to a macOS system sound + `say`, which needs no setup.

  python3 -m venv sounds/.venv && sounds/.venv/bin/pip install -r sounds/requirements.txt
  # Kokoro model files (Apache-2.0) into ~/.cache/kokoro: kokoro-v1.0.onnx and voices-v1.0.bin
  #   from https://github.com/thewh1teagle/kokoro-onnx/releases
  sounds/.venv/bin/python sounds/render.py            # every character with a finish line
  sounds/.venv/bin/python sounds/render.py research   # just these
  sounds/.venv/bin/python sounds/render.py --voice research=am_adam --speed research=0.95   # try a voice for one run

Per character <id> it writes clips/<id>.chime.m4a (an original synthesized motif) and clips/<id>.voice.m4a
(a neural Kokoro voice saying "finish.say" from characters/<id>.json). Tune it in the character file:

  "finish": { "say": "Scout has findings.",
              "render": { "voice": "af_sarah", "speed": 1.02, "lang": "en-us",
                          "motif": "bell", "notes": [[21, 0, 0.7], [28, 0.12, 1.1]], "reverb": 0.25,
                          "spoken": "optional respelling the voice reads instead of say" } }

motif (instrument): bell, marimba, pluck, brass, clean, ping, swell, square, beat, whistle.
notes: [semitones from C4, start seconds, length seconds]. Needs ffmpeg on PATH."""
import json, sys, subprocess, re
from pathlib import Path
import numpy as np, soundfile as sf

HERE = Path(__file__).parent
CHARS = HERE.parent / "characters"
OUT = HERE / "clips"; OUT.mkdir(exist_ok=True)
SR = 44100
KOKORO = Path.home() / ".cache/kokoro"
DEFAULT = {"voice": "af_heart", "speed": 1.0, "lang": "en-us", "motif": "bell", "notes": [[12, 0, 1.0], [19, 0.12, 1.2]], "reverb": 0.25}
hz = lambda semi: 261.6256 * 2 ** (semi / 12)

def env(n, a, r, curve=3.0):
    t = np.linspace(0, 1, n, endpoint=False); e = np.ones(n)
    na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na)
    e *= np.exp(-curve * t) if r is None else 1
    nr = max(1, int(r * SR)) if r else 0
    if r: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def sine(f, n, ph=0): return np.sin(2 * np.pi * f * np.arange(n) / SR + ph)
def saw(f, n):
    t = (f * np.arange(n) / SR) % 1; return 2 * t - 1
def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR); y = np.zeros_like(x); s = 0.0
    for i, v in enumerate(x): s = (1 - a) * v + a * s; y[i] = s
    return y
def inst(kind, f, d):
    n = int((d + .15) * SR); t = np.arange(n) / SR
    if kind == "bell":   # FM bell: inharmonic partners, long decay
        mod = sine(f * 3.5, n) * 3 * np.exp(-6 * t); x = np.sin(2 * np.pi * f * t + mod) * np.exp(-3.2 * t / max(d, .3))
        return x * env(n, .002, None, 0) 
    if kind == "marimba":
        x = sine(f, n) * np.exp(-6 * t) + .45 * sine(f * 4, n) * np.exp(-18 * t) + .15 * sine(f * 10, n) * np.exp(-30 * t); return x * 1.1
    if kind == "pluck":  # soft saw pluck: bright then dark
        x = saw(f, n) * np.exp(-9 * t / max(d, .15)) ; return lowpass(x, 3500) * .9 + .25 * sine(f, n) * np.exp(-7 * t)
    if kind == "brass":  # saw with slow-opening filter: a warm horn-like swell
        x = saw(f, n) + .5 * saw(f * 1.005, n); x = lowpass(x, 1100 + 2500 * (1 - np.exp(-12 * t)).mean()); x *= env(n, .035, .18); return x * .55
    if kind == "clean":  # crisp UI tone with a touch of octave
        return (sine(f, n) + .22 * sine(2 * f, n)) * np.exp(-6.5 * t / max(d, .2)) * env(n, .004, .05) * .9
    if kind == "ping":   # sonar ping + two echoes
        x = sine(f, n) * np.exp(-14 * t) * env(n, .003, None, 0)
        for dl, g in ((.28, .45), (.56, .22)):
            k = int(dl * SR); x[k:] += g * x[:-k] if k < n else 0
        return x
    if kind == "swell":  # cinematic pad: slow attack
        x = sum(sine(f * m, n, i) for i, m in enumerate((1, 1.004, .996))) / 3; return x * env(n, .35, .5) * .8
    if kind == "square":
        x = np.sign(sine(f, n)) * .5; return lowpass(x, 2500) * env(n, .003, .06) * np.exp(-5 * t / max(d, .15))
    return sine(f, n) * env(n, .005, .1)
def reverb(x, amt):
    if amt <= 0: return x
    L = int(1.4 * SR); rng = np.random.default_rng(7); ir = rng.standard_normal(L) * np.exp(-np.linspace(0, 6, L)); ir[0] = 0
    ir = lowpass(ir, 6000); n = 1 << (len(x) + L).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x) + L]; wet /= max(1e-6, np.abs(wet).max())
    out = np.zeros(len(x) + L); out[: len(x)] = x * (1 - amt * .5); out += wet * amt * np.abs(x).max() * .9; return out
def drum(kind, n):
    t = np.arange(n) / SR
    if kind == "kick": f = 120 * np.exp(-28 * t) + 40; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-11 * t)
    if kind == "clap": return np.random.default_rng(3).standard_normal(n) * np.exp(-30 * t) * .6
def build(r):
    kind, notes, rv = r["motif"], r["notes"], float(r["reverb"])
    if kind == "beat":  # kick, clap, kick, clap, then a stab
        x = np.zeros(int(1.4 * SR))
        for st, dr in ((0, "kick"), (.1, "clap"), (.2, "kick"), (.3, "clap")):
            d = drum(dr, int(.3 * SR)); i = int(st * SR); x[i:i + len(d)] += d
        for semi in (0, 4, 7):
            s = inst("pluck", hz(semi + 7), .5); i = int(.4 * SR); x[i:i + len(s)] += s[: len(x) - i] * .5
        return reverb(x, rv)
    if kind == "whistle":  # short referee-style chirp with vibrato, then a bell
        n = int(.5 * SR); t = np.arange(n) / SR; f = 2600 + 120 * np.sin(2 * np.pi * 38 * t); ph = 2 * np.pi * np.cumsum(f) / SR
        w = (np.sin(ph) + .3 * np.sin(2 * ph)) * env(n, .01, .08) * .5 + np.random.default_rng(5).standard_normal(n) * .03 * env(n, .01, .08)
        x = np.zeros(int(1.6 * SR)); x[: n] += w
        b = inst("bell", hz(19), .8); i = int(.45 * SR); x[i:i + len(b)] += b[: len(x) - i] * .6
        return reverb(x, rv)
    x = np.zeros(int((max(s + d for _, s, d in notes) + .5) * SR))
    for semi, st, d in notes:
        s = inst(kind, hz(semi), d); i = int(st * SR); x[i:i + len(s)] += s[: len(x) - i]
    return reverb(x, rv)

def measure(wav):  # integrated loudness (LUFS) of a short clip
    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(wav), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r); return float(m[-1]) if m else -23.0
def master(wav, target):  # measure, apply exact gain, limit, encode AAC (one-pass loudnorm is unreliable on 1-3 s clips)
    gain = target - measure(wav)
    out = wav.with_suffix(".m4a")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:attack=2:release=40", "-ar", "44100", "-c:a", "aac", "-b:a", "128k", str(out)], check=True)
    wav.unlink(); return out

def main():
    args = sys.argv[1:]; ov_v, ov_s = {}, {}
    for flag, d in (("--voice", ov_v), ("--speed", ov_s)):
        while flag in args:
            i = args.index(flag); k, v = args[i + 1].split("="); d[k] = v; del args[i:i + 2]
    ids = args or [p.stem for p in sorted(CHARS.glob("*.json")) if not p.stem.startswith("_") and not p.stem.endswith("-fast")]
    from kokoro_onnx import Kokoro
    tts = Kokoro(str(KOKORO / "kokoro-v1.0.onnx"), str(KOKORO / "voices-v1.0.bin"))
    manifest = {}
    for cid in ids:
        j = json.loads((CHARS / f"{cid}.json").read_text()); fin = j.get("finish") or {}
        line = fin.get("say") or f"{j.get('name', cid)} complete."
        r = {**DEFAULT, **(fin.get("render") or {})}
        voice = ov_v.get(cid, r["voice"]); speed = float(ov_s.get(cid, r["speed"]))
        c = build(r); c = c / max(1e-6, np.abs(c).max()) * .8
        sf.write(OUT / f"{cid}.chime.wav", c.astype(np.float32), SR); master(OUT / f"{cid}.chime.wav", -24)
        v, sr = tts.create(r.get("spoken") or line, voice=voice, speed=speed, lang=r["lang"])
        v = np.asarray(v, dtype=np.float32); v = np.concatenate([np.zeros(int(.05 * sr), np.float32), v, np.zeros(int(.25 * sr), np.float32)])
        sf.write(OUT / f"{cid}.voice.wav", v, sr); master(OUT / f"{cid}.voice.wav", -18)
        manifest[cid] = {"voice": voice, "speed": speed, "line": line, "motif": r["motif"]}
        print(f"{cid:12} {voice:11} x{speed:<4} {r['motif']:8} \"{line}\"")
    old = json.loads((HERE / "manifest.json").read_text()) if (HERE / "manifest.json").exists() else {}
    (HERE / "manifest.json").write_text(json.dumps({**old, **manifest}, indent=1))
if __name__ == "__main__": main()
