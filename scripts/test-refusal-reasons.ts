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
const lines = [REFUSAL_WORDING.generic, REFUSAL_WORDING.words, REFUSAL_WORDING.maker('OpenAI'), ...Object.values(REFUSAL_WORDING.plain).map((p) => REFUSAL_WORDING.rule(p))];
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
globalThis.fetch = (async (url: string) => {
  if (/groq|ai-gateway|chat\/completions/.test(String(url))) return new Response(JSON.stringify({ id: 'x', model: 'stand-in', choices: [{ index: 0, message: { role: 'assistant', content: guardVerdict }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { 'content-type': 'application/json' } });
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
