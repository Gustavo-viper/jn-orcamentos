import { mkdir, readFile, writeFile } from "node:fs/promises";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const source = await readFile(path.join(projectDirectory, "build", "icon.png"));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (!source.subarray(0, 8).equals(signature)) throw new Error("O ícone da empresa não é um PNG válido.");

let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
let interlace = 0;
const compressedChunks = [];
for (let offset = 8; offset < source.length;) {
  const length = source.readUInt32BE(offset);
  const type = source.toString("ascii", offset + 4, offset + 8);
  const data = source.subarray(offset + 8, offset + 8 + length);
  if (type === "IHDR") {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
    interlace = data[12];
  } else if (type === "IDAT") compressedChunks.push(data);
  offset += length + 12;
  if (type === "IEND") break;
}

if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
  throw new Error("O ícone precisa ser PNG RGB/RGBA de 8 bits sem entrelaçamento.");
}

const channels = colorType === 6 ? 4 : 3;
const bytesPerRow = width * channels;
const inflated = inflateSync(Buffer.concat(compressedChunks));
const pixels = Buffer.alloc(height * bytesPerRow);

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

let inputOffset = 0;
for (let y = 0; y < height; y += 1) {
  const filter = inflated[inputOffset++];
  const rowOffset = y * bytesPerRow;
  for (let x = 0; x < bytesPerRow; x += 1) {
    const raw = inflated[inputOffset++];
    const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
    const above = y > 0 ? pixels[rowOffset + x - bytesPerRow] : 0;
    const upperLeft = y > 0 && x >= channels ? pixels[rowOffset + x - bytesPerRow - channels] : 0;
    let predictor = 0;
    if (filter === 1) predictor = left;
    else if (filter === 2) predictor = above;
    else if (filter === 3) predictor = Math.floor((left + above) / 2);
    else if (filter === 4) predictor = paeth(left, above, upperLeft);
    else if (filter !== 0) throw new Error(`Filtro PNG inválido: ${filter}`);
    pixels[rowOffset + x] = (raw + predictor) & 255;
  }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let k = 0; k < 8; k += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function resizePng(size) {
  const output = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.max(0, Math.min(height - 1, (y + 0.5) * height / size - 0.5));
    const y0 = Math.floor(sourceY), y1 = Math.min(height - 1, y0 + 1), fy = sourceY - y0;
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.max(0, Math.min(width - 1, (x + 0.5) * width / size - 0.5));
      const x0 = Math.floor(sourceX), x1 = Math.min(width - 1, x0 + 1), fx = sourceX - x0;
      const targetOffset = (y * size + x) * 4;
      const topLeft = (y0 * width + x0) * channels;
      const topRight = (y0 * width + x1) * channels;
      const bottomLeft = (y1 * width + x0) * channels;
      const bottomRight = (y1 * width + x1) * channels;
      for (let c = 0; c < 4; c += 1) {
        const channel = c === 3 && channels === 3 ? -1 : Math.min(c, channels - 1);
        const a = channel === -1 ? 255 : pixels[topLeft + channel];
        const b = channel === -1 ? 255 : pixels[topRight + channel];
        const d = channel === -1 ? 255 : pixels[bottomLeft + channel];
        const e = channel === -1 ? 255 : pixels[bottomRight + channel];
        const top = a + (b - a) * fx;
        const bottom = d + (e - d) * fx;
        output[targetOffset + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;
    output.copy(raw, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const image = Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return image;
}

const publicDirectory = path.join(projectDirectory, "public");
await mkdir(publicDirectory, { recursive: true });
for (const size of [192, 512]) {
  const output = path.join(publicDirectory, `pwa-icon-${size}.png`);
  await writeFile(output, resizePng(size));
  console.log(`Gerado ${path.relative(projectDirectory, output)} (${size}×${size})`);
}

