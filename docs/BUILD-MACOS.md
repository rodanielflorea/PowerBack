# Building the macOS version (from a Windows PC)

Gatekeeper rejects an **unsigned x86_64** app with the quarantine flag. The
fix is a **universal** (Intel + Apple Silicon) `.app` that is **code-signed**
and **notarized**, so the user path is:

**Download → Move to Applications → Open**

---

## What we ship

CI (`.github/workflows/build.yml`) builds on a real Mac runner:

| File | What it is |
|---|---|
| `RemoteDevJobAce-<version>-mac.dmg` | Universal disk image (drag the app to Applications) |
| `RemoteDevJobAce-<version>-mac.zip` | Same app as a zip (auto-update + unsigned fallback) |

One DMG runs natively on Intel **and** M1 / M2 / M3 / M4. Do not send the old
`-x64.dmg` / `-arm64.dmg` pair.

---

## Route 1: GitHub Actions (`build-all.bat`)

```powershell
git checkout main
git pull
build-all.bat
```

Installers land in `dist\all-os\`. Give Mac users the **`-mac.dmg`**.

### Signing and notarization (required for double-click Open)

Join the [Apple Developer Program](https://developer.apple.com/programs/)
(USD 99 / year). Create a **Developer ID Application** certificate (not Mac
App Store). Then add these GitHub Actions secrets
(`Settings → Secrets and variables → Actions`):

| Secret | Value |
|---|---|
| `MAC_CSC_LINK` | Base64 of the exported `.p12` (`certutil -encode cert.p12 -` on Windows, or `base64 -i cert.p12` on macOS) |
| `MAC_CSC_KEY_PASSWORD` | Password of that `.p12` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from [appleid.apple.com](https://appleid.apple.com) |
| `APPLE_TEAM_ID` | 10-character Team ID |

Or, instead of Apple ID + app password, an App Store Connect API key:

| Secret | Value |
|---|---|
| `APPLE_API_KEY` | Base64 of the `.p8` key |
| `APPLE_API_KEY_ID` | Key ID |
| `APPLE_API_ISSUER` | Issuer ID |
| `APPLE_TEAM_ID` | Team ID |

Rebuild after the secrets are in place. Without them CI still produces a
universal app, but macOS will quarantine it and show “damaged” / “cannot
verify the developer.”

### Tag a release (also feeds the in-app updater)

```powershell
git tag v2.2.0
git push origin --tags
```

---

## Route 2: unsigned `.zip` from WSL2 / Ubuntu (dev only)

```bash
cd "/mnt/e/AI BOT/support"
npm install
npm run build:mac-zip
```

Output: `dist/RemoteDevJobAce-<version>-mac.zip`. Not signed, not notarized.

---

## What Mac users do

**Signed + notarized build:**

1. Download `RemoteDevJobAce-*-mac.dmg`.
2. Open it, drag **RemoteDevJobAce** onto **Applications**.
3. Open it from Applications.

**Unsigned / not notarized build** (until the secrets above are set):

1. Prefer the `.zip`. Unzip and double-click **OPEN.command**.
2. Or after dragging to Applications:
   `xattr -cr /Applications/RemoteDevJobAce.app`
   then right-click the app → **Open**.

First launch is the license window (**Activate this computer**). Closing it
quits the app.

Allow **Microphone**, **Accessibility**, and **Screen Recording** when macOS
asks. System audio needs a virtual device such as **BlackHole**.

Known limit: recent Zoom / Teams using ScreenCaptureKit may still see the
window — hide it (Ctrl+Alt+H) while sharing.
