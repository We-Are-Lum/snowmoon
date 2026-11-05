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
import { CHALLENGE } from '../src/lib/config';

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

if (failures.length) {
  console.error(`CHALLENGE MOMENTS TESTS FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`challenge moments: ${passed} checks pass`);
