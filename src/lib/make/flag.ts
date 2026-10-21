/**
 * "Make your own", story flow v1 (owner's long run 2, item 5, 2026-10-19): idea → talk it through → beats → a
 * text storyboard, saved as a private draft adaptation. The assistant asks and gives notes; it never writes.
 *
 * MAKE_YOUR_OWN is the flag. It is OFF until the owner's reread of the drafted Privacy line
 * (docs/legal/make-your-own-draft.md) and the draft migration (supabase/drafts/0017_adaptation_drafts.sql) being
 * applied. It is not an environment variable; turning it on is a reviewed commit. Off, the /make-your-own page and every
 * /api/make route answers 404.
 *
 * MAKE_TEST_ON=1 turns it on for the local tests only: never on Vercel.
 */
export const MAKE_YOUR_OWN = false;

export const makeOn = () => MAKE_YOUR_OWN || (!process.env.VERCEL && process.env.MAKE_TEST_ON === '1');

/**
 * The local screenshot test's sign-in (a Farcaster or wallet sign-in can't be made offline): with MAKE_TEST_ON=1 and
 * MAKE_TEST_FID set, never on Vercel, the bearer token "make-test-<person>" counts as that person on the /api/make
 * routes only (a FID, or minus a wallet account's number, as getPerson gives it). Everywhere else, and always on
 * Vercel, only a real Quick Auth token or wallet session counts.
 */
export function testPerson(request: Request): number | null {
  if (process.env.VERCEL || process.env.MAKE_TEST_ON !== '1' || !process.env.MAKE_TEST_FID) return null;
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+make-test-(-?[1-9]\d*)$/i);
  return m && process.env.MAKE_TEST_FID.split(',').includes(m[1]) ? Number(m[1]) : null;
}
