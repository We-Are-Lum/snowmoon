import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { playFor } from '~/lib/agents/core';
import { ToolInputError } from '~/lib/agent/tools';
import { changeFor } from '~/lib/minpentai/agent-play/act';
import { takeTurnOnPage } from '~/lib/minpentai/agent-play/solo';

export const dynamic = 'force-dynamic';

/**
 * The live page's Take turn (owner, 2026-11-03): finalizes the draft the person's AI sent for the open turn. Only the
 * match's own person, signed in, can do it: the live link's secret (?k=) opens the page to view and never plays, so a
 * link that leaks can't take a turn. The same quiet time as the connector's tools (act.ts: settle), and someone else's
 * match or none reads the same.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { id } = await params;
  let turn: number;
  try { turn = Number(((await request.json()) as { turn?: unknown }).turn); } catch { return NextResponse.json({ error: 'turn missing' }, { status: 400 }); }
  if (!Number.isInteger(turn)) return NextResponse.json({ error: 'turn missing' }, { status: 400 });
  if (!playFor(person)) return NextResponse.json({ error: 'no match of yours with that id' }, { status: 404 });
  try {
    const out = await changeFor(person, id, (m, side) => takeTurnOnPage(m, { turn, now: new Date().toISOString() }, side));
    return NextResponse.json({ ok: true, resolved: 'resolved' in out ? out.resolved : null });
  } catch (e) {
    if (e instanceof ToolInputError) return NextResponse.json({ error: e.message }, { status: /no match of yours/.test(e.message) ? 404 : 400 });
    throw e;
  }
}
