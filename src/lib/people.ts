/**
 * What a person number is (shared by the server and the pages; nothing here reads a secret):
 * - above zero: a Farcaster ID;
 * - from -1 down to -(SOCIAL_PERSON_BASE - 1): minus a wallet account's number (studio.wallet_accounts.id);
 * - from -SOCIAL_PERSON_BASE down: minus (SOCIAL_PERSON_BASE + a Lens or Bluesky account's number,
 *   studio.social_accounts.id; branch signin-lens-bluesky).
 * The person columns are bigint, and the image counters take an advisory lock on the number as a 32-bit int, so the
 * base sits inside that range: a billion wallet accounts before the two could meet.
 *
 * Money follows the wallet: only a wallet account has a prepaid balance. A Lens or Bluesky account never pays from
 * one (it can sign in with a wallet to pay), and gets free generations only as decided in src/lib/social/free.ts.
 */
export const SOCIAL_PERSON_BASE = 1_000_000_000;

export const isFarcasterPerson = (person: number) => person > 0;
export const isWalletPerson = (person: number) => person < 0 && person > -SOCIAL_PERSON_BASE;
export const isSocialPerson = (person: number) => person <= -SOCIAL_PERSON_BASE;

/** The person number of a Lens or Bluesky account. */
export function socialPerson(accountId: number): number {
  if (!Number.isInteger(accountId) || accountId <= 0 || accountId > 1_000_000_000) throw new Error('bad social account id');
  return -(SOCIAL_PERSON_BASE + accountId);
}
/** The studio.social_accounts.id behind a social person number. */
export const socialAccountOf = (person: number) => -person - SOCIAL_PERSON_BASE;
/** The studio.wallet_accounts.id behind a wallet person number. */
export const walletAccountOf = (person: number) => -person;
