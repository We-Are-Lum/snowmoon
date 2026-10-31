import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type postgres from 'postgres';
import { CHAT } from '../config';
import { servedBy } from './provider';
import { makeCheck, makeStart, makeStartedToday, record } from './limits';

/**
 * Make mode (routing C, owner 2026-10-30). Once the routing call says "make something", the conversation runs on
 * Kimi K3 (CHAT.make.model) through Vercel AI Gateway, pinned to Baseten only, with zero data retention required on
 * every call and no fallback: a refusal, an error, a reply from any other provider or one without zero retention
 * confirmed is not used, and the person is told making is unavailable. Nothing about the conversation is stored:
 * only a count under the FID (a new make conversation) and the cost in the daily totals (src/lib/chat/limits.ts).
 *
 * The conversation stays in make mode through a signed token the device sends back (no table): the FID, the UTC day
 * it was counted on, and a random id, signed with a key derived from IMAGES_TICKET_SECRET. A token from an earlier day
 * keeps the conversation on Kimi K3 and is counted again for the new day.
 */
export class MakeUnavailable extends Error {}

/** Every make call's gateway options: Baseten only, zero data retention. No `order`, no `models`: nothing to fall back to. */
export function makeProviderOptions() {
  return { gateway: { only: [CHAT.make.provider], zeroDataRetention: CHAT.make.zeroDataRetention } };
}

export type MakeMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: { id: string; type?: 'function'; function: { name: string; arguments: string } }[]; reasoning?: string }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface MakeTool extends ToolDef {
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export type MakeCall = (
  messages: MakeMessage[],
  tools: ToolDef[],
) => Promise<{ message: Extract<MakeMessage, { role: 'assistant' }>; promptTokens: number; completionTokens: number; costUsd: number; provider: string; model: string }>;

type GatewayReply = {
  model?: string;
  choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; reasoning?: string; provider_metadata?: { gateway?: { enabledZeroDataRetention?: boolean } } } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

/** The one route to Kimi K3: the gateway, pinned to Baseten. `send` is fetch; the tests pass a stand-in. */
export function completeMake(token: string, send: typeof fetch = fetch): MakeCall {
  return async (messages, tools) => {
    let res: Response;
    try {
      res = await send(CHAT.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CHAT.make.model,
          messages,
          ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}),
          temperature: 0.2,
          max_tokens: CHAT.make.maxTokens,
          providerOptions: makeProviderOptions(),
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new MakeUnavailable('no answer');
    }
    const j = (await res.json().catch(() => ({}))) as GatewayReply;
    const m = j.choices?.[0]?.message;
    if (!res.ok || !m) throw new MakeUnavailable(`gateway ${res.status}`);
    const provider = servedBy(j);
    if (provider !== CHAT.make.provider) throw new MakeUnavailable(`served by ${provider}, not ${CHAT.make.provider}`);
    if (m.provider_metadata?.gateway?.enabledZeroDataRetention !== true) throw new MakeUnavailable('zero data retention not confirmed');
    const promptTokens = j.usage?.prompt_tokens ?? 0;
    const completionTokens = j.usage?.completion_tokens ?? 0;
    const costUsd = typeof j.usage?.cost === 'number' ? j.usage.cost : promptTokens * CHAT.make.prices.input + completionTokens * CHAT.make.prices.output;
    return {
      message: { role: 'assistant', content: m.content ?? '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: 'function' as const, function: c.function })) } : {}), ...(m.reasoning ? { reasoning: m.reasoning } : {}) },
      promptTokens,
      completionTokens,
      costUsd,
      provider,
      model: j.model ?? CHAT.make.model,
    };
  };
}

// --- The make token -------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

function tokenKey(): Buffer | null {
  const s = process.env.IMAGES_TICKET_SECRET;
  return s && s.length >= 32 ? createHmac('sha256', s).update('chat:make').digest() : null;
}

/** Make mode needs the key that signs its tokens. */
export const makeTokensReady = () => tokenKey() !== null;

export function signMakeToken(fid: number, day = today()): string {
  const k = tokenKey();
  if (!k) throw new MakeUnavailable('no token key');
  const body = Buffer.from(JSON.stringify({ v: 1, f: fid, d: day, n: randomBytes(9).toString('base64url') })).toString('base64url');
  return `m1.${body}.${createHmac('sha256', k).update(body).digest('base64url')}`;
}

/** The conversation behind a make token, if it is ours and this FID's; null otherwise. */
export function readMakeToken(token: unknown, fid: number): { day: string } | null {
  const k = tokenKey();
  if (!k || typeof token !== 'string' || token.length > 300) return null;
  const [p, body, sig] = token.split('.');
  if (p !== 'm1' || !body || !sig) return null;
  const want = createHmac('sha256', k).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as { v?: number; f?: number; d?: string };
    return t.v === 1 && t.f === fid && typeof t.d === 'string' ? { day: t.d } : null;
  } catch {
    return null;
  }
}

// --- One make turn ----------------------------------------------------------------

export type MakeResult =
  | { state: 'made'; text: string; make: string; left: number }
  | { state: 'make-limit' }
  | { state: 'make-spend' }
  | { state: 'make-unavailable' };

export interface MakeDeps {
  sql: postgres.Sql;
  fid: number;
  call: MakeCall;
  tools: MakeTool[];
  /** config/prompts/chat-make.md; {{LIMIT}} becomes the thread's chapter limit. */
  systemPrompt: string;
  /** Milliseconds a turn may keep starting model calls (a Vercel function has 300 s in all). */
  budgetMs?: number;
}

export interface MakeInput {
  question: string;
  limit: number;
  history: { role: 'user' | 'assistant'; text: string }[];
  make?: unknown;
}

/** Worst case of one call: its input as it stands (about 3 characters a token) and a full answer. */
export function makeWorstUsd(messages: MakeMessage[], tools: ToolDef[]): number {
  const chars = JSON.stringify(messages).length + JSON.stringify(tools).length;
  return Math.ceil(chars / 3) * CHAT.make.prices.input + CHAT.make.maxTokens * CHAT.make.prices.output;
}

export const STOPPED = 'I stopped here: that took more steps than one message allows. Tell me how you’d like to go on.';

export async function makeTurn(deps: MakeDeps, input: MakeInput): Promise<MakeResult> {
  const { sql, fid } = deps;
  const session = readMakeToken(input.make, fid);
  let counted = session !== null && session.day === today();
  const token = counted ? (input.make as string) : null;
  const tools: ToolDef[] = deps.tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const messages: MakeMessage[] = [
    { role: 'system', content: deps.systemPrompt.replace('{{LIMIT}}', String(input.limit)) },
    ...input.history.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: input.question },
  ];
  const started = Date.now();
  let left: number | null = null;
  let text = '';
  for (let step = 0; ; step++) {
    if (step >= CHAT.make.stepsPerTurn || Date.now() - started > (deps.budgetMs ?? 180_000)) {
      text = text || STOPPED;
      break;
    }
    const check = await makeCheck(sql, makeWorstUsd(messages, tools), counted ? undefined : fid);
    if (!check.ok) return check.reason === 'make-limit' ? { state: 'make-limit' } : { state: 'make-spend' };
    let r;
    try {
      r = await deps.call(messages, tools);
    } catch (e) {
      if (e instanceof MakeUnavailable) return { state: 'make-unavailable' };
      throw e;
    }
    await record(sql, { kind: 'answer', model: CHAT.make.model, provider: r.provider, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd });
    // A conversation counts once its first call is answered: an outage costs nobody one of the day's ten.
    if (!counted) {
      left = await makeStart(sql, fid);
      counted = true;
    }
    messages.push(r.message);
    if (r.message.content) text = r.message.content;
    if (!r.message.tool_calls?.length) break;
    for (const tc of r.message.tool_calls) {
      const tool = deps.tools.find((t) => t.name === tc.function.name);
      let out: unknown;
      try {
        const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        out = tool ? await tool.run(args) : { error: `no tool ${tc.function.name}` };
      } catch (e) {
        // A tool's own message is meant for the model (it names the next step); anything else is not passed on.
        out = { error: e instanceof SyntaxError ? 'arguments were not JSON' : (e as { toolMessage?: boolean }).toolMessage ? (e as Error).message : 'the tool failed' };
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(out).slice(0, CHAT.make.toolResultChars) });
    }
  }
  if (left === null) left = Math.max(0, CHAT.make.conversationsPerDay - (await makeStartedToday(sql, fid)));
  return { state: 'made', text, make: token ?? signMakeToken(fid), left };
}
