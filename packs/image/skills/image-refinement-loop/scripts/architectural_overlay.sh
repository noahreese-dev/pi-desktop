#!/usr/bin/env bash
# architectural_overlay.sh: tint the reference's edges red and overlay them on a candidate image, as evidence for
# near-front architectural checks (image-refinement-loop skill). Needs ffmpeg.
set -euo pipefail

usage() {
  echo "Usage: $0 --reference REF --candidate CANDIDATE --out OUT [--opacity 0.45]" >&2
  echo "Crop both inputs to comparable building extents before using this helper." >&2
}

reference=""
candidate=""
out=""
opacity="0.45"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reference) reference="$2"; shift 2 ;;
    --candidate) candidate="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --opacity) opacity="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

[[ -n "$reference" && -n "$candidate" && -n "$out" ]] || { usage; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
[[ -f "$reference" ]] || { echo "Reference not found: $reference" >&2; exit 1; }
[[ -f "$candidate" ]] || { echo "Candidate not found: $candidate" >&2; exit 1; }

mkdir -p "$(dirname "$out")"

# Fit the reference to the candidate canvas, extract high-contrast edges, tint
# them red, and overlay them. This is evidence for near-front aligned crops; it
# deliberately does not infer perspective or correspondence.
ffmpeg -hide_banner -loglevel error -y \
  -i "$candidate" -i "$reference" \
  -filter_complex "[1:v][0:v]scale2ref[ref][cand];[ref]format=gray,edgedetect=low=0.08:high=0.25,negate,colorchannelmixer=rr=1:gg=0:bb=0:aa=${opacity}[edges];[cand][edges]overlay=format=auto,format=yuv420p[out]" \
  -map "[out]" -frames:v 1 -update 1 "$out"
