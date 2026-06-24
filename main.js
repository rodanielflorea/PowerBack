const {
  app, BrowserWindow, ipcMain, globalShortcut, Menu,
  session, desktopCapturer, dialog, clipboard, screen, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
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
  toggleClickThrough: 'Alt+Q',
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
    captureMic: true,
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
  prompts: [],
  // Uploaded base-knowledge documents (extracted text), per category.
  knowledge: { cv: [], jd: [], support: [], meetings: [] },
  // Grok answer generation: its OWN xAI key (separate from transcription), the
  // model, and which saved prompt (preset) is active.
  answer: { apiKey: '', model: 'grok-4.3', activePromptId: null },
  avoidPhrases: '',   // newline-separated list of banned phrases/patterns
  stickyAnchor: null,
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
  } catch {
    state = {
      ...DEFAULT_STATE,
      transcription: { ...DEFAULT_STATE.transcription },
      capture: { ...DEFAULT_STATE.capture },
      network: { ...DEFAULT_STATE.network },
      answer: { ...DEFAULT_STATE.answer },
      hotkeys: { ...HOTKEY_DEFAULTS },
    };
  }
  seedDefaultPromptsIfNeeded();
}

// Seed starter answer presets (one per meeting type) on first run so the user has
// something to switch between. Runs once; deleting them later won't re-seed.
function seedDefaultPromptsIfNeeded() {
  if (state.promptsSeeded) return;
  if (Array.isArray(state.prompts) && state.prompts.length > 0) { state.promptsSeeded = true; return; }
  state.prompts = [
    { id: 'preset-intro', title: 'Intro / recruiter screen',
      text: 'You are an expert interview coach. Based on what the interviewer just said, write a concise, confident answer (3–5 sentences) the candidate can say aloud in a recruiter/intro screen. Be warm, professional, and specific; no filler, no preamble — just the answer.' },
    { id: 'preset-tech', title: 'Technical interview',
      text: 'You are a senior engineer coaching a candidate in a technical interview. Based on what was asked, give a correct, concise, structured answer the candidate can say aloud: state the approach, the key trade-offs, and complexity where relevant. Prefer clarity over completeness. Output only the answer.' },
    { id: 'preset-ceo', title: 'CEO / executive',
      text: 'You are coaching the candidate in a conversation with a CEO or executive. Answer strategically and concisely, focusing on business impact, vision, and leadership. Speak with confidence and brevity. Output only the answer.' },
    { id: 'preset-team', title: 'Team meeting',
      text: 'You are helping the user contribute in a team meeting. Based on what was just said, suggest a concise, collaborative response or talking point the user can say aloud. Keep it practical and brief. Output only the response.' },
  ];
  if (!state.answer) state.answer = { ...DEFAULT_STATE.answer };
  if (!state.answer.activePromptId) state.answer.activePromptId = 'preset-intro';
  state.promptsSeeded = true;
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
      if (sources[0]) callback({ video: sources[0], audio: 'loopback' });
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
  // Embedded web AI removed — answers come from the Grok API into the in-app
  // Answer panel, so we no longer create the WebContentsView.
  win.once('ready-to-show', () => {
    win.show();
    // Pre-warm the xAI connection so first real request skips TLS handshake.
    setTimeout(() => warmApiConnection().catch(() => {}), 1500);
  });

  win.on('move', () => { saveState(); syncStickyPosition(); });
  win.on('resize', () => { saveState(); syncStickyPosition(); });
  win.on('show', () => applyStickyState());
  win.on('hide', () => applyStickyState());
  win.on('closed', () => {
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
  saveState();
  win.webContents.send('stealth-changed', state.stealth);
}

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
  toggleClickThrough: () => setClickThrough(!state.clickThrough),
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

app.whenReady().then(() => {
  createWindow();
  registerHotkeys();
  setupAutoUpdater();
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
  saveState();
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

function startDeepgramWs(apiKey, language) {
  if (deepgramWs) return;
  const params = new URLSearchParams({
    encoding: 'linear16',
    sample_rate: '16000', channels: '1',
    smart_format: 'true', interim_results: 'true',
    // VAD + utterance-end events for smoother, more natural finalization.
    vad_events: 'true', endpointing: '150', no_delay: 'true', utterance_end_ms: '1500',
  });
  // nova-2 with a known language is the most accurate streaming setup (matches
  // the reference project). Default to English; honor an explicit language pick.
  // We avoid nova-3 'multi' — multilingual mode is noticeably worse for English.
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
      const text = (msg.channel?.alternatives?.[0]?.transcript || '').trim();
      if (!text) return;
      if (msg.is_final) sessionLog.push({ ts: Date.now(), kind: 'voice', text });
      if (win && !win.isDestroyed()) win.webContents.send('transcript-live', { text, isFinal: !!msg.is_final });
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
        const text = (msg.text || '').trim();
        const isFinal = msg.type === 'transcript.done' || !!msg.is_final;
        if (text) {
          if (isFinal) sessionLog.push({ ts: Date.now(), kind: 'voice', text });
          if (win && !win.isDestroyed()) win.webContents.send('transcript-live', { text, isFinal });
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
ipcMain.handle('save-session-log', async () => {
  if (sessionLog.length === 0) return null;
  const lines = sessionLog.map(e => {
    const d = new Date(e.ts);
    const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    return `[${t}] [${e.kind.toUpperCase()}] ${e.text}`;
  }).join('\n');
  const r = await dialog.showSaveDialog(win, {
    title: 'Save session transcript',
    defaultPath: path.join(app.getPath('desktop'), `session-${new Date().toISOString().slice(0,10)}.txt`),
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (!r.canceled && r.filePath) {
    await fs.promises.writeFile(r.filePath, lines, 'utf8');
    sessionLog = [];
    return r.filePath;
  }
  return null;
});

ipcMain.handle('paste-text', (_e, text) => pasteToForeground(text));

// ---------------------------------------------------------------------------
// Grok answer generation. Takes the captured "saying" + the active preset's
// system prompt and streams Grok's reply to the renderer's Answer panel. Uses
// the same xAI key the user pasted for transcription.
// ---------------------------------------------------------------------------
let answerAbort = null;
// Speculative answer state
let speculativeAbort = null;
let speculativeQuestion = null;
let speculativeActive = false;
let speculativeCommitted = false; // true after commit — stream pipes directly to renderer

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

// Concatenate all uploaded knowledge into one context block (uncapped).
function buildKnowledgeContext() {
  const k = state.knowledge || {};
  const join = (arr) => (arr || []).map((i) => i.text).filter(Boolean).join('\n\n');
  const sections = [
    ['CANDIDATE RESUME / CV', join(k.cv)],
    ['JOB DESCRIPTION', join(k.jd)],
    ['SUPPORTING MATERIAL', join(k.support)],
    ['PREVIOUS MEETING RECORDS', join(k.meetings)],
  ];
  return sections
    .filter(([, body]) => body)
    .map(([title, body]) => `${title}:\n${body}`)
    .join('\n\n----\n\n');
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
  return { ok: true, name, chars: text.length };
});

ipcMain.handle('kb-remove', (_e, { kind, index }) => {
  if (state.knowledge[kind]) state.knowledge[kind].splice(index, 1);
  saveState();
  return { ok: true };
});

ipcMain.handle('kb-get', () => {
  const out = {};
  for (const k of KB_KINDS) {
    out[k] = (state.knowledge[k] || []).map((i) => ({ name: i.name, chars: i.chars || (i.text ? i.text.length : 0) }));
  }
  return out;
});

function friendlyAnswerError(status) {
  switch (status) {
    case 400: return 'xAI rejected the answer request (400). Check the model in Settings → Prompts.';
    case 401:
    case 403: return `xAI rejected your answer key (${status}). Set/verify the xAI key in Settings → Prompts → Answer generation (needs API credits).`;
    case 429: return 'xAI rate limit / out of credits (429). Try again shortly.';
    default:  return `xAI answer request failed (${status || 'unknown'}).`;
  }
}

function activePromptText() {
  const id = state.answer && state.answer.activePromptId;
  const p = (state.prompts || []).find((q) => q.id === id);
  return p ? p.text : '';
}

// ── Question classifier ───────────────────────────────────────────────────────
// Fast non-streaming call that returns 'DIAGRAM', 'CODE', or 'ANSWER'.
// Called in parallel with the main stream; result shapes system messages.
async function classifyQuestion(q, imgs, apiKey, model) {
  try {
    const msgs = [{
      role: 'system',
      content: `You are a strict question classifier for a live coding interview assistant. Reply with exactly ONE word — no punctuation, no explanation.

DECISION RULE — apply the FIRST matching rule:

1. If the question contains write/implement/code/program/build/create/solve/make/develop AND asks for a function/algorithm/class/script → CODE (even for sorting, searching, graph, DP, or any data-structure algorithm).
2. If the question explicitly asks to DRAW, SKETCH, VISUALIZE, or SHOW A DIAGRAM of a system → DIAGRAM.
3. Everything else → ANSWER.

CRITICAL: "implement quicksort", "write merge sort", "code a BFS", "build an LRU cache", "solve two-sum" → always CODE. Never DIAGRAM for algorithm implementation.
CRITICAL: Only DIAGRAM when the user wants a visual picture, not working code.

Examples:
"write a quicksort" → CODE
"implement merge sort in Python" → CODE
"code a binary search tree" → CODE
"draw the architecture of a REST API" → DIAGRAM
"show a sequence diagram for OAuth" → DIAGRAM
"design a URL shortener" → ANSWER
"what is your experience with React" → ANSWER
"explain TCP vs UDP" → ANSWER
"what is a deadlock" → ANSWER

Reply with only one of: DIAGRAM, CODE, ANSWER`,
    }];
    if (imgs && imgs.length) {
      const content = [];
      if (q) content.push({ type: 'text', text: q });
      imgs.forEach(({ base64, mime }) =>
        content.push({ type: 'image_url', image_url: { url: `data:${mime || 'image/png'};base64,${base64}` } })
      );
      msgs.push({ role: 'user', content });
    } else {
      msgs.push({ role: 'user', content: q });
    }
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: msgs, max_tokens: 5, stream: false }),
    });
    if (!res.ok) return 'ANSWER';
    const data = await res.json();
    const word = ((data.choices?.[0]?.message?.content) || '').trim().toUpperCase().split(/\W/)[0];
    return ['DIAGRAM', 'CODE'].includes(word) ? word : 'ANSWER';
  } catch { return 'ANSWER'; }
}

async function generateAnswer(question, images, forcedMode) {
  // images: array of { base64, mime } or null/undefined
  // forcedMode: 'AUTO'|'CODE'|'DIAGRAM'|'ANSWER' — from the manual mode selector
  const imgs = Array.isArray(images) && images.length ? images : null;
  const q = String(question || '').trim();
  if (!q && !imgs) return;
  // Use the dedicated answer key; fall back to the transcription xAI key so users
  // who use xAI for both don't have to paste it twice.
  const apiKey = (
    ((state.answer && state.answer.apiKey) || '').trim() ||
    ((state.transcription && state.transcription.xaiApiKey) || '').trim()
  );
  if (!apiKey) {
    if (win && !win.isDestroyed()) win.webContents.send('answer-error', 'No xAI answer key set (Settings → Prompts → Answer generation).');
    return;
  }
  if (answerAbort) { try { answerAbort.abort(); } catch {} answerAbort = null; }
  const ac = new AbortController();
  answerAbort = ac;

  const model = (state.answer && state.answer.model) || 'grok-4.3';
  // If user picked a mode manually, skip the classifier entirely.
  const mode = (forcedMode && forcedMode !== 'AUTO')
    ? forcedMode
    : await Promise.race([
        classifyQuestion(q, imgs, apiKey, model),
        new Promise(r => setTimeout(() => r('ANSWER'), 300)),
      ]);

  const messages = [];
  const sys = activePromptText();

  // ── 1. Knowledge base — factual grounding only, no style influence ──────
  const kb = buildKnowledgeContext();
  if (kb) messages.push({
    role: 'system',
    content: 'REFERENCE MATERIAL (facts only — do NOT copy its tone, phrasing, or style into your answer):\n\n' + kb,
  });

  // ── 2. Technical rendering rules (diagram + sticky) — CODE/DIAGRAM only ──
  if (mode !== 'ANSWER') {
    messages.push({
      role: 'system',
      content: 'When the user asks for a diagram, chart, flowchart, sequence diagram, or any visual structure, output it as a Mermaid code block (```mermaid ... ```) so it can be rendered graphically. Rules for valid Mermaid: (1) No HTML tags inside node labels — plain text only. (2) Use only rectangle brackets [text] for node shapes — do NOT use [/text] or [/text/] trapezoid syntax. (3) No "color:" in style directives. (4) Keep node IDs simple alphanumeric. (5) Do NOT use ASCII art.',
    });
    messages.push({
      role: 'system',
      content: 'Whenever your answer contains a diagram (Mermaid block) or a code block, append a presenter talking-script at the very end of your response using exactly this format:\n<sticky>\nOVERVIEW\n[One sentence: what this diagram/code shows and why it matters.]\n\nWALKTHROUGH\n[Narrate each major step, node, or code section as if explaining to someone who cannot see the screen. Write in full sentences. Cover every significant part. Aim for 60-90 seconds of speaking.]\n\nKEY INSIGHT\n[One sentence: the single most important takeaway or design decision.]\n</sticky>\nUse plain text only inside the sticky tags — no markdown, no asterisks, no bullet points.',
    });
  }

  // ── 3. Banned phrases ────────────────────────────────────────────────────
  const avoidRaw = (state.avoidPhrases || '').trim();
  if (avoidRaw) {
    const list = avoidRaw.split('\n').map(l => l.trim()).filter(Boolean);
    if (list.length) {
      messages.push({
        role: 'system',
        content: `BANNED PHRASES — never output these or close paraphrases of them:\n${list.map(p => `• "${p}"`).join('\n')}`,
      });
    }
  }

  // ── 4. Mode-specific output directive (from classifier) ─────────────────
  if (mode === 'DIAGRAM') {
    messages.push({
      role: 'system',
      content: 'OUTPUT FORMAT — DIAGRAM MODE: Your VERY FIRST characters must be ```mermaid — no introduction, no "Sure!", no "Here is...", no preamble whatsoever. Start the mermaid block immediately. Make it detailed and complete. After the closing ``` you may add a short 2-3 sentence explanation.',
    });
  } else if (mode === 'CODE') {
    messages.push({
      role: 'system',
      content: 'OUTPUT FORMAT — LIVE CODING MODE: Your VERY FIRST characters must be ``` opening a code block — no introduction, no "Sure!", no "Here is...", no self-description, no preamble of any kind. Write clean, complete, runnable code. After the closing ``` you may add a brief explanation only.',
    });
  }

  // ── 5. User's selected prompt — LAST, highest weight ────────────────────
  if (sys) messages.push({
    role: 'system',
    content: `PRIMARY DIRECTIVE — this overrides all previous instructions for style, tone, persona, and format. Follow it exactly and completely:\n\n${sys}`,
  });

  // Build user message — text only, or text + one/many images for vision models.
  if (imgs) {
    const userContent = [];
    if (q) userContent.push({ type: 'text', text: q });
    imgs.forEach(({ base64, mime }) => {
      userContent.push({ type: 'image_url', image_url: { url: `data:${mime || 'image/png'};base64,${base64}` } });
    });
    messages.push({ role: 'user', content: userContent });
  } else {
    messages.push({ role: 'user', content: q });
  }

  const displayQ = q || (imgs ? `[${imgs.length} image${imgs.length > 1 ? 's' : ''}]` : '');
  if (win && !win.isDestroyed()) win.webContents.send('answer-start', { question: displayQ, hasImage: !!imgs, mode });

  let res;
  try {
    res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: ac.signal,
    });
  } catch (e) {
    if (e.name !== 'AbortError' && win && !win.isDestroyed())
      win.webContents.send('answer-error', 'xAI request failed: ' + e.message);
    answerAbort = null;
    return;
  }
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch {}
    appendLogLine(`[grok] ${res.status}: ${body.slice(0, 200)}`);
    if (win && !win.isDestroyed())
      win.webContents.send('answer-error', friendlyAnswerError(res.status));
    answerAbort = null;
    return;
  }

  let full = '';
  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            if (win && !win.isDestroyed()) win.webContents.send('answer-chunk', delta);
          }
        } catch {}
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError' && win && !win.isDestroyed())
      win.webContents.send('answer-error', 'Stream error: ' + e.message);
    answerAbort = null;
    return;
  }
  answerAbort = null;
  if (full.trim()) sessionLog.push({ ts: Date.now(), kind: 'answer', text: full.trim() });
  if (win && !win.isDestroyed()) win.webContents.send('answer-done', { text: full });
}

ipcMain.handle('generate-answer', (_e, { question, images, forcedMode } = {}) => {
  generateAnswer(question, images, forcedMode);
});

// ── Warm-up: pre-establish the TLS connection to api.x.ai so the first real
// request skips the ~300-600 ms handshake cost.
async function warmApiConnection() {
  const apiKey = (
    ((state.answer && state.answer.apiKey) || '').trim() ||
    ((state.transcription && state.transcription.xaiApiKey) || '').trim()
  );
  if (!apiKey) return;
  try {
    const ac = new AbortController();
    setTimeout(() => { try { ac.abort(); } catch {} }, 4000);
    await fetch('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ac.signal,
    });
  } catch {}
}
ipcMain.handle('warm-api-connection', () => warmApiConnection());

// ── Speculative answer: start streaming before the user hits send.
// Shares the same message-building logic as generateAnswer but is abortable.
async function startSpeculative(question, forcedMode) {
  if (speculativeAbort) { try { speculativeAbort.abort(); } catch {} speculativeAbort = null; }
  speculativeActive = false;
  const q = (question || '').trim();
  if (!q) return;
  const apiKey = (
    ((state.answer && state.answer.apiKey) || '').trim() ||
    ((state.transcription && state.transcription.xaiApiKey) || '').trim()
  );
  if (!apiKey) return;

  speculativeQuestion = q;
  speculativeActive = true;
  const ac = new AbortController();
  speculativeAbort = ac;

  const model = (state.answer && state.answer.model) || 'grok-4.3';

  // Use forced mode if set, otherwise classify with 300ms race
  const specMode = (forcedMode && forcedMode !== 'AUTO')
    ? forcedMode
    : await Promise.race([
        classifyQuestion(q, null, apiKey, model),
        new Promise(r => setTimeout(() => r('ANSWER'), 300)),
      ]);
  ac._mode = specMode; // stash so commitSpeculative can read it

  const messages = [];
  const sys = activePromptText();
  const kb2 = buildKnowledgeContext();
  if (kb2) messages.push({ role: 'system', content: 'REFERENCE MATERIAL (facts only — do NOT copy its tone, phrasing, or style into your answer):\n\n' + kb2 });
  if (specMode !== 'ANSWER') {
    messages.push({ role: 'system', content: 'When the user asks for a diagram, chart, flowchart, sequence diagram, or any visual structure, output it as a Mermaid code block (```mermaid ... ```) so it can be rendered graphically. Rules for valid Mermaid: (1) No HTML tags inside node labels — plain text only. (2) Use only rectangle brackets [text] for node shapes — do NOT use [/text] or [/text/] trapezoid syntax. (3) No "color:" in style directives. (4) Keep node IDs simple alphanumeric. (5) Do NOT use ASCII art.' });
    messages.push({ role: 'system', content: 'Whenever your answer contains a diagram (Mermaid block) or a code block, append a presenter talking-script at the very end of your response using exactly this format:\n<sticky>\nOVERVIEW\n[One sentence: what this diagram/code shows and why it matters.]\n\nWALKTHROUGH\n[Narrate each major step, node, or code section as if explaining to someone who cannot see the screen. Write in full sentences. Cover every significant part. Aim for 60-90 seconds of speaking.]\n\nKEY INSIGHT\n[One sentence: the single most important takeaway or design decision.]\n</sticky>\nUse plain text only inside the sticky tags — no markdown, no asterisks, no bullet points.' });
  }
  const avoidRaw2 = (state.avoidPhrases || '').trim();
  if (avoidRaw2) {
    const list2 = avoidRaw2.split('\n').map(l => l.trim()).filter(Boolean);
    if (list2.length) messages.push({ role: 'system', content: `BANNED PHRASES — never output these or close paraphrases:\n${list2.map(p => `• "${p}"`).join('\n')}` });
  }
  if (specMode === 'DIAGRAM') {
    messages.push({ role: 'system', content: 'OUTPUT FORMAT — DIAGRAM MODE: Your VERY FIRST characters must be ```mermaid — no introduction, no preamble. Start the mermaid block immediately. After the closing ``` you may add a short 2-3 sentence explanation.' });
  } else if (specMode === 'CODE') {
    messages.push({ role: 'system', content: 'OUTPUT FORMAT — LIVE CODING MODE: Your VERY FIRST characters must be ``` opening a code block — no introduction, no preamble of any kind. Write clean, complete, runnable code. After the closing ``` you may add a brief explanation only.' });
  }
  if (sys) messages.push({ role: 'system', content: `PRIMARY DIRECTIVE — this overrides all previous instructions for style, tone, persona, and format. Follow it exactly and completely:\n\n${sys}` });
  messages.push({ role: 'user', content: q });
  // Do NOT send answer-start yet — we buffer silently and only show the UI
  // when the user actually commits (or the text matches on submit).

  let res;
  try {
    res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: ac.signal,
    });
  } catch (e) {
    if (e.name !== 'AbortError') { speculativeActive = false; speculativeAbort = null; }
    return;
  }
  if (!res.ok) { speculativeActive = false; speculativeAbort = null; return; }

  // Buffer chunks silently until commit; after commit, pipe directly to renderer.
  let speculativeBuffer = '';
  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content || '';
          if (!delta) continue;
          speculativeBuffer += delta;
          // If already committed, stream this chunk live to the renderer
          if (speculativeCommitted && win && !win.isDestroyed()) {
            win.webContents.send('answer-chunk', delta);
          }
        } catch {}
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') { speculativeCommitted = false; return; }
    speculativeCommitted = false; speculativeActive = false; speculativeAbort = null;
    return;
  }

  // Stream finished
  speculativeAbort = null;
  if (speculativeCommitted) {
    // We were already piping — send done signal
    speculativeCommitted = false;
    speculativeActive = false;
    speculativeQuestion = null;
    if (speculativeBuffer.trim()) sessionLog.push({ ts: Date.now(), kind: 'answer', text: speculativeBuffer.trim() });
    if (win && !win.isDestroyed()) win.webContents.send('answer-done', { text: speculativeBuffer });
  } else {
    // Store completed buffer for commitSpeculative to flush
    ac._buffer = speculativeBuffer;
    ac._done = true;
  }
}

function commitSpeculative(question, images) {
  const q = (question || '').trim();
  const hasImages = Array.isArray(images) && images.length > 0;

  if (!hasImages && speculativeQuestion === q) {
    const ac = speculativeAbort; // null if stream already finished naturally
    const buffered = (ac && ac._buffer) || '';
    const streamDone = (ac && ac._done) || !ac;

    if (win && !win.isDestroyed()) {
      const specModeCommit = (ac && ac._mode) || 'ANSWER';
      win.webContents.send('answer-start', { question: q, hasImage: false, mode: specModeCommit });
      if (buffered) win.webContents.send('answer-chunk', buffered);
      if (streamDone) {
        // Stream already finished — flush everything and close
        win.webContents.send('answer-done', { text: buffered });
        if (buffered.trim()) sessionLog.push({ ts: Date.now(), kind: 'answer', text: buffered.trim() });
        speculativeActive = false;
        speculativeQuestion = null;
        speculativeAbort = null;
        speculativeCommitted = false;
      } else {
        // Stream still in flight — set flag so the loop pipes future chunks live
        speculativeCommitted = true;
        // speculativeActive/Question/Abort cleared by the loop when it finishes
      }
    } else {
      // No window — just abort cleanly
      if (ac) { try { ac.abort(); } catch {} }
      speculativeActive = false; speculativeQuestion = null; speculativeAbort = null; speculativeCommitted = false;
    }
    return;
  }

  // Text changed or has images — discard speculation, start fresh
  if (speculativeAbort) { try { speculativeAbort.abort(); } catch {} speculativeAbort = null; }
  speculativeActive = false;
  speculativeQuestion = null;
  speculativeCommitted = false;
  generateAnswer(question, images);
}

ipcMain.handle('speculative-start', (_e, { question, forcedMode }) => startSpeculative(question, forcedMode));
ipcMain.handle('speculative-commit', (_e, { question, images } = {}) => commitSpeculative(question, images));
ipcMain.handle('speculative-cancel', () => {
  if (speculativeAbort) { try { speculativeAbort.abort(); } catch {} speculativeAbort = null; }
  speculativeActive = false;
  speculativeQuestion = null;
  speculativeCommitted = false;
});


ipcMain.handle('stop-answer', () => {
  if (answerAbort) { try { answerAbort.abort(); } catch {} answerAbort = null; }
});
ipcMain.handle('list-xai-models', async () => {
  const apiKey = (
    ((state.answer && state.answer.apiKey) || '').trim() ||
    ((state.transcription && state.transcription.xaiApiKey) || '').trim()
  );
  if (!apiKey) return null;
  try {
    const r = await fetch('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const ids = (data.data || data.models || [])
      .map((m) => (typeof m === 'string' ? m : m.id))
      .filter(Boolean);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
});
ipcMain.handle('get-answer-config', () => ({ ...state.answer }));
ipcMain.handle('set-answer-config', (_e, cfg) => {
  state.answer = { ...state.answer, ...(cfg || {}) };
  saveState();
});

// ---- Avoid-phrases list ----
ipcMain.handle('get-avoid-phrases', () => state.avoidPhrases || '');
ipcMain.handle('set-avoid-phrases', (_e, text) => {
  state.avoidPhrases = String(text || '').trim();
  saveState();
  return true;
});

// ---- Prompt library: saved prompt snippets, persisted in state.json ----
ipcMain.handle('get-prompts', () => (state.prompts || []).slice());
ipcMain.handle('save-prompt', (_e, prompt) => {
  if (!prompt || typeof prompt.text !== 'string' || !prompt.text.trim()) {
    return (state.prompts || []).slice();
  }
  if (!Array.isArray(state.prompts)) state.prompts = [];
  const text = prompt.text;
  const title = (prompt.title || '').trim() || text.trim().split('\n')[0].slice(0, 40) || 'Untitled';
  if (prompt.id) {
    const i = state.prompts.findIndex((p) => p.id === prompt.id);
    if (i >= 0) state.prompts[i] = { id: prompt.id, title, text };
    else state.prompts.push({ id: prompt.id, title, text });
  } else {
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.prompts.push({ id, title, text });
  }
  saveState();
  return state.prompts.slice();
});
ipcMain.handle('delete-prompt', (_e, id) => {
  state.prompts = (state.prompts || []).filter((p) => p.id !== id);
  saveState();
  return state.prompts.slice();
});
ipcMain.handle('copy-text', (_e, text) => {
  try { clipboard.writeText(String(text || '')); return true; } catch { return false; }
});

function showPromptMenu() {
  if (!win) return;
  const list = state.prompts || [];
  const items = list.length === 0
    ? [{ label: 'No saved prompts — add in Settings → Prompts', enabled: false }]
    : list.map((p) => ({
        label: p.title.length > 50 ? p.title.slice(0, 47) + '…' : p.title,
        click: () => { if (win && !win.isDestroyed()) win.webContents.send('insert-prompt-text', p.text); },
      }));
  Menu.buildFromTemplate(items).popup({ window: win });
}
ipcMain.handle('show-prompt-menu', () => showPromptMenu());

async function showModelMenu() {
  if (!win) return;
  const apiKey = (
    ((state.answer && state.answer.apiKey) || '').trim() ||
    ((state.transcription && state.transcription.xaiApiKey) || '').trim()
  );
  const current = (state.answer && state.answer.model) || 'grok-4.3';

  // Try to fetch live model list; fall back to a sensible static list.
  let ids = [];
  if (apiKey) {
    try {
      const r = await fetch('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
      if (r.ok) {
        const data = await r.json();
        ids = (data.data || data.models || []).map(m => typeof m === 'string' ? m : m.id).filter(Boolean);
      }
    } catch {}
  }
  if (!ids.length) ids = ['grok-4.3', 'grok-4.20-0309-non-reasoning', 'grok-4.20-0309-reasoning', 'grok-3', 'grok-3-mini'];
  if (!ids.includes(current)) ids.unshift(current);

  const items = ids.map(id => ({
    label: (id === current ? '• ' : '  ') + id,
    click: () => { if (win && !win.isDestroyed()) win.webContents.send('model-selected', id); },
  }));
  Menu.buildFromTemplate(items).popup({ window: win });
}
ipcMain.handle('show-model-menu', () => showModelMenu());

function importPromptsList(list) {
  if (!Array.isArray(state.prompts)) state.prompts = [];
  let added = 0, skipped = 0;
  for (const p of (Array.isArray(list) ? list : [])) {
    if (!p || typeof p.text !== 'string' || !p.text.trim()) { skipped++; continue; }
    const text = p.text;
    const title = (p.title || '').trim() || text.trim().split('\n')[0].slice(0, 40) || 'Untitled';
    // Skip exact duplicates so re-importing the same file doesn't pile up copies.
    if (state.prompts.some((q) => q.title === title && q.text === text)) { skipped++; continue; }
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.prompts.push({ id, title, text });
    added++;
  }
  saveState();
  return { added, skipped };
}

ipcMain.handle('prompts-export', async () => {
  try {
    const r = await dialog.showSaveDialog(win, {
      title: 'Export prompts',
      defaultPath: path.join(app.getPath('desktop'), `ace-prompts-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    await fs.promises.writeFile(r.filePath, JSON.stringify(state.prompts || [], null, 2), 'utf8');
    return { ok: true, count: (state.prompts || []).length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('prompts-import', async () => {
  try {
    const r = await dialog.showOpenDialog(win, {
      title: 'Import prompts',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
    const raw = await fs.promises.readFile(r.filePaths[0], 'utf8');
    let list;
    try { list = JSON.parse(raw); } catch { return { ok: false, error: 'Not a valid prompts JSON file' }; }
    const { added, skipped } = importPromptsList(list);
    return { ok: true, added, skipped, prompts: (state.prompts || []).slice() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

// ── Write-to-IDE: types code into the foreground window via PowerShell SendKeys ──
// Human-like rhythm:
//   • Type 2-4 word-token runs fast (~1 char / 75-105 ms), then pause 800-1000 ms
//   • At most ONE typo queued per burst (word char only, ~6 % chance)
//   • The typo is NOT corrected immediately; ALL chars typed after it are tracked
//     as a "suffix". At the pause: backspace (suffix.length + 1) to reach the
//     wrong char, type the correct char, retype the suffix — cursor lands exactly
//     where it was, text is correct.
ipcMain.handle('write-to-ide', async (_e, code) => {
  const text = String(code || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text) return { ok: false, error: 'No code provided' };

  const SENDKEY_MAP = {
    '\n': '{ENTER}', '{': '{{}', '}': '{}}',
    '+': '{+}', '^': '{^}', '%': '{%}', '~': '{~}',
    '(': '{(}', ')': '{)}',
  };
  function toToken(ch) { return SENDKEY_MAP[ch] || ch; }

  const ADJ = {
    a:'sq',b:'vgn',c:'xdv',d:'sfe',e:'wrd',f:'dge',g:'fht',h:'gjy',i:'uko',
    j:'hkn',k:'jlm',l:'kop',m:'nk',n:'bmh',o:'ilp',p:'ol',q:'wa',r:'eft',
    s:'adwz',t:'rgy',u:'yhi',v:'bcf',w:'qse',x:'zcs',y:'tuh',z:'xs',
    '0':'9', '1':'2', '2':'13','3':'24','4':'35','5':'46',
    '6':'57','7':'68','8':'79','9':'80',
  };
  function nearbyKey(ch) {
    const adj = ADJ[ch.toLowerCase()];
    return adj ? adj[Math.floor(Math.random() * adj.length)] : null;
  }
  function isWordChar(ch) { return /[a-zA-Z0-9_]/.test(ch); }

  const psLines = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$wsh = New-Object -ComObject WScript.Shell',
  ];
  function emitKey(ch, loMs, hiMs) {
    const t = toToken(ch).replace(/'/g, "''");
    psLines.push(`$wsh.SendKeys('${t}'); Start-Sleep -Milliseconds (Get-Random -Minimum ${loMs} -Maximum ${hiMs})`);
  }
  function emitFixed(ms) {
    psLines.push(`Start-Sleep -Milliseconds ${ms}`);
  }
  function emitBackspace(n) {
    for (let i = 0; i < n; i++)
      psLines.push(`$wsh.SendKeys('{BACKSPACE}'); Start-Sleep -Milliseconds (Get-Random -Minimum 55 -Maximum 105)`);
  }

  const chars = [...text];
  // pendingFix: { correct: char, suffix: char[] } | null
  // suffix = every char typed ON SCREEN after the typo, until the next pause.
  // At flush: backspace (suffix.length + 1) → type correct → retype suffix.
  // Only ONE typo per burst so suffix tracking stays unambiguous.
  let pendingFix = null;
  let tokenCount = 0;
  let inWord = false;
  let burstTarget = Math.random() < 0.5 ? 2 : 4;

  function flushFix() {
    if (!pendingFix) return;
    const { correct, suffix } = pendingFix;
    pendingFix = null;
    // Brief pause — human notices the mistake before reaching for backspace
    emitFixed(80 + Math.floor(Math.random() * 80)); // 80-160 ms
    // Go back: past suffix chars + the 1 wrong char
    emitBackspace(suffix.length + 1);
    // Type the correct char
    emitKey(correct, 55, 95);
    // Retype everything that was after the typo
    for (const sc of suffix) emitKey(sc, 55, 95);
  }

  function doPause() {
    flushFix();
    emitFixed(800 + Math.floor(Math.random() * 200)); // 800-1000 ms
    tokenCount = 0;
    burstTarget = Math.random() < 0.5 ? 2 : 4;
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const wasInWord = inWord;
    inWord = isWordChar(ch);

    // New word-run starts: count it and pause if burst is full
    if (inWord && !wasInWord) {
      tokenCount++;
      if (tokenCount > burstTarget) doPause();
    }

    if (ch === '\n') {
      // Fix any pending typo BEFORE pressing Enter — backspace cannot cross lines
      // safely; if we fix after Enter the cursor is on the wrong line.
      flushFix();
      emitKey(ch, 10, 30);
      // Thinking pause after newline (no second flushFix needed)
      emitFixed(800 + Math.floor(Math.random() * 200));
      tokenCount = 0;
      burstTarget = Math.random() < 0.5 ? 2 : 4;
      continue;
    }

    if (!isWordChar(ch)) {
      // Punctuation / space — medium speed, never typo'd
      const lo = ch === ' ' ? 60 : 50;
      const hi = ch === ' ' ? 130 : 110;
      emitKey(ch, lo, hi);
      // Still counts toward suffix if a fix is pending
      if (pendingFix) pendingFix.suffix.push(ch);
      continue;
    }

    // Word char — ~1.5 % typo rate, one queued fix per burst max
    const wrong = (!pendingFix && Math.random() < 0.015) ? nearbyKey(ch) : null;
    if (wrong) {
      emitKey(wrong, 65, 105); // type the wrong char
      pendingFix = { correct: ch, suffix: [] }; // queue the fix; suffix starts empty
    } else {
      emitKey(ch, 65, 105);
      if (pendingFix) pendingFix.suffix.push(ch); // track chars typed after typo
    }
  }

  // End of code — flush any remaining fix
  flushFix();

  const tmpFile = path.join(os.tmpdir(), `ace_ide_${Date.now()}.ps1`);
  fs.writeFileSync(tmpFile, psLines.join('\n'), 'utf8');

  return new Promise((resolve) => {
    const proc = spawn('powershell.exe', ['-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch {} };
    proc.on('close', code => { cleanup(); resolve({ ok: code === 0 }); });
    proc.on('error', err => { cleanup(); resolve({ ok: false, error: err.message }); });
    setTimeout(() => { try { proc.kill(); } catch {} cleanup(); }, 300000);
  });
});

ipcMain.handle('sticky-send-text', (_e, text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  const msg = { type: 'chat-text', text: t, ts: Date.now(), fromMe: true };
  pushChatToSticky(msg);
  // Auto-resize sticky to fit the script content.
  // Estimate: header(24) + input(42) + padding(32) + ~18px per line, ~45 chars/line.
  if (stickyWin && !stickyWin.isDestroyed()) {
    const lines = Math.ceil(t.length / 45) + t.split('\n').length;
    const needed = 24 + 42 + 32 + Math.max(lines * 18, 80);
    const maxH = (screen.getPrimaryDisplay().workArea.height * 0.80) | 0;
    const newH = Math.min(needed, maxH);
    const [curW] = stickyWin.getSize();
    try { stickyWin.setSize(curW, newH); } catch {}
    // Re-sync position so the window doesn't drift off screen after resize
    setTimeout(() => syncStickyPosition(), 50);
  }
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
