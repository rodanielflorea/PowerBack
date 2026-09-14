// Guardian half of the mutual watchdog (Windows). Run detached as pure Node
// (ELECTRON_RUN_AS_NODE=1) from a COPY of the app binary with a different name
// (DevGuardian.exe), so a by-name kill of the app does not also hit it.
//   argv: <userDataDir> <appExePath>
// Files in userDataDir:
//   app.pid       — the app writes its own pid here (who to guard)
//   guardian.pid  — this process writes its pid here (so the app can guard it)
//   watchdog-stop — the app writes this on a clean quit (stand down)
//
// The app watches guardian.pid and respawns this if it dies; this watches
// app.pid and relaunches the app if it dies. Each revives the other, so
// killing one process at a time never stops the app. Only a simultaneous kill
// of both, or a process with admin/SYSTEM rights, can — that is unavoidable
// from user space.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const userDir = process.argv[2];
const appExe = process.argv[3];
if (!userDir || !appExe) process.exit(1);

const stopFile = path.join(userDir, 'watchdog-stop');
const appPidFile = path.join(userDir, 'app.pid');
const guardianPidFile = path.join(userDir, 'guardian.pid');

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function readPid(f) { try { return parseInt(fs.readFileSync(f, 'utf8').trim(), 10) || 0; } catch { return 0; } }

try { fs.writeFileSync(guardianPidFile, String(process.pid)); } catch {}

let relaunchGrace = 0; // skip a few cycles after a relaunch so the new app can write its pid

const timer = setInterval(() => {
  // Clean quit requested by the app.
  if (fs.existsSync(stopFile)) {
    clearInterval(timer);
    try { fs.unlinkSync(stopFile); } catch {}
    try { fs.unlinkSync(guardianPidFile); } catch {}
    process.exit(0);
  }
  try { fs.writeFileSync(guardianPidFile, String(process.pid)); } catch {}
  if (relaunchGrace > 0) { relaunchGrace--; return; }
  if (!alive(readPid(appPidFile))) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    try { spawn(appExe, [], { detached: true, stdio: 'ignore', env }).unref(); } catch {}
    relaunchGrace = 4; // ~4s for the new app to come up and rewrite app.pid
  }
}, 1000);
