# Ace for VS Code

Keeps the Ace desktop app in step with the project open in VS Code, so Ace can explain the project and what you are changing. Nothing is generated on its own: Ace answers when you press Send there.

## What it sends to Ace
- The list of files in the workspace (not their contents), excluding `node_modules`, `.git`, build output and the like.
- The file you are editing, with the text around the cursor and the selection.
- Every edit as it happens (batched every 0.3 s), and the full text of a file when you save it (files up to 200 KB).
- Errors and warnings VS Code reports for a file.
- The git branch, changed files and the diff of uncommitted changes, after each save.
- The text of another file only when Ace asks for it (for a question that needs it).

Everything goes over a local socket to Ace on this computer (`127.0.0.1:2010` by default) as one JSON object per line. Nothing goes anywhere else from the extension.

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
