// Tests for speakers.js, run against the REAL smartDiff lifted out of main.js
// (it is not importable: main.js boots Electron). Usage: node scripts/test-speakers.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseCaptionFrame, attributeEmission, looksLikeName, cleanNameCandidate, cleanOcrText, isSelf } = require('../speakers');

// ── lift smartDiff + helpers out of main.js ─────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const from = src.indexOf('const MAX_HISTORY_WORDS');
const to = src.indexOf('// ── Built-in API keys');
assert(from > 0 && to > from, 'could not locate smartDiff in main.js');
const ctx = vm.createContext({});
vm.runInContext('let pastedHistory = []; let win = null;\n' + src.slice(from, to) + '\nthis.smartDiff = smartDiff; this.resetSmartDiffState = resetSmartDiffState;', ctx);

// Feed frames the way captureTick does; collect merged { who, text } turns.
function run(frames, opts) {
  ctx.resetSmartDiffState();
  const turns = [];
  let lastWho = '';
  for (const raw of frames) {
    const frame = parseCaptionFrame(raw, opts);
    const emitted = ctx.smartDiff(frame.text).trim();
    for (const seg of attributeEmission(frame, emitted, lastWho)) {
      lastWho = seg.who || lastWho;
      const prev = turns[turns.length - 1];
      if (prev && prev.who === seg.who) prev.text += ' ' + seg.text;
      else turns.push({ ...seg });
    }
  }
  return turns;
}
const idle = (f, n = 6) => Array(n).fill(f);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

// ── name shape ──────────────────────────────────────────────────────────────
test('accepts real names', () => {
  for (const n of ['Sarah Chen', 'Marcus', "Conor O'Brien", 'Ana de la Cruz', 'Jean-Luc Picard', 'Zoë Müller', 'You', 'You (Sarah)'])
    assert(looksLikeName(n), n);
});
test('rejects short speech', () => {
  for (const n of ['Thank You', 'Good Morning', 'Yeah', 'Okay Sure', 'Thanks Sarah', 'Note', 'So', 'Right.', 'Step 2', 'we should ship', 'This Is A Long Sentence Here'])
    assert(!looksLikeName(n), n);
});
test('strips clock, icon junk and avatar initials', () => {
  assert.strictEqual(cleanNameCandidate('Sarah Chen 10:32'), 'Sarah Chen');
  assert.strictEqual(cleanNameCandidate('Sarah Chen 10:32 AM'), 'Sarah Chen');
  assert.strictEqual(cleanNameCandidate('SC Sarah Chen'), 'Sarah Chen');
  assert.strictEqual(cleanNameCandidate('© Marcus Lee'), 'Marcus Lee');
  assert.strictEqual(cleanNameCandidate('AB Sarah Chen'), 'AB Sarah Chen'); // initials do not match: keep
});
test('self label', () => { assert(isSelf('You')); assert(isSelf('you (Sarah)')); assert(!isSelf('Young Kim')); });

// ── frame parsing ───────────────────────────────────────────────────────────
test('inline layout', () => {
  const f = parseCaptionFrame('Sarah Chen: so what I would do\nis start small\nMarcus Lee: does that scale');
  assert.deepStrictEqual(f.blocks.map((b) => b.who), ['Sarah Chen', 'Marcus Lee']);
  assert.strictEqual(f.text, 'so what I would do is start small does that scale');
});
test('own-line layout, with timestamps', () => {
  const f = parseCaptionFrame('Sarah Chen 10:32\nso what I would do\n\nMarcus Lee 10:33\ndoes that scale');
  assert.deepStrictEqual(f.blocks.map((b) => b.who), ['Sarah Chen', 'Marcus Lee']);
  assert.strictEqual(f.text, 'so what I would do does that scale');
});
test('words above the first name have no owner', () => {
  const f = parseCaptionFrame('start with the cache layer\nMarcus Lee\ndoes that scale');
  assert.deepStrictEqual(f.blocks.map((b) => b.who), ['', 'Marcus Lee']);
});
test('speech with a colon is not a name', () => {
  const f = parseCaptionFrame("So here's the thing: we never tested it\nNote: this is important");
  assert.deepStrictEqual(f.blocks.map((b) => b.who), ['']);
  assert(f.text.includes('Note:'));
});
test('a name-shaped last line is speech (nothing under it yet)', () => {
  const f = parseCaptionFrame('Marcus Lee\nI agree with\nSarah Chen');
  assert.deepStrictEqual(f.blocks.map((b) => b.who), ['Marcus Lee']);
  assert(f.text.endsWith('Sarah Chen'));
});
test('roster admits a name the shape check would reject', () => {
  assert.deepStrictEqual(parseCaptionFrame('dev team 2: hello all').blocks.map((b) => b.who), ['']);
  assert.deepStrictEqual(parseCaptionFrame('dev team 2: hello all', { roster: ['Dev Team 2'] }).blocks.map((b) => b.who), ['dev team 2']);
});

// ── end to end through the real smartDiff ───────────────────────────────────
const S = 'so what I would do is start with the cache layer';
const M = 'but does that scale past one region';
test('own-line: growing captions, speaker change, name scrolls off', () => {
  const frames = [
    'Sarah Chen\nso what I would',
    'Sarah Chen\nso what I would do is start with the',
    `Sarah Chen\n${S}\nMarcus Lee\nbut does that`,
    `do is start with the cache layer\nMarcus Lee\n${M}`, // Sarah's label scrolled off
    ...idle(`do is start with the cache layer\nMarcus Lee\n${M}`),
  ];
  assert.deepStrictEqual(run(frames), [{ who: 'Sarah Chen', text: S }, { who: 'Marcus Lee', text: M }]);
});
test('inline: same conversation', () => {
  const frames = [
    'Sarah Chen: so what I would',
    'Sarah Chen: so what I would do is start with the',
    `Sarah Chen: ${S}\nMarcus Lee: but does that`,
    `Sarah Chen: ${S}\nMarcus Lee: ${M}`,
    ...idle(`Sarah Chen: ${S}\nMarcus Lee: ${M}`),
  ];
  assert.deepStrictEqual(run(frames), [{ who: 'Sarah Chen', text: S }, { who: 'Marcus Lee', text: M }]);
});
test('names never leak into the speech', () => {
  const frames = [`Sarah Chen\n${S}`, ...idle(`Sarah Chen\n${S}`)];
  const all = run(frames).map((t) => t.text).join(' ');
  assert(!/Sarah|Chen/.test(all), all);
});
test('no names on screen: behaves like before, one unnamed speaker', () => {
  const frames = ['so what I would', `${S}`, ...idle(S)];
  assert.deepStrictEqual(run(frames), [{ who: '', text: S }]);
});
test('label scrolled off from the start: carried once a name is known', () => {
  const frames = [
    `Sarah Chen\n${S}`,
    ...idle(`Sarah Chen\n${S}`),
    `${S} and then the queue`,             // label gone, she keeps talking
    ...idle(`${S} and then the queue`),
  ];
  assert.deepStrictEqual(run(frames), [{ who: 'Sarah Chen', text: S + ' and then the queue' }]);
});

// ── the differ itself: every word exactly once ──────────────────────────────
// Regression: the held-back last word used to be dropped once the next frame
// confirmed it, losing a word per tick and then re-emitting the tail.
const plain = (frames) => run(frames).map((t) => t.text).join(' ');
test('differ: growing caption loses nothing', () => {
  assert.strictEqual(plain(['so what I would', 'so what I would do is start with the', S, ...idle(S)]), S);
});
test('differ: last word still being typed', () => {
  assert.strictEqual(plain(['so what I wou', 'so what I would do is sta', S, ...idle(S)]), S);
});
test('differ: OCR misreads a letter for one frame', () => {
  assert.strictEqual(plain(['so what I would', 'so what l would do is start with the', S, ...idle(S)]), S);
});
test('differ: long speech through a scrolling window', () => {
  const long = 'we moved the whole ingest path onto a queue so the api tier never blocks on the warehouse and that cut our p99 by about half';
  const w = long.split(' ');
  const frames = [];
  for (let i = 4; i <= w.length; i += 3) frames.push(w.slice(Math.max(0, i - 14), i).join(' '));
  frames.push(w.slice(-14).join(' '));
  assert.strictEqual(plain([...frames, ...idle(frames[frames.length - 1])]), long);
});

// ── real tesseract output (5.3.4, psm 6) captured from rendered caption panels ──
test('tesseract: lone capital I read as a pipe is repaired', () => {
  assert.strictEqual(cleanOcrText('so what | would do'), 'so what I would do');
  assert.strictEqual(cleanOcrText('| think so'), 'I think so');
  assert.strictEqual(cleanOcrText('(| agree)'), '(I agree)');
  assert.strictEqual(cleanOcrText('a || b'), 'a || b');   // not a lone pipe
  assert.strictEqual(cleanOcrText('x|y'), 'x|y');          // inside a token
});
test('tesseract: Meet-style panel, blank lines between blocks', () => {
  const f = parseCaptionFrame('Sarah Chen\n\nso what | would do is start with the cache layer\nMarcus Lee\n\nbut does that scale past one region\n\nYou\n\nyeah we shard by region');
  assert.deepStrictEqual(f.blocks.map((b) => b.who), ['Sarah Chen', 'Marcus Lee', 'You']);
  assert.strictEqual(f.blocks[0].words.join(' '), 'so what I would do is start with the cache layer');
});
test('tesseract: Zoom-style inline panel', () => {
  const f = parseCaptionFrame('Sarah Chen: so what | would do is start with the cache layer\nMarcus Lee: but does that scale past one region\nYou: yeah we shard by region');
  assert.deepStrictEqual(f.blocks.map((b) => b.who), ['Sarah Chen', 'Marcus Lee', 'You']);
});

console.log(`\n${passed} passed`);
