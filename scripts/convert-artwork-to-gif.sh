#!/usr/bin/env bash
set -euo pipefail

ARTWORK_DIR="$(cd "$(dirname "$0")/../static/artwork" && pwd)"
OUT_DIR="${ARTWORK_DIR}"
WIDTH="${1:-320}"
FPS="${2:-12}"

echo "Converting MP4 artwork to GIF (${WIDTH}px wide, ${FPS}fps)..."
echo "Source: ${ARTWORK_DIR}"

for mp4 in "${ARTWORK_DIR}"/*.mp4; do
    name="$(basename "${mp4}" .mp4)"
    gif="${OUT_DIR}/${name}.gif"

    if [ -f "${gif}" ]; then
        echo "  SKIP  ${name}.gif (already exists)"
        continue
    fi

    echo "  CONV  ${name}.mp4 → ${name}.gif"
    ffmpeg -loglevel warning -i "${mp4}" \
        -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
        -loop 0 \
        "${gif}"
done

echo ""
echo "Done. GIFs written to ${OUT_DIR}/"
ls -lhS "${OUT_DIR}"/*.gif 2>/dev/null || echo "No GIFs found."
