import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { challengeSheetsOpen } from '~/lib/challenge/open-sheets';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { makeEdit, makeImage } from '~/lib/images/fal';
import { mayGenerate } from '~/lib/images/gate';
import { paidPicture } from '~/lib/images/paid';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { REMIX_SOURCE_LINES, SAMPLE_SUBJECTS, samplePrompt, viewLinesFor, viewPrompt } from '~/lib/images/design-rules';
import { designByVersion } from '~/lib/images/designs';
import { readRemixTicket, readSampleTicket, signRemixTicket, signSampleTicket } from '~/lib/images/ticket';
import { referencePicture } from '~/lib/images/reference-picture';
import { countsRemixes, remixUnits } from '~/lib/images/remixes';

/**
 * One sample picture for a style, or one view for a character sheet (step 4), before the design
 * is published. Making designs is for invited FIDs only, for now (owner,
 * 2026-10-10). Then the same rules and order as Generate: setup, input, consent, the gate (gate.ts), the day's count and the spend
 * caps, the prompt check, the safety checker. Nothing is stored here: the picture and a signed
 * record of how it was made (with exactly this text) go back to the person's device.
 * A sample or a front view: Z-Image Turbo from the text. A side or back view: FLUX.2 [klein] 4B
 * edit, from the front view the device sends back with its record. Every view is made in one of
 * the published styles (owner, 2026-10-14), its text in the prompt; side and back in the front's.
 * A remix (owner, 2026-11-04): its front view is made with FLUX.2 [klein] 4B edit from the source's front view, sent
 * as a reference picture (`source`: the version remixed; the picture comes from our own bucket, checked by sha256),
 * and recorded in the view's recipe. For an account that passes the check (not an admin, not invited), a sheet's views
 * count as remixes, not pictures (src/lib/images/remixes.ts): the first view starts a remix, and its other views, and
 * any view made again, go inside it (`remix`, the signed ticket every answer carries), up to six pictures.
 */
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const SLOTS = ['sample', 'front', 'side', 'back'] as const;
type Slot = (typeof SLOTS)[number];

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to make a picture' }, { status: 401 });
  if (!IMAGES.enabled) return no('Making images is switched off for now', 503);
  // Invited FIDs only; while the remix challenge opens sheets (CHALLENGE.openSheets), anyone may make a sheet's views
  // (front, side, back; not a style's samples). Publishing them stays limited to a challenge character's fork or version.
  const peek = !IMAGES.invited.includes(fid) && challengeSheetsOpen() ? await request.clone().json().catch(() => ({})) : null;
  const viewForChallenge = peek !== null && ['front', 'side', 'back'].includes(String((peek as { slot?: unknown }).slot));
  if (!IMAGES.invited.includes(fid) && !viewForChallenge) return no(IMAGE_WORDING.designs.form.notInvited, 403, { reason: 'invited' });
  const sql = db();
  if (!sql || !process.env.FAL_KEY || !process.env.IMAGES_TICKET_SECRET) return no('Making images is not set up on this deployment', 503);

  let body: { slot?: unknown; index?: unknown; kind?: unknown; text?: unknown; style?: unknown; source?: unknown; remix?: unknown; front?: { ticket?: unknown; image?: unknown } };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const slot = SLOTS.includes(body.slot as Slot) ? (body.slot as Slot) : null;
  if (!slot) return no('Bad request', 400);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > IMAGES.designs.textMaxChars) return no(`Write the text first, up to ${IMAGES.designs.textMaxChars} characters`, 400);
  const index = Number(body.index ?? 0);
  if (slot === 'sample' && !(Number.isInteger(index) && index >= 0 && index < SAMPLE_SUBJECTS.length)) return no('Bad request', 400);
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403, { reason: 'consent' });
  // The same gate as Generate, before anything is counted or reserved (invited FIDs pass it without a lookup).
  const gate = await mayGenerate(sql, fid);
  if (!gate.ok) return no(gate.error, gate.status, { reason: gate.reason });

  // A view's style: a published style, at the version chosen.
  let style: { versionId: string; title: string; text: string } | null = null;
  if (slot !== 'sample') {
    const d = typeof body.style === 'string' ? await designByVersion(sql, body.style) : null;
    if (!d || d.kind !== 'style') return no('Choose a style for the views first', 400, { reason: 'style' });
    style = { versionId: d.shown.versionId, title: d.shown.body.title || d.entity, text: d.shown.body.text };
  }

  // Side and back are made from the front view: its record must be this person's, with this text and style.
  let front: { bytes: Buffer; sha256: string } | null = null;
  if (slot === 'side' || slot === 'back') {
    const t = typeof body.front?.ticket === 'string' ? readSampleTicket(body.front.ticket) : null;
    const m = typeof body.front?.image === 'string' ? body.front.image.match(/^data:image\/jpeg;base64,(.+)$/) : null;
    if (!t || !m || t.fid !== fid || t.slot !== 'front') return no('Make the front view first', 400);
    if (t.text !== text) return no('The text changed since the front view was made. Make the front view again.', 409, { reason: 'stale' });
    if (t.subject !== viewLinesFor(body.kind === 'location' ? 'location' : 'character').front) return no('Make the front view first', 400);
    if (t.style?.versionId !== style!.versionId) return no('The style changed since the front view was made. Make the front view again.', 409, { reason: 'stale' });
    const bytes = Buffer.from(m[1], 'base64');
    if (createHash('sha256').update(bytes).digest('hex') !== t.sha256) return no('The front view is not the one its record describes', 400);
    front = { bytes, sha256: t.sha256 };
  }

  // A remix's front view starts from the source's front view, as a reference picture (owner, 2026-11-04). A source
  // with no front view (a sheet of text alone) gives none: the front is then made from the text, as before.
  const sheetKind = body.kind === 'location' ? 'location' : 'character';
  let source: { versionId: string; sha256: string; bytes: Buffer } | null = null;
  if (slot === 'front' && typeof body.source === 'string') {
    const src = await designByVersion(sql, body.source);
    if (!src || src.kind !== sheetKind) return no('No such sheet to remix', 404);
    const f = src.shown.body.views?.front;
    if (f) {
      const bytes = await referencePicture(f.url, f.sha256);
      if (!bytes) return no('The sheet you’re remixing couldn’t be read just now. Try again in a moment.', 503, { reason: 'source' });
      source = { versionId: src.shown.versionId, sha256: f.sha256, bytes };
    }
  }

  // Remixes, not pictures (owner, 2026-11-04): the remix this view goes in, for someone who counts remixes. A side or
  // back goes in its front's remix; a front goes in the remix the person is making (its ticket), or starts one.
  // Every remix is on the open default today: one unit (remix-model-choice passes its model's `open` to remixUnits).
  const units = remixUnits({ open: true });
  let remix: { id: string; units: number; starts: boolean; slot: 'front' | 'side' | 'back' } | null = null;
  if (slot !== 'sample' && countsRemixes(fid)) {
    const held = typeof body.remix === 'string' ? readRemixTicket(body.remix) : null;
    const mine = held && held.fid === fid && held.units === units ? held.remix : null;
    const frontsRemix = slot === 'front' ? null : (readSampleTicket(String(body.front?.ticket ?? ''))?.remix ?? null);
    const id = slot === 'front' ? mine : frontsRemix ?? mine;
    remix = { id: id ?? randomUUID(), units, starts: id === null, slot };
  }
  const remixTicket = remix ? signRemixTicket({ v: 1, kind: 'remix', fid, remix: remix.id, units: remix.units, at: new Date().toISOString() }) : undefined;

  // A character's views, or a place's (2026-10-14): the same slots, other lines.
  const subject = slot === 'sample' ? SAMPLE_SUBJECTS[index] : viewLinesFor(sheetKind)[slot];
  const prompt = style ? viewPrompt(subject, style.text, text, source ? REMIX_SOURCE_LINES[sheetKind] : '') : samplePrompt(subject, text);
  // A place's views are wide, like a sample or a moment; a character's are upright.
  const size = slot === 'sample' || body.kind === 'location' ? IMAGES.size : IMAGES.viewSize;
  const ref = front ?? (source ? { bytes: source.bytes, sha256: source.sha256 } : null);
  const edit = ref !== null;
  const spend = edit ? { model: IMAGES.editModel, reserveUsd: IMAGES.editReserveUsd(1) } : { model: IMAGES.model, reserveUsd: IMAGES.reserveUsd };
  const model = edit ? IMAGES.editModel : IMAGES.model;
  const paid = await paidPicture(sql, fid, request, {
    checkText: prompt,
    spend: remix ? { ...spend, remix } : edit ? spend : undefined,
    // A sheet's view prompt is long (view line, style text, sheet text): the larger budget, as Remix's (owner, 2026-11-03).
    guardMaxTokens: slot === 'sample' ? undefined : IMAGES.designs.guardMaxTokens,
    // The source's front is sent at its own size (a view: upright, IMAGES.viewSize), as a front is to its side and back.
    make: () => (ref ? makeEdit(prompt, [{ bytes: ref.bytes, contentType: 'image/jpeg', ...(front ? size : IMAGES.viewSize) }], size) : makeImage(prompt, size)),
  });
  // A view that fails stays inside its remix: the answer carries the remix, so making it again uses no other remix.
  if (!paid.ok) return no(paid.error, paid.status, { ...paid.extra, ...(remixTicket && !String(paid.extra.reason ?? '').startsWith('remix') ? { remix: remixTicket } : {}) });
  const made = paid.made;
  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  const ticket = signSampleTicket({
    v: 1, kind: 'design-sample', fid, slot, text, subject, prompt,
    model: model.id, endpoint: model.endpoint, host: model.host, settings: made.settings,
    seed: made.seed, requestId: made.requestId, sha256, width: size.width, height: size.height, costUsd: made.costUsd,
    ...(ref ? { references: [{ sha256: ref.sha256 }] } : {}),
    ...(style ? { style } : {}),
    ...(source ? { source: { versionId: source.versionId, sha256: source.sha256 } } : {}),
    ...(remix ? { remix: remix.id } : {}),
    guard: { model: IMAGES.guardModel, verdict: 'ok' }, at: new Date().toISOString(),
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, left: paid.left, ...(remixTicket ? { remix: remixTicket, remixesLeft: paid.left } : {}) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
