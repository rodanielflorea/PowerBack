// Ace for VS Code. Connects to the Ace desktop app over a local socket and
// keeps it in step with the project: the file tree, the file being edited,
// every edit as it happens, saves, and the git state. Ace does the explaining;
// this side only reports.
//
// Wire format: one JSON object per line, both directions, over plain TCP
// (no dependencies on either side). Ace listens; this side connects and
// keeps retrying while Ace is not running.
//
//   -> hello      { client, version, workspace:{ name, root } }
//   -> snapshot   { root, files:[{ path, size, language }], truncated }
//   -> git        { branch, changed:[{ path, status }], diff, ahead, behind }
//   -> active     { path, language, lineCount, cursor:{ line, character }, selection, text, from, to }
//   -> edit       { path, language, version, changes:[{ start, end, text }], lineCount }
//   -> save       { path, language, text | tooBig:true, lineCount }
//   -> diagnostics{ path, items:[{ severity, line, message }] }
//   -> file       { path, text | tooBig:true | missing:true }      (answer to a request)
//   -> bye        {}
//   <- request    { what:'file', path } | { what:'git' } | { what:'snapshot' }
//   <- hello      { app, version }

const vscode = require('vscode');
const net = require('net');
const path = require('path');
const { execFile } = require('child_process');

const CLIENT_VERSION = '0.1.0';
const EDIT_FLUSH_MS = 300;        // edits are batched per file for this long
const ACTIVE_FLUSH_MS = 400;      // cursor moves are reported at most this often
const GIT_FLUSH_MS = 1500;        // git is read at most this often after a save
const RETRY_MS = 3000;            // while Ace is not running
const CONTEXT_LINES = 80;         // lines around the cursor sent with "active"
const MAX_FILES = 4000;           // files listed in a snapshot
const MAX_DIFF_CHARS = 60000;

let socket = null;
let wantConnection = false;
let retryTimer = null;
let statusItem = null;
let output = null;
let disposables = [];
const pendingEdits = new Map();   // path -> { timer, changes, doc }
let activeTimer = null;
let gitTimer = null;
let buffered = '';

function cfg() { return vscode.workspace.getConfiguration('ace'); }
function log(msg) { if (output) output.appendLine(new Date().toISOString().slice(11, 19) + ' ' + msg); }

function workspaceRoot() {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri.fsPath : null;
}
function rel(uri) {
  const root = workspaceRoot();
  const p = uri.fsPath || String(uri);
  if (root && p.startsWith(root)) return p.slice(root.length).replace(/^[\\/]/, '').split(path.sep).join('/');
  return p.split(path.sep).join('/');
}
function excluded(relPath) {
  const pats = cfg().get('exclude') || [];
  return pats.some((g) => globMatch(g, relPath));
}
// A small glob: ** = any path, * = within one segment, ? = one char.
function globMatch(glob, p) {
  const re = '^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$';
  return new RegExp(re).test(p);
}
function tooBig(doc) { return Buffer.byteLength(doc.getText(), 'utf8') > (cfg().get('maxFileKB') || 200) * 1024; }

// ── Connection ──────────────────────────────────────────────────────────────
function connected() { return !!socket && !socket.destroyed && socket.writable; }

function send(msg) {
  if (!connected()) return false;
  try { socket.write(JSON.stringify(msg) + '\n'); return true; } catch (e) { log('send failed: ' + e.message); return false; }
}

function connect() {
  wantConnection = true;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (connected()) return;
  const host = cfg().get('host') || '127.0.0.1';
  const port = cfg().get('port') || 2010;
  setStatus('connecting');
  const s = net.createConnection({ host, port });
  s.setNoDelay(true);
  s.setEncoding('utf8');
  s.on('connect', () => {
    socket = s;
    buffered = '';
    setStatus('connected');
    log('connected to Ace at ' + host + ':' + port);
    send({ type: 'hello', client: 'vscode', version: CLIENT_VERSION, workspace: { name: vscode.workspace.name || '', root: workspaceRoot() } });
    sendSnapshot();
    sendGit();
    sendActive();
  });
  s.on('data', (chunk) => {
    buffered += chunk;
    let i;
    while ((i = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, i).trim();
      buffered = buffered.slice(i + 1);
      if (line) { try { onMessage(JSON.parse(line)); } catch (e) { log('bad message from Ace: ' + e.message); } }
    }
  });
  const gone = (why) => {
    if (socket === s) socket = null;
    if (!wantConnection) { setStatus('off'); return; }
    setStatus('waiting');
    if (why) log(why);
    if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; if (wantConnection) connect(); }, RETRY_MS);
  };
  s.on('error', (e) => gone(e.code === 'ECONNREFUSED' ? '' : 'connection error: ' + e.message));
  s.on('close', () => gone(''));
}

function disconnect() {
  wantConnection = false;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (connected()) { send({ type: 'bye' }); try { socket.end(); } catch {} }
  socket = null;
  setStatus('off');
}

function onMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'hello') { log('Ace ' + (msg.version || '') + ' says hello'); return; }
  if (msg.type !== 'request') return;
  if (msg.what === 'snapshot') { sendSnapshot(); return; }
  if (msg.what === 'git') { sendGit(); return; }
  if (msg.what === 'file' && typeof msg.path === 'string') { sendFile(msg.path); return; }
}

// ── What is sent ────────────────────────────────────────────────────────────
async function sendSnapshot() {
  const root = workspaceRoot();
  if (!root || !connected()) return;
  const exclude = '{' + (cfg().get('exclude') || []).join(',') + '}';
  let uris = [];
  try { uris = await vscode.workspace.findFiles('**/*', exclude, MAX_FILES + 1); } catch (e) { log('listing files failed: ' + e.message); }
  const files = [];
  for (const u of uris.slice(0, MAX_FILES)) {
    let size = 0;
    try { size = (await vscode.workspace.fs.stat(u)).size; } catch {}
    files.push({ path: rel(u), size, language: languageOf(u.fsPath) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  send({ type: 'snapshot', root, files, truncated: uris.length > MAX_FILES });
}

function languageOf(fsPath) {
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === fsPath);
  if (doc) return doc.languageId;
  const ext = path.extname(fsPath).slice(1).toLowerCase();
  return ext || 'plaintext';
}

function sendActive() {
  if (activeTimer) return;
  activeTimer = setTimeout(() => {
    activeTimer = null;
    const ed = vscode.window.activeTextEditor;
    if (!ed || !connected()) return;
    const doc = ed.document;
    if (doc.uri.scheme !== 'file') return;
    const p = rel(doc.uri);
    if (excluded(p)) return;
    const line = ed.selection.active.line;
    const from = Math.max(0, line - CONTEXT_LINES);
    const to = Math.min(doc.lineCount - 1, line + CONTEXT_LINES);
    const text = doc.getText(new vscode.Range(from, 0, to, doc.lineAt(to).text.length));
    const sel = ed.selection.isEmpty ? '' : doc.getText(ed.selection).slice(0, 4000);
    send({
      type: 'active', path: p, language: doc.languageId, lineCount: doc.lineCount,
      cursor: { line, character: ed.selection.active.character }, selection: sel, text, from, to,
    });
  }, ACTIVE_FLUSH_MS);
}

function queueEdit(e) {
  const doc = e.document;
  if (doc.uri.scheme !== 'file' || !e.contentChanges.length) return;
  const p = rel(doc.uri);
  if (excluded(p)) return;
  let pend = pendingEdits.get(p);
  if (!pend) { pend = { changes: [], timer: null, doc }; pendingEdits.set(p, pend); }
  pend.doc = doc;
  for (const c of e.contentChanges) {
    pend.changes.push({
      start: { line: c.range.start.line, character: c.range.start.character },
      end: { line: c.range.end.line, character: c.range.end.character },
      text: c.text.length > 20000 ? c.text.slice(0, 20000) : c.text,
    });
  }
  if (!pend.timer) {
    pend.timer = setTimeout(() => {
      pendingEdits.delete(p);
      if (!connected()) return;
      send({ type: 'edit', path: p, language: pend.doc.languageId, version: pend.doc.version, changes: pend.changes.slice(0, 200), lineCount: pend.doc.lineCount });
      sendActive();
    }, EDIT_FLUSH_MS);
  }
}

function sendSave(doc) {
  if (doc.uri.scheme !== 'file' || !connected()) return;
  const p = rel(doc.uri);
  if (excluded(p)) return;
  const big = tooBig(doc);
  send({ type: 'save', path: p, language: doc.languageId, lineCount: doc.lineCount, ...(big ? { tooBig: true } : { text: doc.getText() }) });
  scheduleGit();
}

async function sendFile(p) {
  const root = workspaceRoot();
  if (!root) return;
  if (p.includes('..') || path.isAbsolute(p) || excluded(p)) { send({ type: 'file', path: p, missing: true }); return; }
  const uri = vscode.Uri.file(path.join(root, p));
  try {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uri.fsPath);
    if (open) { send({ type: 'file', path: p, ...(tooBig(open) ? { tooBig: true } : { text: open.getText() }) }); return; }
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > (cfg().get('maxFileKB') || 200) * 1024) { send({ type: 'file', path: p, tooBig: true }); return; }
    const bytes = await vscode.workspace.fs.readFile(uri);
    send({ type: 'file', path: p, text: Buffer.from(bytes).toString('utf8') });
  } catch {
    send({ type: 'file', path: p, missing: true });
  }
}

function sendDiagnostics(uris) {
  if (!connected()) return;
  for (const u of uris) {
    if (u.scheme !== 'file') continue;
    const p = rel(u);
    if (excluded(p)) continue;
    const items = vscode.languages.getDiagnostics(u)
      .filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning)
      .slice(0, 50)
      .map((d) => ({ severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning', line: d.range.start.line, message: String(d.message).slice(0, 300) }));
    send({ type: 'diagnostics', path: p, items });
  }
}

// ── Git ─────────────────────────────────────────────────────────────────────
function scheduleGit() {
  if (gitTimer) return;
  gitTimer = setTimeout(() => { gitTimer = null; sendGit(); }, GIT_FLUSH_MS);
}

function git(args, root) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: root, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
}

async function sendGit() {
  const root = workspaceRoot();
  if (!root || !connected()) return;
  const status = await git(['status', '--porcelain=v1', '--branch'], root);
  if (status === null) { send({ type: 'git', branch: '', changed: [], diff: '', noRepo: true }); return; }
  const lines = status.split('\n').filter(Boolean);
  let branch = '', ahead = 0, behind = 0;
  // "## main...origin/main [ahead 1, behind 2]" / "## main" / "## No commits yet on main"
  const head = (lines.shift() || '').slice(3);
  branch = head.split(' ')[0].split('...')[0];
  if (/^No commits yet on /.test(head)) branch = head.replace(/^No commits yet on /, '');
  const a = head.match(/ahead (\d+)/), b = head.match(/behind (\d+)/);
  ahead = a ? Number(a[1]) : 0; behind = b ? Number(b[1]) : 0;
  const changed = lines.slice(0, 500).map((l) => ({ status: l.slice(0, 2).trim() || '??', path: l.slice(3).replace(/^"|"$/g, '') })).filter((c) => !excluded(c.path));
  let diff = (await git(['diff', '--no-color', '--stat=120', '--patch', '--', '.'], root)) || '';
  // New files are not in "git diff"; their text is added as a new-file patch.
  const untracked = changed.filter((c) => c.status === '??').map((c) => c.path);
  for (const u of untracked.slice(0, 20)) {
    if (u.endsWith('/')) continue;
    try {
      const uri = vscode.Uri.file(path.join(root, u));
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > 64 * 1024) { diff += `\n--- new file: ${u} (${stat.size} bytes, not shown)\n`; continue; }
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      if (/\u0000/.test(text)) { diff += `\n--- new file: ${u} (binary)\n`; continue; }
      diff += `\n--- new file: ${u}\n` + text.split('\n').map((l) => '+' + l).join('\n') + '\n';
    } catch {}
  }
  if (diff.length > MAX_DIFF_CHARS) diff = diff.slice(0, MAX_DIFF_CHARS) + '\n[diff truncated]';
  const last = (await git(['log', '-5', '--format=%h %ad %s', '--date=short'], root)) || '';
  send({ type: 'git', branch, ahead, behind, changed, diff, recentCommits: last.trim() });
}

// ── Status bar ──────────────────────────────────────────────────────────────
function setStatus(state) {
  if (!statusItem) return;
  const show = cfg().get('showStatusBar') !== false;
  if (!show) { statusItem.hide(); return; }
  const icon = { connected: '$(plug)', connecting: '$(sync~spin)', waiting: '$(debug-disconnect)', off: '$(circle-slash)' }[state] || '$(plug)';
  statusItem.text = icon + ' Ace';
  statusItem.tooltip = {
    connected: 'Ace: connected. Click to disconnect.',
    connecting: 'Ace: connecting…',
    waiting: 'Ace: not running, retrying. Click to stop.',
    off: 'Ace: off. Click to connect.',
  }[state] || 'Ace';
  statusItem.command = (state === 'off') ? 'ace.connect' : 'ace.disconnect';
  statusItem.show();
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
function activate(context) {
  output = vscode.window.createOutputChannel('Ace');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  context.subscriptions.push(output, statusItem);
  disposables = [
    vscode.commands.registerCommand('ace.connect', () => connect()),
    vscode.commands.registerCommand('ace.disconnect', () => disconnect()),
    vscode.commands.registerCommand('ace.resync', () => { sendSnapshot(); sendGit(); sendActive(); }),
    vscode.workspace.onDidChangeTextDocument(queueEdit),
    vscode.workspace.onDidSaveTextDocument(sendSave),
    vscode.window.onDidChangeActiveTextEditor(() => sendActive()),
    vscode.window.onDidChangeTextEditorSelection(() => sendActive()),
    vscode.languages.onDidChangeDiagnostics((e) => sendDiagnostics(e.uris)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { sendSnapshot(); sendGit(); }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ace.showStatusBar')) setStatus(connected() ? 'connected' : (wantConnection ? 'waiting' : 'off'));
      if ((e.affectsConfiguration('ace.host') || e.affectsConfiguration('ace.port')) && wantConnection) { disconnect(); connect(); }
    }),
  ];
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  let snapTimer = null;
  const resnap = () => { if (!snapTimer) snapTimer = setTimeout(() => { snapTimer = null; sendSnapshot(); scheduleGit(); }, 2000); };
  watcher.onDidCreate(resnap); watcher.onDidDelete(resnap);
  disposables.push(watcher);
  context.subscriptions.push(...disposables);
  setStatus('off');
  if (cfg().get('autoConnect') !== false) connect();
}

function deactivate() {
  for (const p of pendingEdits.values()) clearTimeout(p.timer);
  pendingEdits.clear();
  disconnect();
}

module.exports = { activate, deactivate };
