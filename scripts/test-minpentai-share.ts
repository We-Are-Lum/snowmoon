/**
 * Sharing a Minpentai ladder win (owner, 2026-10-19): opt-in, a card drawn from the link, nothing
 * stored, no ranking. Checks: the result screen offers sharing only for a ladder win; the link holds
 * only the rung and the steps; bad links are refused; the card route draws both shapes; nothing in the
 * share path writes to a database or calls our API. Run: npm run test:minpentai-share (no server, no network).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayController, type Env } from '../src/lib/minpentai/play-game/controller';
import { MAXS, RUNGS } from '../src/lib/minpentai/play-game/game';
import { parseResult, resultPath, resultText } from '../src/lib/minpentai/share-result';

let pass = 0;
const ok = (name: string, f: () => void | Promise<void>) =>
  Promise.resolve(f()).then(() => { pass++; console.log(`  ok   ${name}`); }, (e) => { console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message : e}`); process.exitCode = 1; });

const env: Env = { now: () => 0, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => 'https://snowmoon.party/minpentai' };
function result(mode: 'ladder' | 'practice', win: 'C' | 'A' | 'D', rung = 3) {
  const pc = new PlayController(env);
  pc.setState({ signed: true, dev: 'phone' });
  pc.openStart(mode, mode === 'ladder' ? rung : undefined);
  pc.m!.w.step = 41;
  pc.finish(win, 'test');
  return pc.view();
}

await ok('a ladder win offers sharing, with the rung and the steps', () => {
  // Play's matches run under its newest ruleset (2), and the share says so.
  assert.deepEqual(result('ladder', 'C', 3).share, { rung: 3, steps: 41, rs: 2 });
  assert.deepEqual(result('ladder', 'C', 5).share, { rung: 5, steps: 41, rs: 2 });
});
await ok('a loss, a draw and a practice win offer nothing', () => {
  assert.equal(result('ladder', 'A').share, undefined);
  assert.equal(result('ladder', 'D').share, undefined);
  assert.equal(result('practice', 'C').share, undefined);
});
await ok('the link holds only the rung, the steps and, under ruleset 2, the ruleset; a link made before rulesets were numbered reads as 1', () => {
  assert.equal(resultPath({ rung: 4, steps: 12 }), '/minpentai/result?r=4&s=12');
  assert.equal(resultPath({ rung: 4, steps: 12, rs: 1 }), '/minpentai/result?r=4&s=12');
  assert.equal(resultPath({ rung: 4, steps: 110, rs: 2 }), '/minpentai/result?r=4&s=110&g=2');
  assert.deepEqual(parseResult('4', '12'), { rung: 4, name: RUNGS[4]!.n, steps: 12, rs: 1 });
  assert.deepEqual(parseResult('4', '110', null, '2'), { rung: 4, name: RUNGS[4]!.n, steps: 110, rs: 2 });
  assert.equal(parseResult('4', '110'), null, 'an old link (ruleset 1) still stops at 96 steps');
  assert.equal(parseResult('4', '121', null, '2'), null, 'ruleset 2 stops at 120');
  for (const g of ['3', '0', '', 'x']) assert.equal(parseResult('4', '12', null, g), null, `ruleset "${g}" refused`);
  assert.match(resultText(parseResult('5', '30')!), /^I beat Planner, rung 5 of 5 on the Minpentai ladder, in 30 steps\. .*invented/);
});
await ok('bad links are refused (no free text can reach the card)', () => {
  for (const [r, s] of [['0', '5'], ['6', '5'], ['1', '0'], ['1', String(MAXS + 1)], ['1', '-3'], ['1', '2.5'], ['x', '5'], ['1', '<b>'], [null, '5'], ['1', undefined], ['01', '5']] as const) {
    assert.equal(parseResult(r as string | null, s as string | undefined), null, `${r}, ${s}`);
  }
  assert.ok(parseResult('1', String(MAXS)));
});
await ok('the card route draws both shapes and refuses a bad link', async () => {
  process.env.NEXT_PUBLIC_URL = 'https://snowmoon.party';
  // tsx compiles the route's JSX with the classic runtime (React.createElement); Next uses the automatic one.
  (globalThis as { React?: unknown }).React = (await import('react')).default;
  const { GET } = await import('../src/app/api/minpentai-card/route');
  const sharp = (await import('sharp')).default;
  const og = await GET(new Request('https://snowmoon.party/api/minpentai-card?r=2&s=17'));
  const embed = await GET(new Request('https://snowmoon.party/api/minpentai-card?r=2&s=17&shape=embed'));
  for (const [res, h] of [[og, 630], [embed, 800]] as const) {
    assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/jpeg');
    const m = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    assert.equal(m.width, 1200); assert.equal(m.height, h);
  }
  assert.equal((await GET(new Request('https://snowmoon.party/api/minpentai-card?r=9&s=17'))).status, 404);
});
await ok('nothing in the share path stores anything or calls our API', () => {
  for (const f of ['src/lib/minpentai/share-result.ts', 'src/app/minpentai/share-result.tsx', 'src/app/api/minpentai-card/route.tsx', 'src/app/minpentai/result/page.tsx']) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /\b(sql|postgres|supabase|authFetch|fetch\(|localStorage|insert into|\/api\/minpentai\/)/i, f);
  }
});
await ok('the share is opt-in: the result screen shows buttons, nothing is sent on its own', () => {
  const t = readFileSync('src/app/minpentai/share-result.tsx', 'utf8');
  assert.match(t, /onClick=\{cast\}/); assert.match(t, /onClick=\{post\}/);
  assert.doesNotMatch(t, /useEffect/);
});

console.log(`\n${pass} of 7 pass`);
