/**
 * The Anthropic Message Batches API, called directly (owner, 2026-10-24: "If my pick turns out to be Opus, run all
 * 207 through the Anthropic Batch API with SNOWMOON_ANTHROPIC_KEY (half price, paid from my subscription's API
 * credits, outside the $25)"). Plain fetch, no SDK (none is installed, and the key must be passed explicitly).
 *
 * The key: SNOWMOON_ANTHROPIC_KEY only, loaded from /Users/nathan/snowmoon/.env.anthropic.local with a second
 * --env-file-if-exists. Nothing here reads ANTHROPIC_API_KEY or any other key, prints the key, or writes it anywhere.
 *
 * Caching inside a batch: every request carries the same system prompt and book, with a cache marker on the book
 * (1-hour entry, since a batch's requests may run far apart). Anthropic processes a batch's requests concurrently,
 * so cache hits inside a batch are best-effort: the first requests may all write the book before any can read it.
 * The estimate therefore gives a range, from every request but the first reading the cache to none of them doing so.
 */
export const ANTHROPIC = 'https://api.anthropic.com/v1';
export const OPUS = 'claude-opus-5-5';

/** US dollars per token, Claude Opus 5.5 on the Claude API (skill reference cached 2026-10-06; the gateway lists the same). */
export const OPUS_PRICE = { input: 4e-6, output: 20e-6, cacheRead: 0.2e-6, cacheWrite5m: 5e-6, cacheWrite1h: 8e-6 };
/** Batch: half of every token price. */
export const OPUS_BATCH = Object.fromEntries(Object.entries(OPUS_PRICE).map(([k, v]) => [k, v / 2])) as typeof OPUS_PRICE;

export function anthropicKey(): string {
  const k = process.env.SNOWMOON_ANTHROPIC_KEY;
  if (!k) throw new Error('SNOWMOON_ANTHROPIC_KEY not set: run with --env-file-if-exists=/Users/nathan/snowmoon/.env.anthropic.local');
  return k;
}
const headers = (key: string) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });

/** One request's params: system prompt, the book (cached, 1 hour), then the request; effort low, as in the bake-off. */
export function opusParams(system: string, book: string, request: string, maxTokens: number) {
  return {
    model: OPUS,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: book, cache_control: { type: 'ephemeral', ttl: '1h' } },
          { type: 'text', text: request },
        ],
      },
    ],
    output_config: { effort: 'low' },
  };
}

export interface BatchRef {
  id: string;
  processing_status: string;
  request_counts?: Record<string, number>;
  results_url?: string | null;
}

async function api<T>(key: string, url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { ...headers(key), ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as T;
}

export const submitBatch = (key: string, requests: { custom_id: string; params: unknown }[]) =>
  api<BatchRef>(key, `${ANTHROPIC}/messages/batches`, { method: 'POST', body: JSON.stringify({ requests }) });
export const batchStatus = (key: string, id: string) => api<BatchRef>(key, `${ANTHROPIC}/messages/batches/${id}`);

export interface BatchUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number };
}
export interface BatchResult {
  custom_id: string;
  result: { type: 'succeeded' | 'errored' | 'canceled' | 'expired'; message?: { id: string; model: string; content: { type: string; text?: string }[]; usage: BatchUsage; stop_reason: string }; error?: unknown };
}

/** The results (JSONL), keyed by custom_id: results come in any order. */
export async function batchResults(key: string, ref: BatchRef): Promise<BatchResult[]> {
  const url = ref.results_url ?? `${ANTHROPIC}/messages/batches/${ref.id}/results`;
  const r = await fetch(url, { headers: headers(key) });
  if (!r.ok) throw new Error(`Anthropic ${r.status} on results`);
  return (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as BatchResult);
}

export const textOf = (r: BatchResult) => (r.result.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');

/** A batch result's cost at batch prices (1-hour cache writes, as the requests ask). */
export function batchCost(u: BatchUsage): number {
  const p = OPUS_BATCH;
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? u.cache_creation_input_tokens ?? 0;
  const write5m = u.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  return (u.input_tokens ?? 0) * p.input + (u.cache_read_input_tokens ?? 0) * p.cacheRead + write1h * p.cacheWrite1h + write5m * p.cacheWrite5m + (u.output_tokens ?? 0) * p.output;
}

/**
 * A batch's cost range for `n` requests sharing a `prefix`-token cached book, each adding `fresh` input and `out`
 * output tokens: best, every request after the first reads the cache; worst, every request writes it.
 */
export function batchRange(n: number, prefix: number, fresh: number, out: number) {
  const p = OPUS_BATCH;
  const tail = fresh * p.input + out * p.output;
  const best = prefix * p.cacheWrite1h + tail + (n - 1) * (prefix * p.cacheRead + tail);
  const worst = n * (prefix * p.cacheWrite1h + tail);
  return { best, worst };
}
