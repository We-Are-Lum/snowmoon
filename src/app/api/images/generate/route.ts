import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { makeEdit, makeImage } from '~/lib/images/fal';
import { mayGenerate } from '~/lib/images/gate';
import { paidPicture } from '~/lib/images/paid';
import { generateReserveUsd } from '~/lib/images/price';
import { finalPrompt, STYLES, styleText, type StyleId } from '~/lib/images/rules';
import { signTicket, type TicketDesign } from '~/lib/images/ticket';
import { designByVersion, myPicks, startingStyleRetired, type MyPick } from '~/lib/images/designs';
import { designByline } from '~/lib/images/byline';
import { askedSheets, inPassage, placeTitle, sheetPlaces, sheetsForImage } from '~/lib/images/sheets';

/**
 * Generate one draft image for a passage (docs/proposals/add-an-image.md, section 5). Any
 * signed-in account with a Neynar score of at least IMAGES.neynarMinScore, or an invited FID
 * (decision 11, owner 2026-10-09; src/lib/images/gate.ts), after consent, within the caps. The prompt is checked before anything is spent;
 * the host's safety checker runs on the image. Nothing about the draft is stored here: the
 * image and a signed record of how it was made go back to the person's device. The daily count
 * (studio.image_asks) and the day's cost totals (studio.image_costs, no FID) are all that is kept.
 *
 * Step 4: every image is made in a style (owner, 2026-10-14): the starting style while it is
 * offered, or any published style. The person may add their own picks (character sheets, and a
 * setting sheet, 2026-10-14), each one's text added to the prompt and checked with it. When asked,
 * a picked sheet's views go to FLUX.2 [klein] 4B edit as reference pictures, through the same caps.
 * Picks are open to everyone signed in, Farcaster or wallet (owner, 2026-10-19 and 2026-10-23); making designs is not.
 *
 * Sheets as text (owner, 2026-10-10): the characters this passage names and its scene's place
 * (src/lib/images/sheets.ts, no model), as the person left them chosen. Only those may be asked
 * for; the text added is built here from the project's files (the edition's invented look, drafted
 * by the coding agent), and a picked sheet for the same character replaces it. The prompt check
 * reads the whole prompt as it will be sent.
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
  // A Farcaster FID, or minus a wallet account's number (prepaid; owner, 2026-10-13).
  const fid = await getPerson(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in to make an image' }, { status: 401 });
  if (!IMAGES.enabled) return no('Making images is switched off for now', 503);
  const sql = db();
  if (!sql || !process.env.FAL_KEY || !process.env.IMAGES_TICKET_SECRET) return no('Making images is not set up on this deployment', 503);

  let body: { chapter?: unknown; start?: unknown; end?: unknown; prompt?: unknown; style?: unknown; characters?: unknown; place?: unknown; reference?: unknown; sheets?: { characters?: unknown; place?: unknown } };
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
  if (style === null) return no('Choose a style first', 400, { reason: 'style' });
  if (!designStyle && !(style in STYLES)) return no('No such style', 400);
  // Decision 13: once the starting style is a published design, only the design is offered.
  if (style !== null && !designStyle && (await startingStyleRetired(sql))) return no('No such style', 400);
  const wanted = Array.isArray(body.characters) ? body.characters.filter(isId) : [];
  const wantedPlace = isId(body.place) ? body.place : null;
  if (wanted.length > IMAGES.designs.maxCharacters) return no(`Up to ${IMAGES.designs.maxCharacters} characters in one image`, 400);
  // "In this passage": only the characters it names and its scene's place, never an arbitrary id.
  const asked = askedSheets(inPassage(chapter, start, end), body.sheets, IMAGES.designs.maxCharacters);
  if (!asked.ok) return no(asked.error, 400);
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403, { reason: 'consent' });

  // Who may generate, before anything is counted or reserved (decision 11). Invited FIDs skip it.
  const gate = await mayGenerate(sql, fid);
  if (!gate.ok) return no(gate.error, gate.status, { reason: gate.reason });

  // The style: any published style (2026-10-14), at the version chosen. Sheets: only the person's own picks, still published.
  const styleDesign = designStyle ? await designByVersion(sql, designStyle) : null;
  if (designStyle && styleDesign?.kind !== 'style') return no('No such style', 400);
  const stylePick: TicketDesign | null = styleDesign
    ? { versionId: styleDesign.shown.versionId, kind: 'style', entity: styleDesign.entity, title: styleDesign.shown.body.title, by: designByline(styleDesign.byName, styleDesign.byFid, styleDesign.byRole), versionNo: styleDesign.shown.versionNo, text: styleDesign.shown.body.text, assist: styleDesign.shown.body.assist }
    : null;
  const picks = wanted.length || wantedPlace ? (await myPicks(sql, fid)).filter((p) => p.available) : [];
  const sheets = wanted.map((id) => picks.find((p) => p.kind === 'character' && p.versionId === id));
  if (sheets.some((p) => !p)) return no('That sheet is not one of your picks', 400);
  const placePick = wantedPlace ? picks.find((p) => p.kind === 'location' && p.versionId === wantedPlace) : null;
  if (wantedPlace && !placePick) return no('That setting sheet is not one of your picks', 400);
  const sheetPicks = [...(sheets as MyPick[]), ...(placePick ? [placePick] : [])];
  const designs = [...(stylePick ? [stylePick] : []), ...sheetPicks.map(asDesign)];
  // The project's shorthand for each chosen character without a picked sheet, and for the place unless a setting sheet is picked.
  const askedSheetsText = sheetsForImage(asked, (sheets as MyPick[]).map((p) => p.entity));
  // A picked setting sheet names the place the image is of (its own place, which may not be the passage's).
  const pickedPlace = placePick ? (sheetPlaces().find((x) => placeTitle(x.name) === placePick.entity)?.slug ?? null) : null;
  const imageSheets = pickedPlace ? { characters: askedSheetsText?.characters ?? [], place: pickedPlace, added: askedSheetsText?.added ?? [] } : askedSheetsText;
  if (imageSheets && imageSheets.characters.length > IMAGES.designs.maxCharacters) return no(`Up to ${IMAGES.designs.maxCharacters} characters in one image`, 400);
  const added = (imageSheets?.added ?? []).filter((a) => !(placePick && a.kind === 'place'));

  const facts = blockFacts(ch.blocks);
  const setting = facts[ch.blocks.findIndex((b) => b.idx === start)]?.setting ?? null;
  const styleObj = style && !designStyle ? { id: style, text: styleText(style as StyleId, setting) } : null;
  const prompt = finalPrompt(userPrompt, styleObj?.text ?? stylePick?.text ?? null, [...sheetPicks.map((p) => p.text), ...added.map((a) => a.text)]);

  // Reference pictures: the chosen sheets' views, front first, up to the model's limit.
  const refs: { url: string; sha256: string; width: number; height: number }[] = [];
  // Picks, and a picked sheet's pictures as references, are open to everyone signed in, wallet accounts too (owner,
  // 2026-10-23). A wallet account is charged the price it was shown (Terms 6a): the composer shows
  // priceUsd(generateReserveUsd(references)) from the same count of pictures, and that is what reserve() takes.
  if (body.reference === true) {
    for (const p of sheetPicks) for (const k of ['front', 'side', 'back'] as const) if (p.views[k] && refs.length < IMAGES.maxReferences) refs.push({ url: p.views[k]!.url, sha256: p.views[k]!.sha256, width: p.views[k]!.recipe.width, height: p.views[k]!.recipe.height });
    if (!refs.length) return no('None of these sheets has pictures to use as a reference', 400);
  }
  const pictures: { bytes: Buffer; contentType: string; width: number; height: number }[] = [];
  for (const ref of refs) {
    const bytes = await referencePicture(ref.url, ref.sha256);
    if (!bytes) return no('A reference picture could not be read. Try again without it.', 503);
    pictures.push({ bytes, contentType: 'image/jpeg', width: ref.width, height: ref.height });
  }
  const model = pictures.length ? IMAGES.editModel : IMAGES.model;

  // Counted from here, whatever happens next (decision 16: blocked attempts count). The whole prompt
  // as it will be sent (the person's words, any style, sheet and shorthand text) is checked.
  const paid = await paidPicture(sql, fid, request, {
    checkText: prompt,
    spend: pictures.length ? { model: IMAGES.editModel, reserveUsd: generateReserveUsd(pictures.length) } : undefined,
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
    ...(designs.length ? { designs } : {}),
    ...(refs.length ? { references: refs.map(({ url, sha256 }) => ({ url, sha256 })) } : {}),
    ...(imageSheets ? { sheets: imageSheets } : {}),
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, left: paid.left, ...(fid < 0 ? { prepaid: true } : {}) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
