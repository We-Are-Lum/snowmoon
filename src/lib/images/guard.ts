import 'server-only';
import { CHAT, IMAGES } from '../config';
import { complete, gatewayToken, promptFile } from '../chat/model';

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
}

/**
 * The most one prompt check can cost, for the reservation: every character of the policy and the prompt counted as a
 * token (real text is about four characters a token), a margin for the chat's framing, and every allowed output token,
 * at the published price. The reservation's share for the check (IMAGES.reserveUsd - IMAGES.pricePerMp) must cover it.
 */
export function guardWorstUsd(promptChars: number, maxTokens: number, policyChars = promptFile('image-guard.md').length): number {
  const price = CHAT.prices[IMAGES.guardModel];
  return (policyChars + promptChars + 100) * price.input + maxTokens * price.output;
}

/** maxTokens covers the model's reasoning and its one-line answer: run out, and the answer is empty (a refusal). */
export async function checkPrompt(prompt: string, request: Request, maxTokens = 400): Promise<GuardResult> {
  const reply = await complete(gatewayToken(request), IMAGES.guardModel, [
    { role: 'system', content: promptFile('image-guard.md') },
    { role: 'user', content: prompt },
  ], { maxTokens, temperature: 0 });
  const line = reply.text.trim().split('\n').reverse().find((l) => l.trim().startsWith('{')) ?? '';
  let verdict: { allow?: unknown; category?: unknown } = {};
  try {
    verdict = JSON.parse(line);
  } catch {
    verdict = {};
  }
  return {
    allow: verdict.allow === true,
    category: typeof verdict.category === 'string' ? verdict.category.slice(0, 40) : verdict.allow === true ? null : 'unclear',
    costUsd: reply.costUsd,
    provider: reply.provider,
  };
}
