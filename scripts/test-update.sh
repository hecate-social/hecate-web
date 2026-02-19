#!/usr/bin/env bash
# Test the self-update mechanism by running the binary from an isolated
# directory (outside Cargo's build output, so rebuilds can't interfere).
#
# Usage:
#   1. Build first:  cargo tauri build
#   2. Run this:     ./scripts/test-update.sh
#   3. In the app, click the update badge → Update Now
#   4. App should restart as the new version
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_BINARY="${PROJECT_DIR}/src-tauri/target/release/hecate-web"
TEST_DIR="/tmp/hecate-web-update-test"

if [[ ! -f "$BUILD_BINARY" ]]; then
    echo "ERROR: No binary at ${BUILD_BINARY}"
    echo "Build first: cd ${PROJECT_DIR} && cargo tauri build"
    exit 1
fi

echo "=== Hecate-Web Update Test ==="
echo ""
echo "Setting up isolated test directory: ${TEST_DIR}"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

cp "$BUILD_BINARY" "${TEST_DIR}/hecate-web"
chmod +x "${TEST_DIR}/hecate-web"

BINARY_SIZE=$(stat -c%s "${TEST_DIR}/hecate-web" 2>/dev/null || stat -f%z "${TEST_DIR}/hecate-web")
echo "Binary copied: ${BINARY_SIZE} bytes"
echo ""
echo "Starting hecate-web from isolated directory..."
echo "  Path: ${TEST_DIR}/hecate-web"
echo ""
echo "Test steps:"
echo "  1. Wait for the update badge to appear in the title bar"
echo "  2. Click the badge → Update Now"
echo "  3. App will download, replace binary, and restart"
echo "  4. After restart, check the version in the title bar"
echo ""
echo "After restart, verify with:"
echo "  stat ${TEST_DIR}/hecate-web"
echo ""

exec "${TEST_DIR}/hecate-web"
