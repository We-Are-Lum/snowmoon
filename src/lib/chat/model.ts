import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CHAT } from '../config';
import { providerOptions, servedBy, servedByPinned } from './provider';

export { servingAllowed } from './provider';

/**
 * Calls to the hosted open-weights models through Vercel AI Gateway (CHAT.host).
 * Authentication: AI_GATEWAY_API_KEY if set; otherwise the project's OIDC token
 * (the x-vercel-oidc-token header Vercel adds to function requests, or
 * VERCEL_OIDC_TOKEN locally). No new secret is needed on Vercel.
 */
export interface ModelReply {
  text: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  requestId: string | null;
  provider: string | null;
  model: string;
}

export class ModelUnavailable extends Error {}

/** Waits between retries when the pinned provider is busy. */
export const BUSY_RETRY_MS = [1000, 2000, 4000];

export function gatewayToken(request?: Request): string | null {
  return process.env.AI_GATEWAY_API_KEY || request?.headers.get('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN || null;
}

/** A committed prompt file, without its leading HTML comment. Sent exactly as the rest is written. */
export function promptFile(name: string): string {
  const raw = readFileSync(path.join(process.cwd(), 'config', 'prompts', name), 'utf8');
  return raw.replace(/^<!--[\s\S]*?-->\s*/, '');
}

export async function complete(
  token: string,
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { maxTokens: number; temperature: number },
): Promise<ModelReply> {
  const send = () =>
    fetch(CHAT.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, providerOptions: providerOptions() }),
    });
  let res = await send();
  // The pinned provider has no fallback (owner's condition, principle 6). When it is
  // busy (429; 498, Groq's "flex capacity exceeded"; 503), wait and try again: 1, 2
  // and 4 seconds, about 7 seconds in all, before reporting that the model did not answer.
  for (const wait of BUSY_RETRY_MS) {
    if (![429, 498, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const j = (await res.json().catch(() => ({}))) as {
    id?: string;
    model?: string;
    provider?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  if (!res.ok) throw new ModelUnavailable(`gateway ${res.status}`);
  const provider = servedBy(j);
  if (!servedByPinned(provider)) throw new ModelUnavailable(`served by ${provider}, not the chosen provider`);
  const promptTokens = j.usage?.prompt_tokens ?? 0;
  const completionTokens = j.usage?.completion_tokens ?? 0;
  const price = CHAT.prices[model];
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    promptTokens,
    completionTokens,
    // The gateway's own figure when it gives one; otherwise tokens × the published price.
    costUsd: typeof j.usage?.cost === 'number' ? j.usage.cost : promptTokens * price.input + completionTokens * price.output,
    requestId: j.id ?? res.headers.get('x-vercel-id'),
    provider,
    model: j.model ?? model,
  };
}
