/**
 * "Under the hood": the cell rule recovered from the book's animated board (figure c4-b5, the
 * "rotate one eighty if three" rule, c4-b7), as Design's mockup runs it. Ported from Design's
 * script (docs/design/minpentai-intro-v3.dc.html) lines 323–340: BW, BH, ph2, bEmpty, bApply,
 * bStep, bBack, bStamp, live, GL. It is the same rule as src/lib/minpentai/engine.ts (the sandbox).
 */

export const BW = 48;
export const BH = 32;
export const ph2 = (t: number) => ((t % 2) + 2) % 2;
export interface CBoard { cells: Uint8Array; rocks: Uint8Array; turn: number }
export const bEmpty = (): CBoard => ({ cells: new Uint8Array(BW * BH), rocks: new Uint8Array(BW * BH), turn: 0 });

export function bApply(b: CBoard, ph: number): Uint8Array {
  const out = new Uint8Array(b.cells);
  for (let y0 = ph; y0 < BH + ph; y0 += 2) {
    for (let x0 = ph; x0 < BW + ph; x0 += 2) {
      const xa = x0 % BW, xb = (x0 + 1) % BW, ya = y0 % BH, yb = (y0 + 1) % BH;
      const id = [ya * BW + xa, ya * BW + xb, yb * BW + xa, yb * BW + xb];
      if (b.rocks[id[0]] || b.rocks[id[1]] || b.rocks[id[2]] || b.rocks[id[3]]) continue;
      const c = id.map((k) => b.cells[k]), n = c[0] + c[1] + c[2] + c[3];
      let r = c;
      if (n === 2) r = c.map((v) => 1 - v);
      else if ((ph === 0 && n === 3) || (ph === 1 && n === 1)) r = [c[3], c[2], c[1], c[0]];
      for (let q = 0; q < 4; q++) out[id[q]] = r[q];
    }
  }
  return out;
}
export const bStep = (b: CBoard): CBoard => ({ ...b, cells: bApply(b, ph2(b.turn)), turn: b.turn + 1 });
export const bBack = (b: CBoard): CBoard => ({ ...b, cells: bApply(b, ph2(b.turn - 1)), turn: b.turn - 1 });
export function bStamp(b: CBoard, rows: string[], x: number, y: number): CBoard {
  const cells = new Uint8Array(b.cells);
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') cells[((y + j + BH) % BH) * BW + ((x + i + BW) % BW)] = 1; }));
  return { ...b, cells };
}
export const live = (b: CBoard) => b.cells.reduce((a, v) => a + v, 0);
export const GL = ['.##.', '#..#'];
