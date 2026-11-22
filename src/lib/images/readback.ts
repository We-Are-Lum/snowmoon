import 'server-only';
import { gatewayToken, promptFile } from '../chat/model';
import { GATEWAY_URL } from './closed';
import { loadChapter, chapterNumbers } from '../book';
import { compareRead, fillPolicy, LETTERING_POLICY_FILE, letteringLine, phraseSource, READ_MAX_TOKENS, READ_TEXT_INSTRUCTION, READ_USER_LINE, readWorstUsd, readerFor, type LetteringPhrase, type LetteringRecord, type Reader } from './lettering';
import type { Made } from './fal';
import type postgres from 'postgres';

/**
 * The server half of lettering (part C; owner, 2026-11-22): the book's blocks for book-or-own, the lettering policy for
 * the prompt check, the read-back call and the step paidPicture runs after the picture (src/lib/images/paid.ts `after`).
 *
 * The read-back sends the picture exactly as it is published (the padded JPEG) to its own maker through the Vercel AI
 * Gateway, with one instruction, "transcribe every piece of visible writing", and never the words asked for (blind).
 * GPT Image's pictures are read by GPT-6.1 Sol on OpenAI, Gemini's by Gemini 3.8 Flash on Google Vertex AI; each call
 * pins that one provider and asks for zero data retention and no prompt training (the gateway refuses the call if the
 * provider can't). Nothing about the person goes with it (no user field, no FID, no IP: the call comes from our server).
 */
type Sql = postgres.Sql;

let BLOCKS: [string, { kind: string; content: string }][] | null = null;
/** Every block of the book, in book order, as "c<chapter>-b<block>". */
export function bookBlocks(): [string, { kind: string; content: string }][] {
  if (BLOCKS) return BLOCKS;
  BLOCKS = chapterNumbers().flatMap((n) => (loadChapter(n)?.blocks ?? []).map((b) => [`c${n}-b${b.idx}`, { kind: b.kind, content: b.content }] as [string, { kind: string; content: string }]));
  return BLOCKS;
}
export const sourcesOf = (phrases: readonly string[], fid: number): LetteringPhrase[] => phrases.map((p) => phraseSource(p, bookBlocks(), fid));

/** The prompt check's policy for these phrases: image-guard-lettering.md with them put in (never image-guard.md changed). */
export const letteringPolicy = (phrases: readonly string[]) => fillPolicy(promptFile(LETTERING_POLICY_FILE), phrases);

/**
 * Whether read-back costs can be counted on this database (NEXT_challenge_lettering.sql applied: studio.image_costs takes
 * the kind 'readback'). Until then no lettered picture is made (the route says so, before anything is spent).
 */
export async function letteringReady(sql: Sql): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select exists (select 1 from pg_constraint where conrelid = 'studio.image_costs'::regclass and conname = 'image_costs_kind_check' and pg_get_constraintdef(oid) like '%readback%') as ok`.catch(() => [{ ok: false }]);
  return Boolean(r?.ok);
}

/** The request for one read. Pure: nothing is sent (tests check it). */
export function readRequest(r: Reader, image: { bytes: Buffer; contentType: string }) {
  const schema = {
    type: 'object', additionalProperties: false, required: ['texts'],
    properties: { texts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'cut_off'], properties: { text: { type: 'string' }, cut_off: { type: 'boolean' } } } } },
  };
  const body = {
    model: r.id,
    temperature: 0,
    max_tokens: READ_MAX_TOKENS,
    reasoning: { effort: r.effort },
    response_format: { type: 'json_schema', json_schema: { name: 'writing', strict: true, schema } },
    messages: [
      { role: 'system', content: READ_TEXT_INSTRUCTION },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${image.contentType};base64,${image.bytes.toString('base64')}`, detail: 'high' } }, { type: 'text', text: READ_USER_LINE }] },
    ],
    providerOptions: { gateway: { only: [r.provider], zeroDataRetention: true, disallowPromptTraining: true } },
  };
  return { url: `${GATEWAY_URL}/chat/completions`, body };
}

export interface Read {
  texts: string[];
  costUsd: number;
  provider: string;
  requestId: string | null;
  /** Set when the read gave no usable answer (its cost still counts). */
  error: string | null;
}
export type ReadText = (r: Reader, image: { bytes: Buffer; contentType: string }, request: Request) => Promise<Read>;

/** One read through the gateway. A failed or malformed answer comes back with `error` set and its cost counted. */
export const readText: ReadText = async (r, image, request) => {
  const token = gatewayToken(request);
  if (!token) return { texts: [], costUsd: 0, provider: r.provider, requestId: null, error: 'no gateway credential' };
  const q = readRequest(r, image);
  const res = await fetch(q.url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(q.body) }).catch(() => null);
  if (!res) return { texts: [], costUsd: 0, provider: r.provider, requestId: null, error: 'the gateway did not answer' };
  const j = (await res.json().catch(() => ({}))) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const u = j.usage ?? {};
  const msg = j.choices?.[0]?.message;
  const reported = Number(u.cost ?? msg?.provider_metadata?.gateway?.cost ?? NaN);
  const est = (Number(u.prompt_tokens) || 0) * r.input + (Number(u.completion_tokens) || 0) * r.output;
  // The gateway's cost when it reports one; otherwise the tokens at the published price; with neither, the worst case.
  const costUsd = Number.isFinite(reported) ? reported : res.ok ? est || readWorstUsd(r) : 0;
  const served = msg?.provider_metadata?.gateway?.routing?.finalProvider ?? msg?.provider_metadata?.gateway?.routing?.resolvedProvider ?? r.provider;
  const base = { costUsd, provider: String(served), requestId: typeof j.id === 'string' ? j.id : null };
  if (!res.ok) return { ...base, texts: [], error: `gateway ${res.status}` };
  if (served !== r.provider) return { ...base, texts: [], error: `served by ${served}, not ${r.provider}` };
  try {
    const parsed = JSON.parse(String(msg?.content ?? '')) as { texts?: { text?: unknown }[] };
    if (!Array.isArray(parsed.texts)) throw new Error('no list');
    return { ...base, texts: parsed.texts.map((t) => String(t.text ?? '')), error: null };
  } catch {
    return { ...base, texts: [], error: 'malformed answer' };
  }
};

/** What paidPicture's `after` step returns: the read's cost and verdict for the day's totals, and the outcome. */
export type AfterMade =
  | { ok: true; cost: ReadCost; record: LetteringRecord }
  | { ok: false; cost: ReadCost; reason: 'lettering-mismatch' | 'lettering-unread'; read: string[]; asked: string[]; reader: string };
export interface ReadCost { model: string; provider: string; verdict: 'ok' | 'mismatch' | 'unread'; costUsd: number }

/**
 * The read-back of one made picture (the file as published) against the phrases, by its maker's reader: a match makes
 * the record; a mismatch or no answer is reported with what was read, and nothing is kept (option a).
 */
export async function readBack(made: Pick<Made, 'bytes' | 'contentType'> & { sha256: string }, maker: string, phrases: LetteringPhrase[], request: Request, read: ReadText = readText, now: () => Date = () => new Date()): Promise<AfterMade> {
  const r = readerFor(maker);
  if (!r) throw new Error(`no reader for ${maker}`);
  const got = await read(r, { bytes: made.bytes, contentType: made.contentType }, request);
  const asked = phrases.map((p) => p.text);
  const cost = (verdict: ReadCost['verdict']): ReadCost => ({ model: r.id, provider: got.provider || r.provider, verdict, costUsd: got.costUsd });
  if (got.error) return { ok: false, cost: cost('unread'), reason: 'lettering-unread', read: [], asked, reader: r.name };
  const v = compareRead(asked, got.texts);
  if (!v.match) return { ok: false, cost: cost('mismatch'), reason: 'lettering-mismatch', read: got.texts, asked, reader: r.name };
  return {
    ok: true,
    cost: cost('ok'),
    record: {
      v: 1, phrases, line: letteringLine(asked), policy: LETTERING_POLICY_FILE, fit: 'pad',
      readback: { reader: r.id, name: r.name, maker: r.maker, provider: got.provider || r.provider, sha256: made.sha256, read: got.texts, verdict: 'match', rule: 'v1', costUsd: got.costUsd, requestId: got.requestId, at: now().toISOString() },
    },
  };
}
