import { NextResponse } from 'next/server';
import { AGENT_API } from '~/lib/config';
import { ToolInputError, TOOLS, toolByName } from '~/lib/agent/tools';
import { agentApiOn, rateOk } from '~/lib/agent/rate';
import { asAgentReader } from '~/lib/agent/reader';

/**
 * The agent read API as an MCP server (owner, 2026-10-19), over Streamable HTTP: one POST per JSON-RPC message,
 * answered with application/json (no stream, no session). initialize, ping, tools/list, tools/call. Read only:
 * the tools are those of src/lib/agent/tools.ts, the same as /api/agent/v1/<tool>. Open without sign-in at a
 * low rate. SWITCHED OFF (AGENT_API.enabled).
 */
type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const headers = { 'Cache-Control': 'no-store' };
const reply = (id: Msg['id'], result: unknown) => NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { headers });
const fail = (id: Msg['id'], code: number, message: string, status = 200) => NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status, headers });

const INSTRUCTIONS =
  "Read-only tools for snowmoon.party, an independent open adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him. Read the book, published scenes, shots, lines and recipes. Cite the book by block id (c<chapter>-b<block>). Anything a model made carries its AI label; keep it with what you show. Nothing here can publish or write anything.";

export async function GET() {
  return agentApiOn() ? new NextResponse('Use POST (MCP Streamable HTTP).', { status: 405, headers: { Allow: 'POST' } }) : new NextResponse('Not found', { status: 404 });
}

export async function POST(request: Request) {
  return asAgentReader(() => handle(request));
}

async function handle(request: Request) {
  if (!agentApiOn()) return new NextResponse('Not found', { status: 404 });
  let msg: Msg;
  try {
    msg = await request.json();
  } catch {
    return fail(null, -32700, 'Parse error', 400);
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(null, -32600, 'Invalid request', 400);
  // A notification (no id) gets no answer.
  if (msg.id === undefined) return new NextResponse(null, { status: 202 });
  try {
    const rate = await rateOk(request);
    if (!rate.ok) return fail(msg.id, -32000, rate.status === 429 ? 'Too many requests: at most 20 a minute' : 'Not available here', rate.status);
  } catch {
    return fail(msg.id, -32000, 'Something went wrong on our side. Try again in a moment.', 503);
  }
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '';
      const protocolVersion = (AGENT_API.protocolVersions as readonly string[]).includes(asked) ? asked : AGENT_API.protocolVersions[0];
      return reply(msg.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'snowmoon-party', title: 'Snowmoon Party (read only)', version: '1.0.0' }, instructions: INSTRUCTIONS });
    }
    case 'ping':
      return reply(msg.id, {});
    case 'tools/list':
      return reply(msg.id, { tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } })) });
    case 'tools/call': {
      const name = typeof msg.params?.name === 'string' ? msg.params.name : '';
      const tool = toolByName(name);
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${name}`);
      const args = msg.params?.arguments ?? {};
      if (typeof args !== 'object' || Array.isArray(args) || args === null) return fail(msg.id, -32602, 'arguments must be an object');
      try {
        const out = await tool.run(args as Record<string, unknown>);
        return reply(msg.id, { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (e) {
        // A bad argument is the tool's own error, so the agent can correct itself; anything else is ours.
        if (e instanceof ToolInputError) return reply(msg.id, { content: [{ type: 'text', text: e.message }], isError: true });
        console.error('mcp tool failed', name, (e as { code?: string }).code ?? (e as Error)?.name ?? 'unknown');
        return reply(msg.id, { content: [{ type: 'text', text: 'Something went wrong on our side. Try again in a moment.' }], isError: true });
      }
    }
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
