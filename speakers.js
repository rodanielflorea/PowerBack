// ---------------------------------------------------------------------------
// Speaker names from OCR'd live captions.
//
// Meeting platforms label their own captions with who is talking, so reading
// the caption panel gives attribution for free. Two layouts are handled:
//
//   inline      "Sarah Chen: so what I'd do is ..."
//   own line    "Sarah Chen"            <- name (optionally with a timestamp)
//               "so what I'd do is ..." <- their words, one or more lines
//
// parseCaptionFrame() splits one OCR frame into speaker blocks and returns the
// caption words with the names REMOVED, so the scrolling-caption differ
// (smartDiff in main.js) only ever sees speech. attributeEmission() then maps
// the words the differ decided are new back to the speaker they sit under.
// Pure functions, no Electron — see scripts/test-speakers.js.
// ---------------------------------------------------------------------------

const MAX_NAME_TOKENS = 4;
const MAX_NAME_CHARS = 40;

// Lowercase words that are legitimately part of a name.
const NAME_PARTICLES = new Set(['de', 'del', 'della', 'der', 'di', 'da', 'dos', 'das', 'du', 'la', 'le', 'van', 'von', 'bin', 'ibn', 'al', 'el', 'y', 'e', 'st', 'st.']);

// Capitalised words that start a caption line but are not a person. A short
// line made of these ("Thank You", "Good Morning", "Note:") must stay speech.
const NOT_A_NAME = new Set([
  'a', 'about', 'actually', 'after', 'again', 'agreed', 'ah', 'all', 'also', 'alright', 'and', 'answer', 'any', 'anyway', 'are', 'as', 'at',
  'basically', 'because', 'before', 'but', 'by', 'bye', 'can', 'cool', 'correct', 'could', 'did', 'do', 'does', 'done',
  'example', 'exactly', 'fine', 'first', 'for', 'from', 'go', 'good', 'goodbye', 'got', 'great', 'had', 'has', 'have', 'he', 'hello', 'here', 'hey', 'hi', 'hmm', 'how',
  'i', 'if', 'in', 'is', 'it', 'its', 'just', 'last', 'let', 'like', 'look', 'maybe', 'me', 'morning', 'my', 'next', 'nice', 'no', 'nope', 'not', 'note', 'now',
  'of', 'oh', 'ok', 'okay', 'on', 'one', 'or', 'our', 'perfect', 'please', 'question', 'really', 'right', 'second', 'see', 'she', 'should', 'so', 'some', 'sorry', 'step', 'summary', 'sure',
  'thank', 'thanks', 'that', 'the', 'their', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'today', 'too', 'um', 'uh', 'update',
  'very', 'wait', 'warning', 'was', 'we', 'welcome', 'well', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'wow',
  'yeah', 'yep', 'yes', 'yet', 'your',
]);

// The platform's label for the local user's own captions ("You", "You (Sarah)").
const SELF_LABEL = /^you\b/i;

function isSelf(who) { return SELF_LABEL.test(String(who || '').trim()); }

// Drop what OCR picks up around a name: a trailing clock ("10:32", "10:32 AM"),
// leading icon junk, and the avatar initials printed next to it ("SC Sarah Chen").
function cleanNameCandidate(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?\s*$/, '');
  s = s.replace(/^[^A-Za-zÀ-ɏ]+/, '').replace(/[^A-Za-zÀ-ɏ.)]+$/, '');
  const toks = s.split(/\s+/).filter(Boolean);
  if (toks.length >= 2 && /^[A-Z]{1,3}$/.test(toks[0])) {
    const initials = toks.slice(1).filter((t) => /^[A-ZÀ-Þ]/.test(t)).map((t) => t[0]).join('');
    if (initials.startsWith(toks[0])) toks.shift();
  }
  return toks.join(' ');
}

// Does this string have the SHAPE of a person's name? Roster names always pass.
function looksLikeName(s, roster) {
  const name = String(s || '').trim();
  if (!name || name.length > MAX_NAME_CHARS) return false;
  if (roster && roster.has(name.toLowerCase())) return true;
  if (isSelf(name)) return /^you(?:\s*\([^)]{1,30}\))?$/i.test(name);
  if (/[.?!,;]$/.test(name) || /\d/.test(name)) return false;
  const toks = name.split(/\s+/);
  if (toks.length > MAX_NAME_TOKENS) return false;
  let capitalised = 0;
  for (const t of toks) {
    const bare = t.replace(/^\(|\)$/g, '');
    const low = bare.toLowerCase();
    if (NAME_PARTICLES.has(low)) continue;
    if (NOT_A_NAME.has(low.replace(/[^a-z]/g, ''))) return false;
    if (!/^[A-ZÀ-Þ][A-Za-zÀ-ɏ.'’-]*$/.test(bare)) return false;
    capitalised++;
  }
  return capitalised > 0;
}

// A raw label -> the speaker name it carries, or '' when it is not one. The
// roster is asked about the label as printed first, so a name the clean-up
// would damage ("Dev Team 2") still gets through.
function nameFrom(raw, roster) {
  const asPrinted = String(raw || '').trim();
  if (roster && roster.has(asPrinted.toLowerCase())) return asPrinted;
  const cleaned = cleanNameCandidate(asPrinted);
  return looksLikeName(cleaned, roster) ? cleaned : '';
}

// Fix what OCR reliably gets wrong on caption fonts. Seen with tesseract on
// sans-serif text: a lone capital I read as a pipe.
function cleanOcrText(raw) {
  return String(raw || '').replace(/(^|[\s(])\|(?=[\s.,;:!?')]|$)/g, '$1I');
}

// Split one OCR frame into speaker blocks.
//   -> { blocks: [{ who, words: [...] }], text }   (text = speech only, no names)
// `who` is '' for words that sit above the first visible name: the label has
// scrolled out of the capture area, so the caller carries the last speaker over.
function parseCaptionFrame(raw, opts = {}) {
  const roster = opts.roster instanceof Set ? opts.roster
    : new Set((opts.roster || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean));
  const lines = cleanOcrText(raw).split('\n').map((l) => l.trim());
  const blocks = [];
  let cur = null;
  const open = (who) => { cur = { who, words: [] }; blocks.push(cur); };
  const add = (text) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return;
    if (!cur) open('');
    cur.words.push(...words);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // inline: "Name: words"
    const m = /^(.{1,60}?)\s*:\s+(\S.*)$/.exec(line);
    if (m) {
      const name = nameFrom(m[1], roster);
      if (name) { open(name); add(m[2]); continue; }
    }

    // own line: a name-shaped line with speech on the line after it. A bare
    // "Name:" with nothing after the colon counts too.
    const bare = nameFrom(line.replace(/\s*:\s*$/, ''), roster);
    const next = lines.slice(i + 1).find((l) => l);
    if (next !== undefined && bare) {
      const nextInline = /^(.{1,60}?)\s*:\s+\S/.exec(next);
      const nextIsName = !!nameFrom(next.replace(/\s*:\s*$/, ''), roster)
        || !!(nextInline && nameFrom(nextInline[1], roster));
      // Two name-shaped lines in a row: the first one is speech ("Sarah Chen"
      // said as a sentence is rare; a label followed by a label is rarer).
      if (!nextIsName) { open(bare); continue; }
    }

    add(line);
  }

  const kept = blocks.filter((b) => b.words.length);
  return { blocks: kept, text: kept.map((b) => b.words.join(' ')).join(' ') };
}

// Map the words the differ just emitted back to their speakers.
// smartDiff always holds back the frame's LAST word and emits the run before
// it, so an emission of n words occupies the n slots ending one short of the
// end of the frame. (Its phrase de-duplication can shift that by a word or two;
// the run still lands in the right block except exactly at a speaker change.)
//   -> [{ who, text }]  consecutive same-speaker words merged, frame order kept.
function attributeEmission(frame, emitted, lastWho) {
  const words = String(emitted || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const blocks = (frame && frame.blocks) || [];
  const owners = [];
  for (const b of blocks) for (let i = 0; i < b.words.length; i++) owners.push(b.who);
  const fallback = lastWho || '';
  if (!owners.length) return [{ who: fallback, text: words.join(' ') }];

  // A lone word is the idle flush of the held-back last word itself.
  const end = words.length === 1 ? owners.length : Math.max(1, owners.length - 1);
  const start = end - words.length;
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const pos = Math.min(owners.length - 1, Math.max(0, start + i));
    const who = owners[pos] || fallback;
    const prev = out[out.length - 1];
    if (prev && prev.who === who) prev.text += ' ' + words[i];
    else out.push({ who, text: words[i] });
  }
  return out;
}

module.exports = { parseCaptionFrame, attributeEmission, looksLikeName, cleanNameCandidate, cleanOcrText, isSelf };
