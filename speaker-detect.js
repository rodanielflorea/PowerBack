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
  // Meet frames a tile whose camera is off in cyan instead.
  { name: 'meet', rgb: [88, 212, 249], tol: 38 },
  { name: 'teams', rgb: [89, 94, 197], tol: 40 },
  { name: 'zoom', rgb: [70, 217, 95], tol: 80 },
];

const SCALE = 2;          // work on a half-size image: the 4 px frame stays 2 px
const MIN_W = 110;        // full-size pixels; a tile smaller than this has no readable label
const MIN_H = 50;
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
      // Three sides are enough: a window lying over the meeting (a caption
      // popup, a tooltip) may hide one edge of the frame. The bottom, where the
      // name is, must be there.
      const sides = [cov.top, cov.left, cov.right].filter((c) => c >= EDGE_COVERAGE).length;
      if (cov.bottom < EDGE_COVERAGE || sides < 2) continue;
      if (interiorFill(mask, w, box) > 0.5) continue; // a filled blue area, not a frame
      const score = bw * bh;
      if (!best || score > best.score) best = { platform: p.name, box, score };
    }
  }
  if (!best) return detectSpeakingIcon(img, w, h);
  const { box } = best;
  const tile = { x: box.x1 * SCALE, y: box.y1 * SCALE, w: (box.x2 - box.x1 + 1) * SCALE, h: (box.y2 - box.y1 + 1) * SCALE };
  return { platform: best.platform, tile, label: labelRect(best.platform, tile) };
}

// Meet draws no frame in a one-to-one call or around a pinned tile: the only
// sign of who is talking is the round icon with three bars in the tile's top
// right corner. Find the icon, then the tile around it: from the icon, walk
// outward until the page background begins.
const ICON = { rgb: [168, 197, 248], tol: 30, min: 20, max: 40 };
function detectSpeakingIcon(img, w, h) {
  const mask = colourMask(img, w, h, ICON);
  const ch = img.channels, d = img.data, W = img.width, H = img.height;
  const ri = img.bgr ? 2 : 0, bi = img.bgr ? 0 : 2;
  const at = (x, y) => { const i = (y * W + x) * ch; return [d[i + ri], d[i + 1], d[i + bi]]; };
  const isBg = (x, y) => { const [r, g, b] = at(x, y); return Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 8 && r < 34; };
  // Distance from (x, y) in direction (dx, dy) to the first stretch of background.
  const reach = (x, y, dx, dy) => {
    let run = 0, n = 0;
    for (; x >= 0 && y >= 0 && x < W && y < H; x += dx, y += dy, n++) {
      run = isBg(x, y) ? run + 1 : 0;
      if (run >= 8) return n - 8;
    }
    return n - run;
  };
  let best = null;
  for (const box of components(mask, w, h)) {
    const bw = (box.x2 - box.x1 + 1) * SCALE, bh = (box.y2 - box.y1 + 1) * SCALE;
    if (bw < ICON.min || bw > ICON.max || bh < ICON.min || bh > ICON.max || Math.abs(bw - bh) > 6) continue;
    const fill = box.n * SCALE * SCALE / (bw * bh);
    if (fill < 0.45 || fill > 0.95) continue;
    const cx = Math.round((box.x1 + box.x2 + 1) * SCALE / 2), cy = Math.round((box.y1 + box.y2 + 1) * SCALE / 2);
    const [r, g, b] = at(cx, cy);
    if (!(r < 70 && b > 70 && b > r + 40)) continue;   // the dark blue middle bar
    const right = cx + reach(cx, cy, 1, 0), top = cy - reach(cx, cy, 0, -1);
    if (right - cx > 80 || cy - top > 80) continue;       // the icon sits in the corner
    let bottom = 0, left = W;
    for (const x of [cx, right - 12, right - 40]) bottom = Math.max(bottom, cy + reach(x, cy, 0, 1));
    for (const y of [cy, Math.round((cy + bottom) / 2), bottom - 20]) left = Math.min(left, cx - reach(cx, y, -1, 0));
    const tile = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
    if (tile.w < MIN_W || tile.h < 70) continue;
    if (!best || tile.w * tile.h > best.tile.w * best.tile.h) best = { platform: 'meet', tile, label: labelRect('meet', tile) };
  }
  return best;
}

// The name sits bottom-left inside the tile on all three platforms and may run
// the whole width of a small tile, so the crop spans the tile: a narrower one
// cut "Bruce Clounie" down to "Bruce Cloun".
function labelRect(platform, t) {
  const lh = Math.max(30, Math.min(60, Math.round(t.h * 0.16)));
  return { x: t.x + 4, y: t.y + t.h - lh - 4, w: Math.min(t.w - 8, 560), h: lh };
}

// A coarse picture of the label's bright (text) pixels, to notice that the
// name at a tile position changed. The label sits over live video, so this
// only prompts a fresh read; it never decides a name. rect is in image pixels.
const SIG_W = 24, SIG_H = 6;
function labelSignature(img, rect) {
  const sig = new Uint8Array(SIG_W * SIG_H);
  const ch = img.channels, d = img.data, W = img.width;
  const cw = rect.w / SIG_W, chh = rect.h / SIG_H;
  for (let sy = 0; sy < SIG_H; sy++) for (let sx = 0; sx < SIG_W; sx++) {
    const x0 = Math.floor(rect.x + sx * cw), x1 = Math.max(x0 + 1, Math.floor(rect.x + (sx + 1) * cw));
    const y0 = Math.floor(rect.y + sy * chh), y1 = Math.max(y0 + 1, Math.floor(rect.y + (sy + 1) * chh));
    let n = 0, t = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= img.height) continue;
      const i = (y * W + x) * ch;
      t++;
      if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) n++;
    }
    sig[sy * SIG_W + sx] = t ? Math.round(255 * n / t) : 0;
  }
  return sig;
}
function signatureDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / (a.length * 255);
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

const api = { detectActiveTile, labelRect, labelSignature, signatureDistance, PLATFORMS };
// Node (main process, scripts) and a plain <script> (the screen-watch window).
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else self.SpeakerDetect = api;
