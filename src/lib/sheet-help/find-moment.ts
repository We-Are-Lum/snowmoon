import type postgres from 'postgres';
import { CHAT, SHEET_HELP } from '../config';
import { labels, retrieve as bookSearch, type Retrieved } from '../chat/retrieve';
import { worstCaseUsd } from '../chat/limits';
import type { Complete } from '../chat/ask';
import { CAST } from '../make/cast';
import { fillFromSearch, screenPicks, type Moment, type SearchedBlock } from '../moments/picks';
import { recordHelp, reserveHelp } from './limits';
import { GUARD_TOKENS } from './help';

/**
 * "Find a moment", a tab of "Ask for help" (docs/proposals/remix-moments.md §2; the owner's decisions of 2026-11-04:
 * ships with the 12 Nov release WITHOUT attaching, only "Make an image here" and "Read it"; keeps the AI "why" as one
 * line labelled as AI, never in quote marks, never stored; "Set in the book" comes after 22 Nov).
 *
 * The person describes a mood and names a character. Then:
 * 1. One of their "Ask for help" messages is taken (reserveHelp: the same 20 a day and the same $1 a day; the worst
 *    case of a search is reserved before any call). No count of its own.
 * 2. The coach's search-terms step (config/prompts/chat-search-terms.md) lists words a matching passage would use.
 *    They are searched with the mood and the character's name, never shown or kept.
 * 3. Book search (src/lib/chat/retrieve.ts) within the limit: the furthest chapter the device has opened, or 32 only
 *    when the person turned on "include later chapters" (off each time the panel opens). No floor at the character's
 *    first chapter: if they first appear past the limit, it says so and nothing is counted.
 * 4. The model picks 3 to 5 of those passages (config/prompts/find-moment.md), each with an optional "why".
 * 5. Every pick is checked (src/lib/moments/picks.ts): from the search results only, within the limit, the book's
 *    exact words by checkMomentQuote. A failed quote is dropped and never shown. Each why passes the pattern checks
 *    (no quote marks, no run of the book's words, no story text, the book's pronouns); then the whys still shown go to
 *    the guard model (the "Ask for help" flow: CHAT.guardModel, failing closed, config/prompts/find-moment-guard.md).
 * 6. Fewer than 3 picks, or the guard flagging the whys: one retry with a reminder. Still flagged: the whys are left
 *    out (the quotes are the book's words, already checked). Still fewer than 3: filled from the top search hits'
 *    first whole sentence, labelled "From search", with no why.
 * Nothing about the mood, the picks or the whys is stored.
 */
export interface MomentInput {
  /** The character's slug (one of the book's cast). */
  character: string;
  mood: string;
  /** The furthest chapter opened on this device, clamped to 1–32. No floor at the character's first chapter. */
  upTo: number;
  /** "Include chapters past Chapter N": true only when the person turned it on for this search. */
  pastLimit: boolean;
}

export type MomentResult =
  | { state: 'moments'; moments: (Moment & { label: number | null })[]; limit: number; upTo: number; heldBack: boolean; left: number; regenerated: boolean; dropped: number; whys: 'ok' | 'left-out' | 'none' }
  | { state: 'not-yet'; name: string; firstChapter: number; upTo: number }
  | { state: 'none'; heldBack: boolean; left: number }
  | { state: 'limit'; perDay: number }
  | { state: 'spend' };

export interface MomentDeps {
  sql: postgres.Sql;
  fid: number;
  complete: Complete;
  systemPrompt: string;
  /** The coach's search-terms prompt (chat-search-terms.md); empty to skip the step. */
  searchPrompt: string;
  guardPolicy: string;
  /** Sent before the one retry; {{REASON}} is what the checks found. */
  reminder: string;
  retrieve?: (sql: postgres.Sql, query: string, limit: number) => Promise<Retrieved>;
  who: { name: string; firstChapter: number };
}

export class MomentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const SEARCH_TOKENS = 300;
export const PICK_TOKENS = 900;
const INPUT_TOKENS = 19000;
type Message = { role: 'system' | 'user' | 'assistant'; content: string };

/** The worst case of one search, reserved before any call: search terms, two picks (the retry) and four guard calls. */
export const momentWorstUsd = () => worstCaseUsd(SEARCH_TOKENS + 2 * PICK_TOKENS, 4 * GUARD_TOKENS, INPUT_TOKENS);

/** The book's last chapter: the limit with "include later chapters". */
export const LAST_CHAPTER = 32;

export function validateMoment(raw: unknown, characters: { slug: string }[], fallback: string): MomentInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mood = String(r.mood ?? '').trim();
  if (!mood) throw new MomentError('Describe a mood or a situation first.');
  if (mood.length > SHEET_HELP.moment.moodMax) throw new MomentError(`Keep it under ${SHEET_HELP.moment.moodMax} characters.`);
  const asked = typeof r.character === 'string' && r.character ? r.character : fallback;
  if (!characters.some((c) => c.slug === asked)) throw new MomentError('Choose one of the book’s characters.');
  const n = Math.floor(Number(r.upTo));
  const upTo = Math.min(LAST_CHAPTER, Math.max(1, Number.isFinite(n) ? n : 1));
  return { character: asked, mood, upTo, pastLimit: r.pastLimit === true };
}

const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const fill = (s: string, name: string, pronoun: string, limit: number) =>
  s
    .replaceAll('{{CHARACTER}}', name)
    .replaceAll('{{PRONOUN}}', pronoun)
    .replaceAll('{{LIMIT}}', String(limit))
    .replaceAll('{{MIN}}', String(SHEET_HELP.moment.min))
    .replaceAll('{{MAX}}', String(SHEET_HELP.moment.max))
    .replaceAll('{{WHY_MAX_WORDS}}', String(SHEET_HELP.moment.whyMaxWords));

export async function findMoment(deps: MomentDeps, input: MomentInput): Promise<MomentResult> {
  const { sql, fid } = deps;
  // Farcaster accounts only, like "Ask for help" (owner, 2026-11-04): Privacy §5 says "Under your Farcaster ID".
  if (!Number.isInteger(fid) || fid <= 0) throw new MomentError('Sign in with Farcaster to ask for help', 401);
  const M = SHEET_HELP.moment;
  const limit = input.pastLimit ? LAST_CHAPTER : input.upTo;
  // Never a floor at the character's first chapter: that would serve passages the person hasn't read.
  if (deps.who.firstChapter > limit) return { state: 'not-yet', name: deps.who.name, firstChapter: deps.who.firstChapter, upTo: input.upTo };

  const slot = await reserveHelp(sql, fid, momentWorstUsd());
  if (!slot.ok) return slot.reason === 'limit' ? { state: 'limit', perDay: SHEET_HELP.perDay } : { state: 'spend' };

  const terms = CHAT.searchTerms && deps.searchPrompt ? await searchTerms(deps, `${deps.who.name}: ${input.mood}`) : '';
  const search = deps.retrieve ?? ((s: postgres.Sql, q: string, l: number) => bookSearch(s, q, l, [], { hits: M.hits }));
  const found = await search(sql, `${deps.who.name} ${input.mood} ${terms}`.slice(0, 600), limit).catch((e: Error) => {
    throw new MomentError(e.message);
  });
  // Only paragraphs and quotes, only within the limit (search already keeps to it; this is a second guard).
  const ranked: SearchedBlock[] = found.passages.filter((p) => (p.kind === 'paragraph' || p.kind === 'quote') && p.chapter <= limit);
  if (!ranked.length) return { state: 'none', heldBack: found.heldBack, left: slot.left };
  const passages = new Map(ranked.map((p) => [p.id, p]));

  const cast = CAST.find((c) => c.slug === input.character);
  const pronoun = cast?.pronoun ? `the book uses "${cast.pronoun}" for ${cast.name}` : `the book gives no pronoun for ${deps.who.name}: use the name`;
  const messages: Message[] = [
    { role: 'system', content: fill(deps.systemPrompt, deps.who.name, pronoun, limit) },
    {
      role: 'user',
      content: [`Passages from chapters 1–${limit}:`, ranked.map((p) => `[${p.id}] ${plain(p.content)}`).join('\n'), '', `Character: ${deps.who.name}`, `They describe: ${input.mood}`].join('\n'),
    },
  ];
  const opts = { limit, upTo: input.upTo, max: M.max };

  const attempt = async (msgs: Message[]) => {
    const text = await pickOnce(deps, msgs);
    const c = screenPicks(text, passages, { ...opts, maxWords: M.whyMaxWords, runWords: M.copyRunWords }, input.mood);
    const guard = await guardWhys(deps, input.mood, c.moments);
    return { moments: c.moments, dropped: c.dropped.length + c.bad, reasons: [...c.dropped.map((d) => `${d.id}: ${d.reason}`), ...c.whyDropped.map((d) => `${d.id} reason: ${d.reason}`)], guard };
  };

  let best = await attempt(messages);
  let regenerated = false;
  if (best.moments.length < M.min || best.guard.verdict === 'flagged') {
    regenerated = true;
    const reason =
      best.guard.verdict === 'flagged'
        ? `a reason was flagged (${best.guard.reason})`
        : `only ${best.moments.length} of your lines were whole sentences copied exactly from a passage given${best.reasons.length ? ` (${best.reasons.slice(0, 4).join('; ')})` : ''}`;
    const second = await attempt([...messages, { role: 'user', content: fill(deps.reminder, deps.who.name, pronoun, limit).replace('{{REASON}}', reason) }]);
    const dropped = best.dropped + second.dropped;
    best = { ...(second.moments.length >= best.moments.length ? second : best), dropped };
  }
  const whysLeftOut = best.guard.verdict === 'flagged';
  let moments = whysLeftOut ? best.moments.map((m) => ({ ...m, why: null })) : best.moments;
  if (moments.length < M.min) moments = fillFromSearch(moments, ranked, { ...opts, min: M.min });
  const label = await labels(sql, [...new Set(moments.map((m) => m.chapter))]);
  return {
    state: 'moments',
    moments: moments.map((m) => ({ ...m, label: label.get(m.id) ?? null })),
    limit,
    upTo: input.upTo,
    heldBack: found.heldBack,
    left: slot.left,
    regenerated,
    dropped: best.dropped,
    whys: whysLeftOut ? 'left-out' : moments.some((m) => m.why) ? 'ok' : 'none',
  };
}

async function searchTerms(deps: MomentDeps, text: string): Promise<string> {
  const r = await deps.complete(
    CHAT.model,
    [
      { role: 'system', content: deps.searchPrompt },
      { role: 'user', content: text },
    ],
    { maxTokens: SEARCH_TOKENS, temperature: 0 },
  );
  await recordHelp(deps.sql, { kind: 'answer', model: r.model, provider: r.provider, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd });
  return (r.text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).slice(0, 20).join(' ');
}

async function pickOnce(deps: MomentDeps, messages: Message[]): Promise<string> {
  const r = await deps.complete(CHAT.model, messages, { maxTokens: PICK_TOKENS, temperature: 0.3 });
  await recordHelp(deps.sql, { kind: 'answer', model: r.model, provider: r.provider, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd });
  return r.text;
}

/** The guard on the whys still shown (two tries; no verdict counts as flagged). No whys: no call. */
async function guardWhys(deps: MomentDeps, mood: string, moments: Moment[]): Promise<{ verdict: 'ok' | 'skip' } | { verdict: 'flagged'; reason: string }> {
  const whys = moments.filter((m) => m.why);
  if (!whys.length) return { verdict: 'skip' };
  const shown = whys.map((m) => `[${m.id}] ${m.why}`).join('\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await deps.complete(
      CHAT.guardModel,
      [
        { role: 'system', content: deps.guardPolicy },
        { role: 'user', content: `THE PERSON DESCRIBES:\n${mood}\n\nTHE HELPER'S REASONS:\n${shown}` },
      ],
      { maxTokens: GUARD_TOKENS, temperature: 0 },
    );
    const first = g.text.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
    const verdict = first.startsWith('VIOLATION') ? 'flagged' : first.startsWith('OK') ? 'ok' : 'none';
    await recordHelp(deps.sql, { kind: 'guard', model: g.model, provider: g.provider, promptTokens: g.promptTokens, completionTokens: g.completionTokens, costUsd: g.costUsd, guard: verdict });
    if (verdict === 'ok') return { verdict: 'ok' };
    if (verdict === 'flagged') return { verdict: 'flagged', reason: g.text.trim().slice(first.length).replace(/^[\s:.-]+/, '').slice(0, 200) || 'story text' };
  }
  return { verdict: 'flagged', reason: 'the check gave no verdict' };
}
