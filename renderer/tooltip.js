// Stealth tooltips: native `title` tooltips are drawn by the OS OUTSIDE the
// window surface, so content-protection can't hide them (they leak into screen
// shares/recordings). This replaces them with an in-window element that IS part
// of the protected surface. On first hover of any element with a `title`, we
// move the text to `data-tip` and strip `title` so the OS tooltip never shows.
(function () {
  let tipEl = null;
  function ensure() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'ui-tip';
    tipEl.style.cssText =
      'position:fixed;z-index:99999;pointer-events:none;' +
      'background:#1e293b;color:#f1f5f9;font:12px system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'padding:4px 8px;border-radius:6px;border:1px solid #334155;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.45);max-width:280px;white-space:normal;line-height:1.35;' +
      'opacity:0;transition:opacity .08s ease;left:-9999px;top:-9999px;';
    document.body.appendChild(tipEl);
    return tipEl;
  }

  // Walk up from the hovered node to find a tooltip source; convert title→data-tip.
  function findTip(el) {
    while (el && el !== document.body && el.nodeType === 1) {
      if (el.dataset && el.dataset.tip) return el;
      const t = el.getAttribute && el.getAttribute('title');
      if (t) { el.setAttribute('data-tip', t); el.removeAttribute('title'); return el; }
      el = el.parentElement;
    }
    return null;
  }

  let curEl = null;
  function show(el, e) {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    curEl = el;
    const tip = ensure();
    tip.textContent = text;
    tip.style.opacity = '1';
    position(e);
  }
  function hide() {
    if (tipEl) { tipEl.style.opacity = '0'; tipEl.style.left = '-9999px'; tipEl.style.top = '-9999px'; }
    curEl = null;
  }
  function position(e) {
    const tip = ensure();
    const pad = 10;
    const r = tip.getBoundingClientRect();
    let x = (e.clientX || 0) + 14;
    let y = (e.clientY || 0) + 18;
    if (x + r.width + pad > window.innerWidth) x = (e.clientX || 0) - r.width - 14;
    if (y + r.height + pad > window.innerHeight) y = (e.clientY || 0) - r.height - 14;
    tip.style.left = Math.max(pad, x) + 'px';
    tip.style.top = Math.max(pad, y) + 'px';
  }

  document.addEventListener('mouseover', (e) => {
    const el = findTip(e.target);
    if (el) show(el, e);
    else if (curEl && !curEl.contains(e.target)) hide();
  });
  document.addEventListener('mousemove', (e) => { if (curEl) position(e); });
  document.addEventListener('mouseout', (e) => {
    if (curEl && (!e.relatedTarget || !curEl.contains(e.relatedTarget))) hide();
  });
  document.addEventListener('mousedown', hide);
  window.addEventListener('blur', hide);
})();
