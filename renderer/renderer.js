const slider = document.getElementById('slider');
const sliderFill = document.getElementById('sliderFill');
const stealthBtn = document.getElementById('stealthBtn');
const endBtn = document.getElementById('endBtn');
const hideBtn = document.getElementById('hideBtn');
const quitBtn = document.getElementById('quitBtn');

const setupOverlay = document.getElementById('setupOverlay');
const setupModeCaption = document.getElementById('setupModeCaption');
const setupModeVoice = document.getElementById('setupModeVoice');
const setupRoleSpeaker = document.getElementById('setupRoleSpeaker');
const setupRoleSupporter = document.getElementById('setupRoleSupporter');
const setupPortBlock = document.getElementById('setupPortBlock');
const setupAddressBlock = document.getElementById('setupAddressBlock');
const setupPortEl = document.getElementById('setupPort');
const setupAddressEl = document.getElementById('setupAddress');
const setupSavePortBtn = document.getElementById('setupSavePortBtn');
const setupSaveAddressBtn = document.getElementById('setupSaveAddressBtn');
const setupStartBtn = document.getElementById('setupStartBtn');

const setupUrlList = document.getElementById('setupUrlList');
const setupUrlInput = document.getElementById('setupUrlInput');
const setupUrlAddBtn = document.getElementById('setupUrlAddBtn');

const setupCaptureLanguage = document.getElementById('setupCaptureLanguage');
const setupCapturePollMs = document.getElementById('setupCapturePollMs');

const setupEngineOpenai = document.getElementById('setupEngineOpenai');
const setupEngineLocal = document.getElementById('setupEngineLocal');
const setupOpenaiKey = document.getElementById('setupOpenaiKey');
const setupWhisperExe = document.getElementById('setupWhisperExe');
const setupWhisperExeBrowse = document.getElementById('setupWhisperExeBrowse');
const setupWhisperModel = document.getElementById('setupWhisperModel');
const setupWhisperModelBrowse = document.getElementById('setupWhisperModelBrowse');
const setupVoiceLanguage = document.getElementById('setupVoiceLanguage');
const setupMicSelect = document.getElementById('setupMicSelect');
const setupCaptureMic = document.getElementById('setupCaptureMic');
const setupCaptureSystem = document.getElementById('setupCaptureSystem');

const setupMaxSupporters = document.getElementById('setupMaxSupporters');
const setupTwoWay = document.getElementById('setupTwoWay');

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

const roleSpeaker = document.getElementById('roleSpeaker');
const roleSupporter = document.getElementById('roleSupporter');
const netAddressEl = document.getElementById('netAddress');
const maxSupportersEl = document.getElementById('maxSupporters');
const maxSupportersField = document.getElementById('maxSupportersField');
const netPortField = document.getElementById('netPortField');
const netPortEl = document.getElementById('netPort');
const netAddressField = document.getElementById('netAddressField');
const netActionBtn = document.getElementById('netActionBtn');
const netStopBtn = document.getElementById('netStopBtn');
const netFlag = document.getElementById('netFlag');
const netStatusEl = document.getElementById('netStatus');
const incomingVolumeEl = document.getElementById('incomingVolume');
const incomingVolumeVal = document.getElementById('incomingVolumeVal');
const twoWayEl = document.getElementById('twoWay');
const pttStatusEl = document.getElementById('pttStatus');
const incomingLevelFill = document.getElementById('incomingLevelFill');
const remoteAudioEl = document.getElementById('remoteAudio');
const speakerInAudioEl = document.getElementById('speakerInAudio');
const muteToggleBtn = document.getElementById('muteToggleBtn');

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

let sliderDragging = false;

function setOpacityFromEvent(e) {
  const rect = slider.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const opacity = x / rect.width;
  window.api.setOpacity(opacity);
  updateFill(opacity);
}

slider.addEventListener('mousedown', (e) => {
  e.preventDefault();
  sliderDragging = true;
  setOpacityFromEvent(e);
});

window.addEventListener('mousemove', (e) => {
  if (sliderDragging) setOpacityFromEvent(e);
});

window.addEventListener('mouseup', () => {
  sliderDragging = false;
});

window.addEventListener('mouseleave', () => {
  sliderDragging = false;
});

stealthBtn.addEventListener('click', async () => {
  const current = await window.api.getStealth();
  window.api.setStealth(!current);
});

hideBtn.addEventListener('click', () => window.api.hide());
quitBtn.addEventListener('click', () => window.api.quit());

function applySetupRoleVisibility() {
  const isSpeaker = setupRoleSpeaker.checked;
  setupPortBlock.hidden = !isSpeaker;
  setupAddressBlock.hidden = isSpeaker;
  if (setupMaxSupporters) {
    const field = document.getElementById('setupMaxSupportersField');
    if (field) field.style.display = isSpeaker ? '' : 'none';
  }
}

function activateSetupTab(name) {
  document.querySelectorAll('.stab-btn').forEach(b => b.classList.toggle('active', b.dataset.stab === name));
  document.querySelectorAll('.setup-tab-pane').forEach(p => { p.hidden = p.dataset.stab !== name; });
}

document.querySelectorAll('.stab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateSetupTab(btn.dataset.stab));
});

function applySetupModeTabVisibility(activeMode) {
  const voiceTab = document.querySelector('.stab-btn[data-stab="voice"]');
  const captionTab = document.querySelector('.stab-btn[data-stab="caption"]');
  const isCaption = activeMode === 'caption';
  if (voiceTab) voiceTab.style.display = isCaption ? 'none' : '';
  if (captionTab) captionTab.style.display = isCaption ? '' : 'none';
  const activeBtn = document.querySelector('.stab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') activateSetupTab('essentials');
}

setupModeCaption.addEventListener('change', () => {
  if (setupModeCaption.checked) applySetupModeTabVisibility('caption');
});
setupModeVoice.addEventListener('change', () => {
  if (setupModeVoice.checked) applySetupModeTabVisibility('voice');
});

function flashSaved(el) {
  if (!el) return;
  el.classList.remove('save-flash');
  void el.offsetWidth;
  el.classList.add('save-flash');
  setTimeout(() => el.classList.remove('save-flash'), 1300);
}

function renderSetupUrlList(urlsArr) {
  setupUrlList.innerHTML = '';
  if (urlsArr.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'url-empty';
    empty.textContent = 'No URLs added yet.';
    setupUrlList.appendChild(empty);
    return;
  }
  urlsArr.forEach((u, i) => {
    const row = document.createElement('div');
    row.className = 'url-row';
    const txt = document.createElement('span');
    txt.className = 'url-text';
    txt.textContent = u;
    const rm = document.createElement('button');
    rm.className = 'url-remove';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', async () => {
      urlsArr.splice(i, 1);
      await window.api.setUrls(urlsArr);
      renderSetupUrlList(urlsArr);
    });
    row.appendChild(txt);
    row.appendChild(rm);
    setupUrlList.appendChild(row);
  });
}

async function refreshSetupMicList() {
  if (!setupMicSelect) return;
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    setupMicSelect.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'System default';
    setupMicSelect.appendChild(def);
    mics.forEach(m => {
      const o = document.createElement('option');
      o.value = m.deviceId;
      o.textContent = m.label || `Microphone (${m.deviceId.slice(0, 6)})`;
      setupMicSelect.appendChild(o);
    });
    if (txCfg && txCfg.micDeviceId) setupMicSelect.value = txCfg.micDeviceId;
  } catch (e) {
    log('Setup mic enumeration failed: ' + e.message, 'err');
  }
}

[setupRoleSpeaker, setupRoleSupporter].forEach(el => {
  el.addEventListener('change', applySetupRoleVisibility);
});

setupSavePortBtn.addEventListener('click', async () => {
  const port = parseInt(setupPortEl.value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    window.alert('Enter a valid port (1–65535)');
    return;
  }
  await window.api.setNetworkConfig({ speakerPort: port });
  flashSaved(setupPortEl);
  log(`Default port saved: ${port}`, 'info');
});

setupSaveAddressBtn.addEventListener('click', async () => {
  const addr = setupAddressEl.value.trim();
  if (!/^[^:\s]+:\d+$/.test(addr)) {
    window.alert('Enter address as host:port (e.g. 172.16.98.11:2000)');
    return;
  }
  await window.api.setNetworkConfig({ supporterAddress: addr });
  flashSaved(setupAddressEl);
  log(`Default address saved: ${addr}`, 'info');
});

setupUrlAddBtn.addEventListener('click', async () => {
  const u = normalizeUrl(setupUrlInput.value);
  if (!u) return;
  const data = await window.api.getUrls();
  const arr = data.urls.slice();
  arr.push(u);
  await window.api.setUrls(arr);
  setupUrlInput.value = '';
  renderSetupUrlList(arr);
});
setupUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') setupUrlAddBtn.click(); });

setupCaptureLanguage.addEventListener('change', () => window.api.setCaptureConfig({ language: setupCaptureLanguage.value }));
setupCapturePollMs.addEventListener('change', () => {
  const v = parseInt(setupCapturePollMs.value, 10);
  if (Number.isFinite(v) && v >= 200) window.api.setCaptureConfig({ pollMs: v });
});

setupEngineOpenai.addEventListener('change', () => setupEngineOpenai.checked && window.api.setTranscriptionConfig({ engine: 'openai' }));
setupEngineLocal.addEventListener('change', () => setupEngineLocal.checked && window.api.setTranscriptionConfig({ engine: 'local' }));
setupOpenaiKey.addEventListener('change', () => window.api.setTranscriptionConfig({ openaiApiKey: setupOpenaiKey.value.trim() }));
setupWhisperExe.addEventListener('change', () => window.api.setTranscriptionConfig({ whisperExe: setupWhisperExe.value.trim() }));
setupWhisperModel.addEventListener('change', () => window.api.setTranscriptionConfig({ whisperModel: setupWhisperModel.value.trim() }));
setupVoiceLanguage.addEventListener('change', () => window.api.setTranscriptionConfig({ language: setupVoiceLanguage.value }));
setupCaptureMic.addEventListener('change', () => window.api.setTranscriptionConfig({ captureMic: setupCaptureMic.checked }));
setupCaptureSystem.addEventListener('change', () => window.api.setTranscriptionConfig({ captureSystem: setupCaptureSystem.checked }));
setupMicSelect.addEventListener('change', () => window.api.setTranscriptionConfig({ micDeviceId: setupMicSelect.value }));

setupWhisperExeBrowse.addEventListener('click', async () => {
  const p = await window.api.pickFile('exe');
  if (p) { setupWhisperExe.value = p; window.api.setTranscriptionConfig({ whisperExe: p }); }
});
setupWhisperModelBrowse.addEventListener('click', async () => {
  const p = await window.api.pickFile('model');
  if (p) { setupWhisperModel.value = p; window.api.setTranscriptionConfig({ whisperModel: p }); }
});

setupMaxSupporters.addEventListener('change', () => {
  const n = parseInt(setupMaxSupporters.value, 10);
  if (Number.isFinite(n) && n >= 1) window.api.setNetworkConfig({ maxSupporters: n });
});
setupTwoWay.addEventListener('change', () => window.api.setNetworkConfig({ twoWay: setupTwoWay.checked }));

async function refreshSetupUI() {
  const m = await window.api.getMode();
  setupModeCaption.checked = m !== 'voice';
  setupModeVoice.checked = m === 'voice';
  applySetupModeTabVisibility(m === 'voice' ? 'voice' : 'caption');

  const netC = await window.api.getNetworkConfig();
  const role = netC.role || 'speaker';
  setupRoleSpeaker.checked = role === 'speaker';
  setupRoleSupporter.checked = role === 'supporter';
  setupPortEl.value = netC.speakerPort || parsePort(netC.address) || 2000;
  setupAddressEl.value = netC.supporterAddress || (netC.address && !netC.address.startsWith('0.0.0.0') ? netC.address : '172.16.98.11:2000');
  setupMaxSupporters.value = netC.maxSupporters || 1;
  setupTwoWay.checked = netC.twoWay !== false;
  applySetupRoleVisibility();

  const data = await window.api.getUrls();
  renderSetupUrlList(data.urls.slice());

  const tx = await window.api.getTranscriptionConfig();
  txCfg = tx;
  setupEngineOpenai.checked = tx.engine !== 'local';
  setupEngineLocal.checked = tx.engine === 'local';
  setupOpenaiKey.value = tx.openaiApiKey || '';
  setupWhisperExe.value = tx.whisperExe || '';
  setupWhisperModel.value = tx.whisperModel || '';
  setupVoiceLanguage.value = tx.language || 'auto';
  setupCaptureMic.checked = tx.captureMic !== false;
  setupCaptureSystem.checked = tx.captureSystem !== false;

  const cap = await window.api.getCaptureConfig();
  capCfg = cap;
  setupCaptureLanguage.value = cap.language || 'English';
  setupCapturePollMs.value = cap.pollMs || 700;

  refreshSetupMicList();
}

function showSetup() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  setupOverlay.hidden = false;
  document.body.classList.remove('in-interview');
  endBtn.classList.remove('live');
  window.api.setWebviewVisible(false);
  activateSetupTab('essentials');
  refreshSetupUI();
}

function hideSetup() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  setupOverlay.hidden = true;
  document.body.classList.add('in-interview');
  endBtn.classList.add('live');
  window.api.setWebviewVisible(true);
}

setupStartBtn.addEventListener('click', async () => {
  const chosenMode = setupModeCaption.checked ? 'caption' : 'voice';
  const chosenRole = setupRoleSpeaker.checked ? 'speaker' : 'supporter';
  const patch = { role: chosenRole };
  if (chosenRole === 'speaker') {
    const port = parseInt(setupPortEl.value, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      window.alert('Enter a valid port (1–65535)');
      return;
    }
    patch.speakerPort = port;
  } else {
    const addr = setupAddressEl.value.trim();
    if (!/^[^:\s]+:\d+$/.test(addr)) {
      window.alert('Enter address as host:port (e.g. 172.16.98.11:2000)');
      return;
    }
    patch.supporterAddress = addr;
  }
  await window.api.setMode(chosenMode);
  mode = chosenMode;
  await window.api.setNetworkConfig(patch);
  await window.api.startNetwork();
  hideSetup();
  const showAddr = chosenRole === 'speaker' ? `0.0.0.0:${patch.speakerPort}` : patch.supporterAddress;
  log(`Started: ${chosenMode} mode as ${chosenRole} on ${showAddr}`, 'info');

  if (chosenMode === 'caption') {
    const cap = await window.api.getCaptureConfig();
    if (!cap.rect) {
      log('Caption mode: pick a screen area to OCR', 'info');
      pendingCaptureStart = true;
      setTimeout(() => window.api.selectCaptureArea(), 300);
    }
  }
});

const endModal = document.getElementById('endModal');
const endModalList = document.getElementById('endModalList');
const endModalCancel = document.getElementById('endModalCancel');
const endModalConfirm = document.getElementById('endModalConfirm');

function addModalItem(text, kind) {
  const li = document.createElement('li');
  if (kind) li.className = kind;
  li.appendChild(document.createTextNode(text));
  endModalList.appendChild(li);
}

async function showEndModal() {
  endModalList.innerHTML = '';
  if (recState) addModalItem('Voice transcription · running', 'live');
  else if (captureRunning) addModalItem('Caption capture · running', 'live');
  else addModalItem(`Active mode · ${mode || 'none'} (idle)`, 'idle');

  const status = await window.api.getNetworkStatus().catch(() => ({}));
  if (status.bound) {
    const n = (status.supporters || []).length;
    addModalItem(`Hosting on ${status.address} · ${n}/${status.maxSupporters} supporter${n === 1 ? '' : 's'}`, 'live');
  } else if (status.connected) {
    addModalItem(`Connected to ${status.address}`, 'live');
  } else if (status.role) {
    addModalItem(`Network · ${status.role} (idle)`, 'idle');
  }

  endModal.hidden = false;
  window.api.setWebviewVisible(false);
}

function hideEndModal() {
  endModal.hidden = true;
  if (setupOverlay.hidden && settingsOverlay.hidden) window.api.setWebviewVisible(true);
}

endBtn.addEventListener('click', showEndModal);
endModalCancel.addEventListener('click', hideEndModal);
endModalConfirm.addEventListener('click', async () => {
  endModal.hidden = true;
  if (recState) await stopVoice().catch(() => {});
  if (captureRunning) await stopCaption().catch(() => {});
  await window.api.stopNetwork();
  teardownPeers();
  delete netActionBtn.dataset.connecting;
  log('Session ended — back to setup', 'info');
  showSetup();
});

document.addEventListener('keydown', (e) => {
  if (!endModal.hidden && e.key === 'Escape') hideEndModal();
});

showSetup();

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

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.settings-tab');

function activateTab(name) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  tabPanels.forEach(p => { p.hidden = p.dataset.tab !== name; });
}

tabBtns.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

function openSettings() {
  settingsOverlay.hidden = false;
  window.api.setWebviewVisible(false);
  const inInterview = document.body.classList.contains('in-interview');
  activateTab(inInterview ? 'caption' : 'general');
  refreshUrls();
  refreshModeUI();
  refreshTranscriptionUI();
  refreshCaptureUI();
  refreshMicList();
  refreshHotkeysUI();
  refreshNetworkUI();
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
  updateTabVisibility(mode);
}

function updateTabVisibility(activeMode) {
  const voiceBtn = document.querySelector('.tab-btn[data-tab="voice"]');
  const captionBtn = document.querySelector('.tab-btn[data-tab="caption"]');
  const isCaption = activeMode === 'caption';
  if (voiceBtn) voiceBtn.style.display = isCaption ? 'none' : '';
  if (captionBtn) captionBtn.style.display = isCaption ? '' : 'none';
  const hiddenActive = document.querySelector('.tab-btn.active');
  if (hiddenActive && hiddenActive.style.display === 'none') activateTab('general');
}

function updateRecTitle() {
  const verb = recState || captureRunning ? 'Stop' : 'Start';
  const what = mode === 'caption' ? 'caption capture' : 'voice transcription';
  recBtn.title = `${verb} ${what}`;
}

modeVoice.addEventListener('change', async () => {
  if (modeVoice.checked) { mode = 'voice'; await window.api.setMode('voice'); updateRecTitle(); updateTabVisibility('voice'); }
});
modeCaption.addEventListener('change', async () => {
  if (modeCaption.checked) { mode = 'caption'; await window.api.setMode('caption'); updateRecTitle(); updateTabVisibility('caption'); }
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
  if (pendingCaptureStart) {
    pendingCaptureStart = false;
    window.api.startCaptureLoop();
    log('Auto-starting caption capture with new area', 'info');
  }
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
  pushToTalk: 'Push-to-talk (toggle supporter mic)',
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

let pendingCaptureStart = false;

async function startCaption() {
  capCfg = await window.api.getCaptureConfig();
  if (!capCfg.rect) {
    log('No capture area — opening selector. Capture will auto-start once you pick.', 'info');
    pendingCaptureStart = true;
    await window.api.selectCaptureArea();
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

let netCfg = null;

async function refreshNetworkUI() {
  netCfg = await window.api.getNetworkConfig();
  const status = await window.api.getNetworkStatus();
  roleSpeaker.checked = netCfg.role === 'speaker' || !netCfg.role;
  roleSupporter.checked = netCfg.role === 'supporter';
  netAddressEl.value = netCfg.address || '';
  const port = parsePort(netCfg.address) || 2000;
  if (netPortEl) netPortEl.value = port;
  maxSupportersEl.value = netCfg.maxSupporters || 1;
  twoWayEl.checked = !!netCfg.twoWay;
  const v = Math.round((netCfg.incomingVolume ?? 1) * 100);
  incomingVolumeEl.value = v;
  incomingVolumeVal.textContent = v + '%';
  applyIncomingVolume(netCfg.incomingVolume ?? 1);
  updateRoleVisibility();
  renderNetStatus(status);
}

function parsePort(addr) {
  const m = String(addr || '').match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function parseHost(addr) {
  const m = String(addr || '').match(/^([^:]+):/);
  return m ? m[1] : '';
}

function updateRoleVisibility() {
  const isSpeaker = netCfg && netCfg.role === 'speaker';
  const isSupporter = netCfg && netCfg.role === 'supporter';
  if (maxSupportersField) maxSupportersField.style.display = isSpeaker ? '' : 'none';
  if (netPortField) netPortField.style.display = isSpeaker ? '' : 'none';
  if (netAddressField) netAddressField.style.display = isSupporter ? '' : 'none';
  if (!netCfg || !netCfg.role) {
    netActionBtn.textContent = 'Pick a role first';
    netActionBtn.disabled = true;
  } else {
    netActionBtn.disabled = false;
    netActionBtn.textContent = isSpeaker ? 'Start hosting' : 'Connect to speaker';
  }
}

function renderNetStatus(status) {
  if (!netStatusEl || !netFlag) return;
  let flagText = 'IDLE';
  let flagCls = '';
  let txt;
  const role = (netCfg && netCfg.role) || status.role;
  if (status.bound && role === 'speaker') {
    const hasSupporters = status.supporters.length > 0;
    flagText = hasSupporters ? 'CONNECTED' : 'HOSTING';
    flagCls = hasSupporters ? 'connected' : 'hosting';
    txt = `Hosting on ${status.address} · ${status.supporters.length}/${status.maxSupporters} supporter(s)`;
    netActionBtn.hidden = true;
    netStopBtn.hidden = false;
    netStopBtn.textContent = 'Stop hosting';
  } else if (role === 'supporter' && status.connected) {
    flagText = 'CONNECTED';
    flagCls = 'connected';
    txt = `Connected to ${status.address}`;
    netActionBtn.hidden = true;
    netStopBtn.hidden = false;
    netStopBtn.textContent = 'Disconnect';
  } else if (role === 'supporter' && netActionBtn.dataset.connecting === '1') {
    flagText = 'DIALING';
    flagCls = 'connecting';
    txt = `Dialing ${status.address}…`;
    netActionBtn.hidden = true;
    netStopBtn.hidden = false;
    netStopBtn.textContent = 'Cancel';
  } else {
    flagText = 'IDLE';
    flagCls = '';
    txt = role ? `Idle. Press the action button to start.` : `Pick a role and start.`;
    netActionBtn.hidden = false;
    netStopBtn.hidden = true;
  }
  netFlag.textContent = flagText;
  netFlag.className = 'status-flag' + (flagCls ? ' ' + flagCls : '');
  netStatusEl.textContent = txt;
}

async function persistNet(patch) {
  netCfg = { ...(netCfg || {}), ...patch };
  await window.api.setNetworkConfig(patch);
}

[roleSpeaker, roleSupporter].forEach(el => {
  el.addEventListener('change', async () => {
    if (!el.checked) return;
    const role = el.value;
    if (netActionBtn && !netActionBtn.hidden) {
      // Just update the choice; user clicks action button to actually start
      await persistNet({ role });
      teardownPeers();
      updateRoleVisibility();
      const status = await window.api.getNetworkStatus();
      renderNetStatus(status);
    } else {
      // Mid-session role change — confirm and stop everything
      if (!window.confirm('Switching role will disconnect the current session. Continue?')) {
        roleSpeaker.checked = netCfg.role === 'speaker';
        roleSupporter.checked = netCfg.role === 'supporter';
        return;
      }
      await window.api.stopNetwork();
      await persistNet({ role });
      teardownPeers();
      updateRoleVisibility();
    }
  });
});

netActionBtn.addEventListener('click', async () => {
  if (!netCfg || !netCfg.role) return;
  const role = netCfg.role;
  const addr = netAddressEl.value.trim();
  if (!addr) { window.alert('Enter an address first.'); return; }
  await persistNet({ address: addr });
  const msg = role === 'speaker'
    ? `Start hosting on ${addr}?\n\nThis will:\n  • Bind a WebSocket server on the port\n  • Capture your microphone + system audio when a supporter connects\n  • Stream audio to up to ${netCfg.maxSupporters || 1} supporter(s)`
    : `Connect to ${addr}?\n\nThis will:\n  • Open a WebSocket connection to the speaker\n  • Receive their microphone + system audio\n  • Auto-reconnect every 5s if dropped`;
  if (!window.confirm(msg)) return;
  if (role === 'supporter') netActionBtn.dataset.connecting = '1';
  await window.api.startNetwork();
  const status = await window.api.getNetworkStatus();
  renderNetStatus(status);
});

netStopBtn.addEventListener('click', async () => {
  await window.api.stopNetwork();
  teardownPeers();
  delete netActionBtn.dataset.connecting;
  const status = await window.api.getNetworkStatus();
  renderNetStatus(status);
});

if (muteToggleBtn) muteToggleBtn.addEventListener('click', () => toggleMicMute());

netAddressEl.addEventListener('change', () => persistNet({ address: netAddressEl.value.trim() }));
if (netPortEl) netPortEl.addEventListener('change', () => {
  const port = parseInt(netPortEl.value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) return;
  const host = parseHost(netCfg && netCfg.address) || '0.0.0.0';
  persistNet({ address: `${host}:${port}` });
  netAddressEl.value = `${host}:${port}`;
});
maxSupportersEl.addEventListener('change', () => {
  const n = parseInt(maxSupportersEl.value, 10);
  if (Number.isFinite(n) && n >= 1) persistNet({ maxSupporters: n });
});
twoWayEl.addEventListener('change', () => persistNet({ twoWay: twoWayEl.checked }));

incomingVolumeEl.addEventListener('input', () => {
  const v = Math.min(100, parseInt(incomingVolumeEl.value, 10)) / 100;
  incomingVolumeVal.textContent = Math.round(v * 100) + '%';
  applyIncomingVolume(v);
  persistNet({ incomingVolume: v });
});

window.api.onNetworkStatus((status) => renderNetStatus(status));
window.api.onNetworkError((msg) => {
  log('Network: ' + msg, 'err');
  if (netStatusEl) {
    netStatusEl.textContent = 'Status: ' + msg;
    netStatusEl.classList.remove('live');
    netStatusEl.classList.add('error');
  }
});

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const speakerPeers = new Map();
let supporterPeer = null;
let speakerLocalStream = null;
let supporterMicStream = null;
let supporterMicTrack = null;
const SimplePeerLib = window.SimplePeer;

function applyIncomingVolume(v) {
  const clamped = Math.min(1, Math.max(0, v));
  if (remoteAudioEl) remoteAudioEl.volume = clamped;
  if (speakerInAudioEl) speakerInAudioEl.volume = clamped;
}

let levelCtx = null;
let levelAnalyser = null;
let levelTickHandle = null;
let levelSourceStream = null;

function startLevelMeter(stream) {
  if (levelSourceStream === stream) return;
  stopLevelMeter();
  try {
    if (!levelCtx) levelCtx = new AudioContext();
    if (levelCtx.state === 'suspended') levelCtx.resume().catch(() => {});
    const src = levelCtx.createMediaStreamSource(stream);
    levelAnalyser = levelCtx.createAnalyser();
    levelAnalyser.fftSize = 512;
    levelAnalyser.smoothingTimeConstant = 0.6;
    src.connect(levelAnalyser);
    levelSourceStream = stream;
    const data = new Uint8Array(levelAnalyser.fftSize);
    const tick = () => {
      if (!levelAnalyser) return;
      levelAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const pct = Math.min(100, Math.round(rms * 250));
      if (incomingLevelFill) incomingLevelFill.style.width = pct + '%';
      levelTickHandle = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    log('Level meter setup failed: ' + e.message, 'err');
  }
}

function stopLevelMeter() {
  if (levelTickHandle) { cancelAnimationFrame(levelTickHandle); levelTickHandle = null; }
  levelAnalyser = null;
  levelSourceStream = null;
  if (incomingLevelFill) incomingLevelFill.style.width = '0%';
}

function setPttStatus(active) {
  if (!pttStatusEl) return;
  pttStatusEl.textContent = active ? 'Mic: ACTIVE (transmitting)' : 'Mic: MUTED';
  pttStatusEl.classList.toggle('on', active);
  if (muteToggleBtn) muteToggleBtn.textContent = active ? 'Mute' : 'Unmute';
}

function toggleMicMute() {
  if (!supporterMicTrack) {
    log('Mute toggle: two-way not active or mic not captured yet', 'info');
    return;
  }
  supporterMicTrack.enabled = !supporterMicTrack.enabled;
  setPttStatus(supporterMicTrack.enabled);
}

window.api.onTogglePtt(() => toggleMicMute());

async function captureSpeakerStream() {
  if (speakerLocalStream) return speakerLocalStream;
  const tracks = [];
  let micOk = false, sysOk = false;
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    mic.getAudioTracks().forEach(t => tracks.push(t));
    micOk = tracks.length > 0;
  } catch (e) { log('Speaker mic capture failed: ' + e.message, 'err'); }
  try {
    const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    sys.getVideoTracks().forEach(t => t.stop());
    const sysAudio = sys.getAudioTracks();
    if (sysAudio.length > 0) {
      sysAudio.forEach(t => tracks.push(t));
      sysOk = true;
    } else {
      log('Speaker: getDisplayMedia returned no audio track (system loopback unavailable)', 'err');
    }
  } catch (e) { log('Speaker system capture failed: ' + e.message, 'err'); }
  if (tracks.length === 0) return null;
  speakerLocalStream = new MediaStream(tracks);
  log(`Speaker capture ready (mic:${micOk ? 'ok' : 'no'}, system:${sysOk ? 'ok' : 'no'}, ${tracks.length} track(s) sending)`, 'info');
  return speakerLocalStream;
}

function teardownPeers() {
  speakerPeers.forEach(entry => { try { entry.peer.destroy(); } catch {} });
  speakerPeers.clear();
  if (supporterPeer) { try { supporterPeer.destroy(); } catch {} supporterPeer = null; }
  if (speakerLocalStream) { speakerLocalStream.getTracks().forEach(t => t.stop()); speakerLocalStream = null; }
  if (supporterMicStream) { supporterMicStream.getTracks().forEach(t => t.stop()); supporterMicStream = null; }
  supporterMicTrack = null;
  setPttStatus(false);
  if (remoteAudioEl) { try { remoteAudioEl.srcObject = null; } catch {} }
  if (speakerInAudioEl) { try { speakerInAudioEl.srcObject = null; } catch {} }
  stopLevelMeter();
}

async function speakerHandleOpened(connId) {
  if (!SimplePeerLib) { log('SimplePeer not loaded', 'err'); return; }
  const stream = await captureSpeakerStream();
  if (!stream) {
    log('Speaker: nothing to stream — aborting connection ' + connId, 'err');
    return;
  }
  const tracks = stream.getTracks();
  log(`Speaker[${connId}]: streaming ${tracks.length} track(s)`, 'info');

  const peer = new SimplePeerLib({
    initiator: true,
    stream,
    trickle: true,
    config: RTC_CONFIG,
  });
  speakerPeers.set(connId, { peer });

  peer.on('signal', (sig) => {
    window.api.sendSignaling({ connId, type: 'signal', payload: sig });
  });
  peer.on('connect', () => log(`Speaker[${connId}]: P2P connected`, 'info'));
  peer.on('stream', (remote) => {
    log(`Speaker[${connId}]: receiving supporter audio (${remote.getAudioTracks().length} track)`, 'info');
    speakerInAudioEl.srcObject = remote;
    speakerInAudioEl.volume = Math.min(1, (netCfg && netCfg.incomingVolume) ?? 1);
    startLevelMeter(remote);
  });
  peer.on('error', (err) => log(`Speaker[${connId}] peer error: ${err.message}`, 'err'));
  peer.on('close', () => {
    log(`Speaker[${connId}]: peer closed`, 'info');
    speakerPeers.delete(connId);
  });
}

function speakerHandleSignal(connId, payload) {
  const entry = speakerPeers.get(connId);
  if (!entry) return;
  try { entry.peer.signal(payload); }
  catch (e) { log(`Speaker[${connId}] signal err: ${e.message}`, 'err'); }
}

function speakerHandleClosed(connId) {
  const entry = speakerPeers.get(connId);
  if (entry) {
    try { entry.peer.destroy(); } catch {}
    speakerPeers.delete(connId);
  }
}

async function ensureSupporterMic() {
  if (!netCfg || !netCfg.twoWay) return null;
  if (supporterMicTrack) return supporterMicTrack;
  try {
    supporterMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    supporterMicTrack = supporterMicStream.getAudioTracks()[0];
    supporterMicTrack.enabled = true;
    setPttStatus(true);
    log('Supporter mic active (transmitting to speaker)', 'info');
    return supporterMicTrack;
  } catch (e) {
    log('Supporter mic capture failed: ' + e.message, 'err');
    return null;
  }
}

async function ensureSupporterPeer() {
  if (supporterPeer) return supporterPeer;
  if (!SimplePeerLib) { log('SimplePeer not loaded', 'err'); return null; }
  const micTrack = await ensureSupporterMic();
  const localStream = micTrack ? supporterMicStream : undefined;

  supporterPeer = new SimplePeerLib({
    initiator: false,
    trickle: true,
    stream: localStream,
    config: RTC_CONFIG,
  });

  supporterPeer.on('signal', (sig) => {
    window.api.sendSignaling({ type: 'signal', payload: sig });
  });
  supporterPeer.on('connect', () => log('Supporter: P2P connected', 'info'));
  supporterPeer.on('stream', (remote) => {
    log(`Supporter: received remote stream (${remote.getAudioTracks().length} audio track)`, 'info');
    remoteAudioEl.srcObject = remote;
    remoteAudioEl.volume = Math.min(1, (netCfg && netCfg.incomingVolume) ?? 1);
    startLevelMeter(remote);
  });
  supporterPeer.on('error', (err) => log('Supporter peer error: ' + err.message, 'err'));
  supporterPeer.on('close', () => {
    log('Supporter: peer closed', 'info');
    supporterPeer = null;
    stopLevelMeter();
  });

  remoteAudioEl.onplaying = () => log('Supporter: <audio> is playing', 'info');
  remoteAudioEl.oncanplay = () => log('Supporter: <audio> canplay', 'info');
  remoteAudioEl.onerror = () => log('Supporter: <audio> error: ' + (remoteAudioEl.error?.message || 'unknown'), 'err');

  return supporterPeer;
}

function supporterHandleSignal(payload) {
  ensureSupporterPeer().then(peer => {
    if (!peer) return;
    try { peer.signal(payload); }
    catch (e) { log('Supporter signal err: ' + e.message, 'err'); }
  });
}

window.api.onSignaling((msg) => {
  const type = msg.type;
  if (type === 'opened') {
    if (netCfg && netCfg.role === 'speaker') speakerHandleOpened(msg.connId);
  } else if (type === 'closed') {
    if (netCfg && netCfg.role === 'speaker' && msg.connId) speakerHandleClosed(msg.connId);
    else if (netCfg && netCfg.role === 'supporter') {
      if (supporterPeer) { try { supporterPeer.destroy(); } catch {} supporterPeer = null; }
      if (remoteAudioEl) { try { remoteAudioEl.srcObject = null; } catch {} }
      stopLevelMeter();
    }
  } else if (type === 'signal') {
    if (netCfg && netCfg.role === 'speaker') speakerHandleSignal(msg.connId, msg.payload);
    else if (netCfg && netCfg.role === 'supporter') supporterHandleSignal(msg.payload);
  } else if (type === 'reject') {
    log('Network: rejected (' + (msg.reason || 'unknown') + ')', 'err');
  } else if (type === 'hello') {
    log('Network: connected as supporter (peer id ' + msg.id + ')', 'info');
  }
});

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
