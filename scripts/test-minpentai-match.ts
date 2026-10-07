/**
 * Match tests. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/test-minpentai-match.ts
 *
 * - Owners travel with their cells, and the live cells are exactly the book's rule.
 * - Each glider stamp travels the way it is named, from where `snap` puts it.
 * - Placing follows the rules: reach, crowding, budget, intervention turns only.
 * - The recorded four-player match replays to the same result.
 * - Practice: doing nothing loses a symbol; each step's goal is unmet before its
 *   scripted move and met after it; the rival is out soon after the shot.
 * - The easy computer beats a player who does nothing, eventually, in most seeds.
 */
import { emptyBoard, step } from '../src/lib/minpentai/engine';
import { findGliders } from '../src/lib/minpentai/glider';
import { forecast, playTurn, rng } from '../src/lib/minpentai/ai';
import { GLIDERS, advance, newMatch, place, placeProblem, runToIntervention, snap, stampCells, stepOwned, type Dir, type Match } from '../src/lib/minpentai/match';
import { PLAY_SETUP, PRACTICE, PRACTICE_SETUP, WATCH_SETUP, practiceMove, watchMovesAt } from '../src/lib/minpentai/matches';
import { WATCH_MOVES } from '../src/lib/minpentai/watch-moves';

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

// Owners.
{
  const r = rng(1);
  const b = emptyBoard();
  for (let i = 0; i < b.cells.length; i++) b.cells[i] = r() < 0.3 ? 1 : 0;
  let s: { board: typeof b; owners: Uint8Array } = { board: b, owners: new Uint8Array(b.cells.map((v, i) => (v ? 1 + (i % 3) : 0))) };
  let plain = b;
  const count = (o: Uint8Array) => [1, 2, 3].map((k) => o.filter((v) => v === k).length).join(',');
  const before = count(s.owners);
  for (let t = 0; t < 60; t++) {
    s = stepOwned(s.board, s.owners);
    plain = step(plain);
    if (s.board.cells.some((v, i) => v !== plain.cells[i])) { fail(`owners: live cells differ from the rule at turn ${t + 1}`); break; }
    if (s.board.cells.some((v, i) => !!v !== !!s.owners[i])) { fail(`owners: an owner without a cell at turn ${t + 1}`); break; }
  }
  if (count(s.owners) !== before) fail('owners: cells per owner changed');
  console.log('owners: travel with their cells; live cells follow the rule exactly');
}

// Gliders from snap.
for (const dir of Object.keys(GLIDERS) as Dir[]) {
  const m = newMatch({ w: 48, h: 32, rocks: [], symbols: [[[2, 2]]] });
  const p = snap(m.board, { kind: 'glider', dir, x: 24, y: 16 });
  let b = emptyBoard();
  for (const [x, y] of stampCells(b, p)) b.cells[y * b.w + x] = 1;
  const g = findGliders(b)[0];
  const want = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  if (!g || g.dx !== want[0] || g.dy !== want[1]) fail(`glider ${dir}: does not travel ${dir} from where snap puts it`);
  for (let t = 0; t < 2; t++) b = step(b);
}
console.log('gliders: each stamp travels the way it is named');

// Placing.
{
  const m = newMatch(PLAY_SETUP);
  const far = { kind: 'mirror' as const, x: 20, y: 8 };
  if (placeProblem(m, 0, far) !== 'reach') fail('placing: a far square should be out of reach');
  if (placeProblem(m, 0, { kind: 'mirror', x: 35, y: 21 }) !== 'crowded') fail('placing: touching a symbol should be crowded');
  let x = m;
  for (const p of [{ x: 28, y: 17 }, { x: 30, y: 17 }, { x: 32, y: 17 }, { x: 28, y: 19 }, { x: 30, y: 19 }, { x: 32, y: 19 }, { x: 28, y: 21 }, { x: 30, y: 21 }]) x = place(x, 0, { kind: 'mirror', ...p });
  if (x.left[0] !== 0) fail(`placing: budget left ${x.left[0]}, expected 0`);
  if (placeProblem(x, 0, { kind: 'mirror', x: 32, y: 21 }) !== 'budget') fail('placing: the ninth square should be over budget');
  if (placeProblem(advance(m), 0, { kind: 'mirror', x: 30, y: 18 }) !== 'not-intervention') fail('placing: only on intervention turns');
  if (runToIntervention(m).board.turn !== m.rules.interval) fail('placing: the next intervention turn is not one interval on');
  console.log('placing: reach, crowding, budget and intervention turns enforced');
}

// The recorded match replays.
{
  let m = newMatch(WATCH_SETUP);
  while (m.winner === undefined) {
    for (const { player, p } of watchMovesAt(m.board.turn)) {
      if (placeProblem(m, player, p)) fail(`watch: recorded move at turn ${m.board.turn} is not allowed (${placeProblem(m, player, p)})`);
      m = place(m, player, p);
    }
    m = runToIntervention(m);
  }
  if (m.winner !== WATCH_MOVES.winner || m.board.turn !== WATCH_MOVES.turns) fail(`watch: replay ends ${m.winner}@${m.board.turn}, recorded ${WATCH_MOVES.winner}@${WATCH_MOVES.turns}`);
  else console.log(`watch: replays to the recorded result (player ${m.winner} wins at turn ${m.board.turn}; out at ${m.events.filter((e) => e.kind === 'out').map((e) => e.turn).join(', ')})`);
}

// Practice.
{
  let m = newMatch(PRACTICE_SETUP);
  const idle = forecast(m, 0, [], 72);
  if (idle.mine >= m.players[0].sites.length) fail('practice: doing nothing should lose a symbol');
  for (const s of PRACTICE) {
    if (s.kind !== 'do') continue;
    while (m.board.turn < s.turn) m = runToIntervention(m);
    if (m.board.turn !== s.turn) fail(`practice ${s.id}: reached turn ${m.board.turn}, expected ${s.turn}`);
    if (s.goal!(m)) fail(`practice ${s.id}: goal met before the move`);
    if (placeProblem(m, 0, s.move!)) fail(`practice ${s.id}: scripted move not allowed (${placeProblem(m, 0, s.move!)})`);
    m = practiceMove(m, s);
    if (!s.goal!(m)) fail(`practice ${s.id}: goal not met by the scripted move`);
    else console.log(`practice ${s.id}: goal unmet before, met by the scripted move at turn ${s.turn}`);
  }
  // Near misses: the outline shifted, a block too late, a shot that misses.
  const atTurn = (t: number, moves: [number, Parameters<typeof place>[2]][]) => {
    let x = newMatch(PRACTICE_SETUP);
    for (const [turn, p] of moves) { while (x.board.turn < turn) x = runToIntervention(x); x = place(x, 0, p); }
    while (x.board.turn < t) x = runToIntervention(x);
    return x;
  };
  const spread = PRACTICE[1], block = PRACTICE[2], attack = PRACTICE[3];
  if (spread.goal!(atTurn(0, [[0, { kind: 'symbol', x: 23, y: 13 }]]))) fail('practice spread: a symbol off the outline counts');
  if (block.goal!(atTurn(24, [[0, spread.move!], [24, { kind: 'mirror', x: 40, y: 20 }]]))) fail('practice block: a square out of the path counts');
  if (attack.goal!(atTurn(48, [[0, spread.move!], [24, block.move!], [48, { kind: 'glider', dir: 'up', x: 21, y: 9 }]]))) fail('practice attack: a shot that misses counts');
  console.log('practice: near misses do not count');
  let t = m.board.turn;
  while (m.winner === undefined && m.board.turn < t + 96) m = advance(m);
  if (m.winner !== 0) fail(`practice: after the shot, winner ${m.winner} by turn ${m.board.turn}`);
  else console.log(`practice: the rival is out at turn ${m.board.turn}`);
}

// Easy computer against a player who does nothing.
{
  let wins = 0;
  for (let seed = 1; seed <= 6; seed++) {
    let m: Match = newMatch(PLAY_SETUP);
    const r = rng(seed);
    while (m.winner === undefined) { m = playTurn(m, 1, 'easy', r); m = runToIntervention(m); }
    if (m.winner === 1) wins++;
  }
  if (wins < 3) fail(`easy: beat an idle player in only ${wins} of 6 seeds`);
  console.log(`easy: beats a player who does nothing in ${wins} of 6 seeds`);
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK');
