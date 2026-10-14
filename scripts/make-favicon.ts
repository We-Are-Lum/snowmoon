/**
 * The favicon: the pixel moon of the podcast cover and channel avatar (scripts/make_channel_art.py,
 * avatar_svg), paper cells on board black. The avatar's grid is 16 × 16, so at 16 px every cell is
 * one pixel. Drawn in code, no image model. Writes the three files Next.js picks up from src/app:
 *   icon.svg        modern browsers
 *   favicon.ico     16, 32 and 48 px (Safari and older browsers)
 *   apple-icon.png  180 px (iOS home screen)
 *
 *   npx tsx scripts/make-favicon.ts
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const APP = path.resolve(import.meta.dirname, '../src/app');
// make_channel_art.py's BOARD and PAPER.
const BOARD = '#0E0F13', PAPER = '#F4F2ED';

/** make_channel_art.py's crescent(): cells inside the moon's disc and outside the shadow's disc. */
function crescent(cx: number, cy: number, r: number, dx: number, dy: number, r2: number) {
  const cells: [number, number][] = [];
  for (let y = Math.trunc(cy - r) - 1; y < Math.trunc(cy + r) + 2; y++)
    for (let x = Math.trunc(cx - r) - 1; x < Math.trunc(cx + r) + 2; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && (x - cx - dx) ** 2 + (y - cy - dy) ** 2 > r2 * r2) cells.push([x, y]);
  return cells;
}
// The avatar's moon, the same arguments as avatar_svg().
const MOON = crescent(7.5, 7.5, 4.6, 2.3, -1.2, 4.1);

/** The 16 × 16 grid; `pad` cells of board around it (iOS crops the corners). */
const svg = (rx: number, pad = 0) => {
  const s = 16 + 2 * pad;
  const cells = MOON.map(([x, y]) => `<rect x="${x + pad}" y="${y + pad}" width="1" height="1"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges">`
    + `<rect width="${s}" height="${s}" rx="${rx}" fill="${BOARD}"/><g fill="${PAPER}">${cells}</g></svg>\n`;
};

await writeFile(path.join(APP, 'icon.svg'), svg(2));

const png = (src: string, size: number) => sharp(Buffer.from(src), { density: 72 * 16 }).resize(size, size, { kernel: 'nearest' }).png().toBuffer();

// ICO holding PNGs (every browser that reads favicon.ico reads PNG entries).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((n) => png(svg(2), n)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
await writeFile(path.join(APP, 'favicon.ico'), Buffer.concat([head, ...pngs]));

// 18 cells at 10 px; square and opaque, since iOS rounds the corners itself.
await writeFile(path.join(APP, 'apple-icon.png'), await sharp(await png(svg(0, 1), 180)).flatten({ background: BOARD }).png().toBuffer());

console.log('src/app/icon.svg, src/app/favicon.ico, src/app/apple-icon.png');
