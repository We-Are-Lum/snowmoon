import { NextResponse } from 'next/server';
import { agentsOn } from '~/lib/agents/core';
import { OAuthError, registerClient } from '~/lib/agents/oauth';
import { rateOk } from '~/lib/agent/rate';

/** Dynamic Client Registration (RFC 7591): public clients only, at the open read API's rate per caller. */
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const rate = await rateOk(request).catch(() => ({ ok: false as const, status: 503 as const }));
  if (!rate.ok) return NextResponse.json({ error: 'temporarily_unavailable' }, { status: rate.status });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'JSON body required' }, { status: 400 });
  try {
    return NextResponse.json(await registerClient(body as Record<string, unknown>), { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json({ error: e.code, error_description: e.message }, { status: 400 });
    throw e;
  }
}
