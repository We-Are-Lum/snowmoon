import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { checkPrompt } from './guard';
import { ImageUnavailable, type Made } from './fal';
import { recordGuard, reserve, settle, wordsCheckFits, type Spend } from './limits';
import { blockedName } from './rules';
import { IMAGE_WORDING } from './wording';

/**
 * Every paid picture goes through here, in this order (docs/proposals/add-an-image.md, section 5;
 * step 4 adds samples, sheet views and reference pictures to the same path):
 * 1. counted against the person's day and the spend caps, its worst case reserved (limits.ts);
 * 2. the blocked-names list, then the prompt check (guard.ts) on the person's words and any
 *    added style or sheet text, before anything is spent on a picture;
 * 3. the picture, from fal.ai with the host's safety checker on;
 * 4. the reservation replaced by the real costs; a picture the checker flags is dropped.
 * The caller has already checked sign-in, the invited list and consent.
 */
type Sql = postgres.Sql;

export type Paid =
  | { ok: true; made: Made; left: number }
  | { ok: false; status: number; error: string; extra: Record<string, unknown> };

export const LIMIT_SAY = {
  limit: `You've made ${IMAGES.generationsPerDay} today. More tomorrow (00:00 UTC).`,
  spend: 'Image making has reached today’s spending limit for everyone. It comes back at 00:00 UTC.',
  'trial-spend': 'The trial has used its test budget for now.',
} as const;

export async function paidPicture(
  sql: Sql,
  fid: number,
  request: Request,
  job: { checkText: string; spend?: Spend; make: () => Promise<Made> },
): Promise<Paid> {
  const spend = job.spend;
  const r = await reserve(sql, fid, spend);
  if (!r.ok) return { ok: false, status: 429, error: LIMIT_SAY[r.refusal], extra: { reason: r.refusal } };
  const name = blockedName(job.checkText);
  if (name) {
    await settle(sql, {}, spend);
    return { ok: false, status: 422, error: 'No real people: the prompt names someone on the blocked list.', extra: { reason: 'blocked', category: 'real_person', left: r.left } };
  }
  let guard;
  try {
    guard = await checkPrompt(job.checkText, request);
  } catch (e) {
    await settle(sql, {}, spend);
    console.error('image prompt check failed', (e as Error).name);
    return { ok: false, status: 503, error: 'The prompt check did not answer. Try again in a moment.', extra: { left: r.left } };
  }
  if (!guard.allow) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'blocked' } }, spend);
    return { ok: false, status: 422, error: 'This prompt asks for something the rules don’t allow.', extra: { reason: 'blocked', category: guard.category, left: r.left } };
  }
  let made: Made;
  try {
    made = await job.make();
  } catch (e) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' } }, spend);
    console.error('image generation failed', e instanceof ImageUnavailable ? e.message : (e as Error).name);
    return { ok: false, status: 503, error: 'The image model did not answer. Try again in a moment.', extra: { left: r.left } };
  }
  await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' }, image: { costUsd: made.costUsd, verdict: made.nsfw ? 'nsfw' : 'ok' } }, spend);
  // Flagged by the host's safety checker: dropped here, never shown or stored.
  if (made.nsfw) return { ok: false, status: 422, error: 'The image was flagged by the safety checker and dropped.', extra: { reason: 'nsfw', left: r.left } };
  return { ok: true, made, left: r.left };
}

/**
 * The prompt check on words that make no picture (decision 1, 2026-10-09: a style's or sheet's name,
 * which is published but not sent to the image model). Blocked names first, then the same model check;
 * its cost goes into the day's totals; refused when the spend caps are reached.
 */
export async function checkWords(sql: Sql, request: Request, text: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!text.trim()) return { ok: true };
  if (blockedName(text)) return { ok: false, status: 422, error: IMAGE_WORDING.designs.form.nameBlocked };
  if (!(await wordsCheckFits(sql))) return { ok: false, status: 429, error: LIMIT_SAY.spend };
  let guard;
  try {
    guard = await checkPrompt(text, request);
  } catch (e) {
    console.error('name check failed', (e as Error).name);
    return { ok: false, status: 503, error: 'The prompt check did not answer. Try again in a moment.' };
  }
  await recordGuard(sql, { costUsd: guard.costUsd, provider: guard.provider, verdict: guard.allow ? 'ok' : 'blocked' });
  return guard.allow ? { ok: true } : { ok: false, status: 422, error: NAME_REFUSED };
}
export const NAME_REFUSED = IMAGE_WORDING.designs.form.nameRefused;
