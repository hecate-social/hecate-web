#!/bin/bash
# Clean restart of cargo tauri dev
# Kills orphaned processes + nukes ALL webview state
set -e

echo "Killing orphaned processes..."
pkill -f "vite.*1420" 2>/dev/null || true
pkill -f "hecate-web" 2>/dev/null || true
sleep 0.5

if ss -tlnp 2>/dev/null | grep -q ":1420 "; then
    echo "ERROR: port 1420 still in use"
    ss -tlnp | grep ":1420 "
    exit 1
fi

# Nuke ALL webview state (cache, localStorage, everything)
WEBVIEW_DIR="$HOME/.local/share/social.hecate.web"
if [ -d "$WEBVIEW_DIR" ]; then
    rm -rf "$WEBVIEW_DIR"
    echo "Nuked webview state: $WEBVIEW_DIR"
fi

echo "Starting cargo tauri dev..."
cd "$(dirname "$0")/.."
cargo tauri dev
