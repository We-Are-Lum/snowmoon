/**
 * One chat call through the Vercel AI Gateway with the book as a cached prefix: the system prompt, then the book as
 * the first user message (with Anthropic's cache marker where the provider needs one), then the request. Pinned to
 * one provider; a busy provider (429) is tried again. Shared by scripts/glossary-explain.ts and scripts/glossary-fix.ts.
 */
import { GATEWAY, type ModelChoice, type Price } from './glossary-explain';

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cost?: number;
}
export interface Reply {
  text: string;
  usage: Usage;
  usd: number;
  requestId: string | null;
  model: string;
  provider: string;
}

export function costOf(u: Usage, p: Price): number {
  if (typeof u.cost === 'number') return u.cost;
  const read = u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens ?? 0;
  const write = u.prompt_tokens_details?.cache_write_tokens ?? u.cache_creation_input_tokens ?? 0;
  const plain = Math.max(0, (u.prompt_tokens ?? 0) - read - write);
  return plain * p.input + read * p.cacheRead + write * p.cacheWrite + (u.completion_tokens ?? 0) * p.output;
}

export async function call(key: string, m: ModelChoice, p: Price, session: string, system: string, user: string, request: string, maxTokens = 8000): Promise<Reply> {
  const bookMessage: Record<string, unknown> = { role: 'user', content: user };
  if (m.caching === 'explicit') bookMessage.cache_control = { type: 'ephemeral' };
  const send = () => fetch(`${GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'x-session-affinity': session },
    body: JSON.stringify({
      model: m.id,
      messages: [{ role: 'system', content: system }, bookMessage, { role: 'user', content: request }],
      max_tokens: maxTokens,
      reasoning: { effort: m.effort },
      providerOptions: { gateway: { only: [m.provider] } },
    }),
  });
  // A busy provider (429, "at capacity"): wait and try the same provider again, 30 s, 90 s, 180 s. A refused call costs nothing.
  let res = await send();
  for (const wait of [30_000, 90_000, 180_000]) {
    if (res.status !== 429) break;
    console.log(`${m.id}: busy (429), trying again in ${wait / 1000} s`);
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string; model?: string; provider?: string; choices?: { message?: { content?: string } }[]; usage?: Usage; error?: { message?: string } };
  if (!res.ok) throw new Error(`${m.id}: gateway ${res.status} ${j.error?.message ?? ''}`.trim());
  const usage = j.usage ?? {};
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    usage,
    usd: costOf(usage, p),
    requestId: j.id ?? res.headers.get('x-vercel-id'),
    model: j.model ?? m.id,
    provider: j.provider ?? res.headers.get('x-vercel-ai-provider') ?? m.provider,
  };
}

