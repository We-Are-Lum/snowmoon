/**
 * A list of placements as text, two characters each (base64url): square * 10 + kind, where kind is
 * 0–7 a glider's direction in D8, 8 a square, 9 a tower. Pure, no Node: the snap's signed state
 * (state.ts) and Play's "continue a match" link (`/minpentai?match=…`) both use it.
 */
import { D8, W, XY, type Piece } from '../play-game/game';

export interface P { t: Piece; x: number; y: number; dx: number; dy: number }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A placement as a number below 1500: square * 10 + kind (0–7 a glider's direction in D8, 8 square, 9 tower). */
function code(p: P): number {
  const kind = p.t === 's' ? 8 : p.t === 't' ? 9 : D8.findIndex(([a, b]) => a === p.dx && b === p.dy);
  if (kind < 0) throw new Error('bad glider direction');
  return (p.y * W + p.x) * 10 + kind;
}
function uncode(n: number): P | null {
  const k = Math.floor(n / 10), kind = n % 10;
  if (k >= 150) return null;
  const [x, y] = XY(k);
  if (kind === 8) return { t: 's', x, y, dx: 0, dy: 0 };
  if (kind === 9) return { t: 't', x, y, dx: 0, dy: 0 };
  const [dx, dy] = D8[kind];
  return { t: 'g', x, y, dx, dy };
}
export function encList(l: P[]): string {
  return l.map((p) => { const n = code(p); return B64[n >> 6] + B64[n & 63]; }).join('');
}
export function decList(s: string): P[] | null {
  if (s.length % 2) return null;
  const out: P[] = [];
  for (let i = 0; i < s.length; i += 2) {
    const a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]);
    if (a < 0 || b < 0) return null;
    const p = uncode(a * 64 + b);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/** A match as a link: seed (base 36), the number of turns, then each turn's placements, `~` between. */
export function encMatch(seed: number, turns: P[][]): string {
  return `${seed.toString(36)}.${turns.length}.${turns.map(encList).join('~')}`;
}
export function decMatch(text: string): { seed: number; turns: P[][] } | null {
  const m = /^([0-9a-z]{1,7})\.(\d{1,3})\.([A-Za-z0-9_~-]*)$/.exec(text);
  if (!m) return null;
  const seed = parseInt(m[1], 36), n = Number(m[2]);
  if (seed > 0xffff_ffff) return null;
  const parts = m[3] === '' ? [] : m[3].split('~');
  const lists = n === 0 ? [] : n === 1 && parts.length === 0 ? [''] : parts;
  if (lists.length !== n) return null;
  const turns = lists.map(decList);
  return turns.every(Boolean) ? { seed, turns: turns as P[][] } : null;
}
