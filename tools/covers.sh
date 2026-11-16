#!/bin/bash
# Мини-обложки для списка на главной: covers/<app>/<язык>.jpg (600×315 из обложек 1200×630).
#   bash tools/covers.sh
# Обложки – те же, что показывает Telegram у ссылки на приложение (og:image). Свои у Beatcut, Mixtake
# и Lab берутся из соседних проектов (английскую Lab снимает его tools/og.sh); Screwify (шесть языков) рисуется из tools/cover.html, Polar – из tools/cover-polar.html.
# Поменял набор языков – поправь COVERS в index.html.
set -u
cd "$(dirname "$0")/.."
SITE="$PWD"
PROJECTS="$(cd "$SITE/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

put() { # put <исходник 1200×630> <файл.jpg>
  mkdir -p "$(dirname "$2")"
  sips -Z 600 -s format jpeg -s formatOptions 85 "$1" --out "$2" >/dev/null && echo "ok   $2" || echo "FAIL $2"
}
draw() { # draw <app> <язык> [<страница обложки>]
  local png="$TMP/c.png"; rm -f "$png"
  node tools/shot.mjs "file://$SITE/tools/${3:-cover.html}?app=$1&lang=$2" "$png" --lang=$2 --wait=300 --size=1200x630 && put "$png" "covers/$1/$2.jpg"
}

for lang in en ru zh es ar fr; do draw screwify $lang; done
draw polar en cover-polar.html
put "$PROJECTS/screwed-music/apps/beatcut/src/og.png" covers/beatcut/ru.jpg
put "$PROJECTS/audioverify/assets/og-image.png" covers/mixtake/ru.jpg
put "$PROJECTS/audio-trainers/static/og.png" covers/lab/ru.jpg
sh "$PROJECTS/audio-trainers/tools/og.sh" en "$TMP/lab-en.png" >/dev/null && put "$TMP/lab-en.png" covers/lab/en.jpg
