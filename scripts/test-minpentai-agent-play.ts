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
 *   7. Agent help (2026-11-02): the rules lines generated from each ruleset (numbers equal the settings; book-3 and
 *      play-3 differ where their settings do), the lines' claims checked against the engine (bounce chips your own
 *      square, the convergence example, the order of two symbol gliders on one row), minpentai_symbol_launches' options
 *      really forming in simulate, simulate's symbols field and lane warnings, and the view unchanged but for the
 *      added fields.
 *   9d. The book-4 playtest v2 fixes (owner, 2026-11-11): a glider's story across the sight edge (back in sight under
 *      its name, a kill report tied to it, "at once"), hits on enemy squares, the false cancellation, the live page's
 *      lead lines, simulate's last-seen squares and contested cells, quieter lane warnings, dead and repeated gliders
 *      left out of my_pieces_out_of_sight, "they may have towers you haven't seen". Each new text with fog twins: two
 *      matches that differ only out of Cyan's sight give the same view, summary, simulate answer, page lead lines and
 *      "they still have towers" line.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { verdict, type AnyPiece, type Kills, type Placement, type World } from '../src/lib/minpentai/versions/engine';
import { TurnWatch } from '../src/lib/minpentai/agent-play/summary';
import { laneWarnings } from '../src/lib/minpentai/agent-play/help';
import { CURRENT, DRAFTS, REVISIONS, RULESETS, UNSEEN, draftInfo, endText, fromRows, ownOf, stillStanding, takeTurnOnPage, turnFrames, turnSummaries, autopilot, checkComputer, planComputer, ordersText, linkOpens, newSolo, parseOrders, recordOf, replay, resign, rulesFor, rulesOf, setStanding, simulate, SoloError, submit, symbolLaunches, viewFor, type RulesetName, type SoloMatch } from '../src/lib/minpentai/agent-play/solo';

let checks = 0;
const ok = (cond: unknown, what: string) => { checks++; assert.ok(cond, what); };
const throwsLike = (f: () => unknown, re: RegExp, what: string) => { checks++; assert.throws(f, (e: unknown) => e instanceof SoloError && re.test((e as Error).message), what); };
const now = () => new Date().toISOString();
const start = (family: 'book' | 'play', seed: number, level = 2) => newSolo({ id: `t${String(seed).padStart(11, '0')}`.slice(0, 12), ruleset: CURRENT[family], level, seed, person: 6786, agent: { id: null, name: 'Rook', model: { name: 'Test model', maker: 'Nobody', weights: 'open' } }, now: now() });
const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;

/** A scripted agent: from the view only, a tower toward the enemy if it can, else a glider east; it compares two plans with simulate first. */
function scripted(m: SoloMatch) {
  const v = viewFor(m);
  const cells = fromRows(v.can_place);
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
    planComputer(m, now()); // as tools.ts does just after the turn opens
    const before = json(m);
    const computerCommitted = m.pend.A!.commitment;
    const ps = parseOrders(scripted(m), rulesOf(m).s);
    const r = submit(m, { turn: m.turn, placements: ps, source: 'agent', final: true, now: now() }) as { commitment: string };
    const h = m.history[m.history.length - 1];
    ok(h.A.commitment === computerCommitted && before.pend.A!.commitment === computerCommitted, `${ruleset}: the computer's orders at turn ${h.turn} are the ones it committed before the person's were sent`);
    ok(h.C.commitment === r.commitment, `${ruleset}: the person's orders at turn ${h.turn} are the ones committed`);
    turns++;
  }
  ok(m.end, `${ruleset}: the match ends (${m.end?.how} at step ${m.end?.step})`);
  const rec = recordOf(m);
  for (const t of m.history) for (const o of ['C', 'A'] as const) {
    const x = t[o];
    ok(createHash('sha256').update(ordersText(x.placements) + x.salt).digest('hex') === x.commitment && /^[0-9a-f]{64}$/.test(x.salt), `${ruleset}: turn ${t.turn} ${o}: the revealed orders and salt give the commitment`);
  }
  ok(checkComputer(json(m)).length === 0, `${ruleset}: every computer move follows from the seed, the revealed value and the orders (as a verifier would check)`);
  const forged = json(m); forged.cpu = forged.cpu.replace(/^./, (c) => (c === '0' ? '1' : '0'));
  ok(checkComputer(forged).some((x) => /does not match its commitment/.test(x)), `${ruleset}: a different value after the fact is caught by the commitment`);
  const moved = json(m); const t1 = moved.history.find((h) => h.A.placements.length)!; t1.A.placements = t1.A.placements.slice(1);
  ok(checkComputer(moved).some((x) => /computer's orders don't follow/.test(x)), `${ruleset}: a changed computer move is caught`);
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
  const sc = { scenarios: [{ name: 'wait', placements: [] }, { name: 'shoot', placements: [{ piece: 'glider', x: fromRows(v.can_place)[0][0], y: fromRows(v.can_place)[0][1], dir: 'E' }] }], steps: 24 };
  ok(isDeepStrictEqual(simulate(hidden, sc), simulate(m, sc)), "simulate's answer is the same whatever is hidden");
  const tgt = fromRows(v.can_place)[0];
  ok(isDeepStrictEqual(symbolLaunches(hidden, { x: tgt[0] + 4, y: tgt[1] }), symbolLaunches(m, { x: tgt[0] + 4, y: tgt[1] })) && isDeepStrictEqual(viewFor(hidden).rules, v.rules), "symbol_launches' answer and the rules lines are the same whatever is hidden");
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
  ok(checkComputer(json(m)).length === 0, 'and that turn, too, follows from the record');
  ok(viewFor(m).my_turns[0].source === 'site-computer', 'the view shows that turn as the site computer\'s');
  resign(m);
  ok(m.end?.how === 'resigned' && m.end.win === 'A', 'resigning ends the match as a loss');
  throwsLike(() => submit(m, { turn: m.turn, placements: [], source: 'agent', final: true, now: now() }), /the match is over/, 'nothing after the end');
  const rec = recordOf(m);
  ok(rec.sides.C.model?.label === 'self-reported' && rec.final_position.towers.some((t) => t.side === 'theirs'), 'after the end the record shows the whole board and the model as self-reported');
  ok(!JSON.stringify(rec).includes('Rook') && !JSON.stringify(rec).includes(String(m.person)) && !('agent' in rec.sides.C), 'the public record names neither the person nor their agent');
}

// ---------- 4. The fog review's findings (2026-10-31), kept as tests ----------
{
  /** Two real boards that differ only by `change`, out of Cyan's sight; both sides then play the same orders. */
  type Change = (m: SoloMatch, e: ReturnType<typeof rulesOf>['e']) => void;
  const twins = (orders: unknown[], turns: number, change: Change, both: Change = () => {}) => {
    const { m } = start('book', 5);
    planComputer(m, now());
    m.pend.A = { ...m.pend.A!, placements: [] };
    both(m, rulesOf(m).e);
    const a = json(m), b = json(m), { e, s } = rulesOf(m);
    change(b, e);
    const w0 = new Map([[a, e.clone(a.w)], [b, e.clone(b.w)]]);
    for (let t = 0; t < turns; t++) for (const x of [a, b]) {
      submit(x, { turn: x.turn, placements: t === 0 ? parseOrders(orders, s) : [], source: 'agent', final: true, now: now() });
      planComputer(x, now());
      x.pend.A = { ...x.pend.A!, placements: [] };
    }
    const strip = (v: ReturnType<typeof viewFor>) => ({ ...v, opponent_commitment: null, my_orders: null });
    const sim = (x: SoloMatch) => simulate(x, { scenarios: [{ name: 'wait', placements: [] }], steps: 12 });
    // The page rebuilds each turn from the record, from the board the twins started on.
    const page = (x: SoloMatch) => turnSummaries(x, 'C', 'page', w0.get(x)).map((t) => ({ lines: t.lines, big: t.big }));
    return isDeepStrictEqual(strip(viewFor(a)), strip(viewFor(b))) && isDeepStrictEqual(sim(a), sim(b)) && isDeepStrictEqual(a.summary, b.summary) && isDeepStrictEqual(page(a), page(b));
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
  ok(c1.cpu !== c2.cpu && /^[0-9a-f]{64}$/.test(c1.cpu), 'F3 the same seed gets different server-only numbers for the computer (32 bytes)');
  ok(viewFor(c1).opponent.random_commitment === createHash('sha256').update(c1.cpu).digest('hex') && !JSON.stringify(viewFor(c1)).includes(c1.cpu), 'F3 its commitment is shown from the first view, the value itself is not');
  resign(c1);
  const rec1 = recordOf(c1);
  ok(rec1.computer_random === c1.cpu && rec1.computer_random_commitment === c1.cpuCommit, 'F3 get_record reveals the value and its commitment after the end');
}

// ---------- 5. book-2: the computer that uses all four pieces; book-1 records keep replaying ----------
{
  const one = newSolo({ id: 'tbook1000001', ruleset: 'book-1', level: 2, seed: 77, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  const two = newSolo({ id: 'tbook2000001', ruleset: 'book-2', level: 2, seed: 77, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  // Same rules; play both through with the scripted person.
  for (const m of [one, two]) {
    while (!m.end) submit(m, { turn: m.turn, placements: parseOrders(scripted(m), rulesOf(m).s), source: 'agent', final: true, now: now() });
  }
  ok(checkComputer(json(one)).length === 0 && checkComputer(json(two)).length === 0, 'a book-1 match and a book-2 match each replay with their own computer');
  const usedBy = (m: SoloMatch) => new Set(m.history.flatMap((h) => h.A.placements.map((p) => p.t)));
  const u2 = usedBy(two);
  ok(['m', 'e', 'w', 'f'].filter((t) => u2.has(t as never)).length >= 3, `the book-2 computer uses the book's pieces (${[...u2].join('')})`);
  ok(CURRENT.book === 'book-2', 'new Rocks and Mirrors matches are book-2');
}

// ---------- 6. book-3 (draft): variant P plus the tie-break; started only by name, by the people it's opened to ----------
{
  const three = newSolo({ id: 'tbook3000001', ruleset: 'book-3', level: 2, seed: 78, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  const v3 = viewFor(three) as Record<string, unknown>, v1 = viewFor(newSolo({ id: 'tbook1000002', ruleset: 'book-1', level: 2, seed: 78, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m) as Record<string, unknown>;
  ok(v3.towers_at_most === 6 && v3.symbols_count_toward_the_cap === true && v3.factories_fire_every_steps === 4 && typeof v3.tie_break === 'string', 'the book-3 view says its limits: 6 towers, symbols counted, factories every 4 steps, the tie-break');
  ok(!('towers_at_most' in v1) && !('tie_break' in v1), 'a book-1 view is unchanged');
  ok(isDeepStrictEqual(v3.costs, { glider: 4, square: 1, tower: 4, mirror: 1, symbol_glider: 2, moving_wall: 4, factory: 2 }), `book-3's costs (${JSON.stringify(v3.costs)})`);
  while (!three.end) submit(three, { turn: three.turn, placements: parseOrders(scripted(three), rulesOf(three).s), source: 'agent', final: true, now: now() });
  ok(checkComputer(json(three)).length === 0, 'a book-3 match plays to the end and replays with its computer');
  const { e, s } = rulesOf(three);
  ok(Object.values(three.w.tw).filter((o) => o === 'A').length <= 6 && Object.values(three.w.tw).filter((o) => o === 'C').length <= 6, 'no side ever holds more than 6 towers');
  // The tie-break, on the final board: towers level at the last step.
  const w = e.clone(three.w);
  w.step = s.maxSteps;
  w.tw = { ...e.world(s).tw }; // each side on its starting towers
  const nC = e.towers(w, 'C').length, nA = e.towers(w, 'A').length;
  const lv = e.towers(w, 'C').length === e.towers(w, 'A').length;
  ok(lv && verdict(e, w, s, { C: 2, A: 1 }) === 'C' && verdict(e, w, s, { C: 1, A: 3 }) === 'A' && verdict(e, w, s, { C: 2, A: 2 }) === 'D', `with towers level at the last step, more enemy towers destroyed wins; equal is a draw (${nC}/${nA})`);
  ok(verdict(e, w, rulesOf(newSolo({ id: 'tbook1000003', ruleset: 'book-1', level: 2, seed: 78, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m).s, { C: 2, A: 1 }) === 'D', 'under book-1 the same board is a draw');
  ok(CURRENT.book === 'book-2' && DRAFTS.includes('book-3'), 'new Rocks and Mirrors matches stay book-2; book-3 is a draft');
}

// ---------- 7. book-4 (draft): 18 wide, symbol gliders see 2, at most 2 symbol towers, kill reports ----------
{
  const mk = (id: string, seed: number) => newSolo({ id, ruleset: 'book-4', level: 2, seed, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  const four = mk('tbook4000001', 81);
  const v0 = viewFor(four) as Record<string, any>;
  ok(v0.board_size.width === 18 && v0.glider_sight?.symbol === 2 && v0.towers_destroyed?.by_you === 0 && Array.isArray(v0.your_kills), 'the book-4 view: 18 wide, symbol gliders\' sight, the kill count from the start');
  let reported = 0, dropped = true, viewsFog = true;
  while (!four.end) {
    // The view is the fog view, and the same with every hidden enemy piece removed (kill reports name only squares of towers already gone).
    planComputer(four, now());
    const { e, s } = rulesOf(four);
    const twin = json(four), see = e.sees(twin.w, s, 'C');
    for (const k of Object.keys(twin.w.tw)) if (twin.w.tw[+k] === 'A' && !see.has(+k)) delete twin.w.tw[+k];
    for (const k of Object.keys(twin.w.sq)) if (twin.w.sq[+k].o === 'A' && !see.has(+k)) delete twin.w.sq[+k];
    twin.w.gl = twin.w.gl.filter((g) => g.o !== 'A' || see.has(e.K(g.x, g.y)));
    for (const f of ['mir', 'fa'] as const) { const o = twin.w[f] as Record<number, { o: string }> | undefined; if (o) for (const k of Object.keys(o)) if (o[+k].o === 'A' && !see.has(+k)) delete o[+k]; }
    if (twin.w.sd) for (const k of Object.keys(twin.w.sd)) if (twin.w.sd[+k] === 'A' && !see.has(+k)) delete twin.w.sd[+k];
    if (twin.w.mw) twin.w.mw = twin.w.mw.filter((w) => w.o !== 'A' || e.wallCells(w).some(([x, y], i) => w.c[i] && e.inb(x, y) && see.has(e.K(x, y))));
    const strip = (x: Record<string, unknown>) => ({ ...x, my_orders: null });
    if (!isDeepStrictEqual(strip(JSON.parse(JSON.stringify(viewFor(four)))), strip(JSON.parse(JSON.stringify(viewFor(twin)))))) viewsFog = false;
    submit(four, { turn: four.turn, placements: parseOrders(scripted(four), rulesOf(four).s), source: 'agent', final: true, now: now() });
    const v = viewFor(four) as Record<string, any>;
    reported = v.your_kills.length;
    if (v.towers_destroyed.by_you !== four.kills.C || v.your_kills.length !== four.kills.C) dropped = false;
    for (const x of v.your_kills) if (v.last_seen_enemy_towers.some((t: { x: number; y: number }) => t.x === x.x && t.y === x.y) && !Object.keys(four.w.tw).some((k) => +k === rulesOf(four).e.K(x.x, x.y) && four.w.tw[+k] === 'A')) dropped = false;
  }
  ok(viewsFog, 'every book-4 view is the same with every hidden enemy piece removed');
  ok(dropped, `every tower your gliders destroyed is reported with its square and counted, and leaves your last-seen (${reported} reported)`);
  ok(checkComputer(json(four)).length === 0, 'a book-4 match plays to the end and replays with its computer');
  // The computer's revision (2026-11-04): a new book-4 match records revision 2 (the guarding computer); a match
  // without one, every book-4 match started before, keeps replaying with the first computer.
  ok(four.computer === REVISIONS['book-4']!.computer && four.computer === 2 && recordOf(four).computer_revision === 2, 'a new book-4 match records the computer revision it is played against, and its record says so');
  {
    const old = mk('tbook4000007', 87);
    delete old.computer;
    while (!old.end) submit(old, { turn: old.turn, placements: parseOrders(scripted(old), rulesOf(old).s), source: 'agent', final: true, now: now() });
    ok(checkComputer(json(old)).length === 0 && !('computer_revision' in recordOf(old)), 'a book-4 match without a revision plays and replays with the first computer');
    ok(checkComputer({ ...json(old), computer: 2 }).some((x) => /computer's orders don't follow/.test(x)), 'replayed as revision 2, its computer moves don\'t follow: the revision matters');
    let threw = false;
    try { checkComputer({ ...json(old), computer: 99 }); } catch (x) { threw = x instanceof SoloError; }
    ok(threw, 'an unknown computer revision is refused');
  }
  // Symbol gliders see 2 around them: a symbol glider of Cyan's in flight lights the squares beside it.
  const m2 = mk('tbook4000002', 82), r2 = rulesOf(m2);
  m2.w.gl.push({ id: 99, o: 'C', x: 9, y: 7, dx: 1, dy: 0, seed: 1 } as never);
  const lit = r2.e.sees(m2.w, r2.s, 'C');
  ok(lit.has(r2.e.K(11, 9)) && lit.has(r2.e.K(7, 5)) && !lit.has(r2.e.K(12, 7)) && !r2.e.lit(m2.w, 'C', r2.s.reach).has(r2.e.K(11, 9)), 'a symbol glider sees 2 around it; placement reach stays the towers\'');
  // A kill out of sight: a Cyan glider aimed at one of Amber's starting towers (which Cyan last saw at step 0).
  const m3 = mk('tbook4000003', 83), r3 = rulesOf(m3), target = r3.e.L.towers.A[0], [tx, ty] = r3.e.XY(target);
  ok(!r3.e.sees(m3.w, r3.s, 'C').has(target) && m3.ls.C[target] === 0, 'the target tower is out of Cyan\'s sight, last seen at the start');
  m3.w.gl.push({ id: 999, o: 'C', x: tx - 3, y: ty, dx: 1, dy: 0 } as never);
  planComputer(m3, now());
  m3.pend.A = { ...m3.pend.A!, placements: [] }; // its orders come from its random value: keep the glider's path clear
  submit(m3, { turn: 0, placements: [], source: 'agent', final: true, now: now() });
  const v3 = viewFor(m3) as Record<string, any>;
  ok(m3.kills.C === 1 && v3.towers_destroyed.by_you === 1 && v3.your_kills.length === 1 && v3.your_kills[0].x === tx && v3.your_kills[0].y === ty && v3.your_kills[0].step >= 1 && v3.your_kills[0].step <= 4, `the kill is reported with its square and step (${JSON.stringify(v3.your_kills)})`);
  ok(!v3.last_seen_enemy_towers.some((t: { x: number; y: number }) => t.x === tx && t.y === ty), 'the destroyed tower leaves Cyan\'s last-seen');
  ok(!JSON.stringify(v3.board).includes(`"x":${tx},"y":${ty}`) || r3.e.sees(m3.w, r3.s, 'C').has(target), 'nothing else about that square is shown');
  ok(DRAFTS.includes('book-4') && CURRENT.book === 'book-2', 'book-4 is a draft, started by name; new matches stay book-2');
  // A symbol tower that goes takes its marker with it: a plain tower later placed on that square isn't a symbol tower.
  {
    const m5 = mk('tbook4000006', 86), { e, s } = rulesOf(m5), k = e.K(8, 7);
    m5.w.tw[k] = 'C'; (m5.w.sy ??= {})[k] = 'C';
    ok(e.symbolTowers(m5.w, 'C') === 1, 'a symbol tower counts');
    m5.w.gl.push({ id: 990, o: 'A', x: 10, y: 7, dx: -1, dy: 0 } as never);
    e.step(m5.w, s); e.step(m5.w, s);
    ok(!m5.w.tw[k] && !m5.w.sy?.[k], `destroyed by a glider, its marker is cleared too`);
    e.apply(m5.w, s, { C: [{ t: 't', o: 'C', x: 8, y: 7, dx: 0, dy: 0 }], A: [] });
    ok(m5.w.tw[k] === 'C' && e.symbolTowers(m5.w, 'C') === 0, 'a plain tower placed there later is not counted as a symbol tower');
  }
  const r4 = rulesFor(mk('tbook4000004', 84)).rules.join('\n');
  ok(/within 2 of each of your symbol gliders while it flies/.test(r4) && !/Only towers give sight/.test(r4) && /at most 2 towers formed from symbols/.test(r4) && /Kill reports:/.test(r4) && /Board: 18 x 14/.test(r4), 'book-4\'s rule lines say its sight, symbol limit, kill reports and board');
  ok(/Only towers give sight/.test(rulesFor(mk('tbook4000005', 85) as never && newSolo({ id: 'tbook3000009', ruleset: 'book-3', level: 2, seed: 85, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m).rules.join('\n')), 'book-3\'s still say only towers give sight');
}

// ---------- 7. Agent help (2026-11-02) ----------
{
  const mk = (ruleset: RulesetName, seed: number) => newSolo({ id: `th${ruleset}${seed}`.slice(0, 12), ruleset, level: 2, seed, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  // Rules lines: every number from the settings.
  for (const ruleset of Object.keys(RULESETS) as RulesetName[]) {
    const m = mk(ruleset, 31), { s } = rulesOf(m), L = rulesFor(m).rules, all = L.join('\n');
    const has = (x: string) => all.includes(x);
    ok(s.carryOver === 0 && has('Unspent points are lost'), `${ruleset}: no carry-over in the settings, as agent play's points (pointsOf) assume, and the lines say so`);
    ok(has(`Board: ${s.width} x ${s.height} squares`) && has(`every ${s.every} steps`) && has(`stops at step ${s.maxSteps}`) && has(`Points: ${s.setupPoints} at setup, ${s.points} each later turn`), `${ruleset}: board, steps and points in the lines equal the settings`);
    ok(has(`Costs: glider ${s.costGlider}, square ${s.costSquare}, tower ${s.costTower}`) && (!s.costSeed || has(`symbol glider ${s.costSeed}`)) && (!s.costFactory || has(`factory ${s.costFactory}`)), `${ruleset}: costs equal the settings`);
    ok(has(`within ${s.reach} squares`) && has(`within ${s.sight} of any of your towers`), `${ruleset}: reach ${s.reach} and sight ${s.sight}`);
    ok(has(s.directions === 4 ? 'fly N, E, S or W only' : 'any of 8 directions'), `${ruleset}: launch directions (${s.directions})`);
    ok(has("this edition's invented rules") && L.every((l) => typeof l === 'string' && l.length > 0 && l.length < 1200), `${ruleset}: labelled as this edition's invented rules, plain lines`);
    ok(!!s.costSeed === has('Convergence:') && !!s.costSeed === has('Convergence example:'), `${ruleset}: the convergence rule and its example where symbol gliders exist`);
    ok(s.maxTowers ? has(`at most ${s.maxTowers}`) && has(s.symbolsCapped ? 'Symbols count toward the cap' : 'not stopped by the cap') : has('no limit'), `${ruleset}: the tower cap`);
    ok(s.factoryEvery ? has(`every ${s.factoryEvery} steps`) : !s.costFactory || has('only when its rock is hit'), `${ruleset}: factory timing`);
    ok(has(s.tieBreak ? 'destroyed more enemy towers' : 'level is a draw'), `${ruleset}: the tie-break`);
    const v = viewFor(m) as Record<string, unknown>;
    ok(isDeepStrictEqual(v.rules, L) && /\/minpentai\/book$/.test(String(v.how_the_pieces_work)), `${ruleset}: the view carries the rules and the pieces page`);
  }
  const b3 = rulesFor(mk('book-3', 1)).rules, p3 = rulesFor(mk('play-3', 1)).rules;
  ok(b3.some((l) => /at most 6/.test(l)) && p3.some((l) => /no limit/.test(l)) && !p3.some((l) => /Symbol glider|Mirror|Factory/.test(l)), 'book-3 and play-3 lines differ where their settings do');
  // A Play match whose drawn rule allows diagonals says 8 directions, and names its drawn rule.
  const diag = Array.from({ length: 60 }, (_, i) => mk('play-3', i + 1)).find((m) => rulesOf(m).s.directions === 8)!;
  ok(!!diag && rulesFor(diag).rules.some((l) => /any of 8 directions/.test(l)) && rulesFor(diag).rules.some((l) => /drawn rule: Gliders may also fly diagonally/.test(l)), 'a Play match drawn with diagonals says 8 directions and its drawn rule');
  // The view is unchanged but for the two added fields.
  {
    const m = mk('book-2', 32), v = viewFor(m) as Record<string, unknown>;
    const old = ['match_id', 'side', 'opponent', 'ruleset', 'rule', 'phase', 'turn', 'step', 'max_steps', 'every', 'board_size', 'sight', 'reach', 'points', 'costs', 'board', 'grid', 'in_sight', 'last_seen_enemy_towers', 'my_pieces_out_of_sight', 'enemy_can_place_from_last_seen', 'can_place', 'can_place_contested', 'my_orders', 'standing_order', 'my_turns', 'end'];
    ok(isDeepStrictEqual(Object.keys(v), [...old, 'rules', 'how_the_pieces_work', 'last_turn_summary']) && isDeepStrictEqual(viewFor(json(m)), v), 'the view has its fields in order (2026-11-04: grid, in_sight, my_pieces_out_of_sight and enemy_can_place_from_last_seen added; can_place as rows; 2026-11-11: can_place_contested), and is the same each time');
  }
  // The lines' claims, checked against the engine on a bare book-3 board.
  {
    const m = mk('book-3', 2), { s, e } = rulesOf(m);
    const bare = () => { const w = e.world(s, true); w.tw[e.K(0, 0)] = 'C'; w.tw[e.K(23, 13)] = 'A'; return w; };
    const P = (t: AnyPiece, x: number, y: number, dx = 0, dy = 0): Placement<AnyPiece> => ({ t, o: 'C', x, y, dx, dy });
    // Bounce: a glider off a rock comes back and chips your own square.
    let w = bare(); w.rock[e.K(8, 5)] = 1;
    e.apply(w, s, { C: [P('s', 3, 5), P('g', 5, 5, 1, 0)], A: [] });
    for (let i = 0; i < 8; i++) e.step(w, s);
    ok(w.sq[e.K(3, 5)]?.hp === s.squareHits - 1, 'a glider that bounces off a rock flies back and chips your own square (as the lines say)');
    // The mirror example (2026-11-04): S from (14,6), "\" at (14,8): at (14,7) after step 1, still there flying E after
    // step 2, then E along row 7; the mirror's square is never entered.
    w = bare();
    e.apply(w, s, { C: [P('m', 14, 8, -1, 0), P('g', 14, 6, 0, 1)], A: [] });
    const path: string[] = [];
    for (let i = 0; i < 4; i++) { e.step(w, s); const g = w.gl[0]; path.push(`${g.x},${g.y},${g.dx},${g.dy}`); }
    ok(isDeepStrictEqual(path, ['14,7,0,1', '14,7,1,0', '15,7,1,0', '16,7,1,0']) && w.mir?.[e.K(14, 8)]?.hp === (s.mirrorHits ?? 3) - 1, `the mirror example plays as the lines say (${path.join(' | ')})`);
    ok(rulesFor(m).rules.some((l) => l.includes('A glider never enters the mirror\'s square') && l.includes('Mirror example: a glider launched S from (14,6) with a "\\" at (14,8)')), 'the mirror line and its example are in the rules');
    // The convergence example: E on rows 4, 5, 6 against a column at x = 15 forms at (14,4).
    w = bare(); for (const y of [4, 5, 6]) w.rock[e.K(15, y)] = 1;
    e.apply(w, s, { C: [4, 5, 6].map((y) => P('e', 10, y, 1, 0)), A: [] });
    for (let i = 0; i < 8; i++) e.step(w, s);
    ok(w.tw[e.K(14, 4)] === 'C' && w.fs?.[e.K(14, 4)]?.o === 'C' && !w.sd?.[e.K(14, 5)], 'the convergence example forms at (14,4), as the lines say');
    w = bare(); for (const y of [3, 5, 8]) w.rock[e.K(15, y)] = 1;
    e.apply(w, s, { C: [3, 5, 8].map((y) => P('e', 10, y, 1, 0)), A: [] });
    for (let i = 0; i < 8; i++) e.step(w, s);
    ok(!w.fs && Object.keys(w.sd ?? {}).length === 3, 'rows 3, 5 and 8 rest but never form');
    // An edge doesn't stop a symbol glider.
    w = bare(); e.apply(w, s, { C: [P('e', 20, 7, 1, 0)], A: [] });
    for (let i = 0; i < 5; i++) e.step(w, s);
    ok(!w.sd && w.gl.length === 1 && w.gl[0].dx === -1, 'a symbol glider bounces off the edge instead of resting');
    // Two on one row: front listed first rests both; back listed first loses the front one.
    const row = (order: number[]) => { const x = bare(); x.rock[e.K(15, 9)] = 1; e.apply(x, s, { C: order.map((sx) => P('e', sx, 9, 1, 0)), A: [] }); for (let i = 0; i < 8; i++) e.step(x, s); return Object.keys(x.sd ?? {}).length; };
    ok(row([12, 11]) === 2 && row([11, 12]) === 1, 'two symbol gliders on one row: both rest only with the front one listed first');
  }
  // minpentai_symbol_launches: each option really forms in simulate, where and when it says.
  {
    const m = mk('book-2', 11), v = viewFor(m);
    const towers = v.board.towers.filter((t) => t.side === 'mine');
    const target = v.board.rocks.map((r) => ({ x: r.x - 1, y: r.y })).find((t) => towers.some((tw) => Math.abs(tw.y - t.y) <= 3) && symbolLaunches(m, t).options.length >= 2);
    ok(!!target, `a target near a rock with at least two options (${JSON.stringify(target)})`);
    const r = symbolLaunches(m, target!);
    ok(r.options.length >= 2 && r.options.length <= 3 && r.affordable === true && r.cost === 3 * rulesOf(m).s.costSeed!, 'up to three options, each three symbol gliders, with the cost and whether it is affordable');
    const sim = simulate(m, { scenarios: r.options.map((o, i) => ({ name: `o${i}`, placements: o.launches })), steps: 24 });
    sim.scenarios.forEach((sc, i) => {
      const o = r.options[i], got = (sc as { symbols?: { x: number; y: number; step: number }[] }).symbols ?? [];
      ok(sc.legal && got.some((x) => x.x === o.symbol_forms.x && x.y === o.symbol_forms.y && x.step === o.symbol_forms.step), `option ${i}: simulate forms the symbol at (${o.symbol_forms.x},${o.symbol_forms.y}) at step ${o.symbol_forms.step}`);
      ok(o.launches.every((l) => fromRows(v.can_place).some(([x, y]) => x === l.x && y === l.y) && ['N', 'E', 'S', 'W'].includes(l.dir)) && o.rest_at.every((p) => Math.abs(p.x - target!.x) <= 1 && Math.abs(p.y - target!.y) <= 1), `option ${i}: launches from can_place in N/E/S/W, resting inside the 3 x 3 box`);
    });
    const open = symbolLaunches(m, { x: 12, y: 7 });
    ok(!open.options.length && /no launch of yours reaches|nothing there stops them|three are needed/.test(open.why_none ?? ''), `no option says why (${open.why_none})`);
    ok(/no symbol gliders/.test(symbolLaunches(mk('play-3', 3), { x: 5, y: 5 }).why_none ?? ''), 'Play: no symbol gliders, said so');
    const capped = mk('book-3', 4), { e } = rulesOf(capped);
    for (const [x, y] of [[2, 2], [2, 4], [2, 6], [3, 3]]) capped.w.tw[e.K(x, y)] = 'C';
    ok(/the cap/.test(symbolLaunches(capped, { x: 6, y: 5 }).why_none ?? ''), 'book-3 at 6 towers: no symbol can form, the cap said');
    const poor = mk('book-2', 11); poor.w.step = 12; // a later turn: 10 points, still enough for three at 2
    ok(symbolLaunches(poor, target!).points === 10, 'the points are this turn\'s');
  }
  // simulate's lane warnings: a row left with no launch cell, and a square in front of launch cells.
  {
    const m = mk('book-2', 11), v = viewFor(m);
    const rows = new Map<number, number[]>();
    for (const [x, y] of fromRows(v.can_place)) rows.set(y, [...(rows.get(y) ?? []), x]);
    const [y, xs] = [...rows].find(([, xs]) => xs.length >= 3)!;
    const sim = simulate(m, { scenarios: [
      { name: 'fill', placements: xs.map((x) => ({ piece: 'square', x, y })) },
      { name: 'front', placements: [{ piece: 'square', x: Math.max(...xs), y }] },
      { name: 'glider', placements: [{ piece: 'glider', x: Math.max(...xs), y, dir: 'E' }] },
    ] }) as { scenarios: { name: string; warnings?: string[] }[] };
    const [fill, front, gl] = sim.scenarios;
    ok(fill.warnings?.some((w) => w.includes(`leaves row ${y} with no launch cell`)) === true, `filling row ${y}'s launch cells warns that it leaves row ${y} with no launch cell`);
    ok(front.warnings?.some((w) => new RegExp(`square at \\(${Math.max(...xs)},${y}\\) stands in .*launched E from \\(${Math.max(...xs) - 1},${y}\\)`).test(w)) === true, `a square at the front of row ${y} warns it stands in the lane E from the cell behind it`);
    ok(!gl.warnings, 'a glider placement warns of nothing (it flies off its square)');
  }
}

// ---------- 9. the turn summary: only what the person's side saw ----------
{
  // A glider of Cyan's destroyed just outside Cyan's sight must read exactly as one that flew on out of sight.
  const mk = (id: string) => newSolo({ id, ruleset: 'book-1', level: 1, seed: 91, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  const lines = (hidden: boolean) => {
    const m = mk(hidden ? 'tsum00000001' : 'tsum00000002'), { e, s } = rulesOf(m);
    const [tx, ty] = e.XY(e.L.towers.C[0]), edge = tx + s.sight; // the last column Cyan sees on that row
    if (hidden) m.w.tw[e.K(edge + 1, ty)] = 'A';
    ok(!e.lit(m.w, 'C', s.sight).has(e.K(edge + 1, ty)), 'the square past the glider is out of Cyan\'s sight');
    m.w.gl.push({ id: 900, o: 'C', x: edge, y: ty, dx: 1, dy: 0 } as never);
    planComputer(m, now());
    m.pend.A = { ...m.pend.A!, placements: [] }; // the computer places nothing, so both boards differ only by that tower
    submit(m, { turn: 0, placements: [], source: 'agent', final: true, now: now() });
    return { lines: (viewFor(m) as Record<string, any>).last_turn_summary.lines as string[], killed: m.kills.C };
  };
  const real = lines(true), twin = lines(false);
  ok(real.killed === 1 && twin.killed === 0, 'the hidden tower was destroyed in one match and not in the other');
  ok(isDeepStrictEqual(real.lines, twin.lines), `the summaries read the same (${JSON.stringify(real.lines)})`);
  ok(real.lines.some((l) => /flew out of your sight from/.test(l)), 'it says the glider flew out of sight');
  // A whole match: every square a summary line names was in Cyan's sight at that step, or is Cyan's own placement.
  const m = start('book', 92).m;
  let named = 0, outside = 0;
  while (!m.end) {
    const placed = parseOrders(scripted(m), rulesOf(m).s);
    submit(m, { turn: m.turn, placements: placed, source: 'agent', final: true, now: now() });
    const sum = (viewFor(m) as Record<string, any>).last_turn_summary;
    ok(sum && sum.turn === m.history[m.history.length - 1].turn && sum.lines.length > 0, 'every turn played has a summary');
    // Replay to the turn's start and record Cyan's sight at every step of it.
    const { e, s } = rulesOf(m), w = e.world(s), k: Kills = { C: 0, A: 0 }, sight = new Map<number, Set<number>>();
    for (const h of m.history) { e.apply(w, s, { C: h.C.placements, A: h.A.placements }); const from = w.step; if (h.turn === sum.turn) sight.set(w.step, e.lit(w, 'C', s.sight)); do { e.step(w, s, k); if (h.turn === sum.turn) sight.set(w.step, e.lit(w, 'C', s.sight)); } while (w.step - from < s.every && !verdict(e, w, s, k)); }
    // Each part of a line (a glider's story has several, split by ":" and ";") that names a square and a step.
    for (const l of sum.lines as string[]) {
      if (/^Your side placed|^Kill report/.test(l)) continue;
      for (const part of l.split(/[:;] /)) {
        const mm = part.match(/\((\d+), (\d+)\).*step (\d+)/);
        if (!mm) continue;
        named++;
        const [x, y, st] = [+mm[1], +mm[2], +mm[3]];
        const seen = [st - 1, st, st + 1].some((t) => sight.get(t)?.has(e.K(x, y)));
        if (!seen && !/lost your tower/.test(part)) { outside++; console.log('  outside sight:', part, '|', l); }
      }
    }
  }
  ok(named > 0 && outside === 0, `every square the summaries name was in Cyan's sight then (${named} named)`);
}

// ---------- 9b. The turn summary's stories (owner, 2026-11-04): the same whatever happens out of sight ----------
{
  const mk4 = (id: string, seed: number, level = 2) => newSolo({ id, ruleset: 'book-4', level, seed, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  // What only a kill report gives: its own line, the tally, or (2026-11-11) the "; destroyed … (kill report)" a story carries.
  const noReports = (ls: string[]) => ls.filter((l) => !/^Kill report|^Towers destroyed so far/.test(l)).map((l) => l.replace(/; destroyed the enemy tower at \(\d+, \d+\) at step \d+ \(kill report\)/, ''));
  // A book-4 plain glider (it doesn't see) at the edge of sight, with a hidden tower in front of it or not: the same
  // summary but for the kill report.
  const edge = (hidden: boolean) => {
    const m = mk4(hidden ? 'tsum40000001' : 'tsum40000002', 91), { e, s } = rulesOf(m);
    const [tx, ty] = e.XY(e.L.towers.C[0]), x = tx + s.sight;
    ok(!e.sees(m.w, s, 'C').has(e.K(x + 1, ty)) && e.empty(m.w, e.K(x + 1, ty)), 'book-4: the square past the glider is out of Cyan\'s sight, and empty');
    if (hidden) m.w.tw[e.K(x + 1, ty)] = 'A';
    m.w.gl.push({ id: 900, o: 'C', x, y: ty, dx: 1, dy: 0 } as never);
    planComputer(m, now());
    m.pend.A = { ...m.pend.A!, placements: [] };
    submit(m, { turn: 0, placements: [], source: 'agent', final: true, now: now() });
    return { lines: m.summary!.lines, first: JSON.stringify(m.kills.log?.[0] ?? null), at: `(${x + 1}, ${ty})` };
  };
  const r4 = edge(true), t4 = edge(false);
  ok(r4.first !== t4.first, 'book-4: the glider destroyed the hidden tower in one match, flew on in the other');
  ok(isDeepStrictEqual(noReports(r4.lines), noReports(t4.lines)), `book-4: the summaries read the same but for the kill report (${JSON.stringify(t4.lines)})`);
  ok(r4.lines.some((l) => /^Your glider sent earlier .*flew out of your sight from .*; destroyed the enemy tower at/.test(l) && l.includes(`${r4.at} at step 1 (kill report)`)) && !r4.lines.some((l) => l.startsWith('Kill report:')) && !t4.lines.some((l) => l.includes(r4.at)), `the kill report names the square, told in the story of the glider that flew toward it (${JSON.stringify(r4.lines)})`);

  // A whole book-4 match, turn by turn: a twin whose enemy squares out of sight differ (added, or removed), where no
  // glider or wall comes near them all turn, reads the same summary and view.
  const symbols = (m: SoloMatch) => {
    const v = viewFor(m), out: unknown[] = [], rows = new Set<number>();
    let pts = v.points;
    for (const [x, y] of fromRows(v.can_place).sort((a, b) => b[0] - a[0] || a[1] - b[1])) { if (pts < 2) break; if (rows.has(y)) continue; rows.add(y); out.push({ piece: 'symbol_glider', x, y, dir: 'E' }); pts -= 2; }
    return out;
  };
  {
    const m = mk4('tsum40000003', 93);
    let twins = 0, changed = 0, memOk = true;
    while (!m.end && m.turn < 10) {
      planComputer(m, now());
      const { e, s } = rulesOf(m), orders = parseOrders(m.turn % 2 ? symbols(m) : scripted(m), s);
      // The squares Cyan sees at any frame of the turn, and every square any glider or wall stands on or beside.
      const pw = e.clone(m.w), seen = new Set<number>(), near = new Set<number>();
      const mark = () => {
        for (const k of e.sees(pw, s, 'C')) seen.add(k);
        const around = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (e.inb(x + dx, y + dy)) near.add(e.K(x + dx, y + dy)); };
        for (const g of pw.gl) around(g.x, g.y);
        for (const w of pw.mw ?? []) for (const [x, y] of e.wallCells(w)) around(x, y);
      };
      mark();
      e.apply(pw, s, { C: orders, A: m.pend.A!.placements });
      mark();
      const from = pw.step;
      do { e.step(pw, s); mark(); } while (pw.step - from < s.every && !verdict(e, pw, s));
      const a = json(m), b = json(m);
      let n = 0;
      for (let k = 0; k < e.W * e.H && n < 4; k++) {
        if (seen.has(k) || near.has(k)) continue;
        if (b.w.sq[k]?.o === 'A') { delete b.w.sq[k]; n++; } else if (e.empty(b.w, k) && !Object.keys(m.ls.C).includes(String(k))) { b.w.sq[k] = { o: 'A', hp: 1 }; n++; }
      }
      if (n) {
        changed += n;
        for (const x of [a, b]) submit(x, { turn: x.turn, placements: orders, source: 'agent', final: true, now: now() });
        const strip = (v: ReturnType<typeof viewFor>) => ({ ...v, my_orders: null });
        const sim = (x: SoloMatch) => simulate(x, { scenarios: [{ name: 'wait', placements: [] }], steps: 12 });
        if (isDeepStrictEqual(a.summary, b.summary) && isDeepStrictEqual(strip(viewFor(a)), strip(viewFor(b))) && isDeepStrictEqual(sim(a), sim(b)) && stillStanding(a) === stillStanding(b)) twins++;
        else console.log('  differs at turn', m.turn, JSON.stringify(a.summary?.lines), JSON.stringify(b.summary?.lines));
      }
      submit(m, { turn: m.turn, placements: orders, source: 'agent', final: true, now: now() });
      // Where it sees, the memory of its own pieces is what it sees: its squares there, with their hits.
      const see = e.sees(m.w, s, 'C'), mem = ownOf(m).C;
      for (const k of see) { const q = m.w.sq[k]; if ((q?.o === 'C') !== (k in mem.sq) || (q?.o === 'C' && mem.sq[k].hp !== q.hp)) memOk = false; }
    }
    ok(twins > 0 && changed > 0, `every turn's summary, view, simulate answer and "still" line are the same with enemy squares out of sight changed (${twins} turns, ${changed} squares)`);
    ok(memOk, 'where it sees, the memory of its own squares is what it sees');
  }

  // A book-4 match of symbol gliders: one story a glider; a symbol glider (it sees) never "leaves your sight"; every tower
  // a story says a glider destroyed is in the kill log at that square and step; symbol gliders' kills are theirs.
  {
    const m = mk4('tsum40000004', 7, 3);
    // Against the first computer, which leaves its lanes open, so the symbol gliders make kills to check (the guarding
    // computer, revision 2, walls them: #113). The stories don't depend on which computer plays.
    delete m.computer;
    while (!m.end && m.turn < 8) { planComputer(m, now()); submit(m, { turn: m.turn, placements: parseOrders(symbols(m), rulesOf(m).s), source: 'agent', final: true, now: now() }); }
    const { e } = rulesOf(m), sums = turnSummaries(m), all = sums.flatMap((x) => x.lines);
    ok(!all.some((l) => /^Your symbol glider/.test(l) && /out of your sight/.test(l)), 'a symbol glider (it sees as it flies) is never said to leave your sight');
    let kills = 0, killsOk = true;
    for (const l of all) for (const k of l.matchAll(/destroyed the enemy tower at \((\d+), (\d+)\) at step (\d+)/g)) {
      kills++;
      if (!(m.kills.log ?? []).some((x) => x.o === 'C' && x.k === e.K(+k[1], +k[2]) && x.step === +k[3])) killsOk = false;
    }
    ok(kills > 0 && killsOk, `every kill a story tells is in the kill log (${kills})`);
    ok(all.some((l) => /^Your symbol glider from .*: .*destroyed the enemy tower/.test(l)), 'a symbol glider\'s kill is credited to the symbol glider');
    ok(!all.some((l) => /stopped near/.test(l)) && all.some((l) => /came to rest at/.test(l)), 'no "stopped near": a symbol glider comes to rest, or destroys, or is destroyed');
    ok(sums.every((x) => x.big.length <= 3) && sums.filter((x) => x.kills > 0).every((x) => x.big.some((b) => /destroyed/.test(b))), 'each turn leads with at most 3 big moments; a turn with kills leads with them');
    ok(sums.reduce((t, x) => t + x.lost, 0) === m.kills.A, `the turns' losses add up to the towers lost (${m.kills.A})`);
    ok(all.some((l) => /^Your side placed \d+ symbol gliders heading east/.test(l)), 'placements read "Your side placed 5 symbol gliders heading east"');
    // The live page's end and "they still have towers" (fix 3).
    const still = stillStanding(m);
    if (!m.end) ok(still && /^They still have towers/.test(still) && (/somewhere out of your sight/.test(still) || still.endsWith("They may have towers you haven't seen.")), `while it goes on: ${still}`);
    while (!m.end) submit(m, { turn: m.turn, placements: parseOrders(symbols(m), rulesOf(m).s), source: 'agent', final: true, now: now() });
    const end = endText(m)!;
    ok(/(won|draw).*(with more towers standing, \d+ to \d+, at step \d+|every enemy tower destroyed|every tower of yours destroyed|towers standing level|both sides' last towers)/.test(end) && !/on towers/.test(end) && stillStanding(m) === null, `the end says why: "${end}"`);
  }

  // Take turn keeps the commitment the AI was given (the report's small point: the record's differed).
  {
    const m = mk4('tsum40000005', 95);
    const r = submit(m, { turn: 0, placements: parseOrders(scripted(m), rulesOf(m).s), source: 'agent', final: false, now: now() });
    takeTurnOnPage(m, { turn: 0, now: now() });
    ok(m.history[0].C.commitment === r.commitment && createHash('sha256').update(ordersText(m.history[0].C.placements) + m.history[0].C.salt).digest('hex') === r.commitment, 'Take turn keeps the drafted commitment, and the revealed salt gives it');
  }
}

// ---------- 9c. Its own pieces out of sight, as last seen (owner, 2026-11-04) ----------
{
  const { belief } = await import('../src/lib/minpentai/versions/search');
  const m0 = newSolo({ id: 'town00000001', ruleset: 'book-4', level: 2, seed: 94, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  const { e, s } = rulesOf(m0), seeC = e.sees(m0.w, s, 'C'), seeA = e.sees(m0.w, s, 'A');
  const dark = (see: Set<number>, left: boolean) => [...Array(e.W * e.H).keys()].find((k) => !see.has(k) && e.empty(m0.w, k) && (e.XY(k)[0] < e.W / 2) === left && !e.sees(m0.w, s, left ? 'A' : 'C').has(k))!;
  const kC = dark(seeC, true), kA = dark(seeA, false);
  ok(kC !== undefined && kA !== undefined, 'a square out of Cyan\'s sight on its half, and one out of Amber\'s on its half');
  // Each side remembers a square of its own there, hit twice when last seen; the real square is intact, chipped or gone.
  const variant = (id: string, hp: number | null) => {
    const m = json(m0);
    m.id = id;
    m.own!.C.sq[kC] = { hp: 2, step: 0 };
    m.own!.A.sq[kA] = { hp: 2, step: 0 };
    if (hp) { m.w.sq[kC] = { o: 'C', hp }; m.w.sq[kA] = { o: 'A', hp }; }
    return m;
  };
  const ms = [variant('town00000002', 2), variant('town00000003', 1), variant('town00000004', null)];
  const v = ms.map((m) => viewFor(m)), sim = ms.map((m) => simulate(m, { scenarios: [{ name: 'wait', placements: [] }], steps: 12 }));
  ok(v.every((x) => isDeepStrictEqual({ ...x, match_id: null }, { ...v[0], match_id: null })), 'the view is the same whether your square out of sight is intact, chipped or destroyed');
  ok(sim.every((x) => isDeepStrictEqual(x, sim[0])), 'and so is simulate');
  const [cx, cy] = e.XY(kC);
  ok(v[0].my_pieces_out_of_sight.some((p) => p.piece === 'square' && 'x' in p && p.x === cx && p.y === cy && 'hits_left' in p && p.hits_left === 2 && p.last_seen_step === 0), 'the view lists it as last seen: its square, 2 hits left, step 0');
  ok(v[0].grid.rows[cy][cx] === 'S' && !v[0].board.squares.some((q) => q.x === cx && q.y === cy), 'the grid shows it, the board (what you see) doesn\'t');
  const plans = ms.map((m) => { planComputer(m, now()); return ordersText(m.pend.A!.placements); });
  ok(plans.every((p) => p === plans[0]), 'the computer\'s plan is the same whether its own square out of sight is intact, chipped or destroyed');
  const auto = ms.map((m) => { m.pend.A = null; autopilot(m, { turn: 0, now: now() }); return ordersText(m.history[0].C.placements); });
  ok(auto.every((p) => p === auto[0]), 'and so is the site computer\'s plan for your side');
  const b = belief({ e, o: 'A', view: e.fog(ms[2].w, s, 'A'), lastSeen: {}, ownSeen: ms[2].own!.A });
  ok(b.sq[kA]?.o === 'A' && b.sq[kA].hp === 2 && !belief({ e, o: 'A', view: e.fog(ms[2].w, s, 'A'), lastSeen: {} }).sq[kA], 'the computer believes its square is where it last saw it (only with the memory)');
  ok(checkComputer(json(ms[0])).length === 0, 'a match whose computer remembers still replays');
  // Simulate (fix 4): last-seen enemy towers by default, use_last_seen: false leaves them out; every square of a belief
  // you can see is named at once.
  {
    const m = json(m0), sc = [{ name: 'wait', placements: [] }];
    type Sim = { last_seen_towers_assumed?: unknown[]; scenarios: { result: { board_end: { towers: { side: string }[] } } }[] };
    const on = simulate(m, { scenarios: sc }) as Sim, off = simulate(m, { scenarios: sc, use_last_seen: false }) as Sim;
    const theirs = (x: Sim) => x.scenarios[0].result.board_end.towers.filter((t) => t.side === 'theirs').length;
    ok(on.last_seen_towers_assumed?.length === viewFor(m).last_seen_enemy_towers.length && theirs(on) === e.L.towers.A.length && theirs(off) === 0 && !off.last_seen_towers_assumed, `the last-seen towers are on the simulated board by default (${theirs(on)}), and left out with use_last_seen: false`);
    const seen = [...seeC].slice(0, 3).map((k) => e.XY(k));
    let msg = '';
    try { simulate(m, { belief: { towers: seen.map(([x, y]) => ({ x, y })) }, scenarios: sc }); } catch (err) { msg = (err as Error).message; }
    ok(seen.every(([x, y]) => msg.includes(`${x},${y}`)) && /in_sight/.test(msg), `a refused belief names every square you can see at once (${msg})`);
    const v = viewFor(m);
    ok(fromRows(v.in_sight).length === seeC.size && v.grid.rows.length === e.H && v.grid.rows.every((r) => r.length === e.W) && fromRows(v.can_place).every(([x, y]) => v.grid.rows[y][x] === '.'), 'the view lists the squares in sight as rows, and the grid is one character a square (can_place squares are "." in it)');
    const area = fromRows(v.enemy_can_place_from_last_seen.squares);
    ok(e.L.towers.A.every((k) => area.some(([x, y]) => Math.abs(x - e.XY(k)[0]) <= s.reach && Math.abs(y - e.XY(k)[1]) <= s.reach)) && area.every(([x, y]) => e.L.towers.A.some((k) => Math.abs(x - e.XY(k)[0]) <= s.reach && Math.abs(y - e.XY(k)[1]) <= s.reach)), 'the enemy\'s possible placement area is the reach boxes of its last-seen towers');
  }
  const played = newSolo({ id: 'town00000005', ruleset: 'book-4', level: 2, seed: 96, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  while (!played.end && played.turn < 5) submit(played, { turn: played.turn, placements: parseOrders(scripted(played), rulesOf(played).s), source: 'agent', final: true, now: now() });
  const old = json(played);
  delete old.own;
  ok(JSON.stringify(ownOf(old)) === JSON.stringify(played.own), 'a match from before the memory rebuilds it from its record, the same as kept');
}

// ---------- 9d. The book-4 playtest v2 fixes (owner, 2026-11-11), each with fog twins ----------
{
  type E = ReturnType<typeof rulesOf>['e'];
  type S = ReturnType<typeof rulesOf>['s'];
  const mk4 = (id: string, seed = 91) => newSolo({ id, ruleset: 'book-4', level: 2, seed, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  /** Everything Cyan is told: its view, its summary, simulate (a wait and a square on its first can_place cell), the live page's summaries and lead lines, and "they still have towers". */
  const told = (x: SoloMatch, w0?: World) => {
    const v = viewFor(x), c = fromRows(v.can_place)[0];
    return {
      view: { ...v, my_orders: null }, summary: x.summary ?? null,
      sim: simulate(x, { scenarios: [{ name: 'wait', placements: [] }, ...(c ? [{ name: 'sq', placements: [{ piece: 'square', x: c[0], y: c[1] }] }] : [])], steps: 12 }),
      page: turnSummaries(x, 'C', 'page', w0).map((t) => ({ lines: t.lines, big: t.big })), still: stillStanding(x),
    };
  };
  /**
   * From one setup, two matches: `b` also gets `hidden` (pieces only out of Cyan's sight, nowhere near anything that
   * moves). Both play `turns` turns, Cyan placing `orders` first, Amber nothing. `same`: Cyan is told the same in both.
   */
  const twin = (id: string, setup: (m: SoloMatch, e: E, s: S) => void, hidden: (m: SoloMatch, e: E, s: S) => void, orders: unknown[] = [], turns = 1) => {
    const m = mk4(id), { e, s } = rulesOf(m);
    setup(m, e, s);
    const a = json(m), b = json(m);
    hidden(b, e, s);
    const wa = e.clone(a.w), wb = e.clone(b.w);
    for (let t = 0; t < turns; t++) for (const x of [a, b]) {
      if (x.end) continue;
      planComputer(x, now());
      x.pend.A = { ...x.pend.A!, placements: [] };
      submit(x, { turn: x.turn, placements: t === 0 ? parseOrders(orders, s) : [], source: 'agent', final: true, now: now() });
    }
    const ta = told(a, wa), tb = told(b, wb), same = isDeepStrictEqual(ta, tb);
    if (!same) for (const k of Object.keys(ta) as (keyof typeof ta)[]) if (!isDeepStrictEqual(ta[k], tb[k])) console.log(`  twins differ in ${k}:`, JSON.stringify(ta[k]).slice(0, 600), '|', JSON.stringify(tb[k]).slice(0, 600));
    return { a, b, same, e, s, wa, wb };
  };
  // The row of Cyan's first tower, and the last square it sees east along it (as 9b).
  const edgeOf = (e: E, s: S) => { const [tx, ty] = e.XY(e.L.towers.C[0]); return { tx, ty, x: tx + s.sight }; };
  /** Hidden changes far from row y: an Amber square and mirror on squares Cyan doesn't see, two rows or more away. */
  const far = (m: SoloMatch, e: E, s: S) => {
    const see = e.sees(m.w, s, 'C'), y = edgeOf(e, s).ty;
    const cells = [...Array(e.W * e.H).keys()].filter((k) => !see.has(k) && e.empty(m.w, k) && Math.abs(e.XY(k)[1] - y) >= 3 && !(k in m.ls.C) && [...see].every((j) => Math.max(Math.abs(e.XY(j)[0] - e.XY(k)[0]), Math.abs(e.XY(j)[1] - e.XY(k)[1])) >= 2));
    ok(cells.length >= 2, 'two squares out of Cyan\'s sight, away from everything, for the hidden twin');
    m.w.sq[cells[0]] = { o: 'A', hp: 2 };
    m.w.mir = { ...(m.w.mir ?? {}), [cells[cells.length - 1]]: { o: 'A', d: 1, hp: 3 } };
  };
  const line = (x: SoloMatch, re: RegExp) => x.summary!.lines.find((l) => re.test(l));

  // Fix 3: a glider that flies out of sight and back keeps its name (no "sent earlier" for it the second time).
  {
    const r = twin('tfix30000001', (m, e, s) => {
      const { x, ty } = edgeOf(e, s);
      ok(!e.sees(m.w, s, 'C').has(e.K(x + 1, ty)) && !e.sees(m.w, s, 'C').has(e.K(x + 2, ty)) && e.empty(m.w, e.K(x + 1, ty)) && e.empty(m.w, e.K(x + 2, ty)), 'fix 3: two squares past the edge of sight, empty');
      m.w.sq[e.K(x + 2, ty)] = { o: 'A', hp: 2 }; // out of sight: the glider bounces off it, back into sight
      m.w.gl.push({ id: 900, o: 'C', x, y: ty, dx: 1, dy: 0 } as never);
    }, far);
    const { x, ty } = edgeOf(r.e, r.s), sq = `(${x}, ${ty})`;
    const st = line(r.a, /^Your glider sent earlier \(at/);
    ok(!!st && st.includes(`flew out of your sight from ${sq}, heading east, at step 1; came back into sight at ${sq}, heading west, at step 3`) && !r.a.summary!.lines.some((l) => /^Your glider sent earlier: came into sight/.test(l)), `fix 3: back in sight, the glider keeps its story (${st})`);
    ok(!r.a.summary!.lines.some((l) => /chipped the enemy square/.test(l)), 'fix 3: a hit out of sight is not told');
    ok(r.same, 'fix 3 twins: a glider back in sight tells the same whatever else is hidden');
  }
  // Fix 3 and fix 1: a kill report goes to the glider that flew toward that tower, and that glider leaves my_pieces_out_of_sight.
  {
    let tower = '';
    const r = twin('tfix30000002', (m, e, s) => {
      const { x, ty } = edgeOf(e, s);
      m.w.tw[e.K(x + 1, ty)] = 'A';
      tower = `(${x + 1}, ${ty})`;
      m.w.gl.push({ id: 900, o: 'C', x, y: ty, dx: 1, dy: 0 } as never);
    }, far);
    const { x, ty } = edgeOf(r.e, r.s);
    const st = line(r.a, /^Your glider sent earlier \(at/);
    ok(!!st && st.endsWith(`flew out of your sight from (${x}, ${ty}), heading east, at step 1; destroyed the enemy tower at ${tower} at step 1 (kill report).`) && !r.a.summary!.lines.some((l) => /^Kill report/.test(l)), `fix 3: the kill report is told in that glider's story (${st})`);
    const v = viewFor(r.a);
    ok(Object.values(ownOf(r.a).C.gl).some((g) => g.x === x && g.y === ty) && !v.my_pieces_out_of_sight.some((p) => p.piece === 'glider'), 'fix 1: its memory still holds the glider, but my_pieces_out_of_sight leaves it out: a kill report ties it to the tower it destroyed');
    ok(turnSummaries(r.a, 'C', 'page', r.wa)[0].big.some((l) => l.includes(`destroyed out of your sight (kill report): ${tower}`)), 'fix 4: the kill leads the page');
    ok(r.same, 'fix 3 and fix 1 twins: the tied kill report and the dropped glider are the same whatever else is hidden');
  }
  // Coordinator's wording 3: a glider placed at the edge of sight that leaves it on its first step.
  {
    const m = mk4('tfix30000003'), { e, s } = rulesOf(m), { x, ty } = edgeOf(e, s), w = e.clone(m.w), kills = { C: 0, A: 0, log: [] } as Kills;
    const placed: Placement<AnyPiece>[] = [{ t: 'g', o: 'C', x, y: ty, dx: 1, dy: 0 }];
    const watch = new TurnWatch(e, s, 'C', e.clone(w), kills, placed);
    e.apply(w, s, { C: placed, A: [] });
    watch.appear(w);
    for (let i = 0; i < s.every; i++) { e.step(w, s, kills); watch.look(w); }
    ok(watch.done().includes(`Your glider from (${x}, ${ty}), heading east, flew out of your sight at once.`), `a glider out of sight on its first step: "flew out of your sight at once" (${JSON.stringify(watch.done())})`);
  }
  // Fix 3.6: a hit on an enemy square in sight is told, in the glider's story, and not again on its own line.
  {
    const r = twin('tfix30000004', (m, e, s) => {
      const { x, ty } = edgeOf(e, s), see = e.sees(m.w, s, 'C');
      ok([x - 2, x - 1, x].every((c) => see.has(e.K(c, ty)) && e.empty(m.w, e.K(c, ty))), 'fix 3.6: three squares in sight on the row, empty');
      m.w.sq[e.K(x, ty)] = { o: 'A', hp: 2 };
      m.w.gl.push({ id: 900, o: 'C', x: x - 2, y: ty, dx: 1, dy: 0 } as never);
    }, far);
    const { x, ty } = edgeOf(r.e, r.s), st = line(r.a, /^Your glider sent earlier \(at/);
    ok(!!st && st.includes(`chipped the enemy square at (${x}, ${ty}) at step 2 (1 hit left) and turned west`) && !r.a.summary!.lines.some((l) => /^The enemy square at .* was chipped/.test(l)), `fix 3.6: "chipped the enemy square at (${x}, ${ty}) at step 2 (1 hit left)" (${st})`);
    ok(r.same, 'fix 3.6 twins: the chip reads the same whatever else is hidden');
  }
  // Fix 3.5: a square placed where the side won't see it once the placements appear (its symbol goes, and the sight with
  // it) is not said to have been cancelled.
  {
    const m = mk4('tfix30000005'), { e, s } = rulesOf(m), w = e.clone(m.w), kills = { C: 0, A: 0, log: [] } as Kills;
    // A symbol of Cyan's far from its towers, not walled in: it goes as the placements appear, and its sight with it.
    const see0 = e.sees(w, s, 'C'), k = [...Array(e.W * e.H).keys()].find((j) => { const [x, y] = e.XY(j); return !see0.has(j) && x > 3 && x < e.W - 4 && y > 2 && y < e.H - 3 && e.empty(w, j) && e.empty(w, e.K(x, y - 1)) && ![...e.L.towers.C].some((t) => Math.max(Math.abs(e.XY(t)[0] - x), Math.abs(e.XY(t)[1] - y)) <= s.sight + 2); })!;
    const [kx, ky] = e.XY(k);
    w.tw[k] = 'C'; (w.fs ??= {})[k] = { o: 'C', at: 0 };
    const placed: Placement<AnyPiece>[] = [{ t: 's', o: 'C', x: kx, y: ky - 1, dx: 0, dy: 0 }];
    const watch = new TurnWatch(e, s, 'C', e.clone(w), kills, placed);
    e.apply(w, s, { C: placed, A: [] });
    watch.appear(w);
    for (let i = 0; i < 2; i++) { e.step(w, s, kills); watch.look(w); }
    const lines = watch.done();
    ok(w.sq[e.K(kx, ky - 1)]?.o === 'C' && !w.tw[k], 'fix 3.5: the square stands; the symbol, not walled in, is gone');
    ok(!lines.some((l) => /didn't appear/.test(l)) && lines.some((l) => l.startsWith(`Your square at (${kx}, ${ky - 1}) was out of your sight once the placements appeared`)), `fix 3.5: no false "cancelled out" (${JSON.stringify(lines)})`);
    ok(watch.big()[0] === `Your symbol at (${kx}, ${ky}) wasn't walled in, so it is gone.`, `fix 4: the page leads with the symbol gone (${JSON.stringify(watch.big())})`);
  }
  // Fix 4: no turn leads with who took it or what was placed.
  {
    const m = mk4('tfix40000001', 102);
    while (!m.end && m.turn < 6) { submit(m, { turn: m.turn, placements: parseOrders(scripted(m), rulesOf(m).s), source: 'agent', final: false, now: now() }); takeTurnOnPage(m, { turn: m.turn, now: now() }); }
    const pg = turnSummaries(m, 'C', 'page');
    ok(pg.every((t) => !t.big.some((l) => /took this turn|^Your side placed|^Towers destroyed so far/.test(l))), `fix 4: no lead line says who took the turn or what was placed (${JSON.stringify(pg.map((t) => t.big))})`);
  }
  // Fix 2: the view and the page say they may have towers you haven't seen; no count of theirs.
  {
    const m = mk4('tfix20000001'), v = viewFor(m) as Record<string, unknown>;
    const keys = Object.keys(v);
    ok(v.towers_unseen === UNSEEN && keys.indexOf('towers_unseen') === keys.indexOf('towers_destroyed') + 1 && !/\d/.test(UNSEEN), `fix 2: towers_unseen beside towers_destroyed, with no number ("${UNSEEN}")`);
    ok(!('towers_unseen' in viewFor(newSolo({ id: 'tfix20000002', ruleset: 'book-2', level: 2, seed: 5, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m)), 'fix 2: only where towers_destroyed is (book-4\'s kill reports)');
  }
  // Fix 6: can_place_contested is can_place within the enemy's possible placement area; simulate notes it.
  {
    const r = twin('tfix60000001', (m, e, s) => { const { x, ty } = edgeOf(e, s); m.w.tw[e.K(x, ty)] = 'A'; }, far);
    const v = viewFor(r.a), area = new Set(fromRows(v.enemy_can_place_from_last_seen.squares).map(([x, y]) => `${x},${y}`));
    const want = fromRows(v.can_place).filter(([x, y]) => area.has(`${x},${y}`)), got = fromRows(v.can_place_contested);
    ok(got.length > 0 && isDeepStrictEqual(got, want), `fix 6: can_place_contested is can_place ∩ enemy_can_place_from_last_seen (${v.can_place_contested.join(' | ')})`);
    const [cx, cy] = got[0], free = fromRows(v.can_place).find(([x, y]) => !area.has(`${x},${y}`));
    const sim = simulate(r.a, { scenarios: [{ name: 'on', placements: [{ piece: 'square', x: cx, y: cy }] }, ...(free ? [{ name: 'off', placements: [{ piece: 'square', x: free[0], y: free[1] }] }] : [])] }) as { scenarios: { contested?: string }[] };
    ok(sim.scenarios[0].contested === `The enemy can place on (${cx},${cy}): it may cancel.` && (!free || sim.scenarios[1].contested === undefined), `fix 6: simulate notes a placement on a contested square (${sim.scenarios[0].contested})`);
    ok(r.same, 'fix 6 twins: contested squares and the note are the same whatever else is hidden');
  }
  // Fix 5: simulate assumes the enemy squares Cyan last saw, as last seen; use_last_seen_squares: false leaves them out.
  {
    const r = twin('tfix50000001', (m, e, s) => {
      const see = e.sees(m.w, s, 'C'), k = [...Array(e.W * e.H).keys()].find((j) => !see.has(j) && e.empty(m.w, j) && e.XY(j)[0] < e.W / 2 && !(j in m.ls.C))!;
      m.theirSq![k] = { hp: 1, step: 0 }; // last seen there at the start, 1 hit left
    }, (m, e) => { const k = +Object.keys(m.theirSq!)[0]; m.w.sq[k] = { o: 'A', hp: 2 }; void e; }); // there, unhurt, in one twin; gone in the other
    const k = +Object.keys(r.a.theirSq!)[0], [qx, qy] = r.e.XY(k);
    type Sim = { based_on: string; last_seen_squares_assumed?: { x: number; y: number; hits_left: number; last_seen_step: number }[]; scenarios: { result: { board_end: { squares: { x: number; y: number; side: string }[] } } }[] };
    const on = simulate(r.a, { scenarios: [{ name: 'wait', placements: [] }], steps: 1 }) as Sim, off = simulate(r.a, { scenarios: [{ name: 'wait', placements: [] }], steps: 1, use_last_seen_squares: false }) as Sim;
    ok(!!on.last_seen_squares_assumed?.some((q) => q.x === qx && q.y === qy && q.hits_left === 1 && q.last_seen_step === 0) && /enem(y|ies) squares? where you last saw/.test(on.based_on) && /use_last_seen_squares: false/.test(on.based_on), `fix 5: simulate assumes the last-seen enemy square and says so (${on.based_on})`);
    ok(on.scenarios[0].result.board_end.squares.some((q) => q.x === qx && q.y === qy && q.side === 'theirs') && !off.scenarios[0].result.board_end.squares.some((q) => q.x === qx && q.y === qy) && !off.last_seen_squares_assumed, 'fix 5: on the simulated board by default, and not with use_last_seen_squares: false');
    ok(r.same, 'fix 5 twins: the square there unhurt or gone, simulate (and everything else) is the same');
    // The memory, kept as a match is played, is what Cyan saw: where it sees, the enemy squares there with their hits; and
    // a match from before it was kept rebuilds it from the record, the same.
    const m = mk4('tfix50000002', 93);
    let memOk = true;
    while (!m.end && m.turn < 6) {
      submit(m, { turn: m.turn, placements: parseOrders(scripted(m), rulesOf(m).s), source: 'agent', final: true, now: now() });
      const { e, s } = rulesOf(m), see = e.sees(m.w, s, 'C');
      for (const j of see) { const q = m.w.sq[j]; if ((q?.o === 'A') !== (j in m.theirSq!) || (q?.o === 'A' && m.theirSq![j].hp !== q.hp)) memOk = false; }
    }
    const old = json(m); delete old.theirSq;
    const sc = { scenarios: [{ name: 'wait', placements: [] }], steps: 12 };
    ok(memOk && isDeepStrictEqual(simulate(old, sc), simulate(m, sc)), 'fix 5: the memory of enemy squares is what Cyan sees where it sees, and a match without it rebuilds it from the record');
  }
  // Fix 7: squares walling your own tower fold into one line.
  {
    const m = mk4('tfix70000001'), { e, s } = rulesOf(m), view = e.fog(m.w, s, 'C'), towers = e.towers(view, 'C');
    const [tx, ty] = e.XY(towers[0]);
    const ring = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [tx + dx, ty + dy]).filter(([x, y]) => e.inb(x, y) && e.empty(view, e.K(x, y)));
    const ws = laneWarnings(e, view, s, towers, ring.map(([x, y]) => ({ t: 's', o: 'C', x, y, dx: 0, dy: 0 })));
    ok(!ws.some((w) => /^Your square at/.test(w)) && ws.filter((w) => w.includes(`wall (${tx},${ty})`) || w.includes(`walls (${tx},${ty})`)).length <= 1, `fix 7: squares walling your tower at (${tx},${ty}) get one line, not one each (${JSON.stringify(ws)})`);
  }
  // Fix 1: a repeated glider (same square and heading) is listed once, the latest; a resting symbol glider out of sight,
  // which gives no sight, is never listed (the twins: one there, one destroyed in the dark).
  {
    const r = twin('tfix10000001', () => {}, (m, e, s) => {
      const see = e.sees(m.w, s, 'C'), k = [...Array(e.W * e.H).keys()].find((j) => !see.has(j) && e.empty(m.w, j) && e.XY(j)[0] > 3 && e.XY(j)[0] < e.W / 2 && [...see].every((i) => Math.max(Math.abs(e.XY(i)[0] - e.XY(j)[0]), Math.abs(e.XY(i)[1] - e.XY(j)[1])) >= 2))!;
      (m.w.sd ??= {})[k] = 'C'; // a symbol glider of Cyan's at rest out of its sight in one twin only
    });
    ok(r.same && !viewFor(r.b).my_pieces_out_of_sight.some((p) => p.piece === 'resting_symbol_glider'), 'fix 1 twins: a symbol glider of yours resting out of sight is not listed (a resting one gives no sight)');
    const m = json(r.a), { e, s } = rulesOf(m), see = e.sees(m.w, s, 'C');
    const k = [...Array(e.W * e.H).keys()].find((j) => !see.has(j) && e.empty(m.w, j))!, [gx, gy] = e.XY(k);
    m.own!.C.gl[801] = { x: gx, y: gy, dx: 0, dy: 1, step: m.w.step - 7 };
    m.own!.C.gl[802] = { x: gx, y: gy, dx: 0, dy: 1, step: m.w.step - 3 };
    const listed = viewFor(m).my_pieces_out_of_sight.filter((p) => p.piece === 'glider' && 'x' in p && p.x === gx && p.y === gy);
    ok(listed.length === 1 && listed[0].last_seen_step === m.w.step - 3, `fix 1: a glider remembered twice at one square and heading is listed once, the latest (${JSON.stringify(listed)})`);
  }
}

// ---------- 10. The live page: Take turn and the replay's frames (owner, 2026-11-03) ----------
{
  const mk = (id: string, ruleset: RulesetName, seed: number) => newSolo({ id, ruleset, level: 1, seed, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  const m = mk('tpage0000001', 'book-4', 101);
  throwsLike(() => takeTurnOnPage(m, { turn: 0, now: now() }), /no draft/, 'Take turn with no draft is refused');
  submit(m, { turn: 0, placements: parseOrders(scripted(m), rulesOf(m).s), source: 'agent', final: false, now: now() });
  const d = draftInfo(m)!;
  ok(d && !d.final && d.source === 'agent' && d.cost <= d.points && Array.isArray(d.warnings), 'the draft shows its pieces, cost against points and lane warnings');
  takeTurnOnPage(m, { turn: 0, now: now() });
  const h = m.history[0].C;
  ok(m.turn === 1 && h.source === 'person' && h.via === 'page' && h.drafted_by === 'agent', 'taken on the page: recorded as the person\'s, via the page, drafted by the AI');
  const v = viewFor(m) as Record<string, any>;
  ok(v.my_turns[0].taken_on_the_live_page === true && v.my_turns[0].drafted_by === 'agent' && /took this turn on the live page/.test(v.last_turn_summary.lines[0]), 'get_view tells the AI, and the summary says so first');
  ok(checkComputer(json(m)).length === 0, 'the computer still replays');
  {
    const pg = turnSummaries(m, 'C', 'page')[0];
    ok(pg.lines[0] === 'You took this turn here, approving your AI\'s draft.' && !pg.lines.some((l) => /their AI|Your person/.test(l)) && !pg.big.some((l) => /took this turn|^Your side placed/.test(l)), `the page says "You took this turn here, approving your AI's draft." and never leads with it (${JSON.stringify(pg.big)})`);
  }
  // Past turns' summaries, rebuilt from the record, are the ones each turn showed when it was played.
  {
    const mm = mk('tpage0000002', 'book-4', 102), shown: string[][] = [];
    while (!mm.end && mm.turn < 6) { submit(mm, { turn: mm.turn, placements: parseOrders(scripted(mm), rulesOf(mm).s), source: 'agent', final: false, now: now() }); takeTurnOnPage(mm, { turn: mm.turn, now: now() }); shown.push(mm.summary!.lines); }
    const rebuilt = turnSummaries(mm);
    ok(rebuilt.length === shown.length && rebuilt.every((x, i) => isDeepStrictEqual(x.lines, shown[i])), 'every past turn\'s summary, rebuilt from the record, is the one shown when it was played');
  }
  // Frames: one as the placements appear, then one a step; each only what Cyan sees.
  while (!m.end && m.turn < 4) submit(m, { turn: m.turn, placements: parseOrders(scripted(m), rulesOf(m).s), source: 'agent', final: true, now: now() });
  const { e, s } = rulesOf(m);
  let fogOk = true, count = true;
  for (const t of m.history.map((x) => x.turn)) {
    const fr = turnFrames(m, t);
    if (fr.length !== s.every + 1 || fr[0].step !== m.history[t].step) count = false;
    for (const f of fr) {
      const lit = new Set((f.seen ?? []).map(([x, y]) => e.K(x, y)));
      const theirs = [...f.board.gliders, ...f.board.squares, ...(f.board.resting_symbol_gliders ?? []), ...(f.board.mirrors ?? []), ...(f.board.factories ?? [])].filter((p) => p.side === 'theirs');
      const theirTowers = f.board.towers.filter((q) => q.side === 'theirs');
      const myGliders = f.board.gliders.filter((g) => g.side === 'mine');
      if ([...theirs, ...theirTowers, ...myGliders].some((p) => !lit.has(e.K(p.x, p.y)))) fogOk = false;
    }
  }
  ok(count, 'each turn has 13 frames: the placements appearing, then 12 steps');
  ok(fogOk, 'in every frame, every enemy piece and every glider of yours shown is in your sight');
  throwsLike(() => turnFrames(m, 0, true), /only once the match is over/, 'the whole board only after the end');
  resign(m);
  const whole = turnFrames(m, 1, true);
  ok(whole.length === s.every + 1 && whole.every((f) => f.seen === null) && whole.some((f) => f.board.towers.some((q) => q.side === 'theirs')), 'after the end, the replay shows the whole board');
}

// ---------- The 3D action (owner, 2026-11-03): the same fog frames as the 2D board; every effect only from them ----------
{
  const { readFileSync } = await import('node:fs');
  const { replayEvents, instantReplays } = await import('../src/app/minpentai/m/[id]/replay-events');
  const dir = 'src/app/minpentai/m/[id]/';
  const src = (f: string) => readFileSync(dir + f, 'utf8');
  const top = src('live-top.tsx'), past = src('past-turns.tsx'), b3 = src('board-3d.tsx'), sc = src('replay-scene.ts'), ev = src('replay-events.ts'), kit = readFileSync('src/app/minpentai/scene-kit.ts', 'utf8');
  // The props: on the live page, the frame playing (its board, the frame before's board, the squares seen), or when
  // nothing plays the board as it stands from the same view (the page's own view and sight, or the last whole frame).
  const ur = src('use-replays.ts');
  ok(/<Board3D \{\.\.\.v3\} width=\{p\.width\} height=\{p\.height\} focus=\{r\.focus\} big=\{beside\}\s/.test(top) && (top.match(/<Board3D/g) ?? []).length === 1, 'the live page gives the 3D view v3, the size, the replay\'s focus and the piece size, nothing else');
  ok(top.includes(`  const v3 = r.frame ? r.frame
    : play === '3d' && f ? { board: f.board, prev: pb.prev?.board ?? null, seen: whole ? null : (f.seen as [number, number][]), stepMs: pb.stepMs }
    : { board: idle.board, prev: null, seen: idle.seen, stepMs: 0 };`), 'v3 is an instant replay\'s frame, the frame playing, or the board as it stands');
  ok(top.includes("const idle = whole && last ? { board: last.board, seen: null } : { board: p.current.board, seen: p.current.seen };") && /const f = play \? pb\.f : null;/.test(top) && /const pb = usePlayback\(frames, done, false\)/.test(top) && /const frames = p\.latest\?\.frames \?\? \[\]/.test(top) && /const r = useReplays\(frames, \{/.test(top), 'which come from the page\'s frames, its view and its sight');
  // The replays' frame and focus: a frame of the same frames, and a moment instantReplays found in them.
  ok(ur.includes('const m = rep ? rep.list[rep.k] : null, rf = rep ? frames[rep.j] : null, rprev = rep && rep.j > 0 ? frames[rep.j - 1] : null;')
    && ur.includes("const frame = m && rf ? { board: rf.board, prev: rprev?.board ?? null, seen: o.whole ? null : (rf.seen as [number, number][]), stepMs: m.stepMs } : null;")
    && ur.includes('const focus = m ? { at: m.at, mode: m.mode, ms: (m.to - m.from + 1) * m.stepMs + m.holdMs } : null;')
    && ur.includes("const list = instantReplays(frames.map((x) => ({ board: x.board, seen: c.whole ? null : (x.seen as [number, number][]) })), c.size,")
    && /setRep\(\{ list, k: 0, j: list\[0\]\.from \}\)/.test(ur), 'an instant replay shows the same frames, the camera on a moment instantReplays found in them');
  ok(/<Board3D \{\.\.\.v3\} width=\{width\} height=\{height\} focus=\{r\.focus\}\s/.test(past) && (past.match(/<Board3D/g) ?? []).length === 1
    && past.includes("const v3 = r.frame ? r.frame : f ? { board: f.board, prev: pb.prev?.board ?? null, seen: whole ? null : (f.seen as [number, number][]), stepMs: pb.stepMs } : null;")
    && /const r = useReplays\(frames, \{ whole, ended: false,/.test(past), 'a past turn gives the 3D view its frame (or its replay\'s), the size and the replay\'s focus, nothing else');
  // The 3D files read nothing from the site but types.
  const siteImports = (t: string) => [...t.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)].filter(([, ty, from]) => !ty && from.startsWith('~/'));
  ok([b3, sc, ev, kit, ur].every((t) => !siteImports(t).length), 'the 3D files import nothing from the site but types');
  // Every effect (flashes, debris, the camera's shake) is fired in one place, from replay-events' answer for the frames
  // shown; the camera's path reads only the clock and the board's size.
  const fireBody = sc.slice(sc.indexOf('  function fire(ev: ReplayEvent[])'), sc.indexOf('\n  }\n', sc.indexOf('  function fire(ev: ReplayEvent[])')));
  const outside = sc.replace(fireBody, '');
  ok(fireBody.length > 100 && !/flashes\.fire\(|debris\.burst\(|shake = Math\.max\(shake/.test(outside), 'flashes, debris and the shake are fired only from replay-events\' events');
  ok(/const ev = replayEvents\(prev, board, seen, \[W, H\]\);/.test(sc) && /fire\(ev\);/.test(sc) && (sc.match(/fire\(ev\)/g) ?? []).length === 1, 'the events are the frames\' (the frame before, this one and its sight)');
  const aim = sc.slice(sc.indexOf('cam.aim('), sc.indexOf(');', sc.indexOf('cam.aim(')));
  ok(aim && !/board|state|ev\b|seen|glider/.test(aim), 'the camera\'s path reads only the clock and the board\'s size');
  // The camera's focus in the scene comes only from that prop.
  ok((sc.match(/focusOn = /g) ?? []).length === 1 && /focus\(f\) \{ focusOn = f \? \{ \.\.\.f, since: performance\.now\(\) \} : null; \}/.test(sc), 'the scene\'s replay camera is set only by focus()');
  // replay-events on real frames: an effect only on a square in sight; a glider that leaves sight just fades.
  const mm = newSolo({ id: 'tfx000000001', ruleset: 'book-4', level: 3, seed: 7, person: 6786, agent: { id: null, name: 'Rook', model: null }, now: now() }).m;
  while (!mm.end && mm.turn < 10) submit(mm, { turn: mm.turn, placements: parseOrders(scripted(mm), rulesOf(mm).s), source: 'agent', final: true, now: now() });
  const dims = viewFor(mm).board_size as { width: number; height: number };
  let effects = 0, effectsOk = true, leaves = 0, glidesOk = true;
  for (const t of mm.history.map((x) => x.turn)) {
    const fr = turnFrames(mm, t);
    for (let i = 1; i < fr.length; i++) {
      const seen = fr[i].seen as [number, number][], lit = new Set(seen.map(([x, y]) => `${x},${y}`));
      for (const e of replayEvents(fr[i - 1].board, fr[i].board, seen, [dims.width, dims.height])) {
        if (e.kind === 'destroyed' || e.kind === 'hit' || e.kind === 'stopped') { effects++; if (!lit.has(`${e.at[0]},${e.at[1]}`)) effectsOk = false; }
        if (e.kind === 'leave') leaves++;
        if (e.kind === 'glide' && !(fr[i - 1].board.gliders.some((g) => g.x === e.from[0] && g.y === e.from[1]) && fr[i].board.gliders.some((g) => g.x === e.to[0] && g.y === e.to[1]))) glidesOk = false;
      }
    }
  }
  ok(effects > 0 && effectsOk, `every effect in ${effects} is on a square in sight`);
  // Instant replays: every moment on a square its frame sees; the end's replay on the whole board only after the end.
  let moments = 0, momentsOk = true, tiers = new Set<number>();
  for (const t of mm.history.map((x) => x.turn)) {
    const fr = turnFrames(mm, t).map((f) => ({ board: f.board, seen: f.seen as [number, number][] }));
    for (const mo of instantReplays(fr, [dims.width, dims.height])) {
      moments++; tiers.add(mo.tier);
      if (!fr[mo.frame].seen.some(([x, y]) => x === mo.at[0] && y === mo.at[1]) || mo.from > mo.frame || mo.to < mo.frame) momentsOk = false;
    }
    if (instantReplays(fr, [dims.width, dims.height]).length > 2) momentsOk = false;
  }
  ok(moments > 0 && momentsOk, `every instant replay (${moments}, tiers ${[...tiers].join(', ')}) is of a moment on a square in sight, at most two a turn`);
  ok(leaves > 0 && glidesOk, 'gliders glide only between squares both frames show, and fade out into the dark');
  // The same events whatever happens out of sight: a destroyed piece out of sight, a hidden glider stopped there.
  const b0 = { rocks: [], towers: [{ x: 9, y: 2, side: 'theirs' }], squares: [{ x: 3, y: 3, side: 'mine', hits_left: 2 }], gliders: [{ x: 4, y: 4, dir: 'E', side: 'mine' }, { x: 1, y: 1, dir: 'E', side: 'mine' }] } as unknown as Parameters<typeof replayEvents>[1];
  const b1 = { rocks: [], towers: [], squares: [], gliders: [{ x: 5, y: 4, dir: 'E', side: 'mine' }] } as unknown as Parameters<typeof replayEvents>[1];
  const out = replayEvents(b0, b1, [[4, 4], [5, 4], [1, 1]], [12, 12]);
  ok(!out.some((e) => 'at' in e && (e.at[0] === 9 || e.at[0] === 3)) && out.some((e) => e.kind === 'leave' && e.at[0] === 1) && out.some((e) => e.kind === 'glide'), 'pieces gone out of sight make no effect; a glider whose next square is dark fades, whatever happened to it');
  ok(isDeepStrictEqual(replayEvents(b0, b1, null, [12, 12]).filter((e) => e.kind === 'destroyed').length, 2), 'with the whole board (after the end), every piece gone shows');
  ok(instantReplays([{ board: b0, seen: [[4, 4], [5, 4], [1, 1]] }, { board: b1, seen: [[4, 4], [5, 4], [1, 1]] }], [12, 12]).length === 0, 'a tower and a square destroyed out of sight are never replayed');
  const end = instantReplays([{ board: b0, seen: null }, { board: b1, seen: null }], [12, 12], { ended: true });
  ok(end.length === 2 && end.some((x) => x.tier === 4 && x.at[0] === 9) && end.some((x) => x.tier === 1), 'after the end (the whole board), the last tower to fall is the final replay');
  ok(instantReplays([{ board: b0, seen: null }, { board: b1, seen: null }], [12, 12], { ended: true, only: 'big' }).every((x) => x.tier >= 3), '"big moments" keeps only towers and the end');
}

console.log(`minpentai agent play: ${checks} checks passed`);
