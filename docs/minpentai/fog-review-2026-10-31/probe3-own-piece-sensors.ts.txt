// Probe 3: two real boards that differ only outside Cyan's sight (one hidden Amber square), same orders on
// both sides. Cyan's own symbol glider / moving wall travel into the dark; does Cyan's view differ?
import { newSolo, rulesOf, submit, viewFor, simulate, type SoloMatch } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;
function twins(hidden: [number, number]) {
  const { m } = newSolo({ id: 'probe0000000', ruleset: 'book', level: 3, seed: 5, person: 1, agent: { id: null, name: 'a', model: null }, now: '' });
  m.pend.A = { ...m.pend.A, placements: [] }; // the computer places nothing (same on both boards)
  const a = json(m), b = json(m);
  const { e } = rulesOf(m);
  b.w.sq[e.K(...hidden)] = { o: 'A', hp: 2 }; // the only difference: one Amber square at `hidden`
  return { a, b, e, s: rulesOf(m).s };
}
function run(label: string, hidden: [number, number], orders: unknown[], turns: number) {
  const { a, b, e, s } = twins(hidden);
  const k = e.K(...hidden);
  for (let t = 0; t < turns; t++) for (const m of [a, b]) {
    const ps = (t === 0 ? orders : []) as never;
    submit(m, { turn: m.turn, placements: ps.length ? (require('/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo').parseOrders(ps, s)) : [], source: 'agent', final: true, now: '' });
    m.pend.A = { ...m.pend.A, placements: [] };
  }
  const inSight = (m: SoloMatch) => e.lit(m.w, 'C', s.sight).has(k);
  const va = viewFor(a), vb = viewFor(b);
  const strip = (v: ReturnType<typeof viewFor>) => JSON.stringify({ ...v, opponent_commitment: 0, my_orders: 0, my_turns: v.my_turns.map((t) => t.placements) });
  console.log(`\n${label}: hidden Amber square at ${hidden} in Cyan's sight? A:${inSight(a)} B:${inSight(b)}; step ${a.w.step}`);
  console.log('  views identical?', strip(va) === strip(vb));
  for (const f of ['resting_symbol_gliders', 'moving_walls'] as const) console.log(`  ${f}: without square ${JSON.stringify((va.board as any)[f])} | with square ${JSON.stringify((vb.board as any)[f])}`);
  const sim = (m: SoloMatch) => JSON.stringify((simulate(m, { scenarios: [{ name: 'nothing', placements: [] }], steps: 8 }).scenarios[0] as any).result.board_end.moving_walls);
  console.log('  simulate board_end moving_walls: without', sim(a), '| with', sim(b));
}
// Symbol glider from (4,3) east along row 3 (Cyan sees x <= 4). Hidden Amber square at (15,3).
run('symbol glider', [15, 3], [{ piece: 'symbol_glider', x: 4, y: 3, dir: 'E' }], 2);
// Moving wall, middle (4,10), flying east (cells (4,9),(4,10),(4,11)). Hidden Amber square at (12,10).
run('moving wall', [7, 12], [{ piece: 'moving_wall', x: 4, y: 12, dir: 'E' }], 1); run('moving wall', [7, 12], [{ piece: 'moving_wall', x: 4, y: 12, dir: 'E' }], 2);
