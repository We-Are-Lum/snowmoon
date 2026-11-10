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
const IMAGES_IDS: string[] = [IMAGES.model.id, IMAGES.editModel.id];

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
  // On the challenge's pages nothing is marked as a spoiler (owner, 2026-11-09), and the reader's own gating stays.
  proof('P9g: "May spoil later chapters." back on a challenge picture\'s backstory fails', p9gProblems({ ...base, files: plant('src/components/challenge-backstory.tsx', (x) => x + "\nexport const SPOIL = 'May spoil later chapters.';") }).length > 0);
  proof('P9g: a sheet\'s "What the book says" no longer gated by the chapters opened fails', p9gProblems({ ...base, files: plant('src/components/design-book.tsx', (x) => x.replace('quotes.filter((q) => q.chapter <= furthest)', 'quotes')) }).length > 0);
  check('no challenge wording or component carries a spoiler mark', !files.filter((x) => /^src\/(lib\/challenge|app\/challenge|components\/challenge-)/.test(x.file)).some((x) => /May spoil later chapters/.test(x.text)));
  // The simpler challenge (owner, 2026-11-08): a card's one line only, and the moments only while CHALLENGE.moments is on.
  proof('P9g: a card showing its second layer again (its description) fails', p9gProblems({ ...base, files: plant('src/components/challenge-card.tsx', (x) => x.replace('{c.line} <span className="cc-mark">', '{c.line} {c.more.description} <span className="cc-mark">')) }).length > 0);
  proof('P9g: a card fetching "Where they appear" again fails', p9gProblems({ ...base, files: plant('src/components/challenge-card.tsx', (x) => x + "\nconst appears = () => fetch('/api/challenge/appears?character=zei');") }).length > 0);
  proof('P9g: the pages\' data carrying facts fails', p9gProblems({ ...base, files: plant('src/lib/challenge/view.ts', (x) => x.replace("line: cardOf(slug)?.line ?? ''", "line: cardOf(slug)?.line ?? '', facts: cardOf(slug)?.facts")) }).length > 0);
  proof('P9g: the pages\' data carrying the moments fails', p9gProblems({ ...base, files: plant('src/lib/challenge/view.ts', (x) => x.replace("import { cardOf } from './cards';", "import { cardOf } from './cards';\nimport { momentsWith } from './moments';")) }).length > 0);
  proof('P9g: the remix screen sent the moments whatever the switch says fails', p9gProblems({ ...base, files: plant('src/lib/challenge/make.ts', (x) => x.replace('moments: momentsOn ? momentChips() : []', 'moments: momentChips()')) }).length > 0);
  proof('P9g: a moment chip on the remix screen without its chapter fails', p9gProblems({ ...base, files: plant('src/components/challenge-make.tsx', (x) => x.replaceAll('{m.title} <span className="cc-chip-ch">· {m.chip}</span>', '{m.title}')) }).length > 0);
  proof('P9g: the cards\' words imported on a sheet page fail', p9gProblems({ ...base, files: [...files, { file: 'src/app/references/designs/[id]/planted.tsx', text: "import { CARDS } from '~/lib/challenge/cards';" }] }).length > 0);
  proof('P9g: an exception that doesn\'t end at the close fails', p9gProblems({ ...base, on: () => true }).length > 0);
  proof('P9g: passages served for anyone, not only the six, fail', p9gProblems({ ...base, files: plant('src/app/api/challenge/appears/route.ts', (x) => x.replace('CHALLENGE.characters.includes(slug)', 'true')) }).length > 0);
  check('P9g: the exception holds until the close and ends at it', spoilerExceptionOn(new Date(Date.parse(CHALLENGE.dates.closes) - 1)) && !spoilerExceptionOn(new Date(Date.parse(CHALLENGE.dates.closes))));

  const c = { public: CHALLENGE.public, cardsApproved: CHALLENGE.cardsApproved, sceneLinesApproved: CHALLENGE.sceneLinesApproved };
  check('P2m: as committed, the cards and scene lines are approved (owner, 2026-11-06) and /challenge is public (the owner\'s flip)', c.public && c.cardsApproved && c.sceneLinesApproved && p2mProblems(c, files).length === 0, p2mProblems(c, files).join('; '));
  proof('P2m: public with the cards unapproved fails', p2mProblems({ public: true, cardsApproved: false, sceneLinesApproved: true }, files).length > 0);
  proof('P2m: public with the scene lines unapproved fails', p2mProblems({ public: true, cardsApproved: true, sceneLinesApproved: false }, files).length > 0);
  check('P2m: public once both are approved passes', p2mProblems({ public: true, cardsApproved: true, sceneLinesApproved: true }, files).length === 0);
  proof('P2m: an unapproved card without the Draft mark fails', p2mProblems(c, plant('src/lib/challenge/view.ts', (x) => x.replace('draft: CHALLENGE.cardsApproved ? null : W.draftShort', 'draft: null'))).length > 0);

  check('P6ac: entries as pictures are on as committed, and Terms §6e and Privacy §4 say so', CHALLENGE.pictureEntries === true && p6acProblems(CHALLENGE.pictureEntries, TERMS.sections, PRIVACY.sections).length === 0, p6acProblems(true, TERMS.sections, PRIVACY.sections).join('; '));
  const oldTerms = TERMS.sections.map((s) => (s.n === '6e' ? { ...s, body: ['… may remix its characters\' sheets …'] } : s));
  const oldPrivacy = PRIVACY.sections.map((s) => (s.n === 4 ? { ...s, body: ['… for each version of a challenge character you publish …'] } : s));
  proof('P6ac: turned on with the words before the reread (sheets) fails', p6acProblems(true, oldTerms, oldPrivacy).length > 0);
  const terms = TERMS.sections;
  proof('P6ac: Terms saying it but not Privacy fails', p6acProblems(true, terms, oldPrivacy).length > 0);
  // Terms §6e, the simpler challenge (owner's after-text, 2026-11-08; needs his reread): no moment, any of the
  // character's pictures on the challenge pages, a base or any remix, including your own.
  const e6 = (TERMS.sections.find((s) => String(s.n) === '6e')?.body ?? []).flat().join(' ');
  check('Terms §6e: the owner\'s after-text, word for word, and no moment', e6.includes('and only if it is a picture of a challenge character, remixed from one of that character\'s pictures on the challenge pages (a base or any remix, including your own; not made from scratch), made on the Service during the challenge') && !/moment/i.test(e6));
}

// --- The hub's data (R1) --------------------------------------------------------------------------------------------
{
  const V = await import('../src/lib/challenge/view');
  const { cardOf } = await import('../src/lib/challenge/cards');
  const v = await V.challengeView(null);
  check('hub: the characters in CHALLENGE.characters\' order', v.cards.map((x) => x.c.slug).join() === CHALLENGE.characters.join(), v.cards.map((x) => x.c.slug).join());
  check('hub: no random-remixes block (owner, answer 9)', !('remixes' in v) && !('pick' in v));
  check('hub: the cards are approved, so no row carries the "Draft wording" mark, nor the hub\'s line', v.cards.every((x) => x.c.draft === null) && v.draftShort === null);
  // The plain list (owner, 2026-11-08): name, the approved one line verbatim, the bases; nothing else.
  check('hub: each row is the name (a link to its page), the approved one line word for word, and the bases; nothing else', v.cards.every((x) => Object.keys(x.c).sort().join() === 'bases,draft,href,line,name,note,slug' && x.c.line === cardOf(x.c.slug)!.line && x.c.line.length > 0 && x.c.href === `/challenge/${x.c.slug}`));
  const rows = JSON.stringify(v.cards.map((x) => x.c));
  check('hub: no facts, second layer, moments or remixes in its data', !/"(facts|moments|more|remixes|firsts|appears)"/.test(rows) && !JSON.stringify(v).includes('picked by @naaate') && !JSON.stringify(v).includes('May spoil'));
  check('hub: the look is marked as this edition\'s, and the line as its summary', v.cards.every((x) => x.w.look === 'Look invented by this edition: the book doesn’t describe it.' && x.w.summary === 'This edition’s summary'));
  check('hub: the one line says what to do', /^Pick a character\. Tap a picture to remix it\. Entries /.test(v.line), v.line);
  const card = read('src/components/challenge-card.tsx');
  check('hub: tapping the name (or the row outside a picture) opens the character\'s page; the bases sit above that link', /<Link href=\{c\.href\} className="cc-name-link" prefetch=\{false\}>/.test(card) && /\.cc-card-row \.cc-name-link \{ position: static; \}/.test(read('src/styles/designs.css')) && /\.cc-card-row \.cc-name-link::after \{ content: ''; position: absolute; inset: 0;[^}]*z-index: 1; \}/.test(read('src/styles/designs.css')) && /\.cc-card-row \.cc-bases \{ position: relative; z-index: 2; \}/.test(read('src/styles/designs.css')));
  check('hub and character page: picture links aren\'t prefetched', /<Link className="cc-tile" href=\{t\.href\} data-version=\{t\.versionId\} prefetch=\{false\}>/.test(card));
  // A character's page: only the six; no database here, so empty lists.
  const zei = await V.characterView(null, 'zei');
  check('character page: the name, the one line, the bases and the remixes (none without a database), its back link', zei !== null && zei.c.name === 'Zei' && zei.c.line === cardOf('zei')!.line && Array.isArray(zei.c.bases) && zei.c.remixes.length === 0 && zei.w.none === 'No remixes of Zei yet.' && zei.back === '← The remix challenge');
  // "Read where {Name} first appears" (owner, 2026-11-09): each of the six pages, the words, the reader link at the card's
  // first "appears" block (the same block a picture is anchored to), and that block is in the book's text.
  {
    const FA = await import('../src/lib/challenge/first-appears');
    const CD = await import('../src/lib/challenge/cards');
    const MK = await import('../src/lib/challenge/make');
    const rows = await Promise.all(CHALLENGE.characters.map(async (slug) => ({ slug, v: await V.characterView(null, slug) })));
    const ok = (check: (slug: string, href: string, words: string) => boolean) => rows.every(({ slug, v }) => v?.firstAppears && check(slug, v.firstAppears.href, v.firstAppears.words));
    check('first appears: each of the six pages links "Read where {Name} first appears" to the reader at the card\'s first block, which exists in the text and anchors its pictures', ok((slug, href, words) => {
      const block = CD.CARDS.find((c) => c.slug === slug)!.appears[0].block;
      const m = /^c(\d+)-b(\d+)$/.exec(block)!;
      const a = MK.characterAnchor(slug);
      return words === `Read where ${rows.find((r) => r.slug === slug)!.v!.c.name} first appears` && href === `/chapter/${m[1]}#${block}` && blocks.has(block) && a.chapter === Number(m[1]) && a.start === Number(m[2]);
    }) && rows.find((r) => r.slug === 'zei')!.v!.firstAppears!.href === '/chapter/2#c2-b2' && rows.find((r) => r.slug === 'zei')!.v!.firstAppears!.words === 'Read where Zei first appears');
    proof('first appears: a link to a block that isn\'t in the text fails', !blocks.has('c2-b99999') && FA.firstAppearsBlock('nobody') === 'c1-b1');
    const comp = read('src/components/challenge-character.tsx');
    check('first appears: the link sits under the one line, prefetch off', comp.indexOf('data-slot="first-appears"') > comp.indexOf('<CardLine') && comp.indexOf('data-slot="first-appears"') < comp.indexOf('ch-char-bases') && /prefetch=\{false\} data-slot="first-appears"/.test(comp));
  }
  check('character page: null (404) for anything but the six', (await V.characterView(null, 'lektor')) === null && (await V.characterView(null, 'entries')) === null && (await V.characterView(null, '')) === null);
  const page = read('src/app/challenge/[slug]/page.tsx');
  check('character page: gated and cached as /challenge (public switch, revalidate 60), only the six as pages', /if \(!CHALLENGE\.public\) notFound\(\);/.test(page) && /export const revalidate = 60;/.test(page) && /export const dynamicParams = false;/.test(page) && /CHALLENGE\.characters\.map\(\(slug\) => \(\{ slug \}\)\)/.test(page) && /page="character"/.test(read('src/app/challenge/[slug]/not-found.tsx')));
  check('character page: no route clash (entries, remixes, rules, make and p are their own folders, not characters)', ['entries', 'remixes', 'rules', 'make', 'p'].every((d) => readdirSync(path.join(ROOT, 'src/app/challenge')).includes(d) && !CHALLENGE.characters.includes(d)));

  // "Where they appear": its own API, the six only, the book's words, only while the exception holds (no page calls it now).
  const keep = { ...CHALLENGE.dates };
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
  check('P5g passes with "Surprise me" (all fifteen but the one chosen, unweighted), the bases\' shuffle and the Style row\'s Random', p5gProblems(files).length === 0, p5gProblems(files).join('; '));
  proof('P5g: Random drawing from only some of the published styles fails', p5gProblems(plantIn('src/lib/challenge/make.ts', (x) => x.replace('shuffleFresh(published)[0]', 'shuffleFresh(published.slice(1))[0]'))).length > 0);
  proof('P5g: Random weighted toward the newest style fails', p5gProblems(plantIn('src/lib/challenge/make.ts', (x) => x.replace('shuffleFresh(published)[0]', 'shuffleFresh([...published, published[0]])[0]'))).length > 0);
  proof('P5g: a character\'s remixes shuffled again (they are newest first now) fails', p5gProblems(plantIn('src/components/challenge-card.tsx', (x) => x.replace('shuffleFresh(c.bases)', 'shuffleFresh(c.bases);\n    shuffleFresh(remixes)'))).length > 0);
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
  // With the moments on (the switch kept for later): a request needs a version, one of the fifteen and words.
  check('moments on: a request needs a version, one of the fifteen moments and words', !M.readMake({}, true).ok && !M.readMake({ from: randomUUID(), moment: 'c99-b1-x', words: 'a' }, true).ok && !M.readMake({ from: randomUUID(), moment: m.id, words: '  ' }, true).ok && M.readMake({ from: randomUUID(), moment: m.id, words: 'a' }, true).ok);
  proof('moments on: a moment outside the list is refused', !M.readMake({ from: randomUUID(), moment: 'c30-b47-dog', words: 'x' }, true).ok);
}

// --- The simpler challenge (owner, 2026-11-08): no moments, a Style row and a Model row --------------------------------
{
  const M = await import('../src/lib/challenge/make');
  const S = await import('../src/lib/challenge/styles');
  const MD = await import('../src/lib/challenge/models');
  const { blockedName } = await import('../src/lib/images/rules');
  check('the switch: CHALLENGE.moments is off as committed', CHALLENGE.moments === false);
  // The request: no moment needed (and one sent is ignored), words, a style (listed, Random or the person's own) and a model.
  const from = randomUUID();
  const ok = M.readMake({ from, words: 'a red coat', style: { kind: 'random' }, model: 'flux2-klein-4b-edit' });
  check('moments off: a request needs a version and words, not a moment (one sent is ignored)', ok.ok && ok.moment === null && M.readMake({ from, moment: 'c4-b129-symbol', words: 'x', style: { kind: 'random' } }).ok && (M.readMake({ from, moment: 'c4-b129-symbol', words: 'x' }) as { moment?: unknown }).moment === null && !M.readMake({ from, words: ' ', style: { kind: 'random' } }).ok);
  check('moments off: the style is one listed (by id), Random, or the person\'s own words (at most 120 characters)', M.readMake({ from, words: 'x', style: { kind: 'style', id: 'style:0000-ab' } }).ok && M.readMake({ from, words: 'x', style: { kind: 'own', text: 'soft pencil, pale paper' } }).ok && !M.readMake({ from, words: 'x', style: { kind: 'own', text: '  ' } }).ok && !M.readMake({ from, words: 'x', style: { kind: 'own', text: 'x'.repeat(S.OWN_STYLE_MAX + 1) } }).ok && !M.readMake({ from, words: 'x', style: { kind: 'paint' } }).ok);
  // The prompt: the words, reference image 1, the style's text, then the owner's keep line exactly, then no lettering.
  const prompt = M.remixPrompt({ words: 'give her a red coat', name: 'Bai', style: 'soft pencil on pale paper' });
  check('moments off: the prompt is the words, reference image 1, the scene line (always, owner 2026-11-09), the style, then exactly "Keep the face recognisable; …", then no lettering; no moment\'s setting and no other character', prompt === `give her a red coat\n\nBai is the person in reference image 1, the main figure.\n\nUnless the change says otherwise: one figure, in a scene that suits the change, not a character sheet.\n\nsoft pencil on pale paper\n\nKeep the face recognisable; change anything else the words describe.\n\n${IMAGES.suffix}` && !/setting:|reference image 2/.test(prompt), prompt);
  check('the keep line is the owner\'s, exactly', S.KEEP_LINE === 'Keep the face recognisable; change anything else the words describe.');
  // Resolving a style: a listed one, Random (a draw from the published ones, recorded with the one drawn), or own words.
  const pub = [1, 2, 3].map((n) => ({ id: `style:e${n}`, label: `Style ${n}`, text: `text ${n}`, elementId: `e${n}`, versionId: `v${n}`, versionNo: 1, entity: `Style ${n}`, title: '', byName: 'x', byFid: 1, assist: null }));
  const picked = M.resolveStyle({ kind: 'style', id: 'style:e2' }, pub);
  const random = M.resolveStyle({ kind: 'random' }, pub, [], (l) => l[2]);
  const own = M.resolveStyle({ kind: 'own', text: 'chalk on a blackboard' }, pub);
  check('a listed style gives its own text; Random records "random" and the style drawn; own words are used as written', picked?.choice === 'published' && picked.text === 'text 2' && random?.choice === 'random' && random.label === 'Style 3' && random.text === 'text 3' && random.design?.elementId === 'e3' && own?.choice === 'own' && own.text === 'chalk on a blackboard' && own.design === null);
  check('a style id that isn\'t listed, and Random with no published style, are refused', M.resolveStyle({ kind: 'style', id: 'style:nope' }, pub) === null && M.resolveStyle({ kind: 'random' }, []) === null);
  check('no style chosen: the first listed', M.resolveStyle({ kind: 'style', id: '' }, pub)?.id === 'style:e1');
  // Random, drawn on the server: uniform over every published style (the P5g shuffle on the whole list).
  {
    const counts = new Map<string, number>();
    for (let i = 0; i < 9000; i++) {
      const d = M.drawStyle(pub)!;
      counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
    }
    const worst = Math.max(...[...counts.values()].map((c) => Math.abs(c / 9000 - 1 / 3)));
    check('Random: each published style about equally often, never anything else', counts.size === 3 && worst < 0.03, `worst ${worst.toFixed(3)}`);
  }
  // The presets: EMPTY until the owner picks them (2026-11-08). Every preset's label and prompt, and any own style, go
  // through the same checks as the prompt: the blocked names, then the prompt check (a stand-in here, as no test calls
  // the model): no named artists, studios, films or real people.
  check('presets: empty until the owner picks them', S.STYLE_PRESETS.length === 0);
  const NAMED = /\b(ghibli|miyazaki|pixar|disney|spirited away|akira|rembrandt|van gogh|warhol|wes anderson|taylor swift|vitalik|buterin)\b/i;
  const guardStandIn = (text: string) => !blockedName(text) && !NAMED.test(text);
  const presetProblems = (presets: readonly { id: string; label: string; prompt: string }[]) => presets.filter((p) => !guardStandIn(p.label) || !guardStandIn(p.prompt)).map((p) => p.id);
  check('presets: no label or prompt names an artist, studio, film or real person', presetProblems(S.STYLE_PRESETS).length === 0);
  proof('presets: a preset naming a studio is caught', presetProblems([{ id: 'x', label: 'Soft', prompt: 'in the style of Studio Ghibli' }]).length === 1);
  proof('presets: a preset label naming a real person is caught', presetProblems([{ id: 'x', label: 'Vitalik portrait', prompt: 'soft light' }]).length === 1);
  // "Write your own" is checked as part of the prompt, even when the change words are tiny, and the route sends the
  // whole prompt (with the style's words) to the prompt check.
  for (const [what, text] of [['an artist', 'like Rembrandt'], ['a studio', 'Studio Ghibli look'], ['a film', 'as in Spirited Away'], ['a real person', 'drawn by Vitalik Buterin']] as const) {
    const r = M.readMake({ from, words: 'x', style: { kind: 'own', text } });
    const st = r.ok ? M.resolveStyle(r.style, pub) : null;
    const checked = st ? M.remixPrompt({ words: r.ok ? r.words : '', name: 'Zei', style: st.text }) : '';
    proof(`own style naming ${what} is refused by the prompt check`, checked.includes(text) && !guardStandIn(checked));
  }
  check('own style: a real person on the blocked list is refused before any model is asked (blockedName)', blockedName(M.remixPrompt({ words: 'x', name: 'Zei', style: 'portrait of Vitalik' })) === 'Vitalik');
  const route = read('src/app/api/challenge/make/route.ts');
  check('the route checks the whole prompt (the words and the style\'s words) with the prompt check', /remixPrompt\(\{ words: r\.words, name, (look: lookFor\(src\.character\), )?style: style!\.text \}\)/.test(route) && /checkText: prompt,/.test(route) && /blockedName\(job\.checkText\)/.test(read('src/lib/images/paid.ts')) && /checkPrompt\(job\.checkText/.test(read('src/lib/images/paid.ts')));
  // The Model row: a list from the server; the route refuses anything not in it.
  const models = MD.challengeModels();
  // Branch challenge-models: with no country (no closed model offered), the edit model alone (Qwen dropped, owner, 2026-11-09).
  check('models: a list, the edit model first (open, by Black Forest Labs, its chip as today\'s line); no closed model without a country', models.length === 1 && models[0].id === IMAGES.editModel.id && models[0].open && MD.modelChipText(models[0]) === 'FLUX.2 [klein] 4B · Black Forest Labs · open' && MD.modelChipText(models[0]) === (await import('../src/lib/challenge/make-wording')).MAKE_WORDING.modelChip);
  check('models: the request\'s model must be in the list (a missing or other id is refused)', MD.modelFromRequest(IMAGES.editModel.id)?.id === IMAGES.editModel.id && MD.modelFromRequest('gpt-image-2.5') === null && MD.modelFromRequest(undefined) === null && MD.modelFromRequest('x', [...models, { id: 'x', label: 'X', maker: 'Y', open: false }] as unknown as typeof models)?.open === false);
  // Branch challenge-models: the route checks the model with this request's country (challengeModel), before consent and the count.
  check('models: the route refuses a model not in the list before anything is spent', /const chosen = challengeModel\(r\.model, whereFrom\(request\.headers\)\);\s*if \(!chosen\) return no\(MAKE_WORDING\.noModel, 400/.test(route) && route.indexOf('challengeModel(') < route.indexOf('paidPicture('));
  check('a closed model\'s chip says "closed" and names its maker', MD.modelChipText({ id: 'g', label: 'Gemini 3.1 Flash Image', maker: 'Google', open: false }) === 'Gemini 3.1 Flash Image · Google · closed');
  // The screen's data with the moments off: no moments, the styles (the picture's own first when listed), the models.
  const src = { kind: 'sheet' as const, versionId: from, character: 'zei', url: 'u', sha256: 's', width: 1, height: 1, text: '', title: '', by: null, byFid: 1, versionNo: 1, moment: null, styleElement: 'e2' };
  const mv = M.makeView(src, { styles: pub });
  check('moments off: the screen gets no moments, the styles in order, "Same as this picture" chosen first (owner, 2026-11-09), the models, and the box\'s label', mv.moments.length === 0 && mv.source.moment === null && mv.styles.map((x) => x.id).join() === 'style:e1,style:e2,style:e3' && mv.defaultStyle === 'same' && mv.models.length === 1 && mv.models[0].id === IMAGES.editModel.id && /* branch challenge-models: no country, the open model alone */  mv.w.wordsLabel === 'Change Zei: clothes, colours, age, pose…' && mv.w.style === 'Style' && mv.w.random === 'Random' && mv.w.ownStyle === 'Write your own');
  check('moments off: every picture starts on "Same as this picture" (owner, 2026-11-09), with or without a style of its own', M.makeView({ ...src, styleElement: null }, { styles: pub }).defaultStyle === 'same');
  check('moments on (kept): the screen gets all fifteen', M.makeView(src, { styles: pub, momentsOn: true }).moments.length === 15);
  check('moments off: a picture is anchored to its character\'s first passage', JSON.stringify(M.characterAnchor('zei')) === JSON.stringify({ chapter: 2, start: 2, end: 2 }));
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
  check('the remix screen\'s box is empty and carries the publication line (P1f); "Write your own" is a published box too', /<PublishedTextField id="mk-words" label=\{w\.wordsLabel\} value=\{words\}/.test(make) && /<PublishedTextField id="mk-own-style" label=\{w\.ownStyleLabel\} value=\{ownStyle\}/.test(make) && /maxLength=\{view\.ownStyleMax\}/.test(make) && /wordsPlaceholder: 'Describe what to change'/.test(read('src/lib/challenge/make-wording.ts')));
  check('the remix screen shows the moments only when the server sends them (with the switch on)', /\{momentsOn && \(\s*<section className="mk-moments"/.test(make) && /const momentsOn = view\.moments\.length > 0;/.test(make));
  check('the remix screen names the model and its maker, one chip per model the server lists', /data-slot="model-choice"/.test(make) && /\{view\.models\.map\(\(m\) =>/.test(make) && /FLUX\.2 \[klein\] 4B · Black Forest Labs · open/.test((await import('../src/lib/challenge/make-wording')).MAKE_WORDING.modelChip));
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
  const keep = { bases: CHALLENGE.bases, dates: { ...CHALLENGE.dates }, pub: CHALLENGE.public, pictures: CHALLENGE.pictureEntries, entries: CHALLENGE.entries, moments: CHALLENGE.moments };
  // The moments flow, as it was (the switch on, for this part only); the switch-off part follows below.
  CHALLENGE.moments = true;
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
  check('a picture\'s page: its character and moment with its chapter, and Submit for its maker with the owner\'s post text', pv?.title === 'Bai · The championship final (Ch 7)' && pv.submit?.postText === 'My remix of Bai in “The championship final”, for the Snowmoon Party remix challenge' && pv.w.postTexts.plain === pv.submit?.postText && pv.w.signInLine === 'Sign in with Farcaster, Lens or Bluesky to enter.');
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
  // Before the open date (owner, 2026-11-07): on 18 Nov, submitting a picture published on 8 Nov is refused with the
  // owner's line, and its page shows it to its maker; on 8 Nov, Submit says "Entries open …" for every picture.
  {
    Object.assign(CHALLENGE.dates, keep.dates);
    const m = MOMENTS.find((x) => x.characters.includes('bai'))!;
    const recipeId = randomUUID(), elementId = randomUUID(), early = randomUUID();
    const at8 = '2026-11-08T18:00:00Z', d8 = new Date('2026-11-08T20:00:00Z'), d11 = new Date('2026-11-18T20:00:00Z');
    await sql`insert into studio.recipes ${sql({ id: recipeId, source: 'in_app', provider: 'fal.ai', model: 'flux2-klein-4b-edit', model_version: 'e', prompt: 'p', params: sql.json({ user_prompt: 'early', by_name: 'p500', anchor: { chapter: m.chapter, start: m.start, end: m.end }, challenge: { character: 'bai', moment: m.id, scene: m.scene, from: base.versionId, fromKind: 'sheet' } } as never), seed: 1, assist: null, cost_usd: 0.009, created_by_fid: 500, created_at: at8 })}`;
    await sql`insert into studio.elements ${sql({ id: elementId, work_id: 'snowmoon', element_type: 'image', created_by_fid: 500, created_at: at8 })}`;
    await sql`insert into studio.element_versions ${sql({ id: early, element_id: elementId, version_no: 1, body: sql.json({ lettering: [] } as never), asset_url: 'https://media.example/early.jpg', asset_sha256: 'e'.repeat(64), recipe_id: recipeId, created_at: at8 })}`;
    await sql`insert into studio.anchors ${sql({ version_id: early, work_id: 'snowmoon', chapter: m.chapter, start_idx: m.start, end_idx: m.end })}`;
    await sql`insert into studio.links ${sql({ from_version_id: early, to_version_id: base.versionId, kind: 'uses' })}`;
    const E2 = await import('../src/lib/challenge/entries');
    const PV = await import('../src/lib/challenge/picture-view');
    const post = { network: 'farcaster' as const, id: '0x' + 'e'.repeat(40), handle: 'p500', at: d11.toISOString(), url: 'https://farcaster.xyz/p500/0xeeeeeeee', links: [`https://snowmoon.party/challenge/p/${early}`], writer: { fid: 500 } };
    const r11 = await E2.submitEntry(S, 500, early, post, d11);
    const r8 = await E2.submitEntry(S, 500, early, post, d8);
    const v11 = await PV.pictureView(S, early, d11), v8 = await PV.pictureView(S, early, d8);
    const LINE = 'This picture was made before entries opened, so it can’t be entered. Remix it to make a new one.';
    const ok = (a: typeof v11, b: typeof v8) => Boolean(a && b && a.beforeOpen && `${a.beforeOpen.text}${a.beforeOpen.link}${a.beforeOpen.after}` === LINE && a.notYet === null && b.beforeOpen === null && b.notYet === 'Entries open Tue 17 Nov, 00:00 PT.');
    check('before the open date: on 18 Nov, submitting a picture published on 8 Nov is refused with the owner\'s line', !r11.ok && r11.why === LINE, JSON.stringify(r11));
    check('before the open date: on 8 Nov, Submit says "Entries open Tue 17 Nov, 00:00 PT." for a pre-open picture', !r8.ok && r8.why === 'Entries open Tue 17 Nov, 00:00 PT.', JSON.stringify(r8));
    check('before the open date: its page shows its maker the line from the 17th, and "Entries open …" before', ok(v11, v8));
    proof('before the open date: the line missing on the 18th is caught', !ok(v11 && { ...v11, beforeOpen: null }, v8));
    proof('before the open date: the line shown before the 17th is caught', !ok(v11, v8 && { ...v8, beforeOpen: v11!.beforeOpen }));
    CHALLENGE.dates.opens = new Date(Date.now() - 60_000).toISOString();
  }
  // --- The same database with the moments off (owner, 2026-11-08; CHALLENGE.moments as committed) ---------------------
  CHALLENGE.moments = false;
  {
    const styleD = await DS.makeDesign(S as never, { fid: 6786, mode: 'create', kind: 'style', styleName: 'Quiet, warm light', body: { title: 'Quiet, warm light', text: 'Quiet, warm light; soft shadows.', samples: [], views: {}, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null } as never });
    const styled = await DS.makeDesign(S as never, { fid: 6786, mode: 'create', kind: 'character', character: DS.bookCharacter('bai')!, body: { ...sheet('Bai base, styled', 40), style: { version_id: styleD.versionId, title: 'Quiet, warm light' } } as never });
    CHALLENGE.bases = { ...CHALLENGE.bases, bai: [base.versionId, styled.versionId] };
    const keepCount = CHALLENGE.baseCount;
    CHALLENGE.baseCount = { ...CHALLENGE.baseCount, bai: 2 };
    const plain = await picture({ fid: 501, character: 'bai', moment: '', from: base.versionId, uses: base.versionId });
    const ownRemix = await picture({ fid: 501, character: 'bai', moment: '', from: plain.versionId, remixedFrom: plain.versionId });
    const noLine = await picture({ fid: 501, character: 'bai', moment: '', from: base.versionId });
    const all = await P.challengePictures(S);
    check('moments off: a picture needs no moment to be a challenge picture; one made with a moment (even an old one) still is', all.some((p) => p.versionId === plain.versionId) && all.some((p) => p.versionId === badMoment.versionId) && all.some((p) => p.versionId === second.versionId));
    const cnt = await P.picturesCount(S, all);
    check('moments off: a picture from a base counts, and one remixed from your own picture counts', cnt.get(plain.versionId) === true && cnt.get(ownRemix.versionId) === true && plain.recorded === 'stored' && ownRemix.recorded === 'stored');
    check('moments off: a picture with no line (made from scratch) still doesn\'t count', cnt.get(noLine.versionId) === false && noLine.recorded === 'not-a-candidate');
    proof('moments off: a picture of Bai from Zei\'s base still doesn\'t count for Bai', cnt.get(wrongBase.versionId) === false);
    const pvPlain = await V.pictureView(S, plain.versionId);
    check('moments off: a picture\'s page has no moment: its title is the name, the ready post is the owner\'s "My remix of Bai, for the Snowmoon Party remix challenge"', pvPlain?.title === 'Bai' && pvPlain.w.postTexts.plain === 'My remix of Bai, for the Snowmoon Party remix challenge');
    check('moments off: a visitor\'s share text is "A remix of Bai by @p501, for the Snowmoon Party remix challenge" in Farcaster, without the @ elsewhere', pvPlain?.w.othersTexts.farcaster === 'A remix of Bai by @p501, for the Snowmoon Party remix challenge' && pvPlain.w.othersTexts.plain === 'A remix of Bai by p501, for the Snowmoon Party remix challenge' && pvPlain.w.othersTexts.bluesky === 'A remix of Bai by p501, for the Snowmoon Party remix challenge');
    const pvOld = await V.pictureView(S, second.versionId);
    check('moments off: a picture made with a moment shows no moment (title, ready post, share texts)', pvOld?.title === 'Bai' && !/championship|“/.test(JSON.stringify(pvOld.w.postTexts) + JSON.stringify(pvOld.w.othersTexts) + (pvOld.submit?.postText ?? '')));
    const feedOff = await RV.remixesView(S, { character: null, before: null });
    check('moments off: the feed shows no moment titles', feedOff.cards.every((c) => c.title === ''));
    check('moments off: the entries list shows no moment titles', (await E.windowVersions(S)).every((v) => v.title === ''));
    const VW = await import('../src/lib/challenge/view');
    const cv = await VW.characterView(S, 'bai');
    const baiPics = all.filter((p) => p.character === 'bai').map((p) => p.versionId);
    check('character page: every published picture of Bai, the maker\'s own remix of their own included, newest first, each opening its remix screen', cv !== null && cv.c.remixes.map((r) => r.versionId).join() === baiPics.join() && cv.c.remixes.some((r) => r.versionId === ownRemix.versionId) && cv.c.remixes.every((r) => r.href === `/challenge/make?from=${r.versionId}`));
    check('character page: Bai\'s bases (both, by their tiles)', cv!.c.bases.map((b) => b.versionId).sort().join() === [base.versionId, styled.versionId].sort().join());
    const hub = await VW.challengeView(S);
    check('hub: Bai\'s row has its bases and no remixes', hub.cards.find((x) => x.c.slug === 'bai')!.c.bases.length === 2 && !('remixes' in hub.cards.find((x) => x.c.slug === 'bai')!.c));
    // The reader (owner, 2026-11-08): a challenge picture keeps its anchor in the record, but the reader never lists it;
    // an ordinary picture at the same passage still shows. Both ways, at the moments-off anchor and a moment's passage.
    {
      const D = await import('../src/lib/images/data');
      const ordinary = async (chapter: number, start: number) => {
        const recipeId = randomUUID(), elementId = randomUUID(), versionId = randomUUID();
        const sha = String(++n).padStart(64, '0');
        await sql.begin(async (tx) => {
          await tx`insert into studio.recipes ${tx({ id: recipeId, source: 'in_app', provider: 'fal.ai', model: 'flux2-klein-4b-edit', model_version: 'e', prompt: 'p', params: tx.json({ user_prompt: 'a picture of the passage', by_name: 'p502' } as never), seed: 1, cost_usd: 0.003, created_by_fid: 502 })}`;
          await tx`insert into studio.elements ${tx({ id: elementId, work_id: 'snowmoon', element_type: 'image', created_by_fid: 502 })}`;
          await tx`insert into studio.element_versions ${tx({ id: versionId, element_id: elementId, version_no: 1, body: tx.json({ lettering: [] } as never), asset_url: `https://media.example/${sha}.jpg`, asset_sha256: sha, recipe_id: recipeId })}`;
          await tx`insert into studio.anchors ${tx({ version_id: versionId, work_id: 'snowmoon', chapter, start_idx: start, end_idx: start })}`;
        });
        return versionId;
      };
      const [anc] = await sql<{ chapter: number; start_idx: number }[]>`select chapter, start_idx from studio.anchors where version_id = ${plain.versionId}`;
      const [ancM] = await sql<{ chapter: number; start_idx: number }[]>`select chapter, start_idx from studio.anchors where version_id = ${fromBase.versionId}`;
      const o1 = await ordinary(anc.chapter, anc.start_idx);
      const o2 = await ordinary(ancM.chapter, ancM.start_idx);
      const ch1 = (await D.chapterImages(S, anc.chapter)).map((x) => x.versionId);
      const ch2 = (await D.chapterImages(S, ancM.chapter)).map((x) => x.versionId);
      const challengeIds = (await P.challengePictures(S, { momentsOn: false })).map((x) => x.versionId);
      check('reader: a challenge picture keeps its anchor in the record', Boolean(anc) && Boolean(ancM));
      check('reader: no challenge picture is listed at its passage (the moments-off anchor or a moment\'s); an ordinary picture at the same passage is', ch1.includes(o1) && ch2.includes(o2) && !ch1.some((v) => challengeIds.includes(v)) && !ch2.some((v) => challengeIds.includes(v)), `${ch1.join()} | ${ch2.join()}`);
      check('reader: a challenge picture\'s own page ("How it was made") still finds it', (await D.imageByVersion(S, plain.versionId))?.versionId === plain.versionId);
      proof('reader: a chapter list that keeps challenge pictures is caught', ((await sql`select v.id::text from studio.element_versions v join studio.anchors a on a.version_id = v.id where a.chapter = ${anc.chapter}`).map((r) => String(r.id))).some((v) => challengeIds.includes(v)));
      check('reader: the chapter list leaves challenge pictures out in its query', /not \(x\.params \? 'challenge'\)/.test(read('src/lib/images/data.ts')));
    }
    const srcStyled = await P.sourceOf(S, styled.versionId);
    check('a base made in a published style: the remix screen starts on that style', srcStyled?.styleElement === styleD.elementId);
    const styles = await (await import('../src/lib/challenge/make')).publishedStyles(sql as never);
    check('the published styles: listed with their names and texts', styles.some((x) => x.id === `style:${styleD.elementId}` && x.label === 'Quiet, warm light' && x.text === 'Quiet, warm light; soft shadows.'));
    (globalThis as { __styledBase?: string; __styleEl?: string }).__styledBase = styled.versionId;
    (globalThis as { __styledBase?: string; __styleEl?: string }).__styleEl = styleD.elementId;
    (globalThis as { __keepCount?: unknown }).__keepCount = keepCount;
  }
  // The make API (GET): the screen's data for a base; 404 for anything else. POST without a sign-in: 401 (P4a). The app's
  // own connection (db()) is a second one, and PGlite's socket server takes one at a time: this test's closes first.
  await sql.end();
  process.env.STUDIO_DATABASE_URL = url;
  const route = await import('../src/app/api/challenge/make/route');
  const g = await route.GET(new Request(`http://localhost/api/challenge/make?from=${base.versionId}`));
  const gj = (await g.json()) as { moments: unknown[]; source: { kind: string; character: string } };
  check('make API, moments off: the screen\'s data for a base (no moments, Bai, a sheet, the styles and the model)', g.status === 200 && gj.moments.length === 0 && gj.source.character === 'bai' && gj.source.kind === 'sheet' && (gj as unknown as { styles: { label: string }[] }).styles.some((x) => x.label === 'Quiet, warm light') && (gj as unknown as { models: { chip: string }[] }).models[0].chip === 'FLUX.2 [klein] 4B · Black Forest Labs · open');
  const gs = (await (await route.GET(new Request(`http://localhost/api/challenge/make?from=${(globalThis as { __styledBase?: string }).__styledBase}`))).json()) as { defaultStyle: string };
  check('make API, moments off: a base in a published style starts on "Same as this picture" (owner, 2026-11-09)', gs.defaultStyle === 'same');
  CHALLENGE.moments = true;
  const gOn = (await (await route.GET(new Request(`http://localhost/api/challenge/make?from=${base.versionId}`))).json()) as { moments: unknown[] };
  check('make API, moments on (kept): fifteen moments', gOn.moments.length === 15);
  CHALLENGE.moments = false;
  check('make API: 404 for a sheet that isn\'t a base', (await route.GET(new Request(`http://localhost/api/challenge/make?from=${otherSheet.versionId}`))).status === 404);
  check('make API: Make it without signing in is refused (401)', (await route.POST(new Request('http://localhost/api/challenge/make', { method: 'POST', body: '{}' }))).status === 401);
  delete process.env.STUDIO_DATABASE_URL;
  // Back as committed.
  CHALLENGE.bases = keep.bases;
  Object.assign(CHALLENGE.dates, keep.dates);
  CHALLENGE.public = keep.pub;
  CHALLENGE.entries = keep.entries;
  CHALLENGE.pictureEntries = keep.pictures;
  CHALLENGE.moments = keep.moments;
  CHALLENGE.baseCount = (globalThis as { __keepCount?: typeof CHALLENGE.baseCount }).__keepCount ?? CHALLENGE.baseCount;
  await (await import('../src/lib/db')).db()?.end();
  await server.stop();
}

// === R3: share first on the published picture's page ==================================================================
{
  const pic = read('src/components/challenge-picture.tsx');
  const sf = read('src/components/challenge-share-first.tsx');
  const at = (x: string) => pic.indexOf(x);
  check('share first: the post buttons come right after the picture, before Submit and before the picture\'s title', at('<ChallengeShareFirst') > at('</figure>') && at('<ChallengeShareFirst') < at('<ChallengeSubmit') && at('<ChallengeShareFirst') < at('<h1 className="mk-title">'));
  // Owner, 2026-11-07: anyone but its maker sees "Remix this", not "Post it", and shares it with words that aren't "My remix".
  check('share first: its maker sees "Published. Now post it:"; anyone else "Remix this" and the others\' share text', /known && mine && <ChallengeShareFirst path=\{path\} w=\{\{ head: v\.w\.published, texts: v\.w\.postTexts/.test(pic) && /known && !mine && \(/.test(pic) && /head: null, texts: v\.w\.othersTexts/.test(pic));
  check('share first: Farcaster (composeCast in the app), Bluesky, Lens and Copy link, each its network\'s own compose page', /sdk\.actions\.composeCast\(\{ text: w\.texts\.farcaster, embeds: \[link\] \}\)/.test(sf) && /https:\/\/farcaster\.xyz\/~\/compose/.test(sf) && /https:\/\/bsky\.app\/intent\/compose/.test(sf) && /https:\/\/hey\.xyz\/\?/.test(sf) && /navigator\.clipboard\.writeText\(link\)/.test(sf));
  check('share first: the ready post is shown as it will be filled in (the text and this page\'s link)', /\{w\.texts\.plain\} <span className="sf-link">\{link\}<\/span>/.test(sf) && !/“\{w\.texts\.plain\}”/.test(sf) && /const link = `\$\{origin\}\$\{path\}`/.test(sf));
  check('share first: no script or request of the networks on our page (plain links; P6a)', !/<script|fetch\(/.test(sf));
  check('Submit B on the page: only the address and Submit (the buttons are above), with a cast just made handed to it', /<ChallengeSubmit\s+versionId=\{v\.versionId\}\s+byFid=\{v\.byFid\}\s+words=\{v\.submit\}\s+path=\{path\}\s+compact\s+castHash=\{castHash\}/.test(pic) && /\{!compact && \(/.test(read('src/components/challenge-submit.tsx')));
  check('"Then submit it as an entry · one a day", and the owner\'s one line with "Rules" (no other rules text)', /\{v\.w\.thenSubmit\} <span className="dz-muted">· \{v\.w\.oneADay\}<\/span>/.test(pic) && /\{v\.w\.signInLine\} <Link href="\/challenge\/rules">\{v\.w\.rules\}<\/Link>/.test(pic));
  const W = (await import('../src/lib/challenge/picture-wording')).PICTURE_WORDING;
  check('the words: "Published. Now post it:", "Then submit it as an entry", "one a day", the sign-in line as the owner wrote it', W.published === 'Published. Now post it:' && W.thenSubmit === 'Then submit it as an entry' && W.oneADay === 'one a day' && W.signInLine === 'Sign in with Farcaster, Lens or Bluesky to enter.');
  check('the ready post is the owner\'s text exactly (2026-11-07: with the moment; with none, the line of 2026-11-06)', W.postText('Bai', 'The quarterfinal') === 'My remix of Bai in “The quarterfinal”, for the Snowmoon Party remix challenge' && W.postText('Bai', null) === 'My remix of Bai, for the Snowmoon Party remix challenge');
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

// --- The rules intro (owner, 2026-11-08, the simpler challenge), exactly, tied to CHALLENGE.dates ---------------------
{
  const W = (await import('../src/lib/challenge/wording')).CHALLENGE_WORDING;
  const R = await import('../src/lib/challenge/rules');
  // The owner's words, exactly; "17 to 29 November" is his literal, and the page builds it from CHALLENGE.dates, so the
  // two can't drift: if the dates move, this check fails until the owner's line is moved with them.
  const INTRO = 'From 17 to 29 November, make your own picture of Zei, Gladias, Bai, Seila, Deluin or Mu: start from one of their pictures, change what you like, pick a style and a model, and publish it. To enter, post it on Farcaster, Lens or Bluesky and submit the post. Your picture gets its own page, credited back to what you built on.';
  check('rules intro: the owner\'s words, exactly (moments off)', CHALLENGE.pictureEntries && !CHALLENGE.moments && W.intro() === INTRO, W.intro());
  check('rules intro: its "17 to 29 November" is CHALLENGE.dates (opens 17 Nov 00:00 PT, the last minute 29 Nov 23:59 PT)', R.windowText() === '17 to 29 November' && R.pacificWallTime(CHALLENGE.dates.opens) === '2026-11-17 00:00' && R.pacificWallTime(new Date(Date.parse(CHALLENGE.dates.closes) - 60_000).toISOString()) === '2026-11-29 23:59' && INTRO.includes(`From ${R.windowText()},`));
  {
    const keep = { ...CHALLENGE.dates };
    CHALLENGE.dates.closes = '2026-12-01T08:00:00Z';
    proof('rules intro: dates that move away from the owner\'s "17 to 29 November" are caught', W.intro() !== INTRO);
    Object.assign(CHALLENGE.dates, keep);
  }
  check('rules: no moment in the intro or the rules', !/moment/i.test(W.intro() + W.rules().join(' ')));
  const RV = await import('../src/lib/challenge/rules-view');
  const rv = await RV.rulesView(null);
  check('rules page: no "Draft wording" mark on the page or the intro', rv.draft === null && rv.introDraft === null);
}

if (failures.length) {
  console.error(`CHALLENGE MOMENTS TESTS FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`challenge moments: ${passed} checks pass`);
