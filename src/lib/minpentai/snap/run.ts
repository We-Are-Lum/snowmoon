/**
 * A run between two turns to act, as an animated GIF (spike, 2026-10-21): the board as Cyan saw it
 * at every step (fogged by Cyan's towers in that step, as one-on-one's frames are), drawn in code
 * as SVG, one frame a step, joined by sharp. No text in the picture (no fonts on the server); the
 * steps show as ticks down the left edge.
 *
 * Shapes follow Play's (learn-draw.ts): a ring for a tower, an arrowhead for a glider, a square
 * with a crack once hit. 640 × 360 for the snap's 16:9 image.
 */
import sharp from 'sharp';
import { W } from '../play-game/game';
import type { BoardView } from '../play-game/live-types';
import { sightOf } from '../play-server/view';
import type { Run } from './match';

const GW = 640, GH = 360, CP = 34, OX = (GW - W * CP) / 2, OY = (GH - 10 * CP) / 2;
const COL = { C: '#46D7E8', A: '#FFB43A' } as const;

function frameSvg(b: BoardView, ls: Record<number, number>, R: number, i: number, n: number): string {
  const see = sightOf(b, 'C', R);
  const o: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}"><rect width="${GW}" height="${GH}" fill="#060608"/>`];
  for (let k = 0; k < 150; k++) {
    const x = k % W, y = (k / W) | 0;
    o.push(`<rect x="${OX + x * CP + 1}" y="${OY + y * CP + 1}" width="${CP - 2}" height="${CP - 2}" fill="${see.has(k) ? '#17262C' : '#0B0C0F'}"/>`);
  }
  const cx = (k: number) => OX + (k % W) * CP + CP / 2, cy = (k: number) => OY + ((k / W) | 0) * CP + CP / 2;
  for (const k of b.rock) o.push(`<rect x="${cx(k) - CP / 2 + 4}" y="${cy(k) - CP / 2 + 4}" width="${CP - 8}" height="${CP - 8}" fill="#4B4C55"/>`);
  const shown = new Set(b.tw.map(([k]) => k));
  for (const k in ls) if (!shown.has(+k) && !see.has(+k)) {
    o.push(`<circle cx="${cx(+k)}" cy="${cy(+k)}" r="${CP * 0.3}" fill="none" stroke="${COL.A}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="4 3"/>`);
  }
  for (const [k, s] of b.tw) {
    o.push(`<circle cx="${cx(k)}" cy="${cy(k)}" r="${CP * 0.36}" fill="${COL[s]}"/><circle cx="${cx(k)}" cy="${cy(k)}" r="${CP * 0.17}" fill="#0E0F13"/>`);
  }
  for (const [k, s, hp] of b.sq) {
    const x0 = cx(k) - CP / 2 + 7, y0 = cy(k) - CP / 2 + 7, w = CP - 14;
    o.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${w}" fill="${COL[s]}" fill-opacity=".45" stroke="${COL[s]}" stroke-width="2.5"/>`);
    if (hp === 1) o.push(`<polyline points="${x0 + 4},${y0 + 3} ${x0 + 10},${y0 + 10} ${x0 + 7},${y0 + 15} ${x0 + w - 4},${y0 + w - 3}" fill="none" stroke="#E7E4DD" stroke-width="2"/>`);
  }
  for (const [x, y, dx, dy, s] of b.gl) {
    const k = y * W + x, X = cx(k), Y = cy(k), nn = Math.hypot(dx, dy) || 1, fx = dx / nn, fy = dy / nn, sx = -fy, sy = fx;
    const pt = (a: number, c: number) => `${(X + fx * a * CP + sx * c * CP).toFixed(1)},${(Y + fy * a * CP + sy * c * CP).toFixed(1)}`;
    o.push(`<polygon points="${pt(0.36, 0)} ${pt(-0.26, 0.28)} ${pt(-0.12, 0)} ${pt(-0.26, -0.28)}" fill="${COL[s]}"/>`);
  }
  for (const k of b.flash) o.push(`<rect x="${cx(k) - CP / 2 + 2}" y="${cy(k) - CP / 2 + 2}" width="${CP - 4}" height="${CP - 4}" fill="#FFFFFF" fill-opacity=".8"/>`);
  // Step ticks down the left margin: filled up to this frame.
  const tick = Math.min(12, (GH - 40) / Math.max(n, 1));
  for (let j = 0; j < n; j++) o.push(`<rect x="${OX / 2 - 6}" y="${20 + j * tick}" width="12" height="${Math.max(2, tick - 3)}" fill="${j <= i ? '#E6E3DA' : '#2A2B31'}"/>`);
  o.push('</svg>');
  return o.join('');
}

/** Frame times: the placements appearing hold a little, each step 260 ms, the last frame 1.6 s. */
export function delays(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 600 : i === n - 1 ? 1600 : 260));
}

export async function runGif(run: Run, R: number): Promise<Buffer> {
  const n = run.frames.length;
  const frames = await Promise.all(run.frames.map((b, i) => sharp(Buffer.from(frameSvg(b, run.ls[i], R, i, n))).png().toBuffer()));
  return sharp(frames, { join: { animated: true } }).gif({ delay: delays(n), loop: 0, colours: 16, effort: 3, dither: 0 }).toBuffer();
}
