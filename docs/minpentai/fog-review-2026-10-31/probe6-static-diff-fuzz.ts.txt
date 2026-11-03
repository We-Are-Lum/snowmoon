// Probe 6: differential fuzz at a single instant. Real mid-match boards; a twin changed only outside Cyan's
// sight (or in hidden fields). Compare viewFor, simulate (several scenarios and beliefs) and submit refusals.
import { newSolo, rulesOf, submit, viewFor, simulate, parseOrders, autopilot, type SoloMatch } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
import { rng } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/versions/engine';
const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;
const R = rng(12345);
const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
const diffs: Record<string, number> = {};
let trials = 0;
for (const ruleset of ['book', 'play'] as const) for (let g = 0; g < 6; g++) {
  const { m } = newSolo({ id: 'probe0000000', ruleset, level: 2, seed: 100 + g, person: 1, agent: { id: null, name: 'a', model: null }, now: '' });
  const turns = 1 + (g % 4);
  for (let t = 0; t < turns && !m.end; t++) autopilot(m, { turn: m.turn, now: '' });
  if (m.end) continue;
  const { e, s } = rulesOf(m);
  const see = e.lit(m.w, 'C', s.sight);
  const dark = [...Array(e.W * e.H).keys()].filter((k) => !see.has(k));
  const darkEmpty = dark.filter((k) => e.empty(m.w, k));
  const mods: Record<string, (x: SoloMatch) => boolean> = {
    'hidden Amber tower added': (x) => { x.w.tw[pick(darkEmpty)] = 'A'; return true; },
    'hidden Amber tower removed': (x) => { const ks = Object.keys(x.w.tw).map(Number).filter((k) => x.w.tw[k] === 'A' && !see.has(k)); if (!ks.length) return false; delete x.w.tw[pick(ks)]; return true; },
    'hidden Amber square': (x) => { x.w.sq[pick(darkEmpty)] = { o: 'A', hp: 1 + Math.floor(R() * 2) }; return true; },
    'hidden Amber glider': (x) => { const k = pick(darkEmpty), [gx, gy] = e.XY(k); x.w.gl.push({ id: x.w.nid++, o: 'A', x: gx, y: gy, dx: -1, dy: 0 }); return true; },
    'hidden glider ids shifted': (x) => { x.w.nid += 50; for (const gl of x.w.gl) gl.id += see.has(e.K(gl.x, gl.y)) ? 0 : 1000; return true; },
    'Amber last-seen changed': (x) => { x.ls.A = {}; return true; },
    'Amber pending orders changed': (x) => { x.pend.A = { ...x.pend.A, placements: [] }; return true; },
    'kills changed': (x) => { x.kills = { C: 3, A: 7 }; return true; },
    'hidden flash': (x) => { x.w.flash = dark.slice(0, 5); return true; },
    ...(ruleset === 'book' ? {
      'hidden Amber mirror': (x: SoloMatch) => { (x.w.mir ??= {})[pick(darkEmpty)] = { o: 'A', d: 1, hp: 3 }; return true; },
      'hidden Amber factory': (x: SoloMatch) => { (x.w.fa ??= {})[pick(darkEmpty)] = { o: 'A', dx: 1, dy: 0, hp: 2 }; return true; },
      'hidden Amber resting symbol glider': (x: SoloMatch) => { (x.w.sd ??= {})[pick(darkEmpty)] = 'A'; return true; },
      'hidden Amber forming symbol': (x: SoloMatch) => { const k = pick(darkEmpty); x.w.tw[k] = 'A'; (x.w.fs ??= {})[k] = { o: 'A', at: x.w.step }; return true; },
      'hidden rock ore spent': (x: SoloMatch) => { const ks = e.L.rocks.filter((k) => !see.has(k)); const k = pick(ks); x.w.ore![k] = 1; return true; },
      'hidden rock crumbled': (x: SoloMatch) => { const ks = e.L.rocks.filter((k) => !see.has(k)); const k = pick(ks); delete x.w.rock[k]; delete x.w.ore![k]; return true; },
      'hidden Amber moving wall': (x: SoloMatch) => { const ok = darkEmpty.filter((k) => { const [px, py] = e.XY(k); return [-1, 0, 1].every((i) => { const yy = py + i; return e.inb(px, yy) && !see.has(e.K(px, yy)) && e.empty(x.w, e.K(px, yy)); }); }); if (!ok.length) return false; const [px, py] = e.XY(pick(ok)); (x.w.mw ??= []).push({ id: x.w.nid++, o: 'A', x: px, y: py, dx: -1, dy: 0, c: [1, 1, 1] }); return true; },
    } : {}),
  };
  const cells = [...e.lit(m.w, 'C', s.reach)];
  const tryOrders = () => Array.from({ length: 30 }, () => { const k = pick(R() < 0.8 ? cells : dark), [x, y] = e.XY(k); const piece = pick(ruleset === 'book' ? ['glider', 'square', 'tower', 'mirror', 'symbol_glider', 'moving_wall', 'factory'] : ['glider', 'square', 'tower']); return [{ piece, x, y, dir: pick(['N', 'E', 'S', 'W', 'NE']), slant: '/' }]; });
  const beliefs = [undefined, { towers: dark.slice(0, 3).map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1] })) }, { squares: [...see].slice(0, 2).map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1] })) }, { gliders: dark.slice(-4).map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1], dir: 'W' })) }];
  const orderSets = tryOrders();
  const probe = (x: SoloMatch) => {
    const v = viewFor(x) as Record<string, unknown>;
    delete v.opponent_commitment;
    const sims = beliefs.map((b) => { try { return simulate(x, { belief: b as never, scenarios: orderSets.slice(0, 6).map((p, i) => ({ name: String(i), placements: p })), steps: 20 }); } catch (err) { return String(err); } });
    const refusals = orderSets.map((p) => { const y = json(x); try { submit(y, { turn: y.turn, placements: parseOrders(p, s), source: 'agent', final: false, now: '' }); return 'ok'; } catch (err) { return String((err as Error).message); } });
    return JSON.stringify({ v, sims, refusals });
  };
  const base = probe(m);
  for (const [name, f] of Object.entries(mods)) {
    const x = json(m);
    if (!f(x)) continue;
    trials++;
    if (probe(x) !== base) diffs[name] = (diffs[name] ?? 0) + 1;
  }
}
console.log(`${trials} twin pairs; changes that showed in view/simulate/refusals:`, diffs);
