// Watchdog: keeps the app alive if another program closes it (Windows).
//
// Launched detached by the app (main.js) as a pure-Node process
// (ELECTRON_RUN_AS_NODE=1) with argv: <appExePath> <appPid> <stopFile>.
// It polls the app's PID; once the app is gone it relaunches the exe UNLESS
// the app asked it not to (the stop file, written on a clean quit). The
// relaunched app spawns a fresh watchdog, so protection chains across restarts.
//
// This only resists ordinary termination. A process with Administrator/SYSTEM
// rights can kill the app and this watchdog together; that cannot be prevented
// from user space, by design of Windows.
'use strict';
const fs = require('fs');
const { spawn } = require('child_process');

const exePath = process.argv[2];
const appPid = parseInt(process.argv[3], 10);
const stopFile = process.argv[4];

if (!exePath || !Number.isFinite(appPid) || !stopFile) process.exit(1);

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function relaunch() {
  // Fresh environment: never carry ELECTRON_RUN_AS_NODE into the real app.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawn(exePath, [], { detached: true, stdio: 'ignore', env });
    child.unref();
  } catch {}
}

const timer = setInterval(() => {
  if (alive(appPid)) return;
  clearInterval(timer);
  // The app is gone. A clean quit leaves the stop file; anything else is a
  // kill or crash, so bring it back.
  let stopped = false;
  try { stopped = fs.existsSync(stopFile); } catch {}
  if (stopped) { try { fs.unlinkSync(stopFile); } catch {} process.exit(0); }
  // Small delay so the OS fully releases the old instance first.
  setTimeout(() => { relaunch(); process.exit(0); }, 400);
}, 1000);
