#!/bin/sh
# Картинка превью ссылки главной: tools/og.html → og.png (1200×630) через Chrome без окна.
# Нужен Google Chrome (CHROME – другой путь).
set -e
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=3000 --user-data-dir="$TMP" --screenshot="$PWD/og.png" "file://$PWD/tools/og.html" >/dev/null 2>&1
rm -rf "$TMP"
echo "og.png: $(sips -g pixelWidth -g pixelHeight og.png | awk '/pixel/ {printf "%s ", $2}')"
