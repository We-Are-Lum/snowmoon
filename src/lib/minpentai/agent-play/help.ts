/**
 * Agent help (owner, 2026-11-02): what an AI playing agent play needs to plan without learning the rules by error.
 * Two things, both computed from one side's own view of the board (engine fog()) and the ruleset only, never from
 * the real board, so they say nothing about what is hidden:
 *   - laneWarnings: placements that block the side's own launch lanes (simulate shows them);
 *   - converging: three symbol-glider launches whose gliders come to rest around a target square and form the side's
 *     symbol, checked by running them together in the engine (the minpentai_symbol_launches tool).
 * Pure; no rule changes (it only reads the engine). Written by the coding agent (Claude, Anthropic's closed model).
 */
import type { AnyPiece, Engine, Placement, Side, World } from '../versions/engine';
import type { Settings } from '../versions/schema';

const D4: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const D8: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const NAME: Record<string, string> = { '0,-1': 'N', '1,-1': 'NE', '1,0': 'E', '1,1': 'SE', '0,1': 'S', '-1,1': 'SW', '-1,0': 'W', '-1,-1': 'NW' };
const dirName = (dx: number, dy: number) => NAME[`${dx},${dy}`] ?? '';
const PIECE: Partial<Record<AnyPiece, string>> = { s: 'square', t: 'tower', m: 'mirror', w: 'moving wall', f: 'factory' };

/** The squares side o may place on now: empty and within reach of the towers it had when the turn began. */
export function launchCells(e: Engine, w: World, s: Settings, snap: number[]): Set<number> {
  // lit() reads only the towers given (snap), so the side argument is unused here.
  return new Set([...e.lit(w, 'C', s.reach, snap)].filter((k) => e.empty(w, k)));
}

/**
 * Warnings for placements that block the side's own launch lanes. Simple and documented (the tool says so):
 *   1. A row or column that has launch cells now and none after the placements ("this leaves row 10 with no launch
 *      cell"): with the towers you have now, you could no longer fire E/W along that row (N/S along that column).
 *   2. A piece that stays where it is placed (square, tower, mirror, factory, moving wall) and stands in the straight
 *      line in front of one of your remaining launch cells, in a direction gliders may fly, with nothing between: a
 *      glider you launch there later would hit it first (chip your own square, turn off your mirror, bounce off your
 *      tower). Lines are checked up to twice your reach; a piece on the edge square of a line blocks nothing there.
 * At most 8 warnings, the rest counted.
 * Measured with the towers you have now and on your view of the board only.
 */
export function laneWarnings(e: Engine, view: World, s: Settings, snap: number[], ps: Placement<AnyPiece>[]): string[] {
  const out: string[] = [];
  const before = launchCells(e, view, s, snap);
  const taken = new Map<number, Placement<AnyPiece>>();
  for (const p of ps) {
    if (p.t === 'g' || p.t === 'e') continue; // gliders fly off their square
    for (const [x, y] of p.t === 'w' ? e.wallCells(p) : [[p.x, p.y]]) if (e.inb(x, y)) taken.set(e.K(x, y), p);
  }
  // Placed gliders also leave their squares at the first step, so they take no launch cell away.
  const after = new Set([...before].filter((k) => !taken.has(k)));
  const rows = (set: Set<number>, i: 0 | 1) => new Set([...set].map((k) => e.XY(k)[i]));
  for (const [i, what, dirs] of [[1, 'row', 'E or W'], [0, 'column', 'N or S']] as const) {
    const was = rows(before, i), now = rows(after, i);
    for (const r of [...was].sort((a, b) => a - b)) if (!now.has(r)) out.push(`This leaves ${what} ${r} with no launch cell: with the towers you have now you couldn't fire ${dirs} along ${what} ${r}.`);
  }
  const dirs = s.directions === 8 ? D8 : D4, far = 2 * s.reach;
  const seen = new Set<Placement<AnyPiece>>();
  for (const [k, p] of taken) {
    if (seen.has(p)) continue;
    const blocked: string[] = [];
    for (const [dx, dy] of dirs) {
      // A piece on the board's last square in that direction blocks nothing: the edge would turn the glider there anyway.
      if (!e.inb(e.XY(k)[0] + dx, e.XY(k)[1] + dy)) continue;
      // Walk back from the piece against the direction of flight to the launch cells that would fire into it.
      const [px, py] = e.XY(k);
      for (let d = 1; d <= far; d++) {
        const x = px - d * dx, y = py - d * dy;
        if (!e.inb(x, y)) break;
        const c = e.K(x, y);
        if (after.has(c)) { blocked.push(`${dirName(dx, dy)} from (${x},${y})`); break; }
        if (!e.empty(view, c) || taken.has(c)) break; // something else is hit first
      }
    }
    if (!blocked.length) continue;
    seen.add(p);
    const effect = p.t === 'm' ? 'turn off it' : p.t === 't' ? (s.ownTower === 'destroy' ? 'destroy it' : 'bounce off it') : p.t === 'w' ? 'meet it' : 'hit it first and chip it';
    out.push(`Your ${PIECE[p.t]} at (${p.x},${p.y}) stands in ${blocked.length === 1 ? 'one of your launch lanes' : `${blocked.length} of your launch lanes`}: a glider launched ${blocked.slice(0, 3).join(', ')}${blocked.length > 3 ? ' …' : ''} would ${effect}.`);
  }
  return out.length > 8 ? [...out.slice(0, 7), `… and ${out.length - 7} more like these.`] : out;
}

/** Where a lone symbol glider comes to rest (or not) when launched, and when. */
interface Solo { p: Placement<'e'>; rest: number | null; step: number; passes: boolean }

export interface ConvergeOption {
  launches: { piece: 'symbol_glider'; x: number; y: number; dir: string }[];
  rests: { x: number; y: number; step: number }[];
  symbol: { x: number; y: number; step: number };
}

/**
 * Up to three sets of three symbol-glider launches that come to rest inside the 3 x 3 box around (tx, ty) and form
 * the side's symbol there, each checked by running all three together in the engine from `board` (the side's view,
 * with no guesses about the dark). Returns the options, or why there are none.
 */
export function converging(e: Engine, board: World, s: Settings, me: Side, snap: number[], pts: number, tx: number, ty: number): { options: ConvergeOption[]; why_none?: string; affordable: boolean } {
  const affordable = pts >= 3 * (s.costSeed ?? 0);
  if (!s.costSeed) return { options: [], why_none: 'this ruleset has no symbol gliders', affordable: false };
  if (!e.inb(tx, ty)) return { options: [], why_none: `(${tx},${ty}) is off the board`, affordable };
  if (s.symbolsCapped && s.maxTowers && e.towers(board, me).length >= s.maxTowers) return { options: [], why_none: `you hold ${s.maxTowers} towers, the cap: no symbol can form until you have fewer`, affordable };
  const inBox = (k: number) => { const [x, y] = e.XY(k); return Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1; };
  const horizon = Math.min(s.maxSteps - board.step, 48);
  if (horizon < 1) return { options: [], why_none: 'the match has no steps left', affordable };
  // Every legal symbol-glider launch now (cost aside), each flown alone.
  const launches = e.legal(board, s, me, snap, Number.MAX_SAFE_INTEGER).filter((p): p is Placement<'e'> => p.t === 'e');
  if (!launches.length) return { options: [], why_none: 'you have no square to launch from', affordable };
  const solos: Solo[] = launches.map((p) => {
    const w = e.clone(board);
    e.apply(w, s, { C: me === 'C' ? [p] : [], A: me === 'A' ? [p] : [] });
    const id = w.nid - 1;
    let x = p.x, y = p.y, passes = inBox(e.K(x, y));
    for (let i = 0; i < horizon && w.step < s.maxSteps; i++) {
      e.step(w, s);
      const g = w.gl.find((h) => h.id === id);
      if (g) { x = g.x; y = g.y; if (inBox(e.K(x, y))) passes = true; continue; }
      const k = e.K(x, y);
      return { p, rest: w.sd?.[k] === me || w.fs?.[k]?.o === me ? k : null, step: w.step, passes };
    }
    return { p, rest: null, step: w.step, passes };
  });
  const near = solos.filter((o) => o.rest !== null && inBox(o.rest)).sort((a, b) => a.step - b.step);
  if (!near.length) {
    return {
      options: [], affordable,
      why_none: solos.some((o) => o.passes)
        ? `your launches can fly through the 3 x 3 box around (${tx},${ty}) but nothing there stops them: a symbol glider rests one square short of a rock, a square, a factory, a moving wall or a resting symbol glider (not an edge, a mirror or your own tower). Place a square just beyond the target first, then launch at it next turn.`
        : `no launch of yours reaches the 3 x 3 box around (${tx},${ty}) in the next ${horizon} steps: it is out of every lane you can fire along now`,
    };
  }
  // Keep a few launches per resting square (the earliest), then try sets of three together.
  const per = new Map<number, Solo[]>();
  for (const o of near) { const l = per.get(o.rest!) ?? []; if (l.length < 2) { l.push(o); per.set(o.rest!, l); } }
  const pool = [...per.values()].flat().sort((a, b) => a.step - b.step).slice(0, 14);
  if (pool.length < 3) return { options: [], why_none: `only ${pool.length === 1 ? 'one launch comes' : `${pool.length} launches come`} to rest in the 3 x 3 box around (${tx},${ty}); three are needed`, affordable };
  const options: ConvergeOption[] = [];
  const used = new Set<string>(), tested = new Set<string>();
  const key = (p: Placement<AnyPiece>) => `${p.x},${p.y},${p.dx},${p.dy}`;
  let tried = 0;
  // First sets that share no launch with an option already found, then any other set.
  for (const fresh of [true, false]) {
    for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) for (let c = b + 1; c < pool.length; c++) {
      if (options.length >= 3 || tried >= 400) break;
      const set = [pool[a], pool[b], pool[c]], id = `${a},${b},${c}`;
      if (tested.has(id) || (fresh && set.some((o) => used.has(key(o.p))))) continue;
      tested.add(id);
      // Listed front first: gliders move in the order they were placed, so the one that rests first goes first.
      const ps = set.sort((p, q) => p.step - q.step).map((o) => o.p);
      if (e.refuse(board, s, me, snap, Number.MAX_SAFE_INTEGER, ps)) continue;
      tried++;
      const r = together(e, board, s, me, ps, horizon, inBox);
      if (!r) continue;
      options.push({ launches: ps.map((p) => ({ piece: 'symbol_glider', x: p.x, y: p.y, dir: dirName(p.dx, p.dy) })), ...r });
      ps.forEach((p) => used.add(key(p)));
    }
  }
  if (!options.length) return { options, affordable, why_none: `${pool.length} launches each come to rest near (${tx},${ty}) on their own, but no three of them form a symbol together: they meet or block each other on the way, or rest too far apart` };
  return { options, affordable };
}

/** Runs three launches together; the symbol they form inside the box, with where each came to rest. */
function together(e: Engine, board: World, s: Settings, me: Side, ps: Placement<AnyPiece>[], horizon: number, inBox: (k: number) => boolean): Pick<ConvergeOption, 'rests' | 'symbol'> | null {
  const w = e.clone(board);
  const first = w.nid;
  e.apply(w, s, { C: me === 'C' ? ps : [], A: me === 'A' ? ps : [] });
  const ids = ps.map((_, i) => first + i), last = new Map<number, [number, number]>(ps.map((p, i) => [ids[i], [p.x, p.y]]));
  const rests: ConvergeOption['rests'] = [];
  for (let i = 0; i < horizon && w.step < s.maxSteps; i++) {
    e.step(w, s);
    for (const id of ids) {
      if (!last.has(id)) continue;
      const g = w.gl.find((h) => h.id === id);
      if (g) { last.set(id, [g.x, g.y]); continue; }
      const [x, y] = last.get(id)!;
      last.delete(id);
      // Resting, or resting and taken into a symbol in this same step (converge removes the three's resting marks).
      const k = e.K(x, y);
      const joined = Object.keys(w.fs ?? {}).map(Number).some((j) => w.fs![j].o === me && w.fs![j].at === w.step - 1 && Math.abs(e.XY(j)[0] - x) <= 2 && Math.abs(e.XY(j)[1] - y) <= 2);
      if (w.sd?.[k] === me || joined) rests.push({ x, y, step: w.step });
    }
    const formed = Object.keys(w.fs ?? {}).map(Number).find((k) => w.fs![k].o === me && inBox(k));
    if (formed !== undefined) {
      if (rests.length < 3 || !rests.every((r) => inBox(e.K(r.x, r.y)))) return null;
      const [x, y] = e.XY(formed);
      return { rests, symbol: { x, y, step: w.step } };
    }
    if (!last.size && rests.length < 3) return null;
  }
  return null;
}
