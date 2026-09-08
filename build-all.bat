@echo off
REM Build install packages for Windows, Linux and macOS.
REM Default: runs the GitHub Actions workflow (all 3 OSes on native runners)
REM and downloads every installer into dist\all-os\. Needs the GitHub CLI
REM (winget install GitHub.cli, then: gh auth login).
REM   build-all.bat          -> all 3 OSes via GitHub Actions
REM   build-all.bat --local  -> only the Windows portable exe + NSIS installer
setlocal
cd /d "%~dp0"

if "%~1"=="--local" (
  call npm run icon || exit /b 1
  call npx electron-builder --win --publish never || exit /b 1
  echo Done. Windows artifacts are in dist\. Linux/macOS need CI: run without --local.
  exit /b 0
)

where gh >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI required for the all-OS build: winget install GitHub.cli ^&^& gh auth login
  echo Or build only the Windows packages with: build-all.bat --local
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
git push -q origin %BRANCH%

echo Dispatching CI build for branch %BRANCH%...
gh workflow run build.yml --ref %BRANCH%
if errorlevel 1 (
  echo Could not dispatch. The workflow must exist on the default branch ^(main^) first,
  echo or push a version tag instead: git tag vX.Y.Z ^&^& git push origin --tags
  exit /b 1
)

timeout /t 6 /nobreak >nul
for /f "delims=" %%i in ('gh run list --workflow=build.yml --branch %BRANCH% --limit 1 --json databaseId -q ".[0].databaseId"') do set RUN_ID=%%i
echo Waiting for run %RUN_ID% (Windows + Linux + macOS in parallel, ~5-10 min)...
REM Poll until the whole run is finished (all jobs, including the release
REM uploads) — never download while the installers are still being uploaded.
:waitloop
for /f "delims=" %%s in ('gh run view %RUN_ID% --json status -q .status') do set STATUS=%%s
if not "%STATUS%"=="completed" (
  timeout /t 30 /nobreak >nul
  goto waitloop
)
for /f "delims=" %%c in ('gh run view %RUN_ID% --json conclusion -q .conclusion') do set CONCLUSION=%%c
if not "%CONCLUSION%"=="success" (
  echo CI build %CONCLUSION% — see: gh run view %RUN_ID% --log-failed
  exit /b 1
)

if not exist dist\all-os mkdir dist\all-os
REM Resumable, verified download of the release assets (survives network drops).
node scripts\download-release.js
if errorlevel 1 (
  echo Some installers could not be completed - run:  node scripts\download-release.js   to resume.
  exit /b 1
)
echo Installers for all OSes are in dist\all-os\
dir /s /b dist\all-os
