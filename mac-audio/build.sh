#!/usr/bin/env bash
# Builds the macOS system-audio helper as a universal (x86_64 + arm64) binary.
# Needs Xcode command-line tools (swiftc). Output: mac-audio/build/system-audio
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
