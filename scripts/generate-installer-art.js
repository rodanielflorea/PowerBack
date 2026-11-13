// Branded art for the Windows installer: the welcome/finish sidebar and the
// inner-page header, so the setup clearly reads as the Ace app. Rendered from
// the Ace logo + brand colors with sharp, written as 24-bit BMP (what NSIS
// wants). Run before electron-builder (the build script does).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'build');
const ACCENT = '#7c6cff';
const ACCENT2 = '#9b6bff';

// The Ace "A" mark (same paths as the app's logo).
function mark(x, y, size, inkColor) {
  return `<g transform="translate(${x},${y}) scale(${size / 100})">
    <path d="M50 8 92 92H75L50 42 25 92H8Z" fill="${inkColor}"/>
    <path d="M50 58 67 92H53L50 86 47 92H33Z" fill="${ACCENT}"/>
  </g>`;
}

// 164 x 314 welcome/finish sidebar: a dark panel with an accent glow, the mark,
// the Ace wordmark and a one-line tagline.
function sidebarSvg() {
  const W = 164, H = 314;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1a1726"/>
        <stop offset="0.55" stop-color="#141019"/>
        <stop offset="1" stop-color="#0d0b12"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.30" r="0.62">
        <stop offset="0" stop-color="${ACCENT2}" stop-opacity="0.45"/>
        <stop offset="1" stop-color="${ACCENT2}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <circle cx="82" cy="96" r="54" fill="#ffffff" opacity="0.05"/>
    <circle cx="82" cy="96" r="54" fill="none" stroke="${ACCENT}" stroke-opacity="0.35" stroke-width="1.5"/>
    ${mark(50, 60, 64, '#ffffff')}
    <text x="82" y="196" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff" letter-spacing="1">Ace</text>
    <text x="82" y="222" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" fill="${ACCENT2}" letter-spacing="1.5">ANSWER&#160;COACHING</text>
    <text x="82" y="237" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" fill="${ACCENT2}" letter-spacing="1.5">ENGINE</text>
    <rect x="52" y="256" width="60" height="2" rx="1" fill="${ACCENT}" opacity="0.8"/>
    <text x="82" y="286" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="10.5" fill="#8b84a0">Real-time meeting</text>
    <text x="82" y="300" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="10.5" fill="#8b84a0">&amp; interview assistant</text>
  </svg>`;
}

// 150 x 57 header strip for the inner pages: light, with the mark and wordmark
// on the left (NSIS draws it top-right by default; electron-builder places it).
function headerSvg() {
  const W = 150, H = 57;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    ${mark(12, 11, 34, '#14121f')}
    <text x="54" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="19" font-weight="700" fill="#14121f">Ace</text>
    <text x="54" y="42" font-family="Segoe UI, Arial, sans-serif" font-size="8.5" font-weight="600" fill="${ACCENT}" letter-spacing="0.5">SETUP</text>
  </svg>`;
}

// Raw top-down RGB (alpha flattened onto bg) -> 24-bit BI_RGB BMP (bottom-up,
// BGR, rows padded to 4 bytes).
function toBmp(rgb, w, h) {
  const rowRaw = w * 3;
  const rowPad = (rowRaw + 3) & ~3;
  const pixels = Buffer.alloc(rowPad * h);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * rowRaw; // flip to bottom-up
    const dst = y * rowPad;
    for (let x = 0; x < w; x++) {
      pixels[dst + x * 3] = rgb[src + x * 3 + 2];     // B
      pixels[dst + x * 3 + 1] = rgb[src + x * 3 + 1]; // G
      pixels[dst + x * 3 + 2] = rgb[src + x * 3];     // R
    }
  }
  const header = Buffer.alloc(54);
  header.write('BM', 0);
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);       // pixel data offset
  header.writeUInt32LE(40, 14);       // DIB header size
  header.writeInt32LE(w, 18);
  header.writeInt32LE(h, 22);
  header.writeUInt16LE(1, 26);        // planes
  header.writeUInt16LE(24, 28);       // bpp
  header.writeUInt32LE(0, 30);        // BI_RGB
  header.writeUInt32LE(pixels.length, 34);
  header.writeInt32LE(2835, 38);      // 72 DPI
  header.writeInt32LE(2835, 42);
  return Buffer.concat([header, pixels]);
}

async function renderBmp(svg, w, h, bg, out) {
  const rgb = await sharp(Buffer.from(svg))
    .resize(w, h)
    .flatten({ background: bg })
    .removeAlpha()
    .raw()
    .toBuffer();
  fs.writeFileSync(out, toBmp(rgb, w, h));
  console.log('wrote', path.relative(path.join(__dirname, '..'), out), `(${w}x${h})`);
}

(async () => {
  await renderBmp(sidebarSvg(), 164, 314, '#0d0b12', path.join(OUT, 'installerSidebar.bmp'));
  await renderBmp(sidebarSvg(), 164, 314, '#0d0b12', path.join(OUT, 'uninstallerSidebar.bmp'));
  await renderBmp(headerSvg(), 150, 57, '#ffffff', path.join(OUT, 'installerHeader.bmp'));
})().catch((e) => { console.error('installer art failed:', e.message); process.exit(1); });
