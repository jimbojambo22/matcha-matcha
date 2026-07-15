// Generate PWA icons from the leaf suit art. Run: npm run icons
import sharp from 'sharp';
import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const leaf = resolve(root, 'src/assets/leaf.svg');
const out = resolve(root, 'public/icons');
mkdirSync(out, { recursive: true });

async function icon(size, leafScale, file, background = '#fff7fb') {
  const art = await sharp(leaf)
    .resize(Math.round(size * leafScale))
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toFile(resolve(out, file));
  console.log('wrote', file);
}

await icon(192, 0.68, 'icon-192.png');
await icon(512, 0.68, 'icon-512.png');
await icon(512, 0.55, 'icon-maskable-512.png'); // extra padding = maskable safe zone
await icon(180, 0.68, 'apple-touch-icon.png');
copyFileSync(leaf, resolve(out, 'icon.svg')); // favicon
console.log('done');
