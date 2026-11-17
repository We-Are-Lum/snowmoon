import type postgres from 'postgres';
import { CHAT } from '../config';
import { renderMarkdown } from '../render';
import { blocksById, labels, retrieve, type Passage } from './retrieve';
import { glossaryWords, type GlossaryLink } from './glossary';
import { noteLines, routeQuestion, type Note } from './notes';
import { blockIdOk, chapterOf, sanitizeReply, type Part } from './sanitize';
import { record, reserve, worstCaseUsd } from './limits';

/**
 * Ask about the book (slice 1). Private: nothing about the question or the
 * answer is stored here; the device keeps the thread. Dependencies are passed
 * in so the tests can run this against PGlite with a stand-in model.
 */
export interface AskInput {
  question: string;
  /**
   * The chapter the reader is on (the one opened last on this device), or null when unknown. Only a hint, used only for
   * "where was I" (owner, 2026-11-17); the assistant uses the whole book for every question.
   */
  position?: number | null;
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

/** Glossary entries the question names: the reply points to them first. Absent in replies saved before 2026-10-14. */
type Glossary = { glossary?: GlossaryLink[] };

export type AskResult =
  /** `notes`: one line per kind of reviewed note the answer cites (NOTE_WORDING), shown under it. Absent before 2026-11-17. */
  | ({ state: 'answer'; parts: Part[]; quotes: Quote[]; notes?: string[]; left: number; guard: 'ok' | 'none'; dropped: number; regenerated: boolean } & Glossary)
  | { state: 'declined'; left: number }
  /** The answer's claims were not all supported by the passages it cited: shown as "the passages don't say". */
  | ({ state: 'unsupported'; left: number } & Glossary)
  /** "Where was I" with no reading position on this device: which chapter? No message is used. */
  | { state: 'which' }
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

/** Room for the model's reasoning and a summary of up to about 250 words. */
const ANSWER_TOKENS = 2500;
const GUARD_TOKENS = 1500;
const SEARCH_TOKENS = 600;
/** The support check reads long summary answers and their notes: room to reason before its verdict (an empty verdict fails closed). */
const SUPPORT_TOKENS = 4000;

function passagesText(passages: Passage[]): string {
  return passages.map((p) => `[${p.id}] ${p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`).join('\n');
}

function notesText(notes: Note[]): string {
  return notes.map((n) => `(${n.label}) ${n.text}`).join('\n');
}

/** The question for the model: the reviewed notes (if any), the book's passages, and the question. */
export function userMessage(notes: Note[], passages: Passage[], question: string): string {
  const head = notes.length ? `Reviewed notes (checked against the book by people; cite the block ids they give):\n${notesText(notes)}\n\n` : '';
  return `${head}Passages from the book:\n${passagesText(passages)}\n\nQuestion: ${question}`;
}

export function validate(input: AskInput): AskInput {
  const question = String(input.question ?? '').trim();
  if (!question) throw new AskError('Ask a question about the book.');
  if (question.length > CHAT.questionMaxChars) throw new AskError(`Keep the question under ${CHAT.questionMaxChars} characters.`);
  const p = Number(input.position);
  const position = input.position != null && Number.isInteger(p) && p >= 1 && p <= 32 ? p : null;
  const attached = (input.attached ?? []).map(String).slice(0, 4);
  for (const id of attached) if (!blockIdOk(id) || chapterOf(id)! > 32) throw new AskError(`Not a block: ${id}`);
  const history = (input.history ?? [])
    .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .slice(-CHAT.historyTurns)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 2000) }));
  return { question, position, attached, history };
}

export async function ask(deps: AskDeps, raw: AskInput): Promise<AskResult> {
  const input = validate(raw);
  const { sql, fid } = deps;
  // Glossary words: their entries are pointed to first, and a misspelled one is searched as the book spells it.
  const words = await glossaryWords(sql, input.question);
  const glossary = words.links;
  // Reviewed notes (src/lib/chat/notes.ts): a chapter or a Learn more character named, "where was I", the whole book.
  const routed = routeQuestion(words.corrected, input.position ?? null);
  if (routed.needsChapter) return { state: 'which' };
  const question = words.corrected + routed.framing;

  // Worst case: search words, two answers (the retry), four guard calls and two support checks (each may be retried once).
  const slot = await reserve(sql, fid, worstCaseUsd(2 * ANSWER_TOKENS + SEARCH_TOKENS, 4 * GUARD_TOKENS + 2 * SUPPORT_TOKENS, 32000));
  if (!slot.ok) return { state: slot.reason };

  let passages: Passage[];
  try {
    const terms = CHAT.searchTerms && deps.searchPrompt ? await searchTerms(deps, question) : '';
    const dense = deps.dense ? await deps.dense(question, 32) : undefined;
    const found = await retrieve(sql, terms ? `${words.corrected} ${terms}` : words.corrected, input.attached, dense ? { dense } : {});
    // The named characters' glossary sentences, with the search's passages, in book order.
    const extra = routed.blocks.length ? await blocksById(sql, routed.blocks) : [];
    const seen = new Set(found.passages.map((p) => p.id));
    passages = [...found.passages, ...extra.filter((p) => !seen.has(p.id))].sort((a, b) => a.chapter - b.chapter || a.idx - b.idx);
  } catch (e) {
    throw new AskError((e as Error).message);
  }

  const messages: Message[] = [
    { role: 'system', content: deps.systemPrompt.replace('{{WORDS}}', String(routed.words)) },
    ...input.history!.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: userMessage(routed.notes, passages, question) },
  ];
  const allowed = new Set([...passages.map((p) => p.id), ...routed.notes.flatMap((n) => n.sources)]);

  // Answer, then the guard; on a flag, one retry with a reminder. The flagged answer is never shown or sent back.
  let clean = await answerOnce(deps, messages, allowed);
  let verdict = await guard(deps, question, clean.shown);
  let regenerated = false;
  if (verdict.verdict === 'flagged') {
    regenerated = true;
    const reminder = deps.reminder.replace('{{REASON}}', verdict.reason || 'it read as writing for them');
    clean = await answerOnce(deps, [...messages, { role: 'user', content: reminder }], allowed);
    verdict = await guard(deps, question, clean.shown);
  }
  if (verdict.verdict === 'flagged') return { state: 'declined', left: slot.left };

  // Quotes come from the database, by id, never from the model's words.
  const blocks = await blocksById(sql, clean.cites);
  const label = await labels(sql, blocks.map((b) => b.chapter));
  const quotes: Quote[] = blocks.map((b) => ({
    id: b.id,
    chapter: b.chapter,
    label: label.get(b.id) ?? null,
    html: b.kind === 'paragraph' || b.kind === 'quote' ? renderMarkdown(b) : b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
  const found = new Set(quotes.map((q) => q.id));
  // The reviewed notes the answer rests on: those that give a block it cites.
  const used = routed.notes.filter((n) => n.sources.some((id) => found.has(id)));

  // The second guard question: every claim supported by the passages it cites (or the reviewed notes that give them)?
  // If not, or no verdict, it isn't shown.
  if (deps.supportPolicy) {
    const supported = await supportCheck(deps, question, clean.shown, blocks, used);
    if (!supported) return { state: 'unsupported', left: slot.left, glossary };
  }
  const parts = clean.parts.filter((p) => p.type === 'text' || found.has(p.id));
  const lines = noteLines(used);
  return {
    state: 'answer',
    parts,
    quotes,
    ...(lines.length ? { notes: lines } : {}),
    left: slot.left,
    guard: verdict.verdict === 'ok' ? 'ok' : 'none',
    regenerated,
    glossary,
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
 * answer and the stored text of each cited block, with the block before it as context, and the
 * reviewed notes that give those blocks (a summary sentence often rests on several). Fails
 * closed: no verdict after one retry counts as unsupported. Recorded as a guard call (no text).
 */
async function supportCheck(deps: AskDeps, question: string, shown: string, cited: Passage[], notes: Note[]): Promise<boolean> {
  const before = await blocksById(deps.sql, cited.map((b) => `c${b.chapter}-b${b.idx - 1}`));
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
        // With reviewed notes, the question is whether the answer adds anything the notes and passages don't say.
        { role: 'user', content: `QUESTION:\n${question}\n\n${notes.length ? `REVIEWED NOTES (support, like passages):\n${notesText(notes)}\n\n` : ''}CITED PASSAGES:\n${passages || '(none)'}\n\nANSWER:\n${shown}` },
      ],
      { maxTokens: SUPPORT_TOKENS, temperature: 0 },
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
