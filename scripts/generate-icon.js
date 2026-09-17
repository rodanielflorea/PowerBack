const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

// Source raster image for the app icon. Drop a square PNG here to change the icon.
const SRC = path.join(__dirname, '..', 'build', 'icon-source.png');
const PNG = path.join(__dirname, '..', 'build', 'icon.png');
const ICO = path.join(__dirname, '..', 'build', 'icon.ico');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Resize to a square, preserving aspect ratio with transparent padding so a
// non-square source isn't distorted.
function square(size) {
  return sharp(SRC)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png();
}

function isFresh(out) {
  try {
    return fs.statSync(out).mtimeMs >= fs.statSync(SRC).mtimeMs;
  } catch {
    return false;
  }
}

// Windows Explorer / COM Surrogate (dllhost) memory-maps .ico files for
// thumbnails. Overwrite then fails with UNKNOWN / "user-mapped section",
// but renaming the locked file still works.
function writeFileReplace(dest, data) {
  const tmp = `${dest}.tmp`;
  const bak = `${dest}.bak`;
  fs.writeFileSync(tmp, data);
  if (fs.existsSync(dest)) {
    try {
      fs.unlinkSync(dest);
    } catch {
      try {
        if (fs.existsSync(bak)) fs.unlinkSync(bak);
      } catch {
        /* leftover bak from a previous run */
      }
      fs.renameSync(dest, bak);
    }
  }
  fs.renameSync(tmp, dest);
  try {
    if (fs.existsSync(bak)) fs.unlinkSync(bak);
  } catch {
    /* bak may still be mapped; harmless leftover */
  }
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Missing build/icon-source.png');
    process.exit(1);
  }
  if (isFresh(PNG) && isFresh(ICO)) {
    console.log('Icons up to date');
    return;
  }
  // 512px: electron-builder's Linux targets want at least 512x512.
  const pngBuf = await square(512).toBuffer();
  writeFileReplace(PNG, pngBuf);
  console.log('Wrote', PNG);

  const buffers = await Promise.all(SIZES.map((s) => square(s).toBuffer()));
  const ico = await pngToIco(buffers);
  writeFileReplace(ICO, ico);
  console.log('Wrote', ICO, `(${SIZES.length} sizes)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
