import { NextResponse } from 'next/server';
import { domain } from '~/lib/auth';
import { agentsOn } from '~/lib/agents/core';
import { walletAgentToken } from '~/lib/agents/accounts';

/**
 * A linked wallet agent signs in (Sign-In with Ethereum; get a nonce from /api/wallet/nonce) for an
 * hour's token, which works at /mcp and /api/agent/v1/<tool>.
 */
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { message?: string; signature?: string };
  if (typeof body.message !== 'string' || typeof body.signature !== 'string') return NextResponse.json({ error: 'message and signature required' }, { status: 400 });
  const t = await walletAgentToken(body.message, body.signature as `0x${string}`, domain(request));
  if (!t) return NextResponse.json({ error: 'not a linked agent, or the signature or nonce is wrong' }, { status: 401 });
  return NextResponse.json(t, { headers: { 'Cache-Control': 'no-store' } });
}
