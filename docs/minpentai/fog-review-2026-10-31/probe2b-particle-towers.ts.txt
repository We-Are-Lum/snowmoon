// Probe 2: an agent with a code tool reconstructs the whole hidden board by modelling the open-source,
// seeded site computer. It knows only: the public rules and start board, its own orders, and its own views.
// Each turn it keeps a set of candidate real worlds; for each it samples the computer's plan under many rng
// draws, applies its own (known) orders, runs the engine, and keeps candidates whose Cyan fog equals the view.
import { newSolo, rulesOf, submit, viewFor, boardOut, COMPUTER, type SoloMatch } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
import { searchPlan } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/versions/search';
import { rng, verdict, type World, type Side, type Kills } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/versions/engine';

const ruleset = (process.argv[2] ?? 'book') as 'book' | 'play';
const level = Number(process.argv[3] ?? 3);
const seed = Number(process.argv[4] ?? 4242);
const M = Number(process.argv[5] ?? 30);       // rng samples per candidate per turn
const TURNS = Number(process.argv[6] ?? 5);

const { m } = newSolo({ id: 'probe0000000', ruleset, level, seed, person: 1, agent: { id: null, name: 'a', model: null }, now: '' });
const { s, e } = rulesOf(m);
type Cand = { w: World; ls: Record<Side, Record<number, number>>; kills: Kills };
const key = (c: Cand) => JSON.stringify([c.w, c.ls.A]);
const obs = (w: World, ls: Record<number, number>) => JSON.stringify([boardOut(e, e.fog(w, s, 'C'), 'C', (k) => e.lit(w, 'C', s.sight).has(k)), Object.entries(ls).filter(([k]) => !e.fog(w, s, 'C').tw[+k])]);
const viewObs = (mm: SoloMatch) => { const v = viewFor(mm); return JSON.stringify([v.board, v.last_seen_enemy_towers.map((x) => [String(e.K(x.x, x.y)), x.step])]); };

// Start: the public starting world (identical for every seed of this ruleset).
let cands: Cand[] = [{ w: e.clone(m.w), ls: JSON.parse(JSON.stringify(m.ls)), kills: { C: 0, A: 0 } }];
const myRng = rng(99);
for (let t = 0; t < TURNS && !m.end; t++) {
  // The agent's own orders: the search from its own view (any policy works; the agent knows what it sent).
  const pts = m.w.step === 0 ? s.setupPoints : s.points;
  const mine = searchPlan({ e, s, o: 'C', view: e.fog(m.w, s, 'C'), lastSeen: { ...m.ls.C }, snap: e.towers(m.w, 'C'), points: pts, rng: myRng, level: 2 }).placements;
  submit(m, { turn: m.turn, placements: mine, source: 'agent', final: true, now: '' });
  const seen = viewObs(m);
  const next = new Map<string, Cand>();
  const t0 = performance.now();
  for (const c of cands) {
    for (let j = 0; j < M; j++) {
      const r = rng((Math.random() * 2 ** 32) >>> 0);
      const a = searchPlan({ e, s, o: COMPUTER, view: e.fog(c.w, s, 'A'), lastSeen: { ...c.ls.A }, snap: e.towers(c.w, 'A'), points: pts, rng: r, level }).placements;
      const w = e.clone(c.w), ls = JSON.parse(JSON.stringify(c.ls)), kills = { ...c.kills };
      e.apply(w, s, { C: mine, A: a });
      e.updLS(w, s.sight, ls);
      const from = w.step;
      do { e.step(w, s, kills); e.updLS(w, s.sight, ls); if (verdict(e, w, s, kills)) break; } while (w.step - from < s.every);
      const nc = { w, ls, kills };
      if (obs(w, ls.C) === seen) next.set(key(nc), nc);
    }
  }
  cands = [...next.values()].slice(0, Number(process.env.KEEP ?? 12));
  const truth = JSON.stringify([m.w, m.ls.A]);
  const has = cands.some((c) => key(c) === truth);
  const enemyHidden = (w: World) => JSON.stringify({ tw: Object.entries(w.tw).filter(([, o]) => o === 'A'), sq: Object.entries(w.sq).filter(([, q]) => q.o === 'A'), gl: w.gl.filter((g) => g.o === 'A').map((g) => [g.x, g.y, g.dx, g.dy]) });
  const twSet = (w: World) => Object.keys(w.tw).filter((k) => w.tw[+k] === "A").sort().join(","); const share = cands.filter((c) => twSet(c.w) === twSet(m.w)).length / Math.max(1, cands.length); const freq = new Map<string, number>(); for (const c of cands) freq.set(twSet(c.w), (freq.get(twSet(c.w)) ?? 0) + 1); const modal = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]; console.log(`   real enemy tower set held by ${(100 * share).toFixed(0)}% of candidates; the most common candidate tower set is ${modal && modal[0] === twSet(m.w) ? "the real one" : "not the real one"}`);
  const allAgree = cands.length > 0 && cands.every((c) => enemyHidden(c.w) === enemyHidden(m.w));
  const hiddenTw = Object.keys(m.w.tw).filter((k) => m.w.tw[+k] === 'A' && !e.lit(m.w, 'C', s.sight).has(+k)).length;
  console.log(`turn ${t} -> step ${m.w.step}: ${next.size} consistent candidate worlds (kept ${cands.length}); truth among them: ${has}; every candidate has the real enemy pieces: ${allAgree}; enemy towers out of sight: ${hiddenTw} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  if (!cands.length) break;
}
