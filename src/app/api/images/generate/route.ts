import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { checkPrompt } from '~/lib/images/guard';
import { ImageUnavailable, makeImage } from '~/lib/images/fal';
import { mayGenerate } from '~/lib/images/gate';
import { reserve, settle } from '~/lib/images/limits';
import { blockedName, finalPrompt, STYLES, styleText, type StyleId } from '~/lib/images/rules';
import { signTicket } from '~/lib/images/ticket';

/**
 * Generate one draft image for a passage (docs/proposals/add-an-image.md, section 5). Any
 * signed-in account with a Neynar score of at least IMAGES.neynarMinScore, or an invited FID
 * (decision 11, owner 2026-10-09; src/lib/images/gate.ts), after consent, within the caps. The prompt is checked before anything is spent;
 * the host's safety checker runs on the image. Nothing about the draft is stored here: the
 * image and a signed record of how it was made go back to the person's device. The daily count
 * (studio.image_asks) and the day's cost totals (studio.image_costs, no FID) are all that is kept.
 */
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to make an image' }, { status: 401 });
  if (!IMAGES.enabled) return no('Making images is switched off for now', 503);
  const sql = db();
  if (!sql || !process.env.FAL_KEY || !process.env.IMAGES_TICKET_SECRET) return no('Making images is not set up on this deployment', 503);

  let body: { chapter?: unknown; start?: unknown; end?: unknown; prompt?: unknown; style?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const chapter = Number(body.chapter), start = Number(body.start), end = Number(body.end);
  const userPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const style = body.style === null || body.style === undefined ? null : String(body.style);
  const ch = Number.isInteger(chapter) ? loadChapter(chapter) : null;
  if (!ch) return no('No such chapter', 400);
  const idx = ch.blocks.map((b) => b.idx);
  if (!idx.includes(start) || !idx.includes(end) || end < start) return no('Choose a passage in this chapter', 400);
  if (idx.filter((i) => i >= start && i <= end).length > IMAGES.maxBlocks) return no(`A passage can be up to ${IMAGES.maxBlocks} blocks`, 400);
  if (!userPrompt || userPrompt.length > IMAGES.promptMaxChars) return no(`Describe the image in up to ${IMAGES.promptMaxChars} characters`, 400);
  if (style !== null && !(style in STYLES)) return no('No such style', 400);
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403, { reason: 'consent' });

  // Who may generate, before anything is counted or reserved (decision 11). Invited FIDs skip it.
  const gate = await mayGenerate(sql, fid);
  if (!gate.ok) return no(gate.error, gate.status, { reason: gate.reason });

  // Counted from here, whatever happens next (decision 16: blocked attempts count).
  const r = await reserve(sql, fid);
  if (!r.ok) {
    const say = { limit: `You've made ${IMAGES.generationsPerDay} today. More tomorrow (00:00 UTC).`, spend: 'Image making has reached today’s spending limit for everyone. It comes back at 00:00 UTC.' }[r.refusal];
    return no(say, 429, { reason: r.refusal });
  }
  const facts = blockFacts(ch.blocks);
  const setting = facts[ch.blocks.findIndex((b) => b.idx === start)]?.setting ?? null;
  const styleObj = style ? { id: style, text: styleText(style as StyleId, setting) } : null;
  const prompt = finalPrompt(userPrompt, styleObj?.text ?? null);

  const name = blockedName(userPrompt);
  if (name) {
    await settle(sql, {});
    return no('No real people: the prompt names someone on the blocked list.', 422, { reason: 'blocked', category: 'real_person', left: r.left });
  }
  let guard;
  try {
    guard = await checkPrompt(userPrompt, request);
  } catch (e) {
    await settle(sql, {});
    console.error('image prompt check failed', (e as Error).name);
    return no('The prompt check did not answer. Try again in a moment.', 503, { left: r.left });
  }
  if (!guard.allow) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'blocked' } });
    return no('This prompt asks for something the rules don’t allow.', 422, { reason: 'blocked', category: guard.category, left: r.left });
  }
  let made;
  try {
    made = await makeImage(prompt);
  } catch (e) {
    await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' } });
    console.error('image generation failed', e instanceof ImageUnavailable ? e.message : (e as Error).name);
    return no('The image model did not answer. Try again in a moment.', 503, { left: r.left });
  }
  await settle(sql, { guard: { costUsd: guard.costUsd, provider: guard.provider, verdict: 'ok' }, image: { costUsd: made.costUsd, verdict: made.nsfw ? 'nsfw' : 'ok' } });
  // Flagged by the host's safety checker: dropped here, never shown or stored.
  if (made.nsfw) return no('The image was flagged by the safety checker and dropped.', 422, { reason: 'nsfw', left: r.left });

  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  const ticket = signTicket({
    v: 1, fid, chapter, start, end, userPrompt, style: styleObj, prompt,
    model: IMAGES.model.id, endpoint: IMAGES.model.endpoint, host: IMAGES.model.host, settings: made.settings,
    seed: made.seed, requestId: made.requestId, sha256, width: IMAGES.size.width, height: IMAGES.size.height,
    costUsd: made.costUsd, guard: { model: IMAGES.guardModel, verdict: 'ok' }, at: new Date().toISOString(),
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, left: r.left },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
