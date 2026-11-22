import 'server-only';
import { CHAT, IMAGES, PROMPT_CHECK_MAX_TOKENS } from '../config';
import { complete, gatewayToken, promptFile } from '../chat/model';
import { NO_ANSWER_CATEGORY } from './refusal-wording';

/**
 * The prompt check (decision 14), before anything is spent on an image: gpt-oss-safeguard-20b,
 * on Groq like the assistant, against the public policy config/prompts/image-guard.md. One layer
 * among several (section 7); it can be argued with, so the host's safety checker and reports
 * follow it. Anything but a clear "allow" is a refusal.
 */
export interface GuardResult {
  allow: boolean;
  category: string | null;
  costUsd: number;
  provider: string | null;
  /** How many checks it took (1, or 2 after a check that gave no answer). */
  attempts?: number;
}

/**
 * The most one prompt check can cost, for the reservation: every character of the policy and the prompt counted as a
 * token (real text is about four characters a token), a margin for the chat's framing, and every allowed output token,
 * at the published price. A check that gives no answer is asked once more, so the reservation's share for the check
 * (PROMPT_CHECK_SHARE_USD, IMAGES.reserveUsd - IMAGES.pricePerMp) must cover it twice (guardWorstWithRetryUsd).
 */
export function guardWorstUsd(promptChars: number, maxTokens: number = PROMPT_CHECK_MAX_TOKENS, policyChars = promptFile('image-guard.md').length): number {
  const price = CHAT.prices[IMAGES.guardModel];
  return (policyChars + promptChars + 100) * price.input + maxTokens * price.output;
}
/** The two checks a prompt can get (the first, and the one retry when it gives no answer). */
export const GUARD_ATTEMPTS = 2;
export const guardWorstWithRetryUsd = (promptChars: number, maxTokens: number = PROMPT_CHECK_MAX_TOKENS, policyChars?: number) =>
  GUARD_ATTEMPTS * guardWorstUsd(promptChars, maxTokens, policyChars);

/** The category a check that gave no answer is refused and counted under (studio.image_refusals: ^[a-z_]{1,40}$). */
export const NO_ANSWER = NO_ANSWER_CATEGORY;

type Verdict = { allow: boolean; category: string | null } | null;

/**
 * The verdict in a reply, or null when the check gave no answer: an empty reply, or one cut off at the token budget
 * (finish_reason "length") with no verdict line. A reply that ends normally without a clear verdict is an answer, read
 * as "unclear", as before.
 */
export function readVerdict(text: string, finishReason?: string | null): Verdict {
  const line = text.trim().split('\n').reverse().find((l) => l.trim().startsWith('{')) ?? '';
  let verdict: { allow?: unknown; category?: unknown } | null = null;
  try {
    const parsed = JSON.parse(line);
    verdict = parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    verdict = null;
  }
  const clear = verdict !== null && typeof verdict.allow === 'boolean';
  if (!clear && (!text.trim() || finishReason === 'length')) return null;
  const v = verdict ?? {};
  return {
    allow: v.allow === true,
    category: typeof v.category === 'string' ? v.category.slice(0, 40) : v.allow === true ? null : 'unclear',
  };
}

/**
 * `policy` is image-guard.md, except for a closed model's picture with words in quotation marks: the lettering variant
 * with those phrases in it (src/lib/images/readback.ts letteringPolicy; owner, 2026-11-22).
 * maxTokens covers the model's reasoning and its one-line answer (PROMPT_CHECK_MAX_TOKENS, owner 2026-11-22). A check
 * that gives no answer (readVerdict null) is asked once more with the same budget; still none, and it is refused under
 * NO_ANSWER, which says so (refusal-wording.ts) and never "the rules don't allow". Both checks' costs are counted.
 */
export async function checkPrompt(prompt: string, request: Request, maxTokens: number = PROMPT_CHECK_MAX_TOKENS): Promise<GuardResult> {
  return checkPromptWith(promptFile('image-guard.md'), prompt, request, maxTokens);
}

/** The same check against another policy: only the lettering variant, for a closed model's quoted words (owner, 2026-11-22). */
export async function checkPromptWith(policy: string, prompt: string, request: Request, maxTokens: number = PROMPT_CHECK_MAX_TOKENS): Promise<GuardResult> {
  let costUsd = 0;
  let provider: string | null = null;
  for (let attempt = 0; attempt < GUARD_ATTEMPTS; attempt++) {
    const reply = await complete(gatewayToken(request), IMAGES.guardModel, [
      { role: 'system', content: policy },
      { role: 'user', content: prompt },
    ], { maxTokens, temperature: 0 });
    costUsd += reply.costUsd;
    provider = reply.provider ?? provider;
    const verdict = readVerdict(reply.text, reply.finishReason);
    if (verdict) return { ...verdict, costUsd, provider, attempts: attempt + 1 };
  }
  return { allow: false, category: NO_ANSWER, costUsd, provider, attempts: GUARD_ATTEMPTS };
}
