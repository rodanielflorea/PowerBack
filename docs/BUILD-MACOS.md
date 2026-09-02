# Building the macOS version (from a Windows PC)

Two facts drive everything below:

- A macOS **`.dmg`** can only be built **on macOS** (the dmg tooling and code
  signing are macOS-only). electron-builder refuses everywhere else.
- Windows itself cannot even assemble the mac `.app` bundle correctly (the
  bundle contains symlinks that Windows breaks). Linux can, so on Windows the
  local route goes through **WSL2 / Ubuntu**.

So from a Windows PC you have two working routes.

---

## Route 1 (recommended): real installers via GitHub Actions

Builds on a genuine macOS runner in the cloud. Produces `.dmg` + `.zip` for
both Intel and Apple Silicon Macs. This is the only way to get a `.dmg`
without owning a Mac.

### One-time setup

```powershell
winget install GitHub.cli
gh auth login        # GitHub.com → HTTPS → Login with a web browser
```

### Each release

```powershell
git checkout main
git pull
build-all.bat
```

`build-all.bat` pushes the branch, starts the CI build for Windows, Linux and
macOS, waits (about 5–10 minutes) and downloads every installer into
`dist\all-os\`. The macOS files to hand out:

| File | For |
|---|---|
| `RemoteDevJobAce-<version>-arm64.dmg` | Macs with Apple Silicon (M1 / M2 / M3 / M4) |
| `RemoteDevJobAce-<version>-x64.dmg` | Intel Macs |
| `RemoteDevJobAce-<version>-arm64.zip`, `-x64.zip` | same app as a plain archive |

Alternative that also creates a GitHub release with the files attached (this is
what the in-app auto-updater reads):

```powershell
git tag v2.2.0
git push origin --tags
```

The build can also be started by hand: GitHub → **Actions** → **Build
installers** → **Run workflow**. Artifacts appear at the bottom of the run page.

---

## Route 2: unsigned `.zip` built locally (WSL2 / Ubuntu)

Good for quick checks. Output is the `.app` inside a `.zip`, unsigned.

### One-time setup

```powershell
wsl --install -d Ubuntu     # reboot, then open "Ubuntu" from the Start menu
```

Inside the Ubuntu terminal:

```bash
sudo apt update && sudo apt install -y nodejs npm git
```

### Each build (inside the Ubuntu terminal)

```bash
cd "/mnt/e/AI BOT/support"   # your repo; Windows drives are under /mnt/<letter>
npm install
npm run build:mac-zip
```

Output: `dist/RemoteDevJobAce-<version>-x64.zip` and `-arm64.zip`.

---

## What Mac users must do after installing (either route)

The app is not code-signed, so macOS blocks the first launch once.

1. Move `RemoteDevJobAce.app` to **Applications**.
2. First launch: **right-click the app → Open → Open**. (Not double-click.)
   If macOS says the app is *damaged*, run in Terminal:
   `xattr -d com.apple.quarantine /Applications/RemoteDevJobAce.app`
3. Allow the permissions macOS asks for — **Microphone**, **Accessibility**
   (typing / pasting into other apps) and **Screen Recording** (OCR mode) —
   in System Settings → Privacy & Security.
4. To hear the interviewer, install a virtual audio device such as
   **BlackHole** and pick it in Settings → Audio sources. macOS gives apps no
   direct system-audio capture.

Known macOS limits: the Stealth shield works against most apps, but recent
Zoom / Teams versions capture with Apple's ScreenCaptureKit and may still see
the window — hide the window (Ctrl+Alt+H or the round A button) while sharing.

---

## Removing the "unsigned" warnings (optional, later)

Join the Apple Developer Program (USD 99 / year). With a **Developer ID
Application** certificate and an app-specific password, signing and
notarization can be added to the CI workflow (`.github/workflows/build.yml`)
as repository secrets. After that the `.dmg` installs with a normal
double-click and no warnings.
