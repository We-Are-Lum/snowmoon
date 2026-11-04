import type postgres from 'postgres';
import { CHAT, IMAGES, SHEET_HELP } from '../config';
import { renderMarkdown } from '../render';
import { blocksById, labels, retrieve as bookSearch, type Passage, type Retrieved } from '../chat/retrieve';
import { worstCaseUsd } from '../chat/limits';
import type { Complete, Quote } from '../chat/ask';
import { CAST, pronounSlips } from '../make/cast';
import { checkNote, checkPromptWords } from './no-story';
import { promptParts, refuseProposal, type PartRefusal } from './part';
import { recordHelp, reserveHelp } from './limits';
import { recordServed } from './served';

/**
 * "Ask for help" beside a character sheet's prompt box, during the remix challenge (docs/proposals/sheet-help.md,
 * approved by the owner 2026-10-31). It reuses the Make-your-own coach (src/lib/make/coach.ts): the same model and
 * guard model (CHAT.model, CHAT.guardModel) by the same route (src/lib/chat/model.ts, passed in as `complete`), the
 * book search with quotes taken from the database, the cast's pronouns from the book (src/lib/make/cast.ts), and the
 * retry-then-decline flow. Its own system prompt and guard policy (config/prompts/sheet-help.md, sheet-help-guard.md),
 * and its own limits (src/lib/sheet-help/limits.ts).
 *
 * What the model reads: the person's message, the character's facts from the book (the sheet's "What the book says"
 * and the search's passages, up to the furthest chapter the reader has opened, with no floor: principle 9, P9d),
 * the sheet's prompt draft and the rest of its recipe text. Text only: never the sheet's pictures.
 *
 * Its answer is one proposed change to ONE part of the draft (src/lib/sheet-help/part.ts), shown as before and after,
 * or a short note when it can't help that way (asked to write the whole prompt, or a story line). Every reply passes,
 * before anyone sees it: the format and one-part check, the pattern check (src/lib/sheet-help/no-story.ts), the
 * pronoun check, then the guard model. A flagged reply is never shown or sent back; one retry with a reminder
 * (config/prompts/sheet-help-reminder.md), then a decline. The guard fails closed: no verdict after two tries counts as
 * flagged. A pronoun slip in the retry is a decline too, since the words would go into the prompt.
 * Nothing about the message or the reply is stored; the device keeps the conversation.
 */
export interface HelpInput {
  /** The character's sheet slug (the server finds it from the sheet being remixed, never from the device). */
  character: string;
  message: string;
  /** The sheet's prompt draft: the text box, as it is now. */
  draft: string;
  /** The rest of the recipe text: the style's text, the view lines and the fixed words the site adds. */
  recipe: string;
  /** The furthest chapter opened on this device; at least the character's first. */
  upTo: number;
  history: { role: 'user' | 'assistant'; text: string }[];
}

export type HelpResult =
  | { state: 'proposal'; before: string; after: string; why: string; quotes: Quote[]; left: number; regenerated: boolean; checks: { part: 'ok'; pattern: 'ok'; guard: 'ok' } }
  | { state: 'note'; text: string; quotes: Quote[]; left: number; regenerated: boolean; checks: { pattern: 'ok'; guard: 'ok' } }
  | { state: 'declined'; left: number }
  | { state: 'limit'; perDay: number }
  | { state: 'spend' };

export interface HelpDeps {
  sql: postgres.Sql;
  fid: number;
  complete: Complete;
  systemPrompt: string;
  guardPolicy: string;
  /** Sent before the one retry; {{REASON}} is what the checks found. */
  reminder: string;
  /** The sheet version being remixed (`from`): a served suggestion is recorded for it (src/lib/sheet-help/served.ts). */
  from: string;
  /** The book search; the coach's (src/lib/chat/retrieve.ts) unless a test passes a stand-in. */
  retrieve?: (sql: postgres.Sql, query: string, limit: number) => Promise<Retrieved>;
  /** The character's facts from the book (bookCharacter(slug).quotes); passed in so this file needs no file reads. */
  facts: { chapter: number; idx: number; quote: string }[];
  /** The character's name and first chapter. */
  who: { name: string; firstChapter: number };
}

export class HelpError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const ANSWER_TOKENS = 600;
export const GUARD_TOKENS = 1500;
const INPUT_TOKENS = 20000;
type Message = { role: 'system' | 'user' | 'assistant'; content: string };
const LIMITS = () => ({ partMaxChars: SHEET_HELP.partMaxChars, partMaxWords: SHEET_HELP.partMaxWords, textMaxChars: IMAGES.designs.textMaxChars });

/** The worst case of one message, reserved before any call: two replies (the retry) and four guard calls. */
export const helpWorstUsd = () => worstCaseUsd(2 * ANSWER_TOKENS, 4 * GUARD_TOKENS, INPUT_TOKENS);

/**
 * The chapter limit is the number the reader's device sends: its furthest chapter opened (max(openedChapters())), or
 * later chapters the reader chose for that one thread. There is no floor (principle 9, P9d; owner, 2026-11-04): never
 * the character's first chapter, never a default. A request without a whole number 1–32 is refused.
 */
export function validateHelp(raw: unknown, character: string): HelpInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const message = String(r.message ?? '').trim();
  if (!message) throw new HelpError('Say what you want first.');
  if (message.length > SHEET_HELP.messageMax) throw new HelpError(`Keep it under ${SHEET_HELP.messageMax} characters.`);
  const draft = String(r.draft ?? '');
  if (draft.length > IMAGES.designs.textMaxChars) throw new HelpError('The sheet’s text is too long.');
  const recipe = String(r.recipe ?? '').slice(0, 3000);
  const upTo = typeof r.upTo === 'number' ? r.upTo : NaN;
  if (!Number.isInteger(upTo) || upTo < 1 || upTo > 32) throw new HelpError('No chapter limit.');
  const history = (Array.isArray(r.history) ? r.history : [])
    .filter((h): h is { role: 'user' | 'assistant'; text: string } => !!h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .slice(-SHEET_HELP.historyTurns)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 1200) }));
  return { character, message, draft, recipe, upTo, history };
}

/** The model's reply, read strictly: one change (PART/CHANGE/WHY) or one note (NONE). */
export type Parsed = { kind: 'proposal'; before: string; after: string; why: string } | { kind: 'note'; text: string } | { kind: 'bad'; why: string };

export function parseReply(text: string): Parsed {
  const t = text.replace(/\r/g, '').trim();
  const none = t.match(/^NONE:\s*([\s\S]+)$/);
  if (none) return { kind: 'note', text: none[1].trim() };
  const m = t.match(/^PART:\s*(.*)\nCHANGE:\s*(.*)\nWHY:\s*([\s\S]*)$/);
  if (!m) return { kind: 'bad', why: 'the reply was not one change (PART, CHANGE, WHY) or one note (NONE)' };
  const before = m[1].trim();
  return { kind: 'proposal', before: /^NEW$/i.test(before) ? '' : before.replace(/^["“'](.*)["”']$/, '$1'), after: m[2].trim(), why: m[3].trim() };
}

const PART_REASONS: Record<PartRefusal, string> = {
  'empty-draft': 'the prompt is empty: the person writes it first; never add to an empty prompt',
  'whole-prompt': 'it replaced the whole prompt; change one part of it, never all of it',
  'not-found': 'PART was not copied exactly from the prompt',
  ambiguous: 'PART appears more than once in the prompt; copy enough words to name one place',
  'crosses-parts': 'PART crossed a comma, semicolon or full stop: it changed more than one part',
  'more-than-one-part': 'CHANGE held more than one part (a comma, semicolon, full stop or line break)',
  'too-long': `CHANGE was longer than one part (at most ${SHEET_HELP.partMaxWords} words)`,
  unchanged: 'CHANGE was empty or the same as PART',
  'result-too-long': 'the prompt would be longer than a sheet may be',
};

const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export async function sheetHelp(deps: HelpDeps, input: HelpInput): Promise<HelpResult> {
  const { sql, fid } = deps;
  // Farcaster accounts only (owner, 2026-11-04: Privacy §5 says "Under your Farcaster ID"). A wallet account's number
  // is negative (getPerson), and Lens or Bluesky accounts have no FID; none of them may use it.
  if (!Number.isInteger(fid) || fid <= 0) throw new HelpError('Sign in with Farcaster to ask for help', 401);
  const slot = await reserveHelp(sql, fid, helpWorstUsd());
  if (!slot.ok) return slot.reason === 'limit' ? { state: 'limit', perDay: SHEET_HELP.perDay } : { state: 'spend' };

  const limit = input.upTo;
  const search = deps.retrieve ?? ((s: postgres.Sql, q: string, l: number) => bookSearch(s, q, l));
  const { passages } = await search(sql, `${deps.who.name} ${input.message}`.slice(0, 600), limit).catch((e: Error) => {
    throw new HelpError(e.message);
  });
  const facts = deps.facts.filter((f) => f.chapter <= limit);
  const cast = CAST.find((c) => c.slug === input.character);
  const pronoun = cast?.pronoun ? `the book uses "${cast.pronoun}" for ${cast.name}` : `the book gives no pronoun for ${deps.who.name}: use the name`;
  const parts = promptParts(input.draft);
  const own = [input.draft, input.message, ...input.history.filter((h) => h.role === 'user').map((h) => h.text)].join('\n');
  const messages: Message[] = [
    {
      role: 'system',
      content: deps.systemPrompt
        .replaceAll('{{CHARACTER}}', deps.who.name)
        .replaceAll('{{PRONOUN}}', pronoun)
        .replaceAll('{{LIMIT}}', String(limit))
        .replaceAll('{{PART_MAX_WORDS}}', String(SHEET_HELP.partMaxWords)),
    },
    ...input.history.map((h) => ({ role: h.role, content: h.text })),
    {
      role: 'user',
      content: [
        `What the book says about ${deps.who.name} (chapters 1–${limit}):`,
        facts.map((f) => `[c${f.chapter}-b${f.idx}] ${f.quote}`).join('\n') || '(nothing yet)',
        '',
        `Passages from chapters 1–${limit}:`,
        passages.map((p) => `[${p.id}] ${plain(p.content)}`).join('\n') || '(none)',
        '',
        'The sheet’s prompt, as they wrote it, part by part:',
        parts.length ? parts.map((x, i) => `${i + 1}. ${x}`).join('\n') : '(empty: they have not written it yet)',
        `Exactly as typed: ${input.draft || '(empty)'}`,
        '',
        'The rest of the recipe (added by the site; not theirs to change here):',
        input.recipe || '(none)',
        '',
        `They say: ${input.message}`,
      ].join('\n'),
    },
  ];
  const allowed = new Set([...passages.map((p) => p.id), ...facts.map((f) => `c${f.chapter}-b${f.idx}`)]);

  let parsed = parseReply(await replyOnce(deps, messages));
  let verdict = await check(deps, input, parsed, own);
  let regenerated = false;
  if (verdict.flagged) {
    regenerated = true;
    parsed = parseReply(await replyOnce(deps, [...messages, { role: 'user', content: deps.reminder.replace('{{REASON}}', verdict.reason) }]));
    verdict = await check(deps, input, parsed, own);
  }
  if (verdict.flagged || parsed.kind === 'bad') return { state: 'declined', left: slot.left };

  const note = parsed.kind === 'note' ? parsed.text : parsed.why;
  const { text: shownNote, quotes } = await citations(sql, note, allowed, limit);
  if (parsed.kind === 'note') return { state: 'note', text: shownNote, quotes, left: slot.left, regenerated, checks: { pattern: 'ok', guard: 'ok' } };
  // Served: the server keeps a fingerprint of the suggested words, for the label at publish (never the message).
  await recordServed(sql, fid, deps.from, parsed.after);
  return { state: 'proposal', before: parsed.before, after: parsed.after, why: shownNote, quotes, left: slot.left, regenerated, checks: { part: 'ok', pattern: 'ok', guard: 'ok' } };
}

async function replyOnce(deps: HelpDeps, messages: Message[]): Promise<string> {
  const r = await deps.complete(CHAT.model, messages, { maxTokens: ANSWER_TOKENS, temperature: 0.4 });
  await recordHelp(deps.sql, { kind: 'answer', model: r.model, provider: r.provider, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd });
  return r.text;
}

/** Block ids the note cites: only those given to the model are kept, with the book's own words from the database. */
async function citations(sql: postgres.Sql, note: string, allowed: Set<string>, limit: number): Promise<{ text: string; quotes: Quote[] }> {
  const ids = [...new Set([...note.matchAll(/\[(c\d{1,2}-b\d{1,4})\]/g)].map((m) => m[1]).filter((id) => allowed.has(id)))];
  const blocks = ids.length ? await blocksById(sql, ids, limit) : [];
  const label = await labels(sql, blocks.map((b) => b.chapter));
  const quotes: Quote[] = blocks.map((b: Passage) => ({
    id: b.id,
    chapter: b.chapter,
    label: label.get(b.id) ?? null,
    html: b.kind === 'paragraph' || b.kind === 'quote' ? renderMarkdown(b) : plain(b.content),
  }));
  const found = new Set(quotes.map((q) => q.id));
  const text = note.replace(/\[([^\]]*)\]/g, (all, id: string) => (found.has(id) ? all : '')).replace(/\s{2,}/g, ' ').trim();
  return { text, quotes };
}

type Verdict = { flagged: false } | { flagged: true; why: 'format' | 'part' | 'story' | 'pronouns' | 'guard'; reason: string };

/** Every check, cheapest first; the guard model last, failing closed. */
export async function check(deps: Pick<HelpDeps, 'complete' | 'sql' | 'guardPolicy'>, input: HelpInput, p: Parsed, own: string): Promise<Verdict> {
  if (p.kind === 'bad') return { flagged: true, why: 'format', reason: p.why };
  if (p.kind === 'proposal') {
    const refused = refuseProposal(input.draft, p, LIMITS());
    if (refused) return { flagged: true, why: 'part', reason: PART_REASONS[refused] };
    const w = checkPromptWords(p.after);
    if (!w.ok) return { flagged: true, why: 'story', reason: `CHANGE was not visual prompt text (${w.reasons.map((r) => `${r.reason}: ${r.text}`).join('; ')})` };
  }
  const note = p.kind === 'note' ? p.text : p.why;
  const n = checkNote(note, own);
  if (!n.ok) return { flagged: true, why: 'story', reason: `it wrote ${n.reasons.map((r) => r.reason).join(', ')} text` };
  const slips = pronounSlips(p.kind === 'proposal' ? `${p.after}. ${p.why}` : note);
  if (slips.length) return { flagged: true, why: 'pronouns', reason: slips.map((s) => `it called ${s.name} "${s.wrote}"; the book uses ${s.pronoun} for ${s.name}`).join('; ') };
  const shown = p.kind === 'proposal' ? `PROPOSED CHANGE TO ONE PART:\nreplace: ${p.before || '(nothing: adds one part at the end)'}\nwith: ${p.after}\n\nNOTE:\n${p.why}` : `NOTE:\n${p.text}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await deps.complete(
      CHAT.guardModel,
      [
        { role: 'system', content: deps.guardPolicy },
        { role: 'user', content: `THE PROMPT DRAFT (the person's own words):\n${input.draft.slice(0, 3000) || '(empty)'}\n\nTHE PERSON SAYS:\n${input.message}\n\n${shown}` },
      ],
      { maxTokens: GUARD_TOKENS, temperature: 0 },
    );
    const first = g.text.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
    const verdict = first.startsWith('VIOLATION') ? 'flagged' : first.startsWith('OK') ? 'ok' : 'none';
    await recordHelp(deps.sql, { kind: 'guard', model: g.model, provider: g.provider, promptTokens: g.promptTokens, completionTokens: g.completionTokens, costUsd: g.costUsd, guard: verdict });
    if (verdict === 'ok') return { flagged: false };
    if (verdict === 'flagged') return { flagged: true, why: 'guard', reason: g.text.trim().slice(first.length).replace(/^[\s:.-]+/, '').slice(0, 200) || 'it wrote story text' };
  }
  return { flagged: true, why: 'guard', reason: 'the check gave no verdict' };
}
