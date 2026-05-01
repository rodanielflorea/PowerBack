const {
  app, BrowserWindow, WebContentsView, ipcMain, globalShortcut, Menu,
  session, desktopCapturer, dialog, clipboard, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const STATE_FILE = path.join(app.getPath('userData'), 'state.json');
const CAPTURE_EXE = path.join(__dirname, 'caption2text', 'Capture2Text_CLI.exe');

const HOTKEY_DEFAULTS = {
  toggleVisibility: 'Ctrl+Alt+H',
  moveLeft: 'Ctrl+Alt+Left',
  moveRight: 'Ctrl+Alt+Right',
  moveUp: 'Ctrl+Alt+Up',
  moveDown: 'Ctrl+Alt+Down',
  opacityUp: 'Ctrl+Alt+]',
  opacityDown: 'Ctrl+Alt+[',
  scrollUp: 'Ctrl+Up',
  scrollDown: 'Ctrl+Down',
  resetCaptureArea: 'Ctrl+Q',
  reloadSite: '',
  toggleStealth: '',
  toggleRecording: '',
};

const DEFAULT_STATE = {
  x: null, y: null, width: 400, height: 700,
  opacity: 1.0, stealth: true,
  urls: [], currentUrlIndex: 0,
  mode: 'voice',
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
  capture: {
    rect: null,
    language: 'English',
    pollMs: 700,
  },
  hotkeys: { ...HOTKEY_DEFAULTS },
};

const MIN_OPACITY = 0.05;
const MOVE_STEP = 40;
const OPACITY_STEP = 0.05;
const SCROLL_STEP = 300;
const HEADER_H = 28;
const RAIL_W = 30;

let win;
let webView;
let selectorWin = null;
let captureLoop = null;
let pastedHistory = [];
let pendingRestart = false;
let state = { ...DEFAULT_STATE };

const MAX_HISTORY_WORDS = 500;
const WINDOW_K = 4;

function normalizeWord(w) {
  return w.toLowerCase().replace(/[^\w']/g, '');
}

function smartDiff(curr) {
  if (!curr) return '';
  const currWords = curr.split(/\s+/).filter(Boolean);
  if (currWords.length === 0) return '';

  if (pastedHistory.length === 0) {
    pastedHistory = currWords.slice(-MAX_HISTORY_WORDS);
    return curr;
  }

  const histNorm = pastedHistory.map(normalizeWord);
  const currNorm = currWords.map(normalizeWord);

  let prefixMatch = 0;
  const maxN = Math.min(histNorm.length, currNorm.length);
  for (let n = maxN; n >= 2; n--) {
    let m = true;
    for (let i = 0; i < n; i++) {
      if (histNorm[histNorm.length - n + i] !== currNorm[i]) { m = false; break; }
    }
    if (m) { prefixMatch = n; break; }
  }

  let windowMatch = 0;
  if (currNorm.length >= WINDOW_K && histNorm.length >= WINDOW_K) {
    const wset = new Set();
    for (let i = 0; i + WINDOW_K <= histNorm.length; i++) {
      wset.add(histNorm.slice(i, i + WINDOW_K).join(' '));
    }
    for (let i = 0; i + WINDOW_K <= currNorm.length; i++) {
      if (wset.has(currNorm.slice(i, i + WINDOW_K).join(' '))) {
        windowMatch = i + WINDOW_K;
      }
    }
  }

  const skipTo = Math.max(prefixMatch, windowMatch);
  if (skipTo >= currWords.length) return '';

  const newWords = currWords.slice(skipTo);
  pastedHistory = pastedHistory.concat(newWords).slice(-MAX_HISTORY_WORDS);
  return ' ' + newWords.join(' ');
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      ...DEFAULT_STATE,
      ...raw,
      transcription: { ...DEFAULT_STATE.transcription, ...(raw.transcription || {}) },
      capture: { ...DEFAULT_STATE.capture, ...(raw.capture || {}) },
      hotkeys: { ...HOTKEY_DEFAULTS, ...(raw.hotkeys || {}) },
    };
  } catch {
    state = {
      ...DEFAULT_STATE,
      transcription: { ...DEFAULT_STATE.transcription },
      capture: { ...DEFAULT_STATE.capture },
      hotkeys: { ...HOTKEY_DEFAULTS },
    };
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

function reloadWebView() {
  if (!webView) return;
  webView.setVisible(true);
  layoutWebView();
  webView.webContents.reload();
}

function scrollWebview(dy) {
  if (!webView) return;
  const code = `(function(dy){
    function findScrollable(){
      let best=null,bestSize=0;
      const all=document.querySelectorAll('*');
      for(const el of all){
        const cs=getComputedStyle(el);
        if((cs.overflowY==='auto'||cs.overflowY==='scroll')&&el.scrollHeight>el.clientHeight+4){
          const size=el.clientWidth*el.clientHeight;
          if(size>bestSize){best=el;bestSize=size;}
        }
      }
      return best;
    }
    const t=findScrollable()||document.scrollingElement||document.documentElement;
    t.scrollBy({top:dy,behavior:'smooth'});
  })(${dy});`;
  webView.webContents.executeJavaScript(code).catch(() => {});
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

async function injectIntoChat(text) {
  if (!webView || !text) return false;
  const code = `(function(text){
    const selectors=[
      '#prompt-textarea',
      'div[contenteditable="true"][role="textbox"]',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][data-testid*="input"]',
      'textarea[data-testid*="input"]',
      'textarea[autofocus]',
      'main textarea',
      'textarea',
      '[contenteditable="true"]'
    ];
    let el=null;
    for(const sel of selectors){
      const c=document.querySelector(sel);
      if(c&&c.offsetParent!==null){el=c;break;}
    }
    if(!el)return 'no-input';
    el.focus();
    if(el.tagName==='TEXTAREA'||el.tagName==='INPUT'){
      const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value').set;
      const newVal=(el.value||'')+text;
      setter.call(el,newVal);
      el.dispatchEvent(new InputEvent('input',{bubbles:true,data:text,inputType:'insertText'}));
      try{el.selectionStart=el.selectionEnd=newVal.length;}catch(e){}
      return 'textarea';
    } else {
      const sel=window.getSelection();
      const r=document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('insertText',false,text);
      return 'editable';
    }
  })(${JSON.stringify(text)});`;
  try {
    const r = await webView.webContents.executeJavaScript(code);
    return r !== 'no-input';
  } catch (e) {
    return false;
  }
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

function runOcr(rect, language) {
  return new Promise((resolve, reject) => {
    const sf = rect.scaleFactor || 1;
    const x1 = Math.round(rect.x1 * sf);
    const y1 = Math.round(rect.y1 * sf);
    const x2 = Math.round(rect.x2 * sf);
    const y2 = Math.round(rect.y2 * sf);
    const args = [
      '--screen-rect', `${x1} ${y1} ${x2} ${y2}`,
      '-l', language || 'English',
    ];
    const p = spawn(CAPTURE_EXE, args, { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve(out.replace(/\r/g, '').trim());
      else reject(new Error(`OCR exit ${code}: ${err.slice(-200)}`));
    });
  });
}

let ocrInFlight = false;
async function captureTick() {
  if (ocrInFlight) return;
  const cfg = state.capture;
  if (!cfg.rect) return;
  ocrInFlight = true;
  try {
    const text = await runOcr(cfg.rect, cfg.language);
    if (text) {
      const newPart = smartDiff(text);
      const trimmed = newPart.trim();
      if (trimmed) {
        await injectIntoChat(newPart);
        if (win) win.webContents.send('capture-text', trimmed);
      }
    }
  } catch (e) {
    if (win) win.webContents.send('capture-error', e.message);
  } finally {
    ocrInFlight = false;
  }
}

function startCaptureLoop() {
  if (captureLoop) return;
  if (!state.capture.rect) {
    if (win) win.webContents.send('capture-error', 'No capture area selected');
    return;
  }
  pastedHistory = [];
  const period = Math.max(200, state.capture.pollMs || 700);
  captureLoop = setInterval(captureTick, period);
  captureTick();
  if (win) win.webContents.send('capture-state', true);
}

function triggerResetCaptureArea() {
  const wasRunning = !!captureLoop;
  if (wasRunning) {
    stopCaptureLoop();
    pendingRestart = true;
  }
  openAreaSelector();
}

function stopCaptureLoop() {
  if (captureLoop) clearInterval(captureLoop);
  captureLoop = null;
  if (win) win.webContents.send('capture-state', false);
}

function openAreaSelector() {
  if (selectorWin) return;
  if (!win) return;
  const wasVisible = win.isVisible();
  win.hide();
  setTimeout(() => {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    selectorWin = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-selector.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    selectorWin.setAlwaysOnTop(true, 'screen-saver');
    selectorWin.loadFile(path.join(__dirname, 'renderer', 'selector.html'));
    selectorWin.once('ready-to-show', () => selectorWin.show());
    selectorWin.on('closed', () => {
      selectorWin = null;
      if (wasVisible && win) win.show();
      if (webView) {
        webView.setVisible(true);
        layoutWebView();
      }
      if (win) win.webContents.send('selector-closed');
    });
  }, 150);
}

ipcMain.on('selector-done', (_e, rect) => {
  if (rect && selectorWin) {
    const [winX, winY] = selectorWin.getPosition();
    const display = screen.getDisplayMatching(selectorWin.getBounds());
    const sf = display ? display.scaleFactor : 1;
    state.capture.rect = {
      x1: rect.x1 + winX,
      y1: rect.y1 + winY,
      x2: rect.x2 + winX,
      y2: rect.y2 + winY,
      scaleFactor: sf,
    };
    saveState();
    if (win) win.webContents.send('capture-rect-changed', state.capture.rect);
  }
  if (selectorWin) selectorWin.close();
  if (pendingRestart) {
    pendingRestart = false;
    setTimeout(() => startCaptureLoop(), 400);
  }
});

ipcMain.on('selector-cancel', () => {
  if (selectorWin) selectorWin.close();
  if (pendingRestart) {
    pendingRestart = false;
    setTimeout(() => startCaptureLoop(), 400);
  }
});

const HOTKEY_HANDLERS = {
  toggleVisibility: () => toggleVisible(),
  moveLeft: () => nudge(-MOVE_STEP, 0),
  moveRight: () => nudge(MOVE_STEP, 0),
  moveUp: () => nudge(0, -MOVE_STEP),
  moveDown: () => nudge(0, MOVE_STEP),
  opacityUp: () => setOpacity((win?.getOpacity() ?? 1) + OPACITY_STEP),
  opacityDown: () => setOpacity((win?.getOpacity() ?? 1) - OPACITY_STEP),
  scrollUp: () => scrollWebview(-SCROLL_STEP),
  scrollDown: () => scrollWebview(SCROLL_STEP),
  resetCaptureArea: () => triggerResetCaptureArea(),
  reloadSite: () => reloadWebView(),
  toggleStealth: () => setStealth(!state.stealth),
  toggleRecording: () => { if (win) win.webContents.send('toggle-recording'); },
};

const hotkeyFailures = {};
function registerHotkeys() {
  globalShortcut.unregisterAll();
  for (const action of Object.keys(HOTKEY_HANDLERS)) {
    delete hotkeyFailures[action];
    const combo = state.hotkeys[action];
    if (!combo) continue;
    try {
      const ok = globalShortcut.register(combo, HOTKEY_HANDLERS[action]);
      if (!ok) hotkeyFailures[action] = 'register failed (in use?)';
    } catch (e) {
      hotkeyFailures[action] = e.message;
    }
  }
  if (win) win.webContents.send('hotkeys-changed', { current: { ...state.hotkeys }, failures: { ...hotkeyFailures } });
}

app.whenReady().then(() => {
  createWindow();
  registerHotkeys();
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
ipcMain.handle('reload-webview', () => reloadWebView());
ipcMain.handle('set-webview-visible', (_e, visible) => {
  if (webView) webView.setVisible(!!visible);
});

ipcMain.handle('get-mode', () => state.mode);
ipcMain.handle('set-mode', (_e, mode) => {
  if (mode === 'voice' || mode === 'caption') {
    state.mode = mode;
    saveState();
  }
});

ipcMain.handle('get-transcription-config', () => ({ ...state.transcription }));
ipcMain.handle('set-transcription-config', (_e, cfg) => {
  state.transcription = { ...state.transcription, ...(cfg || {}) };
  saveState();
});
ipcMain.handle('transcribe', async (_e, wavArrayBuffer) => enqueueTranscribe(wavArrayBuffer));
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

ipcMain.handle('get-capture-config', () => ({ ...state.capture }));
ipcMain.handle('set-capture-config', (_e, cfg) => {
  state.capture = { ...state.capture, ...(cfg || {}) };
  saveState();
});
ipcMain.handle('select-capture-area', () => openAreaSelector());
ipcMain.handle('start-capture-loop', () => startCaptureLoop());
ipcMain.handle('stop-capture-loop', () => stopCaptureLoop());
ipcMain.handle('is-capturing', () => !!captureLoop);

ipcMain.handle('get-hotkeys', () => ({
  current: { ...state.hotkeys },
  defaults: { ...HOTKEY_DEFAULTS },
  failures: { ...hotkeyFailures },
}));
ipcMain.handle('set-hotkey', (_e, action, combo) => {
  if (!(action in HOTKEY_HANDLERS)) return false;
  state.hotkeys[action] = (combo || '').trim();
  saveState();
  registerHotkeys();
  return !hotkeyFailures[action];
});
ipcMain.handle('reset-hotkey', (_e, action) => {
  if (!(action in HOTKEY_HANDLERS)) return false;
  state.hotkeys[action] = HOTKEY_DEFAULTS[action];
  saveState();
  registerHotkeys();
  return !hotkeyFailures[action];
});
ipcMain.handle('reset-all-hotkeys', () => {
  state.hotkeys = { ...HOTKEY_DEFAULTS };
  saveState();
  registerHotkeys();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopCaptureLoop();
});
app.on('window-all-closed', () => app.quit());
