/**
 * Board state in a URL: `?s=1.<turn>.<cells>.<rocks>`. Cells and rocks are bitsets,
 * row-major, base64url without padding; an empty rock layer is left blank.
 * Pure: works in the browser and in Node.
 */
import { emptyBoard, HEIGHT, WIDTH, type Board } from './engine';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function packBits(bits: Uint8Array): string {
  if (!bits.some((v) => v)) return '';
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((v, i) => { if (v) bytes[i >> 3] |= 1 << (7 - (i & 7)); });
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < chars; k++) out += ALPHABET[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

function unpackBits(text: string, length: number): Uint8Array | null {
  const bits = new Uint8Array(length);
  if (!text) return bits;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = k < chunk.length ? ALPHABET.indexOf(chunk[k]) : 0;
      if (v < 0) return null;
      n = (n << 6) | v;
    }
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  for (let i = 0; i < length; i++) bits[i] = ((bytes[i >> 3] ?? 0) >> (7 - (i & 7))) & 1;
  return bits;
}

export function encodeBoard(b: Board): string {
  return `1.${b.turn}.${packBits(b.cells)}.${packBits(b.rocks)}`;
}

/** Returns null for anything that is not a well-formed version-1 state. */
export function decodeBoard(s: string): Board | null {
  const parts = s.split('.');
  if (parts.length !== 4 || parts[0] !== '1' || !/^-?\d{1,9}$/.test(parts[1])) return null;
  const b = emptyBoard(WIDTH, HEIGHT);
  const cells = unpackBits(parts[2], WIDTH * HEIGHT);
  const rocks = unpackBits(parts[3], WIDTH * HEIGHT);
  if (!cells || !rocks) return null;
  for (let i = 0; i < cells.length; i++) if (rocks[i]) cells[i] = 0;
  return { ...b, cells, rocks, turn: Number(parts[1]) };
}
