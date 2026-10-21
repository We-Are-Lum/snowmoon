import { NextResponse } from 'next/server';
import { agentsOn } from '~/lib/agents/core';
import { protectedResourceMetadata } from '~/lib/agents/oauth';

/** OAuth Protected Resource Metadata (RFC 9728) for the connector at /mcp; also served at …/mcp, where clients look first. */
export async function GET() {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  return NextResponse.json(protectedResourceMetadata(), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
