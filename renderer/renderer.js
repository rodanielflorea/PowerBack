const slider = document.getElementById("slider");
const sliderFill = document.getElementById("sliderFill");
const stealthBtn = document.getElementById("stealthBtn");
const clickThroughBtn = document.getElementById("clickThroughBtn");
const endBtn = document.getElementById("endBtn");
const hideBtn = document.getElementById("hideBtn");
const quitBtn = document.getElementById("quitBtn");

const setupOverlay = document.getElementById("setupOverlay");
const setupModeCaption = document.getElementById("setupModeCaption");
const setupModeVoice = document.getElementById("setupModeVoice");
const setupRoleSpeaker = document.getElementById("setupRoleSpeaker");
const setupRoleSupporter = document.getElementById("setupRoleSupporter");
const setupPortBlock = document.getElementById("setupPortBlock");
const setupAddressBlock = document.getElementById("setupAddressBlock");
const setupPortEl = document.getElementById("setupPort");
const setupAddressEl = document.getElementById("setupAddress");
const setupSavePortBtn = document.getElementById("setupSavePortBtn");
const setupSaveAddressBtn = document.getElementById("setupSaveAddressBtn");
const setupStartBtn = document.getElementById("setupStartBtn");

const setupUrlList = document.getElementById("setupUrlList");
const setupUrlInput = document.getElementById("setupUrlInput");
const setupUrlAddBtn = document.getElementById("setupUrlAddBtn");

const setupCaptureLanguage = document.getElementById("setupCaptureLanguage");
const setupCapturePollMs = document.getElementById("setupCapturePollMs");

const setupEngineDeepgram = document.getElementById("setupEngineDeepgram");
const setupEngineLocal = document.getElementById("setupEngineLocal");
const setupDeepgramKey = document.getElementById("setupDeepgramKey");
const setupWhisperExe = document.getElementById("setupWhisperExe");
const setupWhisperExeBrowse = document.getElementById("setupWhisperExeBrowse");
const setupWhisperModel = document.getElementById("setupWhisperModel");
const setupWhisperModelBrowse = document.getElementById(
  "setupWhisperModelBrowse",
);
const setupVoiceLanguage = document.getElementById("setupVoiceLanguage");
const setupChunkSecondsRange = document.getElementById("setupChunkSecondsRange");
const setupChunkSecondsValue = document.getElementById("setupChunkSecondsValue");
const setupMicSelect = document.getElementById("setupMicSelect");
const setupCaptureMic = document.getElementById("setupCaptureMic");
const setupCaptureSystem = document.getElementById("setupCaptureSystem");

const setupMaxSupporters = document.getElementById("setupMaxSupporters");
const setupTwoWay = document.getElementById("setupTwoWay");

const urlMenuBtn = document.getElementById("urlMenuBtn");
const reloadBtn = document.getElementById("reloadBtn");
const settingsBtn = document.getElementById("settingsBtn");
const recBtn = document.getElementById("recBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const urlList = document.getElementById("urlList");
const urlInput = document.getElementById("urlInput");
const urlAddBtn = document.getElementById("urlAddBtn");

const modeVoice = document.getElementById("modeVoice");
const modeCaption = document.getElementById("modeCaption");

const micSelect = document.getElementById("micSelect");
const captureMicEl = document.getElementById("captureMic");
const captureSystemEl = document.getElementById("captureSystem");
const engineDeepgram = document.getElementById("engineDeepgram");
const engineLocal = document.getElementById("engineLocal");
const deepgramKeyEl = document.getElementById("deepgramKey");
const whisperExeEl = document.getElementById("whisperExe");
const whisperExeBrowse = document.getElementById("whisperExeBrowse");
const whisperModelEl = document.getElementById("whisperModel");
const whisperModelBrowse = document.getElementById("whisperModelBrowse");
const languageSelect = document.getElementById("languageSelect");
const chunkSecondsRange = document.getElementById("chunkSecondsRange");
const chunkSecondsValue = document.getElementById("chunkSecondsValue");
const chunkSecondsField = document.getElementById("chunkSecondsField");
const setupChunkSecondsField = document.getElementById("setupChunkSecondsField");
const chunkRailBtn = document.getElementById("chunkRailBtn");
const chunkRailValue = document.getElementById("chunkRailValue");
let chunkSecondsRuntime = 3.0;

function isWhisperEngine() {
  return (txCfg && txCfg.engine === "local");
}

function updateChunkUiVisibility() {
  const whisper = isWhisperEngine();
  if (chunkSecondsField) chunkSecondsField.hidden = !whisper;
  if (setupChunkSecondsField) setupChunkSecondsField.hidden = !whisper;
  updateChunkRail();
}

function updateChunkRail() {
  if (!chunkRailBtn) return;
  const isVoice = mode === "voice";
  chunkRailBtn.hidden = !isVoice || !isWhisperEngine();
  if (chunkRailValue) chunkRailValue.textContent = chunkSecondsRuntime.toFixed(1);
}
function setChunkSecondsEverywhere(v) {
  const clamped = Math.max(1, Math.min(10, parseFloat(v) || 3));
  chunkSecondsRuntime = clamped;
  if (chunkSecondsRange) chunkSecondsRange.value = String(clamped);
  if (chunkSecondsValue) chunkSecondsValue.textContent = clamped.toFixed(1);
  if (setupChunkSecondsRange) setupChunkSecondsRange.value = String(clamped);
  if (setupChunkSecondsValue) setupChunkSecondsValue.textContent = clamped.toFixed(1);
  if (chunkRailValue) chunkRailValue.textContent = clamped.toFixed(1);
}
if (chunkRailBtn) {
  chunkRailBtn.addEventListener("click", () => {
    if (typeof openSettings === "function") openSettings();
    if (typeof activateTab === "function") activateTab("voice");
  });
}

const captureRectEl = document.getElementById("captureRect");
const selectAreaBtn = document.getElementById("selectAreaBtn");
const captureLanguageEl = document.getElementById("captureLanguage");
const capturePollMsEl = document.getElementById("capturePollMs");
const captureShowOverlayEl = document.getElementById("captureShowOverlay");

const hotkeyList = document.getElementById("hotkeyList");
const resetAllHotkeysBtn = document.getElementById("resetAllHotkeysBtn");

const roleSpeaker = document.getElementById("roleSpeaker");
const roleSupporter = document.getElementById("roleSupporter");
const netAddressEl = document.getElementById("netAddress");
const maxSupportersEl = document.getElementById("maxSupporters");
const maxSupportersField = document.getElementById("maxSupportersField");
const netPortField = document.getElementById("netPortField");
const netPortEl = document.getElementById("netPort");
const netAddressField = document.getElementById("netAddressField");
const netActionBtn = document.getElementById("netActionBtn");
const netStopBtn = document.getElementById("netStopBtn");
const supportersBlock = document.getElementById("supportersBlock");
const supportersList = document.getElementById("supportersList");
const netFlag = document.getElementById("netFlag");
const netStatusEl = document.getElementById("netStatus");
const incomingVolumeEl = document.getElementById("incomingVolume");
const incomingVolumeVal = document.getElementById("incomingVolumeVal");
const twoWayEl = document.getElementById("twoWay");
const pttStatusEl = document.getElementById("pttStatus");
const incomingLevelFill = document.getElementById("incomingLevelFill");
const remoteAudioEl = document.getElementById("remoteAudio");
const speakerInAudioEl = document.getElementById("speakerInAudio");
const muteToggleBtn = document.getElementById("muteToggleBtn");

const logBody = document.getElementById("logBody");

let urls = [];
let txCfg = null;
let capCfg = null;
let mode = "voice";

function updateFill(opacity) {
  sliderFill.style.width = `${Math.round(opacity * 100)}%`;
}

function updateStealth(on) {
  stealthBtn.classList.toggle("on", on);
  stealthBtn.classList.toggle("off", !on);
  stealthBtn.title = on
    ? "Stealth ON — hidden from screen capture (click to disable)"
    : "Stealth OFF — visible to screen capture (click to enable)";
}

let sliderDragging = false;

function setOpacityFromEvent(e) {
  const rect = slider.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const opacity = x / rect.width;
  window.api.setOpacity(opacity);
  updateFill(opacity);
}

slider.addEventListener("mousedown", (e) => {
  e.preventDefault();
  sliderDragging = true;
  setOpacityFromEvent(e);
});

window.addEventListener("mousemove", (e) => {
  if (sliderDragging) setOpacityFromEvent(e);
});

window.addEventListener("mouseup", () => {
  sliderDragging = false;
});

window.addEventListener("mouseleave", () => {
  sliderDragging = false;
});

stealthBtn.addEventListener("click", async () => {
  const current = await window.api.getStealth();
  window.api.setStealth(!current);
});

function updateClickThrough(on) {
  if (!clickThroughBtn) return;
  clickThroughBtn.classList.toggle("on", on);
  clickThroughBtn.classList.toggle("off", !on);
  clickThroughBtn.title = on
    ? "Click-through ON — clicks pass through this window (Alt+Q to disable)"
    : "Click-through OFF — window receives clicks (Alt+Q to enable)";
}
if (clickThroughBtn) {
  clickThroughBtn.addEventListener("click", async () => {
    const current = await window.api.getClickThrough();
    window.api.setClickThrough(!current);
  });
  (async () => {
    try { updateClickThrough(await window.api.getClickThrough()); } catch {}
  })();
}
window.api.onClickThroughChanged((v) => updateClickThrough(v));

hideBtn.addEventListener("click", () => window.api.hide());
quitBtn.addEventListener("click", () => window.api.quit());

function applySetupRoleVisibility() {
  const isSpeaker = setupRoleSpeaker.checked;
  setupPortBlock.hidden = !isSpeaker;
  setupAddressBlock.hidden = isSpeaker;
  if (setupMaxSupporters) {
    const field = document.getElementById("setupMaxSupportersField");
    if (field) field.style.display = isSpeaker ? "" : "none";
  }
}

function activateSetupTab(name) {
  document
    .querySelectorAll(".stab-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.stab === name));
  document.querySelectorAll(".setup-tab-pane").forEach((p) => {
    p.hidden = p.dataset.stab !== name;
  });
}

document.querySelectorAll(".stab-btn").forEach((btn) => {
  btn.addEventListener("click", () => activateSetupTab(btn.dataset.stab));
});

function applySetupModeTabVisibility(activeMode) {
  const voiceTab = document.querySelector('.stab-btn[data-stab="voice"]');
  const captionTab = document.querySelector('.stab-btn[data-stab="caption"]');
  const isCaption = activeMode === "caption";
  if (voiceTab) voiceTab.style.display = isCaption ? "none" : "";
  if (captionTab) captionTab.style.display = isCaption ? "" : "none";
  const activeBtn = document.querySelector(".stab-btn.active");
  if (activeBtn && activeBtn.style.display === "none")
    activateSetupTab("essentials");
}

setupModeCaption.addEventListener("change", () => {
  if (setupModeCaption.checked) applySetupModeTabVisibility("caption");
});
setupModeVoice.addEventListener("change", () => {
  if (setupModeVoice.checked) applySetupModeTabVisibility("voice");
});

function flashSaved(el) {
  if (!el) return;
  el.classList.remove("save-flash");
  void el.offsetWidth;
  el.classList.add("save-flash");
  setTimeout(() => el.classList.remove("save-flash"), 1300);
}

function renderSetupUrlList(urlsArr) {
  setupUrlList.innerHTML = "";
  if (urlsArr.length === 0) {
    const empty = document.createElement("div");
    empty.className = "url-empty";
    empty.textContent = "No URLs added yet.";
    setupUrlList.appendChild(empty);
    return;
  }
  urlsArr.forEach((u, i) => {
    const row = document.createElement("div");
    row.className = "url-row";
    const txt = document.createElement("span");
    txt.className = "url-text";
    txt.textContent = u;
    const rm = document.createElement("button");
    rm.className = "url-remove";
    rm.textContent = "×";
    rm.title = "Remove";
    rm.addEventListener("click", async () => {
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
    await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    setupMicSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "System default";
    setupMicSelect.appendChild(def);
    mics.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.deviceId;
      o.textContent = m.label || `Microphone (${m.deviceId.slice(0, 6)})`;
      setupMicSelect.appendChild(o);
    });
    if (txCfg && txCfg.micDeviceId) setupMicSelect.value = txCfg.micDeviceId;
  } catch (e) {
    log("Setup mic enumeration failed: " + e.message, "err");
  }
}

[setupRoleSpeaker, setupRoleSupporter].forEach((el) => {
  el.addEventListener("change", applySetupRoleVisibility);
});

setupSavePortBtn.addEventListener("click", async () => {
  const port = parseInt(setupPortEl.value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    window.alert("Enter a valid port (1–65535)");
    return;
  }
  await window.api.setNetworkConfig({ speakerPort: port });
  flashSaved(setupPortEl);
  log(`Default port saved: ${port}`, "info");
});

setupSaveAddressBtn.addEventListener("click", async () => {
  const addr = setupAddressEl.value.trim();
  if (!/^[^:\s]+:\d+$/.test(addr)) {
    window.alert("Enter address as host:port (e.g. 172.16.98.11:2000)");
    return;
  }
  await window.api.setNetworkConfig({ supporterAddress: addr });
  flashSaved(setupAddressEl);
  log(`Default address saved: ${addr}`, "info");
});

setupUrlAddBtn.addEventListener("click", async () => {
  const u = normalizeUrl(setupUrlInput.value);
  if (!u) return;
  const data = await window.api.getUrls();
  const arr = data.urls.slice();
  arr.push(u);
  await window.api.setUrls(arr);
  setupUrlInput.value = "";
  renderSetupUrlList(arr);
});
setupUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") setupUrlAddBtn.click();
});

setupCaptureLanguage.addEventListener("change", () =>
  window.api.setCaptureConfig({ language: setupCaptureLanguage.value }),
);
setupCapturePollMs.addEventListener("change", () => {
  const v = parseInt(setupCapturePollMs.value, 10);
  if (Number.isFinite(v) && v >= 200)
    window.api.setCaptureConfig({ pollMs: v });
});

setupEngineDeepgram.addEventListener("change", () => {
  if (!setupEngineDeepgram.checked) return;
  txCfg = { ...(txCfg || {}), engine: "deepgram" };
  window.api.setTranscriptionConfig({ engine: "deepgram" });
  updateChunkUiVisibility();
});
setupEngineLocal.addEventListener("change", () => {
  if (!setupEngineLocal.checked) return;
  txCfg = { ...(txCfg || {}), engine: "local" };
  window.api.setTranscriptionConfig({ engine: "local" });
  updateChunkUiVisibility();
});
setupDeepgramKey.addEventListener("change", () =>
  window.api.setTranscriptionConfig({
    deepgramApiKey: setupDeepgramKey.value.trim(),
  }),
);
setupWhisperExe.addEventListener("change", () =>
  window.api.setTranscriptionConfig({
    whisperExe: setupWhisperExe.value.trim(),
  }),
);
setupWhisperModel.addEventListener("change", () =>
  window.api.setTranscriptionConfig({
    whisperModel: setupWhisperModel.value.trim(),
  }),
);
setupVoiceLanguage.addEventListener("change", () =>
  window.api.setTranscriptionConfig({ language: setupVoiceLanguage.value }),
);
setupCaptureMic.addEventListener("change", () =>
  window.api.setTranscriptionConfig({ captureMic: setupCaptureMic.checked }),
);
setupCaptureSystem.addEventListener("change", () =>
  window.api.setTranscriptionConfig({
    captureSystem: setupCaptureSystem.checked,
  }),
);
setupMicSelect.addEventListener("change", () =>
  window.api.setTranscriptionConfig({ micDeviceId: setupMicSelect.value }),
);
if (setupChunkSecondsRange) {
  setupChunkSecondsRange.addEventListener("input", () => setChunkSecondsEverywhere(setupChunkSecondsRange.value));
  setupChunkSecondsRange.addEventListener("change", () => window.api.setTranscriptionConfig({ chunkSeconds: chunkSecondsRuntime }));
}

setupWhisperExeBrowse.addEventListener("click", async () => {
  const p = await window.api.pickFile("exe");
  if (p) {
    setupWhisperExe.value = p;
    window.api.setTranscriptionConfig({ whisperExe: p });
  }
});
setupWhisperModelBrowse.addEventListener("click", async () => {
  const p = await window.api.pickFile("model");
  if (p) {
    setupWhisperModel.value = p;
    window.api.setTranscriptionConfig({ whisperModel: p });
  }
});

setupMaxSupporters.addEventListener("change", () => {
  const n = parseInt(setupMaxSupporters.value, 10);
  if (Number.isFinite(n) && n >= 1)
    window.api.setNetworkConfig({ maxSupporters: n });
});
if (setupTwoWay) setupTwoWay.addEventListener("change", () => {});

async function refreshSetupUI() {
  const m = await window.api.getMode();
  setupModeCaption.checked = m !== "voice";
  setupModeVoice.checked = m === "voice";
  applySetupModeTabVisibility(m === "voice" ? "voice" : "caption");

  const netC = await window.api.getNetworkConfig();
  const role = netC.role || "speaker";
  setupRoleSpeaker.checked = role === "speaker";
  setupRoleSupporter.checked = role === "supporter";
  setupPortEl.value = netC.speakerPort || parsePort(netC.address) || 2000;
  setupAddressEl.value =
    netC.supporterAddress ||
    (netC.address && !netC.address.startsWith("0.0.0.0")
      ? netC.address
      : "172.16.98.11:2000");
  setupMaxSupporters.value = netC.maxSupporters || 1;
  if (setupTwoWay) setupTwoWay.checked = true;
  applySetupRoleVisibility();

  const data = await window.api.getUrls();
  renderSetupUrlList(data.urls.slice());

  const tx = await window.api.getTranscriptionConfig();
  txCfg = tx;
  setupEngineDeepgram.checked = tx.engine !== "local";
  setupEngineLocal.checked = tx.engine === "local";
  setupDeepgramKey.value = tx.deepgramApiKey || "";
  setupWhisperExe.value = tx.whisperExe || "";
  setupWhisperModel.value = tx.whisperModel || "";
  setupVoiceLanguage.value = tx.language || "auto";
  setupCaptureMic.checked = tx.captureMic !== false;
  setupCaptureSystem.checked = tx.captureSystem !== false;
  setChunkSecondsEverywhere(tx.chunkSeconds);
  updateChunkUiVisibility();

  const cap = await window.api.getCaptureConfig();
  capCfg = cap;
  setupCaptureLanguage.value = cap.language || "English";
  setupCapturePollMs.value = cap.pollMs || 700;

  refreshSetupMicList();
}

function applyRoleClass(role) {
  document.body.classList.toggle("role-supporter", role === "supporter");
  document.body.classList.toggle("role-speaker", role === "speaker");
  const chatMain = document.getElementById("chatMain");
  if (chatMain) chatMain.hidden = role !== "supporter";
  applyRoleSettingsTabs(role === "supporter");
}

function applyRoleSettingsTabs(isSupporter) {
  const hiddenForSupporter = ["general", "voice", "caption", "hotkeys"];
  const shownForSupporter = ["network", "log", "help"];
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    if (isSupporter) {
      btn.style.display = hiddenForSupporter.includes(tab) ? "none" : "";
    } else {
      btn.style.display = "";
    }
  });
  if (isSupporter) {
    const activeBtn = document.querySelector(".tab-btn.active");
    if (activeBtn && activeBtn.style.display === "none") activateTab("network");
  }
}

function showSetup() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  setupOverlay.hidden = false;
  document.body.classList.remove("in-interview");
  endBtn.classList.remove("live");
  applyRoleClass("");
  window.api.setWebviewVisible(false);
  activateSetupTab("essentials");
  refreshSetupUI();
}

function hideSetup() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  setupOverlay.hidden = true;
  document.body.classList.add("in-interview");
  endBtn.classList.add("live");
  const role = setupRoleSpeaker.checked
    ? "speaker"
    : setupRoleSupporter.checked
      ? "supporter"
      : "";
  applyRoleClass(role);
  if (role === "supporter") {
    window.api.setWebviewVisible(false);
  } else {
    window.api.setWebviewVisible(true);
  }
}

setupStartBtn.addEventListener("click", async () => {
  const chosenMode = setupModeCaption.checked ? "caption" : "voice";
  const chosenRole = setupRoleSpeaker.checked ? "speaker" : "supporter";
  const patch = { role: chosenRole };
  if (chosenRole === "speaker") {
    const port = parseInt(setupPortEl.value, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      window.alert("Enter a valid port (1–65535)");
      return;
    }
    patch.speakerPort = port;
  } else {
    const addr = setupAddressEl.value.trim();
    if (!/^[^:\s]+:\d+$/.test(addr)) {
      window.alert("Enter address as host:port (e.g. 172.16.98.11:2000)");
      return;
    }
    patch.supporterAddress = addr;
  }
  await window.api.setMode(chosenMode);
  mode = chosenMode;
  updateModeToggleBtn();
  await window.api.setNetworkConfig(patch);
  netCfg = await window.api.getNetworkConfig();
  log(`Setup-start: netCfg refreshed (role=${netCfg.role || "none"})`, "info");
  await window.api.startNetwork();
  hideSetup();
  const showAddr =
    chosenRole === "speaker"
      ? `0.0.0.0:${patch.speakerPort}`
      : patch.supporterAddress;
  log(`Started: ${chosenMode} mode as ${chosenRole} on ${showAddr}`, "info");

  if (chosenMode === "caption") {
    const cap = await window.api.getCaptureConfig();
    if (!cap.rect) {
      log("Caption mode: pick a screen area to OCR", "info");
      pendingCaptureStart = true;
      setTimeout(() => window.api.selectCaptureArea(), 300);
    }
  }
});

const endModal = document.getElementById("endModal");
const endModalList = document.getElementById("endModalList");
const endModalCancel = document.getElementById("endModalCancel");
const endModalConfirm = document.getElementById("endModalConfirm");

function addModalItem(text, kind) {
  const li = document.createElement("li");
  if (kind) li.className = kind;
  li.appendChild(document.createTextNode(text));
  endModalList.appendChild(li);
}

async function showEndModal() {
  endModalList.innerHTML = "";
  if (recState) addModalItem("Voice transcription · running", "live");
  else if (captureRunning) addModalItem("Caption capture · running", "live");
  else addModalItem(`Active mode · ${mode || "none"} (idle)`, "idle");

  const status = await window.api.getNetworkStatus().catch(() => ({}));
  if (status.bound) {
    const n = (status.supporters || []).length;
    addModalItem(
      `Hosting on ${status.address} · ${n}/${status.maxSupporters} supporter${n === 1 ? "" : "s"}`,
      "live",
    );
  } else if (status.connected) {
    addModalItem(`Connected to ${status.address}`, "live");
  } else if (status.role) {
    addModalItem(`Network · ${status.role} (idle)`, "idle");
  }

  endModal.hidden = false;
  window.api.setWebviewVisible(false);
}

function hideEndModal() {
  endModal.hidden = true;
  if (setupOverlay.hidden && settingsOverlay.hidden)
    window.api.setWebviewVisible(true);
}

endBtn.addEventListener("click", showEndModal);
endModalCancel.addEventListener("click", hideEndModal);
endModalConfirm.addEventListener("click", async () => {
  endModal.hidden = true;
  await window.api.saveSessionLog().catch(() => {});
  if (recState) await stopVoice().catch(() => {});
  if (captureRunning) await stopCaption().catch(() => {});
  await window.api.stopNetwork();
  teardownPeers();
  delete netActionBtn.dataset.connecting;
  log("Session ended — back to setup", "info");
  showSetup();
});

document.addEventListener("keydown", (e) => {
  if (!endModal.hidden && e.key === "Escape") hideEndModal();
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
  if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) return "https://" + u;
  return null;
}

function renderUrlList() {
  urlList.innerHTML = "";
  if (urls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "url-empty";
    empty.textContent = "No URLs added yet.";
    urlList.appendChild(empty);
    return;
  }
  urls.forEach((url, i) => {
    const row = document.createElement("div");
    row.className = "url-row";
    const txt = document.createElement("span");
    txt.className = "url-text";
    txt.textContent = url;
    const rm = document.createElement("button");
    rm.className = "url-remove";
    rm.textContent = "×";
    rm.title = "Remove";
    rm.addEventListener("click", () => {
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

urlAddBtn.addEventListener("click", () => {
  const u = normalizeUrl(urlInput.value);
  if (!u) return;
  urls.push(u);
  window.api.setUrls(urls);
  urlInput.value = "";
  renderUrlList();
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") urlAddBtn.click();
});

urlMenuBtn.addEventListener("click", () => window.api.showUrlMenu());
reloadBtn.addEventListener("click", () => window.api.reloadWebview());

// --- Top URL bar: type a URL to navigate the loaded page directly. Useful when
// the site bounces to a human-verification page. ---
const urlInputBar = document.getElementById("urlInputBar");
const urlBackBtn = document.getElementById("urlBackBtn");
const urlForwardBtn = document.getElementById("urlForwardBtn");
const urlReloadBtn = document.getElementById("urlReloadBtn");
const urlGoBtn = document.getElementById("urlGoBtn");
let urlBarFocused = false;

function goToUrlBarValue() {
  const v = (urlInputBar.value || "").trim();
  if (v) window.api.navigateUrl(v);
  urlInputBar.blur();
}

if (urlInputBar) {
  urlInputBar.addEventListener("focus", () => {
    urlBarFocused = true;
    urlInputBar.select();
  });
  urlInputBar.addEventListener("blur", () => { urlBarFocused = false; });
  urlInputBar.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); goToUrlBarValue(); }
    else if (e.key === "Escape") { urlInputBar.blur(); }
  });
}
if (urlGoBtn) urlGoBtn.addEventListener("click", goToUrlBarValue);
if (urlBackBtn) urlBackBtn.addEventListener("click", () => window.api.webviewBack());
if (urlForwardBtn) urlForwardBtn.addEventListener("click", () => window.api.webviewForward());
if (urlReloadBtn) urlReloadBtn.addEventListener("click", () => window.api.reloadWebview());

function applyWebviewNav(info) {
  if (!info) return;
  // Don't clobber what the user is typing.
  if (!urlBarFocused && urlInputBar && typeof info.url === "string") {
    urlInputBar.value = info.url;
  }
  if (urlBackBtn) urlBackBtn.disabled = !info.canBack;
  if (urlForwardBtn) urlForwardBtn.disabled = !info.canForward;
}

window.api.onWebviewUrlChanged(applyWebviewNav);
if (window.api.getWebviewUrl) window.api.getWebviewUrl().then(applyWebviewNav);

const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".settings-tab");

function activateTab(name) {
  tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  tabPanels.forEach((p) => {
    p.hidden = p.dataset.tab !== name;
  });
}

tabBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tab);
    if (btn.dataset.tab === "log") loadPersistedLog();
  }),
);

const logOpenBtn = document.getElementById("logOpenBtn");
const logClearBtn = document.getElementById("logClearBtn");
const updaterVersionEl = document.getElementById("updaterVersion");
const updaterCheckBtn = document.getElementById("updaterCheckBtn");
const updaterInstallBtn = document.getElementById("updaterInstallBtn");
const updaterStatusEl = document.getElementById("updaterStatus");

if (window.api && window.api.getAppVersion) {
  window.api.getAppVersion().then((v) => {
    if (updaterVersionEl) updaterVersionEl.textContent = `version ${v}`;
  });
}

if (updaterCheckBtn)
  updaterCheckBtn.addEventListener("click", async () => {
    if (!updaterStatusEl) return;
    updaterStatusEl.textContent = "Checking…";
    const r = await window.api.checkForUpdates();
    if (!r.ok)
      updaterStatusEl.textContent = "Error: " + (r.message || "check failed");
  });

if (updaterInstallBtn)
  updaterInstallBtn.addEventListener("click", () =>
    window.api.installUpdateNow(),
  );

// ---- Session cookie export / import ----
const cookieExportBtn = document.getElementById("cookieExportBtn");
const cookieImportBtn = document.getElementById("cookieImportBtn");
const cookieStatusEl = document.getElementById("cookieStatus");
function setCookieStatus(msg) {
  if (cookieStatusEl) cookieStatusEl.textContent = msg;
}
if (cookieExportBtn)
  cookieExportBtn.addEventListener("click", async () => {
    setCookieStatus("Exporting…");
    const r = await window.api.exportCookies();
    if (r && r.ok) setCookieStatus(`Exported ${r.count} cookies. Keep this file private.`);
    else if (r && r.canceled) setCookieStatus("Export canceled.");
    else setCookieStatus("Export failed: " + ((r && r.error) || "unknown error"));
  });
if (cookieImportBtn)
  cookieImportBtn.addEventListener("click", async () => {
    setCookieStatus("Importing…");
    const r = await window.api.importCookies();
    if (r && r.ok)
      setCookieStatus(`Imported ${r.imported} cookies${r.skipped ? `, skipped ${r.skipped}` : ""}. Reloading the site…`);
    else if (r && r.canceled) setCookieStatus("Import canceled.");
    else setCookieStatus("Import failed: " + ((r && r.error) || "unknown error"));
  });

// Setup-wizard import (same handler) for restoring a session on a new machine.
const setupImportCookiesBtn = document.getElementById("setupImportCookiesBtn");
const setupCookieStatusEl = document.getElementById("setupCookieStatus");
if (setupImportCookiesBtn)
  setupImportCookiesBtn.addEventListener("click", async () => {
    if (setupCookieStatusEl) setupCookieStatusEl.textContent = "Importing…";
    const r = await window.api.importCookies();
    if (setupCookieStatusEl) {
      if (r && r.ok) setupCookieStatusEl.textContent = `Imported ${r.imported} cookies.`;
      else if (r && r.canceled) setupCookieStatusEl.textContent = "";
      else setupCookieStatusEl.textContent = "Failed: " + ((r && r.error) || "error");
    }
  });

// ---- Prompt library ----
const promptListEl = document.getElementById("promptList");
const promptTitleInput = document.getElementById("promptTitleInput");
const promptTextInput = document.getElementById("promptTextInput");
const promptSaveBtn = document.getElementById("promptSaveBtn");
const promptNewBtn = document.getElementById("promptNewBtn");
const promptStatusEl = document.getElementById("promptStatus");
const promptEditorTitle = document.getElementById("promptEditorTitle");
const promptRailBtn = document.getElementById("promptRailBtn");
let editingPromptId = null;

function setPromptStatus(msg) {
  if (promptStatusEl) promptStatusEl.textContent = msg || "";
}
function clearPromptEditor() {
  editingPromptId = null;
  if (promptTitleInput) promptTitleInput.value = "";
  if (promptTextInput) promptTextInput.value = "";
  if (promptEditorTitle) promptEditorTitle.textContent = "New prompt";
}
function renderPrompts(list) {
  if (!promptListEl) return;
  promptListEl.innerHTML = "";
  if (!list || list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "prompt-empty";
    empty.textContent = "No saved prompts yet. Add one below.";
    promptListEl.appendChild(empty);
    return;
  }
  const mkBtn = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };
  for (const p of list) {
    const row = document.createElement("div");
    row.className = "prompt-item";
    const title = document.createElement("span");
    title.className = "prompt-item-title";
    title.textContent = p.title;
    title.title = p.text;
    row.appendChild(title);
    row.appendChild(
      mkBtn("Insert", async () => {
        setPromptStatus("Inserting…");
        await window.api.injectToWebview(p.text);
        setPromptStatus('Inserted "' + p.title + '".');
      }),
    );
    row.appendChild(
      mkBtn("Copy", async () => {
        await window.api.copyText(p.text);
        setPromptStatus('Copied "' + p.title + '".');
      }),
    );
    row.appendChild(
      mkBtn("Edit", () => {
        editingPromptId = p.id;
        if (promptTitleInput) promptTitleInput.value = p.title;
        if (promptTextInput) promptTextInput.value = p.text;
        if (promptEditorTitle) promptEditorTitle.textContent = "Edit prompt";
        setPromptStatus('Editing "' + p.title + '".');
      }),
    );
    row.appendChild(
      mkBtn("Delete", async () => {
        const updated = await window.api.deletePrompt(p.id);
        renderPrompts(updated);
        if (editingPromptId === p.id) clearPromptEditor();
        setPromptStatus("Deleted.");
      }),
    );
    promptListEl.appendChild(row);
  }
}
if (promptSaveBtn)
  promptSaveBtn.addEventListener("click", async () => {
    const text = promptTextInput ? promptTextInput.value : "";
    if (!text.trim()) {
      setPromptStatus("Enter prompt text first.");
      return;
    }
    const title = promptTitleInput ? promptTitleInput.value : "";
    const updated = await window.api.savePrompt({ id: editingPromptId, title, text });
    renderPrompts(updated);
    clearPromptEditor();
    setPromptStatus("Saved.");
  });
if (promptNewBtn)
  promptNewBtn.addEventListener("click", () => {
    clearPromptEditor();
    setPromptStatus("");
  });
if (promptRailBtn)
  promptRailBtn.addEventListener("click", () => window.api.showPromptMenu());
if (window.api && window.api.getPrompts) window.api.getPrompts().then(renderPrompts);

if (window.api && window.api.onUpdaterStatus) {
  window.api.onUpdaterStatus((s) => {
    if (!updaterStatusEl) return;
    if (s.state === "checking")
      updaterStatusEl.textContent = "Checking for updates…";
    else if (s.state === "available")
      updaterStatusEl.textContent = `Update available: v${s.version}. Downloading…`;
    else if (s.state === "up-to-date")
      updaterStatusEl.textContent = "Up to date.";
    else if (s.state === "downloading")
      updaterStatusEl.textContent = `Downloading update… ${s.percent}%`;
    else if (s.state === "downloaded") {
      updaterStatusEl.textContent = `Update v${s.version} ready. Restart to install.`;
      if (updaterInstallBtn) updaterInstallBtn.hidden = false;
    } else if (s.state === "error")
      updaterStatusEl.textContent = "Updater error: " + s.message;
  });
}

if (logOpenBtn)
  logOpenBtn.addEventListener("click", () => window.api.logOpen());
if (logClearBtn)
  logClearBtn.addEventListener("click", async () => {
    if (!window.confirm("Clear the activity log file?")) return;
    await window.api.logClear();
    logBody.innerHTML = "";
    log("Log cleared", "info");
  });

function openSettings() {
  settingsOverlay.hidden = false;
  window.api.setWebviewVisible(false);
  const inInterview = document.body.classList.contains("in-interview");
  const isSupporter = netCfg && netCfg.role === "supporter";
  let defaultTab = "general";
  if (inInterview) defaultTab = "network";
  activateTab(defaultTab);
  refreshUrls();
  refreshModeUI();
  refreshTranscriptionUI();
  refreshCaptureUI();
  refreshMicList();
  refreshHotkeysUI();
  refreshNetworkUI();
  applyRoleSettingsTabs(isSupporter);
}

function closeSettings() {
  settingsOverlay.hidden = true;
  const isSupporter = netCfg && netCfg.role === "supporter";
  if (!isSupporter) window.api.setWebviewVisible(true);
}

settingsBtn.addEventListener("click", openSettings);
settingsCloseBtn.addEventListener("click", closeSettings);

function log(msg, kind = "") {
  const line = document.createElement("div");
  line.className =
    "log-line " +
    (kind === "err" ? "log-err" : kind === "info" ? "log-info" : "");
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${msg}`;
  logBody.appendChild(line);
  while (logBody.childElementCount > 500)
    logBody.removeChild(logBody.firstChild);
  logBody.scrollTop = logBody.scrollHeight;
  if (window.api && window.api.logAppend) {
    window.api
      .logAppend(`${kind ? "[" + kind + "] " : ""}${msg}`)
      .catch(() => {});
  }
}

async function loadPersistedLog() {
  if (!window.api || !window.api.logRecent) return;
  try {
    const lines = await window.api.logRecent();
    if (!lines || lines.length === 0) return;
    if (logBody.childElementCount > 0) return;
    for (const raw of lines) {
      const div = document.createElement("div");
      div.className = "log-line log-info";
      div.textContent = raw;
      logBody.appendChild(div);
    }
    logBody.scrollTop = logBody.scrollHeight;
  } catch {}
}

async function refreshModeUI() {
  mode = await window.api.getMode();
  modeVoice.checked = mode !== "caption";
  modeCaption.checked = mode === "caption";
  updateRecTitle();
  updateTabVisibility(mode);
  updateModeToggleBtn();
  updateChunkRail();
}

function updateTabVisibility(activeMode) {
  const voiceBtn = document.querySelector('.tab-btn[data-tab="voice"]');
  const captionBtn = document.querySelector('.tab-btn[data-tab="caption"]');
  const isCaption = activeMode === "caption";
  if (voiceBtn) voiceBtn.style.display = isCaption ? "none" : "";
  if (captionBtn) captionBtn.style.display = isCaption ? "" : "none";
  const hiddenActive = document.querySelector(".tab-btn.active");
  if (hiddenActive && hiddenActive.style.display === "none")
    activateTab("general");
}

function updateRecTitle() {
  const verb = recState || captureRunning ? "Stop" : "Start";
  const what = mode === "caption" ? "caption capture" : "voice transcription";
  recBtn.title = `${verb} ${what}`;
}

modeVoice.addEventListener("change", async () => {
  if (modeVoice.checked) {
    mode = "voice";
    await window.api.setMode("voice");
    updateRecTitle();
    updateTabVisibility("voice");
  }
});
modeCaption.addEventListener("change", async () => {
  if (modeCaption.checked) {
    mode = "caption";
    await window.api.setMode("caption");
    updateRecTitle();
    updateTabVisibility("caption");
  }
});

async function refreshTranscriptionUI() {
  txCfg = await window.api.getTranscriptionConfig();
  engineDeepgram.checked = txCfg.engine !== "local";
  engineLocal.checked = txCfg.engine === "local";
  deepgramKeyEl.value = txCfg.deepgramApiKey || "";
  whisperExeEl.value = txCfg.whisperExe || "";
  whisperModelEl.value = txCfg.whisperModel || "";
  languageSelect.value = txCfg.language || "auto";
  captureMicEl.checked = txCfg.captureMic !== false;
  captureSystemEl.checked = txCfg.captureSystem !== false;
  setChunkSecondsEverywhere(txCfg.chunkSeconds);
  updateChunkUiVisibility();
}

async function persistTx(patch) {
  txCfg = { ...(txCfg || {}), ...patch };
  await window.api.setTranscriptionConfig(patch);
}

engineDeepgram.addEventListener("change", () => {
  if (!engineDeepgram.checked) return;
  persistTx({ engine: "deepgram" });
  updateChunkUiVisibility();
});
engineLocal.addEventListener("change", () => {
  if (!engineLocal.checked) return;
  persistTx({ engine: "local" });
  updateChunkUiVisibility();
});
deepgramKeyEl.addEventListener("change", () =>
  persistTx({ deepgramApiKey: deepgramKeyEl.value.trim() }),
);
whisperExeEl.addEventListener("change", () =>
  persistTx({ whisperExe: whisperExeEl.value.trim() }),
);
whisperModelEl.addEventListener("change", () =>
  persistTx({ whisperModel: whisperModelEl.value.trim() }),
);
languageSelect.addEventListener("change", () =>
  persistTx({ language: languageSelect.value }),
);
captureMicEl.addEventListener("change", () =>
  persistTx({ captureMic: captureMicEl.checked }),
);
captureSystemEl.addEventListener("change", () =>
  persistTx({ captureSystem: captureSystemEl.checked }),
);
micSelect.addEventListener("change", () =>
  persistTx({ micDeviceId: micSelect.value }),
);
if (chunkSecondsRange) {
  chunkSecondsRange.addEventListener("input", () => setChunkSecondsEverywhere(chunkSecondsRange.value));
  chunkSecondsRange.addEventListener("change", () => persistTx({ chunkSeconds: chunkSecondsRuntime }));
}

whisperExeBrowse.addEventListener("click", async () => {
  const p = await window.api.pickFile("exe");
  if (p) {
    whisperExeEl.value = p;
    persistTx({ whisperExe: p });
  }
});
whisperModelBrowse.addEventListener("click", async () => {
  const p = await window.api.pickFile("model");
  if (p) {
    whisperModelEl.value = p;
    persistTx({ whisperModel: p });
  }
});

async function refreshCaptureUI() {
  capCfg = await window.api.getCaptureConfig();
  captureLanguageEl.value = capCfg.language || "English";
  capturePollMsEl.value = capCfg.pollMs || 700;
  if (captureShowOverlayEl) captureShowOverlayEl.checked = !!capCfg.showOverlay;
  renderCaptureRect(capCfg.rect);
}

function renderCaptureRect(rect) {
  if (!rect) {
    captureRectEl.value = "";
    captureRectEl.placeholder = "No area selected";
  } else {
    const w = rect.x2 - rect.x1;
    const h = rect.y2 - rect.y1;
    captureRectEl.value = `(${rect.x1}, ${rect.y1}) ${w}×${h}${rect.scaleFactor && rect.scaleFactor !== 1 ? ` @${rect.scaleFactor}x` : ""}`;
  }
}

async function persistCap(patch) {
  capCfg = { ...(capCfg || {}), ...patch };
  await window.api.setCaptureConfig(patch);
}

captureLanguageEl.addEventListener("change", () =>
  persistCap({ language: captureLanguageEl.value }),
);
if (captureShowOverlayEl)
  captureShowOverlayEl.addEventListener("change", () =>
    persistCap({ showOverlay: captureShowOverlayEl.checked }),
  );
capturePollMsEl.addEventListener("change", () => {
  const v = parseInt(capturePollMsEl.value, 10);
  if (Number.isFinite(v) && v >= 200) persistCap({ pollMs: v });
});
selectAreaBtn.addEventListener("click", async () => {
  log("Selecting capture area — drag a rectangle, Esc to cancel", "info");
  await window.api.selectCaptureArea();
});

window.api.onCaptureRectChanged((rect) => {
  capCfg = { ...(capCfg || {}), rect };
  renderCaptureRect(rect);
  log(
    `Capture area set: ${rect.x1},${rect.y1} → ${rect.x2},${rect.y2}`,
    "info",
  );
  if (pendingCaptureStart) {
    pendingCaptureStart = false;
    window.api.startCaptureLoop();
    log("Auto-starting caption capture with new area", "info");
  }
});

const HOTKEY_LABELS = {
  toggleVisibility: "Toggle window visibility",
  moveLeft: "Move window left",
  moveRight: "Move window right",
  moveUp: "Move window up",
  moveDown: "Move window down",
  opacityUp: "Opacity up",
  opacityDown: "Opacity down",
  scrollUp: "Scroll page up",
  scrollDown: "Scroll page down",
  resetCaptureArea: "Reset capture area (re-pick)",
  reloadSite: "Reload site",
  toggleStealth: "Toggle stealth",
  toggleRecording: "Start/stop voice or caption",
  toggleMode: "Toggle OCR ↔ Voice mode",
  pushToTalk: "Push-to-talk (toggle supporter mic)",
  closeSticky: "Close sticky note",
  openSticky: "Open sticky note",
  stickyScrollUp: "Scroll sticky note up",
  stickyScrollDown: "Scroll sticky note down",
  helpRequest: "Send help request (speaker → supporter)",
  submitPrompt: "Submit prompt in Claude/ChatGPT",
  screenshotToAI: "Screenshot active screen → paste to AI",
  toggleClickThrough: "Toggle click-through (mouse passes through)",
};

function eventToBinding(e) {
  const key = e.key;
  if (["Control", "Alt", "Shift", "Meta", "Dead"].includes(key)) return null;
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  const map = {
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
    " ": "Space",
    Escape: "Esc",
    Enter: "Return",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
  };
  let k;
  if (map[key]) k = map[key];
  else if (key.length === 1) k = key.toUpperCase();
  else if (/^F\d{1,2}$/.test(key)) k = key;
  else k = key;
  parts.push(k);
  return parts.join("+");
}

let hotkeyState = { current: {}, defaults: {}, failures: {} };
let capturingFor = null;
let captureKeyHandler = null;

async function refreshHotkeysUI() {
  hotkeyState = await window.api.getHotkeys();
  renderHotkeyList();
}

function renderHotkeyList() {
  hotkeyList.innerHTML = "";
  for (const action of Object.keys(HOTKEY_LABELS)) {
    const row = document.createElement("div");
    row.className = "hotkey-row";

    const label = document.createElement("span");
    label.className = "hotkey-label";
    label.textContent = HOTKEY_LABELS[action];
    row.appendChild(label);

    const binding = document.createElement("button");
    binding.className = "hotkey-binding";
    const combo = hotkeyState.current[action] || "";
    if (capturingFor === action) {
      binding.textContent = "Press keys…";
      binding.classList.add("capturing");
    } else if (!combo) {
      binding.textContent = "(disabled)";
      binding.classList.add("empty");
    } else {
      binding.textContent = combo;
      if (hotkeyState.failures && hotkeyState.failures[action]) {
        binding.classList.add("failed");
        binding.title = hotkeyState.failures[action];
      }
    }
    binding.addEventListener("click", () => beginCapture(action));
    row.appendChild(binding);

    const reset = document.createElement("button");
    reset.className = "hotkey-reset";
    reset.textContent = "reset";
    reset.title =
      "Reset to default: " + (hotkeyState.defaults[action] || "(none)");
    reset.addEventListener("click", async () => {
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
    if (
      e.key === "Escape" &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.metaKey
    ) {
      cancelCapture();
      renderHotkeyList();
      return;
    }
    if (
      e.key === "Backspace" &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.metaKey
    ) {
      const a = capturingFor;
      cancelCapture();
      await window.api.setHotkey(a, "");
      return;
    }
    const combo = eventToBinding(e);
    if (!combo) return;
    const a = capturingFor;
    cancelCapture();
    await window.api.setHotkey(a, combo);
  };
  document.addEventListener("keydown", captureKeyHandler, true);
}

function cancelCapture() {
  if (captureKeyHandler) {
    document.removeEventListener("keydown", captureKeyHandler, true);
    captureKeyHandler = null;
  }
  capturingFor = null;
}

resetAllHotkeysBtn.addEventListener("click", async () => {
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

window.api.onToggleMode(() => {
  doToggleMode();
});

window.api.onSelectorClosed(() => {
  if (!settingsOverlay.hidden) closeSettings();
});

let interimEl = null;
let injectedSegment = ""; // chars of the in-progress segment currently in the input

function clearInterimPreview() {
  if (interimEl) {
    interimEl.remove();
    interimEl = null;
  }
}
function showInterimPreview(text) {
  if (!interimEl) {
    interimEl = document.createElement("div");
    interimEl.className = "log-entry log-interim";
    logBody.appendChild(interimEl);
  }
  interimEl.textContent = "⟳ " + text;
  logBody.scrollTop = logBody.scrollHeight;
}
function commonPrefixLen(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}
// Stream the transcript into the AI input word-by-word as you speak. Each update
// edits only the TAIL that changed: when Deepgram revises a word we delete the
// wrong tail and retype it, so the box always reflects Deepgram's best current
// guess and self-corrects — instead of dumping a whole finalized block at once.
function streamSegment(text, isFinal) {
  const common = commonPrefixLen(injectedSegment, text);
  const deleteCount = injectedSegment.length - common;
  const insert = text.slice(common);
  if (deleteCount > 0 || insert) window.api.webviewEditTail(deleteCount, insert);
  injectedSegment = text;
  if (isFinal) {
    window.api.webviewEditTail(0, " "); // lock the segment with a trailing space
    injectedSegment = "";
  }
}
// Coalesce the stream of interim hypotheses to a steady ~12fps so the input
// updates smoothly (like a live caption) instead of stuttering on every packet.
let pendingInterim = null;
let interimFlushTimer = null;
const CAPTION_FLUSH_MS = 80;
function scheduleInterimFlush() {
  if (interimFlushTimer) return;
  interimFlushTimer = setTimeout(() => {
    interimFlushTimer = null;
    if (pendingInterim != null) {
      const t = pendingInterim;
      pendingInterim = null;
      streamSegment(t, false);
      showInterimPreview(t);
    }
  }, CAPTION_FLUSH_MS);
}
window.api.onTranscriptLive(({ text, isFinal }) => {
  if (!text) return;
  if (isFinal) {
    // Apply finals immediately; drop any queued interim (the final supersedes it).
    if (interimFlushTimer) { clearTimeout(interimFlushTimer); interimFlushTimer = null; }
    pendingInterim = null;
    streamSegment(text, true);
    clearInterimPreview();
    log(text.trim());
  } else {
    pendingInterim = text;
    scheduleInterimFlush();
  }
});
// Utterance boundary (vad_events): close out a segment that never got a final so
// trailing words aren't left hanging, and clear the live preview.
window.api.onUtteranceEnd(() => {
  // Apply any queued interim before closing the segment so words aren't lost.
  if (interimFlushTimer) { clearTimeout(interimFlushTimer); interimFlushTimer = null; }
  if (pendingInterim != null) { streamSegment(pendingInterim, false); pendingInterim = null; }
  if (injectedSegment) {
    window.api.webviewEditTail(0, " ");
    injectedSegment = "";
  }
  clearInterimPreview();
});
window.api.onTranscriptLiveError((msg) => {
  log("Deepgram error: " + msg, "err");
  if (recState && recState.deepgram) {
    recState = null;
    recBtn.classList.remove("on");
    updateRecTitle();
  }
});

window.api.onCaptureText((text) => {
  log("OCR: " + text);
  window.api.sessionLogAdd({ ts: Date.now(), kind: "ocr", text });
});
window.api.onCaptureError((msg) => log("OCR error: " + msg, "err"));
window.api.onCaptureState((on) => {
  captureRunning = !!on;
  recBtn.classList.toggle("on", captureRunning);
  updateRecTitle();
});

async function refreshMicList() {
  try {
    await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    micSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "System default";
    micSelect.appendChild(def);
    mics.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.deviceId;
      o.textContent = m.label || `Microphone (${m.deviceId.slice(0, 6)})`;
      micSelect.appendChild(o);
    });
    if (txCfg && txCfg.micDeviceId) micSelect.value = txCfg.micDeviceId;
  } catch (e) {
    log("Mic enumeration failed: " + e.message, "err");
  }
}

let recState = null;
let captureRunning = false;

const modeToggleBtn = document.getElementById("modeToggleBtn");
const selectAreaRailBtn = document.getElementById("selectAreaRailBtn");

function updateModeToggleBtn() {
  if (!modeToggleBtn) return;
  const isVoice = mode === "voice";
  modeToggleBtn.textContent = isVoice ? "Voice" : "OCR";
  modeToggleBtn.classList.toggle("mode-voice", isVoice);
  modeToggleBtn.title = isVoice
    ? "Currently: Voice — click or Alt+D to switch to OCR mode"
    : "Currently: OCR — click or Alt+D to switch to Voice mode";
}

async function doToggleMode() {
  const newMode = mode === "voice" ? "caption" : "voice";
  const wasRunning = !!(recState || captureRunning);
  if (recState) await stopVoice().catch(() => {});
  if (captureRunning) await stopCaption().catch(() => {});
  mode = newMode;
  await window.api.setMode(newMode);
  updateRecTitle();
  updateTabVisibility(newMode);
  updateModeToggleBtn();
  log("Mode switched to " + (newMode === "voice" ? "Voice" : "OCR"), "info");
  if (wasRunning) {
    if (newMode === "voice") {
      startVoice().catch((e) =>
        log("Auto-start voice failed: " + e.message, "err"),
      );
    } else {
      startCaption().catch((e) =>
        log("Auto-start caption failed: " + e.message, "err"),
      );
    }
  }
}

if (modeToggleBtn) modeToggleBtn.addEventListener("click", doToggleMode);

async function startVoice() {
  if (recState) return;
  txCfg = await window.api.getTranscriptionConfig();

  if (txCfg.engine === "deepgram") {
    if (!txCfg.deepgramApiKey) {
      log("Deepgram API key not set", "err");
      return;
    }

    await window.api.startDeepgramStream({
      apiKey: txCfg.deepgramApiKey,
      language: txCfg.language || "auto",
    });

    const ctx = new AudioContext({ sampleRate: 16000 });
    const dest = ctx.createMediaStreamDestination();
    const streams = [];

    if (txCfg.captureMic !== false) {
      try {
        // Match the reference project: clean the mic with echo cancellation and
        // noise suppression — this measurably improves recognition accuracy.
        const baseAudio = {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        };
        const constraints = {
          audio: txCfg.micDeviceId
            ? { ...baseAudio, deviceId: { exact: txCfg.micDeviceId } }
            : baseAudio,
          video: false,
        };
        const mic = await navigator.mediaDevices.getUserMedia(constraints);
        streams.push(mic);
        ctx.createMediaStreamSource(mic).connect(dest);
        log("Mic capture started", "info");
      } catch (e) {
        log("Mic failed: " + e.message, "err");
      }
    }

    if (txCfg.captureSystem !== false) {
      const attachSystemAudio = (stream, label) => {
        stream.getVideoTracks().forEach((t) => t.stop());
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          streams.push(stream);
          ctx.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest);
          log("System audio capture started" + label, "info");
          return true;
        }
        stream.getTracks().forEach((t) => t.stop());
        return false;
      };
      let sysOk = false;
      // Primary: WASAPI loopback via chromeMediaSource:'desktop' (more reliable).
      try {
        const sourceId = await window.api.getDesktopSourceId();
        if (!sourceId) throw new Error("no desktop source");
        const sys = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId },
          },
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              maxWidth: 1,
              maxHeight: 1,
              maxFrameRate: 1,
            },
          },
        });
        sysOk = attachSystemAudio(sys, " (loopback)");
      } catch (e) {
        log("System loopback failed (" + e.message + "); trying display capture…", "info");
      }
      // Fallback: the previous getDisplayMedia path.
      if (!sysOk) {
        try {
          const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          sysOk = attachSystemAudio(sys, "");
          if (!sysOk) log("System audio: no audio track returned", "err");
        } catch (e) {
          log("System audio failed: " + e.message, "err");
        }
      }
    }

    try {
      await ctx.audioWorklet.addModule("audio-capture-worklet.js");
    } catch (e) {
      log("AudioWorklet load failed: " + e.message, "err");
      try { await ctx.close(); } catch {}
      streams.forEach((s) => s.getTracks && s.getTracks().forEach((t) => t.stop()));
      return;
    }
    const processor = new AudioWorkletNode(ctx, "capture-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { format: "int16", batchSize: 1600 },
    });
    ctx.createMediaStreamSource(dest.stream).connect(processor);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    processor.connect(sink).connect(ctx.destination);
    processor.port.onmessage = (e) => {
      window.api.sendAudioChunk(e.data);
    };

    recState = { ctx, streams, processor, deepgram: true };
    recBtn.classList.add("on");
    updateRecTitle();
    log("Voice transcription started (Deepgram live)", "info");
    return;
  }

  return startVoiceChunked();
}

async function startVoiceChunked() {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const streams = [];
  const sources = [];

  if (txCfg.captureMic !== false) {
    try {
      const constraints = {
        audio: txCfg.micDeviceId
          ? {
              deviceId: { exact: txCfg.micDeviceId },
              echoCancellation: true,
              noiseSuppression: true,
            }
          : { echoCancellation: true, noiseSuppression: true },
      };
      const mic = await navigator.mediaDevices.getUserMedia(constraints);
      streams.push(mic);
      const src = ctx.createMediaStreamSource(mic);
      const g = ctx.createGain();
      g.gain.value = 1.0;
      src.connect(g).connect(dest);
      sources.push(src);
      log("Mic capture started", "info");
    } catch (e) {
      log("Mic capture failed: " + e.message, "err");
    }
  }

  if (txCfg.captureSystem !== false) {
    try {
      const sys = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      sys.getVideoTracks().forEach((t) => t.stop());
      const audioOnly = new MediaStream(sys.getAudioTracks());
      if (audioOnly.getAudioTracks().length === 0) {
        log("System loopback returned no audio track", "err");
      } else {
        streams.push(sys);
        const src = ctx.createMediaStreamSource(audioOnly);
        const g = ctx.createGain();
        g.gain.value = 1.0;
        src.connect(g).connect(dest);
        sources.push(src);
        log("System loopback started", "info");
      }
    } catch (e) {
      log("System loopback failed: " + e.message, "err");
    }
  }

  if (sources.length === 0) {
    log("No audio sources — aborting", "err");
    ctx.close();
    return;
  }

  const sampleRate = ctx.sampleRate;
  try {
    await ctx.audioWorklet.addModule("audio-capture-worklet.js");
  } catch (e) {
    log("AudioWorklet load failed: " + e.message, "err");
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    try { await ctx.close(); } catch {}
    return;
  }
  const processor = new AudioWorkletNode(ctx, "capture-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: {
      format: "float32",
      batchSize: Math.max(128, Math.round(sampleRate * 0.1)),
    },
  });
  const mixSource = ctx.createMediaStreamSource(dest.stream);
  mixSource.connect(processor);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  processor.connect(sink).connect(ctx.destination);

  let buffered = [];
  let bufferedLen = 0;
  const initialCs = Math.max(1, Math.min(10, parseFloat(txCfg.chunkSeconds) || 3));
  chunkSecondsRuntime = initialCs;

  processor.port.onmessage = (e) => {
    const data = new Float32Array(e.data);
    buffered.push(data);
    bufferedLen += data.length;
    const targetSamples = sampleRate * chunkSecondsRuntime;
    if (bufferedLen >= targetSamples) {
      const samples = flatten(buffered, bufferedLen);
      buffered = [];
      bufferedLen = 0;
      const mono16k = downsampleTo16k(samples, sampleRate);
      if (!isSilent(mono16k)) {
        const wav = encodeWav(mono16k, 16000);
        runTranscription(wav).catch((err) =>
          log("Transcribe error: " + err.message, "err"),
        );
      }
    }
  };

  recState = { ctx, streams, processor };
  recBtn.classList.add("on");
  updateRecTitle();
  log("Voice transcription started (engine: " + txCfg.engine + ")", "info");
}

async function stopVoice() {
  if (!recState) return;
  if (recState.deepgram) {
    try {
      recState.processor.disconnect();
    } catch {}
    recState.streams.forEach((s) =>
      s.getTracks ? s.getTracks().forEach((t) => t.stop()) : null,
    );
    try {
      await recState.ctx.close();
    } catch {}
    await window.api.stopDeepgramStream();
    recState = null;
    recBtn.classList.remove("on");
    updateRecTitle();
    log("Voice transcription stopped", "info");
    return;
  }
  try {
    recState.processor.disconnect();
  } catch {}
  recState.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  try {
    await recState.ctx.close();
  } catch {}
  recState = null;
  recBtn.classList.remove("on");
  updateRecTitle();
  log("Voice transcription stopped", "info");
}

let pendingCaptureStart = false;

async function startCaption() {
  capCfg = await window.api.getCaptureConfig();
  if (!capCfg.rect) {
    log(
      "No capture area — opening selector. Capture will auto-start once you pick.",
      "info",
    );
    pendingCaptureStart = true;
    await window.api.selectCaptureArea();
    return;
  }
  await window.api.startCaptureLoop();
  log(
    "Caption capture started (" +
      (capCfg.language || "English") +
      ", poll " +
      (capCfg.pollMs || 700) +
      "ms)",
    "info",
  );
}

async function stopCaption() {
  await window.api.stopCaptureLoop();
  log("Caption capture stopped", "info");
}

recBtn.addEventListener("click", async () => {
  if (mode === "caption") {
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
    await window.api.injectToWebview(text + " ");
  }
}

function flatten(chunks, total) {
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
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

(async () => {
  try {
    netCfg = await window.api.getNetworkConfig();
    log(`Init: netCfg loaded (role=${netCfg.role || "none"})`, "info");
  } catch (e) {
    log("Init: netCfg load failed: " + e.message, "err");
  }
})();

async function refreshNetworkUI() {
  netCfg = await window.api.getNetworkConfig();
  const status = await window.api.getNetworkStatus();
  roleSpeaker.checked = netCfg.role === "speaker" || !netCfg.role;
  roleSupporter.checked = netCfg.role === "supporter";
  netAddressEl.value = netCfg.address || "";
  const port = parsePort(netCfg.address) || 2000;
  if (netPortEl) netPortEl.value = port;
  maxSupportersEl.value = netCfg.maxSupporters || 1;
  if (twoWayEl) twoWayEl.checked = true;
  const v = Math.round((netCfg.incomingVolume ?? 1) * 100);
  incomingVolumeEl.value = v;
  incomingVolumeVal.textContent = v + "%";
  applyIncomingVolume(netCfg.incomingVolume ?? 1);
  updateRoleVisibility();
  renderNetStatus(status);
}

function parsePort(addr) {
  const m = String(addr || "").match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function parseHost(addr) {
  const m = String(addr || "").match(/^([^:]+):/);
  return m ? m[1] : "";
}

function updateRoleVisibility() {
  const isSpeaker = netCfg && netCfg.role === "speaker";
  const isSupporter = netCfg && netCfg.role === "supporter";
  if (maxSupportersField)
    maxSupportersField.style.display = isSpeaker ? "" : "none";
  if (netPortField) netPortField.style.display = isSpeaker ? "" : "none";
  if (netAddressField)
    netAddressField.style.display = isSupporter ? "" : "none";
  if (!netCfg || !netCfg.role) {
    netActionBtn.textContent = "Pick a role first";
    netActionBtn.disabled = true;
  } else {
    netActionBtn.disabled = false;
    netActionBtn.textContent = isSpeaker
      ? "Start hosting"
      : "Connect to speaker";
  }
}

function renderSupportersList(status) {
  if (!supportersBlock || !supportersList) return;
  const role = (netCfg && netCfg.role) || status.role;
  const isSpeaker = role === "speaker" && status.bound;
  if (!isSpeaker) {
    supportersBlock.hidden = true;
    return;
  }
  supportersBlock.hidden = false;
  supportersList.innerHTML = "";
  const ids = status.supporters || [];
  if (ids.length === 0) {
    const empty = document.createElement("div");
    empty.className = "supporters-empty";
    empty.textContent = "Waiting for supporters…";
    supportersList.appendChild(empty);
    return;
  }
  ids.forEach((entry) => {
    const id = typeof entry === "object" ? entry.id : entry;
    const ip = typeof entry === "object" && entry.ip ? entry.ip : null;
    const row = document.createElement("div");
    row.className = "supporter-row";
    const dot = document.createElement("span");
    dot.className = "supporter-dot";
    const label = document.createElement("span");
    label.className = "supporter-label";
    label.textContent = `#${id}`;
    const ipEl = document.createElement("span");
    ipEl.className = "supporter-ip";
    ipEl.textContent = ip || "unknown IP";
    if (!ip) ipEl.classList.add("unknown");
    const kick = document.createElement("button");
    kick.className = "supporter-kick";
    kick.textContent = "Kick";
    kick.title = ip ? `Disconnect ${ip}` : "Disconnect this supporter";
    kick.addEventListener("click", async () => {
      const who = ip ? `Supporter #${id} (${ip})` : `Supporter #${id}`;
      if (!window.confirm(`Disconnect ${who}?`)) return;
      await window.api.kickSupporter(id);
      log(`Kicked ${who}`, "info");
    });
    row.appendChild(dot);
    row.appendChild(label);
    row.appendChild(ipEl);
    row.appendChild(kick);
    supportersList.appendChild(row);
  });
}

function renderNetStatus(status) {
  if (!netStatusEl || !netFlag) return;
  let flagText = "IDLE";
  let flagCls = "";
  let txt;
  const role = (netCfg && netCfg.role) || status.role;
  if (status.bound && role === "speaker") {
    const hasSupporters = status.supporters.length > 0;
    flagText = hasSupporters ? "CONNECTED" : "HOSTING";
    flagCls = hasSupporters ? "connected" : "hosting";
    txt = `Hosting on ${status.address} · ${status.supporters.length}/${status.maxSupporters} supporter(s)`;
    netActionBtn.hidden = true;
    netStopBtn.hidden = false;
    netStopBtn.textContent = "Stop hosting";
  } else if (role === "supporter" && status.connected) {
    flagText = "CONNECTED";
    flagCls = "connected";
    txt = `Connected to ${status.address}`;
    netActionBtn.hidden = true;
    netStopBtn.hidden = false;
    netStopBtn.textContent = "Disconnect";
  } else if (role === "supporter" && netActionBtn.dataset.connecting === "1") {
    flagText = "DIALING";
    flagCls = "connecting";
    txt = `Dialing ${status.address}…`;
    netActionBtn.hidden = true;
    netStopBtn.hidden = false;
    netStopBtn.textContent = "Cancel";
  } else {
    flagText = "IDLE";
    flagCls = "";
    txt = role
      ? `Idle. Press the action button to start.`
      : `Pick a role and start.`;
    netActionBtn.hidden = false;
    netStopBtn.hidden = true;
  }
  netFlag.textContent = flagText;
  netFlag.className = "status-flag" + (flagCls ? " " + flagCls : "");
  netStatusEl.textContent = txt;
  renderSupportersList(status);
}

async function persistNet(patch) {
  netCfg = { ...(netCfg || {}), ...patch };
  await window.api.setNetworkConfig(patch);
}

[roleSpeaker, roleSupporter].forEach((el) => {
  el.addEventListener("change", async () => {
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
      if (
        !window.confirm(
          "Switching role will disconnect the current session. Continue?",
        )
      ) {
        roleSpeaker.checked = netCfg.role === "speaker";
        roleSupporter.checked = netCfg.role === "supporter";
        return;
      }
      await window.api.stopNetwork();
      await persistNet({ role });
      teardownPeers();
      updateRoleVisibility();
    }
  });
});

netActionBtn.addEventListener("click", async () => {
  if (!netCfg || !netCfg.role) return;
  const role = netCfg.role;
  const addr = netAddressEl.value.trim();
  if (!addr) {
    window.alert("Enter an address first.");
    return;
  }
  await persistNet({ address: addr });
  const msg =
    role === "speaker"
      ? `Start hosting on ${addr}?\n\nThis will:\n  • Bind a WebSocket server on the port\n  • Capture your microphone + system audio when a supporter connects\n  • Stream audio to up to ${netCfg.maxSupporters || 1} supporter(s)`
      : `Connect to ${addr}?\n\nThis will:\n  • Open a WebSocket connection to the speaker\n  • Receive their microphone + system audio\n  • Auto-reconnect every 5s if dropped`;
  if (!window.confirm(msg)) return;
  if (role === "supporter") netActionBtn.dataset.connecting = "1";
  await window.api.startNetwork();
  const status = await window.api.getNetworkStatus();
  renderNetStatus(status);
});

netStopBtn.addEventListener("click", async () => {
  await window.api.stopNetwork();
  teardownPeers();
  delete netActionBtn.dataset.connecting;
  const status = await window.api.getNetworkStatus();
  renderNetStatus(status);
});

if (muteToggleBtn)
  muteToggleBtn.addEventListener("click", () => toggleMicMute());

netAddressEl.addEventListener("change", () =>
  persistNet({ address: netAddressEl.value.trim() }),
);
if (netPortEl)
  netPortEl.addEventListener("change", () => {
    const port = parseInt(netPortEl.value, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) return;
    const host = parseHost(netCfg && netCfg.address) || "0.0.0.0";
    persistNet({ address: `${host}:${port}` });
    netAddressEl.value = `${host}:${port}`;
  });
maxSupportersEl.addEventListener("change", () => {
  const n = parseInt(maxSupportersEl.value, 10);
  if (Number.isFinite(n) && n >= 1) persistNet({ maxSupporters: n });
});
if (twoWayEl) twoWayEl.addEventListener("change", () => {});

incomingVolumeEl.addEventListener("input", () => {
  const v = Math.min(100, parseInt(incomingVolumeEl.value, 10)) / 100;
  incomingVolumeVal.textContent = Math.round(v * 100) + "%";
  applyIncomingVolume(v);
  persistNet({ incomingVolume: v });
});

window.api.onNetworkStatus((status) => renderNetStatus(status));
window.api.onNetworkError((msg) => {
  log("Network: " + msg, "err");
  if (netStatusEl) {
    netStatusEl.textContent = "Status: " + msg;
    netStatusEl.classList.remove("live");
    netStatusEl.classList.add("error");
  }
});

const RTC_CONFIG = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ],
    },
  ],
  iceTransportPolicy: "all",
};

function describeCandidate(c) {
  const m = (c || "").match(
    /candidate:\S+\s+\d+\s+(\S+)\s+\d+\s+(\S+)\s+(\d+)\s+typ\s+(\S+)/,
  );
  if (!m) return c || "";
  return `${m[4]} ${m[1]} ${m[2]}:${m[3]}`;
}

function attachPcDiagnostics(peer, label) {
  const tryAttach = () => {
    const pc = peer && peer._pc;
    if (!pc) return false;
    pc.addEventListener("iceconnectionstatechange", () =>
      log(`${label}: iceConnectionState=${pc.iceConnectionState}`, "info"),
    );
    pc.addEventListener("connectionstatechange", () =>
      log(`${label}: connectionState=${pc.connectionState}`, "info"),
    );
    pc.addEventListener("icegatheringstatechange", () =>
      log(`${label}: iceGatheringState=${pc.iceGatheringState}`, "info"),
    );
    pc.addEventListener("icecandidateerror", (ev) =>
      log(
        `${label}: ICE candidate error: ${ev.errorText || ev.errorCode || "unknown"} (host=${ev.hostCandidate || ""})`,
        "err",
      ),
    );
    pc.addEventListener("icecandidate", (ev) => {
      if (ev.candidate && ev.candidate.candidate) {
        log(
          `${label}: ICE local candidate gathered: ${describeCandidate(ev.candidate.candidate)}`,
          "info",
        );
      } else if (!ev.candidate) {
        log(`${label}: ICE gathering complete`, "info");
      }
    });
    log(
      `${label}: PC diagnostics attached (initial iceConnectionState=${pc.iceConnectionState})`,
      "info",
    );
    return true;
  };
  if (!tryAttach()) {
    setTimeout(() => {
      if (!tryAttach())
        log(`${label}: PC diagnostics could not attach (no _pc)`, "err");
    }, 0);
  }
}
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
    if (levelCtx.state === "suspended") levelCtx.resume().catch(() => {});
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
      if (incomingLevelFill) incomingLevelFill.style.width = pct + "%";
      levelTickHandle = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    log("Level meter setup failed: " + e.message, "err");
  }
}

function stopLevelMeter() {
  if (levelTickHandle) {
    cancelAnimationFrame(levelTickHandle);
    levelTickHandle = null;
  }
  levelAnalyser = null;
  levelSourceStream = null;
  if (incomingLevelFill) incomingLevelFill.style.width = "0%";
}

function setPttStatus(active) {
  if (!pttStatusEl) return;
  pttStatusEl.textContent = active
    ? "Mic: ACTIVE (transmitting)"
    : "Mic: MUTED";
  pttStatusEl.classList.toggle("on", active);
  if (muteToggleBtn) muteToggleBtn.textContent = active ? "Mute" : "Unmute";
}

function toggleMicMute() {
  if (!supporterMicTrack) {
    log("Mute toggle: two-way not active or mic not captured yet", "info");
    return;
  }
  supporterMicTrack.enabled = !supporterMicTrack.enabled;
  setPttStatus(supporterMicTrack.enabled);
}

window.api.onTogglePtt(() => toggleMicMute());

let speakerMicOnlyStream = null;
async function captureSpeakerStream() {
  if (speakerLocalStream) return speakerLocalStream;
  const tracks = [];
  let micOk = false,
    sysOk = false;
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    speakerMicOnlyStream = mic;
    mic.getAudioTracks().forEach((t) => tracks.push(t));
    micOk = tracks.length > 0;
  } catch (e) {
    log("Speaker mic capture failed: " + e.message, "err");
  }
  try {
    const sys = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    sys.getVideoTracks().forEach((t) => t.stop());
    const sysAudio = sys.getAudioTracks();
    if (sysAudio.length > 0) {
      sysAudio.forEach((t) => tracks.push(t));
      sysOk = true;
    } else {
      log(
        "Speaker: getDisplayMedia returned no audio track (system loopback unavailable)",
        "err",
      );
    }
  } catch (e) {
    log("Speaker system capture failed: " + e.message, "err");
  }
  if (tracks.length === 0) return null;
  speakerLocalStream = new MediaStream(tracks);
  log(
    `Speaker capture ready (mic:${micOk ? "ok" : "no"}, system:${sysOk ? "ok" : "no"}, ${tracks.length} track(s) sending)`,
    "info",
  );
  if (
    netCfg &&
    netCfg.virtualCableId &&
    typeof ensureCableMixer === "function"
  ) {
    setTimeout(() => ensureCableMixer().catch(() => {}), 100);
  }
  return speakerLocalStream;
}

function teardownPeers() {
  speakerPeers.forEach((entry) => {
    try {
      entry.peer.destroy();
    } catch {}
  });
  speakerPeers.clear();
  if (supporterPeer) {
    try {
      supporterPeer.destroy();
    } catch {}
    supporterPeer = null;
  }
  if (speakerLocalStream) {
    speakerLocalStream.getTracks().forEach((t) => t.stop());
    speakerLocalStream = null;
  }
  speakerMicOnlyStream = null;
  if (supporterMicStream) {
    supporterMicStream.getTracks().forEach((t) => t.stop());
    supporterMicStream = null;
  }
  supporterMicTrack = null;
  setPttStatus(false);
  if (remoteAudioEl) {
    try {
      remoteAudioEl.srcObject = null;
    } catch {}
  }
  if (speakerInAudioEl) {
    try {
      speakerInAudioEl.srcObject = null;
    } catch {}
  }
  stopLevelMeter();
  if (cableCtx) {
    try {
      cableCtx.close();
    } catch {}
    cableCtx = null;
  }
  cableAGain = null;
  cableBGain = null;
  cableDest = null;
  if (bIncomingSrcNode) {
    try {
      bIncomingSrcNode.disconnect();
    } catch {}
    bIncomingSrcNode = null;
  }
  bIncomingForCable = null;
  if (cableOutEl) {
    try {
      cableOutEl.srcObject = null;
    } catch {}
  }
}

async function speakerHandleOpened(connId) {
  if (!SimplePeerLib) {
    log("SimplePeer not loaded", "err");
    return;
  }
  const stream = await captureSpeakerStream();
  if (!stream) {
    log("Speaker: nothing to stream — aborting connection " + connId, "err");
    return;
  }
  const tracks = stream.getTracks();
  log(`Speaker[${connId}]: streaming ${tracks.length} track(s)`, "info");

  const peer = new SimplePeerLib({
    initiator: true,
    stream,
    trickle: true,
    config: RTC_CONFIG,
  });
  speakerPeers.set(connId, { peer });
  attachPcDiagnostics(peer, `Speaker[${connId}]`);

  peer.on("signal", (sig) => {
    if (sig && sig.candidate && sig.candidate.candidate) {
      log(
        `Speaker[${connId}]: ICE local candidate: ${describeCandidate(sig.candidate.candidate)}`,
        "info",
      );
    }
    window.api.sendSignaling({ connId, type: "signal", payload: sig });
  });
  peer.on("connect", () => log(`Speaker[${connId}]: P2P connected`, "info"));
  const speakerSeenStreams = new Set();
  const attachRemote = (remote, src) => {
    if (speakerSeenStreams.has(remote.id)) return;
    speakerSeenStreams.add(remote.id);
    log(
      `Speaker[${connId}]: receiving supporter audio via ${src} (${remote.getAudioTracks().length} track)`,
      "info",
    );
    applyListenSink(speakerInAudioEl).catch(() => {});
    speakerInAudioEl.srcObject = remote;
    const vol = Math.min(
      1,
      netCfg && netCfg.incomingVolume != null ? netCfg.incomingVolume : 1,
    );
    speakerInAudioEl.volume = vol;
    speakerInAudioEl.muted = false;
    const p = speakerInAudioEl.play();
    if (p && p.then)
      p.then(() =>
        log(`Speaker[${connId}]: <audio> play() resolved`, "info"),
      ).catch((err) =>
        log(
          `Speaker[${connId}]: <audio>.play() rejected: ${err.message}`,
          "err",
        ),
      );
    startLevelMeter(remote);
    if (typeof attachBToCable === "function") attachBToCable(remote);
  };
  peer.on("stream", (remote) => attachRemote(remote, "stream"));
  peer.on("track", (track, remote) =>
    attachRemote(remote, `track[${track.kind}]`),
  );
  peer.on("error", (err) =>
    log(`Speaker[${connId}] peer error: ${err.message}`, "err"),
  );
  peer.on("close", () => {
    log(`Speaker[${connId}]: peer closed`, "info");
    speakerPeers.delete(connId);
  });
}

function speakerHandleSignal(connId, payload) {
  const entry = speakerPeers.get(connId);
  if (!entry) return;
  try {
    entry.peer.signal(payload);
  } catch (e) {
    log(`Speaker[${connId}] signal err: ${e.message}`, "err");
  }
}

function speakerHandleClosed(connId) {
  const entry = speakerPeers.get(connId);
  if (entry) {
    try {
      entry.peer.destroy();
    } catch {}
    speakerPeers.delete(connId);
  }
}

let supporterMicPromise = null;
async function ensureSupporterMic() {
  if (supporterMicTrack) return supporterMicTrack;
  if (supporterMicPromise) return supporterMicPromise;
  supporterMicPromise = (async () => {
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
      log("Supporter mic active (transmitting to speaker)", "info");
      return supporterMicTrack;
    } catch (e) {
      log("Supporter mic capture failed: " + e.message, "err");
      return null;
    } finally {
      supporterMicPromise = null;
    }
  })();
  return supporterMicPromise;
}

let supporterPeerPromise = null;
async function ensureSupporterPeer() {
  if (supporterPeer) return supporterPeer;
  if (supporterPeerPromise) return supporterPeerPromise;
  if (!SimplePeerLib) {
    log("SimplePeer not loaded", "err");
    return null;
  }
  supporterPeerPromise = (async () => {
    const micTrack = await ensureSupporterMic();
    const localStream = micTrack ? supporterMicStream : undefined;
    return _createSupporterPeer(localStream);
  })().finally(() => {
    supporterPeerPromise = null;
  });
  return supporterPeerPromise;
}

function _createSupporterPeer(localStream) {
  supporterPeer = new SimplePeerLib({
    initiator: false,
    trickle: true,
    stream: localStream,
    config: RTC_CONFIG,
  });

  attachPcDiagnostics(supporterPeer, "Supporter");
  supporterPeer.on("signal", (sig) => {
    if (sig && sig.candidate && sig.candidate.candidate) {
      log(
        `Supporter: ICE local candidate: ${describeCandidate(sig.candidate.candidate)}`,
        "info",
      );
    }
    window.api.sendSignaling({ type: "signal", payload: sig });
  });
  supporterPeer.on("connect", () => log("Supporter: P2P connected", "info"));
  const supSeenStreams = new Set();
  const attachRemote = (remote, src) => {
    if (supSeenStreams.has(remote.id)) return;
    supSeenStreams.add(remote.id);
    log(
      `Supporter: received remote stream via ${src} (${remote.getAudioTracks().length} audio track)`,
      "info",
    );
    applyListenSink(remoteAudioEl).catch(() => {});
    remoteAudioEl.srcObject = remote;
    const vol = Math.min(
      1,
      netCfg && netCfg.incomingVolume != null ? netCfg.incomingVolume : 1,
    );
    remoteAudioEl.volume = vol;
    remoteAudioEl.muted = false;
    const p = remoteAudioEl.play();
    if (p && p.then)
      p.then(() => log(`Supporter: <audio> play() resolved`, "info")).catch(
        (err) =>
          log("Supporter: <audio>.play() rejected: " + err.message, "err"),
      );
    log(`Supporter: <audio> attached (volume=${vol})`, "info");
    startLevelMeter(remote);
  };
  supporterPeer.on("stream", (remote) => attachRemote(remote, "stream"));
  supporterPeer.on("track", (track, remote) =>
    attachRemote(remote, `track[${track.kind}]`),
  );
  supporterPeer.on("error", (err) =>
    log("Supporter peer error: " + err.message, "err"),
  );
  supporterPeer.on("close", () => {
    log("Supporter: peer closed", "info");
    supporterPeer = null;
    stopLevelMeter();
  });

  remoteAudioEl.onplaying = () => log("Supporter: <audio> is playing", "info");
  remoteAudioEl.oncanplay = () => log("Supporter: <audio> canplay", "info");
  remoteAudioEl.onerror = () =>
    log(
      "Supporter: <audio> error: " +
        (remoteAudioEl.error?.message || "unknown"),
      "err",
    );

  return supporterPeer;
}

function supporterHandleSignal(payload) {
  ensureSupporterPeer().then((peer) => {
    if (!peer) return;
    try {
      peer.signal(payload);
    } catch (e) {
      log("Supporter signal err: " + e.message, "err");
    }
  });
}

window.api.onSignaling((msg) => {
  const type = msg.type;
  if (type === "opened") {
    if (netCfg && netCfg.role === "speaker") speakerHandleOpened(msg.connId);
  } else if (type === "closed") {
    if (netCfg && netCfg.role === "speaker" && msg.connId)
      speakerHandleClosed(msg.connId);
    else if (netCfg && netCfg.role === "supporter") {
      if (supporterPeer) {
        try {
          supporterPeer.destroy();
        } catch {}
        supporterPeer = null;
      }
      if (remoteAudioEl) {
        try {
          remoteAudioEl.srcObject = null;
        } catch {}
      }
      stopLevelMeter();
    }
  } else if (type === "signal") {
    if (netCfg && netCfg.role === "speaker")
      speakerHandleSignal(msg.connId, msg.payload);
    else if (netCfg && netCfg.role === "supporter")
      supporterHandleSignal(msg.payload);
  } else if (type === "reject") {
    log("Network: rejected (" + (msg.reason || "unknown") + ")", "err");
  } else if (type === "hello") {
    log("Network: connected as supporter (peer id " + msg.id + ")", "info");
  }
});

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buffer;
}

const chatMainEl = document.getElementById("chatMain");
const chatHistoryEl = document.getElementById("chatHistory");
const chatEmptyEl = document.getElementById("chatEmpty");
const chatInputEl = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatAttachBtn = document.getElementById("chatAttachBtn");
const chatFileInput = document.getElementById("chatFileInput");
const chatDropOverlay = document.getElementById("chatDropOverlay");
const chatHeaderStatus = document.getElementById("chatHeaderStatus");

function chatTime(ts) {
  const d = new Date(ts || Date.now());
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function chatRemoveEmpty() {
  if (chatEmptyEl && chatEmptyEl.parentNode) chatEmptyEl.remove();
}

function chatAddText(text, ok = true, fromMe = true, ts) {
  if (!chatHistoryEl) return;
  chatRemoveEmpty();
  const wrap = document.createElement("div");
  wrap.className = "chat-msg" + (ok ? "" : " failed") + (fromMe ? " from-me" : " from-them");
  wrap.textContent = text;
  chatHistoryEl.appendChild(wrap);
  const meta = document.createElement("div");
  meta.className = "chat-msg-meta" + (fromMe ? " from-me" : " from-them");
  meta.textContent = chatTime(ts || Date.now()) + (ok ? "" : " · failed");
  chatHistoryEl.appendChild(meta);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function chatAddImage(dataUrl, ok = true, fromMe = true, ts) {
  if (!chatHistoryEl) return;
  chatRemoveEmpty();
  const wrap = document.createElement("div");
  wrap.className = "chat-msg-image" + (ok ? "" : " failed") + (fromMe ? " from-me" : " from-them");
  const img = document.createElement("img");
  img.src = dataUrl;
  wrap.appendChild(img);
  chatHistoryEl.appendChild(wrap);
  const meta = document.createElement("div");
  meta.className = "chat-msg-meta" + (fromMe ? " from-me" : " from-them");
  meta.textContent = chatTime(ts || Date.now()) + (ok ? "" : " · failed");
  chatHistoryEl.appendChild(meta);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function chatClearAll() {
  if (!chatHistoryEl) return;
  chatHistoryEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.id = "chatEmpty";
  empty.className = "chat-empty";
  empty.textContent = "No messages yet. Type below or drop an image anywhere.";
  chatHistoryEl.appendChild(empty);
  chatEmptyEl = empty;
}

if (window.api && typeof window.api.onChatIncoming === "function") {
  window.api.onChatIncoming((msg) => {
    if (!msg) return;
    if (msg.type === "chat-text") chatAddText(msg.text || "", true, false, msg.ts);
    else if (msg.type === "chat-image") chatAddImage(msg.dataUrl || "", true, false, msg.ts);
  });
}
if (window.api && typeof window.api.onChatClear === "function") {
  window.api.onChatClear(() => chatClearAll());
}

function chatSetStatus(text) {
  if (chatHeaderStatus) chatHeaderStatus.textContent = text;
}

async function chatSendText() {
  if (!chatInputEl) return;
  const text = chatInputEl.value;
  if (!text || !text.trim()) return;
  chatInputEl.value = "";
  const ok = await window.api.sendChatText(text).catch(() => false);
  chatAddText(text, ok);
  if (!ok) chatSetStatus("Send failed (not connected)");
  else chatSetStatus("Sent");
}

async function downscaleImage(dataUrl, maxW = 1280, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function chatSendFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    chatSetStatus("Only image files supported");
    if (typeof toast === "function")
      toast("Only image files are supported", "warn");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    if (typeof toast === "function")
      toast(
        `Large image (${Math.round(file.size / 1024 / 1024)} MB) — downscaling first…`,
        "warn",
      );
  }
  chatSetStatus("Encoding image…");
  const reader = new FileReader();
  reader.onload = async (e) => {
    const raw = e.target.result;
    const small = await downscaleImage(raw);
    const ok = await window.api.sendChatImage(small).catch(() => false);
    chatAddImage(small, ok);
    chatSetStatus(ok ? "Image sent" : "Image send failed (not connected)");
  };
  reader.readAsDataURL(file);
}

if (chatSendBtn) chatSendBtn.addEventListener("click", () => chatSendText());
if (chatInputEl)
  chatInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatSendText();
    }
  });

if (chatAttachBtn)
  chatAttachBtn.addEventListener(
    "click",
    () => chatFileInput && chatFileInput.click(),
  );
if (chatFileInput)
  chatFileInput.addEventListener("change", () => {
    if (chatFileInput.files && chatFileInput.files[0])
      chatSendFile(chatFileInput.files[0]);
    chatFileInput.value = "";
  });

if (chatMainEl) {
  let dragCounter = 0;
  chatMainEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (chatDropOverlay) chatDropOverlay.hidden = false;
  });
  chatMainEl.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0 && chatDropOverlay) {
      chatDropOverlay.hidden = true;
      dragCounter = 0;
    }
  });
  chatMainEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  chatMainEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    if (chatDropOverlay) chatDropOverlay.hidden = true;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      chatSendFile(e.dataTransfer.files[0]);
    }
  });
}

if (chatInputEl)
  chatInputEl.addEventListener("paste", (e) => {
    if (!e.clipboardData) return;
    for (const item of e.clipboardData.items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        e.preventDefault();
        chatSendFile(item.getAsFile());
        return;
      }
    }
  });

window.api.onKickedBySpeaker(() => {
  log("Disconnected by speaker — auto-reconnect disabled", "err");
  if (typeof teardownPeers === "function") teardownPeers();
  if (netActionBtn) delete netActionBtn.dataset.connecting;
  window.alert(
    "You were disconnected by the speaker. Click End to reconfigure or reconnect.",
  );
});

const helpAlertEl = document.getElementById("helpAlert");
const helpAlertDismissEl = document.getElementById("helpAlertDismiss");
let helpAlertTimer = null;

function playHelpBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    playTone(880, 0, 0.18);
    playTone(660, 0.22, 0.18);
    playTone(880, 0.44, 0.22);
    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 800);
  } catch {}
}

function showHelpAlert() {
  if (!helpAlertEl) return;
  helpAlertEl.hidden = false;
  playHelpBeep();
  if (helpAlertTimer) clearTimeout(helpAlertTimer);
  helpAlertTimer = setTimeout(() => {
    helpAlertEl.hidden = true;
  }, 8000);
  log("HELP REQUEST received from speaker", "err");
}

if (helpAlertDismissEl)
  helpAlertDismissEl.addEventListener("click", () => {
    if (helpAlertEl) helpAlertEl.hidden = true;
    if (helpAlertTimer) {
      clearTimeout(helpAlertTimer);
      helpAlertTimer = null;
    }
  });

window.api.onHelpRequestReceived(() => showHelpAlert());

// ── Mic mode pill + virtual cable mixer ─────────────────────────────────────
const micPillEl = document.getElementById("micPill");
const micPillIconEl = document.getElementById("micPillIcon");
const micPillLabelEl = document.getElementById("micPillLabel");
const netVirtualCableEl = document.getElementById("netVirtualCable");
const netCableStatusEl = document.getElementById("netCableStatus");
const getVbCableBtnEl = document.getElementById("getVbCableBtn");
const netListenDeviceEl = document.getElementById("netListenDevice");
const netListenStatusEl = document.getElementById("netListenStatus");
const testListenBtnEl = document.getElementById("testListenBtn");

const MIC_MODE_LABELS = { mute: "MUTE", aOnly: "TO A", aAndC: "TO A+C" };
const MIC_MODE_ICONS = {
  mute: "\u{1F507}",
  aOnly: "\u{1F512}",
  aAndC: "\u{1F4E2}",
};
const MIC_MODES_R = ["mute", "aOnly", "aAndC"];
let currentMicMode = "aOnly";

let cableCtx = null;
let cableAGain = null;
let cableBGain = null;
let cableDest = null;
let cableOutEl = null;
// aMicForCable removed — cable mixer reuses speakerMicOnlyStream
let bIncomingForCable = null;
let bIncomingSrcNode = null;

function updateMicPillUI(mode) {
  if (!micPillEl) return;
  const m = MIC_MODES_R.includes(mode) ? mode : "aOnly";
  if (micPillIconEl) micPillIconEl.textContent = MIC_MODE_ICONS[m];
  if (micPillLabelEl) micPillLabelEl.textContent = MIC_MODE_LABELS[m];
  micPillEl.classList.remove("mode-mute", "mode-aOnly", "mode-aAndC");
  micPillEl.classList.add("mode-" + m);
  const role = (netCfg && netCfg.role) || "";
  micPillEl.disabled = !(role === "speaker" || role === "supporter");
}

function applyMicModeLocally(mode) {
  currentMicMode = mode;
  if (typeof supporterMicTrack !== "undefined" && supporterMicTrack) {
    supporterMicTrack.enabled = mode !== "mute";
  }
  applyMicModeToCableMixer(mode);
}

function applyMicModeToCableMixer(mode) {
  if (cableAGain) cableAGain.gain.value = mode === "aAndC" ? 0 : 1;
  if (cableBGain) cableBGain.gain.value = mode === "aAndC" ? 1 : 0;
}

if (micPillEl)
  micPillEl.addEventListener("click", async () => {
    if (micPillEl.disabled) return;
    await window.api.cycleMicMode();
  });

window.api.onMicModeChanged((info) => {
  const mode = MIC_MODES_R.includes(info.mode) ? info.mode : "aOnly";
  applyMicModeLocally(mode);
  updateMicPillUI(mode);
  updateMicModeBanner(mode);
  const role = (netCfg && netCfg.role) || "";
  let icon = MIC_MODE_ICONS[mode] || "";
  let msg;
  if (mode === "mute")
    msg =
      role === "supporter"
        ? `${icon} You are MUTED — nobody hears you`
        : `${icon} Supporter is MUTED`;
  else if (mode === "aOnly")
    msg =
      role === "supporter"
        ? `${icon} You speak to A only — C cannot hear you`
        : `${icon} Supporter is private (A only)`;
  else if (mode === "aAndC")
    msg =
      role === "supporter"
        ? `${icon} You are LIVE — A + C hear you`
        : `${icon} Supporter is LIVE to A + C`;
  toast(msg, mode);
  log(msg, "info");
});

function toast(message, kind) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast " + (kind ? "toast-" + kind : "toast-info");
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.classList.add("toast-out"), 2700);
  setTimeout(() => {
    try {
      el.remove();
    } catch {}
  }, 3000);
}

function updateMicModeBanner(mode) {
  const banner = document.getElementById("micModeBanner");
  const icon = document.getElementById("micModeBannerIcon");
  const text = document.getElementById("micModeBannerText");
  if (!banner || !icon || !text) return;
  banner.classList.remove("mode-mute", "mode-aOnly", "mode-aAndC");
  banner.classList.add("mode-" + mode);
  icon.textContent = MIC_MODE_ICONS[mode] || "";
  if (mode === "mute") text.textContent = "You are MUTED — nobody hears you";
  else if (mode === "aOnly")
    text.textContent = "You speak to A only — C cannot hear you";
  else if (mode === "aAndC") text.textContent = "You are LIVE — A + C hear you";
}

async function refreshMicPill() {
  const mode = await window.api.getMicMode().catch(() => "aOnly");
  currentMicMode = mode;
  updateMicPillUI(mode);
  applyMicModeLocally(mode);
}

const CABLE_RE = /(cable input|vb-audio|voicemeeter input|virtual cable)/i;

async function refreshCablePicker() {
  if (!netVirtualCableEl) return;
  try {
    await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()));
  } catch {}
  let devs = [];
  try {
    devs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "audiooutput",
    );
  } catch {}
  const cables = devs.filter((d) => CABLE_RE.test(d.label || ""));
  const others = devs.filter((d) => !CABLE_RE.test(d.label || ""));
  const populate = (
    selectEl,
    currentId,
    noneLabel,
    cablesGroupLabel,
    othersGroupLabel,
  ) => {
    selectEl.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = noneLabel;
    selectEl.appendChild(none);
    if (cables.length) {
      const grp = document.createElement("optgroup");
      grp.label = cablesGroupLabel;
      cables.forEach((d) => {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || "Virtual " + d.deviceId.slice(0, 6);
        grp.appendChild(o);
      });
      selectEl.appendChild(grp);
    }
    if (others.length) {
      const grp = document.createElement("optgroup");
      grp.label = othersGroupLabel;
      others.forEach((d) => {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || "Output " + d.deviceId.slice(0, 6);
        grp.appendChild(o);
      });
      selectEl.appendChild(grp);
    }
    selectEl.value = currentId || "";
  };
  populate(
    netVirtualCableEl,
    (netCfg && netCfg.virtualCableId) || "",
    "-- None --",
    "Virtual cables (recommended)",
    "Other output devices",
  );
  if (netListenDeviceEl) {
    populate(
      netListenDeviceEl,
      (netCfg && netCfg.listenDeviceId) || "",
      "-- Windows default --",
      "Virtual cables (NOT recommended for listening)",
      "Headphones / speakers (recommended)",
    );
  }
  updateCableStatus();
  updateListenStatus();
}

function updateListenStatus() {
  if (!netListenStatusEl) return;
  const id = (netCfg && netCfg.listenDeviceId) || "";
  if (!id) {
    netListenStatusEl.textContent =
      "Defaults to Windows default output if blank.";
    netListenStatusEl.className = "net-cable-status";
    return;
  }
  let label = id;
  if (netListenDeviceEl) {
    for (const o of netListenDeviceEl.options) {
      if (o.value === id) {
        label = o.textContent;
        break;
      }
    }
  }
  if (CABLE_RE.test(label)) {
    netListenStatusEl.textContent =
      "⚠ Listening on a virtual cable: " +
      label +
      ". You will not hear the other side through your headphones.";
    netListenStatusEl.className = "net-cable-status err";
  } else {
    netListenStatusEl.textContent = "Listening on: " + label;
    netListenStatusEl.className = "net-cable-status ok";
  }
}

async function applyListenSink(audioEl) {
  if (!audioEl) return;
  const id = (netCfg && netCfg.listenDeviceId) || "";
  if (!id) return;
  if (typeof audioEl.setSinkId !== "function") return;
  try {
    await audioEl.setSinkId(id);
    log("Listen sink set on <audio>", "info");
  } catch (e) {
    log("Listen sink failed: " + e.message, "err");
  }
}

async function reapplyListenSinkAll() {
  await applyListenSink(speakerInAudioEl);
  await applyListenSink(remoteAudioEl);
}

function updateCableStatus() {
  if (!netCableStatusEl) return;
  const id = (netCfg && netCfg.virtualCableId) || "";
  if (!id) {
    netCableStatusEl.textContent =
      "No output device selected. Pick CABLE Input above.";
    netCableStatusEl.className = "net-cable-status warn";
    return;
  }
  let label = id;
  if (netVirtualCableEl) {
    for (const o of netVirtualCableEl.options) {
      if (o.value === id) {
        label = o.textContent;
        break;
      }
    }
  }
  if (CABLE_RE.test(label)) {
    netCableStatusEl.textContent = "Routed to: " + label + " OK";
    netCableStatusEl.className = "net-cable-status ok";
  } else {
    netCableStatusEl.textContent =
      "Selected device is NOT a virtual cable: " +
      label +
      ". Meeting will not hear our app.";
    netCableStatusEl.className = "net-cable-status err";
  }
}

async function isDeviceWindowsDefault(deviceId) {
  if (!deviceId) return false;
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const outs = devs.filter((d) => d.kind === "audiooutput");
    const defAlias = outs.find((d) => d.deviceId === "default");
    if (!defAlias) return false;
    const target = outs.find((d) => d.deviceId === deviceId);
    if (!target) return false;
    return (
      defAlias.groupId && target.groupId && defAlias.groupId === target.groupId
    );
  } catch {
    return false;
  }
}

if (netVirtualCableEl)
  netVirtualCableEl.addEventListener("change", async () => {
    const id = netVirtualCableEl.value || "";
    await window.api.setNetworkConfig({ virtualCableId: id });
    netCfg = await window.api.getNetworkConfig();
    updateCableStatus();
    if (id && netCfg.role === "speaker") ensureCableMixer();
    if (id && (await isDeviceWindowsDefault(id))) {
      toast(
        "⚠ This virtual cable is also your Windows default output. Open System → Sound → Output and pick your headphones as default — otherwise A cannot hear B and system loopback will feed back.",
        "warn",
      );
      log(
        "WARN: virtual cable matches Windows default output device — misconfiguration",
        "err",
      );
    }
  });

if (getVbCableBtnEl)
  getVbCableBtnEl.addEventListener("click", () => {
    window.api.openExternal("https://vb-audio.com/Cable/");
  });

const firewallBtnEl = document.getElementById("firewallBtn");
if (firewallBtnEl)
  firewallBtnEl.addEventListener("click", async () => {
    firewallBtnEl.disabled = true;
    firewallBtnEl.textContent = "Requesting admin…";
    try { await window.api.configureFirewall(); } catch {}
    setTimeout(() => {
      firewallBtnEl.disabled = false;
      firewallBtnEl.textContent = "Allow through Windows Firewall";
    }, 2500);
  });

if (netListenDeviceEl)
  netListenDeviceEl.addEventListener("change", async () => {
    const id = netListenDeviceEl.value || "";
    await window.api.setNetworkConfig({ listenDeviceId: id });
    netCfg = await window.api.getNetworkConfig();
    updateListenStatus();
    await reapplyListenSinkAll();
  });

if (testListenBtnEl)
  testListenBtnEl.addEventListener("click", async () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(dest);
      osc.start();
      setTimeout(() => {
        osc.stop();
      }, 1000);
      const audio = new Audio();
      audio.srcObject = dest.stream;
      const id = (netCfg && netCfg.listenDeviceId) || "";
      if (id) {
        try {
          await audio.setSinkId(id);
        } catch (e) {
          toast("setSinkId failed: " + e.message, "warn");
        }
      }
      audio.play();
      setTimeout(() => {
        try {
          ctx.close();
          audio.srcObject = null;
        } catch {}
      }, 1300);
      toast(
        "🔊 Test tone played to listen device (you should hear a 660 Hz beep)",
        "info",
      );
    } catch (e) {
      toast("Test listen failed: " + e.message, "warn");
    }
  });

async function ensureCableMixer() {
  if (cableCtx) return;
  if (!netCfg || !netCfg.virtualCableId) return;
  if (!speakerMicOnlyStream) {
    log(
      "Cable mixer waiting for speaker mic capture (will retry after first supporter connects)",
      "info",
    );
    return;
  }
  cableCtx = new (window.AudioContext || window.webkitAudioContext)();
  const aSrc = cableCtx.createMediaStreamSource(speakerMicOnlyStream);
  cableAGain = cableCtx.createGain();
  cableBGain = cableCtx.createGain();
  cableDest = cableCtx.createMediaStreamDestination();
  aSrc.connect(cableAGain).connect(cableDest);
  cableBGain.connect(cableDest);
  applyMicModeToCableMixer(currentMicMode);
  cableOutEl = document.getElementById("cableOutAudio");
  if (cableOutEl) {
    cableOutEl.srcObject = cableDest.stream;
    cableOutEl.muted = false;
    cableOutEl.volume = 1;
    try {
      await cableOutEl.setSinkId(netCfg.virtualCableId);
      log("Cable mixer routed to selected output device", "info");
    } catch (e) {
      log("setSinkId failed: " + e.message, "err");
    }
    cableOutEl
      .play()
      .catch((e) => log("Cable output play failed: " + e.message, "err"));
  }
  if (bIncomingForCable) attachBToCable(bIncomingForCable);
}

function attachBToCable(stream) {
  bIncomingForCable = stream;
  if (!cableCtx) return;
  if (bIncomingSrcNode) {
    try {
      bIncomingSrcNode.disconnect();
    } catch {}
  }
  try {
    bIncomingSrcNode = cableCtx.createMediaStreamSource(stream);
    bIncomingSrcNode.connect(cableBGain);
  } catch (e) {
    log("Cable B attach failed: " + e.message, "err");
  }
}

if (settingsBtn)
  settingsBtn.addEventListener("click", () => {
    refreshCablePicker().catch(() => {});
    refreshMicPill().catch(() => {});
    (async () => {
      const id = (netCfg && netCfg.virtualCableId) || "";
      if (id && (await isDeviceWindowsDefault(id))) {
        toast(
          "⚠ Virtual cable matches Windows default output. Pick your headphones as Windows default in System → Sound → Output.",
          "warn",
        );
      }
    })();
  });

window.api.onNetworkStatus((status) => {
  if (status && status.role && (!netCfg || netCfg.role !== status.role)) {
    window.api
      .getNetworkConfig()
      .then((c) => {
        netCfg = c;
        log(
          `Sync: netCfg.role refreshed from network-status (role=${netCfg.role || "none"})`,
          "info",
        );
      })
      .catch(() => {});
  }
  if (status && (status.role === "speaker" || status.role === "supporter")) {
    refreshMicPill().catch(() => {});
  }
  if (status && status.role === "speaker" && netCfg && netCfg.virtualCableId) {
    setTimeout(() => ensureCableMixer().catch(() => {}), 200);
  }
  updateNetStatusPill(status);
  updateCableNudge(status);
});

function updateNetStatusPill(status) {
  const pill = document.getElementById("netStatusPill");
  if (!pill || !status) return;
  pill.classList.remove("live", "warn", "err");
  if (status.role === "speaker") {
    if (status.bound) {
      const n = (status.supporters || []).length;
      pill.textContent =
        n > 0 ? `\u{1F7E2} ${n} supporter` : "\u{1F7E1} hosting";
      pill.classList.add(n > 0 ? "live" : "warn");
      pill.title = `Hosting on ${status.address} — ${n}/1 supporter connected`;
    } else {
      pill.textContent = "⚠ not bound";
      pill.classList.add("err");
      pill.title = "Speaker mode but server not bound";
    }
  } else if (status.role === "supporter") {
    if (status.connected) {
      pill.textContent = "\u{1F7E2} connected";
      pill.classList.add("live");
      pill.title = `Connected to ${status.address}`;
    } else {
      pill.textContent = "\u{1F7E1} dialing";
      pill.classList.add("warn");
      pill.title = `Dialing ${status.address}…`;
    }
  } else {
    pill.textContent = "idle";
    pill.title = "No active session";
  }
}

let cableNudgeDismissed = false;
function updateCableNudge(status) {
  const banner = document.getElementById("cableNudge");
  if (!banner) return;
  if (cableNudgeDismissed) {
    banner.hidden = true;
    return;
  }
  const role = (status && status.role) || (netCfg && netCfg.role) || "";
  const hasCable = !!(netCfg && netCfg.virtualCableId);
  const inInterview = document.body.classList.contains("in-interview");
  banner.hidden = !(inInterview && role === "speaker" && !hasCable);
}

const cableNudgeGetEl = document.getElementById("cableNudgeGet");
const cableNudgeDismissEl = document.getElementById("cableNudgeDismiss");
if (cableNudgeGetEl)
  cableNudgeGetEl.addEventListener("click", () =>
    window.api.openExternal("https://vb-audio.com/Cable/"),
  );
if (cableNudgeDismissEl)
  cableNudgeDismissEl.addEventListener("click", () => {
    cableNudgeDismissed = true;
    document.getElementById("cableNudge").hidden = true;
  });

const testCableBtnEl = document.getElementById("testCableBtn");
if (testCableBtnEl)
  testCableBtnEl.addEventListener("click", async () => {
    if (!netCfg || !netCfg.virtualCableId) {
      toast("Pick a virtual cable first", "warn");
      return;
    }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(dest);
      osc.start();
      setTimeout(() => {
        osc.stop();
      }, 1000);
      const audio = new Audio();
      audio.srcObject = dest.stream;
      await audio.setSinkId(netCfg.virtualCableId);
      audio.play();
      setTimeout(() => {
        try {
          ctx.close();
          audio.srcObject = null;
        } catch {}
      }, 1300);
      toast(
        "\u{1F50A} Test tone played to virtual cable (check meeting mic level)",
        "info",
      );
    } catch (e) {
      toast("Test cable failed: " + e.message, "warn");
    }
  });

// Welcome / first-run modal
(async () => {
  try {
    const seen = await window.api.getWelcomeSeen().catch(() => true);
    if (!seen) {
      const overlay = document.getElementById("welcomeOverlay");
      if (overlay) overlay.hidden = false;
    }
  } catch {}
})();
const welcomeDismissEl = document.getElementById("welcomeDismiss");
if (welcomeDismissEl)
  welcomeDismissEl.addEventListener("click", () => {
    const overlay = document.getElementById("welcomeOverlay");
    if (overlay) overlay.hidden = true;
    window.api.setWelcomeSeen(true).catch(() => {});
  });

// PTT hotkey label in mic-pill tooltip
async function refreshMicPillTooltip() {
  const pill = document.getElementById("micPill");
  if (!pill) return;
  try {
    const data = await window.api.getHotkeys();
    const ptt = data.current && data.current.pushToTalk;
    pill.title = ptt
      ? `Cycle B's mic mode: mute → A only → A+C  (hotkey: ${ptt})`
      : `Cycle B's mic mode: mute → A only → A+C`;
  } catch {}
}
setTimeout(() => refreshMicPillTooltip().catch(() => {}), 500);
window.api.onHotkeysChanged(() => refreshMicPillTooltip().catch(() => {}));
