// ---------------------------------------------------------------------------
// gofile.io upload. Takes the session folder we just wrote to Documents and
// pushes every file in it into ONE anonymous gofile folder, so the user gets a
// single share link.
//
// Flow (gofile's public API, no account needed):
//   1. GET  https://api.gofile.io/servers        -> pick an upload server
//   2. POST https://<server>.gofile.io/contents/uploadfile  (first file)
//      -> the reply carries `guestToken` + `parentFolder` + `downloadPage`
//   3. every later file is posted with that token + folderId so it lands in
//      the same folder as the first one.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const API = 'https://api.gofile.io';
const LIST_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 20 * 60 * 1000; // a screen recording can be big

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// Upload servers, best first. Falls back to a known-good name if the list call
// fails, so a flaky /servers doesn't kill the whole upload.
async function listServers() {
  const t = withTimeout(LIST_TIMEOUT_MS);
  try {
    const res = await fetch(API + '/servers', { signal: t.signal });
    const j = await res.json();
    const names = ((j && j.data && j.data.servers) || []).map((s) => s.name).filter(Boolean);
    if (names.length) return names;
  } catch {} finally { t.done(); }
  return ['store1'];
}

// POST one file. `token`/`folderId` are set for every file after the first so
// they join the folder gofile created for us.
// A Blob for the file. openAsBlob streams from disk, so a 1 GB recording never
// sits in memory — but on Windows it has failed with "Unable to open file as
// blob" (seen in a user's log; the file was fine and uploaded next time). For a
// small file, fall back to reading it whole; a big one gets a second try.
async function fileBlob(file) {
  try { return await fs.openAsBlob(file); } catch (e) {
    const size = (await fs.promises.stat(file)).size;
    if (size <= 64 * 1024 * 1024) return new Blob([await fs.promises.readFile(file)]);
    await new Promise((r) => setTimeout(r, 500));
    return fs.openAsBlob(file);
  }
}

async function uploadOne(server, file, { token, folderId } = {}) {
  const form = new FormData();
  form.append('file', await fileBlob(file), path.basename(file));
  if (folderId) form.append('folderId', folderId);
  const headers = token ? { Authorization: 'Bearer ' + token } : undefined;
  const t = withTimeout(UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`https://${server}.gofile.io/contents/uploadfile`, {
      method: 'POST', body: form, headers, signal: t.signal, duplex: 'half',
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.status !== 'ok') {
      throw new Error((j && (j.status || j.message)) || ('HTTP ' + res.status));
    }
    return j.data || {};
  } finally { t.done(); }
}

// Try each server in turn — one being down shouldn't lose the file.
async function uploadWithFallback(servers, file, opts) {
  let lastErr;
  for (const s of servers) {
    try { return await uploadOne(s, file, opts); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no upload server');
}

// Upload every file of `folder` (non-recursive; the session bundle is flat).
// `onProgress({ index, total, name })` is called before each file starts.
// Returns { ok, link, uploaded:[names], failed:[{name,error}] }.
async function uploadFolder(folder, onProgress) {
  if (!folder || !fs.existsSync(folder)) return { ok: false, error: 'session folder not found' };
  const names = (await fs.promises.readdir(folder, { withFileTypes: true }))
    .filter((d) => d.isFile() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  if (!names.length) return { ok: false, error: 'nothing to upload' };

  const servers = await listServers();
  const uploaded = [], failed = [];
  let link = '', token = '', folderId = '';

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    try { if (onProgress) onProgress({ index: i + 1, total: names.length, name }); } catch {}
    try {
      const d = await uploadWithFallback(servers, path.join(folder, name), { token, folderId });
      // The first upload defines the folder everything else joins.
      if (!link) {
        link = d.downloadPage || (d.parentFolderCode ? 'https://gofile.io/d/' + d.parentFolderCode : '');
        token = d.guestToken || '';
        folderId = d.parentFolder || '';
      }
      uploaded.push(name);
    } catch (e) {
      failed.push({ name, error: e.message });
    }
  }

  if (!link) return { ok: false, error: (failed[0] && failed[0].error) || 'upload failed', failed };
  return { ok: true, link, uploaded, failed };
}

module.exports = { uploadFolder };
