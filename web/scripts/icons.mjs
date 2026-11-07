// Gera ícones do PWA e as versões web/PDF a partir da logo oficial sem fundo:
//   node scripts/remove-bg.mjs <logo-original.jpg> assets-src/logo-jn-original.png
//   node scripts/icons.mjs
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'assets-src', 'logo-jn-original.png');
const pub = (f) => path.join(root, 'public', f);
const base = await sharp(src).resize({ width: 800 }).png().toBuffer();

async function icon(size, pad, out) {
  const inner = await sharp(base).resize({ width: Math.round(size * (1 - pad * 2)) }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#0b0b0d' } }).composite([{ input: inner, gravity: 'center' }]).png().toFile(pub(out));
}
await icon(512, 0.04, 'icon-512.png');
await icon(192, 0.04, 'icon-192.png');
await icon(180, 0.05, 'apple-touch-icon.png');
await icon(64, 0.02, 'favicon-64.png');
await icon(512, 0.12, 'icon-maskable-512.png');
await sharp(base).webp({ quality: 88, alphaQuality: 95 }).toFile(pub('logo-jn.webp'));
await sharp(base).resize({ width: 480 }).png({ compressionLevel: 9 }).toFile(pub('logo-jn-pdf.png'));
console.log('Logo e ícones gerados.');
