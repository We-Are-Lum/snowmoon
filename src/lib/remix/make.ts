import 'server-only';
import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import { IMAGES, REMIX } from '../config';
import { checkPrompt, type GuardResult } from '../images/guard';
import { ImageUnavailable, makeEdit, type Made } from '../images/fal';
import { blockedName } from '../images/rules';
import { IMAGE_WORDING } from '../images/wording';
import { fundedBy, perDay, reserve, settle, type Refusal, type Spend } from './limits';
import type { RemixPicture, RemixShot } from './shot';
import { creditBack } from '../wallet/credits';
import { failed } from '../images/paid';

/**
 * One Remix Generate, in the Pictures order (src/lib/images/paid.ts): counted and its worst case
 * reserved; the blocked-names list, then the prompt check, on the whole prompt as it will be sent;
 * then the picture, from the Pictures reference-picture model (IMAGES.editModel, FLUX.2 [klein] 4B
 * edit) with the host's safety checker on; then the real costs in place of the reservation. A frame
 * the checker flags is dropped.
 * A wallet account's frame that gives no picture (the prompt check or the model didn't answer, the prompt was refused, or the
 * safety checker dropped it) is credited back to its balance as in Pictures, once IMAGES.prepaid.creditBack is on
 * (owner, 2026-10-21; reading B, 2026-10-22).
 *
 * The prompt sent: the shot's own prompt from the version's recipe (drafted by the coding agent for
 * the version's frames; it names the pictures by number), one sentence for the plate, then the
 * person's own words, then the Pictures no-words line. The pictures, in the order the version's
 * frames were sent theirs: the live layout as a depth map, the shot's cast cards, then its plate.
 *
 * REMIX_TEST_FAKES=1 stands in for the model and the prompt check, for the local tests only: it is
 * refused on Vercel, and nothing it makes costs anything. REMIX_TEST_FAKES=guard stands in for the prompt
 * check only (the owner-approved real-model run on this machine, 2026-10-18). REMIX_TEST_FAKES=store
 * stands in for nothing but the readers' bucket: the real prompt check and the real model, with the
 * frames kept in a local folder (the real-check run, 2026-10-18).
 */
type Sql = postgres.Sql;

const fakes = () => (process.env.VERCEL ? '' : (process.env.REMIX_TEST_FAKES ?? ''));
/** Any local stand-in on (never on Vercel; each keeps frames in the local store). '1': the model and the prompt check; 'guard': the prompt check only; 'store': the bucket only. */
export const testFakes = () => fakes() === '1' || fakes() === 'guard' || fakes() === 'store';
const fakeModel = () => fakes() === '1';
const fakeCheck = () => fakes() === '1' || fakes() === 'guard';

export const SAY: Record<Refusal, (person: number) => string> = {
  limit: (p) => `You've made ${perDay(p)} remix frames today. More tomorrow (00:00 UTC).`,
  spend: () => 'Remix has reached today’s limit on free frames for everyone. It comes back at 00:00 UTC.',
  'free-off': () => 'Free remix frames are paused for now.',
  balance: () => IMAGE_WORDING.prepaid.lowBalance,
  'prepaid-spend': () => IMAGE_WORDING.prepaid.dailyCap,
};

export function remixPictures(layout: RemixPicture, shot: RemixShot): RemixPicture[] {
  const cards = shot.cards.slice(0, REMIX.maxPictures - 1 - (shot.plate ? 1 : 0));
  return [layout, ...cards, ...(shot.plate ? [shot.plate] : [])];
}

export function remixPrompt(shot: RemixShot, pictures: RemixPicture[], ownWords: string): string {
  const plateAt = pictures.findIndex((p) => p.role === 'plate');
  const parts = [shot.prompt!.trim()];
  if (plateAt >= 0) parts.push(`Picture ${plateAt + 1} is the place itself, empty, as drawn for this version: match its look, materials and light; draw nothing from it that the layout doesn't place.`);
  parts.push(`Changes for this remix, in the remixer's own words: ${ownWords.trim()}`);
  parts.push(IMAGES.suffix);
  return parts.join(' ');
}

export const remixSpend = (pictures: number): Spend => ({ model: IMAGES.editModel, reserveUsd: REMIX.reserveUsd(pictures) });

export type Generated =
  | { ok: true; made: Made; guard: GuardResult; left: number }
  | { ok: false; status: number; error: string; extra: Record<string, unknown> };

async function fakeGuard(text: string): Promise<GuardResult> {
  return { allow: !text.includes('TEST-BLOCK'), category: text.includes('TEST-BLOCK') ? 'test' : null, costUsd: 0, provider: 'test' } as GuardResult;
}
async function fakeMake(prompt: string, pictures: RemixPicture[]): Promise<Made> {
  const base = pictures.find((p) => p.contentType === 'image/jpeg') ?? pictures[0];
  // A real JPEG with a unique tail, so every test frame has its own sha256.
  const bytes = Buffer.concat([base.bytes, randomBytes(16)]);
  return { bytes, contentType: 'image/jpeg', seed: 1, requestId: `test-${randomBytes(4).toString('hex')}`, nsfw: prompt.includes('TEST-NSFW'), costUsd: 0, settings: { test: true } };
}

export async function generate(sql: Sql, person: number, request: Request, prompt: string, pictures: RemixPicture[]): Promise<Generated> {
  const spend = remixSpend(pictures.length);
  const funded = fundedBy(person);
  const r = await reserve(sql, person, spend);
  if (!r.ok) return { ok: false, status: r.refusal === 'free-off' ? 503 : 429, error: SAY[r.refusal](person), extra: { reason: r.refusal } };
  if (blockedName(prompt)) {
    await settle(sql, {}, spend, funded);
    const back = await creditBack(sql, r.debitId, 'refused');
    return { ok: false, status: 422, error: failed('No real people: the prompt names someone on the blocked list.', back), extra: { reason: 'blocked', category: 'real_person', left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  let guard: GuardResult;
  try {
    guard = fakeCheck() ? await fakeGuard(prompt) : await checkPrompt(prompt, request, REMIX.guardMaxTokens);
  } catch (e) {
    await settle(sql, {}, spend, funded);
    console.error('remix prompt check failed', (e as Error).name);
    const back = await creditBack(sql, r.debitId, 'failed');
    return { ok: false, status: 503, error: failed('The prompt check did not answer. Try again in a moment.', back), extra: { left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  const checked = { costUsd: guard.costUsd, provider: guard.provider, verdict: guard.allow ? ('ok' as const) : ('blocked' as const) };
  if (!guard.allow) {
    await settle(sql, { guard: checked }, spend, funded);
    const back = await creditBack(sql, r.debitId, 'refused');
    return { ok: false, status: 422, error: failed('This prompt asks for something the rules don’t allow.', back), extra: { reason: 'blocked', category: guard.category, left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  let made: Made;
  try {
    const refs = pictures.map((p) => ({ bytes: p.bytes, contentType: p.contentType, width: p.width, height: p.height }));
    made = fakeModel() ? await fakeMake(prompt, pictures) : await makeEdit(prompt, refs, IMAGES.size, REMIX.maxPictures);
  } catch (e) {
    await settle(sql, { guard: checked }, spend, funded);
    console.error('remix generation failed', e instanceof ImageUnavailable ? e.message : (e as Error).name);
    const back = await creditBack(sql, r.debitId, 'failed');
    return { ok: false, status: 503, error: failed('The image model did not answer. Try again in a moment.', back), extra: { left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  await settle(sql, { guard: checked, image: { costUsd: made.costUsd, verdict: made.nsfw ? 'nsfw' : 'ok' } }, spend, funded);
  if (made.nsfw) {
    const back = await creditBack(sql, r.debitId, 'dropped');
    return { ok: false, status: 422, error: failed('The frame was flagged by the safety checker and dropped.', back), extra: { reason: 'nsfw', left: r.left, ...(back ? { creditedBack: true } : {}) } };
  }
  return { ok: true, made, guard, left: r.left };
}
