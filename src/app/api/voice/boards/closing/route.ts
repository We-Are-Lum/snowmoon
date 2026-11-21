import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { pictureBytes } from '~/lib/voice/board-store';
import { CLOSING } from '~/lib/voice/closing';
import { closingCard } from '~/lib/voice/closing-card';
import { publishPreview } from '~/lib/voice/publish';
import { publishDeps } from '~/lib/voice/publish-deps';

/**
 * GET ?draft=<id>[&named=no]: the closing card as it would be published, to the draft's own person: the kept background
 * (or a plain card) with the site's own text over it. Drawn on our server; no model.
 */
export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const deps = publishDeps();
  const performer = q.get('named') === 'no' ? null : await deps.name(who.fid, request.headers.get('x-name-proof'));
  const p = await publishPreview(sql, who.fid, String(q.get('draft') ?? ''), deps, performer);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const bg = p.background ? await pictureBytes(sql, p.draft.id, CLOSING.key, p.background.sha256) : null;
  const png = await closingCard(bg, p.recipe.speech?.title ?? 'A speech', p.credits);
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', ...noStore } });
}
