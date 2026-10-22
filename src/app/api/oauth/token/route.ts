import { NextResponse } from 'next/server';
import { agentsOn } from '~/lib/agents/core';
import { OAuthError, token } from '~/lib/agents/oauth';

/** The token endpoint: form-encoded, public clients, PKCE; refresh tokens are replaced every time. */
const noStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const type = request.headers.get('content-type') ?? '';
  const form = type.includes('application/json') ? new URLSearchParams(Object.entries((await request.json().catch(() => ({}))) as Record<string, string>)) : new URLSearchParams(await request.text());
  try {
    return NextResponse.json(await token(form, request.headers.get('authorization')), { headers: noStore });
  } catch (e) {
    // invalid_client is 401, with the Basic challenge for a client that used Basic (RFC 6749 §5.2).
    if (e instanceof OAuthError) return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status === 409 ? 400 : e.status, headers: { ...noStore, ...(e.status === 401 && /^Basic /i.test(request.headers.get('authorization') ?? '') ? { 'WWW-Authenticate': 'Basic realm="snowmoon"' } : {}) } });
    console.error('oauth token failed', (e as Error)?.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: noStore });
  }
}
