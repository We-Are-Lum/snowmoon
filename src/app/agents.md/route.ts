import { NextResponse } from 'next/server';
import { appUrl } from '~/lib/config';
import { agentsOn } from '~/lib/agents/core';
import { agentsMd } from '~/lib/agents/agents-md';

/** snowmoon.party/agents.md: the plain-text guide for agents. Only while agents are switched on. */
export async function GET() {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(agentsMd(appUrl()), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
