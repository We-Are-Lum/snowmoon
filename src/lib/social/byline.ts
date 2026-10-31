import 'server-only';
import { getSocial } from '../auth';
import { isSocialPerson } from '../people';

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
