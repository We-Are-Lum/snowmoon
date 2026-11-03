import 'server-only';
import type postgres from 'postgres';
import { CHECKS } from '../config';
import { isSocialPerson, socialAccountOf } from '../people';
import { socialAccount } from '../social/accounts';

/**
 * Stored decisions for sign-in checks (owner, 2026-11-04: "look each account up as rarely as possible"; "store the
 * decision, not the score"). One store for every network: the Neynar score (wired today, src/lib/images/neynar.ts),
 * the Lens score (branch signin-lens-bluesky) and the Bluesky check (branch bluesky-check).
 *
 * What is kept, in studio.check_decisions (migration NEXT_check_decisions): the network, the account (a FID in digits,
 * a Lens address, a DID), the rule it was checked against (`threshold`, text: 'neynar-score>=0.7',
 * 'lens-score>=1000', 'made-before-2026-11-06+5posts30d'), whether it passed, and when. Never a score, an age, a count.
 *
 * - A pass is current for CHECKS.passDays (90) days; a fail for CHECKS.failHours (24) hours. While a decision is current
 *   the check is not asked again: currentDecision() returns it. null means: look the account up, then decide().
 * - A decision made under another rule than the caller's is not current (the threshold changed): null, look up again.
 * - markForRecheck() withdraws an account's passes at once (a report, or one of its pictures hidden), so its next
 *   Generate or publish asks again. A fail is never cut short: it already refuses.
 * - Linked accounts (later): a person passes while any of their linked accounts has a current pass (anyCurrentPass).
 *
 * Nothing here calls a network. Every function tolerates the table missing (a database without the migration): reads
 * say "no decision", writes do nothing, and each logs only an error code.
 */
type Sql = postgres.Sql;

export type Network = 'farcaster' | 'lens' | 'bluesky';
export const NETWORKS: readonly Network[] = ['farcaster', 'lens', 'bluesky'];

export type Decision = { passed: boolean; decidedAt: Date; threshold: string };

/** One account to ask about: its network, its id there, and the rule today's check uses for that network. */
export type Account = { network: Network; account: string; threshold: string };

/** The account id as stored: a FID in digits; a Lens address in lowercase; a DID as given. null if it doesn't fit. */
export function accountKey(network: Network, raw: string | number): string | null {
  const s = String(raw).trim();
  if (network === 'farcaster') return /^[1-9][0-9]{0,18}$/.test(s) ? s : null;
  if (network === 'lens') return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : null;
  return s.length <= 2048 && /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(s) ? s : null;
}

/** A rule's text, as stored. Lowercase letters, digits and . : + < > = _ -, at most 200 characters. */
export function validThreshold(t: string): boolean {
  return /^[a-z0-9][a-z0-9.:+<>=_-]{0,199}$/.test(t);
}

/** When a decision stops being current (and the account may be asked again). */
export function recheckAt(d: Pick<Decision, 'passed' | 'decidedAt'>): Date {
  const ms = d.passed ? CHECKS.passDays * 86_400_000 : CHECKS.failHours * 3_600_000;
  return new Date(d.decidedAt.getTime() + ms);
}

const PASS = () => `make_interval(days => ${Math.floor(Number(CHECKS.passDays))})`;
const FAIL = () => `make_interval(hours => ${Math.floor(Number(CHECKS.failHours))})`;
const logged = (what: string, e: unknown) => console.error(`checks: ${what}`, (e as { code?: string }).code ?? (e as Error).name);

/** Deletes every decision that is no longer current (cheap, on the decided_at index). */
export async function forgetExpired(sql: Sql): Promise<void> {
  await sql`delete from studio.check_decisions where decided_at <= now() - case when passed then ${sql.unsafe(PASS())} else ${sql.unsafe(FAIL())} end`;
}

/**
 * The current decision for this account under this rule, or null (none, expired, withdrawn, or decided under another
 * rule): then the caller looks the account up and calls decide(). Never calls a network.
 * Throws only if the database can't be read; callers treat that as "can't check right now".
 */
export async function currentDecision(sql: Sql, network: Network, account: string, threshold: string): Promise<Decision | null> {
  const key = accountKey(network, account);
  if (key === null) return null;
  await forgetExpired(sql);
  const [row] = await sql<{ passed: boolean; decided_at: Date; threshold: string }[]>`
    select passed, decided_at, threshold from studio.check_decisions
    where network = ${network} and account = ${key} and threshold = ${threshold}
      and decided_at > now() - case when passed then ${sql.unsafe(PASS())} else ${sql.unsafe(FAIL())} end`;
  return row ? { passed: row.passed, decidedAt: new Date(row.decided_at), threshold: row.threshold } : null;
}

/**
 * Stores a decision just made from a lookup: passed or not, under `threshold`, now. Replaces an earlier one under the
 * same rule. Never throws: false if it couldn't be stored (the next check will simply ask again).
 */
export async function decide(sql: Sql, network: Network, account: string, passed: boolean, threshold: string): Promise<boolean> {
  const key = accountKey(network, account);
  if (key === null || !validThreshold(threshold)) return false;
  try {
    await sql`insert into studio.check_decisions ${sql({ network, account: key, threshold, passed })}
      on conflict (network, account, threshold) do update set passed = excluded.passed, decided_at = now()`;
    return true;
  } catch (e) {
    logged('decision not stored', e);
    return false;
  }
}

/**
 * Withdraws the account's passes (under every rule), so its next Generate or publish looks it up again: called when the
 * account is reported, or one of its pictures is hidden. A current fail stays. Never throws.
 */
export async function markForRecheck(sql: Sql, network: Network, account: string | number): Promise<void> {
  const key = accountKey(network, String(account));
  if (key === null) return;
  try {
    await sql`delete from studio.check_decisions where network = ${network} and account = ${key} and passed`;
  } catch (e) {
    logged('recheck not marked', e);
  }
}

/**
 * Linked accounts (the hook for later; owner, 2026-11-04): a person passes while ANY of their linked accounts has a
 * current pass under its network's rule. Pass every account linked to the person (a FID, a Lens address, a DID), each
 * with today's rule for its network. No lookup happens here; an account with no current decision is just not a pass.
 * Today nothing links accounts across networks, so callers pass one account.
 */
export async function anyCurrentPass(sql: Sql, accounts: readonly Account[]): Promise<boolean> {
  for (const a of accounts) {
    const d = await currentDecision(sql, a.network, a.account, a.threshold);
    if (d?.passed) return true;
  }
  return false;
}

/**
 * The report and hide paths call this with the picture's maker (a FID, or minus a wallet account). A FID's Farcaster
 * pass is withdrawn. Linked accounts (later): withdraw the passes of every account linked to the maker here too (the
 * Lens and Bluesky branches add their networks' accounts). A wallet maker has no check of its own today. Never throws.
 */
export async function recheckMaker(sql: Sql, maker: number): Promise<void> {
  if (maker > 0) await markForRecheck(sql, 'farcaster', maker);
  // A Lens account's own maker number (signin-lens-bluesky): its Lens pass is withdrawn too (owner, 2026-11-04).
  if (isSocialPerson(maker)) {
    const row = await socialAccount(sql, socialAccountOf(maker)).catch(() => null);
    if (row?.kind === 'lens') await markForRecheck(sql, 'lens', row.subject);
  }
}
