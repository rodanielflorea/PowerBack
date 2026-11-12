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

const micSelect = document.getElementById("micSelect");
const captureMicEl = document.getElementById("captureMic");
const captureSystemEl = document.getElementById("captureSystem");
const engineDeepgram = document.getElementById("engineDeepgram");
const engineXai = document.getElementById("engineXai");
const deepgramKeyEl = document.getElementById("deepgramKey");

const xaiKeyEl = document.getElementById("xaiKey");
const languageSelect = document.getElementById("languageSelect");


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
// Read the saved settings at startup, so remembered choices (auto-submission,
// upload) apply before Settings is ever opened.
if (window.api && window.api.getTranscriptionConfig) {
  window.api.getTranscriptionConfig().then((c) => { if (!txCfg && c) txCfg = c; }).catch(() => {});
}

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
    let group = null;
    for (const o of Array.from(sel.options)) {
      const og = o.parentElement && o.parentElement.tagName === "OPTGROUP" ? o.parentElement : null;
      if (og && og !== group) {
        const head = document.createElement("div");
        head.className = "csel-group";
        head.textContent = og.label;
        itemsBox.appendChild(head);
      }
      group = og;
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

  function syncDisabled() {
    const off = !!sel.disabled;
    wrap.classList.toggle("is-disabled", off);
    btn.setAttribute("aria-disabled", off ? "true" : "false");
    btn.tabIndex = off ? -1 : 0;
    if (off) close();
  }

  function open() {
    if (sel.disabled) return;
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
    if (sel.disabled) return;
    list.hidden ? open() : close();
  });
  btn.addEventListener("keydown", (e) => {
    if (sel.disabled) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); list.hidden ? open() : close(); }
    if (e.key === "Escape") close();
  });
  document.addEventListener("click", close);

  // Watch for option changes (populateModelSelects rebuilds options dynamically)
  const mo = new MutationObserver(() => {
    refresh();
    syncDisabled();
  });
  mo.observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected", "disabled"] });

  refresh();
  syncDisabled();
  sel._cselRefresh = refresh;
  sel._cselSyncDisabled = syncDisabled;
}

// Apply to every <select> in the document after DOM is ready.
// compact=true for the small presetbar selects.
(function applyCustomSelects() {
  const compactIds = new Set(["answerModelHeader", "answerProviderSelect", "meetingTypeSelect"]);
  document.querySelectorAll("select").forEach((sel) => {
    makeCustomSelect(sel, compactIds.has(sel.id));
    if (sel.id === "answerProviderSelect" && sel.parentElement) {
      sel.parentElement.classList.add("csel-provider");
    }
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
// Keep the header bar usable while click-through is on (so it can be switched
// off again and the window moved): re-enable mouse events over the header only.
(() => {
  const bar = document.querySelector(".titlebar");
  if (!bar || !window.api.clickThroughHover) return;
  let over = false;
  const report = (v) => { if (over === v) return; over = v; window.api.clickThroughHover(v); };
  bar.addEventListener("mouseenter", () => report(true));
  bar.addEventListener("mouseleave", () => report(false));
  // the update question takes clicks as well, or it could not be answered
  document.addEventListener("mousemove", (e) => report(!!e.target.closest && !!e.target.closest(".titlebar, #updateModal")));
  // The app takes the report only while click-through is on: after a switch
  // it is made again with the next move of the pointer.
  window.api.onClickThroughChanged(() => { over = false; });
})();

hideBtn.addEventListener("click", () => window.api.hide());
quitBtn.addEventListener("click", () => window.api.quit());

function applyRoleClass(role) {
  if (!role && typeof closeSidePane === "function") closeSidePane();
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

const stageOverlay = document.getElementById("stageOverlay");
const profileOverlay = document.getElementById("profileOverlay");

function hideAllSetupOverlays() {
  const joinEl = document.getElementById("joinOverlay");
  if (joinEl) joinEl.hidden = true;
  const supPanel = document.getElementById("supporterPanel");
  if (supPanel) supPanel.hidden = true;
  if (modeSelectOverlay) modeSelectOverlay.hidden = true;
  if (stageOverlay) stageOverlay.hidden = true;
  if (profileOverlay) profileOverlay.hidden = true;
  if (setupOverlay) setupOverlay.hidden = true;
  if (continueOverlay) continueOverlay.hidden = true;
}

function leaveInterviewUi() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  hideAllSetupOverlays();
  document.body.classList.remove("in-interview");
  endBtn.classList.remove("live");
  applyRoleClass("");
  if (answerMain) answerMain.hidden = true;
  // an update question that had to wait for the tour or the interview
  if (typeof showHeldUpdateOffer === "function") showHeldUpdateOffer();
}

// Wizard step 1: interview stage.
function showStage() {
  leaveInterviewUi();
  if (stageOverlay) stageOverlay.hidden = false;
}

// Wizard step 2: profile.
function showProfile() {
  leaveInterviewUi();
  if (profileOverlay) profileOverlay.hidden = false;
  if (typeof refreshProfiles === "function") refreshProfiles();
}

// Stage 1 — the New/Continue chooser shown on launch and after ending a session.
function showModeSelect() {
  if (typeof setResumeMode === "function") setResumeMode(null);
  if (settingsOverlay) settingsOverlay.hidden = true;
  hideAllSetupOverlays();
  if (modeSelectOverlay) modeSelectOverlay.hidden = false;
  document.body.classList.remove("in-interview");
  endBtn.classList.remove("live");
  applyRoleClass("");
  if (answerMain) answerMain.hidden = true;
  // an update question that had to wait for the tour or the interview
  if (typeof showHeldUpdateOffer === "function") showHeldUpdateOffer();
}

// Wizard step 3: materials + salary, then Start.
function showSetup() {
  if (settingsOverlay) settingsOverlay.hidden = true;
  hideAllSetupOverlays();
  setupOverlay.hidden = false;
  document.body.classList.remove("in-interview");
  endBtn.classList.remove("live");
  applyRoleClass("");
  if (answerMain) answerMain.hidden = true;
  if (typeof refreshKb === "function") refreshKb();
  if (typeof refreshProfiles === "function") refreshProfiles();
}

// ── Named profiles: picker + save/update/delete on the New-session form ───────
const profileSelect = document.getElementById("profileSelect");
const profileSaveNewBtn = document.getElementById("profileSaveNewBtn");
const profileUpdateBtn = document.getElementById("profileUpdateBtn");
const profileDeleteBtn = document.getElementById("profileDeleteBtn");
let _profiles = [];

function readProfileFields() {
  const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const city = v("profileCity") === "__other" ? v("profileCityCustom") : v("profileCity");
  return { name: v("profileName"), city, country: v("profileCountry"), timezone: v("profileTimezone") };
}

// Country / city pickers (renderer/geo.js). Picking a city fills the timezone.
function setSelectValue(sel, val) {
  if (!sel) return;
  if (val && ![...sel.options].some((o) => o.value === val)) {
    const o = document.createElement("option"); o.value = val; o.textContent = val; sel.appendChild(o);
  }
  sel.value = val || "";
  if (sel._cselRefresh) sel._cselRefresh();
}
function populateCountrySelect() {
  const sel = document.getElementById("profileCountry");
  if (!sel || !window.GEO) return;
  sel.innerHTML = '<option value="">Country…</option>' + window.GEO.map((g) => `<option value="${g.c}">${g.c}</option>`).join("");
  if (sel._cselRefresh) sel._cselRefresh();
}
function populateCitySelect(country, current) {
  const sel = document.getElementById("profileCity");
  const custom = document.getElementById("profileCityCustom");
  if (!sel) return;
  const entry = (window.GEO || []).find((g) => g.c === country);
  const cities = entry ? entry.cities.map((c) => c[0]) : [];
  sel.innerHTML = '<option value="">City…</option>' + cities.map((c) => `<option value="${c}">${c}</option>`).join("") + '<option value="__other">Other (type it)…</option>';
  const known = current && cities.includes(current);
  sel.value = known ? current : (current ? "__other" : "");
  if (custom) { custom.hidden = sel.value !== "__other"; custom.value = known ? "" : (current || ""); }
  if (sel._cselRefresh) sel._cselRefresh();
}
function timezoneForCity(country, city) {
  const entry = (window.GEO || []).find((g) => g.c === country);
  const hit = entry && entry.cities.find((c) => c[0] === city);
  return hit ? hit[1] : (entry && entry.cities[0] ? entry.cities[0][1] : "");
}
(function wireGeoPickers() {
  const countrySel = document.getElementById("profileCountry");
  const citySel = document.getElementById("profileCity");
  const custom = document.getElementById("profileCityCustom");
  const tz = document.getElementById("profileTimezone");
  populateCountrySelect();
  populateCitySelect("", "");
  if (countrySel) countrySel.addEventListener("change", () => {
    populateCitySelect(countrySel.value, "");
    const z = timezoneForCity(countrySel.value, "");
    if (tz && z) { tz.value = z; if (tz._cselRefresh) tz._cselRefresh(); }
  });
  if (citySel) citySel.addEventListener("change", () => {
    if (custom) custom.hidden = citySel.value !== "__other";
    if (citySel.value === "__other") { if (custom) custom.focus(); return; }
    const z = timezoneForCity(countrySel ? countrySel.value : "", citySel.value);
    if (tz && z) { tz.value = z; if (tz._cselRefresh) tz._cselRefresh(); }
  });
})();
function fillProfileFields(p) {
  p = p || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("profileName", p.name);
  setSelectValue(document.getElementById("profileCountry"), p.country || "");
  populateCitySelect(p.country || "", p.city || "");
  const tz = document.getElementById("profileTimezone");
  if (tz) { tz.value = p.timezone || ""; if (tz._cselRefresh) tz._cselRefresh(); }
}

async function refreshProfiles(selectId) {
  if (typeof closeSaveRow === "function") closeSaveRow();
  if (!profileSelect || !window.api.profilesList) return;
  const data = await window.api.profilesList().catch(() => null);
  _profiles = (data && data.profiles) || [];
  const wantId = selectId || (data && data.activeProfileId) || (_profiles[0] && _profiles[0].id) || "";
  profileSelect.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = _profiles.length ? "— Select profile —" : "— No saved profiles —";
  profileSelect.appendChild(blank);
  _profiles.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id; o.textContent = p.label || "(unnamed)";
    profileSelect.appendChild(o);
  });
  profileSelect.value = _profiles.some((p) => p.id === wantId) ? wantId : "";
  if (profileSelect._cselRefresh) profileSelect._cselRefresh();
  const active = _profiles.find((p) => p.id === profileSelect.value);
  if (active) fillProfileFields(active);
}

if (profileSelect) {
  profileSelect.addEventListener("change", () => {
    const p = _profiles.find((x) => x.id === profileSelect.value);
    if (p) { fillProfileFields(p); if (window.api.profileSetActive) window.api.profileSetActive(p.id); }
  });
}
// Inline "save as new" row (Electron has no window.prompt).
const profileSaveRow = document.getElementById("profileSaveRow");
const profileLabelInput = document.getElementById("profileLabelInput");
const profileSaveConfirm = document.getElementById("profileSaveConfirm");
const profileSaveCancel = document.getElementById("profileSaveCancel");

function openSaveRow() {
  if (!profileSaveRow) return;
  if (profileLabelInput) profileLabelInput.value = readProfileFields().name || "";
  profileSaveRow.hidden = false;
  if (profileLabelInput) { profileLabelInput.focus(); profileLabelInput.select(); }
}
function closeSaveRow() { if (profileSaveRow) profileSaveRow.hidden = true; }
async function confirmSaveRow() {
  const label = (profileLabelInput ? profileLabelInput.value : "").trim();
  if (!label) { if (profileLabelInput) profileLabelInput.focus(); return; }
  if (!window.api.profileSaveNew) { window.alert("Profiles need the latest app version — fully close and reopen the app."); return; }
  try {
    const id = await window.api.profileSaveNew(label, readProfileFields());
    closeSaveRow();
    await refreshProfiles(id);
    if (!id) window.alert("Could not save the profile.");
  } catch (e) {
    window.alert("Could not save the profile — please fully close and reopen the app to load the update.\n\n" + (e && e.message ? e.message : e));
  }
}
if (profileSaveNewBtn) profileSaveNewBtn.addEventListener("click", openSaveRow);
if (profileSaveConfirm) profileSaveConfirm.addEventListener("click", confirmSaveRow);
if (profileSaveCancel) profileSaveCancel.addEventListener("click", closeSaveRow);
if (profileLabelInput) profileLabelInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); confirmSaveRow(); }
  else if (e.key === "Escape") { e.preventDefault(); closeSaveRow(); }
});
if (profileUpdateBtn) profileUpdateBtn.addEventListener("click", async () => {
  const id = profileSelect ? profileSelect.value : "";
  if (!id) { window.alert("Select a profile to update, or press ＋ to save a new one."); return; }
  const cur = _profiles.find((p) => p.id === id);
  await window.api.profileUpdate(id, cur ? cur.label : null, readProfileFields());
  await refreshProfiles(id);
});
if (profileDeleteBtn) profileDeleteBtn.addEventListener("click", async () => {
  const id = profileSelect ? profileSelect.value : "";
  if (!id) return;
  const cur = _profiles.find((p) => p.id === id);
  if (!window.confirm(`Delete profile "${cur ? cur.label : ""}"?`)) return;
  await window.api.profileDelete(id);
  await refreshProfiles();
});

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
  const role = "speaker";
  applyRoleClass(role);
  if (answerMain) answerMain.hidden = false;
}

// Mode-chooser + back navigation.
const modeNewBtn = document.getElementById("modeNewBtn");
const modeContinueBtn = document.getElementById("modeContinueBtn");
const setupBackBtn = document.getElementById("setupBackBtn");
const continueBackBtn = document.getElementById("continueBackBtn");
const modeSelectSettingsBtn = document.getElementById("modeSelectSettingsBtn");
if (modeNewBtn) modeNewBtn.addEventListener("click", async () => {
  // Start fresh: clear any carried-over materials (profile is still pre-filled).
  if (window.api.kbClear) await window.api.kbClear();
  setResumeMode(null);
  showStage();
});
if (modeContinueBtn) modeContinueBtn.addEventListener("click", () => showContinue());
if (setupBackBtn) setupBackBtn.addEventListener("click", () => showProfile());

// Wizard navigation.
const stageBackBtn = document.getElementById("stageBackBtn");
const stageNextBtn = document.getElementById("stageNextBtn");
const profileBackBtn = document.getElementById("profileBackBtn");
const profileNextBtn = document.getElementById("profileNextBtn");
if (stageBackBtn) stageBackBtn.addEventListener("click", () => showModeSelect());
if (stageNextBtn) stageNextBtn.addEventListener("click", async () => {
  await saveWizardMeetingType();
  showProfile();
});
if (profileBackBtn) profileBackBtn.addEventListener("click", () => showStage());
if (profileNextBtn) profileNextBtn.addEventListener("click", () => {
  const nameEl = document.getElementById("profileName");
  if (nameEl && !nameEl.value.trim()) { nameEl.focus(); nameEl.classList.add("input-error"); setTimeout(() => nameEl.classList.remove("input-error"), 1200); return; }
  showSetup();
});
// Next / Start buttons: a ripple spreads from where the button was pressed.
document.querySelectorAll(".wizard-next").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement("span");
    dot.className = "wizard-ripple";
    dot.style.width = dot.style.height = size + "px";
    dot.style.left = (e.clientX - r.left - size / 2) + "px";
    dot.style.top = (e.clientY - r.top - size / 2) + "px";
    b.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove());
  });
});
for (const id of ["stageSettingsBtn", "profileSettingsBtn"]) {
  const b = document.getElementById(id);
  if (b) b.addEventListener("click", () => openSettings());
}
// ── Session history: resume a saved interview from the materials step ────────
let resumeSessionId = null;
const historyOverlay = document.getElementById("historyOverlay");
const historyList = document.getElementById("historyList");
const historySearch = document.getElementById("historySearch");
const historyEmpty = document.getElementById("historyEmpty");
let _historyItems = [];

function setResumeMode(id) {
  resumeSessionId = id || null;
  if (setupStartBtnV) setupStartBtnV.firstElementChild.textContent = resumeSessionId ? "Resume" : "Start";
  const title = setupOverlay && setupOverlay.querySelector(".setup-title");
  if (title) title.textContent = resumeSessionId ? "Materials · resume" : "Materials";
}

function renderHistory() {
  if (!historyList) return;
  const q = (historySearch && historySearch.value.trim().toLowerCase()) || "";
  const items = _historyItems.filter((s) => {
    if (!q) return true;
    const p = s.profile || {};
    return [s.company, s.position, s.name, p.name, p.timezone, p.city, p.country].join(" ").toLowerCase().includes(q);
  });
  historyList.innerHTML = "";
  if (historyEmpty) historyEmpty.hidden = items.length > 0;
  if (historyEmpty && !items.length && _historyItems.length) historyEmpty.textContent = "Nothing matches your search.";
  if (historyEmpty && !_historyItems.length) historyEmpty.textContent = "No saved interviews yet. A session is saved when you end an interview.";
  const esc = (t) => String(t || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  items.forEach((s) => {
    const p = s.profile || {};
    const b = document.createElement("button");
    b.type = "button";
    b.className = "history-item";
    const head = [s.company, s.position].filter(Boolean).map(esc).join(" · ");
    const when = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
    b.innerHTML =
      `<span class="history-title">${head || '<span class="history-untitled">Untitled interview</span>'}</span>` +
      `<span class="history-meta">` +
        (p.name ? `<span class="meta-ico"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>${esc(p.name)}</span>` : "") +
        (p.timezone ? `<span class="meta-ico"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${esc(p.timezone)}</span>` : "") +
        (when ? `<span>${esc(when)}</span>` : "") +
        `<span>${s.turnCount || 0} turns</span>` +
      `</span>`;
    b.addEventListener("click", () => resumeFromHistory(s));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "history-del";
    del.title = "Delete this session";
    del.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="m6 7 1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete "${(s.company || "") + (s.position ? " · " + s.position : "") || s.name || "this session"}"? This also removes its saved folder.`)) return;
      await window.api.sessionDelete(s.id);
      _historyItems = _historyItems.filter((x) => x.id !== s.id);
      renderHistory();
    });
    const row = document.createElement("div");
    row.className = "history-row";
    row.appendChild(b);
    row.appendChild(del);
    historyList.appendChild(row);
  });
}

async function openHistory() {
  if (!historyOverlay || !window.api.sessionList) return;
  // Sessions that were started but never used (no turns, never ended) are noise.
  _historyItems = ((await window.api.sessionList()) || []).filter((s) => s.company || s.position || (s.turnCount || 0) > 0);
  if (historySearch) historySearch.value = "";
  renderHistory();
  historyOverlay.hidden = false;
  if (historySearch) historySearch.focus();
}
function closeHistory() { if (historyOverlay) historyOverlay.hidden = true; }

// Load the saved session's materials + profile and go to the materials step.
async function resumeFromHistory(item) {
  const data = await window.api.sessionLoad(item.id);
  if (!data) return;
  closeHistory();
  fillProfileFields(data.profile || {});
  const sal = item.salary || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; if (el._cselRefresh) el._cselRefresh(); } };
  set("salaryAmount", sal.amount || "");
  set("salaryCurrency", sal.currency || "USD");
  set("salaryPeriod", sal.period || "month");
  setResumeMode(item.id);
  showSetup();
}

const historyBtn = document.getElementById("historyBtn");
const historyCloseBtn = document.getElementById("historyCloseBtn");
if (historyBtn) historyBtn.addEventListener("click", openHistory);
if (historyCloseBtn) historyCloseBtn.addEventListener("click", closeHistory);
if (historySearch) historySearch.addEventListener("input", renderHistory);
if (historyOverlay) historyOverlay.addEventListener("click", (e) => { if (e.target === historyOverlay) closeHistory(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && historyOverlay && !historyOverlay.hidden) closeHistory(); });

// ── System check (Settings → Check) ─────────────────────────────────────────
const diagRunBtn = document.getElementById("diagRunBtn");
async function runDiagnostics() {
  const list = document.getElementById("diagList");
  const st = document.getElementById("diagStatus");
  if (!list || !window.api.runDiagnostics) return;
  if (st) st.textContent = "Checking…";
  const res = await window.api.runDiagnostics();
  const esc = (t) => String(t || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  list.innerHTML = (res.checks || []).map((c) =>
    `<div class="diag-item ${c.ok ? "diag-item--ok" : "diag-item--bad"}"><span class="diag-icon">${c.ok ? "✓" : "!"}</span><div><div class="diag-name">${esc(c.name)}</div>` +
    `<div class="diag-detail">${esc(c.detail)}</div>${c.fix ? `<div class="diag-fix">${esc(c.fix)}</div>` : ""}</div></div>`).join("");
  const bad = (res.checks || []).filter((c) => !c.ok).length;
  if (st) st.textContent = bad ? `${bad} item${bad > 1 ? "s" : ""} need attention` : "All good";
  const restartHint = document.getElementById("diagRestartHint");
  if (restartHint) restartHint.hidden = !res.macRestartHint;
  const installBtn = document.getElementById("diagInstallBtn");
  if (installBtn) installBtn.hidden = !(res.canInstallTools && (res.checks || []).some((c) => !c.ok && /Typing tool/.test(c.name)));
}
const diagRelaunchBtn = document.getElementById("diagRelaunchBtn");
if (diagRelaunchBtn) diagRelaunchBtn.addEventListener("click", () => { if (window.api.relaunchApp) window.api.relaunchApp(); });
const diagInstallBtn = document.getElementById("diagInstallBtn");
if (diagInstallBtn) diagInstallBtn.addEventListener("click", async () => {
  const st = document.getElementById("diagStatus");
  diagInstallBtn.disabled = true;
  if (st) st.textContent = "Installing… (enter your password in the system prompt)";
  const r = await window.api.installLinuxTools();
  diagInstallBtn.disabled = false;
  if (!r.ok) toast(r.error || "Install failed", "err"); else toast("Tools installed.", "info");
  runDiagnostics();
});
if (diagRunBtn) diagRunBtn.addEventListener("click", runDiagnostics);

const welcomeHelpBtn = document.getElementById("welcomeHelpBtn");
if (welcomeHelpBtn) welcomeHelpBtn.addEventListener("click", () => { openSettings(); if (typeof activateTab === "function") activateTab("help"); });

// Version + build date on the welcome screen.
if (window.api.getAppInfo) {
  window.api.getAppInfo().then((info) => {
    const v = document.getElementById("welcomeVersion");
    const u = document.getElementById("welcomeUpdated");
    if (v) v.textContent = "Version " + (info.version || "");
    if (u && info.buildDate) u.textContent = "Updated " + new Date(info.buildDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }).catch(() => {});
}
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
  await saveWizardMeetingType();
  const sup = false; // the interview wizard always starts the speaker; supporters join from the welcome screen
  const chosenRole = "speaker";
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
  await window.api.setNetworkConfig(patch);
  netCfg = await window.api.getNetworkConfig();
  await window.api.startNetwork();
  // Fresh session for the speaker's answer panel — snapshot profile + materials.
  if (!sup) {
    clearAnswerPanel();
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const profile = readProfileFields();
    const amount = Number(val("salaryAmount"));
    const salary = amount > 0 ? { amount, currency: val("salaryCurrency") || "USD", period: val("salaryPeriod") || "month" } : null;
    if (resumeSessionId && window.api.sessionResume) {
      const data = await window.api.sessionResume(resumeSessionId, { profile, salary });
      if (data) renderLoadedTurns(data.turns || []);
      setResumeMode(null);
    } else if (window.api.sessionNew) {
      await window.api.sessionNew({ profile, salary });
    }
    maybeOpenInfoWindow(profile);
  }
  hideSetup();
  log(`Started: voice mode as ${chosenRole}`, "info");
  // Transcription starts by itself once the interview screen is up.
  setTimeout(() => { if (!recState && typeof startVoice === "function") startVoice(); }, 400);
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
  window.__script = [];
  if (answerHistory) answerHistory.querySelectorAll(".answer-turn, .meet-turn").forEach((n) => n.remove());
  if (answerEmpty) answerEmpty.hidden = false;
  if (answerSpacer) answerSpacer.style.height = "0px";
  meetingTurns = [];
  liveMeetEl = null;
  lastMeetEl = null;
  liveSeg = "";
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
    del.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="m6 7 1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';
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

// A failed upload must be visible: the log panel is usually closed.
function uploadFailed(name, error) {
  log(`Upload failed (${name}): ${error}`, "err");
  toast(`Could not upload ${name}: ${error}`, "err");
}

async function addContinueKbFiles(id, kind, fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const r = await window.api.sessionKbAdd(id, kind, f.name, buf);
      if (r && !r.ok) uploadFailed(f.name, r.error || "error");
    } catch (err) {
      uploadFailed(f.name, err.message);
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
    if (t && t.kind === "meet") {
      const who = t.who || "Interviewer";
      const text = String(t.text || "").trim();
      if (!text || t.self) return; // an older build saved the user's own speech; it gets no bubble
      // Newer saves carry the lines; older ones are a single speaker.
      const lines = Array.isArray(t.lines) && t.lines.length
        ? t.lines.filter((l) => l && !l.self).map((l) => ({ who: l.who || who, text: String(l.text || "").trim() })).filter((l) => l.text)
        : [{ who, text }];
      if (lines.length) addMeetBubble(lines, false);
      return;
    }
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
      if (r && !r.ok) uploadFailed(f.name, r.error || "error");
    } catch (err) {
      uploadFailed(f.name, err.message);
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

// Chronological transcript of the whole session, appended live from both audio
// sides plus the candidate's typed questions and the suggested answers.
window.__script = [];
function profileNameForScript() {
  return (typeof readProfileFields === "function" && readProfileFields().name) || "Candidate";
}
function pushScript(who, text) {
  const t = String(text || "").trim();
  if (t) window.__script.push({ who, text: t });
}
function buildSessionScript() {
  return window.__script.map((e) => e.who + ": " + e.text).join("\n\n");
}

async function showEndModal() {
  endModalList.innerHTML = "";
  if (recState) addModalItem("Voice transcription · running", "live");
  else addModalItem("Voice transcription · idle", "idle");

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

endBtn.addEventListener("click", async () => {
  if (document.body.classList.contains("role-supporter")) { leaveSupporterView(); return; }
  endBtn.disabled = true;
  let info = { company: "", role: "" };
  try { if (window.api.extractJdInfo) info = (await window.api.extractJdInfo()) || info; } catch {}
  try { await endSessionAndSave(info.company || "", info.role || ""); }
  finally { endBtn.disabled = false; }
});
if (typeof endModalCancel !== "undefined" && endModalCancel) endModalCancel.addEventListener("click", hideEndModal);
// ── gofile.io upload ─────────────────────────────────────────────────────────
// After End has written the session folder, push it to gofile.io and show the
// share link. Runs detached from End so a slow upload never holds up the return
// to setup; the link also lands in gofile-link.txt inside the session folder.
const uploadModal = document.getElementById("uploadModal");
const uploadModalLink = document.getElementById("uploadModalLink");
const uploadModalList = document.getElementById("uploadModalList");
const uploadModalLead = document.getElementById("uploadModalLead");

function showUploadModal(r) {
  if (!uploadModal) return;
  uploadModalLink.value = r.link;
  uploadModalList.innerHTML = "";
  const item = (text, cls) => {
    const li = document.createElement("li");
    li.className = cls;
    li.textContent = text;
    uploadModalList.appendChild(li);
  };
  item(`${r.uploaded.length} file${r.uploaded.length === 1 ? "" : "s"} uploaded`, "live");
  for (const f of r.failed || []) item(`${f.name} — failed: ${f.error}`, "idle");
  uploadModalLead.textContent =
    "Link copied to the clipboard. Anyone with it can download the session files.";
  uploadModal.hidden = false;
  try { uploadModalLink.focus(); uploadModalLink.select(); } catch {}
}

function hideUploadModal() { if (uploadModal) uploadModal.hidden = true; }

if (uploadModal) {
  document.getElementById("uploadModalClose").addEventListener("click", hideUploadModal);
  document.getElementById("uploadModalCopy").addEventListener("click", () => {
    if (window.api.copyText) window.api.copyText(uploadModalLink.value);
    toast("Link copied", "info");
  });
  document.getElementById("uploadModalOpen").addEventListener("click", () => {
    if (window.api.openExternal) window.api.openExternal(uploadModalLink.value);
  });
}
if (window.api.onUploadProgress) {
  window.api.onUploadProgress((p) => log(`gofile: uploading ${p.index}/${p.total} — ${p.name}`));
}

async function uploadSessionToGofile(folder) {
  if (!window.api.uploadSessionBundle) return;
  toast("Uploading session to gofile.io…", "info");
  log("gofile: upload started", "info");
  let r;
  try { r = await window.api.uploadSessionBundle(folder); }
  catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) {
    const msg = (r && r.error) || "unknown error";
    toast("Upload failed: " + msg, "err");
    log("gofile: upload failed — " + msg, "err");
    return;
  }
  try { if (window.api.copyText) await window.api.copyText(r.link); } catch {}
  log(`gofile: ${r.link} (${r.uploaded.length} file(s), ${(r.failed || []).length} failed)`, "info");
  toast("Uploaded — link copied: " + r.link, "info");
  showUploadModal(r);
}

async function endSessionAndSave(company, position) {
  if (typeof persistMeetBubble === "function") await persistMeetBubble(lastMeetEl, true);
  let title = "";
  if (window.api.sessionFinalize) title = await window.api.sessionFinalize(company, position).catch(() => "");
  // Close the recording first: the video goes into the session's folder with
  // the transcript and the documents, and the folder opens when all is in it.
  if (typeof window.stopRecording === "function") { try { await window.stopRecording(); } catch {} }
  // Auto-save everything into one folder in Documents (no save dialog).
  let folder = "";
  try {
    const script = buildSessionScript();
    if (window.api.saveSessionBundle) {
      const rb = await window.api.saveSessionBundle({ role: position, company, transcript: script });
      if (rb && rb.ok) folder = rb.folder;
      else log("Session could not be saved: " + ((rb && rb.error) || "unknown"), "err");
    }
  } catch {}
  window.__script = [];
  if (recState) await stopVoice().catch(() => {});
  await window.api.stopNetwork();
  teardownPeers();
  delete netActionBtn.dataset.connecting;
  if (window.api.infoClose) window.api.infoClose();
  if (folder) toast("Session saved to " + folder, "info");
  log("Session ended — back to setup", "info");
  showModeSelect();
  if (folder && (!txCfg || txCfg.uploadSession !== false)) uploadSessionToGofile(folder);
}

document.addEventListener("keydown", (e) => {
  if (!endModal.hidden && e.key === "Escape") hideEndModal();
  if (uploadModal && !uploadModal.hidden && e.key === "Escape") hideUploadModal();
});

showModeSelect();

window.api.onOpacityChanged((v) => updateFill(v));
// Linux: the window is transparent and opacity is applied to the page itself.
if (window.api.onOpacityCss) window.api.onOpacityCss((v) => { document.documentElement.style.opacity = String(v); });
// Grey out controls the OS cannot support, with an explanation.
if (window.api.getPlatformCaps) {
  window.api.getPlatformCaps().then((caps) => {
    if (!caps) return;
    if (!caps.stealth && stealthBtn) { stealthBtn.disabled = true; stealthBtn.classList.add("btn--unsupported"); stealthBtn.title = caps.stealthNote || "Not available on this system"; }
    else if (caps.stealthNote && stealthBtn) stealthBtn.title = "Toggle stealth (hidden from screen capture). " + caps.stealthNote;
    if (!caps.clickThrough && clickThroughBtn) { clickThroughBtn.disabled = true; clickThroughBtn.classList.add("btn--unsupported"); clickThroughBtn.title = "Click-through is not available on Wayland (Linux); it works in an X11 session."; }
  }).catch(() => {});
}
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
  updaterInstallBtn.addEventListener("click", async () => {
    const ok = await window.api.installUpdateNow().catch(() => false);
    if (!ok && updaterStatusEl) updaterStatusEl.textContent = "The installer could not be started.";
  });


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

// ── The update question ──────────────────────────────────────────────────────
// A new version is offered, never installed unasked. "Update" downloads it and
// shows how far it is; then the app closes, the installer shows its own
// progress and starts the app again. "Later" closes the question for this run;
// it comes back at the next start.
const updateModal = document.getElementById("updateModal");
const updateModalTitle = document.getElementById("updateModalTitle");
const updateModalLead = document.getElementById("updateModalLead");
const updateProgress = document.getElementById("updateProgress");
const updateProgressFill = document.getElementById("updateProgressFill");
const updateProgressText = document.getElementById("updateProgressText");
const updateModalLater = document.getElementById("updateModalLater");
const updateModalNow = document.getElementById("updateModalNow");
// var, not let: showModeSelect() runs once further up, before these lines
var updateStage = "";     // "", "offer", "download", "install", "error"
var updateHeld = null;    // a question that came during the tour or an interview
let updateVersion = "";
let updatePlatform = "";
let updateInstallWatch = null;
let updateLastPercent = 0;
let updateLastTotal = 0;
let updateCancelled = false;   // "Cancel" was pressed: what still arrives from that download is not shown

const megabytes = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";

function setUpdateStage(stage, info) {
  if (!updateModal) return;
  const before = updateStage;
  updateStage = stage;
  updateModal.hidden = !stage;
  if (updateInstallWatch) { clearTimeout(updateInstallWatch); updateInstallWatch = null; }
  if (!stage) return;
  updateProgress.hidden = stage === "offer" || stage === "error";
  updateProgressFill.classList.toggle("is-unknown", stage === "install");
  // "Update" keeps its place while the download runs. Taken out, "Cancel"
  // would slide under the pointer, and the second click of a double click
  // would stop the download that the first click started.
  updateModalNow.hidden = stage !== "offer" && stage !== "download";
  updateModalNow.disabled = stage !== "offer";
  // The question can come up under a pointer that is in the middle of a
  // double click (the last button of the tour is at the same place).
  if (stage === "offer" && before !== "offer") {
    updateModalNow.disabled = true;
    setTimeout(() => { if (updateStage === "offer") updateModalNow.disabled = false; }, 700);
  }
  updateModalLater.hidden = stage === "install";
  if (stage === "offer") {
    updateModalTitle.textContent = "Update available";
    updateModalLead.textContent =
      `Ace ${updateVersion} is available. You have ${(info && info.current) || "an older version"}. ` +
      "Update now? Ace downloads the new version, closes, installs it and starts again.";
    updateModalLater.textContent = "Later";
  } else if (stage === "download") {
    updateModalTitle.textContent = "Updating Ace";
    updateModalLead.textContent = `Downloading Ace ${updateVersion}…`;
    updateModalLater.textContent = "Cancel";
    updateProgressFill.style.width = "0%";
    updateProgressText.textContent = "Starting…";
    updateLastPercent = 0;
    updateLastTotal = 0;
  } else if (stage === "install") {
    updateModalTitle.textContent = "Installing the update";
    updateModalLead.textContent = `Ace ${updateVersion} is downloaded. Ace closes now; ` +
      (updatePlatform === "win32" || !updatePlatform
        ? "the installer shows its progress and starts Ace again."
        : "it starts again in the new version.");
    updateProgressFill.style.width = "";
    updateProgressText.textContent = "";
    // The app closes within seconds. If it does not, the window must not
    // stay without a button.
    updateInstallWatch = setTimeout(() => {
      if (updateStage === "install") setUpdateStage("error", { message: "the app did not close for the installer", installing: true });
    }, 90000);
  } else if (stage === "error") {
    updateModalTitle.textContent = "Update not installed";
    updateModalLead.textContent =
      (info && info.installing ? "The update could not be installed: " : "The update could not be downloaded: ") +
      ((info && info.message) || "unknown error") +
      ". Nothing was changed. It is offered again at the next start.";
    updateModalLater.textContent = "Close";
  }
  // The safe answer has the focus: a stray Enter never starts an update.
  if ((stage === "offer" || stage === "error") && before !== stage) { try { updateModalLater.focus(); } catch {} }
}

// The question waits while the tour or an interview has the window.
function updateMustWait() {
  const tourEl = document.getElementById("tour");
  return (tourEl && !tourEl.hidden) || document.body.classList.contains("in-interview");
}
function showUpdateOffer(o) {
  updateCancelled = false;
  updateVersion = o.version;
  updatePlatform = o.platform || "";
  // like the tour: the question must be clickable
  if (window.api.setClickThrough) { try { Promise.resolve(window.api.setClickThrough(false)).catch(() => {}); } catch {} }
  setUpdateStage("offer", o);
}
// Called by showModeSelect(). The tour calls that function for its own steps,
// so the test is repeated here.
function showHeldUpdateOffer() {
  if (!updateHeld || updateMustWait()) return;
  const o = updateHeld;
  updateHeld = null;
  if (!updateStage) showUpdateOffer(o);
}

if (updateModalNow) updateModalNow.addEventListener("click", async () => {
  if (updateStage !== "offer") return;
  setUpdateStage("download");
  const ok = await window.api.updateAnswer(true).catch(() => false);
  if (!ok && updateStage === "download") setUpdateStage("error", { message: "the update is no longer on offer" });
});
if (updateModalLater) updateModalLater.addEventListener("click", () => {
  const stage = updateStage;
  setUpdateStage("");
  if (stage === "offer") window.api.updateAnswer(false).catch(() => {});
  else if (stage === "download") { updateCancelled = true; window.api.updateCancel().catch(() => {}); }
});
// The question is the top layer: Escape answers it and nothing below it.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !updateModal || updateModal.hidden) return;
  e.stopPropagation();
  if (updateStage === "offer" || updateStage === "error") updateModalLater.click();
}, true);
if (window.api && window.api.onUpdateOffer) {
  window.api.onUpdateOffer((o) => {
    if (!o || !o.version || updateStage === "download" || updateStage === "install") return;
    if (updateMustWait()) { updateHeld = o; return; }
    showUpdateOffer(o);
  });
}

if (window.api && window.api.onUpdaterStatus) {
  window.api.onUpdaterStatus((s) => {
    if (s.state === "resumed" && !updateStage) {
      // the window was loaded again while the download was running
      updateCancelled = false;
      updateVersion = s.version || updateVersion;
      setUpdateStage("download");
    } else if (s.state === "downloading" && updateStage === "download") {
      // Only the changed parts are fetched first; if that fails, the whole
      // file is, and the count starts again.
      if (s.percent < updateLastPercent || (updateLastTotal && s.total && s.total !== updateLastTotal))
        updateModalLead.textContent = `Downloading Ace ${updateVersion} as a complete file…`;
      updateLastPercent = s.percent;
      if (s.total) updateLastTotal = s.total;
      updateProgressFill.style.width = s.percent + "%";
      updateProgressText.textContent = s.total
        ? `${s.percent}%  ·  ${megabytes(s.transferred)} of ${megabytes(s.total)}`
        : s.percent + "%";
    } else if (s.state === "downloaded" && s.busy && (updateStage === "download" || (!updateStage && !updateCancelled))) {
      updateVersion = s.version || updateVersion;
      setUpdateStage("install");
    } else if (s.state === "error" && (updateStage === "download" || updateStage === "install")) {
      setUpdateStage("error", { message: s.message, installing: updateStage === "install" });
    }
    if (!updaterStatusEl) return;
    if (s.state === "checking")
      updaterStatusEl.textContent = "Checking for updates…";
    else if (s.state === "available")
      updaterStatusEl.textContent = `Ace ${s.version} is available.`;
    else if (s.state === "up-to-date")
      updaterStatusEl.textContent = "Up to date.";
    else if (s.state === "downloading")
      updaterStatusEl.textContent = `Downloading update… ${s.percent}%`;
    else if (s.state === "downloaded") {
      updaterStatusEl.textContent = `Ace ${s.version} is downloaded. "Restart & install" closes Ace and installs it.`;
      if (updaterInstallBtn) updaterInstallBtn.hidden = false;
    } else if (s.state === "error") {
      updaterStatusEl.textContent = "Updater error: " + s.message;
      if (updaterInstallBtn) updaterInstallBtn.hidden = true;
    }
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
  refreshTranscriptionUI();
  refreshMeetingUI();
  loadAvoidPhrases();
  refreshMicList();
  refreshDisplayList(true);
  refreshHotkeysUI();
  refreshNetworkUI();
  refreshSupporterSettings();
  applyRoleSettingsTabs(isSupporter);
}

function closeSettings() {
  cancelCapture();
  settingsOverlay.hidden = true;
}

settingsBtn.addEventListener("click", openSettings);
settingsCloseBtn.addEventListener("click", closeSettings);
// Modal behaviour: click on the dimmed backdrop or press Escape to close.
settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) closeSettings(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !settingsOverlay.hidden) closeSettings(); });

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

function updateRecTitle() {
  recBtn.title = `${recState ? "Stop" : "Start"} voice transcription`;
}

// Show only the key field that belongs to the selected engine.
function updateEngineBlocks(engine) {
  const dg = document.getElementById("deepgramBlock");
  const xa = document.getElementById("xaiBlock");
  if (dg) dg.hidden = engine !== "deepgram";
  if (xa) xa.hidden = engine !== "xai";
}

function syncTxSourceUi() {
  if (!micSelect) return;
  micSelect.disabled = !captureMicEl || !captureMicEl.checked;
  if (typeof micSelect._cselSyncDisabled === "function") micSelect._cselSyncDisabled();
}

async function refreshTranscriptionUI() {
  txCfg = await window.api.getTranscriptionConfig();
  engineDeepgram.checked = txCfg.engine !== "xai";
  if (engineXai) engineXai.checked = txCfg.engine === "xai";
  if (deepgramKeyEl) deepgramKeyEl.value = txCfg.deepgramApiKey || "";
  if (xaiKeyEl) xaiKeyEl.value = txCfg.xaiApiKey || "";
  languageSelect.value = txCfg.language || "auto";
  captureMicEl.checked = txCfg.captureMic !== false;
  captureSystemEl.checked = txCfg.captureSystem !== false;
  const recordEl = document.getElementById("recordSession");
  if (recordEl) recordEl.checked = txCfg.recordSession !== false;
  const uploadEl = document.getElementById("uploadSession");
  if (uploadEl) uploadEl.checked = txCfg.uploadSession !== false;
  if (!captureMicEl.checked && !captureSystemEl.checked) {
    captureMicEl.checked = true;
    captureSystemEl.checked = true;
    persistTx({ captureMic: true, captureSystem: true });
  }
  updateEngineBlocks(txCfg.engine);
  syncTxSourceUi();
}

function applyMeetingConfigUi(cfg) {
  cfg = cfg || {};
  const typeSel = document.getElementById("meetingTypeSelect");
  const known = typeSel ? Array.from(typeSel.options).map((o) => o.value) : [];
  const type = known.includes(cfg.type) ? cfg.type : "recruiter_screen";
  if (typeSel) {
    typeSel.value = type;
    if (typeof typeSel._cselRefresh === "function") typeSel._cselRefresh();
  }
  document.querySelectorAll('input[name="setupMeetingType"]').forEach((el) => {
    el.checked = el.value === type;
  });
  // Wizard accordion: open the group that holds the chosen type.
  const card = document.querySelector('input[name="setupMeetingType"]:checked');
  const group = card && card.closest("details.stage-group");
  if (group) group.open = true;
}

async function refreshMeetingUI() {
  if (!window.api.getMeetingConfig) return;
  applyMeetingConfigUi(await window.api.getMeetingConfig());
}

async function persistMeeting(patch) {
  if (!window.api.setMeetingConfig) return;
  applyMeetingConfigUi(await window.api.setMeetingConfig(patch));
}

// The type picked on the wizard's first step.
async function saveWizardMeetingType() {
  const el = document.querySelector('input[name="setupMeetingType"]:checked');
  await persistMeeting({ type: (el && el.value) || "recruiter_screen" });
}

const meetingTypeSelect = document.getElementById("meetingTypeSelect");
if (meetingTypeSelect) {
  meetingTypeSelect.addEventListener("change", () => persistMeeting({ type: meetingTypeSelect.value }));
}
refreshMeetingUI();

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
if (deepgramKeyEl) deepgramKeyEl.addEventListener("change", () =>
  persistTx({ deepgramApiKey: deepgramKeyEl.value.trim() }),
);
if (xaiKeyEl) xaiKeyEl.addEventListener("change", () =>
  persistTx({ xaiApiKey: xaiKeyEl.value.trim() }),
);
languageSelect.addEventListener("change", () =>
  persistTx({ language: languageSelect.value }),
);
function onTxSourceChange(e) {
  if (!captureMicEl.checked && !captureSystemEl.checked) {
    const target = e && e.target;
    if (target === captureMicEl) captureSystemEl.checked = true;
    else captureMicEl.checked = true;
    if (typeof toast === "function") {
      toast("Keep at least one audio source on", "info");
    }
  }
  persistTx({
    captureMic: captureMicEl.checked,
    captureSystem: captureSystemEl.checked,
  });
  syncTxSourceUi();
}
captureMicEl.addEventListener("change", onTxSourceChange);
const recordSessionEl = document.getElementById("recordSession");
if (recordSessionEl) recordSessionEl.addEventListener("change", () => persistTx({ recordSession: recordSessionEl.checked }));
const uploadSessionEl = document.getElementById("uploadSession");
if (uploadSessionEl) uploadSessionEl.addEventListener("change", () => persistTx({ uploadSession: uploadSessionEl.checked }));

// ── Transcription connection ───────────────────────────────────────────────
// Main retries a lost Deepgram connection at once and then every 5 s, keeping
// what is said meanwhile. Say so once when it is lost and once when it is
// back; the mic button is amber in between. When the computer's network comes
// back, ask for a retry at once.
if (window.api.onTranscriptConnection) window.api.onTranscriptConnection((s) => {
  const state = s && s.state;
  if (recBtn) recBtn.classList.toggle("reconnecting", state === "lost");
  if (state === "lost") {
    toast("Transcription lost its connection. Retrying every 5 seconds; what is said meanwhile is kept.", "warn");
    log("Transcription connection lost; retrying every 5 s", "err");
  } else if (state === "connected") {
    toast("Transcription is connected again.", "info");
    log("Transcription connection is back", "info");
  }
});
window.addEventListener("online", () => { if (window.api.networkOnline) window.api.networkOnline(); });

// ── Appearance: Dark / Light / System (theme.js applies it) ────────────────
const themeSegEl = document.getElementById("themeSeg");
function syncThemeSeg() {
  if (!themeSegEl || !window.aceTheme) return;
  const p = window.aceTheme.get();
  themeSegEl.querySelectorAll("button[data-theme-pref]").forEach((b) => {
    const on = b.dataset.themePref === p;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
}
if (themeSegEl) themeSegEl.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-theme-pref]");
  if (!b || !window.aceTheme) return;
  window.aceTheme.set(b.dataset.themePref);
});
window.addEventListener("ace-theme", syncThemeSeg);
syncThemeSeg();

// ── Display cards: a small picture of each display ─────────────────────────
// Used wherever a display is picked (the recording's screen, the screen a
// supporter watches), so the right one is recognised by eye. items:
// [{ id, label, src }] where label is "Display 2: NAME, 1920×1080 (main)" and
// src a picture (or none yet). Works in the supporter's pop-out window too.
function parseDisplayLabel(label, i) {
  const m = /^Display (\d+)(?::\s*([^,]*))?(?:,\s*(\d+\s*×\s*\d+))?/.exec(label || "");
  return {
    num: m ? m[1] : String(i + 1),
    name: m && m[2] ? m[2].trim() : "",
    size: m && m[3] ? m[3].replace(/\s/g, "") : "",
    main: /\(main\)\s*$/.test(label || ""),
  };
}
function renderDisplayCards(container, items, current, onPick) {
  if (!container) return;
  const doc = container.ownerDocument;
  container.textContent = "";
  items.forEach((it, i) => {
    const p = parseDisplayLabel(it.label, i);
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "disp-card" + (it.id === current ? " active" : "");
    b.title = it.label;
    const th = doc.createElement("span");
    th.className = "disp-thumb" + (it.src ? "" : " empty");
    if (it.src) { const img = doc.createElement("img"); img.src = it.src; img.alt = ""; th.appendChild(img); }
    const num = doc.createElement("span");
    num.className = "disp-num";
    num.textContent = p.num;
    th.appendChild(num);
    if (it.id === current) { const ok = doc.createElement("span"); ok.className = "disp-on"; ok.innerHTML = aceIcon("check"); th.appendChild(ok); }
    const cap = doc.createElement("span");
    cap.className = "disp-cap";
    cap.textContent = [p.size || p.name || "Display " + p.num, p.main ? "main" : ""].filter(Boolean).join(" · ");
    b.append(th, cap);
    b.addEventListener("click", (e) => { e.stopPropagation(); onPick(it.id); });
    container.appendChild(b);
  });
}

// Which display the recording captures: in Settings, and (with two or more
// displays) from the arrow next to the record button. Both show the displays
// as pictures; '' means "the main display, whichever it is".
const recordDisplaySel = document.getElementById("recordDisplaySelect");
const recordDisplayCards = document.getElementById("recordDisplayCards");
const recDisplayBtn = document.getElementById("recDisplayBtn");
const recDisplayMenu = document.getElementById("recDisplayMenu");
let recordDisplays = [];
let recordThumbs = {};
async function loadRecordThumbs() {
  if (!window.api.displayThumbnails) return;
  try { recordThumbs = Object.fromEntries(((await window.api.displayThumbnails({ width: 320 })) || []).map((t) => [t.id, t.src])); } catch {}
}
function recordCardItems() {
  return recordDisplays.map((d) => ({ id: d.id, label: d.label, src: recordThumbs[d.id] }));
}
// The display id the recording really uses ('' resolves to the main one).
function recordCurrentId() {
  const v = recordDisplaySel ? recordDisplaySel.value : "";
  return v || ((recordDisplays.find((d) => d.main) || recordDisplays[0] || {}).id || "");
}
function pickRecordDisplay(id) {
  if (!recordDisplaySel) return;
  const d = recordDisplays.find((x) => x.id === id);
  const value = d && d.main ? "" : id;
  if (recordDisplaySel.value !== value) {
    recordDisplaySel.value = value;
    recordDisplaySel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  renderRecordCards();
}
function renderRecordCards() {
  renderDisplayCards(recordDisplayCards, recordCardItems(), recordCurrentId(), pickRecordDisplay);
}
async function refreshDisplayList(withPictures) {
  if (!recordDisplaySel || !window.api.listDisplays) return;
  let list = [];
  try { list = (await window.api.listDisplays()) || []; } catch {}
  recordDisplays = list;
  const field = document.getElementById("recordDisplayField");
  if (field) field.hidden = list.length < 1;
  if (recDisplayBtn) recDisplayBtn.hidden = list.length < 2;
  recordDisplaySel.innerHTML = "";
  const def = document.createElement("option");
  def.value = "";
  def.textContent = "Main display";
  recordDisplaySel.appendChild(def);
  for (const d of list) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.label;
    recordDisplaySel.appendChild(o);
  }
  let cfg = txCfg;
  try { cfg = (await window.api.getTranscriptionConfig()) || cfg; } catch {}
  const want = String((cfg && cfg.recordDisplay) || "");
  recordDisplaySel.value = list.some((d) => d.id === want) ? want : "";
  if (withPictures) await loadRecordThumbs();
  renderRecordCards();
}
function closeRecDisplayMenu() {
  if (recDisplayMenu) recDisplayMenu.hidden = true;
  if (recDisplayBtn) recDisplayBtn.classList.remove("open");
}
function openRecDisplayMenu() {
  if (!recDisplayMenu || !recDisplayBtn || !recordDisplaySel) return;
  recDisplayMenu.textContent = "";
  const head = document.createElement("div");
  head.className = "menu-head";
  head.textContent = "Screen to record";
  const cards = document.createElement("div");
  cards.className = "disp-cards";
  recDisplayMenu.append(head, cards);
  renderDisplayCards(cards, recordCardItems(), recordCurrentId(), (id) => { closeRecDisplayMenu(); pickRecordDisplay(id); });
  const r = recDisplayBtn.getBoundingClientRect();
  recDisplayMenu.hidden = false;
  const w = recDisplayMenu.offsetWidth;
  recDisplayMenu.style.left = `${Math.max(6, Math.min(r.left - 30, window.innerWidth - w - 6))}px`;
  recDisplayMenu.style.top = `${r.bottom + 4}px`;
  recDisplayBtn.classList.add("open");
}
if (recDisplayBtn) recDisplayBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (recDisplayMenu && !recDisplayMenu.hidden) closeRecDisplayMenu();
  else refreshDisplayList(true).then(openRecDisplayMenu);
});
if (recDisplayMenu) recDisplayMenu.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", closeRecDisplayMenu);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRecDisplayMenu(); });
window.addEventListener("blur", closeRecDisplayMenu);

if (recordDisplaySel) recordDisplaySel.addEventListener("change", async () => {
  await persistTx({ recordDisplay: recordDisplaySel.value });
  const chosen = recordDisplays.find((d) => d.id === recordDisplaySel.value);
  renderRecordCards();
  if (document.body.classList.contains("in-interview")) toast(`Recording ${chosen ? chosen.label.replace(/,.*$/, "") : "the main display"}.`, "info");
  // A running recording moves to the new screen: the file so far is closed
  // and a second one starts; End saves both with the session.
  if (typeof window.isRecording === "function" && window.isRecording()) {
    try { await window.stopRecording(); } catch {}
    if (typeof window.startRecording === "function") window.startRecording(true);
    log("Recording moved to the newly chosen screen (a second video file).", "info");
  }
});
if (window.api.onDisplaysChanged) window.api.onDisplaysChanged(() => { refreshDisplayList(); });
refreshDisplayList();
captureSystemEl.addEventListener("change", onTxSourceChange);
const recIndicatorEl = document.getElementById("recIndicator");
window.__recIndicator = (on) => {
  if (!recIndicatorEl) return;
  recIndicatorEl.classList.toggle("recording", !!on);
  recIndicatorEl.title = on ? "Stop & save recording" : "Start recording (screen + audio)";
};
if (recIndicatorEl) recIndicatorEl.addEventListener("click", async () => {
  if (typeof window.isRecording === "function" && window.isRecording()) {
    if (typeof window.stopRecording === "function") await window.stopRecording();
    toast("Recording stopped. Click the camera to record again.", "warn");
  } else if (typeof window.startRecording === "function") {
    window.startRecording(true); // manual: record even if auto-record is off in Settings
  }
});
const antiCloseEl = document.getElementById("antiClose");
if (antiCloseEl && window.api.getAntiClose) {
  window.api.getAntiClose().then((s) => {
    const field = document.getElementById("antiCloseField");
    if (field) field.hidden = !s.supported;
    antiCloseEl.checked = !!s.enabled;
  }).catch(() => {});
  antiCloseEl.addEventListener("change", () => window.api.setAntiClose(antiCloseEl.checked));
}
const keepFocusEl = document.getElementById("keepFocus");
if (keepFocusEl && window.api.getKeepFocus) {
  window.api.getKeepFocus().then((s) => {
    const field = document.getElementById("keepFocusField");
    if (field) field.hidden = !s.supported;
    keepFocusEl.checked = !!s.enabled;
  }).catch(() => {});
  keepFocusEl.addEventListener("change", () => window.api.setKeepFocus(keepFocusEl.checked));
}
micSelect.addEventListener("change", () =>
  persistTx({ micDeviceId: micSelect.value }),
);

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
  reloadSite: "Reload window",
  toggleStealth: "Toggle stealth",
  toggleRecording: "Start/stop voice transcription",
  pushToTalk: "Push-to-talk (toggle supporter mic)",
  closeSticky: "Close sticky note",
  openSticky: "Open sticky note",
  stickyScrollUp: "Scroll sticky note up",
  stickyScrollDown: "Scroll sticky note down",
  helpRequest: "Send help request (speaker → supporter)",
  submitPrompt: "Get answer (send to selected API)",
  screenshotToAI: "Screenshot to composer",
  areaSnip: "Area snip to composer",
  toggleClickThrough: "Toggle click-through (mouse passes through)",
  clearTranscriptBubble: "Clear current transcript bubble",
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

function hotkeyLabel(action) {
  if (HOTKEY_LABELS[action]) return HOTKEY_LABELS[action];
  return String(action || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function hotkeyActionList() {
  const seen = new Set();
  const out = [];
  const add = (k) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  Object.keys(HOTKEY_LABELS).forEach(add);
  Object.keys(hotkeyState.defaults || {}).forEach(add);
  Object.keys(hotkeyState.current || {}).forEach(add);
  return out;
}

function renderHotkeyList() {
  hotkeyList.innerHTML = "";
  for (const action of hotkeyActionList()) {
    const row = document.createElement("div");
    row.className = "hotkey-row";

    const label = document.createElement("span");
    label.className = "hotkey-label";
    label.textContent = hotkeyLabel(action);
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
  // On Windows the window never takes focus (type-through.js); recording a
  // combo needs the real key events, so it may for as long as this listens.
  if (window.typeThroughRealFocus) window.typeThroughRealFocus(true);
}

function cancelCapture() {
  const wasCapturing = !!captureKeyHandler;
  if (captureKeyHandler) {
    document.removeEventListener("keydown", captureKeyHandler, true);
    captureKeyHandler = null;
  }
  capturingFor = null;
  if (wasCapturing && window.typeThroughRealFocus) window.typeThroughRealFocus(false);
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

if (window.api.onClearMeetBubble) {
  window.api.onClearMeetBubble(() => {
    const el = currentMeetBubble();
    if (el) clearMeetBubble(el);
  });
}

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

// One-shot append: drop text onto the end of the composer.
function appendToComposer(text) {
  const t = (text || "").trim();
  if (!t || !composerInput) return;
  const cur = composerInput.value;
  composerInput.value = !cur ? t : (cur.endsWith(" ") ? cur + t : cur + " " + t);
  composerInput.scrollTop = composerInput.scrollHeight;
  kickSpeculative(false);
}

// Meeting talk goes into speaker bubbles, not the composer. The input box
// stays free for the user's own questions.
let liveSeg = "";
let liveMeetEl = null;
let lastMeetEl = null;
let meetingTurns = [];
function resetLiveSeg() {
  liveSeg = "";
  liveMeetEl = null;
}

function speakerLineBlock(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((ln) => ln.trim())
    .filter(Boolean)
    .join("\n");
}

// ── The transcript bubble ────────────────────────────────────────────────────
// Everything said between two submissions goes into ONE bubble, one line per
// speaker turn, each line reading "Name : what they said" — the other side and
// the app user alike. Send seals the bubble and the next words
// open a new one. Each line keeps its committed words and a live tail (an
// interim hypothesis
// mode), so the newest words show the moment they are heard.
function lineDisplay(l) { return joinSpeech(l.text, l.live); }
function renderLine(l) {
  if (!l.wordsEl) return;
  l.wordsEl.textContent = lineDisplay(l);
  l.rowEl.classList.toggle("meet-line-live", !!l.live);
}
function bubbleLines(el) { return (el && el._lines) || []; }
// The bubble's text as the model, the editor and the session file see it.
function bubbleText(el, committedOnly) {
  return bubbleLines(el)
    .map((l) => ({ who: l.who, text: (committedOnly ? l.text : lineDisplay(l)).trim() }))
    .filter((l) => l.text)
    .map((l) => l.who + " : " + l.text)
    .join("\n");
}
function appendLine(el, who, text, live) {
  const row = document.createElement("div");
  row.className = "meet-line";
  const name = document.createElement("span");
  name.className = "meet-name";
  name.textContent = who;
  const words = document.createElement("span");
  words.className = "meet-words";
  row.appendChild(name);
  row.appendChild(words);
  el._bodyEl.appendChild(row);
  const turn = { who, text: "" };
  const l = { who, text: text || "", live: live || "", rowEl: row, wordsEl: words, turn };
  el._lines.push(l);
  meetingTurns.push(turn);
  if (meetingTurns.length > 80) meetingTurns.shift();
  syncLine(l);
  return l;
}
// Keep the line's DOM and its transcript turn in step with its words.
function syncLine(l) {
  renderLine(l);
  l.turn.who = l.who;
  l.turn.text = lineDisplay(l);
}

function liveMeetText() {
  return lastMeetEl ? bubbleText(lastMeetEl) : "";
}

function persistMeetBubble(el, sealed) {
  if (!window.api.sessionRecordMeet || !el) return;
  const lines = bubbleLines(el).map((l) => ({ who: l.who, text: l.text.trim() })).filter((l) => l.text);
  const who = lines.length ? lines[0].who : "Interviewer";
  return window.api.sessionRecordMeet({ who, text: bubbleText(el, true), lines, sealed: !!sealed, id: el._tid || "" });
}

// The last few lines, "Name: words", for the answer prompt. The open bubble's
// lines are already in meetingTurns (each line IS a turn), live tail included.
function meetingTranscriptText() {
  return meetingTurns
    .filter((t) => t && String(t.text || "").trim())
    .slice(-6)
    .map((t) => {
      const body = t.text.length > 400 ? t.text.slice(-400) : t.text;
      return t.who + ": " + body;
    })
    .join("\n");
}

function currentMeetBubble() {
  if (lastMeetEl && lastMeetEl.isConnected) return lastMeetEl;
  if (!answerHistory) return null;
  const all = answerHistory.querySelectorAll(".meet-turn");
  return all.length ? all[all.length - 1] : null;
}

function clearMeetBubble(el) {
  if (!el) return;
  for (const l of bubbleLines(el)) { l.text = ""; l.live = ""; l.turn.text = ""; if (l.rowEl) l.rowEl.remove(); }
  el._lines = [];
  if (el === lastMeetEl || el === liveMeetEl) {
    liveSeg = "";
    pendingInterim = null;
    if (interimFlushTimer) {
      clearTimeout(interimFlushTimer);
      interimFlushTimer = null;
    }
  }
  if (el === liveMeetEl) liveMeetEl = null;
  if (el === lastMeetEl) persistMeetBubble(el, false);
  if (!composerInput || !composerInput.value.trim()) {
    _speculativeText = null;
    if (window.api.speculativeCancel) window.api.speculativeCancel();
  }
  if (typeof syncSendEnabled === "function") syncSendEnabled();
}

// A new bubble. `lines` is [{ who, text, live? }]; the first line may be
// live (voice interim). Returns the element, with _lines built.
function addMeetBubble(lines, live) {
  if (!answerHistory) return null;
  if (answerEmpty) answerEmpty.hidden = true;
  const el = document.createElement("div");
  el.className = "meet-turn" + (live ? " meet-live" : "");
  el._lines = [];
  el._tid = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const head = document.createElement("div");
  head.className = "meet-head";
  const actions = document.createElement("div");
  actions.className = "meet-actions";
  const mkBtn = (cls, title, label, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "meet-clear " + cls;
    b.title = title;
    b.innerHTML = aceIcon(label);
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    actions.appendChild(b);
    return b;
  };
  mkBtn("meet-retry", "Answer this again", "refresh", () => {
    const t = bubbleText(el);
    if (!t) return;
    if (el === lastMeetEl) sealMeetBubble();
    resendTurn(t, []);
  });
  mkBtn("meet-edit", "Edit this transcript, then answer", "edit", () => beginMeetEdit(el));
  mkBtn("meet-remove", "Remove this transcript (Shift+Z)", "x", () => {
    clearMeetBubble(el);
    el.remove();
    // Forget the removed bubble so the next transcript starts a new one
    // instead of being appended to a detached element.
    if (lastMeetEl === el) lastMeetEl = null;
    if (liveMeetEl === el) liveMeetEl = null;
    liveSeg = "";
    if (answerHistory && !answerHistory.querySelector(".answer-turn, .meet-turn") && answerEmpty) answerEmpty.hidden = false;
  });
  const when = document.createElement("span");
  when.className = "meet-time";
  when.textContent = fmtTime(Date.now());
  head.appendChild(when);
  head.appendChild(actions);
  const body = document.createElement("div");
  body.className = "meet-text";
  el.appendChild(head);
  el.appendChild(body);
  el._bodyEl = body;
  for (const l of lines || []) appendLine(el, l.who, l.text, l.live);
  ensureSpacer();
  answerHistory.insertBefore(el, answerSpacer);
  revealMeetBubble(el);
  return el;
}

// Inline edit of a transcript bubble: textarea + Send/Cancel. Send answers the
// edited text and keeps it in the bubble. Lines keep their "Name : words" form;
// a line without a name keeps the name it had.
function beginMeetEdit(el) {
  if (!el || el._editing) return;
  el._editing = true;
  if (el === lastMeetEl) sealMeetBubble();
  const body = el._bodyEl;
  const original = bubbleText(el);
  const ta = document.createElement("textarea");
  ta.className = "meet-editbox";
  ta.value = original;
  ta.rows = Math.min(8, Math.max(2, original.split("\n").length + 1));
  const row = document.createElement("div");
  row.className = "meet-edit-row";
  const cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "meet-edit-btn"; cancel.textContent = "Cancel";
  const send = document.createElement("button");
  send.type = "button"; send.className = "meet-edit-btn meet-edit-btn--primary"; send.textContent = "Answer";
  row.appendChild(cancel); row.appendChild(send);
  body.hidden = true;
  el.appendChild(ta); el.appendChild(row);
  const finish = () => { ta.remove(); row.remove(); body.hidden = false; el._editing = false; };
  cancel.addEventListener("click", finish);
  send.addEventListener("click", () => {
    const t = ta.value.trim();
    if (!t) return;
    const old = bubbleLines(el);
    const edited = t.split("\n").map((ln) => ln.trim()).filter(Boolean).map((ln, i) => {
      const m = /^(.{1,60}?)\s+:\s+(.*)$/.exec(ln);
      const prev = old[Math.min(i, old.length - 1)];
      return m ? { who: m[1], text: m[2] } : { who: (prev && prev.who) || "Interviewer", text: ln };
    });
    for (const l of old) { l.turn.text = ""; if (l.rowEl) l.rowEl.remove(); }
    el._lines = [];
    for (const l of edited) appendLine(el, l.who, l.text, "");
    persistMeetBubble(el, true);
    finish();
    resendTurn(bubbleText(el), []);
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") finish();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send.click();
  });
  ta.focus();
}

// Commit every live tail and close the bubble: the next words open a new one.
function sealMeetBubble() {
  if (lastMeetEl) {
    lastMeetEl.classList.remove("meet-live");
    for (const l of bubbleLines(lastMeetEl)) { l.text = lineDisplay(l); l.live = ""; syncLine(l); }
    if (bubbleText(lastMeetEl)) persistMeetBubble(lastMeetEl, true);
  }
  lastMeetEl = null;
  liveMeetEl = null;
  liveSeg = "";
}

function joinSpeech(a, b) {
  a = String(a || "").trim();
  b = String(b || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (b.startsWith(a)) return b;
  if (a.endsWith(b)) return a;
  const max = Math.min(a.length, b.length, 80);
  for (let n = max; n >= 12; n--) {
    if (a.slice(-n) === b.slice(0, n)) return a + b.slice(n);
  }
  return a + " " + b;
}

// One turn of speech into the open bubble. Same speaker as the last line: the
// line grows (final words are committed, interim words replace the live tail).
// Anyone else: a new line under theirs. The app user's own words never come
// here — they go to the saved transcript and the recording only.
function applyMeetLine(who, text, speakerId, isFinal) {
  who = String(who || "").trim() || "Interviewer";
  text = String(text || "").trim();
  if (!text) return;
  let el = lastMeetEl && lastMeetEl.isConnected ? lastMeetEl : null;
  let speakerChanged = false;
  if (!el) {
    el = addMeetBubble([{ who, text: isFinal ? text : "", live: isFinal ? "" : text }], !isFinal);
    if (!el) return;
    lastMeetEl = el;
  } else {
    const lines = bubbleLines(el);
    let last = lines[lines.length - 1];
    if (last && last.who !== who) {
      // Someone else starts. The previous line's live tail is dropped, not
      // committed: an interim is contained in the final that follows it, so
      // committing it here would show the words twice. An interim can also be
      // named before the screen read settles and its final named differently;
      // a line left with no words goes, and its predecessor may be this speaker.
      if (last.live) { last.live = ""; syncLine(last); }
      if (!last.text.trim()) {
        last.rowEl.remove();
        last.turn.text = "";
        lines.pop();
        last = lines[lines.length - 1];
      }
    }
    if (last && last.who === who) {
      if (isFinal) { last.text = joinSpeech(last.text, text); last.live = ""; }
      else last.live = text;
      syncLine(last);
    } else {
      appendLine(el, who, isFinal ? text : "", isFinal ? "" : text);
      speakerChanged = !!last;
    }
  }
  el.classList.toggle("meet-live", !isFinal);
  liveSeg = isFinal ? "" : text;
  liveMeetEl = isFinal ? null : el;
  if (isFinal) persistMeetBubble(el, false);
  revealMeetBubble(el);
  if (speakerChanged && (!composerInput || !composerInput.value.trim())) {
    kickSpeculative(true);
  } else if (typeof syncSendEnabled === "function") {
    syncSendEnabled();
  }
}

function streamSegment(text, isFinal, speakerId, turns) {
  const rows = Array.isArray(turns) && turns.length
    ? turns.filter((t) => t && String(t.text || "").trim())
    : speakerLineBlock(text).split("\n").filter(Boolean).map((ln) => ({ text: ln.replace(/^Interviewer:\s*/i, "") }));
  if (!rows.length) return;
  const body = rows.map((r) => String(r.text || "").trim()).filter(Boolean).join(" ");
  // Main names the line after whoever the meeting screen framed as speaking.
  if (body) applyMeetLine(rows[0].who || "Interviewer", body, 0, isFinal);
}

// Coalesce the stream of interim hypotheses to a steady ~12fps so the input
// updates smoothly instead of stuttering on every packet.
let pendingInterim = null;
let interimFlushTimer = null;
const INTERIM_FLUSH_MS = 80;
function scheduleInterimFlush() {
  if (interimFlushTimer) return;
  interimFlushTimer = setTimeout(() => {
    interimFlushTimer = null;
    if (pendingInterim != null) {
      const t = pendingInterim;
      pendingInterim = null;
      const display = typeof t === "string" ? t : t.display;
      streamSegment(
        display,
        false,
        t && t.speaker,
        t && t.turns,
      );
      showInterimPreview(display);
    }
  }, INTERIM_FLUSH_MS);
}
window.api.onTranscriptLive((payload) => {
  const display = speakerLineBlock(
    (payload && payload.labeled) || (payload && payload.text) || "",
  );
  if (!display && !(payload && payload.turns && payload.turns.length)) return;
  const pack = {
    display,
    speaker: payload && payload.speaker,
    turns: (payload && payload.turns) || [],
  };
  if (payload.isFinal) {
    if (interimFlushTimer) { clearTimeout(interimFlushTimer); interimFlushTimer = null; }
    pendingInterim = null;
    streamSegment(pack.display, true, pack.speaker, pack.turns);
    clearInterimPreview();
    if (payload && payload.text) pushScript((payload.turns && payload.turns[0] && payload.turns[0].who) || "Interviewer", payload.text);
    log(display.replace(/\n/g, " · "));
  } else {
    pendingInterim = pack;
    scheduleInterimFlush();
  }
});
// Utterance boundary (vad_events): lock any pending live segment so trailing
// words aren't left dangling, and clear the live preview.
window.api.onUtteranceEnd(() => {
  if (interimFlushTimer) { clearTimeout(interimFlushTimer); interimFlushTimer = null; }
  if (pendingInterim != null) {
    const t = pendingInterim;
    pendingInterim = null;
    const display = typeof t === "string" ? t : t.display;
    streamSegment(display, true, t && t.speaker, t && t.turns);
  } else if (lastMeetEl && liveSeg) {
    const ls = bubbleLines(lastMeetEl); const l = ls[ls.length - 1];
    if (l) { l.text = lineDisplay(l); l.live = ""; syncLine(l); }
  }
  if (lastMeetEl) {
    lastMeetEl.classList.remove("meet-live");
    persistMeetBubble(lastMeetEl, false);
  }
  liveSeg = "";
  liveMeetEl = null;
  clearInterimPreview();
  // Prefetch a meeting reaction only if the user is not already typing a question.
  if (!composerInput || !composerInput.value.trim()) kickSpeculative(true);
});

// macOS system audio: PCM chunks from the helper are pushed into the feed node.
const IS_MAC = /Mac/i.test(navigator.platform || "");
let macSysFeed = null;
if (window.api.onMacSystemAudioChunk) {
  window.api.onMacSystemAudioChunk((buf) => {
    if (macSysFeed) { try { macSysFeed.port.postMessage(buf); } catch {} }
    // The session recorder (recorder.js) takes the same PCM for the video's audio.
    if (window.__macRecSub) { try { window.__macRecSub(buf); } catch {} }
  });
}
if (window.api.onMacSystemAudioEnded) {
  window.api.onMacSystemAudioEnded((code) => { if (macSysFeed && recState) { macSysFeed = null; toast("System audio capture stopped (helper exited " + code + ").", "err"); } });
}

if (window.api.onTranscriptMic) {
  window.api.onTranscriptMic((v) => {
    if (!v || !v.text) return;
    const isFinal = v.isFinal !== false;
    if (isFinal) pushScript(profileNameForScript(), v.text);
    if (window.ReadMarker) window.ReadMarker.heard(v.text, isFinal);
  });
}
window.api.onTranscriptLiveError((msg) => {
  log("Transcription error: " + msg, "err");
  if (recState && recState.streaming) {
    recState = null;
    recBtn.classList.remove("on");
    updateRecTitle();
  }
});

// Errors main reports on the generic error channel (paste, chat, help-me).
window.api.onCaptureError((msg) => { log("Error: " + msg, "err"); toast(msg, "err"); });
// ===== Answer panel =====
const answerHistory = document.getElementById("answerHistory");
const answerEmpty = document.getElementById("answerEmpty");
const getAnswerBtn = document.getElementById("getAnswerBtn");
const answerClearBtn = document.getElementById("answerClearBtn");
const answerKeyEl = document.getElementById("answerKey");
const answerKeyAnthropicEl = document.getElementById("answerKeyAnthropic");
const answerKeyOpenaiEl = document.getElementById("answerKeyOpenai");
const answerModelEl = document.getElementById("answerModel");
const answerModelHeaderEl = document.getElementById("answerModelHeader");
const answerProviderSelect = document.getElementById("answerProviderSelect");
const modeSeg = document.getElementById("modeSeg");
const railModelBtn = document.getElementById("railModelBtn");
let currentAnswerEl = null;
let answerCfgCache = { provider: "xai", model: "grok-4.20-0309-non-reasoning", keys: {}, fallbackModels: [] };

function updateRailModelBtn(cfg) {
  if (!railModelBtn) return;
  const c = cfg || answerCfgCache;
  const id = c.model || "";
  railModelBtn.textContent = c.railAbbr || "M";
  const prov = (c.providers || []).find((p) => p.id === c.provider);
  railModelBtn.title = (prov ? prov.label + " · " : "") + id;
}

function setProviderRadios(provider) {
  document.querySelectorAll('input[name="answerProvider"]').forEach((el) => {
    el.checked = el.value === provider;
  });
  if (answerProviderSelect && answerProviderSelect.value !== provider) {
    answerProviderSelect.value = provider;
  }
}

// Rail model button — opens native popup menu (provider + models)
if (railModelBtn && window.api.showModelMenu) {
  railModelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = railModelBtn.getBoundingClientRect();
    window.api.showModelMenu({ x: r.left, y: r.top, width: r.width, height: r.height });
  });
}
if (window.api.onModelSelected) {
  window.api.onModelSelected((id) => {
    setAnswerModel(id);
  });
}
if (window.api.onAnswerConfigChanged) {
  window.api.onAnswerConfigChanged((cfg) => applyAnswerConfigUi(cfg));
}

// Manual mode — default Text; CODE/DIAGRAM force specific output format.
let manualMode = 'ANSWER';
// What main.js knows about VS Code (filled in at the end of this file).
let vscodeState = { enabled: false, port: 2010, connected: false, name: "", active: "", branch: "", changed: 0, editsSinceReport: 0, lastError: "" };
// The typing-speed slider only matters for Write-to-IDE, i.e. Code answers.
function syncSpeedSlider() {
  const wrap = document.querySelector(".rail-speed-wrap");
  if (wrap) wrap.hidden = manualMode !== "CODE";
}
syncSpeedSlider();
if (modeSeg) {
  modeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-seg-btn');
    if (!btn) return;
    manualMode = btn.dataset.mode;
    modeSeg.querySelectorAll('.mode-seg-btn').forEach(b => b.classList.toggle('mode-seg-btn--active', b === btn));
    syncSpeedSlider();
    syncProjectMode();
    _speculativeText = null;
    kickSpeculative(true);
  });
}

// Clean display names shown in the dropdown instead of raw API IDs.
const MODEL_DISPLAY = {
  "grok-4":                           "Grok 4  ⚡ latest",
  "grok-4-0709":                      "Grok 4 (Jul)  ⚡ latest",
  "grok-4.6":                         "Grok 4.6  🧠 latest",
  "grok-4.5":                         "Grok 4.5",
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
  "claude-sonnet-5-5":                "Claude Sonnet 5.5  ⚖ latest",
  "claude-opus-5-5":                  "Claude Opus 5.5  🧠 latest",
  "claude-fable-5-1":                 "Claude Fable 5.1  🧠 flagship",
  "claude-haiku-5-5":                 "Claude Haiku 5.5  ⚡ cheap",
  "claude-sonnet-5":                  "Claude Sonnet 5",
  "claude-opus-5":                    "Claude Opus 5  🧠",
  "claude-fable-5":                   "Claude Fable 5  🧠",
  "claude-opus-4-8":                  "Claude Opus 4.8",
  "claude-sonnet-4-6":                "Claude Sonnet 4.6",
  "gpt-5.6-sol":                      "GPT-5.6 Sol  🧠 flagship",
  "gpt-5.6-sol-pro":                  "GPT-5.6 Sol Pro  🧠",
  "gpt-5.6-terra":                    "GPT-5.6 Terra  ⚖ balanced",
  "gpt-5.6-terra-pro":                "GPT-5.6 Terra Pro",
  "gpt-5.6-luna":                     "GPT-5.6 Luna  ⚡ fast",
  "gpt-5.6-luna-pro":                 "GPT-5.6 Luna Pro  ⚡",
  "gpt-5.4":                          "GPT-5.4",
  "anthropic/claude-sonnet-5.5":      "Claude Sonnet 5.5  ⚖ latest",
  "anthropic/claude-opus-5.5":        "Claude Opus 5.5  🧠 latest",
  "anthropic/claude-fable-5.1":       "Claude Fable 5.1  🧠 flagship",
  "anthropic/claude-haiku-5.5":       "Claude Haiku 5.5  ⚡ cheap",
  "openai/gpt-5.6-sol":               "GPT-5.6 Sol  🧠 flagship",
  "openai/gpt-5.6-terra":             "GPT-5.6 Terra  ⚖ balanced",
  "openai/gpt-5.6-luna":              "GPT-5.6 Luna  ⚡ fast",
  "google/gemini-3.8-flash":          "Gemini 3.8 Flash  ⚡",
  "x-ai/grok-4.7":                    "Grok 4.7",
  "deepseek/deepseek-v4.1-flash":     "DeepSeek V4.1 Flash  ⚡ cheap",
  "qwen/qwen3.8-max-prime":           "Qwen 3.8 Max Prime",
  "mistralai/mistral-large-4-0":      "Mistral Large 4",
};

function modelLabel(id) {
  return MODEL_DISPLAY[id] || id;
}

const FALLBACK_MODELS = [
  { id: "grok-4.20-0309-non-reasoning" },
  { id: "grok-4.3" },
  { id: "grok-4.6" },
  { id: "grok-4.20-0309-reasoning" },
];

function fillKeyFields(cfg) {
  const keys = cfg.keys || {};
  const setVal = (el, val) => {
    if (!el || document.activeElement === el) return;
    el.value = val || "";
  };
  setVal(answerKeyEl, keys.xai || cfg.apiKey || "");
  setVal(answerKeyAnthropicEl, keys.anthropic || "");
  setVal(answerKeyOpenaiEl, keys.openai || "");
}

function fillModelSelects(cfg, liveIds) {
  const fallback = (cfg.fallbackModels && cfg.fallbackModels.length)
    ? cfg.fallbackModels.map((id) => ({ id }))
    : FALLBACK_MODELS.slice();
  const current = cfg.model || fallback[0].id;
  let opts;
  if (Array.isArray(liveIds) && liveIds.length) opts = liveIds.map((id) => ({ id }));
  else opts = fallback;
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
}

async function applyAnswerConfigUi(cfg, { refreshLive = false } = {}) {
  if (!cfg) return;
  answerCfgCache = cfg;
  setProviderRadios(cfg.provider || "xai");
  fillKeyFields(cfg);
  let live = null;
  if (refreshLive) {
    try { live = await window.api.listAnswerModels(); } catch {}
  }
  fillModelSelects(cfg, live);
  updateRailModelBtn(cfg);
}

async function populateModelSelects() {
  const cfg = await window.api.getAnswerConfig();
  await applyAnswerConfigUi(cfg, { refreshLive: true });
}

async function setAnswerProvider(provider) {
  if (!provider) return;
  const cfg = await window.api.setAnswerConfig({ provider });
  await applyAnswerConfigUi(cfg || await window.api.getAnswerConfig(), { refreshLive: true });
}

function setAnswerModel(value) {
  if (!value) return;
  window.api.setAnswerConfig({ model: value }).then((cfg) => {
    if (cfg) {
      answerCfgCache = cfg;
      updateRailModelBtn(cfg);
    }
  });
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
document.querySelectorAll('input[name="answerProvider"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (el.checked) setAnswerProvider(el.value);
  });
});
if (answerProviderSelect) {
  answerProviderSelect.addEventListener("change", () => setAnswerProvider(answerProviderSelect.value));
}

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
  if (typeof syncSendEnabled === "function") syncSendEnabled();
}

function clearAttachedImages() {
  attachedImages = [];
  renderImgStrip();
  if (typeof syncSendEnabled === "function") syncSendEnabled();
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
// Pre-warm TLS on first activity. Speculate as soon as the composer looks
// like a question (typing, or a finished transcript utterance) so the
// first tokens are often already in flight when the user hits send.
let _apiConnectionWarmed = false;
let _speculativeTimer = null;
let _speculativeText = null;
const SPECULATE_MIN_CHARS = 6;
const SPECULATE_DEBOUNCE_MS = 150;

function normQuestion(s) {
  return String(s || "").replace(/\s+/g, " ").replace(/[.?!\s]+$/g, "").trim().toLowerCase();
}

function ensureApiWarmed() {
  if (_apiConnectionWarmed) return;
  _apiConnectionWarmed = true;
  if (window.api.warmApiConnection) window.api.warmApiConnection();
}

function answerIsStreaming() {
  return !!(currentAnswerEl && currentAnswerEl.classList.contains("streaming"));
}

function specSnapshot() {
  const t = composerInput ? composerInput.value.trim() : "";
  const live = liveMeetText();
  const mt = meetingTranscriptText();
  return { t, mt, live, key: t || live };
}

function composerCanSubmit() {
  if (document.body.classList.contains("role-supporter")) return true;
  const q = composerInput ? composerInput.value.trim() : "";
  const live = liveMeetText();
  const imgs = typeof attachedImages !== "undefined" && attachedImages.length > 0;
  // Project mode: an empty box asks for the status report.
  if (manualMode === "PROJECT" && vscodeState.connected) return true;
  return !!(q || live || imgs);
}

function syncSendEnabled() {
  if (getAnswerBtn) getAnswerBtn.disabled = !composerCanSubmit();
}

function startSpeculativeNow() {
  if (document.body.classList.contains("role-supporter")) return;
  if (_optimisticAnswer || answerIsStreaming()) return;
  if (typeof attachedImages !== "undefined" && attachedImages.length > 0) return;
  const { t, mt, live, key } = specSnapshot();
  if (t && t.length < SPECULATE_MIN_CHARS) return;
  if (!t && (!live || live.length < SPECULATE_MIN_CHARS)) return;
  if (!key) return;
  if (normQuestion(_speculativeText) === normQuestion(key)) return;
  _speculativeText = key;
  if (window.api.speculativeStart) {
    window.api.speculativeStart({ question: t, forcedMode: manualMode, transcript: mt });
  }
}

function kickSpeculative(immediate) {
  syncSendEnabled();
  if (document.body.classList.contains("role-supporter")) return;
  if (_optimisticAnswer || answerIsStreaming()) return;
  ensureApiWarmed();
  if (_speculativeTimer) { clearTimeout(_speculativeTimer); _speculativeTimer = null; }
  const { t, live } = specSnapshot();
  if (t && t.length < SPECULATE_MIN_CHARS) return;
  if (!t && (!live || live.length < SPECULATE_MIN_CHARS)) {
    if (_speculativeText) {
      _speculativeText = null;
      if (window.api.speculativeCancel) window.api.speculativeCancel();
    }
    return;
  }
  if (immediate) startSpeculativeNow();
  else _speculativeTimer = setTimeout(startSpeculativeNow, SPECULATE_DEBOUNCE_MS);
}

if (composerInput) {
  composerInput.addEventListener("input", () => kickSpeculative(false));
}

let _optimisticAnswer = false;

function dropEmptyStreamingTurn() {
  if (!currentAnswerEl || !currentAnswerEl.classList.contains("streaming")) return;
  const streamContent = currentAnswerEl._streamEl
    ? currentAnswerEl._streamEl.textContent
    : currentAnswerEl.textContent;
  if (!(streamContent || "").trim()) {
    const oldTurn = currentAnswerEl.parentElement;
    if (oldTurn && oldTurn.classList.contains("answer-turn")) oldTurn.remove();
    if (answerHistory && !answerHistory.querySelector(".answer-turn, .meet-turn") && answerEmpty) answerEmpty.hidden = false;
    currentAnswerEl = null;
  } else {
    currentAnswerEl.classList.remove("streaming");
    if (currentAnswerEl._timeEl) currentAnswerEl._timeEl.textContent = fmtTime();
    currentAnswerEl = null;
  }
}

function submitComposer() {
  if (document.body.classList.contains("role-supporter")) { supporterAskAI(); return; }
  if (!composerInput) return;
  const { t: q, mt, live, key: matchKey } = specSnapshot();
  if (manualMode === "PROJECT" && !vscodeState.connected) { toast("VS Code is not connected. Install the Ace extension (Settings → VS Code).", "err"); return; }
  if (!q && attachedImages.length === 0 && !live && manualMode !== "PROJECT") {
    // The live bubble may already be sealed; the transcript still has the question.
    if (!mt) { log("Nothing to answer yet — wait for the interviewer or type a question.", "info"); return; }
  }

  if (_speculativeTimer) {
    clearTimeout(_speculativeTimer);
    _speculativeTimer = null;
    startSpeculativeNow();
  }

  if (typeof pushScript === "function" && q) pushScript(profileNameForScript(), q);
  pendingBubbleImages = attachedImages.slice();
  const hasImages = attachedImages.length > 0;
  const extra = { transcript: mt };

  dropEmptyStreamingTurn();
  sealMeetBubble();
  currentAnswerEl = addAnswerTurn(q, pendingBubbleImages.slice(), manualMode);
  _optimisticAnswer = true;

  const specHit = !hasImages && _speculativeText && matchKey && normQuestion(_speculativeText) === normQuestion(matchKey);
  if (specHit && window.api.speculativeCommit) {
    _speculativeText = null;
    window.api.speculativeCommit({ question: q, images: null, forcedMode: manualMode, transcript: mt });
  } else {
    _speculativeText = null;
    if (window.api.speculativeCancel) window.api.speculativeCancel();
    window.api.generateAnswer(q, hasImages ? attachedImages : null, manualMode, extra);
  }

  composerInput.value = "";
  clearAttachedImages();
  syncSendEnabled();
}

if (getAnswerBtn) getAnswerBtn.addEventListener("click", (e) => {
  e.preventDefault();
  submitComposer();
});
if (composerInput) {
  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitComposer();
    }
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
  if (!document.body.classList.contains("in-interview")) return;
  if (e.target === composerInput) return;
  e.preventDefault();
  submitComposer();
});
if (answerClearBtn) {
  answerClearBtn.addEventListener("click", () => {
    if (answerHistory)
      answerHistory.querySelectorAll(".answer-turn, .meet-turn").forEach((n) => n.remove());
    meetingTurns = [];
    liveMeetEl = null;
    lastMeetEl = null;
    liveSeg = "";
    if (answerEmpty) answerEmpty.hidden = false;
    // Reset spacer so first new turn starts flush
    if (answerSpacer) answerSpacer.style.height = "0px";
    showAnswerJump(false);
    followTranscript = true;
    // Also wipe the remembered answers/code/diagrams used to ground follow-ups.
    if (window.api.clearAnswerMemory) window.api.clearAnswerMemory();
  });
}

// Bring a transcript bubble into view as it grows: only while the reader is
// at the end. The panel follows new transcript as long as the end of the last
// bubble is in view. Scrolling up stops that, so an answer can be read in
// peace; scrolling back down to the end of the last bubble starts it again.
// While it is off, a bar above the message box shows the newest words as they
// are heard; clicking it goes to the end and follows again. A bubble taller
// than the panel is lined up by its bottom edge so the newest words show.
const answerJumpBtn = document.getElementById("answerJump");
let followTranscript = true;
let answerScrollTop = 0; // where the panel was last put by this code, or seen
function lastTurnEndVisible() {
  const last = lastTurnEl();
  if (!last) return true;
  return last.getBoundingClientRect().bottom <= answerHistory.getBoundingClientRect().bottom + 24;
}
// A scroll made by this code, not by the reader: the scroll listener knows it
// by its position and leaves following as it is.
function setAnswerScroll(top) {
  answerHistory.scrollTop = top;
  answerScrollTop = answerHistory.scrollTop;
}
function showAnswerJump(on, bubble) {
  if (!answerJumpBtn) return;
  if (on) {
    const composer = document.querySelector(".answer-composer");
    answerJumpBtn.style.bottom = `${(composer ? composer.offsetHeight : 60) + 10}px`;
    const textEl = answerJumpBtn.querySelector("span");
    const lines = bubble ? bubble.querySelectorAll(".meet-line") : [];
    const lastLine = lines.length ? lines[lines.length - 1] : null;
    const nameEl = lastLine && lastLine.querySelector(".meet-name"); // its " : " is drawn by CSS
    const line = lastLine
      ? (nameEl ? nameEl.textContent + ": " + lastLine.textContent.slice(nameEl.textContent.length) : lastLine.textContent)
      : (bubble ? bubble.textContent : "");
    const t = String(line || "").replace(/\s+/g, " ").trim();
    // The newest words matter most: a long line keeps its end.
    if (textEl) textEl.textContent = t ? (t.length > 80 ? "…" + t.slice(-80).replace(/^\S*\s/, "") : t) : "New transcript";
    answerJumpBtn.title = "Go to the newest transcript (and follow it again)";
  }
  answerJumpBtn.hidden = !on;
}
function revealMeetBubble(el) {
  if (!el || !answerHistory) return;
  try {
    const cRect = answerHistory.getBoundingClientRect();
    // What came before it still runs past the bottom (an answer longer than
    // the panel, still being written): the reader is not at the end.
    const prev = el.previousElementSibling;
    if (followTranscript && prev && prev !== answerSpacer && prev.getBoundingClientRect().bottom > cRect.bottom + 24) followTranscript = false;
    if (!followTranscript) { showAnswerJump(true, el); return; }
    const r = el.getBoundingClientRect();
    let delta = 0;
    if (r.height > cRect.height || r.bottom > cRect.bottom) delta = r.bottom - cRect.bottom;
    else if (r.top < cRect.top) delta = r.top - cRect.top;
    if (delta) setAnswerScroll(answerHistory.scrollTop + delta);
    showAnswerJump(false);
  } catch {}
}
if (answerJumpBtn) answerJumpBtn.addEventListener("click", () => {
  followTranscript = true;
  showAnswerJump(false);
  // The newest bubble's bottom at the panel's bottom (not the scroll end: a
  // spacer below the last turn would leave the panel blank).
  const last = lastTurnEl();
  if (!last) return;
  const c = answerHistory.getBoundingClientRect();
  const r = last.getBoundingClientRect();
  if (r.bottom > c.bottom - 12) answerHistory.scrollTo({ top: answerHistory.scrollTop + r.bottom - c.bottom + 12, behavior: "smooth" });
});
// The reader's own scrolling: up stops following, down to the end of the last
// bubble starts it again.
if (answerHistory) answerHistory.addEventListener("scroll", () => {
  const t = answerHistory.scrollTop;
  if (Math.abs(t - answerScrollTop) < 2) return; // this code's own scroll
  const up = t < answerScrollTop;
  answerScrollTop = t;
  if (up) followTranscript = false;
  else if (lastTurnEndVisible()) followTranscript = true;
  if (followTranscript) showAnswerJump(false);
});

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
  if (mode === "PROJECT" && !(question && String(question).trim())) question = "Project status and what changed";
  const showQ = !!(question && String(question).trim()) || (imgs && imgs.length);
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
  const turnMode = mode || 'ANSWER';
  const turnTs = ts || Date.now();
  if (showQ) {
    const qText = document.createElement("span");
    qText.className = "answer-q-text";
    if (question) qText.textContent = question;
    q.appendChild(qText);
    // Header row above the bubble — same layout and buttons as transcript bubbles.
    const head = document.createElement("div");
    head.className = "meet-head answer-q-head";
    const who = document.createElement("div");
    who.className = "meet-who";
    who.textContent = "You";
    const actions = document.createElement("div");
    actions.className = "meet-actions";
    const mk = (cls, title, label, onClick) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "meet-clear " + cls; b.title = title; b.innerHTML = aceIcon(label);
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
      actions.appendChild(b);
    };
    mk("meet-retry", "Answer this again", "refresh", () => resendTurn(question, imgs));
    mk("meet-edit", "Edit this question, then answer", "edit", () => beginInlineEdit(q, question, imgs, turnMode));
    mk("meet-remove", "Remove this question and its answer", "x", () => {
      turn.remove();
      if (answerHistory && !answerHistory.querySelector(".answer-turn, .meet-turn") && answerEmpty) answerEmpty.hidden = false;
    });
    const when = document.createElement("span");
    when.className = "meet-time";
    when.textContent = fmtTime(turnTs);
    head.appendChild(who);
    head.appendChild(when);
    head.appendChild(actions);
    turn.appendChild(head);
    const qTime = document.createElement("div");
    qTime.className = "answer-time answer-time--q";
    qTime.textContent = fmtTime(turnTs);
    q.appendChild(qTime);
  }

  const a = document.createElement("div");
  a.className = "answer-a streaming";
  a.dataset.mode = turnMode;
  if (mode && mode !== 'ANSWER') {
    const badge = document.createElement("span");
    badge.className = "answer-mode-badge answer-mode-badge--" + mode.toLowerCase();
    badge.textContent = mode === 'DIAGRAM' ? '⬡ Diagram' : mode === 'PROJECT' ? '⧉ Project' : '⌨ Live Code';
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
  if (showQ) turn.appendChild(q);
  turn.appendChild(a);

  ensureSpacer();
  answerHistory.insertBefore(turn, answerSpacer);

  // Land on the start of the answer, with a strip of what came before it
  // (the question, or the transcript) above for context. Measured from the
  // answer's TOP: on Submit a drafted answer is pasted in whole before this
  // runs, and measuring a bottom edge would open the bubble at its end.
  showAnswerJump(false); // the new answer is what is read now
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const cRect = answerHistory.getBoundingClientRect();
    const aTopInScroll = answerHistory.scrollTop + (a.getBoundingClientRect().top - cRect.top);
    const prev = showQ ? q : turn.previousElementSibling;
    const context = prev ? Math.min(72, prev.getBoundingClientRect().height) : 0;
    setAnswerScroll(Math.max(0, aTopInScroll - context));
    // Following goes on only if the whole answer fits on screen.
    followTranscript = lastTurnEndVisible();
  }));
  return a;
}

// Reflect a mode in the segmented control + manualMode state.
function setManualMode(mode) {
  manualMode = mode || 'ANSWER';
  if (modeSeg) modeSeg.querySelectorAll('.mode-seg-btn').forEach((b) =>
    b.classList.toggle('mode-seg-btn--active', b.dataset.mode === manualMode));
  syncSpeedSlider();
  if (typeof mirrorState !== "undefined" && mirrorState && mirrorState.active && window.api.mirrorOut) window.api.mirrorOut({ mode: manualMode, ops: [] });
}

// Resend (regenerate): re-submit the same question/images as a new turn, in
// whatever mode is CURRENTLY selected in the Text/Code/Diagram control (not the
// original turn's mode) — so switching the selector then resending takes effect.
function resendTurn(question, imgs) {
  const hasImgs = Array.isArray(imgs) && imgs.length > 0;
  if (!question && !hasImgs) return;
  if (typeof persistAnswerKeys === "function") persistAnswerKeys();
  // Cancel any in-flight speculation, then fire a fresh request.
  _speculativeText = null;
  if (window.api.speculativeCancel) window.api.speculativeCancel();
  // onAnswerStart embeds these into the new question bubble.
  pendingBubbleImages = hasImgs ? imgs.slice() : [];
  window.api.generateAnswer(question || "", hasImgs ? imgs : null, manualMode, { transcript: meetingTranscriptText() });
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
  if (_optimisticAnswer && currentAnswerEl) {
    _optimisticAnswer = false;
    pendingBubbleImages = [];
    if (currentAnswerEl.dataset) currentAnswerEl.dataset.mode = answerMode;
    return;
  }
  dropEmptyStreamingTurn();
  sealMeetBubble();
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

window.api.onAnswerDone((v) => {
  try { if (v && v.text) pushScript(profileNameForScript() + " (suggested answer)", v.text); } catch {}
  _optimisticAnswer = false;
  if (currentAnswerEl) {
    currentAnswerEl.classList.remove("streaming");
    if (currentAnswerEl._timeEl) currentAnswerEl._timeEl.textContent = fmtTime();
    const answerMode = currentAnswerEl.dataset.mode || 'ANSWER';
    // Read raw streamed text from the child stream div (keeps badge untouched)
    const streamEl = currentAnswerEl._streamEl || currentAnswerEl;
    let rawText = streamEl.textContent || '';

    const listenMatch = rawText.trim().match(/^\[LISTEN\]\s*([\s\S]*)$/i);
    if (listenMatch) {
      currentAnswerEl.classList.add("answer-listen");
      const reason = (listenMatch[1] || "").trim();
      streamEl.textContent = "";
      const chip = document.createElement("div");
      chip.className = "listen-chip";
      chip.textContent = reason ? ("Stay quiet — " + reason) : "Stay quiet — not your turn";
      streamEl.appendChild(chip);
      currentAnswerEl._rawText = "";
      currentAnswerEl = null;
      return;
    }

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
    if (answerMode === 'ANSWER' && window.ReadMarker) window.ReadMarker.attach(streamEl);

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

// Tracks the status element of the active write-to-IDE session
let currentIdeStatusEl = null;

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
  ideBtn.addEventListener('click', () => startWriteToIde(el, ideBtn, stopBtn, statusEl));

  // Live status — shows "Typing…" / "Paused (move mouse)" during a session.
  const statusEl = document.createElement('span');
  statusEl.className = 'code-action-status';
  statusEl.hidden = true;

  // Stop (hard cancel) — hidden until typing is active for this bubble
  const stopBtn = document.createElement('button');
  stopBtn.className = 'code-action-btn code-action-btn--stop';
  stopBtn.textContent = '■ Stop';
  stopBtn.title = 'Stop typing';
  stopBtn.hidden = true;
  stopBtn.addEventListener('click', () => { if (window.api.stopIdeTyping) window.api.stopIdeTyping(); });

  bar.appendChild(copyBtn);
  bar.appendChild(ideBtn);
  bar.appendChild(stopBtn);
  bar.appendChild(statusEl);
  el.appendChild(bar);
}

function startWriteToIde(el, btn, stopBtn, statusEl) {
  const code = extractCodeFromEl(el);
  if (!code) return;

  const speedFactor = (() => {
    const s = document.getElementById('ideSpeedSlider');
    return s ? Number(s.value) : 3;
  })();

  let count = 3;
  btn.disabled = true;
  btn.classList.add('code-action-btn--counting');
  if (stopBtn) stopBtn.hidden = true;
  if (statusEl) { statusEl.hidden = true; currentIdeStatusEl = statusEl; }

  const tick = () => {
    btn.textContent = `Switch to IDE… ${count}`;
    if (count === 0) {
      btn.textContent = 'Typing…';
      if (stopBtn) stopBtn.hidden = false;
      if (statusEl) { statusEl.hidden = false; statusEl.textContent = 'Typing…'; }
      window.api.writeToIde(code, speedFactor).then(res => {
        btn.disabled = false;
        btn.classList.remove('code-action-btn--counting');
        btn.textContent = res && res.ok ? 'Done ✓' : (res && res.cancelled ? 'Stopped' : 'Error — try again');
        setTimeout(() => { btn.textContent = 'Write to IDE'; }, 2500);
        if (stopBtn) stopBtn.hidden = true;
        if (statusEl) { statusEl.hidden = true; }
        if (currentIdeStatusEl === statusEl) currentIdeStatusEl = null;
      });
    } else {
      count--;
      setTimeout(tick, 1000);
    }
  };
  tick();
}

// Reflect take-over pause state in the active bubble's status text. Pausing is
// driven by mouse movement in the main process — move the mouse to pause, hold
// still ~1.5s to resume.
if (window.api && window.api.onIdeTypingState) {
  window.api.onIdeTypingState(({ paused, active }) => {
    if (!currentIdeStatusEl) return;
    if (active) currentIdeStatusEl.textContent = paused ? 'Paused — move mouse stopped to resume' : 'Typing…';
  });
}

// Render the structured talking-script as a styled block inside the answer bubble.
function appendScriptToAnswer(el, script) {
  const SECTIONS = ['OVERVIEW', 'WALKTHROUGH', 'KEY INSIGHT'];
  const wrapper = document.createElement('div');
  wrapper.className = 'answer-script';

  const header = document.createElement('div');
  header.className = 'answer-script-header';
  header.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6"/><path d="M9 14h6"/><path d="M9 18h3"/></svg>Presenter Script';
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
  _optimisticAnswer = false;
  if (currentAnswerEl) {
    currentAnswerEl.classList.remove("streaming");
    const target = currentAnswerEl._streamEl || currentAnswerEl;
    target.textContent += (target.textContent ? "\n\n" : "") + "[error] " + msg;
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
// Keys are built into the app (defaults/api-keys.json); there are no key
// inputs any more. Only report a key for an input that actually exists so a
// provider switch never overwrites stored keys with empty strings.
function collectAnswerKeys() {
  const keys = {};
  if (answerKeyEl) keys.xai = answerKeyEl.value.trim();
  if (answerKeyAnthropicEl) keys.anthropic = answerKeyAnthropicEl.value.trim();
  if (answerKeyOpenaiEl) keys.openai = answerKeyOpenaiEl.value.trim();
  return keys;
}

function persistAnswerKeys() {
  return window.api.setAnswerConfig({ keys: collectAnswerKeys() });
}

function persistAnswerKey(providerId, value) {
  const keys = collectAnswerKeys();
  keys[providerId] = value;
  window.api.setAnswerConfig({ keys }).then(() => populateModelSelects());
}

function bindAnswerKeyField(el, providerId) {
  if (!el) return;
  let timer = null;
  const save = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    persistAnswerKey(providerId, el.value.trim());
  };
  el.addEventListener("change", save);
  el.addEventListener("paste", () => setTimeout(save, 0));
  el.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 400);
  });
}

bindAnswerKeyField(answerKeyEl, "xai");
bindAnswerKeyField(answerKeyAnthropicEl, "anthropic");
bindAnswerKeyField(answerKeyOpenaiEl, "openai");
if (window.api.getAnswerConfig) {
  window.api.getAnswerConfig().then((cfg) => applyAnswerConfigUi(cfg, { refreshLive: true }));
}

async function refreshMicList() {
  try {
    const perm = window.api.getMicPermission ? await window.api.getMicPermission() : "granted";
    if (perm === "granted") await navigator.mediaDevices
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

// A virtual loopback input (BlackHole and the like) that the call audio is
// routed to: the only way to get it on macOS before 13.
const MAC_LOOPBACK_RE = /blackhole|loopback audio|soundflower|background music|vb-cable/i;
async function openMacLoopbackDevice() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const dev = devices.find((d) => d.kind === "audioinput" && MAC_LOOPBACK_RE.test(d.label || ""));
    if (!dev) return null;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: dev.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    return { stream, label: dev.label };
  } catch (e) {
    log("Loopback device failed: " + e.message, "err");
    return null;
  }
}

let recState = null;
async function startVoice() {
  if (recState) return;
  txCfg = await window.api.getTranscriptionConfig();

  if (txCfg.engine === "deepgram" || txCfg.engine === "xai") {
    const isXai = txCfg.engine === "xai";
    const apiKey = isXai ? txCfg.xaiApiKey : txCfg.deepgramApiKey;
    const label = isXai ? "xAI" : "Deepgram";
    if (!apiKey) {
      log(`${label} API key not set`, "err");
      toast(`Transcription unavailable: no ${label} key is built into this copy of the app — contact your administrator.`, "err");
      return;
    }
    if (txCfg.captureMic === false && txCfg.captureSystem === false) {
      log("No audio source selected — enable Microphone or System audio in Settings → Audio sources", "err");
      toast("No audio source selected — enable Microphone or System audio in Settings → Audio sources.", "err");
      return;
    }
    // macOS: never call getUserMedia while permission is denied (each call
    // re-prompts); ask once if undetermined, and explain if denied.
    if (txCfg.captureMic !== false && window.api.getMicPermission) {
      let perm = await window.api.getMicPermission();
      if (perm === "not-determined" && window.api.requestMicPermission) perm = (await window.api.requestMicPermission()) ? "granted" : "denied";
      if (perm === "denied" || perm === "restricted") {
        toast("Microphone access is blocked. Allow it in System Settings → Privacy & Security → Microphone, then start listening again.", "err");
        if (txCfg.captureSystem === false) return;
        txCfg = { ...txCfg, captureMic: false };
      }
    }

    const startStream = isXai
      ? window.api.startXaiStream
      : window.api.startDeepgramStream;
    await startStream({ apiKey, language: txCfg.language || "auto" });

    const ctx = new AudioContext({ sampleRate: 16000 });
    const dest = ctx.createMediaStreamDestination();
    const streams = [];
    // Deepgram only: transcribe the microphone on its own socket so the
    // candidate's voice goes to the saved transcript, not the interviewer
    // bubbles. (xAI keeps the mixed single-stream behaviour.)
    const splitMic = !isXai && txCfg.captureMic !== false && !!window.api.startMicDeepgramStream;
    const micDest = splitMic ? ctx.createMediaStreamDestination() : null;

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
        // Only ever into its own stream: mixed into the meeting audio, the
        // user's words would show up in the meeting bubbles.
        if (micDest) ctx.createMediaStreamSource(mic).connect(micDest);
        log(micDest ? "Mic capture started (own transcript stream)" : "Mic is recorded but not transcribed with this engine", "info");
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
      // macOS: system audio comes from the ScreenCaptureKit helper (main
      // process) and is mixed in through the pcm-feed worklet.
      if (IS_MAC && window.api.macSystemAudioStart) {
        try {
          const r = await window.api.macSystemAudioStart();
          if (r && r.ok) {
            await ctx.audioWorklet.addModule("pcm-feed-worklet.js");
            const feed = new AudioWorkletNode(ctx, "pcm-feed", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
            feed.connect(dest);
            macSysFeed = feed;
            streams.push({ getTracks: () => [{ stop: () => { if (macSysFeed === feed) macSysFeed = null; window.api.macSystemAudioStop(); } }] });
            sysOk = true;
            log("System audio: macOS ScreenCaptureKit", "info");
          } else {
            log("macOS system audio unavailable: " + ((r && r.error) || "unknown"), "err");
            if (!(r && r.old)) toast("System audio could not be captured: " + ((r && r.error) || "unknown") + ". If macOS asked for Screen/System Audio Recording permission, allow it and start listening again.", "err");
          }
        } catch (e) {
          log("macOS system audio error: " + e.message, "err");
        }
        // Without the helper (macOS 12 and older, or no permission) the call
        // audio can still come from a loopback device the user routes it to.
        if (!sysOk) {
          const loop = await openMacLoopbackDevice();
          if (loop) {
            streams.push(loop.stream);
            ctx.createMediaStreamSource(loop.stream).connect(dest);
            window.__macLoopbackStream = loop.stream;
            sysOk = true;
            log("System audio: loopback device \"" + loop.label + "\"", "info");
          }
        }
      }
      // Primary: WASAPI loopback via chromeMediaSource:'desktop' (more reliable).
      // On macOS this is the fallback when the helper could not start, as in 2.2.
      if (!sysOk) try {
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
        if (IS_MAC) {
          // This loopback also carries what Ace itself plays: the partner's
          // microphone and the user's own one sent to the virtual cable. Mic
          // sound must never reach the meeting bubbles, so it is silenced
          // whenever one of those players is playing.
          sys.getVideoTracks().forEach((t) => t.stop());
          const audioTracks = sys.getAudioTracks();
          if (audioTracks.length) {
            streams.push(sys);
            const gate = ctx.createGain();
            const players = [remoteAudioEl, speakerInAudioEl, document.getElementById("cableOutAudio")].filter(Boolean);
            const update = () => { gate.gain.value = players.some((el) => el.srcObject && !el.paused) ? 0 : 1; };
            const events = ["play", "playing", "pause", "ended", "emptied"];
            players.forEach((el) => events.forEach((ev) => el.addEventListener(ev, update)));
            update();
            streams.push({ getTracks: () => [{ stop: () => players.forEach((el) => events.forEach((ev) => el.removeEventListener(ev, update))) }] });
            ctx.createMediaStreamSource(new MediaStream(audioTracks)).connect(gate).connect(dest);
            // The session recorder takes the call audio from here on macOS.
            window.__macLoopbackStream = new MediaStream(audioTracks);
            sysOk = true;
            log("System audio capture started (loopback)", "info");
          } else {
            sys.getTracks().forEach((t) => t.stop());
          }
        } else {
          sysOk = attachSystemAudio(sys, " (loopback)");
        }
      } catch (e) {
        log("System loopback failed (" + e.message + "); trying display capture…", "info");
      }
      if (!sysOk && IS_MAC) {
        toast("Call audio is not captured on this Mac. On macOS 12 or older: install BlackHole 2ch (free), create a Multi-Output Device (your speakers + BlackHole) in Audio MIDI Setup and select it as the sound output, then start listening again.", "err");
      }
      // Fallback: the previous getDisplayMedia path (not on macOS — it opens a picker and returns no system audio there).
      if (!sysOk && !IS_MAC) {
        try {
          const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          sysOk = attachSystemAudio(sys, "");
          if (!sysOk) log("System audio: no audio track returned", "err");
        } catch (e) {
          log("System audio failed: " + e.message, "err");
        }
      }
      if (!sysOk && !streams.length) {
        toast("System audio can't be captured on this computer. Turn on Microphone in Settings → Audio sources (on a Mac, install BlackHole to capture the call audio).", "err");
        try { await ctx.close(); } catch {}
        try { await (isXai ? window.api.stopXaiStream : window.api.stopDeepgramStream)(); } catch {}
        return;
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

    let micProcessor = null;
    if (micDest && txCfg.captureMic !== false) {
      try {
        await window.api.startMicDeepgramStream({ apiKey, language: txCfg.language || "auto" });
        micProcessor = new AudioWorkletNode(ctx, "capture-processor", {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { format: "int16", batchSize: 1600 },
        });
        ctx.createMediaStreamSource(micDest.stream).connect(micProcessor);
        const micSink = ctx.createGain(); micSink.gain.value = 0;
        micProcessor.connect(micSink).connect(ctx.destination);
        micProcessor.port.onmessage = (e) => { window.api.sendMicAudioChunk(e.data); };
      } catch (e) { log("Mic transcript stream failed: " + e.message, "err"); }
    }

    recState = { ctx, streams, processor, micProcessor, streaming: true, xai: isXai };
    recBtn.classList.add("on");
    updateRecTitle();
    // Record the whole session (screen + audio) alongside transcription.
    window.__recLog = (msg, kind) => log(msg, kind);
    window.__recToast = (msg) => toast(msg, "info");
    if (typeof window.startRecording === "function") window.startRecording();
    const sources = [
      txCfg.captureMic !== false ? "mic" : null,
      txCfg.captureSystem !== false ? "system audio" : null,
    ].filter(Boolean).join(" + ");
    log(`Voice transcription started (${label} live, ${sources})`, "info");
    return;
  }

  log("Unknown transcription engine: " + txCfg.engine, "err");
}

async function stopVoice() {
  if (!recState) return;
  try {
    recState.processor.disconnect();
  } catch {}
  try { if (recState.micProcessor) recState.micProcessor.disconnect(); } catch {}
  try { if (window.api.stopMicDeepgramStream) window.api.stopMicDeepgramStream(); } catch {}
  recState.streams.forEach((s) =>
    s.getTracks ? s.getTracks().forEach((t) => t.stop()) : null,
  );
  try {
    await recState.ctx.close();
  } catch {}
  if (recState.xai) await window.api.stopXaiStream();
  else await window.api.stopDeepgramStream();
  recState = null;
  window.__macLoopbackStream = null;
  recBtn.classList.remove("on");
  updateRecTitle();
  log("Voice transcription stopped", "info");
}

recBtn.addEventListener("click", async () => {
  if (recState) stopVoice();
  else startVoice();
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
  stopScreenForSupporter();
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
  cableDest = null;
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
  const audio = await captureSpeakerStream();
  if (!audio) {
    log("Speaker: nothing to stream — aborting connection " + connId, "err");
    return;
  }
  // One stream for the supporter: the call's audio now, the screen once the
  // peer is connected (see "connect" below). Kept per peer so the screen can
  // be added or removed later.
  const stream = new MediaStream(audio.getTracks());
  const tracks = stream.getTracks();
  log(`Speaker[${connId}]: streaming ${tracks.length} track(s)`, "info");

  const peer = new SimplePeerLib({
    initiator: true,
    stream,
    trickle: true,
    config: RTC_CONFIG,
  });
  speakerPeers.set(connId, { peer, stream });
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
  peer.on("connect", async () => {
    log(`Speaker[${connId}]: P2P connected`, "info");
    // The screen capturer only produces a frame when something on the screen
    // changes, so the track is added now, connected: its first frame reaches
    // the supporter instead of being made before anyone could receive it.
    let on = false;
    if (netCfg && netCfg.shareScreen !== false) {
      const screen = await captureScreenForSupporter();
      const entry = speakerPeers.get(connId);
      if (screen && entry && !peer.destroyed) {
        try { peer.addTrack(screen.getVideoTracks()[0], entry.stream); on = true; }
        catch (e) { log(`Speaker[${connId}]: adding the screen failed: ${e.message}`, "err"); }
      }
    }
    notifyScreenState(on, connId);
  });
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
      supporterMicTrack.enabled = currentMicMode !== "mute";
      setPttStatus(supporterMicTrack.enabled);
      log(`Supporter mic ready (${supporterMicTrack.enabled ? "on" : "off"})`, "info");
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
    remoteAudioEl.muted = !!supporterSoundMuted;
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
  supporterPeer.on("track", (track, remote) => {
    if (track.kind === "video") { attachScreenTrack(track); return; }
    attachRemote(remote, `track[${track.kind}]`);
  });
  supporterPeer.on("error", (err) =>
    log("Supporter peer error: " + err.message, "err"),
  );
  supporterPeer.on("close", () => {
    log("Supporter: peer closed", "info");
    supporterPeer = null;
    stopLevelMeter();
    clearScreenView("The speaker left.");
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
    if (netCfg && netCfg.role === "speaker" && msg.connId) {
      toast(`A supporter joined${msg.ip ? " from " + msg.ip : ""}.`, "info");
      speakerHandleOpened(msg.connId);
      mirrorStart();
      openSpeakerChatPane(msg.ip ? `Supporter connected · ${msg.ip}` : "Supporter connected");
    }
  } else if (type === "closed") {
    if (netCfg && netCfg.role === "speaker" && msg.connId) {
      toast("The supporter left.", "info");
      speakerHandleClosed(msg.connId);
      mirrorStop();
      chatSetStatus("The supporter left");
      // No supporter: the chat column closes and the window is back to its
      // fixed size. The next supporter starts on the default display.
      if (speakerPeers.size === 0) {
        stopScreenForSupporter();
        shareDisplayId = "";
        closeSidePane();
      }
    }
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
      clearScreenView("Connection to the speaker closed.");
    }
  } else if (type === "screen") {
    if (netCfg && netCfg.role === "supporter") onScreenShareState(!!msg.on, msg);
  } else if (type === "screen-select") {
    if (netCfg && netCfg.role === "speaker") switchShareDisplay(String(msg.display || ""));
  } else if (type === "screen-thumbs-request") {
    if (netCfg && netCfg.role === "speaker") sendDisplayThumbs(msg.connId);
  } else if (type === "screen-thumbs") {
    if (netCfg && netCfg.role === "supporter") onRemoteThumbs(msg.thumbs);
  } else if (type === "signal") {
    if (netCfg && netCfg.role === "speaker")
      speakerHandleSignal(msg.connId, msg.payload);
    else if (netCfg && netCfg.role === "supporter")
      supporterHandleSignal(msg.payload);
  } else if (type === "reject") {
    log("Network: rejected (" + (msg.reason || "unknown") + ")", "err");
  } else if (type === "hello") {
    log("Network: connected as supporter (peer id " + msg.id + ")", "info");
    supporterAdmittedUi();
  }
});

const chatMainEl = document.getElementById("chatMain");
const chatHistoryEl = document.getElementById("chatHistory");
let chatEmptyEl = document.getElementById("chatEmpty");
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
    const mine = !!msg.fromSupporter;
    if (msg.type === "chat-text") chatAddText(msg.text || "", true, mine, msg.ts);
    else if (msg.type === "chat-image") chatAddImage(msg.dataUrl || "", true, mine, msg.ts);
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
  const speaker = netCfg && netCfg.role === "speaker";
  const ok = speaker
    ? await window.api.speakerChatSend({ text }).catch(() => false)
    : await window.api.sendChatText(text).catch(() => false);
  chatAddText(text, ok);
  if (!ok) chatSetStatus(speaker ? "Not sent: no supporter connected" : "Send failed (not connected)");
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
    const ok = netCfg && netCfg.role === "speaker"
      ? await window.api.speakerChatSend({ dataUrl: small }).catch(() => false)
      : await window.api.sendChatImage(small).catch(() => false);
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
  log("Disconnected by the speaker", "err");
  if (netActionBtn) delete netActionBtn.dataset.connecting;
  supporterLostConnection("They disconnected you. Ask for the code again to rejoin.");
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

// The supporter's microphone: off, or heard by the speaker only. Nothing the
// supporter says reaches the meeting.
const MIC_MODE_LABELS = { mute: "MUTE", aOnly: "TO A" };
const MIC_MODE_ICONS = {
  mute: "\u{1F507}",
  aOnly: "\u{1F512}",
};
const MIC_MODES_R = ["mute", "aOnly"];
let currentMicMode = "aOnly";

// The virtual-cable output (when one is set) carries the speaker's own
// microphone only; the supporter's voice is never mixed into it.
let cableCtx = null;
let cableAGain = null;
let cableDest = null;
let cableOutEl = null;

function updateMicPillUI(mode) {
  if (!micPillEl) return;
  const m = MIC_MODES_R.includes(mode) ? mode : "aOnly";
  if (micPillIconEl) micPillIconEl.textContent = MIC_MODE_ICONS[m];
  if (micPillLabelEl) micPillLabelEl.textContent = MIC_MODE_LABELS[m];
  micPillEl.classList.remove("mode-mute", "mode-aOnly");
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

function applyMicModeToCableMixer() {
  if (cableAGain) cableAGain.gain.value = 1;
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
  let msg;
  if (mode === "mute")
    msg =
      role === "supporter"
        ? "Your mic is off. Nobody hears you."
        : "The supporter's mic is off.";
  else
    msg =
      role === "supporter"
        ? "They hear you. The meeting does not."
        : "The supporter can talk to you. The meeting does not hear them.";
  updateSupporterMicButtons(mode);
  toast(msg, mode);
  log(msg, "info");
});

function toast(message, kind) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast " + (kind ? "toast-" + kind : "toast-info");
  const TOAST_ICONS = { err: "alert", warn: "warning", mute: "mic-off", aOnly: "mic" };
  el.innerHTML = aceIcon(TOAST_ICONS[kind] || "info", "toast-ico");
  const msgEl = document.createElement("span");
  msgEl.textContent = message;
  el.appendChild(msgEl);
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
  banner.classList.remove("mode-mute", "mode-aOnly");
  banner.classList.add("mode-" + mode);
  icon.innerHTML = aceIcon(mode === "mute" ? "mic-off" : "mic");
  if (mode === "mute") text.textContent = "Your mic is off. Nobody hears you.";
  else if (mode === "aOnly")
    text.textContent = "They hear you. The meeting does not.";
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
    const perm = window.api.getMicPermission ? await window.api.getMicPermission() : "granted";
    if (perm === "granted") await navigator.mediaDevices
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
  cableDest = cableCtx.createMediaStreamDestination();
  aSrc.connect(cableAGain).connect(cableDest);
  applyMicModeToCableMixer();
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
      // The old popup is retired; the first-run tour (tour.js) uses this flag now.
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
      ? `The supporter's mic: off ↔ talks to you only  (hotkey: ${ptt})`
      : `The supporter's mic: off ↔ talks to you only`;
  } catch {}
}
setTimeout(() => refreshMicPillTooltip().catch(() => {}), 500);
window.api.onHotkeysChanged(() => refreshMicPillTooltip().catch(() => {}));

// Chromium works out the window's drag areas from the page layout without
// clipping them to scroll boxes. A clickable (no-drag) element scrolled up
// under the title bar still claims its spot there, so the header stops moving
// the window. Elements whose top is above the title bar's bottom edge get
// `under-titlebar`, which clears their drag setting while they are up there.
(function keepTitlebarDraggable() {
  const bar = document.querySelector(".titlebar");
  if (!bar) return;
  let pending = null;
  function update(box) {
    pending = null;
    const edge = bar.getBoundingClientRect().bottom;
    for (const el of box.querySelectorAll("*")) {
      el.classList.toggle("under-titlebar", el.getBoundingClientRect().top < edge);
    }
  }
  document.addEventListener("scroll", (e) => {
    const box = e.target;
    if (!(box instanceof Element) || box === bar || bar.contains(box)) return;
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => update(box));
  }, true);
})();

// ── VS Code ──────────────────────────────────────────────────────────────────
// The Project mode answers about the project open in VS Code (main.js keeps
// the picture through vscode-bridge.js). Here: the mode button's state, the
// composer placeholder, and the settings tab.
const modeProjectBtn = document.getElementById("modeProjectBtn");
const vscodeEnabledEl = document.getElementById("vscodeEnabled");
const vscodePortEl = document.getElementById("vscodePort");
const vscodeStatusLine = document.getElementById("vscodeStatusLine");

function vscodeStatusText(s) {
  if (!s.enabled) return s.lastError ? "Not listening: " + s.lastError + "." : "Not listening.";
  if (!s.connected) return "Listening on 127.0.0.1:" + s.port + ". VS Code is not connected" + (s.name ? " (last project: " + s.name + ")" : "") + ".";
  const parts = ["Connected: " + (s.name || "(no folder)")];
  if (s.branch) parts.push("branch " + s.branch + ", " + s.changed + " changed file" + (s.changed === 1 ? "" : "s"));
  if (s.active) parts.push("editing " + s.active);
  if (s.editsSinceReport) parts.push(s.editsSinceReport + " edit" + (s.editsSinceReport === 1 ? "" : "s") + " since the last report");
  return parts.join(" · ");
}

function syncProjectMode() {
  if (modeProjectBtn) {
    modeProjectBtn.classList.toggle("mode-seg-btn--live", !!vscodeState.connected);
    modeProjectBtn.title = vscodeState.connected
      ? "Ask about the project open in VS Code (" + (vscodeState.name || "project") + ")"
      : "VS Code is not connected (Settings → VS Code)";
  }
  if (composerInput && !document.body.classList.contains("role-supporter")) {
    composerInput.placeholder = manualMode === "PROJECT"
      ? (vscodeState.connected ? "Ask about the project, or leave empty for the status and what changed…" : "VS Code is not connected (Settings → VS Code)")
      : "Your question (from your knowledge base)…";
  }
  if (vscodeStatusLine) vscodeStatusLine.textContent = vscodeStatusText(vscodeState);
  syncSendEnabled();
}

function applyVscodeStatus(s) {
  if (!s) return;
  vscodeState = { ...vscodeState, ...s };
  syncProjectMode();
}

if (window.api.onVscodeStatus) window.api.onVscodeStatus(applyVscodeStatus);
if (window.api.onVscodeEvent) window.api.onVscodeEvent((e) => {
  if (!e) return;
  if (e.type === "connected") toast("VS Code connected: " + (e.name || "project"), "info");
  else if (e.type === "disconnected") toast("VS Code disconnected.", "info");
});
if (window.api.getVscodeStatus) window.api.getVscodeStatus().then(applyVscodeStatus).catch(() => {});

async function refreshVscodeSettings() {
  if (!window.api.getVscodeConfig) return;
  const cfg = await window.api.getVscodeConfig();
  if (vscodeEnabledEl) vscodeEnabledEl.checked = cfg.enabled !== false;
  if (vscodePortEl) vscodePortEl.value = cfg.port;
}
async function persistVscode(patch) {
  if (!window.api.setVscodeConfig) return;
  const cfg = await window.api.setVscodeConfig(patch);
  if (vscodeEnabledEl) vscodeEnabledEl.checked = cfg.enabled !== false;
  if (vscodePortEl) vscodePortEl.value = cfg.port;
  if (window.api.getVscodeStatus) applyVscodeStatus(await window.api.getVscodeStatus());
}
if (vscodeEnabledEl) vscodeEnabledEl.addEventListener("change", () => persistVscode({ enabled: vscodeEnabledEl.checked }));
if (vscodePortEl) vscodePortEl.addEventListener("change", () => {
  const port = parseInt(vscodePortEl.value, 10);
  if (port >= 1024 && port <= 65535) persistVscode({ port });
});
refreshVscodeSettings();
syncProjectMode();

// ── Supporter sees the speaker's screen ──────────────────────────────────────
// Speaker (B): the screen is captured the way the recorder does it and sent as
// a video track on the same peer as the call's audio. B's own windows are
// content-protected, so they are not in the picture. Supporter (A): the track
// plays in the panel above the chat; a "screen" message says whether B shares,
// which displays B has and which one is shown. A picks the display; B swaps
// the track's source without a new connection.

// getDisplayMedia, one call at a time, each for a chosen display ('' = the
// recording's). Main answers the call without a picker (main.js).
(function serializeDisplayCapture() {
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== "function") return;
  const original = md.getDisplayMedia.bind(md);
  let chain = Promise.resolve();
  window.captureDisplayMedia = (displayId, constraints) => {
    const run = chain.then(async () => {
      if (window.api.setCaptureDisplay) await window.api.setCaptureDisplay(displayId || "").catch(() => {});
      try { return await original(constraints); }
      finally { if (window.api.setCaptureDisplay) await window.api.setCaptureDisplay("").catch(() => {}); }
    });
    chain = run.catch(() => {});
    return run;
  };
  md.getDisplayMedia = (constraints) => window.captureDisplayMedia("", constraints);
})();

let speakerScreenStream = null;
let speakerScreenDisplay = ""; // the display speakerScreenStream shows
let shareDisplayId = "";       // the display the supporter picked ('' = the recording's)
const SCREEN_FPS = 15;

// This computer's displays, and the one the supporter is shown.
async function shareDisplayInfo() {
  let list = [];
  try { list = (window.api.listDisplays && (await window.api.listDisplays())) || []; } catch {}
  const has = (id) => !!id && list.some((d) => d.id === id);
  const rec = String((txCfg && txCfg.recordDisplay) || "");
  const fallback = has(rec) ? rec : ((list.find((d) => d.main) || list[0] || {}).id || "");
  const current = has(speakerScreenDisplay) ? speakerScreenDisplay : has(shareDisplayId) ? shareDisplayId : fallback;
  return { displays: list.map((d) => ({ id: d.id, label: d.label })), display: current };
}

// A new capture of one display (a fresh stream; the caller owns it).
async function captureDisplayStream(displayId) {
  const video = { frameRate: { ideal: SCREEN_FPS, max: SCREEN_FPS }, width: { max: 1920 }, height: { max: 1080 } };
  let s = null;
  // Windows: getDisplayMedia gets a capturer of its own (see recorder.js); the
  // main process answers it with the chosen screen, no picker.
  if (!IS_MAC && window.captureDisplayMedia) {
    try { s = await window.captureDisplayMedia(displayId, { video, audio: false }); }
    catch (e) { log("Screen for supporter: display capture unavailable (" + e.message + "), using desktop capture", "info"); }
  }
  if (!s) {
    try {
      const id = window.api.getDesktopSourceId ? await window.api.getDesktopSourceId(displayId) : null;
      if (!id) throw new Error("no screen source");
      s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: id, maxFrameRate: SCREEN_FPS, maxWidth: 1920, maxHeight: 1080 } },
      });
    } catch (e) {
      log("Screen for supporter: capture failed: " + e.message, "err");
      return null;
    }
  }
  s.getAudioTracks().forEach((t) => t.stop());
  const vt = s.getVideoTracks()[0];
  if (!vt) { s.getTracks().forEach((t) => t.stop()); return null; }
  const st = vt.getSettings ? vt.getSettings() : {};
  log(`Screen for supporter: ${st.width || "?"}x${st.height || "?"} @ ${st.frameRate || SCREEN_FPS} fps${displayId ? " (display " + displayId + ")" : ""}`, "info");
  return new MediaStream([vt]);
}

function adoptScreenStream(stream, displayId) {
  speakerScreenStream = stream;
  speakerScreenDisplay = displayId || "";
  const vt = stream.getVideoTracks()[0];
  vt.onended = () => {
    if (speakerScreenStream && speakerScreenStream.getVideoTracks()[0] === vt) {
      speakerScreenStream = null;
      speakerScreenDisplay = "";
      notifyScreenState(false);
    }
  };
}

async function captureScreenForSupporter() {
  if (speakerScreenStream && speakerScreenStream.getVideoTracks().some((t) => t.readyState === "live")) return speakerScreenStream;
  stopScreenForSupporter();
  const want = (await shareDisplayInfo()).display;
  const s = await captureDisplayStream(shareDisplayId && want === shareDisplayId ? shareDisplayId : "");
  if (!s) return null;
  adoptScreenStream(s, want);
  return speakerScreenStream;
}

function stopScreenForSupporter() {
  if (!speakerScreenStream) return;
  speakerScreenStream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  speakerScreenStream = null;
  speakerScreenDisplay = "";
}

async function notifyScreenState(on, onlyConnId) {
  const info = await shareDisplayInfo();
  speakerPeers.forEach((entry, connId) => {
    if (onlyConnId && connId !== onlyConnId) return;
    try { window.api.sendSignaling({ connId, type: "screen", on: !!on, ...info }); } catch {}
  });
}

// The supporter picked one of this computer's displays: the same video track
// now shows that display (replaceTrack, no new offer).
let switchingShareDisplay = false;
async function switchShareDisplay(displayId) {
  const info = await shareDisplayInfo();
  const d = info.displays.find((x) => x.id === displayId);
  if (!d || switchingShareDisplay) return;
  shareDisplayId = displayId;
  const live = speakerScreenStream && speakerScreenStream.getVideoTracks().some((t) => t.readyState === "live");
  if (!live || speakerPeers.size === 0) { notifyScreenState(!!live); return; }
  if (speakerScreenDisplay === displayId) { notifyScreenState(true); return; }
  switchingShareDisplay = true;
  try {
    const fresh = await captureDisplayStream(displayId);
    if (!fresh) { toast("That display could not be captured.", "err"); notifyScreenState(true); return; }
    const oldVt = speakerScreenStream.getVideoTracks()[0];
    const newVt = fresh.getVideoTracks()[0];
    speakerPeers.forEach((entry, connId) => {
      try { entry.peer.replaceTrack(oldVt, newVt, entry.stream); }
      catch (e) { log(`Speaker[${connId}]: switching the screen failed: ${e.message}`, "err"); }
    });
    oldVt.onended = null;
    oldVt.stop();
    adoptScreenStream(fresh, displayId);
    notifyScreenState(true);
    toast(`The supporter now sees ${d.label.replace(/,.*$/, "")}.`, "info");
  } finally {
    switchingShareDisplay = false;
  }
}
if (window.api.onDisplaysChanged)
  window.api.onDisplaysChanged(() => { if (speakerPeers.size) notifyScreenState(!!speakerScreenStream); });

// A small picture of each display for the supporter's display picker. Only
// while the screen is shared, and only with more than one display.
const thumbsSentAt = new Map();
async function sendDisplayThumbs(connId) {
  if (!connId || !speakerPeers.has(connId) || !window.api.displayThumbnails) return;
  if (!(netCfg && netCfg.shareScreen !== false) || !speakerScreenStream) return;
  const now = Date.now();
  if (now - (thumbsSentAt.get(connId) || 0) < 1500) return;
  thumbsSentAt.set(connId, now);
  let thumbs = [];
  try { thumbs = (await window.api.displayThumbnails({ width: 288 })) || []; } catch {}
  if (thumbs.length < 2) return;
  try { window.api.sendSignaling({ connId, type: "screen-thumbs", thumbs }); } catch {}
}

// The speaker's setting: on applies at once to every connected supporter.
async function setShareScreen(on) {
  on = !!on;
  await persistNet({ shareScreen: on });
  if (shareScreenEl) shareScreenEl.checked = on;
  if (!netCfg || netCfg.role !== "speaker" || speakerPeers.size === 0) { if (!on) stopScreenForSupporter(); return; }
  if (on) {
    const screen = await captureScreenForSupporter();
    if (!screen) { toast("The screen could not be captured.", "err"); return; }
    const vt = screen.getVideoTracks()[0];
    speakerPeers.forEach((entry, connId) => {
      try { entry.peer.addTrack(vt, entry.stream); } catch (e) { log(`Speaker[${connId}]: addTrack failed: ${e.message}`, "err"); }
    });
    notifyScreenState(true);
  } else {
    const vt = speakerScreenStream ? speakerScreenStream.getVideoTracks()[0] : null;
    speakerPeers.forEach((entry, connId) => {
      if (!vt) return;
      try { entry.peer.removeTrack(vt, entry.stream); } catch (e) { log(`Speaker[${connId}]: removeTrack failed: ${e.message}`, "err"); }
    });
    stopScreenForSupporter();
    notifyScreenState(false);
  }
}

const shareScreenEl = document.getElementById("shareScreen");
const supporterJoinAddrEl = document.getElementById("supporterJoinAddr");
if (shareScreenEl) shareScreenEl.addEventListener("change", () => setShareScreen(shareScreenEl.checked));
async function refreshSupporterSettings() {
  try {
    const cfg = await window.api.getNetworkConfig();
    if (shareScreenEl) shareScreenEl.checked = cfg.shareScreen !== false;
    if (supporterJoinAddrEl) {
      // The same address the headset panel shows: the real network first.
      let addrs = [];
      try {
        const inv = window.api.getSupporterInvite && await window.api.getSupporterInvite();
        if (inv) addrs = inv.addresses || [];
      } catch {}
      supporterJoinAddrEl.textContent = addrs.length ? addrs[0].address : "<this computer's IP>";
    }
  } catch {}
}
refreshSupporterSettings();

// ── Supporter side ──
// The speaker's screen shows in a small preview at the top of the chat column.
// Double-click it (or the pop-out button) to open it in a window of its own
// that can be made as large as needed or moved to another monitor. When the
// speaker has more than one display, the numbered buttons pick which one.
const screenViewEl = document.getElementById("screenView");
const screenVideoEl = document.getElementById("screenVideo");
const screenStatusEl = document.getElementById("screenStatus");
const screenEmptyTextEl = document.getElementById("screenEmptyText");
const screenStageEl = document.getElementById("screenStage");
const screenToggleBtn = document.getElementById("screenToggleBtn");
const screenPopBtn = document.getElementById("screenPopBtn");
const screenDisplaysEl = document.getElementById("screenDisplays");
let screenShareOn = null;   // what B last said: true / false / null (unknown)
let remoteDisplays = [];    // B's displays: [{ id, label }]
let remoteDisplay = "";     // the one shown
let remoteThumbs = {};      // a small picture of each: { id: data URL }
let screenHasVideo = false;
let screenStatusText = "Waiting for the speaker's screen…";

function remoteDisplayName(id) {
  const i = remoteDisplays.findIndex((d) => d.id === id);
  if (i < 0) return "";
  const m = /^Display \d+/.exec(remoteDisplays[i].label || "");
  return m ? m[0] : `Display ${i + 1}`;
}

function setScreenStatus(text, noVideo) {
  screenHasVideo = !noVideo;
  screenStatusText = text;
  if (screenEmptyTextEl && noVideo) screenEmptyTextEl.textContent = text;
  if (screenStatusEl) screenStatusEl.textContent = noVideo ? "Speaker's screen" : text;
  if (screenViewEl) screenViewEl.classList.toggle("no-video", !!noVideo);
  syncScreenViewer();
}

function describeScreen() {
  if (!screenVideoEl) return;
  const w = screenVideoEl.videoWidth, h = screenVideoEl.videoHeight;
  const name = (remoteDisplays.length > 1 && remoteDisplayName(remoteDisplay)) || "Speaker's screen";
  setScreenStatus(w ? `${name} · ${w}×${h}` : name, false);
}

let screenTrackId = null;
function attachScreenTrack(track) {
  if (!screenVideoEl || !track) return;
  if (track.id === screenTrackId && screenVideoEl.srcObject) return; // the same track, told twice
  screenTrackId = track.id;
  screenVideoEl.srcObject = new MediaStream([track]);
  const p = screenVideoEl.play();
  if (p && p.catch) p.catch(() => {});
  screenVideoEl.onloadedmetadata = describeScreen;
  screenVideoEl.onresize = describeScreen;
  track.onended = () => clearScreenView("The speaker stopped sharing the screen.");
  track.onmute = () => { if (screenShareOn === false) clearScreenView("The speaker stopped sharing the screen."); };
  track.onunmute = describeScreen;
  screenShareOn = true;
  describeScreen();
  log("Supporter: receiving the speaker's screen", "info");
}

function clearScreenView(text) {
  if (screenVideoEl) { try { screenVideoEl.srcObject = null; } catch {} }
  screenTrackId = null;
  setScreenStatus(text || "No screen.", true);
}

function onScreenShareState(on, msg) {
  screenShareOn = on;
  if (msg && Array.isArray(msg.displays)) {
    remoteDisplays = msg.displays.filter((d) => d && d.id).map((d) => ({ id: String(d.id), label: String(d.label || "") }));
    remoteDisplay = String(msg.display || "");
    renderScreenDisplays();
  }
  if (!on) clearScreenView("The speaker is not sharing the screen.");
  else if (!(screenVideoEl && screenVideoEl.srcObject)) setScreenStatus("Waiting for the speaker's screen…", true);
  else describeScreen();
}

// One picture card per display of the speaker's (none with one display).
function renderDisplayButtons(container) {
  if (!container) return;
  container.hidden = remoteDisplays.length < 2;
  renderDisplayCards(container, remoteDisplays.map((d) => ({ id: d.id, label: d.label, src: remoteThumbs[d.id] })), remoteDisplay, pickRemoteDisplay);
}
function renderScreenDisplays() {
  renderDisplayButtons(screenDisplaysEl);
  syncScreenViewer();
  syncThumbPolling();
}
// The pictures come from the speaker, every few seconds while a picker is on
// screen (the preview shown, or the pop-out window open).
let thumbTimer = null;
function requestRemoteThumbs() {
  try { window.api.sendSignaling({ type: "screen-thumbs-request" }); } catch {}
}
function syncThumbPolling() {
  const shown = !!(screenViewEl && !screenViewEl.classList.contains("collapsed")) || viewerIsOpen();
  const want = document.body.classList.contains("role-supporter") && remoteDisplays.length >= 2 && shown;
  if (want && !thumbTimer) { requestRemoteThumbs(); thumbTimer = setInterval(requestRemoteThumbs, 4000); }
  else if (!want && thumbTimer) { clearInterval(thumbTimer); thumbTimer = null; }
}
function onRemoteThumbs(list) {
  if (!Array.isArray(list)) return;
  remoteThumbs = Object.fromEntries(list.filter((t) => t && t.id && /^data:image\//.test(t.src || "")).map((t) => [String(t.id), t.src]));
  renderDisplayButtons(screenDisplaysEl);
  syncScreenViewer();
}
function pickRemoteDisplay(id) {
  if (!id || id === remoteDisplay) return;
  window.api.sendSignaling({ type: "screen-select", display: id });
  remoteDisplay = id; // the speaker confirms with a "screen" message
  renderScreenDisplays();
  if (screenHasVideo) describeScreen();
}

if (screenToggleBtn) screenToggleBtn.addEventListener("click", () => {
  if (!screenViewEl) return;
  const collapsed = screenViewEl.classList.toggle("collapsed");
  screenToggleBtn.innerHTML = aceIcon(collapsed ? "chevron-down" : "chevron-up");
  screenToggleBtn.title = collapsed ? "Show the picture" : "Hide the picture";
  syncThumbPolling();
});
if (screenPopBtn) screenPopBtn.addEventListener("click", () => openScreenViewer());
if (screenStageEl) screenStageEl.addEventListener("dblclick", () => openScreenViewer());

// ── The pop-out window ──
// Opened with window.open, so it runs in this page's process and plays the
// same MediaStream; main.js gives it a normal title bar and remembers where
// it was. Built from here: it has no script of its own.
let screenViewer = null;
const VIEWER_CSS = `
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0b0d12; color: #e6e8ee; overflow: hidden;
    font: 13px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif; }
  body { display: flex; flex-direction: column; }
  .bar { flex: none; height: 50px; display: flex; align-items: center; gap: 10px; padding: 0 10px 0 14px;
    background: #12151c; border-bottom: 1px solid #232835; user-select: none; }
  .live { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.18); flex: none; }
  .live.off { background: #6b7280; box-shadow: none; }
  .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .grow { flex: 1; }
  .group { display: inline-flex; align-items: center; gap: 8px; }
  .lbl { color: #8b93a7; font-size: 12px; }
  .seg { display: inline-flex; padding: 2px; gap: 2px; background: #1b1f29; border: 1px solid #2a3040; border-radius: 8px; }
  .seg button { font: inherit; font-size: 12px; font-weight: 600; min-width: 30px; height: 26px; padding: 0 10px;
    border: 0; border-radius: 6px; background: transparent; color: #aab2c5; cursor: pointer; }
  .seg button:hover { background: #262c3a; color: #fff; }
  .seg button.active { background: #7c6cff; color: #fff; }
  .cards { display: inline-flex; gap: 6px; }
  .disp-card { position: relative; display: block; padding: 0; border: 0; background: none; cursor: pointer; }
  .disp-thumb { position: relative; display: block; width: 62px; height: 35px; border-radius: 5px; overflow: hidden;
    background: #1b1f29; outline: 1px solid #2a3040; }
  .disp-card:hover .disp-thumb { outline-color: #59607a; }
  .disp-card.active .disp-thumb { outline: 2px solid #7c6cff; }
  .disp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .disp-num { position: absolute; left: 3px; bottom: 2px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 4px;
    background: rgba(0,0,0,.72); color: #fff; font-size: 10px; font-weight: 700; line-height: 15px; text-align: center; }
  .disp-on, .disp-cap { display: none; }
  .icon { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #2a3040;
    border-radius: 8px; background: #1b1f29; color: #d5d9e3; cursor: pointer; padding: 0; }
  .icon:hover { background: #262c3a; color: #fff; }
  .icon svg { width: 16px; height: 16px; }
  .ico { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .stage { position: relative; flex: 1; min-height: 0; background: #000; }
  .stage.fit video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  .stage.actual { overflow: auto; display: grid; place-items: center; }
  .stage.actual video { display: block; max-width: none; }
  .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center;
    padding: 24px; color: #8b93a7; font-size: 14px; }
  :fullscreen .bar { display: none; }
`;
function viewerIsOpen() {
  if (screenViewer && screenViewer.closed) screenViewer = null;
  return !!screenViewer;
}
function openScreenViewer() {
  if (viewerIsOpen()) { try { screenViewer.focus(); } catch {} return; }
  let w = null;
  try { w = window.open("about:blank", "aceScreenViewer"); } catch {}
  if (!w) { toast("The screen window could not be opened.", "err"); return; }
  screenViewer = w;
  const d = w.document;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Speaker's screen — Ace</title><style>${VIEWER_CSS}</style></head><body>
<header class="bar">
  <span class="live" id="live"></span><span class="title" id="title">Speaker's screen</span><span class="grow"></span>
  <span class="group" id="dispGroup" hidden><span class="lbl">Display</span><span class="cards" id="disps"></span></span>
  <span class="seg" id="zoom"><button type="button" data-z="fit" class="active" title="Fit the picture to the window">Fit</button><button type="button" data-z="actual" title="Actual size: one screen pixel per pixel (scroll to move around)">100%</button></span>
  <button type="button" class="icon" id="full" title="Full screen (F11 or double-click; Esc to leave)">${aceIcon("maximize")}</button>
</header>
<main class="stage fit" id="stage"><video id="v" autoplay muted playsinline></video><div class="empty" id="empty"></div></main>
</body></html>`);
  d.close();

  const stage = d.getElementById("stage");
  const v = d.getElementById("v");
  const sizeActual = () => {
    if (!stage.classList.contains("actual") || !v.videoWidth) { v.style.width = ""; return; }
    v.style.width = `${v.videoWidth / (w.devicePixelRatio || 1)}px`;
  };
  d.getElementById("zoom").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-z]");
    if (!b) return;
    d.querySelectorAll("#zoom button").forEach((x) => x.classList.toggle("active", x === b));
    stage.classList.toggle("fit", b.dataset.z === "fit");
    stage.classList.toggle("actual", b.dataset.z === "actual");
    sizeActual();
  });
  v.addEventListener("resize", sizeActual);
  const toggleFull = () => {
    if (d.fullscreenElement) d.exitFullscreen().catch(() => {});
    else d.documentElement.requestFullscreen().catch(() => {});
  };
  d.getElementById("full").addEventListener("click", toggleFull);
  stage.addEventListener("dblclick", toggleFull);
  d.addEventListener("keydown", (e) => { if (e.key === "F11") { e.preventDefault(); toggleFull(); } });
  w.addEventListener("pagehide", () => { if (screenViewer === w) screenViewer = null; setTimeout(syncThumbPolling, 0); });
  syncScreenViewer();
  syncThumbPolling();
  try { w.focus(); } catch {}
}
function syncScreenViewer() {
  if (!viewerIsOpen()) return;
  const d = screenViewer.document;
  const v = d.getElementById("v");
  if (!v) return;
  const src = (screenVideoEl && screenVideoEl.srcObject) || null;
  if (v.srcObject !== src) {
    v.srcObject = src;
    if (src) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  }
  const title = screenHasVideo ? screenStatusText : "Speaker's screen";
  d.getElementById("title").textContent = title;
  d.title = `${title} — Ace`;
  d.getElementById("live").classList.toggle("off", !screenHasVideo);
  const empty = d.getElementById("empty");
  empty.textContent = screenStatusText;
  empty.hidden = screenHasVideo;
  renderDisplayButtons(d.getElementById("disps"));
  d.getElementById("dispGroup").hidden = remoteDisplays.length < 2;
}
function closeScreenViewer() {
  if (viewerIsOpen()) { try { screenViewer.close(); } catch {} }
  screenViewer = null;
}
window.addEventListener("beforeunload", closeScreenViewer);

// ── Supporter mode ──────────────────────────────────────────────────────────
// The welcome screen's "Join as supporter" opens the join screen (the IP
// address from the speaker's headset panel). Once let in, the window shows the
// notes chat with the mic and volume controls; End leaves. On the speaker's
// side the headset button in the title bar shows the IP address.
const joinOverlayEl = document.getElementById("joinOverlay");
const joinAddressEl = document.getElementById("joinAddress");
const joinStatusEl = document.getElementById("joinStatus");
const joinConnectBtn = document.getElementById("joinConnectBtn");
const supporterBarDot = document.getElementById("supporterBarDot");
const supporterBarText = document.getElementById("supporterBarText");
const supporterVolumeEl = document.getElementById("supporterVolume");
let joinPending = null;      // { address, timer } while waiting to be let in
let supporterAddress = "";   // the speaker's IP address, for display

// The supporter types only the speaker's IP address; the port is always the
// default (main adds it). A pasted "ip:port" keeps just the IP.
const ipOnly = (a) => String(a || "").trim().replace(/:\d*$/, "");
function isIpv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  return !!m && m.slice(1).every((n) => parseInt(n, 10) <= 255);
}
if (joinAddressEl)
  joinAddressEl.addEventListener("input", () => {
    const v = joinAddressEl.value;
    const clean = v.replace(/:.*$/, "").replace(/[^\d.]/g, "");
    if (clean !== v) joinAddressEl.value = clean;
  });

// Supporter mode on screen (the join screen, or the supporter's window): Ace
// is then an ordinary window that takes focus, so its fields are typed into
// the normal way (main.js, supporterUiActive). Read from the page itself, so
// every way in and out of supporter mode is covered.
let supporterUiOn = false;
let supporterUiTimer = null;
function syncSupporterUi() {
  supporterUiTimer = null;
  const on = !!(joinOverlayEl && !joinOverlayEl.hidden) || document.body.classList.contains("role-supporter");
  if (on === supporterUiOn) return;
  supporterUiOn = on;
  if (window.api.setSupporterUi) window.api.setSupporterUi(on).catch(() => {});
}
const supporterUiObserver = new MutationObserver(() => {
  if (!supporterUiTimer) supporterUiTimer = setTimeout(syncSupporterUi, 0);
});
if (joinOverlayEl) supporterUiObserver.observe(joinOverlayEl, { attributes: true, attributeFilter: ["hidden"] });
supporterUiObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

const JOIN_REASONS = {
  capacity: "Someone else is already supporting this call.",
  ended: "Their session ended.",
  refused: "They refused the connection.",
};
function joinReasonText(reason, address) {
  if (reason === "unreachable")
    return `Can't reach ${address || "that address"}. Check the address, that both computers are on the same network, and that their call is started in Ace.`;
  return JOIN_REASONS[reason] || JOIN_REASONS.refused;
}

function setJoinStatus(text, kind) {
  if (!joinStatusEl) return;
  joinStatusEl.textContent = text || "";
  joinStatusEl.className = "join-status" + (kind ? " " + kind : "");
}

function showJoin(message) {
  leaveInterviewUi();
  if (joinOverlayEl) joinOverlayEl.hidden = false;
  if (joinAddressEl && !joinAddressEl.value) {
    const saved = ipOnly(netCfg && netCfg.supporterAddress);
    if (saved && saved !== "172.16.98.11") joinAddressEl.value = saved;
  }
  if (joinConnectBtn) joinConnectBtn.disabled = false;
  setJoinStatus(message || "", message ? "err" : "");
  setTimeout(() => { try { joinAddressEl && joinAddressEl.focus(); } catch {} }, 50);
}

function clearJoinPending() {
  if (joinPending && joinPending.timer) clearTimeout(joinPending.timer);
  joinPending = null;
  if (joinConnectBtn) joinConnectBtn.disabled = false;
}

async function startJoin() {
  if (joinPending) return;
  const address = ipOnly(joinAddressEl && joinAddressEl.value);
  if (!address) { setJoinStatus("Enter their IP address.", "err"); joinAddressEl && joinAddressEl.focus(); return; }
  if (!isIpv4(address)) { setJoinStatus("Enter their IP address, for example 192.168.1.20.", "err"); joinAddressEl && joinAddressEl.focus(); return; }
  netCfg = { ...(netCfg || {}), role: "supporter" };
  teardownPeers();
  const r = await window.api.joinAsSupporter({ address }).catch((e) => ({ ok: false, error: e.message }));
  if (!r || !r.ok) { setJoinStatus((r && r.error) || "Could not connect.", "err"); return; }
  supporterAddress = address;
  if (joinConnectBtn) joinConnectBtn.disabled = true;
  setJoinStatus(`Connecting to ${address}…`, "busy");
  joinPending = {
    address,
    timer: setTimeout(async () => {
      if (!joinPending) return;
      clearJoinPending();
      await window.api.leaveSupporter().catch(() => {});
      setJoinStatus(joinReasonText("unreachable", address), "err");
    }, 15000),
  };
  try { netCfg = await window.api.getNetworkConfig(); } catch {}
}

// The speaker let us in: switch to the supporter screen.
function supporterAdmittedUi() {
  if (!netCfg || netCfg.role !== "supporter") return;
  const wasJoining = !!joinPending;
  clearJoinPending();
  if (wasJoining || !document.body.classList.contains("role-supporter")) enterSupporterView();
  setSupporterBar(true);
}

function enterSupporterView() {
  hideAllSetupOverlays();
  if (settingsOverlay) settingsOverlay.hidden = true;
  document.body.classList.add("in-interview");
  endBtn.classList.add("live");
  endBtn.title = "Leave — back to the start screen";
  applyRoleClass("supporter");
  if (answerMain) answerMain.hidden = false;
  clearMirroredTurns();
  document.body.classList.add("side-pane-open");
  if (window.api.setSidePane) window.api.setSidePane(true, 300);
  supporterComposerUi(true);
  setSupporterSound(supporterSoundMuted);
  chatClearAll();
  chatSetStatus("");
  const v = Math.round(((netCfg && netCfg.incomingVolume != null) ? netCfg.incomingVolume : 1) * 100);
  if (supporterVolumeEl) supporterVolumeEl.value = v;
  updateSupporterMicButtons(currentMicMode);
  updateMicModeBanner(currentMicMode);
  screenShareOn = null;
  remoteDisplays = [];
  remoteDisplay = "";
  remoteThumbs = {};
  renderScreenDisplays();
  setScreenStatus("Waiting for the speaker's screen…", true);
  setTimeout(() => { try { composerInput && composerInput.focus(); } catch {} }, 50);
  log(`Supporting ${supporterAddress}`, "info");
}

function setSupporterBar(connected) {
  if (supporterBarDot) supporterBarDot.classList.toggle("on", !!connected);
  if (supporterBarText)
    supporterBarText.textContent = connected
      ? `Connected to ${supporterAddress || "the speaker"}`
      : "Connection lost. Reconnecting…";
}

async function leaveSupporterView(message) {
  clearJoinPending();
  await window.api.leaveSupporter().catch(() => {});
  teardownPeers();
  clearScreenView("No screen.");
  closeScreenViewer();
  remoteDisplays = [];
  syncThumbPolling();
  try { netCfg = await window.api.getNetworkConfig(); } catch {}
  endBtn.title = "End session — back to the start screen";
  chatClearAll();
  clearMirroredTurns();
  supporterComposerUi(false);
  closeSidePane();
  if (message) showJoin(message);
  else showModeSelect();
}

// Dropped, refused or ended while on the supporter screen: back to joining.
function supporterLostConnection(message) {
  if (!document.body.classList.contains("role-supporter")) return;
  leaveSupporterView(message);
}

function updateSupporterMicButtons(mode) {
  document.querySelectorAll(".supporter-mic-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mic === mode);
  });
}

if (window.api.onJoinRejected)
  window.api.onJoinRejected((info) => {
    const reason = (info && info.reason) || "refused";
    log("Supporter connection refused: " + reason, "err");
    if (joinPending) {
      const addr = joinPending.address;
      clearJoinPending();
      window.api.leaveSupporter().catch(() => {});
      setJoinStatus(joinReasonText(reason, addr), "err");
      return;
    }
    supporterLostConnection(joinReasonText(reason, supporterAddress));
  });

window.api.onNetworkStatus((status) => {
  if (!status) return;
  if (document.body.classList.contains("role-supporter") && status.role === "supporter") setSupporterBar(!!status.connected);
  refreshSupporterInvite(status);
});

document.querySelectorAll(".supporter-mic-btn").forEach((b) => {
  b.addEventListener("click", () => {
    if (window.api.setMicMode) window.api.setMicMode(b.dataset.mic);
  });
});
if (supporterVolumeEl)
  supporterVolumeEl.addEventListener("input", () => {
    const v = Math.min(100, parseInt(supporterVolumeEl.value, 10) || 0) / 100;
    applyIncomingVolume(v);
    persistNet({ incomingVolume: v });
  });

const modeSupporterBtn = document.getElementById("modeSupporterBtn");
if (modeSupporterBtn) modeSupporterBtn.addEventListener("click", () => showJoin());
const joinBackBtn = document.getElementById("joinBackBtn");
if (joinBackBtn)
  joinBackBtn.addEventListener("click", async () => {
    if (joinPending) { clearJoinPending(); await window.api.leaveSupporter().catch(() => {}); }
    setJoinStatus("");
    showModeSelect();
  });
const joinSettingsBtn = document.getElementById("joinSettingsBtn");
if (joinSettingsBtn) joinSettingsBtn.addEventListener("click", () => openSettings());
if (joinConnectBtn) joinConnectBtn.addEventListener("click", () => startJoin());
if (joinAddressEl)
  joinAddressEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); startJoin(); } });

// Speaker: the headset button and its panel.
const supporterInviteBtn = document.getElementById("supporterInviteBtn");
const supporterPanel = document.getElementById("supporterPanel");
const supporterPanelAddr = document.getElementById("supporterPanelAddr");
const supporterPanelStatus = document.getElementById("supporterPanelStatus");
const supporterPanelKick = document.getElementById("supporterPanelKick");
const supporterPanelOther = document.getElementById("supporterPanelOther");

async function refreshSupporterInvite(status) {
  if (!window.api.getSupporterInvite) return;
  let inv;
  try { inv = await window.api.getSupporterInvite(); } catch { return; }
  const sup = (inv.supporters || [])[0];
  if (supporterInviteBtn) supporterInviteBtn.classList.toggle("connected", !!sup);
  if (!supporterPanel || supporterPanel.hidden) return;
  // The real network address first; VPN and virtual adapters are listed
  // below it, for a supporter who is on the same VPN. Only the IP: the
  // supporter's Ace always uses the default port.
  const all = (inv.addresses || []).map((a) => a.address);
  if (supporterPanelAddr) supporterPanelAddr.textContent = inv.hosting ? (all[0] || "No network found") : "—";
  if (supporterPanelOther) {
    supporterPanelOther.hidden = !inv.hosting || all.length < 2;
    supporterPanelOther.textContent = all.length > 1 ? "Other addresses of this computer (VPN, virtual): " + all.slice(1).join(", ") : "";
  }
  if (supporterPanelStatus) {
    supporterPanelStatus.className = "supporter-panel-status" + (sup ? " connected" : "");
    supporterPanelStatus.textContent = !inv.hosting
      ? "Not open to supporters right now. Start a session first."
      : sup ? `Connected: ${sup.ip || "a supporter"}` : "Waiting for a supporter…";
  }
  if (supporterPanelKick) {
    supporterPanelKick.hidden = !sup;
    supporterPanelKick.dataset.id = sup ? sup.id : "";
  }
}
if (supporterInviteBtn)
  supporterInviteBtn.addEventListener("click", () => {
    if (!supporterPanel) return;
    supporterPanel.hidden = !supporterPanel.hidden;
    refreshSupporterInvite();
  });
const supporterPanelClose = document.getElementById("supporterPanelClose");
if (supporterPanelClose) supporterPanelClose.addEventListener("click", () => { if (supporterPanel) supporterPanel.hidden = true; });
if (supporterPanelKick)
  supporterPanelKick.addEventListener("click", async () => {
    const id = supporterPanelKick.dataset.id;
    if (id) await window.api.kickSupporter(id);
    refreshSupporterInvite();
  });

// ── Supporter mode: their answer panel, live ───────────────────────────────
// Speaker side: every change in the answer panel (a transcript bubble growing,
// an answer streaming in) is sent as the changed bubble's HTML, at most every
// 16 ms, plus the whole panel when a supporter is let in. The supporter shows
// the bubbles as they are; it runs nothing of its own.
var mirrorState = { active: false, ids: new WeakMap(), next: 1, dirty: new Set(), removed: [], timer: null, observer: null };
function mirrorIdOf(el) {
  let id = mirrorState.ids.get(el);
  if (!id) { id = "m" + mirrorState.next++; mirrorState.ids.set(el, id); }
  return id;
}
function isMirrorTurn(el) {
  return !!el && el.nodeType === 1 && el.parentElement === answerHistory &&
    (el.classList.contains("meet-turn") || el.classList.contains("answer-turn"));
}
function topTurnOf(node) {
  let n = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (n && n.parentElement !== answerHistory) n = n.parentElement;
  return n;
}
function prevTurnId(el) {
  let p = el.previousElementSibling;
  while (p && !isMirrorTurn(p)) p = p.previousElementSibling;
  return p ? mirrorIdOf(p) : null;
}
function mirrorFlush() {
  mirrorState.timer = null;
  if (!mirrorState.active) { mirrorState.dirty.clear(); mirrorState.removed = []; return; }
  const ops = mirrorState.removed.map((id) => ({ op: "remove", id }));
  mirrorState.removed = [];
  const dirty = [...mirrorState.dirty].filter(isMirrorTurn);
  mirrorState.dirty.clear();
  dirty.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const el of dirty) ops.push({ op: "upsert", id: mirrorIdOf(el), after: prevTurnId(el), html: el.outerHTML });
  if (ops.length) window.api.mirrorOut({ ops });
}
function mirrorSnapshot() {
  const ops = [];
  answerHistory.querySelectorAll(":scope > .meet-turn, :scope > .answer-turn").forEach((el) =>
    ops.push({ op: "upsert", id: mirrorIdOf(el), after: prevTurnId(el), html: el.outerHTML }));
  window.api.mirrorOut({ reset: true, mode: manualMode, ops });
}
function mirrorStart() {
  if (!answerHistory || !window.api.mirrorOut) return;
  mirrorState.active = true;
  if (!mirrorState.observer) {
    mirrorState.observer = new MutationObserver((records) => {
      if (!mirrorState.active) return;
      for (const r of records) {
        if (r.type === "childList" && r.target === answerHistory) {
          r.removedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            mirrorState.dirty.delete(n);
            if (mirrorState.ids.has(n)) mirrorState.removed.push(mirrorState.ids.get(n));
          });
          r.addedNodes.forEach((n) => { if (n.nodeType === 1) mirrorState.dirty.add(n); });
          continue;
        }
        const top = topTurnOf(r.target);
        if (top) mirrorState.dirty.add(top);
      }
      if (!mirrorState.timer) mirrorState.timer = setTimeout(mirrorFlush, 16);
    });
    mirrorState.observer.observe(answerHistory, { childList: true, subtree: true, characterData: true, attributes: true });
  }
  mirrorSnapshot();
}
function mirrorStop() {
  mirrorState.active = false;
  if (mirrorState.observer) { mirrorState.observer.disconnect(); mirrorState.observer = null; }
  if (mirrorState.timer) { clearTimeout(mirrorState.timer); mirrorState.timer = null; }
  mirrorState.dirty.clear();
  mirrorState.removed = [];
}

// Speaker side: the supporter pressed "Send to the AI".
if (window.api.onRemoteSubmit)
  window.api.onRemoteSubmit((req) => {
    const connId = req && req.connId;
    let ok = false, reason = "";
    if (!document.body.classList.contains("in-interview") || document.body.classList.contains("role-supporter")) {
      reason = "not-in-call";
    } else {
      const mode = req && req.mode;
      if (["ANSWER", "CODE", "DIAGRAM", "PROJECT"].includes(mode) && mode !== manualMode) setManualMode(mode);
      const before = currentAnswerEl;
      submitComposer();
      ok = !!currentAnswerEl && currentAnswerEl !== before;
      if (ok) toast("Your supporter asked the AI.", "info");
      else reason = "nothing";
    }
    window.api.remoteSubmitResult({ connId, ok, reason });
  });

// Supporter side: show their bubbles. The HTML comes from the speaker's own
// panel; scripts, event attributes and javascript: links are dropped anyway.
const mirroredEls = new Map();
function sanitizeMirrorHtml(html) {
  const t = document.createElement("template");
  t.innerHTML = String(html || "");
  t.content.querySelectorAll("script, iframe, object, embed, link, meta, base, form").forEach((n) => n.remove());
  t.content.querySelectorAll("*").forEach((n) => {
    for (const a of Array.from(n.attributes)) {
      const name = a.name.toLowerCase();
      if (name.startsWith("on")) n.removeAttribute(a.name);
      else if (/^(href|src|xlink:href|action|formaction)$/.test(name) && /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    }
  });
  return t.content.firstElementChild;
}
function clearMirroredTurns() {
  mirroredEls.clear();
  if (!answerHistory) return;
  answerHistory.querySelectorAll(":scope > .meet-turn, :scope > .answer-turn").forEach((n) => n.remove());
  if (answerEmpty) answerEmpty.hidden = false;
}
function lastTurnEl() {
  const all = answerHistory.querySelectorAll(":scope > .meet-turn, :scope > .answer-turn");
  return all.length ? all[all.length - 1] : null;
}
function applyMirror(msg) {
  if (!answerHistory || !msg || !document.body.classList.contains("role-supporter")) return;
  ensureSpacer();
  if (msg.mode && ["ANSWER", "CODE", "DIAGRAM", "PROJECT"].includes(msg.mode) && msg.mode !== manualMode) setManualMode(msg.mode);
  if (msg.reset) clearMirroredTurns();
  let newAnswer = null, meetTouched = null;
  for (const op of msg.ops || []) {
    if (op.op === "remove") {
      const el = mirroredEls.get(op.id);
      if (el) el.remove();
      mirroredEls.delete(op.id);
      continue;
    }
    if (op.op !== "upsert") continue;
    const el = sanitizeMirrorHtml(op.html);
    if (!el) continue;
    el.dataset.mid = op.id;
    const old = mirroredEls.get(op.id);
    if (old && old.parentElement === answerHistory) {
      old.replaceWith(el);
    } else {
      const after = op.after ? mirroredEls.get(op.after) : null;
      if (after && after.parentElement === answerHistory) after.after(el);
      else if (!op.after) {
        const first = answerHistory.querySelector(":scope > .meet-turn, :scope > .answer-turn");
        answerHistory.insertBefore(el, first || answerSpacer);
      } else answerHistory.insertBefore(el, answerSpacer);
      if (!msg.reset && el.classList.contains("answer-turn")) newAnswer = el;
    }
    mirroredEls.set(op.id, el);
    if (el.classList.contains("meet-turn")) meetTouched = el;
  }
  if (answerEmpty) answerEmpty.hidden = !!answerHistory.querySelector(".answer-turn, .meet-turn");
  if (msg.reset) {
    const last = lastTurnEl();
    if (last) try { last.scrollIntoView({ block: "end" }); } catch {}
    return;
  }
  // The same scrolling as on their screen: a new answer opens at its start,
  // the live transcript keeps its newest words in view.
  if (newAnswer) {
    const cRect = answerHistory.getBoundingClientRect();
    const a = newAnswer.querySelector(".answer-a") || newAnswer;
    const top = answerHistory.scrollTop + (a.getBoundingClientRect().top - cRect.top);
    answerHistory.scrollTop = Math.max(0, top - 72);
  } else if (meetTouched && meetTouched === lastTurnEl()) {
    revealMeetBubble(meetTouched);
  }
}
if (window.api.onMirrorIn) window.api.onMirrorIn((msg) => applyMirror(msg));

// Supporter side: the two send buttons.
async function supporterAskAI() {
  const sent = await window.api.remoteSubmit(manualMode).catch(() => false);
  if (!sent) toast("Not connected to them.", "err");
}
async function supporterSendChat() {
  const text = composerInput ? composerInput.value.trim() : "";
  const imgs = typeof attachedImages !== "undefined" ? attachedImages.slice() : [];
  if (!text && !imgs.length) return;
  if (composerInput) composerInput.value = "";
  if (imgs.length) clearAttachedImages();
  if (text) {
    const ok = await window.api.sendChatText(text).catch(() => false);
    chatAddText(text, ok);
  }
  for (const im of imgs) {
    const url = `data:${im.mime || "image/png"};base64,${im.base64}`;
    const ok = await window.api.sendChatImage(url).catch(() => false);
    chatAddImage(url, ok);
  }
}
if (window.api.onRemoteSubmitResult)
  window.api.onRemoteSubmitResult((r) => {
    if (!r || r.ok) return;
    toast(r.reason === "nothing"
      ? "Nothing to answer yet. Wait until they hear a question."
      : "Their Ace is not in a call right now.", "warn");
  });
const supporterChatBtn = document.getElementById("supporterChatBtn");
if (supporterChatBtn) supporterChatBtn.addEventListener("click", (e) => { e.preventDefault(); supporterSendChat(); });
if (composerInput)
  composerInput.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("role-supporter")) return;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      e.preventDefault();
      supporterSendChat();
    }
  });
const chatClearBtn = document.getElementById("chatClearBtn");
if (chatClearBtn) chatClearBtn.addEventListener("click", () => { if (window.api.clearSticky) window.api.clearSticky(); chatClearAll(); });

let composerDefaults = null;
function supporterComposerUi(on) {
  if (!composerInput || !getAnswerBtn) return;
  if (!composerDefaults) composerDefaults = { title: getAnswerBtn.title, html: getAnswerBtn.innerHTML };
  if (on) {
    composerInput.placeholder = "Message to them… (Enter)";
    getAnswerBtn.title = "Send the current transcript to the AI on their computer (Ctrl+Enter)";
    getAnswerBtn.textContent = "AI";
    getAnswerBtn.disabled = false;
  } else {
    getAnswerBtn.title = composerDefaults.title;
    getAnswerBtn.innerHTML = composerDefaults.html;
    // The interviewer's own hint (syncProjectMode keeps it while not a supporter).
    composerInput.placeholder = "Your question (from your knowledge base)…";
    syncSendEnabled();
  }
}

// ── The chat column ─────────────────────────────────────────────────────────
// Both sides: when a supporter joins, the window grows to the right by a
// "Private chat" column. The supporter types in the composer (Enter); the
// interviewer has a message box in the column, and can close the column.
// Runs from the start screen while the app is still loading, so it reads
// nothing declared further down (netCfg, chatMainEl).
function closeSidePane() {
  const was = document.body.classList.contains("side-pane-open");
  document.body.classList.remove("side-pane-open");
  const chat = document.getElementById("chatMain");
  if (chat && !document.body.classList.contains("role-supporter")) chat.hidden = true;
  if (was && window.api.setSidePane) window.api.setSidePane(false);
}
function openSpeakerChatPane(status) {
  if (!chatMainEl || document.body.classList.contains("role-supporter")) return;
  if (!document.body.classList.contains("in-interview")) return;
  chatMainEl.hidden = false;
  if (!document.body.classList.contains("side-pane-open")) {
    document.body.classList.add("side-pane-open");
    if (window.api.setSidePane) window.api.setSidePane(true, 300);
  }
  if (status) {
    chatSetStatus(status);
    // The column's header now says who is connected.
    const panel = document.getElementById("supporterPanel");
    if (panel) panel.hidden = true;
  }
}
if (window.api.onSupporterChatIn)
  window.api.onSupporterChatIn((m) => {
    if (!m) return;
    openSpeakerChatPane();
    if (m.type === "chat-text") chatAddText(m.text || "", true, false, m.ts);
    else if (m.type === "chat-image") chatAddImage(m.dataUrl || "", true, false, m.ts);
  });
const chatPaneCloseBtn = document.getElementById("chatPaneClose");
if (chatPaneCloseBtn) chatPaneCloseBtn.addEventListener("click", () => closeSidePane());
// A new session starts with an empty chat.
const _hideSetupForChat = hideSetup;
hideSetup = function () { chatClearAll(); return _hideSetupForChat.apply(this, arguments); };

// Supporter: mute or unmute the call sound.
var supporterSoundMuted = false;
const supporterSoundBtn = document.getElementById("supporterSoundBtn");
function setSupporterSound(muted) {
  supporterSoundMuted = !!muted;
  if (remoteAudioEl) remoteAudioEl.muted = supporterSoundMuted;
  if (supporterSoundBtn) {
    supporterSoundBtn.classList.toggle("muted", supporterSoundMuted);
    supporterSoundBtn.title = supporterSoundMuted ? "Unmute the call" : "Mute the call";
  }
}
if (supporterSoundBtn) supporterSoundBtn.addEventListener("click", () => setSupporterSound(!supporterSoundMuted));
