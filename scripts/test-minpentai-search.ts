/**
 * The search computer (versions/search.ts) and what it relies on in the engine (legal, score, fog).
 *   npm run test:minpentai-search
 * Checks:
 *   1. legal() lists exactly the single placements the placement check accepts, for every piece and direction,
 *      on Play's board and the book edition's, at many points of real matches.
 *   2. Fog: a side's view (fog()) holds nothing outside its sight but its own pieces; legal() is the same on the
 *      view as on the real board; and the search's moves don't change when hidden pieces do.
 *   3. Every level plays whole matches on both rulesets with no refused turn, within its step budget, and plays
 *      the same match twice; on the book edition it uses the book's pieces.
 *   4. Node and the browser (Chrome, through playwright-core) play the same matches move for move.
 */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { BASE, type Settings } from '../src/lib/minpentai/versions/schema';
import { drawRules, engine, layout, rng, type AnyPiece, type Engine, type Placement, type Side, type World } from '../src/lib/minpentai/versions/engine';
import { SEARCH_LEVELS, playSearchMatch, searchPlan, searchPlayer } from '../src/lib/minpentai/versions/search';
import { SOLO_V1, type VersionRules } from '../src/lib/minpentai/versions/solo-v1';
import { BOOK_EDITION } from '../src/lib/minpentai/versions/book-edition';

let checks = 0;
const ok = (cond: unknown, what: string) => { checks++; assert.ok(cond, what); };
const RULESETS: [string, VersionRules][] = [['play', SOLO_V1], ['book', BOOK_EDITION]];

/** Boards from real matches (level 2 against level 3), at every turn to act, with the settings in force. */
function positions(v: VersionRules, seeds: number[]): { e: Engine; s: Settings; w: World }[] {
  const out: { e: Engine; s: Settings; w: World }[] = [];
  for (const seed of seeds) {
    const { s1 } = drawRules(v, rng(seed));
    const e = engine(layout(v, s1));
    let last = -1;
    playSearchMatch(v, (real) => {
      const keep = (p: ReturnType<typeof searchPlayer>) => (m: Parameters<ReturnType<typeof searchPlayer>>[0]) => {
        const w = real();
        if (w.step !== last) { out.push({ e, s: m.s, w: e.clone(w) }); last = w.step; }
        return p(m);
      };
      return { C: keep(searchPlayer(2)), A: keep(searchPlayer(3)) };
    }, seed);
  }
  return out;
}

// ---------- 1. legal() is the placement check, one placement at a time ----------
for (const [name, v] of RULESETS) {
  const ps = positions(v, [1, 2, 3]);
  let compared = 0;
  for (const { e, s, w } of ps) for (const o of ['C', 'A'] as const) {
    const snap = e.towers(w, o), budget = s.points;
    const got = e.legal(w, s, o, snap, budget);
    ok(got.every((p) => e.refuse(w, s, o, snap, budget, [p]) === null), `${name}: every listed placement is accepted`);
    // Brute force: every square, every piece, every direction from -1 to 1.
    const want: string[] = [];
    for (let y = 0; y < e.H; y++) for (let x = 0; x < e.W; x++) for (const t of ['g', 's', 't', 'm', 'e', 'w', 'f'] as AnyPiece[]) for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      const p: Placement<AnyPiece> = { t, o, x, y, dx, dy };
      if (!e.refuse(w, s, o, snap, budget, [p])) want.push(JSON.stringify(p));
    }
    // Squares and towers take no direction: legal() lists them once, with 0, 0.
    const norm = (xs: string[]) => [...new Set(xs.map((j) => { const p = JSON.parse(j); return JSON.stringify(p.t === 's' || p.t === 't' ? { ...p, dx: 0, dy: 0 } : p); }))].sort();
    ok(isDeepStrictEqual(norm(got.map((p) => JSON.stringify(p))), norm(want)), `${name}: legal() at step ${w.step} for ${o} is exactly what the check accepts`);
    compared++;
  }
  ok(compared >= 20, `${name}: compared at ${compared} turns`);
}

// ---------- 2. Fog ----------
for (const [name, v] of RULESETS) {
  for (const { e, s, w } of positions(v, [4, 5])) for (const o of ['C', 'A'] as const) {
    const view = e.fog(w, s, o), see = e.lit(w, o, s.sight);
    const outside = (k: number | string) => !see.has(+k);
    ok(Object.keys(view.tw).every((k) => view.tw[+k] === o || !outside(k)) && Object.keys(view.sq).every((k) => view.sq[+k].o === o || !outside(k)), `${name}: no enemy tower or square out of sight in ${o}'s view`);
    ok(view.gl.every((g) => see.has(e.K(g.x, g.y))) && view.nid === view.gl.length + 1 && view.gl.every((g, i) => g.id === i + 1), `${name}: only gliders in sight, numbered afresh`);
    ok(Object.keys(view.mir ?? {}).every((k) => view.mir![+k].o === o || !outside(k)) && Object.keys(view.fa ?? {}).every((k) => view.fa![+k].o === o || !outside(k)) && Object.keys(view.sd ?? {}).every((k) => view.sd![+k] === o || !outside(k)), `${name}: no hidden book piece in ${o}'s view`);
    const snap = e.towers(w, o);
    ok(isDeepStrictEqual(e.legal(view, s, o, snap, s.points), e.legal(w, s, o, snap, s.points)), `${name}: legal() is the same on ${o}'s view as on the real board (step ${w.step})`);
  }
}
{
  // The search's moves depend only on what it sees: the same view, whatever is hidden, gives the same turn.
  const v = BOOK_EDITION, { s1: s } = drawRules(v, rng(9)), e = engine(layout(v, s));
  const w = e.world(s);
  const hidden = e.clone(w);
  // Amber's pieces deep in Amber's half, far from Cyan's sight.
  hidden.gl.push({ id: 900, o: 'A', x: 20, y: 7, dx: -1, dy: 0 });
  hidden.sq[e.K(19, 3)] = { o: 'A', hp: 2 };
  hidden.mir = { [e.K(18, 10)]: { o: 'A', d: 1, hp: 3 } };
  hidden.mw = [{ id: 901, o: 'A', x: 17, y: 6, dx: -1, dy: 0, c: [1, 1, 1] }];
  ok(isDeepStrictEqual(e.fog(w, s, 'C'), e.fog(hidden, s, 'C')), "Amber's hidden pieces leave Cyan's view unchanged");
  const plan = (x: World) => searchPlan({ e, s, o: 'C', view: e.fog(x, s, 'C'), lastSeen: {}, snap: e.towers(x, 'C'), points: s.setupPoints, rng: rng(42), level: 3 }).placements;
  ok(isDeepStrictEqual(plan(w), plan(hidden)), 'and so the search plays the same turn');
}

// ---------- 3. Whole matches ----------
for (const [name, v] of RULESETS) {
  for (const lvl of [1, 3, 5]) {
    const m = playSearchMatch(v, () => ({ C: searchPlayer(lvl), A: searchPlayer(Math.max(1, lvl - 1)) }), 11);
    ok(m.illegal === 0, `${name}: level ${lvl} never makes a refused turn`);
    ok(m.turns.every((t) => t.steps <= SEARCH_LEVELS[t.side === 'C' ? lvl : Math.max(1, lvl - 1)].steps), `${name}: level ${lvl} stays within its step budget`);
    const again = playSearchMatch(v, () => ({ C: searchPlayer(lvl), A: searchPlayer(Math.max(1, lvl - 1)) }), 11);
    ok(isDeepStrictEqual(m, again), `${name}: level ${lvl} plays the same match twice`);
  }
}
{
  const used: Record<string, number> = {};
  for (const seed of [1, 2, 3, 4]) {
    const m = playSearchMatch(BOOK_EDITION, () => ({ C: searchPlayer(4), A: searchPlayer(4) }), seed);
    for (const o of ['C', 'A'] as const) for (const [t, n] of Object.entries(m.placed[o])) used[t] = (used[t] ?? 0) + n;
  }
  const book = ['m', 'e', 'w', 'f'].filter((t) => used[t]);
  ok(book.length >= 1, `the search uses the book edition's pieces (${JSON.stringify(used)})`);
  console.log(`  book edition, level 4 self-play, 4 matches: pieces placed ${JSON.stringify(used)}`);
}

// ---------- 4. Node and the browser agree ----------
async function browserAgrees() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mp-search-'));
  try {
    const entry = path.join(dir, 'entry.ts');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(entry, `
      import { playSearchMatch, searchPlayer } from ${JSON.stringify(path.resolve('src/lib/minpentai/versions/search.ts'))};
      import { SOLO_V1 } from ${JSON.stringify(path.resolve('src/lib/minpentai/versions/solo-v1.ts'))};
      import { BOOK_EDITION } from ${JSON.stringify(path.resolve('src/lib/minpentai/versions/book-edition.ts'))};
      (globalThis as any).run = () => [SOLO_V1, BOOK_EDITION].flatMap((v) => [1, 2].map((seed) => JSON.stringify(playSearchMatch(v, () => ({ C: searchPlayer(5), A: searchPlayer(3) }), seed))));
    `);
    const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' });
    const code = out.outputFiles[0].text;
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: code });
      const there: string[] = await page.evaluate(() => (globalThis as unknown as { run: () => string[] }).run());
      const here = [SOLO_V1, BOOK_EDITION].flatMap((v) => [1, 2].map((seed) => JSON.stringify(playSearchMatch(v, () => ({ C: searchPlayer(5), A: searchPlayer(3) }), seed))));
      ok(there.length === 4 && isDeepStrictEqual(there, here), 'Chrome plays the same four matches as Node, move for move (level 5 against level 3, Play and the book edition)');
    } finally { await browser.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

browserAgrees().then(() => console.log(`minpentai search: ${checks} checks passed`)).catch((e) => { console.error('FAIL', e); process.exit(1); });
void BASE;
