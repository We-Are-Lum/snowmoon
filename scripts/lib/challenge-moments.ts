/**
 * The remix challenge's moments and cards (branch challenge-moments, owner 2026-11-05), as pure checks, so
 * check:principles runs them on the files and scripts/test-challenge-moments.ts proves each is narrow on planted faults.
 *
 * - P9g: principle 9's recorded exception for the challenge (owner, 2026-11-05, answer 1, approved), narrowed by the
 *   simpler challenge (owner, 2026-11-08): the pages show each card's one line only, and the moments only while
 *   CHALLENGE.moments is on (off since then).
 * - P2m: the agent-drafted cards and scene lines are approved before /challenge goes public (answer 2).
 * - P6ac: entries as pictures only once Terms §6e and Privacy say so (legal texts describe today).
 */
import type { CharacterCard } from '../../src/lib/challenge/cards';
import type { Moment } from '../../src/lib/challenge/moments';
import { quoteProblems } from '../../src/lib/challenge/book-quotes';
import { cardQuotes, cardShapeProblems, FIRST_LAYER_MAX_CHAPTER } from '../../src/lib/challenge/cards';
import { momentShapeProblems } from '../../src/lib/challenge/moments';
import { LATER_LABEL, learnMoreProblems, type LearnMoreText } from '../../src/lib/challenge/learn-more';

export type Files = { file: string; text: string }[];
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const get = (files: Files, f: string) => files.find((x) => x.file === f)?.text ?? null;

/** The files P9g reads (besides the data): the challenge's code, and every page and component (for imports). */
export const P9G_FILES = {
  card: 'src/components/challenge-card.tsx',
  view: 'src/lib/challenge/view.ts',
  cards: 'src/lib/challenge/cards.ts',
  appears: 'src/app/api/challenge/appears/route.ts',
  spoilers: 'src/lib/challenge/spoilers.ts',
  wording: 'src/lib/challenge/landing-wording.ts',
  make: 'src/components/challenge-make.tsx',
  makeLib: 'src/lib/challenge/make.ts',
  makeApi: 'src/app/api/challenge/make/route.ts',
  learnView: 'src/lib/challenge/learn-more-view.ts',
  learnData: 'src/lib/challenge/learn-more.ts',
  character: 'src/components/challenge-character.tsx',
};
/** Where the cards' and moments' words may be imported: the challenge's own code only. */
const MAY_IMPORT = /^src\/lib\/challenge\/|^src\/app\/challenge\/|^src\/app\/api\/challenge\/|^src\/components\/challenge-[a-z-]+\.tsx$/;
const IMPORTS_DATA = /from ['"][^'"]*challenge\/(cards|moments)['"]/;

export function p9gProblems(p: {
  files: Files;
  cards: readonly CharacterCard[];
  moments: readonly Moment[];
  characters: readonly string[];
  blocks: ReadonlyMap<string, { kind: string; content: string }>;
  /** spoilerExceptionOn, from src/lib/challenge/spoilers.ts. */
  on: (now: Date, dates: { opens: string; closes: string }) => boolean;
  dates: { opens: string; closes: string };
  /** "Learn more about {name}" (owner, 2026-11-12): the texts and the fold's label. Defaults to the committed ones. */
  learn?: { texts: Readonly<Record<string, LearnMoreText>>; label: string };
}): string[] {
  const out: string[] = [];
  // Only the six characters' cards and the curated moments, and every quote word for word at its block.
  const mq = p.moments.flatMap((m) => m.quotes.map((q) => ({ where: `moment ${m.id}`, block: q.block, text: q.text })));
  out.push(...quoteProblems([...mq, ...cardQuotes(p.cards)], p.blocks));
  out.push(...cardShapeProblems(p.cards, p.characters), ...momentShapeProblems(p.moments, p.characters));
  // The simpler challenge (owner, 2026-11-08): /challenge and a character's page show a card's one line only (the first
  // layer, written without the book's major turns). No facts, no second layer ("More about") and no "Where they
  // appear" in the cards' component or the pages' data.
  const card = stripComments(get(p.files, P9G_FILES.card) ?? '');
  const deeper = /\bc\.(facts|more)\b|\bdescription\b|\/api\/challenge\/appears/.exec(card);
  if (deeper) out.push(`${P9G_FILES.card}: shows more than a card's one line ("${deeper[0]}")`);
  const view = stripComments(get(p.files, P9G_FILES.view) ?? '');
  const viewDeeper = /\.(facts|more|appears)\b|from '\.\/moments'/.exec(view);
  if (viewDeeper) out.push(`${P9G_FILES.view}: the pages' data carries more than a card's one line, or the moments ("${viewDeeper[0]}")`);
  if (!/line: cardOf\(slug\)\?\.line/.test(view)) out.push(`${P9G_FILES.view}: a character's line isn't its card's one line`);
  // "Learn more about {name}" (owner, 2026-11-12; P9 in docs/principles.md): its fallback facts are the first layer's,
  // only through firstLayerFacts, which reads a card's `facts` (never `more` or `appears`) and keeps none past chapter
  // FIRST_LAYER_MAX_CHAPTER; the pages' data carries no facts of its own.
  const learnView = stripComments(get(p.files, P9G_FILES.learnView) ?? '');
  const factsUse = [...(view.match(/\bfacts\s*:[^,}]*/g) ?? []).map((u) => [P9G_FILES.view, u] as const), ...(learnView.match(/\bfacts\s*:[^,}]*/g) ?? []).map((u) => [P9G_FILES.learnView, u] as const)];
  for (const [f, u] of factsUse) if (!/^facts\s*:\s*(shown \? \[\] : )?firstLayerFacts\(slug\)$/.test(u.trim()) && !/^facts\s*:\s*\{/.test(u.trim())) out.push(`${f}: the page's facts aren't the first layer's (firstLayerFacts): "${u.trim()}"`);
  // The texts: shown only when they keep the rule ("who", "start", "drives" and "Room to invent." cite chapters 1 to 14);
  // the owner's (approved) texts must keep it; "later" only inside its fold, labelled exactly, closed by default; the
  // glossary's notes from chapters 1 to 14 outside the fold.
  const learn = p.learn ?? { texts: {} as Record<string, LearnMoreText>, label: LATER_LABEL };
  if (learn.label !== 'Later in the book (spoilers)') out.push(`${P9G_FILES.learnData}: the fold's label is "${learn.label}", not exactly "Later in the book (spoilers)"`);
  for (const [slug, t] of Object.entries(learn.texts)) if (t.approved) out.push(...learnMoreProblems(slug, t));
  if (p.learn && !/const shown = t && learnMoreProblems\(slug\)\.length === 0 \? t : null;/.test(learnView)) out.push(`${P9G_FILES.learnView}: a character's texts are shown without keeping the rule (learnMoreProblems)`);
  if (p.learn && (!/later: \{ head: LATER_LABEL, segs: render\(slug, 'later', shown\.later, Infinity\) \}/.test(learnView) || (learnView.match(/OPEN_MAX_CHAPTER\)/g) ?? []).length < 4 || (learnView.match(/Infinity\)/g) ?? []).length !== 1)) out.push(`${P9G_FILES.learnView}: the open parts' glossary notes aren't held to chapters 1 to 14, or "later" isn't the fold's`);
  const comp = stripComments(get(p.files, P9G_FILES.character) ?? '');
  if (p.learn) {
    const fold = /<details className="chc-later"(\s[^>]*)?>[\s\S]*?<\/details>/.exec(comp);
    if (!fold) out.push(`${P9G_FILES.character}: no fold for "later" (<details className="chc-later">)`);
    else {
      if (fold[1] && /\bopen\b/.test(fold[1])) out.push(`${P9G_FILES.character}: the spoilers fold is open by default`);
      if (!/<summary>\{P\.learn\.text\.later\.head\}<\/summary>/.test(fold[0])) out.push(`${P9G_FILES.character}: the fold's summary isn't its label`);
      const outside = comp.replace(fold[0], '');
      if (/\.later\b/.test(outside)) out.push(`${P9G_FILES.character}: "later" is shown outside its fold`);
    }
  }
  // The label and the words "spoilers" / "Later in the book" only in the texts' own file (the fold's constant).
  for (const f of p.files) if (MAY_IMPORT.test(f.file) && f.file !== P9G_FILES.learnData && /\(spoilers\)/i.test(stripComments(f.text))) out.push(`${f.file}: a spoiler label outside the "Learn more" fold`);
  const cardsSrc = stripComments(get(p.files, P9G_FILES.cards) ?? '');
  const fl = /export const firstLayerFacts = [\s\S]*?;\n/.exec(cardsSrc)?.[0] ?? '';
  if (!fl) out.push(`${P9G_FILES.cards}: no firstLayerFacts`);
  else if (!/cardOf\(slug\)\?\.facts\b/.test(fl) || /\.(more|appears|description)\b/.test(fl) || !/chapterOf\(f\.block\) <= FIRST_LAYER_MAX_CHAPTER/.test(fl)) out.push(`${P9G_FILES.cards}: firstLayerFacts reads more than the first layer's facts, or keeps facts past chapter ${FIRST_LAYER_MAX_CHAPTER}`);
  // The moments: shown on the remix screen only while CHALLENGE.moments is on, every chip with its chapter, and the
  // remix screen's moments end with the exception (GET and POST).
  const make = get(p.files, P9G_FILES.make);
  if (make !== null && /\{m\.title\}/.test(stripComments(make)) && !/\{m\.title\} <span className="cc-chip-ch">· \{m\.chip\}<\/span>/.test(stripComments(make))) out.push(`${P9G_FILES.make}: a moment chip on the remix screen doesn't show its chapter (m.chip)`);
  const makeLib = stripComments(get(p.files, P9G_FILES.makeLib) ?? '');
  if (!/moments: momentsOn \? momentChips\(\) : \[\]/.test(makeLib) || !/chip: chapterChip\(m\)/.test(makeLib)) out.push(`${P9G_FILES.makeLib}: the remix screen's moments aren't sent only while CHALLENGE.moments is on, each with "Ch N"`);
  const makeApi = get(p.files, P9G_FILES.makeApi);
  if (makeApi !== null && (stripComments(makeApi).match(/!spoilerExceptionOn\(\)/g) ?? []).length < 2) out.push(`${P9G_FILES.makeApi}: the remix screen's moments don't end with the exception (spoilerExceptionOn, GET and POST)`);
  // The passages API (no page calls it now) still answers only for the six, only while the exception holds.
  const api = stripComments(get(p.files, P9G_FILES.appears) ?? '');
  if (!/!spoilerExceptionOn\(\)/.test(api) || !/card\.appears\.map/.test(api) || !/CHALLENGE\.characters\.includes\(slug\)/.test(api)) out.push(`${P9G_FILES.appears}: the passages aren't only the six cards' "Where they appear", while the exception holds`);
  const close = new Date(Date.parse(p.dates.closes));
  if (p.on(close, p.dates) || !p.on(new Date(close.getTime() - 1), p.dates)) out.push(`${P9G_FILES.spoilers}: the exception doesn't end exactly when entries close`);
  // On the challenge's pages people work on the whole story, so nothing is marked as a spoiler (owner, 2026-11-09): no
  // "May spoil later chapters." (or any spoiler mark) in the challenge's code. The reader's own chapter gating stays:
  // "What the book says" on a sheet shows only chapters opened on this device.
  for (const f of p.files) if (MAY_IMPORT.test(f.file) && /may spoil|spoiler mark|spoils:/i.test(stripComments(f.text))) out.push(`${f.file}: marks something as a spoiler on the challenge's pages`);
  const book = stripComments(get(p.files, 'src/components/design-book.tsx') ?? '');
  if (!/quotes\.filter\(\(q\) => q\.chapter <= furthest\)/.test(book) || !/openedChapters\(\)/.test(book)) out.push('src/components/design-book.tsx: the reader\'s chapter gating ("What the book says" only from chapters opened) is gone');
  // Nothing outside the challenge's pages shows these words, and no limit is raised elsewhere.
  for (const f of p.files) if (!MAY_IMPORT.test(f.file) && /^src\//.test(f.file) && IMPORTS_DATA.test(stripComments(f.text))) out.push(`${f.file}: shows the challenge's cards or moments outside the challenge's pages`);
  return out;
}
export { FIRST_LAYER_MAX_CHAPTER };

/** P2m: /challenge goes public only with the cards and the scene lines approved by the owner. */
export function p2mProblems(c: { public: boolean; cardsApproved: boolean; sceneLinesApproved: boolean }, files: Files): string[] {
  const out: string[] = [];
  if (c.public && !c.cardsApproved) out.push('CHALLENGE.public is on, but the character cards (src/lib/challenge/cards.ts) aren\'t approved by the owner (CHALLENGE.cardsApproved)');
  if (c.public && !c.sceneLinesApproved) out.push('CHALLENGE.public is on, but the moments\' titles and scene lines (src/lib/challenge/moments.ts) aren\'t approved by the owner (CHALLENGE.sceneLinesApproved)');
  const view = stripComments(get(files, P9G_FILES.view) ?? '');
  if (!/draft: CHALLENGE\.cardsApproved \? null : W\.draftShort/.test(view)) out.push(`${P9G_FILES.view}: an unapproved card doesn't carry the "Draft wording" mark`);
  return out;
}

/** P6ac: entries as pictures (CHALLENGE.pictureEntries) only while Terms §6e and Privacy §4 describe them. */
export function p6acProblems(on: boolean, terms: { n: number | string; body: (string | string[])[] }[], privacy: { n: number | string; body: (string | string[])[] }[]): string[] {
  if (!on) return [];
  const text = (doc: typeof terms, n: number | string) => (doc.find((s) => String(s.n) === String(n))?.body ?? []).flat().join(' ');
  const out: string[] = [];
  if (!/pictures? of (a challenge character|its characters)/i.test(text(terms, '6e'))) out.push('CHALLENGE.pictureEntries is on, but Terms §6e doesn\'t say a picture of a challenge character is what counts');
  if (!/picture of a challenge character/i.test(text(privacy, 4))) out.push('CHALLENGE.pictureEntries is on, but Privacy §4 doesn\'t describe the pictures you publish for the challenge');
  return out;
}
