import { EPISODE } from '../../config';

/**
 * Episode 1: the opening (owner, 2026-11-24): the outline's rules, with no server code, so the browser's deck and the
 * server's Submit check the same things. Read by src/lib/challenge/episode/outlines.ts (Submit), the comment route
 * (the reply check) and src/components/challenge-episode-make.tsx (the counters and the Submit button).
 */
export type Card = { happens: string; does: string; picture: string | null };
export type Draft = { title: string; cards: Card[]; minuteAfter: number };
export type Outline = { title: string | null; cards: Card[]; minuteAfter: number };

type Dates = { opens: string; closes: string };
const ms = (s: string) => Date.parse(s);

/** Before the window, in it, or after (the window alone; whether it is public is EPISODE.public). */
export function episodePhase(now: Date = new Date(), dates: Dates = EPISODE.dates): 'before' | 'open' | 'closed' {
  const t = now.getTime();
  return t < ms(dates.opens) ? 'before' : t < ms(dates.closes) ? 'open' : 'closed';
}

/** Whether Submit and Withdraw work now: the owner's switch and inside the window. */
export const submissionsOpen = (now: Date = new Date(), pub: boolean = EPISODE.public, dates: Dates = EPISODE.dates) => pub && episodePhase(now, dates) === 'open';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Spaces made plain and trimmed; the words themselves as written. */
export const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
/** For comparing words: lower case, letters and digits only, single spaces. */
export const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const blankDraft = (): Draft => ({ title: '', cards: Array.from({ length: EPISODE.blankCards }, () => ({ happens: '', does: '', picture: null })), minuteAfter: EPISODE.blankMinuteAfter });

/** A card still holding one of the sample deck's halves, word for word (case, spaces and punctuation aside). */
export function holdsSample(card: Pick<Card, 'happens' | 'does'>, sample: readonly { happens: string; does: string }[] = EPISODE.sampleDeck): boolean {
  const halves = new Set(sample.flatMap((s) => [wordsOf(s.happens), wordsOf(s.does)]).filter(Boolean));
  return halves.has(wordsOf(card.happens)) || halves.has(wordsOf(card.does));
}

export type Problem = { card: number | null; why: string };
export const PROBLEMS = {
  noCards: 'Add at least one card.',
  tooMany: (n: number) => `Up to ${n} cards.`,
  empty: 'Each card needs both halves: what happens, and what it does for the viewer.',
  tooLong: (n: number) => `Keep each half to ${n} characters.`,
  sample: "This card still holds the sample deck's words. Write your own.",
  title: (n: number) => `Keep the title to ${n} characters.`,
  line: 'The first-minute line has to sit between cards.',
  picture: "That picture can't be attached.",
} as const;

/**
 * An outline as Submit takes it, or what is wrong. The table's check (studio.outline_cards_ok) holds the same limits;
 * this adds the sample-words rule and gives each problem its card.
 */
export function readOutline(input: unknown, sample: readonly { happens: string; does: string }[] = EPISODE.sampleDeck): { ok: true; outline: Outline } | { ok: false; problems: Problem[] } {
  const o = (input ?? {}) as { title?: unknown; cards?: unknown; minuteAfter?: unknown };
  const problems: Problem[] = [];
  const raw = Array.isArray(o.cards) ? o.cards : [];
  if (!raw.length) problems.push({ card: null, why: PROBLEMS.noCards });
  if (raw.length > EPISODE.maxCards) problems.push({ card: null, why: PROBLEMS.tooMany(EPISODE.maxCards) });
  const cards: Card[] = raw.slice(0, EPISODE.maxCards).map((c, i) => {
    const x = (c ?? {}) as { happens?: unknown; does?: unknown; picture?: unknown };
    const happens = typeof x.happens === 'string' ? tidy(x.happens) : '';
    const does = typeof x.does === 'string' ? tidy(x.does) : '';
    const picture = typeof x.picture === 'string' && UUID.test(x.picture) ? x.picture : null;
    if (x.picture !== undefined && x.picture !== null && picture === null) problems.push({ card: i, why: PROBLEMS.picture });
    if (!happens || !does) problems.push({ card: i, why: PROBLEMS.empty });
    else if ([...happens].length > EPISODE.cardMaxChars || [...does].length > EPISODE.cardMaxChars) problems.push({ card: i, why: PROBLEMS.tooLong(EPISODE.cardMaxChars) });
    else if (holdsSample({ happens, does }, sample)) problems.push({ card: i, why: PROBLEMS.sample });
    return { happens, does, picture };
  });
  const title = typeof o.title === 'string' ? tidy(o.title) : '';
  if ([...title].length > EPISODE.titleMaxChars) problems.push({ card: null, why: PROBLEMS.title(EPISODE.titleMaxChars) });
  const minuteAfter = typeof o.minuteAfter === 'number' && Number.isInteger(o.minuteAfter) ? o.minuteAfter : -1;
  if (minuteAfter < 0 || minuteAfter > cards.length) problems.push({ card: null, why: PROBLEMS.line });
  return problems.length ? { ok: false, problems } : { ok: true, outline: { title: title || null, cards, minuteAfter } };
}

/** Move one item of a list from one place to another (the deck's drag and its ↑ ↓ buttons), keeping the line where it was relative to the cards around it. */
export function moveCard(d: Draft, from: number, to: number): Draft {
  if (from === to || from < 0 || to < 0 || from >= d.cards.length || to >= d.cards.length) return d;
  const cards = d.cards.slice();
  const [c] = cards.splice(from, 1);
  cards.splice(to, 0, c);
  return { ...d, cards };
}

/**
 * The AI comment's reply check (owner, 2026-11-24: "the server blocks an AI comment that quotes new wording at
 * length"). A reply is blocked when it holds a quoted passage (between straight or curly quotes, or after a card-like
 * label such as "What happens:", "Card 3:", "Try:" or "Rewrite:") of `min` words or more whose words don't all
 * appear, in order, in the outline. Quoting the person's own cards back is fine; suggesting new card wording is not.
 */
export function quotesNewWording(reply: string, outline: Pick<Outline, 'title' | 'cards'>, min: number = EPISODE.commentQuoteWords): string | null {
  const own = ` ${[outline.title ?? '', ...outline.cards.flatMap((c) => [c.happens, c.does])].map(wordsOf).join(' | ')} `;
  const spans: string[] = [];
  for (const m of reply.matchAll(/"([^"\n]{3,})"|“([^”\n]{3,})”|‘([^’\n]{3,})’|«([^»\n]{3,})»/g)) spans.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  for (const m of reply.matchAll(/^\s*(?:[-*•]\s*)?(?:\*\*)?(?:card\s*\d+|what happens|what it does(?: for the viewer)?|happens|does|try|rewrite|instead|suggested(?: wording)?|new (?:card|line|wording)|for example|e\.g\.)(?:\*\*)?\s*[:–—-]\s*(.+)$/gim)) spans.push(m[1]);
  for (const s of spans) {
    const w = wordsOf(s);
    if (w.split(' ').filter(Boolean).length >= min && !own.includes(` ${w} `)) return s.trim();
  }
  return null;
}
