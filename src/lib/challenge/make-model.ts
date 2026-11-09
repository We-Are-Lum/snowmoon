import 'server-only';
import { IMAGES } from '../config';
import { makeEdit, makeQwenEdit, type Made } from '../images/fal';
import type { Spend } from '../images/limits';
import { generateReserveUsd } from '../images/price';
import { QWEN, qwenCostUsd, reserveUsd, type ChallengeModel } from './models';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makeChallengeClosed, toWide } from '../images/closed';

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

/**
 * Qwen ignores image_size (1376 x 768 for 1024 x 576), so its picture is cropped to IMAGES.size's shape and scaled, as a
 * closed model's is (toWide), and costed by what fal bills for what it returned (qwenCostUsd). The recipe records both.
 */
async function makeQwen(prompt: string, ref: Reference, worstUsd: number): Promise<Made> {
  const made = await makeQwenEdit(QWEN.endpoint, prompt, ref, IMAGES.size, worstUsd);
  const meta = await sharp(made.bytes).metadata();
  const out = { width: meta.width ?? IMAGES.size.width, height: meta.height ?? IMAGES.size.height };
  const wide = await toWide(made.bytes, IMAGES.size);
  return {
    ...made,
    bytes: wide.bytes,
    contentType: 'image/jpeg',
    costUsd: qwenCostUsd(out),
    settings: { ...made.settings, converted: { from: `${out.width}x${out.height} (the model's own size; image_size not followed)`, sha256: createHash('sha256').update(made.bytes).digest('hex'), to: 'jpeg', resized_to: IMAGES.size, crop: wide.words, cropped: wide.crop } },
  };
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
  if (m.id === 'qwen-image-edit') return makeQwen(prompt, ref, worstUsd - (IMAGES.reserveUsd - IMAGES.pricePerMp));
  return makeChallengeClosed(m, prompt, ref.bytes, request, worstUsd - (IMAGES.reserveUsd - IMAGES.pricePerMp));
}
