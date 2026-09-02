// License generator (admin-only). Signs MAC-bound licenses with the Ed25519
// private key compiled in from private-key.js, so a build works anywhere.
// Never distribute this app to users.
const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const crypto = require('crypto');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;

const privateKey = crypto.createPrivateKey(require('./private-key'));

function normalizeMac(mac) {
  return String(mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');
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

// Same format the user app verifies (see license.js in the main repo):
// base32( expiryDay LE uint32 || Ed25519 signature of "<MAC>|<expiryDay>" ),
// dash-grouped for readability.
// Expiry is either an explicit date (YYYY-MM-DD, valid through that day) or
// a number of days from today.
function makeLicense(mac, days, date) {
  const m = normalizeMac(mac);
  if (m.length !== 12) return { error: 'MAC address must have 12 hex digits (e.g. AA:BB:CC:DD:EE:FF).' };
  const today = Math.floor(Date.now() / DAY_MS);
  let expiryDay;
  if (date) {
    const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
    if (!mm) return { error: 'Expiry date must be YYYY-MM-DD.' };
    expiryDay = Math.floor(Date.UTC(+mm[1], +mm[2] - 1, +mm[3]) / DAY_MS);
    if (expiryDay < today) return { error: 'Expiry date is in the past.' };
  } else {
    const d = Math.round(Number(days));
    if (!Number.isFinite(d) || d < 1 || d > 3650) return { error: 'Period must be between 1 and 3650 days.' };
    expiryDay = today + d;
  }
  const sig = crypto.sign(null, Buffer.from(`${m}|${expiryDay}`), privateKey);
  const buf = Buffer.alloc(4 + 64);
  buf.writeUInt32LE(expiryDay, 0);
  sig.copy(buf, 4);
  const code = b32encode(buf).replace(/(.{6})(?=.)/g, '$1-');
  return { code, expiresAt: (expiryDay + 1) * DAY_MS, mac: m };
}

ipcMain.handle('gen', (_e, { mac, days, date }) => makeLicense(mac, days, date));
ipcMain.handle('copy', (_e, text) => clipboard.writeText(String(text || '')));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 520,
    height: 500,
    resizable: false,
    title: 'License Generator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
