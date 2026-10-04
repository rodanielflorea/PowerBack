// Reading marker for the answer bubble. The user reads the answer aloud; when
// they look away and back, the place is easy to lose. The answer is cut into
// sense groups (the short phrases a speaker says in one breath: "In my last
// role, / I led the data team / that moved our pipelines to GCP."). Each group
// the microphone has heard is dimmed and the next one is marked, so the eye
// lands where the voice stopped. A group only counts as read once its last
// words are heard, so the marker never runs ahead of the voice. Clicking a
// group moves the marker there by hand.
//
// The matching is pure (words in, position out) so it can be tested in Node.
(function (root) {
  const LOOKAHEAD = 3;      // groups ahead of the marker that may be matched (a skipped phrase)
  const COVER = 0.6;        // share of a group's words that must be heard: people paraphrase, recognition slips
  const MOVED_ON = 0.5;     // share heard before starting the next group also finishes this one
  const SKIP = 5;           // words of a group that may be skipped between two heard ones
  const MIN_WORDS = 5;      // shorter pieces join a neighbour
  const MAX_WORDS = 14;     // longer groups are cut in two
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

  // Words that usually open a new phrase when said aloud.
  const OPENERS = /^\s+(?:and|but|so|because|which|while|since|although|though|instead|unless|whereas)\b/i;

  // Splits prose into sense groups, keeping every character (spaces included)
  // like splitSentences. A group ends at a sentence end, after , ; : or a dash,
  // or before a linking word; tiny pieces join a neighbour and long ones are
  // halved, so each group is a few words said in one breath.
  function splitGroups(text) {
    const out = [];
    for (const sentence of splitSentences(text)) {
      const raw = [];
      let last = 0;
      const re = /[,;:\u2014\u2013]["')\]]*\s+|\s+(?=\S)/g;
      let m;
      while ((m = re.exec(sentence))) {
        const cut = m.index + m[0].length;
        const punct = /^[,;:\u2014\u2013]/.test(m[0]);
        if (punct || OPENERS.test(sentence.slice(m.index))) {
          const at = punct ? cut : m.index;
          if (at > last) { raw.push(sentence.slice(last, at)); last = at; }
        }
      }
      raw.push(sentence.slice(last));
      const merged = [];
      for (const piece of raw.filter(Boolean)) {
        const prev = merged.length ? merged[merged.length - 1] : null;
        if (prev !== null && (words(prev).length < MIN_WORDS || words(piece).length < MIN_WORDS - 1)) merged[merged.length - 1] += piece;
        else merged.push(piece);
      }
      // A short last piece reads better with the one before it.
      if (merged.length > 1 && words(merged[merged.length - 1]).length < MIN_WORDS) merged[merged.length - 2] += merged.pop();
      for (const g of merged) out.push(...halve(g));
    }
    return out;
  }

  // Where a long group breaks naturally: after , ; : or a dash, or before a
  // linking word or preposition.
  const BREAK_BEFORE = /^(?:and|but|so|because|which|while|since|although|though|instead|unless|whereas|with|without|for|to|in|on|at|by|from|into|after|before|until|when|where|who|that|if|then|or)\b/i;

  // Cuts a group longer than MAX_WORDS in two, again and again until every
  // piece fits. Prefers a natural break that leaves both halves at least
  // MIN_WORDS long, the one nearest the middle; otherwise the space nearest
  // the middle.
  function halve(g) {
    const n = words(g).length;
    if (n <= MAX_WORDS) return [g];
    const spaces = [];
    const re = /\s+(?=\S)/g;
    let m;
    while ((m = re.exec(g))) spaces.push({ at: m.index + m[0].length, natural: /[,;:—–]["')\]]*$/.test(g.slice(0, m.index)) || BREAK_BEFORE.test(g.slice(m.index + m[0].length)) });
    if (!spaces.length) return [g];
    const mid = g.length / 2;
    const nearest = (list) => list.reduce((a, b) => (Math.abs(b.at - mid) < Math.abs(a.at - mid) ? b : a));
    const good = spaces.filter((s) => s.natural && words(g.slice(0, s.at)).length >= MIN_WORDS && words(g.slice(s.at)).length >= MIN_WORDS);
    const at = (good.length ? nearest(good) : nearest(spaces)).at;
    return halve(g.slice(0, at)).concat(halve(g.slice(at)));
  }

  // Numbers come back from speech recognition in any form ("2549", "twenty
  // five forty nine", "25 49"), so they are neither required nor matched.
  const NUMBER_WORDS = new Set(('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen ' +
    'sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million ' +
    'billion percent point oh').split(' '));
  function isNumberish(w) { return /^\d/.test(w) || NUMBER_WORDS.has(w); }

  // A rough stem, so "updated", "updates" and "updating" meet.
  function stem(w) { return w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w; }

  // At most `max` single-letter edits apart (a slip in the recognition).
  function near(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, row[j]);
      }
      if (best > max) return false;
      prev = row;
    }
    return prev[b.length] <= max;
  }

  function same(a, b) {
    if (a === b) return true;
    const x = stem(a), y = stem(b);
    if (x === y) return true;
    const len = Math.min(x.length, y.length);
    return len >= 4 && near(x, y, len >= 8 ? 2 : 1);
  }

  // The words of a group that are matched (numbers left out).
  function key(group) { return group.filter((w) => !isNumberish(w)); }

  // How much of `group` (array of words) was heard, in order, in `heard`.
  // Returns { n: words matched, end: index in heard after the last match,
  // reached: index in group after the last matched word }. Numbers in `heard`
  // are passed over.
  function cover(group, heard) {
    let j = 0, n = 0, end = 0;
    for (let i = 0; i < heard.length && j < group.length; i++) {
      if (isNumberish(heard[i])) continue;
      for (let k = j; k < Math.min(group.length, j + SKIP); k++) {
        if (same(group[k], heard[i])) { n++; j = k + 1; end = i + 1; break; }
      }
    }
    return { n, end, reached: j };
  }

  function needed(len) { return len <= 2 ? len : Math.max(2, Math.ceil(len * COVER)); }

  // Read: enough of its words, and the voice got to its end (the last word,
  // or one of the last two in a group of 10 words or more).
  function isRead(len, c) {
    const tail = len >= 10 ? 2 : 1;
    return c.n >= needed(len) && c.reached >= len - tail + 1;
  }

  // The voice has started the next group: two of its first three words heard.
  function started(next, heard) {
    return !!next && next.length > 0 && cover(next.slice(0, 3), heard).n >= Math.min(2, next.length);
  }

  // groups: arrays of words; pos: first unread group; heard: words since the
  // last match. Returns { pos, used } — the new position and how many heard
  // words it consumed — or null when nothing new was read. A group also counts
  // as read when half of it was heard and the voice has moved on into the
  // next one (its last words were swallowed or misheard).
  function advance(groups, pos, heard) {
    const keys = groups.map(key);
    let best = null, from = 0;
    for (;;) {
      let hit = null;
      for (let i = pos; i < Math.min(groups.length, pos + LOOKAHEAD); i++) {
        const g = keys[i];
        if (!g.length) continue;
        const c = cover(g, heard.slice(from));
        if (isRead(g.length, c)) { hit = { pos: i + 1, used: from + c.end }; break; }
        if (c.n >= Math.ceil(g.length * MOVED_ON) && started(keys[i + 1], heard.slice(from + c.end))) {
          hit = { pos: i + 1, used: from + c.end };
          break;
        }
      }
      if (!hit) return best;
      best = hit; pos = hit.pos; from = hit.used;
    }
  }

  const api = { words, splitSentences, splitGroups, cover, advance, same };
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

  // Wrap the sense groups of a finished answer. Code, diagrams and tables are left alone.
  function attach(rootEl) {
    if (!rootEl) return;
    const SKIP = 'pre, code, svg, table, .mermaid-block, .listen-chip, .answer-code-actions, button';
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const spans = [], sentences = [];
    let open = null;        // a group that runs on into the next text node (bold or a link inside it)
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      const block = node.parentElement.closest('p, li, h1, h2, h3, h4, blockquote, div');
      for (const piece of splitGroups(node.nodeValue)) {
        const el = document.createElement('span');
        el.className = 'read-s';
        el.textContent = piece;
        frag.appendChild(el);
        const w = words(piece);
        if (open && open.block === block && !open.ended) {
          spans[open.i].push(el);
          sentences[open.i] = sentences[open.i].concat(w);
          open.ended = groupEnds(piece, sentences[open.i]);
        } else {
          spans.push([el]);
          sentences.push(w);
          open = { i: spans.length - 1, block, ended: groupEnds(piece, w) };
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

  // A piece cut off by a text-node edge (bold, a link) keeps going into the
  // next node, unless it ends a phrase or is already long enough.
  function groupEnds(piece, w) {
    return /[.!?…,;:\u2014\u2013]["')\]]*\s*$/.test(piece) || w.length >= MIN_WORDS;
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
