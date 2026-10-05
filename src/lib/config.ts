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

/** Moderation only: these FIDs may hide content. They never promote or rank anything. */
export const MODERATOR_FIDS: readonly number[] = [];

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:3000';
}
