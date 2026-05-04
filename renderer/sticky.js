const stickyBody = document.getElementById('stickyBody');
const stickyEmpty = document.getElementById('stickyEmpty');
const stickyClose = document.getElementById('stickyClose');
const stickyClear = document.getElementById('stickyClear');

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
  wrap.className = 'msg';

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = fmtTime(msg.ts);
  wrap.appendChild(time);

  if (msg.type === 'chat-text') {
    const t = document.createElement('div');
    t.className = 'msg-text';
    t.textContent = msg.text || '';
    wrap.appendChild(t);
  } else if (msg.type === 'chat-image') {
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.src = msg.dataUrl || '';
    img.alt = 'image from supporter';
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

window.sticky.onHistory((history) => renderHistory(history));
window.sticky.onMessage((msg) => renderMessage(msg));

stickyClose.addEventListener('click', () => window.sticky.close());
stickyClear.addEventListener('click', () => {
  renderHistory([]);
  window.__stickyHistory = [];
  try { window.sticky.clear(); } catch {}
});

if (window.__stickyHistory && Array.isArray(window.__stickyHistory)) {
  renderHistory(window.__stickyHistory);
}
