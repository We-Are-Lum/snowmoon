import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CHAT } from '../config';
import { providerOptions, servedBy, servedByPinned } from './provider';

export { servingAllowed } from './provider';

/**
 * Calls to the hosted open-weights models: the provider directly with the project's
 * own key (CHAT.direct) first, then, if that fails and CHAT.gatewayFallback is on,
 * through Vercel AI Gateway (CHAT.host) to the same provider.
 * Gateway authentication: AI_GATEWAY_API_KEY if set; otherwise the project's OIDC
 * token (the x-vercel-oidc-token header Vercel adds to function requests, or
 * VERCEL_OIDC_TOKEN locally).
 */
export interface ModelReply {
  text: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  requestId: string | null;
  provider: string | null;
  model: string;
  /** Which route answered: the provider directly, or the gateway. */
  route: 'direct' | 'gateway';
}

/** The project's own key for the provider, if set. */
export function directKey(): string | null {
  return process.env[CHAT.direct.keyEnv] || null;
}

const BUSY = [429, 498, 503];

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

type Messages = { role: 'system' | 'user' | 'assistant'; content: string }[];
type Opts = { maxTokens: number; temperature: number };

/** Waits and tries again while the answer is "busy"; returns the last response. */
async function withBusyRetries(send: () => Promise<Response>): Promise<Response> {
  let res = await send();
  for (const wait of BUSY_RETRY_MS) {
    if (!BUSY.includes(res.status)) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  return res;
}

function priced(model: string, j: { usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } }) {
  const promptTokens = j.usage?.prompt_tokens ?? 0;
  const completionTokens = j.usage?.completion_tokens ?? 0;
  const price = CHAT.prices[model];
  // The gateway's own figure when it gives one; otherwise tokens × the published price.
  const costUsd = typeof j.usage?.cost === 'number' ? j.usage.cost : promptTokens * price.input + completionTokens * price.output;
  return { promptTokens, completionTokens, costUsd };
}

/** The provider directly, with the project's key. Null when it did not answer, so the caller can fall back. */
async function completeDirect(key: string, model: string, messages: Messages, opts: Opts, retry: boolean): Promise<ModelReply | null> {
  const send = () =>
    fetch(CHAT.direct.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature }),
    });
  const res = retry ? await withBusyRetries(send) : await send();
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { id?: string; model?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    ...priced(model, j),
    requestId: j.id ?? res.headers.get('x-request-id'),
    provider: CHAT.provider,
    model: j.model ?? model,
    route: 'direct',
  };
}

export async function complete(token: string | null, model: string, messages: Messages, opts: Opts): Promise<ModelReply> {
  const key = directKey();
  if (key) {
    // With a fallback, hand over at once when the provider is busy; without one, wait and retry here.
    const direct = await completeDirect(key, model, messages, opts, !CHAT.gatewayFallback);
    if (direct) return direct;
    if (!CHAT.gatewayFallback || !token) throw new ModelUnavailable('direct call did not answer');
  }
  if (!token) throw new ModelUnavailable('no route to the model');
  return completeGateway(token, model, messages, opts);
}

async function completeGateway(token: string, model: string, messages: Messages, opts: Opts): Promise<ModelReply> {
  const send = () =>
    fetch(CHAT.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, providerOptions: providerOptions() }),
    });
  // The same provider only (owner's condition, principle 6). When it is busy (429;
  // 498, Groq's "flex capacity exceeded"; 503), wait and try again: 1, 2 and 4
  // seconds, about 7 seconds in all, before reporting that the model did not answer.
  const res = await withBusyRetries(send);
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
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    ...priced(model, j),
    requestId: j.id ?? res.headers.get('x-vercel-id'),
    provider,
    model: j.model ?? model,
    route: 'gateway',
  };
}
