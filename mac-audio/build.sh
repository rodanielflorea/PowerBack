#!/usr/bin/env bash
# Builds the macOS helpers as universal (x86_64 + arm64) binaries.
# Needs Xcode command-line tools (swiftc). Output: mac-audio/build/system-audio
# (call audio) and mac-audio/build/remote-input (the supporter's remote control).
# electron-builder packages it into Contents/Resources/mac-audio/ (see
# package.json → build.mac.extraResources).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
if ! command -v swiftc >/dev/null 2>&1; then
  echo "swiftc not found — the system-audio helper can only be built on macOS with Xcode tools." >&2
  exit 1
fi
swiftc -O -target arm64-apple-macos13.0  -framework ScreenCaptureKit -framework AVFoundation -framework CoreMedia SystemAudioCapture.swift -o build/system-audio-arm64
swiftc -O -target x86_64-apple-macos13.0 -framework ScreenCaptureKit -framework AVFoundation -framework CoreMedia SystemAudioCapture.swift -o build/system-audio-x86_64
lipo -create build/system-audio-arm64 build/system-audio-x86_64 -output build/system-audio
rm -f build/system-audio-arm64 build/system-audio-x86_64
chmod +x build/system-audio
codesign --force --sign - build/system-audio
echo "built mac-audio/build/system-audio ($(lipo -archs build/system-audio))"

swiftc -O -target arm64-apple-macos11.0   -framework CoreGraphics -framework ApplicationServices RemoteInput.swift -o build/remote-input-arm64
swiftc -O -target x86_64-apple-macos10.15 -framework CoreGraphics -framework ApplicationServices RemoteInput.swift -o build/remote-input-x86_64
lipo -create build/remote-input-arm64 build/remote-input-x86_64 -output build/remote-input
rm -f build/remote-input-arm64 build/remote-input-x86_64
chmod +x build/remote-input
codesign --force --sign - build/remote-input
echo "built mac-audio/build/remote-input ($(lipo -archs build/remote-input))"
