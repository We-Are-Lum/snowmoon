/**
 * Backstories and the characters' look lines (branch challenge-models, owner, 2026-11-09). Stand-ins only: the prompt
 * check is a mocked fetch; nothing is called or spent; the database is an in-memory Postgres (PGlite) with every
 * migration, the NEXT_ ones included. Each check runs on the real code and on a planted violation, which it must catch.
 *
 *   npm run test:backstory
 *
 *  B1 the box takes typed text up to 400 characters; nothing else.
 *  B2 no AI writes it: the box and its screens make no model call and put nothing in it (no hint as its value or
 *     placeholder); the only request is the publish or "Add backstory", which sends what was typed.
 *  B3 at publish (challenge pictures only) the check runs before anything is written, a refusal publishes nothing and
 *     lets the maker publish without it, and it goes into the version's body with the tick and when.
 *  B4 new pictures only (owner, 2026-11-09): no "Add backstory", no route, no table, no migration; a backstory is read
 *     from its version's body alone, and a picture without one shows none.
 *  B5 the check is the image prompt check with 1,200 tokens (mocked), after the blocked names.
 *  B6 the page shows it under the picture, "Invented by @maker, not from the book", with no spoiler tick or mark
 *     (owner, 2026-11-09: none on the challenge's pages).
 *  L1 each challenge character has exactly one look line, starting "Unless the change says otherwise: ";
 *  L2 none names a real person (blocked names), a studio, film or artist, and the check (mocked) is sent them in the
 *     prompt;
 *  L3 the prompt order: the change words, the reference line, the look line, the scene line, the style, the closing line,
 *     the suffix.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { CHALLENGE, IMAGES } from '../src/lib/config';
import { BACKSTORY_MAX, BACKSTORY_WORDING, readBackstory } from '../src/lib/challenge/backstory';
import { CHARACTER_LOOKS, LOOK_PREFIX, SCENE_LINE } from '../src/lib/challenge/looks';
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
  ...need((rb({ text: 'x'.repeat(BACKSTORY_MAX) }) as { backstory: { text: string } }).backstory.text.length === BACKSTORY_MAX, '400 characters are taken'),
  ...need(!rb({ text: 'x'.repeat(BACKSTORY_MAX + 1) }).ok, '401 characters are refused'),
  ...need(!rb({ text: 42 }).ok && !rb('just a string').ok, 'only typed text is taken'),
  ...need(JSON.stringify((rb({ text: 'a', spoils: true }) as { backstory: unknown }).backstory) === '{"text":"a"}', 'something besides the typed text is kept (a spoiler tick)'),
];
proven('B1 the box takes typed text up to 400 characters, nothing else', rules(readBackstory), rules(() => ({ ok: true, backstory: { text: 'x'.repeat(999), spoils: true } as never })));

// B2
const comp = read('src/components/challenge-backstory.tsx');
const preview = read('src/components/challenge-preview.tsx');
const noAi = (field: string, prev: string) => {
  const fieldPart = field.slice(field.indexOf('export function BackstoryField'), field.indexOf('export function BackstoryShown'));
  return [
    ...need(!/authFetch|fetch\(|complete\(|checkPrompt|suggest|generate/i.test(fieldPart), 'the box itself makes a request or asks a model'),
    ...need(!/placeholder=|value=\{[^}]*hints/.test(fieldPart) && /value=\{p\.text\}/.test(fieldPart), 'a hint is put in the box (as its value or placeholder)'),
    ...need((prev.match(/authFetch\(/g) ?? []).length === 2 && /api\/images\/publish/.test(prev) && /backstory = withStory && story\.trim\(\) \? \{ text: story \}/.test(prev), 'the preview sends something other than what was typed'),
    ...need(!/authFetch\(|fetch\(/.test(field), 'the backstory component makes a request'),
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
  ...need(!/spoil/i.test(comp) && !/spoil/i.test(JSON.stringify(BACKSTORY_WORDING)) && !/type="checkbox"/.test(comp), 'a spoiler tick or mark on the backstory'),
  ...need(src.indexOf('<BackstoryShown') > src.indexOf('</figure>') && src.indexOf('<BackstoryShown') < src.indexOf('ChallengeShareFirst path'), 'not under the picture'),
  ...need(BACKSTORY_WORDING.hints('Zei').join(' | ') === 'What changed for Zei? | Where are they now? | What do they want that they didn’t before?' && BACKSTORY_WORDING.label === 'Backstory', 'the approved words'),
];
proven('B6 the page shows it under the picture, "Invented by @maker, not from the book", with no spoiler tick or mark', shown(pictureComp), shown(pictureComp.replace('<BackstoryShown', '<Moved')));

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
  ...need(l.zei === 'Unless the change says otherwise: a man with light golden-tan skin and dark eyes.' && l.mu === 'Unless the change says otherwise: a woman with medium brown skin and thin red-framed glasses.', 'the lines aren\'t the owner\'s, exactly (2026-11-09)'),
  ...need(SCENE_LINE === 'Unless the change says otherwise: one figure, in a scene that suits the change, not a character sheet.' && blockedName(SCENE_LINE) === null, 'the scene line isn\'t the owner\'s, exactly'),
];
proven('L1 L2 one look line per challenge character, each "Unless the change says otherwise: …", none naming a real person, studio, film or artist', looks(CHARACTER_LOOKS), looks({ ...CHARACTER_LOOKS, mu: 'Mu, drawn like a Pixar film character.' }));
const order = (prompt: string) => need(prompt === ['give her a red coat', 'Bai is the person in reference image 1, the main figure.', CHARACTER_LOOKS.bai, SCENE_LINE, 'soft pencil on pale paper', KEEP_LINE, IMAGES.suffix].join('\n\n'), `the prompt is ${JSON.stringify(prompt).slice(0, 200)}`);
const route = read('src/app/api/challenge/make/route.ts');
proven('L3 the prompt order: change words, reference line, look line, scene line (always), style, closing line, suffix (every model)', [...order(remixPrompt({ words: 'give her a red coat', name: 'Bai', look: CHARACTER_LOOKS.bai, style: 'soft pencil on pale paper' })), ...need(/remixPrompt\(\{ words: r\.words, name, look: lookFor\(src\.character\), style: style!\.text \}\)/.test(route), 'the route doesn\'t add the look line')], order(remixPrompt({ words: 'give her a red coat', name: 'Bai', style: 'soft pencil on pale paper' })));

// S1: "Same as this picture" (owner, 2026-11-09): the first choice and the default, no style text, recorded in the recipe.
{
  const M = await import('../src/lib/challenge/make');
  const ST = await import('../src/lib/challenge/styles');
  const src = { kind: 'sheet' as const, versionId: 'v', character: 'zei', url: 'u', sha256: 's', width: 1, height: 1, text: '', title: '', by: null, byFid: 1, versionNo: 1, moment: null, styleElement: 'e2' };
  const pub = [{ id: 'style:e2', label: 'Animated series', text: 'Animated series look: clean lines.', elementId: 'e2', versionId: 'v2', versionNo: 1, entity: 'Animated series', title: 'Animated series', byName: 'naaate', byFid: 6786, assist: null }];
  const makeScreen = read('src/components/challenge-make.tsx');
  const same = (resolve: typeof M.resolveStyle, screen: string) => {
    const r = resolve({ kind: 'same' }, pub as never);
    const prompt = M.remixPrompt({ words: 'a red scarf', name: 'Zei', look: CHARACTER_LOOKS.zei, style: r?.text ?? 'x' });
    return [
      ...need(M.makeView(src as never, { styles: pub as never }).defaultStyle === 'same', 'the default isn\'t "Same as this picture"'),
      ...need(r?.choice === 'same' && r.text === '' && r.label === 'Same as this picture', 'it adds style text, or isn\'t recorded as "same"'),
      ...need(prompt === ['a red scarf', 'Zei is the person in reference image 1, the main figure.', CHARACTER_LOOKS.zei, SCENE_LINE, KEEP_LINE, IMAGES.suffix].join('\n\n'), 'the prompt carries a style line, or its order changed'),
      ...need(JSON.stringify(ST.readStyleChoice({ kind: 'same' })) === '{"kind":"same"}', 'the request can\'t ask for it'),
      ...need(screen.indexOf('data-style="same"') > 0 && screen.indexOf('data-style="same"') < screen.indexOf('view.styles.map((s)') && /\{w\.sameStyle\}/.test(screen), 'it isn\'t the Style row\'s first chip'),
      ...need(/style: \{ choice: style\.choice/.test(route), 'the recipe doesn\'t record the style choice'),
    ];
  };
  proven('S1 "Same as this picture": first in the Style row, the default, adds no style line, recorded in the recipe; the prompt order otherwise unchanged', same(M.resolveStyle, makeScreen), same(((c: never, p: never) => M.resolveStyle({ kind: 'random' } as never, p)) as never, makeScreen));
}

// B4: new pictures only.
{
  const { existsSync } = await import('node:fs');
  const { backstoryOf } = await import('../src/lib/challenge/backstories');
  const only = (files: { route: boolean; migration: boolean; lib: string; picture: string }) => [
    ...need(!files.route && !files.migration, 'an "Add backstory" route or a backstories table is back'),
    ...need(!/challenge_backstories|addBackstory|AddBackstory/.test(files.lib + files.picture + comp), '"Add backstory" is still offered'),
    ...need(backstoryOf({ lettering: [], backstory: { text: 'Written at publish.', at: '2026-11-09T00:00:00Z' } })?.text === 'Written at publish.' && backstoryOf({ lettering: [] }) === null, 'a backstory isn\'t read from the body alone'),
  ];
  const lib = read('src/lib/challenge/backstories.ts');
  const real = only({ route: existsSync(path.join(ROOT, 'src/app/api/challenge/backstory/route.ts')), migration: existsSync(path.join(ROOT, 'supabase/migrations/NEXT_challenge_backstories.sql')), lib, picture: pictureComp });
  proven('B4 new pictures only: no "Add backstory", no route, no table; a backstory comes from its version\'s body', real, only({ route: true, migration: false, lib, picture: pictureComp }));
}

// B5: the check, on a local database (its costs are counted there).
{
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  const dir = path.join(ROOT, 'supabase/migrations');
  for (const f of [...readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(), ...readdirSync(dir).filter((f) => /^NEXT_.*\.sql$/.test(f)).sort()]) await db.exec(read(`supabase/migrations/${f}`));
  const PORT = 54391;
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
  type Sql = postgres.Sql;
  const S = sql as unknown as Sql;
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
