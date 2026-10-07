/**
 * One source of truth for constants (Build Brief rule 7).
 * Caps, thresholds, moderator FIDs, and model names live here as they are added.
 */
export const WORK_ID = 'snowmoon';

export const WORK = {
  id: WORK_ID,
  title: 'Snowmoon',
  author: 'Vitalik Buterin',
  license: 'GPL-3.0',
  sourceUrl: 'https://vitalik.eth.limo/snowmoon/',
  chapters: 32,
} as const;

export const APP_NAME = 'Snowmoon Living Edition';
export const REPO_URL = 'https://github.com/We-Are-Lum/snowmoon';

/**
 * FID credited for system generations (narration, digests, analysis): the
 * project owner's account until the project has its own (brief §5, owner's
 * decision Oct 5, 2026). Recorded permanently on append-only rows.
 */
export const SYSTEM_FID = 6786;

/** Saved quote cards per FID per day (spam limit; saving costs nothing). */
export const CARD_SAVES_PER_DAY = 50;

/**
 * The reading assistant, slice 1: ask about the book (docs/proposals/chat.md).
 * Models are on config/models.json; the host is named in the first-time notice.
 */
export const CHAT = {
  /** Answers. Open weights, Apache-2.0. */
  model: 'openai/gpt-oss-120b',
  modelName: 'gpt-oss-120b',
  /** Checks every answer against config/prompts/chat-guard.md. Open weights, Apache-2.0. */
  guardModel: 'openai/gpt-oss-safeguard-20b',
  /** Who receives the messages, as the notice names it. */
  host: 'Vercel AI Gateway',
  endpoint: 'https://ai-gateway.vercel.sh/v1/chat/completions',
  /** USD per token, from the gateway's published list (2026-10-07). */
  prices: {
    'openai/gpt-oss-120b': { input: 0.1e-6, output: 0.5e-6 },
    'openai/gpt-oss-safeguard-20b': { input: 0.07e-6, output: 0.2e-6 },
  } as Record<string, { input: number; output: number }>,
  /** Answers per FID per UTC day (refusals and held-back answers count). */
  messagesPerDay: 30,
  /** Total spend per UTC day across everyone, in USD. Test cap: $2 (owner instruction, Oct 7, 2026). */
  dailySpendCapUsd: 2,
  /** Passages sent to the model, plus the block before each. */
  passages: 8,
  /** Turns of the thread sent back with each question. */
  historyTurns: 6,
  questionMaxChars: 600,
} as const;

/** Moderation only: these FIDs may hide content. They never promote or rank anything. */
export const MODERATOR_FIDS: readonly number[] = [];

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:3000';
}
