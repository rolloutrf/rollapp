#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
mkdir -p build
swiftc -swift-version 5 -parse-as-library -D CALENDAR_BRIDGE_TEST -target "$(uname -m)-apple-macosx14.0" Sources/RollappCalendarApp.swift Tests/BridgeTests.swift -o build/BridgeTests
build/BridgeTests
if rg -n 'store\.(save|remove)\(' Sources; then
  echo "Unexpected Calendar mutation API"
  exit 1
fi
