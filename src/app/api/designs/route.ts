import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import type { DesignBody, DesignPicture } from '~/lib/element-body';
import { SAMPLE_ASSIST } from '~/lib/images/design-rules';
import { bookCharacter, designByVersion, designPublishesToday, makeDesign, MakeRefused, styleNameTaken, type DesignKind, type MakeMode } from '~/lib/images/designs';
import { blockedName } from '~/lib/images/rules';
import { putPublic, storageReady } from '~/lib/images/store';
import { readSampleTicket, type SampleTicket } from '~/lib/images/ticket';
import { bylineName } from '~/lib/names';

/**
 * Publish a style or a character sheet (step 4): a new style, a sheet for one of the book's
 * characters, a fork of someone's design ("remixed from" it, for good), or a new version of your
 * own. Invited FIDs, after consent, a few a day. The device sends back each sample or view with its
 * signed record; every one must be this person's and made with exactly the text being published, so
 * the text was checked when they were made, and the pictures show what the text does. Then the
 * pictures go to the public bucket and the design is written in one transaction.
 */
const no = (error: string, status: number) => NextResponse.json({ error }, { status });
type Pic = { ticket?: unknown; image?: unknown };

function picture(p: Pic | undefined, fid: number, text: string): { t: SampleTicket; bytes: Buffer } | string {
  const t = typeof p?.ticket === 'string' ? readSampleTicket(p.ticket) : null;
  const m = typeof p?.image === 'string' ? p.image.match(/^data:image\/jpeg;base64,(.+)$/) : null;
  if (!t || !m) return 'A picture has expired or was not made here. Make it again.';
  if (t.fid !== fid) return 'Only the person who made these pictures can publish them';
  if (t.text !== text.trim()) return 'The text changed since the pictures were made. Make them again with this text.';
  const bytes = Buffer.from(m[1], 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== t.sha256) return 'A picture is not the one its record describes';
  return { t, bytes };
}

const recipeOf = (t: SampleTicket): DesignPicture['recipe'] => ({
  prompt: t.prompt, model: t.model, endpoint: t.endpoint, host: t.host, settings: t.settings, seed: t.seed, request_id: t.requestId,
  cost_usd: Number(t.costUsd.toFixed(4)), made_at: t.at, width: t.width, height: t.height, ...(t.references ? { references: t.references } : {}),
  checks: { prompt: t.guard, host_safety_checker: 'passed' }, assist: SAMPLE_ASSIST as unknown as DesignPicture['recipe']['assist'],
});

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to publish' }, { status: 401 });
  if (!IMAGES.enabled) return no('Publishing is switched off for now', 503);
  if (!IMAGES.invited.includes(fid)) return no('The trial is open to invited readers only', 403);
  const sql = db();
  if (!sql || !process.env.IMAGES_TICKET_SECRET || !storageReady()) return no('Publishing styles and sheets is not set up on this deployment', 503);
  let body: { mode?: unknown; kind?: unknown; title?: unknown; text?: unknown; character?: unknown; from?: unknown; samples?: unknown; views?: unknown; nameProof?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const mode = (['create', 'fork', 'version'] as const).find((m) => m === body.mode) as MakeMode | undefined;
  const kind = (['style', 'character'] as const).find((k) => k === body.kind) as DesignKind | undefined;
  if (!mode || !kind) return no('Bad request', 400);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim().replace(/\s+/g, ' ') : '';
  if (!text || text.length > IMAGES.designs.textMaxChars) return no(`Write the text, up to ${IMAGES.designs.textMaxChars} characters`, 400);
  if (kind === 'style' && (!title || title.length > IMAGES.designs.nameMaxChars)) return no(`Give the style a name, up to ${IMAGES.designs.nameMaxChars} characters`, 400);
  if (title.length > IMAGES.designs.nameMaxChars) return no('That name is too long', 400);
  const named = blockedName(`${title} ${text}`);
  if (named) return no('No real people: the name or text names someone on the blocked list.', 422);
  const character = kind === 'character' && mode === 'create' ? bookCharacter(String(body.character ?? '')) : null;
  if (kind === 'character' && mode === 'create' && !character) return no('Choose one of the book’s characters', 400);
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403);
  if ((await designPublishesToday(sql, fid)) >= IMAGES.designs.publishesPerDay) return no(`You can publish ${IMAGES.designs.publishesPerDay} styles or sheets a day. More tomorrow (00:00 UTC).`, 429);

  // The pictures: a style's samples (2 to 4), or a sheet's views (front needed; side and back optional).
  const samples: { t: SampleTicket; bytes: Buffer }[] = [];
  const views: Partial<Record<'front' | 'side' | 'back', { t: SampleTicket; bytes: Buffer }>> = {};
  if (kind === 'style') {
    const list = Array.isArray(body.samples) ? (body.samples as Pic[]).slice(0, IMAGES.designs.samplesMax) : [];
    for (const p of list) {
      const got = picture(p, fid, text);
      if (typeof got === 'string') return no(got, 400);
      if (got.t.slot !== 'sample') return no('Bad picture', 400);
      samples.push(got);
    }
    if (new Set(samples.map((s) => s.t.sha256)).size !== samples.length) return no('The same picture twice', 400);
    if (samples.length < IMAGES.designs.samplesMin) return no(`Make at least ${IMAGES.designs.samplesMin} sample pictures first`, 400);
  } else {
    const v = (body.views ?? {}) as Record<string, Pic | undefined>;
    for (const slot of ['front', 'side', 'back'] as const) {
      if (!v[slot]) continue;
      const got = picture(v[slot], fid, text);
      if (typeof got === 'string') return no(got, 400);
      if (got.t.slot !== slot) return no('Bad picture', 400);
      views[slot] = got;
    }
    if (!views.front) return no('Make the front view first', 400);
    for (const slot of ['side', 'back'] as const) {
      if (views[slot] && !views[slot]!.t.references?.some((r) => r.sha256 === views.front!.t.sha256)) return no('A view was made from another front view. Make it again.', 400);
    }
  }

  // Refusals that need no pictures come before any picture is put on the public bucket.
  if (mode === 'create' && kind === 'style' && (await styleNameTaken(sql, title))) return no('A style with this name already exists. Fork it, or choose another name.', 409);
  if (mode !== 'create') {
    const src = typeof body.from === 'string' ? await designByVersion(sql, body.from) : null;
    if (!src || src.kind !== kind) return no('No such design', 404);
    if (mode === 'version' && src.byFid !== fid) return no('Only its maker can add a version. Fork it to make your own.', 403);
  }

  const by = await bylineName(fid, body.nameProof);
  const put = async (p: { t: SampleTicket; bytes: Buffer }): Promise<DesignPicture> => ({ url: await putPublic(p.t.sha256, p.bytes, 'image/jpeg'), sha256: p.t.sha256, recipe: recipeOf(p.t) });
  const design: DesignBody = {
    title,
    text,
    samples: await Promise.all(samples.map(put)),
    views: Object.fromEntries(await Promise.all(Object.entries(views).map(async ([k, p]) => [k, await put(p!)]))),
    by_name: by.name,
    by_name_source: by.source,
    assist: null,
  };
  try {
    const out = await makeDesign(sql, { fid, mode, kind, styleName: mode === 'create' && kind === 'style' ? title : undefined, character: character ?? undefined, fromVersionId: typeof body.from === 'string' ? body.from : undefined, body: design });
    revalidatePath('/images/designs');
    return NextResponse.json({ versionId: out.versionId, page: `/images/designs/${out.versionId}` });
  } catch (e) {
    if (e instanceof MakeRefused) return no(e.message, e.status);
    throw e;
  }
}
