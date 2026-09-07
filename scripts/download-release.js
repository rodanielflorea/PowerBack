#!/usr/bin/env node
// Downloads every installer of a GitHub release into a folder, RESUMING after
// network drops and retrying until each file's size matches the asset exactly.
// Works for draft releases of private repos (uses your `gh auth token`).
//
//   node scripts/download-release.js [vX.Y.Z] [outDir]
//   default tag: v<package.json version>, default outDir: dist/all-os
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const version = require(path.join(__dirname, '..', 'package.json')).version;
const tag = process.argv[2] || `v${version}`;
const outDir = process.argv[3] || path.join('dist', 'all-os');
const repo = (() => {
  try { return execSync('gh repo view --json nameWithOwner -q .nameWithOwner', { encoding: 'utf8' }).trim(); } catch { return ''; }
})();
const token = (() => { try { return execSync('gh auth token', { encoding: 'utf8' }).trim(); } catch { return ''; } })();
if (!repo || !token) { console.error('Needs the GitHub CLI logged in (gh auth login).'); process.exit(1); }

const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'remotedevjobace-build', Accept: 'application/vnd.github+json' };

function apiJson(p) {
  return new Promise((resolve, reject) => {
    https.get({ host: 'api.github.com', path: p, headers }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(`${res.statusCode} ${p}`))));
    }).on('error', reject);
  });
}

// One attempt: append from the current file size using a Range request.
function downloadOnce(asset, dest) {
  return new Promise((resolve, reject) => {
    const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (have >= asset.size) return resolve();
    const opts = {
      host: 'api.github.com', path: `/repos/${repo}/releases/assets/${asset.id}`,
      headers: { ...headers, Accept: 'application/octet-stream', Range: `bytes=${have}-` },
    };
    const follow = (o, hops) => {
      const req = https.get(o, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
          res.resume();
          const u = new URL(res.headers.location);
          // The CDN URL is pre-signed: send no Authorization header there, but keep the Range.
          return follow({ host: u.host, path: u.pathname + u.search, headers: { 'User-Agent': headers['User-Agent'], Range: `bytes=${have}-` } }, hops + 1);
        }
        if (res.statusCode === 416) { res.resume(); return resolve(); }
        if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const start = res.statusCode === 206 ? have : 0;
        const file = fs.createWriteStream(dest, { flags: start ? 'a' : 'w' });
        let got = start;
        let timer = null;
        const arm = () => { clearTimeout(timer); timer = setTimeout(() => { req.destroy(new Error('stalled')); }, 30000); };
        arm();
        res.on('data', (chunk) => { got += chunk.length; arm(); process.stdout.write(`\r  ${asset.name}: ${(got / 1048576).toFixed(1)} / ${(asset.size / 1048576).toFixed(1)} MB   `); });
        res.pipe(file);
        file.on('finish', () => { clearTimeout(timer); process.stdout.write('\n'); resolve(); });
        res.on('error', (e) => { clearTimeout(timer); reject(e); });
        file.on('error', (e) => { clearTimeout(timer); reject(e); });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    };
    follow(opts, 0);
  });
}

async function downloadWithRetry(asset, dest) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try { await downloadOnce(asset, dest); } catch (e) { process.stdout.write(`\n  retry ${attempt}: ${e.message}\n`); await new Promise((r) => setTimeout(r, Math.min(15000, 2000 * attempt))); continue; }
    const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (size === asset.size) return true;
    if (size > asset.size) fs.unlinkSync(dest); // corrupt: start over
  }
  return false;
}

(async () => {
  const rel = await apiJson(`/repos/${repo}/releases/tags/${tag}`).catch(async (e) => {
    // Draft releases are not addressable by tag; find it in the list.
    const list = await apiJson(`/repos/${repo}/releases?per_page=30`);
    const d = list.find((r) => r.tag_name === tag);
    if (!d) throw e;
    return d;
  });
  const assets = (rel.assets || []).filter((a) => !/\.blockmap$|\.yml$/.test(a.name));
  if (!assets.length) { console.error(`Release ${tag} has no installers yet.`); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Downloading ${assets.length} installers of ${tag} into ${outDir} (resumable; safe to re-run)`);
  let failed = 0;
  for (const a of assets) {
    const dest = path.join(outDir, a.name);
    const ok = await downloadWithRetry(a, dest);
    console.log(`  ${ok ? '✓' : '✗'} ${a.name} (${a.size.toLocaleString()} bytes)`);
    if (!ok) failed++;
  }
  if (failed) { console.error(`${failed} file(s) could not be completed — run this again to resume.`); process.exit(1); }
  console.log('All installers downloaded and verified.');
})().catch((e) => { console.error(e.message); process.exit(1); });
