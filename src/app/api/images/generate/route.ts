import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { makeEdit, makeImage } from '~/lib/images/fal';
import { paidPicture } from '~/lib/images/paid';
import { finalPrompt, STYLES, styleText, type StyleId } from '~/lib/images/rules';
import { signTicket, type TicketDesign } from '~/lib/images/ticket';
import { myPicks, startingStyleRetired, type MyPick } from '~/lib/images/designs';
import { designByline } from '~/lib/images/byline';

/**
 * Generate one draft image for a passage (docs/proposals/add-an-image.md, section 5). Invited
 * FIDs only, after consent, within the caps. The prompt is checked before anything is spent;
 * the host's safety checker runs on the image. Nothing about the draft is stored here: the
 * image and a signed record of how it was made go back to the person's device. The daily count
 * (studio.image_asks) and the day's cost totals (studio.image_costs, no FID) are all that is kept.
 *
 * Step 4: the person may add their own picks (a picked style instead of the starting one, and
 * picked character sheets), each one's text added to the prompt and checked with it. When asked,
 * a picked sheet's views go to FLUX.2 [klein] 4B edit as reference pictures, through the same caps.
 */
const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);
const asDesign = (p: MyPick): TicketDesign => ({
  versionId: p.versionId, kind: p.kind, entity: p.entity, title: p.title, by: designByline(p.byName, p.byFid, p.byRole), versionNo: p.versionNo, text: p.text, assist: p.assist,
});

/** A picked sheet's view, fetched from the readers' public bucket and checked against its sha256. */
async function referencePicture(url: string, sha256: string) {
  const base = process.env.R2_IMAGES_PUBLIC_URL?.replace(/\/$/, '');
  if (!base || !url.startsWith(`${base}/`)) return null;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return createHash('sha256').update(bytes).digest('hex') === sha256 ? bytes : null;
}
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to make an image' }, { status: 401 });
  if (!IMAGES.enabled) return no('Making images is switched off for now', 503);
  if (!IMAGES.invited.includes(fid)) return no('The trial is open to invited readers only', 403, { reason: 'invited' });
  const sql = db();
  if (!sql || !process.env.FAL_KEY || !process.env.IMAGES_TICKET_SECRET) return no('Making images is not set up on this deployment', 503);

  let body: { chapter?: unknown; start?: unknown; end?: unknown; prompt?: unknown; style?: unknown; characters?: unknown; reference?: unknown };
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
  const designStyle = isId(style) ? style : null;
  if (style !== null && !designStyle && !(style in STYLES)) return no('No such style', 400);
  // Decision 13: once the starting style is a published design, only the design is offered.
  if (style !== null && !designStyle && (await startingStyleRetired(sql))) return no('No such style', 400);
  const wanted = Array.isArray(body.characters) ? body.characters.filter(isId) : [];
  if (wanted.length > IMAGES.designs.maxCharacters) return no(`Up to ${IMAGES.designs.maxCharacters} characters in one image`, 400);
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403, { reason: 'consent' });

  // Picked styles and sheets: only the person's own picks, still published.
  const picks = designStyle || wanted.length ? (await myPicks(sql, fid)).filter((p) => p.available) : [];
  const stylePick = designStyle ? picks.find((p) => p.kind === 'style' && p.versionId === designStyle) : null;
  if (designStyle && !stylePick) return no('That style is not one of your picks', 400);
  const sheets = wanted.map((id) => picks.find((p) => p.kind === 'character' && p.versionId === id));
  if (sheets.some((p) => !p)) return no('That sheet is not one of your picks', 400);
  const designs = [...(stylePick ? [stylePick] : []), ...(sheets as MyPick[])];

  const facts = blockFacts(ch.blocks);
  const setting = facts[ch.blocks.findIndex((b) => b.idx === start)]?.setting ?? null;
  const styleObj = style && !designStyle ? { id: style, text: styleText(style as StyleId, setting) } : null;
  const prompt = finalPrompt(userPrompt, styleObj?.text ?? stylePick?.text ?? null, (sheets as MyPick[]).map((p) => p.text));

  // Reference pictures: the chosen sheets' views, front first, up to the model's limit.
  const refs: { url: string; sha256: string }[] = [];
  if (body.reference === true) {
    for (const p of sheets as MyPick[]) for (const k of ['front', 'side', 'back'] as const) if (p.views[k] && refs.length < IMAGES.maxReferences) refs.push({ url: p.views[k]!.url, sha256: p.views[k]!.sha256 });
    if (!refs.length) return no('None of these sheets has pictures to use as a reference', 400);
  }
  const pictures: { bytes: Buffer; contentType: string; width: number; height: number }[] = [];
  for (const ref of refs) {
    const bytes = await referencePicture(ref.url, ref.sha256);
    if (!bytes) return no('A reference picture could not be read. Try again without it.', 503);
    pictures.push({ bytes, contentType: 'image/jpeg', ...IMAGES.viewSize });
  }
  const model = pictures.length ? IMAGES.editModel : IMAGES.model;

  // Counted from here, whatever happens next (decision 16: blocked attempts count). The person's
  // words and any added sheet or reader-made style text are checked together.
  const paid = await paidPicture(sql, fid, request, {
    checkText: designs.length ? [userPrompt, ...designs.map((d) => d.text)].join('\n\n') : userPrompt,
    spend: pictures.length ? { model: IMAGES.editModel, reserveUsd: IMAGES.editReserveUsd(pictures.length) } : undefined,
    make: () => (pictures.length ? makeEdit(prompt, pictures) : makeImage(prompt)),
  });
  if (!paid.ok) return no(paid.error, paid.status, paid.extra);
  const made = paid.made;

  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  const ticket = signTicket({
    v: 1, fid, chapter, start, end, userPrompt, style: styleObj, prompt,
    model: model.id, endpoint: model.endpoint, host: model.host, settings: made.settings,
    seed: made.seed, requestId: made.requestId, sha256, width: IMAGES.size.width, height: IMAGES.size.height,
    costUsd: made.costUsd, guard: { model: IMAGES.guardModel, verdict: 'ok' }, at: new Date().toISOString(),
    ...(designs.length ? { designs: designs.map(asDesign) } : {}),
    ...(refs.length ? { references: refs } : {}),
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, left: paid.left },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
