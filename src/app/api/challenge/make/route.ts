import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFid, getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { makeEdit } from '~/lib/images/fal';
import { mayGenerate } from '~/lib/images/gate';
import { paidPicture } from '~/lib/images/paid';
import { generateReserveUsd } from '~/lib/images/price';
import { referencePicture } from '~/lib/images/reference-picture';
import { signTicket, type TicketDesign } from '~/lib/images/ticket';
import { bookCharacter } from '~/lib/images/designs';
import { designByline } from '~/lib/images/byline';
import { makeView, momentPrompt, othersIn, readMake } from '~/lib/challenge/make';
import { sourceOf } from '~/lib/challenge/pictures';
import { spoilerExceptionOn } from '~/lib/challenge/spoilers';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * The remix screen's API (branch challenge-moments, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S2).
 *
 * GET ?from=<version>: the screen's data (the picture tapped, the fifteen moments, its words), for whoever may see the
 * challenge (everyone once CHALLENGE.public is on, admins before); 404 otherwise, and after entries close (P9g).
 *
 * POST { from, moment, words }: one draft picture through the site's own image pipeline, exactly as "Make an image"
 * makes one: signed in, consent, the Generate gate (the site's check), the daily count and spend caps, the prompt
 * check, the host's safety checker. The model is the edit model, with the tapped picture as its reference; the prompt
 * is src/lib/challenge/make.ts's momentPrompt; the picture is anchored to the moment's passage. Nothing about the draft
 * is kept here: the picture and its signed record go back to the device, and Publish (/api/images/publish) writes it.
 */
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const hidden = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (!challengeVisibleTo(fid) || !spoilerExceptionOn()) return hidden();
  const sql = db();
  const from = new URL(request.url).searchParams.get('from') ?? '';
  const src = sql ? await sourceOf(sql, from).catch(() => null) : null;
  if (!src) return hidden();
  return NextResponse.json(makeView(src), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const fid = await getPerson(request);
  if (fid === null) return no('Sign in to make it', 401);
  if (!challengeVisibleTo(fid) || !spoilerExceptionOn()) return hidden();
  if (!IMAGES.enabled) return no('Making images is switched off for now', 503);
  const sql = db();
  if (!sql || !process.env.FAL_KEY || !process.env.IMAGES_TICKET_SECRET) return no('Making images is not set up on this deployment', 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const r = readMake(body);
  if (!r.ok) return no(r.error, 400);
  const src = await sourceOf(sql, r.from);
  if (!src) return no('This picture can’t be remixed for the challenge.', 400);
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403, { reason: 'consent' });
  const gate = await mayGenerate(sql, fid);
  if (!gate.ok) return no(gate.error, gate.status, { reason: gate.reason });

  const name = (bookCharacter(src.character)?.name ?? src.character).split(' ')[0];
  const sheets = othersIn(r.moment, src.character);
  const prompt = momentPrompt({ words: r.words, name, scene: r.moment.scene, others: (sheets?.added ?? []).map((a) => a.text) });
  const bytes = await referencePicture(src.url, src.sha256);
  if (!bytes) return no('The picture could not be read. Try again in a moment.', 503);
  const pictures = [{ bytes, contentType: 'image/jpeg', width: src.width, height: src.height }];

  // Counted from here, whatever happens next (blocked attempts count), as every picture is.
  const paid = await paidPicture(sql, fid, request, {
    checkText: prompt,
    spend: { model: IMAGES.editModel, reserveUsd: generateReserveUsd(1) },
    make: () => makeEdit(prompt, pictures),
  });
  if (!paid.ok) return no(paid.error, paid.status, paid.extra);
  const made = paid.made;
  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  // Started from a base sheet: published as a 'uses' link (through `designs`, with the sheet's text, not sent).
  const designs: TicketDesign[] = src.kind === 'sheet' ? [{ versionId: src.versionId, kind: 'character', entity: bookCharacter(src.character)?.name ?? name, title: src.title, by: designByline(src.by, src.byFid), versionNo: src.versionNo, text: '', assist: null }] : [];
  const ticket = signTicket({
    v: 1, fid, chapter: r.moment.chapter, start: r.moment.start, end: r.moment.end, userPrompt: r.words, style: null, prompt,
    model: IMAGES.editModel.id, endpoint: IMAGES.editModel.endpoint, host: IMAGES.editModel.host, settings: made.settings,
    seed: made.seed, requestId: made.requestId, sha256, width: IMAGES.size.width, height: IMAGES.size.height,
    costUsd: made.costUsd, guard: { model: IMAGES.guardModel, verdict: 'ok' }, at: new Date().toISOString(),
    ...(designs.length ? { designs } : {}),
    references: [{ url: src.url, sha256: src.sha256 }],
    ...(sheets ? { sheets } : {}),
    challenge: { character: src.character, moment: r.moment.id, scene: r.moment.scene, from: src.versionId, fromKind: src.kind },
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, prompt, left: paid.left },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
