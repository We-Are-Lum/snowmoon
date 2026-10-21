import { NextResponse } from 'next/server';
import { agentsOn } from '~/lib/agents/core';
import { finishWalletLink } from '~/lib/agents/accounts';

/** A wallet agent signs the link message its person made for it (an ordinary wallet's signature). */
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { link?: string; signature?: string };
  if (typeof body.link !== 'string' || !/^[0-9a-f-]{36}$/.test(body.link) || typeof body.signature !== 'string' || !/^0x[0-9a-f]+$/i.test(body.signature))
    return NextResponse.json({ error: 'link and signature required' }, { status: 400 });
  const ok = await finishWalletLink(body.link, body.signature as `0x${string}`);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
