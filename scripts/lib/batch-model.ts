/**
 * Batch jobs (the spoken summary, the guides) call the model ONLY through the Vercel AI Gateway
 * (owner, 2026-10-11: "batch jobs call the model only through the Vercel AI Gateway route, never with
 * the site's Groq key, so they can't use up the live site's daily limit"). This module never reads the
 * Groq key (CHAT.direct.keyEnv); it refuses to run without a gateway credential instead of falling back.
 * Same model, same pinned provider and zero data retention as the reading assistant's gateway route
 * (src/lib/chat/provider.ts). The site's chat code (src/lib/chat/*) is not changed.
 */
import { CHAT } from '../../src/lib/config';
import { providerOptions, servedBy, servedByPinned } from '../../src/lib/chat/provider';

export type BatchMessages = { role: 'system' | 'user' | 'assistant'; content: string }[];
export interface BatchReply {
  text: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  requestId: string | null;
  provider: string | null;
  model: string;
  route: 'gateway';
}
export class BatchModelUnavailable extends Error {}

/** The gateway credential: an AI Gateway API key, or a Vercel OIDC token. Never the Groq key. */
export function batchGatewayToken(): string {
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) throw new BatchModelUnavailable('no gateway credential: set AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) for batch jobs; the Groq key is never used for them');
  return token;
}

const BUSY = [429, 498, 503];
const WAITS = [1000, 2000, 4000];

export async function completeViaGateway(model: string, messages: BatchMessages, opts: { maxTokens: number; temperature: number }): Promise<BatchReply> {
  const token = batchGatewayToken();
  const send = () =>
    fetch(CHAT.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, providerOptions: providerOptions() }),
    });
  let res = await send();
  for (const wait of WAITS) {
    if (!BUSY.includes(res.status)) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const j = (await res.json().catch(() => ({}))) as {
    id?: string;
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  if (!res.ok) throw new BatchModelUnavailable(`gateway ${res.status}`);
  const provider = servedBy(j);
  if (!servedByPinned(provider)) throw new BatchModelUnavailable(`served by ${provider}, not the chosen provider`);
  const promptTokens = j.usage?.prompt_tokens ?? 0;
  const completionTokens = j.usage?.completion_tokens ?? 0;
  const price = CHAT.prices[model];
  const costUsd = typeof j.usage?.cost === 'number' ? j.usage.cost : promptTokens * price.input + completionTokens * price.output;
  return { text: j.choices?.[0]?.message?.content ?? '', promptTokens, completionTokens, costUsd, requestId: j.id ?? res.headers.get('x-vercel-id'), provider, model: j.model ?? model, route: 'gateway' };
}
