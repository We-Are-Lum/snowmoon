/**
 * Rocks and Mirrors book-4 design runs (owner, 2026-11-02, after the book-3 playtest): self-play of the search computer
 * under a variant of book-3, measuring what the owner's bar asks for:
 *   - first contact: the turn either side first sees an enemy piece (target: usually by turn 2 or 3);
 *   - points spent per turn, against the points it had;
 *   - gliders sent (plain and symbol), towers destroyed, symbols formed, draws, and which book pieces both sides used.
 *
 *   npx tsx scripts/minpentai-book4-balance.ts "<variant>" <level> <matches>
 */
import { playSearchMatch, searchPlan, type Computer, type TurnInput } from '../src/lib/minpentai/versions/search';
import { BOOK_3_DRAFT } from '../src/lib/minpentai/versions/book-edition';
import type { VersionRules } from '../src/lib/minpentai/versions/solo-v1';

/** book-4's computer: symbols only where they form, a symbol glider in flight worth nothing by itself, no lost points. */
const F: Computer = { formingSymbols: true, seedScore: 0, spendTies: true };
const U = { symbolsCapped: 0 }; // symbols not stopped by the tower cap
type Variant = { set?: Record<string, number>; comp?: Computer };
export const VARIANTS: Record<string, Variant> = {
  // Reference: book-3 as played on 2026-11-02, its own computer and the new one.
  'T0 book-3, its computer': {},
  'T1 book-3, new computer': { comp: F },
  // b: contact.
  'b1 towers start at column 5': { set: { startX: 5 }, comp: F },
  'b2 board 18 wide': { set: { width: 18 }, comp: F },
  'b3 sight 4 (reach 3)': { set: { sight: 4 }, comp: F },
  'b4 symbol gliders see 2': { set: { symbolGliderSight: 2 }, comp: F },
  'b5 all gliders see 1': { set: { gliderSight: 1 }, comp: F },
  // c: symbols past the tower cap, limited another way.
  'c1 symbols uncapped': { set: { ...U }, comp: F },
  'c2 uncapped, at most 2 symbol towers': { set: { ...U, maxSymbolTowers: 2 }, comp: F },
  'c3 uncapped, symbol gliders cost 3': { set: { ...U, costSeed: 3 }, comp: F },
  'c4 uncapped, carry over 10': { set: { ...U, carryOver: 10 }, comp: F },
  // Round 2: the leaders together (b1/b2 for contact, c1/c2 for symbols, b4 the scouting the book supports).
  'r1 col 5 + 2 symbol towers': { set: { startX: 5, ...U, maxSymbolTowers: 2 }, comp: F },
  'r2 18 wide + 2 symbol towers': { set: { width: 18, ...U, maxSymbolTowers: 2 }, comp: F },
  'r3 18 wide + uncapped': { set: { width: 18, ...U }, comp: F },
  'r4 col 5 + uncapped': { set: { startX: 5, ...U }, comp: F },
  'r5 18 wide + 2 symbol towers + symbol scouts 2': { set: { width: 18, ...U, maxSymbolTowers: 2, symbolGliderSight: 2 }, comp: F },
  'r6 col 5 + 2 symbol towers + symbol scouts 2': { set: { startX: 5, ...U, maxSymbolTowers: 2, symbolGliderSight: 2 }, comp: F },
  'r7 18 wide + col 3 + 2 symbol towers': { set: { width: 18, startX: 3, ...U, maxSymbolTowers: 2 }, comp: F },
  // 2026-11-04, after the book-4 playtest: book-4 (r5) with its computer's revision 2, which guards its towers.
  'g1 book-4, guarding computer': { set: { width: 18, ...U, maxSymbolTowers: 2, symbolGliderSight: 2 }, comp: { ...F, guard: true } },
  // The book-5 draft (measured 2026-11-04, dropped: worse than g1): book-4 with towers that start walled, and the guarding computer.
  'g2 book-5 towers start walled, guarding computer': { set: { width: 18, ...U, maxSymbolTowers: 2, symbolGliderSight: 2, startWalls: 1 }, comp: { ...F, guard: true } },
};

const [name, lvlArg, nArg] = process.argv.slice(2);
const V = VARIANTS[name];
if (!V) throw new Error(`no variant "${name}": ${Object.keys(VARIANTS).join(' | ')}`);
const lvl = Number(lvlArg), N = Number(nArg);
const v: VersionRules = { ...BOOK_3_DRAFT, set: { ...BOOK_3_DRAFT.set, killReports: 1, ...V.set } };
const every = (v.set.every as number | undefined) ?? 12;
const player = (m: TurnInput) => searchPlan({ ...m, level: lvl, comp: V.comp });

const contact: number[] = [];
let never = 0, draws = 0, kills = 0, killMatches = 0, spent = 0, had = 0, gliders = 0, seeds = 0, formed = 0, all4 = 0;
const both: Record<string, number> = { m: 0, e: 0, w: 0, f: 0 };
for (let seed = 1; seed <= N; seed++) {
  const m = playSearchMatch(v, () => ({ C: player, A: player }), seed);
  if (m.win === 'D') draws++;
  const firsts = Object.values(m.firstSight ?? {});
  if (firsts.length) contact.push(Math.floor(Math.min(...firsts) / every)); else never++;
  const k = (m.kills?.C ?? 0) + (m.kills?.A ?? 0);
  kills += k; if (k) killMatches++;
  for (const o of ['C', 'A'] as const) {
    spent += m.spent![o].slice(1).reduce((a, b) => a + b, 0); had += m.had![o].slice(1).reduce((a, b) => a + b, 0); // turns after setup
    gliders += (m.placed[o].g ?? 0) + (m.placed[o].e ?? 0); seeds += m.placed[o].e ?? 0; formed += m.formed![o];
  }
  for (const t of ['m', 'e', 'w', 'f']) if (m.placed.C[t] && m.placed.A[t]) both[t]++;
  if (['m', 'e', 'w', 'f'].every((t) => m.placed.C[t] && m.placed.A[t])) all4++;
}
contact.sort((a, b) => a - b);
const r1 = (x: number) => +x.toFixed(1);
console.log(JSON.stringify({
  name, lvl, matches: N,
  contactTurnMedian: contact.length ? contact[contact.length >> 1] : null,
  contactByTurn3: `${contact.filter((t) => t <= 3).length}/${N}`, neverMet: never,
  spentShare: r1((100 * spent) / had) + '%',
  glidersPerSide: r1(gliders / N / 2), symbolGlidersPerSide: r1(seeds / N / 2), symbolsFormedPerSide: r1(formed / N / 2),
  towersDestroyedPerMatch: r1(kills / N), matchesWithAKill: `${killMatches}/${N}`, draws, both, all4,
}));
