#!/usr/bin/env node
// Adds OPEN.command + MAC-README.txt next to RemoteDevJobAce.app inside
// macOS zip artifacts so testers can bypass Gatekeeper without Terminal.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OPEN_SRC = path.join(ROOT, 'build', 'mac-open.command');
const README_SRC = path.join(ROOT, 'build', 'MAC-README.txt');

function pythonBin() {
  for (const c of ['python3', 'python']) {
    const r = spawnSync(c, ['-c', 'import zipfile, sys; sys.exit(0)'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}

function patchZip(zipPath) {
  if (!fs.existsSync(zipPath)) throw new Error(`missing zip: ${zipPath}`);
  if (!fs.existsSync(OPEN_SRC) || !fs.existsSync(README_SRC)) {
    throw new Error('missing build/mac-open.command or build/MAC-README.txt');
  }
  const py = pythonBin();
  if (!py) throw new Error('python3/python required to patch mac zip');

  const script = `
import os, sys, zipfile
zip_path, open_src, readme_src = sys.argv[1], sys.argv[2], sys.argv[3]
# Drop any previous copies so re-running is idempotent.
tmp = zip_path + '.tmp'
with zipfile.ZipFile(zip_path, 'r') as src, zipfile.ZipFile(tmp, 'w') as dst:
    skip = {'OPEN.command', 'MAC-README.txt', 'READ ME.txt'}
    for info in src.infolist():
        name = info.filename.replace('\\\\', '/').lstrip('/')
        if name in skip or name.endswith('/OPEN.command') or name.endswith('/MAC-README.txt'):
            continue
        dst.writestr(info, src.read(info.filename))
    def add(name, data, mode=0o644):
        zi = zipfile.ZipInfo(name)
        zi.date_time = (2026, 1, 1, 0, 0, 0)
        zi.create_system = 3  # Unix
        zi.external_attr = (mode & 0xFFFF) << 16
        zi.compress_type = zipfile.ZIP_DEFLATED
        dst.writestr(zi, data)
    with open(open_src, 'rb') as f:
        add('OPEN.command', f.read(), 0o100755)
    with open(readme_src, 'rb') as f:
        add('MAC-README.txt', f.read(), 0o100644)
os.replace(tmp, zip_path)
print('patched', zip_path)
`;
  const r = spawnSync(py, ['-c', script, zipPath, OPEN_SRC, README_SRC], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `python exit ${r.status}`).trim());
  }
  if (r.stdout) process.stdout.write(r.stdout);
}

function isMacZip(p) {
  const n = path.basename(p);
  return /\.zip$/i.test(n) && /RemoteDevJobAce/i.test(n);
}

async function run(artifactPaths) {
  const zips = artifactPaths.filter(isMacZip);
  for (const z of zips) patchZip(z);
  return [];
}

exports.default = async function afterAllArtifactBuild(buildResult) {
  const paths = (buildResult && buildResult.artifactPaths) || [];
  return run(paths);
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const targets = args.length
    ? args
    : fs.readdirSync(path.join(ROOT, 'dist', 'all-os'))
      .filter((n) => isMacZip(n))
      .map((n) => path.join(ROOT, 'dist', 'all-os', n));
  if (!targets.length) {
    console.error('No mac zip files to patch');
    process.exit(1);
  }
  run(targets).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
