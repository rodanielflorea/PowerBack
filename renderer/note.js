// A note window (note.html): one piece of code, one diagram, or a whole code /
// diagram answer, opened by double-clicking it in the answer panel. main.js
// (createNoteWindow) hands over what to show; this page draws it, works out
// the size it needs, and lets the note be dragged anywhere, past the top or
// bottom of the screen too.
(async function () {
  const $ = (id) => document.getElementById(id);
  const body = $('noteBody');
  const CHROME_H = 28 + 12 + 2; // top bar + bottom strip + border
  const CHROME_W = 2;
  const SCROLLBAR = 14;

  const data = (await window.note.get()) || {};
  const max = data.max || { width: 1400, height: 900 };
  let copyText = '';

  const langOf = (el) => ((el && el.className) || '').match(/language-([\w+#.-]+)/)?.[1] || '';

  // Code: line numbers, colors, never wrapped (the note grows to the longest line).
  function renderCode() {
    const code = String(data.code || '').replace(/\s+$/, '');
    const lang = data.lang || (window.aceGuessLang ? window.aceGuessLang(code) : '');
    $('noteKind').innerHTML = aceIcon('code');
    $('noteTitle').textContent = 'Code' + (lang ? ' · ' + lang : '');
    const wrap = document.createElement('div');
    wrap.className = 'note-code';
    const gutter = document.createElement('pre');
    gutter.className = 'note-gutter';
    gutter.textContent = code.split('\n').map((_, i) => i + 1).join('\n');
    const pre = document.createElement('pre');
    pre.innerHTML = window.aceHighlight ? window.aceHighlight(code, lang) : code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    wrap.append(gutter, pre);
    body.appendChild(wrap);
    copyText = code;
    wrap.style.width = 'max-content';
    const r = wrap.getBoundingClientRect();
    wrap.style.width = '';
    let width = Math.ceil(r.width) + CHROME_W;
    let height = Math.ceil(r.height) + CHROME_H;
    if (width > max.width) height += SCROLLBAR;
    if (height > max.height) width += SCROLLBAR;
    return { width: Math.max(300, width), height };
  }

  // Diagram: as big as it was drawn (small ones a little bigger), at most the
  // screen; it then fills the note and keeps its shape when the note is resized.
  function renderDiagram() {
    $('noteKind').innerHTML = aceIcon('diagram');
    $('noteTitle').textContent = data.title || 'Diagram';
    body.classList.add('is-diagram');
    const box = document.createElement('div');
    box.className = 'note-diagram';
    box.innerHTML = String(data.svg || '');
    body.appendChild(box);
    const svg = box.querySelector('svg');
    let w = Number(data.w) || 0, h = Number(data.h) || 0;
    if (svg) {
      svg.removeAttribute('style');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const vb = svg.viewBox && svg.viewBox.baseVal;
      if (vb && vb.width && vb.height) { w = vb.width; h = vb.height; }
    }
    if (!w || !h) { w = 640; h = 420; }
    const PAD = 24; // .note-diagram padding, both sides
    const roomW = max.width - CHROME_W - PAD, roomH = max.height - CHROME_H - PAD;
    let scale = Math.min(1.6, Math.max(1, 520 / w)); // lift small diagrams to a readable size
    scale = Math.min(scale, roomW / w, roomH / h);
    return { width: Math.round(w * scale) + CHROME_W + PAD, height: Math.round(h * scale) + CHROME_H + PAD };
  }

  // A whole answer: its text, its code (colored) and its diagrams.
  function renderAnswer() {
    $('noteKind').innerHTML = aceIcon(data.mode === 'DIAGRAM' ? 'diagram' : 'code');
    $('noteTitle').textContent = data.title || 'Answer';
    const box = document.createElement('div');
    box.className = 'note-answer';
    box.innerHTML = String(data.html || '');
    const blocks = [];
    box.querySelectorAll('pre').forEach((pre) => {
      const c = pre.querySelector('code') || pre;
      const text = c.textContent || '';
      blocks.push(text.replace(/\s+$/, ''));
      if (window.aceHighlight) c.innerHTML = window.aceHighlight(text, langOf(c));
    });
    box.querySelectorAll('.mermaid-block svg').forEach((svg) => {
      svg.removeAttribute('style');
      svg.style.width = '100%';
      svg.style.height = 'auto';
    });
    body.appendChild(box);
    copyText = blocks.join('\n\n');
    // As wide as its widest code line (at least 520), then as tall as it is.
    let widest = 0;
    box.querySelectorAll('pre').forEach((pre) => {
      pre.style.width = 'max-content';
      widest = Math.max(widest, pre.getBoundingClientRect().width);
      pre.style.width = '';
    });
    const width = Math.min(max.width, Math.max(520, Math.ceil(widest) + 28 + SCROLLBAR) + CHROME_W);
    box.style.width = (width - CHROME_W) + 'px';
    const height = Math.ceil(box.getBoundingClientRect().height) + CHROME_H;
    box.style.width = '';
    return { width, height };
  }

  const size = data.kind === 'code' ? renderCode() : data.kind === 'diagram' ? renderDiagram() : renderAnswer();
  if (copyText) $('noteCopy').hidden = false;
  await window.note.fit(size);

  // ── Buttons ──
  $('noteClose').addEventListener('click', () => window.note.close());
  let copiedTimer = 0;
  $('noteCopy').addEventListener('click', async () => {
    await window.note.copy(copyText);
    const tag = $('noteCopied');
    tag.classList.add('on');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => tag.classList.remove('on'), 1200);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.note.close(); });

  // ── Moving ──
  // While the button is held, main.js moves the window with the real cursor
  // (not the page's own coordinates, which lag while the window moves), and
  // without the screen-edge limits of a normal title-bar drag.
  function wireDrag(el) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      let live = true;
      try { el.setPointerCapture(e.pointerId); } catch {}
      el.classList.add('dragging');
      document.body.classList.add('dragging');
      window.note.drag('start');
      const end = () => {
        if (!live) return;
        live = false;
        window.note.drag('end');
        el.classList.remove('dragging');
        document.body.classList.remove('dragging');
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        el.removeEventListener('lostpointercapture', end);
        window.removeEventListener('blur', end);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      window.addEventListener('blur', end);
    });
  }
  wireDrag($('noteTop'));
  wireDrag($('noteBottom'));
  if (data.kind === 'diagram') wireDrag(body);
})();
