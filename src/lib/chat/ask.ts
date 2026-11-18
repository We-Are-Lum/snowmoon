import type postgres from 'postgres';
import { CHAT } from '../config';
import { renderMarkdown } from '../render';
import { blocksById, labels, retrieve, type Passage } from './retrieve';
import { glossaryWords, type GlossaryLink } from './glossary';
import { bookInBrief, fitWords, noteLines, noteTitle, routeQuestion, type BookInBrief, type Note } from './notes';
import { blockIdOk, chapterOf, sanitizeAnswer, type AnswerPart, type SanitizeOptions } from './sanitize';
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
  | ({ state: 'answer'; parts: AnswerPart[]; quotes: Quote[]; notes?: string[]; noteCites?: NoteCite[]; left: number; guard: 'ok' | 'none'; dropped: number; regenerated: boolean } & Glossary)
  | { state: 'declined'; left: number }
  /** The answer's claims were not all supported by the passages it cited: shown as "the passages don't say". */
  | ({ state: 'unsupported'; left: number } & Glossary)
  /** "Where was I" with no reading position on this device: which chapter? No message is used. */
  | { state: 'which' }
  /**
   * "What is the book about": each chapter's first summary section as written, with the summaries' AI label; no model is
   * called and no message is used (owner, 2026-11-17).
   */
  | ({ state: 'book'; quotes: Quote[] } & BookInBrief)
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
  /** The answer's temperature when it uses reviewed notes (default NOTES_TEMPERATURE); the eval compares values. */
  notesTemperature?: number;
  /** Embedding search, for evaluation: block ids ranked for this question (see RetrieveOptions.dense). */
  dense?: (question: string, limit: number) => Promise<string[]>;
}

export class AskError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Room for the model's reasoning and a summary of up to about 180 words. */
const ANSWER_TOKENS = 2500;
/** The answer's temperature; with reviewed notes, NOTES_TEMPERATURE (see the eval in docs/proposals/chat-eval/README.md). */
const TEMPERATURE = 0.4;
// Owner, 2026-11-17: 0.2 was tried (38 of 48 against 41 of 48 at 0.4) and set back to 0.4.
export const NOTES_TEMPERATURE = 0.4;
const GUARD_TOKENS = 1500;
const SEARCH_TOKENS = 600;
/** The support check reads long summary answers and their notes: room to reason before its verdict (an empty verdict fails closed). */
const SUPPORT_TOKENS = 4000;

function passagesText(passages: Passage[]): string {
  return passages.map((p) => `[${p.id}] ${p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`).join('\n');
}

function notesText(notes: Note[]): string {
  return notes.map((n) => `[${n.label}] ${n.text}`).join('\n');
}

/** The question for the model: the reviewed notes (if any), the book's passages, and the question. */
/** A reviewed note an answer cites, as the reader sees it: its name and the blocks it rests on (shown folded). */
export interface NoteCite {
  label: string;
  title: string;
  sources: string[];
}

export function userMessage(notes: Note[], passages: Passage[], question: string): string {
  const head = notes.length ? `Reviewed notes (checked against the book by people; cite a note by its label in square brackets, like [${notes[0].label}]):\n${notesText(notes)}\n\n` : '';
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
  if (routed.shape === 'book') {
    // The whole book: each chapter's first summary section, with the book's words it rests on (its first two sources),
    // so the reply points to passages like every answer (notice item 1). No model; no message used.
    const brief = bookInBrief();
    return { state: 'book', ...brief, quotes: await quotesFor(sql, brief.chapters.flatMap((c) => c.sources.slice(0, 2))) };
  }
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
  // Block ids only for claims from the passage search; a claim from a note cites the note's label (owner, 2026-11-17).
  const allowed = new Set(passages.map((p) => p.id));
  const byLabel = new Map(routed.notes.map((n) => [n.label, n]));
  // Quotations are checked word for word against the blocks their sentence cites, a note bringing its sources.
  const texts = new Map<string, string>();
  const plain = (p: Passage) => p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  for (const p of passages) texts.set(p.id, plain(p));
  const noteSources = [...new Set(routed.notes.flatMap((n) => n.sources))].filter((id) => !texts.has(id));
  if (noteSources.length) for (const p of await blocksById(sql, noteSources)) texts.set(p.id, plain(p));
  const cleaning: SanitizeOptions = { notes: new Set(byLabel.keys()), textOf: (id) => texts.get(id), sourcesOf: (l) => byLabel.get(l)?.sources ?? [] };

  // Answer, then the guard; on a flag, one retry with a reminder. The flagged answer is never shown or sent back.
  const answerTokens = ANSWER_TOKENS;
  const temperature = routed.notes.length ? (deps.notesTemperature ?? NOTES_TEMPERATURE) : TEMPERATURE;
  // "Where was I" is held to its words in code: the model alone runs long (owner, 2026-11-17, item 4).
  const fit = routed.shape === 'where' ? { words: routed.words, chapters: routed.chapters.length } : undefined;
  let clean = await answerOnce(deps, messages, allowed, cleaning, answerTokens, temperature, fit);
  let verdict = await guard(deps, question, clean.shown);
  let regenerated = false;
  if (verdict.verdict === 'flagged') {
    regenerated = true;
    const reminder = deps.reminder.replace('{{REASON}}', verdict.reason || 'it read as writing for them');
    clean = await answerOnce(deps, [...messages, { role: 'user', content: reminder }], allowed, cleaning, answerTokens, temperature, fit);
    verdict = await guard(deps, question, clean.shown);
  }
  if (verdict.verdict === 'flagged') return { state: 'declined', left: slot.left };

  // Quotes come from the database, by id, never from the model's words.
  // The reviewed notes the answer cites, by label; the reader is shown each one's own source blocks.
  const used = clean.notes.map((l) => byLabel.get(l)!).filter(Boolean);
  const blocks = await blocksById(sql, clean.cites);
  const quotes = await quotesFor(sql, [...new Set([...clean.cites, ...used.flatMap((n) => n.sources)])]);
  const found = new Set(quotes.map((q) => q.id));
  const cited = blocks.filter((b) => found.has(b.id));

  // The second guard question: is every claim supported by what it cites? A claim cited to a block, by that block's
  // text (and the passage before it, for who is speaking) alone; a claim cited to a note, by that note. If not, or no
  // verdict, it isn't shown.
  if (deps.supportPolicy) {
    const supported = await supportCheck(deps, question, clean.shown, cited, used);
    if (!supported) return { state: 'unsupported', left: slot.left, glossary };
  }
  const parts = clean.parts.filter((p) => p.type !== 'cite' || found.has(p.id));
  const lines = noteLines(used);
  const noteCites: NoteCite[] = used.map((n) => ({ label: n.label, title: noteTitle(n), sources: n.sources.filter((id) => found.has(id)) }));
  return {
    state: 'answer',
    parts,
    quotes,
    ...(lines.length ? { notes: lines, noteCites } : {}),
    left: slot.left,
    guard: verdict.verdict === 'ok' ? 'ok' : 'none',
    regenerated,
    glossary,
    dropped: clean.dropped.length + clean.cites.filter((c) => !found.has(c)).length,
  };
}

/** The book's words for these ids, from the database by id, with their ¶ labels. */
async function quotesFor(sql: postgres.Sql, ids: string[], found?: Passage[]): Promise<Quote[]> {
  const blocks = found ?? (await blocksById(sql, ids));
  const label = await labels(sql, blocks.map((b) => b.chapter));
  return blocks.map((b) => ({
    id: b.id,
    chapter: b.chapter,
    label: label.get(b.id) ?? null,
    html: b.kind === 'paragraph' || b.kind === 'quote' ? renderMarkdown(b) : b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

/** One answer from the model, cleaned: citations checked, the model's own quotations removed. Recorded with no text. */
async function answerOnce(deps: AskDeps, messages: Message[], allowed: Set<string>, cleaning: SanitizeOptions, maxTokens = ANSWER_TOKENS, temperature = TEMPERATURE, fit?: { words: number; chapters: number }) {
  const answer = await deps.complete(CHAT.model, messages, { maxTokens, temperature });
  await record(deps.sql, {
    kind: 'answer', model: answer.model, provider: answer.provider,
    promptTokens: answer.promptTokens, completionTokens: answer.completionTokens, costUsd: answer.costUsd,
  });
  const clean = sanitizeAnswer(fit ? fitWords(answer.text, fit.words, fit.chapters) : answer.text, allowed, cleaning);
  // The guard reads the answer as the person would see it, citations and all.
  return { ...clean, shown: clean.parts.map((p) => (p.type === 'text' ? p.text : p.type === 'cite' ? `[${p.id}]` : `[${p.label}]`)).join('') };
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
        { role: 'user', content: `QUESTION:\n${question}\n\n${notes.length ? `CITED NOTES (support only the claims cited to them by label):\n${notesText(notes)}\n\n` : ''}CITED PASSAGES:\n${passages || '(none)'}\n\nANSWER:\n${shown}` },
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
