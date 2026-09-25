#!/usr/bin/env bash
# Package the unpacked MV3 extension for Load unpacked / GitHub release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(python3 -c "import json; print(json.load(open('${ROOT}/manifest.json'))['version'])")"
DIST="${ROOT}/dist"
NAME="lot-linker-fill-${VER}"
OUT="${DIST}/${NAME}.zip"
mkdir -p "${DIST}"
rm -f "${OUT}"
# Also keep a stable name for README / release notes.
STABLE="${DIST}/lot-linker-fill.zip"
rm -f "${STABLE}"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
DEST="${TMP}/lot-linker-fill"
mkdir -p "${DEST}/icons"

cp "${ROOT}/manifest.json" "${DEST}/"
cp "${ROOT}/popup.html" "${DEST}/"
cp "${ROOT}/popup.js" "${DEST}/"
cp "${ROOT}/content-fb.js" "${DEST}/"
cp "${ROOT}/listing-copy.js" "${DEST}/"
cp "${ROOT}/posted.js" "${DEST}/"
cp "${ROOT}/photos.js" "${DEST}/"
cp "${ROOT}/background.js" "${DEST}/"
cp "${ROOT}/config.js" "${DEST}/"
cp "${ROOT}/packs.json" "${DEST}/"
cp "${ROOT}/README.md" "${DEST}/"
cp "${ROOT}/icons/"*.png "${DEST}/icons/"

(
  cd "${TMP}"
  zip -qr "${OUT}" lot-linker-fill
)
cp "${OUT}" "${STABLE}"
echo "wrote ${OUT}"
echo "wrote ${STABLE}"
