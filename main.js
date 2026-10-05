const {
  app, BrowserWindow, ipcMain, globalShortcut, Menu,
  session, desktopCapturer, dialog, clipboard, screen, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// ── One instance at a time ───────────────────────────────────────────────────
// Asked for before anything else in this file runs, so that a second start
// touches nothing: no settings, no licence file, no recording, no hotkeys. The
// lock belongs to the data folder, not to the file that was started: a renamed
// copy, a copy in another folder, the portable exe and a development run are
// all the same app. A test that needs an instance of its own starts with
// --user-data-dir=<folder>.
const BY_GUARDIAN = process.argv.includes('--by-guardian');
const DEV_RUN = !app.isPackaged;
if (!app.requestSingleInstanceLock({ guardian: BY_GUARDIAN, dev: DEV_RUN })) {
  console.log('Ace is already running: this start was handed over to it.' +
    (DEV_RUN ? ' For an instance of its own: npx electron . --user-data-dir=<empty folder>' : ''));
  const dataDir = app.getPath('userData');
  const read = (name) => { try { return fs.readFileSync(path.join(dataDir, name), 'utf8').trim(); } catch { return ''; } };
  // The portable launcher deletes its unpacked files as soon as the app it
  // started ends, and every start of the same portable file unpacks into the
  // same folder. If the running copy uses those files, leaving now would pull
  // them from under it, so this one waits, without a window, until the
  // running copy has ended. (The guardian has no launcher behind it.)
  const sharesFiles = process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_FILE && !BY_GUARDIAN &&
    read('app.path').toLowerCase() === process.execPath.toLowerCase();
  if (sharesFiles) {
    setInterval(() => {
      const pid = parseInt(read('app.pid'), 10) || 0;
      let alive = false;
      try { process.kill(pid, 0); alive = pid > 0; } catch (e) { alive = e.code === 'EPERM'; }
      // the lock file is gone as soon as the copy that holds the lock has ended;
      // no number in app.pid (read in the middle of a rewrite) says nothing
      if ((pid > 0 && !alive) || !fs.existsSync(path.join(dataDir, 'lockfile'))) app.exit(0);
    }, 2000);
  } else {
    // exit, not quit: quit would run the handlers that tell the running copy's
    // guardian to stand down, and 'ready' would still fire afterwards.
    app.exit(0);
  }
  return; // nothing below belongs to a second start
}
// The guardian starts the app when the process named in app.pid is gone. The
// file is claimed now, so it does not start a copy while this one is still
// starting or is waiting at the licence window. app.path says which file this
// copy runs from, for a second start of the portable exe (above).
function claimAppPid() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'app.pid'), String(process.pid));
    fs.writeFileSync(path.join(app.getPath('userData'), 'app.path'), process.execPath);
  } catch {}
}
claimAppPid();

const WebSocket = require('ws');
const {
  PROVIDERS, getProvider, providerList,
  streamChat, completeChat, listModels,
  friendlyAnswerError, modelAbbr,
} = require('./llm-providers');
const { createKeyInjector, pasteKeystroke } = require('./platform-input');
const license = require('./license');
const { uploadFolder } = require('./gofile');
const { signatureDistance } = require('./speaker-detect');
const { createSpeakerTracker } = require('./speaker-tracker');
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
// Linux notes. Window opacity is a no-op in every Linux backend, so it is
// emulated with a transparent window + CSS opacity (LINUX_CSS_OPACITY).
// Click-through (setIgnoreMouseEvents) is implemented with XShape, i.e. X11
// sessions only — Wayland has no equivalent. Content protection (stealth)
// has no Linux desktop API at all. Forcing XWayland was tried and rejected:
// on some setups (VMs) the X11 window never presents on screen.
// ACE_OZONE / ACE_NO_TRANSPARENT are troubleshooting overrides.
if (process.platform === 'linux' && process.env.ACE_OZONE) app.commandLine.appendSwitch('ozone-platform', process.env.ACE_OZONE);
const LINUX_CSS_OPACITY = process.platform === 'linux' && process.env.ACE_NO_TRANSPARENT !== '1';
const LINUX_X11_SESSION = process.platform === 'linux' &&
  (process.env.ACE_OZONE === 'x11' || (!process.env.WAYLAND_DISPLAY && (process.env.XDG_SESSION_TYPE || 'x11') !== 'wayland'));
// Keep the audio capture pipeline alive when the window is hidden (stealth) or
// occluded by a fullscreen app — otherwise Chromium throttles the renderer and
// the AudioWorklet feeding Deepgram stalls, so voice stops transcribing.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// The app was called RemoteDevJobAce up to 2.3; its data folder followed the
// name. On the first start as Ace, bring the settings, licence, sessions and
// uploaded documents over, so nobody has to set the app up again.
(function adoptOldUserData() {
  try {
    const dir = app.getPath('userData');
    const old = path.join(path.dirname(dir), 'RemoteDevJobAce');
    const done = path.join(dir, 'adopted-RemoteDevJobAce');
    if (old === dir || fs.existsSync(done) || !fs.existsSync(path.join(old, 'state.json'))) return;
    fs.mkdirSync(dir, { recursive: true });
    // A folder of this name may be left from an unrelated older app: what it
    // holds is set aside, not overwritten.
    const aside = path.join(dir, 'before-2.4');
    for (const name of ['state.json', 'sessions.json', 'license.json', '.updaterId', 'materials']) {
      const from = path.join(old, name), to = path.join(dir, name);
      if (!fs.existsSync(from)) continue;
      if (fs.existsSync(to)) { fs.mkdirSync(aside, { recursive: true }); fs.renameSync(to, path.join(aside, name)); }
      fs.cpSync(from, to, { recursive: true });
    }
    fs.writeFileSync(done, new Date().toISOString());
  } catch {}
})();

const STATE_FILE = path.join(app.getPath('userData'), 'state.json');
const LOG_FILE = path.join(app.getPath('userData'), 'activity.log');
const LOG_MAX_LINES_RETURNED = 500;

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
  reloadSite: 'Ctrl+R',
  toggleStealth: 'Ctrl+H',
  toggleRecording: 'Alt+C',
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
  x: null, y: null, width: 380, height: 800,
  opacity: 1.0, stealth: true, clickThrough: false,
  transcription: {
    engine: 'deepgram',
    deepgramApiKey: '',
    xaiApiKey: '',
    language: 'auto',
    micDeviceId: '',
    captureSystem: true,
    // The user's own voice is now part of the product (their bubble, the saved
    // transcript, the recording), so the mic is on everywhere. It used to be
    // off on Windows, where system audio alone covers the other side.
    captureMic: true,
    autoAnswer: false, // default: manual submission (Send / Ctrl+Enter)
    recordSession: true, // record screen + audio and auto-save the bundle on End
    uploadSession: true,  // after saving, upload the bundle to gofile.io and hand back the link
  },
  antiClose: true, // Windows: relaunch the app if another program closes it
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
    kind: 'hiring',             // hiring | team (follows from type)
    type: 'recruiter_screen',   // a key of MEETING_TYPES
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
let deepgramWs = null;
let sessionLog = [];
let state = { ...DEFAULT_STATE };

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
      network: { ...DEFAULT_STATE.network, ...(raw.network || {}) },
      answer: { ...DEFAULT_STATE.answer, ...(raw.answer || {}) },
      knowledge: { ...DEFAULT_STATE.knowledge, ...(raw.knowledge || {}) },
      meeting: (raw.meeting && (raw.meeting.type || raw.meeting.hiringType))
        ? { type: normalizeMeetingType(raw.meeting.type || raw.meeting.hiringType) }
        : { ...DEFAULT_STATE.meeting },
      hotkeys: { ...HOTKEY_DEFAULTS, ...(raw.hotkeys || {}) },
    };
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
  // Click-through is a transient mode: never start a session with it on, or
  // every click (including the tour's Next) passes through the window.
  state.clickThrough = false;
  migrateAnswerConfig();
  // One-time switch to the new audio-source defaults (system audio on, mic off)
  // for installs that saved the old defaults before this change.
  // V3: Windows → system audio only; macOS/Linux → microphone too, since
  // they cannot capture system audio.
  if (!state.audioDefaultsV3) {
    state.transcription.captureSystem = true;
    state.transcription.captureMic = process.platform !== 'win32';
    state.audioDefaultsV3 = true;
  }
  // V4: microphone on everywhere. The user's own voice has its own transcript
  // stream: it goes to the recording, the saved transcript and the reading
  // marker in the answer, never into the meeting bubbles.
  if (!state.audioDefaultsV4) {
    state.transcription.captureMic = true;
    state.audioDefaultsV4 = true;
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
  if (win && !win.isDestroyed() && !mainCollapsed) {
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
    state.x = x; state.y = y;
    state.width = width; state.height = height;
    if (!LINUX_CSS_OPACITY) state.opacity = win.getOpacity();
  }
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {}
}

// The saved place of the main window, moved fully inside a display. The
// monitor it was on may be gone, or the resolution or scaling may have
// changed since, which would leave the window partly or wholly off-screen.
// Uses the display the saved bounds overlap most (or the nearest one), and
// shrinks the size first when it is bigger than that display's work area.
function onScreenBounds(b) {
  const width = Math.max(1, Math.round(Number(b.width) || 400));
  const height = Math.max(1, Math.round(Number(b.height) || 700));
  if (typeof b.x !== 'number' || typeof b.y !== 'number') return { width, height };
  const work = screen.getDisplayMatching({ x: Math.round(b.x), y: Math.round(b.y), width, height }).workArea;
  const w = Math.min(width, work.width);
  const h = Math.min(height, work.height);
  const x = Math.min(Math.max(Math.round(b.x), work.x), work.x + work.width - w);
  const y = Math.min(Math.max(Math.round(b.y), work.y), work.y + work.height - h);
  return { x, y, width: w, height: h };
}

function createWindow() {
  loadState();
  const startBounds = onScreenBounds({ x: state.x, y: state.y, width: state.width, height: state.height });

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
    x: startBounds.x,
    y: startBounds.y,
    width: startBounds.width,
    height: startBounds.height,
    minWidth: 360,
    minHeight: 200,
    useContentSize: true,
    frame: false,
    transparent: LINUX_CSS_OPACITY,
    backgroundColor: LINUX_CSS_OPACITY ? '#00ffffff' : '#ffffff',
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
  if (startOpacity < 1 && !LINUX_CSS_OPACITY) win.setOpacity(startOpacity);
  if (LINUX_CSS_OPACITY) {
    win.webContents.on('did-finish-load', () => {
      if (state.opacity < 1) win.webContents.send('opacity-css', Math.max(MIN_OPACITY, state.opacity));
    });
  }
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
  win.on('minimize', () => { applyStickyState(); sendFloatState(); });
  win.on('restore', () => { applyStickyState(); sendFloatState(); });
  win.on('closed', () => {
    if (floatWin && !floatWin.isDestroyed()) { try { floatWin.close(); } catch {} }
    stopSpeakerWatch();
    win = null;
    if (stickyWin && !stickyWin.isDestroyed()) { try { stickyWin.close(); } catch {} }
    // A window left behind would keep the app, and with it the one-instance
    // lock, alive without a main window: no start would bring Ace back.
    closeInfoWindow();
  });
}

function setOpacity(value) {
  if (!win) return;
  const v = Math.max(MIN_OPACITY, Math.min(1, value));
  state.opacity = v;
  if (LINUX_CSS_OPACITY) win.webContents.send('opacity-css', v);
  else win.setOpacity(v);
  if (stickyWin && !stickyWin.isDestroyed()) { try { stickyWin.setOpacity(v); } catch {} }
  saveState();
  win.webContents.send('opacity-changed', v);
}

function nudge(dx, dy) {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
}

// ── Hide / show the main window, returning it to where it was ───────────────
// On Windows/macOS/X11 the bounds are saved before hiding and re-applied after
// showing. Wayland ignores app-set positions (a re-shown window lands under
// the pointer), so there the window is minimized instead and the compositor
// restores it in place — hiding + re-showing (unmap/map) and collapsing to a
// tiny size were both tried and came back at the wrong place or half-painted.
const WAYLAND_SESSION = process.platform === 'linux' && !LINUX_X11_SESSION;
let hiddenBounds = null;
const mainCollapsed = false; // kept for saveState; the collapse approach is retired
function isMainShown() {
  return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
}
function hideMain() {
  if (!win || win.isDestroyed() || !isMainShown()) return;
  hiddenBounds = win.getBounds();
  if (WAYLAND_SESSION) win.minimize();
  else win.hide();
}
function showMain() {
  if (!win || win.isDestroyed()) return;
  if (WAYLAND_SESSION) {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
  } else {
    win.show();
    if (hiddenBounds) { try { win.setBounds(hiddenBounds); } catch {} }
  }
  try { win.focus(); } catch {}
}
function toggleVisible() {
  if (!win) return;
  if (isMainShown()) hideMain(); else showMain();
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
const FLOAT_SIZE = 46;
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
    frame: false, transparent: true, hasShadow: false, thickFrame: false, roundedCorners: false,
    backgroundColor: '#00000000',
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-float.js'), contextIsolation: true, nodeIntegration: false },
  });
  floatWin.setContentProtection(state.stealth);
  // relativeLevel 1: sit above anything else that also asks for the
  // screen-saver level (macOS only; ignored elsewhere).
  floatWin.setAlwaysOnTop(true, 'screen-saver', 1);
  floatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatWin.setMenuBarVisibility(false);
  floatWin.loadFile(path.join(__dirname, 'renderer', 'float.html'));
  const showFloat = () => {
    if (!floatWin || floatWin.isDestroyed()) return;
    if (!floatWin.isVisible()) floatWin.showInactive();
    raiseFloat();
  };
  floatWin.once('ready-to-show', showFloat);
  floatWin.webContents.once('did-finish-load', () => {
    setTimeout(showFloat, 100);
    try { floatWin.webContents.send('float-caps', { manualDrag: !WAYLAND_SESSION }); } catch {}
    sendFloatState();
  });
  floatWin.on('move', () => {
    try { const [x, y] = floatWin.getPosition(); state.floatPos = { x, y }; saveState(); } catch {}
  });
  floatWin.on('show', raiseFloat);
  floatWin.on('closed', () => { stopFloatTopWatch(); floatWin = null; });
  bindFloatTopEvents();
  startFloatTopWatch();
}

// ── Keep the floating button above everything ────────────────────────────────
// alwaysOnTop is set once, but the flag alone does not win every z-order race:
// another top-most window (a second always-on-top app, an installer, a UAC or
// notification popup, a video going full screen, the screen unlocking) raises
// itself over ours and the platform leaves it there — the button ends up buried
// even though its flag is still set. So re-raise it inside the top-most band on
// a slow tick and on the events that reshuffle stacking. moveTop() re-orders
// without activating, so this never steals focus or clicks.
const FLOAT_TOP_TICK_MS = 1500;
let floatTopTimer = null;

function raiseFloat() {
  if (!floatWin || floatWin.isDestroyed() || !floatWin.isVisible()) return;
  try {
    // Only re-set the flag when it was actually dropped: re-applying it on
    // every tick makes some window managers flicker the window.
    if (!floatWin.isAlwaysOnTop()) {
      floatWin.setAlwaysOnTop(true, 'screen-saver', 1);
      floatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    floatWin.moveTop();
  } catch {}
}

function startFloatTopWatch() {
  stopFloatTopWatch();
  // Wayland does not let a client restack itself, so the tick would only burn
  // cycles; there the compositor's own layering is all we get.
  if (WAYLAND_SESSION) return;
  floatTopTimer = setInterval(raiseFloat, FLOAT_TOP_TICK_MS);
}

function stopFloatTopWatch() {
  if (floatTopTimer) { clearInterval(floatTopTimer); floatTopTimer = null; }
}

// The moments a window most often loses its place in the stack. Bound once,
// from createFloatWindow, because `screen` and `powerMonitor` are only usable
// after the app is ready.
let floatTopEventsBound = false;
function bindFloatTopEvents() {
  if (floatTopEventsBound || WAYLAND_SESSION) return;
  floatTopEventsBound = true;
  const soon = () => setTimeout(raiseFloat, 150);
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) {
    try { screen.on(ev, soon); } catch {}
  }
  // Another app coming to the front is what usually buries us; we only hear
  // about it as one of our own windows losing focus.
  app.on('browser-window-blur', soon);
  app.on('browser-window-focus', soon);
  try {
    const { powerMonitor } = require('electron');
    powerMonitor.on('resume', soon);
    powerMonitor.on('unlock-screen', soon);
  } catch {}
}
function sendFloatState() {
  if (!floatWin || floatWin.isDestroyed()) return;
  try { floatWin.webContents.send('float-state', isMainShown()); } catch {}
  raiseFloat();
}
ipcMain.handle('float-toggle', () => { toggleVisible(); });
// Drag the floating button by pressing and moving it: the renderer reports
// press/release, main follows the cursor. Wayland cannot position windows, so
// there the button's outer ring (a native drag region) does the moving.
let floatDrag = null;
ipcMain.handle('float-drag-start', () => {
  if (!floatWin || floatWin.isDestroyed() || WAYLAND_SESSION || floatDrag) return false;
  const c = screen.getCursorScreenPoint();
  const [x, y] = floatWin.getPosition();
  floatDrag = {
    dx: c.x - x, dy: c.y - y,
    timer: setInterval(() => {
      if (!floatWin || floatWin.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      floatWin.setPosition(Math.round(p.x - floatDrag.dx), Math.round(p.y - floatDrag.dy));
    }, 16),
    // Safety: never follow the cursor forever if the release is missed.
    stop: setTimeout(() => ipcMain.emit('float-drag-stop'), 15000),
  };
  return true;
});
function endFloatDrag() {
  if (!floatDrag) return;
  clearInterval(floatDrag.timer);
  clearTimeout(floatDrag.stop);
  floatDrag = null;
}
ipcMain.on('float-drag-stop', endFloatDrag);
ipcMain.handle('float-drag-end', () => { endFloatDrag(); });

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
  const wantShow = stickyWantOpen && isMainShown();
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
    if (!macAccessibilityOk(true)) {
      if (win) win.webContents.send('capture-error', 'Paste: ' + MAC_ACCESSIBILITY_HINT + ' The text is on the clipboard — press Cmd+V manually.');
      return;
    }
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

// Grab the capture rect from the screen as a PNG file (any platform).
async function captureRectPng(rect) {
  macScreenPermissionWarn();
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
  const tmp = path.join(app.getPath('temp'), `ace-capture-${process.pid}.png`);
  fs.writeFileSync(tmp, png);
  return tmp;
}

// Area snip in progress, and whether the main window was showing before it
// (it hides while the area is picked so it is not in the shot).
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
  macScreenPermissionWarn();
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

// The selector window is only used by the Alt+S area snip.
ipcMain.on('selector-done', (_e, rect) => { handleSnipDone(rect || {}); });

ipcMain.on('selector-cancel', () => {
  snipMode = false;
  if (selectorWin) { try { selectorWin.close(); } catch {} selectorWin = null; }
  if (snipPrevVisible && win) win.show();
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
  toggleStealth: () => setStealth(!state.stealth),
  toggleRecording: () => { if (win) win.webContents.send('toggle-recording'); },
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

// While click-through is on, the header bar stays clickable: the renderer
// reports when the pointer is over it (mouse moves are still forwarded to the
// page) and mouse events are re-enabled just for that time.
ipcMain.handle('click-through-hover', (_e, overHeader) => {
  if (!win || win.isDestroyed() || !state.clickThrough) return;
  try { win.setIgnoreMouseEvents(!overHeader, { forward: true }); } catch {}
});

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
  // Skip if already configured for this port (unless forced). The port rule
  // lets the signalling connection in and does not name the exe, so a new
  // install folder or exe name is no reason to ask for administrator rights
  // at the start of a session. After an update that moved or renamed the exe,
  // the rule that names the exe therefore stays on the old file until the
  // port changes or a rewrite is forced.
  const tag = `${exePath}|${port}`;
  const donePort = String(state.network.firewallConfiguredFor || '').split('|').pop();
  if (!force && donePort === String(port)) return;
  // Write the netsh commands into a temp .ps1, then run it elevated — avoids nested quoting issues.
  const ps1 = path.join(os.tmpdir(), `ace-fw-${Date.now()}.ps1`);
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    // the rules of versions up to 2.4.1, under the name the app had then
    `netsh advfirewall firewall delete rule name="Stealth Support" | Out-Null`,
    `netsh advfirewall firewall delete rule name="Stealth Support Port" | Out-Null`,
    `netsh advfirewall firewall delete rule name="Ace" | Out-Null`,
    `netsh advfirewall firewall delete rule name="Ace Port" | Out-Null`,
    `netsh advfirewall firewall add rule name="Ace" dir=in action=allow program="${exePath}" enable=yes profile=any | Out-Null`,
    `netsh advfirewall firewall add rule name="Ace Port" dir=in action=allow protocol=TCP localport=${port} enable=yes profile=any | Out-Null`,
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

// ── Updates ──────────────────────────────────────────────────────────────────
// The installed app (the -setup.exe on Windows, the AppImage on Linux, the
// signed app on macOS) looks for a newer release as soon as its window is up,
// and the user is asked. "Update" downloads the release and shows how far it
// is, then the app closes, the installer shows its own progress and starts the
// app again. "Later" changes nothing in this run and the question comes back
// at the next start. Nothing is downloaded or installed without that answer.
// The portable .exe has no installation to update and is left alone.
const UPDATE_CHECK_MS = 3 * 60 * 60 * 1000;
let updateReady = false;      // an update is downloaded and waits to be installed
let updateOffer = null;       // { version, current, platform }: asked, not answered yet
let updateVersion = '';       // the version that is being downloaded or installed
let updateDeclined = false;   // "Later" in this run
let updateBusy = false;       // downloading or about to install
let updateCancel = null;      // stops a running download
let updateInstallTimer = null; // between the end of the download and the start of the installer
let updateAsked = false;      // the running check was started by hand: ask even after "Later"
let updateQuiet = false;      // the running check is the 3-hour one: never opens the question
function canAutoUpdate() {
  return !!autoUpdater && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
}
function updaterStatus(s) {
  appendLogLine('[update] ' + s.state + (s.version ? ' v' + s.version : '') + (s.message ? ': ' + s.message : ''));
  if (win && !win.isDestroyed()) win.webContents.send('updater-status', s);
}
// A session runs from "Start" to "End": the signalling server is up for that
// time, also while listening is paused or not used. A recording counts too.
function inSession() { return deepgramActive || xaiActive || micDgActive || !!wsServer || recStreams.size > 0; }
// What a window that has just loaded needs to know: the open question, or
// that a download is on its way.
function sendUpdateState() {
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
  if (updateOffer) win.webContents.send('update-offer', updateOffer);
  else if (updateBusy) win.webContents.send('updater-status', { state: updateReady ? 'downloaded' : 'resumed', version: updateVersion, busy: true });
}
function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;
  // same network rule as the app's own requests: no search for a proxy first
  try { autoUpdater.netSession.setProxy({ mode: 'direct' }).catch(() => {}); } catch {}
  autoUpdater.on('checking-for-update', () => updaterStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    updaterStatus({ state: 'available', version: info?.version });
    const byHand = updateAsked, quiet = updateQuiet;
    updateAsked = false;
    updateQuiet = false;
    if (updateBusy || updateOffer) return;
    // Asked at the start and when the user looks for an update himself: never
    // in the middle of an interview, and once per run.
    if (!byHand && (quiet || updateDeclined || inSession())) return;
    updateOffer = { version: String(info?.version || ''), current: app.getVersion(), platform: process.platform };
    sendUpdateState();
  });
  autoUpdater.on('update-not-available', () => { updateAsked = false; updateQuiet = false; updaterStatus({ state: 'up-to-date' }); });
  autoUpdater.on('download-progress', (p) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater-status', {
        state: 'downloading', percent: Math.round(p.percent || 0),
        transferred: p.transferred || 0, total: p.total || 0,
      });
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    updaterStatus({ state: 'downloaded', version: info?.version, busy: updateBusy });
    if (!updateBusy) return;
    // The window says "installing" for a moment, then the installer takes
    // over with a progress window of its own and starts the app again.
    updateInstallTimer = setTimeout(() => {
      updateInstallTimer = null;
      if (installDownloadedUpdate(false)) return;
      updateBusy = false;
      updaterStatus({ state: 'error', message: 'the installer could not be started' });
    }, 1500);
  });
  autoUpdater.on('error', (err, text) => {
    updateAsked = false;
    updateQuiet = false;
    const message = String(err?.message || err).split('\n')[0].slice(0, 300);
    // a check that failed says nothing about a download that is running
    if (updateBusy && String(text || '').startsWith('Cannot check for updates')) {
      appendLogLine('[update] check failed during the download: ' + message);
      return;
    }
    // The file is complete and checked once 'update-downloaded' has come. What
    // fails after that (the copy of the block map for the next update) does
    // not stop the install that is about to start.
    if (updateInstallTimer) {
      appendLogLine('[update] error after the download: ' + message);
      return;
    }
    updateBusy = false;
    updaterStatus({ state: 'error', message });
  });
  if (!canAutoUpdate()) return;
  // No answer from the server (the network is still coming up): tried again
  // soon, not in three hours.
  let retries = 0, retryTimer = null;
  const check = (fresh, quiet) => {
    if (fresh) retries = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (updateBusy) return;
    // said for every attempt: an attempt that fails takes it back
    if (quiet) updateQuiet = true;
    autoUpdater.checkForUpdates().then(() => { retries = 0; }).catch(() => {
      if (retries >= 5) return;
      retryTimer = setTimeout(() => { retryTimer = null; check(false, quiet); }, 60 * 1000 * ++retries);
    });
  };
  // First thing once the window can show the question.
  if (win && !win.isDestroyed()) {
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => setTimeout(() => check(true), 1000));
    else setTimeout(() => check(true), 1000);
    // a window that was loaded again has lost what it showed
    win.webContents.on('did-finish-load', () => setTimeout(sendUpdateState, 300));
  }
  // What the timer finds is told in Settings and asked at the next start.
  setInterval(() => { if (!updateBusy) check(true, true); }, UPDATE_CHECK_MS);
}

// Closes the app and runs the installer of the downloaded update, which starts
// the app again. silent: without the installer's own progress window. Returns
// false when the installer was not started; the app then simply keeps running.
function installDownloadedUpdate(silent) {
  if (!autoUpdater || !updateReady) return false;
  // Linux: the new AppImage is started before this copy has quit, and would
  // be turned away as a second start.
  if (process.platform === 'linux') app.releaseSingleInstanceLock();
  let started = false;
  try {
    autoUpdater.quitAndInstall(!!silent, true);
    // It says "could not" by not quitting, never by throwing. macOS hands
    // over to the system's updater and cannot tell.
    started = process.platform === 'darwin' || autoUpdater.quitAndInstallCalled === true;
  } catch {}
  if (started) {
    // A deliberate restart: the watchdog must not bring the old version back.
    signalCleanQuit();
    return true;
  }
  updateReady = false;
  if (process.platform === 'linux') app.requestSingleInstanceLock({ guardian: false, dev: DEV_RUN });
  return false;
}

ipcMain.handle('update-answer', (_e, accept) => {
  if (!autoUpdater || !updateOffer) return false;
  const offer = updateOffer;
  updateOffer = null;
  if (!accept) { updateDeclined = true; appendLogLine('[update] v' + offer.version + ' put off until the next start'); return true; }
  updateBusy = true;
  updateReady = false;   // a file from an earlier download says nothing about this one
  updateVersion = offer.version;
  appendLogLine('[update] v' + offer.version + ' accepted');
  try {
    // from the updater itself: its helper module is packed inside it
    const { CancellationToken } = require('electron-updater');
    updateCancel = new CancellationToken();
    // A failure arrives through the 'error' event as well; a download that
    // was cancelled is not one.
    autoUpdater.downloadUpdate(updateCancel).catch(() => {});
  } catch (e) {
    updateBusy = false;
    updateCancel = null;
    updaterStatus({ state: 'error', message: String(e?.message || e).split('\n')[0].slice(0, 300) });
  }
  return true;
});
ipcMain.handle('update-cancel', () => {
  if (!updateBusy) return false;
  if (updateReady && !updateInstallTimer) return false;   // the installer has been started
  if (updateInstallTimer) { clearTimeout(updateInstallTimer); updateInstallTimer = null; }
  try { if (updateCancel) updateCancel.cancel(); } catch {}
  updateCancel = null;
  updateBusy = false;
  updateDeclined = true;
  appendLogLine('[update] download stopped; asked again at the next start');
  return true;
});

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { ok: false, message: 'electron-updater not installed' };
  if (process.env.PORTABLE_EXECUTABLE_FILE) return { ok: false, message: 'this is the portable copy; install Ace with the setup file to get automatic updates' };
  if (!app.isPackaged) return { ok: false, message: 'updates apply to the installed app, not a development run' };
  if (updateBusy) return { ok: false, message: 'an update is being installed' };
  try {
    updateAsked = true;
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, version: r?.updateInfo?.version };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('install-update-now', () => installDownloadedUpdate(false));

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

// ── Anti-close mutual watchdog (Windows) ──────────────────────────────────────
// The app and a separately-named guardian process guard each other: the
// guardian relaunches the app if it dies, and the app respawns the guardian if
// IT dies. Killing one at a time (or by exe name) never stops the app. Only a
// simultaneous kill of both, or admin/SYSTEM rights, can — unavoidable from
// user space. Packaged Windows only; a clean quit stands the guardian down.
const wdFile = (name) => path.join(app.getPath('userData'), name);
let wdMonitorTimer = null;
let appQuitting = false;

function wdAlive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function wdReadPid(f) { try { return parseInt(fs.readFileSync(f, 'utf8').trim(), 10) || 0; } catch { return 0; } }

// A byte copy of this Electron binary under a different name, so a by-name kill
// of the app exe does not also kill the guardian. Falls back to the app exe if
// the copy cannot be made.
function ensureGuardianExe() {
  const dest = wdFile('DevGuardian.exe');
  try {
    const src = fs.statSync(process.execPath);
    let need = true;
    try { need = fs.statSync(dest).size !== src.size; } catch {}
    if (need) fs.copyFileSync(process.execPath, dest);
    return dest;
  } catch { return process.execPath; }
}
// watchdog.js lives inside the asar; the guardian exe (a copy in userData) has
// no asar next to it, so write the script to a plain file it can run directly.
function ensureGuardianScript() {
  const dest = wdFile('guardian.js');
  try { fs.writeFileSync(dest, fs.readFileSync(path.join(__dirname, 'watchdog.js'))); } catch {}
  return dest;
}
function guardianRunning() { return wdAlive(wdReadPid(wdFile('guardian.pid'))); }

function spawnGuardian() {
  if (guardianRunning()) return;
  const exe = ensureGuardianExe();
  const js = ensureGuardianScript();
  try {
    spawn(exe, [js, app.getPath('userData'), process.execPath], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }).unref();
  } catch (e) { appendLogLine('[watchdog] guardian spawn failed: ' + e.message); }
}

function startWatchdog() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  if (state.antiClose === false) return;
  appQuitting = false;
  try { fs.unlinkSync(wdFile('watchdog-stop')); } catch {}
  try { fs.writeFileSync(wdFile('app.pid'), String(process.pid)); } catch {}
  spawnGuardian();
  if (wdMonitorTimer) clearInterval(wdMonitorTimer);
  // Respawn the guardian if it is ever killed while we are running.
  wdMonitorTimer = setInterval(() => {
    if (appQuitting || state.antiClose === false) return;
    try { fs.writeFileSync(wdFile('app.pid'), String(process.pid)); } catch {}
    if (!guardianRunning()) spawnGuardian();
  }, 2000);
}

function stopWatchdog() {
  if (wdMonitorTimer) { clearInterval(wdMonitorTimer); wdMonitorTimer = null; }
  try { fs.writeFileSync(wdFile('watchdog-stop'), String(Date.now())); } catch {}
}

// A deliberate quit must not be undone by the guardian.
function signalCleanQuit() {
  if (process.platform !== 'win32') return;
  appQuitting = true;
  stopWatchdog();
}
app.on('before-quit', signalCleanQuit);

let appIsQuitting = false;
app.on('before-quit', () => {
  appIsQuitting = true;
  try { stopSpeakerWatch(); } catch {}
  try { deepgramActive = false; xaiActive = false; micDgActive = false; clearDeepgramTimers(); clearXaiTimers(); } catch {}
  for (const ws of [deepgramWs, xaiWs, micDgWs]) { try { if (ws) { ws.removeAllListeners(); ws.on('error', () => {}); ws.terminate(); } } catch {} }
  for (const r of recStreams.values()) { try { r.stream.end(); } catch {} }
});
// An error in a timer or socket callback used to surface as Electron's
// "A JavaScript error occurred in the main process" box, most often while the
// app was closing. It is written to the log; the box is kept for errors that
// happen while the app is in use.
process.on('uncaughtException', (e) => {
  const text = (e && (e.stack || e.message)) || String(e);
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [error] uncaught: ${text}\n`); } catch {}
  if (!appIsQuitting) { try { dialog.showErrorBox('Ace', text); } catch {} }
});
process.on('unhandledRejection', (e) => {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [error] unhandled rejection: ${(e && (e.stack || e.message)) || String(e)}\n`); } catch {}
});

function startApp() {
  startWatchdog();
  recoverRecordings();
  // Keep the license's last-seen time moving while the app runs (10 min).
  setInterval(() => { try { license.touchStoredLicense(app.getPath('userData')); } catch {} }, 10 * 60 * 1000);
  // macOS: ask for the microphone up front so the system prompt appears once,
  // instead of the first transcription silently getting no audio.
  if (process.platform === 'darwin') {
    try { require('electron').systemPreferences.askForMediaAccess('microphone').catch(() => {}); } catch {}
  }
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

// A second start ends up here, in the app that is already running. It shows
// what a normal start would have shown: the licence window while the app waits
// for a key, otherwise the main window, also when it was hidden or minimized.
// Starting the app again is how people look for a window they cannot find:
// it has no button in the taskbar.
function showRunningApp() {
  if (licenseWin && !licenseWin.isDestroyed()) {
    if (licenseWin.isMinimized()) licenseWin.restore();
    licenseWin.show();
    licenseWin.focus();
    return;
  }
  if (!win || win.isDestroyed()) return; // still starting: the window shows itself
  // showMain() puts the window back where it was hidden last: right for a
  // hidden window only
  const hidden = !win.isVisible();
  if (win.isMinimized()) win.restore();
  if (hidden) showMain(); else { try { win.focus(); } catch {} }
  raiseFloat();
}
app.on('second-instance', (_e, _argv, _cwd, data) => {
  if (data && data.guardian) {
    // The guardian took this app for gone, so app.pid is wrong: put it right,
    // or it tries again every few seconds. Nobody asked for the window, so a
    // window that was hidden on purpose stays hidden.
    claimAppPid();
    appendLogLine('[instance] a start by the guardian was turned away');
    return;
  }
  if (data && data.dev && app.isPackaged) {
    // A development run on the same machine: nobody asked for this window,
    // and it may be hidden because a meeting is running.
    appendLogLine('[instance] a development run was turned away');
    return;
  }
  appendLogLine('[instance] a second start was turned away; the running app is shown');
  showRunningApp();
});

app.whenReady().then(() => {
  const check = license.checkStoredLicense(app.getPath('userData'));
  if (check.ok) startApp();
  else openLicenseWindow(check.reason);
});

ipcMain.handle('set-opacity', (_e, value) => setOpacity(value));
ipcMain.handle('get-opacity', () => (LINUX_CSS_OPACITY ? (state.opacity ?? 1) : (win?.getOpacity() ?? 1)));
// What the OS can actually do, so the UI can say so instead of silently failing.
// ── macOS system audio (ScreenCaptureKit helper, see mac-audio/) ────────────
// Windows gets system audio from Chromium's loopback; macOS has no such thing,
// so a native helper captures it and pipes 16 kHz mono Int16 PCM to us, which
// we forward to the renderer's audio graph (pcm-feed-worklet.js).
let macSysProc = null;
function macSystemAudioHelperPath() {
  return path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, 'mac-audio', 'build'), app.isPackaged ? 'mac-audio' : '', 'system-audio');
}
function stopMacSystemAudio() {
  const p = macSysProc;
  macSysProc = null;
  if (!p) return;
  try { p.stdin.end(); } catch {}
  setTimeout(() => { try { p.kill(); } catch {} }, 500);
}
ipcMain.handle('mac-system-audio-start', () => {
  if (process.platform !== 'darwin') return { ok: false, error: 'not macOS' };
  const bin = macSystemAudioHelperPath();
  if (!fs.existsSync(bin)) return { ok: false, error: 'system-audio helper is missing from this build' };
  stopMacSystemAudio();
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    let p;
    try { p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { return done({ ok: false, error: e.message }); }
    macSysProc = p;
    p.stderr.on('data', (d) => {
      const s = d.toString().trim();
      if (s) appendLogLine('[mac-audio] ' + s);
      if (/^started/m.test(s)) done({ ok: true });
      else if (/error/i.test(s)) done({ ok: false, error: s.replace(/^error:\s*/i, '') });
    });
    p.stdout.on('data', (chunk) => { if (win && !win.isDestroyed()) win.webContents.send('mac-system-audio-chunk', chunk); });
    p.on('exit', (code) => {
      if (macSysProc === p) macSysProc = null;
      done({ ok: false, error: 'system-audio helper exited (' + code + ')' });
      if (win && !win.isDestroyed()) win.webContents.send('mac-system-audio-ended', code);
    });
    p.on('error', (e) => done({ ok: false, error: e.message }));
    setTimeout(() => done({ ok: false, error: 'system-audio helper did not start (permission not granted?)' }), 8000);
  });
});
ipcMain.handle('mac-system-audio-stop', () => { stopMacSystemAudio(); });

// macOS: typing/pasting into other apps needs the Accessibility permission.
// prompt=true shows the system dialog that adds the app to the list.
function macAccessibilityOk(prompt) {
  if (process.platform !== 'darwin') return true;
  try { return require('electron').systemPreferences.isTrustedAccessibilityClient(!!prompt); } catch { return true; }
}
const MAC_ACCESSIBILITY_HINT = 'macOS needs the Accessibility permission for this: System Settings → Privacy & Security → Accessibility → enable Ace, then try again.';

// ── Diagnostics: one place that checks every requirement on this machine ──
// macOS applies Accessibility / Screen Recording grants only after a relaunch.
ipcMain.handle('relaunch-app', () => {
  // A deliberate restart. exit() skips the quit handlers, so the guardian is
  // told here, or it starts a copy of its own next to the one relaunch() starts.
  signalCleanQuit();
  app.releaseSingleInstanceLock();
  // Without the guardian's mark: the new copy is a start the user asked for.
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--by-guardian') });
  app.exit(0);
});

ipcMain.handle('run-diagnostics', async () => {
  const sp = require('electron').systemPreferences;
  const mac = process.platform === 'darwin';
  const checks = [];
  const add = (name, ok, detail, fix) => checks.push({ name, ok, detail: detail || '', fix: ok ? '' : (fix || '') });
  const keys = getBuiltinKeys();
  add('Deepgram key (transcription)', !!keys.deepgram, keys.deepgram ? 'built in' : 'missing', 'Rebuild with the API_KEYS_JSON secret (or defaults/api-keys.json) filled in.');
  const ap = getAnswerProvider();
  add(`${ap.label} key (answers)`, !!getAnswerApiKey(ap.id), getAnswerApiKey(ap.id) ? 'built in' : 'missing', 'Rebuild with the API_KEYS_JSON secret filled in, or pick a provider that has a key.');
  if (mac) {
    const micSt = (() => { try { return sp.getMediaAccessStatus('microphone'); } catch { return 'unknown'; } })();
    add('Microphone permission', micSt === 'granted', micSt, 'System Settings → Privacy & Security → Microphone → enable Ace.');
    const scrSt = (() => { try { return sp.getMediaAccessStatus('screen'); } catch { return 'unknown'; } })();
    add('Screen & System Audio Recording permission (call audio, screen capture)', scrSt === 'granted', scrSt, 'System Settings → Privacy & Security → Screen & System Audio Recording → enable Ace, then Quit & reopen the app. If it is already enabled but still shows denied, remove the app from that list with − and add it again.');
    const helper = macSystemAudioHelperPath();
    add('System-audio helper present', fs.existsSync(helper), fs.existsSync(helper) ? helper : 'not in this build', 'This build has no system-audio helper; use a build from GitHub Actions (macOS runner).');
    add('Accessibility permission (typing / paste into other apps)', macAccessibilityOk(false), macAccessibilityOk(false) ? 'granted' : 'not granted', MAC_ACCESSIBILITY_HINT + ' Then Quit & reopen the app. If it is already enabled but still shows not granted, remove the app from that list with − and add it again.');
    let osOk = true; try { osOk = parseInt(require('os').release().split('.')[0], 10) >= 22; } catch {}
    add('macOS 13 or newer (system audio)', osOk, 'Darwin ' + require('os').release(), 'Update macOS to 13 (Ventura) or newer for system-audio capture.');
  }
  const has = (cmd) => { try { require('child_process').execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
  if (process.platform === 'linux') {
    const typing = has('xdotool') || has('wtype') || has('ydotool');
    add('Typing tool (Write-to-IDE / paste): xdotool, wtype or ydotool', typing, typing ? 'installed' : 'none installed', 'Click "Install missing tools" below.');
  }
  add('License', !!license.checkStoredLicense(app.getPath('userData')).ok, 'valid', 'Ask your administrator for a new key.');
  return { platform: process.platform, macRestartHint: mac, checks, canInstallTools: process.platform === 'linux' && (has('apt-get') || has('dnf') || has('pacman')) && has('pkexec') };
});

// Linux: install the optional tools through the system package manager with
// the normal graphical password prompt (pkexec). The .deb declares the same
// packages as dependencies, so this is mainly for AppImage users.
ipcMain.handle('install-linux-tools', () => new Promise((resolve) => {
  if (process.platform !== 'linux') return resolve({ ok: false, error: 'Linux only' });
  const has = (cmd) => { try { require('child_process').execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
  let cmd;
  if (has('apt-get')) cmd = 'apt-get update && apt-get install -y xdotool wtype';
  else if (has('dnf')) cmd = 'dnf install -y xdotool wtype';
  else if (has('pacman')) cmd = 'pacman -Sy --noconfirm xdotool wtype';
  else return resolve({ ok: false, error: 'No supported package manager found (apt, dnf or pacman).' });
  const p = spawn('pkexec', ['sh', '-c', cmd]);
  let err = '';
  p.stderr.on('data', (d) => { err += d.toString(); });
  p.on('error', (e) => resolve({ ok: false, error: e.message }));
  p.on('exit', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: code === 126 || code === 127 ? 'Cancelled.' : ('Install failed: ' + err.slice(-300)) }));
}));
app.on('will-quit', () => stopMacSystemAudio());

// macOS: screenshots and area snips read the screen through
// desktopCapturer, which needs the "Screen & System Audio Recording"
// permission. Without it macOS returns a blank/wallpaper-only image and no
// error, so warn the user explicitly (the OS shows its prompt on first use;
// the grant takes effect after the app is reopened).
function macScreenPermissionWarn() {
  if (process.platform !== 'darwin') return true;
  let st = 'unknown';
  try { st = require('electron').systemPreferences.getMediaAccessStatus('screen'); } catch {}
  if (st === 'granted') return true;
  if (win && !win.isDestroyed()) win.webContents.send('capture-error',
    'Screen capture needs the Screen & System Audio Recording permission: System Settings → Privacy & Security → Screen & System Audio Recording → enable Ace, then Quit & reopen the app (Settings → Check).');
  return false;
}

// macOS microphone permission: 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'.
ipcMain.handle('get-mic-permission', () => {
  if (process.platform !== 'darwin') return 'granted';
  try { return require('electron').systemPreferences.getMediaAccessStatus('microphone'); } catch { return 'unknown'; }
});
ipcMain.handle('request-mic-permission', async () => {
  if (process.platform !== 'darwin') return true;
  try { return await require('electron').systemPreferences.askForMediaAccess('microphone'); } catch { return false; }
});
ipcMain.handle('get-platform-caps', () => ({
  platform: process.platform,
  stealth: process.platform !== 'linux',
  stealthNote: process.platform === 'darwin'
    ? 'On macOS, apps that capture with ScreenCaptureKit (recent Zoom/Teams) may still see this window — hide it (Ctrl+Alt+H) to be sure.'
    : (process.platform === 'linux' ? 'Not available on Linux: no desktop API can hide a window from screen capture. Hide the window (Ctrl+Alt+H) while sharing.' : ''),
  clickThrough: process.platform !== 'linux' || LINUX_X11_SESSION,
}));
ipcMain.handle('set-stealth', (_e, value) => setStealth(value));
ipcMain.handle('get-stealth', () => state.stealth);
ipcMain.handle('set-click-through', (_e, value) => setClickThrough(value));
ipcMain.handle('get-click-through', () => state.clickThrough);
ipcMain.handle('hide', () => hideMain());
ipcMain.handle('quit', () => app.quit());
ipcMain.handle('get-anti-close', () => ({ supported: process.platform === 'win32', enabled: state.antiClose !== false }));
ipcMain.handle('set-anti-close', (_e, v) => {
  state.antiClose = !!v;
  saveState();
  if (state.antiClose) startWatchdog();
  else stopWatchdog();
  return state.antiClose;
});
ipcMain.handle('get-desktop-source-id', async () => {
  macScreenPermissionWarn();
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

ipcMain.handle('get-transcription-config', () => ({ ...state.transcription }));
ipcMain.handle('set-transcription-config', (_e, cfg) => {
  state.transcription = { ...state.transcription, ...(cfg || {}) };
  applyBuiltinKeys();
  saveState();
});

// Meeting types, in two groups: hiring interviews (you are the candidate) and
// team meetings (you are on the job). The type picks the answer rules below.
const MEETING_TYPES = {
  recruiter_screen:   { kind: 'hiring', label: 'Recruiter / HR screen' },
  technical_interview:{ kind: 'hiring', label: 'Technical interview' },
  live_coding:        { kind: 'hiring', label: 'Live coding / system design' },
  leader_round:       { kind: 'hiring', label: 'CTO / CEO / founder round' },
  ai_interview:       { kind: 'hiring', label: 'AI interview' },
  standup:            { kind: 'team',   label: 'Engineering standup' },
  one_on_one:         { kind: 'team',   label: '1:1 with manager' },
  sprint_review:      { kind: 'team',   label: 'Sprint review + retro + preview' },
  sprint_planning:    { kind: 'team',   label: 'Sprint planning' },
  design_review:      { kind: 'team',   label: 'Design / technical review' },
  stakeholder_update: { kind: 'team',   label: 'Wider team / stakeholder update' },
};
// Stage names saved by older versions.
const LEGACY_MEETING_TYPES = { intro: 'recruiter_screen', hr: 'recruiter_screen', technical: 'technical_interview', ceo: 'leader_round' };
function normalizeMeetingType(t) {
  t = String(t || '');
  if (MEETING_TYPES[t]) return t;
  return LEGACY_MEETING_TYPES[t] || 'recruiter_screen';
}

function getMeetingConfig() {
  const m = state.meeting || {};
  const type = normalizeMeetingType(m.type || m.hiringType);
  return { kind: MEETING_TYPES[type].kind, type };
}
ipcMain.handle('get-meeting-config', () => getMeetingConfig());
ipcMain.handle('set-meeting-config', (_e, cfg) => {
  cfg = cfg || {};
  const type = normalizeMeetingType(cfg.type || cfg.hiringType || getMeetingConfig().type);
  state.meeting = { kind: MEETING_TYPES[type].kind, type };
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

// ── Speaker names from the meeting screen ───────────────────────────────────
// While transcription runs, a hidden window (renderer/speaker-watch.js) holds
// every display as a low-rate capture stream and reads it twice a second. Meet,
// Teams and Zoom frame the active speaker's tile in colour; speaker-detect finds
// that tile, and the answer model reads the name printed in its corner. Each
// transcript line is then named after whoever was framed while it was spoken.
// When nobody is framed, the speaker title of the live captions is read
// instead. Names come from the screen only; voices are not remembered.
// "Interviewer" is the fallback.
const speakerTracker = createSpeakerTracker({ readName: readTileName, isSelf: isOwnName, signatureDistance });
let watchWin = null;
let lastSpeechAt = 0;            // last transcript event from the meeting audio
let lastFramedAt = 0;            // last screen read with a framed tile
let captionTimer = null;
let captionRead = null;          // the caption read in flight, if any
let captionLast = { hash: '', name: null };
const grabs = new Map();         // id -> resolve
let grabSeq = 0;
const CAPTION_EVERY_MS = 2500;

// Letters that differ between two names, for a profile name typed slightly off.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

function isOwnName(name) {
  const n = String(name || '').trim().toLowerCase();
  const me = String((activeProfile && activeProfile.name) || (state.profile && state.profile.name) || '').trim().toLowerCase();
  if (/^you\b/.test(n) || /\(you\)/.test(n)) return true;
  if (!me) return false;
  return n === me || n.startsWith(me + ' ') || (me.length >= 6 && editDistance(n, me) <= 2);
}

async function readScreenText(prompt, mime, bytes, maxTokens) {
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  if (!apiKey) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    return await completeChat({
      provider, apiKey, model: getAnswerModel(provider.id), maxTokens, signal: ac.signal,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + Buffer.from(bytes).toString('base64') } },
      ] }],
    });
  } finally { clearTimeout(t); }
}

async function readTileName(png) {
  const name = await readScreenText('This is the name label from a video-call participant tile, enlarged. Reply with the whole name exactly as written and nothing else. If the label ends in "..." keep the dots. If no name is visible, reply NONE.', 'image/png', png, 60);
  appendLogLine('[speakers] tile label read as: ' + JSON.stringify(name));
  return name;
}

function grabCaptionArea() {
  return new Promise((resolve) => {
    if (!watchWin || watchWin.isDestroyed()) return resolve(null);
    const id = ++grabSeq;
    const timer = setTimeout(() => { grabs.delete(id); resolve(null); }, 3000);
    grabs.set(id, (jpeg) => { clearTimeout(timer); resolve(jpeg); });
    try { watchWin.webContents.send('speaker-watch-grab', { id }); } catch { clearTimeout(timer); grabs.delete(id); resolve(null); }
  });
}

// Runs only while someone is talking and no tile is framed (a full-screen
// share, tiles covered), so a meeting with visible tiles costs no caption reads.
function captionTick() {
  if (captionRead || !watchWin) return;
  const now = Date.now();
  if (now - lastSpeechAt > 4000 || now - lastFramedAt < 2000) return;
  captionRead = (async () => {
    const jpeg = await grabCaptionArea();
    if (!jpeg) return;
    const hash = require('crypto').createHash('sha1').update(jpeg).digest('hex');
    let name = captionLast.name;
    if (hash !== captionLast.hash) {
      name = await readScreenText('This is the lower half of a screen during a video call. If live captions (subtitles) that show who is speaking are visible, reply with only the name shown for the most recent caption, the lowest one. If there are no captions with a speaker name, reply NONE.', 'image/jpeg', jpeg, 60);
      captionLast = { hash, name };
      appendLogLine('[speakers] caption title read as: ' + JSON.stringify(name));
    }
    speakerTracker.observeCaption(now, name);
  })().catch((e) => appendLogLine('[speakers] caption read failed: ' + ((e && e.message) || e)))
    .finally(() => { captionRead = null; });
}

ipcMain.handle('speaker-watch-sources', async () => {
  // No thumbnails: only the ids are needed, the window opens the streams.
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  return sources.map((x, i) => ({ id: x.id, displayId: x.display_id || String(i) }));
});
ipcMain.on('speaker-watch-observe', (e, obs) => {
  if (!watchWin || watchWin.isDestroyed() || e.sender !== watchWin.webContents || !obs) return;
  if (obs.det) lastFramedAt = obs.t;
  speakerTracker.observe(obs.t, obs.det || null, obs.label ? Buffer.from(obs.label) : null, obs.sig || null);
});
ipcMain.on('speaker-watch-log', (_e, line) => appendLogLine('[speakers] ' + line));
ipcMain.on('speaker-watch-grabbed', (_e, r) => {
  const done = r && grabs.get(r.id);
  if (done) { grabs.delete(r.id); done(r.jpeg ? Buffer.from(r.jpeg) : null); }
});

function startSpeakerWatch() {
  if (watchWin && !watchWin.isDestroyed()) return;
  if (!macScreenPermissionWarn()) return;
  speakerTracker.reset();
  captionLast = { hash: '', name: null };
  watchWin = new BrowserWindow({
    width: 320, height: 200, show: false, skipTaskbar: true, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-watch.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  const w = watchWin;
  w.webContents.on('render-process-gone', (_e, d) => {
    appendLogLine('[speakers] screen watcher stopped (' + ((d && d.reason) || 'gone') + '); speaker names are off until transcription restarts');
    stopSpeakerWatch();
  });
  w.on('closed', () => { if (watchWin === w) watchWin = null; });
  w.loadFile(path.join(__dirname, 'renderer', 'speaker-watch.html'));
  captionTimer = setInterval(captionTick, CAPTION_EVERY_MS);
}

function stopSpeakerWatch() {
  if (captionTimer) { clearInterval(captionTimer); captionTimer = null; }
  for (const done of grabs.values()) done(null);
  grabs.clear();
  const w = watchWin;
  watchWin = null;
  if (w && !w.isDestroyed()) { try { w.destroy(); } catch {} }
}

// Deepgram timestamps count from the start of each connection.
let deepgramT0 = 0;

// window: [t0, t1] wall-clock ms the words were spoken, when known.
// The platforms move their frame about 1 s after the voice changes (measured
// on the sample recordings with scripts/test-speaker-names.js --lags), so the
// frame that belongs to an utterance is the one 1 s later.
const SCREEN_LAG_MS = 1000;
function transcriptWho(window, isFinal) {
  const w = window && [window[0] + SCREEN_LAG_MS, window[1] + SCREEN_LAG_MS];
  const named = w ? speakerTracker.nameAt(w[0], w[1]) : null;
  return named || (!isFinal && speakerTracker.lastName()) || 'Interviewer';
}

function parseTranscriptAlternative(alt, window, isFinal) {
  const transcript = String((alt && alt.transcript) || '').trim();
  const words = (alt && alt.words) || [];
  const text = transcript || words.map((w) => w.punctuated_word || w.word || '').join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return { text: '', labeled: '', speaker: 0, turns: [] };
  lastSpeechAt = Date.now();
  const who = transcriptWho(window, isFinal);
  return { text, labeled: who + ': ' + text, speaker: 0, turns: [{ speaker: 0, who, text }] };
}

// A final line spoken while nobody was framed waits briefly for the caption
// read that is under way, so it gets the caption's name instead of the fallback.
async function settleSpeakerName(window, isFinal) {
  if (!isFinal || !window || !captionRead) return;
  if (speakerTracker.nameAt(window[0] + SCREEN_LAG_MS, window[1] + SCREEN_LAG_MS)) return;
  await Promise.race([captionRead, new Promise((r) => setTimeout(r, 2000))]);
}
let transcriptQueue = Promise.resolve();   // keeps lines in order across that wait

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
    deepgramT0 = Date.now();
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
        transcriptQueue = transcriptQueue.then(() => {
          if (win && !win.isDestroyed()) win.webContents.send('transcript-utterance-end');
        }).catch(() => {});
        return;
      }
      if (msg.type !== 'Results') return;
      const window = Number.isFinite(msg.start) && Number.isFinite(msg.duration)
        ? [deepgramT0 + msg.start * 1000, deepgramT0 + (msg.start + msg.duration) * 1000] : null;
      lastSpeechAt = Date.now();
      transcriptQueue = transcriptQueue.then(() => settleSpeakerName(window, !!msg.is_final)).then(() => {
        const parsed = parseTranscriptAlternative(msg.channel?.alternatives?.[0], window, !!msg.is_final);
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
      }).catch(() => {});
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
        }, [Date.now() - 4000 - SCREEN_LAG_MS, Date.now() - SCREEN_LAG_MS], isFinal);
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
  startSpeakerWatch();
  xaiAuth = { apiKey, language };
  xaiReconnectAttempts = 0;
  clearXaiTimers();
  startXaiWs(apiKey, language);
});
ipcMain.handle('stop-xai-stream', () => {
  xaiActive = false;
  stopSpeakerWatch();
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
  startSpeakerWatch();
  deepgramAuth = { apiKey, language };
  deepgramReconnectAttempts = 0;
  clearDeepgramTimers();
  startDeepgramWs(apiKey, language);
});
ipcMain.handle('stop-deepgram-stream', () => {
  deepgramActive = false;        // prevents the close handler from reconnecting
  stopSpeakerWatch();
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

// ── Microphone transcription (separate Deepgram socket) ──────────────────────
// The candidate's own voice must NOT appear as interviewer bubbles; it is
// transcribed on its own socket and only its finals reach the renderer (for the
// saved transcript), never the bubble pipeline. Both mic and system audio are
// still recorded to the video by the renderer.
let micDgWs = null, micDgActive = false, micDgAuth = null, micDgKeepAlive = null;
function startMicDeepgramWs(apiKey, language) {
  if (micDgWs) return;
  const params = new URLSearchParams({
    encoding: 'linear16', sample_rate: '16000', channels: '1',
    // Interims too: the reading marker follows the words as they are spoken.
    smart_format: 'true', interim_results: 'true',
    endpointing: '250', utterance_end_ms: '1500', punctuate: 'true',
  });
  params.set('model', 'nova-2');
  params.set('language', (language && language !== 'auto') ? language : 'en-US');
  micDgWs = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, { headers: { Authorization: `Token ${apiKey}` } });
  micDgWs.on('open', () => {
    if (micDgKeepAlive) clearInterval(micDgKeepAlive);
    micDgKeepAlive = setInterval(() => { if (micDgWs && micDgWs.readyState === WebSocket.OPEN) { try { micDgWs.send(JSON.stringify({ type: 'KeepAlive' })); } catch {} } }, 7000);
  });
  micDgWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'Results') return;
      const alt = msg.channel && msg.channel.alternatives && msg.channel.alternatives[0];
      const text = String((alt && alt.transcript) || '').trim();
      if (text && win && !win.isDestroyed()) win.webContents.send('transcript-mic', { text, isFinal: !!msg.is_final });
    } catch {}
  });
  micDgWs.on('close', () => {
    if (micDgKeepAlive) { clearInterval(micDgKeepAlive); micDgKeepAlive = null; }
    micDgWs = null;
    if (micDgActive) setTimeout(() => { if (micDgActive && !micDgWs && micDgAuth) startMicDeepgramWs(micDgAuth.apiKey, micDgAuth.language); }, 1000);
  });
  micDgWs.on('error', () => {});
  micDgWs.on('unexpected-response', (_r, res) => { res.resume(); micDgActive = false; try { if (micDgWs) micDgWs.terminate(); } catch {} micDgWs = null; });
}
ipcMain.handle('extract-jd-info', async () => {
  try {
    const jd = state.knowledge && state.knowledge.jd && state.knowledge.jd[0] && state.knowledge.jd[0].text;
    if (!jd || !jd.trim()) return { company: '', role: '' };
    const provider = getAnswerProvider();
    const apiKey = getAnswerApiKey(provider.id);
    if (!apiKey) return { company: '', role: '' };
    const ac = new AbortController();
    setTimeout(() => { try { ac.abort(); } catch {} }, 15000);
    const prompt = 'From this job description, extract the hiring company name and the job title. Reply with strict JSON only, no prose: {\"company\":\"\",\"role\":\"\"}. Use \"\" if not stated.\n\n' + jd.slice(0, 6000);
    let raw = '';
    try { raw = await completeChat({ provider, apiKey, model: getAnswerModel(provider.id), messages: [{ role: 'user', content: prompt }], maxTokens: 120, signal: ac.signal }); }
    catch { return { company: '', role: '' }; }
    const mm = String(raw || '').match(/\{[\s\S]*\}/);
    if (!mm) return { company: '', role: '' };
    let d; try { d = JSON.parse(mm[0]); } catch { return { company: '', role: '' }; }
    return { company: String((d && d.company) || '').trim(), role: String((d && d.role) || '').trim() };
  } catch { return { company: '', role: '' }; }
});
ipcMain.handle('start-mic-deepgram-stream', (_e, { apiKey, language } = {}) => { micDgActive = true; micDgAuth = { apiKey, language }; startMicDeepgramWs(apiKey, language); });
ipcMain.handle('stop-mic-deepgram-stream', () => {
  micDgActive = false;
  if (micDgKeepAlive) { clearInterval(micDgKeepAlive); micDgKeepAlive = null; }
  if (micDgWs) { try { micDgWs.send(JSON.stringify({ type: 'CloseStream' })); } catch {} try { micDgWs.close(); } catch {} micDgWs = null; }
});
ipcMain.on('mic-audio-chunk', (_e, buf) => { if (micDgWs && micDgWs.readyState === WebSocket.OPEN) micDgWs.send(buf); });
ipcMain.on('session-log-add', (_e, entry) => { sessionLog.push(entry); });
ipcMain.handle('clear-session-log', () => { sessionLog = []; });
// Where each finished interview's folder goes.
function sessionsRootDir() { return path.join(app.getPath('documents'), 'Ace Sessions'); }
function sanitizeName(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(); }
function uniqueDir(base) {
  let dir = base, i = 2;
  while (fs.existsSync(dir)) { dir = base + ' (' + (i++) + ')'; }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Create the session folder and write the transcript + the CV/JD used. Returns
// the folder path; the recording is written into it afterwards (save-recording).
// Base name for the session's folder and every file inside it:
//   "YYYY-MM-DD-HHMM-Company-Role"  (date and time first, then the fields that are set)
function sessionStamp() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
}
function sessionBaseName(company, role) {
  const parts = [sessionStamp()].concat([company, role].map((x) => sanitizeName(x)).filter(Boolean));
  return sanitizeName(parts.join('-'));
}

// ── Session recording ────────────────────────────────────────────────────────
// The renderer records in 2 s pieces and each piece is written to disk as it
// arrives, so stopping is instant however long the meeting was and a crash
// leaves the video so far. Recordings wait in a staging folder until End moves
// them into the session's folder, next to the transcript and the documents.
const recStreams = new Map();      // id -> { file, stream }
let pendingRecordings = [];        // finished files waiting for End
let recSeq = 0;
function recStagingDir() { return path.join(sessionsRootDir(), 'Recording in progress'); }

ipcMain.handle('rec-begin', () => {
  try {
    const dir = recStagingDir();
    fs.mkdirSync(dir, { recursive: true });
    const id = String(++recSeq);
    const file = path.join(dir, `recording-${sessionStamp()}-${Date.now().toString(36)}.webm`);
    const stream = fs.createWriteStream(file);
    stream.on('error', (e) => appendLogLine('[recording] write failed: ' + e.message));
    recStreams.set(id, { file, stream });
    return { ok: true, id };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.on('rec-chunk', (_e, id, buf) => {
  const r = recStreams.get(String(id));
  if (r && buf) { try { r.stream.write(Buffer.from(buf)); } catch {} }
});
function finishRecording(id) {
  const r = recStreams.get(String(id));
  if (!r) return Promise.resolve(null);
  recStreams.delete(String(id));
  return new Promise((resolve) => {
    r.stream.end(() => {
      let size = 0;
      try { size = fs.statSync(r.file).size; } catch {}
      if (!size) { try { fs.unlinkSync(r.file); } catch {} return resolve(null); }
      pendingRecordings.push(r.file);
      resolve(r.file);
    });
  });
}
ipcMain.handle('rec-end', async (_e, id) => {
  const file = await finishRecording(id);
  return file ? { ok: true, path: file } : { ok: false, error: 'nothing was recorded' };
});

async function moveFile(from, to) {
  try { await fs.promises.rename(from, to); }
  catch { await fs.promises.copyFile(from, to); await fs.promises.unlink(from).catch(() => {}); }
}
// Every finished recording goes into the session folder; several when the
// recording was stopped and started again during the meeting.
async function collectRecordings(folder, base) {
  for (const id of [...recStreams.keys()]) await finishRecording(id);
  const files = pendingRecordings;
  pendingRecordings = [];
  let n = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    n++;
    const name = base + '-recording' + (files.length > 1 ? '-' + n : '') + '.webm';
    try { await moveFile(f, path.join(folder, name)); } catch (e) { appendLogLine('[recording] could not move ' + f + ': ' + e.message); }
  }
  try { await fs.promises.rmdir(recStagingDir()); } catch {}
  return n;
}
// Recordings left behind by a quit or crash before End get their own folder.
async function recoverRecordings() {
  try {
    const dir = recStagingDir();
    const left = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.webm'));
    if (left.length) {
      const folder = uniqueDir(path.join(sessionsRootDir(), sessionStamp() + '-Unsaved recording'));
      for (const f of left) await moveFile(path.join(dir, f), path.join(folder, f));
      appendLogLine('[recording] recovered ' + left.length + ' recording(s) into ' + folder);
    }
    await fs.promises.rmdir(dir).catch(() => {});
  } catch {}
}

ipcMain.handle('save-session-bundle', async (_e, { role, company, transcript } = {}) => {
  try {
    const base = sessionBaseName(company, role);
    const folder = uniqueDir(path.join(sessionsRootDir(), base));
    const ext = (name) => { const e = String(name || '').split('.').pop(); return e && e !== name ? '.' + e.toLowerCase() : ''; };
    const script = String(transcript || '').trim();
    if (script) await fs.promises.writeFile(path.join(folder, base + '-transcript.txt'), script, 'utf8');
    const k = state.knowledge || {};
    // Save every uploaded file, prefixed with the base name; keep the original
    // file (e.g. the CV as .pdf) when we have it, else its extracted text.
    const saveMaterial = async (it, label, idx) => {
      if (!it) return;
      const tag = base + '-' + label + (idx ? '-' + idx : '');
      if (it.file && fs.existsSync(it.file)) {
        try { await fs.promises.copyFile(it.file, path.join(folder, tag + ext(it.name))); return; } catch {}
      }
      if (it.text) await fs.promises.writeFile(path.join(folder, tag + '.txt'), it.text, 'utf8');
    };
    for (const it of (k.cv || [])) await saveMaterial(it, 'CV');
    for (const it of (k.jd || [])) await saveMaterial(it, 'JD');
    (k.support || []).forEach; let i = 0;
    for (const it of (k.support || [])) await saveMaterial(it, 'Support', ++i);
    i = 0;
    for (const it of (k.meetings || [])) await saveMaterial(it, 'Meeting', ++i);
    const recordings = await collectRecordings(folder, base);
    const s = currentSession && currentSession();
    if (s) { s.folder = folder; saveSessions(); }
    // Show the folder: the video, the transcript and the documents are all in it.
    try { require('electron').shell.openPath(folder); } catch {}
    return { ok: true, folder, base, recordings };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Upload the saved session folder to gofile.io and return the share link.
// Progress is streamed to the window so End can show which file is going up.
ipcMain.handle('upload-session-bundle', async (_e, folder) => {
  try {
    const r = await uploadFolder(folder, (p) => {
      if (win && !win.isDestroyed()) win.webContents.send('upload-progress', p);
    });
    if (r.ok && r.link) {
      // Keep the link with the files, so it survives the toast.
      try { await fs.promises.writeFile(path.join(folder, 'gofile-link.txt'), r.link + '\n', 'utf8'); } catch {}
      const s = currentSession && currentSession();
      if (s) { s.uploadLink = r.link; saveSessions(); }
    }
    return r;
  } catch (e) { return { ok: false, error: e.message }; }
});

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
  const title = [String(company || '').trim(), String(position || '').trim()].filter(Boolean).join(' · ') || dateStr;
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
// heard: the transcript lines the answer replied to. Kept in the history the
// model sees (not in the saved session) when nothing was typed, so a later
// answer knows which question each earlier answer was for.
function recordTurn(user, assistant, mode, images, heard) {
  const a = String(assistant || '').replace(/<sticky>[\s\S]*?<\/sticky>/gi, '').trim();
  const u = String(user || '').trim();
  if (!a) return;
  const h = clipMeetingTranscript(heard);
  convoHistory.push({ user: u || (h ? 'They said:\n' + h : ''), assistant: a, mode: mode || 'ANSWER' });

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
// `self` is kept for saves made by an older build and is no longer sent.
// `id` names the bubble the update belongs to. With named speakers and the
// user's own bubble, several bubbles are open at once, so "the last unsealed
// turn" is no longer enough to tell which one is growing.
// `lines` is the bubble line by line ([{who,text,self?}]); `text` is the same
// joined as "Name : words" per line, for anything that only reads text.
function recordMeetTurn(who, text, sealed, self, id, lines) {
  who = String(who || 'Interviewer').trim() || 'Interviewer';
  text = String(text || '').trim();
  id = String(id || '');
  const s = ensureSession();
  if (!s.turns) s.turns = [];
  let at = -1;
  if (id) {
    for (let i = s.turns.length - 1; i >= Math.max(0, s.turns.length - 40); i--) {
      if (s.turns[i] && s.turns[i].kind === 'meet' && s.turns[i].id === id) { at = i; break; }
    }
  } else {
    const li = s.turns.length - 1;
    if (li >= 0 && s.turns[li].kind === 'meet' && !s.turns[li].sealed) at = li;
  }
  if (!text) {
    if (at >= 0) s.turns.splice(at, 1);
    s.updatedAt = Date.now();
    if (meetSaveTimer) { clearTimeout(meetSaveTimer); meetSaveTimer = null; }
    return saveSessions();
  }
  const lineList = Array.isArray(lines)
    ? lines.map((l) => ({ who: String((l && l.who) || who).trim() || who, text: String((l && l.text) || '').trim(), ...(l && l.self ? { self: true } : {}) })).filter((l) => l.text)
    : null;
  if (at >= 0) {
    const open = s.turns[at];
    open.who = who;
    open.text = text;
    if (lineList) open.lines = lineList;
    if (sealed) open.sealed = true;
  } else {
    const turn = { kind: 'meet', ts: Date.now(), who, text, sealed: !!sealed };
    if (id) turn.id = id;
    if (self) turn.self = true;
    if (lineList) turn.lines = lineList;
    s.turns.push(turn);
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
  return recordMeetTurn(p.who, p.text, !!p.sealed, !!p.self, p.id, p.lines);
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
    .map(s => ({ id: s.id, name: s.name || '(untitled)', createdAt: s.createdAt, updatedAt: s.updatedAt, turnCount: (s.turns || []).length, profile: s.profile || {}, company: s.company || '', position: s.position || '', salary: s.salary || null }))
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
// Resume a saved session from the materials step: keep its id and turns,
// take the (possibly edited) profile, salary and current materials.
ipcMain.handle('session-resume', (_e, { id, profile, salary } = {}) => {
  const s = sessions.find(x => x.id === id);
  if (!s) return null;
  const p = profile || s.profile || {};
  s.profile = { name: p.name || '', city: p.city || '', country: p.country || '', timezone: p.timezone || '' };
  s.salary = salary && Number(salary.amount) > 0
    ? { amount: Number(salary.amount), currency: String(salary.currency || 'USD'), period: String(salary.period || 'month') }
    : (s.salary || null);
  s.knowledge = snapshotKnowledge();
  s.updatedAt = Date.now();
  currentSessionId = id;
  convoHistory = (s.turns || [])
    .filter((t) => t && t.kind !== 'meet')
    .map((t) => ({ user: t.q || '', assistant: t.a || '', mode: t.mode || 'ANSWER' }));
  activeProfile = s.profile;
  activeSalary = s.salary;
  state.profile = { ...s.profile };
  saveState();
  saveSessions();
  schedulePromptCacheWarm();
  return { id: s.id, name: s.name, turns: s.turns || [], profile: s.profile };
});
ipcMain.handle('session-delete', (_e, id) => {
  try { const s = sessions.find((x) => x.id === id); if (s && s.folder && fs.existsSync(s.folder)) fs.rmSync(s.folder, { recursive: true, force: true }); } catch {}
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

// pdf.js takes DOMMatrix, ImageData and Path2D from the native @napi-rs/canvas
// module and stops with "DOMMatrix is not defined" when that module cannot be
// loaded: its binary is per platform and CPU, and a build does not always
// carry the one for the machine it runs on (the universal macOS build has the
// Apple Silicon one only, so it is missing on an Intel Mac). Those classes are
// for drawing pages. Reading the text only needs them to exist (bitmap Type 3
// fonts call scaleSelf/translateSelf, and the result is used for drawing
// alone), so plain stand-ins are enough. They are set before pdf.js loads, so
// pdf.js uses them on every platform, also where the native module is there.
function ensurePdfGlobals() {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const m = Array.isArray(init) && init.length === 6 ? init : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = m;
      }
      translateSelf(tx = 0, ty = 0) { this.e += this.a * tx + this.c * ty; this.f += this.b * tx + this.d * ty; return this; }
      scaleSelf(sx = 1, sy = sx) { this.a *= sx; this.b *= sx; this.c *= sy; this.d *= sy; return this; }
      translate(tx, ty) { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).translateSelf(tx, ty); }
      scale(sx, sy) { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).scaleSelf(sx, sy); }
      // Only reached when drawing a page, which this app never does.
      multiplySelf() { return this; }
      preMultiplySelf() { return this; }
      invertSelf() { return this; }
    };
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      constructor(a, b, c) {
        if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
        else { this.data = a; this.width = b; this.height = c || (a.length / 4 / b); }
      }
    };
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = class Path2D {
      addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} rect() {} arc() {} ellipse() {} closePath() {}
    };
  }
}

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
    // officeparser picks the reader from the file's content, not its name
    // (a PDF saved as .docx is read as a PDF), and never answers when pdf.js
    // itself fails to load: the upload then waits for ever with nothing on
    // screen. So the globals are set for every office file, and for a PDF
    // pdf.js is loaded here first, where a failure reaches the caller.
    ensurePdfGlobals();
    if (ext === 'pdf' || buf.subarray(0, 4).toString('latin1') === '%PDF') {
      await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
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

  // In a team meeting the support notes and earlier meetings are the work
  // context (tickets, PRs, numbers, owners), so they matter even when compact.
  const team = getMeetingConfig().kind === 'team';
  const blocks = [
    { title: 'CANDIDATE PROFILE', text: profileParts.join('\n'), weight: 0 },
    { title: team ? 'RESUME / CV' : 'CANDIDATE RESUME / CV', text: join(k.cv), weight: team ? 1 : 3 },
    { title: 'JOB DESCRIPTION', text: join(k.jd), weight: team ? 1 : 2 },
    { title: team ? 'WORK CONTEXT (tickets, PRs, numbers, blockers, owners)' : 'SUPPORT / KNOWLEDGE BASE', text: join(k.support), weight: 3 },
    { title: 'PREVIOUS MEETING RECORDS', text: join(k.meetings), weight: team ? 2 : (compact ? 0 : 1) },
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
  if (profileParts.length) parts.push((team ? 'YOUR PROFILE' : 'CANDIDATE PROFILE') + ' (this person is YOU):\n' + profileParts.join('\n'));
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
  // Keep the original bytes on disk so the session bundle can save the file as
  // uploaded (e.g. the CV as a .pdf), not just its extracted text.
  try {
    const dir = path.join(app.getPath('userData'), 'materials');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'file').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'file';
    const dest = path.join(dir, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe);
    fs.writeFileSync(dest, Buffer.from(data));
    item.file = dest;
  } catch (e) { appendLogLine('[kb] keep-original failed for ' + name + ': ' + e.message); }
  // CV and JD are single-document; support/meetings accumulate.
  if (kind === 'cv' || kind === 'jd') state.knowledge[kind] = [item];
  else state.knowledge[kind].push(item);
  saveState();
  schedulePromptCacheWarm();
  return { ok: true, name, chars: text.length };
});

ipcMain.handle('kb-remove', (_e, { kind, index }) => {
  if (state.knowledge[kind]) {
    const it = state.knowledge[kind][index];
    if (it && it.file) { try { fs.unlinkSync(it.file); } catch {} }
    state.knowledge[kind].splice(index, 1);
  }
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

// Per-type guidance, chosen on the "Meeting type" step of the wizard or the
// drop-down during the call. Each block is the logic of that kind of meeting:
// what usually happens in it and how each kind of turn is answered.
const MEETING_GUIDANCE = {
  // ── Hiring interviews ──
  recruiter_screen: `TYPE: RECRUITER / HR SCREEN (also agency screens and intro calls). The usual flow: the recruiter introduces the company, asks you to introduce yourself, asks a few experience questions, then logistics (location, contract, availability, salary, remote), next steps, and "any questions for me?". The other person is usually not an engineer: plain everyday words, no jargon unless they use it first.
- "Tell me about yourself": name, title, years of experience. Your stack by layer (frontend, backend, database, cloud and infra, CI/CD, testing). What you enjoy most. Your most recent role and one responsibility there (leading, mentoring, architecture). One line on why this role fits. Close with "That's my brief introduction." About 120 to 180 words.
- Achievement question: one project, what you built, and the impact with a number (time saved, percent faster, cost cut). If they ask whether it was measured, be honest: say it's an estimate and how you noticed it.
- "Why us?": three reasons, in this order: the mission, the technical challenge, and how it matches your past work.
- Logistics: short and direct. Location, work type, availability, notice period. Salary: give the profile salary only if there is one, otherwise ask what their budget range is.
- When they talk about the company: react briefly and positively, and mention one specific thing they said.
- When they invite your questions: ask one or two of these: team structure and size, the daily or weekly routine, the next stages of the process, the length of the engagement (for contract roles).`,

  technical_interview: `TYPE: TECHNICAL INTERVIEW (an engineer or hiring manager asks technical questions). The usual flow: a definition question, then "have you used it?", then a deeper follow-up, then a scenario change ("now cost doesn't matter", "now it's a scanned PDF"), then an incident or debugging scenario. Show seniority through substance, not buzzwords.
- Concept question: a one-sentence definition, then how it differs from the related concept, then a real use case from your work. 3 to 6 sentences.
- "Have you used X?": yes or no first, then where, what for, and one lesson learned (like "the real bottleneck was retrieval quality, not generation").
- Scenario change: restate the new constraint in a few words, then say what you'd change and why. Name concrete tools, models and services.
- Debugging or production incident: gather context first (logs, recent deploys, what changed), then isolate, then a quick fix or rollback, then a root-cause write-up, then a runbook or alert so it doesn't happen again.
- Trade-offs: when you choose something, always mention cost, latency, accuracy or maintainability.
- If you don't know something, say what you do know that's close and how you'd find out. Don't bluff.`,

  live_coding: `TYPE: LIVE CODING / SYSTEM DESIGN ON A WHITEBOARD. The usual flow: the interviewer shares a task link, you may take a minute, then you walk through the diagram or code while they interrupt with "what does this module do?" or "are you using an external source?". The task is whatever they described in the transcript or what was typed in the box.
- Before starting: repeat the task in one sentence, ask one or two clarifying questions (scale, inputs, constraints), then state your plan in 3 steps.
- While working: narrate briefly, one step at a time ("First I'll add the orchestrator that takes the company name...").
- When they ask "what does this do?": answer about that component only, in 2 or 3 sentences: its input, what it does, its output. Never postpone with "I'll explain later".
- Design: data sources, then processing or agents, then storage, then output. Then reliability (retries, validation, rate limits) and cost.
- Code: say the approach and the complexity, handle edge cases out loud, and suggest a test.
- If they ask whether you're using outside help, answer plainly and briefly.`,

  leader_round: `TYPE: CTO / CEO / FOUNDER ROUND. The usual flow: the leader talks a lot about the company, its structure and the product; then asks what your typical day looks like, how you work with product people, how you'd handle systems you don't know yet. They are checking ownership and communication. Think like a partner, not an employee.
- While they talk about the company: short, specific reactions that show you understood ("So the team is flat and engineers talk to product directly. That's how I like to work.").
- "Typical day" or "how did your team work": describe the rhythm (daily standup, Monday planning, Friday review and retro, Slack updates, the ticketing tool) and your role in it.
- Ownership questions: show you take decisions end to end, talk directly to product and business people, and raise blockers early.
- Business sense: tie technical choices to customers, cost or speed of delivery.
- When they invite your questions: product direction, what success looks like in the first 3 months, team growth, and for startups funding or runway.`,

  ai_interview: `TYPE: AI INTERVIEW (an automated AI interviewer or screening bot asks the questions, often one after another, and scores the answers). It can't read tone, so the content does all the work.
- Structure every answer so it is easy to score: the direct answer first, then one concrete example (situation, what you did, the result with a number when the knowledge base has one), then one line on why it matters for this role. About 60 to 120 words; a yes/no or factual question gets 1 or 2 sentences.
- Use the job description's own words for skills and tools where they match your experience, so keyword scoring picks them up.
- No small talk and no questions back. If the bot asks whether you have questions, ask one short one about the team or the next step.
- A skill, tool or topic not in the knowledge base: answer from general engineering knowledge, accurate and confident (what it is, how it works, when to use it, common pitfalls, how you'd approach it), then bridge to the closest real experience in the knowledge base. Before writing, check: does the knowledge base show you using this exact tool? If not, never say you used, built, wrote, ran or deployed it. Open with the knowledge instead ("Operators extend Kubernetes so...", "The way I'd approach it is...") or say it plainly in one short clause ("I haven't run it in production, but..."), then the bridge ("the closest thing I've built is..."). Don't claim a job, project or number that isn't there.
- Behavioral questions: one real story from the knowledge base, in situation, action, result order.`,

  // ── Team meetings ──
  standup: `TYPE: ENGINEERING STANDUP / DAILY STATUS UPDATE. The chair calls names in turn, each person gives an update, then short follow-ups.
- Your update when called (about 80 to 180 words): open with "Okay. So for me..." or "Yes, so yesterday...". Then per ticket, most important first: ticket ID, what was done (merged, PR opened, deployed to dev, staging or main, dry run), the key number (rows processed, matched vs unmatched, cost), and any gap or bug you found and what you did about it. Then what you're waiting on: whose review or which decision, by name. Then which ticket you move to next. Close with "That's all for me."
- "Are you blocked?": yes or no, what exactly, and what you'll work on in the meantime.
- "Did you tell X what they need?": "Yes, I sent the runbook and they'll run it." or say when you will.
- Asked to hand something to someone else: agree, and thank them for the pointer.
- You need something from a teammate: name the ticket, what you need, and offer to send the exact steps.`,

  one_on_one: `TYPE: 1:1 WITH YOUR MANAGER. Two people from the same team, usually looking at results on screen.
- Greeting: warm and short ("I'm fine, thanks. Good afternoon.").
- "Where does this number come from?": explain where the data comes from, the root cause (timing gap, failed scheduled run, missing field), and whether data is lost or safe.
- Walking through results on screen: step by step, the input, the top candidate, the decision (auto-apply, create new, manual review), and why.
- Bring one question or decision you need from them (priorities, how to handle a big review backlog, which option to take).
- If you have no clear plan yet, say what you'll look into first.
- Agree on next steps and confirm the follow-up ("Okay, I'll Slack you the steps before production.").
- Asked for feedback on a process (like specs): an honest answer with a reason.`,

  sprint_review: `TYPE: SPRINT REVIEW, THEN RETRO AND PREVIEW.
- Your demo in the review (about 120 to 200 words): status in one line (which environment it runs in, test, staging or prod, and whether it works end to end). What it does as a pipeline: ingest, resolve, create or update, write to the DB. Walk through one or two concrete examples on screen ("Here the name and domain are a strong match, so it's auto-applied. Here two candidates match, so it goes to manual review."). The key numbers (auto-applied vs manual review, rows processed). What's left, and when it goes to production.
- Retro: one thing that went well, giving credit by name, and one thing to improve with a concrete suggestion.
- Preview: what you'll pick up next sprint.
- When someone clarifies something: thank them and say how it changes your work.`,

  sprint_planning: `TYPE: SPRINT PLANNING (plus the prod deploy plan).
- Weekend round: one or two friendly sentences about your weekend, then pass it on (don't ask back). If you missed the question, ask what the round is about.
- Your priorities (about 60 to 150 words): the primary task first, then the secondary one. For each, the order of steps (address PR comments, test locally against real data, request review, merge to development, staging, production dry run, import) and a realistic ETA ("by Wednesday").
- Terminology questions ("do you mean the DB migration or the full job?"): say exactly which one, and where the code is right now (branch, PR, merged).
- Commitments: say when you'll request review or push ("I'll request the review right after this meeting.").`,

  design_review: `TYPE: DESIGN / TECHNICAL REVIEW (architecture sessions, algorithm reviews, adapter reviews). One topic debated in depth. This is a discussion, not a presentation: keep each turn under 100 words.
- "Do you agree?": agree or disagree first, then the reason in 1 to 3 sentences (cost, consistency, keeping labeled data, fewer moving parts).
- Proposals: describe them as components and configuration (for example a shared flow with a per-caller policy: allowed granularity, distance and ambiguity thresholds, and a fallback when nothing is safe).
- Data and ML choices: favor approaches that keep labeled data for later model training. Mention defaults for missing values and how they get replaced later.
- If you haven't tested with real or full data yet, say so plainly and say when you will.`,

  stakeholder_update: `TYPE: WIDER TEAM / STAKEHOLDER UPDATE (weekly client update, product check-in). The audience includes non-engineers: less jargon than in the engineering standup, and no lists of ticket numbers.
- Taking your turn: "Okay, I'll go next."
- Your update (about 100 to 180 words): lead with the main problem or result of the week and its metric ("about 90 percent of rows were going to manual review, which isn't sustainable"). Then in plain words what you tried, what worked and what didn't. Then what's next and what you need from anyone.
- Product check-in with the manager: show where to see the results on the platform, say whether a run was a dry run (no effect on the DB), give the headline numbers, and say when the PR will be ready for deploy.`,
};

// Shared by every meeting type.
const ANSWER_SOURCES = `HOW TO BUILD THE ANSWER — use three sources, in this order:
1. What they just asked or said (the last transcript lines), including what they are really checking.
2. Your own earlier answers in this call (the conversation above). Stay consistent with them: same projects, numbers, names, dates and opinions. Don't retell a story you already told; refer back to it in a few words ("like the migration I mentioned") or pick another example. If they follow up on something you said, continue from it.
3. The knowledge base: CV, job description, support notes, earlier meeting records. Pick the facts that answer this question, and where it's natural, link them to what the job description asks for.
Your personal history (employers, projects, numbers, years, tools you used at work) comes only from the knowledge base or from what you already said in this call. General questions don't need the knowledge base: a concept, how a tool works, how you'd design, debug or test something, best practices, and simple small talk or logistics. Answer those directly from solid engineering knowledge, correct and confident, and tie in your own experience when the knowledge base has a fitting example.`;
const TURN_RULES = `TURN RULES:
- Output only the words you say out loud. Never start with your own name or a speaker tag like "Name:"; the transcript tags are for reading, not for your answer.
- Start with a short acknowledgement when it's natural ("Okay.", "Yeah, that makes sense.", "Good question.").
- Use concrete details from the knowledge base: ticket IDs, PR numbers, row counts, percentages, costs, environments (local, dev, staging, prod), people's names. Never invent facts that contradict it. If a detail is missing, stay general rather than making up a number.
- Match the length to the moment. Greeting, small talk or a confirmation: 1 or 2 sentences. A direct follow-up question: 2 to 4 sentences, the answer first, then one supporting detail. Your turn to give an update or answer an open question: the length and structure given for this meeting type.
- If the question was unclear or the audio dropped, ask them to repeat in one short sentence.
- End a full turn with a clear hand-off that fits the moment ("That's all from me.", "That's my brief introduction.").`;
const QUESTION_POLICY = `QUESTIONS BACK — the default is NO question at the end of an answer: finish on the answer itself. Ask something only when (a) their question is ambiguous or missing a detail you truly need to answer it well — then ask one short clarifying question, (b) they explicitly invite your questions or the meeting rules above call for one, or (c) the knowledge base has no information and you must ask rather than invent. Never add a question just to seem engaged, and never end more than one answer in a row with a question.`;

function meetingStanceBlock() {
  const { kind, type } = getMeetingConfig();
  const tags = `Transcript lines are tagged with who spoke: Interviewer, or the speaker's own name when the app can read it off the meeting screen. Every tag that is not your name is someone else. The setup profile name is you.`;
  if (kind === 'team') {
    const who = `${whoAmILine()} This is a meeting at your current job, with your team. ${tags} Several people may speak; the chair usually calls names in turn. Your knowledge base (CV, support notes, previous meeting records) is your work context: current tickets and their status, open PRs, recent numbers, blockers, who owns what. Missing files are fine; then stay general and never invent tickets or numbers.`;
    const between = `Between your turns, reactions are tiny: "Morning.", "Thanks.", "Yeah, I can hear you clearly." When your name is called, give your turn in full.`;
    return `MEETING STANCE — TEAM MEETING: ${who}\n${between}\n${MEETING_GUIDANCE[type]}\n${ANSWER_SOURCES}\n${TURN_RULES}\n${QUESTION_POLICY} If someone states an opinion, do not auto-agree. One spoken turn only.`;
  }
  const who = `${whoAmILine()} This is a hiring call. ${tags} Your knowledge base is whatever was uploaded (CV and/or JD and/or support). Missing files are fine. You are the candidate, not a helper who follows their lead.`;
  return `MEETING STANCE — HIRING INTERVIEW: ${who}\n${MEETING_GUIDANCE[type]}\n${ANSWER_SOURCES}\n${TURN_RULES}\n${QUESTION_POLICY} If they state an opinion, do not auto-agree. Never invent experience. One spoken turn only.`;
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
  const team = getMeetingConfig().kind === 'team';
  const lines = String(mt || '').split(/\n/).map((l) => l.trim()).filter(Boolean).slice(team ? -8 : -4);
  const cap = team ? 1500 : 800;
  let s = lines.join('\n');
  if (s.length > cap) s = s.slice(-cap);
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
    parts.push('You typed this question in the input box. Answer it from the knowledge base, following the rules for this meeting type. Use the meeting transcript only if it helps.\n\n' + ask);
  } else {
    parts.push('Nothing was typed. See the last transcript lines: each is tagged with who said it. Respond as yourself to what was said last, following the rules for this meeting type (no speaker tag in front): answer the question they asked, or react briefly and naturally to their statement. If several people spoke, address what they said together, the most recent first. Always respond; never stay silent and never answer with a placeholder.');
  }
  return parts.join('\n\n');
}

function buildAnswerMessages(q, imgs, mode, transcript) {
  const messages = [];
  const staticText = assembleStaticSystem(mode);
  if (staticText) messages.push({ role: 'system', content: staticText });
  const convoBudget = mode === 'ANSWER' ? 6000 : CONVO_CHAR_BUDGET;
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

// Spoken answers sometimes copy the transcript's "Who:" tag and begin with
// "Daniel: ...". Holds back the first few characters of the stream until it is
// clear whether they are such a tag (the profile name, or a generic one) and
// drops it. flush() hands back whatever is still held when the stream ends.
function makeSpeakerTagStripper(mode) {
  if (mode && mode !== 'ANSWER') return { push: (t) => t, flush: () => '' };
  const name = String((activeProfile && activeProfile.name) || '').trim();
  const tags = new Set(['candidate', 'me', 'you', 'answer', 'response']);
  if (name) { tags.add(name.toLowerCase()); tags.add(name.split(/\s+/)[0].toLowerCase()); }
  let head = '';
  let done = false;
  let trimNext = false; // the tag came off: drop the space that followed it
  return {
    push(piece) {
      if (trimNext) { piece = piece.replace(/^\s+/, ''); if (piece) trimNext = false; }
      if (done) return piece;
      head += piece;
      const m = head.match(/^\s*([A-Za-z][A-Za-z '\-]{0,40}):[ \t]*/);
      if (m) {
        done = true;
        const out = tags.has(m[1].trim().toLowerCase()) ? head.slice(m[0].length) : head;
        trimNext = !out && out !== head;
        head = '';
        return out;
      }
      // Still possibly a tag: letters/spaces only so far, and short.
      if (/^\s*[A-Za-z][A-Za-z '\-]{0,40}$/.test(head) || /^\s*$/.test(head)) return '';
      done = true;
      const out = head; head = '';
      return out;
    },
    flush() { done = true; const out = head; head = ''; return out; },
  };
}

async function generateAnswer(question, images, forcedMode, transcript) {
  // images: array of { base64, mime } or null/undefined
  // forcedMode: 'AUTO'|'CODE'|'DIAGRAM'|'ANSWER' — from the manual mode selector
  const imgs = Array.isArray(images) && images.length ? images : null;
  const q = String(question || '').trim();
  const mt = String(transcript || '').trim();
  if (!q && !imgs && !mt) {
    if (win && !win.isDestroyed()) win.webContents.send('answer-error', 'Nothing to answer yet — wait for the interviewer to speak, or type a question.');
    return;
  }
  const provider = getAnswerProvider();
  const apiKey = getAnswerApiKey(provider.id);
  if (!apiKey) {
    if (win && !win.isDestroyed()) win.webContents.send('answer-error', `No ${provider.label} API key is built into this copy of the app — contact your administrator.`);
    return;
  }
  if (answerAbort) { try { answerAbort.abort(); } catch {} answerAbort = null; }
  const ac = new AbortController();
  answerAbort = ac;
  // A request that never produces a first token would leave the bubble
  // "streaming" forever; give up after 25 s and say so.
  const watchdog = setTimeout(() => { ac._timedOut = true; try { ac.abort(); } catch {} }, 25000);

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
  const tagStrip = makeSpeakerTagStripper(mode);
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
        const piece = tagStrip.push(spokenSanitize(delta, mode));
        if (!piece) return;
        if (firstToken) {
          firstToken = false;
          clearTimeout(watchdog);
          appendLogLine(`[answer] first-token ${Date.now() - t0}ms provider=${provider.id} model=${model}`);
        }
        full += piece;
        if (win && !win.isDestroyed()) win.webContents.send('answer-chunk', piece);
      },
    });
    const rest = tagStrip.flush();
    if (rest) {
      full += rest;
      if (win && !win.isDestroyed()) win.webContents.send('answer-chunk', rest);
    }
  } catch (e) {
    clearTimeout(watchdog);
    if (e.name === 'AbortError' && ac._timedOut && win && !win.isDestroyed()) {
      appendLogLine(`[answer] no response after 25s provider=${provider.id} model=${model}`);
      win.webContents.send('answer-error', `${provider.label} did not respond in 25 s — press ↻ to try again.`);
    } else if (e.name !== 'AbortError' && win && !win.isDestroyed()) {
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
  clearTimeout(watchdog);
  answerAbort = null;
  if (full.trim()) {
    sessionLog.push({ ts: Date.now(), kind: 'question', text: q || `[${(imgs && imgs.length) || 0} image${imgs && imgs.length > 1 ? 's' : ''}]` });
    sessionLog.push({ ts: Date.now(), kind: 'answer', text: full.trim() });
    recordTurn(q, full, mode, imgs, mt);
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
  const tagStrip = makeSpeakerTagStripper(specMode);
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
        const piece = tagStrip.push(spokenSanitize(delta, specMode));
        if (!piece) return;
        speculativeBuffer += piece;
        ac._buffer = speculativeBuffer;
        if (speculativeCommitted && ac._flushed && win && !win.isDestroyed()) {
          win.webContents.send('answer-chunk', piece);
        }
      },
    });
    const rest = tagStrip.flush();
    if (rest) {
      speculativeBuffer += rest;
      ac._buffer = speculativeBuffer;
      if (speculativeCommitted && ac._flushed && win && !win.isDestroyed()) win.webContents.send('answer-chunk', rest);
    }
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
      recordTurn(q, speculativeBuffer, specMode, null, mt);
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
          recordTurn(q, clean, specModeCommit, null, mt);
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
  if (!macAccessibilityOk(true)) {
    if (win) { win.off('focus', onWinFocus); win.off('blur', onWinBlur); }
    ideTypingActive = false; stopCursorTakeover(); notifyTypingState();
    return { ok: false, error: MAC_ACCESSIBILITY_HINT };
  }
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
  stopSignalingServer();
  disconnectSignalingClient();
});
app.on('window-all-closed', () => app.quit());
