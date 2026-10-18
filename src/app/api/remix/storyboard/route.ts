import { NextResponse } from 'next/server';
import { getPerson, getWallet } from '~/lib/auth';
import { db } from '~/lib/db';
import { hasConsented } from '~/lib/consent';
import { bylineName } from '~/lib/names';
import { shortAddress } from '~/lib/wallet/session';
import { boardsToday, checkBoard, saveBoard } from '~/lib/remix/storyboards';

/**
 * Save a storyboard (owner, 2026-10-18): the person's frames in order, their lengths, and which
 * existing converted take plays for each line, for one version. Signed in and after consent (its
 * title is their words; it is published with their name). Up to 20 a day. Nothing is generated or charged.
 */
const PER_DAY = 20;

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in to save a storyboard' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Saving storyboards is not set up on this deployment' }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { adaptation?: unknown; version?: unknown; title?: unknown; items?: unknown; takes?: unknown; nameProof?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const adaptation = Number(body.adaptation), version = Number(body.version);
  if (!Number.isInteger(adaptation) || !Number.isInteger(version)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const [v] = await sql`select 1 from studio.adaptation_versions where id = ${version} and adaptation_id = ${adaptation} and not hidden`;
  if (!v) return NextResponse.json({ error: 'No such version' }, { status: 404 });
  if (!(await hasConsented(person))) return NextResponse.json({ error: 'Agree to how your words are published first', reason: 'consent' }, { status: 403 });
  if ((await boardsToday(sql, person)) >= PER_DAY) return NextResponse.json({ error: `You can save ${PER_DAY} storyboards a day. More tomorrow (00:00 UTC).` }, { status: 429 });
  const c = await checkBoard(sql, person, adaptation, version, body);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  const wallet = person < 0 ? getWallet(request) : null;
  const by = wallet ? { name: shortAddress(wallet.address) } : await bylineName(person, body.nameProof);
  const b = await saveBoard(sql, { adaptation, version, person, title: c.title, items: c.items, takes: c.takes, byName: by.name });
  return NextResponse.json({ id: b.id, page: `/storyboard/${b.id}` }, { headers: { 'Cache-Control': 'no-store' } });
}
