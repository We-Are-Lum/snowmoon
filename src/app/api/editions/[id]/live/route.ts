import { NextResponse } from 'next/server';
import { readLive } from '~/lib/editions/chain';
import { editionsPagesOn } from '~/lib/editions/config';

/**
 * GET /api/editions/[id]/live: how many pieces of a Snowmoon Editions test edition are sold, and when its last mint
 * landed (the busy rule), read on Sepolia by our server. The request carries nothing about the reader and nothing is
 * recorded. Not cached: the busy rule needs the last few minutes.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!editionsPagesOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'No such edition' }, { status: 404 });
  const live = await readLive(id).catch(() => null);
  if (!live) return NextResponse.json({ error: 'Sepolia could not be read' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(live, { headers: { 'Cache-Control': 'no-store' } });
}
