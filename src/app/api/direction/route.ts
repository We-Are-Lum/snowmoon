import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { ToolInputError } from '~/lib/agent/tools';
import { agentsOn, allowed } from '~/lib/agents/core';
import { addDirection, rewriteLine, scriptOf, settle } from '~/lib/agents/direction';

/**
 * The script page's data (owner, 2026-10-20): a person's own scene version, line by line, with their direction
 * notes and rewrites; and their own notes, rewrites, withdrawals and "recorded" from that page. Only a signed-in
 * person (never an agent's token: getPerson never takes one), only on a version they made, and only for the
 * allowlisted people while agents are owner-only; everyone else gets the same 404.
 */
const noStore = { 'Cache-Control': 'no-store' };

async function who(request: Request) {
  if (!agentsOn()) return { out: new NextResponse('Not found', { status: 404 }) };
  const person = await getPerson(request);
  if (!(await allowed(person))) return { out: new NextResponse('Not found', { status: 404 }) };
  if (person === null) return { out: NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore }) };
  return { person };
}
const fail = (e: unknown) => {
  if (e instanceof ToolInputError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
  throw e;
};

export async function GET(request: Request) {
  const w = await who(request);
  if (w.out) return w.out;
  const u = new URL(request.url);
  try {
    return NextResponse.json(await scriptOf(w.person, u.searchParams.get('adaptation'), u.searchParams.get('version')), { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  const w = await who(request);
  if (w.out) return w.out;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { action, ...args } = body;
  try {
    if (action === 'note') return NextResponse.json(await addDirection(w.person, { agent: null }, args), { headers: noStore });
    if (action === 'rewrite') return NextResponse.json(await rewriteLine(w.person, { agent: null }, args), { headers: noStore });
    if ((action === 'withdraw' || action === 'recorded' || action === 'confirm') && typeof args.id === 'string') {
      const ok = await settle(w.person, args.id, action);
      return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: noStore });
    }
  } catch (e) {
    return fail(e);
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: noStore });
}
