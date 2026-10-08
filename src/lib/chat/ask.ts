import type postgres from 'postgres';
import { CHAT } from '../config';
import { renderMarkdown } from '../render';
import { blocksById, labels, retrieve, type Passage } from './retrieve';
import { blockIdOk, chapterOf, sanitizeReply, type Part } from './sanitize';
import { record, reserve, worstCaseUsd } from './limits';

/**
 * Ask about the book (slice 1). Private: nothing about the question or the
 * answer is stored here; the device keeps the thread. Dependencies are passed
 * in so the tests can run this against PGlite with a stand-in model.
 */
export interface AskInput {
  question: string;
  /** The last chapter this thread may use: what the reader has read, or more if they opted in. */
  limit: number;
  /** Blocks the reader attached ("ask about this"). */
  attached?: string[];
  /** Earlier turns of this thread, from the device. */
  history?: { role: 'user' | 'assistant'; text: string }[];
}

export interface Quote {
  id: string;
  chapter: number;
  /** The ¶ label readers see, computed from the stored blocks. */
  label: number | null;
  /** The book's own words, rendered from the database. */
  html: string;
}

export type AskResult =
  | { state: 'answer'; parts: Part[]; quotes: Quote[]; heldBack: boolean; left: number; guard: 'ok' | 'none'; dropped: number; regenerated: boolean }
  | { state: 'held'; heldBack: true; left: number }
  | { state: 'declined'; left: number }
  /** The answer's claims were not all supported by the passages it cited: shown as "the passages don't say". */
  | { state: 'unsupported'; heldBack: boolean; left: number }
  | { state: 'limit' }
  | { state: 'spend' };

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type Complete = (
  model: string,
  messages: Message[],
  opts: { maxTokens: number; temperature: number },
) => Promise<{ text: string; promptTokens: number; completionTokens: number; costUsd: number; requestId: string | null; provider: string | null; model: string }>;

export interface AskDeps {
  sql: postgres.Sql;
  fid: number;
  complete: Complete;
  systemPrompt: string;
  guardPolicy: string;
  /** Sent once when the guard flags an answer; the answer is then regenerated (chat-reminder.md). */
  reminder: string;
  /** Turns the question into search words (chat-search-terms.md), when CHAT.searchTerms is on. */
  searchPrompt?: string;
  /** The second guard question (chat-support.md): is every claim supported by its cited passages? */
  supportPolicy?: string;
  /** Embedding search, for evaluation: block ids ranked for this question (see RetrieveOptions.dense). */
  dense?: (question: string, limit: number) => Promise<string[]>;
}

export class AskError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const ANSWER_TOKENS = 1200;
const GUARD_TOKENS = 1500;
const SEARCH_TOKENS = 600;

function passagesText(passages: Passage[]): string {
  return passages.map((p) => `[${p.id}] ${p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`).join('\n');
}

export function validate(input: AskInput): AskInput {
  const question = String(input.question ?? '').trim();
  if (!question) throw new AskError('Ask a question about the book.');
  if (question.length > CHAT.questionMaxChars) throw new AskError(`Keep the question under ${CHAT.questionMaxChars} characters.`);
  const limit = Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 32) throw new AskError('No chapter limit.');
  const attached = (input.attached ?? []).map(String).slice(0, 4);
  for (const id of attached) {
    if (!blockIdOk(id)) throw new AskError(`Not a block: ${id}`);
    if (chapterOf(id)! > limit) throw new AskError(`${id} is past chapter ${limit}, the limit for this thread.`);
  }
  const history = (input.history ?? [])
    .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .slice(-CHAT.historyTurns)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 2000) }));
  return { question, limit, attached, history };
}

export async function ask(deps: AskDeps, raw: AskInput): Promise<AskResult> {
  const input = validate(raw);
  const { sql, fid } = deps;
  // Worst case: search words, two answers (the retry), four guard calls and two support checks (each may be retried once).
  const slot = await reserve(sql, fid, worstCaseUsd(2 * ANSWER_TOKENS + SEARCH_TOKENS, 6 * GUARD_TOKENS, 24000));
  if (!slot.ok) return { state: slot.reason };

  let retrieved;
  try {
    const terms = CHAT.searchTerms && deps.searchPrompt ? await searchTerms(deps, input.question) : '';
    const dense = deps.dense ? await deps.dense(input.question, input.limit) : undefined;
    retrieved = await retrieve(sql, terms ? `${input.question} ${terms}` : input.question, input.limit, input.attached, dense ? { dense } : {});
  } catch (e) {
    throw new AskError((e as Error).message);
  }
  const { passages, heldBack } = retrieved;
  if (!passages.length && heldBack) return { state: 'held', heldBack: true, left: slot.left };

  const messages: Message[] = [
    { role: 'system', content: deps.systemPrompt.replace('{{LIMIT}}', String(input.limit)) },
    ...input.history!.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: `Passages from chapters 1–${input.limit}:\n${passagesText(passages)}\n\nQuestion: ${input.question}` },
  ];
  const allowed = new Set(passages.map((p) => p.id));

  // Answer, then the guard; on a flag, one retry with a reminder. The flagged answer is never shown or sent back.
  let clean = await answerOnce(deps, messages, allowed);
  let verdict = await guard(deps, input.question, clean.shown);
  let regenerated = false;
  if (verdict.verdict === 'flagged') {
    regenerated = true;
    const reminder = deps.reminder.replace('{{REASON}}', verdict.reason || 'it read as writing for them');
    clean = await answerOnce(deps, [...messages, { role: 'user', content: reminder }], allowed);
    verdict = await guard(deps, input.question, clean.shown);
  }
  if (verdict.verdict === 'flagged') return { state: 'declined', left: slot.left };

  // Quotes come from the database, by id, never from the model's words.
  const blocks = await blocksById(sql, clean.cites, input.limit);
  const label = await labels(sql, blocks.map((b) => b.chapter));
  const quotes: Quote[] = blocks.map((b) => ({
    id: b.id,
    chapter: b.chapter,
    label: label.get(b.id) ?? null,
    html: b.kind === 'paragraph' || b.kind === 'quote' ? renderMarkdown(b) : b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
  const found = new Set(quotes.map((q) => q.id));

  // The second guard question: every claim supported by the passages it cites? If not, or no verdict, it isn't shown.
  if (deps.supportPolicy) {
    const supported = await supportCheck(deps, input.question, clean.shown, blocks, input.limit);
    if (!supported) return { state: 'unsupported', heldBack, left: slot.left };
  }
  const parts = clean.parts.filter((p) => p.type === 'text' || found.has(p.id));
  return {
    state: 'answer',
    parts,
    quotes,
    heldBack,
    left: slot.left,
    guard: verdict.verdict === 'ok' ? 'ok' : 'none',
    regenerated,
    dropped: clean.dropped.length + clean.cites.filter((c) => !found.has(c)).length,
  };
}

/** One answer from the model, cleaned: citations checked, the model's own quotations removed. Recorded with no text. */
async function answerOnce(deps: AskDeps, messages: Message[], allowed: Set<string>) {
  const answer = await deps.complete(CHAT.model, messages, { maxTokens: ANSWER_TOKENS, temperature: 0.4 });
  await record(deps.sql, {
    kind: 'answer', model: answer.model, provider: answer.provider,
    promptTokens: answer.promptTokens, completionTokens: answer.completionTokens, costUsd: answer.costUsd,
  });
  const clean = sanitizeReply(answer.text, allowed);
  // The guard reads the answer as the person would see it, citations and all.
  return { ...clean, shown: clean.parts.map((p) => (p.type === 'text' ? p.text : `[${p.id}]`)).join('') };
}

/** The guard's verdict on one answer; an empty verdict is asked again once. */
async function guard(deps: AskDeps, question: string, shown: string): Promise<{ verdict: 'ok' | 'flagged' | 'none'; reason: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await deps.complete(
      CHAT.guardModel,
      [
        { role: 'system', content: deps.guardPolicy },
        { role: 'user', content: `USER REQUEST:\n${question}\n\nASSISTANT REPLY:\n${shown}` },
      ],
      { maxTokens: GUARD_TOKENS, temperature: 0 },
    );
    const text = g.text.trim();
    const first = text.split(/\s+/)[0]?.toUpperCase() ?? '';
    const verdict = first.startsWith('VIOLATION') ? 'flagged' : first.startsWith('OK') ? 'ok' : 'none';
    await record(deps.sql, {
      kind: 'guard', model: g.model, provider: g.provider,
      promptTokens: g.promptTokens, completionTokens: g.completionTokens, costUsd: g.costUsd, guard: verdict,
    });
    if (verdict !== 'none') return { verdict, reason: verdict === 'flagged' ? text.slice(first.length).replace(/^[\s:.-]+/, '').slice(0, 200) : '' };
  }
  return { verdict: 'none', reason: '' };
}

/** Words the answering passage is likely to use, for the search only. Letters, digits and hyphens; at most 20 words. */
async function searchTerms(deps: AskDeps, question: string): Promise<string> {
  const r = await deps.complete(
    CHAT.model,
    [
      { role: 'system', content: deps.searchPrompt! },
      { role: 'user', content: question },
    ],
    { maxTokens: SEARCH_TOKENS, temperature: 0 },
  );
  await record(deps.sql, {
    kind: 'search', model: r.model, provider: r.provider,
    promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd,
  });
  return (r.text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).slice(0, 20).join(' ');
}

/**
 * Is every claim in the answer supported by the passages it cites? The guard model reads the
 * answer and the stored text of each cited block, with the block before it as context. Fails
 * closed: no verdict after one retry counts as unsupported. Recorded as a guard call (no text).
 */
async function supportCheck(deps: AskDeps, question: string, shown: string, cited: Passage[], limit: number): Promise<boolean> {
  const before = await blocksById(deps.sql, cited.map((b) => `c${b.chapter}-b${b.idx - 1}`), limit);
  const byId = new Map(before.map((b) => [b.id, b]));
  const passages = cited
    .map((b) => {
      const ctx = byId.get(`c${b.chapter}-b${b.idx - 1}`);
      const plain = (p: Passage) => p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return `${ctx ? `(context, the passage before) ${plain(ctx)}\n` : ''}[${b.id}] ${plain(b)}`;
    })
    .join('\n\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await deps.complete(
      CHAT.guardModel,
      [
        { role: 'system', content: deps.supportPolicy! },
        { role: 'user', content: `QUESTION:\n${question}\n\nCITED PASSAGES:\n${passages || '(none)'}\n\nANSWER:\n${shown}` },
      ],
      { maxTokens: GUARD_TOKENS, temperature: 0 },
    );
    const first = g.text.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
    const verdict = first.startsWith('UNSUPPORTED') ? 'flagged' : first.startsWith('SUPPORTED') ? 'ok' : 'none';
    await record(deps.sql, {
      kind: 'guard', model: g.model, provider: g.provider,
      promptTokens: g.promptTokens, completionTokens: g.completionTokens, costUsd: g.costUsd, guard: verdict,
    });
    if (verdict !== 'none') return verdict === 'ok';
  }
  return false;
}
