#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ZIP_PATH="$DIST_DIR/people-connections-connector.zip"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"

cd "$ROOT_DIR"
zip -qr "$ZIP_PATH" \
  package.json \
  README.md \
  .env.example \
  src \
  public \
  scripts

echo "Created $ZIP_PATH"
