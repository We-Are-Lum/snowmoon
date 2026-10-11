/**
 * Batch jobs (the spoken summary, the guides) call the model ONLY through the Vercel AI Gateway
 * (owner, 2026-10-11: "batch jobs call the model only through the Vercel AI Gateway route, never with
 * the site's Groq key, so they can't use up the live site's daily limit"). This module never reads the
 * Groq key (CHAT.direct.keyEnv); it refuses to run without a gateway credential instead of falling back.
 * Same model, same pinned provider and zero data retention as the reading assistant's gateway route
 * (src/lib/chat/provider.ts). The site's chat code (src/lib/chat/*) is not changed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CHAT } from '../../src/lib/config';
import { providerOptions, servedBy, servedByPinned } from '../../src/lib/chat/provider';

/**
 * Models other than the assistant's are pinned to the provider their allowlist entry names
 * (config/models.json hosted.provider), with zero data retention (owner, 2026-10-11, for Kimi K3:
 * "Pin calls with zero retention. Book text only.").
 */
type Allowed = { id: string; hosted?: { endpoints?: Record<string, unknown>; provider?: string; zero_data_retention?: boolean; prices?: { input: number; output: number } } };
function allowlisted(model: string): Allowed | undefined {
  const m = JSON.parse(readFileSync(path.join(import.meta.dirname, '../../config/models.json'), 'utf8')) as { models: Allowed[] };
  return m.models.find((x) => x.hosted?.endpoints && model in x.hosted.endpoints);
}
function pinFor(model: string): { options: unknown; check: (served: string | null) => boolean; prices: { input: number; output: number } } {
  if (CHAT.prices[model]) return { options: providerOptions(), check: servedByPinned, prices: CHAT.prices[model] };
  const a = allowlisted(model);
  if (!a?.hosted?.provider || a.hosted.zero_data_retention !== true || !a.hosted.prices) throw new BatchModelUnavailable(`${model}: not on the allowlist with a pinned provider and zero data retention`);
  const pinned = a.hosted.provider;
  return {
    options: { gateway: { zeroDataRetention: true, only: [pinned] } },
    check: (served) => served === pinned,
    // Allowlist prices are per million tokens.
    prices: { input: a.hosted.prices.input / 1e6, output: a.hosted.prices.output / 1e6 },
  };
}

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

export async function completeViaGateway(model: string, messages: BatchMessages, opts: { maxTokens: number; temperature?: number; reasoning?: unknown }): Promise<BatchReply> {
  const token = batchGatewayToken();
  const pin = pinFor(model);
  const send = () =>
    fetch(CHAT.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }), ...(opts.reasoning ? { reasoning: opts.reasoning } : {}), providerOptions: pin.options }),
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
  if (!pin.check(provider)) throw new BatchModelUnavailable(`served by ${provider}, not the pinned provider`);
  const promptTokens = j.usage?.prompt_tokens ?? 0;
  const completionTokens = j.usage?.completion_tokens ?? 0;
  const price = pin.prices;
  const costUsd = typeof j.usage?.cost === 'number' ? j.usage.cost : promptTokens * price.input + completionTokens * price.output;
  return { text: j.choices?.[0]?.message?.content ?? '', promptTokens, completionTokens, costUsd, requestId: j.id ?? res.headers.get('x-vercel-id'), provider, model: j.model ?? model, route: 'gateway' };
}
