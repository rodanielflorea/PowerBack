const {
  app, BrowserWindow, ipcMain, globalShortcut, Menu,
  session, desktopCapturer, dialog, clipboard, screen, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const {
  PROVIDERS, getProvider, providerList,
  streamChat, completeChat, listModels,
  friendlyAnswerError, modelAbbr,
} = require('./llm-providers');
const { createKeyInjector, pasteKeystroke } = require('./platform-input');
const license = require('./license');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}
let officeParser = null;
try { officeParser = require('officeparser'); } catch {}

// CalculateNativeWinOcclusion: stop Windows from marking this always-on-top
// overlay "occluded" and PAUSING its paint — that's what makes navigating /
// switching sites look frozen until the window is touched. (The separate
// disable-backgrounding-occluded-windows switch below only stops priority
// lowering, not the paint pause.)
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion');
// Keep the audio capture pipeline alive when the window is hidden (stealth) or
// occluded by a fullscreen app — otherwise Chromium throttles the renderer and
// the AudioWorklet feeding Deepgram stalls, so voice stops transcribing.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const STATE_FILE = path.join(app.getPath('userData'), 'state.json');
const LOG_FILE = path.join(app.getPath('userData'), 'activity.log');
const LOG_MAX_LINES_RETURNED = 500;
const CAPTURE_EXE = path.join(
  app.isPackaged ? process.resourcesPath : __dirname,
  'caption2text',
  'Capture2Text_CLI.exe'
);



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
  reloadSite: 'Ctrl+R',
  toggleStealth: 'Ctrl+H',
  toggleRecording: 'Alt+C',
  toggleMode: 'Alt+D',
  pushToTalk: 'Ctrl+B',
  closeSticky: 'Ctrl+Shift+Left',
  openSticky: 'Ctrl+Shift+Right',
  stickyScrollUp: 'Shift+Up',
  stickyScrollDown: 'Shift+Down',
  helpRequest: 'Super+Shift+/',
  submitPrompt: 'CommandOrControl+Return',
  screenshotToAI: 'Alt+A',
  areaSnip: 'Alt+S',
  toggleClickThrough: 'Alt+Q',
  clearTranscriptBubble: 'Shift+Z',
};

const DEFAULT_STATE = {
  x: null, y: null, width: 400, height: 700,
  opacity: 1.0, stealth: true, clickThrough: false,
  mode: 'voice',
  transcription: {
    engine: 'deepgram',
    deepgramApiKey: '',
    xaiApiKey: '',
    language: 'auto',
    micDeviceId: '',
    captureSystem: true,
    captureMic: false,
  },
  capture: {
    rect: null,
    language: 'English',
    pollMs: 700,
    showOverlay: false,
  },
  network: {
    role: '',
    address: '172.16.98.11:2000',
    speakerPort: 2000,
    supporterAddress: '172.16.98.11:2000',
    firewallConfiguredFor: '',
    incomingVolume: 1.0,
    outgoingVolume: 1.0,
    virtualCableId: '',
    listenDeviceId: '',
    maxSupporters: 5,
  },
  welcomeSeen: false,
  // Uploaded base-knowledge documents (extracted text), per category.
  knowledge: { cv: [], jd: [], support: [], meetings: [] },
  // Answer generation: provider + per-provider keys/models. `apiKey` is the
  // legacy xAI key (kept so older state.json files still load).
  answer: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
    keys: { xai: '', anthropic: '', openai: '' },
    models: {
      xai: 'grok-4.20-0309-non-reasoning',
      anthropic: 'claude-haiku-4-5',
      openai: 'gpt-4o',
    },
  },
  meeting: {
    kind: 'hiring',
    hiringType: 'intro',     // intro | technical | ceo | hr
  },
  avoidPhrases: '',   // filled from defaults/avoid.txt on first run
  // Remembered personal profile, pre-filled into the New-session form.
  profile: { name: '', city: '', country: '', timezone: '' },
  // Named, switchable profiles for the New-session form.
  profiles: [],            // [{ id, label, name, city, country, timezone }]
  activeProfileId: null,
  stickyAnchor: null,
  floatPos: null,
  stickySize: null,
  hotkeys: { ...HOTKEY_DEFAULTS },
};

const MIN_OPACITY = 0.05;
const MOVE_STEP_X = 40;
const MOVE_STEP_Y = 20;
const OPACITY_STEP = 0.05;

let win;
let selectorWin = null;
let stickyWin = null;
let stickyWantOpen = false;
let stickyReady = false;
let infoWin = null;
let infoProfile = null;          // profile currently shown in the info window
let _nagerCountries = null;      // cached [{countryCode, name}] from date.nager.at
let chatHistory = [];
const CHAT_HISTORY_MAX = 200;
let captureOverlayWin = null;
let captureLoop = null;
let pastedHistory = [];
let pendingRestart = false;
let deepgramWs = null;
let sessionLog = [];
let state = { ...DEFAULT_STATE };

const MAX_HISTORY_WORDS = 500;
const WINDOW_K = 4;

function normalizeWord(w) {
  return w.toLowerCase().replace(/[^\w']/g, '');
}

function wordsApproxEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const lenA = a.length, lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return false;
  if (lenA >= 4 && lenB >= 4) {
    const minLen = Math.min(lenA, lenB);
    let common = 0;
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) common++;
      else break;
    }
    if (common >= Math.max(4, minLen - 1)) return true;
  }
  let i = 0, j = 0, edits = 0;
  while (i < lenA && j < lenB) {
    if (a[i] === b[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (lenA > lenB) i++;
    else if (lenB > lenA) j++;
    else { i++; j++; }
  }
  edits += (lenA - i) + (lenB - j);
  return edits <= 1;
}

function windowsApproxEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!wordsApproxEqual(a[i], b[i])) return false;
  return true;
}

function trimSeenPrefix(newWordsNorm, histNorm, lookback) {
  if (newWordsNorm.length === 0) return 0;
  const tail = histNorm.slice(-lookback);
  if (tail.length === 0) return 0;
  let total = 0;
  let progress = true;
  while (progress && total < newWordsNorm.length) {
    progress = false;
    for (let len = Math.min(newWordsNorm.length - total, 8); len >= 1; len--) {
      const slice = newWordsNorm.slice(total, total + len);
      let found = false;
      for (let i = 0; i + len <= tail.length; i++) {
        if (windowsApproxEqual(tail.slice(i, i + len), slice)) { found = true; break; }
      }
      if (found) {
        total += len;
        progress = true;
        break;
      }
    }
  }
  return total;
}

function dedupeInlinePhrases(words) {
  if (words.length < 4) return words;
  const out = words.slice();
  for (let phraseLen = 5; phraseLen >= 2; phraseLen--) {
    let i = 0;
    while (i + 2 * phraseLen <= out.length) {
      const aNorm = out.slice(i, i + phraseLen).map(normalizeWord);
      const bNorm = out.slice(i + phraseLen, i + 2 * phraseLen).map(normalizeWord);
      if (windowsApproxEqual(aNorm, bNorm)) {
        out.splice(i + phraseLen, phraseLen);
        // re-check at same i for cascading repeats
      } else {
        i++;
      }
    }
  }
  return out;
}

let pendingTrailing = '';
let pendingIdleFrames = 0;
const PENDING_FLUSH_AFTER_IDLE = 5;

function resetSmartDiffState() {
  pastedHistory = [];
  pendingTrailing = '';
  pendingIdleFrames = 0;
}

function smartDiff(curr) {
  if (!curr) return '';
  const currWords = curr.split(/\s+/).filter(Boolean);
  if (currWords.length === 0) return '';

  if (pastedHistory.length === 0 && !pendingTrailing) {
    let head = currWords.slice(0, -1);
    if (head.length >= 4) head = dedupeInlinePhrases(head);
    pendingTrailing = currWords[currWords.length - 1];
    pendingIdleFrames = 0;
    pastedHistory = head.slice(-MAX_HISTORY_WORDS);
    return head.length > 0 ? head.join(' ') : '';
  }

  const histNorm = pastedHistory.map(normalizeWord);
  const currNorm = currWords.map(normalizeWord);

  let prefixMatch = 0;
  const maxN = Math.min(histNorm.length, currNorm.length);
  for (let n = maxN; n >= 2; n--) {
    let m = true;
    for (let i = 0; i < n; i++) {
      if (!wordsApproxEqual(histNorm[histNorm.length - n + i], currNorm[i])) { m = false; break; }
    }
    if (m) { prefixMatch = n; break; }
  }

  let windowMatch = 0;
  if (currNorm.length >= WINDOW_K && histNorm.length >= WINDOW_K) {
    const histWindows = [];
    for (let i = 0; i + WINDOW_K <= histNorm.length; i++) {
      histWindows.push(histNorm.slice(i, i + WINDOW_K));
    }
    for (let i = 0; i + WINDOW_K <= currNorm.length; i++) {
      const cw = currNorm.slice(i, i + WINDOW_K);
      for (let h = 0; h < histWindows.length; h++) {
        if (windowsApproxEqual(histWindows[h], cw)) { windowMatch = i + WINDOW_K; break; }
      }
    }
  }

  const skipTo = Math.max(prefixMatch, windowMatch);
  let newWords = currWords.slice(skipTo);

  if (newWords.length > 0) {
    const newNorm = newWords.map(normalizeWord);
    const trimmed = trimSeenPrefix(newNorm, histNorm, 60);
    if (trimmed > 0) newWords = newWords.slice(trimmed);
  }
  if (newWords.length >= 4) newWords = dedupeInlinePhrases(newWords);

  if (pendingTrailing) {
    const pendNorm = normalizeWord(pendingTrailing);
    if (newWords.length > 0) {
      const firstNorm = normalizeWord(newWords[0]);
      if (firstNorm === pendNorm) {
        newWords = newWords.slice(1);
        pendingIdleFrames = 0;
      } else if (firstNorm.length > pendNorm.length && firstNorm.startsWith(pendNorm)) {
        pendingTrailing = newWords[0];
        newWords = newWords.slice(1);
        pendingIdleFrames = 0;
      } else if (pendNorm.length > firstNorm.length && pendNorm.startsWith(firstNorm)) {
        newWords = newWords.slice(1);
        pendingIdleFrames = 0;
      } else {
        const flush = pendingTrailing;
        pendingTrailing = '';
        pendingIdleFrames = 0;
        pastedHistory.push(flush);
        newWords = [flush, ...newWords];
      }
    } else {
      pendingIdleFrames++;
      if (pendingIdleFrames >= PENDING_FLUSH_AFTER_IDLE) {
        const flush = pendingTrailing;
        pendingTrailing = '';
        pendingIdleFrames = 0;
        pastedHistory.push(flush);
        pastedHistory = pastedHistory.slice(-MAX_HISTORY_WORDS);
        return ' ' + flush;
      }
      return '';
    }
  }

  if (newWords.length === 0) return '';

  const newPending = newWords[newWords.length - 1];
  const toEmit = newWords.slice(0, -1);
  pendingTrailing = newPending;
  pendingIdleFrames = 0;

  if (toEmit.length === 0) return '';
  if (toEmit.length > 40 && win) {
    win.webContents.send('capture-text', `[OCR diff: large emission ${toEmit.length} words — likely match drift]`);
  }
  pastedHistory = pastedHistory.concat(toEmit).slice(-MAX_HISTORY_WORDS);
  return ' ' + toEmit.join(' ');
}

// ── Built-in API keys ─────────────────────────────────────────────────────────
// defaults/api-keys.json is shipped inside the app so users need no keys of
// their own. A non-empty entry always wins over whatever is in state.json and
// the matching settings field is hidden in the UI; an empty entry leaves that
// provider user-configurable. (Anything shipped in the app can be extracted by
// a user — rotate at the provider if a key leaks.)
const BUILTIN_KEYS_FILE = path.join(__dirname, 'defaults', 'api-keys.json');
let builtinKeys = null;
function getBuiltinKeys() {
  if (builtinKeys) return builtinKeys;
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(BUILTIN_KEYS_FILE, 'utf8')); } catch {}
  builtinKeys = {};
  for (const k of ['deepgram', 'xai', 'anthropic', 'openai']) {
    const v = String(raw[k] || '').trim();
    if (v) builtinKeys[k] = v;
  }
  return builtinKeys;
}
function applyBuiltinKeys() {
  const b = getBuiltinKeys();
  if (!state.transcription) state.transcription = { ...DEFAULT_STATE.transcription };
  if (!state.answer) state.answer = { ...DEFAULT_STATE.answer };
  if (!state.answer.keys) state.answer.keys = { ...DEFAULT_STATE.answer.keys };
  if (b.deepgram) state.transcription.deepgramApiKey = b.deepgram;
  if (b.xai) { state.transcription.xaiApiKey = b.xai; state.answer.keys.xai = b.xai; state.answer.apiKey = b.xai; }
  if (b.anthropic) state.answer.keys.anthropic = b.anthropic;
  if (b.openai) state.answer.keys.openai = b.openai;
}
ipcMain.handle('get-builtin-keys', () => {
  const b = getBuiltinKeys();
  return { deepgram: !!b.deepgram, xai: !!b.xai, anthropic: !!b.anthropic, openai: !!b.openai };
});

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state = {
      ...DEFAULT_STATE,
      ...raw,
      transcription: { ...DEFAULT_STATE.transcription, ...(raw.transcription || {}) },
      capture: { ...DEFAULT_STATE.capture, ...(raw.capture || {}) },
      network: { ...DEFAULT_STATE.network, ...(raw.network || {}) },
      answer: { ...DEFAULT_STATE.answer, ...(raw.answer || {}) },
      knowledge: { ...DEFAULT_STATE.knowledge, ...(raw.knowledge || {}) },
      meeting: { ...DEFAULT_STATE.meeting, ...(raw.meeting || {}) },
      hotkeys: { ...HOTKEY_DEFAULTS, ...(raw.hotkeys || {}) },
    };
    for (const k of Object.keys(HOTKEY_DEFAULTS)) {
      if (!state.hotkeys[k] && HOTKEY_DEFAULTS[k]) state.hotkeys[k] = HOTKEY_DEFAULTS[k];
    }
    state.network.role = '';
    // Migrate any retired engine value (e.g. the removed local whisper) to deepgram.
    if (state.transcription.engine !== 'deepgram' && state.transcription.engine !== 'xai') {
      state.transcription.engine = 'deepgram';
    }
    if (!state.meeting) state.meeting = { ...DEFAULT_STATE.meeting };
    state.meeting.kind = 'hiring';
    if (!['intro', 'technical', 'ceo', 'hr'].includes(state.meeting.hiringType)) state.meeting.hiringType = 'intro';
    delete state.meeting.roster;
    delete state.prompts;
    delete state.promptDefaultsVersion;
    delete state.promptsSeeded;
    if (state.answer) delete state.answer.activePromptId;
  } catch {
    state = {
      ...DEFAULT_STATE,
      transcription: { ...DEFAULT_STATE.transcription },
      capture: { ...DEFAULT_STATE.capture },
      network: { ...DEFAULT_STATE.network },
      answer: { ...DEFAULT_STATE.answer },
      meeting: { ...DEFAULT_STATE.meeting },
      hotkeys: { ...HOTKEY_DEFAULTS },
    };
  }
  migrateAnswerConfig();
  // One-time switch to the new audio-source defaults (system audio on, mic off)
  // for installs that saved the old defaults before this change.
  if (!state.audioDefaultsV2) {
    state.transcription.captureSystem = true;
    state.transcription.captureMic = false;
    state.audioDefaultsV2 = true;
  }
  applyBuiltinKeys();
  seedAvoidPhrasesIfNeeded();
  migrateProfilesIfNeeded();
}

function migrateAnswerConfig() {
  if (!state.answer) state.answer = { ...DEFAULT_STATE.answer };
  const a = state.answer;
  const prevKeys = { ...(a.keys || {}) };
  if (a.keys) delete a.keys.gemini;
  if (a.models) delete a.models.gemini;
  a.keys = { ...DEFAULT_STATE.answer.keys, ...(a.keys || {}) };
  a.models = { ...DEFAULT_STATE.answer.models, ...(a.models || {}) };

  if (!a.provider || !PROVIDERS[a.provider]) {
    const withKey = ['openai', 'anthropic', 'xai'].find((id) => String((prevKeys[id] || a.keys[id] || '')).trim());
    a.provider = withKey || 'openai';
  }

  if (!a.keys.xai && a.apiKey) a.keys.xai = a.apiKey;
  if (!a.apiKey && a.keys.xai) a.apiKey = a.keys.xai;

  // Stock defaults that were slower — move to the fast model unless the
  // user already picked something else.
  const oldSlow = {
    xai: ['grok-4.6', 'grok-4.5'],
    anthropic: ['claude-sonnet-5'],
    openai: ['gpt-5.6-terra'],
  };
  const stored = a.models[a.provider] || a.model;
  if (oldSlow[a.provider] && oldSlow[a.provider].includes(stored)) {
    a.model = getProvider(a.provider).defaultModel;
    a.models[a.provider] = a.model;
  } else if (a.model && PROVIDERS[a.provider]) {
    a.models[a.provider] = a.model;
  } else {
    a.model = a.models[a.provider] || getProvider(a.provider).defaultModel;
  }
}

// One-time migration: fold the single remembered profile into the named list.
function migrateProfilesIfNeeded() {
  if (!Array.isArray(state.profiles)) state.profiles = [];
  if (state.profiles.length === 0) {
    const p = state.profile || {};
    if (p.name || p.city || p.country || p.timezone) {
      const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      state.profiles.push({ id, label: p.name || 'Default', name: p.name || '', city: p.city || '', country: p.country || '', timezone: p.timezone || '' });
      state.activeProfileId = id;
    }
  }
}

function loadBundledText(filename) {
  const dirs = [
    path.join(__dirname, '.claude'),
    path.join(__dirname, 'defaults'),
  ];
  for (const dir of dirs) {
    const p = path.join(dir, filename);
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
      }
    } catch {}
  }
  return '';
}

function seedAvoidPhrasesIfNeeded() {
  if (String(state.avoidPhrases || '').trim()) return;
  const avoid = loadBundledText('avoid.txt');
  if (!avoid) return;
  state.avoidPhrases = avoid;
  try { saveState(); } catch {}
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

function createWindow() {
  loadState();

  // Bypass OS proxy auto-detection (WPAD). On Windows "Automatically detect
  // settings" is on by default; with no WPAD server every request waits for that
  // discovery to time out, which can make pages take minutes to load. Going
  // direct avoids it. If you actually need a corporate proxy, change mode to
  // 'system'.
  session.defaultSession.setProxy({ mode: 'direct' }).catch(() => {});

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') callback(true);
    else callback(false);
  });
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Chromium supports system-audio loopback capture only on Windows.
      if (sources[0]) callback({ video: sources[0], audio: process.platform === 'win32' ? 'loopback' : undefined });
      else callback({});
    });
  }, { useSystemPicker: false });

  win = new BrowserWindow({
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    width: state.width,
    height: state.height,
    minWidth: 360,
    minHeight: 200,
    useContentSize: true,
    frame: false,
    backgroundColor: '#ffffff',
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });

  win.setContentProtection(state.stealth);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Only go translucent if actually requested. Calling setOpacity at 1.0 turns the
  // window into a layered window (WS_EX_LAYERED), which disables GPU compositing
  // and makes the webview render in software. Skip it when fully opaque.
  const startOpacity = Math.max(MIN_OPACITY, state.opacity);
  if (startOpacity < 1) win.setOpacity(startOpacity);
  win.setMenuBarVisibility(false);
  if (state.clickThrough) try { win.setIgnoreMouseEvents(true, { forward: true }); } catch {}

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Embedded web AI removed — answers come from the selected provider API
  // into the in-app Answer panel, so we no longer create the WebContentsView.
  let shown = false;
  const showMainWindow = () => {
    if (shown || !win || win.isDestroyed()) return;
    shown = true;
    win.show();
    // Pre-warm the xAI connection so first real request skips TLS handshake.
    setTimeout(() => startWarmLoop(), 400);
  };
  win.once('ready-to-show', showMainWindow);
  // Fallback: on some Linux/Wayland setups this page never produces a first
  // paint while the window is still unmapped, so 'ready-to-show' never fires
  // and the app stays invisible. Show once the page has loaded instead.
  win.webContents.once('did-finish-load', () => setTimeout(showMainWindow, 100));

  win.on('move', () => { saveState(); syncStickyPosition(); });
  win.on('resize', () => { saveState(); syncStickyPosition(); });
  win.on('show', () => { applyStickyState(); sendFloatState(); });
  win.on('hide', () => { applyStickyState(); sendFloatState(); });
  win.on('closed', () => {
    if (floatWin && !floatWin.isDestroyed()) { try { floatWin.close(); } catch {} }
    win = null;
    if (stickyWin && !stickyWin.isDestroyed()) { try { stickyWin.close(); } catch {} }
  });
}

function setOpacity(value) {
  if (!win) return;
  const v = Math.max(MIN_OPACITY, Math.min(1, value));
  win.setOpacity(v);
  if (stickyWin && !stickyWin.isDestroyed()) { try { stickyWin.setOpacity(v); } catch {} }
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
  if (stickyWin && !stickyWin.isDestroyed()) { try { stickyWin.setContentProtection(state.stealth); } catch {} }
  if (infoWin && !infoWin.isDestroyed()) { try { infoWin.setContentProtection(state.stealth); } catch {} }
  if (floatWin && !floatWin.isDestroyed()) { try { floatWin.setContentProtection(state.stealth); } catch {} }
  saveState();
  win.webContents.send('stealth-changed', state.stealth);
}

// ── Floating toggle button ────────────────────────────────────────────────────
// A tiny always-on-top, stealth window with one button that shows/hides the
// main window — for users who hid the app and do not know the hotkey. It is
// created right after the license check and never hides with the main window.
let floatWin = null;
const FLOAT_SIZE = 54;
function floatDefaultPos() {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - FLOAT_SIZE - 16, y: a.y + a.height - FLOAT_SIZE - 16 };
}
function floatSavedPos() {
  const p = state.floatPos;
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  const onScreen = screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return p.x >= b.x && p.y >= b.y && p.x + FLOAT_SIZE <= b.x + b.width && p.y + FLOAT_SIZE <= b.y + b.height;
  });
  return onScreen ? p : null;
}
function createFloatWindow() {
  if (floatWin && !floatWin.isDestroyed()) return;
  const pos = floatSavedPos() || floatDefaultPos();
  floatWin = new BrowserWindow({
    width: FLOAT_SIZE, height: FLOAT_SIZE, x: pos.x, y: pos.y,
    frame: false, transparent: true, hasShadow: false,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-float.js'), contextIsolation: true, nodeIntegration: false },
  });
  floatWin.setContentProtection(state.stealth);
  floatWin.setAlwaysOnTop(true, 'screen-saver');
  floatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatWin.setMenuBarVisibility(false);
  floatWin.loadFile(path.join(__dirname, 'renderer', 'float.html'));
  const showFloat = () => { if (floatWin && !floatWin.isDestroyed() && !floatWin.isVisible()) floatWin.showInactive(); };
  floatWin.once('ready-to-show', showFloat);
  floatWin.webContents.once('did-finish-load', () => { setTimeout(showFloat, 100); sendFloatState(); });
  floatWin.on('move', () => {
    try { const [x, y] = floatWin.getPosition(); state.floatPos = { x, y }; saveState(); } catch {}
  });
  floatWin.on('closed', () => { floatWin = null; });
}
function sendFloatState() {
  if (!floatWin || floatWin.isDestroyed()) return;
  try { floatWin.webContents.send('float-state', !!(win && !win.isDestroyed() && win.isVisible())); } catch {}
}
ipcMain.handle('float-toggle', () => { toggleVisible(); });

function computeDefaultStickyAnchor(mainW, mainH, stickyW, stickyH) {
  const [mx, my] = win.getPosition();
  const display = screen.getDisplayMatching(win.getBounds());
  const work = display.workArea;
  const gap = 8;
  // Always prefer side-by-side (right or left) — never above/below which
  // causes the sticky to land off-screen or at the top-left corner.
  if (mx + mainW + gap + stickyW <= work.x + work.width) {
    return { xMode: 'rightOf', xGap: gap, yMode: 'alignTop', yOffset: 0 };
  }
  if (mx - gap - stickyW >= work.x) {
    return { xMode: 'leftOf', xGap: gap, yMode: 'alignTop', yOffset: 0 };
  }
  // No room on either side — force right and let syncStickyPosition clamp
  // it to the work area rather than falling back to above/below.
  return { xMode: 'rightOf', xGap: gap, yMode: 'alignTop', yOffset: 0 };
}

function computeStickyXY(anchor, mainX, mainY, mainW, mainH, stickyW, stickyH) {
  let sx, sy;
  switch (anchor.xMode) {
    case 'rightOf':   sx = mainX + mainW + (anchor.xGap || 0); break;
    case 'leftOf':    sx = mainX - (anchor.xGap || 0) - stickyW; break;
    case 'alignRight':sx = mainX + mainW - stickyW + (anchor.xOffset || 0); break;
    case 'alignLeft':
    default:          sx = mainX + (anchor.xOffset || 0); break;
  }
  switch (anchor.yMode) {
    case 'belowOf':    sy = mainY + mainH + (anchor.yGap || 0); break;
    case 'aboveOf':    sy = mainY - (anchor.yGap || 0) - stickyH; break;
    case 'alignBottom':sy = mainY + mainH - stickyH + (anchor.yOffset || 0); break;
    case 'alignTop':
    default:           sy = mainY + (anchor.yOffset || 0); break;
  }
  return { sx, sy };
}

function deriveStickyAnchor(stickyX, stickyY, stickyW, stickyH, mainX, mainY, mainW, mainH) {
  const anchor = {};
  if (stickyX >= mainX + mainW) {
    anchor.xMode = 'rightOf';
    anchor.xGap = stickyX - (mainX + mainW);
  } else if (stickyX + stickyW <= mainX) {
    anchor.xMode = 'leftOf';
    anchor.xGap = mainX - (stickyX + stickyW);
  } else {
    anchor.xMode = 'alignLeft';
    anchor.xOffset = stickyX - mainX;
  }
  if (stickyY >= mainY + mainH) {
    anchor.yMode = 'belowOf';
    anchor.yGap = stickyY - (mainY + mainH);
  } else if (stickyY + stickyH <= mainY) {
    anchor.yMode = 'aboveOf';
    anchor.yGap = mainY - (stickyY + stickyH);
  } else {
    anchor.yMode = 'alignTop';
    anchor.yOffset = stickyY - mainY;
  }
  return anchor;
}

let stickyMovingProgrammatically = 0;
function syncStickyPosition(force) {
  if (!stickyWin || stickyWin.isDestroyed() || !win) return;
  const [mainW, mainH] = win.getSize();
  // Use the sticky's own current size — it is independent of main and user-resizable.
  const [curW, curH] = stickyWin.getSize();
  const stickyW = curW || mainW;
  const stickyH = curH || Math.max(160, Math.floor(mainH / 2));
  if (!state.stickyAnchor || force) {
    state.stickyAnchor = computeDefaultStickyAnchor(mainW, mainH, stickyW, stickyH);
    saveState();
  }
  const [mx, my] = win.getPosition();
  const { sx, sy } = computeStickyXY(state.stickyAnchor, mx, my, mainW, mainH, stickyW, stickyH);
  // Clamp to work area so the sticky is never off-screen or at 0,0.
  const display = screen.getDisplayMatching(win.getBounds());
  const work = display.workArea;
  const cx = Math.max(work.x, Math.min(sx, work.x + work.width  - stickyW));
  const cy = Math.max(work.y, Math.min(sy, work.y + work.height - stickyH));
  stickyMovingProgrammatically++;
  try { stickyWin.setBounds({ x: cx, y: cy, width: stickyW, height: stickyH }); } catch {}
  setTimeout(() => { stickyMovingProgrammatically = Math.max(0, stickyMovingProgrammatically - 1); }, 50);
}

function applyStickyState() {
  if (!stickyWin || stickyWin.isDestroyed() || !win) return;
  const wantShow = stickyWantOpen && win.isVisible();
  if (wantShow) {
    if (!stickyWin.isVisible()) stickyWin.showInactive();
    syncStickyPosition();
    try { stickyWin.setOpacity(win.getOpacity()); } catch {}
  } else if (stickyWin.isVisible()) {
    stickyWin.hide();
  }
}

function createStickyWindow() {
  if (stickyWin && !stickyWin.isDestroyed()) return;
  if (!win) return;
  const [mainW, mainH] = win.getSize();
  const saved = state.stickySize;
  const initW = (saved && saved.width) ? saved.width : mainW;
  const initH = (saved && saved.height) ? saved.height : Math.max(160, Math.floor(mainH / 2));
  stickyWin = new BrowserWindow({
    width: initW,
    height: initH,
    minWidth: 220,
    minHeight: 140,
    frame: false,
    backgroundColor: '#ffffff',
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-sticky.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  stickyWin.setContentProtection(state.stealth);
  stickyWin.setAlwaysOnTop(true, 'screen-saver');
  stickyWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (state.clickThrough) try { stickyWin.setIgnoreMouseEvents(true, { forward: true }); } catch {}
  try { stickyWin.setOpacity(win.getOpacity()); } catch {}
  stickyWin.setMenuBarVisibility(false);
  stickyReady = false;
  stickyWin.loadFile(path.join(__dirname, 'renderer', 'sticky.html'));
  stickyWin.on('closed', () => { stickyWin = null; stickyReady = false; });
  stickyWin.on('move', () => {
    if (!stickyWin || stickyWin.isDestroyed() || !win) return;
    if (stickyMovingProgrammatically > 0) return;
    const [sx, sy] = stickyWin.getPosition();
    const [sw, sh] = stickyWin.getSize();
    const [mx, my] = win.getPosition();
    const [mw, mh] = win.getSize();
    state.stickyAnchor = deriveStickyAnchor(sx, sy, sw, sh, mx, my, mw, mh);
    saveState();
  });
  stickyWin.on('resize', () => {
    if (!stickyWin || stickyWin.isDestroyed()) return;
    if (stickyMovingProgrammatically > 0) return;
    const [sw, sh] = stickyWin.getSize();
    state.stickySize = { width: sw, height: sh };
    saveState();
  });
  stickyWin.webContents.once('did-finish-load', () => {
    if (!stickyWin || stickyWin.isDestroyed()) return;
    stickyReady = true;
    pushHistoryToStickyDom();
    syncStickyPosition();
  });
  stickyWin.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      try { stickyWin.webContents.openDevTools({ mode: 'detach' }); } catch {}
    }
  });
  stickyWin.webContents.on('console-message', (_e, level, message) => {
    if (win && message && message.startsWith('[sticky]')) {
      win.webContents.send('capture-text', message);
    }
  });
}

// ── Info window (local time / weather / holidays) ─────────────────────────────
function createInfoWindow() {
  if (infoWin && !infoWin.isDestroyed()) return;
  if (!win) return;
  infoAcc = null; // fresh window — let the fallback-fetch guard work
  const disp = screen.getPrimaryDisplay().workArea;
  infoWin = new BrowserWindow({
    width: 280, height: 600,
    x: disp.x + disp.width - 300, y: disp.y + 20,
    minWidth: 220, minHeight: 280,
    frame: false, backgroundColor: '#ffffff',
    skipTaskbar: true, alwaysOnTop: true, resizable: true, show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload-info.js'), contextIsolation: true, nodeIntegration: false },
  });
  infoWin.setContentProtection(state.stealth);
  infoWin.setAlwaysOnTop(true, 'screen-saver');
  infoWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  infoWin.setMenuBarVisibility(false);
  infoWin.loadFile(path.join(__dirname, 'renderer', 'info.html'));
  infoWin.on('closed', () => { infoWin = null; });
  infoWin.once('ready-to-show', () => { if (infoWin && !infoWin.isDestroyed()) infoWin.showInactive(); });
  // Some Linux/Wayland setups never fire ready-to-show; show on load instead.
  infoWin.webContents.once('did-finish-load', () => setTimeout(() => {
    if (infoWin && !infoWin.isDestroyed() && !infoWin.isVisible()) infoWin.showInactive();
  }, 150));
  // The fetch is normally kicked off by the renderer's 'info-ready' handshake.
  // Fallback: also start it shortly after load in case the handshake is missed
  // (e.g. preload issue) — refreshInfoData no-ops if a fetch is already running
  // for this profile, so a duplicate is harmless.
  infoWin.webContents.once('did-finish-load', () => {
    setTimeout(() => { if (infoWin && !infoWin.isDestroyed() && infoAcc === null) refreshInfoData(); }, 800);
  });
}

function openInfoWindow(profile) {
  infoProfile = profile || infoProfile || {};
  if (!infoWin || infoWin.isDestroyed()) { createInfoWindow(); return; }
  infoWin.showInactive();
  refreshInfoData();
}

function closeInfoWindow() {
  if (infoWin && !infoWin.isDestroyed()) { try { infoWin.close(); } catch {} }
  infoWin = null;
  infoAcc = null; // so the next window's fallback-fetch guard works
}

// Map a free-text country name to an ISO-2 code via date.nager.at's country list.
// fetch with an abort timeout so a slow/keyless endpoint can't hang the widget.
async function tfetch(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 6000);
  try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
  finally { clearTimeout(t); }
}

async function countryNameToCode(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  if (/^[A-Za-z]{2}$/.test(n)) return n.toUpperCase(); // already a code
  try {
    if (!_nagerCountries) {
      const r = await tfetch('https://date.nager.at/api/v3/AvailableCountries');
      if (r.ok) _nagerCountries = await r.json();
    }
    if (_nagerCountries) {
      const low = n.toLowerCase();
      let hit = _nagerCountries.find(c => c.name.toLowerCase() === low);
      if (!hit) hit = _nagerCountries.find(c => c.name.toLowerCase().startsWith(low) || low.startsWith(c.name.toLowerCase()));
      if (hit) return hit.countryCode;
    }
  } catch {}
  return null;
}

// Deeper special events via Wikimedia's keyless "on this day → holidays &
// observances" feed. Scans the next `days` calendar days and keeps entries whose
// text mentions any of the country name variants. English, no API key.
async function fetchSpecialEvents(nameVariants, days) {
  const names = (nameVariants || []).map(s => String(s || '').toLowerCase()).filter(Boolean);
  if (!names.length) return [];
  const today = new Date();
  const dates = [];
  for (let i = 0; i < (days || 10); i++) { const d = new Date(today); d.setDate(today.getDate() + i); dates.push(d); }
  const results = [];
  await Promise.all(dates.map(async (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    try {
      const r = await tfetch('https://en.wikipedia.org/api/rest_v1/feed/onthisday/holidays/' + mm + '/' + dd,
        { headers: { 'User-Agent': 'AceInterview/1.0 (interview assistant)', 'Accept': 'application/json' } }, 5000);
      if (!r.ok) return;
      const j = await r.json();
      const iso = d.getFullYear() + '-' + mm + '-' + dd;
      (j.holidays || []).forEach((h) => {
        const text = (h.text || '').trim();
        if (text && names.some(n => text.toLowerCase().includes(n))) results.push({ date: iso, text });
      });
    } catch {}
  }));
  const seen = new Set();
  return results
    .filter(e => { const k = e.date + '|' + e.text; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Weather via wttr.in (keyless JSON). Returns the current-condition or null.
async function fetchWeather(city, country) {
  const q = [city, country].filter(Boolean).join(',');
  if (!q) return null;
  try {
    const r = await tfetch('https://wttr.in/' + encodeURIComponent(q) + '?format=j1',
      { headers: { 'User-Agent': 'curl/8' } }, 7000); // curl-like UA → clean JSON
    if (!r.ok) return null;
    const j = await r.json();
    const cur = j.current_condition && j.current_condition[0];
    if (!cur) return null;
    return {
      tempC: Number(cur.temp_C), feelsC: Number(cur.FeelsLikeC),
      humidity: Number(cur.humidity),
      desc: (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value) || '',
    };
  } catch { return null; }
}

// Public holidays (full year) + the country name variants for event matching.
async function fetchHolidays(country) {
  const nameVariants = country ? [country] : [];
  if (!country) return { holidays: null, nameVariants };
  try {
    const code = await countryNameToCode(country);
    if (!code) return { holidays: null, nameVariants };
    const canonical = (_nagerCountries || []).find(c => c.countryCode === code);
    if (canonical && canonical.name) nameVariants.push(canonical.name);
    const year = new Date().getFullYear();
    const r = await tfetch('https://date.nager.at/api/v3/PublicHolidays/' + year + '/' + code);
    if (!r.ok) return { holidays: null, nameVariants };
    const all = await r.json();
    const holidays = all
      .map(h => ({ date: h.date, name: h.name, localName: h.localName, types: h.types || [], global: h.global }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { holidays, nameVariants };
  } catch { return { holidays: null, nameVariants }; }
}

// Fetch weather / holidays / events CONCURRENTLY and push each to the widget the
// moment it resolves, so one slow endpoint never blocks the others.
// Field convention: undefined = still loading, null = done-but-empty, value = data.
let infoAcc = null;        // latest accumulator (also (re)sent on the ready handshake)
let infoWatchdog = null;
// ── CV summary for the info window ───────────────────────────────────────────
// Work history + education extracted from the uploaded CV with the answer
// model, once per distinct CV text (cached in state by content hash).
function cvText() {
  const c = state.knowledge && state.knowledge.cv;
  return (c && c[0] && c[0].text) || '';
}
async function extractCvSummary() {
  const text = cvText().slice(0, 30000);
  if (!text.trim()) return null;
  const h = require('crypto').createHash('sha1').update(text).digest('hex');
  if (state.cvSummary && state.cvSummary.hash === h && state.cvSummary.data) return state.cvSummary.data;
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  if (!apiKey) return null;
  const ac = new AbortController();
  setTimeout(() => { try { ac.abort(); } catch {} }, 30000);
  const prompt = 'Extract from this CV and reply with strict JSON only, no prose:\n' +
    '{"work":[{"company":"","location":"","period":"","role":"","mode":""}],"education":[{"school":"","degree":"","period":""}]}\n' +
    'Rules: work newest first; period like "2021 – 2023" or "2019 – present"; mode is one of remote, hybrid, onsite, or "" when the CV does not say; keep every value short; omit nothing that is a real job or degree.\n\nCV:\n' + text;
  let raw = '';
  try {
    raw = await completeChat({
      provider, apiKey, model: getAnswerModel(provider.id),
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1500, signal: ac.signal, convId: 'cv-' + h.slice(0, 8),
    });
  } catch (e) {
    appendLogLine('[info] CV summary failed: ' + (e && e.message));
    return null;
  }
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let data = null;
  try { data = JSON.parse(m[0]); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  data = { work: Array.isArray(data.work) ? data.work : [], education: Array.isArray(data.education) ? data.education : [] };
  state.cvSummary = { hash: h, data };
  saveState();
  return data;
}

function sendInfoData() {
  if (infoWin && !infoWin.isDestroyed() && infoAcc) infoWin.webContents.send('info-data', infoAcc);
}
async function refreshInfoData() {
  if (!infoWin || infoWin.isDestroyed()) return;
  const profile = infoProfile || {};
  const city = (profile.city || '').trim();
  const country = (profile.country || '').trim();
  const acc = { profile, weather: undefined, holidays: undefined, events: undefined, cv: undefined };
  infoAcc = acc;
  sendInfoData(); // clock + "Loading…" immediately

  // Watchdog: never sit on "Loading…" forever — after 18s, mark unresolved
  // sections as empty so they read "Unavailable / None".
  if (infoWatchdog) clearTimeout(infoWatchdog);
  infoWatchdog = setTimeout(() => {
    if (infoAcc !== acc) return;
    if (acc.weather === undefined) acc.weather = null;
    if (acc.holidays === undefined) acc.holidays = null;
    if (acc.events === undefined) acc.events = null;
    sendInfoData();
  }, 18000);
  // CV summary runs alongside the network fetches; it has its own timeout.
  extractCvSummary().then((d) => { if (infoAcc === acc) { acc.cv = d || null; sendInfoData(); } })
    .catch(() => { if (infoAcc === acc) { acc.cv = null; sendInfoData(); } });

  // ── Phase 1: weather + holidays (the important data) — concurrently ──
  let nameVariants = country ? [country] : [];
  const phase1 = [];
  if (city || country) {
    phase1.push(fetchWeather(city, country).then(w => { if (infoAcc === acc) { acc.weather = w || null; sendInfoData(); } }));
  } else acc.weather = null;
  if (country) {
    phase1.push(fetchHolidays(country).then(res => {
      if (infoAcc !== acc) return;
      acc.holidays = res.holidays || null;
      nameVariants = res.nameVariants && res.nameVariants.length ? res.nameVariants : nameVariants;
      sendInfoData();
    }));
  } else { acc.holidays = null; acc.events = null; }
  await Promise.allSettled(phase1);
  if (infoAcc !== acc) return;

  // ── Phase 2: special events — only AFTER weather + holidays are shown, so the
  // 10-request Wikimedia scan never competes with the data above. ──
  if (country) {
    let ev = null;
    try { ev = await fetchSpecialEvents(nameVariants, 10); } catch {}
    if (infoAcc === acc) { acc.events = ev || null; sendInfoData(); }
  }
}

ipcMain.handle('info-open', (_e, profile) => { openInfoWindow(profile); return true; });
ipcMain.handle('info-close', () => { closeInfoWindow(); return true; });
ipcMain.handle('info-refresh', () => { refreshInfoData(); return true; });
// Renderer handshake: it's listening now — (re)send current data and fetch fresh.
ipcMain.handle('info-ready', () => { sendInfoData(); refreshInfoData(); return true; });

function openStickyWindow(beside = false) {
  stickyWantOpen = true;
  if (beside) state.stickyAnchor = null;
  const wasNew = !stickyWin || stickyWin.isDestroyed();
  if (wasNew) createStickyWindow();
  applyStickyState();
  if (beside) {
    // For a freshly-created window the initial setBounds may fire before the
    // OS assigns the final frame, so re-sync after a short delay.
    const delay = wasNew ? 300 : 0;
    setTimeout(() => {
      if (stickyWin && !stickyWin.isDestroyed()) syncStickyPosition(true);
    }, delay);
  }
}

function closeStickyWindow() {
  stickyWantOpen = false;
  applyStickyState();
}

function scrollSticky(direction) {
  if (!stickyWin || stickyWin.isDestroyed() || !stickyReady) return;
  const dy = direction * 80;
  const code = `(function(){var b=document.getElementById('stickyBody');if(b)b.scrollTop+=(${dy});})()`;
  try { stickyWin.webContents.executeJavaScript(code).catch(() => {}); } catch {}
}

function pushHistoryToStickyDom() {
  if (!stickyWin || stickyWin.isDestroyed() || !stickyReady) return;
  try {
    const code = `window.__stickyHistory = ${JSON.stringify(chatHistory)};\nif (typeof window.applyStickyHistory === 'function') window.applyStickyHistory(window.__stickyHistory);`;
    stickyWin.webContents.executeJavaScript(code).catch(() => {});
  } catch {}
  try { stickyWin.webContents.send('sticky-history', chatHistory); } catch {}
}

function pushChatToSticky(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > CHAT_HISTORY_MAX) chatHistory.shift();
  if (!stickyWantOpen) {
    stickyWantOpen = true;
    if (!stickyWin || stickyWin.isDestroyed()) createStickyWindow();
  }
  applyStickyState();
  pushHistoryToStickyDom();
}

let pasteQueue = Promise.resolve();
function pasteToForeground(text) {
  if (!text || !text.trim()) return Promise.resolve();
  pasteQueue = pasteQueue.then(async () => {
    clipboard.writeText(text);
    const r = await pasteKeystroke();
    if (!r.ok && win) {
      win.webContents.send('capture-error',
        `Paste: ${r.error || 'failed'} — the text is on the clipboard, press Ctrl+V manually.`);
    }
  });
  return pasteQueue;
}

async function transcribeDeepgram(wavBuffer, cfg) {
  if (!cfg.deepgramApiKey) throw new Error('Deepgram API key not set');
  const params = new URLSearchParams({ model: 'nova-2', smart_format: 'true' });
  if (cfg.language && cfg.language !== 'auto') {
    params.set('language', cfg.language);
  } else {
    params.set('detect_language', 'true');
  }
  const r = await net.fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${cfg.deepgramApiKey}`,
      'Content-Type': 'audio/wav',
    },
    body: Buffer.from(wavBuffer),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Deepgram ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return transcript.trim();
}

let transcribeQueue = Promise.resolve('');
function enqueueTranscribe(wavBuffer) {
  const cfg = state.transcription;
  transcribeQueue = transcribeQueue.then(async () => transcribeDeepgram(wavBuffer, cfg));
  return transcribeQueue;
}

function runOcrCapture2Text(rect, language) {
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

// Full language names (Capture2Text style, stored in state) -> tesseract codes.
const TESSERACT_LANGS = {
  English: 'eng', Russian: 'rus', Japanese: 'jpn', Chinese: 'chi_sim',
  Spanish: 'spa', French: 'fra', German: 'deu', Portuguese: 'por',
  Italian: 'ita', Dutch: 'nld', Turkish: 'tur', Polish: 'pol',
  Arabic: 'ara', Korean: 'kor',
};

let tesseractAvailable = null;
function hasTesseract() {
  if (tesseractAvailable === null) {
    try {
      require('child_process').execFileSync('tesseract', ['--version'], { stdio: 'ignore' });
      tesseractAvailable = true;
    } catch { tesseractAvailable = false; }
  }
  return tesseractAvailable;
}

// Cross-platform OCR: grab the capture rect from the screen via desktopCapturer
// and feed it to the tesseract CLI. Used everywhere the bundled Windows
// Capture2Text exe is not available.
async function runOcrTesseract(rect, language) {
  if (!hasTesseract()) {
    const hint = process.platform === 'darwin' ? 'brew install tesseract' : 'sudo apt install tesseract-ocr';
    throw new Error(`tesseract not installed (${hint})`);
  }
  const display = screen.getDisplayNearestPoint({ x: Math.round(rect.x1), y: Math.round(rect.y1) });
  const dsf = display.scaleFactor || 1;
  const thumbW = Math.round(display.bounds.width * dsf);
  const thumbH = Math.round(display.bounds.height * dsf);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: thumbW, height: thumbH } });
  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!source) throw new Error('no screen source available for capture');
  const crop = {
    x: Math.max(0, Math.round((rect.x1 - display.bounds.x) * dsf)),
    y: Math.max(0, Math.round((rect.y1 - display.bounds.y) * dsf)),
    width: Math.max(1, Math.round((rect.x2 - rect.x1) * dsf)),
    height: Math.max(1, Math.round((rect.y2 - rect.y1) * dsf)),
  };
  crop.width = Math.min(crop.width, thumbW - crop.x);
  crop.height = Math.min(crop.height, thumbH - crop.y);
  const png = source.thumbnail.crop(crop).toPNG();
  const tmp = path.join(app.getPath('temp'), `ace-ocr-${process.pid}.png`);
  fs.writeFileSync(tmp, png);
  const lang = TESSERACT_LANGS[language] || 'eng';
  return new Promise((resolve, reject) => {
    const p = spawn('tesseract', [tmp, 'stdout', '-l', lang, '--psm', '6']);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('exit', (code) => {
      try { fs.unlinkSync(tmp); } catch {}
      if (code === 0) resolve(out.replace(/\r/g, '').trim());
      else reject(new Error(`tesseract exit ${code}: ${err.slice(-200)}`));
    });
  });
}

function runOcr(rect, language) {
  if (process.platform === 'win32' && fs.existsSync(CAPTURE_EXE)) return runOcrCapture2Text(rect, language);
  return runOcrTesseract(rect, language);
}

let ocrInFlight = false;
let firstOcrLogged = false;
let lastOcrEmptyAt = 0;
async function captureTick() {
  if (ocrInFlight) return;
  const cfg = state.capture;
  if (!cfg.rect) return;
  ocrInFlight = true;
  try {
    const text = await runOcr(cfg.rect, cfg.language);
    if (!firstOcrLogged) {
      firstOcrLogged = true;
      if (win) win.webContents.send('capture-text', `[OCR running — first read: ${text.length} chars]`);
    }
    if (!text || !text.trim()) {
      const now = Date.now();
      if (now - lastOcrEmptyAt > 8000) {
        lastOcrEmptyAt = now;
        if (win) win.webContents.send('capture-error', 'OCR returned no text. Check capture area, language, and screen contrast.');
      }
      return;
    }
    const newPart = smartDiff(text);
    const trimmed = newPart.trim();
    if (trimmed) {
      // OCR text now flows to the in-app question composer (renderer), not a webview.
      if (win) win.webContents.send('capture-text', trimmed);
    }
  } catch (e) {
    if (win) win.webContents.send('capture-error', 'OCR exec error: ' + e.message);
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
  resetSmartDiffState();
  firstOcrLogged = false;
  lastOcrEmptyAt = 0;
  const period = Math.max(200, state.capture.pollMs || 700);
  captureLoop = setInterval(captureTick, period);
  captureTick();
  if (win) win.webContents.send('capture-state', true);
  if (state.capture.showOverlay) showCaptureOverlay();
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
  if (pendingTrailing) {
    const flush = pendingTrailing;
    pendingTrailing = '';
    pendingIdleFrames = 0;
    pastedHistory.push(flush);
    pastedHistory = pastedHistory.slice(-MAX_HISTORY_WORDS);
    if (win) win.webContents.send('capture-text', flush);
  }
  if (win) win.webContents.send('capture-state', false);
  hideCaptureOverlay();
}

function showCaptureOverlay() {
  const r = state.capture.rect;
  if (!r) return;
  const sf = r.scaleFactor || 1;
  const x = Math.round(r.x1);
  const y = Math.round(r.y1);
  const w = Math.max(20, Math.round(r.x2 - r.x1));
  const h = Math.max(20, Math.round(r.y2 - r.y1));
  if (captureOverlayWin && !captureOverlayWin.isDestroyed()) {
    try { captureOverlayWin.setBounds({ x, y, width: w, height: h }); captureOverlayWin.showInactive(); } catch {}
    return;
  }
  captureOverlayWin = new BrowserWindow({
    x, y, width: w, height: h,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  captureOverlayWin.setIgnoreMouseEvents(true);
  captureOverlayWin.setAlwaysOnTop(true, 'screen-saver');
  captureOverlayWin.setContentProtection(true);
  captureOverlayWin.loadFile(path.join(__dirname, 'renderer', 'capture-overlay.html'));
  captureOverlayWin.once('ready-to-show', () => captureOverlayWin.showInactive());
  captureOverlayWin.on('closed', () => { captureOverlayWin = null; });
}

function hideCaptureOverlay() {
  if (captureOverlayWin && !captureOverlayWin.isDestroyed()) {
    try { captureOverlayWin.close(); } catch {}
  }
  captureOverlayWin = null;
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
      if (win) win.webContents.send('selector-closed');
    });
  }, 150);
}

// ── Alt+S area-snip: drag-select a screen region → attach it as an image ──────
// Reuses the selector window. The selector is content-protected while stealth
// is on, and the main window is hidden during selection + capture, so neither
// appears in the captured region or in any screen recording.
let snipMode = false;
let snipPrevVisible = true;
function openSnipSelector() {
  if (selectorWin || snipMode) return;
  if (!win) return;
  snipMode = true;
  snipPrevVisible = win.isVisible();
  win.hide();
  setTimeout(() => {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    selectorWin = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y,
      width: display.bounds.width, height: display.bounds.height,
      frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: false, hasShadow: false, fullscreenable: false,
      webPreferences: { preload: path.join(__dirname, 'preload-selector.js'), contextIsolation: true, nodeIntegration: false },
    });
    selectorWin.setAlwaysOnTop(true, 'screen-saver');
    try { selectorWin.setContentProtection(state.stealth); } catch {}
    selectorWin.loadFile(path.join(__dirname, 'renderer', 'selector.html'));
    selectorWin.once('ready-to-show', () => selectorWin.show());
    selectorWin.on('closed', () => { selectorWin = null; });
  }, 150);
}

function pickSourceForDisplay(sources, display) {
  const byId = sources.find(s => s.display_id && String(s.display_id) === String(display.id));
  if (byId) return byId;
  const displays = screen.getAllDisplays();
  const idx = displays.findIndex(d => d.id === display.id);
  return sources[idx] || sources[0];
}

async function handleSnipDone(rect) {
  const display = selectorWin
    ? screen.getDisplayMatching(selectorWin.getBounds())
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const sf = display.scaleFactor || 1;
  const x = Math.min(rect.x1, rect.x2), y = Math.min(rect.y1, rect.y2);
  const w = Math.abs(rect.x2 - rect.x1), h = Math.abs(rect.y2 - rect.y1);
  if (selectorWin) { try { selectorWin.close(); } catch {} selectorWin = null; }
  // Let the selector vanish before grabbing pixels.
  await new Promise(r => setTimeout(r, 180));
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) },
    });
    const src = pickSourceForDisplay(sources, display);
    const cropped = src.thumbnail.crop({
      x: Math.round(x * sf), y: Math.round(y * sf),
      width: Math.max(1, Math.round(w * sf)), height: Math.max(1, Math.round(h * sf)),
    });
    const dataUrl = cropped.toDataURL();
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (win && !win.isDestroyed()) win.webContents.send('snip-image', { base64: b64, mime: 'image/png' });
  } catch (e) {
    appendLogLine('[snip] capture failed: ' + e.message);
  }
  snipMode = false;
  if (snipPrevVisible && win) win.show();
}

ipcMain.on('selector-done', (_e, rect) => {
  if (snipMode) { handleSnipDone(rect || {}); return; }
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
  if (snipMode) {
    snipMode = false;
    if (selectorWin) { try { selectorWin.close(); } catch {} selectorWin = null; }
    if (snipPrevVisible && win) win.show();
    return;
  }
  if (selectorWin) selectorWin.close();
  if (pendingRestart) {
    pendingRestart = false;
    setTimeout(() => startCaptureLoop(), 400);
  }
});

const HOTKEY_HANDLERS = {
  toggleVisibility: () => toggleVisible(),
  moveLeft: () => nudge(-MOVE_STEP_X, 0),
  moveRight: () => nudge(MOVE_STEP_X, 0),
  moveUp: () => nudge(0, -MOVE_STEP_Y),
  moveDown: () => nudge(0, MOVE_STEP_Y),
  opacityUp: () => setOpacity((win?.getOpacity() ?? 1) + OPACITY_STEP),
  opacityDown: () => setOpacity((win?.getOpacity() ?? 1) - OPACITY_STEP),
  scrollUp: () => { if (win && !win.isDestroyed()) win.webContents.send('scroll-answer', -1); },
  scrollDown: () => { if (win && !win.isDestroyed()) win.webContents.send('scroll-answer', 1); },
  resetCaptureArea: () => triggerResetCaptureArea(),
  toggleStealth: () => setStealth(!state.stealth),
  toggleRecording: () => { if (win) win.webContents.send('toggle-recording'); },
  toggleMode: () => { if (win) win.webContents.send('toggle-mode'); },
  pushToTalk: () => cycleMicModeFromHotkey(),
  closeSticky: () => closeStickyWindow(),
  openSticky: () => openStickyWindow(),
  stickyScrollUp: () => scrollSticky(-1),
  stickyScrollDown: () => scrollSticky(1),
  helpRequest: () => sendHelpRequest(),
  submitPrompt: () => { if (win && !win.isDestroyed()) win.webContents.send('trigger-get-answer'); },
  screenshotToAI: () => { if (win && !win.isDestroyed()) win.webContents.send('trigger-screenshot'); },
  areaSnip: () => openSnipSelector(),
  toggleClickThrough: () => setClickThrough(!state.clickThrough),
  reloadSite: () => { if (win && !win.isDestroyed()) win.webContents.send('reload-site'); },
  clearTranscriptBubble: () => { if (win && !win.isDestroyed()) win.webContents.send('clear-meet-bubble'); },
};

function setClickThrough(value) {
  state.clickThrough = !!value;
  if (win) {
    try { win.setIgnoreMouseEvents(state.clickThrough, { forward: true }); } catch {}
  }
  if (stickyWin && !stickyWin.isDestroyed()) {
    try { stickyWin.setIgnoreMouseEvents(state.clickThrough, { forward: true }); } catch {}
  }
  saveState();
  if (win) win.webContents.send('click-through-changed', state.clickThrough);
}

function sendHelpRequest() {
  if (state.network.role !== 'speaker') {
    if (win) win.webContents.send('capture-error', 'Help-me hotkey: only the speaker can send help requests');
    return;
  }
  let count = 0;
  for (const entry of supporterConns.values()) {
    if (entry && entry.ws && entry.ws.readyState === WebSocket.OPEN) {
      try {
        entry.ws.send(JSON.stringify({ type: 'help-request', ts: Date.now() }));
        count++;
      } catch {}
    }
  }
  if (win) {
    win.webContents.send('capture-text', `[help request sent to ${count} supporter(s)]`);
  }
}

let wsServer = null;
let wsClient = null;
let wsReconnectTimer = null;
let nextConnId = 1;
const supporterConns = new Map();
let supporterOwnMicMode = 'aOnly';
const MIC_MODES = ['mute', 'aOnly', 'aAndC'];
function nextMicMode(m) { const i = MIC_MODES.indexOf(m); return MIC_MODES[(i + 1) % MIC_MODES.length] || 'aOnly'; }

function supporterListSnapshot() {
  return Array.from(supporterConns.entries()).map(([id, entry]) => ({
    id,
    ip: (entry && entry.ip) || null,
    port: (entry && entry.port) || null,
    micMode: (entry && entry.micMode) || 'aOnly',
  }));
}

function broadcastNetworkStatus() {
  if (!win) return;
  const status = {
    role: state.network.role,
    address: state.network.address,
    bound: !!wsServer,
    connected: wsClient ? wsClient.readyState === WebSocket.OPEN : false,
    supporters: supporterListSnapshot(),
    maxSupporters: state.network.maxSupporters || 5,
  };
  win.webContents.send('network-status', status);
}

function setSupporterMicMode(id, mode) {
  if (!MIC_MODES.includes(mode)) return false;
  const entry = supporterConns.get(id);
  if (!entry) return false;
  if (entry.micMode === mode) return true;
  entry.micMode = mode;
  if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
    try { entry.ws.send(JSON.stringify({ type: 'mic-mode', mode })); } catch {}
  }
  if (win) win.webContents.send('mic-mode-changed', { id, mode, source: 'self' });
  broadcastNetworkStatus();
  return true;
}

function parseAddress(addr) {
  const m = String(addr || '').match(/^([^:]+):(\d+)$/);
  if (!m) return null;
  return { host: m[1], port: parseInt(m[2], 10) };
}

function stopSignalingServer() {
  for (const entry of supporterConns.values()) {
    try { entry.ws.close(); } catch {}
  }
  supporterConns.clear();
  if (wsServer) {
    try { wsServer.close(); } catch {}
    wsServer = null;
  }
  broadcastNetworkStatus();
}

function ensureFirewallRule(port, force) {
  if (process.platform !== 'win32') return;
  const exePath = process.execPath;
  // Skip if already configured for this exe + port (unless forced via the button)
  const tag = `${exePath}|${port}`;
  if (!force && state.network.firewallConfiguredFor === tag) return;
  // Write the netsh commands into a temp .ps1, then run it elevated — avoids nested quoting issues.
  const ps1 = path.join(os.tmpdir(), `stealth-fw-${Date.now()}.ps1`);
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `netsh advfirewall firewall delete rule name="Stealth Support" | Out-Null`,
    `netsh advfirewall firewall delete rule name="Stealth Support Port" | Out-Null`,
    `netsh advfirewall firewall add rule name="Stealth Support" dir=in action=allow program="${exePath}" enable=yes profile=any | Out-Null`,
    `netsh advfirewall firewall add rule name="Stealth Support Port" dir=in action=allow protocol=TCP localport=${port} enable=yes profile=any | Out-Null`,
  ].join('\r\n');
  try {
    fs.writeFileSync(ps1, script, 'utf8');
  } catch (e) {
    if (win) win.webContents.send('network-error', 'Firewall: could not write script: ' + e.message);
    return;
  }
  const launch = `Start-Process -Verb RunAs -WindowStyle Hidden -FilePath powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${ps1}'`;
  try {
    const p = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', launch], { windowsHide: true });
    p.on('error', (e) => { if (win) win.webContents.send('network-error', 'Firewall rule failed: ' + e.message); });
    p.on('exit', () => {
      state.network.firewallConfiguredFor = tag;
      saveState();
      if (win) win.webContents.send('capture-text', `[firewall rule ensured for port ${port}]`);
      setTimeout(() => { try { fs.unlinkSync(ps1); } catch {} }, 10000);
    });
  } catch (e) {
    if (win) win.webContents.send('network-error', 'Firewall rule error: ' + e.message);
  }
}

function startSignalingServer() {
  stopSignalingServer();
  const addr = parseAddress(state.network.address);
  if (!addr) {
    if (win) win.webContents.send('network-error', 'Invalid address: ' + state.network.address);
    return;
  }
  ensureFirewallRule(addr.port, false);
  try {
    wsServer = new WebSocket.Server({ port: addr.port, host: '0.0.0.0' });
  } catch (e) {
    if (win) win.webContents.send('network-error', 'Bind failed: ' + e.message);
    wsServer = null;
    broadcastNetworkStatus();
    return;
  }
  wsServer.on('connection', (ws, req) => {
    let ip = (req && req.socket && req.socket.remoteAddress) || '';
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    if (ip === '::1') ip = '127.0.0.1';
    const port = (req && req.socket && req.socket.remotePort) || 0;
    if (supporterConns.size >= 1) {
      try {
        ws.send(JSON.stringify({ type: 'reject', reason: 'capacity' }));
        ws.close(4002, 'capacity');
      } catch {}
      return;
    }
    for (const e of supporterConns.values()) {
      if (e && e.ip === ip && e.port === port) {
        try {
          ws.send(JSON.stringify({ type: 'reject', reason: 'duplicate' }));
          ws.close(4003, 'duplicate');
        } catch {}
        return;
      }
    }
    const id = String(nextConnId++);
    const initialMicMode = 'aOnly';
    supporterConns.set(id, { ws, ip, port, micMode: initialMicMode });
    try { ws.send(JSON.stringify({ type: 'hello', id, micMode: initialMicMode })); } catch {}
    for (const m of chatHistory) {
      if (!m || !m.fromMe) continue;
      if (m.type !== 'chat-text' && m.type !== 'chat-image') continue;
      try {
        const payload = m.type === 'chat-text'
          ? { type: 'chat-text', text: m.text, ts: m.ts }
          : { type: 'chat-image', dataUrl: m.dataUrl, ts: m.ts };
        ws.send(JSON.stringify(payload));
      } catch {}
    }
    if (win) win.webContents.send('signaling-in', { connId: id, type: 'opened', ip });
    broadcastNetworkStatus();
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg && msg.type === 'request-mic-mode') {
        setSupporterMicMode(id, msg.mode);
        return;
      }
      if (msg && (msg.type === 'chat-text' || msg.type === 'chat-image')) {
        if (win) win.webContents.send('capture-text', `[chat received from #${id}: ${msg.type}${msg.text ? ' "' + msg.text.slice(0,40) + '"' : ''}]`);
        pushChatToSticky({ ...msg, fromId: id, fromMe: false, ts: msg.ts || Date.now() });
        return;
      }
      if (msg && msg.type === 'chat-clear') {
        chatHistory = [];
        pushHistoryToStickyDom();
        for (const e2 of supporterConns.values()) {
          if (e2 && e2.ws && e2.ws.readyState === WebSocket.OPEN) {
            try { e2.ws.send(JSON.stringify({ type: 'chat-clear', ts: Date.now() })); } catch {}
          }
        }
        return;
      }
      if (win) win.webContents.send('signaling-in', { connId: id, ...msg });
    });
    ws.on('close', () => {
      supporterConns.delete(id);
      if (win) win.webContents.send('signaling-in', { connId: id, type: 'closed' });
      broadcastNetworkStatus();
    });
    ws.on('error', () => {});
  });
  wsServer.on('error', (e) => {
    if (win) win.webContents.send('network-error', 'Server error: ' + e.message);
  });
  broadcastNetworkStatus();
}

function disconnectSignalingClient() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  if (wsClient) {
    try { wsClient.close(); } catch {}
    wsClient = null;
  }
  broadcastNetworkStatus();
}

function connectSignalingClient() {
  disconnectSignalingClient();
  const addr = parseAddress(state.network.address);
  if (!addr) {
    if (win) win.webContents.send('network-error', 'Invalid address: ' + state.network.address);
    return;
  }
  const url = `ws://${addr.host}:${addr.port}`;
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    if (win) win.webContents.send('network-error', 'Connect failed: ' + e.message);
    return;
  }
  wsClient = ws;
  ws.on('open', () => {
    if (win) win.webContents.send('signaling-in', { type: 'opened' });
    broadcastNetworkStatus();
  });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg && msg.type === 'help-request') {
      if (win) win.webContents.send('help-request-received', msg);
      return;
    }
    if (msg && (msg.type === 'chat-text' || msg.type === 'chat-image')) {
      if (win) win.webContents.send('chat-incoming', { ...msg, ts: msg.ts || Date.now() });
      return;
    }
    if (msg && msg.type === 'chat-clear') {
      if (win) win.webContents.send('chat-clear');
      return;
    }
    if (msg && (msg.type === 'mic-mode' || (msg.type === 'hello' && msg.micMode))) {
      const mode = MIC_MODES.includes(msg.micMode || msg.mode) ? (msg.micMode || msg.mode) : 'aOnly';
      if (mode !== supporterOwnMicMode) {
        supporterOwnMicMode = mode;
        if (win) win.webContents.send('mic-mode-changed', { mode, source: 'speaker' });
      }
    }
    if (win) win.webContents.send('signaling-in', msg);
  });
  ws.on('close', (code, reason) => {
    if (win) win.webContents.send('signaling-in', { type: 'closed', code, reason: reason ? reason.toString() : '' });
    if (wsClient === ws) wsClient = null;
    broadcastNetworkStatus();
    if (code === 4000) {
      if (win) win.webContents.send('kicked-by-speaker');
      return;
    }
    if (state.network.role === 'supporter') {
      wsReconnectTimer = setTimeout(connectSignalingClient, 5000);
    }
  });
  ws.on('error', (e) => {
    if (win) win.webContents.send('network-error', 'WS error: ' + e.message);
  });
  broadcastNetworkStatus();
}

function sendSignaling(msg) {
  if (state.network.role === 'speaker') {
    const id = msg.connId;
    const entry = id ? supporterConns.get(id) : null;
    if (entry && entry.ws && entry.ws.readyState === WebSocket.OPEN) {
      const out = { ...msg };
      delete out.connId;
      try { entry.ws.send(JSON.stringify(out)); } catch {}
    }
  } else if (state.network.role === 'supporter') {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try { wsClient.send(JSON.stringify(msg)); } catch {}
    }
  }
}

function startNetwork() {
  if (state.network.role === 'speaker') {
    disconnectSignalingClient();
    startSignalingServer();
  } else if (state.network.role === 'supporter') {
    stopSignalingServer();
    connectSignalingClient();
  }
}

function stopNetwork() {
  stopSignalingServer();
  disconnectSignalingClient();
}

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

function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => {
    if (win) win.webContents.send('updater-status', { state: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    if (win) win.webContents.send('updater-status', { state: 'available', version: info?.version });
  });
  autoUpdater.on('update-not-available', () => {
    if (win) win.webContents.send('updater-status', { state: 'up-to-date' });
  });
  autoUpdater.on('download-progress', (p) => {
    if (win) win.webContents.send('updater-status', { state: 'downloading', percent: Math.round(p.percent || 0) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (win) win.webContents.send('updater-status', { state: 'downloaded', version: info?.version });
  });
  autoUpdater.on('error', (err) => {
    if (win) win.webContents.send('updater-status', { state: 'error', message: err?.message || String(err) });
  });
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
}

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { ok: false, message: 'electron-updater not installed' };
  try {
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, version: r?.updateInfo?.version };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('install-update-now', () => {
  if (!autoUpdater) return false;
  try { autoUpdater.quitAndInstall(); return true; } catch { return false; }
});

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-info', () => {
  // Packaged: the executable's timestamp is the build date. Dev: main.js mtime.
  let buildDate = null;
  try {
    const f = app.isPackaged ? app.getPath('exe') : path.join(__dirname, 'main.js');
    buildDate = fs.statSync(f).mtime.toISOString();
  } catch {}
  return { version: app.getVersion(), buildDate };
});

// ── License gate ─────────────────────────────────────────────────────────────
// The app only starts once a valid MAC-bound license is stored (license.js).
// First run (or after expiry) shows a small window with this PC's MAC address;
// the user sends it to the admin, receives a key from the admin generator
// (license-admin/), and enters it once. Verification is offline against the
// embedded public key, so no network is needed to activate.

let licenseWin = null;

function startApp() {
  createWindow();
  createFloatWindow();
  registerHotkeys();
  setupAutoUpdater();
}

function openLicenseWindow(reason) {
  licenseWin = new BrowserWindow({
    width: 460,
    height: 392,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    title: 'Activation',
    webPreferences: {
      preload: path.join(__dirname, 'preload-license.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  licenseWin.setMenuBarVisibility(false);
  licenseWin.loadFile(path.join(__dirname, 'renderer', 'license.html'));
  const showLicense = () => { if (licenseWin && !licenseWin.isDestroyed() && !licenseWin.isVisible()) licenseWin.show(); };
  licenseWin.once('ready-to-show', showLicense);
  licenseWin.webContents.once('did-finish-load', () => setTimeout(showLicense, 100));
  licenseWin.on('closed', () => { licenseWin = null; });

  ipcMain.removeHandler('license-info');
  ipcMain.removeHandler('license-submit');
  ipcMain.removeHandler('license-copy-mac');
  ipcMain.removeHandler('license-quit');
  ipcMain.handle('license-info', () => ({
    mac: license.formatMac(license.primaryMac() || ''),
    reason,
  }));
  ipcMain.handle('license-copy-mac', () => clipboard.writeText(license.formatMac(license.primaryMac() || '')));
  ipcMain.handle('license-quit', () => app.quit());
  ipcMain.handle('license-submit', (_e, code) => {
    const r = license.verifyLicense(code, license.machineMacs(), Date.now());
    if (!r.ok) return { ok: false, reason: r.reason };
    license.saveStoredLicense(app.getPath('userData'), String(code).trim(), Date.now());
    setTimeout(() => {
      if (licenseWin && !licenseWin.isDestroyed()) { licenseWin.removeAllListeners('closed'); licenseWin.close(); licenseWin = null; }
      startApp();
    }, 900);
    return { ok: true, expiresAt: r.expiresAt };
  });
}

app.whenReady().then(() => {
  const check = license.checkStoredLicense(app.getPath('userData'));
  if (check.ok) startApp();
  else openLicenseWindow(check.reason);
});

ipcMain.handle('set-opacity', (_e, value) => setOpacity(value));
ipcMain.handle('get-opacity', () => win?.getOpacity() ?? 1);
ipcMain.handle('set-stealth', (_e, value) => setStealth(value));
ipcMain.handle('get-stealth', () => state.stealth);
ipcMain.handle('set-click-through', (_e, value) => setClickThrough(value));
ipcMain.handle('get-click-through', () => state.clickThrough);
ipcMain.handle('hide', () => win?.hide());
ipcMain.handle('quit', () => app.quit());
ipcMain.handle('get-desktop-source-id', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources[0] ? sources[0].id : null;
  } catch {
    return null;
  }
});

// Returns the sorted index of the display the cursor is on (no desktopCapturer needed).
ipcMain.handle('get-cursor-display-index', () => {
  try {
    const point   = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const sorted  = screen.getAllDisplays()
      .slice()
      .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
    const idx = sorted.findIndex((d) => d.id === display.id);
    return idx >= 0 ? idx : 0;
  } catch { return 0; }
});

// Returns all screen source IDs sorted by name (Screen 1, Screen 2 …).
ipcMain.handle('get-all-screen-source-ids', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((s) => s.id);
  } catch { return []; }
});

ipcMain.handle('get-cursor-screen-source-id', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  // Return only serializable fields — skip NativeImage thumbnails.
  return sources.map((s) => ({ id: s.id, name: s.name, display_id: s.display_id }));
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
  applyBuiltinKeys();
  saveState();
});

function getMeetingConfig() {
  const m = state.meeting || {};
  const hiringType = ['intro', 'technical', 'ceo', 'hr'].includes(m.hiringType) ? m.hiringType : 'intro';
  return { kind: 'hiring', hiringType };
}
ipcMain.handle('get-meeting-config', () => getMeetingConfig());
ipcMain.handle('set-meeting-config', (_e, cfg) => {
  const next = { ...getMeetingConfig(), ...(cfg || {}) };
  next.kind = 'hiring';
  if (!['intro', 'technical', 'ceo', 'hr'].includes(next.hiringType)) next.hiringType = 'intro';
  delete next.roster;
  state.meeting = next;
  saveState();
  schedulePromptCacheWarm();
  return getMeetingConfig();
});
ipcMain.handle('transcribe', async (_e, wavArrayBuffer) => enqueueTranscribe(wavArrayBuffer));

let deepgramActive = false;       // true between start and stop of voice
let deepgramAuth = null;          // { apiKey, language } kept for reconnects
let deepgramKeepAlive = null;     // interval id
let deepgramReconnectTimer = null;
let deepgramReconnectAttempts = 0;

function clearDeepgramTimers() {
  if (deepgramKeepAlive) { clearInterval(deepgramKeepAlive); deepgramKeepAlive = null; }
  if (deepgramReconnectTimer) { clearTimeout(deepgramReconnectTimer); deepgramReconnectTimer = null; }
}

function scheduleDeepgramReconnect() {
  if (!deepgramActive || deepgramReconnectTimer || deepgramWs) return;
  const delay = Math.min(5000, 800 * Math.pow(2, deepgramReconnectAttempts));
  deepgramReconnectAttempts++;
  appendLogLine(`[deepgram] connection lost — reconnecting in ${delay}ms`);
  deepgramReconnectTimer = setTimeout(() => {
    deepgramReconnectTimer = null;
    if (deepgramActive && !deepgramWs && deepgramAuth) {
      startDeepgramWs(deepgramAuth.apiKey, deepgramAuth.language);
    }
  }, delay);
}

function defaultTranscriptWho() {
  return 'Interviewer';
}

function parseTranscriptAlternative(alt) {
  const transcript = String((alt && alt.transcript) || '').trim();
  const words = (alt && alt.words) || [];
  const text = transcript || words.map((w) => w.punctuated_word || w.word || '').join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return { text: '', labeled: '', speaker: 0, turns: [] };
  const who = defaultTranscriptWho();
  return { text, labeled: who + ': ' + text, speaker: 0, turns: [{ speaker: 0, who, text }] };
}

function startDeepgramWs(apiKey, language) {
  if (deepgramWs) return;
  const params = new URLSearchParams({
    encoding: 'linear16',
    sample_rate: '16000', channels: '1',
    smart_format: 'true', interim_results: 'true',
    // VAD + utterance-end events for smoother, more natural finalization.
    vad_events: 'true', endpointing: '150', no_delay: 'true', utterance_end_ms: '1500',
    punctuate: 'true',
  });
  params.set('model', 'nova-2');
  params.set('language', (language && language !== 'auto') ? language : 'en-US');

  deepgramWs = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  let handshakeFailed = false;
  deepgramWs.on('open', () => {
    appendLogLine('[deepgram] connected');
    deepgramReconnectAttempts = 0;
    // Periodic KeepAlive so Deepgram doesn't idle-close the socket during brief
    // silences or throttle gaps (it drops connections after ~10s of no audio).
    if (deepgramKeepAlive) clearInterval(deepgramKeepAlive);
    deepgramKeepAlive = setInterval(() => {
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        try { deepgramWs.send(JSON.stringify({ type: 'KeepAlive' })); } catch {}
      }
    }, 7000);
  });
  deepgramWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'UtteranceEnd') {
        // Speech-gap boundary — tells the renderer to flush any pending interim.
        if (win && !win.isDestroyed()) win.webContents.send('transcript-utterance-end');
        return;
      }
      if (msg.type !== 'Results') return;
      const parsed = parseTranscriptAlternative(msg.channel?.alternatives?.[0]);
      if (!parsed.text) return;
      if (msg.is_final) sessionLog.push({ ts: Date.now(), kind: 'voice', text: parsed.labeled || parsed.text });
      if (win && !win.isDestroyed()) {
        win.webContents.send('transcript-live', {
          text: parsed.text,
          labeled: parsed.labeled,
          speaker: parsed.speaker,
          turns: parsed.turns || [],
          isFinal: !!msg.is_final,
        });
      }
    } catch {}
  });
  // A rejected WS handshake (bad key, bad params, no credits) comes through here
  // with the real HTTP status — turn it into a plain, actionable message.
  deepgramWs.on('unexpected-response', (_req, res) => {
    handshakeFailed = true;
    let body = '';
    res.on('data', (d) => { body += d.toString(); });
    res.on('end', () => {
      let detail = '';
      try { const j = JSON.parse(body); detail = j.err_msg || j.reason || j.message || ''; } catch {}
      const msg = friendlyDeepgramError(res.statusCode, detail);
      appendLogLine(`[deepgram] handshake ${res.statusCode}: ${body.slice(0, 200)}`);
      if (win && !win.isDestroyed()) win.webContents.send('transcript-live-error', msg);
      // A handshake rejection (bad key / params / no credits) won't fix itself —
      // stop so we don't reconnect-loop against a 401.
      deepgramActive = false;
      clearDeepgramTimers();
      try { if (deepgramWs) deepgramWs.terminate(); } catch {}
      deepgramWs = null;
    });
  });
  deepgramWs.on('error', (e) => {
    if (handshakeFailed) return; // friendlier message already sent above
    appendLogLine('[deepgram] error: ' + e.message);
  });
  deepgramWs.on('close', () => {
    if (deepgramKeepAlive) { clearInterval(deepgramKeepAlive); deepgramKeepAlive = null; }
    deepgramWs = null;
    // If the user is still recording, transparently reconnect.
    if (deepgramActive && !handshakeFailed) scheduleDeepgramReconnect();
  });
}

function friendlyDeepgramError(status, detail) {
  const tail = detail ? ` — ${detail}` : '';
  switch (status) {
    case 400:
      return `Deepgram rejected the request (400). Try picking a specific language in Settings → Voice.${tail}`;
    case 401:
      return `Deepgram rejected your API key (401). Check the key in Settings → Voice.${tail}`;
    case 402:
    case 403:
      return `Deepgram access denied (${status}) — out of credits or the key lacks permission.${tail}`;
    case 404:
      return `Deepgram endpoint/model not found (404).${tail}`;
    case 429:
      return `Deepgram rate limit / out of credits (429). Try again shortly.${tail}`;
    default:
      return `Deepgram connection failed (${status || 'unknown'}).${tail}`;
  }
}

// ---- xAI (Grok) Speech-to-Text streaming — mirrors the Deepgram path above.
// Protocol: connect wss://api.x.ai/v1/stt, wait for {type:'transcript.created'},
// stream raw PCM16 binary frames, receive {type:'transcript.partial'|'transcript.done'}
// with is_final/speech_final, then send {type:'audio.done'} to finish. ----
let xaiWs = null;
let xaiActive = false;
let xaiAuth = null;
let xaiReady = false;             // server sent transcript.created -> ok to send audio
let xaiReconnectTimer = null;
let xaiReconnectAttempts = 0;

function clearXaiTimers() {
  if (xaiReconnectTimer) { clearTimeout(xaiReconnectTimer); xaiReconnectTimer = null; }
}

function scheduleXaiReconnect() {
  if (!xaiActive || xaiReconnectTimer || xaiWs) return;
  const delay = Math.min(5000, 800 * Math.pow(2, xaiReconnectAttempts));
  xaiReconnectAttempts++;
  appendLogLine(`[xai] connection lost — reconnecting in ${delay}ms`);
  xaiReconnectTimer = setTimeout(() => {
    xaiReconnectTimer = null;
    if (xaiActive && !xaiWs && xaiAuth) startXaiWs(xaiAuth.apiKey, xaiAuth.language);
  }, delay);
}

function friendlyXaiError(status, detail) {
  const tail = detail ? ` — ${detail}` : '';
  switch (status) {
    case 400: return `xAI rejected the request (400). Try a specific language in Settings → Voice.${tail}`;
    case 401:
    case 403: return `xAI rejected your API key (${status}). Check the key in Settings → Voice.${tail}`;
    case 429: return `xAI rate limit / quota (429). Try again shortly.${tail}`;
    default:  return `xAI connection failed (${status || 'unknown'}).${tail}`;
  }
}

function startXaiWs(apiKey, language) {
  if (xaiWs) return;
  xaiReady = false;
  const params = new URLSearchParams({
    sample_rate: '16000', encoding: 'pcm',
    interim_results: 'true', endpointing: '300',
  });
  if (language && language !== 'auto') params.set('language', language);

  xaiWs = new WebSocket(`wss://api.x.ai/v1/stt?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  let handshakeFailed = false;
  xaiWs.on('open', () => {
    appendLogLine('[xai] connected');
    xaiReconnectAttempts = 0;
  });
  xaiWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'transcript.created') { xaiReady = true; return; }
      if (msg.type === 'error') {
        const m = msg.message || msg.error || '';
        appendLogLine('[xai] error: ' + m);
        if (win && !win.isDestroyed()) win.webContents.send('transcript-live-error', 'xAI: ' + (m || 'error'));
        return;
      }
      if (msg.type === 'transcript.partial' || msg.type === 'transcript.done') {
        const isFinal = msg.type === 'transcript.done' || !!msg.is_final;
        const parsed = parseTranscriptAlternative({
          transcript: msg.text || msg.transcript,
          words: msg.words || (msg.channel && msg.channel.alternatives && msg.channel.alternatives[0] && msg.channel.alternatives[0].words),
        });
        if (parsed.text) {
          if (isFinal) sessionLog.push({ ts: Date.now(), kind: 'voice', text: parsed.labeled || parsed.text });
          if (win && !win.isDestroyed()) {
            win.webContents.send('transcript-live', {
              text: parsed.text,
              labeled: parsed.labeled,
              speaker: parsed.speaker,
              turns: parsed.turns || [],
              isFinal,
            });
          }
        }
        // speech_final marks an utterance boundary — same role as Deepgram's UtteranceEnd.
        if (msg.speech_final && win && !win.isDestroyed()) win.webContents.send('transcript-utterance-end');
      }
    } catch {}
  });
  xaiWs.on('unexpected-response', (_req, res) => {
    handshakeFailed = true;
    let body = '';
    res.on('data', (d) => { body += d.toString(); });
    res.on('end', () => {
      let detail = '';
      try { const j = JSON.parse(body); detail = j.error || j.message || j.reason || ''; } catch {}
      const msg = friendlyXaiError(res.statusCode, detail);
      appendLogLine(`[xai] handshake ${res.statusCode}: ${body.slice(0, 200)}`);
      if (win && !win.isDestroyed()) win.webContents.send('transcript-live-error', msg);
      xaiActive = false;
      clearXaiTimers();
      try { if (xaiWs) xaiWs.terminate(); } catch {}
      xaiWs = null;
      xaiReady = false;
    });
  });
  xaiWs.on('error', (e) => {
    if (handshakeFailed) return;
    appendLogLine('[xai] error: ' + e.message);
  });
  xaiWs.on('close', () => {
    xaiWs = null;
    xaiReady = false;
    if (xaiActive && !handshakeFailed) scheduleXaiReconnect();
  });
}

ipcMain.handle('start-xai-stream', (_e, { apiKey, language }) => {
  xaiActive = true;
  xaiAuth = { apiKey, language };
  xaiReconnectAttempts = 0;
  clearXaiTimers();
  startXaiWs(apiKey, language);
});
ipcMain.handle('stop-xai-stream', () => {
  xaiActive = false;
  clearXaiTimers();
  if (xaiWs) {
    try { xaiWs.send(JSON.stringify({ type: 'audio.done' })); } catch {}
    try { xaiWs.close(); } catch {}
    xaiWs = null;
  }
  xaiReady = false;
});

ipcMain.handle('start-deepgram-stream', (_e, { apiKey, language }) => {
  deepgramActive = true;
  deepgramAuth = { apiKey, language };
  deepgramReconnectAttempts = 0;
  clearDeepgramTimers();
  startDeepgramWs(apiKey, language);
});
ipcMain.handle('stop-deepgram-stream', () => {
  deepgramActive = false;        // prevents the close handler from reconnecting
  clearDeepgramTimers();
  if (deepgramWs) {
    try { deepgramWs.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
    try { deepgramWs.close(); } catch {}
    deepgramWs = null;
  }
});
ipcMain.on('audio-chunk', (_e, buf) => {
  if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(buf);
  else if (xaiWs && xaiWs.readyState === WebSocket.OPEN && xaiReady) xaiWs.send(buf);
});
ipcMain.on('session-log-add', (_e, entry) => { sessionLog.push(entry); });
ipcMain.handle('clear-session-log', () => { sessionLog = []; });
ipcMain.handle('save-session-log', async (_e, suggestedName) => {
  if (sessionLog.length === 0) return null;
  const lines = sessionLog.map(e => {
    const d = new Date(e.ts);
    const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    return `[${t}] [${e.kind.toUpperCase()}] ${e.text}`;
  }).join('\n');
  // Sanitize the suggested filename (from the session title); fall back to a date.
  const safe = String(suggestedName || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const fileBase = safe || `session-${new Date().toISOString().slice(0, 10)}`;
  const r = await dialog.showSaveDialog(win, {
    title: 'Save session transcript',
    defaultPath: path.join(app.getPath('desktop'), `${fileBase}.txt`),
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (!r.canceled && r.filePath) {
    await fs.promises.writeFile(r.filePath, lines, 'utf8');
    sessionLog = [];
    return r.filePath;
  }
  return null;
});

// Set the current session's title from company/position (+ today's date) at
// end-of-session. Returns the composed title (also used for the .txt filename).
ipcMain.handle('session-finalize', (_e, { company, position } = {}) => {
  const s = currentSession();
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const title = [String(company || '').trim(), String(position || '').trim(), dateStr].filter(Boolean).join(' · ');
  if (s) {
    s.company = String(company || '').trim();
    s.position = String(position || '').trim();
    s.name = title;
    s.updatedAt = Date.now();
    if (meetSaveTimer) { clearTimeout(meetSaveTimer); meetSaveTimer = null; }
    saveSessions();
  }
  return title;
});

ipcMain.handle('paste-text', (_e, text) => pasteToForeground(text));

// ---------------------------------------------------------------------------
// Answer generation. Builds the interview prompt, then streams a reply from
// the selected provider (xAI / Anthropic / OpenAI) into the Answer
// panel. Keys and last-used models are stored per provider.
// ---------------------------------------------------------------------------
let answerAbort = null;
// Speculative answer state
let speculativeAbort = null;
// ── IDE Typing session state ─────────────────────────────────────────────────
let ideTypingActive = false;
let ideTypingPaused = false;   // manual pause
let ideFocusPaused = false;    // auto-pause when our window gains focus
let ideUserPaused = false;     // take-over auto-pause when the user moves the mouse
let ideInjector = null;
let ideTypingCancelled = false;
function notifyTypingState() {
  const payload = { paused: ideTypingPaused || ideFocusPaused || ideUserPaused, active: ideTypingActive };
  if (win && !win.isDestroyed()) win.webContents.send('ide-typing-state', payload);
}
// Hard stop: cancel the loop and kill the PowerShell session immediately.
function stopIdeTyping() {
  if (!ideTypingActive && !ideInjector) return;
  ideTypingCancelled = true;
  ideTypingPaused = false;
  if (ideInjector) { try { ideInjector.dispose(); } catch {} ideInjector = null; }
  notifyTypingState();
}

// ── Cursor take-over auto-pause ───────────────────────────────────────────────
// The bot types with SendKeys (keyboard only) and never moves the mouse, so ANY
// mouse movement is unambiguously the user "taking over". We only OBSERVE the
// cursor (no input injected, no focus change), so this can't disturb typing.
//   • mouse moves      → pause
//   • mouse idle ~1.5s → auto-resume
let cursorPollTimer = null;
let _lastCursorPt = null;
let _lastMoveAt = 0;
const CURSOR_MOVE_THRESHOLD = 6;   // px per poll to count as "moving"
const CURSOR_IDLE_RESUME_MS = 1500;
function startCursorTakeover() {
  stopCursorTakeover();
  ideUserPaused = false;
  try { _lastCursorPt = screen.getCursorScreenPoint(); } catch { _lastCursorPt = null; }
  _lastMoveAt = 0;
  cursorPollTimer = setInterval(() => {
    if (!ideTypingActive) return;
    let pt; try { pt = screen.getCursorScreenPoint(); } catch { return; }
    if (_lastCursorPt) {
      const moved = Math.abs(pt.x - _lastCursorPt.x) + Math.abs(pt.y - _lastCursorPt.y) > CURSOR_MOVE_THRESHOLD;
      if (moved) {
        _lastMoveAt = Date.now();
        if (!ideUserPaused) { ideUserPaused = true; notifyTypingState(); }
      } else if (ideUserPaused && Date.now() - _lastMoveAt > CURSOR_IDLE_RESUME_MS) {
        ideUserPaused = false; notifyTypingState();
      }
    }
    _lastCursorPt = pt;
  }, 120);
}
function stopCursorTakeover() {
  if (cursorPollTimer) { clearInterval(cursorPollTimer); cursorPollTimer = null; }
  ideUserPaused = false;
}
let speculativeQuestion = null;
let speculativeActive = false;
let speculativeCommitted = false; // true after commit — stream pipes directly to renderer

// ── Conversation memory ───────────────────────────────────────────────────────
// Everything the assistant has produced this session (answers, code, diagrams)
// is remembered and fed back as context so follow-up questions build on the CV,
// support material AND the diagrams/code already generated.
let convoHistory = []; // [{ user, assistant, mode }]
const CONVO_CHAR_BUDGET = 6000; // recent turns only — long history inflates prefill/TTFT
const ANSWER_CONV_FALLBACK = 'ace-' + Date.now().toString(36);

function answerConvId() {
  return currentSessionId || ANSWER_CONV_FALLBACK;
}

function maxTokensForMode(mode) {
  if (mode === 'CODE') return 8192;
  if (mode === 'DIAGRAM') return 8192;
  return 2048; // spoken answers ~90s still fit; 700 was cutting the ending
}

function classifyQuestionLocal(q) {
  const s = String(q || '').toLowerCase();
  if (!s) return 'ANSWER';
  const wantsCode = /\b(implement|leetcode|pseudocode|write (a |the )?(function|class|method|script|code)|code (a |the )?\w)/.test(s);
  const wantsDiagram = /\b(draw|sketch|visualize|diagram|flowchart|sequence diagram|architecture diagram|mermaid|\buml\b)/.test(s);
  if (wantsCode && !wantsDiagram) return 'CODE';
  if (wantsDiagram && !wantsCode) return 'DIAGRAM';
  return 'ANSWER';
}

function resolveAnswerMode(forcedMode, q) {
  if (forcedMode && forcedMode !== 'AUTO') return forcedMode;
  return classifyQuestionLocal(q);
}

// Record a completed, user-visible turn. Strips the <sticky> presenter block
// (redundant with the diagram + explanation) to save context budget.
function recordTurn(user, assistant, mode, images) {
  const a = String(assistant || '').replace(/<sticky>[\s\S]*?<\/sticky>/gi, '').trim();
  const u = String(user || '').trim();
  if (!a) return;
  convoHistory.push({ user: u, assistant: a, mode: mode || 'ANSWER' });

  // Persist into the current saved session (creating one if none is active).
  let s = currentSession();
  if (!s) {
    s = { id: genSessionId(), name: '', createdAt: Date.now(), updatedAt: Date.now(), turns: [] };
    sessions.push(s);
    currentSessionId = s.id;
  }
  const imgs = Array.isArray(images) ? images.map(i => ({ base64: i.base64, mime: i.mime || 'image/png' })) : [];
  s.turns.push({ kind: 'qa', ts: Date.now(), q: u, a, mode: mode || 'ANSWER', images: imgs });
  if (!s.name) {
    const d = new Date(s.createdAt || Date.now());
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    s.name = `${stamp} · ${(u || '[image question]').slice(0, 40)}`;
  }
  s.updatedAt = Date.now();
  saveSessions();
}

// Prior turns as chat messages (user/assistant pairs), newest kept, oldest
// pairs dropped once the char budget is exceeded.
function conversationContextMessages(budget) {
  const cap = budget || CONVO_CHAR_BUDGET;
  const msgs = [];
  let total = 0;
  for (let i = convoHistory.length - 1; i >= 0; i--) {
    const t = convoHistory[i];
    const len = (t.user || '').length + (t.assistant || '').length;
    if (total + len > cap && msgs.length) break;
    msgs.unshift({ role: 'assistant', content: t.assistant });
    msgs.unshift({ role: 'user', content: t.user || '[image/screenshot question]' });
    total += len;
  }
  return msgs;
}

// ── Saved sessions ────────────────────────────────────────────────────────────
// Persisted to userData/sessions.json. Each session keeps its full turn list
// (question, answer, mode, screenshots) so the user can continue it later and
// see it rendered live, with the conversation re-grounding follow-up answers.
const SESSIONS_FILE = path.join(app.getPath('userData'), 'sessions.json');
let sessions = [];
let currentSessionId = null;
let _sessionsSaveQueue = Promise.resolve();

function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    sessions = Array.isArray(raw && raw.sessions) ? raw.sessions : [];
  } catch { sessions = []; }
}
function saveSessions() {
  _sessionsSaveQueue = _sessionsSaveQueue.then(() =>
    fs.promises.writeFile(SESSIONS_FILE, JSON.stringify({ sessions }), 'utf8').catch(() => {}));
  return _sessionsSaveQueue;
}
function currentSession() { return sessions.find(s => s.id === currentSessionId) || null; }

let meetSaveTimer = null;
function ensureSession() {
  let s = currentSession();
  if (s) return s;
  s = { id: genSessionId(), name: '', createdAt: Date.now(), updatedAt: Date.now(), turns: [] };
  sessions.push(s);
  currentSessionId = s.id;
  return s;
}
function recordMeetTurn(who, text, sealed) {
  who = String(who || 'Interviewer').trim() || 'Interviewer';
  text = String(text || '').trim();
  const s = ensureSession();
  if (!s.turns) s.turns = [];
  const last = s.turns.length ? s.turns[s.turns.length - 1] : null;
  if (!text) {
    if (last && last.kind === 'meet' && !last.sealed) s.turns.pop();
    s.updatedAt = Date.now();
    if (meetSaveTimer) { clearTimeout(meetSaveTimer); meetSaveTimer = null; }
    return saveSessions();
  }
  if (last && last.kind === 'meet' && !last.sealed) {
    last.who = who;
    last.text = text;
    if (sealed) last.sealed = true;
  } else {
    s.turns.push({ kind: 'meet', ts: Date.now(), who, text, sealed: !!sealed });
  }
  s.updatedAt = Date.now();
  if (sealed) {
    if (meetSaveTimer) { clearTimeout(meetSaveTimer); meetSaveTimer = null; }
    return saveSessions();
  }
  if (meetSaveTimer) clearTimeout(meetSaveTimer);
  meetSaveTimer = setTimeout(() => { meetSaveTimer = null; saveSessions(); }, 400);
  return Promise.resolve(true);
}
ipcMain.handle('session-record-meet', (_e, payload) => {
  const p = payload || {};
  return recordMeetTurn(p.who, p.text, !!p.sealed);
});
function genSessionId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
loadSessions();

// Profile (name/location) of the active session — folded into the answer context.
let activeProfile = {};
let activeSalary = null; // { amount, currency, period } from the materials step
const KB_KIND_LIST = ['cv', 'jd', 'support', 'meetings'];
// Deep snapshot of the current knowledge base so a session keeps its own copy.
function snapshotKnowledge() {
  const k = state.knowledge || {};
  const out = {};
  for (const kind of KB_KIND_LIST) out[kind] = (k[kind] || []).map(i => ({ name: i.name, text: i.text, chars: i.chars }));
  return out;
}
// Just the file names per kind, for the continue-session preview.
function knowledgeMeta(k) {
  k = k || {};
  const out = {};
  for (const kind of KB_KIND_LIST) out[kind] = (k[kind] || []).map(i => i.name);
  return out;
}
// Per-kind items with sizes, for editable chips on the continue page.
function knowledgeItems(k) {
  k = k || {};
  const out = {};
  for (const kind of KB_KIND_LIST) out[kind] = (k[kind] || []).map(i => ({ name: i.name, chars: i.chars || (i.text ? i.text.length : 0) }));
  return out;
}

// Lightweight list for the picker (no turn bodies/images/knowledge text).
ipcMain.handle('session-list', () =>
  sessions
    .map(s => ({ id: s.id, name: s.name || '(untitled)', createdAt: s.createdAt, updatedAt: s.updatedAt, turnCount: (s.turns || []).length, profile: s.profile || {} }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
);
// Preview metadata for one session — no side effects (doesn't switch current).
ipcMain.handle('session-meta', (_e, id) => {
  const s = sessions.find(x => x.id === id);
  if (!s) return null;
  return {
    id: s.id, name: s.name, turnCount: (s.turns || []).length,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
    profile: s.profile || {}, knowledgeMeta: knowledgeMeta(s.knowledge),
  };
});
ipcMain.handle('session-new', (_e, meta) => {
  const p = (meta && meta.profile) || {};
  const sal = meta && meta.salary && Number(meta.salary.amount) > 0
    ? { amount: Number(meta.salary.amount), currency: String(meta.salary.currency || 'USD'), period: String(meta.salary.period || 'month') }
    : null;
  const s = {
    id: genSessionId(), name: '', createdAt: Date.now(), updatedAt: Date.now(), turns: [],
    profile: { name: p.name || '', city: p.city || '', country: p.country || '', timezone: p.timezone || '' },
    salary: sal,
    knowledge: snapshotKnowledge(), // freeze the materials attached for this session
  };
  sessions.push(s);
  currentSessionId = s.id;
  convoHistory = [];
  activeProfile = s.profile;
  activeSalary = sal;
  state.profile = { ...s.profile }; // remember as the default for next time
  saveState();
  saveSessions();
  schedulePromptCacheWarm();
  return s.id;
});
// Remembered personal profile, pre-filled into the New-session form.
ipcMain.handle('get-default-profile', () => ({ ...(state.profile || {}) }));

// ── Named profiles (switchable presets for the New-session form) ──────────────
function genProfileId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function cleanProfile(p) {
  p = p || {};
  return { name: String(p.name || '').trim(), city: String(p.city || '').trim(), country: String(p.country || '').trim(), timezone: String(p.timezone || '').trim() };
}
ipcMain.handle('profiles-list', () => ({
  profiles: (state.profiles || []).map(p => ({ ...p })),
  activeProfileId: state.activeProfileId || null,
}));
ipcMain.handle('profile-save-new', (_e, { label, profile } = {}) => {
  const id = genProfileId();
  const entry = { id, label: String(label || '').trim() || 'Profile', ...cleanProfile(profile) };
  if (!Array.isArray(state.profiles)) state.profiles = [];
  state.profiles.push(entry);
  state.activeProfileId = id;
  saveState();
  return id;
});
ipcMain.handle('profile-update', (_e, { id, label, profile } = {}) => {
  const p = (state.profiles || []).find(x => x.id === id);
  if (!p) return false;
  if (label != null) p.label = String(label).trim() || p.label;
  Object.assign(p, cleanProfile(profile));
  saveState();
  return true;
});
ipcMain.handle('profile-delete', (_e, id) => {
  state.profiles = (state.profiles || []).filter(p => p.id !== id);
  if (state.activeProfileId === id) state.activeProfileId = (state.profiles[0] && state.profiles[0].id) || null;
  saveState();
  return true;
});
ipcMain.handle('profile-set-active', (_e, id) => {
  if ((state.profiles || []).some(p => p.id === id)) { state.activeProfileId = id; saveState(); return true; }
  return false;
});
// Update the active/continued session's profile (from the continue page edits).
ipcMain.handle('session-update-profile', (_e, { id, profile } = {}) => {
  const s = sessions.find(x => x.id === id) || currentSession();
  if (!s) return false;
  s.profile = {
    name: (profile && profile.name) || '', city: (profile && profile.city) || '',
    country: (profile && profile.country) || '', timezone: (profile && profile.timezone) || '',
  };
  s.updatedAt = Date.now();
  if (s.id === currentSessionId) activeProfile = s.profile;
  state.profile = { ...s.profile }; // remember as the default for next time
  saveState();
  saveSessions();
  return true;
});
ipcMain.handle('session-load', (_e, id) => {
  const s = sessions.find(x => x.id === id);
  if (!s) return null;
  currentSessionId = id;
  // Rebuild grounding context from the saved turns.
  convoHistory = (s.turns || [])
    .filter((t) => t && t.kind !== 'meet')
    .map((t) => ({ user: t.q || '', assistant: t.a || '', mode: t.mode || 'ANSWER' }));
  // Restore the session's own materials + profile (in-memory; global save untouched).
  if (s.knowledge) state.knowledge = JSON.parse(JSON.stringify(s.knowledge));
  activeProfile = s.profile || {};
  activeSalary = s.salary || null;
  schedulePromptCacheWarm();
  return { id: s.id, name: s.name, turns: s.turns || [], profile: s.profile || {}, knowledgeMeta: knowledgeMeta(s.knowledge) };
});
ipcMain.handle('session-delete', (_e, id) => {
  sessions = sessions.filter(s => s.id !== id);
  if (currentSessionId === id) { currentSessionId = null; convoHistory = []; }
  saveSessions();
  return true;
});

// ── Per-session knowledge editing (continue page upload zones) ────────────────
ipcMain.handle('session-kb-get', (_e, id) => {
  const s = sessions.find(x => x.id === id);
  return s ? knowledgeItems(s.knowledge) : null;
});
ipcMain.handle('session-kb-add', async (_e, { id, kind, name, data } = {}) => {
  if (!KB_KIND_LIST.includes(kind)) return { ok: false, error: 'bad kind' };
  const s = sessions.find(x => x.id === id);
  if (!s) return { ok: false, error: 'no session' };
  let text = '';
  try { text = await extractDocText(data, name); }
  catch (e) { return { ok: false, error: 'Could not read ' + name + ' (' + e.message + ')', name }; }
  if (!s.knowledge) s.knowledge = {};
  if (!s.knowledge[kind]) s.knowledge[kind] = [];
  const item = { name, text, chars: text.length };
  // CV and JD are single-document; support/meetings accumulate.
  if (kind === 'cv' || kind === 'jd') s.knowledge[kind] = [item];
  else s.knowledge[kind].push(item);
  if (s.id === currentSessionId) state.knowledge = JSON.parse(JSON.stringify(s.knowledge));
  s.updatedAt = Date.now();
  saveSessions();
  return { ok: true, name, chars: text.length };
});
ipcMain.handle('session-kb-remove', (_e, { id, kind, index } = {}) => {
  const s = sessions.find(x => x.id === id);
  if (!s || !s.knowledge || !s.knowledge[kind]) return { ok: false };
  s.knowledge[kind].splice(index, 1);
  if (s.id === currentSessionId) state.knowledge = JSON.parse(JSON.stringify(s.knowledge));
  s.updatedAt = Date.now();
  saveSessions();
  return { ok: true };
});

const KB_KINDS = ['cv', 'jd', 'support', 'meetings'];

// Extract plain text from an uploaded document buffer (any common format).
async function extractDocText(arrayBuffer, name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const buf = Buffer.from(arrayBuffer);
  const textExts = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yaml', 'yml', 'rtf'];
  if (textExts.includes(ext)) return buf.toString('utf8');
  if (ext === 'html' || ext === 'htm') {
    return buf.toString('utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const officeExts = ['pdf', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'doc', 'ppt', 'xls'];
  if (officeExts.includes(ext)) {
    if (!officeParser) throw new Error('Document parser unavailable');
    return String(await officeParser.parseOfficeAsync(buf)).trim();
  }
  // Unknown extension — best effort as UTF-8 text.
  return buf.toString('utf8');
}

function clipText(s, n) {
  s = String(s || '');
  if (s.length <= n) return s;
  return s.slice(0, n) + '\n[truncated]';
}

// Spoken answers need a small prompt so the first token isn't 2–3s of prefill.
// CODE/DIAGRAM keep more material. CV, JD, and support are all optional; whatever
// is uploaded is the knowledge base (support is often the whole KB).
function buildKnowledgeContext(mode) {
  const compact = !mode || mode === 'ANSWER';
  const k = state.knowledge || {};
  const join = (arr) => (arr || []).map((i) => i.text).filter(Boolean).join('\n\n');
  const p = activeProfile || {};
  const loc = [p.city, p.country].filter(Boolean).join(', ');
  const profileParts = [];
  if (p.name) profileParts.push(`Name: ${p.name} (this is YOU)`);
  if (loc) profileParts.push(`Location: ${loc}`);
  // Timezone only — a live clock here would bust prompt-cache on every minute.
  if (p.timezone) profileParts.push(`Timezone: ${p.timezone}`);
  if (activeSalary && activeSalary.amount) {
    const per = { month: 'per month', annual: 'per year', hourly: 'per hour' }[activeSalary.period] || activeSalary.period;
    profileParts.push(`Salary expectation: ${activeSalary.amount} ${activeSalary.currency} ${per} (state it plainly if asked; open to discussion)`);
  }

  const blocks = [
    { title: 'CANDIDATE PROFILE', text: profileParts.join('\n'), weight: 0 },
    { title: 'CANDIDATE RESUME / CV', text: join(k.cv), weight: 3 },
    { title: 'JOB DESCRIPTION', text: join(k.jd), weight: 2 },
    { title: 'SUPPORT / KNOWLEDGE BASE', text: join(k.support), weight: 3 },
    { title: 'PREVIOUS MEETING RECORDS', text: join(k.meetings), weight: compact ? 0 : 1 },
  ].filter((b) => b.text);

  const present = blocks
    .filter((b) => b.weight > 0)
    .map((b) => b.title)
    .join(', ');
  const header = present
    ? 'Uploaded knowledge (missing files are fine; use what is here as the whole base): ' + present
    : 'No files uploaded. Use only the live meeting. Do not invent a career history.';

  const totalCap = compact ? 10000 : 40000;
  const weighted = blocks.filter((b) => b.weight > 0 && b.text);
  const weightSum = weighted.reduce((s, b) => s + b.weight, 0) || 1;
  const parts = [];
  if (profileParts.length) parts.push('CANDIDATE PROFILE (this person is YOU):\n' + profileParts.join('\n'));
  for (const b of weighted) {
    const cap = Math.max(1200, Math.floor(totalCap * (b.weight / weightSum)));
    parts.push(`${b.title}:\n${clipText(b.text, cap)}`);
  }
  if (!parts.length) return header;
  return header + '\n\n' + parts.join('\n\n----\n\n');
}

ipcMain.handle('kb-add', async (_e, { kind, name, data }) => {
  if (!KB_KINDS.includes(kind)) return { ok: false, error: 'bad kind' };
  let text = '';
  try {
    text = await extractDocText(data, name);
  } catch (e) {
    appendLogLine(`[kb] extract failed for ${name}: ${e.message}`);
    return { ok: false, error: 'Could not read ' + name + ' (' + e.message + ')', name };
  }
  if (!state.knowledge[kind]) state.knowledge[kind] = [];
  const item = { name, text, chars: text.length };
  // CV and JD are single-document; support/meetings accumulate.
  if (kind === 'cv' || kind === 'jd') state.knowledge[kind] = [item];
  else state.knowledge[kind].push(item);
  saveState();
  schedulePromptCacheWarm();
  return { ok: true, name, chars: text.length };
});

ipcMain.handle('kb-remove', (_e, { kind, index }) => {
  if (state.knowledge[kind]) state.knowledge[kind].splice(index, 1);
  saveState();
  schedulePromptCacheWarm();
  return { ok: true };
});

// Empty the global knowledge base — used when starting a New session so its
// upload zones start fresh (materials don't carry over from a prior session).
ipcMain.handle('kb-clear', () => {
  state.knowledge = { cv: [], jd: [], support: [], meetings: [] };
  saveState();
  schedulePromptCacheWarm();
  return { ok: true };
});

ipcMain.handle('kb-get', () => {
  const out = {};
  for (const k of KB_KINDS) {
    out[k] = (state.knowledge[k] || []).map((i) => ({ name: i.name, chars: i.chars || (i.text ? i.text.length : 0) }));
  }
  return out;
});

function getAnswerProvider() {
  return getProvider(state.answer && state.answer.provider);
}

function getAnswerApiKey(providerId) {
  const id = providerId || getAnswerProvider().id;
  const keys = (state.answer && state.answer.keys) || {};
  const fromKeys = String(keys[id] || '').trim();
  if (fromKeys) return fromKeys;
  if (id === 'xai') {
    return String((state.answer && state.answer.apiKey) || '').trim()
      || String((state.transcription && state.transcription.xaiApiKey) || '').trim();
  }
  return '';
}

function getAnswerModel(providerId) {
  const id = providerId || getAnswerProvider().id;
  const currentProvider = (state.answer && state.answer.provider) || 'openai';
  if (id === currentProvider && state.answer && state.answer.model) {
    return state.answer.model;
  }
  const models = (state.answer && state.answer.models) || {};
  if (models[id]) return models[id];
  return getProvider(id).defaultModel;
}

function publicAnswerConfig() {
  const provider = getAnswerProvider();
  const keys = { ...DEFAULT_STATE.answer.keys, ...((state.answer && state.answer.keys) || {}) };
  const models = { ...DEFAULT_STATE.answer.models, ...((state.answer && state.answer.models) || {}) };
  return {
    provider: provider.id,
    model: getAnswerModel(provider.id),
    apiKey: keys.xai || ((state.answer && state.answer.apiKey) || ''),
    keys,
    models,
    providers: providerList(),
    fallbackModels: provider.fallbackModels.slice(),
    railAbbr: modelAbbr(provider.id, getAnswerModel(provider.id)),
  };
}

function applyAnswerConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return publicAnswerConfig();
  const prev = state.answer || { ...DEFAULT_STATE.answer };
  const next = { ...prev };
  if (cfg.keys && typeof cfg.keys === 'object') {
    next.keys = { ...(prev.keys || {}), ...cfg.keys };
  }
  if (cfg.models && typeof cfg.models === 'object') {
    next.models = { ...(prev.models || {}), ...cfg.models };
  }
  if (cfg.apiKey !== undefined) {
    next.apiKey = String(cfg.apiKey || '');
    next.keys = { ...(next.keys || {}), xai: next.apiKey };
  }
  if (next.keys && next.keys.xai !== undefined) next.apiKey = next.keys.xai;
  delete next.activePromptId;

  const nextProvider = (cfg.provider && PROVIDERS[cfg.provider]) ? cfg.provider : (next.provider || 'openai');
  if (nextProvider !== (prev.provider || 'openai')) {
    const oldId = prev.provider || 'openai';
    next.models = { ...(next.models || {}), [oldId]: prev.model || getAnswerModel(oldId) };
    next.provider = nextProvider;
    next.model = (next.models && next.models[nextProvider]) || getProvider(nextProvider).defaultModel;
    next.models[nextProvider] = next.model;
  } else {
    next.provider = nextProvider;
  }

  if (cfg.model) {
    next.model = cfg.model;
    next.models = { ...(next.models || {}), [next.provider]: cfg.model };
  }

  state.answer = next;

  applyBuiltinKeys();
  saveState();
  schedulePromptCacheWarm();
  return publicAnswerConfig();
}

function whoAmILine() {
  const p = activeProfile || {};
  const name = String(p.name || '').trim();
  const loc = [p.city, p.country].filter(Boolean).join(', ');
  if (name && loc) return `You are ${name} from ${loc}.`;
  if (name) return `You are ${name}.`;
  return 'The setup profile name, when present, is you.';
}

// Per-stage guidance, chosen on the "Interview stage" step of the wizard.
const STAGE_GUIDANCE = {
  intro: `STAGE — INTRO / RECRUITER SCREENING. The other person is usually a recruiter, not an engineer. Be warm, friendly and easy to talk to. Use plain everyday words; avoid technical jargon and acronyms unless they use them first, and when a technology must be named add a few words on what it is for. Keep your story short: who you are, what you do now, what you are looking for and why this role fits. Show real interest with one or two natural questions about the team, the process or the timeline. No lectures, no deep dives.`,
  technical: `STAGE — TECHNICAL INTERVIEW. Show seniority through substance, never through buzzwords or self-praise: say what you actually did, which tools and techniques you used, which decisions you made and why, what went wrong and how you fixed it. Be accurate and concrete — real systems, real numbers, real tradeoffs from the knowledge base; if the knowledge base does not cover it, say what you do know and do not invent. Match the answer to the question: a short, simple question gets a short, simple answer (one or two sentences). A question about a project, a tricky part, an issue, a technical method, how you would handle a problem that comes up, or your past work gets a detailed, well-structured answer: context, what you did, how, and the result. When it helps, end with a short clarifying or follow-up question instead of only answering.`,
  hr: `STAGE — HR INTERVIEW. Show ownership, reliability and maturity: how you take responsibility, work with a team, handle feedback and disagreement, and communicate with stakeholders and clients. Show seniority quietly — examples over adjectives. Be clear and honest on logistics: availability, notice period, working hours, remote setup, and salary expectation (use the profile salary when given). Keep it human and concise, and ask a real question back when it is natural.`,
  ceo: `STAGE — CEO / LEADERSHIP CALL. Show ownership, leadership and product understanding: how your work moved the business, how you set priorities, how you handle ambiguity and risk, how you communicate with stakeholders and clients, and how you make the people around you better. Think like a partner, not an employee: tie answers to outcomes, users and money. Keep answers focused and confident rather than long, and ask sharp questions about vision, priorities and how success is measured.`,
};
const ANSWER_SHAPE = `LENGTH — fit the question. A simple or yes/no question gets one or two short sentences. A story, project, problem-solving or "tell me about" question gets a fuller answer with concrete facts, still spoken length (about 45–90 seconds). Never pad, and never cut substance the question deserves. Answer from the knowledge base first, then take a small position if it is natural. Sometimes, when it fits, finish with a short question of your own.`;

function meetingStanceBlock() {
  const { hiringType } = getMeetingConfig();
  const kb = `${whoAmILine()} This is a 1:1 hiring call. Transcript lines tagged Interviewer are the other person. The setup profile name is you. Your knowledge base is whatever was uploaded (CV and/or JD and/or support). Missing files are fine. You are the candidate, not a helper who follows their lead.`;
  const typeHint = STAGE_GUIDANCE[hiringType] || '';
  return `MEETING STANCE — HIRING INTERVIEW (${hiringType}): ${kb}\n${typeHint}\n${ANSWER_SHAPE} If they state an opinion, do not auto-agree. If they talk only among themselves and you should stay quiet, use [LISTEN] plus a short reason. Never invent experience. One spoken turn only.`;
}

function assembleStaticSystem(mode) {
  const staticParts = [];
  const kb = buildKnowledgeContext(mode);
  if (kb) {
    staticParts.push('KNOWLEDGE BASE for this candidate (home base for opinions, not a script to read). CV, JD, and support are all optional. Whatever is uploaded is the full base. Support is often the knowledge base by itself. Do NOT copy source wording. Use this base to agree, disagree, or ask. Live meeting talk can add facts or change your mind only when the other person is actually right.\n\n' + kb);
  }

  if (mode !== 'ANSWER') {
    staticParts.push('When the user asks for a diagram, chart, flowchart, sequence diagram, or any visual structure, output it as a Mermaid code block (```mermaid ... ```) so it can be rendered graphically. Rules for valid Mermaid: (1) No HTML tags inside node labels — plain text only. (2) Use only rectangle brackets [text] for node shapes — do NOT use [/text] or [/text/] trapezoid syntax. (3) No "color:" in style directives. (4) Keep node IDs simple alphanumeric. (5) Do NOT use ASCII art. (6) READABILITY FIRST: keep each diagram graspable at a glance — aim for at most ~12-15 nodes. If the system is complex, do NOT cram everything into one diagram. Instead output a high-level OVERVIEW diagram first (major components only), then one or more SEPARATE ```mermaid blocks that each zoom into a single subsystem. (7) Group related nodes with subgraphs, and choose a direction that reads well (graph LR for wide pipelines, graph TD for hierarchies). (8) NEVER reuse one identifier for both a subgraph and a node — every subgraph id must be unique and distinct from all node ids (reusing an id causes a render cycle error).');
    staticParts.push('Whenever your answer contains a diagram (Mermaid block) or a code block, append a presenter talking-script at the very end of your response using exactly this format:\n<sticky>\nOVERVIEW\n[One sentence: what this diagram/code shows and why it matters.]\n\nWALKTHROUGH\n[Narrate each major step, node, or code section as if explaining to someone who cannot see the screen. Write in full sentences. Cover every significant part. Aim for 60-90 seconds of speaking.]\n\nKEY INSIGHT\n[One sentence: the single most important takeaway or design decision.]\n</sticky>\nUse plain text only inside the sticky tags — no markdown, no asterisks, no bullet points.');
  }

  const avoidRaw = (state.avoidPhrases || '').trim();
  if (avoidRaw) {
    const list = avoidRaw.split('\n').map(l => l.trim()).filter(Boolean);
    if (list.length) {
      staticParts.push(`BANNED PHRASES: never output these or close paraphrases of them:\n${list.map(p => `- "${p}"`).join('\n')}`);
    }
  }

  if (mode === 'ANSWER') {
    staticParts.push('SPOKEN OUTPUT: Talk like a native American engineer in a real standup or 1:1. Short sentences. Contractions. Start naturally with So or Yeah so when it fits. Never output an em dash, en dash, or --. Use a new sentence, a comma, or the words so / and / which instead. No resume voice. No blog voice. Only paragraphs someone can say out loud.');
    staticParts.push(meetingStanceBlock());
  }

  if (mode === 'DIAGRAM') {
    staticParts.push('OUTPUT FORMAT — DIAGRAM MODE. This instruction has the HIGHEST priority and overrides any conflicting instruction above. Draw a diagram of the system described in the USER MESSAGE below. Your VERY FIRST characters must be ```mermaid — no introduction, no greeting, no self-description, no "Sure!", no "Here is...", no preamble whatsoever. Do NOT introduce yourself or talk about your experience. Start the mermaid block immediately. Keep it readable at a glance: for a complex system, output a high-level overview diagram first, then separate ```mermaid blocks that drill into individual subsystems, rather than one dense diagram. After the closing ``` of EACH diagram, write a thorough explanation of THAT diagram in prose: (a) what every major component/node does, (b) why it is necessary — the specific role it plays and what would break without it, (c) how the parts connect (the data and control flow between them). Then, after the final diagram, add a "Workflow" section that walks through the end-to-end flow step by step, and a "Why this solves the problem" section that explicitly maps the design back to the original requirements — which requirement each major part satisfies and the key trade-offs. Be substantive and concrete; do not pad with filler.');
  } else if (mode === 'CODE') {
    staticParts.push('OUTPUT FORMAT — LIVE CODING MODE. This instruction has the HIGHEST priority and overrides any conflicting instruction above. Write code that solves the USER MESSAGE below. Your VERY FIRST characters must be ``` opening a code block — no introduction, no greeting, no self-description, no "Sure!", no "Here is...", no preamble of any kind. Do NOT introduce yourself or talk about your experience. Write clean, complete, runnable code with NO comments or docstrings of any kind — no inline comments, no block comments, no triple-quoted docstrings; output only executable code. After the closing ``` you may add a brief explanation only.');
  }

  return staticParts.join('\n\n');
}

function clipMeetingTranscript(mt) {
  const lines = String(mt || '').split(/\n/).map((l) => l.trim()).filter(Boolean).slice(-4);
  let s = lines.join('\n');
  if (s.length > 800) s = s.slice(-800);
  return s;
}

function formatAnswerUserTurn(q, transcript, mode) {
  const ask = String(q || '').trim();
  const mt = clipMeetingTranscript(transcript);
  if (mode !== 'ANSWER') return ask;
  const parts = [];
  if (mt) {
    parts.push('Recent meeting transcript (last beats only; each line is Who: what they said):\n\n' + mt);
  }
  if (ask) {
    parts.push('The candidate typed this question in the input box. Answer it from the knowledge base. Use the meeting transcript only if it helps.\n\n' + ask);
  } else {
    parts.push('The candidate did not type a question. This is live meeting talk. Decide now: speak, or [LISTEN]. If you speak, answer, take a position, push back, or ask. Use names when you know them. Do not only follow their idea.');
  }
  return parts.join('\n\n');
}

function buildAnswerMessages(q, imgs, mode, transcript) {
  const messages = [];
  const staticText = assembleStaticSystem(mode);
  if (staticText) messages.push({ role: 'system', content: staticText });
  const convoBudget = mode === 'ANSWER' ? 3500 : CONVO_CHAR_BUDGET;
  for (const m of conversationContextMessages(convoBudget)) messages.push(m);

  const body = formatAnswerUserTurn(q, transcript, mode);
  if (imgs) {
    const userContent = [];
    if (body) userContent.push({ type: 'text', text: body });
    imgs.forEach(({ base64, mime }) => {
      userContent.push({ type: 'image_url', image_url: { url: `data:${mime || 'image/png'};base64,${base64}` } });
    });
    messages.push({ role: 'user', content: userContent });
  } else {
    messages.push({ role: 'user', content: body });
  }
  return messages;
}

function spokenSanitize(text, mode) {
  let s = String(text || '');
  if (!s) return s;
  const spoken = !mode || mode === 'ANSWER';
  s = s.replace(/\u2014|\u2013|\u2015|\u2212/g, spoken ? ', ' : '-');
  if (spoken) {
    s = s.replace(/\s*--+\s*/g, ', ');
    s = s.replace(/\s+,/g, ',');
    s = s.replace(/,(?=\S)/g, ', ');
    s = s.replace(/[ \t]{2,}/g, ' ');
  }
  return s;
}

async function generateAnswer(question, images, forcedMode, transcript) {
  // images: array of { base64, mime } or null/undefined
  // forcedMode: 'AUTO'|'CODE'|'DIAGRAM'|'ANSWER' — from the manual mode selector
  const imgs = Array.isArray(images) && images.length ? images : null;
  const q = String(question || '').trim();
  const mt = String(transcript || '').trim();
  if (!q && !imgs && !mt) return;
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  if (!apiKey) {
    if (win && !win.isDestroyed()) win.webContents.send('answer-error', `No ${provider.label} API key set (Settings → API keys → Answer generation).`);
    return;
  }
  if (answerAbort) { try { answerAbort.abort(); } catch {} answerAbort = null; }
  const ac = new AbortController();
  answerAbort = ac;

  const model = getAnswerModel(provider.id);
  const mode = resolveAnswerMode(forcedMode, q);

  const displayQ = q || (imgs ? `[${imgs.length} image${imgs.length > 1 ? 's' : ''}]` : '');
  // Show the bubble before we build/send the prompt so Send never looks idle.
  if (win && !win.isDestroyed()) win.webContents.send('answer-start', { question: displayQ, hasImage: !!imgs, mode });

  const messages = buildAnswerMessages(q, imgs, mode, mt);
  const promptChars = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
  const sysLen = (messages.find((m) => m.role === 'system') && messages.find((m) => m.role === 'system').content.length) || 0;
  appendLogLine(`[answer] provider=${provider.id} model=${model} mode=${mode} forced=${forcedMode || '-'} sysLen=${sysLen} promptChars=${promptChars} q="${q.slice(0, 80)}" sysMsgs=${messages.filter(m => m.role === 'system').length}`);

  let full = '';
  const t0 = Date.now();
  let firstToken = true;
  try {
    await streamChat({
      provider,
      apiKey,
      model,
      messages,
      signal: ac.signal,
      convId: answerConvId(),
      maxTokens: maxTokensForMode(mode),
      onDelta: (delta) => {
        const piece = spokenSanitize(delta, mode);
        if (!piece) return;
        if (firstToken) {
          firstToken = false;
          appendLogLine(`[answer] first-token ${Date.now() - t0}ms provider=${provider.id} model=${model}`);
        }
        full += piece;
        if (win && !win.isDestroyed()) win.webContents.send('answer-chunk', piece);
      },
    });
  } catch (e) {
    if (e.name !== 'AbortError' && win && !win.isDestroyed()) {
      if (e.status) {
        appendLogLine(`[${provider.id}] ${e.status}: ${(e.body || e.message || '').slice(0, 200)}`);
        win.webContents.send('answer-error', friendlyAnswerError(provider, e.status, e.body));
      } else {
        win.webContents.send('answer-error', `${provider.label} request failed: ` + e.message);
      }
    }
    answerAbort = null;
    return;
  }
  answerAbort = null;
  if (full.trim()) {
    sessionLog.push({ ts: Date.now(), kind: 'question', text: q || `[${(imgs && imgs.length) || 0} image${imgs && imgs.length > 1 ? 's' : ''}]` });
    sessionLog.push({ ts: Date.now(), kind: 'answer', text: full.trim() });
    recordTurn(q, full, mode, imgs);
  }
  if (win && !win.isDestroyed()) win.webContents.send('answer-done', { text: full });
}

ipcMain.handle('generate-answer', (_e, { question, images, forcedMode, transcript } = {}) => {
  generateAnswer(question, images, forcedMode, transcript);
});

// ── Warm-up: pre-establish TLS to the active provider so the first real
// request skips the ~300-600 ms handshake cost.
async function warmApiConnection() {
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  if (!apiKey || !provider.warmUrl) return;
  try {
    const ac = new AbortController();
    setTimeout(() => { try { ac.abort(); } catch {} }, 4000);
    const headers = { };
    if (provider.style === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    await fetch(provider.warmUrl, { headers, signal: ac.signal });
  } catch {}
  prefetchModelList(provider);
}
let warmLoopTimer = null;
function startWarmLoop() {
  warmApiConnection().catch(() => {});
  schedulePromptCacheWarm();
  if (warmLoopTimer) return;
  warmLoopTimer = setInterval(() => warmApiConnection().catch(() => {}), 20000);
}
ipcMain.handle('warm-api-connection', () => warmApiConnection());

// Write the static system prefix into the provider's prompt cache so the next
// real question only prefills the user turn (hundreds of ms, not 2–3s).
let _warmCacheTimer = null;
let _warmCacheKey = '';
let promptCacheWarmAbort = null;
function schedulePromptCacheWarm() {
  if (_warmCacheTimer) clearTimeout(_warmCacheTimer);
  _warmCacheTimer = setTimeout(() => { _warmCacheTimer = null; warmPromptCache().catch(() => {}); }, 250);
}
function abortPromptCacheWarm() {
  if (promptCacheWarmAbort) { try { promptCacheWarmAbort.abort(); } catch {} promptCacheWarmAbort = null; }
}
async function warmPromptCache() {
  if (answerAbort || speculativeCommitted || speculativeActive) return;
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  if (!apiKey) return;
  const sys = assembleStaticSystem('ANSWER');
  if (!sys) return;
  const key = [provider.id, getAnswerModel(provider.id), answerConvId(), sys.length, sys.slice(0, 48), sys.slice(-48)].join('|');
  if (key === _warmCacheKey) return;
  abortPromptCacheWarm();
  const ac = new AbortController();
  promptCacheWarmAbort = ac;
  setTimeout(() => { try { ac.abort(); } catch {} }, 8000);
  try {
    await completeChat({
      provider,
      apiKey,
      model: getAnswerModel(provider.id),
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: 'Ready.' },
      ],
      maxTokens: 1,
      convId: answerConvId(),
      signal: ac.signal,
    });
    if (promptCacheWarmAbort === ac) {
      _warmCacheKey = key;
      promptCacheWarmAbort = null;
      appendLogLine(`[answer] prompt-cache warmed provider=${provider.id} sysLen=${sys.length}`);
    }
  } catch {
    if (promptCacheWarmAbort === ac) promptCacheWarmAbort = null;
  }
}

// ── Speculative answer: start streaming before the user hits send.
// Shares the same message-building logic as generateAnswer but is abortable.
async function startSpeculative(question, forcedMode, transcript) {
  // Never kill a live, user-visible stream to prefetch the next question.
  if (speculativeCommitted || answerAbort) return;
  if (speculativeAbort) { try { speculativeAbort.abort(); } catch {} speculativeAbort = null; }
  speculativeActive = false;
  const q = (question || '').trim();
  const mt = String(transcript || '').trim();
  if (!q && !mt) return;
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  if (!apiKey) return;

  speculativeQuestion = q || mt;
  speculativeActive = true;
  const ac = new AbortController();
  speculativeAbort = ac;
  ac._buffer = '';
  ac._flushed = false;
  ac._transcript = mt;

  const model = getAnswerModel(provider.id);

  const specMode = resolveAnswerMode(forcedMode, q || mt);
  ac._mode = specMode; // stash so commitSpeculative can read it

  const messages = buildAnswerMessages(q, null, specMode, mt);
  // Do NOT send answer-start yet — we buffer silently and only show the UI
  // when the user actually commits (or the text matches on submit).

  let speculativeBuffer = '';
  try {
    await streamChat({
      provider,
      apiKey,
      model,
      messages,
      signal: ac.signal,
      convId: answerConvId(),
      maxTokens: maxTokensForMode(specMode),
      onDelta: (delta) => {
        const piece = spokenSanitize(delta, specMode);
        if (!piece) return;
        speculativeBuffer += piece;
        ac._buffer = speculativeBuffer;
        if (speculativeCommitted && ac._flushed && win && !win.isDestroyed()) {
          win.webContents.send('answer-chunk', piece);
        }
      },
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      if (speculativeCommitted && win && !win.isDestroyed()) {
        win.webContents.send('answer-done', { text: speculativeBuffer });
      }
      speculativeCommitted = false;
      return;
    }
    speculativeCommitted = false; speculativeActive = false; speculativeAbort = null;
    return;
  }

  // Stream finished
  if (speculativeCommitted) {
    // We were already piping — send done signal
    speculativeAbort = null;
    speculativeCommitted = false;
    speculativeActive = false;
    speculativeQuestion = null;
    if (speculativeBuffer.trim()) {
      if (q) sessionLog.push({ ts: Date.now(), kind: 'question', text: q });
      sessionLog.push({ ts: Date.now(), kind: 'answer', text: speculativeBuffer.trim() });
      recordTurn(q, speculativeBuffer, specMode);
    }
    if (win && !win.isDestroyed()) win.webContents.send('answer-done', { text: speculativeBuffer });
  } else {
    // Stream finished BEFORE the user committed. Stash the full buffer on `ac`
    // and KEEP speculativeAbort pointing at it so commitSpeculative can read
    // ac._buffer / ac._mode / ac._done. (Previously speculativeAbort was nulled
    // unconditionally above, making the buffered answer and its mode unreachable
    // on commit — the renderer then got an empty answer with mode reset to
    // ANSWER, so follow-up questions appeared unanswered / stuck on the old
    // diagram's presenter sticky.)
    ac._buffer = speculativeBuffer;
    ac._done = true;
  }
}

function normQuestion(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/[.?!\s]+$/g, '').trim().toLowerCase();
}

function commitSpeculative(question, images, forcedMode, transcript) {
  const q = (question || '').trim();
  const mt = String(transcript || '').trim();
  const hasImages = Array.isArray(images) && images.length > 0;
  const matchKey = q || mt;

  // Only adopt a live or finished stream. If speculation failed (abort
  // cleared, not active), fall through and start a real request.
  if (!hasImages && speculativeQuestion && matchKey && normQuestion(speculativeQuestion) === normQuestion(matchKey) && (speculativeAbort || speculativeActive)) {
    const ac = speculativeAbort; // null if stream already finished naturally
    const streamDone = (ac && ac._done) || !ac;

    if (win && !win.isDestroyed()) {
      const specModeCommit = (ac && ac._mode) || 'ANSWER';
      if (!streamDone) speculativeCommitted = true;
      win.webContents.send('answer-start', { question: q, hasImage: false, mode: specModeCommit });
      const buffered = (ac && ac._buffer) || '';
      const clean = buffered ? spokenSanitize(buffered, specModeCommit) : '';
      if (clean) win.webContents.send('answer-chunk', clean);
      if (ac) ac._flushed = true;
      if (streamDone) {
        // Stream already finished — flush everything and close
        win.webContents.send('answer-done', { text: clean });
        if (clean.trim()) {
          if (q) sessionLog.push({ ts: Date.now(), kind: 'question', text: q });
          sessionLog.push({ ts: Date.now(), kind: 'answer', text: clean.trim() });
          recordTurn(q, clean, specModeCommit);
        }
        speculativeActive = false;
        speculativeQuestion = null;
        speculativeAbort = null;
        speculativeCommitted = false;
      }
      // else: already marked committed so further deltas pipe live
    } else {
      // No window — just abort cleanly
      if (ac) { try { ac.abort(); } catch {} }
      speculativeActive = false; speculativeQuestion = null; speculativeAbort = null; speculativeCommitted = false;
    }
    return;
  }

  // Text changed or has images — discard speculation, start fresh.
  // Pass forcedMode through so the manual DIAGRAM/CODE selection is preserved.
  if (speculativeAbort) { try { speculativeAbort.abort(); } catch {} speculativeAbort = null; }
  speculativeActive = false;
  speculativeQuestion = null;
  speculativeCommitted = false;
  generateAnswer(question, images, forcedMode, transcript);
}

ipcMain.handle('speculative-start', (_e, { question, forcedMode, transcript } = {}) => {
  startSpeculative(question, forcedMode, transcript);
});
ipcMain.handle('speculative-commit', (_e, { question, images, forcedMode, transcript } = {}) => commitSpeculative(question, images, forcedMode, transcript));
ipcMain.handle('speculative-cancel', () => {
  if (speculativeCommitted) return;
  if (speculativeAbort) { try { speculativeAbort.abort(); } catch {} speculativeAbort = null; }
  speculativeActive = false;
  speculativeQuestion = null;
  speculativeCommitted = false;
});


ipcMain.handle('stop-answer', () => {
  if (answerAbort) { try { answerAbort.abort(); } catch {} answerAbort = null; }
});
// Clear the remembered answers/code/diagrams used to ground follow-ups.
ipcMain.handle('clear-answer-memory', () => {
  convoHistory = [];
  const s = currentSession();
  if (s) { s.turns = []; s.updatedAt = Date.now(); saveSessions(); }
  return true;
});
async function listAnswerModels() {
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  const ids = await listModels({ provider, apiKey });
  if (Array.isArray(ids) && ids.length) modelListCache[provider.id] = ids;
  return ids;
}
ipcMain.handle('list-xai-models', () => listAnswerModels());
ipcMain.handle('list-answer-models', () => listAnswerModels());
ipcMain.handle('get-answer-config', () => publicAnswerConfig());
ipcMain.handle('set-answer-config', (_e, cfg) => applyAnswerConfig(cfg));

// ---- Avoid-phrases list ----
ipcMain.handle('get-avoid-phrases', () => state.avoidPhrases || '');
ipcMain.handle('set-avoid-phrases', (_e, text) => {
  state.avoidPhrases = String(text || '').trim();
  saveState();
  schedulePromptCacheWarm();
  return true;
});

ipcMain.handle('copy-text', (_e, text) => {
  try { clipboard.writeText(String(text || '')); return true; } catch { return false; }
});

function emitAnswerConfig() {
  if (win && !win.isDestroyed()) win.webContents.send('answer-config-changed', publicAnswerConfig());
}

const modelListCache = Object.create(null);

function cachedModelIds(provider) {
  const current = getAnswerModel(provider.id);
  const cached = modelListCache[provider.id];
  let ids = (Array.isArray(cached) && cached.length) ? cached.slice() : provider.fallbackModels.slice();
  if (current && !ids.includes(current)) ids.unshift(current);
  return ids;
}

function prefetchModelList(provider) {
  const p = provider || getAnswerProvider();
  const apiKey = getAnswerApiKey(p.id);
  if (!apiKey) return;
  listModels({ provider: p, apiKey }).then((ids) => {
    if (Array.isArray(ids) && ids.length) modelListCache[p.id] = ids;
  }).catch(() => {});
}

function popupNearAnchor(menu, anchor) {
  const opts = { window: win };
  if (anchor && Number.isFinite(Number(anchor.x)) && Number.isFinite(Number(anchor.y))) {
    const zoom = (win.webContents && win.webContents.getZoomFactor()) || 1;
    const left = Number(anchor.x) * zoom;
    const top = Number(anchor.y) * zoom;
    const btnW = Number(anchor.width) || 26;
    // Rail sits on the right edge; open the list immediately to the left of the button.
    const menuW = 260;
    opts.x = Math.max(0, Math.round(left + btnW - menuW));
    opts.y = Math.round(top);
  }
  menu.popup(opts);
}

function showModelMenu(anchor) {
  if (!win) return;
  const provider = getAnswerProvider();
  const current = getAnswerModel(provider.id);
  const ids = cachedModelIds(provider);
  prefetchModelList(provider);

  const items = [
    { label: 'Provider', enabled: false },
    ...providerList().map((p) => ({
      label: (p.id === provider.id ? '• ' : '  ') + p.label,
      click: () => {
        applyAnswerConfig({ provider: p.id });
        emitAnswerConfig();
        prefetchModelList(getAnswerProvider());
      },
    })),
    { type: 'separator' },
    { label: `${provider.short} models`, enabled: false },
    ...ids.map((id) => ({
      label: (id === current ? '• ' : '  ') + id,
      click: () => {
        applyAnswerConfig({ model: id });
        if (win && !win.isDestroyed()) {
          win.webContents.send('model-selected', id);
          emitAnswerConfig();
        }
      },
    })),
  ];
  popupNearAnchor(Menu.buildFromTemplate(items), anchor);
}
ipcMain.handle('show-model-menu', (_e, anchor) => showModelMenu(anchor));

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

ipcMain.handle('sticky-open', () => openStickyWindow(true));
ipcMain.handle('sticky-close', () => closeStickyWindow());
ipcMain.handle('sticky-clear', () => {
  chatHistory = [];
  pushHistoryToStickyDom();
  let sent = 0;
  if (state.network.role === 'speaker') {
    for (const entry of supporterConns.values()) {
      if (entry && entry.ws && entry.ws.readyState === WebSocket.OPEN) {
        try { entry.ws.send(JSON.stringify({ type: 'chat-clear', ts: Date.now() })); sent++; } catch {}
      }
    }
  } else if (state.network.role === 'supporter') {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try { wsClient.send(JSON.stringify({ type: 'chat-clear', ts: Date.now() })); sent++; } catch {}
    }
  }
  if (win) win.webContents.send('capture-text', `[sticky cleared, broadcast to ${sent}]`);
  return true;
});

ipcMain.handle('stop-ide-typing',   () => { stopIdeTyping(); });

// ── Write-to-IDE ──────────────────────────────────────────────────────────────
// Drives a persistent PowerShell stdin session from a Node.js async loop.
// Delays live in Node.js (not PS Sleep), so we can pause/resume without
// killing the process:  pause = stop advancing the loop;  resume = continue.
// Focus events: our app gaining focus → auto-pause; losing focus → auto-resume.
ipcMain.handle('write-to-ide', async (_e, { code, speedFactor, stripIndent } = {}) => {
  const text = String(code || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text) return { ok: false, error: 'No code provided' };
  const doStripIndent = stripIndent !== false; // default ON

  // Cancel any still-running session
  ideTypingCancelled = true;
  if (ideInjector) { try { ideInjector.dispose(); } catch {} ideInjector = null; }
  await new Promise(r => setTimeout(r, 80));

  ideTypingActive    = true;
  ideTypingCancelled = false;
  ideTypingPaused    = false;
  ideFocusPaused     = false;

  // Speed slider 1-5 → delay multiplier
  const SPEED_TABLE = [2.0, 1.4, 1.0, 0.6, 0.35];
  const sf = SPEED_TABLE[Math.max(0, Math.min(4, Math.round(Number(speedFactor) || 3) - 1))];

  // Attach focus/blur listeners for this session only
  const onWinFocus = () => { if (!ideTypingActive) return; ideFocusPaused = true;  notifyTypingState(); };
  const onWinBlur  = () => { if (!ideTypingActive) return; if (ideFocusPaused) { ideFocusPaused = false; notifyTypingState(); } };
  if (win) { win.on('focus', onWinFocus); win.on('blur', onWinBlur); }

  // Pause automatically whenever the user moves the mouse (take-over).
  startCursorTakeover();

  // Per-platform key injector (PowerShell SendKeys on Windows, osascript on
  // macOS, xdotool/ydotool/wtype on Linux) — see platform-input.js.
  const injector = createKeyInjector();
  const teardownEarly = (error) => {
    if (win) { win.off('focus', onWinFocus); win.off('blur', onWinBlur); }
    ideTypingActive = false; ideTypingPaused = false; ideFocusPaused = false;
    stopCursorTakeover();
    notifyTypingState();
    return { ok: false, error };
  };
  if (injector.error) return teardownEarly(injector.error);
  ideInjector = injector;

  // Node.js delay scaled by speed factor
  const nd = (lo, hi) => new Promise(r =>
    setTimeout(r, Math.max(10, Math.round((lo + Math.random() * (hi - lo)) * sf)))
  );
  // Spin while paused (manual or focus-based), 80 ms poll
  const waitPause = async () => {
    while ((ideTypingPaused || ideFocusPaused || ideUserPaused) && !ideTypingCancelled)
      await new Promise(r => setTimeout(r, 80));
  };

  const initRes = await injector.init();
  if (!initRes.ok) { ideInjector = null; try { injector.dispose(); } catch {} return teardownEarly(initRes.error || 'key injector failed to start'); }
  const ADJ = {
    a:'sq',b:'vgn',c:'xdv',d:'sfe',e:'wrd',f:'dge',g:'fht',h:'gjy',i:'uko',
    j:'hkn',k:'jlm',l:'kop',m:'nk', n:'bmh',o:'ilp',p:'ol', q:'wa', r:'eft',
    s:'adwz',t:'rgy',u:'yhi',v:'bcf',w:'qse',x:'zcs',y:'tuh',z:'xs',
    '0':'9','1':'2','2':'13','3':'24','4':'35','5':'46','6':'57','7':'68','8':'79','9':'80',
  };
  const nearbyKey = ch => { const a = ADJ[ch.toLowerCase()]; return a ? a[Math.floor(Math.random() * a.length)] : null; };
  const isWordChar = ch => /[a-zA-Z0-9_]/.test(ch);

  const sendKey = async (ch, lo, hi) => {
    if (ch === '\n') await injector.special('ENTER');
    else await injector.char(ch);
    await nd(lo, hi);
  };
  const sendBS = async () => { await injector.special('BACKSPACE'); await nd(55, 105); };
  const sendArrow = async (dir, n) => {                  // dir: 'LEFT' | 'RIGHT'
    for (let i = 0; i < n; i++) { await injector.special(dir); await nd(40, 85); }
  };
  // Neutralize editor auto-indent (VS Code etc.): after a newline the editor may
  // insert leading whitespace. We select the whole new line back to column 0
  // (Home, then Shift+End) so the FIRST character we type overtypes/replaces it.
  // This is correct whether the editor auto-indented or not (empty selection if
  // not), so our literal indentation is always authoritative — no double-indent.
  const clearAutoIndent = async () => {
    if (!doStripIndent) return;
    await injector.special('HOME'); await nd(25, 55);
    await injector.special('SHIFT_END'); await nd(25, 55); // Shift+End (select to line end)
  };

  // ── Typing loop ───────────────────────────────────────────────────────────
  let pendingFix = null;   // { correct: char, suffix: char[] }
  let tokenCount = 0, inWord = false;
  let burstTarget = Math.random() < 0.5 ? 2 : 4;

  // Fix a typo the way a developer does: arrow-key back to the wrong character,
  // correct it in place, then arrow back to the end — instead of deleting and
  // retyping everything after it.
  //
  // Layout when a fix is pending (cursor '|' at the end):
  //   …[correct prefix][WRONG][s0 s1 … s(n-1)]|
  // Steps:
  //   1. LEFT × n  → cursor sits right after WRONG, before s0
  //   2. BACKSPACE → delete WRONG; type the correct char in its place
  //   3. RIGHT × n → return the cursor to the end (suffix untouched)
  const flushFix = async () => {
    if (!pendingFix) return;
    const { correct, suffix } = pendingFix;
    pendingFix = null;
    const n = suffix.length;
    await nd(120, 240);            // notice the mistake
    await sendArrow('LEFT', n);    // navigate back to the typo
    await nd(60, 140);             // small pause before correcting
    await sendBS();                // delete the wrong char
    await sendKey(correct, 55, 95);// type the right one in place
    await nd(40, 90);
    await sendArrow('RIGHT', n);   // return to where typing left off
  };

  const doPause = async () => {
    await flushFix();
    await nd(800, 1000);
    await waitPause();
    tokenCount = 0;
    burstTarget = Math.random() < 0.5 ? 2 : 4;
  };

  for (const ch of [...text]) {
    if (ideTypingCancelled) break;
    await waitPause();           // honor pause on every keystroke (responsive)
    if (ideTypingCancelled) break;
    const wasInWord = inWord;
    inWord = isWordChar(ch);
    if (inWord && !wasInWord) { tokenCount++; if (tokenCount > burstTarget) await doPause(); }
    if (ideTypingCancelled) break;

    if (ch === '\n') {
      await flushFix();        // must fix BEFORE Enter — arrow nav can't cross lines
      await sendKey(ch, 10, 30);
      await nd(800, 1000);
      await waitPause();
      // Select any auto-inserted indent so the next char/Enter overtypes it.
      await clearAutoIndent();
      tokenCount = 0; burstTarget = Math.random() < 0.5 ? 2 : 4;
      continue;
    }
    if (!isWordChar(ch)) {
      await sendKey(ch, ch === ' ' ? 60 : 50, ch === ' ' ? 130 : 110);
      if (pendingFix) pendingFix.suffix.push(ch);
      continue;
    }
    // Word char — 1.5 % typo, one per burst
    const wrong = (!pendingFix && Math.random() < 0.015) ? nearbyKey(ch) : null;
    if (wrong) {
      await sendKey(wrong, 65, 105);
      pendingFix = { correct: ch, suffix: [] };
    } else {
      await sendKey(ch, 65, 105);
      if (pendingFix) pendingFix.suffix.push(ch);
    }
  }

  if (!ideTypingCancelled) await flushFix();

  // ── Teardown ──────────────────────────────────────────────────────────────
  if (win) { win.off('focus', onWinFocus); win.off('blur', onWinBlur); }
  ideTypingActive = false; ideTypingPaused = false; ideFocusPaused = false;
  stopCursorTakeover();
  notifyTypingState();
  try { injector.dispose(); } catch {}
  ideInjector = null;
  return { ok: !ideTypingCancelled, cancelled: ideTypingCancelled };
});

// Resize the sticky to fit ALL accumulated messages (they append, never
// replace), capped at 80% screen height — beyond that the body scrolls.
function resizeStickyToContent() {
  if (!stickyWin || stickyWin.isDestroyed()) return;
  let lines = 0;
  for (const m of chatHistory) {
    if (m.type === 'chat-rich' && m.markdown) {
      lines += Math.ceil(m.markdown.length / 45) + m.markdown.split('\n').length + 1;
      lines += (m.markdown.match(/```mermaid/gi) || []).length * 22; // diagrams take vertical room
    } else if (m.type === 'chat-text' && m.text) {
      lines += Math.ceil(m.text.length / 45) + m.text.split('\n').length + 1;
    } else if (m.type === 'chat-image') {
      lines += 8;
    }
  }
  const needed = 24 + 42 + 32 + Math.max(lines * 18, 80);
  const maxH = (screen.getPrimaryDisplay().workArea.height * 0.80) | 0;
  const newH = Math.min(needed, maxH);
  const [curW] = stickyWin.getSize();
  try { stickyWin.setSize(curW, newH); } catch {}
  setTimeout(() => syncStickyPosition(), 50);
}

// Push a full answer (markdown with diagrams/code) to the sticky, rendered the
// same way as the chat area. Local only — not broadcast over the network.
ipcMain.handle('sticky-send-rich', (_e, markdown) => {
  const md = String(markdown || '').trim();
  if (!md) return false;
  pushChatToSticky({ type: 'chat-rich', markdown: md, ts: Date.now(), fromMe: true });
  resizeStickyToContent();
  return true;
});

ipcMain.handle('sticky-send-text', (_e, text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  const msg = { type: 'chat-text', text: t, ts: Date.now(), fromMe: true };
  pushChatToSticky(msg);
  resizeStickyToContent();
  let sent = 0;
  if (state.network.role === 'speaker') {
    const payload = { type: 'chat-text', text: t, ts: msg.ts };
    for (const entry of supporterConns.values()) {
      if (entry && entry.ws && entry.ws.readyState === WebSocket.OPEN) {
        try { entry.ws.send(JSON.stringify(payload)); sent++; } catch {}
      }
    }
  } else if (state.network.role === 'supporter') {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try { wsClient.send(JSON.stringify({ type: 'chat-text', text: t, ts: msg.ts })); sent++; } catch {}
    }
  }
  if (win) win.webContents.send('capture-text', `[sticky sent: "${t.slice(0,40)}" → ${sent}]`);
  return true;
});

ipcMain.handle('sticky-send-image', (_e, dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  const msg = { type: 'chat-image', dataUrl, ts: Date.now(), fromMe: true };
  pushChatToSticky(msg);
  let sent = 0;
  if (state.network.role === 'speaker') {
    const payload = { type: 'chat-image', dataUrl, ts: msg.ts };
    for (const entry of supporterConns.values()) {
      if (entry && entry.ws && entry.ws.readyState === WebSocket.OPEN) {
        try { entry.ws.send(JSON.stringify(payload)); sent++; } catch {}
      }
    }
  } else if (state.network.role === 'supporter') {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try { wsClient.send(JSON.stringify({ type: 'chat-image', dataUrl, ts: msg.ts })); sent++; } catch {}
    }
  }
  if (win) win.webContents.send('capture-text', `[sticky image sent (${Math.round(dataUrl.length/1024)} KB) → ${sent}]`);
  return true;
});
ipcMain.handle('inject-test-chat', (_e, payload) => {
  const text = typeof payload === 'string' ? payload : (payload && payload.text) || 'test message';
  pushChatToSticky({ type: 'chat-text', text, ts: Date.now(), fromId: 'debug' });
  return true;
});

ipcMain.handle('chat-send-text', (_e, text) => {
  const t = String(text || '').trim();
  if (!t) {
    if (win) win.webContents.send('capture-error', 'chat-send-text: empty text');
    return false;
  }
  if (state.network.role !== 'supporter') {
    if (win) win.webContents.send('capture-error', `chat-send-text: role is "${state.network.role}", need "supporter"`);
    return false;
  }
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    const rs = wsClient ? wsClient.readyState : 'no client';
    if (win) win.webContents.send('capture-error', `chat-send-text: WS not open (state=${rs})`);
    return false;
  }
  try {
    wsClient.send(JSON.stringify({ type: 'chat-text', text: t, ts: Date.now() }));
    if (win) win.webContents.send('capture-text', `[chat sent: text "${t.slice(0,40)}"]`);
    return true;
  } catch (e) {
    if (win) win.webContents.send('capture-error', 'chat-send-text exception: ' + e.message);
    return false;
  }
});

ipcMain.handle('chat-send-image', (_e, dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  if (state.network.role !== 'supporter') {
    if (win) win.webContents.send('capture-error', `chat-send-image: role is "${state.network.role}", need "supporter"`);
    return false;
  }
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    const rs = wsClient ? wsClient.readyState : 'no client';
    if (win) win.webContents.send('capture-error', `chat-send-image: WS not open (state=${rs})`);
    return false;
  }
  try {
    wsClient.send(JSON.stringify({ type: 'chat-image', dataUrl, ts: Date.now() }));
    if (win) win.webContents.send('capture-text', `[chat sent: image (${Math.round(dataUrl.length/1024)} KB)]`);
    return true;
  } catch (e) {
    if (win) win.webContents.send('capture-error', 'chat-send-image exception: ' + e.message);
    return false;
  }
});

ipcMain.handle('get-network-config', () => ({ ...state.network }));
ipcMain.handle('set-network-config', (_e, cfg) => {
  state.network = { ...state.network, ...(cfg || {}) };
  state.network.role = 'speaker'; // supporter mode is not offered in this build
  if (state.network.role === 'speaker') {
    state.network.address = `0.0.0.0:${state.network.speakerPort || 2000}`;
  } else if (state.network.role === 'supporter') {
    state.network.address = state.network.supporterAddress || '172.16.98.11:2000';
  }
  saveState();
  broadcastNetworkStatus();
});
ipcMain.handle('start-network', () => { startNetwork(); });
ipcMain.handle('stop-network', () => { stopNetwork(); });
ipcMain.handle('configure-firewall', () => {
  const port = (parseAddress(state.network.address) || {}).port || state.network.speakerPort || 2000;
  ensureFirewallRule(port, true);
  return true;
});
function cycleMicModeFromHotkey() {
  if (state.network.role === 'speaker') {
    const first = supporterConns.values().next().value;
    const cur = first ? first.micMode : 'aOnly';
    const next = nextMicMode(cur);
    for (const id of supporterConns.keys()) setSupporterMicMode(id, next);
  } else if (state.network.role === 'supporter') {
    const next = nextMicMode(supporterOwnMicMode);
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try { wsClient.send(JSON.stringify({ type: 'request-mic-mode', mode: next })); } catch {}
    }
  }
}

ipcMain.handle('get-mic-mode', () => {
  if (state.network.role === 'supporter') return supporterOwnMicMode;
  if (state.network.role === 'speaker') {
    const first = supporterConns.values().next().value;
    return first ? first.micMode : 'aOnly';
  }
  return 'aOnly';
});

ipcMain.handle('set-mic-mode', (_e, mode) => {
  if (!MIC_MODES.includes(mode)) return false;
  if (state.network.role === 'speaker') {
    let any = false;
    for (const id of supporterConns.keys()) {
      if (setSupporterMicMode(id, mode)) any = true;
    }
    return any;
  }
  if (state.network.role === 'supporter') {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      try { wsClient.send(JSON.stringify({ type: 'request-mic-mode', mode })); return true; } catch {}
    }
    return false;
  }
  return false;
});

ipcMain.handle('cycle-mic-mode', () => { cycleMicModeFromHotkey(); });

ipcMain.handle('open-external', (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
  const { shell } = require('electron');
  shell.openExternal(url).catch(() => {});
});

ipcMain.handle('get-welcome-seen', () => !!state.welcomeSeen);
ipcMain.handle('set-welcome-seen', (_e, v) => { state.welcomeSeen = !!v; saveState(); });

ipcMain.handle('kick-supporter', (_e, id) => {
  const entry = supporterConns.get(String(id));
  if (entry) {
    try { entry.ws.send(JSON.stringify({ type: 'kicked' })); } catch {}
    try { entry.ws.close(4000, 'kicked'); } catch {}
    supporterConns.delete(String(id));
    broadcastNetworkStatus();
    return true;
  }
  return false;
});

let logWriteQueue = Promise.resolve();
function appendLogLine(line) {
  const ts = new Date().toISOString();
  const out = `[${ts}] ${line}\n`;
  logWriteQueue = logWriteQueue.then(() => fs.promises.appendFile(LOG_FILE, out, 'utf8').catch(() => {}));
  return logWriteQueue;
}

ipcMain.handle('log-append', (_e, line) => appendLogLine(String(line || '')));
ipcMain.handle('log-recent', async () => {
  try {
    const buf = await fs.promises.readFile(LOG_FILE, 'utf8');
    const lines = buf.split(/\r?\n/).filter(Boolean);
    return lines.slice(-LOG_MAX_LINES_RETURNED);
  } catch { return []; }
});
ipcMain.handle('log-clear', async () => {
  try { await fs.promises.writeFile(LOG_FILE, '', 'utf8'); } catch {}
});
ipcMain.handle('log-open', async () => {
  try {
    await fs.promises.access(LOG_FILE);
  } catch {
    try { await fs.promises.writeFile(LOG_FILE, '', 'utf8'); } catch {}
  }
  const { shell } = require('electron');
  shell.openPath(LOG_FILE);
});
ipcMain.handle('get-network-status', () => {
  return {
    role: state.network.role,
    address: state.network.address,
    bound: !!wsServer,
    connected: wsClient ? wsClient.readyState === WebSocket.OPEN : false,
    supporters: supporterListSnapshot(),
    maxSupporters: state.network.maxSupporters,
  };
});
ipcMain.on('signaling-out', (_e, msg) => sendSignaling(msg));

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopCaptureLoop();
  stopSignalingServer();
  disconnectSignalingClient();
});
app.on('window-all-closed', () => app.quit());
