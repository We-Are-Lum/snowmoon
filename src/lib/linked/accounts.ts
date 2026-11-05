import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, IMAGES, LINKED_ACCOUNTS, SOCIAL_SIGN_IN } from '../config';
import { isFarcasterPerson, isSocialPerson, isWalletPerson, socialAccountOf } from '../people';
import { anyCurrentPass, type Account } from '../checks/decisions';
import { neynarRule } from '../images/neynar';
import { lensRule } from '../social/lens-check';
import { socialAccount } from '../social/accounts';

/**
 * Linked accounts: the READ side, on v2's model (owner, 2026-11-05; docs/proposals/linked-accounts-v2.md; migration
 * NEXT_linked_accounts). DRAFT, behind LINKED_ACCOUNTS.enabled (off). Drafted by a coding agent (Claude, a closed model
 * by Anthropic).
 *
 * The Snowmoon account (studio.people, "person" here) owns its rows; each row keeps the number of the sign-in that
 * made it and its owner stamp (person_id). Every change to sign-ins (link, unlink, main, recovery, join) is in
 * src/lib/linked/v2.ts. v1's linking (link, unlink, the acting number, the A2 count block, A5 here, the A7 freeze) is
 * retired (owner, 2026-11-05); v1's tables and backfill stay.
 *
 * Here: which Snowmoon account a sign-in is in, the counts per account (rows it owns, plus a sign-in's own rows not
 * stamped yet), whether it passes (a linked social account's own current pass; no lookup here), the challenge's pass
 * with A4, and bylines (the chosen name). Nothing here calls a network.
 */
type Sql = postgres.Sql;

export type Kind = 'farcaster' | 'wallet' | 'lens' | 'bluesky';
export type Member = { kind: Kind; account: number };
export type Person = { personId: number; members: Member[] };

export const linkedOn = () => LINKED_ACCOUNTS.enabled;

/** The Bluesky check's rule as stored (branch bluesky-check; src/lib/checks/decisions.ts). */
export const BLUESKY_RULE = 'made-before-2026-11-06+5posts30d';
const ORDER: Kind[] = ['farcaster', 'lens', 'bluesky', 'wallet'];
const NETWORK_KINDS: Kind[] = ['farcaster', 'lens', 'bluesky'];

/** The kind of an account, from its number (and, for Lens or Bluesky, its row). Null if it can't be told. */
export async function kindOf(sql: Sql, account: number): Promise<Kind | null> {
  if (isFarcasterPerson(account)) return 'farcaster';
  if (isWalletPerson(account)) return 'wallet';
  if (!isSocialPerson(account)) return null;
  const row = await socialAccount(sql, socialAccountOf(account));
  return row?.kind ?? null;
}

async function membersOf(sql: Sql, personId: number): Promise<Member[]> {
  const rows = await sql<{ kind: Kind; account: string }[]>`select kind, account from studio.person_accounts where person_id = ${personId} and unlinked_at is null order by linked_at, id`;
  return rows.map((r) => ({ kind: r.kind, account: Number(r.account) }));
}

/** The person this account belongs to now, or null (no row yet: it is alone). */
export async function readPersonOf(sql: Sql, account: number): Promise<Person | null> {
  const [r] = await sql<{ p: string }[]>`select person_id as p from studio.person_accounts where account = ${account} and unlinked_at is null`;
  if (!r) return null;
  const personId = Number(r.p);
  return { personId, members: await membersOf(sql, personId) };
}

/**
 * What a daily count covers for this sign-in: the rows its Snowmoon account owns (stamped, through joins), and its own
 * rows not stamped yet. Off, or no Snowmoon account: the number alone, as today.
 */
export async function countScope(sql: Sql, number: number): Promise<{ personId: number | null; numbers: number[] }> {
  if (!linkedOn()) return { personId: null, numbers: [number] };
  const p = await readPersonOf(sql, number);
  return { personId: p?.personId ?? null, numbers: [number] };
}

/** The accounts the checks look at for this person, in the fixed order, as check_decisions names them. */
export async function checkAccounts(sql: Sql, members: readonly Member[], neynarMin: number = IMAGES.neynarMinScore): Promise<(Account & { number: number })[]> {
  const out: (Account & { number: number })[] = [];
  for (const k of NETWORK_KINDS) {
    const m = members.find((x) => x.kind === k);
    if (!m) continue;
    if (k === 'farcaster') out.push({ network: 'farcaster', account: String(m.account), threshold: neynarRule(neynarMin), number: m.account });
    else {
      const row = await socialAccount(sql, socialAccountOf(m.account));
      if (!row) continue;
      if (k === 'lens' && SOCIAL_SIGN_IN.lens.minScore !== null) out.push({ network: 'lens', account: row.subject, threshold: lensRule(SOCIAL_SIGN_IN.lens.minScore), number: m.account });
      if (k === 'bluesky') out.push({ network: 'bluesky', account: row.subject, threshold: BLUESKY_RULE, number: m.account });
    }
  }
  return out;
}

/**
 * The Snowmoon account passes while a linked social account has a current stored pass (anyCurrentPass; no lookup
 * here), or a linked Farcaster ID is invited. Off: false (the gate decides as before).
 */
export async function personPasses(sql: Sql, number: number): Promise<boolean> {
  if (!linkedOn()) return false;
  const p = await readPersonOf(sql, number);
  if (!p) return false;
  if (p.members.some((m) => m.kind === 'farcaster' && IMAGES.invited.includes(m.account))) return true;
  return anyCurrentPass(sql, await checkAccounts(sql, p.members));
}

/**
 * The challenge's check for a person (proposal section 7, A4): the first account, in order, with a current pass, unless
 * that account already made a different person's version eligible in this challenge. Returns which account passed.
 */
export async function challengePass(sql: Sql, number: number, challenge: string = CHALLENGE.id, neynarMin: number = CHALLENGE.neynarMinScore): Promise<{ passed: boolean; personId: number | null; via: Account['network'] | null; viaAccount: number | null }> {
  const none = { passed: false, personId: null, via: null, viaAccount: null };
  if (!linkedOn()) return none;
  const p = await readPersonOf(sql, number);
  if (!p) return none;
  for (const a of await checkAccounts(sql, p.members, neynarMin)) {
    if (!(await anyCurrentPass(sql, [a]))) continue;
    const [other] = await sql`select 1 from studio.challenge_eligibility where challenge = ${challenge} and eligible and via_account = ${a.number} and person_id is distinct from ${p.personId} limit 1`;
    if (other) continue; // A4: this account already passed for someone else in this challenge.
    return { passed: true, personId: p.personId, via: a.network, viaAccount: a.number };
  }
  return { ...none, personId: p.personId };
}

/** The networks this person hasn't linked yet, in the fixed order (for "Link another account"). */
export function missingNetworks(members: readonly Member[]): ('farcaster' | 'lens' | 'bluesky')[] {
  return (['farcaster', 'lens', 'bluesky'] as const).filter((k) => !members.some((m) => m.kind === k));
}

/**
 * The public id of the account a version was submitted with, for the challenge record (owner, 2026-11-04): a FID in
 * digits, a Lens account's address, or a Bluesky account's DID. Never the person id. Null for a wallet (never an entry).
 */
export async function publicIdOf(sql: Sql, account: number): Promise<string | null> {
  if (isFarcasterPerson(account)) return String(account);
  if (!isSocialPerson(account)) return null;
  return (await socialAccount(sql, socialAccountOf(account)))?.subject ?? null;
}

/** Free counts as linking changes them: 'free' if the Snowmoon account passes; null when off or undecided. */
export async function linkedFree(sql: Sql, number: number): Promise<'free' | 'none' | null> {
  if (!linkedOn()) return null;
  try {
    return (await personPasses(sql, number)) ? 'free' : null;
  } catch (e) {
    console.error('linked accounts: free check failed', (e as { code?: string }).code ?? (e as Error).name);
    return 'none';
  }
}

const TODAY_START = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;

/** Today's count for a sign-in's Snowmoon account: the rows it owns, and this sign-in's own rows not stamped yet. */
export async function countToday(sql: Sql, table: 'image_asks' | 'remix_asks', number: number): Promise<number> {
  const s = await countScope(sql, number);
  const [r] =
    table === 'image_asks'
      ? await sql<{ n: number }[]>`select count(*)::int as n from studio.image_asks where ((fid = ${number} and person_id is null) or studio.owner_of(person_id) = ${s.personId}) and at >= ${sql.unsafe(TODAY_START)}`
      : await sql<{ n: number }[]>`select count(*)::int as n from studio.remix_asks where ((person = ${number} and person_id is null) or studio.owner_of(person_id) = ${s.personId}) and at >= ${sql.unsafe(TODAY_START)}`;
  return r?.n ?? 0;
}

/** Counts one Generate under the sign-in's own number; the owner stamp is its Snowmoon account (the trigger fills it). */
export async function countOne(sql: Sql, table: 'image_asks' | 'remix_asks', number: number): Promise<void> {
  if (table === 'image_asks') await sql`insert into studio.image_asks (fid) values (${number})`;
  else await sql`insert into studio.remix_asks (person) values (${number})`;
}

/**
 * Bylines: the sign-in a maker's work is shown under: its Snowmoon account's chosen name (studio.person_names, the
 * latest). Off, or no Snowmoon account: the maker itself. (Work whose maker has since left is shown under the owner's
 * name once bylines read the row's owner stamp: build step 5, not yet.)
 */
export async function displayAccountOf(sql: Sql, maker: number): Promise<number> {
  if (!linkedOn()) return maker;
  const p = await readPersonOf(sql, maker);
  if (!p) return maker;
  const [r] = await sql<{ account: string }[]>`select account from studio.person_names where person_id = ${p.personId} order by at desc, id desc limit 1`;
  return r && p.members.some((m) => m.account === Number(r.account)) ? Number(r.account) : maker;
}

/** The other accounts whose work is shown under `account` (it must be its person's display account), or []. */
export async function shownUnder(sql: Sql, account: number): Promise<number[]> {
  if (!linkedOn()) return [];
  const p = await readPersonOf(sql, account);
  if (!p || (await displayAccountOf(sql, account)) !== account) return [];
  return p.members.map((m) => m.account).filter((a) => a !== account);
}

/** A Lens or Bluesky account's byline name: its Lens username or Bluesky handle as checked at sign-in, or null. */
export async function displayNameOf(sql: Sql, account: number): Promise<string | null> {
  if (!isSocialPerson(account)) return null;
  return (await socialAccount(sql, socialAccountOf(account)))?.handle ?? null;
}
