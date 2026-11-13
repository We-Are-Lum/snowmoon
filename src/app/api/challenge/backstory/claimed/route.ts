import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { challengeVisibleTo } from '~/lib/challenge/visibility';
import { chain } from '~/lib/wallet/chain';
import { recordClaim } from '~/lib/poidh/bounty';
import { txHash } from '~/lib/poidh/claim';

/**
 * POST { id, tx }: the maker's wallet sent createClaim for their prepared claim `id`; `tx` is its hash. The hash is kept
 * at once; then Base is asked for the receipt (up to a minute) and the ClaimCreated for this bounty and this record's URI
 * gives poidh's claim id (src/lib/poidh/bounty.ts recordClaim). 202 when Base hasn't confirmed it yet.
 */
export const runtime = 'nodejs';
export const maxDuration = 90;
const no = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (!challengeVisibleTo(person)) return no('Not found', 404);
  if (person === null) return no('Sign in first', 401);
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { id?: unknown; tx?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const id = typeof body.id === 'string' && /^[0-9]{1,18}$/.test(body.id) ? body.id : null;
  const tx = txHash(body.tx);
  if (!id || !tx) return no('Bad request', 400);
  const r = await recordClaim({ sql, reader: chain() }, person, id, tx);
  return NextResponse.json(r, { status: r.status });
}
