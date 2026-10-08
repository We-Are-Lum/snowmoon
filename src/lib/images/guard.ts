import 'server-only';
import { IMAGES } from '../config';
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

export async function checkPrompt(prompt: string, request: Request): Promise<GuardResult> {
  const reply = await complete(gatewayToken(request), IMAGES.guardModel, [
    { role: 'system', content: promptFile('image-guard.md') },
    { role: 'user', content: prompt },
  ], { maxTokens: 400, temperature: 0 });
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
