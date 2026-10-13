// Bridge to the Ace extension for VS Code (vscode-extension/). Ace listens on a
// local TCP port; the extension connects and reports the project: file list,
// the file being edited, every edit, saves, diagnostics and the git state
// (one JSON object per line each way, see vscode-extension/extension.js for
// the message types). Nothing is explained here: this module keeps the
// picture of the project and renders it as text for the answer prompt, with
// "what changed since the last report" worked out from the saved texts.
'use strict';
const net = require('net');
const path = require('path');

const MAX_EDIT_LOG = 400;        // recent edits kept (oldest dropped)
const MAX_SNAPSHOT_TEXT = 300000; // chars of saved file text kept per file
const TREE_CHARS = 6000;         // file tree in the prompt
const DIFF_CHARS = 14000;        // git diff in the prompt
const CHANGES_CHARS = 12000;     // "since last report" diffs in the prompt
const ACTIVE_CHARS = 9000;       // text around the cursor in the prompt
const FILE_CHARS = 12000;        // a requested file in the prompt

function createVscodeBridge({ log, onStatus, onEvent }) {
  let server = null;
  let client = null;             // the one connected extension
  let listening = 0;             // port, when listening
  let lastError = '';
  const requests = new Map();    // path -> [{resolve, timer}] waiting for a 'file'

  const project = {
    connected: false,
    name: '', root: '', clientVersion: '',
    files: [],                   // [{ path, size, language }]
    truncated: false,
    active: null,                // { path, language, lineCount, cursor, selection, text, from, to, at }
    git: null,                   // { branch, ahead, behind, changed:[], diff, recentCommits, noRepo, at }
    saved: new Map(),            // path -> { text, at, lineCount }   (latest save)
    reported: new Map(),         // path -> text as it was at the last report
    reportedAt: 0,
    edits: [],                   // [{ path, at, inserted, removed, lines }]
    diagnostics: new Map(),      // path -> items
    fetched: new Map(),          // path -> { text, at }  (answers to 'request file')
  };

  function status() {
    return {
      enabled: listening > 0, port: listening, connected: project.connected,
      name: project.name, root: project.root, files: project.files.length,
      active: project.active ? project.active.path : '',
      branch: project.git ? project.git.branch : '',
      changed: project.git ? project.git.changed.length : 0,
      editsSinceReport: project.edits.filter((e) => e.at > project.reportedAt).length,
      lastError,
    };
  }
  function emitStatus() { try { onStatus(status()); } catch {} }

  // ── Server ────────────────────────────────────────────────────────────────
  function start(port) {
    stop();
    lastError = '';
    server = net.createServer((sock) => {
      if (client) { try { sock.end(JSON.stringify({ type: 'error', message: 'another VS Code is already connected' }) + '\n'); } catch {} return; }
      client = sock;
      let buf = '';
      sock.setEncoding('utf8');
      sock.setNoDelay(true);
      sock.on('data', (chunk) => {
        buf += chunk;
        if (buf.length > 50 * 1024 * 1024) { buf = ''; return; }
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try { onMessage(JSON.parse(line)); } catch (e) { log('[vscode] bad message: ' + e.message); }
        }
      });
      const gone = () => {
        if (client !== sock) return;
        client = null;
        project.connected = false;
        for (const list of requests.values()) list.forEach((r) => { clearTimeout(r.timer); r.resolve(null); });
        requests.clear();
        log('[vscode] disconnected');
        emitStatus();
        try { onEvent({ type: 'disconnected' }); } catch {}
      };
      sock.on('close', gone);
      sock.on('error', (e) => { log('[vscode] socket error: ' + e.message); gone(); });
      send({ type: 'hello', app: 'ace', version: 1 });
    });
    server.on('error', (e) => {
      lastError = e.code === 'EADDRINUSE' ? `port ${port} is in use` : e.message;
      log('[vscode] server error: ' + lastError);
      listening = 0;
      emitStatus();
    });
    server.listen(port, '127.0.0.1', () => { listening = port; log('[vscode] listening on 127.0.0.1:' + port); emitStatus(); });
  }

  function stop() {
    if (client) { try { client.end(); } catch {} client = null; }
    if (server) { try { server.close(); } catch {} server = null; }
    listening = 0;
    project.connected = false;
    emitStatus();
  }

  function send(msg) {
    if (!client || client.destroyed) return false;
    try { client.write(JSON.stringify(msg) + '\n'); return true; } catch { return false; }
  }

  // ── Messages from the extension ───────────────────────────────────────────
  function onMessage(m) {
    if (!m || typeof m.type !== 'string') return;
    const now = Date.now();
    switch (m.type) {
      case 'hello':
        project.connected = true;
        project.clientVersion = String(m.version || '');
        project.name = String((m.workspace && m.workspace.name) || '');
        project.root = String((m.workspace && m.workspace.root) || '');
        log('[vscode] connected: ' + (project.name || '(no folder)') + ' ' + project.root);
        emitStatus();
        onEvent({ type: 'connected', name: project.name });
        break;
      case 'snapshot':
        project.root = String(m.root || project.root);
        project.files = Array.isArray(m.files) ? m.files.slice(0, 5000).map((f) => ({ path: String(f.path), size: Number(f.size) || 0, language: String(f.language || '') })) : [];
        project.truncated = !!m.truncated;
        if (!project.name && project.root) project.name = path.basename(project.root);
        emitStatus();
        break;
      case 'git':
        project.git = {
          branch: String(m.branch || ''), ahead: Number(m.ahead) || 0, behind: Number(m.behind) || 0,
          changed: Array.isArray(m.changed) ? m.changed.slice(0, 500) : [],
          diff: String(m.diff || '').slice(0, 200000), recentCommits: String(m.recentCommits || ''), noRepo: !!m.noRepo, at: now,
        };
        emitStatus();
        break;
      case 'active':
        project.active = { path: String(m.path || ''), language: String(m.language || ''), lineCount: Number(m.lineCount) || 0,
          cursor: m.cursor || { line: 0, character: 0 }, selection: String(m.selection || ''), text: String(m.text || '').slice(0, 60000),
          from: Number(m.from) || 0, to: Number(m.to) || 0, at: now };
        emitStatus();
        break;
      case 'edit': {
        const changes = Array.isArray(m.changes) ? m.changes : [];
        let inserted = 0, removed = 0;
        for (const c of changes) {
          inserted += String(c.text || '').length;
          if (c.start && c.end) removed += (c.end.line - c.start.line) * 40 + Math.max(0, c.end.character - c.start.character);
        }
        project.edits.push({ path: String(m.path || ''), at: now, inserted, removed, lines: changes.length ? changes[0].start.line + 1 : 0 });
        if (project.edits.length > MAX_EDIT_LOG) project.edits.splice(0, project.edits.length - MAX_EDIT_LOG);
        emitStatus();
        break;
      }
      case 'save':
        if (m.path && typeof m.text === 'string') {
          project.saved.set(String(m.path), { text: m.text.slice(0, MAX_SNAPSHOT_TEXT), at: now, lineCount: Number(m.lineCount) || 0 });
          if (!project.reported.has(String(m.path))) {
            // First save seen for this file: the base for "since last report"
            // is whatever git has, or nothing; keep the text itself as base
            // only once a report has been made.
          }
        }
        onEvent({ type: 'saved', path: m.path });
        emitStatus();
        break;
      case 'diagnostics':
        if (m.path) {
          const items = Array.isArray(m.items) ? m.items.slice(0, 50) : [];
          if (items.length) project.diagnostics.set(String(m.path), items); else project.diagnostics.delete(String(m.path));
        }
        break;
      case 'file': {
        const p = String(m.path || '');
        if (typeof m.text === 'string') project.fetched.set(p, { text: m.text, at: now });
        const list = requests.get(p);
        if (list) { requests.delete(p); list.forEach((r) => { clearTimeout(r.timer); r.resolve(typeof m.text === 'string' ? m.text : null); }); }
        break;
      }
      case 'bye':
        break;
      default:
        break;
    }
  }

  // Asks the extension for a file's text; null when it does not come in time.
  function requestFile(p, timeoutMs = 2500) {
    const open = project.saved.get(p);
    if (open) return Promise.resolve(open.text);
    if (!client) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const list = requests.get(p) || [];
        requests.set(p, list.filter((r) => r.resolve !== resolve));
        resolve(null);
      }, timeoutMs);
      const list = requests.get(p) || [];
      list.push({ resolve, timer });
      requests.set(p, list);
      send({ type: 'request', what: 'file', path: p });
    });
  }

  // ── Line diff (for "what changed since the last report") ──────────────────
  // Plain LCS on lines, good enough for the sizes kept here; big files are
  // summarised by counts instead.
  function lineDiff(a, b, maxLines = 4000) {
    const A = a.split('\n'), B = b.split('\n');
    if (A.length > maxLines || B.length > maxLines) return null;
    const n = A.length, m = B.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    let i = 0, j = 0, ctx = [];
    const flushCtx = () => { if (ctx.length) { out.push(...ctx.slice(-2).map((l) => '  ' + l)); ctx = []; } };
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { ctx.push(A[i]); i++; j++; if (ctx.length > 2) ctx.shift(); continue; }
      flushCtx();
      if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { out.push('+ ' + B[j]); j++; }
      else { out.push('- ' + A[i]); i++; }
    }
    return out;
  }

  function changesSinceReport() {
    const parts = [];
    for (const [p, cur] of project.saved) {
      const base = project.reported.get(p);
      if (base === undefined) { parts.push(`${p}: saved (${cur.lineCount} lines); no earlier version seen in this session, see the git diff.`); continue; }
      if (base === cur.text) continue;
      const d = lineDiff(base, cur.text);
      if (!d) { parts.push(`${p}: changed (large file, ${cur.lineCount} lines).`); continue; }
      const body = d.join('\n');
      parts.push(`${p}:\n${body.length > 3000 ? body.slice(0, 3000) + '\n[cut]' : body}`);
    }
    const unsaved = new Map();
    for (const e of project.edits) if (e.at > project.reportedAt) unsaved.set(e.path, (unsaved.get(e.path) || 0) + 1);
    const unsavedLines = [...unsaved].filter(([p]) => !project.saved.has(p) || project.saved.get(p).at < project.edits.filter((e) => e.path === p).slice(-1)[0].at)
      .map(([p, n]) => `${p}: ${n} edit${n === 1 ? '' : 's'} not saved yet`);
    return { saved: parts, unsaved: unsavedLines };
  }

  // Called once an answer about the project has been given: the texts of now
  // become the base for the next "since the last report".
  function markReported() {
    for (const [p, cur] of project.saved) project.reported.set(p, cur.text);
    project.reportedAt = Date.now();
    emitStatus();
  }

  // ── Text for the prompt ───────────────────────────────────────────────────
  function tree() {
    const byDir = new Map();
    for (const f of project.files) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(f.path.slice(f.path.lastIndexOf('/') + 1));
    }
    const lines = [];
    for (const [dir, names] of [...byDir].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(dir + '/  ' + (names.length > 40 ? names.slice(0, 40).join(', ') + ` … (+${names.length - 40})` : names.join(', ')));
    }
    let s = lines.join('\n');
    if (s.length > TREE_CHARS) s = s.slice(0, TREE_CHARS) + '\n[tree cut]';
    if (project.truncated) s += '\n[more files not listed]';
    return s;
  }

  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '\n[cut]' : s; }

  // The project as the model should see it. `question` lets files that are
  // named in it be included in full.
  async function promptBlock(question) {
    if (!project.connected && !project.files.length) return '';
    const g = project.git;
    const out = [];
    out.push(`PROJECT OPEN IN VS CODE: ${project.name || path.basename(project.root || '') || '(unnamed)'} at ${project.root}` + (project.connected ? '' : ' (VS Code is disconnected; this is the last state seen)'));
    out.push(`FILES (${project.files.length}):\n${tree()}`);
    if (g) {
      if (g.noRepo) out.push('GIT: not a git repository.');
      else {
        out.push(`GIT: branch ${g.branch || '?'}${g.ahead ? `, ${g.ahead} ahead` : ''}${g.behind ? `, ${g.behind} behind` : ''}; ${g.changed.length} changed file(s): ` +
          (g.changed.slice(0, 60).map((c) => `${c.status} ${c.path}`).join(', ') || 'none') +
          (g.recentCommits ? `\nRecent commits:\n${g.recentCommits}` : ''));
        if (g.diff) out.push(`UNCOMMITTED DIFF (git diff):\n${clip(g.diff, DIFF_CHARS)}`);
      }
    }
    const ch = changesSinceReport();
    if (project.reportedAt) {
      out.push(`CHANGES SINCE THE LAST REPORT (${new Date(project.reportedAt).toLocaleTimeString()}):\n` +
        (ch.saved.length || ch.unsaved.length ? clip(ch.saved.concat(ch.unsaved).join('\n\n'), CHANGES_CHARS) : 'nothing saved or edited since then.'));
    } else if (ch.saved.length || ch.unsaved.length) {
      out.push(`SAVED OR EDITED IN THIS SESSION:\n${clip(ch.saved.concat(ch.unsaved).join('\n\n'), CHANGES_CHARS)}`);
    }
    const a = project.active;
    if (a && a.path) {
      const sel = a.selection ? `\nSELECTED TEXT:\n${clip(a.selection, 3000)}` : '';
      out.push(`FILE BEING EDITED: ${a.path} (${a.language}, ${a.lineCount} lines), cursor at line ${a.cursor.line + 1}. Lines ${a.from + 1}-${a.to + 1}:\n${clip(a.text, ACTIVE_CHARS)}${sel}`);
    }
    if (project.diagnostics.size) {
      const d = [...project.diagnostics].slice(0, 10).map(([p, items]) => `${p}: ` + items.slice(0, 8).map((it) => `L${it.line + 1} ${it.severity}: ${it.message}`).join('; ')).join('\n');
      out.push(`PROBLEMS REPORTED BY VS CODE:\n${clip(d, 3000)}`);
    }
    // Files named in the question, in full when they are small enough. For a
    // status report (nothing asked) the files that say what the project is:
    // the README, package.json and the entry point it names.
    const asked = String(question || '').trim() ? filesNamedIn(question) : keyFiles();
    for (const p of asked.slice(0, 4)) {
      if (a && p === a.path && a.lineCount <= (a.to - a.from + 1)) continue;
      const text = await requestFile(p);
      if (text !== null) out.push(`FILE ${p}:\n${clip(text, FILE_CHARS)}`);
    }
    return out.join('\n\n');
  }

  function keyFiles() {
    const has = (p) => project.files.find((f) => f.path === p && f.size > 0 && f.size < 24 * 1024);
    const out = [];
    const readme = project.files.find((f) => /^readme(\.md|\.txt)?$/i.test(f.path) && f.size < 24 * 1024);
    if (readme) out.push(readme.path);
    const pkg = has('package.json');
    if (pkg) {
      out.push('package.json');
      const saved = project.saved.get('package.json') || project.fetched.get('package.json');
      try {
        const main = saved && JSON.parse(saved.text).main;
        if (typeof main === 'string' && has(main.replace(/^\.\//, ''))) out.push(main.replace(/^\.\//, ''));
      } catch {}
    }
    for (const cand of ['src/index.js', 'src/main.js', 'src/app.js', 'src/server.js', 'index.js', 'main.js', 'app.js', 'server.js', 'main.py', 'app.py', 'src/main.ts', 'src/index.ts', 'src/App.tsx', 'src/main.rs', 'main.go', 'cmd/main.go']) {
      if (out.length >= 4) break;
      if (has(cand) && !out.includes(cand)) out.push(cand);
    }
    return out;
  }

  function filesNamedIn(question) {
    const q = String(question || '');
    if (!q) return [];
    const hits = [];
    for (const f of project.files) {
      const base = f.path.slice(f.path.lastIndexOf('/') + 1);
      if (base.length >= 4 && (q.includes(f.path) || q.includes(base))) hits.push(f.path);
    }
    return [...new Set(hits)];
  }

  return { start, stop, status, promptBlock, markReported, requestFile, hasProject: () => project.connected || project.files.length > 0 };
}

module.exports = { createVscodeBridge };
