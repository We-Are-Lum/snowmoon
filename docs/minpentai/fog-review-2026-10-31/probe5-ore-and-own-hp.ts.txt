// Probe 5: twins that differ only outside Cyan's sight.
// (a) A rock at the edge of sight shows its ore; a hidden Amber factory fed by it lowers it.
// (b) A Cyan square left out of sight (its tower lost) shows hits_left; a hidden Amber glider hitting it changes it.
import { newSolo, rulesOf, submit, viewFor, type SoloMatch } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;
const { m } = newSolo({ id: 'probe0000000', ruleset: 'book', level: 3, seed: 5, person: 1, agent: { id: null, name: 'a', model: null }, now: '' });
const { e, s } = rulesOf(m);
m.pend.A = { ...m.pend.A, placements: [] };
const see = (x: SoloMatch, xx: number, y: number) => e.lit(x.w, 'C', s.sight).has(e.K(xx, y));
const go = (x: SoloMatch) => { submit(x, { turn: x.turn, placements: [], source: 'agent', final: true, now: '' }); return viewFor(x); };
{
  const base = json(m);
  base.w.tw[e.K(2, 4)] = 'C'; // a Cyan tower at (2,4): sees x<=5, y 1..7; rock (5,7) at the edge of sight
  base.w.gl.push({ id: base.w.nid++, o: 'A', x: 9, y: 7, dx: -1, dy: 0 }); // hidden Amber glider flying west into rock (5,7)
  const a = json(base), b = json(base);
  b.w.fa = { [e.K(5, 8)]: { o: 'A', dx: 0, dy: 1, hp: 2 } }; // hidden Amber factory under rock (5,7), firing south
  console.log('(a) factory square (5,8) in sight?', see(b, 5, 8), '; glider start (9,7) in sight?', see(b, 9, 7));
  const r = (v: ReturnType<typeof viewFor>) => JSON.stringify(v.board.rocks.filter((q) => q.x === 5));
  console.log('    rocks at x=5 without hidden factory:', r(go(a)));
  console.log('    rocks at x=5 with hidden factory:   ', r(go(b)));
}
{
  const base = json(m);
  base.w.sq[e.K(10, 7)] = { o: 'C', hp: 2 }; // a Cyan square far out of sight (as after losing the tower that lit it)
  const a = json(base), b = json(base);
  b.w.gl.push({ id: b.w.nid++, o: 'A', x: 14, y: 7, dx: -1, dy: 0 }); // hidden Amber glider flying west
  console.log('(b) square (10,7) in sight?', see(b, 10, 7), '; glider (14,7) in sight?', see(b, 14, 7));
  const q = (v: ReturnType<typeof viewFor>) => JSON.stringify(v.board.squares.filter((x) => x.x === 10 && x.y === 7));
  console.log('    my square without hidden glider:', q(go(a)), ' with:', q(go(b)));
}
