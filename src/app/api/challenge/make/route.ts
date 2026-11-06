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
import { defaultLook, sourceOf } from '~/lib/challenge/pictures';
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
 * check, the host's safety checker. The model is the edit model, with the tapped picture as reference image 1 and the
 * other challenge characters' current default looks after it; the prompt is src/lib/challenge/make.ts's momentPrompt; the picture is anchored to the moment's passage. Nothing about the draft
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
  if (fid === null) return NextResponse.json({ error: 'Sign in to make it' }, { status: 401 });
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

  const callName = (slug: string) => (bookCharacter(slug)?.name ?? slug).split(' ')[0];
  const name = callName(src.character);
  // The other challenge characters in the moment, each by their current default look (their first base's front view).
  const others = (await Promise.all(othersIn(r.moment, src.character).map(async (slug) => ({ slug, look: await defaultLook(sql, slug) })))).filter((o): o is { slug: string; look: NonNullable<typeof o.look> } => o.look !== null);
  const prompt = momentPrompt({ words: r.words, name, scene: r.moment.scene, others: others.map((o) => callName(o.slug)) });
  const looks = [src, ...others.map((o) => o.look)];
  const pictures: { bytes: Buffer; contentType: string; width: number; height: number }[] = [];
  for (const l of looks) {
    const bytes = await referencePicture(l.url, l.sha256);
    if (!bytes) return no('The picture could not be read. Try again in a moment.', 503);
    pictures.push({ bytes, contentType: 'image/jpeg', width: l.width, height: l.height });
  }

  // Counted from here, whatever happens next (blocked attempts count), as every picture is.
  const paid = await paidPicture(sql, fid, request, {
    checkText: prompt,
    spend: { model: IMAGES.editModel, reserveUsd: generateReserveUsd(pictures.length) },
    make: () => makeEdit(prompt, pictures),
  });
  if (!paid.ok) return no(paid.error, paid.status, paid.extra);
  const made = paid.made;
  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  // Started from a base sheet: published as a 'uses' link (through `designs`, with no text added). The others' looks
  // are 'uses' links too, so the recipe credits every picture sent.
  const asDesign = (l: (typeof looks)[number] & { kind: 'sheet' }): TicketDesign => ({ versionId: l.versionId, kind: 'character', entity: bookCharacter(l.character)?.name ?? l.character, title: l.title, by: designByline(l.by, l.byFid), versionNo: l.versionNo, text: '', assist: null });
  const designs: TicketDesign[] = looks.filter((l): l is (typeof looks)[number] & { kind: 'sheet' } => l.kind === 'sheet').map(asDesign);
  const ticket = signTicket({
    v: 1, fid, chapter: r.moment.chapter, start: r.moment.start, end: r.moment.end, userPrompt: r.words, style: null, prompt,
    model: IMAGES.editModel.id, endpoint: IMAGES.editModel.endpoint, host: IMAGES.editModel.host, settings: made.settings,
    seed: made.seed, requestId: made.requestId, sha256, width: IMAGES.size.width, height: IMAGES.size.height,
    costUsd: made.costUsd, guard: { model: IMAGES.guardModel, verdict: 'ok' }, at: new Date().toISOString(),
    ...(designs.length ? { designs } : {}),
    references: looks.map((l) => ({ url: l.url, sha256: l.sha256 })),
    sheets: { characters: [src.character, ...others.map((o) => o.slug)], place: null, added: [] },
    challenge: { character: src.character, moment: r.moment.id, scene: r.moment.scene, from: src.versionId, fromKind: src.kind },
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, prompt, left: paid.left },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
