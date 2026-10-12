/**
 * Image output for the terrain renders (maps v4): PNG writers for 8-bit RGBA, 8-bit grey and
 * 16-bit grey, nearest/bilinear resampling, and tile slicing. No image library, no image model.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
/** colorType 6 = RGBA8, 2 = RGB8, 0 = grey (bitDepth 8 or 16). */
function encode(w: number, h: number, bytesPerPixel: number, colorType: number, bitDepth: number, row: (y: number, out: Buffer, off: number) => void): Buffer {
  const stride = w * bytesPerPixel + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    row(y, raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
export type RGBA = { w: number; h: number; px: Uint8ClampedArray };
export const rgbaPng = (img: RGBA) => encode(img.w, img.h, 4, 6, 8, (y, out, off) => { for (let i = 0; i < img.w * 4; i++) out[off + i] = img.px[y * img.w * 4 + i]; });
export const rgbPng = (img: RGBA) => encode(img.w, img.h, 3, 2, 8, (y, out, off) => { for (let x = 0; x < img.w; x++) { const s = (y * img.w + x) * 4; out[off + x * 3] = img.px[s]; out[off + x * 3 + 1] = img.px[s + 1]; out[off + x * 3 + 2] = img.px[s + 2]; } });
export const grey8Png = (w: number, h: number, v: Uint8Array) => encode(w, h, 1, 0, 8, (y, out, off) => { for (let x = 0; x < w; x++) out[off + x] = v[y * w + x]; });
export const grey16Png = (w: number, h: number, v: Uint16Array) => encode(w, h, 2, 0, 16, (y, out, off) => { for (let x = 0; x < w; x++) out.writeUInt16BE(v[y * w + x], off + x * 2); });

export function newRGBA(w: number, h: number): RGBA {
  return { w, h, px: new Uint8ClampedArray(w * h * 4) };
}
/** Box-downsample an image by an integer factor. */
export function downsample(img: RGBA, f: number): RGBA {
  const out = newRGBA(Math.floor(img.w / f), Math.floor(img.h / f));
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += img.px[((y * f + j) * img.w + x * f + i) * 4 + c];
        out.px[(y * out.w + x) * 4 + c] = s / (f * f);
      }
  return out;
}
/** Slice an image into size×size PNG tiles, plus a JSON index. */
export function writeTiles(img: RGBA, dir: string, size = 512) {
  mkdirSync(dir, { recursive: true });
  const cols = Math.ceil(img.w / size), rows = Math.ceil(img.h / size);
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const w = Math.min(size, img.w - tx * size), h = Math.min(size, img.h - ty * size);
      const t = newRGBA(w, h);
      for (let y = 0; y < h; y++) t.px.set(img.px.subarray(((ty * size + y) * img.w + tx * size) * 4, ((ty * size + y) * img.w + tx * size + w) * 4), y * w * 4);
      writeFileSync(path.join(dir, `${tx}_${ty}.png`), rgbaPng(t));
    }
  writeFileSync(path.join(dir, 'tiles.json'), JSON.stringify({ size, cols, rows, width: img.w, height: img.h, name: '{x}_{y}.png, x from the left, y from the top' }, null, 2) + '\n');
}
