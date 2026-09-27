// End-to-end check of speaker naming on a recorded meeting, using the app's
// own speaker-detect and speaker-tracker.
//
//   node scripts/test-speaker-names.js <video> [--from 0] [--seconds 300] [--fps 2] [--out dir]
//     [--lag 1000]              delay between speech and the platform's frame
//     [--lags 0,500,1000]       compare delays against Deepgram's voice split
//
// Env:
//   FFMPEG            ffmpeg binary (required)
//   VISION_PROVIDER   anthropic | openai | xai, with VISION_KEY and VISION_MODEL,
//                     to read name labels the way the app does. Without it each
//                     tile position is named "Tile-N" and its label crop saved to --out.
//   DEEPGRAM_KEY      transcribe the video's audio and print every utterance with
//                     its speaker. Without it, prints who was framed over time.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { detectActiveTile } = require('../speaker-detect');
const { createSpeakerTracker } = require('../speaker-tracker');
const { completeChat } = require('../llm-providers');

const args = process.argv.slice(2);
const video = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FROM = Number(opt('from', 0)), SECONDS = Number(opt('seconds', 300)), FPS = Number(opt('fps', 2));
const OUT = opt('out', path.join(require('os').tmpdir(), 'speaker-names'));
const FF = process.env.FFMPEG || 'ffmpeg';
fs.mkdirSync(OUT, { recursive: true });

async function readName(png, key) {
  if (process.env.VISION_KEY) {
    return completeChat({
      provider: process.env.VISION_PROVIDER, apiKey: process.env.VISION_KEY, model: process.env.VISION_MODEL, maxTokens: 20,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'This is the name label from a video-call participant tile. Reply with the name exactly as written and nothing else. If no name is visible, reply NONE.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + png.toString('base64') } },
      ] }],
    });
  }
  const name = 'Tile@' + key.split(':')[1];
  fs.writeFileSync(path.join(OUT, name.replace(/[^\w@-]/g, '_') + '.png'), png);
  return name;
}

function probeSize() {
  const r = spawnSync(FF, ['-hide_banner', '-i', video], { encoding: 'utf8' });
  const m = /Video:.*?(\d{3,5})x(\d{3,5})/.exec(r.stderr);
  return { W: Number(m[1]), H: Number(m[2]) };
}

async function scanFrames(tracker) {
  const { W, H } = probeSize();
  const frameBytes = W * H * 3;
  const ff = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-ss', String(FROM), '-t', String(SECONDS), '-i', video,
    '-vf', `fps=${FPS}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let buf = Buffer.alloc(0), n = 0, hits = 0;
  const timeline = [];
  for await (const chunk of ff.stdout) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= frameBytes) {
      const frame = buf.subarray(0, frameBytes);
      buf = buf.subarray(frameBytes);
      const t = (n++ / FPS) * 1000;
      const det = detectActiveTile({ width: W, height: H, data: frame, channels: 3, bgr: false });
      if (det) hits++;
      const crop = det && await sharp(Buffer.from(frame), { raw: { width: W, height: H, channels: 3 } })
        .extract({ left: det.label.x, top: det.label.y, width: det.label.w, height: det.label.h }).png().toBuffer();
      tracker.observe(t, det, crop);
      timeline.push(t);
    }
  }
  await new Promise((r) => setTimeout(r, 12000)); // let pending name reads finish
  return { frames: n, hits, timeline };
}

async function transcribe() {
  const wav = path.join(OUT, 'audio.wav');
  spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(FROM), '-t', String(SECONDS), '-i', video, '-ac', '1', '-ar', '16000', wav]);
  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&diarize=true', {
    method: 'POST', headers: { Authorization: 'Token ' + process.env.DEEPGRAM_KEY, 'Content-Type': 'audio/wav' }, body: fs.readFileSync(wav),
  });
  if (!res.ok) throw new Error('Deepgram ' + res.status + ' ' + await res.text());
  return (await res.json()).results.utterances || [];
}

const fmt = (ms) => { const s = Math.round(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

async function main() {
  const tracker = createSpeakerTracker({ readName, keepMs: Infinity });
  const { frames, hits, timeline } = await scanFrames(tracker);
  console.log(`${path.basename(video)}  ${frames} frames at ${FPS} fps, highlight found in ${hits} (${(100 * hits / frames).toFixed(0)}%)\n`);
  if (process.env.DEEPGRAM_KEY) {
    const utterances = await transcribe();
    fs.writeFileSync(path.join(OUT, 'utterances.json'), JSON.stringify(utterances));
    // How well the framed names agree with Deepgram's own voice split, for a
    // range of assumed delays between speech and the platform's frame. Each
    // voice's name is the one it gets most often; agreement is weighted by
    // duration. Diarization makes its own mistakes, so this ranks delays
    // rather than scoring accuracy.
    for (const lag of (opt('lags', '') || '').split(',').filter(Boolean).map(Number)) {
      const rows = utterances.map((u) => ({ v: u.speaker, d: u.end - u.start, n: tracker.nameAt(u.start * 1000 + lag, u.end * 1000 + lag) }));
      const byVoice = new Map();
      for (const r of rows) if (r.n) { const m = byVoice.get(r.v) || new Map(); m.set(r.n, (m.get(r.n) || 0) + r.d); byVoice.set(r.v, m); }
      const top = new Map([...byVoice].map(([v, m]) => [v, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
      let agree = 0, total = 0;
      for (const r of rows) if (r.n) { total += r.d; if (top.get(r.v) === r.n) agree += r.d; }
      console.log(`lag ${String(lag).padStart(5)} ms: named ${rows.filter((r) => r.n).length}/${rows.length}, agrees with voice split ${(100 * agree / total).toFixed(1)}%`);
    }
    const lag = Number(opt('lag', 1000)); // the app's SCREEN_LAG_MS
    for (const u of utterances) {
      const who = tracker.whoSpoke(u.start * 1000 + lag, u.end * 1000 + lag, u.speaker) || 'Interviewer';
      console.log(`[${fmt(FROM * 1000 + u.start * 1000)}] (dg speaker ${u.speaker}) ${who}: ${u.transcript}`);
    }
    return;
  }
  let prev, since = 0;
  for (const t of timeline.concat([Infinity])) {
    const who = t === Infinity ? Symbol('end') : tracker.nameAt(t, t);
    if (who !== prev) {
      if (prev !== undefined) console.log(`${fmt(FROM * 1000 + since)} - ${fmt(FROM * 1000 + (t === Infinity ? timeline.at(-1) : t))}  ${prev || '(nobody framed)'}`);
      prev = who; since = t;
    }
  }
  if (!process.env.VISION_KEY) console.log(`\nLabel crops for each Tile-N are in ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
