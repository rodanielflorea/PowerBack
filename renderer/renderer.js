const slider = document.getElementById('slider');
const sliderFill = document.getElementById('sliderFill');
const stealthBtn = document.getElementById('stealthBtn');
const hideBtn = document.getElementById('hideBtn');
const quitBtn = document.getElementById('quitBtn');

const urlMenuBtn = document.getElementById('urlMenuBtn');
const reloadBtn = document.getElementById('reloadBtn');
const settingsBtn = document.getElementById('settingsBtn');
const recBtn = document.getElementById('recBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const urlList = document.getElementById('urlList');
const urlInput = document.getElementById('urlInput');
const urlAddBtn = document.getElementById('urlAddBtn');

const modeVoice = document.getElementById('modeVoice');
const modeCaption = document.getElementById('modeCaption');

const micSelect = document.getElementById('micSelect');
const captureMicEl = document.getElementById('captureMic');
const captureSystemEl = document.getElementById('captureSystem');
const engineOpenai = document.getElementById('engineOpenai');
const engineLocal = document.getElementById('engineLocal');
const openaiKeyEl = document.getElementById('openaiKey');
const whisperExeEl = document.getElementById('whisperExe');
const whisperExeBrowse = document.getElementById('whisperExeBrowse');
const whisperModelEl = document.getElementById('whisperModel');
const whisperModelBrowse = document.getElementById('whisperModelBrowse');
const languageSelect = document.getElementById('languageSelect');

const captureRectEl = document.getElementById('captureRect');
const selectAreaBtn = document.getElementById('selectAreaBtn');
const captureLanguageEl = document.getElementById('captureLanguage');
const capturePollMsEl = document.getElementById('capturePollMs');

const hotkeyList = document.getElementById('hotkeyList');
const resetAllHotkeysBtn = document.getElementById('resetAllHotkeysBtn');

const logBody = document.getElementById('logBody');

let urls = [];
let txCfg = null;
let capCfg = null;
let mode = 'voice';

function updateFill(opacity) {
  sliderFill.style.width = `${Math.round(opacity * 100)}%`;
}

function updateStealth(on) {
  stealthBtn.classList.toggle('on', on);
  stealthBtn.classList.toggle('off', !on);
  stealthBtn.title = on
    ? 'Stealth ON — hidden from screen capture (click to disable)'
    : 'Stealth OFF — visible to screen capture (click to enable)';
}

slider.addEventListener('mousemove', (e) => {
  const rect = slider.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const opacity = x / rect.width;
  window.api.setOpacity(opacity);
  updateFill(opacity);
});

stealthBtn.addEventListener('click', async () => {
  const current = await window.api.getStealth();
  window.api.setStealth(!current);
});

hideBtn.addEventListener('click', () => window.api.hide());
quitBtn.addEventListener('click', () => window.api.quit());

window.api.onOpacityChanged((v) => updateFill(v));
window.api.onStealthChanged((v) => updateStealth(v));
window.api.getOpacity().then(updateFill);
window.api.getStealth().then(updateStealth);

function normalizeUrl(input) {
  const u = input.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) return 'https://' + u;
  return null;
}

function renderUrlList() {
  urlList.innerHTML = '';
  if (urls.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'url-empty';
    empty.textContent = 'No URLs added yet.';
    urlList.appendChild(empty);
    return;
  }
  urls.forEach((url, i) => {
    const row = document.createElement('div');
    row.className = 'url-row';
    const txt = document.createElement('span');
    txt.className = 'url-text';
    txt.textContent = url;
    const rm = document.createElement('button');
    rm.className = 'url-remove';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', () => {
      urls.splice(i, 1);
      window.api.setUrls(urls);
      renderUrlList();
    });
    row.appendChild(txt);
    row.appendChild(rm);
    urlList.appendChild(row);
  });
}

async function refreshUrls() {
  const data = await window.api.getUrls();
  urls = data.urls;
  renderUrlList();
}

urlAddBtn.addEventListener('click', () => {
  const u = normalizeUrl(urlInput.value);
  if (!u) return;
  urls.push(u);
  window.api.setUrls(urls);
  urlInput.value = '';
  renderUrlList();
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') urlAddBtn.click();
});

urlMenuBtn.addEventListener('click', () => window.api.showUrlMenu());
reloadBtn.addEventListener('click', () => window.api.reloadWebview());

function openSettings() {
  settingsOverlay.hidden = false;
  window.api.setWebviewVisible(false);
  refreshUrls();
  refreshModeUI();
  refreshTranscriptionUI();
  refreshCaptureUI();
  refreshMicList();
  refreshHotkeysUI();
}

function closeSettings() {
  settingsOverlay.hidden = true;
  window.api.setWebviewVisible(true);
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);

function log(msg, kind = '') {
  const line = document.createElement('div');
  line.className = 'log-line ' + (kind === 'err' ? 'log-err' : kind === 'info' ? 'log-info' : '');
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${msg}`;
  logBody.appendChild(line);
  while (logBody.childElementCount > 200) logBody.removeChild(logBody.firstChild);
  logBody.scrollTop = logBody.scrollHeight;
}

async function refreshModeUI() {
  mode = await window.api.getMode();
  modeVoice.checked = mode !== 'caption';
  modeCaption.checked = mode === 'caption';
  updateRecTitle();
}

function updateRecTitle() {
  const verb = recState || captureRunning ? 'Stop' : 'Start';
  const what = mode === 'caption' ? 'caption capture' : 'voice transcription';
  recBtn.title = `${verb} ${what}`;
}

modeVoice.addEventListener('change', async () => {
  if (modeVoice.checked) { mode = 'voice'; await window.api.setMode('voice'); updateRecTitle(); }
});
modeCaption.addEventListener('change', async () => {
  if (modeCaption.checked) { mode = 'caption'; await window.api.setMode('caption'); updateRecTitle(); }
});

async function refreshTranscriptionUI() {
  txCfg = await window.api.getTranscriptionConfig();
  engineOpenai.checked = txCfg.engine !== 'local';
  engineLocal.checked = txCfg.engine === 'local';
  openaiKeyEl.value = txCfg.openaiApiKey || '';
  whisperExeEl.value = txCfg.whisperExe || '';
  whisperModelEl.value = txCfg.whisperModel || '';
  languageSelect.value = txCfg.language || 'auto';
  captureMicEl.checked = txCfg.captureMic !== false;
  captureSystemEl.checked = txCfg.captureSystem !== false;
}

async function persistTx(patch) {
  txCfg = { ...(txCfg || {}), ...patch };
  await window.api.setTranscriptionConfig(patch);
}

engineOpenai.addEventListener('change', () => engineOpenai.checked && persistTx({ engine: 'openai' }));
engineLocal.addEventListener('change', () => engineLocal.checked && persistTx({ engine: 'local' }));
openaiKeyEl.addEventListener('change', () => persistTx({ openaiApiKey: openaiKeyEl.value.trim() }));
whisperExeEl.addEventListener('change', () => persistTx({ whisperExe: whisperExeEl.value.trim() }));
whisperModelEl.addEventListener('change', () => persistTx({ whisperModel: whisperModelEl.value.trim() }));
languageSelect.addEventListener('change', () => persistTx({ language: languageSelect.value }));
captureMicEl.addEventListener('change', () => persistTx({ captureMic: captureMicEl.checked }));
captureSystemEl.addEventListener('change', () => persistTx({ captureSystem: captureSystemEl.checked }));
micSelect.addEventListener('change', () => persistTx({ micDeviceId: micSelect.value }));

whisperExeBrowse.addEventListener('click', async () => {
  const p = await window.api.pickFile('exe');
  if (p) { whisperExeEl.value = p; persistTx({ whisperExe: p }); }
});
whisperModelBrowse.addEventListener('click', async () => {
  const p = await window.api.pickFile('model');
  if (p) { whisperModelEl.value = p; persistTx({ whisperModel: p }); }
});

async function refreshCaptureUI() {
  capCfg = await window.api.getCaptureConfig();
  captureLanguageEl.value = capCfg.language || 'English';
  capturePollMsEl.value = capCfg.pollMs || 700;
  renderCaptureRect(capCfg.rect);
}

function renderCaptureRect(rect) {
  if (!rect) {
    captureRectEl.value = '';
    captureRectEl.placeholder = 'No area selected';
  } else {
    const w = rect.x2 - rect.x1;
    const h = rect.y2 - rect.y1;
    captureRectEl.value = `(${rect.x1}, ${rect.y1}) ${w}×${h}${rect.scaleFactor && rect.scaleFactor !== 1 ? ` @${rect.scaleFactor}x` : ''}`;
  }
}

async function persistCap(patch) {
  capCfg = { ...(capCfg || {}), ...patch };
  await window.api.setCaptureConfig(patch);
}

captureLanguageEl.addEventListener('change', () => persistCap({ language: captureLanguageEl.value }));
capturePollMsEl.addEventListener('change', () => {
  const v = parseInt(capturePollMsEl.value, 10);
  if (Number.isFinite(v) && v >= 200) persistCap({ pollMs: v });
});
selectAreaBtn.addEventListener('click', async () => {
  log('Selecting capture area — drag a rectangle, Esc to cancel', 'info');
  await window.api.selectCaptureArea();
});

window.api.onCaptureRectChanged((rect) => {
  capCfg = { ...(capCfg || {}), rect };
  renderCaptureRect(rect);
  log(`Capture area set: ${rect.x1},${rect.y1} → ${rect.x2},${rect.y2}`, 'info');
});

const HOTKEY_LABELS = {
  toggleVisibility: 'Toggle window visibility',
  moveLeft: 'Move window left',
  moveRight: 'Move window right',
  moveUp: 'Move window up',
  moveDown: 'Move window down',
  opacityUp: 'Opacity up',
  opacityDown: 'Opacity down',
  scrollUp: 'Scroll page up',
  scrollDown: 'Scroll page down',
  resetCaptureArea: 'Reset capture area (re-pick)',
  reloadSite: 'Reload site',
  toggleStealth: 'Toggle stealth',
  toggleRecording: 'Start/stop voice or caption',
};

function eventToBinding(e) {
  const key = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta', 'Dead'].includes(key)) return null;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  const map = {
    'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'ArrowUp': 'Up', 'ArrowDown': 'Down',
    ' ': 'Space', 'Escape': 'Esc',
    'Enter': 'Return', 'Tab': 'Tab', 'Backspace': 'Backspace',
    'Delete': 'Delete', 'Home': 'Home', 'End': 'End',
    'PageUp': 'PageUp', 'PageDown': 'PageDown',
  };
  let k;
  if (map[key]) k = map[key];
  else if (key.length === 1) k = key.toUpperCase();
  else if (/^F\d{1,2}$/.test(key)) k = key;
  else k = key;
  parts.push(k);
  return parts.join('+');
}

let hotkeyState = { current: {}, defaults: {}, failures: {} };
let capturingFor = null;
let captureKeyHandler = null;

async function refreshHotkeysUI() {
  hotkeyState = await window.api.getHotkeys();
  renderHotkeyList();
}

function renderHotkeyList() {
  hotkeyList.innerHTML = '';
  for (const action of Object.keys(HOTKEY_LABELS)) {
    const row = document.createElement('div');
    row.className = 'hotkey-row';

    const label = document.createElement('span');
    label.className = 'hotkey-label';
    label.textContent = HOTKEY_LABELS[action];
    row.appendChild(label);

    const binding = document.createElement('button');
    binding.className = 'hotkey-binding';
    const combo = hotkeyState.current[action] || '';
    if (capturingFor === action) {
      binding.textContent = 'Press keys…';
      binding.classList.add('capturing');
    } else if (!combo) {
      binding.textContent = '(disabled)';
      binding.classList.add('empty');
    } else {
      binding.textContent = combo;
      if (hotkeyState.failures && hotkeyState.failures[action]) {
        binding.classList.add('failed');
        binding.title = hotkeyState.failures[action];
      }
    }
    binding.addEventListener('click', () => beginCapture(action));
    row.appendChild(binding);

    const reset = document.createElement('button');
    reset.className = 'hotkey-reset';
    reset.textContent = 'reset';
    reset.title = 'Reset to default: ' + (hotkeyState.defaults[action] || '(none)');
    reset.addEventListener('click', async () => {
      cancelCapture();
      await window.api.resetHotkey(action);
    });
    row.appendChild(reset);

    hotkeyList.appendChild(row);
  }
}

function beginCapture(action) {
  cancelCapture();
  capturingFor = action;
  renderHotkeyList();
  captureKeyHandler = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      cancelCapture();
      renderHotkeyList();
      return;
    }
    if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      const a = capturingFor;
      cancelCapture();
      await window.api.setHotkey(a, '');
      return;
    }
    const combo = eventToBinding(e);
    if (!combo) return;
    const a = capturingFor;
    cancelCapture();
    await window.api.setHotkey(a, combo);
  };
  document.addEventListener('keydown', captureKeyHandler, true);
}

function cancelCapture() {
  if (captureKeyHandler) {
    document.removeEventListener('keydown', captureKeyHandler, true);
    captureKeyHandler = null;
  }
  capturingFor = null;
}

resetAllHotkeysBtn.addEventListener('click', async () => {
  cancelCapture();
  await window.api.resetAllHotkeys();
});

window.api.onHotkeysChanged((data) => {
  hotkeyState = { ...hotkeyState, ...data };
  if (!settingsOverlay.hidden) renderHotkeyList();
});

window.api.onToggleRecording(() => {
  recBtn.click();
});

window.api.onSelectorClosed(() => {
  if (!settingsOverlay.hidden) closeSettings();
});

window.api.onCaptureText((text) => log('OCR: ' + text));
window.api.onCaptureError((msg) => log('OCR error: ' + msg, 'err'));
window.api.onCaptureState((on) => {
  captureRunning = !!on;
  recBtn.classList.toggle('on', captureRunning);
  updateRecTitle();
});

async function refreshMicList() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    micSelect.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'System default';
    micSelect.appendChild(def);
    mics.forEach(m => {
      const o = document.createElement('option');
      o.value = m.deviceId;
      o.textContent = m.label || `Microphone (${m.deviceId.slice(0, 6)})`;
      micSelect.appendChild(o);
    });
    if (txCfg && txCfg.micDeviceId) micSelect.value = txCfg.micDeviceId;
  } catch (e) {
    log('Mic enumeration failed: ' + e.message, 'err');
  }
}

let recState = null;
let captureRunning = false;

async function startVoice() {
  if (recState) return;
  txCfg = await window.api.getTranscriptionConfig();

  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const streams = [];
  const sources = [];

  if (txCfg.captureMic !== false) {
    try {
      const constraints = {
        audio: txCfg.micDeviceId
          ? { deviceId: { exact: txCfg.micDeviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      };
      const mic = await navigator.mediaDevices.getUserMedia(constraints);
      streams.push(mic);
      const src = ctx.createMediaStreamSource(mic);
      const g = ctx.createGain(); g.gain.value = 1.0;
      src.connect(g).connect(dest);
      sources.push(src);
      log('Mic capture started', 'info');
    } catch (e) {
      log('Mic capture failed: ' + e.message, 'err');
    }
  }

  if (txCfg.captureSystem !== false) {
    try {
      const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      sys.getVideoTracks().forEach(t => t.stop());
      const audioOnly = new MediaStream(sys.getAudioTracks());
      if (audioOnly.getAudioTracks().length === 0) {
        log('System loopback returned no audio track', 'err');
      } else {
        streams.push(sys);
        const src = ctx.createMediaStreamSource(audioOnly);
        const g = ctx.createGain(); g.gain.value = 1.0;
        src.connect(g).connect(dest);
        sources.push(src);
        log('System loopback started', 'info');
      }
    } catch (e) {
      log('System loopback failed: ' + e.message, 'err');
    }
  }

  if (sources.length === 0) {
    log('No audio sources — aborting', 'err');
    ctx.close();
    return;
  }

  const sampleRate = ctx.sampleRate;
  const bufferSize = 4096;
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
  const mixSource = ctx.createMediaStreamSource(dest.stream);
  mixSource.connect(processor);
  const sink = ctx.createGain(); sink.gain.value = 0;
  processor.connect(sink).connect(ctx.destination);

  let buffered = [];
  let bufferedLen = 0;
  const CHUNK_SECONDS = 5;
  const targetSamples = sampleRate * CHUNK_SECONDS;

  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    buffered.push(new Float32Array(data));
    bufferedLen += data.length;
    if (bufferedLen >= targetSamples) {
      const samples = flatten(buffered, bufferedLen);
      buffered = [];
      bufferedLen = 0;
      const mono16k = downsampleTo16k(samples, sampleRate);
      if (!isSilent(mono16k)) {
        const wav = encodeWav(mono16k, 16000);
        runTranscription(wav).catch(err => log('Transcribe error: ' + err.message, 'err'));
      }
    }
  };

  recState = { ctx, streams, processor };
  recBtn.classList.add('on');
  updateRecTitle();
  log('Voice transcription started (engine: ' + txCfg.engine + ')', 'info');
}

async function stopVoice() {
  if (!recState) return;
  try { recState.processor.disconnect(); } catch {}
  recState.streams.forEach(s => s.getTracks().forEach(t => t.stop()));
  try { await recState.ctx.close(); } catch {}
  recState = null;
  recBtn.classList.remove('on');
  updateRecTitle();
  log('Voice transcription stopped', 'info');
}

async function startCaption() {
  capCfg = await window.api.getCaptureConfig();
  if (!capCfg.rect) {
    log('No capture area set — open settings, click Select', 'err');
    return;
  }
  await window.api.startCaptureLoop();
  log('Caption capture started (' + (capCfg.language || 'English') + ', poll ' + (capCfg.pollMs || 700) + 'ms)', 'info');
}

async function stopCaption() {
  await window.api.stopCaptureLoop();
  log('Caption capture stopped', 'info');
}

recBtn.addEventListener('click', async () => {
  if (mode === 'caption') {
    if (captureRunning) stopCaption();
    else startCaption();
  } else {
    if (recState) stopVoice();
    else startVoice();
  }
});

async function runTranscription(wavBuf) {
  const text = await window.api.transcribe(wavBuf);
  if (text && text.trim()) {
    log(text);
    await window.api.pasteText(text + ' ');
  }
}

function flatten(chunks, total) {
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function downsampleTo16k(samples, sourceRate) {
  if (sourceRate === 16000) return samples;
  const ratio = sourceRate / 16000;
  const newLength = Math.floor(samples.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = idx - i0;
    result[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return result;
}

function isSilent(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  return rms < 0.005;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return buffer;
}
