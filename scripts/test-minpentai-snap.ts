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
 * 6. Resume, the reveal, Play carrying on a match, aim arrows, fog, the computer level.
 * 7. The extra rule picked on the first page, and the challenge a result shares (owner, 2026-10-22).
 */
import assert from 'node:assert/strict';
import { validateSnapResponse } from '@farcaster/snap';
import { K, XY, lit, towers, type Placement } from '../src/lib/minpentai/play-game/game';
import { PlayController, type Env } from '../src/lib/minpentai/play-game/controller';
import { play } from '../src/lib/minpentai/snap/match';
import { act, intro, newMatch, AIM, AIM_TEXT, LEVELS, ROCK, SEEN, SEEN_BG, type Here, type SnapPage } from '../src/lib/minpentai/snap/pages';
import { sightOf } from '../src/lib/minpentai/play-server/view';
import { parse, serialize, sign, verified, type P, type SnapState } from '../src/lib/minpentai/snap/state';
import { runGif } from '../src/lib/minpentai/snap/run';
import { decMatch, encMatch } from '../src/lib/minpentai/snap/moves';
import { GET as runRoute } from '../src/app/snap/minpentai/run/route';
import { GET as snapRoute } from '../src/app/snap/minpentai/route';
import { GET as cardRoute } from '../src/app/api/minpentai-challenge-card/route';
import { sender } from '../src/lib/minpentai/snap/auth';
import nextConfig from '../next.config';
import { CHALLENGE_PATH, decChallenge, splitChallenge } from '../src/lib/minpentai/snap/challenge';
import { settings, versionOf } from '../src/lib/minpentai/snap/versions';

const H: Here = { base: 'https://snowmoon.party', keep: [] };
let failures = 0;
const pending: Promise<void>[] = [];
const check = (name: string, f: () => void | Promise<void>) => {
  const fail = (e: unknown) => { failures++; console.log(`FAIL ${name}: ${(e as Error).message}`, process.env.STACK ? (e as Error).stack : ''); };
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
    assert.deepEqual(Object.keys(saved).sort(), ['lvl', 'rule', 'seed', 'turns', 'ver']);
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

  // 7. Phone test part 2: aiming, what the fog shows, the computer level
  const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  check('aim arrows: magenta with black arrows on every square, diagonals exactly when the rule is drawn, and the turn screen says which', () => {
    assert.ok(ratio(AIM, '#08090C') >= 7 && ratio(AIM, '#17323A') >= 4.5 && ratio(AIM_TEXT, AIM) >= 7, 'aim contrast');
    assert.ok(ratio(ROCK, '#08090C') >= 4.5 && ratio(ROCK, '#17323A') >= 3, 'rock contrast');
    assert.ok(ratio(SEEN, SEEN_BG) >= 4.5, 'last-seen contrast');
    for (const rule of ['cost3', 'diag']) {
      const st0 = seedWith(rule);
      // Beside the fog (x 4 is the lit edge), and in the corner.
      for (const [x, y] of [[4, 2], [4, 7], [0, 0], [0, 9]]) {
        const page = tapAt(st0, x, y);
        const st = tapState(page);
        if (!st.pend.length) continue;
        const cells = (page.ui.elements.board.props as { cells: { row: number; col: number; color: string; content?: string; textColor?: string }[] }).cells;
        const aims = cells.filter((c) => c.color === AIM);
        assert.ok(aims.every((c) => c.textColor === AIM_TEXT && /[←→↑↓↖↗↘↙]/.test(c.content ?? '')), 'every arrow drawn black on magenta');
        const n = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [dx, dy])).filter(([dx, dy]) => (dx || dy) && !(dx === 1 && dy === 0) && (rule === 'diag' || !dx || !dy) && x + dx >= 0 && x + dx < 15 && y + dy >= 0 && y + dy < 10).length;
        assert.equal(aims.length, n, `${rule} at ${x},${y}: ${aims.length} arrows, expected ${n}`);
        const status = String(page.ui.elements.status.props!.content);
        assert.match(status, rule === 'diag' ? /diagonally/ : /no diagonal rule/, status);
      }
    }
    const t = intro(H, '');
    assert.match(JSON.stringify(t), /Diagonally too only in a match that draws the diagonal rule/);
  });

  check('the fog: rocks always shown; Amber\'s towers dimmed at their starts from step 0, changed only where Cyan can see', () => {
    for (const seed of [11, 3333, 77_777_777]) {
      const st = newMatch(1, '');
      st.seed = seed;
      const page = A('next', st, 1, {}, '');
      const cells = (page.ui.elements.board.props as { cells: { row: number; col: number; color: string; content?: string }[] }).cells;
      const at = (x: number, y: number) => cells.find((c) => c.col === x && c.row === y)!;
      for (const [x, y] of [[6, 0], [9, 3], [7, 4], [7, 5], [5, 6], [8, 9]]) assert.equal(at(x, y).color, ROCK, `rock ${x},${y}`);
      for (const [x, y] of [[13, 2], [13, 7]]) assert.ok(at(x, y).color === SEEN_BG && at(x, y).content === '◎', `Amber's start ${x},${y}`);
      // A whole match: a last-seen mark appears or goes only on a square Cyan sees in that frame.
      for (;;) {
        const p = play(st);
        if (p.over) break;
        st.turns.push(plan(p, 'gliders'));
      }
      const p = play(st);
      for (const run of p.runs) for (let i = 1; i < run.frames.length; i++) {
        const see = sightOf(run.full[i], 'C', p.R);
        for (let k = 0; k < 150; k++) if (!see.has(k)) assert.equal(k in run.ls[i], k in run.ls[i - 1], `seed ${seed}: mark at ${k} changed unseen`);
      }
    }
  });

  check('the computer level: picked on the first page, played, named, kept by Play again and Resume, and carried to Play', () => {
    const first = intro(H, '');
    valid(first, 'first page with the level');
    assert.equal(first.ui.elements.level.type, 'slider');
    let r = act(H, 'start', null, 8, { lvl: 3 }, { ver: '' });
    let st = tapState(r.page);
    assert.equal(st.lvl, 3);
    assert.match(String(r.page.ui.elements.status.props!.content), /Against Builder/);
    st.seed = 4242; // fixed, so the turns below are the same every run
    assert.ok(r.keep && r.keep !== 'drop' && r.keep.save.lvl === 3, 'kept with its level');
    assert.equal(act(H, 'start', null, 8, { lvl: 9 }, { ver: '' }).page && tapState(act(H, 'start', null, 8, { lvl: 9 }, { ver: '' }).page).lvl, 0, 'out of range: Practice');
    // Levels play differently on one seed.
    const a: SnapState = { ...st, seed: 4242, turns: [[]] }, b: SnapState = { ...a, lvl: 0, turns: [[]] };
    assert.notEqual(JSON.stringify(play(a).w), JSON.stringify(play(b).w), 'Builder and Practice differ');
    // Play again keeps it; the hand-off carries it, and Play matches board for board at that level.
    for (let i = 0; i < 2; i++) { r = act(H, 'end', st, 8, {}, { ver: '' }); st = parse(new URL((r.page.ui.elements.next.on!.press as { params: { target: string } }).params.target).searchParams.get('s')!)!; }
    const link = new URL((r.page.ui.elements.app.on!.press as { params: { target: string } }).params.target);
    assert.equal(link.searchParams.get('level'), '3');
    const g = decMatch(link.searchParams.get('match')!)!;
    const c = new PlayController({ now: () => 0, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' });
    assert.ok(c.continueMatch(g.seed, g.turns, 3));
    assert.equal(JSON.stringify(c.m!.w), JSON.stringify(play(st).w), 'Play at level 3 matches the snap');
    const again = tapState(act(H, 'again', { ...st, resigned: true }, 8, {}, { ver: '' }).page);
    assert.equal(again.lvl, 3);
    assert.match(LEVELS.join(' '), /^Practice Rival Blocker Builder Opportunist Planner$/);
  });

  // 7. The extra rule, and challenges
  const targetOf = (el: { on?: Record<string, unknown> }) => new URL((el.on!.press as { params: { target: string } }).params.target);
  /** Play a match through the snap's own actions to its result page. */
  const toEnd = (st0: SnapState, style: 'gliders' | 'mixed' = 'gliders', h: Here = H) => {
    let st = structuredClone(st0);
    for (let guard = 0; guard < 20; guard++) {
      const p = play(st);
      st.pend = plan(p, style);
      const r = act(h, 'end', st, st.fid, {}, { ver: st.ver });
      if (r.page.ui.elements.share) return r.page;
      st = parse(targetOf(r.page.ui.elements.next).searchParams.get('s')!)!;
    }
    throw new Error('no end');
  };
  const play0 = () => new PlayController({ now: () => 0, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' });

  check('the extra rule: picked on the first page (or drawn), played, kept, carried to Play board for board; no picker when a version fixes one', () => {
    const first = intro(H, '');
    valid(first, 'first page with the rule picker');
    const pick = first.ui.elements.rule;
    assert.equal(pick.type, 'toggle_group');
    assert.deepEqual(pick.props!.options, ['?', '↗', '→3', '◎2', '↻8']);
    assert.ok((pick.props!.options as string[]).join('').length <= 8, 'five options stay in one row (8 characters at most)');
    assert.ok(String(pick.props!.label).length <= 60);
    assert.ok(!intro(H, 'fast-fog').ui.elements.rule, 'a version with a fixed rule has no picker');
    // Every option is explained on the page itself.
    const key = String(first.ui.elements['rule-key'].props!.content);
    for (const g of ['↗', '→3', '◎2', '↻8']) assert.ok(key.includes(g + ' '), `the key explains ${g}`);
    assert.match(String(pick.props!.label), /\? = drawn at random/);
    const want: Record<string, string> = { '↗': 'diag', '→3': 'cost3', '◎2': 'sight2', '↻8': 'every8' };
    for (const [g, rule] of Object.entries(want)) {
      const st = tapState(act(H, 'start', null, 9, { rule: g, lvl: 2 }, { ver: '' }).page);
      assert.equal(st.rule, rule);
      assert.equal(play(st).rule, rule);
      assert.equal(play(st).R, rule === 'sight2' ? 2 : 3);
    }
    assert.equal(tapState(act(H, 'start', null, 9, { rule: '?' }, { ver: '' }).page).rule, '', '? is drawn');
    assert.equal(tapState(act(H, 'start', null, 9, { rule: 'nonsense' }, { ver: '' }).page).rule, '');
    // Picking the rule a seed would draw anyway changes nothing: the rng is used the same way.
    const d = seedWith('diag');
    const fixed = { ...d, rule: 'diag' as const, turns: [plan(play(d), 'gliders')] };
    assert.equal(JSON.stringify(play(fixed).w), JSON.stringify(play({ ...fixed, rule: '' }).w));
    // A rule the seed would not draw: the snap and Play still agree board for board, turn after turn.
    let st: SnapState = { ...seedWith('every8'), fid: 9, rule: 'sight2', lvl: 4 };
    for (let i = 0; i < 2; i++) { st.pend = plan(play(st), 'mixed'); const r = act(H, 'end', st, 9, {}, { ver: '' }); assert.ok(r.keep && r.keep !== 'drop' && r.keep.save.rule === 'sight2', 'kept with its rule'); st = parse(targetOf(r.page.ui.elements.next).searchParams.get('s')!)!; }
    const r = act(H, 'end', { ...st, pend: [] }, 9, {}, { ver: '' });
    const s2 = parse(targetOf(r.page.ui.elements.next).searchParams.get('s')!)!;
    const link = targetOf(r.page.ui.elements.app);
    assert.equal(link.searchParams.get('rule'), 'sight2');
    assert.equal(link.searchParams.get('level'), '4');
    const g = decMatch(link.searchParams.get('match')!)!;
    const c = play0();
    assert.ok(c.continueMatch(g.seed, g.turns, 4, (drawn) => settings(drawn, null, 'sight2')));
    assert.equal(c.m!.rule, 'sight2');
    assert.equal(c.m!.R, 2);
    assert.equal(JSON.stringify(c.m!.w), JSON.stringify(play(s2).w), 'Play with the picked rule matches the snap');
    assert.equal(tapState(act(H, 'again', { ...s2, resigned: true }, 9, {}, { ver: '' }).page).rule, 'sight2', 'Play again keeps it');
  });

  check('a challenge: Share casts the result with a signed link to the same start; the link plays it in the feed and in Play', async () => {
    const leak: Here = { base: 'https://snowmoon.party', keep: [['x-vercel-protection-bypass', 'SECRET']] };
    const st: SnapState = { ...newMatch(21, '', 2, 'cost3'), seed: 777 };
    const end = toEnd(st);
    valid(end, 'result with a challenge share');
    assert.ok(!end.ui.elements.make, 'no "Make your own version" until versions exist');
    const press = end.ui.elements.share.on!.press as { action: string; params: { text: string; embeds: string[] } };
    assert.equal(press.action, 'compose_cast');
    assert.match(press.params.text, /^Minpentai against Blocker: I (won|lost|drew|resigned) at step \d+.*, in \d+ taps\. Same start, same extra rule \(gliders cost 3\): can you beat it\?$/);
    const url = press.params.embeds[0];
    assert.ok(url.startsWith(`https://snowmoon.party${CHALLENGE_PATH}`), url);
    assert.ok(Buffer.byteLength(url) <= 256, `an embed URL is at most 256 bytes (${Buffer.byteLength(url)})`);
    // A preview's bypass never goes into a shared link.
    const leaked = toEnd(st, 'gliders', leak);
    assert.ok(JSON.stringify(leaked.ui.elements.again).includes('SECRET'), 'the snap\'s own links keep it');
    assert.ok(!JSON.stringify(leaked.ui.elements.share).includes('SECRET'), 'the shared link does not');
    const seg = url.slice(`https://snowmoon.party${CHALLENGE_PATH}`.length);
    const c = decChallenge(splitChallenge(seg)!.body)!;
    assert.deepEqual([c.seed, c.lvl, c.rule, c.ver], [777, 2, 'cost3', '']);
    // The first page a cast shows: the result, the same start, no level or rule to pick.
    const get = (s: string) => snapRoute(new Request(`https://snowmoon.party/snap/minpentai?c=${encodeURIComponent(s)}`, { headers: { accept: 'application/vnd.farcaster.snap+json' } }));
    const res = await get(seg);
    assert.equal(res.status, 200);
    const first = (await res.json()) as SnapPage;
    valid(first, 'challenge first page');
    assert.match(String(first.ui.elements.ch.props!.content), /^A challenge: .* Against Blocker, extra rule: Gliders cost 3 points\.$/);
    assert.ok(!first.ui.elements.level && !first.ui.elements.rule && !first.ui.elements.resume);
    // The same page when the rewrite (next.config.ts) hands over the link's own path.
    const viaPath = await snapRoute(new Request(`https://snowmoon.party${CHALLENGE_PATH}${seg}`, { headers: { accept: 'application/vnd.farcaster.snap+json' } }));
    assert.deepEqual(await viaPath.json(), first);
    const start = targetOf(first.ui.elements.start);
    assert.equal(start.searchParams.get('c'), seg);
    // A forged result (or start) is refused.
    const bad = seg.replace(/\.([CAD]r?)-(\d+)/, (_m, w, n) => `.${w}-${Math.max(1, +n - 1)}`);
    assert.notEqual(bad, seg);
    assert.equal((await get(bad)).status, 404);
    assert.equal((await snapRoute(new Request(`https://snowmoon.party${CHALLENGE_PATH}${bad}`, { headers: { accept: 'application/vnd.farcaster.snap+json' } }))).status, 404);
    // Accepting it: the same match (seed, level, rule), with the challenge's result kept for the end.
    const mine = tapState(act(H, 'start', null, 33, { lvl: 0, rule: '↗' }, { ver: '', challenge: c }).page);
    assert.deepEqual([mine.seed, mine.lvl, mine.rule, mine.fid], [777, 2, 'cost3', 33]);
    assert.ok(mine.ch);
    assert.equal(JSON.stringify(play(mine).w), JSON.stringify(play({ ...st, turns: [] }).w), 'the identical start');
    const theirEnd = toEnd(mine, 'mixed');
    assert.match(String(theirEnd.ui.elements.vs.props!.content), /^The challenge: .*\. You: .*\.$/);
    // In a browser the link opens Play at the same start, board for board.
    const p = play0();
    assert.ok(p.continueMatch(c.seed, [], c.lvl, (drawn) => settings(drawn, versionOf(c.ver), c.rule)));
    assert.equal(JSON.stringify(p.m!.w), JSON.stringify(play(mine).w));
    assert.deepEqual([p.m!.rule, p.m!.cost, p.m!.lvl], ['cost3', 3, 2]);
    // Its preview card for X (1200×630) and Farcaster (3:2), only for a signed link.
    // (tsx compiles the route's JSX for the classic runtime; Next uses the automatic one.)
    (globalThis as { React?: unknown }).React = (await import('react')).default;
    const card = await cardRoute(new Request(`https://snowmoon.party/api/minpentai-challenge-card?c=${encodeURIComponent(seg)}`));
    assert.equal(card.status, 200);
    assert.equal(card.headers.get('content-type'), 'image/jpeg');
    const sharp = (await import('sharp')).default;
    const meta = await sharp(Buffer.from(await card.arrayBuffer())).metadata();
    assert.deepEqual([meta.width, meta.height], [1200, 630]);
    const embed = await sharp(Buffer.from(await (await cardRoute(new Request(`https://snowmoon.party/api/minpentai-challenge-card?c=${encodeURIComponent(seg)}&shape=embed`))).arrayBuffer())).metadata();
    assert.deepEqual([embed.width, embed.height], [1200, 800]);
    assert.equal((await cardRoute(new Request(`https://snowmoon.party/api/minpentai-challenge-card?c=${encodeURIComponent(bad)}`))).status, 404);
  });

  check('a tap whose payload is not base64url JSON is refused with 400, not a 500', async () => {
    for (const body of [{ header: 'x', payload: 'x', signature: 'x' }, { header: 'x', payload: '', signature: 'x' }]) {
      const r = await sender(new Request('https://snowmoon.party/snap/minpentai?a=start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), 'https://snowmoon.party');
      assert.ok(!r.ok && r.status === 400, JSON.stringify(r));
    }
  });

  check('a first-page GET whose viewer header fails verification gets the anonymous snap, not an error', async () => {
    const r = await snapRoute(new Request('https://snowmoon.party/snap/minpentai', { headers: { accept: 'application/vnd.farcaster.snap+json', 'x-snap-payload': 'not-a-jfs' } }));
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('content-type')?.startsWith('application/vnd.farcaster.snap+json'));
    assert.ok(JSON.stringify(await r.json()).includes('Start a match'));
  });

  check('next.config: the snap links (/minpentai, /minpentai/play, challenges) send preflights and snap requests to the snap route; browsers get the page with Link', async () => {
    const rw = await (nextConfig.rewrites as () => Promise<{ beforeFiles: { source: string; has?: { key: string }[]; destination: string }[] }>)();
    for (const source of ['/minpentai', '/minpentai/play', '/minpentai/c/:seg']) {
      assert.ok(rw.beforeFiles.some((r) => r.source === source && r.has?.[0].key === 'access-control-request-method' && r.destination === '/snap/minpentai'), `${source}: preflight`);
      assert.ok(rw.beforeFiles.some((r) => r.source === source && r.has?.[0].key === 'accept' && r.destination.startsWith('/snap/minpentai')), `${source}: snap Accept`);
    }
    const hs = await (nextConfig.headers as () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>)();
    for (const source of ['/minpentai', '/minpentai/play', '/minpentai/c/:seg']) {
      const link = hs.find((x) => x.source === source)?.headers.find((x) => x.key === 'Link')?.value ?? '';
      assert.ok(link.includes(`<${source}>`) && link.includes('rel="alternate"'), `${source}: Link`);
    }
  });

  await Promise.all(pending);
  if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nall passed');
}
void main();
