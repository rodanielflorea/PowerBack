const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const SVG = path.join(__dirname, '..', 'build', 'icon.svg');
const PNG = path.join(__dirname, '..', 'build', 'icon.png');
const ICO = path.join(__dirname, '..', 'build', 'icon.ico');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

(async () => {
  if (!fs.existsSync(SVG)) {
    console.error('Missing build/icon.svg');
    process.exit(1);
  }
  await sharp(SVG, { density: 384 }).resize(256, 256).png().toFile(PNG);
  console.log('Wrote', PNG);

  const buffers = await Promise.all(
    SIZES.map((s) =>
      sharp(SVG, { density: 384 }).resize(s, s).png().toBuffer()
    )
  );
  const ico = await pngToIco(buffers);
  fs.writeFileSync(ICO, ico);
  console.log('Wrote', ICO, `(${SIZES.length} sizes)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
