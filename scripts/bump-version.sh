#!/usr/bin/env bash
set -euo pipefail

# Bump version across all three manifest files:
#   package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ $# -ne 1 ]; then
    echo "Usage: $0 <new-version>"
    echo "Example: $0 0.2.0"
    exit 1
fi

NEW_VERSION="$1"

# Validate semver format (basic check)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in semver format (e.g. 0.2.0)"
    exit 1
fi

PACKAGE_JSON="$ROOT_DIR/package.json"
TAURI_CONF="$ROOT_DIR/src-tauri/tauri.conf.json"
CARGO_TOML="$ROOT_DIR/src-tauri/Cargo.toml"

for f in "$PACKAGE_JSON" "$TAURI_CONF" "$CARGO_TOML"; do
    if [ ! -f "$f" ]; then
        echo "Error: $f not found"
        exit 1
    fi
done

# Read current versions
PKG_VERSION=$(grep -oP '"version":\s*"\K[^"]+' "$PACKAGE_JSON" | head -1)
TAURI_VERSION=$(grep -oP '"version":\s*"\K[^"]+' "$TAURI_CONF" | head -1)
CARGO_VERSION=$(grep -oP '^version\s*=\s*"\K[^"]+' "$CARGO_TOML")

echo "Current versions:"
echo "  package.json:     $PKG_VERSION"
echo "  tauri.conf.json:  $TAURI_VERSION"
echo "  Cargo.toml:       $CARGO_VERSION"
echo ""
echo "Bumping to: $NEW_VERSION"

# Update package.json — match the top-level "version" field
sed -i "s/\"version\": \"$PKG_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"

# Update tauri.conf.json — match the top-level "version" field
sed -i "s/\"version\": \"$TAURI_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$TAURI_CONF"

# Update Cargo.toml — match the version line in [package]
sed -i "s/^version = \"$CARGO_VERSION\"/version = \"$NEW_VERSION\"/" "$CARGO_TOML"

echo ""
echo "Updated:"
echo "  package.json:     $(grep -oP '"version":\s*"\K[^"]+' "$PACKAGE_JSON" | head -1)"
echo "  tauri.conf.json:  $(grep -oP '"version":\s*"\K[^"]+' "$TAURI_CONF" | head -1)"
echo "  Cargo.toml:       $(grep -oP '^version\s*=\s*"\K[^"]+' "$CARGO_TOML")"
