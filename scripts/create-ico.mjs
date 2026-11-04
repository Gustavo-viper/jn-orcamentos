import { readFile, writeFile } from "node:fs/promises";

const png = await readFile(new URL("../build/icon.png", import.meta.url));
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon resource
header.writeUInt16LE(1, 4); // one PNG image
header.writeUInt8(0, 6); // 256px wide
header.writeUInt8(0, 7); // 256px high
header.writeUInt8(0, 8); // true-color image
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // color planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);

await writeFile(new URL("../build/icon.ico", import.meta.url), Buffer.concat([header, png]));
