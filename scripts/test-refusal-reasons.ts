/**
 * Refusal reasons (branch refusal-reasons, owner Nate, 2026-11-18), tested without any model or network:
 *
 *   npm run test:refusal-reasons
 *
 * R1  every category of the prompt check's policy (config/prompts/image-guard.md) has its line, and the wording file
 *     has no category the policy doesn't; "words" gets the owner's words; every other known category the rule line
 *     with its plain phrase; no category, the check's "unclear" or an unknown word: the generic line, unchanged.
 * R2  the wording is marked reread by the owner 2026-11-22 (no DRAFT left), with the owner, the date and who drafted
 *     it; curly apostrophes only.
 * R3  paidPicture (on an in-memory Postgres with every migration, 0045_refusal_categories.sql included; the prompt
 *     check mocked) answers the category's line, keeps the category in the answer, and counts it by category in
 *     studio.image_refusals (no person); before that table exists it answers the same and counts nothing.
 * R4  a closed model's maker refusing (ImageRefused) names the maker; the open model's own words stay; with neither,
 *     the old "flagged" line. The challenge and sheet routes, chapter pictures' redo and add, and the voice boards'
 *     shot picture pass the closed model's maker.
 * R5  0045_refusal_categories.sql: who runs it, four parts in order, the dry run is the migration word for word, the
 *     read-back inserts and deletes a realistic row; A changes nothing, B applies twice, C (a) all true, C (b) passes
 *     and leaves nothing; studio_writer writes as the site does and can't delete; anon and authenticated read nothing;
 *     planted faults are caught.
 * R6  a check that gives no answer (branch prompt-check-budget, owner Nate 2026-11-22): an empty reply, or one cut off
 *     at the budget (finish_reason "length") with no verdict, is asked once more with the same budget; still none, and
 *     the person sees exactly "The prompt check didn’t give an answer. Try again.", it is counted as 'no_answer' (never
 *     as a rule, never "the rules don't allow"), credited back as other refusals are, no picture is made, and both
 *     checks' costs are recorded. The same in checkWords (titles, backstories) and Remix. The line is marked DRAFT.
 * R7  every prompt check gets 2,000 tokens: the default, the named budgets, each caller in src (found by search, so a
 *     new caller is caught), and every request the stand-in check hears.
 * Every check is also run on a planted violation, which must fail.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { GUARD_CATEGORIES, REFUSAL_WORDING, countedCategory, guardRefusal } from '../src/lib/images/refusal-wording';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
/** A rule that passes on the real thing and fails on a planted violation. */
const proven = (label: string, real: () => string[], planted: () => string[]) => {
  const p = real();
  check(label, p.length === 0, p.join('; '));
  check(`proof: ${label} (a planted violation is caught)`, planted().length > 0);
};
const need = (ok: boolean, problem: string) => (ok ? [] : [problem]);

// --- R1: category → line ---------------------------------------------------------------------------------------
const GENERIC = 'This prompt asks for something the rules don’t allow.';
const policy = read('config/prompts/image-guard.md');
const policyCats = [...policy.matchAll(/^- \*\*([a-z_]+)\*\*:/gm)].map((m) => m[1]);
type Fn = (c: string | null | undefined) => string;
const mapping = (f: Fn, cats: readonly string[], plain: Record<string, string>) => [
  ...need(cats.length === policyCats.length && policyCats.every((c) => cats.includes(c)), `the wording's categories (${cats.join(', ')}) aren't the policy's (${policyCats.join(', ')})`),
  ...need(f('words') === 'The image model here doesn’t draw words. Take them out and try again.', `words: "${f('words')}"`),
  ...policyCats.filter((c) => c !== 'words').flatMap((c) =>
    need(typeof plain[c] === 'string' && plain[c].length > 0 && f(c) === `This prompt asks for something the rules don’t allow (${plain[c]}). Change the words and try again.`, `${c}: "${f(c)}"`),
  ),
  ...[null, undefined, '', 'unclear', 'bogus', 'WORDS', 'words ', 'real person', 'constructor', '__proto__'].flatMap((c) => need(f(c as string | null | undefined) === GENERIC, `${JSON.stringify(c)}: "${f(c as string | null | undefined)}", not the generic line`)),
  ...need(f('real_person').includes('(a real person)') && f('someone_elses_work').includes('(a character, brand or film from another work, or a named artist’s style)'), 'the owner\'s two example phrases aren\'t used'),
];
proven(
  'R1 each category gets its line; none, unclear or unknown gets the generic line',
  () => mapping(guardRefusal, GUARD_CATEGORIES, REFUSAL_WORDING.plain),
  () => mapping((c) => (c === 'words' ? GENERIC : guardRefusal(c)), GUARD_CATEGORIES, REFUSAL_WORDING.plain),
);
// Each planted mapping must fail on its own.
check('proof: R1 a "words" line lost is caught', mapping((c) => (c === 'words' ? GENERIC : guardRefusal(c)), GUARD_CATEGORIES, REFUSAL_WORDING.plain).length > 0);
check('proof: R1 an unknown category shown as a rule is caught', mapping((c) => (c && c !== 'words' && !(c in REFUSAL_WORDING.plain) ? REFUSAL_WORDING.rule(c) : guardRefusal(c)), GUARD_CATEGORIES, REFUSAL_WORDING.plain).length > 0);
check('proof: R1 a policy category missing from the wording is caught', mapping(guardRefusal, GUARD_CATEGORIES.filter((c) => c !== 'campaign'), REFUSAL_WORDING.plain).length > 0);
check('the maker line names the maker', REFUSAL_WORDING.maker('OpenAI') === 'OpenAI’s own safety check refused this picture. Try other words.' && REFUSAL_WORDING.maker('Google') === 'Google’s own safety check refused this picture. Try other words.');
const counted = (f: Fn) => [
  ...GUARD_CATEGORIES.flatMap((c) => need(f(c) === c, `${c} counted as ${f(c)}`)),
  ...need(f(null) === 'unclear' && f(undefined) === 'unclear' && f('') === 'unclear' && f('unclear') === 'unclear', 'no category isn\'t counted as unclear'),
  ...need(f('Real person!') === 'other' && f('drugs') === 'other' && f('__proto__') === 'other', 'a word the policy doesn\'t have isn\'t counted as other'),
];
proven('R1 the count stores only the policy\'s categories, unclear or other', () => counted(countedCategory), () => counted((c) => c ?? 'unclear'));

// --- R2: reread, who, curly apostrophes --------------------------------------------------------------------------
const wordingSrc = read('src/lib/images/refusal-wording.ts');
// The one line not yet reread: the no-answer line (branch prompt-check-budget), marked DRAFT for Nate's reread.
const NO_ANSWER_REREAD = "The prompt check gave no answer, twice (owner Nate's words, 2026-11-22; reread by the owner";
const lines = [REFUSAL_WORDING.generic, REFUSAL_WORDING.words, REFUSAL_WORDING.maker('OpenAI'), REFUSAL_WORDING.noAnswer, ...Object.values(REFUSAL_WORDING.plain).map((p) => REFUSAL_WORDING.rule(p))];
const r2 = (src: string, ls: string[]) => [
  ...need(/reread by the owner 2026-11-22/.test(src) && !/DRAFT/.test(src) && /Owner Nate, 2026-11-18/.test(src) && /Drafted by the coding agent \(Claude, a closed model by\s*(\* )?Anthropic\)/.test(src), 'the wording file isn\'t marked reread by the owner 2026-11-22 (with no DRAFT left), with the owner, the date and its drafter'),
  ...ls.flatMap((l) => need(!/'/.test(l), `a straight apostrophe in "${l}"`)),
  ...need(REFUSAL_WORDING.generic === GENERIC, 'the generic line changed'),
];
proven('R2 the wording is marked reread (2026-11-22), says who and when, and uses curly apostrophes', () => r2(wordingSrc, lines), () => r2(wordingSrc.replace('reread by the owner 2026-11-22', 'DRAFT'), [...lines, "The image model here doesn't draw words."]));
check('proof: R2 a DRAFT mark left beside the reread mark is caught', r2(`${wordingSrc}\n// DRAFT`, lines).length > 0);

// --- R3, R4: paidPicture on an in-memory Postgres ----------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(read(`supabase/migrations/${f}`));
const PORT = 54377;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const su = async (q: string) => {
  await db.exec('reset role');
  try {
    await db.exec(q);
  } finally {
    await db.exec('set role studio_writer');
  }
};
process.env.GROQ_API_KEY = 'stand-in-not-a-key';
process.env.FAL_KEY = 'stand-in-not-a-key';
let guardVerdict = '{"allow": true}';
let anyOther = 0;
/** R6: replies the stand-in check gives in turn, before falling back to guardVerdict. */
let guardQueue: { content: string; finish: string; cost?: number }[] = [];
let guardCalls = 0;
const budgets: number[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (/groq|ai-gateway|chat\/completions/.test(String(url))) {
    guardCalls++;
    budgets.push(JSON.parse(String(init?.body ?? '{}')).max_tokens);
    const q = guardQueue.shift() ?? { content: guardVerdict, finish: 'stop' };
    return new Response(JSON.stringify({ id: 'x', model: 'stand-in', choices: [{ index: 0, message: { role: 'assistant', content: q.content }, finish_reason: q.finish }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, ...(q.cost !== undefined ? { cost: q.cost } : {}) } }), { headers: { 'content-type': 'application/json' } });
  }
  anyOther++;
  return new Response('no network in this test', { status: 400 });
}) as unknown as typeof fetch;
const { paidPicture } = await import('../src/lib/images/paid');
const { ImageRefused } = await import('../src/lib/images/fal');
const { MODEL_WORDING } = await import('../src/lib/challenge/model-wording');
const S = sql as unknown as Parameters<typeof paidPicture>[0];
const req = new Request('http://localhost/api/challenge/make', { method: 'POST' });
const spend = { model: { id: 'flux2-klein-4b-edit', host: 'fal.ai' }, reserveUsd: 0.0215 };
let made = 0;
const refuse = async (fid: number, verdict: string) => {
  guardVerdict = verdict;
  const r = await paidPicture(S, fid, req, { checkText: 'Zei on a ledge, a sign saying hello', spend, make: async () => { made++; throw new Error('not reached'); } });
  guardVerdict = '{"allow": true}';
  return r;
};
const countsNow = async () => Object.fromEntries((await sql<{ category: string; refusals: number }[]>`select category, refusals from studio.image_refusals where day = (now() at time zone 'utc')::date`).map((r) => [r.category, Number(r.refusals)]));
const no = (c: string) => `{"allow": false, "category": "${c}"}`;
const w = await refuse(5001, no('words'));
const rp = await refuse(5002, no('real_person'));
const sw = await refuse(5003, no('someone_elses_work'));
const unknown = await refuse(5004, no('drugs'));
const none = await refuse(5005, '{"allow": false}');
const garbled = await refuse(5006, 'I think this is fine');
const w2 = await refuse(5007, no('words'));
const err = (r: Awaited<ReturnType<typeof refuse>>) => (r.ok ? 'ok' : r.error);
const r3 = [
  ...need(!w.ok && w.status === 422 && w.error === REFUSAL_WORDING.words && w.extra.reason === 'blocked' && w.extra.category === 'words', `words: ${JSON.stringify(w)}`),
  ...need(err(rp) === 'This prompt asks for something the rules don’t allow (a real person). Change the words and try again.', `real_person: ${err(rp)}`),
  ...need(err(sw) === 'This prompt asks for something the rules don’t allow (a character, brand or film from another work, or a named artist’s style). Change the words and try again.', `someone_elses_work: ${err(sw)}`),
  ...need(err(unknown) === GENERIC && err(none) === GENERIC && err(garbled) === GENERIC, `unknown / none / garbled: ${err(unknown)} / ${err(none)} / ${err(garbled)}`),
  ...need(made === 0, `a refused prompt made ${made} pictures`),
  ...need(anyOther === 0, `${anyOther} calls went somewhere other than the stand-in check`),
];
check('R3 paidPicture answers the category\'s line, keeps the category, and makes nothing', r3.length === 0, r3.join('; '));
const c1 = await countsNow();
check('R3 the refusals are counted by category in the day\'s totals', (c1.words === 2 && c1.real_person === 1 && c1.someone_elses_work === 1 && c1.other === 1 && c1.unclear === 2 && Object.keys(c1).length === 5), JSON.stringify(c1));
const cols = (await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'image_refusals' order by ordinal_position`).map((r) => r.column_name);
check('R3 the count keeps the day, the category and how many, nothing about the person', cols.join() === 'day,category,refusals', cols.join());
// An allowed prompt is not counted.
guardVerdict = '{"allow": true}';
await paidPicture(S, 5008, req, { checkText: 'Zei on a ledge', spend, make: async () => { throw new Error('the model did not answer'); } });
check('R3 an allowed prompt adds no refusal', JSON.stringify(await countsNow()) === JSON.stringify(c1));
// Before the migration: the same answer, nothing counted, nothing fails.
await su('alter table studio.image_refusals rename to image_refusals_hidden');
const before = await refuse(5009, no('words'));
await su('alter table studio.image_refusals_hidden rename to image_refusals');
check('R3 before 0045_refusal_categories.sql is applied: the same answer, nothing counted', !before.ok && before.error === REFUSAL_WORDING.words && JSON.stringify(await countsNow()) === JSON.stringify(c1), JSON.stringify(before));
// And if writing the count fails (here: studio_writer may not insert), the answer is the same.
await su('revoke insert on studio.image_refusals from studio_writer');
const failing = await refuse(5010, no('words'));
await su('grant insert on studio.image_refusals to studio_writer');
check('R3 a count that can\'t be written doesn\'t fail the request', !failing.ok && failing.status === 422 && failing.error === REFUSAL_WORDING.words, JSON.stringify(failing));
// The check (paid.ts) answers through guardRefusal, never the fixed line (planted: today's code).
const paidSrc = read('src/lib/images/paid.ts');
const usesMap = (src: string) => need(/error: failed\(guardRefusal\(guard\.category\), back\)/.test(src) && /await countRefusal\(sql, guard\.category\)/.test(src), 'paid.ts doesn\'t answer the check\'s refusal with guardRefusal or doesn\'t count it');
proven('R3 paid.ts answers the check\'s refusal by its category and counts it', () => usesMap(paidSrc), () => usesMap(paidSrc.replace('failed(guardRefusal(guard.category), back)', "failed('This prompt asks for something the rules don’t allow.', back)")));

// R4: the maker's own check.
const refused = async (fid: number, job: { maker?: string | null; blocked?: { error: string; giveBack: boolean } }) =>
  paidPicture(S, fid, req, { checkText: 'Zei on a ledge', spend, make: async () => { throw new ImageRefused('gateway 400'); }, ...job });
const gpt = await refused(5101, { maker: 'OpenAI' });
const gem = await refused(5102, { maker: 'Google' });
const open = await refused(5103, { blocked: { error: MODEL_WORDING.openBlocked(true), giveBack: true } });
const plain = await refused(5104, {});
const r4 = [
  ...need(!gpt.ok && gpt.status === 422 && gpt.error === 'OpenAI’s own safety check refused this picture. Try other words.' && gpt.extra.reason === 'nsfw' && !gpt.extra.givenBack, `OpenAI: ${JSON.stringify(gpt)}`),
  ...need(!gem.ok && gem.error === 'Google’s own safety check refused this picture. Try other words.', `Google: ${JSON.stringify(gem)}`),
  ...need(!open.ok && open.error === "This picture was blocked by the open model's safety check. Try other words, or a closed model.", `open: ${JSON.stringify(open)}`),
  ...need(!plain.ok && plain.error === 'The image was flagged by the safety checker and dropped.', `neither: ${JSON.stringify(plain)}`),
];
check('R4 a closed maker\'s refusal names the maker; the open model\'s words and the old line stay', r4.length === 0, r4.join('; '));
const challengeSrc = read('src/app/api/challenge/make/route.ts');
const sampleSrc = read('src/app/api/designs/sample/route.ts');
const passesMaker = (c: string, s: string) => [
  ...need(/\.\.\.\(chosen\.open \? \{\} : \{ maker: chosen\.maker \}\),\s*\}\);/.test(c), 'the challenge route doesn\'t pass a closed model\'s maker'),
  ...need(/maker: closed\?\.maker \?\? null,/.test(s), 'the sheet route doesn\'t pass a closed model\'s maker'),
];
proven('R4 the challenge and sheet routes pass a closed model\'s maker', () => passesMaker(challengeSrc, sampleSrc), () => passesMaker(challengeSrc.replace('maker: chosen.maker', 'maker: null'), sampleSrc));
// Main's newer callers (chapter pictures' redo and add, the voice boards' shot picture): the same, each paidPicture call.
const laterCallers = ['src/lib/chapter-pictures/pictures.ts', 'src/lib/voice/shot-picture.ts'].map((f) => ({ f, src: read(f) }));
const passMakerEach = (cs: { f: string; src: string }[]) => cs.flatMap(({ f, src }) => {
  const calls = src.split('await deps.paid(sql, fid, request, {').slice(1).map((c) => c.slice(0, c.indexOf('\n  });')));
  return [...need(calls.length > 0, `${f} has no paidPicture call`), ...calls.flatMap((c, i) => need(/\.\.\.\(m\.open \? \{\} : \{ maker: m\.maker \}\),/.test(c), `${f}: paidPicture call ${i + 1} doesn't pass a closed model's maker`))];
});
proven('R4 chapter pictures (redo, add) and the voice boards\' shot picture pass a closed model\'s maker', () => passMakerEach(laterCallers), () => passMakerEach(laterCallers.map(({ f, src }) => ({ f, src: src.replace('...(m.open ? {} : { maker: m.maker }),', '') }))));

// --- R6: a check that gives no answer -----------------------------------------------------------------------------
{
  const NOANS = 'The prompt check didn’t give an answer. Try again.';
  const { readVerdict, checkPrompt, NO_ANSWER } = await import('../src/lib/images/guard');
  const { checkWords } = await import('../src/lib/images/paid');
  const { checkBackstory } = await import('../src/lib/challenge/backstories');
  const { creditBack } = await import('../src/lib/wallet/credits');
  void creditBack;
  // The verdict reader: empty, or cut off with no verdict, is no answer; a verdict cut off is still a verdict; a
  // reply that ends normally without one is "unclear", as before.
  type RV = (t: string, f?: string | null) => { allow: boolean; category: string | null } | null;
  const reads = (f: RV) => [
    ...need(f('', 'stop') === null && f('   \n', 'length') === null && f('', null) === null, 'an empty reply isn\'t no answer'),
    ...need(f('The user asks for a picture of Zei on a ledge. Check each rule: minor? no. sexual? no', 'length') === null, 'a reply cut off at the budget with no verdict isn\'t no answer'),
    ...need(f('{"allow": true', 'length') === null, 'a half-written verdict cut off isn\'t no answer'),
    ...need(f('{"allow": true}', 'length')?.allow === true && f('{"allow": false, "category": "words"}', 'stop')?.category === 'words', 'a verdict isn\'t read'),
    ...need(f('I think this is fine', 'stop')?.category === 'unclear' && f('{"allow": false}', 'stop')?.category === 'unclear', 'an answer without a clear verdict isn\'t "unclear"'),
  ];
  const oldRead: RV = (t) => { let v: { allow?: unknown; category?: unknown } = {}; try { v = JSON.parse(t.trim().split('\n').reverse().find((l) => l.trim().startsWith('{')) ?? ''); } catch { v = {}; } return { allow: v.allow === true, category: typeof v.category === 'string' ? v.category : v.allow === true ? null : 'unclear' }; };
  proven('R6 an empty reply, or one cut off with no verdict, is no answer; a verdict or a normal unclear reply is an answer', () => reads(readVerdict), () => reads(oldRead));
  check('R6 the no-answer category fits studio.image_refusals (^[a-z_]{1,40}$), and is its own, not a rule', NO_ANSWER === 'no_answer' && /^[a-z_]{1,40}$/.test(NO_ANSWER) && !(GUARD_CATEGORIES as readonly string[]).includes(NO_ANSWER) && countedCategory(NO_ANSWER) === 'no_answer' && guardRefusal(NO_ANSWER) === NOANS);
  check('proof: R6 a category the table refuses is caught', !/^[a-z_]{1,40}$/.test('no-answer') && !/^[a-z_]{1,40}$/.test('No_answer'));
  check('R6 the line is exactly the owner\'s, with the curly apostrophe, and never the rules line', REFUSAL_WORDING.noAnswer === NOANS && !/rules/.test(REFUSAL_WORDING.noAnswer) && !/'/.test(REFUSAL_WORDING.noAnswer));
  const rereadMarked = (src: string) => need(src.includes(NO_ANSWER_REREAD) && src.indexOf(NO_ANSWER_REREAD) < src.indexOf("noAnswer: 'The prompt check didn’t give an answer. Try again.'"), 'the no-answer line isn\'t marked reread by the owner');
  proven('R6 the no-answer line is marked reread by the owner (2026-11-22)', () => rereadMarked(wordingSrc), () => rereadMarked(wordingSrc.replace(NO_ANSWER_REREAD, 'DRAFT')));

  // checkPrompt itself: the retry, its cost, the budget.
  const req6 = new Request('http://localhost/api/images/generate', { method: 'POST' });
  const run = async (q: typeof guardQueue) => { guardQueue = [...q]; guardCalls = 0; const r = await checkPrompt('Zei on a ledge', req6); guardQueue = []; return { r, calls: guardCalls }; };
  const e = { content: '', finish: 'length', cost: 0.0006 };
  const twice = await run([e, e]);
  const thenOk = await run([e, { content: '{"allow": true}', finish: 'stop', cost: 0.0002 }]);
  const cutThenWords = await run([{ content: 'Checking the rules: minor? no', finish: 'length', cost: 0.0006 }, { content: '{"allow": false, "category": "words"}', finish: 'stop', cost: 0.0002 }]);
  const once = await run([{ content: '{"allow": true}', finish: 'stop', cost: 0.0003 }, e]);
  const garbledOnce = await run([{ content: 'I think this is fine', finish: 'stop', cost: 0.0001 }, e]);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
  const r6a = [
    ...need(twice.calls === 2 && !twice.r.allow && twice.r.category === 'no_answer' && twice.r.attempts === 2 && near(twice.r.costUsd, 0.0012), `no answer twice: ${JSON.stringify(twice)}`),
    ...need(thenOk.calls === 2 && thenOk.r.allow && near(thenOk.r.costUsd, 0.0008), `no answer, then allowed: ${JSON.stringify(thenOk)}`),
    ...need(cutThenWords.calls === 2 && cutThenWords.r.category === 'words', `cut off, then words: ${JSON.stringify(cutThenWords)}`),
    ...need(once.calls === 1 && once.r.allow && near(once.r.costUsd, 0.0003), `an answer first time is not asked again: ${JSON.stringify(once)}`),
    ...need(garbledOnce.calls === 1 && garbledOnce.r.category === 'unclear', `a normal reply without a verdict is not asked again: ${JSON.stringify(garbledOnce)}`),
  ];
  check('R6 checkPrompt asks once more with the same budget after no answer, then no_answer; both checks\' costs counted', r6a.length === 0, r6a.join('; '));
  // Planted: a check with no retry, or one that drops the first check's cost, is caught by the same rules.
  const noRetry = { ...twice, calls: 1 };
  const lostCost = { ...thenOk, r: { ...thenOk.r, costUsd: 0.0002 } };
  check('proof: R6 a check with no retry is caught', !(noRetry.calls === 2));
  check('proof: R6 a retry whose first cost is dropped is caught', !near(lostCost.r.costUsd, 0.0008));

  // paidPicture: the line, the count, the credit back, no picture, the cost recorded.
  const guardCost = async () => Number((await sql<{ usd: number }[]>`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where kind = 'guard' and day = (now() at time zone 'utc')::date`)[0].usd);
  const before6 = await countsNow();
  const cost0 = await guardCost();
  made = 0;
  guardQueue = [e, e];
  guardCalls = 0;
  const p = await paidPicture(S, 5201, req, { checkText: 'Zei on a ledge', spend, make: async () => { made++; throw new Error('not reached'); } });
  const pCalls = guardCalls;
  const after6 = await countsNow();
  const cost1 = await guardCost();
  const r6b = [
    ...need(!p.ok && p.status === 422 && p.error === NOANS && p.extra.category === 'no_answer' && p.extra.reason === 'blocked', `paidPicture: ${JSON.stringify(p)}`),
    ...need(!p.ok && p.error !== GENERIC && !/rules/.test(p.error), 'the no-answer refusal says "the rules"'),
    ...need(pCalls === 2 && made === 0, `${pCalls} checks, ${made} pictures`),
    ...need((after6.no_answer ?? 0) === (before6.no_answer ?? 0) + 1 && (after6.unclear ?? 0) === (before6.unclear ?? 0), `counts: ${JSON.stringify(before6)} -> ${JSON.stringify(after6)}`),
    ...need(near(cost1 - cost0, 0.0012), `the guard cost recorded: ${cost1 - cost0}`),
  ];
  check('R6 paidPicture: no answer twice says the owner\'s line, counts no_answer (not unclear), makes nothing, records both checks\' cost', r6b.length === 0, r6b.join('; '));
  // The same refusal path as other refusals (credited back, reason 'blocked'): paid.ts has no separate branch for it.
  const paidSrc6 = read('src/lib/images/paid.ts');
  const samePath = (src: string) => need(/if \(!guard\.allow\) \{[\s\S]{0,700}await countRefusal\(sql, guard\.category\);[\s\S]{0,200}creditBack\(sql, r\.debitId, 'refused'\)/.test(src), 'paid.ts handles no answer outside the refusal path (credit back, count)');
  proven('R6 a no-answer picture is credited back and counted like any refusal', () => samePath(paidSrc6), () => samePath(paidSrc6.replace("creditBack(sql, r.debitId, 'refused');\n    // The rule", "creditBack(sql, r.debitId, 'nothing');\n    // The rule")));

  // checkWords (titles) and backstories.
  guardQueue = [e, e];
  const title = await checkWords(S, req, 'Lantern style');
  guardQueue = [e, e];
  const story = await checkBackstory(S, req, 'Zei found a new crew.');
  guardQueue = [];
  const after7 = await countsNow();
  const r6c = [
    ...need(!title.ok && title.status === 422 && title.error === NOANS, `a title: ${JSON.stringify(title)}`),
    ...need(!story.ok && story.error === NOANS, `a backstory: ${JSON.stringify(story)}`),
    ...need((after7.no_answer ?? 0) === (after6.no_answer ?? 0) + 2, `counts: ${JSON.stringify(after7)}`),
  ];
  check('R6 a title or backstory check with no answer says the owner\'s line and counts no_answer', r6c.length === 0, r6c.join('; '));
  // Remix (its own path, src/lib/remix/make.ts): the same line and count for no answer; other refusals unchanged.
  const remixSrc = read('src/lib/remix/make.ts');
  const remixRule = (src: string) => need(/const noAnswer = guard\.category === NO_ANSWER_CATEGORY;\s*if \(noAnswer\) await countRefusal\(sql, guard\.category\);/.test(src) && /failed\(noAnswer \? REFUSAL_WORDING\.noAnswer : 'This prompt asks for something the rules don’t allow\.', back\)/.test(src), 'Remix doesn\'t say or count no answer');
  proven('R6 Remix says the owner\'s line for no answer and counts it', () => remixRule(remixSrc), () => remixRule(remixSrc.replace('noAnswer ? REFUSAL_WORDING.noAnswer : ', '')));
}

// --- R7: every prompt check gets 2,000 tokens ---------------------------------------------------------------------
{
  const { PROMPT_CHECK_MAX_TOKENS, IMAGES, REMIX } = await import('../src/lib/config');
  check('R7 the default and the named budgets are 2,000', PROMPT_CHECK_MAX_TOKENS === 2000 && IMAGES.guardMaxTokens === 2000 && IMAGES.designs.guardMaxTokens === 2000 && REMIX.guardMaxTokens === 2000 && /maxTokens: number = PROMPT_CHECK_MAX_TOKENS\)/.test(read('src/lib/images/guard.ts')));
  check('R7 every request the stand-in check heard asked for 2,000 tokens', budgets.length > 20 && budgets.every((b) => b === 2000), `${budgets.length} requests: ${[...new Set(budgets)].join(', ')}`);
  check('proof: R7 a request at 400 is caught', ![...budgets, 400].every((b) => b === 2000));
  // Each caller, found by search: a budget it names must be one of the 2,000 names; none takes the default.
  const OK_BUDGET = /^(IMAGES\.designs\.guardMaxTokens|REMIX\.guardMaxTokens|IMAGES\.guardMaxTokens|PROMPT_CHECK_MAX_TOKENS|job\.guardMaxTokens|opts\.maxTokens|slot === 'sample' \? undefined : IMAGES\.designs\.guardMaxTokens)$/;
  const CALL = /(await (?:deps\.paid|paidPicture|checkPromptWith|checkPrompt|checkWords|checkBackstory)\(|checkWords\(sql, request, text)/g;
  const walk = (d: string): string[] => readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(`${d}/${x.name}`) : /\.tsx?$/.test(x.name) ? [`${d}/${x.name}`] : []));
  const files = walk('src');
  type Caller = { at: string; budget: string };
  const callers = (srcOf: (f: string) => string): Caller[] => files.flatMap((f) => {
    const src = srcOf(f);
    const out: Caller[] = [];
    for (const m of src.matchAll(CALL)) {
      const line = src.slice(0, m.index).split('\n').length;
      const body = src.slice(m.index!, m.index! + 900);
      const end = body.search(/\n\s*\}\);|\);\n/);
      const call = end >= 0 ? body.slice(0, end + 3) : body;
      const named = call.match(/(?:guardMaxTokens|maxTokens): ([^,\n}]+(?: \? [^,\n]+ : [^,\n}]+)?)/);
      const pos = call.match(/^await checkPrompt\([^,]+, [^,]+, ([^)]+)\)/) ?? call.match(/^await checkPromptWith\([^,]+, [^,]+, [^,]+, ([^)]+)\)/);
      out.push({ at: `${f}:${line}`, budget: (named?.[1] ?? pos?.[1] ?? 'default').trim() });
    }
    return out;
  });
  const budgetRule = (cs: Caller[]) => [
    ...need(cs.length >= 10, `only ${cs.length} callers found`),
    ...cs.flatMap((c) => need(c.budget === 'default' || OK_BUDGET.test(c.budget), `${c.at} checks with ${c.budget}`)),
  ];
  const found = callers((f) => read(f));
  console.log(`     callers: ${found.map((c) => `${c.at} (${c.budget})`).join('; ')}`);
  proven('R7 every prompt-check caller in src gets 2,000 tokens (the default or a 2,000 name)', () => budgetRule(found), () => budgetRule(callers((f) => (f === 'src/app/api/challenge/make/route.ts' ? read(f).replace('guardMaxTokens: IMAGES.designs.guardMaxTokens,', 'guardMaxTokens: 1200,') : read(f)))));
  check('proof: R7 a new caller passing 400 is caught', budgetRule([...found, { at: 'planted', budget: '400' }]).length > 0);
}
await sql.end();
await server.stop();

// --- R5: the migration file -------------------------------------------------------------------------------------
const FILE = 'supabase/migrations/0045_refusal_categories.sql';
const text = read(FILE);
const part = (t: string, k: 'A' | 'B' | 'C' | 'D') => {
  const order = ['A', 'B', 'C', 'D'];
  const i = t.indexOf(`\n-- ${k}. `);
  const next = order[order.indexOf(k) + 1];
  const j = next ? t.indexOf(`\n-- ${next}. `) : t.length;
  return i < 0 || j < 0 ? '' : t.slice(t.indexOf('\n', i + 1) + 1, j);
};
const strip = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const uncomment = (s: string) => s.split('\n').filter((l) => l.startsWith('-- ')).map((l) => l.slice(3)).join('\n');
const parts = (t: string) => {
  const C = uncomment(part(t, 'C'));
  return {
    dry: strip(part(t, 'A')),
    mig: strip(part(t, 'B')),
    selectA: C.slice(C.indexOf('select n, what, ok'), C.indexOf(') as t(n, what, ok) order by n;') + ') as t(n, what, ok) order by n;'.length),
    doBlock: C.slice(C.indexOf('do $$'), C.lastIndexOf('end $$;') + 'end $$;'.length),
    undo: uncomment(part(t, 'D')).split('\n').filter((l) => !/^[A-Z]/.test(l)).join('\n').trim(),
    C,
  };
};
const shape = (t: string) => {
  const p = parts(t);
  return [
    ...need(/MUST RUN AS postgres/.test(t) && /Supabase SQL Editor/.test(t) && /NOT YET APPLIED/.test(t), 'the file doesn\'t say who runs it, where, and that it isn\'t applied'),
    ...need(['A', 'B', 'C', 'D'].every((k, i, a) => t.indexOf(`\n-- ${k}. `) > 0 && (i === 0 || t.indexOf(`\n-- ${a[i - 1]}. `) < t.indexOf(`\n-- ${k}. `))), 'the four parts aren\'t there in order'),
    ...need(p.dry.startsWith('begin;') && p.dry.endsWith('rollback;') && p.mig.startsWith('begin;') && p.mig.endsWith('commit;'), 'A doesn\'t end in rollback or B in commit'),
    ...need(p.dry.slice(0, -'rollback;'.length) === p.mig.slice(0, -'commit;'.length), 'the dry run isn\'t the migration word for word'),
    ...need(!/\bset\s+(local\s+|session\s+)?role\b/i.test(p.C), 'the read-back sets a role'),
    ...need(/insert into studio\.image_refusals/.test(p.doBlock) && /delete from studio\.image_refusals/.test(p.doBlock) && /READ-BACK PASSED/.test(p.doBlock), 'the read-back doesn\'t insert and delete a realistic row'),
    ...need(!/\b(alter|drop)\s+table\s+studio\.(?!image_refusals)/i.test(p.mig), 'the migration changes a table that exists'),
  ];
};
proven('R5 the file: who runs it, four parts, dry run = migration, read-back inserts and deletes, additive', () => shape(text), () => shape(text.replace('\nrollback;', '\ncommit;')));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
// Every numbered migration but this one: its own parts (A, B, C, D) are run on that below.
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f) && `supabase/migrations/${f}` !== FILE).sort()) await pg.exec(read(`supabase/migrations/${f}`));
const p = parts(text);
const snap = async () => JSON.stringify((await pg.query(`select table_name, column_name from information_schema.columns where table_schema = 'studio' order by 1, 2`)).rows);
const s0 = await snap();
await pg.exec(p.dry);
check('R5 A (the dry run) leaves everything as it was', (await snap()) === s0 && !(await pg.query<{ ok: boolean }>(`select to_regclass('studio.image_refusals') is not null as ok`)).rows[0].ok);
await pg.exec(p.mig);
await pg.exec(p.mig);
check('R5 B applies, and again (safe to run twice)', true);
const asWriter = async <T>(fn: () => Promise<T>): Promise<T | Error> => {
  await pg.exec('set role studio_writer');
  try {
    return await fn();
  } catch (e) {
    return e as Error;
  } finally {
    await pg.exec('reset role');
  }
};
// The site's own statement (src/lib/images/limits.ts countRefusal), twice.
const UPSERT = `insert into studio.image_refusals (category, refusals) values ($1, 1) on conflict (day, category) do update set refusals = studio.image_refusals.refusals + 1`;
const i1 = await asWriter(() => pg.query(UPSERT, ['words']));
const i2 = await asWriter(() => pg.query(UPSERT, ['words']));
const got = await asWriter(() => pg.query<{ refusals: number }>(`select refusals from studio.image_refusals where category = 'words' and day = (now() at time zone 'utc')::date`));
check('R5 studio_writer counts a refusal as the site does, twice: 2', !(i1 instanceof Error) && !(i2 instanceof Error) && !(got instanceof Error) && got.rows[0]?.refusals === 2, [i1, i2, got].filter((x) => x instanceof Error).map((x) => (x as Error).message).join('; '));
const bad = await asWriter(() => pg.query(UPSERT, ['Real person!']));
check('R5 a category the site never writes is refused', bad instanceof Error && /check/i.test(bad.message), bad instanceof Error ? bad.message : 'accepted');
const del = await asWriter(() => pg.query(`delete from studio.image_refusals`));
check('R5 studio_writer can\'t delete', del instanceof Error && /permission denied/.test(del.message), del instanceof Error ? del.message : 'allowed');
for (const role of ['anon', 'authenticated']) {
  await pg.exec(`set role ${role}`);
  const r = await pg.query(`select count(*) from studio.image_refusals`).then(() => 'read', (e: Error) => e.message);
  await pg.exec('reset role');
  check(`R5 ${role} reads nothing`, /permission denied/.test(r), r);
}
await pg.exec(`delete from studio.image_refusals`);
const runReadBack = async (block: string) => {
  const notes: string[] = [];
  try {
    await pg.query(block, [], { onNotice: (n: { message: string }) => notes.push(n.message) } as never);
    return notes.includes('READ-BACK PASSED') ? 'passed' : `no notice (${notes.join('; ')})`;
  } catch (e) {
    return (e as Error).message;
  }
};
const allTrue = async (q: string) => pg.query<{ ok: boolean }>(q).then((x) => x.rows.length === 4 && x.rows.every((r) => r.ok === true), () => false);
await pg.exec(`insert into studio.image_refusals (category, refusals) values ('real_person', 3)`);
const rows0 = JSON.stringify((await pg.query(`select * from studio.image_refusals order by 1, 2`)).rows);
check('R5 C (a): four rows, all true', await allTrue(p.selectA));
const rb = await runReadBack(p.doBlock);
check('R5 C (b) passes', rb === 'passed', rb);
check('R5 C leaves every row as it was (today\'s real counts untouched)', JSON.stringify((await pg.query(`select * from studio.image_refusals order by 1, 2`)).rows) === rows0);
// Planted: without the category check, C (b) must fail; with delete granted to studio_writer, C (a) must fail.
await pg.exec(`alter table studio.image_refusals drop constraint image_refusals_category_check`);
check('proof: R5 C (b) catches a table that takes any category', (await runReadBack(p.doBlock)) !== 'passed');
await pg.exec(`alter table studio.image_refusals add constraint image_refusals_category_check check (category ~ '^[a-z_]{1,40}$')`);
await pg.exec(`grant delete on studio.image_refusals to studio_writer`);
check('proof: R5 C (a) catches studio_writer able to delete', !(await allTrue(p.selectA)));
await pg.exec(`revoke delete on studio.image_refusals from studio_writer`);
check('R5 C (a) all true again after the planted fault is undone', await allTrue(p.selectA));
await pg.exec(p.undo);
check('R5 D undoes B', !(await pg.query<{ ok: boolean }>(`select to_regclass('studio.image_refusals') is not null as ok`)).rows[0].ok);
await pg.exec(p.mig);
check('R5 B applies again after D', (await pg.query<{ ok: boolean }>(`select to_regclass('studio.image_refusals') is not null as ok`)).rows[0].ok);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
