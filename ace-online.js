// Ace ⇄ ace2me.com: this computer's approval, its API keys, and online sessions.
//
// There is no sign-in. On the first start Ace shows this computer's MAC
// address; the user sends it to the administrator, who approves it on
// ace2me.com (super admin → "Ace app"). Until then the app waits on the
// approval window. A random secret made on the first start goes with every
// call, so a copied MAC address alone does not make another computer approved.
//
// Every minute the running app checks in again. "Terminated" closes the app,
// also in the middle of a session. When ace2me.com cannot be reached the app
// keeps working until 24 h after the last good check-in (the last approval and
// keys are kept, encrypted with the OS key store where there is one).
//
// The API keys (Deepgram, Anthropic, …) come from ace2me.com with every
// check-in instead of being built into the installer.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const license = require('./license'); // only for reading this computer's MAC addresses

const PLATFORM = (process.env.ACE_PLATFORM || 'https://ace2me.com').replace(/\/+$/, '');
const GRACE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15000;

let dataDir = '';
let electron = null;
function init(userDataDir, electronModule) { dataDir = userDataDir; electron = electronModule; }

// ACE_TEST_MAC: a development run (never the installed app) can pose as another
// computer, so two test copies on one machine are two devices.
function testMac() { return electron && electron.app && !electron.app.isPackaged ? String(process.env.ACE_TEST_MAC || '') : ''; }
function primaryMac() { return testMac() || license.primaryMac() || ''; }
function formatMac(m) { return license.formatMac(m || ''); }

// The device secret: made once, kept in the app-data folder (an uninstall that
// keeps app data keeps it too, so a reinstall stays approved).
function deviceSecret() {
  const f = path.join(dataDir, 'device.json');
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (/^[0-9a-f]{64}$/.test(j.secret)) return j.secret;
  } catch {}
  const secret = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(f, JSON.stringify({ secret, created: new Date().toISOString() })); } catch {}
  return secret;
}

// ── the last good answer, for the 24 h without a connection ─────────────────
const CACHE_FILE = () => path.join(dataDir, 'ace-online.bin');
function saveCache(o) {
  try {
    const text = JSON.stringify(o);
    const ss = electron && electron.safeStorage;
    const buf = ss && ss.isEncryptionAvailable() ? Buffer.concat([Buffer.from('E1'), ss.encryptString(text)]) : Buffer.concat([Buffer.from('P1'), Buffer.from(text)]);
    fs.writeFileSync(CACHE_FILE(), buf);
  } catch {}
}
function loadCache() {
  try {
    const buf = fs.readFileSync(CACHE_FILE());
    const tag = buf.subarray(0, 2).toString();
    const body = buf.subarray(2);
    const text = tag === 'E1' ? electron.safeStorage.decryptString(body) : body.toString('utf8');
    return JSON.parse(text);
  } catch { return null; }
}
function clearCache() { try { fs.unlinkSync(CACHE_FILE()); } catch {} }

async function post(pathname, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PLATFORM + pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data: data || {} };
  } finally { clearTimeout(t); }
}
const auth = () => ({ mac: primaryMac(), secret: deviceSecret() });

// Checks in. Returns one of:
//   { status:'approved', name, keys, iceServers, relayUrl, checkEverySec, offline?:true }
//   { status:'pending', mac, reason? }   { status:'terminated', message }
//   { status:'offline', error, mac }      (no answer and no approval in the last 24 h)
let last = null;
async function hello(version) {
  const mac = primaryMac();
  try {
    const r = await post('/api/ace/hello', {
      ...auth(), macs: testMac() ? [testMac()] : license.machineMacs(), version,
      platform: process.platform, hostname: os.hostname(), osUser: (() => { try { return os.userInfo().username; } catch { return ''; } })(),
    });
    const d = r.data;
    if (r.status >= 500 || !d.status) throw new Error('ace2me.com answered ' + r.status);
    if (d.status === 'approved') {
      last = { ...d, at: Date.now() };
      saveCache(last);
      return last;
    }
    // Pending or terminated: what was kept no longer counts.
    clearCache();
    last = null;
    return { ...d, mac: formatMac(d.mac || mac) };
  } catch (e) {
    const c = loadCache();
    if (c && c.status === 'approved' && Date.now() - c.at < GRACE_MS) {
      last = c;
      return { ...c, offline: true, error: String(e.message || e) };
    }
    return { status: 'offline', error: String(e.message || e), mac: formatMac(mac) };
  }
}
function current() { return last; }

// ── online sessions (see the relay in RemoteDevJobs/ace-relay) ──────────────
async function call(pathname, extra) {
  let r;
  try { r = await post(pathname, { ...auth(), ...extra }); }
  catch (e) { return { ok: false, error: 'Cannot reach ace2me.com: ' + (e.message || e) }; }
  if (r.status >= 200 && r.status < 300) return { ok: true, ...r.data };
  return { ok: false, status: r.status, error: (r.data && r.data.detail) || ('error ' + r.status) };
}
const sessionStart = (label) => call('/api/ace/session', { action: 'start', label });
const sessionBeat = (sessionId) => call('/api/ace/session', { action: 'beat', sessionId });
const sessionEnd = (sessionId) => call('/api/ace/session', { action: 'end', sessionId });
const sessionList = () => call('/api/ace/sessions', {});
const join = (sessionId, password) => call('/api/ace/join', { sessionId, password });

function relayUrl(base, role, ticket) {
  const b = String(base || (last && last.relayUrl) || '').replace(/\/+$/, '');
  return `${b}/${role}?t=${encodeURIComponent(ticket)}`;
}

module.exports = {
  PLATFORM, init, hello, current, primaryMac, formatMac,
  sessionStart, sessionBeat, sessionEnd, sessionList, join, relayUrl,
  updateFeedUrl: PLATFORM + '/api/ace/update/',
};
