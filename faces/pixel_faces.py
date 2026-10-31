#!/usr/bin/env python3
"""Pixel-art faces for Pi Desktop characters: one 20x20 face per character, drawn from a few traits.

  python3 -I faces/pixel_faces.py            # builds every characters/<id>.json that has a "face"
  python3 -I faces/pixel_faces.py research   # just one

A character opts in with a "face" block in characters/<id>.json:
  "face": { "skin": "#e6bb94", "hair": "#5b4636", "style": "short", "beard": "none", "glasses": "round", "gear": "none", "outfit": "#2b3a55" }
  style: short, buzz, bald, long, cap, beanie, hood · beard: none, stubble, full · glasses: none, round · gear: none, headphones
  outfit defaults to the character's accent.

Writes characters/<id>/:
  portrait.png, portrait-blink.png   400x400 nearest-neighbour upscale (the app picks these up automatically)
  face.json                          true-colour grids for the terminal header/footer (big 20x20, mini 10x10, open + blink)
  character.json, quotes.json        name / tagline / accent / lines for the terminal pixel-coach extension
Requires Pillow (pip install pillow)."""
import json, sys
from pathlib import Path
from PIL import Image

CHARS = Path(__file__).resolve().parent.parent / "characters"
N = 20

def hx(c): return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
def to_hex(t): return "#%02x%02x%02x" % t
def mix(a, b, k):  # k=0 -> a, k=1 -> b
    A, B = hx(a), hx(b); return to_hex(tuple(round(A[i] * (1 - k) + B[i] * k) for i in range(3)))
def shade(c, k): return mix(c, "#000000", k)

def draw(spec, blink=False):
    g = [[None] * N for _ in range(N)]
    def put(x, y, c):
        if 0 <= x < N and 0 <= y < N: g[y][x] = c
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): put(x, y, c)
    skin, hair, acc = spec["skin"], spec["hair"], spec["accent"]
    skin_d = shade(skin, 0.18)
    outfit = spec.get("outfit") or acc
    style, beard, glasses, gear = spec.get("style", "short"), spec.get("beard", "none"), spec.get("glasses", "none"), spec.get("gear", "none")

    # body: neck + shoulders (hoodie/shirt in the accent colour)
    rect(8, 16, 11, 17, skin_d)
    rect(3, 17, 16, 19, outfit); rect(2, 18, 17, 19, outfit)
    rect(8, 17, 11, 17, skin_d); put(9, 17, shade(outfit, .35)); put(10, 17, shade(outfit, .35))
    for y in (18, 19): put(9, y, shade(outfit, .25)); put(10, y, shade(outfit, .25))
    # head
    rect(5, 4, 14, 15, skin); rect(6, 3, 13, 3, skin); rect(6, 16, 13, 16, skin); put(5, 16, None)
    put(4, 8, skin_d); put(4, 9, skin_d); put(15, 8, skin_d); put(15, 9, skin_d)          # ears
    # hair / headgear
    if style in ("short", "long"):
        rect(5, 2, 14, 4, hair); rect(6, 1, 13, 1, hair); put(5, 5, hair); put(14, 5, hair); put(5, 6, hair); put(14, 6, hair)
        if style == "long":
            for y in range(5, 14): put(4, y, hair); put(15, y, hair)
            for y in range(7, 13): put(5, y, hair); put(14, y, hair)
    elif style == "buzz":
        rect(5, 3, 14, 4, shade(hair, .1)); rect(6, 2, 13, 2, shade(hair, .1)); put(5, 5, shade(hair, .1)); put(14, 5, shade(hair, .1))
    elif style == "bald":
        put(8, 3, mix(skin, "#ffffff", .35)); put(9, 3, mix(skin, "#ffffff", .35)); put(8, 4, mix(skin, "#ffffff", .2))
    elif style == "cap":
        rect(4, 2, 15, 4, acc); rect(5, 1, 14, 1, acc); rect(3, 5, 16, 5, shade(acc, .25)); put(9, 3, mix(acc, "#ffffff", .5)); put(10, 3, mix(acc, "#ffffff", .5))
        put(5, 6, hair); put(14, 6, hair)
    elif style == "beanie":
        rect(4, 1, 15, 5, acc); rect(5, 0, 14, 0, acc); rect(4, 5, 15, 5, shade(acc, .25))
        for x in range(5, 15, 2): put(x, 3, shade(acc, .15))
    elif style == "hood":
        rect(3, 2, 16, 4, shade(outfit, .15)); rect(4, 1, 15, 1, shade(outfit, .15))
        for y in range(5, 17): put(3, y, shade(outfit, .15)); put(4, y, shade(outfit, .15)); put(15, y, shade(outfit, .15)); put(16, y, shade(outfit, .15))
        rect(5, 4, 14, 4, shade(outfit, .45))
    # brows, eyes
    brow = shade(hair, .1) if style != "hood" else "#2a2a2a"
    rect(6, 7, 8, 7, brow); rect(11, 7, 13, 7, brow)
    eye = "#14110f"
    if blink:
        rect(7, 9, 8, 9, shade(skin, .35)); rect(11, 9, 12, 9, shade(skin, .35))
    else:
        rect(7, 8, 8, 9, "#ffffff"); put(8, 8, eye); put(8, 9, eye); rect(11, 8, 12, 9, "#ffffff"); put(11, 8, eye); put(11, 9, eye)
    if glasses == "round":
        fc = "#1c1c22"
        for x0 in (6, 11):
            rect(x0, 7, x0 + 3, 7, fc); rect(x0, 10, x0 + 3, 10, fc); put(x0, 8, fc); put(x0, 9, fc); put(x0 + 3, 8, fc); put(x0 + 3, 9, fc)
        put(9, 8, fc); put(10, 8, fc)
    # nose, mouth
    put(9, 11, skin_d); put(10, 11, skin_d); put(10, 12, shade(skin, .08))
    mouth = "#7a2f2a"
    rect(8, 13, 11, 13, mouth); put(7, 12, shade(skin, .12)); put(12, 12, shade(skin, .12))
    if not blink: put(9, 13, "#f4eee6"); put(10, 13, "#f4eee6")
    # beard
    if beard == "stubble":
        sc = mix(skin, hair, .30)  # a smooth jaw shadow reads better than dots at 20px
        for y in range(12, 16):
            for x in range(5, 15):
                if not (8 <= x <= 11 and y <= 13) and not (y == 12 and x in (5, 14)): put(x, y, sc)
        rect(6, 16, 13, 16, sc)
    elif beard == "full":
        rect(5, 12, 14, 15, hair); rect(6, 16, 13, 16, hair); rect(8, 13, 11, 13, mouth); put(9, 13, "#f4eee6"); put(10, 13, "#f4eee6"); rect(7, 11, 12, 11, hair) if False else None
        put(5, 11, hair); put(14, 11, hair); rect(6, 12, 13, 12, hair)
        rect(8, 12, 11, 12, hair)
    # gear
    if gear == "headphones":
        hc = acc
        rect(4, 6, 15, 6, hc) if False else None
        for x in range(5, 15): put(x, 2 if style not in ("cap", "beanie") else 0, hc)
        rect(3, 7, 4, 11, hc); rect(15, 7, 16, 11, hc); rect(3, 6, 3, 6, hc); put(4, 5, hc); put(15, 5, hc); put(4, 4, hc); put(15, 4, hc)
        for y in (8, 9, 10): put(3, y, shade(hc, .3)); put(16, y, shade(hc, .3))
    return g

def downsample(g):
    out = []
    for y in range(0, N, 2):
        row = []
        for x in range(0, N, 2):
            cells = [g[y][x], g[y][x + 1], g[y + 1][x], g[y + 1][x + 1]]
            real = [c for c in cells if c]
            if len(real) < 2: row.append(None); continue
            counts = {}
            for c in real: counts[c] = counts.get(c, 0) + 1
            row.append(sorted(counts, key=lambda c: (-counts[c], c))[0])
        out.append(row)
    return out

def png(g, path, scale=20):
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    for y in range(N):
        for x in range(N):
            if g[y][x]: im.putpixel((x, y), hx(g[y][x]) + (255,))
    im.resize((N * scale, N * scale), Image.NEAREST).save(path)

# --- build ------------------------------------------------------------------------------------------------------
def build(hid, c):
    s = {"accent": c.get("accent", "#9aa0aa"), **c["face"]}
    d = CHARS / hid; d.mkdir(parents=True, exist_ok=True)
    big, bigb = draw(s), draw(s, blink=True)
    (d / "face.json").write_text(json.dumps({"big": big, "bigBlink": bigb, "mini": downsample(big), "miniBlink": downsample(bigb)}))
    png(big, d / "portrait.png"); png(bigb, d / "portrait-blink.png")
    name = c.get("name", hid.capitalize())
    (d / "character.json").write_text(json.dumps({"name": name, "tagline": c.get("tagline", ""), "hello": c.get("hello", "Hello, {user}"),
        "accent": s["accent"], "accent2": c.get("accent2", mix(s["accent"], "#ffffff", .45)), "workingWord": c.get("workingWord", "working").lower(),
        "doneWord": c.get("doneWord", "done"), "quoteBy": name, "identity": c.get("identity", "")}, indent=2, ensure_ascii=False) + "\n")
    quotes = c.get("quotes") if isinstance(c.get("quotes"), list) else []
    (d / "quotes.json").write_text(json.dumps([q if isinstance(q, dict) else {"q": q, "src": name} for q in quotes], indent=1, ensure_ascii=False) + "\n")
    return d

if __name__ == "__main__":
    files = {f.stem: f for f in sorted(CHARS.glob("*.json")) if not f.stem.startswith("_")}
    want = sys.argv[1:] or list(files)
    for hid in want:
        if hid not in files: sys.exit(f"no characters/{hid}.json")
        c = json.loads(files[hid].read_text())
        if "face" not in c:
            if sys.argv[1:]: sys.exit(f"characters/{hid}.json has no \"face\" block")
            continue
        print(f"built {hid:12} {c.get('name', hid):10} -> {build(hid, c).relative_to(CHARS.parent)}")
