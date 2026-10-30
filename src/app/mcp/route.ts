import { NextResponse } from 'next/server';
import { ToolInputError } from '~/lib/agent/tools';
import { agentFromRequest, agentsOn, issuer } from '~/lib/agents/core';
import { AGENT_TOOLS, runTool } from '~/lib/agents/tools';

/**
 * The connector for "Add to Claude" and "Add to ChatGPT" (owner, 2026-10-20; docs/agents/design.md §1).
 * MCP over Streamable HTTP, stateless: one JSON-RPC message per POST, answered as application/json.
 * Every request needs an agent's token (OAuth 2.1, see /.well-known/oauth-protected-resource/mcp); without
 * one the answer is 401 with the metadata's address, which is how a client knows to sign the person in.
 * The open, anonymous read API stays at /api/mcp. SWITCHED OFF (AGENTS.enabled).
 */
/**
 * A stuck call must fail fast, not hold the agent for Vercel's five minutes (owner, 2026-10-22, after eleven
 * calls hung at 23:43–23:48 on 2026-10-21): the route stops at 60 s, and a tool that hasn't answered in
 * TOOL_TIMEOUT_MS answers "took too long" instead. Each call is logged by tool name and time taken, never by
 * what was asked or answered, so the next hang names its tool.
 */
export const maxDuration = 60;
const TOOL_TIMEOUT_MS = 25_000;
class ToolTimeout extends Error {}
const withTimeout = <T,>(work: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToolTimeout()), ms);
    work.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const headers = { 'Cache-Control': 'no-store' };
const reply = (id: Msg['id'], result: unknown) => NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { headers });
const fail = (id: Msg['id'], code: number, message: string, status = 200) => NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status, headers });

const unauthorized = (why: string) =>
  new NextResponse(JSON.stringify({ error: 'invalid_token', error_description: why }), {
    status: 401,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource/mcp", scope="read drafts images notes"`,
    },
  });

const INSTRUCTIONS =
  'You are acting for one person on snowmoon.party, an independent open adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him. ' +
  'You appear as "<your name>, agent of @person". You draft; your person publishes: nothing you make is public until they publish it from their You page. ' +
  'You can read the book and published scenes, draft ideas, storyboards, frame prompts and character versions, bring in images with their recipe as you declare it, read feedback, propose revisions (credited), and draft notes. ' +
  'On your person\'s own scene versions you can draft edits: try_frame (a new frame from their note), swap_take, change_timing, mark_speaking and request_video_test (list_takes shows a shot\'s lines and takes). A frame or video costs money: you only draft it with its estimate, and your person approves the spend on their You page. ' +
  'When your person asks for something no tool can do, call log_gap with what they asked and what was missing, then tell them. When they wish for a feature or say how the site could be better, pass it on with suggest_improvement, in their words. The site\'s owner reads both. ' +
  'Story lines are what characters say, or narration; your person\'s idea or notes are not lines. Name the book\'s characters freely (Zei, Deluin, Bai…). Quote the book only word for word, citing its block (c<chapter>-b<block>). Never present yourself as a person. Don\'t name or depict real people, and don\'t name artists, studios or films in prompts. Call whoami first.';

export async function GET() {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  return new NextResponse('Use POST (MCP Streamable HTTP).', { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
  return new NextResponse(null, { status: agentsOn() ? 405 : 404 });
}

export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const agent = await agentFromRequest(request).catch(() => null);
  if (!agent) return unauthorized('Connect this agent to a person on snowmoon.party first');
  let msg: Msg;
  try {
    msg = await request.json();
  } catch {
    return fail(null, -32700, 'Parse error', 400);
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(null, -32600, 'Invalid request', 400);
  if (msg.id === undefined) return new NextResponse(null, { status: 202 });
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '';
      return reply(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'snowmoon-party-agent', title: 'Snowmoon Party', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply(msg.id, {});
    case 'tools/list':
      return reply(msg.id, {
        tools: AGENT_TOOLS.filter((t) => agent.scopes.includes(t.scope)).map(({ name, title, description, inputSchema, writes }) => ({
          name, title, description, inputSchema,
          annotations: { title, readOnlyHint: !writes, destructiveHint: false, idempotentHint: !writes, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const name = typeof msg.params?.name === 'string' ? msg.params.name : '';
      const args = msg.params?.arguments ?? {};
      if (typeof args !== 'object' || Array.isArray(args) || args === null) return fail(msg.id, -32602, 'arguments must be an object');
      const started = Date.now();
      const writes = AGENT_TOOLS.find((t) => t.name === name)?.writes ?? false;
      console.log('agent tool start', name);
      const done = (outcome: string) => console.log('agent tool', name, outcome, `${Date.now() - started}ms`);
      try {
        const out = (await withTimeout(runTool(agent, name, args as Record<string, unknown>), TOOL_TIMEOUT_MS)) as Record<string, unknown>;
        done('ok');
        return reply(msg.id, { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (e) {
        if (e instanceof ToolTimeout) {
          done('timeout');
          const text = writes
            ? 'That took too long on our side. It may still have been saved: check with list_my_work before trying again.'
            : 'That took too long on our side. Try again in a moment.';
          return reply(msg.id, { content: [{ type: 'text', text }], isError: true });
        }
        done(e instanceof ToolInputError ? 'input-error' : 'error');
        if (e instanceof ToolInputError) return reply(msg.id, { content: [{ type: 'text', text: e.message }], isError: true });
        console.error('agent tool failed', name, (e as { code?: string }).code ?? (e as Error)?.message ?? 'unknown');
        return reply(msg.id, { content: [{ type: 'text', text: 'Something went wrong on our side. Try again in a moment.' }], isError: true });
      }
    }
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
