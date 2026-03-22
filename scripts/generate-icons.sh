#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/assets/icon.png"
PNG_DIR="$ROOT_DIR/assets/icons/png"
WINDOWS_ICON="$ROOT_DIR/assets/icons/icon.ico"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required to generate Electron icon assets." >&2
  exit 1
fi

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Source icon not found: $SOURCE_ICON" >&2
  exit 1
fi

mkdir -p "$PNG_DIR"

for size in 16 24 32 48 64 96 128 256 512 1024; do
  magick "$SOURCE_ICON" \
    -background none \
    -resize "${size}x${size}" \
    "$PNG_DIR/${size}x${size}.png"
done

magick \
  "$PNG_DIR/16x16.png" \
  "$PNG_DIR/24x24.png" \
  "$PNG_DIR/32x32.png" \
  "$PNG_DIR/48x48.png" \
  "$PNG_DIR/64x64.png" \
  "$PNG_DIR/128x128.png" \
  "$PNG_DIR/256x256.png" \
  "$WINDOWS_ICON"

echo "Generated Electron icon assets in $PNG_DIR and $WINDOWS_ICON"
