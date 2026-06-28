const slider = document.getElementById("slider");
const sliderFill = document.getElementById("sliderFill");
const stealthBtn = document.getElementById("stealthBtn");
const clickThroughBtn = document.getElementById("clickThroughBtn");
const endBtn = document.getElementById("endBtn");
const hideBtn = document.getElementById("hideBtn");
const quitBtn = document.getElementById("quitBtn");

const setupOverlay = document.getElementById("setupOverlay");

const settingsBtn = document.getElementById("settingsBtn");
const recBtn = document.getElementById("recBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");

const modeVoice = document.getElementById("modeVoice");
const modeCaption = document.getElementById("modeCaption");

const micSelect = document.getElementById("micSelect");
const captureMicEl = document.getElementById("captureMic");
const captureSystemEl = document.getElementById("captureSystem");
const engineDeepgram = document.getElementById("engineDeepgram");
const engineXai = document.getElementById("engineXai");
const deepgramKeyEl = document.getElementById("deepgramKey");
const xaiKeyEl = document.getElementById("xaiKey");
const languageSelect = document.getElementById("languageSelect");

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

let txCfg = null;
let capCfg = null;
let mode = "voice";

// ===== Custom select — replaces native <select> popups which are OS-level windows
// and therefore bypass setContentProtection (stealth). The custom dropdown renders
// entirely inside the Electron BrowserWindow and is always stealth-protected.
function makeCustomSelect(sel, compact) {
  if (!sel || sel._cselDone) return;
  sel._cselDone = true;
  sel.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = "csel" + (compact ? " csel-compact" : "");
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  const btn = document.createElement("div");
  btn.className = "csel-btn";
  btn.setAttribute("tabindex", "0");
  wrap.appendChild(btn);

  const list = document.createElement("div");
  list.className = "csel-list";
  list.hidden = true;
  wrap.appendChild(list);

  // Search box (shown only for long lists, e.g. timezones).
  const search = document.createElement("input");
  search.className = "csel-search";
  search.type = "text";
  search.placeholder = "Search…";
  search.hidden = true;
  list.appendChild(search);

  const itemsBox = document.createElement("div");
  itemsBox.className = "csel-items";
  list.appendChild(itemsBox);

  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    itemsBox.querySelectorAll(".csel-opt").forEach((it) => {
      it.style.display = (!q || it.textContent.toLowerCase().includes(q)) ? "" : "none";
    });
  }
  function selectValue(value) {
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
    close();
  }
  search.addEventListener("input", applyFilter);
  search.addEventListener("click", (e) => e.stopPropagation());
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "Enter") {
      // Pick the first currently-visible option.
      e.preventDefault();
      const first = Array.from(itemsBox.querySelectorAll(".csel-opt")).find((it) => it.style.display !== "none");
      if (first) selectValue(first.dataset.value);
    }
  });

  function refresh() {
    const cur = Array.from(sel.options).find((o) => o.value === sel.value);
    btn.textContent = cur ? cur.textContent : "";
    itemsBox.innerHTML = "";
    for (const o of Array.from(sel.options)) {
      const item = document.createElement("div");
      item.className = "csel-opt" + (o.value === sel.value ? " selected" : "");
      item.textContent = o.textContent;
      item.title = o.textContent;
      item.dataset.value = o.value;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectValue(o.value);
      });
      itemsBox.appendChild(item);
    }
    search.hidden = sel.options.length <= 20; // search only helps for long lists
  }

  function open() {
    refresh();
    list.hidden = false;
    btn.classList.add("open");
    // Flip upward if the list would overflow the viewport bottom
    const btnRect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - btnRect.bottom;
    list.classList.toggle("up", spaceBelow < 200);
    if (!search.hidden) { search.value = ""; applyFilter(); setTimeout(() => search.focus(), 0); }
  }

  function close() {
    list.hidden = true;
    btn.classList.remove("open");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    list.hidden ? open() : close();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); list.hidden ? open() : close(); }
    if (e.key === "Escape") close();
  });
  document.addEventListener("click", close);

  // Watch for option changes (populateModelSelects rebuilds options dynamically)
  const mo = new MutationObserver(refresh);
  mo.observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected"] });

  refresh();
  sel._cselRefresh = refresh;
}

// Apply to every <select> in the document after DOM is ready.
// compact=true for the small presetbar selects.
(function applyCustomSelects() {
  const compactIds = new Set(["presetSelect", "answerModelHeader"]);
  document.querySelectorAll("select").forEach((sel) => {
    makeCustomSelect(sel, compactIds.has(sel.id));
  });
})();

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

function applyRoleClass(role) {
  document.body.classList.toggle("role-supporter", role === "supporter");
  document.body.classList.toggle("role-speaker", role === "speaker");
  const chatMain = document.getElementById("chatMain");
  if (chatMain) chatMain.hidden = role !== "supporter";
  applyRoleSettingsTabs(role === "supporter");
}

function applyRoleSettingsTabs() {
  // Settings is now just API keys / Prompts / Hotkeys — shown for both roles.
  document.querySelectorAll(".tab-btn").forEach((btn) => { btn.style.display = ""; });
}

const answerMain = document.getElementById("answerMain");

const modeSelectOverlay = document.getElementById("modeSelectOverlay");
const continueOverlay = document.getElementById("continueOverlay");

function hideAllSetupOverlays() {
  if (modeSelectOverlay) modeSelectOverlay.hidden = true;
  if (setupOverlay) setupOverlay.hidden = true;
  if (continueOverlay) continueOverlay.hidden = true;
}

// Stage 1 — the New/Continue chooser shown on launch and after ending a session.
function showModeSelect() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  hideAllSetupOverlays();
  if (modeSelectOverlay) modeSelectOverlay.hidden = false;
  document.body.classList.remove("in-interview");
  endBtn.classList.remove("live");
  applyRoleClass("");
  if (answerMain) answerMain.hidden = true;
}

// New-session setup page (uploads, profile, role, prompt).
function showSetup() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  hideAllSetupOverlays();
  setupOverlay.hidden = false;
  document.body.classList.remove("in-interview");
  endBtn.classList.remove("live");
  applyRoleClass("");
  if (answerMain) answerMain.hidden = true;
  if (typeof refreshKb === "function") refreshKb();
  if (typeof prefillProfile === "function") prefillProfile();
}

// Pre-fill the profile fields from the last-used profile, so fixed personal
// details (name/city/country/timezone) don't have to be retyped each session.
// Only fills empty fields, so it never clobbers something you're editing.
async function prefillProfile() {
  if (!window.api.getDefaultProfile) return;
  const p = await window.api.getDefaultProfile().catch(() => null);
  if (!p) return;
  const setIfEmpty = (id, val) => {
    const el = document.getElementById(id);
    if (el && !el.value && val) el.value = val;
  };
  setIfEmpty("profileName", p.name);
  setIfEmpty("profileCity", p.city);
  setIfEmpty("profileCountry", p.country);
  const tz = document.getElementById("profileTimezone");
  if (tz && !tz.value && p.timezone) {
    tz.value = p.timezone;
    if (tz._cselRefresh) tz._cselRefresh();
  }
}

// Continue page (session list + search on the left, materials on the right).
function showContinue() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  hideAllSetupOverlays();
  if (continueOverlay) continueOverlay.hidden = false;
  document.body.classList.remove("in-interview");
  endBtn.classList.remove("live");
  applyRoleClass("");
  if (answerMain) answerMain.hidden = true;
  if (typeof refreshContinueList === "function") refreshContinueList();
}

function hideSetup() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  hideAllSetupOverlays();
  document.body.classList.add("in-interview");
  endBtn.classList.add("live");
  const role = (setupRoleSupporterV && setupRoleSupporterV.checked) ? "supporter" : "speaker";
  applyRoleClass(role);
  // The speaker sees the Grok answer panel; the supporter uses the chat panel.
  if (answerMain) answerMain.hidden = role === "supporter";
}

// Mode-chooser + back navigation.
const modeNewBtn = document.getElementById("modeNewBtn");
const modeContinueBtn = document.getElementById("modeContinueBtn");
const setupBackBtn = document.getElementById("setupBackBtn");
const continueBackBtn = document.getElementById("continueBackBtn");
const modeSelectSettingsBtn = document.getElementById("modeSelectSettingsBtn");
if (modeNewBtn) modeNewBtn.addEventListener("click", () => showSetup());
if (modeContinueBtn) modeContinueBtn.addEventListener("click", () => showContinue());
if (setupBackBtn) setupBackBtn.addEventListener("click", () => showModeSelect());
if (continueBackBtn) continueBackBtn.addEventListener("click", () => showModeSelect());
if (modeSelectSettingsBtn) modeSelectSettingsBtn.addEventListener("click", () => openSettings());

// ===== New Interview-Setup page (Stage 2): gear, role toggle, Start, uploads =====
const setupSettingsBtn = document.getElementById("setupSettingsBtn");
if (setupSettingsBtn) setupSettingsBtn.addEventListener("click", () => openSettings());

const setupRoleSpeakerV = document.getElementById("setupRoleSpeakerV");
const setupRoleSupporterV = document.getElementById("setupRoleSupporterV");
const setupAddressV = document.getElementById("setupAddressV");
const setupStartBtnV = document.getElementById("setupStartBtnV");

const roleCardSpeaker   = document.getElementById("roleCardSpeaker");
const roleCardSupporter = document.getElementById("roleCardSupporter");

function syncSetupRoleV() {
  const sup = !!(setupRoleSupporterV && setupRoleSupporterV.checked);
  if (setupAddressV) setupAddressV.hidden = !sup;
  if (roleCardSpeaker)   roleCardSpeaker.classList.toggle("role-card--active", !sup);
  if (roleCardSupporter) roleCardSupporter.classList.toggle("role-card--active",  sup);
}
if (setupRoleSpeakerV) setupRoleSpeakerV.addEventListener("change", syncSetupRoleV);
if (setupRoleSupporterV) setupRoleSupporterV.addEventListener("change", syncSetupRoleV);
syncSetupRoleV();

if (setupStartBtnV) setupStartBtnV.addEventListener("click", async () => {
  const sup = !!(setupRoleSupporterV && setupRoleSupporterV.checked);
  const chosenRole = sup ? "supporter" : "speaker";
  const patch = { role: chosenRole };
  if (sup) {
    const addr = (setupAddressV && setupAddressV.value.trim()) || "172.16.98.11:2000";
    if (!/^[^:\s]+:\d+$/.test(addr)) {
      window.alert("Enter address as host:port (e.g. 172.16.98.11:2000)");
      return;
    }
    patch.supporterAddress = addr;
  } else {
    patch.speakerPort = 2000;
  }
  await window.api.setMode("voice");
  mode = "voice";
  updateModeToggleBtn();
  await window.api.setNetworkConfig(patch);
  netCfg = await window.api.getNetworkConfig();
  await window.api.startNetwork();
  // Fresh session for the speaker's answer panel — snapshot profile + materials.
  if (!sup) {
    clearAnswerPanel();
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const profile = { name: val("profileName"), city: val("profileCity"), country: val("profileCountry"), timezone: val("profileTimezone") };
    if (window.api.sessionNew) await window.api.sessionNew({ profile });
    maybeOpenInfoWindow(profile);
  }
  hideSetup();
  log(`Started: voice mode as ${chosenRole}`, "info");
});

// Runtime IANA timezones (offline). Used to fill the scrollable, searchable
// timezone selects in both the new-session and continue pre-setup pages.
function timezoneList() {
  try { return (Intl.supportedValuesOf && Intl.supportedValuesOf("timeZone")) || []; } catch { return []; }
}
function populateTimezoneSelect(selectEl, current) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = ""; blank.textContent = "Timezone…";
  selectEl.appendChild(blank);
  timezoneList().forEach((z) => {
    const o = document.createElement("option");
    o.value = z; o.textContent = z;
    selectEl.appendChild(o);
  });
  if (current) selectEl.value = current;
  if (selectEl._cselRefresh) selectEl._cselRefresh();
}
populateTimezoneSelect(document.getElementById("profileTimezone"));

// Open the info window for a profile that has at least a location or timezone.
function maybeOpenInfoWindow(profile) {
  if (!profile || !window.api.infoOpen) return;
  if (profile.city || profile.country || profile.timezone) window.api.infoOpen(profile);
}

// ── Saved sessions: list / continue / delete in the setup screen ──────────────
function clearAnswerPanel() {
  if (answerHistory) answerHistory.querySelectorAll(".answer-turn").forEach((n) => n.remove());
  if (answerEmpty) answerEmpty.hidden = false;
  if (answerSpacer) answerSpacer.style.height = "0px";
}

// ── Continue overlay: searchable session list + materials preview ─────────────
const sessionSearch = document.getElementById("sessionSearch");
const continueSessionList = document.getElementById("continueSessionList");
const continueDetail = document.getElementById("continueDetail");
const continueOkBtn = document.getElementById("continueOkBtn");
let _continueSessions = [];
let _continueSelectedId = null;

function esc(s) { return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }

async function refreshContinueList() {
  if (!window.api.sessionList) return;
  _continueSessions = await window.api.sessionList();
  _continueSelectedId = null;
  if (continueOkBtn) continueOkBtn.disabled = true;
  if (continueDetail) continueDetail.innerHTML = '<p class="continue-empty">Select a session on the left to see its profile and attached materials.</p>';
  renderContinueList(sessionSearch ? sessionSearch.value : "");
}

function renderContinueList(filter) {
  if (!continueSessionList) return;
  const f = (filter || "").toLowerCase();
  const items = _continueSessions.filter((s) =>
    !f || (s.name || "").toLowerCase().includes(f) || ((s.profile && s.profile.name) || "").toLowerCase().includes(f));
  continueSessionList.innerHTML = "";
  if (!items.length) { continueSessionList.innerHTML = '<div class="session-empty">No matching sessions.</div>'; return; }
  items.forEach((s) => {
    const card = document.createElement("div");
    card.className = "session-card" + (s.id === _continueSelectedId ? " session-card--active" : "");
    const info = document.createElement("div");
    info.className = "session-card-info";
    const name = document.createElement("div");
    name.className = "session-card-name";
    name.textContent = s.name || "(untitled)";
    const meta = document.createElement("div");
    meta.className = "session-card-meta";
    const d = new Date(s.updatedAt || s.createdAt || Date.now());
    const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    meta.textContent = `${s.turnCount} message${s.turnCount === 1 ? "" : "s"} · ${dateStr}`;
    info.appendChild(name);
    info.appendChild(meta);
    info.addEventListener("click", () => selectContinueSession(s.id));
    const del = document.createElement("button");
    del.className = "session-card-del";
    del.textContent = "🗑";
    del.title = "Erase this session";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!window.confirm(`Erase session "${s.name || "(untitled)"}"? This cannot be undone.`)) return;
      await window.api.sessionDelete(s.id);
      refreshContinueList();
    });
    card.appendChild(info);
    card.appendChild(del);
    continueSessionList.appendChild(card);
  });
}

async function selectContinueSession(id) {
  _continueSelectedId = id;
  renderContinueList(sessionSearch ? sessionSearch.value : "");
  if (continueOkBtn) continueOkBtn.disabled = false;
  if (!window.api.sessionMeta) return;
  const meta = await window.api.sessionMeta(id);
  renderContinueDetail(meta);
}

// Right panel = the session's pre-setup page (editable profile + materials).
const CONTINUE_KB_KINDS = [
  { kind: "cv", label: "Resume / CV", multi: false },
  { kind: "jd", label: "Job Description", multi: false },
  { kind: "support", label: "Support material", multi: true },
  { kind: "meetings", label: "Meeting records", multi: true },
];
function renderContinueDetail(meta) {
  if (!continueDetail) return;
  if (!meta) { continueDetail.innerHTML = '<p class="continue-empty">Session not found.</p>'; return; }
  const p = meta.profile || {};
  const id = meta.id;

  let html = '<div class="cd-section"><div class="cd-label">Your profile</div>' +
    '<div class="profile-inputs profile-inputs--vertical">' +
    '<input type="text" id="cProfileName" class="profile-input" placeholder="Name" spellcheck="false" value="' + esc(p.name) + '" />' +
    '<input type="text" id="cProfileCity" class="profile-input" placeholder="City" spellcheck="false" value="' + esc(p.city) + '" />' +
    '<input type="text" id="cProfileCountry" class="profile-input" placeholder="Country" spellcheck="false" value="' + esc(p.country) + '" />' +
    '<select id="cProfileTimezone" class="profile-input profile-tz-select"></select>' +
    "</div></div>";

  html += '<div class="cd-section"><div class="cd-label">Materials</div><div class="upload-grid upload-grid--continue">';
  CONTINUE_KB_KINDS.forEach(({ kind, label, multi }) => {
    const K = cap1(kind);
    html += '<div class="upload-zone" id="cDrop' + K + '" data-kind="' + kind + '">' +
      '<div class="upload-zone-title">' + label + "</div>" +
      '<div class="upload-zone-hint">Click or drag &amp; drop' + (multi ? " · multiple" : "") + "</div>" +
      '<div class="upload-files" id="cFiles' + K + '"></div>' +
      '<input type="file" id="cFile' + K + '" hidden' + (multi ? " multiple" : "") + " /></div>";
  });
  html += "</div></div>";
  html += '<div class="cd-section"><div class="cd-meta">' + meta.turnCount + " message" + (meta.turnCount === 1 ? "" : "s") + "</div></div>";
  continueDetail.innerHTML = html;

  // Turn the timezone <select> into the scrollable/searchable custom select.
  const tzSel = document.getElementById("cProfileTimezone");
  if (tzSel) { makeCustomSelect(tzSel); populateTimezoneSelect(tzSel, p.timezone); }

  wireContinueKbZones(id);
  renderContinueKb(id);
}

// Render the chip lists for the selected session's materials.
async function renderContinueKb(id) {
  if (!window.api.sessionKbGet) return;
  const kb = await window.api.sessionKbGet(id);
  if (!kb) return;
  CONTINUE_KB_KINDS.forEach(({ kind }) => {
    const el = document.getElementById("cFiles" + cap1(kind));
    if (!el) return;
    el.innerHTML = "";
    (kb[kind] || []).forEach((it, i) => {
      const chip = document.createElement("span");
      chip.className = "upload-chip";
      const kbz = it.chars ? ` · ${Math.max(1, Math.round(it.chars / 1000))}k` : "";
      const nameSpan = document.createElement("span");
      nameSpan.className = "upload-chip-name";
      nameSpan.textContent = it.name + kbz;
      chip.appendChild(nameSpan);
      const x = document.createElement("button");
      x.className = "upload-chip-x";
      x.textContent = "×";
      x.title = "Remove";
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.api.sessionKbRemove(id, kind, i);
        renderContinueKb(id);
      });
      chip.appendChild(x);
      el.appendChild(chip);
    });
  });
}

async function addContinueKbFiles(id, kind, fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const r = await window.api.sessionKbAdd(id, kind, f.name, buf);
      if (r && !r.ok) log(`Upload failed (${f.name}): ${r.error || "error"}`, "err");
    } catch (err) {
      log(`Upload failed (${f.name}): ${err.message}`, "err");
    }
  }
  renderContinueKb(id);
}

function wireContinueKbZones(id) {
  CONTINUE_KB_KINDS.forEach(({ kind }) => {
    const K = cap1(kind);
    const zone = document.getElementById("cDrop" + K);
    const input = document.getElementById("cFile" + K);
    if (!zone || !input) return;
    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => { addContinueKbFiles(id, kind, input.files); input.value = ""; });
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      addContinueKbFiles(id, kind, e.dataTransfer && e.dataTransfer.files);
    });
  });
}

if (sessionSearch) sessionSearch.addEventListener("input", () => renderContinueList(sessionSearch.value));
if (continueOkBtn) continueOkBtn.addEventListener("click", () => { if (_continueSelectedId) continueSession(_continueSelectedId); });

async function continueSession(id) {
  if (!window.api.sessionLoad) return;
  // Persist any profile edits made in the right panel before loading.
  const cval = (cid) => { const el = document.getElementById(cid); return el ? el.value.trim() : ""; };
  const editedProfile = {
    name: cval("cProfileName"), city: cval("cProfileCity"),
    country: cval("cProfileCountry"), timezone: cval("cProfileTimezone"),
  };
  if (window.api.sessionUpdateProfile) await window.api.sessionUpdateProfile(id, editedProfile);

  const data = await window.api.sessionLoad(id);
  if (!data) return;
  // Sessions are speaker-side (answer panel). Start in voice mode as speaker.
  await window.api.setMode("voice");
  mode = "voice";
  updateModeToggleBtn();
  await window.api.setNetworkConfig({ role: "speaker", speakerPort: 2000 });
  netCfg = await window.api.getNetworkConfig();
  await window.api.startNetwork();
  if (setupRoleSpeakerV) { setupRoleSpeakerV.checked = true; syncSetupRoleV(); }
  clearAnswerPanel();
  renderLoadedTurns(data.turns || []);
  hideSetup();
  maybeOpenInfoWindow(data.profile || editedProfile);
  log(`Continued session: ${data.name || id}`, "info");
}

// Rebuild saved turns in the answer panel (rendered, not streaming).
function renderLoadedTurns(turns) {
  (turns || []).forEach((t) => {
    const imgs = Array.isArray(t.images) && t.images.length ? t.images : null;
    const el = addAnswerTurn(t.q || "", imgs, t.mode || "ANSWER", t.ts);
    if (!el) return;
    el.classList.remove("streaming");
    if (el._timeEl) el._timeEl.textContent = fmtTime(t.ts);
    const mode2 = el.dataset.mode || "ANSWER";
    const streamEl = el._streamEl || el;
    let txt = t.a || "";
    if (mode2 === "CODE" || mode2 === "DIAGRAM") txt = stripLeadingIntro(txt, mode2);
    const m = txt.match(/<sticky>([\s\S]*?)<\/sticky>/i);
    if (m) {
      const md = txt.replace(/<sticky>[\s\S]*?<\/sticky>/i, "").trimEnd();
      el._rawText = md;
      streamEl.textContent = md;
      renderMermaidInElement(streamEl);
      appendScriptToAnswer(el, m[1].trim());
    } else {
      el._rawText = txt;
      streamEl.textContent = txt;
      renderMermaidInElement(streamEl);
    }
    if (streamEl.classList.contains("has-diagram")) el.classList.add("has-diagram");
    if (mode2 === "CODE") appendCodeActions(el);
  });
}

// Upload zones — read each file's bytes, send to main for text extraction, and
// render chips from the stored (persisted) knowledge.
const KB_KINDS = ["cv", "jd", "support", "meetings"];
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function renderKbList(kind, items) {
  const el = document.getElementById("files" + cap1(kind));
  if (!el) return;
  el.innerHTML = "";
  (items || []).forEach((it, i) => {
    const chip = document.createElement("span");
    chip.className = "upload-chip";
    const kb = it.chars ? ` · ${Math.max(1, Math.round(it.chars / 1000))}k` : "";
    const nameSpan = document.createElement("span");
    nameSpan.className = "upload-chip-name";
    nameSpan.textContent = it.name + kb;
    chip.appendChild(nameSpan);
    const x = document.createElement("button");
    x.className = "upload-chip-x";
    x.textContent = "×";
    x.title = "Remove";
    x.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.api.kbRemove(kind, i);
      refreshKb();
    });
    chip.appendChild(x);
    el.appendChild(chip);
  });
}

async function refreshKb() {
  if (!window.api.kbGet) return;
  const kb = await window.api.kbGet();
  for (const kind of KB_KINDS) renderKbList(kind, kb[kind] || []);
}

async function addKbFiles(kind, fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const r = await window.api.kbAdd(kind, f.name, buf);
      if (r && !r.ok) log(`Upload failed (${f.name}): ${r.error || "error"}`, "err");
    } catch (err) {
      log(`Upload failed (${f.name}): ${err.message}`, "err");
    }
  }
  refreshKb();
}

KB_KINDS.forEach((kind) => {
  const zone = document.getElementById("drop" + cap1(kind));
  const input = document.getElementById("file" + cap1(kind));
  if (!zone || !input) return;
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => { addKbFiles(kind, input.files); input.value = ""; });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    addKbFiles(kind, e.dataTransfer && e.dataTransfer.files);
  });
});
refreshKb();

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
}

function hideEndModal() {
  endModal.hidden = true;
}

endBtn.addEventListener("click", showEndModal);
endModalCancel.addEventListener("click", hideEndModal);
endModalConfirm.addEventListener("click", async () => {
  endModal.hidden = true;
  // Compose the session title from company/position (+ date), then save the
  // transcript using that title as the suggested filename.
  const companyEl = document.getElementById("endCompany");
  const positionEl = document.getElementById("endPosition");
  const company = companyEl ? companyEl.value.trim() : "";
  const position = positionEl ? positionEl.value.trim() : "";
  let title = "";
  if (window.api.sessionFinalize) title = await window.api.sessionFinalize(company, position).catch(() => "");
  await window.api.saveSessionLog(title).catch(() => {});
  if (companyEl) companyEl.value = "";
  if (positionEl) positionEl.value = "";
  if (recState) await stopVoice().catch(() => {});
  if (captureRunning) await stopCaption().catch(() => {});
  await window.api.stopNetwork();
  teardownPeers();
  delete netActionBtn.dataset.connecting;
  if (window.api.infoClose) window.api.infoClose();
  log("Session ended — back to setup", "info");
  showModeSelect();
});

document.addEventListener("keydown", (e) => {
  if (!endModal.hidden && e.key === "Escape") hideEndModal();
});

showModeSelect();

window.api.onOpacityChanged((v) => updateFill(v));
window.api.onStealthChanged((v) => updateStealth(v));
window.api.getOpacity().then(updateFill);
window.api.getStealth().then(updateStealth);

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
  // Keep the answer-panel preset dropdown in sync whenever prompts change.
  if (typeof refreshPresetSelect === "function") refreshPresetSelect();
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
      mkBtn("Insert", () => {
        appendToComposer(p.text);
        setPromptStatus('Inserted "' + p.title + '" into the question box.');
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

const promptExportBtn = document.getElementById("promptExportBtn");
const promptImportBtn = document.getElementById("promptImportBtn");
const promptIoStatusEl = document.getElementById("promptIoStatus");
function setPromptIoStatus(msg) {
  if (promptIoStatusEl) promptIoStatusEl.textContent = msg || "";
}
if (promptExportBtn)
  promptExportBtn.addEventListener("click", async () => {
    setPromptIoStatus("Exporting…");
    const r = await window.api.exportPrompts();
    if (r && r.ok) setPromptIoStatus(`Exported ${r.count} prompt(s).`);
    else if (r && r.canceled) setPromptIoStatus("");
    else setPromptIoStatus("Export failed: " + ((r && r.error) || "error"));
  });
if (promptImportBtn)
  promptImportBtn.addEventListener("click", async () => {
    setPromptIoStatus("Importing…");
    const r = await window.api.importPrompts();
    if (r && r.ok) {
      renderPrompts(r.prompts);
      setPromptIoStatus(`Imported ${r.added}${r.skipped ? `, skipped ${r.skipped} duplicate(s)` : ""}.`);
    } else if (r && r.canceled) setPromptIoStatus("");
    else setPromptIoStatus("Import failed: " + ((r && r.error) || "error"));
  });

if (window.api && window.api.getPrompts) window.api.getPrompts().then(renderPrompts);

// ---- Avoid-phrases UI ----
const avoidPhrasesInput  = document.getElementById("avoidPhrasesInput");
const avoidPhrasesSaveBtn = document.getElementById("avoidPhrasesSaveBtn");
const avoidPhrasesStatus  = document.getElementById("avoidPhrasesStatus");

function setAvoidStatus(msg, ok) {
  if (!avoidPhrasesStatus) return;
  avoidPhrasesStatus.textContent = msg;
  avoidPhrasesStatus.style.color = ok ? 'var(--accent)' : 'var(--danger, #ef4444)';
  setTimeout(() => { if (avoidPhrasesStatus) avoidPhrasesStatus.textContent = ''; }, 2500);
}

async function loadAvoidPhrases() {
  if (!avoidPhrasesInput || !window.api.getAvoidPhrases) return;
  const text = await window.api.getAvoidPhrases();
  avoidPhrasesInput.value = text || '';
}

if (avoidPhrasesSaveBtn) {
  avoidPhrasesSaveBtn.addEventListener('click', async () => {
    const text = avoidPhrasesInput ? avoidPhrasesInput.value : '';
    await window.api.setAvoidPhrases(text);
    setAvoidStatus('Saved.', true);
  });
}

loadAvoidPhrases();

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
  const isSupporter = netCfg && netCfg.role === "supporter";
  activateTab("apikeys");
  refreshModeUI();
  refreshTranscriptionUI();
  loadAvoidPhrases();
  refreshCaptureUI();
  refreshMicList();
  refreshHotkeysUI();
  refreshNetworkUI();
  applyRoleSettingsTabs(isSupporter);
}

function closeSettings() {
  settingsOverlay.hidden = true;
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

// Show only the key field that belongs to the selected engine.
function updateEngineBlocks(engine) {
  const dg = document.getElementById("deepgramBlock");
  const xa = document.getElementById("xaiBlock");
  if (dg) dg.hidden = engine !== "deepgram";
  if (xa) xa.hidden = engine !== "xai";
}

async function refreshTranscriptionUI() {
  txCfg = await window.api.getTranscriptionConfig();
  engineDeepgram.checked = txCfg.engine !== "xai";
  if (engineXai) engineXai.checked = txCfg.engine === "xai";
  deepgramKeyEl.value = txCfg.deepgramApiKey || "";
  if (xaiKeyEl) xaiKeyEl.value = txCfg.xaiApiKey || "";
  languageSelect.value = txCfg.language || "auto";
  captureMicEl.checked = txCfg.captureMic !== false;
  captureSystemEl.checked = txCfg.captureSystem !== false;
  updateEngineBlocks(txCfg.engine);
}

async function persistTx(patch) {
  txCfg = { ...(txCfg || {}), ...patch };
  await window.api.setTranscriptionConfig(patch);
}

engineDeepgram.addEventListener("change", () => {
  if (!engineDeepgram.checked) return;
  persistTx({ engine: "deepgram" });
  updateEngineBlocks("deepgram");
});
if (engineXai) engineXai.addEventListener("change", () => {
  if (!engineXai.checked) return;
  persistTx({ engine: "xai" });
  updateEngineBlocks("xai");
});
deepgramKeyEl.addEventListener("change", () =>
  persistTx({ deepgramApiKey: deepgramKeyEl.value.trim() }),
);
if (xaiKeyEl) xaiKeyEl.addEventListener("change", () =>
  persistTx({ xaiApiKey: xaiKeyEl.value.trim() }),
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
  scrollUp: "Scroll answers up",
  scrollDown: "Scroll answers down",
  resetCaptureArea: "Reset capture area (re-pick)",
  toggleStealth: "Toggle stealth",
  toggleRecording: "Start/stop voice or caption",
  toggleMode: "Toggle OCR ↔ Voice mode",
  pushToTalk: "Push-to-talk (toggle supporter mic)",
  closeSticky: "Close sticky note",
  openSticky: "Open sticky note",
  stickyScrollUp: "Scroll sticky note up",
  stickyScrollDown: "Scroll sticky note down",
  helpRequest: "Send help request (speaker → supporter)",
  submitPrompt: "Get answer (send to Grok)",
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
const composerInput = document.getElementById("composerInput");

// One-shot append (OCR, prompt-insert): drop text onto the end of the composer.
function appendToComposer(text) {
  const t = (text || "").trim();
  if (!t || !composerInput) return;
  const cur = composerInput.value;
  composerInput.value = !cur ? t : (cur.endsWith(" ") ? cur + t : cur + " " + t);
  composerInput.scrollTop = composerInput.scrollHeight;
}

// Live word-by-word streaming of the CURRENT speech segment into the composer
// (like v1.0.0). `liveSeg` is the not-yet-finalized tail at the end of the box;
// each update replaces just that tail, so revised interim words self-correct
// instead of dumping a whole 1–2s block when the segment finalizes.
let liveSeg = "";
function resetLiveSeg() { liveSeg = ""; }
function streamSegment(text, isFinal) {
  if (!composerInput) return;
  const v = composerInput.value;
  const base = liveSeg && v.endsWith(liveSeg) ? v.slice(0, v.length - liveSeg.length) : v;
  const needSpace = base && !/\s$/.test(base);
  if (isFinal) {
    composerInput.value = base + (needSpace ? " " : "") + text.trim() + " ";
    liveSeg = "";
  } else {
    composerInput.value = base + (needSpace ? " " : "") + text;
    liveSeg = (needSpace ? " " : "") + text;
  }
  composerInput.scrollTop = composerInput.scrollHeight;
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
// Utterance boundary (vad_events): lock any pending live segment so trailing
// words aren't left dangling, and clear the live preview.
window.api.onUtteranceEnd(() => {
  if (interimFlushTimer) { clearTimeout(interimFlushTimer); interimFlushTimer = null; }
  if (pendingInterim != null) { streamSegment(pendingInterim, true); pendingInterim = null; }
  else if (liveSeg) { streamSegment(liveSeg, true); }
  clearInterimPreview();
});
window.api.onTranscriptLiveError((msg) => {
  log("Transcription error: " + msg, "err");
  if (recState && recState.streaming) {
    recState = null;
    recBtn.classList.remove("on");
    updateRecTitle();
  }
});

window.api.onCaptureText((text) => {
  // Messages starting with '[' are internal status/log lines (e.g. "[sticky sent: ...]"),
  // not real OCR content — log them but never inject them into the composer.
  if (text && text.trimStart().startsWith('[')) {
    log(text);
    return;
  }
  log("OCR: " + text);
  appendToComposer(text);
  window.api.sessionLogAdd({ ts: Date.now(), kind: "ocr", text });
});
window.api.onCaptureError((msg) => log("OCR error: " + msg, "err"));
window.api.onCaptureState((on) => {
  captureRunning = !!on;
  recBtn.classList.toggle("on", captureRunning);
  updateRecTitle();
});

// ===== Grok answer panel =====
const answerHistory = document.getElementById("answerHistory");
const answerEmpty = document.getElementById("answerEmpty");
const getAnswerBtn = document.getElementById("getAnswerBtn");
const answerClearBtn = document.getElementById("answerClearBtn");
const presetSelect = document.getElementById("presetSelect");
const answerKeyEl = document.getElementById("answerKey");
const answerModelEl = document.getElementById("answerModel");
const answerModelHeaderEl = document.getElementById("answerModelHeader");
const modeSeg = document.getElementById("modeSeg");
const railModelBtn = document.getElementById("railModelBtn");
let currentAnswerEl = null;

// Rail model button — opens native popup menu, same style as prompt menu
if (railModelBtn && window.api.showModelMenu) {
  railModelBtn.addEventListener('click', () => window.api.showModelMenu());
}
if (window.api.onModelSelected) {
  window.api.onModelSelected((id) => {
    setAnswerModel(id);
    // Update button label to a short abbreviation of the selected model
    if (railModelBtn) {
      // Show something like "G4" for grok-4, "G3" for grok-3, etc.
      const abbr = id.replace('grok-', 'G').replace(/\.\d+$/, '').replace(/-.*/, '').slice(0, 4);
      railModelBtn.textContent = abbr || 'M';
      railModelBtn.title = id;
    }
  });
}

// Manual mode — default Text; CODE/DIAGRAM force specific output format.
let manualMode = 'ANSWER';
if (modeSeg) {
  modeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-seg-btn');
    if (!btn) return;
    manualMode = btn.dataset.mode;
    modeSeg.querySelectorAll('.mode-seg-btn').forEach(b => b.classList.toggle('mode-seg-btn--active', b === btn));
  });
}

// Short hint labels shown next to each model ID in the dropdown.
// Applied to both the static fallback list and the live list from xAI.
// Clean display names shown in the dropdown instead of raw API IDs.
const MODEL_DISPLAY = {
  "grok-4":                           "Grok 4  ⚡ latest",
  "grok-4-0709":                      "Grok 4 (Jul)  ⚡ latest",
  "grok-4.3":                         "Grok 4.3  🧠 smartest",
  "grok-4.20-0309-non-reasoning":     "Grok 4.20 Fast  ⚡ no reasoning",
  "grok-4.20-0309-reasoning":         "Grok 4.20 Reasoning  🧠 slower",
  "grok-4.20-multi-agent-0309":       "Grok 4.20 Multi-Agent  🔗",
  "grok-3":                           "Grok 3",
  "grok-3-fast":                      "Grok 3 Fast  ⚡",
  "grok-3-mini":                      "Grok 3 Mini  ⚡ cheap",
  "grok-3-mini-fast":                 "Grok 3 Mini Fast  ⚡ cheapest",
  "grok-2-1212":                      "Grok 2  (legacy)",
  "grok-2-vision-1212":               "Grok 2 Vision  (legacy)",
  "grok-beta":                        "Grok Beta  (experimental)",
  "grok-build-0.1":                   "Grok Build  🔧 code",
  "grok-imagine-image":               "Grok Image Gen  🎨",
  "grok-imagine-image-quality":       "Grok Image HQ  🎨",
  "grok-imagine-video":               "Grok Video Gen  🎬",
  "grok-imagine-video-1.5":           "Grok Video Gen v1.5  🎬",
};

function modelLabel(id) {
  return MODEL_DISPLAY[id] || id;
}

// Fallback model list (used when the live list from xAI can't be fetched, e.g.
// no key yet). The live list from the API supersedes this when available.
const FALLBACK_MODELS = [
  { id: "grok-4.20-0309-non-reasoning" },
  { id: "grok-4.3" },
  { id: "grok-4.20-0309-reasoning" },
  { id: "grok-4.20-multi-agent-0309" },
];

// Populate BOTH model dropdowns (Setup/Settings panel + header) from the live
// xAI model list for the current key, falling back to the static list.
async function populateModelSelects() {
  const cfg = await window.api.getAnswerConfig();
  const current = cfg.model || FALLBACK_MODELS[0].id;
  let opts;
  let live = null;
  try { live = await window.api.listXaiModels(); } catch {}
  if (Array.isArray(live) && live.length) {
    opts = live.map((id) => ({ id }));
  } else {
    opts = FALLBACK_MODELS.slice();
  }
  if (!opts.some((o) => o.id === current)) opts.unshift({ id: current });
  for (const sel of [answerModelEl, answerModelHeaderEl]) {
    if (!sel) continue;
    sel.innerHTML = "";
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = modelLabel(o.id);
      sel.appendChild(opt);
    }
    sel.value = current;
    if (sel._cselRefresh) sel._cselRefresh();
  }
  // Update rail model button label to show current model abbreviation
  if (railModelBtn) {
    const abbr = current.replace('grok-', 'G').replace(/\.\d+$/, '').replace(/-.*/, '').slice(0, 4);
    railModelBtn.textContent = abbr || 'M';
    railModelBtn.title = current;
  }
}

function setAnswerModel(value) {
  if (!value) return;
  window.api.setAnswerConfig({ model: value });
  if (answerModelEl && answerModelEl.value !== value) {
    answerModelEl.value = value;
    if (answerModelEl._cselRefresh) answerModelEl._cselRefresh();
  }
  if (answerModelHeaderEl && answerModelHeaderEl.value !== value) {
    answerModelHeaderEl.value = value;
    if (answerModelHeaderEl._cselRefresh) answerModelHeaderEl._cselRefresh();
  }
}
if (answerModelEl) answerModelEl.addEventListener("change", () => setAnswerModel(answerModelEl.value));
if (answerModelHeaderEl) answerModelHeaderEl.addEventListener("change", () => setAnswerModel(answerModelHeaderEl.value));

// ===== Composer image attachments (multiple screenshots via Alt+A) =====
const composerImgStrip = document.getElementById("composerImgStrip");

// Array of { base64, mime } — supports multiple images.
let attachedImages = [];
// Saved at submit time so onAnswerStart can embed images in the question bubble.
let pendingBubbleImages = [];

function renderImgStrip() {
  if (!composerImgStrip) return;
  composerImgStrip.innerHTML = "";
  if (attachedImages.length === 0) { composerImgStrip.hidden = true; return; }
  composerImgStrip.hidden = false;
  attachedImages.forEach((img, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "composer-thumb-wrap";
    const el = document.createElement("img");
    el.src = `data:${img.mime};base64,${img.base64}`;
    el.className = "composer-thumb";
    el.alt = "screenshot";
    const rm = document.createElement("button");
    rm.className = "composer-thumb-rm";
    rm.textContent = "×";
    rm.title = "Remove";
    rm.addEventListener("click", () => {
      attachedImages.splice(idx, 1);
      renderImgStrip();
    });
    wrap.appendChild(el);
    wrap.appendChild(rm);
    composerImgStrip.appendChild(wrap);
  });
}

function addAttachedImage(base64, mime) {
  attachedImages.push({ base64, mime: mime || "image/png" });
  renderImgStrip();
}

function clearAttachedImages() {
  attachedImages = [];
  renderImgStrip();
}

// Screenshot via Alt+A hotkey.
// Captured entirely in the renderer using getUserMedia (chromeMediaSource:'desktop')
// — the same mechanism used for system-audio capture — so no main-process IPC needed.
async function doScreenshot() {
  let stream = null;
  let video  = null;
  try {
    // Get all sources + cursor display index in parallel.
    let allSources = [], displayIdx = 0;
    try { allSources  = await window.api.getCursorScreenSourceId(); } catch {}
    try { displayIdx  = await window.api.getCursorDisplayIndex();   } catch {}

    // Filter to screen-only sources (IDs start with "screen:"), sort by name.
    const screenSources = (allSources || [])
      .filter((s) => s.id && s.id.startsWith("screen:"))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));

    let sourceId = (screenSources[displayIdx] || screenSources[0])?.id || null;
    if (!sourceId) {
      try { sourceId = await window.api.getDesktopSourceId(); } catch {}
    }
    if (!sourceId) { log("Screenshot: no desktop source available", "err"); return; }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: 3840,
          maxHeight: 2160,
        },
      },
    });

    // Attach video to DOM — Chromium requires this to decode desktop capture frames.
    video = document.createElement("video");
    video.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:0;left:0;";
    video.muted = true;
    video.playsInline = true;
    document.body.appendChild(video);
    video.srcObject = stream;

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = (e) => reject(new Error("video error: " + (e.message || e)));
      setTimeout(() => reject(new Error("metadata timeout")), 5000);
    });
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth  || 1920;
    canvas.height = video.videoHeight || 1080;
    canvas.getContext("2d").drawImage(video, 0, 0);

    // JPEG at 0.82 quality — roughly 10× smaller than PNG, safe to send through IPC
    // even with multiple screenshots attached.
    const dataUrl  = canvas.toDataURL("image/jpeg", 0.82);
    const commaIdx = dataUrl.indexOf(",");
    const b64      = dataUrl.slice(commaIdx + 1);
    addAttachedImage(b64, "image/jpeg");
  } catch (e) {
    log("Screenshot failed: " + e.message, "err");
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (video && video.parentNode) video.parentNode.removeChild(video);
  }
}
if (window.api.onTriggerScreenshot) window.api.onTriggerScreenshot(doScreenshot);

// Alt+S area-snip result — main captures the region and sends it here.
if (window.api.onSnipImage) window.api.onSnipImage((img) => {
  if (img && img.base64) addAttachedImage(img.base64, img.mime || 'image/png');
});

// ── Latency optimizations ──────────────────────────────────
// Pre-warm the TLS connection on first keypress, so the API handshake is
// already done before the user hits send.
let _apiConnectionWarmed = false;
// Debounced speculative request: after 800 ms of inactivity, start streaming
// the answer — so it may be fully ready by the time the user hits send.
let _speculativeTimer = null;
let _speculativeText = null;

if (composerInput) {
  composerInput.addEventListener("input", () => {
    // One-time connection warm-up
    if (!_apiConnectionWarmed) {
      _apiConnectionWarmed = true;
      if (window.api.warmApiConnection) window.api.warmApiConnection();
    }
    // Debounce speculative: cancel previous timer, schedule new one
    if (_speculativeTimer) { clearTimeout(_speculativeTimer); _speculativeTimer = null; }
    const text = composerInput.value.trim();
    if (!text || text.length < 8) {
      // Too short or empty — cancel any running speculation
      if (_speculativeText) {
        _speculativeText = null;
        if (window.api.speculativeCancel) window.api.speculativeCancel();
      }
      return;
    }
    _speculativeTimer = setTimeout(() => {
      _speculativeTimer = null;
      // Only speculate when no images are attached (vision requests aren't speculative)
      if (attachedImages.length > 0) return;
      _speculativeText = text;
      if (window.api.speculativeStart) window.api.speculativeStart({ question: text, forcedMode: manualMode });
    }, 800);
  });
}

function submitComposer() {
  if (!composerInput) return;
  const q = composerInput.value.trim();
  if (!q && attachedImages.length === 0) return;

  // Cancel pending speculative timer — we're submitting now
  if (_speculativeTimer) { clearTimeout(_speculativeTimer); _speculativeTimer = null; }

  pendingBubbleImages = attachedImages.slice();
  const hasImages = attachedImages.length > 0;

  if (!hasImages && _speculativeText === q && window.api.speculativeCommit) {
    // Speculative request is already streaming or done — adopt it
    _speculativeText = null;
    window.api.speculativeCommit({ question: q, images: null, forcedMode: manualMode });
  } else {
    // Cancel any speculation, start a fresh request
    _speculativeText = null;
    if (window.api.speculativeCancel) window.api.speculativeCancel();
    window.api.generateAnswer(q, hasImages ? attachedImages : null, manualMode);
  }

  composerInput.value = "";
  clearAttachedImages();
  if (typeof resetLiveSeg === "function") resetLiveSeg();
}

if (getAnswerBtn) getAnswerBtn.addEventListener("click", submitComposer);
if (composerInput) {
  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitComposer();
    }
  });
}
if (answerClearBtn) {
  answerClearBtn.addEventListener("click", () => {
    if (answerHistory)
      answerHistory.querySelectorAll(".answer-turn").forEach((n) => n.remove());
    if (answerEmpty) answerEmpty.hidden = false;
    // Reset spacer so first new turn starts flush
    if (answerSpacer) answerSpacer.style.height = "0px";
    // Also wipe the remembered answers/code/diagrams used to ground follow-ups.
    if (window.api.clearAnswerMemory) window.api.clearAnswerMemory();
  });
}

// Spacer div pinned at the bottom of answerHistory — always sized to the
// panel height so there is always room to scroll any turn to the top,
// even when total content is shorter than the panel.
let answerSpacer = null;
function ensureSpacer() {
  if (!answerHistory) return;
  if (!answerSpacer) {
    answerSpacer = document.createElement("div");
    answerSpacer.className = "answer-spacer";
    answerHistory.appendChild(answerSpacer);
  }
  // Keep spacer = full panel height so any turn can reach the top
  answerSpacer.style.height = answerHistory.clientHeight + "px";
}

function fmtTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addAnswerTurn(question, imgs, mode, ts) {
  if (!answerHistory) return null;
  if (answerEmpty) answerEmpty.hidden = true;

  const turn = document.createElement("div");
  turn.className = "answer-turn";
  const q = document.createElement("div");
  q.className = "answer-q";
  if (imgs && imgs.length) {
    const strip = document.createElement("div");
    strip.className = "answer-q-img-strip";
    imgs.forEach((imgData) => {
      const img = document.createElement("img");
      img.src = `data:${imgData.mime || "image/png"};base64,${imgData.base64}`;
      img.className = "answer-q-img";
      img.alt = "screenshot";
      img.title = "Click to enlarge";
      img.addEventListener("click", () => openImageOverlay(img.src));
      strip.appendChild(img);
    });
    q.appendChild(strip);
  }
  const qText = document.createElement("span");
  qText.className = "answer-q-text";
  if (question) qText.textContent = question;
  q.appendChild(qText);

  // Edit / Resend controls (ChatGPT/Claude-style). Shown on hover.
  const turnMode = mode || 'ANSWER';
  const qActions = document.createElement("div");
  qActions.className = "answer-q-actions";
  const editBtn = document.createElement("button");
  editBtn.className = "answer-q-action";
  editBtn.title = "Edit & resend";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", () => beginInlineEdit(q, question, imgs, turnMode));
  const resendBtn = document.createElement("button");
  resendBtn.className = "answer-q-action";
  resendBtn.title = "Resend (regenerate)";
  resendBtn.textContent = "↻";
  resendBtn.addEventListener("click", () => resendTurn(question, imgs));
  qActions.appendChild(editBtn);
  qActions.appendChild(resendBtn);
  q.appendChild(qActions);

  // Timestamp on the question bubble (when the turn was asked).
  const turnTs = ts || Date.now();
  const qTime = document.createElement("div");
  qTime.className = "answer-time answer-time--q";
  qTime.textContent = fmtTime(turnTs);
  q.appendChild(qTime);

  const a = document.createElement("div");
  a.className = "answer-a streaming";
  a.dataset.mode = turnMode;
  if (mode && mode !== 'ANSWER') {
    const badge = document.createElement("span");
    badge.className = "answer-mode-badge answer-mode-badge--" + mode.toLowerCase();
    badge.textContent = mode === 'DIAGRAM' ? '⬡ Diagram' : '⌨ Live Code';
    a.appendChild(badge);
  }
  // Streaming text goes into a child div so the badge span is never touched
  const streamDiv = document.createElement("div");
  streamDiv.className = "answer-stream";
  a.appendChild(streamDiv);
  a._streamEl = streamDiv;
  // Answer timestamp — filled in when streaming completes.
  const aTime = document.createElement("div");
  aTime.className = "answer-time answer-time--a";
  a.appendChild(aTime);
  a._timeEl = aTime;
  // Double-click an answer to push it (text, code, and any diagrams) to the sticky note.
  a.title = "Double-click to send to sticky note";
  a.addEventListener("dblclick", () => injectAnswerToSticky(a));
  turn.appendChild(q);
  turn.appendChild(a);

  // Ensure the spacer exists and is tall enough, then insert turn before it
  ensureSpacer();
  answerHistory.insertBefore(turn, answerSpacer);

  // After layout settles, scroll so the last few lines of the question are
  // visible at the top of the panel, with the answer starting just below.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const cRect = answerHistory.getBoundingClientRect();
    const qRect = q.getBoundingClientRect();
    const qTopInScroll    = answerHistory.scrollTop + (qRect.top  - cRect.top);
    const qBottomInScroll = answerHistory.scrollTop + (qRect.bottom - cRect.top);
    // Show up to 72px of the question tail (≈3 lines); if question is shorter show all of it
    const tail = Math.min(72, qRect.height);
    answerHistory.scrollTop = qBottomInScroll - tail;
  }));
  return a;
}

// Reflect a mode in the segmented control + manualMode state.
function setManualMode(mode) {
  manualMode = mode || 'ANSWER';
  if (modeSeg) modeSeg.querySelectorAll('.mode-seg-btn').forEach((b) =>
    b.classList.toggle('mode-seg-btn--active', b.dataset.mode === manualMode));
}

// Resend (regenerate): re-submit the same question/images as a new turn, in
// whatever mode is CURRENTLY selected in the Text/Code/Diagram control (not the
// original turn's mode) — so switching the selector then resending takes effect.
function resendTurn(question, imgs) {
  const hasImgs = Array.isArray(imgs) && imgs.length > 0;
  if (!question && !hasImgs) return;
  // Cancel any in-flight speculation, then fire a fresh request.
  _speculativeText = null;
  if (window.api.speculativeCancel) window.api.speculativeCancel();
  // onAnswerStart embeds these into the new question bubble.
  pendingBubbleImages = hasImgs ? imgs.slice() : [];
  window.api.generateAnswer(question || "", hasImgs ? imgs : null, manualMode);
}

// Edit inline in the question bubble (ChatGPT-style): swap the text for a
// textarea with Send/Cancel. Sending fires a fresh turn with the edited text
// (same images + mode); the original turn is left untouched.
function beginInlineEdit(q, question, imgs, mode) {
  if (!q || q._editing) return;
  q._editing = true;
  const qText    = q.querySelector('.answer-q-text');
  const qActions = q.querySelector('.answer-q-actions');
  const qTime    = q.querySelector('.answer-time--q');
  [qText, qActions, qTime].forEach((el) => { if (el) el.style.display = 'none'; });

  const editor = document.createElement('div');
  editor.className = 'answer-q-editor';
  const ta = document.createElement('textarea');
  ta.className = 'answer-q-edit';
  ta.value = question || '';
  const row = document.createElement('div');
  row.className = 'answer-q-edit-row';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'answer-q-action';
  cancelBtn.textContent = '✕';
  cancelBtn.title = 'Cancel (Esc)';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'answer-q-action answer-q-action--send';
  sendBtn.textContent = '↵ Send';
  sendBtn.title = 'Send edited (Ctrl+Enter)';
  row.appendChild(cancelBtn);
  row.appendChild(sendBtn);
  editor.appendChild(ta);
  editor.appendChild(row);
  q.appendChild(editor);

  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.focus();
  try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch {}
  grow();
  ta.addEventListener('input', grow);

  const finish = () => {
    if (!q._editing) return;
    q._editing = false;
    editor.remove();
    [qText, qActions, qTime].forEach((el) => { if (el) el.style.display = ''; });
  };
  cancelBtn.addEventListener('click', finish);
  sendBtn.addEventListener('click', () => {
    const newText = ta.value.trim();
    finish();
    if (newText) resendTurn(newText, imgs);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBtn.click(); }
  });
}

window.api.onAnswerStart((data) => {
  const question = data && typeof data === "object" ? String(data.question || "") : String(data || "");
  const answerMode = (data && data.mode) || 'ANSWER';
  // If a previous answer bubble is still streaming and has no content yet,
  // remove it — it was interrupted before any tokens arrived.
  const streamContent = currentAnswerEl && currentAnswerEl._streamEl ? currentAnswerEl._streamEl.textContent : (currentAnswerEl && currentAnswerEl.textContent);
  if (currentAnswerEl && currentAnswerEl.classList.contains("streaming") && !(streamContent || '').trim()) {
    const oldTurn = currentAnswerEl.parentElement;
    if (oldTurn && oldTurn.classList.contains("answer-turn")) oldTurn.remove();
    if (answerHistory && !answerHistory.querySelector(".answer-turn") && answerEmpty) answerEmpty.hidden = false;
    currentAnswerEl = null;
  }
  const imgs = pendingBubbleImages.slice();
  pendingBubbleImages = [];
  currentAnswerEl = addAnswerTurn(question, imgs, answerMode);
});
window.api.onAnswerChunk((delta) => {
  if (!currentAnswerEl) currentAnswerEl = addAnswerTurn("", null, 'ANSWER');
  // Stream into the child div so the badge span is never destroyed by textContent=
  const target = currentAnswerEl._streamEl || currentAnswerEl;
  target.textContent += delta;
  // No auto-scroll during streaming — user reads from the top and scrolls manually.
});
// Strip any prose before the first code/mermaid block for CODE and DIAGRAM modes.
// Belt-and-suspenders: works even when the model ignores the no-intro instruction.
function stripLeadingIntro(text, mode) {
  if (mode === 'CODE') {
    const idx = text.indexOf('```');
    // idx >= 0: marker found — slice from it (idx=0 means already at start, safe)
    // idx === -1: no code block found — return as-is
    return idx >= 0 ? text.slice(idx) : text;
  }
  if (mode === 'DIAGRAM') {
    const idx = text.toLowerCase().indexOf('```mermaid');
    return idx >= 0 ? text.slice(idx) : text;
  }
  return text;
}

window.api.onAnswerDone(() => {
  if (currentAnswerEl) {
    currentAnswerEl.classList.remove("streaming");
    if (currentAnswerEl._timeEl) currentAnswerEl._timeEl.textContent = fmtTime();
    const answerMode = currentAnswerEl.dataset.mode || 'ANSWER';
    // Read raw streamed text from the child stream div (keeps badge untouched)
    const streamEl = currentAnswerEl._streamEl || currentAnswerEl;
    let rawText = streamEl.textContent || '';

    // Strip intro prose for CODE/DIAGRAM before any further processing
    if (answerMode === 'CODE' || answerMode === 'DIAGRAM') {
      const stripped = stripLeadingIntro(rawText, answerMode);
      rawText = stripped;
    }

    const stickyMatch = rawText.match(/<sticky>([\s\S]*?)<\/sticky>/i);

    if (stickyMatch) {
      const script = stickyMatch[1].trim();
      const md = rawText.replace(/<sticky>[\s\S]*?<\/sticky>/i, '').trimEnd();
      currentAnswerEl._rawText = md; // raw markdown for double-click → sticky
      streamEl.textContent = md;
      renderMermaidInElement(streamEl);
      if (streamEl.classList.contains('has-diagram')) currentAnswerEl.classList.add('has-diagram');
      appendScriptToAnswer(currentAnswerEl, script);
      if (window.api.openSticky) window.api.openSticky();
      if (window.api.sendStickyText) window.api.sendStickyText(script);
    } else {
      currentAnswerEl._rawText = rawText; // raw markdown for double-click → sticky
      streamEl.textContent = rawText;
      renderMermaidInElement(streamEl);
      if (streamEl.classList.contains('has-diagram')) currentAnswerEl.classList.add('has-diagram');
    }

    // For CODE mode — add Copy + Write to IDE action bar
    if (answerMode === 'CODE') {
      appendCodeActions(currentAnswerEl);
    }

    // Once the main diagram/program is produced, drop back to Text mode so
    // follow-up questions are answered (grounded on the CV, support material,
    // and the diagram/code just produced) rather than forced into another
    // diagram/code block.
    if ((answerMode === 'DIAGRAM' || answerMode === 'CODE') && manualMode === answerMode) {
      setManualMode('ANSWER');
      showStealthToast(answerMode === 'DIAGRAM'
        ? 'Switched to Text · follow-ups will build on this diagram'
        : 'Switched to Text · follow-ups will build on this code');
    }
  }
  currentAnswerEl = null;
});

// Double-click handler: push an answer bubble to the sticky note as rich
// markdown, so the sticky renders its diagrams and code exactly like the chat.
function injectAnswerToSticky(answerEl) {
  if (!answerEl) return;
  // Clear the word-selection that a double-click leaves behind.
  try { window.getSelection().removeAllRanges(); } catch {}
  // Prefer the stored raw markdown (has ```mermaid / code fences); fall back to
  // the rendered text if it's missing.
  const md = (answerEl._rawText || (answerEl._streamEl || answerEl).textContent || '').trim();
  if (!md) return;
  if (window.api.sendStickyRich) window.api.sendStickyRich(md);
  else if (window.api.sendStickyText) window.api.sendStickyText(md);
  if (window.api.openSticky) window.api.openSticky();
  showStealthToast('Sent to sticky note');
}

// Subtle, auto-dismissing notice (kept low-key for stealth).
let _stealthToastTimer = null;
function showStealthToast(msg) {
  let el = document.getElementById('stealthToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stealthToast';
    el.className = 'stealth-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('stealth-toast--show');
  if (_stealthToastTimer) clearTimeout(_stealthToastTimer);
  _stealthToastTimer = setTimeout(() => el.classList.remove('stealth-toast--show'), 3200);
}

// ── Code action bar: Copy + Write to IDE ─────────────────────────────────────
function extractCodeFromEl(el) {
  // Look in the stream child div first, then fall back to the element itself
  const root = el._streamEl || el;
  const pre = root.querySelector('pre code') || root.querySelector('pre') || root.querySelector('code');
  return (pre ? pre.textContent : root.textContent).trim();
}

// Tracks the pause button of the active write-to-IDE session
let currentIdePauseBtn = null;

function appendCodeActions(el) {
  const bar = document.createElement('div');
  bar.className = 'code-action-bar';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'code-action-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => {
    const code = extractCodeFromEl(el);
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
    });
  });

  const ideBtn = document.createElement('button');
  ideBtn.className = 'code-action-btn code-action-btn--ide';
  ideBtn.textContent = 'Write to IDE';
  ideBtn.addEventListener('click', () => startWriteToIde(el, ideBtn, pauseBtn));

  // Pause/resume button — hidden until typing is active for this bubble
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'code-action-btn code-action-btn--pause';
  pauseBtn.textContent = '⏸';
  pauseBtn.title = 'Pause typing';
  pauseBtn.hidden = true;
  let isPaused = false;
  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      window.api.pauseIdeTyping();
      pauseBtn.textContent = '▶';
      pauseBtn.title = 'Resume typing';
      pauseBtn.classList.add('code-action-btn--paused');
    } else {
      window.api.resumeIdeTyping();
      pauseBtn.textContent = '⏸';
      pauseBtn.title = 'Pause typing';
      pauseBtn.classList.remove('code-action-btn--paused');
    }
  });
  // Expose a reset helper for external state updates (e.g. focus-pause)
  pauseBtn._setExternalPause = (paused) => {
    isPaused = paused;
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.title = paused ? 'Resume typing' : 'Pause typing';
    pauseBtn.classList.toggle('code-action-btn--paused', paused);
  };

  bar.appendChild(copyBtn);
  bar.appendChild(ideBtn);
  bar.appendChild(pauseBtn);
  el.appendChild(bar);
}

function startWriteToIde(el, btn, pauseBtn) {
  const code = extractCodeFromEl(el);
  if (!code) return;

  const speedFactor = (() => {
    const s = document.getElementById('ideSpeedSlider');
    return s ? Number(s.value) : 3;
  })();

  let count = 3;
  btn.disabled = true;
  btn.classList.add('code-action-btn--counting');
  if (pauseBtn) { pauseBtn.hidden = true; pauseBtn._setExternalPause && pauseBtn._setExternalPause(false); }

  const tick = () => {
    btn.textContent = `Switch to IDE… ${count}`;
    if (count === 0) {
      btn.textContent = 'Typing…';
      // Show pause button and register it as the active one
      if (pauseBtn) { pauseBtn.hidden = false; currentIdePauseBtn = pauseBtn; }
      window.api.writeToIde(code, speedFactor).then(res => {
        btn.disabled = false;
        btn.classList.remove('code-action-btn--counting');
        btn.textContent = res && res.ok ? 'Done ✓' : 'Error — try again';
        setTimeout(() => { btn.textContent = 'Write to IDE'; }, 2500);
        if (pauseBtn) { pauseBtn.hidden = true; }
        if (currentIdePauseBtn === pauseBtn) currentIdePauseBtn = null;
      });
    } else {
      count--;
      setTimeout(tick, 1000);
    }
  };
  tick();
}

// Sync pause button UI when main process reports a state change
// (e.g. auto-paused because our app window got focused)
if (window.api && window.api.onIdeTypingState) {
  window.api.onIdeTypingState(({ paused }) => {
    if (currentIdePauseBtn && currentIdePauseBtn._setExternalPause)
      currentIdePauseBtn._setExternalPause(paused);
  });
}

// Render the structured talking-script as a styled block inside the answer bubble.
function appendScriptToAnswer(el, script) {
  const SECTIONS = ['OVERVIEW', 'WALKTHROUGH', 'KEY INSIGHT'];
  const wrapper = document.createElement('div');
  wrapper.className = 'answer-script';

  const header = document.createElement('div');
  header.className = 'answer-script-header';
  header.textContent = '📋 Presenter Script';
  wrapper.appendChild(header);

  const lines = script.split('\n');
  let currentSection = null;
  let bodyLines = [];

  function flushSection() {
    if (!currentSection) return;
    const sec = document.createElement('div');
    sec.className = 'answer-script-section';

    const label = document.createElement('div');
    label.className = 'answer-script-label';
    label.textContent = currentSection;
    sec.appendChild(label);

    const body = bodyLines.join('\n').trim();
    if (body) {
      body.split(/\n\n+/).forEach(para => {
        const p = document.createElement('p');
        p.className = 'answer-script-body';
        p.textContent = para.trim();
        sec.appendChild(p);
      });
    }
    wrapper.appendChild(sec);
    bodyLines = [];
    currentSection = null;
  }

  lines.forEach(line => {
    const heading = SECTIONS.find(s => line.trim() === s);
    if (heading) {
      flushSection();
      currentSection = heading;
    } else if (currentSection) {
      bodyLines.push(line);
    }
  });
  flushSection();

  el.appendChild(wrapper);
}

// Markdown + Mermaid rendering lives in diagram-shared.js (loaded before this
// file) so the sticky note renders diagrams/code identically. Here we just add
// the answer-panel behaviour: click a diagram to open the zoom/pan viewer.
function renderMermaidInElement(el) {
  renderDiagramsMarkdown(el, function (svgEl, ph) {
    ph.classList.add('expandable');
    ph.title = 'Click to expand';
    ph.addEventListener('click', () => openDiagramOverlay(svgEl));
  });
}

// ── Full-window diagram zoom/pan viewer ──────────────────────────────────────
const diagramOverlay      = document.getElementById('diagramOverlay');
const diagramOverlayStage = document.getElementById('diagramOverlayStage');
const _dov = { scale: 1, tx: 0, ty: 0, vbW: 0, vbH: 0, svg: null, dragging: false, lastX: 0, lastY: 0 };

function _dovApply() {
  if (!_dov.svg) return;
  _dov.svg.style.transform = `translate(${_dov.tx}px, ${_dov.ty}px) scale(${_dov.scale})`;
}
function _dovFit() {
  if (!_dov.svg || !diagramOverlayStage) return;
  const r = diagramOverlayStage.getBoundingClientRect();
  const s = Math.min(r.width / _dov.vbW, r.height / _dov.vbH) * 0.92;
  _dov.scale = s > 0 ? s : 1;
  _dov.tx = (r.width  - _dov.vbW * _dov.scale) / 2;
  _dov.ty = (r.height - _dov.vbH * _dov.scale) / 2;
  _dovApply();
}
function _dovZoomAt(cx, cy, factor) {
  const next = Math.max(0.1, Math.min(12, _dov.scale * factor));
  // Keep the point under the cursor fixed while zooming.
  _dov.tx = cx - ((cx - _dov.tx) / _dov.scale) * next;
  _dov.ty = cy - ((cy - _dov.ty) / _dov.scale) * next;
  _dov.scale = next;
  _dovApply();
}
function openDiagramOverlay(sourceSvg) {
  if (!diagramOverlay || !diagramOverlayStage || !sourceSvg) return;
  const vb = (sourceSvg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  _dov.vbW = vb[2] || sourceSvg.getBoundingClientRect().width  || 800;
  _dov.vbH = vb[3] || sourceSvg.getBoundingClientRect().height || 600;

  const clone = sourceSvg.cloneNode(true);
  clone.style.width  = _dov.vbW + 'px';
  clone.style.height = _dov.vbH + 'px';
  clone.style.maxHeight = 'none';
  diagramOverlayStage.innerHTML = '';
  diagramOverlayStage.appendChild(clone);
  _dov.svg = clone;

  diagramOverlay.hidden = false;
  // Fit after layout settles so the stage has its real size.
  requestAnimationFrame(_dovFit);
}
// Open an uploaded/captured screenshot in the same zoom/pan viewer.
function openImageOverlay(src) {
  if (!diagramOverlay || !diagramOverlayStage || !src) return;
  const img = new Image();
  img.onload = () => {
    _dov.vbW = img.naturalWidth  || 800;
    _dov.vbH = img.naturalHeight || 600;
    img.style.width  = _dov.vbW + 'px';
    img.style.height = _dov.vbH + 'px';
    diagramOverlayStage.innerHTML = '';
    diagramOverlayStage.appendChild(img);
    _dov.svg = img; // viewer transform applies to any element
    diagramOverlay.hidden = false;
    requestAnimationFrame(_dovFit);
  };
  img.src = src;
}
function closeDiagramOverlay() {
  if (!diagramOverlay) return;
  diagramOverlay.hidden = true;
  diagramOverlayStage.innerHTML = '';
  _dov.svg = null;
}

if (diagramOverlay) {
  document.getElementById('diagramOverlayClose').addEventListener('click', closeDiagramOverlay);
  document.getElementById('diagramZoomFit').addEventListener('click', _dovFit);
  document.getElementById('diagramZoomIn').addEventListener('click', () => {
    const r = diagramOverlayStage.getBoundingClientRect();
    _dovZoomAt(r.width / 2, r.height / 2, 1.25);
  });
  document.getElementById('diagramZoomOut').addEventListener('click', () => {
    const r = diagramOverlayStage.getBoundingClientRect();
    _dovZoomAt(r.width / 2, r.height / 2, 0.8);
  });
  // Wheel zoom centred on the cursor
  diagramOverlayStage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = diagramOverlayStage.getBoundingClientRect();
    _dovZoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89);
  }, { passive: false });
  // Drag to pan
  diagramOverlayStage.addEventListener('mousedown', (e) => {
    _dov.dragging = true; _dov.lastX = e.clientX; _dov.lastY = e.clientY;
    diagramOverlayStage.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!_dov.dragging) return;
    _dov.tx += e.clientX - _dov.lastX;
    _dov.ty += e.clientY - _dov.lastY;
    _dov.lastX = e.clientX; _dov.lastY = e.clientY;
    _dovApply();
  });
  window.addEventListener('mouseup', () => {
    _dov.dragging = false;
    diagramOverlayStage.classList.remove('dragging');
  });
  // Double-click resets to fit; click on empty backdrop closes
  diagramOverlayStage.addEventListener('dblclick', _dovFit);
  diagramOverlay.addEventListener('mousedown', (e) => { if (e.target === diagramOverlay) closeDiagramOverlay(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && diagramOverlay && !diagramOverlay.hidden) closeDiagramOverlay();
  });
}

window.api.onAnswerError((msg) => {
  if (currentAnswerEl) {
    currentAnswerEl.classList.remove("streaming");
    currentAnswerEl.textContent +=
      (currentAnswerEl.textContent ? "\n\n" : "") + "[error] " + msg;
    currentAnswerEl = null;
  } else {
    log("Answer error: " + msg, "err");
  }
});

// Global "Get answer" hotkey (Ctrl+Enter) routed from main.
if (window.api.onTriggerGetAnswer) window.api.onTriggerGetAnswer(() => submitComposer());
// Scroll-answer hotkeys (Ctrl+Up / Ctrl+Down) scroll the answer history.
if (window.api.onScrollAnswer) window.api.onScrollAnswer((dir) => {
  if (answerHistory) answerHistory.scrollTop += (dir || 0) * 120;
});
// Prompt-insert rail menu (✎) drops a saved prompt into the composer.
if (window.api.onInsertPromptText) window.api.onInsertPromptText((text) => appendToComposer(text));

// ---- Preset bar + answer settings (reuse the saved prompt store) ----
const setupPresetSelect = document.getElementById("setupPresetSelect");

async function refreshPresetSelect() {
  const cfg = await window.api.getAnswerConfig();
  const prompts = await window.api.getPrompts();
  const activeId = cfg.activePromptId || "";

  // Populate both selects with the same list
  for (const sel of [presetSelect, setupPresetSelect]) {
    if (!sel) continue;
    sel.innerHTML = '<option value="">(no prompt)</option>';
    for (const p of prompts) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title || "(untitled)";
      sel.appendChild(opt);
    }
    sel.value = activeId;
    if (sel._cselRefresh) sel._cselRefresh();
  }

  if (answerKeyEl) answerKeyEl.value = cfg.apiKey || "";
  await populateModelSelects();
}

function onPresetChange(sourceSelect) {
  const id = sourceSelect.value || null;
  window.api.setAnswerConfig({ activePromptId: id });
  // Keep both selects in sync
  for (const sel of [presetSelect, setupPresetSelect]) {
    if (sel && sel !== sourceSelect) sel.value = id || "";
  }
}

if (presetSelect) presetSelect.addEventListener("change", () => onPresetChange(presetSelect));
if (setupPresetSelect) setupPresetSelect.addEventListener("change", () => onPresetChange(setupPresetSelect));
if (answerKeyEl) {
  answerKeyEl.addEventListener("change", () => {
    window.api.setAnswerConfig({ apiKey: answerKeyEl.value.trim() });
    // A new key may expose a different model list — refresh it.
    populateModelSelects();
  });
}
refreshPresetSelect();

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

  if (txCfg.engine === "deepgram" || txCfg.engine === "xai") {
    const isXai = txCfg.engine === "xai";
    const apiKey = isXai ? txCfg.xaiApiKey : txCfg.deepgramApiKey;
    const label = isXai ? "xAI" : "Deepgram";
    if (!apiKey) {
      log(`${label} API key not set`, "err");
      return;
    }

    const startStream = isXai
      ? window.api.startXaiStream
      : window.api.startDeepgramStream;
    await startStream({ apiKey, language: txCfg.language || "auto" });

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

    recState = { ctx, streams, processor, streaming: true, xai: isXai };
    recBtn.classList.add("on");
    updateRecTitle();
    log(`Voice transcription started (${label} live)`, "info");
    return;
  }

  log("Unknown transcription engine: " + txCfg.engine, "err");
}

async function stopVoice() {
  if (!recState) return;
  try {
    recState.processor.disconnect();
  } catch {}
  recState.streams.forEach((s) =>
    s.getTracks ? s.getTracks().forEach((t) => t.stop()) : null,
  );
  try {
    await recState.ctx.close();
  } catch {}
  if (recState.xai) await window.api.stopXaiStream();
  else await window.api.stopDeepgramStream();
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
  maxSupportersEl.value = netCfg.maxSupporters || 5;
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
      ? `Start hosting on ${addr}?\n\nThis will:\n  • Bind a WebSocket server on the port\n  • Capture your microphone + system audio when a supporter connects\n  • Stream audio to up to ${netCfg.maxSupporters || 5} supporter(s)`
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
