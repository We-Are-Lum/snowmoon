/**
 * The Minpentai snap (spike, 2026-10-21):
 * 1. The same seed and placements give the same match as Play's practice (PlayController), board
 *    for board at every turn to act and at the end.
 * 2. Every move the site allows can be made with the snap's taps: each piece, a glider in each of
 *    4 directions (8 under "diag"), at an edge too; taking a piece back; Undo.
 * 3. Every page passes @farcaster/snap's validator (schema, catalog, 64 elements, 7 root children,
 *    6 per container, depth 5, URL rules).
 * 4. Whole matches played through the snap's own actions: taps per match, time per action, GIF
 *    time and size.
 * 5. State: a tampered link is refused; a link replays the same match; another FID gets a new match.
 */
import assert from 'node:assert/strict';
import { validateSnapResponse } from '@farcaster/snap';
import { K, XY, lit, towers, type Placement } from '../src/lib/minpentai/play-game/game';
import { PlayController, type Env } from '../src/lib/minpentai/play-game/controller';
import { play } from '../src/lib/minpentai/snap/match';
import { act, intro, newMatch, type Here, type SnapPage } from '../src/lib/minpentai/snap/pages';
import { parse, serialize, sign, verified, type P, type SnapState } from '../src/lib/minpentai/snap/state';
import { runGif } from '../src/lib/minpentai/snap/run';
import { decMatch, encMatch } from '../src/lib/minpentai/snap/moves';
import { GET as runRoute } from '../src/app/snap/minpentai/run/route';

const H: Here = { base: 'https://snowmoon.party', keep: [] };
let failures = 0;
const pending: Promise<void>[] = [];
const check = (name: string, f: () => void | Promise<void>) => {
  const fail = (e: unknown) => { failures++; console.log(`FAIL ${name}: ${(e as Error).message}`); };
  try {
    const r = f();
    if (r instanceof Promise) pending.push(r.then(() => console.log(`ok   ${name}`), fail));
    else console.log(`ok   ${name}`);
  } catch (e) { fail(e); }
};
const valid = (p: SnapPage, where: string) => {
  const r = validateSnapResponse(p);
  assert.ok(r.valid, `${where}: ${JSON.stringify(r.issues.slice(0, 3))}`);
};

// ---------------------------------------------------------------------------------------------
// A simple player: gliders at the rows where Amber's towers were last seen, then squares.

function plan(p: ReturnType<typeof play>, style: 'gliders' | 'mixed'): P[] {
  const zone = [...lit(p.w, 'C', p.R, p.snapC)].filter((k) => !p.w.rock[k] && !p.w.sq[k] && !p.w.tw[k] && !p.w.gl.some((g) => K(g.x, g.y) === k));
  const rows = [...new Set(Object.keys(p.lsC).map((k) => XY(+k)[1]))];
  const out: P[] = [];
  let pts = 8;
  const used = new Set<number>();
  const take = (t: P['t'], k: number) => { const [x, y] = XY(k); out.push({ t, x, y, dx: t === 'g' ? 1 : 0, dy: 0 }); used.add(k); pts -= t === 'g' ? p.cost : t === 's' ? 1 : 4; };
  const glider = (row: number | undefined) => {
    const c = zone.filter((k) => !used.has(k) && (row === undefined || XY(k)[1] === row)).sort((a, b) => XY(b)[0] - XY(a)[0])[0];
    if (c !== undefined && pts >= p.cost) take('g', c);
  };
  if (style === 'gliders') { glider(rows[0]); glider(rows[1] ?? rows[0]); }
  else {
    glider(rows[0]);
    for (const tk of towers(p.w, 'C')) for (const k of [tk + 1, tk - 14, tk + 16]) if (pts >= 1 && zone.includes(k) && !used.has(k)) take('s', k);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 1. Same match as Play's practice

function controllerRun(seed: number, turns: (c: PlayController) => Placement[]): string[] {
  const env: Env = { now: () => seed, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' };
  const c = new PlayController(env);
  c.openStart('practice');
  c.begin();
  const boards: string[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const m = c.m!;
    boards.push(JSON.stringify(m.w));
    if (m.phase === 'over') break;
    m.pend.C = turns(c);
    c.endTurn();
    while (c.m!.phase === 'run') c.runTick();
  }
  return boards;
}

check('the same seed and placements give the same match as Play practice', () => {
  for (const seed of [0, 1, 7, 4242, 99_999, 123_456, 999_999]) {
    for (const style of ['gliders', 'mixed'] as const) {
      // Play the snap first, recording its placements, then feed them to the controller.
      const st = newMatch(1, '');
      st.seed = seed;
      const snapBoards: string[] = [];
      for (;;) {
        const p = play(st);
        snapBoards.push(JSON.stringify(p.w));
        if (p.over) break;
        st.turns.push(plan(p, style));
      }
      let t = 0;
      const ctl = controllerRun(seed, () => st.turns[t++].map((q) => ({ ...q, o: 'C' as const })));
      assert.equal(ctl.length, snapBoards.length, `seed ${seed} ${style}: ${ctl.length} vs ${snapBoards.length} turns`);
      ctl.forEach((b, i) => assert.equal(b, snapBoards[i], `seed ${seed} ${style}: board differs at turn ${i}`));
    }
  }
});

// ---------------------------------------------------------------------------------------------
// 2. Every move through taps

/** Drive the snap's own action, then read the state back out of the page's End turn target. */
function tapState(page: SnapPage): SnapState {
  const end = page.ui.elements.end ?? page.ui.elements.next;
  const target = new URL((end.on!.press as { params: { target: string } }).params.target);
  const s = target.searchParams.get('s')!;
  assert.ok(verified(s, target.searchParams.get('h')));
  return parse(s)!;
}
/** One POST through the snap's own action; the page only. */
const A = (a: string, st: SnapState | null, fid: number, inputs: Record<string, unknown>, ver: string) => act(H, a, st, fid, inputs, { ver }).page;
const post = (a: string, st: SnapState, inputs: Record<string, unknown> = {}) => A(a, structuredClone(st), st.fid, inputs, st.ver);
const tapAt = (st: SnapState, x: number, y: number, tool = '→ 4') => post('tap', st, { cell: `${y},${x}`, piece: tool });
const seedWith = (rule: string) => { for (let s = 0; ; s++) { const st = newMatch(5, ''); st.seed = s; if (play(st).rule === rule) return st; } };

check('every piece and every glider direction can be placed by tapping', () => {
  for (const rule of ['every8', 'diag']) {
    const st0 = seedWith(rule);
    const dirs = rule === 'diag' ? 8 : 4;
    // A glider in the open at (3, 2): placed facing right, then aimed with each arrow.
    const seen = new Set<string>();
    for (let d = 0; d < dirs; d++) {
      let st = tapState(tapAt(st0, 3, 2));
      assert.deepEqual(st.pend[0], { t: 'g', x: 3, y: 2, dx: 1, dy: 0 });
      const [dx, dy] = rule === 'diag' ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]][d] : [[-1, 0], [0, -1], [0, 1], [1, 0]][d];
      if (dx === 1 && dy === 0) { seen.add('1,0'); continue; }
      st = tapState(tapAt(st, 3 + dx, 2 + dy));
      assert.equal(st.pend.length, 1, 'aiming must not place a piece');
      seen.add(`${st.pend[0].dx},${st.pend[0].dy}`);
    }
    assert.equal(seen.size, dirs, `${rule}: ${[...seen].join(' ')}`);
    // At the edge (0, 0) no arrow points off the board: tapping the glider turns it through every direction.
    let st = tapState(tapAt(st0, 0, 0));
    const turned = new Set<string>();
    for (let i = 0; i < dirs; i++) { turned.add(`${st.pend[0].dx},${st.pend[0].dy}`); st = tapState(tapAt(st, 0, 0)); }
    assert.equal(turned.size, dirs, `${rule} edge turning: ${[...turned].join(' ')}`);
    // A square and a tower, by switching the piece; tapping one again takes it back.
    st = tapState(tapAt(st0, 2, 1, '■ 1'));
    st = tapState(tapAt(st, 3, 3, '◎ 4'));
    assert.deepEqual(st.pend.map((q) => q.t), ['s', 't']);
    assert.equal(st.tool, 't');
    st = tapState(tapAt(st, 2, 1, '◎ 4'));
    assert.deepEqual(st.pend.map((q) => q.t), ['t']);
    st = tapState(post('undo', st, { piece: '◎ 4' }));
    assert.equal(st.pend.length, 0);
    // Refusals are the site's: in the fog, and over 8 points.
    const fogPage = tapAt(st0, 12, 5);
    assert.match(String(fogPage.ui.elements.status.props!.content), /lit area/);
    st = tapState(tapAt(st0, 2, 2, '◎ 4'));
    st = tapState(tapAt(st, 3, 3, '◎ 4'));
    const over = tapAt(st, 4, 3, '■ 1');
    assert.match(String(over.ui.elements.status.props!.content), /Not enough points/);
  }
});

// ---------------------------------------------------------------------------------------------
// 3, 4. Whole matches through the snap, every page validated

interface Tally { taps: number; turns: number; win: string; step: number; actMs: number[]; bytes: number[]; gifMs: number[]; gifBytes: number[] }

async function fullMatch(seed: number, style: 'gliders' | 'mixed', ver = ''): Promise<Tally> {
  const T: Tally = { taps: 0, turns: 0, win: '', step: 0, actMs: [], bytes: [], gifMs: [], gifBytes: [] };
  const timed = (f: () => SnapPage, where: string) => {
    const t0 = performance.now();
    const p = f();
    T.actMs.push(performance.now() - t0);
    T.bytes.push(JSON.stringify(p).length);
    valid(p, where);
    return p;
  };
  valid(intro(H, ver), 'intro');
  let page = timed(() => A('start', null, 9, {}, ver), 'start');
  let st = tapState(page);
  st.seed = seed;
  for (;;) {
    const p = play(st);
    const label = (t: string) => `${t === 'g' ? '→' : t === 's' ? '■' : '◎'} ${t === 'g' ? p.cost : t === 's' ? 1 : 4}`;
    for (const q of plan(p, style)) {
      page = timed(() => A('tap', structuredClone(st), 9, { cell: `${q.y},${q.x}`, piece: label(q.t) }, ver), 'tap');
      st = tapState(page);
    }
    page = timed(() => A('end', structuredClone(st), 9, { piece: label(st.tool) }, ver), 'end');
    T.turns++;
    const next = page.ui.elements.next ?? page.ui.elements.again;
    const s = new URL((next.on!.press as { params: { target: string } }).params.target).searchParams.get('s')!;
    st = parse(s)!;
    const after = play(st);
    const run = after.runs[after.runs.length - 1];
    const t0 = performance.now();
    const gif = await runGif(run, after.R);
    T.gifMs.push(performance.now() - t0);
    T.gifBytes.push(gif.length);
    if (after.over) {
      T.win = after.over.win; T.step = after.over.step; T.taps = st.taps;
      // The result page shows the whole board: the reveal link, and a GIF that isn't the fogged one.
      const img = String(page.ui.elements.gif.props!.url);
      assert.equal(new URL(img).searchParams.get('r'), '1', 'the result image is the reveal');
      const shown = await runGif(run, after.R, true);
      assert.notDeepEqual(shown, gif, 'the reveal differs from the fogged run');
      break;
    }
    page = timed(() => A('next', structuredClone(st), 9, {}, ver), 'next');
    st = tapState(page);
  }
  return T;
}

const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

async function main() {
  const tallies: (Tally & { seed: number; style: string })[] = [];
  for (const seed of [11, 222, 3333, 44444, 555555, 6_666_666, 77_777_777, 888_888_888]) {
    for (const style of ['gliders', 'mixed'] as const) {
      try { tallies.push({ seed, style, ...(await fullMatch(seed, style)) }); } catch (e) { failures++; console.log(`FAIL match seed ${seed} ${style}: ${(e as Error).message}`); }
    }
  }
  try { tallies.push({ seed: 5, style: 'gliders (Fast fog)', ...(await fullMatch(5, 'gliders', 'fast-fog')) }); } catch (e) { failures++; console.log(`FAIL version match: ${(e as Error).message}`); }
  console.log(`ok   ${tallies.length} whole matches played through the snap, every page valid`);
  console.log('\nseed        style               result  step  turns  taps');
  for (const t of tallies) console.log(`${String(t.seed).padEnd(11)} ${t.style.padEnd(19)} ${t.win.padEnd(7)} ${String(t.step).padEnd(5)} ${String(t.turns).padEnd(6)} ${t.taps}`);
  const all = tallies.flatMap((t) => t.actMs), bytes = tallies.flatMap((t) => t.bytes), gm = tallies.flatMap((t) => t.gifMs), gb = tallies.flatMap((t) => t.gifBytes);
  console.log(`\naction (replay + page): median ${pct(all, 0.5).toFixed(2)} ms, p95 ${pct(all, 0.95).toFixed(2)} ms, max ${Math.max(...all).toFixed(2)} ms over ${all.length}`);
  console.log(`page JSON: median ${pct(bytes, 0.5)} B, max ${Math.max(...bytes)} B`);
  console.log(`GIF: median ${pct(gm, 0.5).toFixed(0)} ms, max ${Math.max(...gm).toFixed(0)} ms; size median ${(pct(gb, 0.5) / 1024).toFixed(1)} KB, max ${(Math.max(...gb) / 1024).toFixed(1)} KB`);

  // 5. State
  check('a tampered link is refused, and another FID starts a new match', () => {
    const st = newMatch(3, '');
    const s = serialize(st);
    assert.ok(verified(s, sign(s)));
    assert.ok(!verified(s.replace(/^3\./, '4.'), sign(s)));
    const page = A('tap', st, 4, { cell: '2,3' }, '');
    const got = tapState(page);
    assert.equal(got.fid, 4);
    assert.equal(got.pend.length, 0);
  });
  check('a link replays the same match', () => {
    const st = newMatch(3, '');
    st.turns = [[{ t: 'g', x: 3, y: 2, dx: 1, dy: 0 }]];
    const a = JSON.stringify(play(st).w), b = JSON.stringify(play(parse(serialize(st))!).w);
    assert.equal(a, b);
  });
  // 6. Resume, the reveal's guard, Play carrying on a match
  check('a kept match resumes at its next turn to act, and is dropped when the match ends', () => {
    let r = act(H, 'start', null, 7, {}, { ver: '' });
    assert.ok(r.keep && r.keep !== 'drop', 'a new match is kept');
    let st = tapState(r.page);
    st = tapState(A('tap', st, 7, { cell: '2,3', piece: '→ 4' }, ''));
    r = act(H, 'end', st, 7, {}, { ver: '' });
    assert.ok(r.keep && r.keep !== 'drop' && r.keep.save.turns.length === 1, 'the finished turn is kept');
    const saved = (r.keep as { save: Parameters<typeof act>[5]['saved'] & object }).save;
    // Only seed, level, version and finished turns: no taps, no pending pieces.
    assert.deepEqual(Object.keys(saved).sort(), ['lvl', 'seed', 'turns', 'ver']);
    const res = act(H, 'resume', null, 7, {}, { ver: '', saved });
    valid(res.page, 'resumed');
    const back = tapState(res.page);
    assert.equal(back.seed, saved.seed);
    assert.equal(JSON.stringify(play(back).w), JSON.stringify(play({ ...back, turns: saved.turns }).w));
    assert.match(String(res.page.ui.elements.status.props!.content), /Resumed at turn 2/);
    const none = act(H, 'resume', null, 7, {}, { ver: '', saved: null });
    assert.match(String(none.page.ui.elements.status.props!.content), /No match to resume/);
    const quit = act(H, 'resign-yes', back, 7, {}, { ver: '' });
    assert.equal(quit.keep, 'drop');
    for (const k of ['yes', 'no', 'maybe'] as const) valid(intro(H, '', k), `intro resume ${k}`);
    assert.ok(intro(H, '', 'yes').ui.elements.resume, 'Resume shown when kept');
    assert.ok(!intro(H, '', 'no').ui.elements.resume, 'no Resume when nothing kept');
  });

  check('the reveal is drawn only for a match that is over', async () => {
    const st = newMatch(3, '');
    st.turns = [[{ t: 'g', x: 3, y: 2, dx: 1, dy: 0 }]];
    const g = (await import('../src/lib/minpentai/snap/state')).runToken(st, 1);
    const get = (r: string) => runRoute(new Request(`https://snowmoon.party/snap/minpentai/run?g=${g}&h=${sign(g)}${r}`));
    assert.equal((await get('')).status, 200);
    assert.equal((await get('&r=1')).status, 404);
    // Resigned at setup: the whole board as one frame.
    const z = { ...newMatch(3, ''), resigned: true };
    const g0 = (await import('../src/lib/minpentai/snap/state')).runToken(z, 0);
    const res = await runRoute(new Request(`https://snowmoon.party/snap/minpentai/run?g=${g0}&h=${sign(g0)}&r=1`));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/gif');
  });

  check('Play carries on a snap match from its link: the same board at the same turn', () => {
    for (const seed of [11, 3333, 77_777_777]) {
      const st = newMatch(1, '');
      st.seed = seed;
      for (let i = 0; i < 3; i++) { const p = play(st); if (p.over) break; st.turns.push(plan(p, 'mixed')); }
      const link = decMatch(encMatch(st.seed, st.turns))!;
      const env: Env = { now: () => 0, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' };
      const c = new PlayController(env);
      assert.ok(c.continueMatch(link.seed, link.turns));
      assert.equal(JSON.stringify(c.m!.w), JSON.stringify(play(st).w), `seed ${seed}`);
      assert.equal(c.state.scr, play(st).over ? 'result' : 'match');
      // Play goes on from there exactly as the snap would.
      if (c.m!.phase === 'act') {
        const next = plan(play(st), 'gliders');
        c.m!.pend.C = next.map((q) => ({ ...q, o: 'C' as const }));
        c.endTurn();
        while ((c.m!.phase as string) === 'run') c.runTick();
        st.turns.push(next);
        assert.equal(JSON.stringify(c.m!.w), JSON.stringify(play(st).w), `seed ${seed}, a turn later`);
      }
    }
    const bad = new PlayController({ now: () => 0, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' });
    assert.equal(bad.continueMatch(1, [[{ t: 'g', x: 12, y: 5, dx: 1, dy: 0 }]]), false, 'a placement in the fog is refused');
  });

  await Promise.all(pending);
  if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nall passed');
}
void main();
