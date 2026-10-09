import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { makeEdit, makeImage } from '~/lib/images/fal';
import { paidPicture } from '~/lib/images/paid';
import { SAMPLE_SUBJECTS, VIEW_LINES, samplePrompt } from '~/lib/images/design-rules';
import { readSampleTicket, signSampleTicket } from '~/lib/images/ticket';

/**
 * One sample picture for a style, or one view for a character sheet (step 4), before the design
 * is published. The same rules as any image: invited FIDs, consent, the day's count and the spend
 * caps, the prompt check, the safety checker. Nothing is stored here: the picture and a signed
 * record of how it was made (with exactly this text) go back to the person's device.
 * A sample or a front view: Z-Image Turbo from the text. A side or back view: FLUX.2 [klein] 4B
 * edit, from the front view the device sends back with its record.
 */
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const SLOTS = ['sample', 'front', 'side', 'back'] as const;
type Slot = (typeof SLOTS)[number];

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to make a picture' }, { status: 401 });
  if (!IMAGES.enabled) return no('Making images is switched off for now', 503);
  if (!IMAGES.invited.includes(fid)) return no('The trial is open to invited readers only', 403, { reason: 'invited' });
  const sql = db();
  if (!sql || !process.env.FAL_KEY || !process.env.IMAGES_TICKET_SECRET) return no('Making images is not set up on this deployment', 503);

  let body: { slot?: unknown; index?: unknown; text?: unknown; front?: { ticket?: unknown; image?: unknown } };
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

  // Side and back are made from the front view: its record must be this person's, with this text.
  let front: { bytes: Buffer; sha256: string } | null = null;
  if (slot === 'side' || slot === 'back') {
    const t = typeof body.front?.ticket === 'string' ? readSampleTicket(body.front.ticket) : null;
    const m = typeof body.front?.image === 'string' ? body.front.image.match(/^data:image\/jpeg;base64,(.+)$/) : null;
    if (!t || !m || t.fid !== fid || t.slot !== 'front') return no('Make the front view first', 400);
    if (t.text !== text) return no('The text changed since the front view was made. Make the front view again.', 409, { reason: 'stale' });
    const bytes = Buffer.from(m[1], 'base64');
    if (createHash('sha256').update(bytes).digest('hex') !== t.sha256) return no('The front view is not the one its record describes', 400);
    front = { bytes, sha256: t.sha256 };
  }

  const subject = slot === 'sample' ? SAMPLE_SUBJECTS[index] : VIEW_LINES[slot];
  const prompt = samplePrompt(subject, text);
  const size = slot === 'sample' ? IMAGES.size : IMAGES.viewSize;
  const edit = front !== null;
  const spend = edit ? { model: IMAGES.editModel, reserveUsd: IMAGES.editReserveUsd(1) } : undefined;
  const model = edit ? IMAGES.editModel : IMAGES.model;
  const paid = await paidPicture(sql, fid, request, {
    checkText: prompt,
    spend,
    make: () => (front ? makeEdit(prompt, [{ bytes: front.bytes, contentType: 'image/jpeg', ...IMAGES.viewSize }], size) : makeImage(prompt, size)),
  });
  if (!paid.ok) return no(paid.error, paid.status, paid.extra);
  const made = paid.made;
  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  const ticket = signSampleTicket({
    v: 1, kind: 'design-sample', fid, slot, text, subject, prompt,
    model: model.id, endpoint: model.endpoint, host: model.host, settings: made.settings,
    seed: made.seed, requestId: made.requestId, sha256, width: size.width, height: size.height, costUsd: made.costUsd,
    ...(front ? { references: [{ sha256: front.sha256 }] } : {}),
    guard: { model: IMAGES.guardModel, verdict: 'ok' }, at: new Date().toISOString(),
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, left: paid.left },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
