// MAC-bound license verification for the user app.
//
// A license is Ed25519-signed by the admin generator (license-admin/) over the
// message "<MAC>|<expiryDay>", where expiryDay is a UTC day number (days since
// the Unix epoch, license valid through that whole day). The license code the
// user types is base32( expiryDay as 4-byte LE || 64-byte signature ),
// broken into dash-separated groups for readability. This app only embeds the
// PUBLIC key (license-public.key), so an unpacked app cannot mint licenses.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PUBLIC_KEY = crypto.createPublicKey(
  fs.readFileSync(path.join(__dirname, 'license-public.key'))
);

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeMac(mac) {
  return String(mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');
}

// Display form: a 12-hex MAC as AA:BB:CC:DD:EE:FF, a 32-hex hardware UUID as
// 8-4-4-4-12 groups. (Either is accepted by the generator.)
function formatMac(id) {
  const n = normalizeMac(id);
  if (n.length === 32) return n.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  return n.replace(/(..)(?=.)/g, '$1:');
}

function run(cmd, args) {
  try { return require('child_process').execFileSync(cmd, args, { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; }
}

// Every identifier this machine can be recognised by. A license matches if it
// was issued for ANY of them.
//   macOS:   the Hardware UUID (never changes) first, then the burned-in
//            Wi-Fi/Ethernet addresses from networksetup (stable even when the
//            interface is down or Wi-Fi "Private Address" randomisation is on),
//            then whatever interfaces are up right now.
//   Linux:   /etc/machine-id first, then live MACs.
//   Windows: live MACs (the physical adapter is stable there).
// Interfaces with generated/rotating MACs (AirDrop awdl, hotspot, VPN tunnels)
// are excluded so they are never shown as the computer ID.
let _idsCache = null;
function machineIds() {
  if (_idsCache) return _idsCache;
  const ids = [];
  const add = (v) => { const n = normalizeMac(v); if (n && n !== '000000000000' && !ids.includes(n)) ids.push(n); };
  if (process.platform === 'darwin') {
    const m = /"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]+)"/.exec(run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']));
    if (m) add(m[1]);
    for (const mm of run('networksetup', ['-listallhardwareports']).matchAll(/Ethernet Address:\s*([0-9a-fA-F:]{17})/g)) add(mm[1]);
  } else if (process.platform === 'linux') {
    try { add(require('fs').readFileSync('/etc/machine-id', 'utf8').trim()); } catch {}
  }
  const skip = /^(awdl|llw|utun|ap\d|bridge|vmnet|vboxnet|docker|veth|tun|tap|anpi|gif|stf)/i;
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const i of ifaces || []) if (!i.internal) add(i.mac);
  }
  _idsCache = ids;
  return ids;
}

// Kept for callers that think in MACs; returns all identifiers.
function machineMacs() { return machineIds(); }

// The identifier shown to the user (and sent to the admin): the most stable one.
function primaryMac() {
  return machineIds()[0] || null;
}

// RFC 4648 base32 (no padding): only A-Z and 2-7, so dashes/spaces added for
// readability can never collide with the code itself, and it is
// case-insensitive for hand-typing.
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function b32decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str.toUpperCase()) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function parseLicense(code) {
  const clean = String(code || '').replace(/[-\s]/g, '');
  const buf = b32decode(clean);
  if (!buf || buf.length !== 4 + 64) return null;
  return { expiryDay: buf.readUInt32LE(0), signature: buf.subarray(4) };
}

// -> { ok, mac, expiryDay, expiresAt } | { ok: false, reason: 'invalid'|'expired' }
function verifyLicense(code, macs, nowMs) {
  const parsed = parseLicense(code);
  if (!parsed) return { ok: false, reason: 'invalid' };
  const { expiryDay, signature } = parsed;
  for (const mac of macs) {
    const msg = Buffer.from(`${normalizeMac(mac)}|${expiryDay}`);
    let good = false;
    try { good = crypto.verify(null, msg, PUBLIC_KEY, signature); } catch {}
    if (good) {
      if (Math.floor(nowMs / DAY_MS) > expiryDay) return { ok: false, reason: 'expired' };
      return { ok: true, mac, expiryDay, expiresAt: (expiryDay + 1) * DAY_MS };
    }
  }
  return { ok: false, reason: 'invalid' };
}

// ── Stored license ────────────────────────────────────────────────────────────
// userData/license.json: { code, lastSeen }. lastSeen only ever increases and
// feeds the expiry check, so rolling the system clock back cannot extend a
// license.

function licenseFile(userDataDir) {
  return path.join(userDataDir, 'license.json');
}

function loadStoredLicense(userDataDir) {
  try { return JSON.parse(fs.readFileSync(licenseFile(userDataDir), 'utf8')); } catch { return null; }
}

function saveStoredLicense(userDataDir, code, lastSeen) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(licenseFile(userDataDir), JSON.stringify({ code, lastSeen }));
}

// -> { ok, expiresAt? , reason? }. lastSeen is bumped on EVERY check, valid or
// not, so that once expiry has been observed, turning the clock back cannot
// bring the license back to life.
function checkStoredLicense(userDataDir) {
  const stored = loadStoredLicense(userDataDir);
  if (!stored || !stored.code) return { ok: false, reason: 'missing' };
  const now = Math.max(Date.now(), Number(stored.lastSeen) || 0);
  saveStoredLicense(userDataDir, stored.code, now);
  return verifyLicense(stored.code, machineMacs(), now);
}

// Called periodically while the app runs so lastSeen tracks real usage time.
function touchStoredLicense(userDataDir) {
  const stored = loadStoredLicense(userDataDir);
  if (!stored || !stored.code) return;
  const now = Math.max(Date.now(), Number(stored.lastSeen) || 0);
  saveStoredLicense(userDataDir, stored.code, now);
}

module.exports = {
  DAY_MS,
  normalizeMac,
  formatMac,
  machineMacs,
  machineIds,
  primaryMac,
  verifyLicense,
  checkStoredLicense,
  touchStoredLicense,
  saveStoredLicense,
};
