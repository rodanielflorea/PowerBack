const { contextBridge, ipcRenderer } = require('electron');

// Click tracing: tell the app about every press the page receives, so a press
// that never arrives can be noticed and explained (main.js, click-trace.log).
// pointerdown, not mousedown: it also fires on disabled controls.
window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  // at: when the press happened (the event's own time); late: how long the page
  // took to get to it — a busy page shows up here.
  const at = Math.round(performance.timeOrigin + e.timeStamp);
  try { ipcRenderer.send('click-trace-seen', { at, late: Date.now() - at }); } catch {}
}, true);
// No drags out of the page. Pressing on selected text, a link or a picture and
// moving a little starts a drag-and-drop; while one is in progress the page is
// sent no mouse or key input at all, and in this window (which never becomes
// the active one) the drag does not always end — the page then stays alive,
// keeps updating and obeys the hotkeys, but ignores every click. Nothing in the
// app is meant to be dragged out, so the drag is refused before it starts.
// (Files and pictures dropped INTO the app are not affected.)
window.addEventListener('dragstart', (e) => {
  e.preventDefault();
  let what = '?';
  try { const t = e.target; what = t && t.nodeType === 1 ? t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') : 'text'; } catch {}
  try { ipcRenderer.send('click-trace-note', 'drag refused (started on ' + what + ')'); } catch {}
}, true);
// What kept the page busy: every stretch of 400 ms or more in which it could
// not react, with the script and function that ran (long-animation-frame), or
// just the length when the browser gives no script (longtask).
(() => {
  const send = (text) => { try { ipcRenderer.send('click-trace-slow', String(text).slice(0, 1500)); } catch {} };
  const short = (u) => String(u || '').split(/[\\/]/).pop() || '?';
  try {
    new PerformanceObserver((list) => {
      for (const f of list.getEntries()) {
        if (f.duration < 400) continue;
        const scripts = (f.scripts || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 4).map((s) =>
          `${Math.round(s.duration)}ms ${s.invokerType || ''} ${s.invoker || ''} -> ${s.sourceFunctionName || '(anonymous)'} @ ${short(s.sourceURL)}:${s.sourceCharPosition}` +
          (s.forcedStyleAndLayoutDuration > 50 ? ` (forced layout ${Math.round(s.forcedStyleAndLayoutDuration)}ms)` : ''));
        const layout = f.styleAndLayoutStart ? Math.round(f.startTime + f.duration - f.styleAndLayoutStart) : 0;
        send(`frame blocked ${Math.round(f.duration)}ms (style+layout ${layout}ms); scripts: ${scripts.length ? scripts.join(' | ') : 'none (not page script: layout, paint, GC or the browser)'}`);
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const t of list.getEntries()) if (t.duration >= 1000) send(`long task ${Math.round(t.duration)}ms`);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
})();
// Heartbeat: proves the page's timers run and that it is still painting
// (frames counts requestAnimationFrame callbacks since the last beat). The app
// logs when beats stop (page frozen) or frames stop (black / stale picture).
(() => {
  let frames = 0;
  const tick = () => { frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setInterval(() => {
    try { ipcRenderer.send('click-trace-beat', { frames, hidden: document.hidden, nodes: document.getElementsByTagName('*').length }); } catch {}
    frames = 0;
  }, 2000);
  const report = (kind, text) => { try { ipcRenderer.send('click-trace-page-error', `${kind}: ${String(text).slice(0, 600)}`); } catch {} };
  window.addEventListener('error', (e) => report('error', `${e.message} @ ${e.filename || '?'}:${e.lineno || 0}`));
  window.addEventListener('unhandledrejection', (e) => report('unhandled rejection', (e.reason && (e.reason.stack || e.reason.message)) || e.reason));
})();

contextBridge.exposeInMainWorld('api', {
  setOpacity: (v) => ipcRenderer.invoke('set-opacity', v),
  getOpacity: () => ipcRenderer.invoke('get-opacity'),
  setStealth: (v) => ipcRenderer.invoke('set-stealth', v),
  getStealth: () => ipcRenderer.invoke('get-stealth'),
  setClickThrough: (v) => ipcRenderer.invoke('set-click-through', v),
  getClickThrough: () => ipcRenderer.invoke('get-click-through'),
  onClickThroughChanged: (cb) => ipcRenderer.on('click-through-changed', (_e, v) => cb(v)),
  clickThroughHover: (over) => ipcRenderer.invoke('click-through-hover', over),
  revealClickTrace: () => ipcRenderer.invoke('click-trace-reveal'),
  sendStickyText: (text) => ipcRenderer.invoke('sticky-send-text', text),
  sendStickyImage: (dataUrl) => ipcRenderer.invoke('sticky-send-image', dataUrl),
  sendStickyRich: (markdown) => ipcRenderer.invoke('sticky-send-rich', markdown),
  onChatIncoming: (cb) => ipcRenderer.on('chat-incoming', (_e, v) => cb(v)),
  onChatClear: (cb) => ipcRenderer.on('chat-clear', () => cb()),
  hide: () => ipcRenderer.invoke('hide'),
  quit: () => ipcRenderer.invoke('quit'),
  onScrollAnswer: (cb) => ipcRenderer.on('scroll-answer', (_e, v) => cb(v)),
  getTranscriptionConfig: () => ipcRenderer.invoke('get-transcription-config'),
  getBuiltinKeys: () => ipcRenderer.invoke('get-builtin-keys'),
  getAntiClose: () => ipcRenderer.invoke('get-anti-close'),
  getKeepFocus: () => ipcRenderer.invoke('get-keep-focus'),
  setKeepFocus: (v) => ipcRenderer.invoke('set-keep-focus', v),
  setSupporterUi: (on) => ipcRenderer.invoke('set-supporter-ui', !!on),
  setAntiClose: (v) => ipcRenderer.invoke('set-anti-close', v),
  setTranscriptionConfig: (cfg) => ipcRenderer.invoke('set-transcription-config', cfg),
  getMeetingConfig: () => ipcRenderer.invoke('get-meeting-config'),
  getVscodeConfig: () => ipcRenderer.invoke('get-vscode-config'),
  setVscodeConfig: (cfg) => ipcRenderer.invoke('set-vscode-config', cfg),
  getVscodeStatus: () => ipcRenderer.invoke('get-vscode-status'),
  onVscodeStatus: (cb) => ipcRenderer.on('vscode-status', (_e, v) => cb(v)),
  onVscodeEvent: (cb) => ipcRenderer.on('vscode-event', (_e, v) => cb(v)),
  setMeetingConfig: (cfg) => ipcRenderer.invoke('set-meeting-config', cfg),
  transcribe: (wav) => ipcRenderer.invoke('transcribe', wav),
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),
  getHotkeys: () => ipcRenderer.invoke('get-hotkeys'),
  setHotkey: (action, combo) => ipcRenderer.invoke('set-hotkey', action, combo),
  resetHotkey: (action) => ipcRenderer.invoke('reset-hotkey', action),
  resetAllHotkeys: () => ipcRenderer.invoke('reset-all-hotkeys'),
  onOpacityChanged: (cb) => ipcRenderer.on('opacity-changed', (_e, v) => cb(v)),
  onOpacityCss: (cb) => ipcRenderer.on('opacity-css', (_e, v) => cb(v)),
  getPlatformCaps: () => ipcRenderer.invoke('get-platform-caps'),
  getMicPermission: () => ipcRenderer.invoke('get-mic-permission'),
  runDiagnostics: () => ipcRenderer.invoke('run-diagnostics'),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  installLinuxTools: () => ipcRenderer.invoke('install-linux-tools'),
  macSystemAudioStart: () => ipcRenderer.invoke('mac-system-audio-start'),
  macSystemAudioStop: () => ipcRenderer.invoke('mac-system-audio-stop'),
  onMacSystemAudioChunk: (cb) => ipcRenderer.on('mac-system-audio-chunk', (_e, buf) => cb(buf)),
  onMacSystemAudioEnded: (cb) => ipcRenderer.on('mac-system-audio-ended', (_e, code) => cb(code)),
  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),
  onStealthChanged: (cb) => ipcRenderer.on('stealth-changed', (_e, v) => cb(v)),
  onCaptureError: (cb) => ipcRenderer.on('capture-error', (_e, v) => cb(v)),
  onHotkeysChanged: (cb) => ipcRenderer.on('hotkeys-changed', (_e, v) => cb(v)),
  onToggleRecording: (cb) => ipcRenderer.on('toggle-recording', () => cb()),
  onClearMeetBubble: (cb) => ipcRenderer.on('clear-meet-bubble', () => cb()),
  onTogglePtt: (cb) => ipcRenderer.on('toggle-ptt', () => cb()),
  onSelectorClosed: (cb) => ipcRenderer.on('selector-closed', () => cb()),
  getNetworkConfig: () => ipcRenderer.invoke('get-network-config'),
  setNetworkConfig: (cfg) => ipcRenderer.invoke('set-network-config', cfg),
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  startNetwork: () => ipcRenderer.invoke('start-network'),
  stopNetwork: () => ipcRenderer.invoke('stop-network'),
  configureFirewall: () => ipcRenderer.invoke('configure-firewall'),
  kickSupporter: (id) => ipcRenderer.invoke('kick-supporter', id),
  joinAsSupporter: (opts) => ipcRenderer.invoke('join-as-supporter', opts),
  leaveSupporter: () => ipcRenderer.invoke('leave-supporter'),
  getSupporterInvite: () => ipcRenderer.invoke('get-supporter-invite'),
  onJoinRejected: (cb) => ipcRenderer.on('join-rejected', (_e, v) => cb(v)),
  mirrorOut: (payload) => ipcRenderer.send('mirror-out', payload),
  onMirrorIn: (cb) => ipcRenderer.on('mirror-in', (_e, v) => cb(v)),
  remoteSubmit: (mode, text) => ipcRenderer.invoke('remote-submit', mode, text || ''),
  onRemoteSubmit: (cb) => ipcRenderer.on('remote-submit', (_e, v) => cb(v)),
  remoteSubmitResult: (r) => ipcRenderer.send('remote-submit-result', r),
  onRemoteSubmitResult: (cb) => ipcRenderer.on('remote-submit-result', (_e, v) => cb(v)),
  setSidePane: (open, width) => ipcRenderer.invoke('set-side-pane', open, width),
  speakerChatSend: (m) => ipcRenderer.invoke('speaker-chat-send', m),
  onSupporterChatIn: (cb) => ipcRenderer.on('supporter-chat-in', (_e, v) => cb(v)),
  logAppend: (line) => ipcRenderer.invoke('log-append', line),
  logRecent: () => ipcRenderer.invoke('log-recent'),
  logClear: () => ipcRenderer.invoke('log-clear'),
  logOpen: () => ipcRenderer.invoke('log-open'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdateNow: () => ipcRenderer.invoke('install-update-now'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onUpdaterStatus: (cb) => ipcRenderer.on('updater-status', (_e, v) => cb(v)),
  onUpdateOffer: (cb) => ipcRenderer.on('update-offer', (_e, v) => cb(v)),
  updateAnswer: (accept) => ipcRenderer.invoke('update-answer', !!accept),
  updateCancel: () => ipcRenderer.invoke('update-cancel'),
  sendSignaling: (msg) => ipcRenderer.send('signaling-out', msg),
  // Remote control (speaker side): the supporter asks, the speaker answers.
  onControlState: (cb) => ipcRenderer.on('control-state', (_e, v) => cb(v)),
  controlStop: () => ipcRenderer.invoke('control-stop'),
  // Supporter: the Alt+C hotkey — take or release control of the speaker's screen.
  onSupporterToggleControl: (cb) => ipcRenderer.on('supporter-toggle-control', () => cb()),
  onSignaling: (cb) => ipcRenderer.on('signaling-in', (_e, v) => cb(v)),
  onNetworkStatus: (cb) => ipcRenderer.on('network-status', (_e, v) => cb(v)),
  onNetworkError: (cb) => ipcRenderer.on('network-error', (_e, v) => cb(v)),
  openSticky: () => ipcRenderer.invoke('sticky-open'),
  // A code / diagram note of its own: { kind: 'code', code, lang } |
  // { kind: 'diagram', svg, w, h } | { kind: 'answer', html, mode, title }
  openNote: (content) => ipcRenderer.invoke('note-open', content),
  closeSticky: () => ipcRenderer.invoke('sticky-close'),
  clearSticky: () => ipcRenderer.invoke('sticky-clear'),
  injectTestChat: (text) => ipcRenderer.invoke('inject-test-chat', text),
  sendChatText: (text) => ipcRenderer.invoke('chat-send-text', text),
  sendChatImage: (dataUrl) => ipcRenderer.invoke('chat-send-image', dataUrl),
  onKickedBySpeaker: (cb) => ipcRenderer.on('kicked-by-speaker', () => cb()),
  onHelpRequestReceived: (cb) => ipcRenderer.on('help-request-received', (_e, v) => cb(v)),
  getMicMode: () => ipcRenderer.invoke('get-mic-mode'),
  setMicMode: (mode) => ipcRenderer.invoke('set-mic-mode', mode),
  cycleMicMode: () => ipcRenderer.invoke('cycle-mic-mode'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onMicModeChanged: (cb) => ipcRenderer.on('mic-mode-changed', (_e, v) => cb(v)),
  getWelcomeSeen: () => ipcRenderer.invoke('get-welcome-seen'),
  setWelcomeSeen: (v) => ipcRenderer.invoke('set-welcome-seen', v),
  generateAnswer: (question, images, forcedMode, extra) => ipcRenderer.invoke('generate-answer', { question, images, forcedMode, ...(extra || {}) }),
  stopAnswer: () => ipcRenderer.invoke('stop-answer'),
  clearAnswerMemory: () => ipcRenderer.invoke('clear-answer-memory'),
  sessionList: () => ipcRenderer.invoke('session-list'),
  sessionMeta: (id) => ipcRenderer.invoke('session-meta', id),
  sessionNew: (meta) => ipcRenderer.invoke('session-new', meta),
  sessionLoad: (id) => ipcRenderer.invoke('session-load', id),
  sessionResume: (id, meta) => ipcRenderer.invoke('session-resume', { id, ...(meta || {}) }),
  sessionRecordMeet: (payload) => ipcRenderer.invoke('session-record-meet', payload),
  sessionDelete: (id) => ipcRenderer.invoke('session-delete', id),
  sessionUpdateProfile: (id, profile) => ipcRenderer.invoke('session-update-profile', { id, profile }),
  getDefaultProfile: () => ipcRenderer.invoke('get-default-profile'),
  profilesList: () => ipcRenderer.invoke('profiles-list'),
  profileSaveNew: (label, profile) => ipcRenderer.invoke('profile-save-new', { label, profile }),
  profileUpdate: (id, label, profile) => ipcRenderer.invoke('profile-update', { id, label, profile }),
  profileDelete: (id) => ipcRenderer.invoke('profile-delete', id),
  profileSetActive: (id) => ipcRenderer.invoke('profile-set-active', id),
  kbClear: () => ipcRenderer.invoke('kb-clear'),
  sessionKbGet: (id) => ipcRenderer.invoke('session-kb-get', id),
  sessionKbAdd: (id, kind, name, data) => ipcRenderer.invoke('session-kb-add', { id, kind, name, data }),
  sessionKbRemove: (id, kind, index) => ipcRenderer.invoke('session-kb-remove', { id, kind, index }),
  infoOpen: (profile) => ipcRenderer.invoke('info-open', profile),
  infoClose: () => ipcRenderer.invoke('info-close'),
  getAnswerConfig: () => ipcRenderer.invoke('get-answer-config'),
  listXaiModels: () => ipcRenderer.invoke('list-answer-models'),
  listAnswerModels: () => ipcRenderer.invoke('list-answer-models'),
  kbAdd: (kind, name, data) => ipcRenderer.invoke('kb-add', { kind, name, data }),
  kbRemove: (kind, index) => ipcRenderer.invoke('kb-remove', { kind, index }),
  kbGet: () => ipcRenderer.invoke('kb-get'),
  setAnswerConfig: (cfg) => ipcRenderer.invoke('set-answer-config', cfg),
  onAnswerStart: (cb) => ipcRenderer.on('answer-start', (_e, v) => cb(v)),
  onAnswerChunk: (cb) => ipcRenderer.on('answer-chunk', (_e, v) => cb(v)),
  onAnswerDone: (cb) => ipcRenderer.on('answer-done', (_e, v) => cb(v)),
  onAnswerError: (cb) => ipcRenderer.on('answer-error', (_e, v) => cb(v)),
  onTriggerGetAnswer: (cb) => ipcRenderer.on('trigger-get-answer', () => cb()),
  onTriggerScreenshot: (cb) => ipcRenderer.on('trigger-screenshot', () => cb()),
  onSnipImage: (cb) => ipcRenderer.on('snip-image', (_e, v) => cb(v)),
  startAreaSnip: () => ipcRenderer.invoke('start-area-snip'),
  getAvoidPhrases: () => ipcRenderer.invoke('get-avoid-phrases'),
  setAvoidPhrases: (text) => ipcRenderer.invoke('set-avoid-phrases', text),
  writeToIde: (code, speedFactor) => ipcRenderer.invoke('write-to-ide', { code, speedFactor }),
  stopIdeTyping:   () => ipcRenderer.invoke('stop-ide-typing'),
  onIdeTypingState: (cb) => ipcRenderer.on('ide-typing-state', (_e, s) => cb(s)),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  showModelMenu: (anchor, mode) => ipcRenderer.invoke('show-model-menu', anchor, mode),
  onModelSelected: (cb) => ipcRenderer.on('model-selected', (_e, id) => cb(id)),
  onAnswerConfigChanged: (cb) => ipcRenderer.on('answer-config-changed', (_e, cfg) => cb(cfg)),
  startDeepgramStream: (cfg) => ipcRenderer.invoke('start-deepgram-stream', cfg),
  stopDeepgramStream: () => ipcRenderer.invoke('stop-deepgram-stream'),
  startXaiStream: (cfg) => ipcRenderer.invoke('start-xai-stream', cfg),
  stopXaiStream: () => ipcRenderer.invoke('stop-xai-stream'),
  sendAudioChunk: (buf) => ipcRenderer.send('audio-chunk', buf),
  networkOnline: () => ipcRenderer.send('network-online'),
  onTranscriptConnection: (cb) => ipcRenderer.on('transcript-connection', (_e, s) => cb(s)),
  extractJdInfo: () => ipcRenderer.invoke('extract-jd-info'),
  startMicDeepgramStream: (cfg) => ipcRenderer.invoke('start-mic-deepgram-stream', cfg),
  stopMicDeepgramStream: () => ipcRenderer.invoke('stop-mic-deepgram-stream'),
  sendMicAudioChunk: (buf) => ipcRenderer.send('mic-audio-chunk', buf),
  onTranscriptMic: (cb) => ipcRenderer.on('transcript-mic', (_e, v) => cb(v)),
  saveSessionLog: (name) => ipcRenderer.invoke('save-session-log', name),
  saveSessionBundle: (data) => ipcRenderer.invoke('save-session-bundle', data),
  recBegin: () => ipcRenderer.invoke('rec-begin'),
  recChunk: (id, buf) => ipcRenderer.send('rec-chunk', id, buf),
  recEnd: (id) => ipcRenderer.invoke('rec-end', id),
  uploadSessionBundle: (folder) => ipcRenderer.invoke('upload-session-bundle', folder),
  // The last session's share link, kept until the user copies it (across restarts too).
  getPendingLink: () => ipcRenderer.invoke('get-pending-link'),
  setPendingLink: (link) => ipcRenderer.invoke('set-pending-link', link),
  clearPendingLink: () => ipcRenderer.invoke('clear-pending-link'),
  onUploadProgress: (cb) => ipcRenderer.on('upload-progress', (_e, p) => cb(p)),
  sessionFinalize: (company, position) => ipcRenderer.invoke('session-finalize', { company, position }),
  clearSessionLog: () => ipcRenderer.invoke('clear-session-log'),
  sessionLogAdd: (entry) => ipcRenderer.send('session-log-add', entry),
  onTranscriptLive: (cb) => ipcRenderer.on('transcript-live', (_e, v) => cb(v)),
  onTranscriptLiveError: (cb) => ipcRenderer.on('transcript-live-error', (_e, v) => cb(v)),
  onUtteranceEnd: (cb) => ipcRenderer.on('transcript-utterance-end', () => cb()),
  getDesktopSourceId: (displayId) => ipcRenderer.invoke('get-desktop-source-id', displayId || ''),
  setCaptureDisplay: (displayId) => ipcRenderer.invoke('set-capture-display', displayId || ''),
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  displayThumbnails: (opts) => ipcRenderer.invoke('display-thumbnails', opts || {}),
  onDisplaysChanged: (cb) => ipcRenderer.on('displays-changed', () => cb()),
  getCursorScreenSourceId: () => ipcRenderer.invoke('get-cursor-screen-source-id'),
  getCursorDisplayIndex: () => ipcRenderer.invoke('get-cursor-display-index'),
  getCursorDisplayId: () => ipcRenderer.invoke('get-cursor-display-id'),
  captureDisplayImage: (displayId) => ipcRenderer.invoke('capture-display-image', displayId),
  getAllScreenSourceIds: () => ipcRenderer.invoke('get-all-screen-source-ids'),
  // Latency optimizations
  warmApiConnection: () => ipcRenderer.invoke('warm-api-connection'),
  speculativeStart: (opts) => ipcRenderer.invoke('speculative-start', opts),  // opts includes forcedMode
  speculativeCommit: (opts) => ipcRenderer.invoke('speculative-commit', opts),
  speculativeCancel: () => ipcRenderer.invoke('speculative-cancel'),
  // Deepgram heard the speaker pause (its short end-of-speech signal).
  onTranscriptSpeechFinal: (cb) => ipcRenderer.on('transcript-speech-final', () => cb()),
  // Write answers to the likely questions in the background (interview start).
  onAnswerCancelSpeculative: (cb) => ipcRenderer.on('answer-cancel-speculative', () => cb()),
  onAnswerCommitSpeculative: (cb) => ipcRenderer.on('answer-commit-speculative', () => cb()),
});

// Typing into Ace without taking focus from the other app (Windows):
// renderer/type-through.js drives it, main.js holds the keys.
contextBridge.exposeInMainWorld('typeThrough', {
  mode: () => ipcRenderer.invoke('type-through-mode'),
  onMode: (cb) => ipcRenderer.on('type-through-mode', (_e, v) => cb(v)),
  engage: () => ipcRenderer.invoke('type-through-engage'),
  release: () => ipcRenderer.invoke('type-through-release'),
  selection: (on) => ipcRenderer.invoke('type-through-selection', !!on),
  realFocus: (on) => ipcRenderer.invoke('type-through-real-focus', !!on),
  readClipboard: () => ipcRenderer.invoke('type-through-clipboard'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  onKey: (cb) => ipcRenderer.on('type-through-key', (_e, v) => cb(v)),
  onReleased: (cb) => ipcRenderer.on('type-through-released', () => cb()),
  onCopySelection: (cb) => ipcRenderer.on('type-through-copy-selection', () => cb()),
});
