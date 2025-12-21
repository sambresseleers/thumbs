#!/usr/bin/env bash
set -euo pipefail

INPUT_DIR="${INPUT_DIR:-/media}"
FORCE_OVERWRITE="${FORCE_OVERWRITE:-false}"

ROWS="${ROWS:-4}"
COLS="${COLS:-5}"
WIDTH="${WIDTH:-1920}"
QUALITY="${QUALITY:-2}"
FONT_SIZE="${FONT_SIZE:-18}"

EXTENSIONS="${EXTENSIONS:-mp4|mkv|avi|mov|ts}"

THUMBS=$((ROWS * COLS))

FONT="/usr/share/fonts/TTF/DejaVuSans.ttf"

echo "=== VIDEO THUMBNAILER ==="
echo "Input dir : $INPUT_DIR"
echo "Grid      : ${ROWS}x${COLS}"
echo "Width     : ${WIDTH}px"
echo "Quality   : ${QUALITY}"
echo "========================="

find "$INPUT_DIR" -type f -regextype posix-extended -iregex ".*\.($EXTENSIONS)$" | while read -r VIDEO; do
    DIR="$(dirname "$VIDEO")"
    BASE="$(basename "$VIDEO")"
    NAME="${BASE%.*}"
    OUT_FILE="$DIR/$NAME.jpg"

    if [[ -f "$OUT_FILE" ]] && [[ "$FORCE_OVERWRITE" != "true" ]]; then
    echo "[SKIP] $VIDEO (thumbnail exists)"
    continue
    fi

    if [[ -f "$OUT_FILE" ]] && [[ "$FORCE_OVERWRITE" == "true" ]]; then
        echo "[OVERWRITE] $OUT_FILE"
    fi

    echo "[PROCESS] $VIDEO"

    DURATION=$(ffprobe -v error \
        -select_streams v:0 \
        -show_entries format=duration \
        -of csv=p=0 "$VIDEO" || true)

    if [[ -z "$DURATION" ]]; then
        echo "[ERROR] Could not read duration"
        continue
    fi

    INTERVAL=$(echo "$DURATION / ($THUMBS + 1)" | bc -l)

    ffmpeg -hide_banner -loglevel error \
        -i "$VIDEO" \
        -vf "
        fps=1/${INTERVAL},
        scale=${WIDTH}/${COLS}:-1,
        drawtext=fontfile=${FONT}:
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
