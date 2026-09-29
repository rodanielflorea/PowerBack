# Install Ace on Mac (M1)

Use **`Ace-<version>-mac.zip`** only. Do not use the `-x64` or `-arm64` files.

This zip is a **universal** build (Intel + Apple Silicon). It runs natively on M1 / M2 / M3 / M4.

The app is not Apple-signed yet, so macOS Gatekeeper will block a normal double-click. Follow the steps below.

---

## 1. Download the zip

File: `Ace-<version>-mac.zip`

## 2. Unzip

Double-click the zip in **Downloads**. You should get a folder with:

- `Ace.app`
- `OPEN.command`
- `MAC-README.txt`

## 3. Put the app in Applications

Drag **Ace.app** into **Applications**.

## 4. Open it (unsigned build)

macOS will block a normal double-click. Do this instead:

1. Open the unzipped folder.
2. Double-click **OPEN.command**.
3. If macOS asks whether to allow Terminal / a script, click **Open**.

If `OPEN.command` is also blocked: right-click it → **Open** → **Open**.

## 5. If macOS says the app is damaged

Open **Terminal** and paste:

```bash
xattr -cr /Applications/Ace.app
```

Then: **Finder → Applications → Ace** → right-click → **Open** → **Open**.

## 6. First launch

A window titled **Activate this computer** should appear. That is the license screen, not a crash.

1. Copy the MAC address from that window.
2. Send it to the administrator and wait for a license key.
3. Paste the key and activate.

Closing that window quits the app.

## 7. Allow permissions when asked

- **Microphone**
- **Accessibility** (typing into other apps)
- **Screen Recording** (OCR)

**System Settings → Privacy & Security**.

---

## If it still will not open

| What you see | What to do |
|---|---|
| “App is damaged / can’t be opened” | Run the `xattr` command in step 5, then right-click → Open |
| “Developer cannot be verified” | Right-click `Ace.app` → **Open** → **Open** |
| `OPEN.command` does nothing | Right-click it → **Open**. Keep it in the **same folder** as `Ace.app` |
| No app in Applications | Drag `Ace.app` there (step 3) |
| App opens then disappears | The **Activate this computer** window was closed — open the app again and enter the license |

The app has no normal Dock/taskbar icon after activation. If it is running, look for the always-on-top window or the small round floating button.
