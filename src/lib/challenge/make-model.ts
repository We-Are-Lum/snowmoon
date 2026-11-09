import 'server-only';
import { IMAGES } from '../config';
import { makeEdit, makeQwenEdit, type Made } from '../images/fal';
import { makeChallengeClosed } from '../images/closed';
import type { Spend } from '../images/limits';
import { generateReserveUsd } from '../images/price';
import { QWEN, reserveUsd, type ChallengeModel } from './models';

/**
 * One challenge picture with the chosen model (branch challenge-models): what paidPicture reserves (spend), what the
 * recipe records (model id, endpoint, host), and the call. The picture tapped is the single reference image; the
 * prompt is the same for every model. The open default keeps today's call exactly (makeEdit, FLUX.2 [klein] 4B edit).
 */
export type Reference = { bytes: Buffer; contentType: string; width: number; height: number };

/** The open default reserves as today (generateReserveUsd, per reference picture); the others per models.ts. */
export function challengeSpend(m: ChallengeModel, refs: { width: number; height: number }[]): Spend {
  const reserve = m.id === 'flux2-klein-4b-edit' ? generateReserveUsd(refs.length) : reserveUsd(m, refs[0]);
  return { model: { id: m.allowlistId, host: m.call.host }, reserveUsd: reserve, ...(m.open ? {} : { pool: 'closed' as const }) };
}

/** What the recipe records as the model: its allowlist id, its name, the endpoint called and its host. */
export const recipeModel = (m: ChallengeModel) => ({ id: m.allowlistId, name: m.name, endpoint: m.call.endpoint, host: m.call.host });

/**
 * Makes the picture. `refs` is the tapped picture first; only the open default takes more (today's other characters'
 * looks), every other model takes the tapped picture alone.
 */
export function makeWith(m: ChallengeModel, prompt: string, refs: Reference[], request: Request, worstUsd: number): Promise<Made> {
  if (m.id === 'flux2-klein-4b-edit') return makeEdit(prompt, refs);
  const ref = refs[0];
  if (m.id === 'qwen-image-edit') return makeQwenEdit(QWEN.endpoint, prompt, ref, IMAGES.size, worstUsd - (IMAGES.reserveUsd - IMAGES.pricePerMp));
  return makeChallengeClosed(m, prompt, ref.bytes, request, worstUsd - (IMAGES.reserveUsd - IMAGES.pricePerMp));
}
