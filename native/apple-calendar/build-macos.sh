#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
app="build/Rollapp Calendar.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp Info.plist "$app/Contents/Info.plist"
swiftc -swift-version 5 -parse-as-library -O -target arm64-apple-macosx14.0 Sources/RollappCalendarApp.swift -o build/RollappCalendar-arm64
swiftc -swift-version 5 -parse-as-library -O -target x86_64-apple-macosx14.0 Sources/RollappCalendarApp.swift -o build/RollappCalendar-x86_64
lipo -create build/RollappCalendar-arm64 build/RollappCalendar-x86_64 -output "$app/Contents/MacOS/RollappCalendar"
codesign --force --sign - --identifier rf.rollapp.calendar-device "$app"
ditto -c -k --sequesterRsrc --keepParent "$app" build/RollappCalendar-macOS.zip
echo "Built: $PWD/$app"
