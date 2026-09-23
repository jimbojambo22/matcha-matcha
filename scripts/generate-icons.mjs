// Generate PWA / home-screen icons: the matcha bowl art on the card back's
// pink. Run: npm run icons
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bowl = resolve(root, 'src/assets/Matcha_cup.svg');
const out = resolve(root, 'public/icons');
mkdirSync(out, { recursive: true });

/** The card back's background colour (src/assets/cardback.svg). */
const PINK = '#f9accd';

/** The bowl (with whisk and drop shadow), rendered large and trimmed to its edges. */
async function bowlArt() {
  return sharp(bowl, { density: 288 }) // 4x the SVG's 822px width
    .trim() // the art sits on a transparent page; cut the empty margin
    .png()
    .toBuffer();
}

const art = await bowlArt();

async function icon(size, artScale, file) {
  const scaled = await sharp(art).resize({ width: Math.round(size * artScale) }).png().toBuffer();
  const buf = await sharp({ create: { width: size, height: size, channels: 4, background: PINK } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .flatten({ background: PINK }) // iOS home-screen icons must be opaque
    .png()
    .toBuffer();
  writeFileSync(resolve(out, file), buf);
  console.log('wrote', file);
  return buf;
}

await icon(192, 0.76, 'icon-192.png');
await icon(512, 0.76, 'icon-512.png');
await icon(512, 0.6, 'icon-maskable-512.png'); // extra padding = maskable safe zone
await icon(180, 0.76, 'apple-touch-icon.png');

// Favicon: a small rounded-square version, wrapped in SVG so index.html's
// <link rel="icon" href="icons/icon.svg"> keeps working.
const fav = await icon(128, 0.8, 'favicon-128.png');
writeFileSync(
  resolve(out, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><clipPath id="r"><rect width="128" height="128" rx="28"/></clipPath><image clip-path="url(#r)" width="128" height="128" href="data:image/png;base64,${fav.toString('base64')}"/></svg>\n`,
);
console.log('wrote icon.svg');
console.log('done');
