import 'server-only';
import { getFid, getPerson, getSocial, getWallet } from '../auth';
import { SIGN_IN_METHODS, SOCIAL_SIGN_IN } from '../config';

/**
 * Who may make and publish a sheet's views (/api/designs/sample, /api/designs): a Farcaster sign-in, as before, and,
 * once Bluesky sign-in and the Bluesky check are both on (owner, 2026-11-04: the Bluesky check counts the same as
 * Neynar's for remixing and submitting), a Bluesky sign-in: its linked Farcaster ID if it has one, else the Bluesky
 * account itself (src/lib/people.ts). The routes still allow such an account only a challenge character's fork or
 * version while the challenge opens them, and the Generate gate still decides (the Bluesky check, src/lib/social/free.ts).
 * Wallet and Lens sign-ins can't make sheets yet. Both switches are off: nothing changes until the owner's reread.
 */
export const blueskyMakesSheets = () => Boolean(SIGN_IN_METHODS.find((m) => m.id === 'bluesky')?.on) && SOCIAL_SIGN_IN.bluesky.check.on;

/** The answer when no one who may make sheets is signed in: 403 for a wallet or other sign-in (a 401 would sign it out). */
export const notSignedInStatus = (request: Request) => (getWallet(request) || getSocial(request) ? 403 : 401);

export async function designPerson(request: Request): Promise<number | null> {
  const fid = await getFid(request);
  if (fid !== null) return fid;
  if (!blueskyMakesSheets()) return null;
  const s = getSocial(request);
  if (!s || s.kind !== 'bluesky') return null;
  return getPerson(request);
}
