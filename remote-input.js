// Remote control, the speaker's side (Windows; macOS through the native helper
// in mac-audio/RemoteInput.swift, which reads the same lines): the supporter's mouse moves,
// clicks, wheel and keys become real input on this computer through
// SendInput, in a PowerShell process that stays open while control is on.
// main.js decides when input is allowed; this file only delivers it.
//
// Lines on the helper's stdin (one command each):
//   M x y       move the pointer to physical screen pixel x,y
//   B b 1|0     button down/up (0 left, 1 middle, 2 right)
//   W dx dy     wheel (120 = one notch; dy > 0 scrolls up)
//   K vk 1|0    key down/up (Windows virtual-key code)
//   T text      type text (URI-encoded), independent of the keyboard layout
//   Q           print the pointer position ("POS x y"), for tests
// Lines from the helper: "BLOCKED <program>" when the pointer stops obeying
// (a program in front has taken the mouse and keyboard for itself, as a
// virtual machine window does), "UNBLOCKED" when it obeys again.
const { spawn } = require('child_process');

const CS = `
using System;
using System.Runtime.InteropServices;
public static class AceInput {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  static readonly int Size = Marshal.SizeOf(typeof(INPUT));

  // Physical pixels everywhere (per-monitor DPI aware), like main.js sends.
  public static void Init() {
    try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); }
    catch { try { SetProcessDPIAware(); } catch { } }
    POINT p; if (GetCursorPos(out p)) { lastX = p.X; lastY = p.Y; } // a click before any move lands here
  }
  static void Send(params INPUT[] list) { SendInput((uint)list.Length, list, Size); }
  static INPUT Mouse(uint flags, int dx, int dy, int data) {
    INPUT i = new INPUT(); i.type = 0;
    i.u.mi.dx = dx; i.u.mi.dy = dy; i.u.mi.mouseData = unchecked((uint)data); i.u.mi.dwFlags = flags;
    return i;
  }
  static INPUT Key(ushort vk, ushort scan, uint flags) {
    INPUT i = new INPUT(); i.type = 1;
    i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags;
    return i;
  }
  static bool Extended(int vk) {
    switch (vk) {
      case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26: case 0x27: case 0x28:
      case 0x2C: case 0x2D: case 0x2E: case 0x5B: case 0x5C: case 0x5D: case 0x6F: case 0x90: case 0xA3: case 0xA5:
        return true;
    }
    return false;
  }
  // The last pixel the pointer was moved to, so a button press carries the
  // exact position (VM guests read the position from the click event).
  static int lastX, lastY;
  // Normalize a physical pixel to the 0..65535 absolute range over the whole
  // virtual desktop.
  static int normX(int x) {
    int vx = GetSystemMetrics(76), vw = GetSystemMetrics(78); // SM_XVIRTUALSCREEN, SM_CXVIRTUALSCREEN
    return (int)Math.Round((x - vx) * 65535.0 / Math.Max(1, vw - 1));
  }
  static int normY(int y) {
    int vy = GetSystemMetrics(77), vh = GetSystemMetrics(79);
    return (int)Math.Round((y - vy) * 65535.0 / Math.Max(1, vh - 1));
  }
  // Absolute mouse movement (MOVE | ABSOLUTE | VIRTUALDESK). VM guests and
  // remote-desktop-style consumers track the absolute pointer; SetCursorPos
  // teleports and is read as a jump, which breaks dragging in a VM guest and
  // loses the pointer once a VM window grabs it. SetCursorPos too, so the host
  // cursor lands on the exact pixel for apps that read GetCursorPos.
  public static void Move(int x, int y) {
    lastX = x; lastY = y;
    bool ok = SetCursorPos(x, y);
    Send(Mouse(0x0001 | 0x8000 | 0x4000, normX(x), normY(y), 0));
    Obeyed(ok, x, y);
  }
  // Did the pointer go where it was put? A program that has taken the mouse
  // for itself (a virtual machine window holding its "grab") refuses the move
  // and swallows the event. Three refusals in a row are reported once, with
  // the name of the program in front; the first move that works again clears it.
  static int misses; static bool blocked;
  static void Obeyed(bool ok, int x, int y) {
    POINT p; GetCursorPos(out p);
    bool off = !ok || Math.Abs(p.X - x) > 3 || Math.Abs(p.Y - y) > 3;
    if (!off) {
      misses = 0;
      if (blocked) { blocked = false; Console.Out.WriteLine("UNBLOCKED"); Console.Out.Flush(); }
      return;
    }
    if (++misses == 3 && !blocked) {
      blocked = true;
      string name = "";
      try { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
      Console.Out.WriteLine("BLOCKED " + name); Console.Out.Flush();
    }
  }
  // Press/release at the current pixel, carried as an absolute position in the
  // same event, so a VM guest sees the button exactly where the pointer is and
  // a down-move-up sequence reads as a real drag.
  public static void Button(int b, bool down) {
    uint act = b == 2 ? (down ? 0x0008u : 0x0010u) : b == 1 ? (down ? 0x0020u : 0x0040u) : (down ? 0x0002u : 0x0004u);
    Send(Mouse(act | 0x0001 | 0x8000 | 0x4000, normX(lastX), normY(lastY), 0));
  }
  public static void Wheel(int dx, int dy) {
    if (dy != 0) Send(Mouse(0x0800, 0, 0, dy));
    if (dx != 0) Send(Mouse(0x1000, 0, 0, dx));
  }
  // Scan-code key events (not virtual-key), so VM guests, terminals and games —
  // which read hardware scan codes and ignore virtual-key / Unicode injection —
  // receive the keystroke. Falls back to a virtual-key event if the layout has
  // no scan code for the key.
  public static void KeyPress(int vk, bool down) {
    ushort scan = (ushort)MapVirtualKey((uint)vk, 0); // MAPVK_VK_TO_VSC
    uint up = down ? 0u : 0x0002u; // KEYEVENTF_KEYUP
    uint ext = Extended(vk) ? 0x0001u : 0u; // KEYEVENTF_EXTENDEDKEY
    if (scan != 0) Send(Key(0, scan, up | ext | 0x0008)); // KEYEVENTF_SCANCODE
    else Send(Key((ushort)vk, 0, up | ext));
  }
  public static void Text(string s) {
    foreach (char c in s) Send(Key(0, c, 0x0004), Key(0, c, 0x0004 | 0x0002)); // UNICODE down, up
  }
  public static void Run(string line) {
    string[] p = line.Split(' ');
    switch (p[0]) {
      case "M": Move(int.Parse(p[1]), int.Parse(p[2])); break;
      case "B": Button(int.Parse(p[1]), p[2] == "1"); break;
      case "W": Wheel(int.Parse(p[1]), int.Parse(p[2])); break;
      case "K": KeyPress(int.Parse(p[1]), p[2] == "1"); break;
      case "T": Text(Uri.UnescapeDataString(p[1])); break;
      case "Q": { POINT q; GetCursorPos(out q); Console.Out.WriteLine("POS " + q.X + " " + q.Y); Console.Out.Flush(); break; }
    }
  }
}`;

const PS = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
${CS}
'@
[AceInput]::Init()
[Console]::Out.WriteLine('ACE_READY')
[Console]::Out.Flush()
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  try { [AceInput]::Run($l) } catch { }
}`;

// KeyboardEvent.code (what the supporter's page sends) -> Windows virtual-key code.
const VK = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0D, NumpadEnter: 0x0D, Pause: 0x13, CapsLock: 0x14, Escape: 0x1B,
  Space: 0x20, PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24,
  ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  PrintScreen: 0x2C, Insert: 0x2D, Delete: 0x2E,
  MetaLeft: 0x5B, MetaRight: 0x5C, ContextMenu: 0x5D,
  NumpadMultiply: 0x6A, NumpadAdd: 0x6B, NumpadSubtract: 0x6D, NumpadDecimal: 0x6E, NumpadDivide: 0x6F,
  NumLock: 0x90, ScrollLock: 0x91,
  ShiftLeft: 0xA0, ShiftRight: 0xA1, ControlLeft: 0xA2, ControlRight: 0xA3, AltLeft: 0xA4, AltRight: 0xA5,
  Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC, Minus: 0xBD, Period: 0xBE, Slash: 0xBF, Backquote: 0xC0,
  BracketLeft: 0xDB, Backslash: 0xDC, BracketRight: 0xDD, Quote: 0xDE, IntlBackslash: 0xE2,
};
for (let i = 0; i < 26; i++) VK['Key' + String.fromCharCode(65 + i)] = 0x41 + i;
for (let i = 0; i < 10; i++) { VK['Digit' + i] = 0x30 + i; VK['Numpad' + i] = 0x60 + i; }
for (let i = 1; i <= 24; i++) VK['F' + i] = 0x6F + i;

// KeyboardEvent.code -> macOS virtual key code (Carbon kVK_*), for a speaker on
// a Mac. Command and Control swap places: the supporter's page sends a Mac's
// Command as Control (what it means on Windows), and a Windows supporter's
// Ctrl+C should copy here, so Control means Command on this side and the
// Windows/Meta key gives Control.
const MAC_KC = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9,
  IntlBackslash: 10, KeyB: 11, KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17,
  Digit1: 18, Digit2: 19, Digit3: 20, Digit4: 21, Digit6: 22, Digit5: 23, Equal: 24, Digit9: 25,
  Digit7: 26, Minus: 27, Digit8: 28, Digit0: 29, BracketRight: 30, KeyO: 31, KeyU: 32, BracketLeft: 33,
  KeyI: 34, KeyP: 35, Enter: 36, KeyL: 37, KeyJ: 38, Quote: 39, KeyK: 40, Semicolon: 41,
  Backslash: 42, Comma: 43, Slash: 44, KeyN: 45, KeyM: 46, Period: 47, Tab: 48, Space: 49,
  Backquote: 50, Backspace: 51, Escape: 53,
  ControlLeft: 55, ControlRight: 54, MetaLeft: 59, MetaRight: 62,
  ShiftLeft: 56, ShiftRight: 60, AltLeft: 58, AltRight: 61, CapsLock: 57,
  NumpadDecimal: 65, NumpadMultiply: 67, NumpadAdd: 69, NumLock: 71, NumpadDivide: 75,
  NumpadEnter: 76, NumpadSubtract: 78, NumpadEqual: 81,
  Numpad0: 82, Numpad1: 83, Numpad2: 84, Numpad3: 85, Numpad4: 86, Numpad5: 87, Numpad6: 88,
  Numpad7: 89, Numpad8: 91, Numpad9: 92,
  F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97, F7: 98, F8: 100, F9: 101, F10: 109,
  F11: 103, F12: 111, F13: 105, F14: 107, F15: 113, F16: 106, F17: 64, F18: 79, F19: 80, F20: 90,
  Insert: 114, Home: 115, PageUp: 116, Delete: 117, End: 119, PageDown: 121,
  ArrowLeft: 123, ArrowRight: 124, ArrowDown: 125, ArrowUp: 126, ContextMenu: 110,
};

// The key code this computer's input helper takes for a KeyboardEvent.code,
// or null when the key is unknown (0 is a real key on a Mac: A).
function vkFor(code) {
  const table = process.platform === 'darwin' ? MAC_KC : VK;
  return Object.prototype.hasOwnProperty.call(table, code) ? table[code] : null;
}

// The macOS helper (mac-audio/RemoteInput.swift), built next to the
// system-audio one and packaged in Resources/mac-audio.
function macHelperPath() {
  const path = require('path');
  let app = null;
  try { app = require('electron').app; } catch {}
  if (app && app.isPackaged) return path.join(process.resourcesPath, 'mac-audio', 'remote-input');
  return path.join(__dirname, 'mac-audio', 'build', 'remote-input');
}

// onEvent('blocked', program) / onEvent('unblocked'): see the top of this file.
function createRemoteInput(log, onEvent) {
  let proc = null;
  let ready = null;
  let onLine = null;
  let noPermission = false;
  function start() {
    if (process.platform !== 'win32' && process.platform !== 'darwin') return Promise.resolve(false);
    if (proc) return ready;
    noPermission = false;
    if (process.platform === 'darwin') {
      const bin = macHelperPath();
      if (!require('fs').existsSync(bin)) { if (log) log('input helper is missing from this build: ' + bin); return Promise.resolve(false); }
      proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      const enc = Buffer.from(PS, 'utf16le').toString('base64');
      proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    }
    const me = proc;
    ready = new Promise((resolve) => {
      let buf = '';
      const t = setTimeout(() => resolve(false), 20000);
      me.stdout.on('data', (d) => {
        buf += String(d);
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line === 'ACE_READY') { clearTimeout(t); resolve(true); }
          else if (line === 'NOPERM') { noPermission = true; clearTimeout(t); resolve(false); if (onEvent) onEvent('noperm', ''); }
          else if (/^BLOCKED\b/.test(line)) { if (onEvent) onEvent('blocked', line.slice(8).trim()); }
          else if (line === 'UNBLOCKED') { if (onEvent) onEvent('unblocked', ''); }
          else if (line && onLine) onLine(line);
        }
      });
      me.on('exit', () => { clearTimeout(t); resolve(false); if (proc === me) { proc = null; ready = null; } });
      me.on('error', (e) => { if (log) log('input helper: ' + e.message); });
    });
    me.stderr.on('data', (d) => {
      const s = String(d).trim();
      if (log && s && !/^#< CLIXML|^<Objs/.test(s)) log('input helper: ' + s.slice(0, 300));
    });
    me.stdin.on('error', () => {});
    return ready;
  }
  function send(line) {
    if (proc && proc.stdin.writable) { try { proc.stdin.write(line + '\n'); } catch {} }
  }
  // The pointer position in physical pixels (tests).
  function where() {
    return new Promise((resolve) => {
      const t = setTimeout(() => { onLine = null; resolve(null); }, 2000);
      onLine = (line) => {
        const m = /^POS (-?\d+) (-?\d+)$/.exec(line);
        if (!m) return;
        clearTimeout(t); onLine = null;
        resolve({ x: Number(m[1]), y: Number(m[2]) });
      };
      send('Q');
    });
  }
  function stop() {
    const p = proc;
    proc = null; ready = null;
    if (p) { try { p.stdin.end(); } catch {} setTimeout(() => { try { p.kill(); } catch {} }, 500); }
  }
  return { start, send, where, stop, running: () => !!proc, noPermission: () => noPermission };
}

module.exports = { createRemoteInput, vkFor };
