// Probe 7: an Amber moving wall partly in Cyan's sight. fog() copies the real wall object ({...m}), so the
// hidden `stop` flag (set when any of its squares, seen or not, ran into something) reaches simulate.
import { newSolo, rulesOf, simulate, viewFor, type SoloMatch } from '/Users/nathan/snowmoon-book-edition/src/lib/minpentai/agent-play/solo';
const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;
const { m } = newSolo({ id: 'probe0000000', ruleset: 'book', level: 3, seed: 5, person: 1, agent: { id: null, name: 'a', model: null }, now: '' });
const { e, s } = rulesOf(m);
// Amber wall flying west, middle (6,1): cells (6,0),(6,1),(6,2)... put it so one end is in sight of Cyan tower (1,3) (x<=4): use x=4..? 
// Wall flying W has cells across y: (x, y-1),(x,y),(x,y+1). Middle (5,7)? Instead fly south at x 3..5 (cells across x).
const a = json(m);
(a.w.mw ??= []).push({ id: a.w.nid++, o: 'A', x: 5, y: 12, dx: 0, dy: -1, c: [1, 1, 1] }); // cells (4,12),(5,12),(6,12); flying north
const b = json(a); b.w.mw![0].stop = 1; // the same wall, but stopped for good (it once ran into something)
const see = e.lit(a.w, 'C', s.sight);
console.log('wall cells in sight:', e.wallCells(a.w.mw![0]).map(([x, y]) => `${x},${y}:${see.has(e.K(x, y))}`).join(' '));
const strip = (x: SoloMatch) => { const v = viewFor(x) as Record<string, unknown>; delete v.opponent_commitment; return JSON.stringify(v); };
console.log('views identical?', strip(a) === strip(b));
const sim = (x: SoloMatch) => JSON.stringify((simulate(x, { scenarios: [{ name: 'n', placements: [] }], steps: 6 }).scenarios[0] as any).result.board_end.moving_walls);
console.log('simulate, wall not stopped:', sim(a));
console.log('simulate, wall stopped:    ', sim(b));
