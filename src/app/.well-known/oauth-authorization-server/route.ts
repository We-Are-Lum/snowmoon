import { NextResponse } from 'next/server';
import { agentsOn } from '~/lib/agents/core';
import { authServerMetadata } from '~/lib/agents/oauth';

/** OAuth Authorization Server Metadata (RFC 8414), for the agent connector (docs/agents/design.md §1). */
export async function GET() {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  return NextResponse.json(authServerMetadata(), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
