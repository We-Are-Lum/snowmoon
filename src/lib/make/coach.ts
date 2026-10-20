import type postgres from 'postgres';
import { CHAT } from '../config';
import { renderMarkdown } from '../render';
import { blocksById, labels, retrieve, type Passage } from '../chat/retrieve';
import { sanitizeReply, type Part } from '../chat/sanitize';
import { worstCaseUsd } from '../chat/limits';
import { recordCoach, releaseCoach, reserveCoach } from './limits';
import type { Complete, Quote } from '../chat/ask';
import { checkNoWriting } from './no-writing';
import { cleanDraft, MAKE, ownWords, type Draft } from './draft';
import { castText, pronounSlips } from './cast';
import { dropBrokenCites, normaliseCites } from './cites';

/**
 * The coach in "Make your own" (owner's long run 2, item 5). It reuses the reading assistant: the same model and
 * guard model (CHAT.model, CHAT.guardModel), the same route to them (src/lib/chat/model.ts), the same spoiler limit
 * and book search, and the same citation handling (quotes come from the database, never the model). Its limits are
 * its own (src/lib/make/limits.ts; owner, 2026-10-19): 50 messages a day (10 for a wallet that has never paid) and
 * $1 a day across everyone, with its own cost rows. A reply refused after the retry isn't counted against the day,
 * but its model calls count toward the $1.
 * Signed in with Farcaster or a wallet (owner, 2026-10-19: "open to wallet accounts").
 *
 * Owner's rule: "can cite the book, but never writes prose, dialogue or narration", and (2026-10-19) "coach may suggest
 * visual details as questions or options, never written description". Every reply passes two checks
 * before anyone sees it: the pattern check (src/lib/make/no-writing.ts), then the guard model with
 * config/prompts/make-guard.md. A flagged reply is never shown or sent back; one retry with a reminder, then a
 * decline. A reply that gets a character's pronoun wrong (src/lib/make/cast.ts, from the book) is handled the same
 * way, with its own reminder, and only block ids found in the book's text are shown (src/lib/make/cites.ts). Nothing about the message or the reply is stored here; the device keeps the conversation.
 */
export type Stage = 'talk' | 'beats' | 'storyboard';

const STAGES: Record<Stage, string> = {
  talk: 'they are talking their idea through. Ask about what the characters want, what is at stake, where the tension is, and how it could be shown rather than said. Don\'t suggest beats.',
  beats: 'they are writing their beats, in their own words. Give notes on the beats they wrote: what each one does, what repeats, what is missing, where the turn is. Never write a beat or reword one.',
  storyboard: 'they are writing a text storyboard: for each beat, shots with a shot type, who\'s in frame, what we see and the line. Give notes on their shots: whether the shot type shows what the beat needs, who we should be looking at, what the audience learns. Never write a shot, what we see, or a line. You may suggest a visual detail only as a question or as short options for them to choose from.',
};

export interface CoachInput {
  stage: Stage;
  message: string;
  draft: Draft;
  history?: { role: 'user' | 'assistant'; text: string }[];
}

export type CoachResult =
  | { state: 'note'; parts: Part[]; quotes: Quote[]; left: number; checks: { pattern: 'ok'; guard: 'ok' | 'none' }; regenerated: boolean }
  | { state: 'declined'; why: 'writing' | 'pronouns'; left: number }
  | { state: 'limit'; perDay: number }
  | { state: 'spend' };

export interface CoachDeps {
  sql: postgres.Sql;
  /** A FID, or minus a wallet account's number (getPerson). */
  person: number;
  complete: Complete;
  systemPrompt: string;
  guardPolicy: string;
  reminder: string;
  /** Sent before the retry when the reply got a character's pronoun wrong (config/prompts/make-pronouns.md). */
  pronounReminder: string;
}

export class CoachError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const ANSWER_TOKENS = 900;
const GUARD_TOKENS = 1500;
type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export function validateCoach(raw: unknown): CoachInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const stage = String(r.stage) as Stage;
  if (!(stage in STAGES)) throw new CoachError('No such step.');
  const message = String(r.message ?? '').trim();
  if (!message) throw new CoachError('Say something first.');
  if (message.length > MAKE.messageMax) throw new CoachError(`Keep it under ${MAKE.messageMax} characters.`);
  let draft: Draft;
  try {
    draft = cleanDraft(r.draft);
  } catch (e) {
    throw new CoachError((e as Error).message);
  }
  const history = (Array.isArray(r.history) ? r.history : [])
    .filter((h): h is { role: 'user' | 'assistant'; text: string } => !!h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .slice(-CHAT.historyTurns)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 2000) }));
  return { stage, message, draft, history };
}

/** What the person has written so far, as the coach reads it. Labelled as theirs. */
function draftText(d: Draft): string {
  const lines = [`Their idea: ${d.idea || '(not written yet)'}`];
  if (d.beats.length) lines.push('Their beats:', ...d.beats.map((b, i) => `- beat ${i + 1}: ${b}`));
  if (d.shots.length)
    lines.push('Their shots:', ...d.shots.map((s, i) => `- shot ${i + 1} (beat ${s.beat + 1}, ${s.type}): in frame: ${s.who || '-'}; we see: ${s.see || '-'}; line: ${s.line || '-'}`));
  return lines.join('\n');
}

const passagesText = (ps: Passage[]) => ps.map((p) => `[${p.id}] ${p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`).join('\n');

export async function coach(deps: CoachDeps, raw: unknown): Promise<CoachResult> {
  const input = validateCoach(raw);
  const { sql, person } = deps;
  // Worst case: two replies (the retry) and four guard calls (each may be asked twice).
  const slot = await reserveCoach(sql, person, worstCaseUsd(2 * ANSWER_TOKENS, 4 * GUARD_TOKENS, 20000));
  if (!slot.ok) return slot.reason === 'limit' ? { state: 'limit', perDay: slot.perDay ?? MAKE.coachPerDay } : { state: 'spend' };

  const limit = input.draft.upTo;
  const { passages } = await retrieve(sql, `${input.message} ${input.draft.idea}`.slice(0, 600), limit).catch((e) => {
    throw new CoachError((e as Error).message);
  });
  const own = ownWords(input.draft, [input.message, ...input.history!.filter((h) => h.role === 'user').map((h) => h.text)]);
  const messages: Message[] = [
    { role: 'system', content: deps.systemPrompt.replace('{{STAGE}}', STAGES[input.stage]).replace('{{LIMIT}}', String(limit)).replace('{{CAST}}', castText(limit)) },
    ...input.history!.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: `${draftText(input.draft)}\n\nPassages from chapters 1–${limit}:\n${passagesText(passages) || '(none)'}\n\nThey say: ${input.message}` },
  ];
  const allowed = new Set(passages.map((p) => p.id));

  let reply = await replyOnce(deps, messages, allowed);
  let verdict = await check(deps, input.message, reply.shown, own);
  let regenerated = false;
  if (verdict.verdict === 'flagged') {
    regenerated = true;
    const reminder = verdict.why === 'pronouns' ? deps.pronounReminder : deps.reminder;
    reply = await replyOnce(deps, [...messages, { role: 'user', content: reminder.replace('{{REASON}}', verdict.reason) }], allowed);
    verdict = await check(deps, input.message, reply.shown, own);
  }
  // Refused after the retry: not counted against their day (owner, 2026-10-19); the model calls stay in the spend.
  if (verdict.verdict === 'flagged') {
    await releaseCoach(sql, person, slot.at);
    return { state: 'declined', why: verdict.why, left: slot.left + 1 };
  }

  const blocks = await blocksById(sql, reply.cites, limit);
  const label = await labels(sql, blocks.map((b) => b.chapter));
  const quotes: Quote[] = blocks.map((b) => ({
    id: b.id,
    chapter: b.chapter,
    label: label.get(b.id) ?? null,
    html: b.kind === 'paragraph' || b.kind === 'quote' ? renderMarkdown(b) : b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
  const found = new Set(quotes.map((q) => q.id));
  return {
    state: 'note',
    parts: reply.parts.filter((p) => p.type === 'text' || found.has(p.id)),
    quotes,
    left: slot.left,
    checks: { pattern: 'ok', guard: verdict.verdict === 'ok' ? 'ok' : 'none' },
    regenerated,
  };
}

async function replyOnce(deps: CoachDeps, messages: Message[], allowed: Set<string>) {
  const r = await deps.complete(CHAT.model, messages, { maxTokens: ANSWER_TOKENS, temperature: 0.5 });
  await recordCoach(deps.sql, { kind: 'answer', model: r.model, provider: r.provider, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd });
  const clean = sanitizeReply(normaliseCites(r.text), allowed);
  const { parts, dropped } = dropBrokenCites(clean.parts);
  return { ...clean, parts, dropped: [...clean.dropped, ...dropped], raw: r.text, shown: parts.map((p) => (p.type === 'text' ? p.text : `[${p.id}]`)).join('') };
}

/**
 * Both checks, with the pronoun check (no cost) between them. The pattern check reads the reply as the model wrote it, so a quoted line the citation cleaner
 * would have cut is still caught; the guard model reads it as the person would see it. The guard fails closed:
 * no verdict after two tries counts as flagged, unlike the reading assistant, because here a miss would put
 * writing in front of someone making their own work.
 */
type Verdict = { verdict: 'ok'; why?: undefined; reason: '' } | { verdict: 'flagged'; why: 'writing' | 'pronouns'; reason: string };

async function check(deps: CoachDeps, message: string, shown: string, own: string): Promise<Verdict> {
  const p = checkNoWriting(shown, own);
  if (!p.ok) return { verdict: 'flagged', why: 'writing', reason: `it wrote ${p.reasons.map((r) => r.reason).join(', ')} text` };
  const slips = pronounSlips(shown);
  if (slips.length) return { verdict: 'flagged', why: 'pronouns', reason: slips.map((s) => `it called ${s.name} "${s.wrote}"; the book uses ${s.pronoun} for ${s.name}`).join('; ') };
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await deps.complete(
      CHAT.guardModel,
      [
        { role: 'system', content: deps.guardPolicy },
        { role: 'user', content: `THE PERSON'S OWN TEXT:\n${own.slice(0, 6000)}\n\nTHE PERSON SAYS:\n${message}\n\nCOACH REPLY:\n${shown}` },
      ],
      { maxTokens: GUARD_TOKENS, temperature: 0 },
    );
    const first = g.text.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
    const verdict = first.startsWith('VIOLATION') ? 'flagged' : first.startsWith('OK') ? 'ok' : 'none';
    await recordCoach(deps.sql, { kind: 'guard', model: g.model, provider: g.provider, promptTokens: g.promptTokens, completionTokens: g.completionTokens, costUsd: g.costUsd, guard: verdict });
    if (verdict === 'ok') return { verdict: 'ok', reason: '' };
    if (verdict === 'flagged') return { verdict: 'flagged', why: 'writing', reason: g.text.trim().slice(first.length).replace(/^[\s:.-]+/, '').slice(0, 200) || 'it wrote for them' };
  }
  return { verdict: 'flagged', why: 'writing', reason: 'the check gave no verdict' };
}
