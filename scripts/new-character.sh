#!/usr/bin/env bash
# new-character.sh <id> ["Name"] ["tagline"]
# Makes a new Pi Desktop character in one go:
#   <harnessDir>/pi-<id>        a harness script (starts Pi in ~/<id>, with the terminal face)
#   characters/<id>.json        name, accent, a random pixel face, greeting, finish line
#   characters/<id>/            the face, drawn by faces/pixel_faces.py
# Existing files are never overwritten. Restart Pi Desktop to see the character.
set -euo pipefail
id=${1:?usage: new-character.sh <id> [\"Name\"] [\"tagline\"]}
[[ $id =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "id must be lowercase letters, digits and dashes" >&2; exit 1; }
name=${2:-$(tr '[:lower:]' '[:upper:]' <<<"${id:0:1}")${id:1}}
tagline=${3:-}
repo=$(cd "$(dirname "$0")/.." && pwd)
command -v python3 >/dev/null || { echo "needs python3 (it ships with the Xcode command line tools: xcode-select --install)" >&2; exit 1; }
# Text going into a sed replacement: escape \ | & so a tagline like "Q&A | notes" survives.
sedq() { printf '%s' "$1" | sed -e 's/[\\|&]/\\&/g'; }
bin=$(python3 -I -c 'import json,os,sys; c={}
try: c=json.load(open(sys.argv[1]))
except Exception: pass
print(os.path.expanduser(c.get("harnessDir") or "~/bin"))' "$repo/config.json")
mkdir -p "$bin"

script="$bin/pi-$id"
if [[ -e $script ]]; then echo "keep   $script (exists)"; else
  sed -e "s/pi-base/pi-$id/g" -e "s/PI_HARNESS=base/PI_HARNESS=$id/" \
      -e "s|General assistant. Starts in your home folder.|$(sedq "${tagline:-$name}"). Starts in ~/$id.|" \
      -e "s|\\\${PI_DESKTOP_DIR:-\\\$HOME/pi-desktop}|\\\${PI_DESKTOP_DIR:-$(sedq "$repo")}|" \
      -e "s|\"\$HOME\"|\"\$HOME/$id\"|g" -e "s|in \$HOME so|in \$HOME/$id so|" \
      "$repo/examples/bin/pi-base" > "$script"
  chmod +x "$script"; echo "wrote  $script"
fi

json="$repo/characters/$id.json"
if [[ -e $json ]]; then echo "keep   $json (exists)"; else
  python3 -I - "$json" "$id" "$name" "$tagline" <<'PY'
import json, random, sys
path, hid, name, tagline = sys.argv[1:]
rnd = random.Random(hid)  # same id, same face
accent = "#%02x%02x%02x" % tuple(rnd.randint(90, 255) for _ in range(3))
face = {"skin": rnd.choice(["#f3d0b0", "#e6bb94", "#d7a27a", "#c68a62", "#9a6a48", "#6e4a33"]),
        "hair": rnd.choice(["#1a1a1a", "#3b2a20", "#5b4636", "#9a9aa0", "#d9a441", "#7a2f5a"]),
        "style": rnd.choice(["short", "buzz", "bald", "long", "cap", "beanie", "hood"]),
        "beard": rnd.choice(["none", "none", "stubble", "full"]), "glasses": rnd.choice(["none", "none", "round"]),
        "gear": rnd.choice(["none", "none", "headphones"])}
c = {"name": name, "tagline": tagline, "accent": accent, "face": face, "quotes": [],
     "greeting": "Hi {user}. What are we working on?", "workingWord": "Working",
     "finish": {"sound": "Tink", "voice": "Samantha", "say": f"{name} complete."}}
open(path, "w").write(json.dumps(c, indent=2, ensure_ascii=False) + "\n")
PY
  echo "wrote  $json"
fi
python3 -I "$repo/faces/pixel_faces.py" "$id"
echo "Done. Edit characters/$id.json (face, accent, greeting, suggestions), re-run 'npm run faces', restart Pi Desktop."
