import { NextResponse } from 'next/server';
import { agentsOn } from '~/lib/agents/core';
import { revokeToken } from '~/lib/agents/oauth';

/** Token revocation (RFC 7009): always 200. */
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const form = new URLSearchParams(await request.text());
  const t = form.get('token');
  if (t) await revokeToken(t).catch(() => undefined);
  return new NextResponse(null, { status: 200 });
}
