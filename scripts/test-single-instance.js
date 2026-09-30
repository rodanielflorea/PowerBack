// Checks that only one instance of the app runs at a time.
//
//   node scripts/test-single-instance.js
//
// The app is started on a data folder of its own (--user-data-dir), so the
// installed app and its settings are not touched and may be running. An empty
// data folder has no licence: the first instance stops at the Activation
// window, which is all this test needs. That window is visible while the test
// runs (about 20 s).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron'); // in plain Node: the path of the binary

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-instance-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exited = (p) => new Promise((r) => p.once('exit', (code) => r(code)));
const has = (f) => { try { fs.lstatSync(path.join(dir, f)); return true; } catch { return false; } };
const log = () => { try { return fs.readFileSync(path.join(dir, 'activity.log'), 'utf8'); } catch { return ''; } };
// The files the app itself keeps in its data folder, with the time of their
// last change. The browser engine writes others of its own all the time.
const OWN = /^(state\.json|sessions\.json|license\.json|app\.pid|guardian\..*|watchdog-stop|adopted-.*|\.updaterId|materials|before-2\.4)$/;
// a file that is gone in the middle of the look is a value, not an error
const snapshot = () => fs.readdirSync(dir).filter((f) => OWN.test(f))
  .map((f) => { try { return f + ' ' + fs.statSync(path.join(dir, f)).mtimeMs; } catch { return f + ' -'; } })
  .sort().join(', ');

const started = [];
function start(args, env) {
  const e = { ...process.env, ...env };
  delete e.ELECTRON_RUN_AS_NODE;
  const p = spawn(electron, [root, '--user-data-dir=' + dir, ...(args || [])], { env: e, stdio: 'ignore' });
  p.on('error', () => {});
  started.push(p);
  return p;
}

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : '')); };

async function run() {
  const first = start();
  let firstGone = false;
  first.once('exit', () => { firstGone = true; });
  for (let i = 0; i < 200 && !has('lockfile') && !has('SingletonLock'); i++) await wait(100);
  check('the first instance takes the lock', has('lockfile') || has('SingletonLock'));
  await wait(5000); // let it reach its window

  // A second start: leaves at once, writes nothing, the first one is told.
  const before = snapshot();
  let t0 = Date.now();
  const second = start();
  const code2 = await Promise.race([exited(second), wait(15000).then(() => 'timeout')]);
  if (code2 === 'timeout') second.kill();
  await wait(700); // the log line is written asynchronously
  check('a second start leaves by itself', code2 === 0, 'exit ' + code2 + ' after ' + (Date.now() - t0) + ' ms');
  check('the first instance keeps running', !firstGone);
  check('the first instance was told', /\[instance\] a second start was turned away/.test(log()));
  const after = snapshot();
  check('the second start wrote nothing to the data folder', after === before, after === before ? '' : 'before: ' + before + ' | after: ' + after);

  // A start by the guardian: turned away too, but noted as such.
  const third = start(['--by-guardian']);
  const code3 = await Promise.race([exited(third), wait(15000).then(() => 'timeout')]);
  if (code3 === 'timeout') third.kill();
  await wait(700);
  check('a start by the guardian leaves by itself', code3 === 0, 'exit ' + code3);
  check('it is noted as a start by the guardian', /\[instance\] a start by the guardian was turned away/.test(log()));

  // The portable copy: a second start waits for the running one to end, so
  // that the launcher does not clean up the unpacked files under it. (A
  // packaged app writes these two files itself.)
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'app.pid'), String(first.pid));
    fs.writeFileSync(path.join(dir, 'app.path'), electron);
    const fourth = start([], { PORTABLE_EXECUTABLE_FILE: 'C:\\portable-test.exe' });
    let fourthGone = false;
    fourth.once('exit', () => { fourthGone = true; });
    await wait(6000);
    check('a second portable start waits while the first runs', !fourthGone && !firstGone);
    first.kill();
    t0 = Date.now();
    const code4 = await Promise.race([exited(fourth), wait(15000).then(() => 'timeout')]);
    if (code4 === 'timeout') fourth.kill();
    check('and leaves once the first has ended', code4 === 0, 'exit ' + code4 + ' after ' + (Date.now() - t0) + ' ms');

    // Another copy of the portable exe, unpacked elsewhere, has nothing to wait for.
    const fifth = start();
    await wait(6000);
    fs.writeFileSync(path.join(dir, 'app.pid'), String(fifth.pid));
    fs.writeFileSync(path.join(dir, 'app.path'), 'C:\\elsewhere\\Ace.exe');
    const sixth = start([], { PORTABLE_EXECUTABLE_FILE: 'C:\\portable-test.exe' });
    const code6 = await Promise.race([exited(sixth), wait(15000).then(() => 'timeout')]);
    check('a portable start next to a copy from another folder leaves at once', code6 === 0, 'exit ' + code6);
    fifth.kill();
  } else {
    first.kill();
  }
}

(async () => {
  try { await run(); }
  catch (e) { console.error(e); results.push(false); }
  finally { for (const p of started) { try { p.kill(); } catch {} } }
  await wait(1500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
