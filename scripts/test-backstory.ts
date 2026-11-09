/**
 * Backstories and the characters' look lines (branch challenge-models, owner, 2026-11-09). Stand-ins only: the prompt
 * check is a mocked fetch; nothing is called or spent; the database is an in-memory Postgres (PGlite) with every
 * migration, the NEXT_ ones included. Each check runs on the real code and on a planted violation, which it must catch.
 *
 *   npm run test:backstory
 *
 *  B1 the box takes typed text up to 400 characters, and the tick; nothing else.
 *  B2 no AI writes it: the box and its screens make no model call and put nothing in it (no hint as its value or
 *     placeholder); the only request is the publish or "Add backstory", which sends what was typed.
 *  B3 at publish (challenge pictures only) the check runs before anything is written, a refusal publishes nothing and
 *     lets the maker publish without it, and it goes into the version's body with the tick and when.
 *  B4 "Add backstory" (admins, their own published challenge picture or first remix): one row, the version, its id,
 *     its links and its recipe unchanged; a non-admin and an admin who isn't the maker are refused; the check runs,
 *     and a refusal writes nothing.
 *  B5 the check is the image prompt check with 1,200 tokens (mocked), after the blocked names.
 *  B6 the page shows it under the picture, "Invented by @maker, not from the book", and "May spoil later chapters."
 *     only when ticked.
 *  L1 each challenge character has exactly one look line, starting "Unless the change says otherwise: ";
 *  L2 none names a real person (blocked names), a studio, film or artist, and the check (mocked) is sent them in the
 *     prompt;
 *  L3 the prompt order: the change words, the reference line, the look line, the style, the closing line, the suffix.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { CHALLENGE, IMAGES } from '../src/lib/config';
import { BACKSTORY_MAX, BACKSTORY_WORDING, readBackstory } from '../src/lib/challenge/backstory';
import { CHARACTER_LOOKS, LOOK_PREFIX } from '../src/lib/challenge/looks';
import { KEEP_LINE } from '../src/lib/challenge/styles';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
const failed: string[] = [];
function proven(name: string, real: string[], plant: string[]) {
  const ok = real.length === 0 && plant.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${real.length ? real.join('; ') : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${real.length ? ` (${real.join('; ')})` : ''}${plant.length ? '' : ' (plant not caught)'}`);
}
const need = (c: boolean, what: string) => (c ? [] : [what]);

// B1
const rules = (rb: typeof readBackstory) => [
  ...need(rb(undefined).ok && (rb(undefined) as { backstory: unknown }).backstory === null, 'no backstory is fine'),
  ...need((rb({ text: '  ' }) as { backstory: unknown }).backstory === null, 'blank is none'),
  ...need((rb({ text: 'x'.repeat(BACKSTORY_MAX), spoils: true }) as { backstory: { spoils: boolean } }).backstory.spoils === true, '400 characters are taken'),
  ...need(!rb({ text: 'x'.repeat(BACKSTORY_MAX + 1) }).ok, '401 characters are refused'),
  ...need(!rb({ text: 42 }).ok && !rb('just a string').ok, 'only typed text is taken'),
  ...need((rb({ text: 'a', spoils: 'yes' }) as { backstory: { spoils: boolean } }).backstory.spoils === false, 'the tick is true only when ticked'),
];
proven('B1 the box takes typed text up to 400 characters and the tick, nothing else', rules(readBackstory), rules(() => ({ ok: true, backstory: { text: 'x'.repeat(999), spoils: true } })));

// B2
const comp = read('src/components/challenge-backstory.tsx');
const preview = read('src/components/challenge-preview.tsx');
const noAi = (field: string, prev: string) => {
  const fieldPart = field.slice(field.indexOf('export function BackstoryField'), field.indexOf('export function BackstoryShown'));
  return [
    ...need(!/authFetch|fetch\(|complete\(|checkPrompt|suggest|generate/i.test(fieldPart), 'the box itself makes a request or asks a model'),
    ...need(!/placeholder=|value=\{[^}]*hints/.test(fieldPart) && /value=\{p\.text\}/.test(fieldPart), 'a hint is put in the box (as its value or placeholder)'),
    ...need((prev.match(/authFetch\(/g) ?? []).length === 2 && /api\/images\/publish/.test(prev) && /backstory = withStory && story\.trim\(\) \? \{ text: story, spoils \}/.test(prev), 'the preview sends something other than what was typed'),
    ...need((field.match(/authFetch\(/g) ?? []).length === 1 && /api\/challenge\/backstory/.test(field), '"Add backstory" makes another request'),
    ...need(!/from '[^']*(chat\/model|images\/guard|images\/fal|images\/closed)'/.test(field + read('src/lib/challenge/backstory.ts')), 'the box or its words import a model'),
  ];
};
proven('B2 no AI writes, fills or suggests the backstory: typed text only, the hints never in the box', noAi(comp, preview), noAi(comp.replace('value={p.text}', 'value={p.text || B.hints(p.name)[0]}').replace('rows={4}', 'rows={4} placeholder={B.hints(p.name)[0]}'), preview));

// B3
const pub = read('src/app/api/images/publish/route.ts');
const publishRules = (src: string) => [
  ...need(/const bs = t\.challenge \? readBackstory\(body\.backstory\)/.test(src), 'a backstory is read for a challenge picture only'),
  ...need(src.indexOf('checkBackstory(sql, request, bs.backstory.text)') > 0 && src.indexOf('checkBackstory(') < src.indexOf('putPublic('), 'the check doesn\'t run before anything is written'),
  ...need(/if \(!c\.ok\) return NextResponse\.json\(\{ error: c\.error, reason: 'backstory' \}/.test(src), 'a refusal doesn\'t stop the publish with its reason'),
  ...need(/backstory: \{ \.\.\.bs\.backstory, at: new Date\(\)\.toISOString\(\) \}/.test(src), 'it isn\'t stored in the version\'s body with the tick and when'),
  ...need(/storyRefused && \(/.test(preview) && /publish\(false\)/.test(preview), 'a refused backstory gives no "Publish without it"'),
];
proven('B3 at publish: the check runs first, a refusal publishes nothing (edit it, or publish without it), and it goes in the body with the tick and when', publishRules(pub), publishRules(pub.replace(/if \(bs\.backstory\) \{[\s\S]*?\n  \}\n/, '')));

// B6
const pictureComp = read('src/components/challenge-picture.tsx');
const shown = (src: string) => [
  ...need(/BACKSTORY_WORDING|B\.invented\(p\.maker\)/.test(comp) && BACKSTORY_WORDING.invented('@naaate') === 'Invented by @naaate, not from the book', 'the label'),
  ...need(/\{p\.backstory\.spoils && <p className="dz-muted mk-backstory-spoils">\{B\.spoils\}<\/p>\}/.test(comp) && BACKSTORY_WORDING.spoils === 'May spoil later chapters.', 'the spoiler label isn\'t only when ticked'),
  ...need(src.indexOf('<BackstoryShown') > src.indexOf('</figure>') && src.indexOf('<BackstoryShown') < src.indexOf('ChallengeShareFirst path'), 'not under the picture'),
  ...need(BACKSTORY_WORDING.hints('Zei').join(' | ') === 'What changed for Zei? | Where are they now? | What do they want that they didn’t before?' && BACKSTORY_WORDING.spoilTick === 'Mentions things from later in the book' && BACKSTORY_WORDING.label === 'Backstory', 'the approved words'),
];
proven('B6 the page shows it under the picture, "Invented by @maker, not from the book", and the spoiler line only when ticked', shown(pictureComp), shown(pictureComp.replace('<BackstoryShown', '<Moved')));

// L1–L3
const { blockedName } = await import('../src/lib/images/rules');
const { remixPrompt } = await import('../src/lib/challenge/make');
const looks = (l: Readonly<Record<string, string>>) => [
  ...need(CHALLENGE.characters.every((c) => typeof l[c] === 'string') && Object.keys(l).length === CHALLENGE.characters.length, 'a character without exactly one line'),
  ...Object.entries(l).flatMap(([c, t]) => [
    ...need(t.startsWith(LOOK_PREFIX), `${c}: doesn't start "${LOOK_PREFIX}"`),
    ...need(blockedName(t) === null, `${c}: names someone on the blocked list`),
    ...need(!/\b(studio|ghibli|disney|pixar|film|movie|anime|manga|in the style of|artist)\b/i.test(t), `${c}: names a studio, film or artist`),
  ]),
  ...need(l.zei === 'Unless the change says otherwise: a young man of eighteen, slim and of medium height, light golden-tan skin, spiky black hair with close-cut sides and one teal-blue streak, dark eyes.', 'Zei\'s line isn\'t the owner\'s, exactly'),
];
proven('L1 L2 one look line per challenge character, each "Unless the change says otherwise: …", none naming a real person, studio, film or artist', looks(CHARACTER_LOOKS), looks({ ...CHARACTER_LOOKS, mu: 'Mu, drawn like a Pixar film character.' }));
const order = (prompt: string) => need(prompt === ['give her a red coat', 'Bai is the person in reference image 1, the main figure.', CHARACTER_LOOKS.bai, 'soft pencil on pale paper', KEEP_LINE, IMAGES.suffix].join('\n\n'), `the prompt is ${JSON.stringify(prompt).slice(0, 200)}`);
const route = read('src/app/api/challenge/make/route.ts');
proven('L3 the prompt order: change words, reference line, look line, style, closing line, suffix (every model)', [...order(remixPrompt({ words: 'give her a red coat', name: 'Bai', look: CHARACTER_LOOKS.bai, style: 'soft pencil on pale paper' })), ...need(/remixPrompt\(\{ words: r\.words, name, look: lookFor\(src\.character\), style: style!\.text \}\)/.test(route), 'the route doesn\'t add the look line')], order(remixPrompt({ words: 'give her a red coat', name: 'Bai', style: 'soft pencil on pale paper' })));

// B4, B5: on a local database.
{
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  const dir = path.join(ROOT, 'supabase/migrations');
  for (const f of [...readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(), ...readdirSync(dir).filter((f) => /^NEXT_.*\.sql$/.test(f)).sort()]) await db.exec(read(`supabase/migrations/${f}`));
  await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  const PORT = 54391;
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
  await sql`set role studio_writer`;
  type Sql = postgres.Sql;
  const S = sql as unknown as Sql;
  const su = async (q: string) => { await db.exec('reset role'); try { await db.exec(q); } finally { await db.exec('set role studio_writer'); } };
  // A published challenge picture of the owner's (6786), and one of person 501's.
  const pic = async (n: number, fid: number) => {
    const e = `7${n}000000-0000-4000-8000-000000000001`, v = `7${n}000000-0000-4000-8000-000000000002`, r = `7${n}000000-0000-4000-8000-000000000003`;
    await su(`insert into studio.recipes (id, source, provider, model, model_version, prompt, params, seed, cost_usd, created_by_fid) values ('${r}','in_app','fal.ai','flux2-klein-4b-edit','e','p','{"challenge":{"character":"zei","from":"x","fromKind":"sheet"},"user_prompt":"a red coat"}',1,0.01,${fid});
      insert into studio.elements (id, work_id, element_type, created_by_fid, status) values ('${e}','snowmoon','image',${fid},'published');
      insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values ('${v}','${e}',1,'{"lettering":[]}','https://pictures.example/${n}.jpg','${String(n).repeat(64).slice(0, 64)}','${r}');`);
    return v;
  };
  const mineV = await pic(1, 6786), theirsV = await pic(2, 501);
  // Its lineage: a 'uses' link, which must stay as it is.
  await su(`insert into studio.links (from_version_id, to_version_id, kind) values ('${mineV}','${theirsV}','uses')`);
  const { addBackstory, backstoryOf } = await import('../src/lib/challenge/backstories');
  const snapshot = async () => JSON.stringify([
    await sql`select id, element_id, version_no, body, asset_url, asset_sha256, recipe_id, created_at from studio.element_versions order by id`,
    await sql`select * from studio.elements order by id`, await sql`select * from studio.links order by from_version_id`, await sql`select id, params from studio.recipes order by id`,
  ]);
  const before = await snapshot();
  const seen: string[] = [];
  const allow = async (t: string) => { seen.push(t); return { ok: true as const }; };
  const refuse = async (t: string) => { seen.push(t); return { ok: false as const, status: 422, error: BACKSTORY_WORDING.refused }; };
  const story = { text: 'She left the tower at dawn and keeps its map now.', spoils: true };
  const nonAdmin = await addBackstory(S, 501, theirsV, story, allow);
  const notMaker = await addBackstory(S, 193912, mineV, story, allow);
  const refused = await addBackstory(S, 6786, mineV, story, refuse);
  const rowsAfterRefusal = Number((await sql`select count(*)::int as n from studio.challenge_backstories`)[0].n);
  const ok = await addBackstory(S, 6786, mineV, story, allow);
  const after = await snapshot();
  const got = await backstoryOf(S, mineV, { lettering: [] });
  const fromBody = await backstoryOf(S, theirsV, { lettering: [], backstory: { text: 'Written at publish.', spoils: false, at: '2026-11-09T00:00:00Z' } });
  const b4 = [
    ...need(!nonAdmin.ok && nonAdmin.status === 403, 'a non-admin was let in'),
    ...need(!notMaker.ok && notMaker.status === 403, 'an admin who isn\'t the maker was let in'),
    ...need(!refused.ok && rowsAfterRefusal === 0, 'a refused backstory was written'),
    ...need(ok.ok && got?.text === story.text && got.spoils === true && Boolean(got.at), 'the backstory isn\'t read back'),
    ...need(after === before, 'the version, its id, its links or its recipe changed'),
    ...need(seen.length === 2 && seen.every((t) => t === story.text), `the check ran ${seen.length} times`),
    ...need(fromBody?.text === 'Written at publish.', 'a backstory in the body isn\'t read first'),
  ];
  // Planted: a writer that puts it in a new version (the lineage would move).
  await su(`insert into studio.element_versions (id, element_id, version_no, body) values ('79000000-0000-4000-8000-000000000009','71000000-0000-4000-8000-000000000001',2,'{"backstory":{"text":"x"}}')`);
  const planted = need((await snapshot()) === before, 'a new version was written');
  proven('B4 "Add backstory": one row, the version, id, links and recipe unchanged; non-admin and non-maker refused; the check runs, a refusal writes nothing', b4, planted);

  // B5: the check, with the guard mocked: 1,200 tokens, after the blocked names; its refusal words.
  const { checkBackstory } = await import('../src/lib/challenge/backstories');
  const realFetch = globalThis.fetch;
  const groq = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'stand-in-not-a-key';
  const sent: { max: number; user: string }[] = [];
  let verdict = '{"allow": true}';
  globalThis.fetch = (async (_u: string, init?: RequestInit) => {
    const j = JSON.parse(String(init?.body ?? '{}'));
    sent.push({ max: j.max_tokens, user: (j.messages ?? []).find((m: { role: string }) => m.role === 'user')?.content ?? '' });
    return new Response(JSON.stringify({ id: 'x', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: verdict }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  await sql`reset role`;
  const req = new Request('http://localhost/');
  const a = await checkBackstory(S, req, 'Zei found a new crew.');
  verdict = '{"allow": false, "category": "violence"}';
  const r = await checkBackstory(S, req, 'Something not allowed.');
  const blocked = await checkBackstory(S, req, 'Zei met Donald Trump.');
  globalThis.fetch = realFetch;
  process.env.GROQ_API_KEY = groq;
  const b5 = (s: typeof sent) => [
    ...need(a.ok && !r.ok && r.error === BACKSTORY_WORDING.refused && !blocked.ok, 'allowed, refused or blocked answers'),
    ...need(s.length === 2 && s.every((x) => x.max === IMAGES.designs.guardMaxTokens && IMAGES.designs.guardMaxTokens === 1200), `the check's budget: ${s.map((x) => x.max).join(', ')}`),
    ...need(!s.some((x) => /Trump/.test(x.user)), 'a blocked name reached the check'),
  ];
  proven('B5 the check is the prompt check with 1,200 tokens (mocked), after the blocked names; a refusal says "Change it, or publish without it."', b5(sent), b5(sent.map((x) => ({ ...x, max: 400 }))));
  await sql.end();
  await server.stop();
  await db.close();
}

console.log(`\ntest:backstory: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
