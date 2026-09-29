// Reading marker for the answer bubble. The user reads the answer aloud; when
// they look away and back, the place is easy to lose. Each sentence the
// microphone has heard is dimmed and the next one is marked, so the eye lands
// where the voice stopped. Clicking a sentence moves the marker there by hand.
//
// The matching is pure (words in, position out) so it can be tested in Node.
(function (root) {
  const LOOKAHEAD = 3;      // sentences ahead of the marker that may be matched (a skipped line)
  const COVER = 0.6;        // share of a sentence's words that must be heard: people paraphrase
  const KEEP_WORDS = 80;    // heard words kept while waiting for a match

  function words(text) {
    return String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  }

  // Splits prose into sentences, keeping every character (spaces included) so
  // the pieces can be put back in place of the text they came from.
  function splitSentences(text) {
    const out = [];
    const re = /[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g;
    let m;
    while ((m = re.exec(text)) && m[0]) out.push(m[0]);
    // "e.g." or "3.5" cut a sentence short: glue a piece with no words of its own to its neighbour.
    const glued = [];
    for (const s of out) {
      const prev = glued.length ? glued[glued.length - 1] : '';
      const cut = /\b(?:e\.g|i\.e|vs|mr|mrs|ms|dr)\.\s*$/i.test(prev) || (/\d\.$/.test(prev) && /^\d/.test(s));
      if (glued.length && (cut || words(s).length < 2)) glued[glued.length - 1] += s;
      else glued.push(s);
    }
    return glued;
  }

  // How much of `sentence` (array of words) was heard, in order, in `heard`.
  // Returns { n: words matched, end: index in heard after the last match }.
  function cover(sentence, heard) {
    let j = 0, n = 0, end = 0;
    for (let i = 0; i < heard.length && j < sentence.length; i++) {
      for (let k = j; k < Math.min(sentence.length, j + 4); k++) {
        if (sentence[k] === heard[i]) { n++; j = k + 1; end = i + 1; break; }
      }
    }
    return { n, end };
  }

  function needed(len) { return len <= 2 ? len : Math.max(2, Math.ceil(len * COVER)); }

  // sentences: arrays of words; pos: first unread sentence; heard: words since
  // the last match. Returns { pos, used } — the new position and how many
  // heard words it consumed — or null when nothing new was read.
  function advance(sentences, pos, heard) {
    let best = null, from = 0;
    for (;;) {
      let hit = null;
      for (let i = pos; i < Math.min(sentences.length, pos + LOOKAHEAD); i++) {
        const s = sentences[i];
        if (!s.length) continue;
        const c = cover(s, heard.slice(from));
        if (c.n >= needed(s.length)) { hit = { pos: i + 1, used: from + c.end }; break; }
      }
      if (!hit) return best;
      best = hit; pos = hit.pos; from = hit.used;
    }
  }

  const api = { words, splitSentences, cover, advance };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ── DOM side ───────────────────────────────────────────────────────────────
  let cur = null;           // { spans, sentences, pos }
  let finals = [];          // heard words not yet matched
  let interimUsed = 0;      // words of the running interim already matched

  function paint() {
    if (!cur) return;
    cur.spans.forEach((group, i) => group.forEach((el) => {
      el.classList.toggle('read-done', i < cur.pos);
      el.classList.toggle('read-now', i === cur.pos);
    }));
  }

  function setPos(pos) {
    if (!cur) return;
    cur.pos = Math.max(0, Math.min(cur.spans.length, pos));
    paint();
  }

  // Wrap the sentences of a finished answer. Code, diagrams and tables are left alone.
  function attach(rootEl) {
    if (!rootEl) return;
    const SKIP = 'pre, code, svg, table, .mermaid-block, .listen-chip, .answer-code-actions, button';
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const spans = [], sentences = [];
    let open = null;        // a sentence that runs on into the next text node (bold or a link inside it)
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      const block = node.parentElement.closest('p, li, h1, h2, h3, h4, blockquote, div');
      for (const piece of splitSentences(node.nodeValue)) {
        const el = document.createElement('span');
        el.className = 'read-s';
        el.textContent = piece;
        frag.appendChild(el);
        const w = words(piece);
        if (open && open.block === block && !open.ended) {
          spans[open.i].push(el);
          sentences[open.i] = sentences[open.i].concat(w);
          open.ended = /[.!?…]["')\]]*\s*$/.test(piece);
        } else {
          spans.push([el]);
          sentences.push(w);
          open = { i: spans.length - 1, block, ended: /[.!?…]["')\]]*\s*$/.test(piece) };
        }
        const i = open.i;
        el.addEventListener('click', () => { if (cur && cur.spans === spans) { setPos(i + 1); finals = []; interimUsed = 0; } });
      }
      node.parentNode.replaceChild(frag, node);
    }
    if (cur) cur.spans.forEach((g) => g.forEach((el) => el.classList.remove('read-now')));
    cur = spans.length ? { spans, sentences, pos: 0 } : null;
    finals = []; interimUsed = 0;
    paint();
  }

  // Words from the user's microphone: interim hypotheses and finals.
  function heard(text, isFinal) {
    const w = words(text);
    const fresh = w.slice(Math.min(interimUsed, w.length));
    if (cur && cur.pos < cur.sentences.length) {
      const all = finals.concat(fresh);
      const r = advance(cur.sentences, cur.pos, all);
      if (r) {
        const fromInterim = Math.max(0, r.used - finals.length);
        finals = finals.slice(Math.min(r.used, finals.length));
        if (!isFinal) interimUsed += fromInterim;
        else fresh.splice(0, fromInterim);
        setPos(r.pos);
        try { const el = cur.spans[Math.min(cur.pos, cur.spans.length - 1)][0]; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
      }
    }
    if (isFinal) {
      finals = finals.concat(fresh).slice(-KEEP_WORDS);
      interimUsed = 0;
    }
  }

  function reset() { finals = []; interimUsed = 0; }

  root.ReadMarker = { attach, heard, reset };
})(typeof window !== 'undefined' ? window : globalThis);
