#!/bin/zsh
# build.sh <portrait.png> <blink.png> <dest-dir>
# Makes the character assets both apps use, from your own portrait (+ a closed-eyes frame):
#   portrait.png / portrait-blink.png (512, head-and-shoulders crop) for Pi Desktop + icons
#   face.json (true-color grids: 48px header, 20px footer, open + blink) for the terminal extension
# Needs ffmpeg and python3.
set -euo pipefail
(( $# == 3 )) || { print -u2 "usage: faces/build.sh <portrait.png> <blink.png> <dest-dir>"; exit 2; }
src=$1 blink=$2 dest=$3
for f in "$src" "$blink"; do [[ -f $f ]] || { print -u2 "not found: $f"; exit 1; }; done
command -v ffmpeg >/dev/null || { print -u2 "needs ffmpeg: brew install ffmpeg"; exit 1; }
mkdir -p "$dest"
crop="crop=iw*0.72:iw*0.72:iw*0.135:ih*0.03"
ffmpeg -loglevel error -y -i "$src"   -vf "$crop,scale=512:512:flags=lanczos" "$dest/portrait.png"
ffmpeg -loglevel error -y -i "$blink" -vf "$crop,scale=512:512:flags=lanczos" "$dest/portrait-blink.png"
grid() { # $1 png, $2 size -> JSON rows of "#rrggbb" (dark backdrop kept: it blends into a dark terminal)
  ffmpeg -loglevel error -y -i "$1" -vf "scale=${2}:${2}:flags=lanczos,unsharp=3:3:0.6,eq=contrast=1.05:saturation=1.04" -f rawvideo -pix_fmt rgb24 - | python3 -I -c "
import sys,json
b=sys.stdin.buffer.read(); n=${2}
px=lambda x,y: b[(y*n+x)*3:(y*n+x)*3+3]
print(json.dumps([['#%02x%02x%02x'%tuple(px(x,y)) for x in range(n)] for y in range(n)]))"
}
p="$dest/portrait.png" q="$dest/portrait-blink.png"
print -r -- "{\"big\":$(grid "$p" 48),\"bigBlink\":$(grid "$q" 48),\"mini\":$(grid "$p" 20),\"miniBlink\":$(grid "$q" 20)}" > "$dest/face.json"
echo "built $dest/{portrait.png,portrait-blink.png,face.json}"
