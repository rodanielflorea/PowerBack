const stickyBody = document.getElementById('stickyBody');
const stickyEmpty = document.getElementById('stickyEmpty');
const stickyClose = document.getElementById('stickyClose');
const stickyClear = document.getElementById('stickyClear');
const stickyInput = document.getElementById('stickyInput');
const stickySend = document.getElementById('stickySend');
const stickyAttach = document.getElementById('stickyAttach');
const stickyFileInput = document.getElementById('stickyFileInput');

console.log('[sticky] script loaded; window.sticky =', typeof window.sticky);

function fmtTime(ts) {
  const d = new Date(ts || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function clearEmpty() {
  const e = document.getElementById('stickyEmpty');
  if (e && e.parentNode) e.remove();
}

function renderMessage(msg) {
  clearEmpty();
  const wrap = document.createElement('div');
  wrap.className = 'msg' + (msg.fromMe ? ' from-me' : ' from-them');

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = fmtTime(msg.ts);
  wrap.appendChild(time);

  if (msg.type === 'chat-rich') {
    // Full answer markdown — render diagrams + code exactly like the chat area.
    const r = document.createElement('div');
    r.className = 'msg-text msg-rich';
    r.textContent = msg.markdown || msg.text || '';
    wrap.appendChild(r);
    if (typeof renderDiagramsMarkdown === 'function') {
      try { renderDiagramsMarkdown(r); } catch (e) { /* leave as plain text */ }
    }
  } else if (msg.type === 'chat-text') {
    const t = document.createElement('div');
    t.className = 'msg-text';
    if (isScriptMessage(msg.text)) {
      t.innerHTML = renderScript(msg.text);
    } else {
      t.textContent = msg.text || '';
    }
    wrap.appendChild(t);
  } else if (msg.type === 'chat-image') {
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.src = msg.dataUrl || '';
    img.alt = 'image';
    wrap.appendChild(img);
  }
  stickyBody.appendChild(wrap);
  stickyBody.scrollTop = stickyBody.scrollHeight;
}

function renderHistory(history) {
  stickyBody.innerHTML = '';
  if (!history || history.length === 0) {
    const empty = document.createElement('div');
    empty.id = 'stickyEmpty';
    empty.className = 'sticky-empty';
    empty.textContent = 'No messages yet.';
    stickyBody.appendChild(empty);
    return;
  }
  for (const msg of history) renderMessage(msg);
}

window.applyStickyHistory = function(history) { renderHistory(history); };
window.applyStickyMessage = function(msg) { renderMessage(msg); };

async function doSendText() {
  console.log('[sticky] doSendText fired');
  if (!stickyInput) return;
  const text = (stickyInput.value || '').trim();
  if (!text) return;
  stickyInput.value = '';
  renderMessage({ type: 'chat-text', text, ts: Date.now(), fromMe: true });
  if (window.sticky && typeof window.sticky.send === 'function') {
    try { await window.sticky.send(text); } catch (e) { console.error('[sticky] send failed:', e); }
  } else {
    console.error('[sticky] window.sticky.send is unavailable');
  }
}

async function doSendImage(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    if (window.sticky && typeof window.sticky.sendImage === 'function') {
      try { await window.sticky.sendImage(dataUrl); } catch (err) { console.error('[sticky] sendImage failed:', err); }
    }
  };
  reader.readAsDataURL(file);
}

function doClear() {
  console.log('[sticky] doClear fired');
  renderHistory([]);
  window.__stickyHistory = [];
  if (window.sticky && typeof window.sticky.clear === 'function') {
    try { window.sticky.clear(); } catch (e) { console.error('[sticky] clear failed:', e); }
  }
}

function doClose() {
  if (window.sticky && typeof window.sticky.close === 'function') {
    try { window.sticky.close(); } catch {}
  }
}

if (stickyClose) stickyClose.addEventListener('click', doClose);
if (stickyClear) stickyClear.addEventListener('click', doClear);
if (stickySend) stickySend.addEventListener('click', doSendText);
if (stickyInput) stickyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSendText(); }
});
if (stickyAttach) stickyAttach.addEventListener('click', () => stickyFileInput && stickyFileInput.click());
if (stickyFileInput) stickyFileInput.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) doSendImage(f);
  e.target.value = '';
});

if (window.sticky && typeof window.sticky.onHistory === 'function') {
  window.sticky.onHistory((history) => renderHistory(history));
}
if (window.sticky && typeof window.sticky.onMessage === 'function') {
  window.sticky.onMessage((msg) => renderMessage(msg));
}

if (window.__stickyHistory && Array.isArray(window.__stickyHistory)) {
  renderHistory(window.__stickyHistory);
}

// ── Structured script renderer ────────────────────────────────────────────────
const SCRIPT_SECTIONS = ['OVERVIEW', 'WALKTHROUGH', 'KEY INSIGHT'];

function isScriptMessage(text) {
  if (!text) return false;
  return SCRIPT_SECTIONS.some(s => text.includes(s));
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderScript(text) {
  // Split on known section headings, keeping the heading in the output.
  const sectionRe = /^(OVERVIEW|WALKTHROUGH|KEY INSIGHT)\s*$/m;
  const lines = text.split('\n');
  let html = '';
  let inSection = false;
  let bodyLines = [];

  function flushBody() {
    const body = bodyLines.join('\n').trim();
    if (body) {
      // Each non-empty line becomes its own paragraph for readability
      body.split(/\n\n+/).forEach(para => {
        const p = para.trim();
        if (p) html += '<p class="script-body">' + escHtml(p) + '</p>';
      });
    }
    bodyLines = [];
  }

  lines.forEach(line => {
    const heading = SCRIPT_SECTIONS.find(s => line.trim() === s);
    if (heading) {
      flushBody();
      inSection = true;
      html += '<div class="script-section-label">' + escHtml(heading) + '</div>';
    } else if (inSection) {
      bodyLines.push(line);
    }
  });
  flushBody();
  return html || '<span>' + escHtml(text) + '</span>';
}
