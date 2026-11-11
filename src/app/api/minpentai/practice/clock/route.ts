import { NextResponse } from 'next/server';
import { clocked } from '~/lib/minpentai/agent-play/act';
import { livePractice } from '~/lib/minpentai/agent-play/store';

export const dynamic = 'force-dynamic';

/**
 * The practice-match clock's sweep (owner, 2026-11-03): plays every overdue turn (act.ts clocked: the side that is late
 * plays under its standing order) and tells the players. A match's clock also runs whenever either player or either
 * live page looks at it, so this only matters when nobody does. Off until CRON_SECRET is set in Vercel (only the owner
 * can), and then for a Vercel cron job only (Authorization: Bearer <CRON_SECRET>); a schedule goes in vercel.json then.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'off: CRON_SECRET is not set' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'no' }, { status: 401 });
  let played = 0;
  for (const id of await livePractice()) {
    if ((await clocked(id))?.played) played++;
  }
  return NextResponse.json({ ok: true, played });
}
