/**
 * The Claude trial (owner, 2026-10-23): Claude Opus 5.5 and Claude Sonnet 5.5 as the answer model in the
 * 50-question check, for comparison with gpt-oss-120b. Evaluation only: the app's chat code is unchanged.
 *
 * Calls the Anthropic Messages API directly with the trial's own key, SNOWMOON_ANTHROPIC_KEY (a key from a
 * Snowmoon workspace in the owner's Console organization), kept in /Users/nathan/snowmoon/.env.anthropic.local
 * and loaded with --env-file-if-exists (owner, 2026-10-24: `vercel env pull` rewrites .env.local), and passed
 * explicitly as the x-api-key header. The standard variable name is never read: see refuseAmbientAnthropicKey. Every paid call of the trial, Anthropic's and the gateway's, goes through
 * one spend ledger whose cap is checked before each call with that call's worst case, so a run stops at the
 * cap instead of passing it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** USD per token, Anthropic's published list (platform.claude.com/docs/en/about-claude/pricing, read 2026-10-23). */
export const CLAUDE_PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4e-6, output: 20e-6, cacheWrite: 5e-6, cacheRead: 0.2e-6 },
  'claude-sonnet-5-5': { input: 2e-6, output: 10e-6, cacheWrite: 2.5e-6, cacheRead: 0.1e-6 },
};

export const isClaude = (model: string) => model in CLAUDE_PRICES;

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** What a call cost: uncached input, cache writes (5-minute), cache reads, and output (thinking included). */
export function claudeCost(model: string, u: ClaudeUsage): number {
  const p = CLAUDE_PRICES[model];
  if (!p) throw new Error(`no price for ${model}`);
  return u.input_tokens * p.input + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite + (u.cache_read_input_tokens ?? 0) * p.cacheRead + u.output_tokens * p.output;
}

/**
 * The most a call can cost, for the check before it: input counted generously (one token per 2.5 characters,
 * all of it at the cache-write price) and every output token up to max_tokens.
 */
export function worstCaseClaudeUsd(model: string, promptChars: number, maxTokens: number): number {
  const p = CLAUDE_PRICES[model];
  return Math.ceil(promptChars / 2.5) * Math.max(p.input, p.cacheWrite) + maxTokens * p.output;
}

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * The app's messages in Anthropic's shape: leading system messages become the system blocks, the last one
 * marked for prompt caching (the answer prompt is the same for every question; under the model's minimum
 * cacheable length the mark is ignored at no cost).
 */
export function toAnthropic(messages: Message[]) {
  let i = 0;
  const system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[] = [];
  while (i < messages.length && messages[i].role === 'system') system.push({ type: 'text', text: messages[i++].content });
  if (system.length) system[system.length - 1].cache_control = { type: 'ephemeral' };
  const rest = messages.slice(i).map((m) => {
    if (m.role === 'system') throw new Error('a system message after the first turn');
    return { role: m.role as 'user' | 'assistant', content: m.content };
  });
  return { system, messages: rest };
}

export class CapReached extends Error {}

/**
 * Owner, 2026-10-24: no session here may rely on the standard Anthropic key variable. If it is set at all,
 * the check refuses to run rather than risk a tool or library picking it up. (Its name appears only here.)
 */
export function refuseAmbientAnthropicKey(env: Record<string, string | undefined> = process.env) {
  if (env.ANTHROPIC_API_KEY !== undefined)
    throw new Error('ANTHROPIC_API_KEY is set in the environment; unset it. The trial reads SNOWMOON_ANTHROPIC_KEY only (/Users/nathan/snowmoon/.env.anthropic.local).');
}

/** The trial's spend ledger, kept in a file so the cap holds across runs (one run per model). */
export class Ledger {
  readonly file: string;
  readonly capUsd: number;
  spentUsd = 0;
  byModel: Record<string, number> = {};
  calls = 0;
  constructor(file: string, capUsd: number) {
    this.file = file;
    this.capUsd = capUsd;
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, 'utf8')) as { spent_usd: number; by_model: Record<string, number>; calls: number };
      this.spentUsd = j.spent_usd;
      this.byModel = j.by_model;
      this.calls = j.calls;
    }
  }
  /** Before every paid call: stop if this call's worst case would take the trial past the cap. */
  check(worstUsd: number, what: string) {
    if (this.spentUsd + worstUsd > this.capUsd)
      throw new CapReached(`spend cap: $${this.spentUsd.toFixed(4)} spent of $${this.capUsd}; ${what} could cost up to $${worstUsd.toFixed(4)}`);
  }
  add(model: string, usd: number) {
    this.spentUsd += usd;
    this.byModel[model] = (this.byModel[model] ?? 0) + usd;
    this.calls++;
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ cap_usd: this.capUsd, spent_usd: this.spentUsd, by_model: this.byModel, calls: this.calls }, null, 1) + '\n');
  }
}

export interface ClaudeReply {
  text: string;
  id: string | null;
  model: string;
  stopReason: string | null;
  usage: ClaudeUsage;
  costUsd: number;
}

/**
 * One Messages API call. Thinking is adaptive (it can't be turned off on Claude Opus 5.5) and counts toward
 * max_tokens, so the answer gets more room than the app's 1,200; temperature is not sent (both models reject
 * a non-default one). No refusal fallback: a refusal is recorded as one, not answered by another model.
 */
export async function callClaude(opts: {
  key: string;
  model: string;
  messages: Message[];
  maxTokens: number;
  effort: string;
  fetchImpl?: typeof fetch;
  onBusy?: () => void;
}): Promise<ClaudeReply> {
  const f = opts.fetchImpl ?? fetch;
  const { system, messages } = toAnthropic(opts.messages);
  const body = JSON.stringify({ model: opts.model, max_tokens: opts.maxTokens, system, messages, output_config: { effort: opts.effort } });
  const send = () =>
    f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': opts.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body,
    });
  let res = await send();
  // Busy or overloaded: wait and try again (not billed); a run isn't cut short by a passing 429 or 529.
  for (let wait = 2000; [429, 500, 503, 529].includes(res.status) && wait <= 32000; wait *= 2) {
    opts.onBusy?.();
    const after = Number(res.headers.get('retry-after'));
    await new Promise((r) => setTimeout(r, Number.isFinite(after) && after > 0 ? after * 1000 : wait));
    res = await send();
  }
  const j = (await res.json()) as {
    id?: string; model?: string; stop_reason?: string; content?: { type: string; text?: string }[]; usage?: ClaudeUsage; error?: { message?: string };
  };
  if (!res.ok) throw new Error(`anthropic ${res.status} ${j.error?.message ?? ''}`.trim());
  const usage = j.usage ?? { input_tokens: 0, output_tokens: 0 };
  return {
    text: (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(''),
    id: j.id ?? null,
    model: j.model ?? opts.model,
    stopReason: j.stop_reason ?? null,
    usage,
    costUsd: claudeCost(opts.model, usage),
  };
}
