import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { checkPrompt } from './guard';
import { ImageUnavailable, type Made } from './fal';
import { fundedBy, perDay, recordGuard, reserve, settle, wordsCheckFits, type Spend } from './limits';
import { blockedName } from './rules';
import { IMAGE_WORDING } from './wording';
import { creditBack } from '../wallet/credits';

/**
 * Every paid picture goes through here, in this order (docs/proposals/add-an-image.md, section 5;
 * step 4 adds samples, sheet views and reference pictures to the same path):
 * 1. counted against the person's day and the spend caps, its worst case reserved (limits.ts);
 * 2. the blocked-names list, then the prompt check (guard.ts) on the person's words and any
 *    added style or sheet text, before anything is spent on a picture;
 * 3. the picture, from fal.ai with the host's safety checker on;
 * 4. the reservation replaced by the real costs; a picture the checker flags is dropped.
 * The caller has already checked sign-in, the off switch, setup, its input, consent and the gate
 * (gate.ts: invited FIDs, or a Neynar score of at least IMAGES.neynarMinScore), in that order.
 * A wallet account (fid below zero) pays for the Generate from its prepaid balance in step 1. Payments are
 * final (owner, 2026-10-13): never paid back as money. A Generate that fails (the prompt check or the image
 * model didn't answer), and, since the owner chose reading B (2026-10-22), a refused prompt or a picture the safety
 * checker drops: every Generate that gives no picture is credited back to the balance once
 * IMAGES.prepaid.creditBack is on (migrations 0022 and 0027_wallet_credit_reasons).
 */
type Sql = postgres.Sql;

export type Paid =
  | { ok: true; made: Made; left: number }
  | { ok: false; status: number; error: string; extra: Record<string, unknown> };

export const LIMIT_SAY = {
  limit: (n: number) => `You've made ${n} today. More tomorrow (00:00 UTC).`,
  spend: 'Image making has reached today’s spending limit for everyone. It comes back at 00:00 UTC.',
  balance: IMAGE_WORDING.prepaid.lowBalance,
  'prepaid-spend': IMAGE_WORDING.prepaid.dailyCap,
} as const;
const say = (refusal: keyof typeof LIMIT_SAY, fid: number) => (refusal === 'limit' ? LIMIT_SAY.limit(perDay(fid)) : LIMIT_SAY[refusal]);
/** A failure's words, and, when a wallet account's Generate was credited back, that it was. */
export const failed = (error: string, back: boolean) => (back ? `${error} ${IMAGE_WORDING.prepaid.creditedBack}` : error);

export async function paidPicture(
  sql: Sql,
  fid: number,
  request: Request,
  job: { checkText: string; spend?: Spend; make: () => Promise<Made>; /** The local tests' stand-in for the prompt check (never on Vercel; see agents/approve.ts). */ check?: (text: string) => Promise<Awaited<ReturnType<typeof checkPrompt>>> },
): Promise<Paid> {
  const spend = job.spend;
  const funded = fundedBy(fid);
  const r = await reserve(sql, fid, spend);
  if (!r.ok) return { ok: false, status: 429, error: say(r.refusal, fid), extra: { reason: r.refusal } };
  const name = blockedName(job.checkText);
  if (name) {
    await settle(sql, {}, spend, funded);
    const back = await creditBack(sql, r.debitId, 'refused');
    return { ok: false, status: 422, error: failed('No real people: the prompt names someone on the blocked list.', back), extra: { reason: 'blocked', category: 'real_person', left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  let guard;
  try {
    guard = job.check && !process.env.VERCEL ? await job.check(job.checkText) : await checkPrompt(job.checkText, request);
  } catch (e) {
    await settle(sql, {}, spend, funded);
    console.error('image prompt check failed', (e as Error).name);
    const back = await creditBack(sql, r.debitId, 'failed');
    return { ok: false, status: 503, error: failed('The prompt check did not answer. Try again in a moment.', back), extra: { left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  if (!guard.allow) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'blocked' } }, spend, funded);
    const back = await creditBack(sql, r.debitId, 'refused');
    return { ok: false, status: 422, error: failed('This prompt asks for something the rules don’t allow.', back), extra: { reason: 'blocked', category: guard.category, left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  let made: Made;
  try {
    made = await job.make();
  } catch (e) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' } }, spend, funded);
    console.error('image generation failed', e instanceof ImageUnavailable ? e.message : (e as Error).name);
    const back = await creditBack(sql, r.debitId, 'failed');
    return { ok: false, status: 503, error: failed('The image model did not answer. Try again in a moment.', back), extra: { left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' }, image: { costUsd: made.costUsd, verdict: made.nsfw ? 'nsfw' : 'ok' } }, spend, funded);
  // Flagged by the host's safety checker: dropped here, never shown or stored.
  if (made.nsfw) {
    const back = await creditBack(sql, r.debitId, 'dropped');
    return { ok: false, status: 422, error: failed('The image was flagged by the safety checker and dropped.', back), extra: { reason: 'nsfw', left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
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
