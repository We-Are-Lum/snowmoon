import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { AGENTS } from '~/lib/config';
import { agentsOn, type Scope, allowed } from '~/lib/agents/core';
import { agentsOf, createKey, revoke, startWalletLink } from '~/lib/agents/accounts';

/**
 * A person's agents, for /you: list them, disconnect one (one tap, at once), or name a wallet agent.
 * Only a signed-in person, about their own agents; never an agent's token (getPerson never takes one).
 */
const noStore = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  // Only the allowlisted people (the owner) see anything here; everyone else gets the same 404 as before.
  if (!(await allowed(person))) return new NextResponse('Not found', { status: 404 });
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  return NextResponse.json({ agents: await agentsOf(person), max: AGENTS.perPerson }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  // Only the allowlisted people (the owner) see anything here; everyone else gets the same 404 as before.
  if (!(await allowed(person))) return new NextResponse('Not found', { status: 404 });
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string; address?: string; name?: string; capUsd?: unknown };
  if (body.action === 'disconnect' && typeof body.id === 'string') {
    const ok = await revoke(person, body.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: noStore });
  }
  // A personal agent key: the key is in this answer only (no-store), and never again.
  if (body.action === 'key' && typeof body.name === 'string') {
    try {
      const cap = body.capUsd === undefined ? AGENTS.key.capUsd.default : Number(body.capUsd);
      return NextResponse.json(await createKey(person, body.name, cap), { headers: noStore });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400, headers: noStore });
    }
  }
  if (body.action === 'wallet' && typeof body.address === 'string' && typeof body.name === 'string') {
    try {
      return NextResponse.json(await startWalletLink(person, body.address, body.name, [...AGENTS.scopes] as Scope[]), { headers: noStore });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400, headers: noStore });
    }
  }
  return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: noStore });
}
