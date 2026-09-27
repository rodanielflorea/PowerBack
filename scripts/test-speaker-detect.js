// Runs speaker-detect over frames extracted from a recorded meeting and writes
// a contact sheet of each detected tile (frame, tile outline, label crop) for
// eyeballing. Usage: node scripts/test-speaker-detect.js <frames-dir> <out.png>
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { detectActiveTile } = require('../speaker-detect');

async function main() {
  const [dir, out] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  const cells = [];
  let hits = 0, ms = 0;
  for (const f of files) {
    const { data, info } = await sharp(path.join(dir, f)).raw().toBuffer({ resolveWithObject: true });
    const t0 = Date.now();
    const r = detectActiveTile({ width: info.width, height: info.height, data, channels: info.channels, bgr: false });
    ms += Date.now() - t0;
    if (r) hits++;
    console.log(f, r ? `${r.platform} tile ${r.tile.x},${r.tile.y} ${r.tile.w}x${r.tile.h}` : '-');
    if (!out) continue;
    const thumb = await sharp(path.join(dir, f)).resize(480, 270).png().toBuffer();
    const comps = [];
    if (r) {
      const s = 480 / info.width;
      const svg = `<svg width="480" height="270"><rect x="${r.tile.x * s}" y="${r.tile.y * s}" width="${r.tile.w * s}" height="${r.tile.h * s}" fill="none" stroke="red" stroke-width="3"/></svg>`;
      comps.push({ input: Buffer.from(svg) });
    }
    const cell = await sharp(thumb).composite(comps).png().toBuffer();
    const label = r
      ? await sharp(path.join(dir, f)).extract({ left: r.label.x, top: r.label.y, width: r.label.w, height: r.label.h }).resize(480, 60, { fit: 'contain', background: '#000' }).png().toBuffer()
      : await sharp({ create: { width: 480, height: 60, channels: 3, background: '#400' } }).png().toBuffer();
    cells.push(await sharp({ create: { width: 480, height: 330, channels: 3, background: '#000' } })
      .composite([{ input: cell, top: 0, left: 0 }, { input: label, top: 270, left: 0 }]).png().toBuffer());
  }
  console.log(`\n${hits}/${files.length} frames with a tile, ${(ms / files.length).toFixed(0)} ms/frame`);
  if (!out || !cells.length) return;
  const cols = 4, rows = Math.ceil(cells.length / cols);
  await sharp({ create: { width: cols * 480, height: rows * 330, channels: 3, background: '#222' } })
    .composite(cells.map((c, i) => ({ input: c, left: (i % cols) * 480, top: Math.floor(i / cols) * 330 })))
    .png().toFile(out);
}
main();
