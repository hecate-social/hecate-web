#!/usr/bin/env bash
set -euo pipefail

# Launch the already-compiled hecate-web binary (no rebuild)
# Uses the release build if available, falls back to debug
#
# Usage: ./scripts/hw.sh [--debug]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_BIN="$ROOT_DIR/src-tauri/target/release/hecate-web"
DEBUG_BIN="$ROOT_DIR/src-tauri/target/debug/hecate-web"

if [[ "${1:-}" == "--debug" ]]; then
    BIN="$DEBUG_BIN"
elif [[ -x "$RELEASE_BIN" ]]; then
    BIN="$RELEASE_BIN"
elif [[ -x "$DEBUG_BIN" ]]; then
    BIN="$DEBUG_BIN"
else
    echo "No compiled hecate-web binary found."
    echo "Run 'cargo tauri build' or './scripts/dev.sh' first."
    exit 1
fi

echo "Launching $(basename "$BIN") from: $BIN"
exec "$BIN"
