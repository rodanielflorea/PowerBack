// The PDF reader (pdfjs-dist, via officeparser) takes DOMMatrix from the native
// @napi-rs/canvas package. npm installs only the binary for the CPU it runs on,
// so a universal Mac build made on Apple Silicon has no x64 binary: on an Intel
// Mac (or under Rosetta) pdfjs fails to load and every PDF upload hangs. Put
// both macOS binaries into node_modules before electron-builder runs; the
// universal merge then finds the same files in both halves.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const scope = path.join(root, 'node_modules', '@napi-rs');
let version;
try {
  version = require(path.join(scope, 'canvas', 'package.json')).version;
} catch {
  console.log('install-mac-canvas: @napi-rs/canvas not installed, nothing to do');
  process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const arch of ['x64', 'arm64']) {
  const name = `canvas-darwin-${arch}`;
  const dest = path.join(scope, name);
  try {
    if (require(path.join(dest, 'package.json')).version === version) {
      console.log(`install-mac-canvas: @napi-rs/${name}@${version} already present`);
      continue;
    }
  } catch {}
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-canvas-'));
  try {
    const out = execFileSync(npm, ['pack', `@napi-rs/${name}@${version}`, '--pack-destination', tmp, '--silent'], { encoding: 'utf8' });
    const tgz = path.join(tmp, out.trim().split(/\r?\n/).pop());
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', dest, '--strip-components=1']);
    console.log(`install-mac-canvas: installed @napi-rs/${name}@${version}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
