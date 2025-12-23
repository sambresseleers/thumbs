#!/usr/bin/env bash
set -e

# =============================
# VIDEO THUMBNAIL GENERATOR
# =============================

INPUT_DIR="${INPUT_DIR:-/input}"

ROWS="${ROWS:-4}"
COLS="${COLS:-5}"
WIDTH="${WIDTH:-1920}"
QUALITY="${QUALITY:-2}"   # 2 = high quality, 31 = worst
FONT_SIZE="${FONT_SIZE:-18}"
EXTENSIONS="${EXTENSIONS:-mp4|mkv|avi|mov|ts}"
FORCE_OVERWRITE="${FORCE_OVERWRITE:-false}"

THUMBS=$((ROWS * COLS))

echo "=== VIDEO THUMBNAILER ==="
echo "Input dir : $INPUT_DIR"
echo "Grid      : ${ROWS}x${COLS} (${THUMBS} frames)"
echo "Width     : ${WIDTH}px"
echo "Quality   : ${QUALITY}"
echo "Force overwrite: $FORCE_OVERWRITE"
echo "========================="

# Find all videos recursively
find "$INPUT_DIR" -type f -regextype posix-extended -iregex ".*\.($EXTENSIONS)$" | while read -r VIDEO; do
    DIR="$(dirname "$VIDEO")"
    BASE="$(basename "$VIDEO")"
    NAME="${BASE%.*}"
    OUT_FILE="$DIR/$NAME.jpg"

    # Skip if file exists
    if [[ -f "$OUT_FILE" && "$FORCE_OVERWRITE" != "true" ]]; then
        echo "[SKIP] $VIDEO (thumbnail exists)"
        continue
    fi

    if [[ -f "$OUT_FILE" && "$FORCE_OVERWRITE" == "true" ]]; then
        echo "[OVERWRITE] $OUT_FILE"
    fi

    echo "[PROCESS] $VIDEO"

    # Get video duration
    DURATION=$(ffprobe -v error \
        -select_streams v:0 \
        -show_entries format=duration \
        -of csv=p=0 "$VIDEO")

    if [[ -z "$DURATION" ]]; then
        echo "[ERROR] Unable to read duration"
        continue
    fi

    INTERVAL=$(echo "$DURATION / ($THUMBS + 1)" | bc -l)

    echo "  Duration: ${DURATION}s"
    echo "  Interval: ${INTERVAL}s"

    # Generate thumbnail sheet
    ffmpeg -hide_banner -loglevel error \
        -y \   # automatically overwrite
        -i "$VIDEO" \
        -vf "
        fps=1/${INTERVAL},
        scale=${WIDTH}/${COLS}:-1,
        drawtext=fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf:
                 text='%{pts\\:hms}':
                 x=10:y=10:
                 fontsize=${FONT_SIZE}:
                 fontcolor=white:
                 box=1:
                 boxcolor=black@0.6,
        tile=${COLS}x${ROWS}:padding=10:margin=10
        " \
        -frames:v 1 \
        -q:v "$QUALITY" \
        "$OUT_FILE"

    echo "[DONE] $OUT_FILE"
done

echo "=== FINISHED ==="