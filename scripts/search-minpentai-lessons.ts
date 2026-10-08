/**
 * Finds lesson setups on the small lesson board where the engine does what each lesson says.
 * Read-only; prints candidates. The chosen setups live in src/lib/minpentai/lessons.ts and
 * scripts/test-minpentai-lessons.ts checks them.
 *
 *   npx tsx scripts/search-minpentai-lessons.ts
 */
import { GLIDERS, advance, newMatch, place, snap, type Match, type MatchSetup } from '../src/lib/minpentai/match';
import { findGliders } from '../src/lib/minpentai/glider';

const W = 30, H = 20;
const rules = { interval: 10_000, maxTurns: 10_000, budget: 8, reach: 6, sight: 6 };
const run = (m: Match, n: number) => { for (let i = 0; i < n; i++) m = advance(m); return m; };
const sites = (m: Match) => m.players.map((p) => p.sites.length).join('/');

// Towers: cyan at left, amber at right (top-left corners of the 3×3 symbol).
const CY: [number, number][] = [[3, 4], [3, 13]];

console.log('== hit: cyan glider right into amber tower at (23,ty)');
for (const ty of [4, 8, 13]) for (let gy = ty - 4; gy <= ty + 4; gy++) {
  const setup: MatchSetup = { w: W, h: H, rules, rocks: [], symbols: [CY, [[23, ty]]], extra: [] };
  let m = newMatch(setup);
  const p = snap(m.board, { kind: 'glider', x: 9, y: gy, dir: 'right' });
  m = { ...m, board: m.board };
  setup.extra = [[0, GLIDERS.right, p.x, p.y]];
  m = newMatch(setup);
  let lostAt = -1;
  for (let t = 1; t <= 60; t++) { m = advance(m); if (lostAt < 0 && m.players[1].sites.length === 0) lostAt = t; }
  console.log(`  ty${ty} gy${p.y}: amber lost at ${lostAt} sites ${sites(m)} gliders ${findGliders(m.board).length}`);
}

console.log('\n== square: amber glider left into cyan tower [3,13]; a cyan square on a spot');
{
  const base = (extra: MatchSetup['extra']): MatchSetup => ({ w: W, h: H, rules, rocks: [], symbols: [CY, [[23, 4]]], extra });
  for (const gy of [11, 13]) {
    const g: [number, readonly string[], number, number] = [1, GLIDERS.left, 21, gy];
    let m = run(newMatch(base([g])), 50);
    console.log(`  gy${gy} no square: sites ${sites(m)}`);
    const ok: string[] = [];
    for (let y = gy - 2; y <= gy + 5; y++) for (let x = 7; x <= 13; x++) {
      let mm = newMatch(base([g]));
      const before = mm;
      mm = place(mm, 0, { kind: 'mirror', x, y });
      if (mm === before) continue;
      let fine = true, back = false;
      for (let t = 1; t <= 50; t++) { mm = advance(mm); if (mm.players[0].sites.length < 2) fine = false; if (findGliders(mm.board).some((q) => q.dx === 1)) back = true; }
      if (fine) ok.push(`${x},${y}${back ? '↩' : ''}${mm.board.cells.reduce((a, b) => a + b, 0)}`);
    }
    console.log(`  gy${gy} safe spots: ${ok.join(' ')}`);
  }
}

console.log('\n== turn: amber tower [23,8] with squares; cyan glider right from x=9 at each row');
{
  const guards: [number, readonly string[], number, number][] = [[1, ['#'], 20, 4], [1, ['#'], 20, 6], [1, ['#'], 20, 13], [1, ['#'], 20, 15]];
  const setup: MatchSetup = { w: W, h: H, rules, rocks: [], symbols: [CY, [[23, 8]]], extra: guards };
  for (let gy = 1; gy < 19; gy += 2) {
    let m = newMatch(setup);
    const p = { kind: 'glider' as const, x: 9, y: gy, dir: 'right' as const };
    const before = m;
    m = place(m, 0, p);
    if (m === before) { console.log(`  gy${gy}: not placeable`); continue; }
    let lostAt = -1;
    for (let t = 1; t <= 60; t++) { m = advance(m); if (lostAt < 0 && m.players[1].sites.length === 0) lostAt = t; }
    console.log(`  gy${gy}: amber lost at ${lostAt}; sites ${sites(m)}`);
  }
}
