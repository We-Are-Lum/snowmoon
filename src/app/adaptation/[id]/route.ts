import { NextResponse } from 'next/server';
import { adaptationPagesShown } from '~/lib/config';
import { getAdaptation, parseId, sceneHandleFor } from '~/lib/adaptation-pages';

/**
 * /<id> (rewritten here by next.config.ts, digits only): to the page of the person who started
 * adaptation <id>, which shows their chosen version. Temporary (307): what it points at can change.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const adaptation = id !== null && adaptationPagesShown() ? await getAdaptation(id) : null;
  // A linked wallet's scenes live under its FID's name (owner, 2026-10-22), so this goes straight there.
  const handle = adaptation && (await sceneHandleFor(adaptation.owner));
  if (!adaptation || !handle) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(new URL(`/@${handle}/${adaptation.id}`, req.url), 307);
}
