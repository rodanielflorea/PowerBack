#!/bin/bash
# Clears Gatekeeper quarantine on the unsigned app and launches it.
# Keep this file next to Ace.app (same folder after unzip).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DIR/Ace.app"

if [ ! -d "$APP" ]; then
  osascript -e 'display dialog "Ace.app was not found next to OPEN.command.\n\nUnzip the archive first, then double-click OPEN.command in that folder." buttons {"OK"} default button 1 with title "Ace"'
  exit 1
fi

xattr -cr "$APP" 2>/dev/null || true
open "$APP"
