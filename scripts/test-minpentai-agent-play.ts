/**
 * Agent play, solo (src/lib/minpentai/agent-play/solo.ts), in-process: whole matches played by a scripted agent
 * through the same functions the connector's tools call.
 *   npm run test:minpentai-agent-play
 * Checks:
 *   1. A full book-edition match and a Play match, the agent using simulate before each turn; every turn's orders
 *      match their commitments (sha256 of the orders and the salt), the site computer's committed before the
 *      person's were sent; the record replays to the final board.
 *   2. Fog: the view holds nothing the side can't see (compared with the real board), the same view whatever is
 *      hidden; simulate's answer doesn't change when hidden pieces do; a belief piece on a square the side can see
 *      is refused the same way whether or not something is there.
 *   3. The rules of a turn: refusals in plain words, a wrong turn number, a record before the end, resigning, the
 *      site computer playing a turn under a preset, the live link's secret.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { autopilot, ordersText, linkOpens, newSolo, parseOrders, recordOf, replay, resign, rulesOf, setStanding, simulate, SoloError, submit, viewFor, type SoloMatch } from '../src/lib/minpentai/agent-play/solo';

let checks = 0;
const ok = (cond: unknown, what: string) => { checks++; assert.ok(cond, what); };
const throwsLike = (f: () => unknown, re: RegExp, what: string) => { checks++; assert.throws(f, (e: unknown) => e instanceof SoloError && re.test((e as Error).message), what); };
const now = () => new Date().toISOString();
const start = (ruleset: 'book' | 'play', seed: number, level = 3) => newSolo({ id: `t${String(seed).padStart(11, '0')}`.slice(0, 12), ruleset, level, seed, person: 6786, agent: { id: null, name: 'Rook', model: { name: 'Test model', maker: 'Nobody', weights: 'open' } }, now: now() });
const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;

/** A scripted agent: from the view only, a tower toward the enemy if it can, else a glider east; it compares two plans with simulate first. */
function scripted(m: SoloMatch) {
  const v = viewFor(m);
  const cells = v.can_place as [number, number][];
  if (!cells.length) return [];
  const east = [...cells].sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const plans: Record<string, unknown[]> = {
    tower: [{ piece: 'tower', x: east[0][0], y: east[0][1] }],
    glider: [{ piece: 'glider', x: east[0][0], y: east[0][1], dir: 'E' }],
  };
  const sim = simulate(m, { scenarios: Object.entries(plans).map(([name, placements]) => ({ name, placements })) }) as { scenarios: { name: string; legal: boolean; result?: { my_towers: { now: number } } }[] };
  const best = sim.scenarios.filter((s) => s.legal).sort((a, b) => (b.result!.my_towers.now - a.result!.my_towers.now))[0];
  return best ? plans[best.name] : [];
}

function playOut(ruleset: 'book' | 'play', seed: number) {
  const { m, linkSecret } = start(ruleset, seed);
  ok(linkOpens(m, linkSecret) && !linkOpens(m, linkSecret.slice(0, -1) + (linkSecret.endsWith('A') ? 'B' : 'A')) && !linkOpens(m, ''), `${ruleset}: the live link opens with its secret only`);
  let turns = 0;
  while (!m.end && turns < 30) {
    const before = json(m);
    const computerCommitted = m.pend.A.commitment;
    const ps = parseOrders(scripted(m), rulesOf(m).s);
    const r = submit(m, { turn: m.turn, placements: ps, source: 'agent', final: true, now: now() }) as { commitment: string };
    const h = m.history[m.history.length - 1];
    ok(h.A.commitment === computerCommitted && before.pend.A.commitment === computerCommitted, `${ruleset}: the computer's orders at turn ${h.turn} are the ones it committed before the person's were sent`);
    ok(h.C.commitment === r.commitment, `${ruleset}: the person's orders at turn ${h.turn} are the ones committed`);
    turns++;
  }
  ok(m.end, `${ruleset}: the match ends (${m.end?.how} at step ${m.end?.step})`);
  const rec = recordOf(m);
  for (const t of m.history) for (const o of ['C', 'A'] as const) {
    const x = t[o];
    ok(createHash('sha256').update(ordersText(x.placements) + x.salt).digest('hex') === x.commitment && /^[0-9a-f]{64}$/.test(x.salt), `${ruleset}: turn ${t.turn} ${o}: the revealed orders and salt give the commitment`);
  }
  ok(JSON.stringify(replay(json(m))) === JSON.stringify(json(m).w) && rec.turns.length === m.history.length, `${ruleset}: the record replays to the final board`);
  return m;
}

// ---------- 1. Whole matches ----------
playOut('book', 101);
playOut('play', 202);

// ---------- 2. Fog ----------
{
  const { m } = start('book', 303);
  // Play a few turns so pieces are in flight.
  for (let i = 0; i < 3; i++) submit(m, { turn: m.turn, placements: parseOrders(scripted(m), rulesOf(m).s), source: 'agent', final: true, now: now() });
  const { s, e } = rulesOf(m);
  const see = e.lit(m.w, 'C', s.sight);
  const v = viewFor(m);
  const theirs = [...v.board.towers, ...v.board.squares, ...v.board.gliders].filter((p) => p.side === 'theirs');
  ok(theirs.every((p) => see.has(e.K(p.x, p.y))), 'every enemy piece in the view is in sight');
  const realInSight = [...Object.keys(m.w.tw).filter((k) => m.w.tw[+k] === 'A'), ...Object.keys(m.w.sq).filter((k) => m.w.sq[+k].o === 'A')].map(Number).filter((k) => see.has(k));
  ok(realInSight.every((k) => theirs.some((p) => e.K(p.x, p.y) === k)), 'and every enemy tower and square in sight is in the view');
  ok(!JSON.stringify(v).includes('"nid"') && !JSON.stringify(v).includes('"id"') && !('w' in v), 'the view carries no piece ids, counters or board object');
  // The same view whatever is hidden: add Amber pieces far from Cyan's sight.
  const hidden = json(m);
  const far: [number, number][] = [];
  for (let y = 0; y < e.H; y++) for (let x = e.W - 1; x >= 0; x--) { const k = e.K(x, y); if (!see.has(k) && e.empty(hidden.w, k) && far.length < 4) far.push([x, y]); }
  hidden.w.sq[e.K(...far[0])] = { o: 'A', hp: 2 };
  hidden.w.tw[e.K(...far[1])] = 'A';
  hidden.w.gl.push({ id: 9999, o: 'A', x: far[2][0], y: far[2][1], dx: -1, dy: 0 });
  hidden.w.mir = { ...(hidden.w.mir ?? {}), [e.K(...far[3])]: { o: 'A', d: 1, hp: 3 } };
  const strip = (x: ReturnType<typeof viewFor>) => ({ ...x, opponent_commitment: null });
  ok(isDeepStrictEqual(strip(viewFor(hidden)), strip(v)), 'the view is the same whatever is hidden');
  const sc = { scenarios: [{ name: 'wait', placements: [] }, { name: 'shoot', placements: [{ piece: 'glider', x: (v.can_place as number[][])[0][0], y: (v.can_place as number[][])[0][1], dir: 'E' }] }], steps: 24 };
  ok(isDeepStrictEqual(simulate(hidden, sc), simulate(m, sc)), "simulate's answer is the same whatever is hidden");
  // A belief piece on a square in sight is refused the same way whether it holds a piece or not.
  const seenEmpty = [...see].find((k) => e.empty(m.w, k))!, seenFull = Object.keys(m.w.tw).map(Number).find((k) => see.has(k))!;
  const said = (k: number) => { try { simulate(m, { belief: { towers: [{ x: e.XY(k)[0], y: e.XY(k)[1] }] }, scenarios: [{ name: 'x', placements: [] }] }); return 'accepted'; } catch (err) { return (err as Error).message.replace(/\d+,\d+/, 'X'); } };
  ok(said(seenEmpty) === said(seenFull) && /you can see/.test(said(seenEmpty)), 'a belief where you can see is refused in the same words, empty or not');
  // A belief out of sight is used.
  const r = simulate(m, { belief: { towers: [{ x: far[0][0], y: far[0][1] }] }, scenarios: [{ name: 'x', placements: [] }] }) as { scenarios: { result: { board_end: { towers: { side: string }[] } } }[] };
  ok(r.scenarios[0].result.board_end.towers.filter((t) => t.side === 'theirs').length >= 1, 'a belief tower out of sight is on the simulated board');
}

// ---------- 3. The rules of a turn ----------
{
  const { m } = start('book', 404);
  const { s, e } = rulesOf(m);
  throwsLike(() => submit(m, { turn: 1, placements: [], source: 'agent', final: false, now: now() }), /turn 1 is not open; the open turn is 0/, 'a wrong turn is refused');
  const far = e.towers(m.w, 'A')[0];
  throwsLike(() => submit(m, { turn: 0, placements: [{ t: 's', o: 'C', x: e.XY(far)[0], y: e.XY(far)[1], dx: 0, dy: 0 }], source: 'agent', final: false, now: now() }), /not accepted: out of reach/, 'a placement out of reach is refused, without saying what is there');
  throwsLike(() => parseOrders([{ piece: 'dragon', x: 1, y: 1 }], s), /piece must be one of/, 'an unknown piece is refused');
  throwsLike(() => parseOrders([{ piece: 'glider', x: 1, y: 1, dir: 'UP' }], s), /dir must be one of/, 'a glider needs a direction');
  throwsLike(() => parseOrders([{ piece: 'mirror', x: 1, y: 1, slant: '|' }], s), /slant must be/, 'a mirror needs a slant');
  throwsLike(() => parseOrders(new Array(41).fill({ piece: 'square', x: 1, y: 1 }), s), /at most 40/, 'at most 40 placements');
  const twC = e.towers(m.w, 'C')[0], [tx, ty] = e.XY(twC);
  const r1 = submit(m, { turn: 0, placements: [{ t: 's', o: 'C', x: tx + 1, y: ty, dx: 0, dy: 0 }], source: 'person', final: false, now: now() }) as { commitment: string; replaced_previous: boolean };
  const r2 = submit(m, { turn: 0, placements: [{ t: 's', o: 'C', x: tx + 1, y: ty, dx: 0, dy: 0 }], source: 'person', final: false, now: now() }) as { commitment: string; replaced_previous: boolean };
  ok(r2.replaced_previous && r1.commitment !== r2.commitment, 'the same orders sent again get a fresh salt, so a new commitment');
  throwsLike(() => recordOf(m), /no finished match with that id/, 'no record before the end');
  throwsLike(() => setStanding(m, 'play safe', 'turtle'), /preset must be one of/, 'presets are the four');
  setStanding(m, 'Keep my towers safe; build forward only behind walls.', 'defend');
  autopilot(m, { turn: 0, now: now() });
  ok(m.history[0].C.source === 'site-computer' && m.history[0].C.preset === 'defend', 'the site computer played the turn under the preset, and the record says so');
  ok(viewFor(m).my_turns[0].source === 'site-computer', 'the view shows that turn as the site computer\'s');
  resign(m);
  ok(m.end?.how === 'resigned' && m.end.win === 'A', 'resigning ends the match as a loss');
  throwsLike(() => submit(m, { turn: m.turn, placements: [], source: 'agent', final: true, now: now() }), /the match is over/, 'nothing after the end');
  const rec = recordOf(m);
  ok(rec.sides.C.model?.label === 'self-reported' && rec.final_position.towers.some((t) => t.side === 'theirs'), 'after the end the record shows the whole board and the model as self-reported');
}

// ---------- 4. The fog review's findings (2026-10-31), kept as tests ----------
{
  /** Two real boards that differ only by `change`, out of Cyan's sight; both sides then play the same orders. */
  type Change = (m: SoloMatch, e: ReturnType<typeof rulesOf>['e']) => void;
  const twins = (orders: unknown[], turns: number, change: Change, both: Change = () => {}) => {
    const { m } = start('book', 5);
    m.pend.A = { ...m.pend.A, placements: [] };
    both(m, rulesOf(m).e);
    const a = json(m), b = json(m), { e, s } = rulesOf(m);
    change(b, e);
    for (let t = 0; t < turns; t++) for (const x of [a, b]) {
      submit(x, { turn: x.turn, placements: t === 0 ? parseOrders(orders, s) : [], source: 'agent', final: true, now: now() });
      x.pend.A = { ...x.pend.A, placements: [] };
    }
    const strip = (v: ReturnType<typeof viewFor>) => ({ ...v, opponent_commitment: null, my_orders: null });
    const sim = (x: SoloMatch) => simulate(x, { scenarios: [{ name: 'wait', placements: [] }], steps: 12 });
    return isDeepStrictEqual(strip(viewFor(a)), strip(viewFor(b))) && isDeepStrictEqual(sim(a), sim(b));
  };
  const amberSquare = (x: number, y: number) => (m: SoloMatch, e: ReturnType<typeof rulesOf>['e']) => { m.w.sq[e.K(x, y)] = { o: 'A', hp: 2 }; };
  ok(twins([{ piece: 'symbol_glider', x: 4, y: 3, dir: 'E' }], 2, amberSquare(15, 3)), 'F1 your symbol glider coming to rest in the dark does not show where a hidden square is');
  ok(twins([{ piece: 'moving_wall', x: 4, y: 12, dir: 'E' }], 2, amberSquare(7, 12)), 'F1 your moving wall stopping in the dark does not show where a hidden square is');
  ok(twins([], 1, (m) => { m.w.gl.push({ id: 900, o: 'A', x: 14, y: 7, dx: -1, dy: 0 }); }, (m, e) => { m.w.sq[e.K(10, 7)] = { o: 'C', hp: 2 }; }), 'F1 your square out of sight does not show the hits a hidden glider gave it');
  ok(twins([], 1, (m, e) => { m.w.fa = { [e.K(5, 8)]: { o: 'A', dx: 0, dy: 1, hp: 2 } }; m.w.gl.push({ id: 901, o: 'A', x: 9, y: 7, dx: -1, dy: 0 }); }), 'F4 a rock at the edge of sight does not show ore spent by a hidden factory');
  ok(twins([], 0, (m) => { m.w.mw![0].stop = 1; }, (m) => { m.w.mw = [{ id: 902, o: 'A', x: 5, y: 12, dx: 0, dy: -1, c: [1, 1, 1] }]; }), 'F5 whether an enemy wall has stopped is not in the view or the sandbox');
  // F6: in a ruleset without ore, a rock out of sight is shown as at the start, whatever happened to it.
  const { m: p } = start('play', 8);
  const { e: pe, s: ps } = rulesOf(p), see = pe.lit(p.w, 'C', ps.sight);
  const far = pe.L.rocks.find((k) => !see.has(k))!;
  const p2 = json(p); p2.w.rock[far] = 7;
  ok(isDeepStrictEqual(pe.fog(p.w, ps, 'C'), pe.fog(p2.w, ps, 'C')), 'F6 a rock out of sight shows as it was at the start in every ruleset');
  // F3: the computer's numbers include a server-only part, different for every match, shown in the record after the end.
  const c1 = start('book', 9).m, c2 = start('book', 9).m;
  ok(c1.cpu !== c2.cpu && Number.isInteger(c1.cpu), 'F3 the same seed gets different server-only numbers for the computer');
  resign(c1);
  ok(recordOf(c1).computer_random === c1.cpu, 'F3 and the record shows them after the end');
}

console.log(`minpentai agent play: ${checks} checks passed`);
