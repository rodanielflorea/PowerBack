# Ace for VS Code

## Install
1. In this folder: `npm run package` → produces `ace-vscode-0.1.0.vsix`.
2. In VS Code: Extensions → `…` → **Install from VSIX…** → pick the file.
3. Start Ace. The status bar shows **Ace** with a plug icon when connected; while Ace is not running it keeps retrying every 3 s.

## Settings (`Ace` in VS Code settings)
| Setting | Default | Meaning |
|---|---|---|
| `ace.host` / `ace.port` | `127.0.0.1` / `2010` | Where Ace listens (Ace → Settings → Code). |
| `ace.autoConnect` | on | Connect at startup. |
| `ace.showStatusBar` | on | Off hides the status bar item; the commands still work. |
| `ace.maxFileKB` | 200 | Bigger files are listed but their text is never sent. |
| `ace.exclude` | node_modules, .git, dist, … | Files never sent. |

Commands: **Ace: Connect**, **Ace: Disconnect**, **Ace: Send the project again**.
