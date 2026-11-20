#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
output="$root/dist-macos"
identity="${ROLLAPP_MACOS_SIGNING_IDENTITY:--}"

if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Building Rollapp for macOS requires macOS and the Xcode Command Line Tools.' >&2
  exit 1
fi

mkdir -p "$output"
stage="$(mktemp -d "${TMPDIR:-/tmp}/rollapp-macos.XXXXXXXX")"
trap 'rm -rf "$stage"' EXIT
app="$stage/image/Rollapp.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" "$stage/AppIcon.iconset"
cp "$root/macos/Info.plist" "$app/Contents/Info.plist"

sdk="$(xcrun --show-sdk-path --sdk macosx)"
for architecture in arm64 x86_64; do
  xcrun --sdk macosx swiftc -sdk "$sdk" -target "$architecture-apple-macosx12.0" -O \
    "$root/macos/Navigation.swift" "$root/macos/Downloads.swift" "$root/macos/BrowserWindow.swift" "$root/macos/RollappApplication.swift" \
    -o "$stage/Rollapp-$architecture"
done
xcrun lipo -create "$stage/Rollapp-arm64" "$stage/Rollapp-x86_64" -output "$app/Contents/MacOS/Rollapp"

xcrun --sdk macosx swift "$root/macos/MakeIcon.swift" "$root/РОЛАПП_оранжевый.png" "$stage/AppIcon.png"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$stage/AppIcon.png" --out "$stage/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  retina=$((size * 2))
  sips -z "$retina" "$retina" "$stage/AppIcon.png" --out "$stage/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$stage/AppIcon.iconset" -o "$app/Contents/Resources/AppIcon.icns"

signing_options=(--force --sign "$identity")
if [[ "$identity" != - ]]; then signing_options+=(--options runtime --timestamp); fi
codesign "${signing_options[@]}" "$app"
codesign --verify --strict "$app"

ln -s /Applications "$stage/image/Applications"
hdiutil create -quiet -volname Rollapp -srcfolder "$stage/image" -format UDZO "$stage/Rollapp.dmg"
rm -rf "$output/Rollapp.app"
mv "$app" "$output/Rollapp.app"
mv -f "$stage/Rollapp.dmg" "$output/Rollapp.dmg"
printf '%s\n' "$output/Rollapp.app" "$output/Rollapp.dmg"
