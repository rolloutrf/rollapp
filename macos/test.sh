#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
stage="$(mktemp -d "${TMPDIR:-/tmp}/rollapp-macos-test.XXXXXXXX")"
trap 'rm -rf "$stage"' EXIT
source_dir="$root/macos"

xcrun --sdk macosx swiftc -target "$(uname -m)-apple-macosx12.0" \
  "$source_dir/Navigation.swift" "$source_dir/Downloads.swift" "$source_dir/BrowserWindow.swift" \
  "$source_dir/tests/Smoke.swift" -o "$stage/rollapp-smoke"
"$stage/rollapp-smoke"
