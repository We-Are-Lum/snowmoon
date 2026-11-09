import { CLOSED_IMAGES } from '../config';

/**
 * The challenge Model row's words (branch challenge-models, 2026-11-08). DRAFT wording, drafted by the coding agent
 * (Claude, a closed model by Anthropic), for the owner's approval. The notices themselves and the 18+ line are legal
 * texts (src/lib/legal.ts MODEL_NOTICES, ADULT_CONFIRM).
 */
export const MODEL_WORDING = {
  legend: 'Model',
  openDefault: 'Open (default)',
  /** Beside a closed model, after its maker's retention label. */
  countsAs: `Uses ${CLOSED_IMAGES.countsAs} of today's pictures`,
  about: (usd: number) => `about $${usd.toFixed(2)} a picture`,
  notOffered: 'That model isn’t offered here. Choose another.',
  walletOnly: 'Closed models are for free daily pictures only, for now.',
  noticeFirst: 'Read the model’s notice first.',
  adultFirst: 'Confirm you’re 18 or older first.',
} as const;
