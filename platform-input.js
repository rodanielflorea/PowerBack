// Cross-platform keyboard injection into the foreground application.
//
// Windows drives a persistent PowerShell + WScript.Shell SendKeys session.
// macOS drives a persistent `osascript -i` session using System Events
// (requires the Accessibility permission; the first keystroke triggers the
// OS prompt).
// Linux spawns one injector command per key: xdotool on X11, ydotool or
// wtype on Wayland, whichever is installed.
//
// All backends expose the same async surface so main.js never branches on
// process.platform for typing:
//   createKeyInjector() -> { init, char, special, dispose, backend, error }
//   special names: ENTER BACKSPACE LEFT RIGHT HOME SHIFT_END
//   pasteKeystroke()   -> one-shot Ctrl+V (Cmd+V on macOS) to the foreground app

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');

function which(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let toolsCache = null;
function detectTools() {
  if (toolsCache) return toolsCache;
  toolsCache = {
    xdotool: process.platform === 'linux' && which('xdotool'),
    ydotool: process.platform === 'linux' && which('ydotool'),
    wtype: process.platform === 'linux' && which('wtype'),
  };
  return toolsCache;
}

function ydotoolDaemonUp() {
  // ydotool needs ydotoold; its socket lives in the runtime dir (or /tmp).
  const candidates = [
    `${process.env.XDG_RUNTIME_DIR || ''}/.ydotool_socket`,
    '/tmp/.ydotool_socket',
  ];
  return candidates.some((p) => p && fs.existsSync(p));
}

// Which Linux injector applies right now. On Wayland xdotool only reaches
// XWayland windows, so native Wayland tools are preferred when present.
function pickLinuxBackend() {
  const t = detectTools();
  const wayland = (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' || !!process.env.WAYLAND_DISPLAY;
  const order = wayland ? ['ydotool', 'wtype', 'xdotool'] : ['xdotool', 'wtype', 'ydotool'];
  for (const name of order) {
    if (!t[name]) continue;
    if (name === 'ydotool' && !ydotoolDaemonUp()) continue;
    return name;
  }
  return null;
}

function linuxInstallHint() {
  const wayland = (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' || !!process.env.WAYLAND_DISPLAY;
  return wayland
    ? 'Typing into other apps needs a key-injection tool. Install one of: wtype (sudo apt install wtype), or ydotool with its ydotoold service running. xdotool also works for X11/XWayland apps.'
    : 'Typing into other apps needs xdotool. Install it with: sudo apt install xdotool';
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('exit', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}

// Linux input-event key codes (input-event-codes.h) for ydotool.
const YDO_CODES = { ENTER: 28, BACKSPACE: 14, LEFT: 105, RIGHT: 106, HOME: 102, END: 107, LEFTSHIFT: 42, LEFTCTRL: 29, V: 47 };
// XKB keysym names for xdotool / wtype.
const XKB_NAMES = { ENTER: 'Return', BACKSPACE: 'BackSpace', LEFT: 'Left', RIGHT: 'Right', HOME: 'Home', END: 'End' };
// macOS virtual key codes for System Events `key code`.
const MAC_CODES = { ENTER: 36, BACKSPACE: 51, LEFT: 123, RIGHT: 124, HOME: 115, END: 119 };
// Windows SendKeys tokens.
const WIN_TOKENS = { ENTER: '{ENTER}', BACKSPACE: '{BACKSPACE}', LEFT: '{LEFT}', RIGHT: '{RIGHT}', HOME: '{HOME}', SHIFT_END: '+{END}' };

// ── Windows backend (persistent PowerShell session) ───────────────────────────

const WIN_SENDKEY_MAP = {
  '\n': '{ENTER}', '{': '{{}', '}': '{}}',
  '+': '{+}', '^': '{^}', '%': '{%}', '~': '{~}',
  '(': '{(}', ')': '{)}',
};

function createWindowsInjector() {
  let proc = null;
  const psWrite = (line) => new Promise((res) => {
    if (!proc || proc.killed || proc.stdin.destroyed) return res();
    proc.stdin.write(line + '\n', () => res());
  });
  const sendToken = (token) => psWrite(`$wsh.SendKeys('${token.replace(/'/g, "''")}')`);
  return {
    backend: 'powershell',
    error: null,
    async init() {
      proc = spawn('powershell.exe',
        ['-NonInteractive', '-ExecutionPolicy', 'Bypass', '-NoProfile', '-Command', '-'],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      // Init WScript.Shell and wait for sentinel so the first SendKeys fires
      // only after init.
      await psWrite('Add-Type -AssemblyName System.Windows.Forms; $wsh = New-Object -ComObject WScript.Shell; Write-Host "ACE_READY"');
      await new Promise((resolve) => {
        const onData = (d) => { if (String(d).includes('ACE_READY')) { proc.stdout.off('data', onData); resolve(); } };
        proc.stdout.on('data', onData);
        setTimeout(resolve, 2000); // fallback
      });
      return { ok: true };
    },
    char(ch) { return sendToken(WIN_SENDKEY_MAP[ch] || ch); },
    special(name) { return sendToken(WIN_TOKENS[name]); },
    dispose() {
      if (proc) { try { proc.stdin.end(); } catch {} try { proc.kill(); } catch {} proc = null; }
    },
  };
}

// ── macOS backend (persistent osascript session) ──────────────────────────────

function createMacInjector() {
  let proc = null;
  const write = (line) => new Promise((res) => {
    if (!proc || proc.killed || proc.stdin.destroyed) return res();
    proc.stdin.write(line + '\n', () => res());
  });
  const esc = (ch) => ch.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return {
    backend: 'osascript',
    error: null,
    async init() {
      proc = spawn('osascript', ['-i'], { stdio: ['pipe', 'ignore', 'ignore'] });
      return { ok: true };
    },
    char(ch) { return write(`tell application "System Events" to keystroke "${esc(ch)}"`); },
    special(name) {
      // Line start / select to line end are ⌘← and ⌘⇧→ on a Mac: Home and End
      // only scroll in browser editors (CoderPad, LeetCode…) and TextEdit.
      if (name === 'HOME') return write('tell application "System Events" to key code 123 using command down');
      if (name === 'SHIFT_END') return write('tell application "System Events" to key code 124 using {command down, shift down}');
      return write(`tell application "System Events" to key code ${MAC_CODES[name]}`);
    },
    dispose() {
      if (proc) { try { proc.stdin.end(); } catch {} try { proc.kill(); } catch {} proc = null; }
    },
  };
}

// ── Linux backends (one short-lived command per key) ──────────────────────────

function createLinuxInjector() {
  const backend = pickLinuxBackend();
  if (!backend) return { backend: null, error: linuxInstallHint(), async init() { return { ok: false, error: linuxInstallHint() }; }, char() {}, special() {}, dispose() {} };
  const key = {
    xdotool: (name) => run('xdotool', ['key', '--clearmodifiers', name]),
    wtype: (name) => run('wtype', ['-k', name]),
  };
  const impl = {
    xdotool: {
      char: (ch) => run('xdotool', ['type', '--delay', '0', '--', ch]),
      special: (name) => name === 'SHIFT_END'
        ? run('xdotool', ['key', '--clearmodifiers', 'shift+End'])
        : key.xdotool(XKB_NAMES[name]),
    },
    wtype: {
      char: (ch) => run('wtype', ['--', ch]),
      special: (name) => name === 'SHIFT_END'
        ? run('wtype', ['-M', 'shift', '-k', 'End', '-m', 'shift'])
        : key.wtype(XKB_NAMES[name]),
    },
    ydotool: {
      char: (ch) => run('ydotool', ['type', '--', ch]),
      special: (name) => {
        if (name === 'SHIFT_END') {
          const s = YDO_CODES.LEFTSHIFT, e = YDO_CODES.END;
          return run('ydotool', ['key', `${s}:1`, `${e}:1`, `${e}:0`, `${s}:0`]);
        }
        const c = YDO_CODES[name];
        return run('ydotool', ['key', `${c}:1`, `${c}:0`]);
      },
    },
  }[backend];
  return {
    backend,
    error: null,
    async init() { return { ok: true }; },
    char: impl.char,
    special: impl.special,
    dispose() {},
  };
}

function createKeyInjector() {
  if (process.platform === 'win32') return createWindowsInjector();
  if (process.platform === 'darwin') return createMacInjector();
  return createLinuxInjector();
}

// ── One-shot paste keystroke (Ctrl+V / Cmd+V) ─────────────────────────────────

function pasteKeystroke() {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const ps = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
      ], { windowsHide: true });
      ps.on('exit', () => resolve({ ok: true }));
      ps.on('error', () => resolve({ ok: false, error: 'powershell.exe not available' }));
    });
  }
  if (process.platform === 'darwin') {
    return run('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'])
      .then((ok) => (ok ? { ok } : { ok, error: 'osascript failed — grant Accessibility permission in System Settings > Privacy & Security' }));
  }
  const backend = pickLinuxBackend();
  if (!backend) return Promise.resolve({ ok: false, error: linuxInstallHint() });
  const cmd = {
    xdotool: () => run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']),
    wtype: () => run('wtype', ['-M', 'ctrl', '-k', 'v', '-m', 'ctrl']),
    ydotool: () => run('ydotool', ['key', `${YDO_CODES.LEFTCTRL}:1`, `${YDO_CODES.V}:1`, `${YDO_CODES.V}:0`, `${YDO_CODES.LEFTCTRL}:0`]),
  }[backend];
  return cmd().then((ok) => ({ ok, error: ok ? undefined : `${backend} failed to send Ctrl+V` }));
}

module.exports = { createKeyInjector, pasteKeystroke, linuxInstallHint };
