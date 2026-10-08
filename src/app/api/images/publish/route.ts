import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES, WORK_ID } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { publishesLeft } from '~/lib/images/limits';
import { putPublic, storageReady } from '~/lib/images/store';
import { readTicket } from '~/lib/images/ticket';
import { bylineName } from '~/lib/names';

/**
 * Publish a draft (section 5): the device sends back the image and its signed record. The
 * record must be the server's own and the signer's; the bytes must be the ones it describes;
 * the same image can't be published twice. Then, in one transaction: the recipe (the exact
 * prompt sent), the image element under the person's FID, its version with the public file,
 * the passage it belongs to, and any 'uses' or 'remixed_from' links (for style guides and
 * character sheets later; they must point at published work).
 */
const no = (error: string, status: number) => NextResponse.json({ error }, { status });
const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to publish' }, { status: 401 });
  if (!IMAGES.enabled) return no('Publishing images is switched off for now', 503);
  const sql = db();
  if (!sql || !process.env.IMAGES_TICKET_SECRET || !storageReady()) return no('Publishing images is not set up on this deployment', 503);
  let body: { ticket?: unknown; image?: unknown; uses?: unknown; remixedFrom?: unknown; nameProof?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const t = typeof body.ticket === 'string' ? readTicket(body.ticket) : null;
  if (!t) return no('This draft has expired or was not made here. Generate it again.', 400);
  if (t.fid !== fid) return no('Only the person who made this draft can publish it', 403);
  const m = typeof body.image === 'string' ? body.image.match(/^data:(image\/jpeg);base64,(.+)$/) : null;
  if (!m) return no('Bad image', 400);
  const bytes = Buffer.from(m[2], 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== t.sha256) return no('The image is not the one this draft describes', 400);
  const uses = Array.isArray(body.uses) ? body.uses.filter(isId).slice(0, 8) : [];
  const remixedFrom = Array.isArray(body.remixedFrom) ? body.remixedFrom.filter(isId).slice(0, 4) : [];
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403);
  if ((await publishesLeft(sql, fid)) <= 0) return no(`You can publish ${IMAGES.publishesPerDay} images a day. More tomorrow (00:00 UTC).`, 429);
  const [dup] = await sql`select 1 from studio.element_versions where asset_sha256 = ${t.sha256} limit 1`;
  if (dup) return no('This image is already published', 409);
  // Links must point at published work: 'uses' at design versions, 'remixed_from' at images.
  if (uses.length || remixedFrom.length) {
    const ok = await sql`select v.id, e.element_type from studio.element_versions v join studio.elements e on e.id = v.element_id
      where e.status = 'published' and v.id in ${sql([...uses, ...remixedFrom])}`;
    const type = new Map(ok.map((r) => [String(r.id), String(r.element_type)]));
    if (uses.some((u) => type.get(u) !== 'design') || remixedFrom.some((u) => type.get(u) !== 'image')) return no('A linked work is not published', 400);
  }

  // The byline (decision 12): the relay's name signed at website sign-in, else Farcaster's public API.
  const by = await bylineName(fid, body.nameProof);
  const url = await putPublic(t.sha256, bytes, 'image/jpeg');
  const recipeId = randomUUID(), elementId = randomUUID(), versionId = randomUUID();
  await sql.begin(async (tx) => {
    await tx`insert into studio.recipes ${tx({
      id: recipeId,
      source: 'in_app',
      provider: t.host,
      model: t.model,
      model_version: t.endpoint,
      prompt: t.prompt,
      params: tx.json({
        user_prompt: t.userPrompt,
        style: t.style,
        endpoint: t.endpoint,
        settings: t.settings,
        request_id: t.requestId,
        made_at: t.at,
        anchor: { chapter: t.chapter, start: t.start, end: t.end },
        output_sha256: t.sha256,
        size: { width: t.width, height: t.height },
        checks: { prompt: t.guard, host_safety_checker: 'passed' },
        by_name: by.name,
        by_name_source: by.source,
      } as never),
      seed: t.seed,
      // The style text was drafted by the coding agent (content/snowmoon/designs/styles), so it says so.
      assist: t.style ? tx.json({ model: 'claude-coding-agent', drafted: ['style text'], source: 'content/snowmoon/designs/styles/techno-vistas.json' } as never) : null,
      cost_usd: Number(t.costUsd.toFixed(4)),
      created_by_fid: fid,
    })}`;
    await tx`insert into studio.elements ${tx({ id: elementId, work_id: WORK_ID, element_type: 'image', created_by_fid: fid })}`;
    await tx`insert into studio.element_versions ${tx({ id: versionId, element_id: elementId, version_no: 1, body: tx.json({ lettering: [] } as never), asset_url: url, asset_sha256: t.sha256, recipe_id: recipeId })}`;
    await tx`insert into studio.anchors ${tx({ version_id: versionId, work_id: WORK_ID, chapter: t.chapter, start_idx: t.start, end_idx: t.end })}`;
    for (const to of uses) await tx`insert into studio.links ${tx({ from_version_id: versionId, to_version_id: to, kind: 'uses' })}`;
    for (const to of remixedFrom) await tx`insert into studio.links ${tx({ from_version_id: versionId, to_version_id: to, kind: 'remixed_from' })}`;
  });
  revalidatePath('/images');
  revalidatePath(`/image/${versionId}`);
  return NextResponse.json({ versionId, url, page: `/image/${versionId}` });
}
