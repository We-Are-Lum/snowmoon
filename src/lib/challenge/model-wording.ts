import { CLOSED_IMAGES } from '../config';

/**
 * The challenge Model row's words (branch challenge-models, 2026-11-08). DRAFT wording, drafted by the coding agent
 * (Claude, a closed model by Anthropic), for the owner's approval. The notices themselves and the 18+ line are legal
 * texts (src/lib/legal.ts MODEL_NOTICES, ADULT_CONFIRM).
 */
export const MODEL_WORDING = {
  legend: 'Model',
  openDefault: 'Open (default)',
  /**
   * The line under a closed pick, the owner's exact words (2026-11-08). The costs are literal text; scripts/test-model-choice.ts
   * (C17) ties each to its model's estimateUsd (src/lib/challenge/models.ts), so a price change can't leave them stale.
   */
  closedLine: {
    OpenAI: 'a closed model by OpenAI · costs us about $0.05 · OpenAI may keep your prompt and picture up to 30 days · uses 3 of today\'s pictures',
    Google: 'a closed model by Google · costs us about $0.07 · Google keeps no copy; abuse logs up to 90 days · uses 3 of today\'s pictures',
  } as Record<string, string>,
  /**
   * Too few of today's free pictures left for a closed pick (the owner's words, 2026-11-08). `reset` is 00:00 UTC in
   * the visitor's own time, rendered in the browser (resetLocal), never on the server. With none left, "enough for the
   * open models" isn't true: the n = 0 sentence is this agent's proposal (DRAFT).
   */
  tooFew: (n: number, reset: string) =>
    n > 0
      ? `A closed model uses ${CLOSED_IMAGES.countsAs} of today's pictures; you have ${n} left, enough for the open models. More pictures at ${reset}.`
      : `A closed model uses ${CLOSED_IMAGES.countsAs} of today's pictures; you have none left today. More pictures at ${reset}.`,
  notOffered: 'That model isn’t offered here. Choose another.',
  /** The owner's exact words (2026-11-08), in place of the closed models for a wallet account, and its refusal. */
  walletOnly: 'Closed models need a Farcaster, Lens or Bluesky sign-in.',
  noticeFirst: 'Read the model’s notice first.',
  adultFirst: 'Confirm you’re 18 or older first.',
} as const;

/** 00:00 UTC (when the day's pictures come back) in the visitor's own time, e.g. "4:00 pm". In the browser only. */
export function resetLocal(now: Date = new Date(), timeZone?: string): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).replace(/\s?([AP])M$/i, (_m, x: string) => ` ${x.toLowerCase()}m`);
}
