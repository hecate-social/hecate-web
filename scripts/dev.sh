#!/bin/bash
# Clean restart of cargo tauri dev
# Kills orphaned processes + nukes ALL webview state
#
# Prerequisites: npm install (if node_modules missing)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Killing orphaned processes..."
pkill -f "hecate-web" 2>/dev/null || true
sleep 0.5

# Ensure npm deps are installed
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "Installing npm dependencies..."
    (cd "$PROJECT_DIR" && npm install)
fi

# Start Vite dev server if not running
if ! ss -tlnp 2>/dev/null | grep -q ":1420 "; then
    echo "Starting Vite dev server..."
    (cd "$PROJECT_DIR" && npm run dev) &
    echo -n "Waiting for Vite on :1420"
    for i in $(seq 1 30); do
        if ss -tlnp 2>/dev/null | grep -q ":1420 "; then
            echo " ready!"
            break
        fi
        echo -n "."
        sleep 1
    done
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
