// Turns a stream of active-speaker detections into names for transcript lines.
//
// The app feeds it one observation per screen read: the highlighted tile (or
// none), a PNG of that tile's name label and a coarse signature of the label.
// It reads each label through readName (the answer model's vision in the app),
// caches the name by tile position, and answers "who was highlighted during
// this utterance" by majority over the observations in the utterance's time
// window. Names come from the screen only: the framed tile, or the speaker
// title of the live captions (observeCaption) when nobody is framed.
//
// Pure apart from the injected readName, so scripts/test-speaker-names.js runs
// the same logic over recorded meetings.

const KEEP_MS = 120000;     // observation history
const REREAD_MS = 30000;    // re-read a cached position this often (tiles reshuffle)
const CHANGED_REREAD_MS = 3000; // ...or this soon when the label looks different
const SIG_CHANGED = 0.06;   // signature distance that means "another name" (same name stays under 0.04)
const SLACK_MS = 400;       // screen reads and audio timestamps don't line up exactly
const MAX_NAME = 80;        // characters; long names are kept whole

function createSpeakerTracker({ readName, isSelf = () => false, keepMs = KEEP_MS, signatureDistance = null }) {
  const samples = [];              // { t, key } ; key null = nobody highlighted
  const captions = [];             // { t, name } from the live captions' speaker title
  const names = new Map();         // key -> { name, readAt, pending, sig }
  const known = new Set();         // every full name seen, to complete shortened ones

  function keyOf(det) {
    const q = (v) => Math.round(v / 16);
    const t = det.tile;
    return `${det.platform}:${q(t.x)},${q(t.y)},${q(t.w)},${q(t.h)}`;
  }

  // The platforms shorten a long name to fit a small tile ("Brando Fernan...").
  // When the whole name was seen elsewhere (a bigger tile, the captions), use it.
  function complete(name) {
    if (!name) return name;
    const stem = name.replace(/\s*(\.{2,}|…)$/, '');
    const low = stem.toLowerCase();
    let best = stem === name ? name : null;
    for (const k of known) {
      if (k.length > (best || stem).length && k.toLowerCase().startsWith(low)) best = k;
    }
    return best || name;
  }

  function learn(name) {
    if (name && !/(\.{2,}|…)$/.test(name)) known.add(name);
  }

  function read(key, labelPng, t, sig) {
    const entry = names.get(key) || { name: null, readAt: 0, pending: false, sig: null };
    if (entry.pending || !labelPng) return;
    entry.pending = true;
    names.set(key, entry);
    Promise.resolve()
      .then(() => readName(labelPng, key))
      .then((raw) => {
        const name = cleanName(raw);
        // A read that fails (the label was mid-animation, covered) keeps the old name.
        if (name) { entry.name = name; entry.sig = sig || null; learn(name); }
      })
      .catch(() => {})
      .finally(() => { entry.pending = false; entry.readAt = t; });
  }

  // det: detectActiveTile() result or null; labelPng: Buffer, or a function
  // returning one (only called when a read is needed); sig: labelSignature().
  function observe(t, det, labelPng, sig) {
    const key = det ? keyOf(det) : null;
    samples.push({ t, key });
    while (samples.length && samples[0].t < t - keepMs) samples.shift();
    if (!key) return;
    const entry = names.get(key);
    const age = entry ? t - entry.readAt : Infinity;
    const changed = !!(entry && entry.sig && sig && signatureDistance && signatureDistance(entry.sig, sig) > SIG_CHANGED);
    if (!entry || (!entry.pending && (age > REREAD_MS || (changed && age > CHANGED_REREAD_MS) || (!entry.name && age > CHANGED_REREAD_MS)))) {
      read(key, typeof labelPng === 'function' ? labelPng() : labelPng, t, sig);
    }
  }

  // The speaker title read off the live captions at time t.
  function observeCaption(t, raw) {
    const name = cleanName(raw);
    if (!name) return;
    learn(name);
    captions.push({ t, name });
    while (captions.length && captions[0].t < t - keepMs) captions.shift();
  }

  // Majority name over [t0, t1]. The app user's own tile never wins: their
  // voice is on the mic, so system audio during that highlight is someone else.
  function nameAt(t0, t1) {
    const counts = new Map();
    for (const s of samples) {
      if (s.t < t0 - SLACK_MS || s.t > t1 + SLACK_MS || !s.key) continue;
      counts.set(s.key, (counts.get(s.key) || 0) + 1);
    }
    const byName = new Map();
    for (const [key, n] of counts) {
      const name = complete(names.get(key) && names.get(key).name);
      if (name && !isSelf(name)) byName.set(name, (byName.get(name) || 0) + n);
    }
    const ranked = [...byName.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length) return ranked[0][0];
    // Nobody framed (a full-screen share, tiles hidden): the captions' title.
    const caps = new Map();
    for (const c of captions) {
      if (c.t < t0 - SLACK_MS || c.t > t1 + 3000) continue; // captions trail the voice
      const name = complete(c.name);
      if (!isSelf(name)) caps.set(name, (caps.get(name) || 0) + 1);
    }
    const capRanked = [...caps.entries()].sort((a, b) => b[1] - a[1]);
    return capRanked.length ? capRanked[0][0] : null;
  }

  // True when some tile was framed in [t0, t1], named or not.
  function framedAt(t0, t1) {
    return samples.some((s) => s.key && s.t >= t0 - SLACK_MS && s.t <= t1 + SLACK_MS);
  }

  // Latest resolved name, for interims that arrive before a read completes.
  function lastName() {
    for (let i = samples.length - 1; i >= 0; i--) {
      const e = samples[i].key && names.get(samples[i].key);
      if (e && e.name && !isSelf(e.name)) return complete(e.name);
    }
    return null;
  }

  function reset() { samples.length = 0; captions.length = 0; names.clear(); known.clear(); }

  return { observe, observeCaption, nameAt, framedAt, lastName, reset };
}

// Model replies come back as "Bruce Clounie", "\"Bruce Clounie\"", "NONE" or a
// sentence. Keep the whole name; drop platform decorations like "(Presenting)".
function cleanName(raw) {
  let s = String(raw || '').split('\n')[0].trim().replace(/^["'`*]+|["'`*]+$/g, '').trim();
  s = s.replace(/\s*\((presenting|host|co-host|guest|external|unverified|you|me)[^)]*\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\.$/, (m, i, all) => (/\.{2,}$/.test(all) ? m : '')); // a sentence's full stop, not an ellipsis
  if (!s || /^(none|unknown|n\/a)$/i.test(s) || s.length > MAX_NAME || s.split(/\s+/).length > 8) return null;
  return s;
}

module.exports = { createSpeakerTracker, cleanName };
