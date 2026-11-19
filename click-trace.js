// Click tracing (Windows): finds out why a mouse press on an Ace window did
// nothing. A small hidden PowerShell helper watches the left mouse button and,
// on every press, reports where the pointer was, which window Windows would
// give that press to, and which Ace window (if any) is at that spot together
// with its window styles. main.js compares that with what the page actually
// received and writes anything that does not add up to click-trace.log.
//
// One line from the helper per press:
//   D|x|y|underHwnd|underPid|underProc|underClass|underEx|aceHwnd|aceEx|aceStyle|guiFlags|capture|moveSize|utcMs
//   under*   the top-level window that gets the press (WindowFromPoint)
//   ace*     the top-most visible window of this app containing the point (0: none)
//   guiFlags GetGUIThreadInfo flags of the Ace window's thread
//            (2: in a move/size loop, 4: menu open, 16: popup menu)
//   capture  the window holding the mouse capture in that thread (0: none)
const { spawn } = require('child_process');

const CS = `
using System; using System.Text; using System.Runtime.InteropServices;
public static class AceClickTrace {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
    public int cbSize; public uint flags;
    public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret; public RECT rcCaret;
  }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO g);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);

  public static void Init() {
    try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); }
    catch { try { SetProcessDPIAware(); } catch { } }
  }
  static bool wasDown;
  // Null unless the left button went down since the last call.
  public static string Poll(uint acePid) {
    bool down = (GetAsyncKeyState(1) & 0x8000) != 0;
    bool edge = down && !wasDown;
    wasDown = down;
    if (!edge) return null;
    POINT p; if (!GetCursorPos(out p)) return null;
    IntPtr under = WindowFromPoint(p);
    if (under != IntPtr.Zero) { IntPtr root = GetAncestor(under, 2); if (root != IntPtr.Zero) under = root; }
    uint underPid = 0; if (under != IntPtr.Zero) GetWindowThreadProcessId(under, out underPid);
    string proc = "";
    try { proc = System.Diagnostics.Process.GetProcessById((int)underPid).ProcessName; } catch { }
    StringBuilder cls = new StringBuilder(128);
    if (under != IntPtr.Zero) GetClassName(under, cls, 128);
    int underEx = under != IntPtr.Zero ? GetWindowLong(under, -20) : 0;
    // EnumWindows walks top-level windows from the top of the stack down, so the
    // first hit is the Ace window the user sees at that spot.
    IntPtr ace = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != acePid || !IsWindowVisible(h) || IsIconic(h)) return true;
      RECT r; if (!GetWindowRect(h, out r)) return true;
      if (p.X < r.L || p.X >= r.R || p.Y < r.T || p.Y >= r.B) return true;
      ace = h; return false;
    }, IntPtr.Zero);
    int aceEx = 0, aceStyle = 0; uint flags = 0; long cap = 0, mv = 0;
    if (ace != IntPtr.Zero) {
      aceEx = GetWindowLong(ace, -20); aceStyle = GetWindowLong(ace, -16);
      uint apid; uint tid = GetWindowThreadProcessId(ace, out apid);
      GUITHREADINFO g = new GUITHREADINFO(); g.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
      if (GetGUIThreadInfo(tid, ref g)) { flags = g.flags; cap = g.hwndCapture.ToInt64(); mv = g.hwndMoveSize.ToInt64(); }
    }
    return "D|" + p.X + "|" + p.Y + "|" + under.ToInt64() + "|" + underPid + "|" + proc.Replace("|", " ") + "|" +
      cls.ToString().Replace("|", " ") + "|" + underEx + "|" + ace.ToInt64() + "|" + aceEx + "|" + aceStyle + "|" +
      flags + "|" + cap + "|" + mv + "|" +
      (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
  }
}`;

const PS = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
${CS}
'@
[AceClickTrace]::Init()
[Console]::Out.WriteLine('ACE_TRACE_READY')
[Console]::Out.Flush()
$parentPid = __PARENT_PID__
$tick = 0
while ($true) {
  $l = [AceClickTrace]::Poll($parentPid)
  if ($l -ne $null) { [Console]::Out.WriteLine($l); [Console]::Out.Flush() }
  if ((++$tick % 500) -eq 0 -and -not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 20
}`;

function parse(line) {
  const p = line.split('|');
  if (p[0] !== 'D' || p.length < 14) return null;
  const n = (i) => Number(p[i]) || 0;
  return {
    // When the press happened, by the helper's clock (same machine): the line
    // itself can reach this process late.
    at: n(14) || Date.now(), x: n(1), y: n(2),
    under: n(3), underPid: n(4), underProc: p[5], underClass: p[6], underEx: n(7) >>> 0,
    ace: n(8), aceEx: n(9) >>> 0, aceStyle: n(10) >>> 0,
    guiFlags: n(11), capture: n(12), moveSize: n(13),
  };
}

// onDown(press): every left-button press, see parse(). log(text): helper notes.
function createClickTrace(log, onDown) {
  let proc = null;
  function start() {
    if (process.platform !== 'win32' || proc) return;
    const script = PS.replace('__PARENT_PID__', String(process.pid));
    let p;
    try {
      p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { log('helper failed to start: ' + e.message); return; }
    proc = p;
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += String(d);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line === 'ACE_TRACE_READY') { log('helper ready'); continue; }
        const press = parse(line);
        if (press) { try { onDown(press); } catch (e) { log('trace error: ' + e.message); } }
      }
    });
    p.stderr.on('data', (d) => {
      const s = String(d).trim();
      if (s && !/^#< CLIXML|^<Objs/.test(s)) log('helper: ' + s.slice(0, 300));
    });
    p.on('error', (e) => { log('helper: ' + e.message); if (proc === p) proc = null; });
    p.on('exit', (code) => { if (proc === p) { proc = null; log('helper exited (' + code + ')'); } });
  }
  function stop() {
    const p = proc;
    proc = null;
    if (p) { try { p.kill(); } catch {} }
  }
  return { start, stop, running: () => !!proc };
}

module.exports = { createClickTrace };
