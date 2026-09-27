// Turns a stream of active-speaker detections into names for transcript lines.
//
// The app feeds it one observation per screen read: the highlighted tile (or
// none) and a PNG of that tile's name label. It reads each label once through
// readName (the answer model's vision in the app), caches the name by tile
// position, and answers "who was highlighted during this utterance" by
// majority over the observations in the utterance's time window.
//
// Pure apart from the injected readName, so scripts/test-speaker-names.js runs
// the same logic over recorded meetings.

const KEEP_MS = 120000;     // observation history
const REREAD_MS = 60000;    // re-read a cached position this often (tiles reshuffle)
const SLACK_MS = 400;       // screen reads and audio timestamps don't line up exactly

function createSpeakerTracker({ readName, isSelf = () => false, keepMs = KEEP_MS }) {
  const samples = [];              // { t, key } ; key null = nobody highlighted
  const names = new Map();         // key -> { name, readAt, pending }
  const voices = new Map();        // Deepgram speaker id -> Map(name -> times seen together)

  function keyOf(det) {
    const q = (v) => Math.round(v / 16);
    const t = det.tile;
    return `${det.platform}:${q(t.x)},${q(t.y)},${q(t.w)},${q(t.h)}`;
  }

  function read(key, labelPng, t) {
    const entry = names.get(key) || { name: null, readAt: 0, pending: false };
    if (entry.pending) return;
    entry.pending = true;
    names.set(key, entry);
    Promise.resolve()
      .then(() => readName(labelPng, key))
      .then((name) => { entry.name = cleanName(name); })
      .catch(() => {})
      .finally(() => { entry.pending = false; entry.readAt = t; });
  }

  // det: detectActiveTile() result or null; labelPng: Buffer, or a function
  // returning one (only called when a read is needed).
  function observe(t, det, labelPng) {
    const key = det ? keyOf(det) : null;
    samples.push({ t, key });
    while (samples.length && samples[0].t < t - keepMs) samples.shift();
    if (!key) return;
    const entry = names.get(key);
    if (!entry || (!entry.pending && t - entry.readAt > REREAD_MS)) {
      read(key, typeof labelPng === 'function' ? labelPng() : labelPng, t);
    }
  }

  // Majority name over [t0, t1]. The app user's own tile never wins: their
  // voice is on the mic, so system audio during that highlight is someone else.
  function nameAt(t0, t1) {
    const counts = new Map();
    for (const s of samples) {
      if (s.t < t0 - SLACK_MS || s.t > t1 + SLACK_MS || !s.key) continue;
      counts.set(s.key, (counts.get(s.key) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key] of ranked) {
      const name = names.get(key) && names.get(key).name;
      if (name && !isSelf(name)) return name;
    }
    return null;
  }

  // Latest resolved name, for interims that arrive before a read completes.
  function lastName() {
    for (let i = samples.length - 1; i >= 0; i--) {
      const e = samples[i].key && names.get(samples[i].key);
      if (e && e.name && !isSelf(e.name)) return e.name;
    }
    return null;
  }

  // The name for an utterance: whoever was framed while it was spoken. When
  // nobody was framed (a full-screen share, a paused highlight), fall back to
  // the name most often framed together with this Deepgram voice before.
  function whoSpoke(t0, t1, voice) {
    const named = nameAt(t0, t1);
    const known = voice !== undefined && voice !== null;
    if (named && known) {
      const m = voices.get(voice) || new Map();
      m.set(named, (m.get(named) || 0) + 1);
      voices.set(voice, m);
    }
    if (named || !known || !voices.has(voice)) return named;
    return [...voices.get(voice).entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return { observe, nameAt, whoSpoke, lastName, reset: () => { samples.length = 0; names.clear(); voices.clear(); } };
}

// Model replies come back as "Bruce Clounie", "\"Bruce Clounie\"", "NONE" or a
// sentence. Keep a short name; drop platform decorations like "(Presenting)".
function cleanName(raw) {
  let s = String(raw || '').split('\n')[0].trim().replace(/^["'`*]+|["'`*.]+$/g, '').trim();
  s = s.replace(/\s*\((presenting|host|guest|external|you)[^)]*\)\s*/gi, ' ').trim();
  if (!s || /^none$/i.test(s) || s.length > 40 || s.split(/\s+/).length > 5) return null;
  return s;
}

module.exports = { createSpeakerTracker, cleanName };
