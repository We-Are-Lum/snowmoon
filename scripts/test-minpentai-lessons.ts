/**
 * The Learn lessons (src/lib/minpentai/lessons.ts) against the engine: each lesson does on the
 * real board what its words say.
 *
 *   npx tsx scripts/test-minpentai-lessons.ts
 */
import { LESSONS, SQUARE_SPOTS, NEW_RULES, practiceMatch, WATCH, type Lesson } from '../src/lib/minpentai/lessons';
import { advance, place, placeProblem, isIntervention, type Match } from '../src/lib/minpentai/match';
import { findGliders } from '../src/lib/minpentai/glider';
import { broadcast } from '../src/lib/minpentai/broadcast';
import { playTurn, rng } from '../src/lib/minpentai/ai';

let failed = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { failed++; console.log(`FAIL ${msg}`); } else console.log(`ok   ${msg}`); };
const L = (id: Lesson['id']) => LESSONS.find((l) => l.id === id)!;
const runUntil = (m: Match, l: Lesson, max = 200) => {
  for (let t = 0; t < max; t++) {
    if (l.goal?.(m)) return { m, met: true, failed: false };
    if (l.fail?.(m)) return { m, met: false, failed: true };
    m = advance(m);
  }
  return { m, met: false, failed: false };
};
const demo = (l: Lesson) => {
  let m = l.setup();
  if (l.demo?.kind === 'place') for (const p of l.demo.moves) { const b = m; m = place(m, 0, p); ok(m !== b, `${l.id}: the demo's move can be put down`); }
  return runUntil(m, l);
};

for (const l of LESSONS) if (l.kind === 'do') { const r = demo(l); ok(r.met, `${l.id}: the big button meets the goal (turn ${r.m.board.turn})`); }

// goal, rule: both sides have two towers, and towers stand still on their own.
{
  let m = L('goal').setup();
  ok(m.players.every((p) => p.sites.length === 2), 'goal: each side starts with two towers');
  for (let i = 0; i < 120; i++) m = advance(m);
  ok(m.players.every((p) => p.sites.length === 2), 'goal: towers left alone stand for 120 turns');
}
// glider: flies straight, 2 cells every 4 turns.
{
  let m = L('glider').setup();
  const a = findGliders(m.board)[0];
  for (let i = 0; i < 16; i++) m = advance(m);
  const b = findGliders(m.board)[0];
  ok(!!a && !!b && b.x - a.x === 8 && b.y === a.y && b.dx === 1, 'glider: 8 cells right in 16 turns, same row');
}
// hit: Amber loses exactly one tower, Cyan none.
{
  const r = runUntil(L('hit').setup(), L('hit'));
  ok(r.m.players[1].sites.length === 1 && r.m.players[0].sites.length === 2, 'hit: Amber −1, Cyan keeps both');
}
// square: without a square the tower falls; with one on any spot it stands, and the glider comes back.
{
  // (Its wreckage can form a tower again later; the lesson stops when it falls.)
  let m = L('square').setup();
  let fell = -1;
  for (let i = 0; i < 44 && fell < 0; i++) { m = advance(m); if (m.players[0].sites.length < 2) fell = m.board.turn; }
  ok(fell > 0, `square: with no square, your lower tower falls (turn ${fell})`);
  for (const [x, y] of SQUARE_SPOTS) {
    let s = place(L('square').setup(), 0, { kind: 'mirror', x, y });
    let back = false, stood = true;
    for (let i = 0; i < 44; i++) { s = advance(s); if (findGliders(s.board).some((g) => g.dx === 1)) back = true; if (s.players[0].sites.length < 2) stood = false; }
    ok(stood && back, `square: a square at ${x},${y} bounces the glider back and the tower stands`);
  }
}
// turn: a glider costs 4, a square 1, a tower 4; only two rows get through.
{
  const m = L('turn').setup();
  ok(m.left[0] === 8, 'turn: 8 points to spend');
  const g = place(m, 0, { kind: 'glider', dir: 'right', x: 9, y: 7 });
  ok(g.left[0] === 4, 'turn: a glider costs 4');
  ok(place(m, 0, { kind: 'mirror', x: 8, y: 9 }).left[0] === 7, 'turn: a square costs 1');
  ok(place(m, 0, { kind: 'symbol', x: 7, y: 8 }).left[0] === 4, 'turn: a tower costs 4');
  ok(placeProblem(m, 0, { kind: 'mirror', x: 16, y: 9 }) === 'reach', 'turn: too far from your towers is refused');
  let through = 0;
  for (let y = 1; y < 19; y += 2) {
    const s = place(m, 0, { kind: 'glider', dir: 'right', x: 9, y });
    if (s === m) continue;
    if (runUntil(s, L('turn')).met) through++;
  }
  ok(through >= 1 && through <= 3, `turn: ${through} rows get through, so aiming matters`);
}
// sight: the glider starts in the dark, and losing a tower shrinks what you see.
{
  const { sightMask } = await import('../src/lib/minpentai/match');
  const m0 = L('sight').setup();
  const g = findGliders(m0.board)[0];
  const lit0 = sightMask(m0, 0);
  ok(!!g && !lit0[g.y * m0.board.w + g.x], 'sight: the Amber glider starts in the dark');
  const r = runUntil(m0, L('sight'));
  const lit1 = sightMask(r.m, 0);
  ok(lit1.reduce((a, b) => a + b, 0) < lit0.reduce((a, b) => a + b, 0), 'sight: after the hit you see less');
}
// practice: every new rule plays out to an end with the computer, from a turn to act.
for (const rule of NEW_RULES) {
  let m = practiceMatch(rule);
  ok(isIntervention(m), `practice (${rule.id}): starts on a turn to act`);
  const r = rng(7);
  for (let i = 0; i < 2000 && m.winner === undefined; i++) {
    if (isIntervention(m)) m = playTurn(m, 1, 'easy', r);
    m = advance(m);
  }
  ok(m.winner !== undefined, `practice (${rule.id}): ends by turn ${m.board.turn}`);
}
// watch: every segment lies inside the recorded match.
{
  const b = broadcast();
  for (const w of WATCH) ok(w.segment.from >= 0 && w.segment.to < b.frames.length && w.segment.from < w.segment.to, `watch ${w.id}: turns ${w.segment.from}–${w.segment.to} are in the match`);
  ok(b.story.some((s) => s.kind === 'out' && s.turn >= WATCH[4].segment.from && s.turn <= WATCH[4].segment.to), 'watch out: a player goes out during the screen');
  ok(b.story.some((s) => s.kind === 'end' && s.turn <= WATCH[5].segment.to), 'watch last: the match ends during the screen');
}
console.log(failed ? `\n${failed} failed` : '\nall lesson checks pass');
process.exit(failed ? 1 : 0);
