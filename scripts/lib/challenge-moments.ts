/**
 * The remix challenge's moments and cards (branch challenge-moments, owner 2026-11-05), as pure checks, so
 * check:principles runs them on the files and scripts/test-challenge-moments.ts proves each is narrow on planted faults.
 *
 * - P9g: principle 9's recorded exception for the challenge (owner, 2026-11-05, answer 1, approved).
 * - P2m: the agent-drafted cards and scene lines are approved before /challenge goes public (answer 2).
 * - P6ac: entries as pictures only once Terms §6e and Privacy say so (legal texts describe today).
 */
import type { CharacterCard } from '../../src/lib/challenge/cards';
import type { Moment } from '../../src/lib/challenge/moments';
import { quoteProblems } from '../../src/lib/challenge/book-quotes';
import { cardQuotes, cardShapeProblems, FIRST_LAYER_MAX_CHAPTER } from '../../src/lib/challenge/cards';
import { momentShapeProblems } from '../../src/lib/challenge/moments';

export type Files = { file: string; text: string }[];
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const get = (files: Files, f: string) => files.find((x) => x.file === f)?.text ?? null;

/** The files P9g reads (besides the data): the challenge's code, and every page and component (for imports). */
export const P9G_FILES = {
  card: 'src/components/challenge-card.tsx',
  view: 'src/lib/challenge/view.ts',
  appears: 'src/app/api/challenge/appears/route.ts',
  spoilers: 'src/lib/challenge/spoilers.ts',
  wording: 'src/lib/challenge/landing-wording.ts',
  make: 'src/components/challenge-make.tsx',
  makeApi: 'src/app/api/challenge/make/route.ts',
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
}): string[] {
  const out: string[] = [];
  // Only the six characters' cards and the curated moments, and every quote word for word at its block.
  const mq = p.moments.flatMap((m) => m.quotes.map((q) => ({ where: `moment ${m.id}`, block: q.block, text: q.text })));
  out.push(...quoteProblems([...mq, ...cardQuotes(p.cards)], p.blocks));
  out.push(...cardShapeProblems(p.cards, p.characters), ...momentShapeProblems(p.moments, p.characters));
  // The deeper layers say "May spoil later chapters.", inside the second layer, before anything in it.
  const words = get(p.files, P9G_FILES.wording) ?? '';
  if (!/spoil: 'May spoil later chapters\.'/.test(words)) out.push(`${P9G_FILES.wording}: the deeper layers' line isn't "May spoil later chapters."`);
  const card = stripComments(get(p.files, P9G_FILES.card) ?? '');
  const more = card.indexOf('className="cc-more"');
  const spoil = card.indexOf('<p className="cc-spoil">{w.spoil}</p>');
  if (more < 0 || spoil < more || card.indexOf('{c.more.description}') < spoil) out.push(`${P9G_FILES.card}: the second layer doesn't open with "May spoil later chapters." (w.spoil) before its description`);
  const toggle = card.indexOf('onClick={toggleAppears}');
  if (!/const toggleAppears = \(\) => \{[\s\S]*?[fF]etch\(`\/api\/challenge\/appears\?/.test(card) || toggle < more || card.lastIndexOf('toggleAppears') !== toggle + 'onClick={'.length) out.push(`${P9G_FILES.card}: "Where they appear" isn't fetched from inside the second layer when opened`);
  // Every moment chip shows its chapter.
  if (!/\{m\.title\} <span className="cc-chip-ch">· \{m\.chip\}<\/span>/.test(card)) out.push(`${P9G_FILES.card}: a moment chip doesn't show its chapter (m.chip)`);
  const make = get(p.files, P9G_FILES.make);
  if (make !== null && !/\{m\.title\} <span className="cc-chip-ch">· \{m\.chip\}<\/span>/.test(stripComments(make))) out.push(`${P9G_FILES.make}: a moment chip on the remix screen doesn't show its chapter (m.chip)`);
  const makeApi = get(p.files, P9G_FILES.makeApi);
  if (makeApi !== null && (stripComments(makeApi).match(/!spoilerExceptionOn\(\)/g) ?? []).length < 2) out.push(`${P9G_FILES.makeApi}: the remix screen's moments don't end with the exception (spoilerExceptionOn, GET and POST)`);
  const view = stripComments(get(p.files, P9G_FILES.view) ?? '');
  if (!/chip: chapterChip\(m\)/.test(view)) out.push(`${P9G_FILES.view}: the moments' chips aren't "Ch N" (chapterChip)`);
  // The exception ends when entries close: the view and the passages API ask spoilerExceptionOn.
  if (!/spoilerExceptionOn\(\)/.test(view) || !/more: spoilers \?/.test(view) || !/moments: \(spoilers \?/.test(view)) out.push(`${P9G_FILES.view}: the deeper layers and the moments don't end with the exception (spoilerExceptionOn)`);
  const api = stripComments(get(p.files, P9G_FILES.appears) ?? '');
  if (!/!spoilerExceptionOn\(\)/.test(api) || !/card\.appears\.map/.test(api) || !/CHALLENGE\.characters\.includes\(slug\)/.test(api)) out.push(`${P9G_FILES.appears}: the passages aren't only the six cards' "Where they appear", while the exception holds`);
  const close = new Date(Date.parse(p.dates.closes));
  if (p.on(close, p.dates) || !p.on(new Date(close.getTime() - 1), p.dates)) out.push(`${P9G_FILES.spoilers}: the exception doesn't end exactly when entries close`);
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
