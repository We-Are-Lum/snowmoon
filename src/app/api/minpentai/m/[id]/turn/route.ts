import { NextResponse } from 'next/server';
import { playFor } from '~/lib/agents/core';
import { linkOpens, turnFrames } from '~/lib/minpentai/agent-play/solo';
import { load } from '~/lib/minpentai/agent-play/store';
import { settle } from '~/lib/minpentai/agent-play/quiet';

export const dynamic = 'force-dynamic';

/**
 * One past turn's replay for the live page (owner, 2026-11-03: past turns collapse below, tap one to see its replay):
 * the frames turnFrames gives the page itself, the side's view while the match is on and the whole board once it's
 * over. Opened by the live link's secret, as the page is; anything else reads as missing. Same quiet time as the page.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, url = new URL(request.url), k = url.searchParams.get('k') ?? '', t = Number(url.searchParams.get('t'));
  const peek = await load(id).catch(() => null);
  if (!peek || !playFor(peek.m.person) || !linkOpens(peek.m, k) || !Number.isInteger(t)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const r = (await settle(id)) ?? peek;
  if (!r.m.history.some((h) => h.turn === t)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ frames: turnFrames(r.m, t, !!r.m.end) }, { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
