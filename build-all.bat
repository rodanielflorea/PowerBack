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

if exist dist\all-os rmdir /s /q dist\all-os
mkdir dist\all-os
REM The build uploads the installers to a (draft) GitHub release named v<version>.
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VERSION=%%v
gh release download v%VERSION% --dir dist\all-os --clobber
if errorlevel 1 (
  echo No release found; trying the run's artifacts...
  gh run download %RUN_ID% --dir dist\all-os
  goto done
)
REM Verify every downloaded file is complete (size must match the release asset).
node -e "const {execSync}=require('child_process');const fs=require('fs');const a=JSON.parse(execSync('gh release view v%VERSION% --json assets',{encoding:'utf8'})).assets;let bad=0;for(const x of a){const p='dist/all-os/'+x.name;if(!fs.existsSync(p))continue;const s=fs.statSync(p).size;if(s!==x.size){console.log('!! '+x.name+' is incomplete ('+s+' of '+x.size+' bytes)');bad=1;}}if(bad){process.exit(1)}console.log('All installers verified against release v%VERSION%');"
if errorlevel 1 (
  echo Some files were incomplete — downloading again...
  gh release download v%VERSION% --dir dist\all-os --clobber
)
:done
echo Installers for all OSes are in dist\all-os\
dir /s /b dist\all-os
