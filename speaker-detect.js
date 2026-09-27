// Finds the active-speaker tile on a meeting screen.
//
// Meet, Teams and Zoom draw a coloured frame around whoever is talking. This
// module looks for that frame in a screenshot and returns its rectangle plus
// the rectangle of the tile's name label. It is pure (pixels in, rectangles
// out) so the same code runs on live screenshots in the app and on frames
// from recorded meetings in scripts/test-speaker-detect.js.

// Frame colours measured from real recordings at 100% display scale.
const PLATFORMS = [
  { name: 'meet', rgb: [169, 197, 247], tol: 38 },
  { name: 'teams', rgb: [89, 94, 197], tol: 40 },
  { name: 'zoom', rgb: [70, 217, 95], tol: 80 },
];

const SCALE = 2;          // work on a half-size image: the 4 px frame stays 2 px
const MIN_W = 110;        // full-size pixels; a tile smaller than this has no readable label
const MIN_H = 70;
const EDGE_COVERAGE = 0.6; // share of each bbox side that must be frame-coloured

// img: { width, height, data, channels: 3|4, bgr: bool } (Electron's
// nativeImage.toBitmap() is BGRA; sharp's raw output is RGB/RGBA).
function detectActiveTile(img) {
  const w = Math.floor(img.width / SCALE), h = Math.floor(img.height / SCALE);
  let best = null;
  for (const p of PLATFORMS) {
    const mask = colourMask(img, w, h, p);
    for (const box of components(mask, w, h)) {
      const bw = box.x2 - box.x1 + 1, bh = box.y2 - box.y1 + 1;
      if (bw * SCALE < MIN_W || bh * SCALE < MIN_H) continue;
      const cov = sideCoverage(mask, w, box);
      if (Math.min(cov.top, cov.bottom, cov.left, cov.right) < EDGE_COVERAGE) continue;
      if (interiorFill(mask, w, box) > 0.5) continue; // a filled blue area, not a frame
      const score = bw * bh;
      if (!best || score > best.score) best = { platform: p.name, box, score };
    }
  }
  if (!best) return null;
  const { box } = best;
  const tile = { x: box.x1 * SCALE, y: box.y1 * SCALE, w: (box.x2 - box.x1 + 1) * SCALE, h: (box.y2 - box.y1 + 1) * SCALE };
  return { platform: best.platform, tile, label: labelRect(best.platform, tile) };
}

// The name sits bottom-left inside the tile on all three platforms.
function labelRect(platform, t) {
  const lh = Math.max(28, Math.min(56, Math.round(t.h * 0.14)));
  return { x: t.x + 6, y: t.y + t.h - lh - 4, w: Math.round(t.w * 0.6), h: lh };
}

// A half-size pixel is on when any of its 2x2 source pixels matches, so a
// 2 px frame survives whatever row or column it starts on.
function colourMask(img, w, h, p) {
  const mask = new Uint8Array(w * h);
  const ch = img.channels, d = img.data, W = img.width;
  const [tr, tg, tb] = p.rgb, tol2 = p.tol * p.tol;
  const ri = img.bgr ? 2 : 0, bi = img.bgr ? 0 : 2;
  const match = (i) => {
    const dr = d[i + ri] - tr, dg = d[i + 1] - tg, db = d[i + bi] - tb;
    return dr * dr + dg * dg + db * db <= tol2;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y * SCALE) * W + x * SCALE) * ch;
      if (match(i) || match(i + ch) || match(i + W * ch) || match(i + W * ch + ch)) mask[y * w + x] = 1;
    }
  }
  return mask;
}

// Bounding boxes of 8-connected mask regions.
function components(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let top = 0, n = 0;
    stack[top++] = s; seen[s] = 1;
    let x1 = w, y1 = h, x2 = 0, y2 = 0;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      n++;
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (n >= 40) out.push({ x1, y1, x2, y2, n });
  }
  return out;
}

// Rounded corners eat the ends of each side, so only the middle 70% counts.
// A side position counts as covered if any of the 3 pixels inward is framed.
function sideCoverage(mask, w, b) {
  const inset = (a, z) => [a + Math.floor((z - a) * 0.15), z - Math.floor((z - a) * 0.15)];
  const [xa, xz] = inset(b.x1, b.x2), [ya, yz] = inset(b.y1, b.y2);
  const at = (x, y) => mask[y * w + x];
  let top = 0, bottom = 0, left = 0, right = 0;
  for (let x = xa; x <= xz; x++) {
    if (at(x, b.y1) || at(x, b.y1 + 1) || at(x, b.y1 + 2)) top++;
    if (at(x, b.y2) || at(x, b.y2 - 1) || at(x, b.y2 - 2)) bottom++;
  }
  for (let y = ya; y <= yz; y++) {
    if (at(b.x1, y) || at(b.x1 + 1, y) || at(b.x1 + 2, y)) left++;
    if (at(b.x2, y) || at(b.x2 - 1, y) || at(b.x2 - 2, y)) right++;
  }
  const nx = xz - xa + 1, ny = yz - ya + 1;
  return { top: top / nx, bottom: bottom / nx, left: left / ny, right: right / ny };
}

function interiorFill(mask, w, b) {
  const ix1 = b.x1 + Math.floor((b.x2 - b.x1) * 0.2), ix2 = b.x2 - Math.floor((b.x2 - b.x1) * 0.2);
  const iy1 = b.y1 + Math.floor((b.y2 - b.y1) * 0.2), iy2 = b.y2 - Math.floor((b.y2 - b.y1) * 0.2);
  let n = 0, t = 0;
  for (let y = iy1; y <= iy2; y += 2) for (let x = ix1; x <= ix2; x += 2) { t++; n += mask[y * w + x]; }
  return t ? n / t : 0;
}

module.exports = { detectActiveTile, PLATFORMS };
