import 'server-only';
import { getSocial } from '../auth';
import { isSocialPerson, socialPerson } from '../people';
import { db } from '../db';
import { displayNameOf } from '../linked/accounts';

/**
 * The byline of a Lens or Bluesky account that isn't linked to a Farcaster account (branch signin-lens-bluesky): its
 * handle as checked at sign-in (a Bluesky handle that resolves back to its DID; a Lens username, "lens/<name>"), or
 * "a Bluesky account" / "a Lens account" when there is none. Null for anyone else (Farcaster names and wallet
 * addresses keep their own bylines). A linked account signs in as its Farcaster ID, so it gets the Farcaster name.
 */
export function socialByline(request: Request, person: number): { name: string; source: 'lens' | 'bluesky' } | null {
  if (!isSocialPerson(person)) return null;
  const s = getSocial(request);
  if (!s) return null;
  return { name: s.handle ?? (s.kind === 'lens' ? 'a Lens account' : 'a Bluesky account'), source: s.kind };
}

/**
 * The byline for the person a request acts as. With linked accounts on, a Bluesky sign-in may act as its person's Lens
 * account (src/lib/linked/accounts.ts): then the Lens account's username, never the Bluesky handle of the sign-in.
 */
export async function socialBylineFor(request: Request, person: number): Promise<{ name: string; source: 'lens' | 'bluesky' } | null> {
  if (!isSocialPerson(person)) return null;
  const s = getSocial(request);
  if (!s) return null;
  if (socialPerson(s.account) === person) return socialByline(request, person);
  const sql = db();
  const name = sql ? await displayNameOf(sql, person).catch(() => null) : null;
  return { name: name ?? 'a Lens account', source: 'lens' };
}
