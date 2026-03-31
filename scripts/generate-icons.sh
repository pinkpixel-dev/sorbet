#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/assets/icon.png"
PNG_DIR="$ROOT_DIR/assets/icons/png"
WINDOWS_ICON="$ROOT_DIR/assets/icons/icon.ico"
IMAGEMAGICK_CMD=()

if command -v magick >/dev/null 2>&1; then
  IMAGEMAGICK_CMD=(magick)
elif command -v convert >/dev/null 2>&1; then
  IMAGEMAGICK_CMD=(convert)
elif command -v convert-im6.q16 >/dev/null 2>&1; then
  IMAGEMAGICK_CMD=(convert-im6.q16)
else
  echo "ImageMagick is required to generate Electron icon assets. Install either the 'magick' or 'convert' CLI." >&2
  exit 1
fi

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Source icon not found: $SOURCE_ICON" >&2
  exit 1
fi

mkdir -p "$PNG_DIR"

for size in 16 24 32 48 64 96 128 256 512 1024; do
  "${IMAGEMAGICK_CMD[@]}" "$SOURCE_ICON" \
    -background none \
    -resize "${size}x${size}" \
    "$PNG_DIR/${size}x${size}.png"
done

"${IMAGEMAGICK_CMD[@]}" \
  "$PNG_DIR/16x16.png" \
  "$PNG_DIR/24x24.png" \
  "$PNG_DIR/32x32.png" \
  "$PNG_DIR/48x48.png" \
  "$PNG_DIR/64x64.png" \
  "$PNG_DIR/128x128.png" \
  "$PNG_DIR/256x256.png" \
  "$WINDOWS_ICON"

echo "Generated Electron icon assets in $PNG_DIR and $WINDOWS_ICON using ${IMAGEMAGICK_CMD[0]}"
