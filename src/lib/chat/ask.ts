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
  | { state: 'answer'; parts: Part[]; quotes: Quote[]; heldBack: boolean; left: number; guard: 'ok' | 'none'; dropped: number }
  | { state: 'held'; heldBack: true; left: number }
  | { state: 'declined'; left: number }
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
}

export class AskError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const ANSWER_TOKENS = 1200;
const GUARD_TOKENS = 1500;

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
  const slot = await reserve(sql, fid, worstCaseUsd(ANSWER_TOKENS, GUARD_TOKENS));
  if (!slot.ok) return { state: slot.reason };

  let retrieved;
  try {
    retrieved = await retrieve(sql, input.question, input.limit, input.attached);
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
  const answer = await deps.complete(CHAT.model, messages, { maxTokens: ANSWER_TOKENS, temperature: 0.4 });
  const clean = sanitizeReply(answer.text, new Set(passages.map((p) => p.id)));

  // The guard reads the answer as the person would see it, citations and all.
  const shown = clean.parts.map((p) => (p.type === 'text' ? p.text : `[${p.id}]`)).join('');
  let verdict: 'ok' | 'flagged' | 'none' = 'none';
  for (let attempt = 0; attempt < 2 && verdict === 'none'; attempt++) {
    const g = await deps.complete(
      CHAT.guardModel,
      [
        { role: 'system', content: deps.guardPolicy },
        { role: 'user', content: `USER REQUEST:\n${input.question}\n\nASSISTANT REPLY:\n${shown}` },
      ],
      { maxTokens: GUARD_TOKENS, temperature: 0 },
    );
    await record(sql, { fid, kind: 'guard', model: g.model, provider: g.provider, requestId: g.requestId, promptTokens: g.promptTokens, completionTokens: g.completionTokens, costUsd: g.costUsd });
    const first = g.text.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
    verdict = first.startsWith('VIOLATION') ? 'flagged' : first.startsWith('OK') ? 'ok' : 'none';
  }
  await record(sql, {
    fid, kind: 'answer', model: answer.model, provider: answer.provider, requestId: answer.requestId,
    promptTokens: answer.promptTokens, completionTokens: answer.completionTokens, costUsd: answer.costUsd, guard: verdict,
  });
  if (verdict === 'flagged') return { state: 'declined', left: slot.left };

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
  const parts = clean.parts.filter((p) => p.type === 'text' || found.has(p.id));
  return {
    state: 'answer',
    parts,
    quotes,
    heldBack,
    left: slot.left,
    guard: verdict === 'ok' ? 'ok' : 'none',
    dropped: clean.dropped.length + clean.cites.filter((c) => !found.has(c)).length,
  };
}
