// Gera os ícones PNG do PWA a partir de public/logo.svg: node scripts/icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'logo.svg'));
for (const size of [192, 512, 180, 64]) {
  const name = size === 180 ? 'apple-touch-icon.png' : size === 64 ? 'favicon-64.png' : `icon-${size}.png`;
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path.join(pub, name));
}
// ícone "maskable" com margem de segurança
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0a1630' } })
  .composite([{ input: await sharp(svg, { density: 300 }).resize(400, 400).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(path.join(pub, 'icon-maskable-512.png'));
// logotipo para o PDF
await sharp(svg, { density: 300 }).resize(256, 256).png().toFile(path.join(pub, 'logo-256.png'));
console.log('Ícones gerados.');
