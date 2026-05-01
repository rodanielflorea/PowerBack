const {
  app, BrowserWindow, WebContentsView, ipcMain, globalShortcut, Menu,
  session, desktopCapturer, dialog, clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const STATE_FILE = path.join(app.getPath('userData'), 'state.json');
const DEFAULT_STATE = {
  x: null, y: null, width: 400, height: 700,
  opacity: 1.0, stealth: true,
  urls: [], currentUrlIndex: 0,
  transcription: {
    engine: 'openai',
    openaiApiKey: '',
    openaiModel: 'whisper-1',
    whisperExe: '',
    whisperModel: '',
    language: 'auto',
    micDeviceId: '',
    captureSystem: true,
    captureMic: true,
  },
};
const MIN_OPACITY = 0.05;
const MOVE_STEP = 40;
const OPACITY_STEP = 0.05;
const HEADER_H = 28;
const RAIL_W = 30;

let win;
let webView;
let state = { ...DEFAULT_STATE };

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      ...DEFAULT_STATE,
      ...raw,
      transcription: { ...DEFAULT_STATE.transcription, ...(raw.transcription || {}) },
    };
  } catch {
    state = { ...DEFAULT_STATE, transcription: { ...DEFAULT_STATE.transcription } };
  }
}

function saveState() {
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
    state.x = x; state.y = y;
    state.width = width; state.height = height;
    state.opacity = win.getOpacity();
  }
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {}
}

function layoutWebView() {
  if (!win || !webView) return;
  const [w, h] = win.getContentSize();
  webView.setBounds({
    x: RAIL_W,
    y: HEADER_H,
    width: Math.max(0, w - RAIL_W),
    height: Math.max(0, h - HEADER_H),
  });
}

function placeholderUrl() {
  const html = `<!doctype html><html><head><style>
    body { font-family: -apple-system, "Segoe UI", sans-serif; color: #71717a;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0; background: #fff; font-size: 13px; text-align: center; padding: 20px; }
  </style></head><body>No URLs yet.<br>Open settings (gear icon on the left) to add one.</body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function loadCurrentUrl() {
  if (!webView) return;
  const url = state.urls[state.currentUrlIndex];
  webView.webContents.loadURL(url || placeholderUrl());
}

function ensureWebView() {
  if (webView || !win) return;
  webView = new WebContentsView();
  webView.setBackgroundColor('#ffffff');
  webView.webContents.setUserAgent(
    webView.webContents.getUserAgent().replace(/\s?Electron\/\S+/, '')
  );
  win.contentView.addChildView(webView);
  layoutWebView();
  loadCurrentUrl();
}

function createWindow() {
  loadState();

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') callback(true);
    else callback(false);
  });
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources[0]) callback({ video: sources[0], audio: 'loopback' });
      else callback({});
    });
  }, { useSystemPicker: false });

  win = new BrowserWindow({
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    width: state.width,
    height: state.height,
    useContentSize: true,
    frame: false,
    backgroundColor: '#ffffff',
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setContentProtection(state.stealth);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(Math.max(MIN_OPACITY, state.opacity));
  win.setMenuBarVisibility(false);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    ensureWebView();
  });

  win.on('move', saveState);
  win.on('resize', () => { layoutWebView(); saveState(); });
  win.on('closed', () => { win = null; webView = null; });
}

function setOpacity(value) {
  if (!win) return;
  const v = Math.max(MIN_OPACITY, Math.min(1, value));
  win.setOpacity(v);
  saveState();
  win.webContents.send('opacity-changed', v);
}

function nudge(dx, dy) {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide(); else win.show();
}

function setStealth(value) {
  if (!win) return;
  state.stealth = !!value;
  win.setContentProtection(state.stealth);
  saveState();
  win.webContents.send('stealth-changed', state.stealth);
}

function showUrlMenu() {
  if (!win) return;
  const items = state.urls.length === 0
    ? [{ label: 'No URLs — open settings to add', enabled: false }]
    : state.urls.map((url, i) => ({
        label: url.length > 60 ? url.slice(0, 57) + '...' : url,
        type: 'checkbox',
        checked: i === state.currentUrlIndex,
        click: () => {
          state.currentUrlIndex = i;
          loadCurrentUrl();
          saveState();
        },
      }));
  Menu.buildFromTemplate(items).popup({ window: win, x: RAIL_W + 2, y: HEADER_H + 2 });
}

let pasteQueue = Promise.resolve();
function pasteToForeground(text) {
  if (!text || !text.trim()) return Promise.resolve();
  pasteQueue = pasteQueue.then(() => new Promise((resolve) => {
    clipboard.writeText(text);
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
    ], { windowsHide: true });
    ps.on('exit', () => resolve());
    ps.on('error', () => resolve());
  }));
  return pasteQueue;
}

async function transcribeOpenAi(wavBuffer, cfg) {
  if (!cfg.openaiApiKey) throw new Error('OpenAI API key not set');
  const boundary = '----stealth' + Date.now();
  const headerStr =
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${cfg.openaiModel || 'whisper-1'}\r\n` +
    (cfg.language && cfg.language !== 'auto'
      ? `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${cfg.language}\r\n`
      : '') +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
  const footerStr = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(headerStr, 'utf8'),
    Buffer.from(wavBuffer),
    Buffer.from(footerStr, 'utf8'),
  ]);
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.openaiApiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`OpenAI ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  return (data.text || '').trim();
}

async function transcribeLocal(wavBuffer, cfg) {
  if (!cfg.whisperExe) throw new Error('whisper.exe path not set');
  if (!cfg.whisperModel) throw new Error('whisper model path not set');
  const tmpBase = path.join(os.tmpdir(), `stealth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const wavPath = tmpBase + '.wav';
  const outBase = tmpBase;
  const outTxt = outBase + '.txt';
  await fs.promises.writeFile(wavPath, Buffer.from(wavBuffer));
  const args = [
    '-m', cfg.whisperModel,
    '-f', wavPath,
    '-otxt', '-of', outBase,
    '-nt', '--no-prints',
  ];
  if (cfg.language && cfg.language !== 'auto') args.push('-l', cfg.language);
  return new Promise((resolve, reject) => {
    const p = spawn(cfg.whisperExe, args, { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', (e) => reject(e));
    p.on('exit', async (code) => {
      try {
        if (code !== 0) {
          await fs.promises.unlink(wavPath).catch(() => {});
          return reject(new Error(`whisper exit ${code}: ${stderr.slice(-200)}`));
        }
        const txt = await fs.promises.readFile(outTxt, 'utf8').catch(() => '');
        await fs.promises.unlink(wavPath).catch(() => {});
        await fs.promises.unlink(outTxt).catch(() => {});
        resolve(txt.trim());
      } catch (e) { reject(e); }
    });
  });
}

let transcribeQueue = Promise.resolve('');
function enqueueTranscribe(wavBuffer) {
  const cfg = state.transcription;
  transcribeQueue = transcribeQueue.then(async () => {
    if (cfg.engine === 'local') return transcribeLocal(wavBuffer, cfg);
    return transcribeOpenAi(wavBuffer, cfg);
  });
  return transcribeQueue;
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register('Ctrl+Alt+H', toggleVisible);
  globalShortcut.register('Ctrl+Alt+Left', () => nudge(-MOVE_STEP, 0));
  globalShortcut.register('Ctrl+Alt+Right', () => nudge(MOVE_STEP, 0));
  globalShortcut.register('Ctrl+Alt+Up', () => nudge(0, -MOVE_STEP));
  globalShortcut.register('Ctrl+Alt+Down', () => nudge(0, MOVE_STEP));
  globalShortcut.register('Ctrl+Alt+]', () => setOpacity((win?.getOpacity() ?? 1) + OPACITY_STEP));
  globalShortcut.register('Ctrl+Alt+[', () => setOpacity((win?.getOpacity() ?? 1) - OPACITY_STEP));
});

ipcMain.handle('set-opacity', (_e, value) => setOpacity(value));
ipcMain.handle('get-opacity', () => win?.getOpacity() ?? 1);
ipcMain.handle('set-stealth', (_e, value) => setStealth(value));
ipcMain.handle('get-stealth', () => state.stealth);
ipcMain.handle('hide', () => win?.hide());
ipcMain.handle('quit', () => app.quit());
ipcMain.handle('get-urls', () => ({ urls: state.urls.slice(), currentIndex: state.currentUrlIndex }));
ipcMain.handle('set-urls', (_e, urls) => {
  state.urls = Array.isArray(urls) ? urls.filter(u => typeof u === 'string' && u.trim()) : [];
  if (state.currentUrlIndex >= state.urls.length) state.currentUrlIndex = 0;
  saveState();
  loadCurrentUrl();
});
ipcMain.handle('show-url-menu', () => showUrlMenu());
ipcMain.handle('set-webview-visible', (_e, visible) => {
  if (webView) webView.setVisible(!!visible);
});

ipcMain.handle('get-transcription-config', () => ({ ...state.transcription }));
ipcMain.handle('set-transcription-config', (_e, cfg) => {
  state.transcription = { ...state.transcription, ...(cfg || {}) };
  saveState();
});
ipcMain.handle('transcribe', async (_e, wavArrayBuffer) => {
  return enqueueTranscribe(wavArrayBuffer);
});
ipcMain.handle('paste-text', (_e, text) => pasteToForeground(text));
ipcMain.handle('pick-file', async (_e, kind) => {
  const filters = kind === 'exe'
    ? [{ name: 'Executable', extensions: ['exe'] }]
    : kind === 'model'
      ? [{ name: 'Whisper model', extensions: ['bin', 'gguf', 'ggml'] }, { name: 'All', extensions: ['*'] }]
      : [{ name: 'All', extensions: ['*'] }];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
