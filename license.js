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

function run(cmd, args) {
  try { return require('child_process').execFileSync(cmd, args, { encoding: 'utf8', timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); } catch { return ''; }
}

// The machine's REAL hardware MAC addresses — burned into the physical
// adapters — read from the OS hardware inventory, not from "whatever
// interface is up right now". That keeps the computer ID identical on every
// launch: VPN/AirDrop/hotspot adapters with generated MACs, Wi-Fi private
// address rotation and interfaces that are down do not change it.
//   macOS:   networksetup -listallhardwareports (built-in Wi-Fi/Ethernet first)
//   Windows: Get-NetAdapter -Physical (physical adapters only)
//   Linux:   /sys/class/net/*/addr_assign_type == 0 (permanent addresses)
// Live interfaces (minus known virtual ones) are appended as a fallback, so a
// license matches if it was issued for ANY hardware MAC of this machine.
let _macCache = null;
function machineMacs() {
  if (_macCache) return _macCache;
  const macs = [];
  const add = (v) => { const n = normalizeMac(v); if (n.length === 12 && n !== '000000000000' && !macs.includes(n)) macs.push(n); };
  if (process.platform === 'darwin') {
    const out = run('networksetup', ['-listallhardwareports']);
    const ports = [];
    for (const m of out.matchAll(/Hardware Port:\s*([^\n]+)\n\s*Device:\s*([^\n]+)\n\s*Ethernet Address:\s*([0-9a-fA-F:]{17})/g)) {
      ports.push({ port: m[1].trim(), device: m[2].trim(), mac: m[3] });
    }
    const rank = (p) => (/^wi-?fi$|^ethernet$|^usb.*ethernet/i.test(p.port) ? 0 : /thunderbolt|bluetooth|bridge/i.test(p.port) ? 2 : 1);
    ports.sort((a, b) => rank(a) - rank(b) || a.device.localeCompare(b.device));
    for (const p of ports) add(p.mac);
  } else if (process.platform === 'win32') {
    const out = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-NetAdapter -Physical | Sort-Object -Property @{Expression={if($_.Status -eq "Up"){0}else{1}}},ifIndex | Select-Object -ExpandProperty MacAddress']);
    for (const line of out.split(/\r?\n/)) add(line.trim());
  } else if (process.platform === 'linux') {
    const fs = require('fs');
    const phys = [];
    try {
      for (const name of fs.readdirSync('/sys/class/net')) {
        try {
          if (fs.readFileSync(`/sys/class/net/${name}/addr_assign_type`, 'utf8').trim() !== '0') continue; // permanent hardware address only
          const mac = fs.readFileSync(`/sys/class/net/${name}/address`, 'utf8').trim();
          const wired = /^(en|eth)/.test(name);
          phys.push({ name, mac, rank: wired ? 0 : /^wl/.test(name) ? 1 : 2 });
        } catch {}
      }
    } catch {}
    phys.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    for (const p of phys) add(p.mac);
  }
  // Fallback / extra candidates: interfaces that are up now, minus known virtual ones.
  const skip = /^(awdl|llw|utun|ap\d|bridge|vmnet|vboxnet|docker|veth|tun|tap|anpi|gif|stf|lo)/i;
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const i of ifaces || []) if (!i.internal) add(i.mac);
  }
  _macCache = macs;
  return macs;
}

// The MAC shown to the user (and sent to the admin): the built-in adapter's.
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
