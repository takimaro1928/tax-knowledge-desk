#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/icons"

copy_file() {
  local src="$1"
  local dest="$2"
  if [[ ! -f "$src" ]]; then
    echo "missing file: $src" >&2
    exit 1
  fi
  cp "$src" "$dest"
}

copy_file "$ROOT_DIR/index.html" "$DIST_DIR/index.html"
copy_file "$ROOT_DIR/app.js" "$DIST_DIR/app.js"
copy_file "$ROOT_DIR/api.js" "$DIST_DIR/api.js"
copy_file "$ROOT_DIR/styles.css" "$DIST_DIR/styles.css"
copy_file "$ROOT_DIR/config.js" "$DIST_DIR/config.js"
copy_file "$ROOT_DIR/manifest.webmanifest" "$DIST_DIR/manifest.webmanifest"
copy_file "$ROOT_DIR/sw.js" "$DIST_DIR/sw.js"
copy_file "$ROOT_DIR/icons/icon-192.svg" "$DIST_DIR/icons/icon-192.svg"
copy_file "$ROOT_DIR/icons/icon-512.svg" "$DIST_DIR/icons/icon-512.svg"

if [[ -f "$ROOT_DIR/config.local.js" ]]; then
  copy_file "$ROOT_DIR/config.local.js" "$DIST_DIR/config.local.js"
fi

cat > "$DIST_DIR/_headers" <<'EOF'
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/sw.js
  Cache-Control: no-cache

/config.local.js
  Cache-Control: no-cache
EOF

echo "Prepared Netlify release in: $DIST_DIR"
