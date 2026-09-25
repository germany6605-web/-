#!/usr/bin/env bash
# Собирает архив игры dist/rudokop.zip для загрузки на хостинг VK / OK.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
zip -qr dist/rudokop.zip index.html style.css core.js products.js platform.js audio.js i18n.js scene.js app.js assets lib
echo "Готово: dist/rudokop.zip"
