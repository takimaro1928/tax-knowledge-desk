#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "Serving Knowledge App from: $ROOT_DIR"
echo "Open: http://localhost:4173"
python3 -m http.server 4173
