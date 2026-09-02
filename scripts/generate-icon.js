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

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Missing build/icon-source.png');
    process.exit(1);
  }
  // 512px: electron-builder's Linux targets want at least 512x512.
  await square(512).toFile(PNG);
  console.log('Wrote', PNG);

  const buffers = await Promise.all(SIZES.map((s) => square(s).toBuffer()));
  const ico = await pngToIco(buffers);
  fs.writeFileSync(ICO, ico);
  console.log('Wrote', ICO, `(${SIZES.length} sizes)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
