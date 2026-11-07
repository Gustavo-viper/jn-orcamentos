// Remove o fundo escuro da logo oficial: node scripts/remove-bg.mjs entrada.jpg saida.png
// Preenche a partir das bordas apenas os pixels escuros conectados ao fundo,
// preservando contornos escuros internos; suaviza a transição na borda.
import sharp from 'sharp';

const [, , input, output] = process.argv;
const img = sharp(input).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const lum = (i) => Math.max(data[i], data[i + 1], data[i + 2]);
const BG = 60; // escuro o bastante para ser fundo
const bg = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (bg[p] || lum(p * 4) > BG) return;
  bg[p] = 1;
  stack.push(p);
};
for (let x = 0; x < W; x++) {
  push(x, 0);
  push(x, H - 1);
}
for (let y = 0; y < H; y++) {
  push(0, y);
  push(W - 1, y);
}
while (stack.length) {
  const p = stack.pop();
  const x = p % W;
  const y = (p / W) | 0;
  push(x + 1, y);
  push(x - 1, y);
  push(x, y + 1);
  push(x, y - 1);
}
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  if (bg[p]) {
    data[i + 3] = 0;
    continue;
  }
  // borda: pixel vizinho do fundo e ainda escuro → transparência parcial (anti-serrilhado)
  const x = p % W;
  const y = (p / W) | 0;
  const nearBg = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
  if (nearBg) {
    const l = lum(i);
    if (l < 110) data[i + 3] = Math.round(255 * Math.max(0, (l - BG) / (110 - BG)));
  }
}
await sharp(data, { raw: { width: W, height: H, channels: 4 } }).trim().png({ compressionLevel: 9 }).toFile(output);
console.log('ok', W, H);
