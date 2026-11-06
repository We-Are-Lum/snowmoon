/**
 * The remix challenge rethink: moments (branch challenge-moments, owner 2026-11-05; docs/proposals/challenge-moments.md).
 * Stand-ins only: no network, no paid call, no production database. Fails (exit 1) on any problem. Run by
 * `npm run test:challenge` after scripts/test-challenge.ts.
 *
 * R1, the hub:
 * - the six cards: every quote word for word at its block, one card per challenge character, about three first-layer
 *   facts from chapters 1-14 only, "Where they appear" in book order; the words are marked as this edition's;
 * - the fifteen moments (owner, answer 4): in the book's order, every quote word for word inside its passage;
 * - P9g (principle 9's challenge exception), P2m (cards and scene lines approved before public), P6ac (entries as
 *   pictures only once Terms and Privacy say so), each passing as committed and failing on its planted fault;
 * - the hub's data: the cards in CHALLENGE.characters' order, each with its moments ("Ch N"), the "Draft wording" mark
 *   while unapproved, no random block, first remixes only when they exist; and after the close, no deeper layer and no
 *   moments; "Where they appear" sent only by its own API, only for the six, only while the exception holds.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { CHALLENGE, IMAGES } from '../src/lib/config';
const IMAGES_IDS = [IMAGES.model.id, IMAGES.editModel.id];

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
}
const clone = <T>(v: T): T => structuredClone(v);

const { CARDS, cardQuotes, cardShapeProblems, FIRST_LAYER_MAX_CHAPTER } = await import('../src/lib/challenge/cards');
const { MOMENTS, momentShapeProblems, inBookOrder, chapterChip, momentsWith } = await import('../src/lib/challenge/moments');
const { quoteProblems } = await import('../src/lib/challenge/book-quotes');
const { loadBlocks } = await import('./lib/glossary');
const { p9gProblems, p2mProblems, p6acProblems } = await import('./lib/challenge-moments');
const { spoilerExceptionOn } = await import('../src/lib/challenge/spoilers');
const { TERMS, PRIVACY } = await import('../src/lib/legal');
const blocks = loadBlocks(ROOT);
const momentQuotes = (ms: typeof MOMENTS) => ms.flatMap((m) => m.quotes.map((q) => ({ where: `moment ${m.id}`, block: q.block, text: q.text })));

// --- The cards (owner, 2026-11-05, answer 2) ------------------------------------------------------------------------
{
  const qs = cardQuotes();
  check('cards: every quote is word for word at its block', quoteProblems(qs, blocks).length === 0, quoteProblems(qs, blocks).join('; '));
  check('cards: one per challenge character, about three first-layer facts each, from chapters 1-14, passages in book order', cardShapeProblems(CARDS, CHALLENGE.characters).length === 0, cardShapeProblems(CARDS, CHALLENGE.characters).join('; '));
  check(`cards: the first layer stops at chapter ${FIRST_LAYER_MAX_CHAPTER}`, FIRST_LAYER_MAX_CHAPTER === 14);
  check('cards: every card has a fuller description, more facts and at least four passages', CARDS.every((c) => c.more.description.length > 80 && c.more.facts.length >= 2 && c.appears.length >= 4));
  check('cards: the look is never described as the book\'s', CARDS.every((c) => !/\b(canon|official)\b/i.test(c.line + c.more.description)));
  const changed = clone(CARDS) as typeof CARDS extends readonly (infer T)[] ? T[] : never;
  changed[0].facts[0].quote = changed[0].facts[0].quote.replace('programming', 'computer');
  proof('a card quote with one word changed fails', quoteProblems(cardQuotes(changed), blocks).length > 0);
  const deep = clone(CARDS) as typeof changed;
  deep[2].facts[0] = { text: 'Second place', block: 'c24-b48', quote: 'I got second place in the Pafogai Du Minpentai games' };
  proof('a first-layer fact from chapter 24 fails', cardShapeProblems(deep, CHALLENGE.characters).length > 0);
  const nothing = clone(CARDS) as typeof changed;
  nothing[1].facts[0].quote = '';
  proof('a fact that cites nothing fails', cardShapeProblems(nothing, CHALLENGE.characters).length > 0);
  const missing = clone(CARDS).slice(1) as typeof changed;
  proof('a challenge character without a card fails', cardShapeProblems(missing, CHALLENGE.characters).length > 0);
  const wrongBlock = clone(CARDS) as typeof changed;
  wrongBlock[0].appears[0].block = 'c2-b3';
  proof('a passage quoted at the wrong block fails', quoteProblems(cardQuotes(wrongBlock), blocks).length > 0);
}

check('config: a current default look per challenge character, each a design id or not set yet', CHALLENGE.characters.every((c) => c in CHALLENGE.defaultLooks && (CHALLENGE.defaultLooks[c] === null || /^[0-9a-f-]{36}$/i.test(CHALLENGE.defaultLooks[c]!))) && Object.keys(CHALLENGE.defaultLooks).every((k) => CHALLENGE.characters.includes(k)));
{
  const { REHEARSAL_DEFAULT_LOOKS, REHEARSAL_BASE_IDS } = await import('../src/lib/challenge/rehearsal-switch');
  check('rehearsal: Deluin\'s and Gladias\' default looks are their look b (the third stand-in base)', REHEARSAL_DEFAULT_LOOKS.deluin === REHEARSAL_BASE_IDS.deluin[2] && REHEARSAL_DEFAULT_LOOKS.gladias === REHEARSAL_BASE_IDS.gladias[2]);
}

// --- The moments (owner, 2026-11-05, answer 4: all fifteen, no reserves) --------------------------------------------
{
  check('moments: fifteen at launch', MOMENTS.length === 15, String(MOMENTS.length));
  check('moments: in the book\'s order, each quote inside its passage, each with a challenge character, a title and a scene line', momentShapeProblems(MOMENTS, CHALLENGE.characters).length === 0, momentShapeProblems(MOMENTS, CHALLENGE.characters).join('; '));
  check('moments: every quote is word for word at its block', quoteProblems(momentQuotes(MOMENTS), blocks).length === 0, quoteProblems(momentQuotes(MOMENTS), blocks).join('; '));
  check('moments: every challenge character is in at least two', CHALLENGE.characters.every((c) => momentsWith(c).length >= 2), CHALLENGE.characters.map((c) => `${c} ${momentsWith(c).length}`).join(', '));
  check('moments: every chip says its chapter ("Ch N")', MOMENTS.every((m) => chapterChip(m) === `Ch ${m.chapter}`));
  check('moments: titles name no major turn of the book (spot list)', !MOMENTS.some((m) => /\b(dies|dead|alive|traitor|Delwart|Lily|rescued|freed|wins|lost)\b/i.test(m.title)));
  const swapped = clone(MOMENTS) as typeof MOMENTS extends readonly (infer T)[] ? T[] : never;
  [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
  proof('moments out of the book\'s order fail', !inBookOrder(swapped) && momentShapeProblems(swapped).length > 0);
  const word = clone(MOMENTS) as typeof swapped;
  word[2].quotes[0].text = word[2].quotes[0].text.replace('shine', 'win');
  proof('a moment quote with one word changed fails', quoteProblems(momentQuotes(word), blocks).length > 0);
  const outside = clone(MOMENTS) as typeof swapped;
  outside[0].quotes[0].block = 'c1-b4';
  proof('a quote outside its passage fails', momentShapeProblems(outside).length > 0);
  check('moments: never sorted anywhere in the challenge code (their order is the book\'s)', !walk('src').some((f) => /MOMENTS[^;\n]*\.sort\(|momentsWith\([^)]*\)\.sort\(/.test(read(f))));
}

// --- P9g, P2m, P6ac -------------------------------------------------------------------------------------------------
{
  const files = walk('src').map((f) => ({ file: f, text: read(f) }));
  const base = { files, cards: CARDS, moments: MOMENTS, characters: CHALLENGE.characters, blocks, on: spoilerExceptionOn, dates: CHALLENGE.dates };
  const p9 = p9gProblems(base);
  check('P9g passes as committed', p9.length === 0, p9.join('; '));
  const plant = (f: string, g: (x: string) => string) => files.map((x) => (x.file === f ? { ...x, text: g(x.text) } : x));
  proof('P9g: a deeper layer without "May spoil later chapters." fails', p9gProblems({ ...base, files: plant('src/components/challenge-card.tsx', (x) => x.replace('<p className="cc-spoil">{w.spoil}</p>', '')) }).length > 0);
  proof('P9g: the spoil line changed fails', p9gProblems({ ...base, files: plant('src/lib/challenge/landing-wording.ts', (x) => x.replace("spoil: 'May spoil later chapters.'", "spoil: 'More below.'")) }).length > 0);
  proof('P9g: a moment chip without its chapter fails', p9gProblems({ ...base, files: plant('src/components/challenge-card.tsx', (x) => x.replaceAll('{m.title} <span className="cc-chip-ch">· {m.chip}</span>', '{m.title}')) }).length > 0);
  proof('P9g: the cards\' words imported on a sheet page fail', p9gProblems({ ...base, files: [...files, { file: 'src/app/references/designs/[id]/planted.tsx', text: "import { CARDS } from '~/lib/challenge/cards';" }] }).length > 0);
  proof('P9g: an exception that doesn\'t end at the close fails', p9gProblems({ ...base, on: () => true }).length > 0);
  proof('P9g: the deeper layers kept after the close fail', p9gProblems({ ...base, files: plant('src/lib/challenge/view.ts', (x) => x.replace('more: spoilers ?', 'more: true ?')) }).length > 0);
  proof('P9g: passages served for anyone, not only the six, fail', p9gProblems({ ...base, files: plant('src/app/api/challenge/appears/route.ts', (x) => x.replace('CHALLENGE.characters.includes(slug)', 'true')) }).length > 0);
  check('P9g: the exception holds until the close and ends at it', spoilerExceptionOn(new Date(Date.parse(CHALLENGE.dates.closes) - 1)) && !spoilerExceptionOn(new Date(Date.parse(CHALLENGE.dates.closes))));

  const c = { public: CHALLENGE.public, cardsApproved: CHALLENGE.cardsApproved, sceneLinesApproved: CHALLENGE.sceneLinesApproved };
  check('P2m: as committed, the cards and scene lines aren\'t approved and /challenge isn\'t public', !c.public && !c.cardsApproved && !c.sceneLinesApproved && p2mProblems(c, files).length === 0, p2mProblems(c, files).join('; '));
  proof('P2m: public with the cards unapproved fails', p2mProblems({ ...c, public: true, sceneLinesApproved: true }, files).length > 0);
  proof('P2m: public with the scene lines unapproved fails', p2mProblems({ ...c, public: true, cardsApproved: true }, files).length > 0);
  check('P2m: public once both are approved passes', p2mProblems({ public: true, cardsApproved: true, sceneLinesApproved: true }, files).length === 0);
  proof('P2m: an unapproved card without the Draft mark fails', p2mProblems(c, plant('src/lib/challenge/view.ts', (x) => x.replace('draft: CHALLENGE.cardsApproved ? null : W.draftShort', 'draft: null'))).length > 0);

  check('P6ac: entries as pictures are off as committed', CHALLENGE.pictureEntries === false && p6acProblems(CHALLENGE.pictureEntries, TERMS.sections, PRIVACY.sections).length === 0);
  proof('P6ac: turned on with today\'s Terms and Privacy fails', p6acProblems(true, TERMS.sections, PRIVACY.sections).length > 0);
  const terms = TERMS.sections.map((s) => (s.n === '6e' ? { ...s, body: ['… may remix pictures of its characters …'] } : s));
  const privacy = PRIVACY.sections.map((s) => (s.n === 4 ? { ...s, body: ['… for each picture of a challenge character you publish …'] } : s));
  check('P6ac: on, once Terms §6e and Privacy §4 say so, passes', p6acProblems(true, terms, privacy).length === 0);
  proof('P6ac: Terms saying it but not Privacy fails', p6acProblems(true, terms, PRIVACY.sections).length > 0);
}

// --- The hub's data (R1) --------------------------------------------------------------------------------------------
{
  const V = await import('../src/lib/challenge/view');
  const v = await V.challengeView(null);
  check('hub: the cards in CHALLENGE.characters\' order', v.cards.map((x) => x.c.slug).join() === CHALLENGE.characters.join(), v.cards.map((x) => x.c.slug).join());
  check('hub: no random-remixes block (owner, answer 9)', !('remixes' in v) && !('pick' in v));
  check('hub: every card carries the "Draft wording" mark while unapproved', v.cards.every((x) => x.c.draft === 'Draft wording'));
  check('hub: every card has its line, about three facts with the book\'s words and their blocks, and its moments', v.cards.every((x) => x.c.line && x.c.facts.length >= 2 && x.c.facts.every((f) => f.quote && /^c\d+-b\d+$/.test(f.block) && f.href.startsWith('/chapter/')) && x.c.moments.length >= 2));
  check('hub: moment chips are the character\'s moments, in book order, each with "Ch N"', v.cards.every((x) => x.c.moments.map((m) => m.id).join() === momentsWith(x.c.slug).map((m) => m.id).join() && x.c.moments.every((m) => /^Ch \d+$/.test(m.chip))));
  check('hub: the moments say whose list it is', v.cards.every((x) => x.w.moments === 'Moments picked by @naaate'));
  check('hub: the second layer says it may spoil, and "Where they appear" isn\'t in the page\'s data', v.cards.every((x) => x.w.spoil === 'May spoil later chapters.' && x.c.more !== null && !('appears' in x.c)));
  check('hub: the look is marked as this edition\'s, and the line and description as its summary', v.cards.every((x) => x.w.look === 'Look invented by this edition: the book doesn’t describe it.' && x.w.summary === 'This edition’s summary'));
  check('hub: no first remixes, no heading (none exist yet)', v.cards.every((x) => x.c.firsts.length === 0));
  check('hub: the one line says what to do', /^Pick a character\. Tap a picture to remix it\. Entries /.test(v.line), v.line);
  // After the close: no deeper layer and no moments.
  const keep = { ...CHALLENGE.dates };
  CHALLENGE.dates.opens = '2026-01-01T00:00:00Z';
  CHALLENGE.dates.closes = '2026-01-02T00:00:00Z';
  const after = await V.challengeView(null);
  check('hub after the close: no deeper layer and no moments (P9g)', after.cards.every((x) => x.c.more === null && x.c.moments.length === 0));
  Object.assign(CHALLENGE.dates, keep);

  // "Where they appear": its own API, the six only, the book's words, only while the exception holds.
  const route = await import('../src/app/api/challenge/appears/route');
  const pub = CHALLENGE.public;
  CHALLENGE.public = true;
  const get = (q: string) => route.GET(new Request(`http://localhost/api/challenge/appears?${q}`));
  const bai = await get('character=bai');
  const j = (await bai.json()) as { passages: { block: string; quote: string; chapter: number; href: string }[] };
  check('appears: Bai\'s passages, in book order, word for word', bai.status === 200 && j.passages.length === CARDS.find((c) => c.slug === 'bai')!.appears.length && quoteProblems(j.passages.map((p) => ({ where: 'api', block: p.block, text: p.quote })), blocks).length === 0);
  check('appears: not for a character outside the six', (await get('character=lektor')).status === 404 && (await get('character=')).status === 404);
  CHALLENGE.dates.opens = '2026-01-01T00:00:00Z';
  CHALLENGE.dates.closes = '2026-01-02T00:00:00Z';
  check('appears: not after the close', (await get('character=bai')).status === 404);
  Object.assign(CHALLENGE.dates, keep);
  CHALLENGE.public = false;
  check('appears: admins only while the challenge is admin-only', (await get('character=bai')).status === 404);
  CHALLENGE.public = pub;
}

// === R2: the moments remix flow, and entries as pictures =============================================================

// --- "Surprise me" draws only from the curated list, unweighted (P5g's fourth exception) ---------------------------
{
  const { p5gProblems, CHALLENGE_FILES } = await import('./lib/p5g');
  const files = walk('src').filter((f) => CHALLENGE_FILES.test(f)).map((f) => ({ file: f, text: read(f) }));
  const plantIn = (file: string, f: (x: string) => string) => files.map((x) => (x.file === file ? { ...x, text: f(x.text) } : x));
  check('P5g passes with "Surprise me" (all fifteen but the one chosen, unweighted)', p5gProblems(files).length === 0, p5gProblems(files).join('; '));
  const make = read('src/components/challenge-make.tsx');
  check('"Surprise me" is the P5g shuffle over the list the server sent, minus the moment chosen', /const next = shuffleFresh\(MOMENTS\.filter\(\(m\) => m\.id !== moment\)\)\[0\];/.test(make) && /const MOMENTS = view && view !== 'missing' \? view\.moments : \[\];/.test(make));
  proof('P5g: "Surprise me" weighted toward early chapters fails', p5gProblems(plantIn('src/components/challenge-make.tsx', (x) => x.replace('const next = shuffleFresh(MOMENTS.filter((m) => m.id !== moment))', 'const next = shuffleFresh(MOMENTS.filter((m) => m.id !== moment && m.chip < "Ch 15"))'))).length > 0);
  proof('P5g: "Surprise me" drawing from outside the list fails', p5gProblems(plantIn('src/components/challenge-make.tsx', (x) => x.replace('const next = shuffleFresh(MOMENTS.filter((m) => m.id !== moment))', 'const next = shuffleFresh(everyBlock)'))).length > 0);
  proof('P5g: the moments sorted by popularity fail', p5gProblems(plantIn('src/lib/challenge/moments.ts', (x) => x.replace('export const momentById', 'export const byUse = (l: Moment[]) => [...l].sort((a, b) => a.chapter - b.chapter);\nexport const momentById'))).length > 0);
  // The draw itself: over many draws, each of the other fourteen comes up about equally (the same shuffle, seeded).
  const { shuffleFresh } = await import('../src/lib/challenge/shuffle');
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31);
  const counts = new Map<string, number>();
  const chosen = MOMENTS[0].id;
  for (let i = 0; i < 28_000; i++) {
    const next = shuffleFresh(MOMENTS.filter((m) => m.id !== chosen), rnd)[0];
    counts.set(next.id, (counts.get(next.id) ?? 0) + 1);
  }
  const worst = Math.max(...[...counts.values()].map((c) => Math.abs(c / 28_000 - 1 / 14)));
  check('"Surprise me": each of the other fourteen about equally often, never the one chosen, never outside the list', counts.size === 14 && !counts.has(chosen) && worst < 0.01, `worst ${worst.toFixed(4)}`);
  check('the remix screen\'s data sends all fifteen, in the book\'s order', (await import('../src/lib/challenge/make')).momentChips().map((m) => m.id).join() === MOMENTS.map((m) => m.id).join());
}

// --- The prompt and the request ---------------------------------------------------------------------------------------
{
  const M = await import('../src/lib/challenge/make');
  const m = MOMENTS.find((x) => x.id === 'c7-b49-toast')!;
  const others = M.othersIn(m, 'bai');
  const prompt = M.momentPrompt({ words: 'make her grin', name: 'Bai', scene: m.scene, others: ['Zei', 'Mu'] });
  check('the prompt: the person\'s words first, Bai as reference image 1 in front, the others as images 2 and 3 behind, the scene line, no lettering', prompt.startsWith('make her grin\n\nBai is the person in reference image 1, the main figure') && prompt.includes('Zei is the person in reference image 2, behind Bai') && prompt.includes('Mu is the person in reference image 3') && prompt.includes(m.scene) && others.join() === 'zei,mu' && prompt.endsWith('No text, no lettering, no signs with words.'));
  check('the prompt never carries the moment\'s quote (shown, not sent)', !m.quotes.some((q) => prompt.includes(q.text)));
  check('multi-character: it counts for the character remixed; at most two others, each by their current default look (answer 10)', MOMENTS.every((x) => M.othersIn(x, x.characters[0]).length <= 2) && /defaultLook\(sql, slug\)/.test(read('src/app/api/challenge/make/route.ts')));
  check('a request needs a version, one of the fifteen moments and words', !M.readMake({}).ok && !M.readMake({ from: randomUUID(), moment: 'c99-b1-x', words: 'a' }).ok && !M.readMake({ from: randomUUID(), moment: m.id, words: '  ' }).ok && M.readMake({ from: randomUUID(), moment: m.id, words: 'a' }).ok);
  proof('a moment outside the list is refused', !M.readMake({ from: randomUUID(), moment: 'c30-b47-dog', words: 'x' }).ok);
}

// --- Navigation (owner, 2026-11-05: one URL per step, back one step, ✕ to the card, words kept, publish replaces) -------
{
  const make = read('src/components/challenge-make.tsx');
  const prev = read('src/components/challenge-preview.tsx');
  const pic = read('src/components/challenge-picture.tsx');
  const card = read('src/components/challenge-card.tsx');
  check('nav: a picture on the hub opens its remix screen (/challenge/make?from=…), a remix keeps its moment', /export const remixHref = \(versionId: string, moment\?: string \| null\) => `\/challenge\/make\?from=\$\{versionId\}/.test(read('src/lib/challenge/view.ts')) && /href=\{t\.href\}/.test(card));
  check('nav: choosing a moment replaces the URL (no history per tap)', /router\.replace\(`\/challenge\/make\?from=\$\{from\}&moment=/.test(make) && !/router\.push\(`\/challenge\/make\?from/.test(make));
  check('nav: Make it pushes the preview, its own URL', /router\.push\(`\/challenge\/make\/\$\{draft\.id\}`\)/.test(make));
  check('nav: ‹ Back is one step (the browser\'s back) on the remix screen and the preview', /onClick=\{\(\) => router\.back\(\)\}/.test(make) && /onClick=\{\(\) => router\.back\(\)\}/.test(prev));
  check('nav: ✕ goes to the hub at the character\'s card, asking once on the preview when unpublished', /const hub = `\/challenge#\$\{view\.source\.character\}`/.test(make) && /window\.confirm\(w\.leave\)/.test(prev) && /const hub = `\/challenge#\$\{v\.character\}`/.test(pic) && /id=\{c\.slug\}/.test(card));
  check('nav: the words are kept for the picture in this tab, and found again going back', /sessionStorage\.setItem\(flowKeys\(from\)\.words, words\)/.test(make) && /setWords\(sessionStorage\.getItem\(k\.words\) \?\? ''\)/.test(make));
  check('nav: Publish replaces the preview with the published picture\'s page, and the remix screen then goes to the hub', /router\.replace\(`\/challenge\/p\/\$\{out\.versionId\}`\)/.test(prev) && /markPublished\(d, out\.versionId\)/.test(prev) && /sessionStorage\.getItem\(k\.published\)/.test(make));
  check('nav: no crumb into References on the flow', ![make, prev, pic].some((x) => /\/references\/designs/.test(x)));
  check('the remix screen\'s box is empty, with the placeholder, and carries the publication line (P1f)', /<PublishedTextField id="mk-words" label=\{w\.wordsLabel\} value=\{words\}/.test(make) && /placeholder=\{w\.wordsPlaceholder\}/.test(make) && /wordsPlaceholder: 'Describe what to change'/.test(read('src/lib/challenge/make-wording.ts')));
  check('the remix screen names the model and its maker, with room for the model choice', /data-slot="model-choice"/.test(make) && /FLUX\.2 \[klein\] 4B · Black Forest Labs · open/.test((await import('../src/lib/challenge/make-wording')).MAKE_WORDING.modelChip));
  check('no script served to everyone imports the flow\'s words', ![make, prev, pic, read('src/components/challenge-flow-gate.tsx')].some((x) => /challenge\/(make-|picture-|landing-)?wording'/.test(x)));
}

// --- Entries as pictures, in the database (PGlite; no migration: the challenge tables take any element version) -------
{
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(read(`supabase/migrations/${f}`));
  await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  const PORT = 54378;
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  const url = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  type Sql = postgres.Sql;
  const S = sql as unknown as Sql;
  const DS = await import('../src/lib/images/designs');
  const pic = (n: number) => ({ url: `https://pictures.example/${n}.jpg`, sha256: String(n).repeat(64).slice(0, 64), recipe: { prompt: 'p', model: 'flux2-klein-4b-edit', endpoint: 'e', host: 'fal.ai', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.003, made_at: new Date().toISOString(), width: 576, height: 768, checks: { prompt: { model: 'g', verdict: 'ok' as const }, host_safety_checker: 'passed' as const }, assist: null } });
  const sheet = (text: string, n: number) => ({ title: '', text, samples: [], views: { front: pic(n) }, by_name: 'x', by_name_source: 'relay' as const, assist: null, role: null, style: null });
  const base = await DS.makeDesign(S as never, { fid: 6786, mode: 'create', kind: 'character', character: DS.bookCharacter('bai')!, body: sheet('Bai base', 1) });
  const otherSheet = await DS.makeDesign(S as never, { fid: 6786, mode: 'create', kind: 'character', character: DS.bookCharacter('bai')!, body: sheet('Bai, not a base', 2) });
  const zeiBase = await DS.makeDesign(S as never, { fid: 6786, mode: 'create', kind: 'character', character: DS.bookCharacter('zei')!, body: sheet('Zei base', 3) });
  const keep = { bases: CHALLENGE.bases, dates: { ...CHALLENGE.dates }, pub: CHALLENGE.public, pictures: CHALLENGE.pictureEntries, entries: CHALLENGE.entries };
  CHALLENGE.bases = { ...CHALLENGE.bases, bai: [base.versionId], zei: [zeiBase.versionId] };
  CHALLENGE.dates.opens = new Date(Date.now() - 60_000).toISOString();
  CHALLENGE.dates.closes = new Date(Date.now() + 3_600_000).toISOString();
  CHALLENGE.public = true;
  CHALLENGE.entries = true;
  CHALLENGE.pictureEntries = true;
  await sql`insert into studio.check_decisions (network, account, threshold, passed) values ('farcaster', '500', 'neynar-score>=0.7', true), ('farcaster', '501', 'neynar-score>=0.7', true)`;
  // A picture published as /api/images/publish writes one: recipe (params.challenge), element, version, anchor, links.
  let n = 100;
  async function picture(p: { fid: number; character: string; moment: string; from: string; uses?: string; remixedFrom?: string }) {
    const m = MOMENTS.find((x) => x.id === p.moment);
    const recipeId = randomUUID(), elementId = randomUUID(), versionId = randomUUID();
    const sha = String(++n).padStart(64, '0');
    await sql.begin(async (tx) => {
      await tx`insert into studio.recipes ${tx({ id: recipeId, source: 'in_app', provider: 'fal.ai', model: 'flux2-klein-4b-edit', model_version: 'e', prompt: 'p', params: tx.json({ user_prompt: 'make it', by_name: `p${p.fid}`, anchor: { chapter: m?.chapter ?? 1, start: m?.start ?? 1, end: m?.end ?? 1 }, challenge: { character: p.character, moment: p.moment, scene: m?.scene ?? '', from: p.from, fromKind: p.uses ? 'sheet' : 'picture' } } as never), seed: 1, assist: null, cost_usd: 0.009, created_by_fid: p.fid })}`;
      await tx`insert into studio.elements ${tx({ id: elementId, work_id: 'snowmoon', element_type: 'image', created_by_fid: p.fid })}`;
      await tx`insert into studio.element_versions ${tx({ id: versionId, element_id: elementId, version_no: 1, body: tx.json({ lettering: [] } as never), asset_url: `https://media.example/${sha}.jpg`, asset_sha256: sha, recipe_id: recipeId })}`;
      await tx`insert into studio.anchors ${tx({ version_id: versionId, work_id: 'snowmoon', chapter: m?.chapter ?? 1, start_idx: m?.start ?? 1, end_idx: m?.end ?? 1 })}`;
      if (p.uses) await tx`insert into studio.links ${tx({ from_version_id: versionId, to_version_id: p.uses, kind: 'uses' })}`;
      if (p.remixedFrom) await tx`insert into studio.links ${tx({ from_version_id: versionId, to_version_id: p.remixedFrom, kind: 'remixed_from' })}`;
    });
    const Rec = await import('../src/lib/challenge/record');
    const r = await Rec.recordEligibility(sql, versionId, p.fid);
    return { versionId, elementId, recorded: r };
  }
  const fromBase = await picture({ fid: 500, character: 'bai', moment: 'c4-b129-symbol', from: base.versionId, uses: base.versionId });
  const fromRemix = await picture({ fid: 501, character: 'bai', moment: 'c31-b9-summit', from: fromBase.versionId, remixedFrom: fromBase.versionId });
  const fromNotBase = await picture({ fid: 501, character: 'bai', moment: 'c5-b58-lunch', from: otherSheet.versionId, uses: otherSheet.versionId });
  const scratch = await picture({ fid: 500, character: 'bai', moment: 'c4-b129-symbol', from: base.versionId });
  const badMoment = await picture({ fid: 500, character: 'bai', moment: 'c30-b47-dog', from: base.versionId, uses: base.versionId });
  const wrongBase = await picture({ fid: 500, character: 'bai', moment: 'c7-b49-toast', from: zeiBase.versionId, uses: zeiBase.versionId });
  const P = await import('../src/lib/challenge/pictures');
  const listed = await P.challengePictures(S);
  check('pictures: only valid moments and characters are challenge pictures, newest first', listed.length === 5 && !listed.some((p) => p.versionId === badMoment.versionId) && listed[0].versionId === wrongBase.versionId, listed.map((p) => p.moment).join());
  const counts = await P.picturesCount(S, listed);
  check('a picture from a base counts', counts.get(fromBase.versionId) === true);
  check('a picture remixed from a picture that counts, at another moment, counts', counts.get(fromRemix.versionId) === true);
  check('a picture from a sheet that isn\'t a base doesn\'t count', counts.get(fromNotBase.versionId) === false);
  check('a picture with no line (made from scratch) doesn\'t count', counts.get(scratch.versionId) === false);
  proof('a picture of Bai from Zei\'s base doesn\'t count for Bai', counts.get(wrongBase.versionId) === false);
  check('eligibility is decided once at publish, for counting pictures only', fromBase.recorded === 'stored' && fromRemix.recorded === 'stored' && fromNotBase.recorded === 'not-a-candidate' && scratch.recorded === 'not-a-candidate' && badMoment.recorded === 'not-a-candidate');
  // A sheet remix doesn't count while pictures are the entries (a planted sheet fork must not count).
  const fork = await DS.makeDesign(S as never, { fid: 500, mode: 'fork', kind: 'character', fromVersionId: base.versionId, body: sheet('Bai, a sheet remix', 9) });
  const E = await import('../src/lib/challenge/entries');
  const Rec = await import('../src/lib/challenge/record');
  check('a sheet remix gets no decision and isn\'t a candidate while pictures are the entries', (await Rec.recordEligibility(sql, fork.versionId, 500)) === 'not-a-candidate' && !(await E.windowVersions(S)).some((v) => v.versionId === fork.versionId));
  check('sheets go back to invitation only while pictures are the entries', !(await import('../src/lib/challenge/open-sheets')).challengeSheetsOpen());
  const wv = await E.windowVersions(S);
  check('the window\'s candidates are the pictures, with their moment as title', wv.length === 5 && wv.find((v) => v.versionId === fromBase.versionId)?.title === 'The quarterfinal' && wv.find((v) => v.versionId === fromBase.versionId)?.forked === true);
  check('a candidate picture\'s standing is "candidate" before Submit', (await E.versionStanding(S, fromBase.versionId))?.kind === 'candidate');
  // Submit, option B (the post's address pasted; the route reads it from its network and checks it links here).
  const L = await import('../src/lib/challenge/post-links');
  const post = (id: string, links: string[]) => ({ network: 'farcaster' as const, id: `0x${id.padEnd(40, '0')}`, handle: 'p500', at: new Date().toISOString(), url: `https://farcaster.xyz/p500/0x${id.padEnd(8, '0')}`, links, writer: { fid: 500 } });
  check('Submit B: a post linking to the picture\'s page (/challenge/p/<id>) is accepted as linking to it', L.linksToVersion({ links: [`https://snowmoon.party/challenge/p/${fromBase.versionId}`] }, fromBase.versionId));
  proof('Submit B: a post linking to another picture is refused', !L.linksToVersion({ links: [`https://snowmoon.party/challenge/p/${fromRemix.versionId}`] }, fromBase.versionId));
  const ok = await E.submitEntry(S, 500, fromBase.versionId, post('a1', [`https://snowmoon.party/challenge/p/${fromBase.versionId}`]) as never);
  check('Submit: the picture becomes an entry', ok.ok === true && (await E.versionStanding(S, fromBase.versionId))?.kind === 'entry', JSON.stringify(ok));
  const second = await picture({ fid: 500, character: 'bai', moment: 'c7-b104-final', from: base.versionId, uses: base.versionId });
  const again = await E.submitEntry(S, 500, second.versionId, post('a2', [`https://snowmoon.party/challenge/p/${second.versionId}`]) as never);
  check('one a day, unchanged: a second picture the same Pacific day is refused', again.ok === false && /today/.test((again as { why: string }).why));
  const notMine = await E.submitEntry(S, 501, second.versionId, post('a3', []) as never);
  check('only its maker may submit a picture', notMine.ok === false);
  const st = await E.standing(S);
  check('the entries: Bai has one entrant, the picture by 500', st.entries.length === 1 && st.entries[0].versionId === fromBase.versionId && st.entrants.get('bai') === 1);
  check('entries link to the picture\'s page', E.entryHref(fromBase.versionId) === `/challenge/p/${fromBase.versionId}`);
  // The remix screen's sources: a base, or a challenge picture; nothing else.
  check('sources: a base and a challenge picture can be remixed; a sheet that isn\'t a base, an unknown id and a hidden thing can\'t', (await P.sourceOf(S, base.versionId))?.kind === 'sheet' && (await P.sourceOf(S, fromRemix.versionId))?.kind === 'picture' && (await P.sourceOf(S, otherSheet.versionId)) === null && (await P.sourceOf(S, randomUUID())) === null);
  // The picture's page data.
  const V = await import('../src/lib/challenge/picture-view');
  const pv = await V.pictureView(S, second.versionId);
  check('a picture\'s page: its character and moment with its chapter, and Submit for its maker with the post text naming the moment', pv?.title === 'Bai · The championship final (Ch 7)' && pv.submit?.postText === 'Bai at The championship final, my remix for the Snowmoon Party remix challenge' && pv.w.signInLine === 'Sign in with Farcaster, Lens or Bluesky to enter.');
  // The feed (/challenge/remixes) with pictures as the entries: the challenge pictures, newest first, by character,
  // each linking to its page, with the viewer's own Newest / Shuffled order and no count.
  const RV = await import('../src/lib/challenge/remixes-view');
  const feed = await RV.remixesView(S, { character: null, before: null });
  const pics = await P.challengePictures(S);
  check('feed: every challenge picture, newest first, each linking to its page, with the moment as its title', feed.cards.map((c) => c.versionId).join() === pics.map((p) => p.versionId).join() && feed.cards.every((c) => c.href === `/challenge/p/${c.versionId}`) && feed.cards.some((c) => c.title === 'The quarterfinal') && feed.order !== null);
  const zeiFeed = await RV.remixesView(S, { character: 'zei', before: null });
  check('feed: the character filter shows that character\'s pictures only', zeiFeed.cards.length === 0 && (await RV.remixesView(S, { character: 'bai', before: null })).cards.every((c) => c.character === 'bai'));
  check('feed: no sheet remix in it while pictures are the entries', !feed.cards.some((c) => c.versionId === fork.versionId));
  // Current default looks (owner, answer 10): the config's sheet for the other characters in a moment; else the first base.
  const zeiB = await DS.makeDesign(S as never, { fid: 6786, mode: 'create', kind: 'character', character: DS.bookCharacter('zei')!, body: sheet('Zei, look b', 30) });
  CHALLENGE.bases = { ...CHALLENGE.bases, zei: [zeiBase.versionId, zeiB.versionId] };
  check('default look: without a setting, the first base', (await P.defaultLook(S, 'zei', { zei: null }))?.versionId === zeiBase.versionId);
  check('default look: the sheet the config names (look b), not the first base', (await P.defaultLook(S, 'zei', { zei: zeiB.versionId }))?.versionId === zeiB.versionId);
  const zeiFront = await DS.makeDesign(S as never, { fid: 6786, mode: 'create', kind: 'character', character: DS.bookCharacter('zei')!, body: sheet('Zei, current front (not a base)', 31) });
  check('default look: a current front that isn\'t one of the bases can be named (Bai\'s Garance front)', (await P.defaultLook(S, 'zei', { zei: zeiFront.versionId }))?.versionId === zeiFront.versionId);
  proof('default look: an id that is another character\'s sheet is not used', (await P.defaultLook(S, 'zei', { zei: base.versionId }))?.versionId !== base.versionId);
  check('the hub still shuffles every base: the default look sets no order there', /setBases\(c\.bases\.length > 1 \? shuffleFresh\(c\.bases\) : c\.bases\)/.test(read('src/components/challenge-card.tsx')) && !/defaultLook/.test(read('src/lib/challenge/view.ts')));
  // The make API (GET): the screen's data for a base; 404 for anything else. POST without a sign-in: 401 (P4a). The app's
  // own connection (db()) is a second one, and PGlite's socket server takes one at a time: this test's closes first.
  await sql.end();
  process.env.STUDIO_DATABASE_URL = url;
  const route = await import('../src/app/api/challenge/make/route');
  const g = await route.GET(new Request(`http://localhost/api/challenge/make?from=${base.versionId}`));
  const gj = (await g.json()) as { moments: unknown[]; source: { kind: string; character: string } };
  check('make API: the screen\'s data for a base (fifteen moments, Bai, a sheet)', g.status === 200 && gj.moments.length === 15 && gj.source.character === 'bai' && gj.source.kind === 'sheet');
  check('make API: 404 for a sheet that isn\'t a base', (await route.GET(new Request(`http://localhost/api/challenge/make?from=${otherSheet.versionId}`))).status === 404);
  check('make API: Make it without signing in is refused (401)', (await route.POST(new Request('http://localhost/api/challenge/make', { method: 'POST', body: '{}' }))).status === 401);
  delete process.env.STUDIO_DATABASE_URL;
  // Back as committed.
  CHALLENGE.bases = keep.bases;
  Object.assign(CHALLENGE.dates, keep.dates);
  CHALLENGE.public = keep.pub;
  CHALLENGE.entries = keep.entries;
  CHALLENGE.pictureEntries = keep.pictures;
  await (await import('../src/lib/db')).db()?.end();
  await server.stop();
}

// === R3: share first on the published picture's page ==================================================================
{
  const pic = read('src/components/challenge-picture.tsx');
  const sf = read('src/components/challenge-share-first.tsx');
  const at = (x: string) => pic.indexOf(x);
  check('share first: the post buttons come right after the picture, before Submit and before the picture\'s title', at('<ChallengeShareFirst') > at('</figure>') && at('<ChallengeShareFirst') < at('<ChallengeSubmit') && at('<ChallengeShareFirst') < at('<h1 className="mk-title">'));
  check('share first: its maker sees "Published. Now post it:", others "Post it"', /head: mine \? v\.w\.published : v\.w\.shareHead/.test(pic));
  check('share first: Farcaster (composeCast in the app), Bluesky, Lens and Copy link, each its network\'s own compose page', /sdk\.actions\.composeCast\(\{ text: w\.text, embeds: \[link\] \}\)/.test(sf) && /https:\/\/farcaster\.xyz\/~\/compose/.test(sf) && /https:\/\/bsky\.app\/intent\/compose/.test(sf) && /https:\/\/hey\.xyz\/\?/.test(sf) && /navigator\.clipboard\.writeText\(link\)/.test(sf));
  check('share first: the ready post is shown as it will be filled in (the text and this page\'s link)', /“\{w\.text\}” <span className="sf-link">\{link\}<\/span>/.test(sf) && /const link = `\$\{origin\}\$\{path\}`/.test(sf));
  check('share first: no script or request of the networks on our page (plain links; P6a)', !/<script|fetch\(/.test(sf));
  check('Submit B on the page: only the address and Submit (the buttons are above), with a cast just made handed to it', /<ChallengeSubmit\s+versionId=\{v\.versionId\}\s+byFid=\{v\.byFid\}\s+words=\{v\.submit\}\s+path=\{path\}\s+compact\s+castHash=\{castHash\}/.test(pic) && /\{!compact && \(/.test(read('src/components/challenge-submit.tsx')));
  check('"Then submit it as an entry · one a day", and the owner\'s one line with "Rules" (no other rules text)', /\{v\.w\.thenSubmit\} <span className="dz-muted">· \{v\.w\.oneADay\}<\/span>/.test(pic) && /\{v\.w\.signInLine\} <Link href="\/challenge\/rules">\{v\.w\.rules\}<\/Link>/.test(pic));
  const W = (await import('../src/lib/challenge/picture-wording')).PICTURE_WORDING;
  check('the words: "Published. Now post it:", "Then submit it as an entry", "one a day", the sign-in line as the owner wrote it', W.published === 'Published. Now post it:' && W.thenSubmit === 'Then submit it as an entry' && W.oneADay === 'one a day' && W.signInLine === 'Sign in with Farcaster, Lens or Bluesky to enter.');
  check('the ready post names the character and the moment', W.postText('Bai', 'The quarterfinal') === 'Bai at The quarterfinal, my remix for the Snowmoon Party remix challenge');
  check('no script served to everyone imports the share words', !/challenge\/(picture-)?wording'/.test(sf + pic));
}

// === Launch: Midjourney on the model list, the label on the page, the unpublished style ===============================
{
  const models = (JSON.parse(read('config/models.json')) as { models: { id: string; open_weights?: boolean; maker?: string; offered?: boolean; license_line?: string }[] }).models;
  const mj = models.find((m) => m.id === 'midjourney');
  check('models: Midjourney is listed as a closed model by Midjourney, with its licence line', mj?.open_weights === false && mj.maker === 'Midjourney' && Boolean(mj.license_line));
  check('models: Midjourney is never offered (offered: false; not the site\'s image or edit model)', mj?.offered === false && IMAGES_IDS.every((id) => id !== 'midjourney'));
  const named = walk('src').filter((f) => /['"`]midjourney['"`]/i.test(read(f)));
  check('models: no page, API or picker on the site names Midjourney as a model to use', named.length === 0, named.join());
  const { howMade, recipeLabel, unpublishedStyle } = await import('../src/lib/images/recipe-lines');
  const LABEL = "Made with Midjourney, a closed model by Midjourney, outside the site · recipe reported by its maker; it can't be re-run exactly";
  const r = { model: 'midjourney', endpoint: 'Midjourney v7, outside the site', host: 'Midjourney (outside the site)', settings: { label: LABEL }, seed: null, request_id: null, cost_usd: 0, made_at: '2026-11-05T00:00:00Z', checks: null };
  const line = howMade(r, 'a'.repeat(64), null, true).map((x) => x.text).join('');
  check('the recipe line shows the approved Midjourney label word for word, after the model line, with "a closed model by Midjourney"', line.includes(`${LABEL}.`) && line.indexOf(LABEL) > line.indexOf('a closed model by Midjourney') && recipeLabel(r) === LABEL);
  proof('a recipe without the label shows none', !howMade({ ...r, settings: {} }, 'a'.repeat(64), null, true).map((x) => x.text).join('').includes('Made with Midjourney'));
  check('a style that isn\'t published: the recipe line says so, and links nowhere', /isn’t published as a style on the site/.test(howMade({ ...r, style: { title: 'Animated series', version_id: 'not published as a style on the site (…)' } }, 'a'.repeat(64), null, true).map((x) => x.text).join('')) && unpublishedStyle({ style: { title: 'Mood', version_id: '712ca63f-de6e-46bf-b3ad-7007b1120e16' } }) === null);
  check('the sheet page shows the recipe line (howMade) and links a style only from body.style', /howMade\(p\.recipe,/.test(read('src/app/references/designs/[id]/page.tsx')) && /\{!style && body\.style && \(/.test(read('src/app/references/designs/[id]/page.tsx')));
}

if (failures.length) {
  console.error(`CHALLENGE MOMENTS TESTS FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`challenge moments: ${passed} checks pass`);
