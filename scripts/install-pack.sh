#!/usr/bin/env bash
# install-pack.sh <id>... | all [--bin DIR] [--force] [--uninstall]
# Installs characters from packs/ (see packs/README.md). For each id:
#   <harnessDir>/pi-<id>        the pack's harness script, pointed at this Pi Desktop folder
#   characters/<id>.json        the pack's character file
#   characters/<id>/            the face, drawn by faces/pixel_faces.py
# Existing files are kept unless --force. --uninstall removes only files that still match what the pack installs
# (any, with --force), plus the face drawn from a character file it removed. Restart Pi Desktop afterwards.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
usage() { echo "usage: install-pack.sh <id>... | all [--bin DIR] [--force] [--uninstall]" >&2; exit 1; }

valid=()
for d in "$repo"/packs/*/; do
  d=${d%/}; id=${d##*/}
  [[ -f $d/character.json && -f $d/pi-$id ]] && valid+=("$id")
done

ids=() bin="" force=0 uninstall=0
while (($#)); do
  case $1 in
    --bin) [[ $# -ge 2 ]] || usage; bin=$2; shift ;;
    --bin=*) bin=${1#--bin=} ;;
    --force) force=1 ;;
    --uninstall) uninstall=1 ;;
    -h|--help) usage ;;
    all) ids+=("${valid[@]}") ;;
    -*) echo "unknown option: $1" >&2; usage ;;
    *) ids+=("$1") ;;
  esac
  shift
done
((${#ids[@]})) || usage
for id in "${ids[@]}"; do
  [[ " ${valid[*]} " == *" $id "* ]] || { echo "unknown character '$id'. Valid: ${valid[*]} (or all)" >&2; exit 1; }
done
# The repo path is written into each harness script inside double quotes.
[[ $repo != *[\"\$\`\\]* ]] || { echo "can't install from a path containing \" \$ \` or \\: $repo" >&2; exit 1; }

if [[ -z $bin ]]; then
  bin=$(python3 -I -c 'import json,os,sys; c={}
try: c=json.load(open(sys.argv[1]))
except Exception: pass
print(os.path.expanduser(c.get("harnessDir") or "~/bin"))' "$repo/config.json")
fi
bin=${bin/#\~/$HOME}

# The pack's harness script with the Pi Desktop folder filled in.
render() { DESK="$repo" awk '{ while ((i = index($0, "__PI_DESKTOP_DIR__")) > 0) $0 = substr($0, 1, i - 1) ENVIRON["DESK"] substr($0, i + 18); print }' "$1"; }

faces_ok=""
can_draw() {
  if [[ -z $faces_ok ]]; then
    if python3 -I -c 'import PIL' 2>/dev/null; then faces_ok=1; else
      faces_ok=0
      echo "note   no Python 3 + Pillow, so no pixel faces (the app shows a letter avatar)." >&2
      echo "       Fix: pip3 install pillow, then: npm run faces" >&2
    fi
  fi
  [[ $faces_ok == 1 ]]
}

install_one() {
  local id=$1 pack="$repo/packs/$1" script="$bin/pi-$1" json="$repo/characters/$1.json"
  mkdir -p "$bin"
  if [[ -e $script && $force == 0 ]]; then
    if [[ $(render "$pack/pi-$id") == "$(cat "$script")" ]]; then echo "keep   $script (up to date)"; else echo "keep   $script (exists; --force to replace)"; fi
  else
    render "$pack/pi-$id" > "$script"; chmod +x "$script"; echo "wrote  $script"
  fi
  if [[ -e $json && $force == 0 ]]; then
    if cmp -s "$pack/character.json" "$json"; then echo "keep   $json (up to date)"; else echo "keep   $json (exists; --force to replace)"; fi
  else
    cp "$pack/character.json" "$json"; echo "wrote  $json"
  fi
  if can_draw; then
    python3 -I "$repo/faces/pixel_faces.py" "$id" || echo "note   could not draw the face for $id (see above); the app shows a letter avatar" >&2
  fi
}

uninstall_one() {
  local id=$1 pack="$repo/packs/$1" script="$bin/pi-$1" json="$repo/characters/$1.json" face="$repo/characters/$1" f
  if [[ ! -e $script ]]; then echo "skip   $script (not there)"
  elif [[ $force == 1 || $(render "$pack/pi-$id") == "$(cat "$script")" ]]; then rm -f "$script"; echo "removed $script"
  else echo "keep   $script (changed since install; --force to remove)"; fi
  if [[ ! -e $json ]]; then echo "skip   $json (not there)"
  elif [[ $force == 1 ]] || cmp -s "$pack/character.json" "$json"; then
    rm -f "$json"; echo "removed $json"
    # The face is drawn from the character file, so it goes with it (only the files pixel_faces.py writes).
    if [[ -d $face ]]; then
      for f in portrait.png portrait-blink.png face.json character.json quotes.json; do rm -f "$face/$f"; done
      rmdir "$face" 2>/dev/null && echo "removed $face/" || echo "keep   $face/ (has other files)"
    fi
  else echo "keep   $json (changed since install; --force to remove)"; fi
}

for id in "${ids[@]}"; do
  if ((uninstall)); then uninstall_one "$id"; else install_one "$id"; fi
done
if ((uninstall)); then
  echo "Done. Workspaces in ~/pi-studio are yours and were left alone. Restart Pi Desktop."
else
  echo "Done. Restart Pi Desktop. In a terminal: pi-<id> (with $bin on your PATH). See packs/README.md."
fi
