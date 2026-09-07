#!/usr/bin/env bash
# Build install packages for Windows, Linux and macOS.
#
# A single machine can only build its own OS natively (macOS packages need
# Apple tooling, Windows-from-Linux needs wine), so the default mode runs the
# GitHub Actions workflow (.github/workflows/build.yml), which builds all
# three OSes in parallel on native runners, then downloads every installer
# into dist/all-os/. Requires the GitHub CLI: sudo apt install gh && gh auth login
#
#   ./build-all.sh            # all 3 OSes via GitHub Actions -> dist/all-os/
#   ./build-all.sh --local    # only what THIS machine can build -> dist/
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "--local" ]; then
  npm run icon
  case "$(uname -s)" in
    Linux)
      npx electron-builder --linux --publish never
      if command -v wine >/dev/null 2>&1; then
        npx electron-builder --win --publish never
      else
        echo ">> wine is not installed — skipped the Windows build (sudo apt install wine)."
      fi
      echo ">> macOS packages cannot be built on Linux; run without --local to build them on CI."
      ;;
    Darwin)
      npx electron-builder --mac --linux --publish never
      echo ">> Windows build skipped (needs wine); run without --local to build it on CI."
      ;;
    *) echo "Unsupported host: $(uname -s)"; exit 1 ;;
  esac
  echo ">> Done. Artifacts in dist/"
  exit 0
fi

command -v gh >/dev/null 2>&1 || {
  echo "GitHub CLI (gh) is required for the all-OS build: sudo apt install gh && gh auth login"
  echo "Or build only this machine's packages with: $0 --local"
  exit 1
}

BRANCH=$(git rev-parse --abbrev-ref HEAD)
git diff --quiet && git diff --cached --quiet || echo ">> WARNING: uncommitted changes will NOT be in the CI build."
git push -q origin "$BRANCH"

echo ">> Dispatching CI build for branch '$BRANCH'..."
if ! gh workflow run build.yml --ref "$BRANCH" 2>/dev/null; then
  echo "Could not dispatch the workflow. GitHub only allows dispatching once"
  echo ".github/workflows/build.yml exists on the default branch (main) —"
  echo "merge it first, or push a version tag instead:  git tag v$(node -p "require('./package.json').version") && git push origin --tags"
  exit 1
fi

sleep 6
RUN_ID=$(gh run list --workflow=build.yml --branch "$BRANCH" --limit 1 --json databaseId -q '.[0].databaseId')
echo ">> Waiting for run $RUN_ID (Windows + Linux + macOS build in parallel, ~5-10 min)..."
# Poll until the whole run is finished (every job, including the release
# uploads) — never download while the installers are still being uploaded.
while :; do
  STATUS=$(gh run view "$RUN_ID" --json status -q .status)
  [ "$STATUS" = "completed" ] && break
  sleep 30
done
CONCLUSION=$(gh run view "$RUN_ID" --json conclusion -q .conclusion)
[ "$CONCLUSION" = "success" ] || { echo "CI build $CONCLUSION — see: gh run view $RUN_ID --log-failed"; exit 1; }

rm -rf dist/all-os && mkdir -p dist/all-os
# The build uploads the installers to a (draft) GitHub release named v<version>.
VERSION=$(node -p "require('./package.json').version")
download_release() {
  gh release download "v$VERSION" --dir dist/all-os --clobber 2>/dev/null || return 1
  # Verify every file is complete: sizes must match the release assets.
  local bad=0
  while IFS=$'\t' read -r name size; do
    [ -f "dist/all-os/$name" ] || continue
    local have; have=$(wc -c < "dist/all-os/$name")
    if [ "$have" != "$size" ]; then echo "!! $name is incomplete ($have of $size bytes)"; bad=1; fi
  done < <(gh release view "v$VERSION" --json assets -q '.assets[] | "\(.name)\t\(.size)"')
  return $bad
}
if download_release || { echo ">> Retrying download…"; sleep 20; download_release; }; then
  echo ">> Downloaded and verified from release v$VERSION"
else
  echo "!! Download from release v$VERSION failed or files incomplete; trying the run's artifacts…"
  gh run download "$RUN_ID" --dir dist/all-os || echo "!! No installers could be downloaded — see the run page: $(gh run view "$RUN_ID" --json url -q .url)"
fi
echo ">> Installers for all OSes:"
find dist/all-os -type f | sed 's/^/   /'
