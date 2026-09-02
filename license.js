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

function formatMac(mac) {
  return normalizeMac(mac).replace(/(..)(?=.)/g, '$1:');
}

// All real MACs on this machine (excludes loopback/zero). A license matches if
// it was issued for ANY of them, so switching between Wi-Fi and Ethernet on
// the same PC keeps working.
function machineMacs() {
  const macs = new Set();
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      const m = normalizeMac(i.mac);
      if (m && m !== '000000000000' && !i.internal) macs.add(m);
    }
  }
  return [...macs];
}

function primaryMac() {
  return machineMacs()[0] || null;
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
  primaryMac,
  verifyLicense,
  checkStoredLicense,
  touchStoredLicense,
  saveStoredLicense,
};
