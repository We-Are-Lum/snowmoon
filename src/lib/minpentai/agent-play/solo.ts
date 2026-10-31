/**
 * Agent play, solo (draft, 2026-10-31; design: docs/proposals/minpentai-agent-play.md): a person, with their own
 * AI as adviser through the Snowmoon connector, plays Cyan against the site's search computer (Amber), on the
 * book edition or on Play's rules. The server is the referee: it alone holds the real board, and everything a
 * side is shown comes from that side's view (engine fog()).
 *
 * Pure: no database and no clock of its own (times come in as arguments). store.ts keeps a match; tools.ts
 * serves it to agents. No clocks yet (solo: a turn resolves when the person's side marks its orders final), no
 * lobby, no second person: those come with PvP.
 *
 * Orders are committed before they're revealed (section 6): each submission gets a fresh 32-byte salt and the
 * commitment sha256(the orders as text + salt). The site computer commits its own orders when the turn opens,
 * from its own view, before it can know the person's; the person's view shows that commitment. Both lists and
 * salts go into the record at reveal; the record opens to anyone when the match ends.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { drawRules, engine, layout, other, rng, verdict, type AnyPiece, type Engine, type Kills, type Placement, type Side, type World } from '../versions/engine';
import type { Settings } from '../versions/schema';
import { SOLO_V1, type VersionRules } from '../versions/solo-v1';
import { BOOK_EDITION } from '../versions/book-edition';
import { PRESETS, searchPlan, type Preset } from '../versions/search';

export const RULESETS: Record<'book' | 'play', VersionRules> = { book: BOOK_EDITION, play: SOLO_V1 };
export type RulesetName = keyof typeof RULESETS;
export const PERSON: Side = 'C';
export const COMPUTER: Side = 'A';
/** The search level the site computer uses when it plays the person's own side (the fallback). */
export const FALLBACK_LEVEL = 3;

/** What a person declares about the model their agent runs (as bring_in_image): a label, not checked. */
export interface ModelClaim { name: string; maker: string; weights: 'open' | 'closed' | 'unknown'; version?: string }

export type Source = 'agent' | 'person' | 'autopilot' | 'site-computer';
export interface Orders { placements: Placement<AnyPiece>[]; source: Source; preset?: Preset; salt: string; commitment: string; final: boolean; note?: string; at: string }
export interface RevealedTurn { turn: number; step: number; C: Omit<Orders, 'final' | 'note'>; A: Omit<Orders, 'final' | 'note'> }

export interface SoloMatch {
  v: 1;
  id: string;
  ruleset: RulesetName;
  level: number;
  seed: number;
  person: number;
  agent: { id: string | null; name: string; model: ModelClaim | null };
  /** sha256 of the live link's secret (the link itself is shown once, to the agent that starts the match). */
  linkHash: string;
  /**
   * Server-only random numbers mixed into the site computer's own (fog review, 2026-10-31): with the seed alone, an
   * agent with the open-source engine could sample the computer's exact choices. Shown in the record after the end.
   */
  cpu: number;
  createdAt: string;
  /** The real board. Server only: never sent to a side while the match is on. */
  w: World;
  kills: Kills;
  /** Where each side last saw each enemy tower. */
  ls: Record<Side, Record<number, number>>;
  /** Turns to act so far (0 is setup). */
  turn: number;
  pend: { C: Orders | null; A: Orders };
  standing: { text: string; preset: Preset } | null;
  history: RevealedTurn[];
  end: { win: Side | 'D'; how: 'towers' | 'time' | 'resigned'; step: number } | null;
}

// ---------- rules ----------

export function rulesOf(m: Pick<SoloMatch, 'ruleset' | 'seed'>): { s: Settings; e: Engine; rule: string | null } {
  const v = RULESETS[m.ruleset];
  const { first, s1 } = drawRules(v, rng(m.seed));
  return { s: s1, e: engineFor(v, s1), rule: first ? first.text : null };
}
const engines = new Map<string, Engine>();
function engineFor(v: VersionRules, s: Settings): Engine {
  const key = `${v === BOOK_EDITION ? 'book' : 'play'}:${s.width}x${s.height}`;
  if (!engines.has(key)) engines.set(key, engine(layout(v, s)));
  return engines.get(key)!;
}

const sha256 = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
/** The orders as committed: sorted keys, pieces in the order given. */
export const ordersText = (ps: Placement<AnyPiece>[]) => JSON.stringify(ps.map((p) => ({ t: p.t, x: p.x, y: p.y, dx: p.dx, dy: p.dy })));
export const commit = (ps: Placement<AnyPiece>[], salt: string) => sha256(ordersText(ps) + salt);

/** The site computer's orders for its side this turn: from its own view, committed before the person's are known. */
function computerOrders(m: SoloMatch, at: string): Orders {
  const { s, e } = rulesOf(m);
  const o = COMPUTER;
  const plan = searchPlan({ e, s, o, view: e.fog(m.w, s, o), lastSeen: { ...m.ls[o] }, snap: e.towers(m.w, o), points: pointsOf(m, s), rng: rng(((m.seed * 7919 + m.turn * 31 + 1) ^ (m.cpu ?? 0)) >>> 0), level: m.level });
  const salt = randomBytes(32).toString('hex');
  return { placements: plan.placements, source: 'site-computer', salt, commitment: commit(plan.placements, salt), final: true, at };
}
const pointsOf = (m: SoloMatch, s: Settings) => (m.w.step === 0 ? s.setupPoints : s.points);

/** A new match. Returns it and the live link's secret (shown once). */
export function newSolo(o: { id: string; ruleset: RulesetName; level: number; seed: number; person: number; agent: SoloMatch['agent']; now: string }): { m: SoloMatch; linkSecret: string } {
  if (!(o.ruleset in RULESETS)) throw new SoloError('ruleset must be "book" or "play"');
  if (!Number.isInteger(o.level) || o.level < 1 || o.level > 5) throw new SoloError('level must be 1 to 5');
  const linkSecret = randomBytes(24).toString('base64url');
  const base = { ruleset: o.ruleset, seed: o.seed };
  const { s, e } = rulesOf(base);
  const w = e.world(s);
  const ls: SoloMatch['ls'] = { C: {}, A: {} };
  e.L.towers.A.forEach((k) => (ls.C[k] = 0));
  e.L.towers.C.forEach((k) => (ls.A[k] = 0));
  const m: SoloMatch = {
    v: 1, id: o.id, ruleset: o.ruleset, level: o.level, seed: o.seed, person: o.person, agent: o.agent,
    linkHash: sha256(linkSecret), cpu: randomBytes(4).readUInt32BE(0) >>> 1, createdAt: o.now, w, kills: { C: 0, A: 0 }, ls, turn: 0,
    pend: { C: null, A: null as unknown as Orders }, standing: null, history: [], end: null,
  };
  m.pend.A = computerOrders(m, o.now);
  return { m, linkSecret };
}

export class SoloError extends Error {}

/** Whether a live link's secret opens this match (constant time). */
export function linkOpens(m: SoloMatch, secret: string): boolean {
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 64) return false;
  const a = Buffer.from(sha256(secret), 'hex'), b = Buffer.from(m.linkHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- what a side is shown ----------

const DIRS: Record<string, [number, number]> = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const dirName = (dx: number, dy: number) => Object.keys(DIRS).find((k) => DIRS[k][0] === dx && DIRS[k][1] === dy) ?? '';
const PIECE_NAMES: Record<AnyPiece, string> = { g: 'glider', s: 'square', t: 'tower', m: 'mirror', e: 'symbol_glider', w: 'moving_wall', f: 'factory' };
const PIECE_OF: Record<string, AnyPiece> = Object.fromEntries(Object.entries(PIECE_NAMES).map(([k, v]) => [v, k as AnyPiece]));

/** A placement as an agent writes it. */
export interface OrderIn { piece: string; x: number; y: number; dir?: string; slant?: string }
export const orderOut = (p: Placement<AnyPiece>) => ({
  piece: PIECE_NAMES[p.t], x: p.x, y: p.y,
  ...(p.t === 'g' || p.t === 'e' || p.t === 'w' || p.t === 'f' ? { dir: dirName(p.dx, p.dy) } : {}),
  ...(p.t === 'm' ? { slant: p.dx > 0 ? '/' : '\\' } : {}),
});

/** A board as plain lists, from one side's point of view: "mine" and "theirs". Ore only where `seeOre` says. */
export function boardOut(e: Engine, w: World, me: Side, seeOre: (k: number) => boolean) {
  const xy = (k: number) => e.XY(+k);
  const who = (o: Side) => (o === me ? 'mine' : 'theirs');
  return {
    rocks: Object.keys(w.rock).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], ...(w.ore && seeOre(k) && w.ore[k] !== undefined ? { ore: w.ore[k] } : {}) })),
    towers: Object.keys(w.tw).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], side: who(w.tw[k]), ...(w.fs?.[k] ? { forming: true } : {}) })),
    squares: Object.keys(w.sq).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], side: who(w.sq[k].o), hits_left: w.sq[k].hp })),
    gliders: w.gl.map((g) => ({ x: g.x, y: g.y, dir: dirName(g.dx, g.dy), side: who(g.o), ...(g.seed ? { symbol: true } : {}) })),
    ...(w.mir ? { mirrors: Object.keys(w.mir).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], slant: w.mir![k].d > 0 ? '/' : '\\', side: who(w.mir![k].o), hits_left: w.mir![k].hp })) } : {}),
    ...(w.sd ? { resting_symbol_gliders: Object.keys(w.sd).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], side: who(w.sd![k]) })) } : {}),
    ...(w.mw ? { moving_walls: w.mw.map((m) => ({ side: who(m.o), dir: dirName(m.dx, m.dy), squares: e.wallCells(m).filter((_, i) => m.c[i]).map(([x, y]) => ({ x, y })) })) } : {}),
    ...(w.fa ? { factories: Object.keys(w.fa).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], dir: dirName(w.fa![k].dx, w.fa![k].dy), side: who(w.fa![k].o), hits_left: w.fa![k].hp })) } : {}),
  };
}

/** Everything the person's side is shown: its view of the board and the turn. Nothing else. */
export function viewFor(m: SoloMatch) {
  const { s, e, rule } = rulesOf(m);
  const me = PERSON, view = e.fog(m.w, s, me), see = e.lit(m.w, me, s.sight);
  // Ore only where the rock and every square beside it are in sight (as fog() keeps it).
  const oreSeen = (k: number) => { const [x, y] = e.XY(k); return see.has(k) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !e.inb(x + dx, y + dy) || see.has(e.K(x + dx, y + dy))); };
  const snap = e.towers(m.w, me);
  const can = [...e.lit(m.w, me, s.reach, snap)].filter((k) => e.empty(m.w, k)).sort((a, b) => a - b);
  const over = !!m.end;
  return {
    match_id: m.id,
    side: 'Cyan',
    opponent: { kind: 'site computer', level: m.level },
    ruleset: m.ruleset === 'book' ? 'book edition' : 'Play',
    rule,
    phase: over ? 'over' : m.turn === 0 ? 'setup' : 'act',
    turn: m.turn,
    step: m.w.step,
    max_steps: s.maxSteps,
    every: s.every,
    board_size: { width: e.W, height: e.H },
    sight: s.sight,
    reach: s.reach,
    points: over ? 0 : pointsOf(m, s),
    costs: costsOf(s),
    board: boardOut(e, view, me, oreSeen),
    last_seen_enemy_towers: Object.entries(m.ls[me]).filter(([k]) => !view.tw[+k]).map(([k, step]) => ({ x: e.XY(+k)[0], y: e.XY(+k)[1], step })),
    can_place: can.map((k) => [e.XY(k)[0], e.XY(k)[1]]),
    my_orders: m.pend.C ? { placements: m.pend.C.placements.map(orderOut), source: m.pend.C.source, final: m.pend.C.final, commitment: m.pend.C.commitment, ...(m.pend.C.note ? { note: m.pend.C.note } : {}) } : null,
    opponent_commitment: over ? null : m.pend.A.commitment,
    standing_order: m.standing,
    my_turns: m.history.map((h) => ({ turn: h.turn, step: h.step, placements: h.C.placements.map(orderOut), source: h.C.source })),
    end: m.end,
  };
}

export function costsOf(s: Settings) {
  return {
    glider: s.costGlider, square: s.costSquare, tower: s.costTower,
    ...(s.costMirror ? { mirror: s.costMirror } : {}), ...(s.costSeed ? { symbol_glider: s.costSeed } : {}),
    ...(s.costWall ? { moving_wall: s.costWall } : {}), ...(s.costFactory ? { factory: s.costFactory } : {}),
  };
}

// ---------- orders ----------

/** An agent's placements as the engine's, or a plain-words reason they can't be. */
export function parseOrders(list: unknown, s: Settings): Placement<AnyPiece>[] {
  if (!Array.isArray(list)) throw new SoloError('placements must be a list');
  if (list.length > 40) throw new SoloError('at most 40 placements a turn');
  return list.map((q: OrderIn, i) => {
    if (!q || typeof q !== 'object') throw new SoloError(`placements[${i}] must be an object`);
    const t = PIECE_OF[q.piece];
    if (!t) throw new SoloError(`placements[${i}].piece must be one of ${Object.keys(costsOf(s)).join(', ')}`);
    if (!Number.isInteger(q.x) || !Number.isInteger(q.y)) throw new SoloError(`placements[${i}] needs whole numbers x and y`);
    let dx = 0, dy = 0;
    if (t === 'g' || t === 'e' || t === 'w' || t === 'f') {
      const d = typeof q.dir === 'string' ? DIRS[q.dir.toUpperCase()] : undefined;
      if (!d) throw new SoloError(`placements[${i}].dir must be one of N, NE, E, SE, S, SW, W, NW`);
      [dx, dy] = d;
    }
    if (t === 'm') {
      if (q.slant !== '/' && q.slant !== '\\') throw new SoloError(`placements[${i}].slant must be "/" or "\\"`);
      dx = q.slant === '/' ? 1 : -1;
    }
    return { t, o: PERSON, x: q.x, y: q.y, dx, dy };
  });
}

/**
 * The person's side submits orders for the open turn (replacing any earlier ones). Checked by the engine on the
 * real board: placing reads only squares within reach, all of which the side can see (the fog invariant), so a
 * refusal says nothing about the dark. With `final`, the turn resolves at once.
 */
export function submit(m: SoloMatch, o: { turn: number; placements: Placement<AnyPiece>[]; source: Source; final: boolean; note?: string; now: string; preset?: Preset }) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  const { s, e } = rulesOf(m);
  const why = e.refuse(m.w, s, PERSON, e.towers(m.w, PERSON), pointsOf(m, s), o.placements);
  if (why) throw new SoloError(`not accepted: ${why}`);
  const replaced = !!m.pend.C;
  const salt = randomBytes(32).toString('hex');
  m.pend.C = { placements: o.placements, source: o.source, ...(o.preset ? { preset: o.preset } : {}), salt, commitment: commit(o.placements, salt), final: o.final, ...(o.note ? { note: o.note } : {}), at: o.now };
  const spent = o.placements.reduce((t, p) => t + e.cost(s, p.t), 0);
  const out = { accepted: true, commitment: m.pend.C.commitment, replaced_previous: replaced, points_left: pointsOf(m, s) - spent };
  if (o.final) return { ...out, resolved: resolve(m, o.now) };
  return out;
}

/** The site computer plays the person's own side this turn, under the standing order's preset (the fallback). */
export function autopilot(m: SoloMatch, o: { turn: number; now: string }) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  const { s, e } = rulesOf(m);
  const preset = m.standing?.preset ?? 'balanced';
  const plan = searchPlan({ e, s, o: PERSON, view: e.fog(m.w, s, PERSON), lastSeen: { ...m.ls[PERSON] }, snap: e.towers(m.w, PERSON), points: pointsOf(m, s), rng: rng(((m.seed * 7919 + m.turn * 31 + 2) ^ (m.cpu ?? 0)) >>> 0), level: FALLBACK_LEVEL, preset });
  return submit(m, { turn: o.turn, placements: plan.placements, source: 'site-computer', final: true, now: o.now, preset });
}

/** Both sides' orders revealed and applied together; the engine runs to the next turn to act (or the end). */
function resolve(m: SoloMatch, now: string) {
  const { s, e } = rulesOf(m);
  const C = m.pend.C!, A = m.pend.A;
  const strip = ({ final: _f, note: _n, ...x }: Orders) => x;
  m.history.push({ turn: m.turn, step: m.w.step, C: strip(C), A: strip(A) });
  e.apply(m.w, s, { C: C.placements, A: A.placements });
  e.updLS(m.w, s.sight, m.ls);
  const from = m.w.step;
  do {
    e.step(m.w, s, m.kills);
    e.updLS(m.w, s.sight, m.ls);
    const v = verdict(e, m.w, s, m.kills);
    if (v) {
      m.end = { win: v, how: e.towers(m.w, 'C').length && e.towers(m.w, 'A').length ? 'time' : 'towers', step: m.w.step };
      m.pend = { C: null, A: m.pend.A };
      return { over: true, end: m.end };
    }
  } while (m.w.step - from < s.every);
  m.turn++;
  m.pend = { C: null, A: computerOrders(m, now) };
  return { over: false, turn: m.turn, step: m.w.step };
}

export function setStanding(m: SoloMatch, text: unknown, preset: unknown) {
  if (m.end) throw new SoloError('the match is over');
  if (typeof text !== 'string' || !text.trim() || text.length > 500) throw new SoloError('text must be 1 to 500 characters');
  if (!PRESETS.includes(preset as Preset)) throw new SoloError(`preset must be one of ${PRESETS.join(', ')}`);
  m.standing = { text: text.trim(), preset: preset as Preset };
  return { ok: true, preset };
}

export function resign(m: SoloMatch) {
  if (m.end) throw new SoloError('the match is over');
  m.end = { win: COMPUTER, how: 'resigned', step: m.w.step };
  m.pend = { C: null, A: m.pend.A };
  return { ok: true, over: true };
}

/** The whole record, for anyone, once the match is over: every turn's orders, sources, commitments and salts. */
export function recordOf(m: SoloMatch) {
  if (!m.end) throw new SoloError('no finished match with that id');
  const { s, e, rule } = rulesOf(m);
  return {
    match_id: m.id, ruleset: m.ruleset, seed: m.seed, computer_random: m.cpu ?? 0, rule, level: m.level, created_at: m.createdAt,
    sides: { C: { kind: 'person', agent: m.agent.name, model: m.agent.model ? { ...m.agent.model, label: 'self-reported' } : null }, A: { kind: 'site computer', level: m.level } },
    turns: m.history.map((h) => ({ turn: h.turn, step: h.step, C: { ...h.C, placements: h.C.placements.map(orderOut) }, A: { ...h.A, placements: h.A.placements.map(orderOut) } })),
    end: m.end,
    final_position: boardOut(e, m.w, PERSON, () => true),
    settings: s,
  };
}

/** Replays a record from its seed and orders; returns the final board (for checking a record). */
export function replay(m: Pick<SoloMatch, 'ruleset' | 'seed' | 'history' | 'end'>): World {
  const { s, e } = rulesOf(m);
  const w = e.world(s), kills: Kills = { C: 0, A: 0 };
  for (const h of m.history) {
    if (w.step !== h.step) throw new SoloError(`turn ${h.turn} at step ${h.step}, but the replay is at ${w.step}`);
    e.apply(w, s, { C: h.C.placements, A: h.A.placements });
    const from = w.step;
    do { e.step(w, s, kills); if (verdict(e, w, s, kills)) return w; } while (w.step - from < s.every);
  }
  return w;
}

// ---------- the sandbox ----------

/**
 * "What happens if I do X, and the enemy is where I think it is?" (section 8). Built only from the side's view
 * and the agent's own belief, never from the real board. A belief piece may only go where the side can't see
 * (where it can see, it already knows); scenario orders are checked on that imagined board.
 */
export function simulate(m: SoloMatch, args: { belief?: Belief; scenarios: { name: string; placements: unknown }[]; steps?: number }) {
  const { s, e } = rulesOf(m);
  const me = PERSON, them = other(me);
  const view = e.fog(m.w, s, me), see = e.lit(view, me, s.sight);
  const board = e.clone(view);
  const b = args.belief ?? {};
  const put = (x: unknown, y: unknown, what: string) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !e.inb(x as number, y as number)) throw new SoloError(`belief: ${what} at ${x},${y} is off the board`);
    const k = e.K(x as number, y as number);
    if (see.has(k)) throw new SoloError(`belief: you can see ${x},${y}; a belief is only for squares you can't see`);
    if (!e.empty(board, k)) throw new SoloError(`belief: ${x},${y} already holds a piece in your belief`);
    return k;
  };
  if (!Array.isArray(b.towers ?? []) || !Array.isArray(b.squares ?? []) || !Array.isArray(b.gliders ?? [])) throw new SoloError('belief: towers, squares and gliders must be lists');
  if ((b.towers?.length ?? 0) + (b.squares?.length ?? 0) + (b.gliders?.length ?? 0) > 60) throw new SoloError('belief: at most 60 pieces');
  for (const t of b.towers ?? []) board.tw[put(t.x, t.y, 'a tower')] = them;
  for (const q of b.squares ?? []) board.sq[put(q.x, q.y, 'a square')] = { o: them, hp: q.hits_left === 1 ? 1 : s.squareHits };
  for (const g of b.gliders ?? []) {
    const d = typeof g.dir === 'string' ? DIRS[g.dir.toUpperCase()] : undefined;
    if (!d) throw new SoloError('belief: a glider needs dir N, NE, E, SE, S, SW, W or NW');
    put(g.x, g.y, 'a glider');
    board.gl.push({ id: board.nid++, o: them, x: g.x, y: g.y, dx: d[0], dy: d[1] });
  }
  if (!Array.isArray(args.scenarios) || args.scenarios.length < 1 || args.scenarios.length > 6) throw new SoloError('scenarios: 1 to 6');
  const remaining = s.maxSteps - board.step;
  const n = args.steps === undefined ? Math.min(s.every, remaining) : args.steps;
  if (!Number.isInteger(n) || n < 1 || n > Math.min(remaining, 96)) throw new SoloError(`steps must be 1 to ${Math.min(remaining, 96)}`);
  const snap = e.towers(board, me), pts = pointsOf(m, s);
  return {
    based_on: `your view at step ${board.step}, and your belief`,
    scenarios: args.scenarios.map((sc) => {
      const name = typeof sc?.name === 'string' ? sc.name.slice(0, 60) : '';
      let ps: Placement<AnyPiece>[];
      try { ps = parseOrders(sc?.placements, s); } catch (err) { return { name, legal: false, why_not: (err as Error).message }; }
      const why = e.refuse(board, s, me, snap, pts, ps);
      if (why) return { name, legal: false, why_not: why };
      const w = e.clone(board);
      const mine0 = e.towers(w, me), theirs0 = e.towers(w, them);
      e.apply(w, s, { C: ps, A: [] });
      for (let i = 0; i < n && w.step < s.maxSteps; i++) e.step(w, s);
      const lost = (ks: number[], o: Side) => ks.filter((k) => w.tw[k] !== o).map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1] }));
      return {
        name, legal: true, cost: ps.reduce((t, p) => t + e.cost(s, p.t), 0),
        result: {
          step: w.step,
          my_towers: { now: e.towers(w, me).length, lost: lost(mine0, me) },
          their_towers_in_your_belief: { now: e.towers(w, them).length, lost: lost(theirs0, them) },
          board_end: boardOut(e, w, me, () => true),
        },
      };
    }),
  };
}
export interface Belief { towers?: { x: number; y: number }[]; squares?: { x: number; y: number; hits_left?: number }[]; gliders?: { x: number; y: number; dir: string }[] }

