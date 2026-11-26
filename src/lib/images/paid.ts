import 'server-only';
import type postgres from 'postgres';
import { CHAPTER_PICTURES, IMAGES } from '../config';
import { ALLOWANCE_WORDING } from '../voice/allowance-wording';
import { checkPrompt, checkPromptWith } from './guard';
import { ImageRefused, ImageUnavailable, type Made } from './fal';
import { countRefusal, fundedBy, giveBack, perDay, recordGuard, reserve, settle, wordsCheckFits, type Spend } from './limits';
import { guardRefusal, NO_ANSWER_CATEGORY, REFUSAL_WORDING } from './refusal-wording';
import { blockedName } from './rules';
import { FREE_WORDING } from '../social/free';
import { IMAGE_WORDING } from './wording';
import { creditBack } from '../wallet/credits';
import { LETTERING_WORDING } from './lettering';
import type { LetteringRecord } from './lettering';
import type { AfterMade } from './readback';

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
  | { ok: true; made: Made; left: number; /** A lettered picture's record, once its read-back matched. */ lettering?: LetteringRecord }
  | { ok: false; status: number; error: string; extra: Record<string, unknown> };

export const LIMIT_SAY = {
  limit: (n: number) => `You've made ${n} today. More tomorrow (00:00 UTC).`,
  spend: 'Image making has reached today’s spending limit for everyone. It comes back at 00:00 UTC.',
  balance: IMAGE_WORDING.prepaid.lowBalance,
  'prepaid-spend': IMAGE_WORDING.prepaid.dailyCap,
  // Free remixes (owner, 2026-11-04). Draft wording.
  'remix-limit': `You’ve made today’s ${IMAGES.designs.remixesPerDay} remixes. More tomorrow (00:00 UTC).`,
  'remix-used': `This remix has used its ${IMAGES.designs.picturesPerRemix} pictures. Press Remix to start a new one.`,
  /** A Lens or Bluesky account without free generations (src/lib/social/free.ts). DRAFT wording. */
  'no-free': FREE_WORDING.none,
  // Model choice (branch remix-model-choice, DRAFT wording).
  'closed-limit': IMAGE_WORDING.designs.models.closedLimit,
  'closed-spend': IMAGE_WORDING.designs.models.closedSpend,
  // Admins' chapter pictures (owner, 2026-11-18). DRAFT wording; the page writes {reset} in the admin's own time.
  'admin-spend': `Admins’ chapter pictures have reached today’s $${CHAPTER_PICTURES.adminDailyCapUsd} limit. More at {reset}.`,
  // Storyboard pictures (Nate, 2026-11-23). DRAFT wording, for his reread; the page writes {reset} in the person's own time.
  'storyboard-limit': ALLOWANCE_WORDING.limit,
  'storyboard-spend': ALLOWANCE_WORDING.pool,
} as const;
/** Refusals whose words carry {reset}: the answer carries the instant (00:00 UTC), and the browser writes it. */
const WITH_RESET = new Set<string>(['closed-spend', 'admin-spend', 'storyboard-limit', 'storyboard-spend']);
const say = (refusal: keyof typeof LIMIT_SAY, fid: number) => (refusal === 'limit' ? LIMIT_SAY.limit(perDay(fid)) : LIMIT_SAY[refusal]);
/** A failure's words, and, when a wallet account's Generate was credited back, that it was. */
export const failed = (error: string, back: boolean) => (back ? `${error} ${IMAGE_WORDING.prepaid.creditedBack}` : error);

/** The next 00:00 UTC, as an instant (ISO). The server never renders it as a time. */
export const nextUtcMidnight = (now: Date = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

export async function paidPicture(
  sql: Sql,
  fid: number,
  request: Request,
  job: {
    checkText: string; spend?: Spend; make: () => Promise<Made>; /** The prompt check's token budget (a sheet's views: IMAGES.designs.guardMaxTokens). */ guardMaxTokens?: number;
    /**
     * A picture the model's safety check blocks (the host's checker flagged it, or the model refused): its words, and
     * whether it is given back to today's count (the challenge's open model, owner 2026-11-09). Its spend stays recorded.
     * Without it, a blocked picture counts and says "flagged by the safety checker and dropped", as everywhere else.
     */
    blocked?: { error: string; giveBack: boolean };
    /**
     * A closed model's maker (OpenAI, Google: the model's `maker` field), when the picture is made by one. A refusal by
     * the maker's own check (ImageRefused) then says so by name (src/lib/images/refusal-wording.ts, owner
     * 2026-11-18, reread by the owner 2026-11-22); it counts, as before. Unset for an open model: its own check's words stay as they are.
     */
    maker?: string | null;
    /**
     * The prompt check's policy, when not image-guard.md: a closed model's picture with words in quotation marks gets the
     * lettering variant with those phrases (src/lib/images/readback.ts letteringPolicy; owner, 2026-11-22).
     */
    guardPolicy?: string;
    /**
     * A step after the picture, inside the same reservation (lettering, part C: the read-back, src/lib/images/readback.ts
     * readBack): its cost is counted with the picture's, under the same funding. Not ok: nothing is kept, the person
     * is told what was read, and can only try again (option a, owner 2026-11-22); the picture still counts.
     */
    after?: (made: Made) => Promise<AfterMade>;
  },
): Promise<Paid> {
  const spend = job.spend;
  const funded = spend?.pool === 'admin' ? ('admin' as const) : spend?.pool === 'storyboard' ? ('storyboard' as const) : fundedBy(fid);
  const r = await reserve(sql, fid, spend);
  // A closed-cap refusal carries the instant the cap resets (00:00 UTC); the browser writes it in the visitor's own time.
  if (!r.ok) return { ok: false, status: 429, error: say(r.refusal, fid), extra: { reason: r.refusal, ...(WITH_RESET.has(r.refusal) ? { resetAt: nextUtcMidnight() } : {}) } };
  const name = blockedName(job.checkText);
  if (name) {
    await settle(sql, {}, spend, funded);
    const back = await creditBack(sql, r.debitId, 'refused');
    return { ok: false, status: 422, error: failed('No real people: the prompt names someone on the blocked list.', back), extra: { reason: 'blocked', category: 'real_person', left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  let guard;
  try {
    // Quoted words for a closed model: the lettering policy; every other picture: image-guard.md, as before.
    guard = job.guardPolicy ? await checkPromptWith(job.guardPolicy, job.checkText, request, job.guardMaxTokens) : await checkPrompt(job.checkText, request, job.guardMaxTokens);
  } catch (e) {
    await settle(sql, {}, spend, funded);
    console.error('image prompt check failed', (e as Error).name);
    const back = await creditBack(sql, r.debitId, 'failed');
    return { ok: false, status: 503, error: failed('The prompt check did not answer. Try again in a moment.', back), extra: { left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  if (!guard.allow) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'blocked' } }, spend, funded);
    // The day's count of refusals by category (no person: studio.image_refusals); skipped until that table exists.
    // A check that gave no answer, twice, is counted as 'no_answer' and says so (refusal-wording.ts noAnswer).
    await countRefusal(sql, guard.category);
    const back = await creditBack(sql, r.debitId, 'refused');
    // The rule it was refused under, in plain words ("words" in its own); no category, or one we don't know: the generic line.
    return { ok: false, status: 422, error: failed(guardRefusal(guard.category), back), extra: { reason: 'blocked', category: guard.category, left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  let made: Made;
  try {
    made = await job.make();
  } catch (e) {
    // The model's own safety check refused it (branch challenge-models): counted and answered as a dropped picture.
    if (e instanceof ImageRefused) {
      await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' }, image: { costUsd: 0, verdict: 'nsfw' } }, spend, funded);
      // A closed model's maker refused it: named (owner, 2026-11-18). An open model's refusal keeps its own words.
      return dropped(sql, fid, r, job.maker ? { error: REFUSAL_WORDING.maker(job.maker), giveBack: false } : job.blocked);
    }
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' } }, spend, funded);
    console.error('image generation failed', e instanceof ImageUnavailable ? e.message : (e as Error).name);
    const back = await creditBack(sql, r.debitId, 'failed');
    return { ok: false, status: 503, error: failed('The image model did not answer. Try again in a moment.', back), extra: { left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  // Flagged by the host's safety checker: dropped here, never shown or stored (and never read back).
  if (made.nsfw) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' }, image: { costUsd: made.costUsd, verdict: 'nsfw' } }, spend, funded);
    return dropped(sql, fid, r, job.blocked);
  }
  // A lettered picture's read-back, before the reservation is settled, so its worst case was held with the picture's.
  let after: AfterMade | null = null;
  if (job.after) {
    try {
      after = await job.after(made);
    } catch (e) {
      console.error('lettering read-back failed', (e as Error).name);
      after = null;
    }
  }
  await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' }, image: { costUsd: made.costUsd, verdict: 'ok' }, ...(after ? { readback: after.cost } : {}) }, spend, funded);
  if (job.after && !after) return { ok: false, status: 503, error: LETTERING_WORDING.unread, extra: { reason: 'lettering-unread', left: r.left, read: [], asked: [] } };
  // Not the words asked for (or no answer): nothing is kept; what was read goes back so the screen can show it.
  if (after && !after.ok) return { ok: false, status: 422, error: after.reason === 'lettering-mismatch' ? LETTERING_WORDING.mismatchHead : LETTERING_WORDING.unread, extra: { reason: after.reason, read: after.read, asked: after.asked, reader: after.reader, left: r.left } };
  return { ok: true, made, left: r.left, ...(after?.ok ? { lettering: after.record } : {}) };
}

/** A picture the safety check blocked: dropped, never shown or stored; credited back to a wallet; given back when asked. */
async function dropped(sql: Sql, fid: number, r: { left: number; debitId?: number }, blocked?: { error: string; giveBack: boolean }): Promise<Paid> {
  const back = await creditBack(sql, r.debitId, 'dropped');
  const given = blocked?.giveBack ? await giveBack(sql, fid) : false;
  const left = given ? r.left + 1 : r.left;
  return { ok: false, status: 422, error: failed(blocked?.error ?? 'The image was flagged by the safety checker and dropped.', back), extra: { reason: 'nsfw', left, ...(back ? { creditedBack: true } : {}), ...(given ? { givenBack: true } : {}) } };
}

/**
 * The prompt check on words that make no picture (decision 1, 2026-10-09: a style's or sheet's name,
 * which is published but not sent to the image model). Blocked names first, then the same model check;
 * its cost goes into the day's totals; refused when the spend caps are reached.
 */
export async function checkWords(
  sql: Sql,
  request: Request,
  text: string,
  /** A backstory (branch challenge-models): its own refusal words (the budget: PROMPT_CHECK_MAX_TOKENS, as every check). */
  opts: { maxTokens?: number; refused?: string } = {},
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!text.trim()) return { ok: true };
  if (blockedName(text)) return { ok: false, status: 422, error: opts.refused ?? IMAGE_WORDING.designs.form.nameBlocked };
  if (!(await wordsCheckFits(sql))) return { ok: false, status: 429, error: LIMIT_SAY.spend };
  let guard;
  try {
    guard = await checkPrompt(text, request, opts.maxTokens);
  } catch (e) {
    console.error('name check failed', (e as Error).name);
    return { ok: false, status: 503, error: 'The prompt check did not answer. Try again in a moment.' };
  }
  await recordGuard(sql, { costUsd: guard.costUsd, provider: guard.provider, verdict: guard.allow ? 'ok' : 'blocked' });
  if (guard.allow) return { ok: true };
  // No answer, twice (owner, 2026-11-22): its own words and its own count, never the refusal words.
  if (guard.category === NO_ANSWER_CATEGORY) {
    await countRefusal(sql, guard.category);
    return { ok: false, status: 422, error: REFUSAL_WORDING.noAnswer };
  }
  return { ok: false, status: 422, error: opts.refused ?? NAME_REFUSED };
}
export const NAME_REFUSED = IMAGE_WORDING.designs.form.nameRefused;
