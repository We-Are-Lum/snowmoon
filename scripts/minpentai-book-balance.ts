/**
 * Rocks and Mirrors balance experiments (book-3 design, 2026-11-01): self-play of the unforced search computer (no
 * BookPlay) under a rules variant; counts, per piece, the matches in which both sides placed it.
 *   npx tsx scripts/minpentai-book-balance.ts "<variant name>" <level> <seeds>
 */
import { playSearchMatch, searchPlayer } from '../src/lib/minpentai/versions/search';
import { BOOK_EDITION } from '../src/lib/minpentai/versions/book-edition';
const C = { costMirror: 1, costSeed: 1, costWall: 4, costFactory: 2 };
const VARIANTS: Record<string, Record<string, number>> = {
  'A book-1 as is': {},
  // Round 1 (40 runs at levels 2 and 3, 20 matches each).
  'B tower cap 6': { maxTowers: 6 },
  'C tower cap 4': { maxTowers: 4 },
  'D tower costs 6': { costTower: 6 },
  'E tower costs 8': { costTower: 8 },
  'F cheaper pieces (mirror 1, symbol 1, wall 4, factory 2)': { ...C },
  'G stronger pieces (mirror 5 hits, ore 6, factory 3 hits)': { mirrorHits: 5, ore: 6, factoryHits: 3 },
  'H cap 6 + cheaper pieces': { maxTowers: 6, ...C },
  'I cap 4 + cheaper pieces': { maxTowers: 4, ...C },
  'J cap 6 + cheaper + stronger': { maxTowers: 6, ...C, mirrorHits: 5, ore: 6, factoryHits: 3 },
  // Rounds 2 and 3: the cap counts symbols (symbolsCapped), factories fire on their own (factoryEvery).
  'K cap 6 incl. symbols + cheaper': { maxTowers: 6, symbolsCapped: 1, ...C },
  'L K + factories fire every 6': { maxTowers: 6, symbolsCapped: 1, ...C, factoryEvery: 6 },
  'M cap 4 incl. symbols + cheaper + factories every 6': { maxTowers: 4, symbolsCapped: 1, ...C, factoryEvery: 6 },
  'N L + ore 4': { maxTowers: 6, symbolsCapped: 1, ...C, factoryEvery: 6, ore: 4 },
  'O L + mirrors 5 hits': { maxTowers: 6, symbolsCapped: 1, ...C, factoryEvery: 6, mirrorHits: 5 },
  'P cap 6 incl. symbols, symbol 2, mirror 1, wall 4, factory 2, factories every 4': { maxTowers: 6, symbolsCapped: 1, costMirror: 1, costSeed: 2, costWall: 4, costFactory: 2, factoryEvery: 4 },
  'Q as P, cap 8': { maxTowers: 8, symbolsCapped: 1, costMirror: 1, costSeed: 2, costWall: 4, costFactory: 2, factoryEvery: 4 },
  'S as P, gliders cost 3': { maxTowers: 6, symbolsCapped: 1, costMirror: 1, costSeed: 2, costWall: 4, costFactory: 2, factoryEvery: 4, costGlider: 3 },
};
const [name, lvlArg, nArg] = process.argv.slice(2);
const patch = VARIANTS[name], lvl = Number(lvlArg), N = Number(nArg);
const v = { ...BOOK_EDITION, set: { ...BOOK_EDITION.set, ...patch } };
const both: Record<string, number> = { m: 0, e: 0, w: 0, f: 0 }, per: Record<string, number> = {};
let draws = 0, matches = 0, all4 = 0;
for (let seed = 1; seed <= N; seed++) {
  const m = playSearchMatch(v, () => ({ C: searchPlayer(lvl), A: searchPlayer(lvl) }), seed);
  matches++;
  if (m.win === 'D') draws++;
  for (const t of ['m', 'e', 'w', 'f']) { if (m.placed.C[t] && m.placed.A[t]) both[t]++; per[t] = (per[t] ?? 0) + (m.placed.C[t] ?? 0) + (m.placed.A[t] ?? 0); }
  if (['m', 'e', 'w', 'f'].every((t) => m.placed.C[t] && m.placed.A[t])) all4++;
  for (const t of ['t', 'g', 's']) per[t] = (per[t] ?? 0) + (m.placed.C[t] ?? 0) + (m.placed.A[t] ?? 0);
}
console.log(JSON.stringify({ name, lvl, matches, draws, all4, both, perMatch: Object.fromEntries(Object.entries(per).map(([k, c]) => [k, +(c / matches / 2).toFixed(1)])) }));
