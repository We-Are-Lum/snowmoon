import { NextResponse } from 'next/server';
import { ToolInputError, TOOLS, toolByName } from '~/lib/agent/tools';
import { agentApiOn, rateOk } from '~/lib/agent/rate';
import { asAgentReader } from '~/lib/agent/reader';
import { tryAgain } from '~/lib/try-again';
import { agentFromRequest, agentsOn } from '~/lib/agents/core';
import { runTool } from '~/lib/agents/tools';

/**
 * The agent read API as REST (owner, 2026-10-19): GET /api/agent/v1/<tool>?<arguments>, the same tools as
 * /api/mcp. GET /api/agent/v1/tools lists them with their argument schemas. Open without sign-in at a low rate.
 * GETs are read only. POST is for an agent of a person (its own token: OAuth, or a linked wallet's), with the
 * same tools as /mcp, drafts included (owner, 2026-10-20; docs/agents/design.md). SWITCHED OFF (AGENT_API.enabled,
 * AGENTS.enabled).
 */
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
const no = (error: string, status: number, extra: Record<string, string> = {}) => NextResponse.json({ error }, { status, headers: { ...headers, ...extra } });

export async function GET(request: Request, ctx: { params: Promise<{ tool: string }> }) {
  return asAgentReader(() => handle(request, ctx));
}

async function handle(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  if (!agentApiOn()) return no('Not found', 404);
  const name = (await params).tool;
  try {
    const rate = await rateOk(request);
    if (!rate.ok) return rate.status === 429 ? no('Too many requests: at most 20 a minute', 429, { 'Retry-After': String(rate.retryAfter ?? 60) }) : no('Not available here', 503);
    if (name === 'tools') return NextResponse.json({ tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })) }, { headers });
    const tool = toolByName(name);
    if (!tool) return no(`No such tool: ${name}`, 404);
    const args = Object.fromEntries(new URL(request.url).searchParams.entries());
    return NextResponse.json(await tool.run(args), { headers });
  } catch (e) {
    if (e instanceof ToolInputError) return no(e.message, 400);
    return tryAgain('agent api', e);
  }
}

/** An agent's tool call as REST: POST /api/agent/v1/<tool> with a JSON body of arguments and its bearer token. */
export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  if (!agentsOn()) return no('Not found', 404);
  const agent = await agentFromRequest(request).catch(() => null);
  if (!agent) return no('An agent token is required (see /agents.md)', 401, { 'WWW-Authenticate': 'Bearer' });
  const args = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return no('the body must be a JSON object of arguments', 400);
  try {
    return NextResponse.json(await runTool(agent, (await params).tool, args), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ToolInputError) return no(e.message, 400);
    return tryAgain('agent tool', e);
  }
}
