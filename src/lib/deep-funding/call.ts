import { CHAT } from '../config';
import { servedBy } from '../chat/provider';
import { gatewayOptions, type JudgeModel } from './models';
import { parseAnswer, type NodeAnswer, type NodePrompt } from './prompt';

/**
 * One model call for one node, through the Vercel AI Gateway (CHAT.endpoint) only. `send` is fetch; the tests pass a
 * stand-in, so no test ever calls a model. A reply is used only if it came from the pinned provider and the gateway
 * confirms zero data retention; otherwise it is recorded with its error and not used. Every raw answer is kept for
 * the results file, used or not.
 */
export interface CallRecord {
  model: string;
  node: string;
  run: number;
  provider: string | null;
  zdrConfirmed: boolean;
  raw: string;
  answer: NodeAnswer | null;
  reason: string;
  error: string | null;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
}

type Reply = {
  model?: string;
  choices?: { message?: { content?: string | null; provider_metadata?: { gateway?: { enabledZeroDataRetention?: boolean; routing?: { finalProvider?: string } } } } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

export function requestBody(m: JudgeModel, p: NodePrompt) {
  return {
    model: m.id,
    messages: p.messages,
    temperature: 0.2,
    max_tokens: 4000,
    response_format: m.structured
      ? { type: 'json_schema', json_schema: { name: 'credit_answer', strict: true, schema: p.schema } }
      : { type: 'json_object' },
    providerOptions: gatewayOptions(m),
  };
}

export async function askModel(m: JudgeModel, p: NodePrompt, run: number, key: string, send: typeof fetch = fetch): Promise<CallRecord> {
  const base: CallRecord = { model: m.id, node: p.node, run, provider: null, zdrConfirmed: false, raw: '', answer: null, reason: '', error: null, costUsd: 0, promptTokens: 0, completionTokens: 0 };
  let res: Response;
  try {
    res = await send(CHAT.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody(m, p)),
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    return { ...base, error: 'gateway unreachable' };
  }
  const j = (await res.json().catch(() => ({}))) as Reply;
  const msg = j.choices?.[0]?.message;
  const u = j.usage ?? {};
  const promptTokens = u.prompt_tokens ?? 0;
  const completionTokens = u.completion_tokens ?? 0;
  const costUsd = typeof u.cost === 'number' ? u.cost : (promptTokens * m.price.input + completionTokens * m.price.output) / 1e6;
  const provider = servedBy(j);
  const zdrConfirmed = msg?.provider_metadata?.gateway?.enabledZeroDataRetention === true;
  const out = { ...base, provider, zdrConfirmed, raw: msg?.content ?? '', costUsd, promptTokens, completionTokens };
  if (!res.ok || !msg) return { ...out, error: `gateway ${res.status}: ${(j.error?.message ?? '').slice(0, 200)}` };
  if (provider !== m.provider) return { ...out, error: `served by ${provider ?? 'unknown'}, not ${m.provider}` };
  if (!zdrConfirmed) return { ...out, error: 'zero data retention not confirmed' };
  const parsed = parseAnswer(out.raw, p.labels);
  return parsed.ok ? { ...out, answer: parsed.answer, reason: parsed.reason } : { ...out, error: `answer refused: ${parsed.why}` };
}
