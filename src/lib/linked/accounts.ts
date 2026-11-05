import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, IMAGES, LINKED_ACCOUNTS, SOCIAL_SIGN_IN } from '../config';
import { isFarcasterPerson, isSocialPerson, isWalletPerson, socialAccountOf } from '../people';
import { anyCurrentPass, type Account } from '../checks/decisions';
import { neynarRule } from '../images/neynar';
import { lensRule } from '../social/lens-check';
import { socialAccount } from '../social/accounts';

/**
 * One person, many linked accounts (owner, 2026-11-04 and 2026-11-05; docs/proposals/linked-accounts.md; migration
 * NEXT_linked_accounts). DRAFT, behind LINKED_ACCOUNTS.enabled (off). Drafted by a coding agent (Claude, a closed model
 * by Anthropic).
 *
 * An account is named by its person number, as everywhere (src/lib/people.ts): a FID, minus a wallet account, or
 * minus (10⁹ + a Lens or Bluesky account). studio.person_accounts says which person each account belongs to now, and
 * when it joined and left. A person's id is private: never shown, never in a URL or a public record.
 *
 * Who a sign-in acts as (actingNumber): the person's first account in this order: Farcaster, Lens, Bluesky; a
 * wallet-only person acts as the wallet signed in. So every route keeps writing one number, as today, and the
 * existing rows need no rewrite. Counts then follow the person (countScope): rows with the person's id, and rows of any
 * account the person has now.
 *
 * The abuse rules (proposal section 8), each refused here with its own reason, tested by test:linked-accounts:
 * - A1 one person per account at a time (also the unique index);
 * - A2 the 30-day wait: an account that left a person joins a different one only after LINKED_ACCOUNTS.relinkWaitDays;
 *   until then the person it is in gets no free counts and passes no check (blockedByWait); rejoining the person it
 *   left is allowed at any time and ends the wait;
 * - A3 caps follow the person's rows and the account's (countScope);
 * - A4 a check follows the account: in one challenge, an account that passed for one person never passes for another
 *   (challengePass); and two people never merge: only an account that is alone can join (link);
 * - A5 at most LINKED_ACCOUNTS.maxMoves moves in movesWindowDays (2 in 365; rejoining the person it left isn't a move);
 * - A6 one Farcaster, one Lens, one Bluesky account and up to 3 wallets per person (also the index and trigger);
 * - A7 an account with a submission or an eligible version in a challenge not yet paid out can't leave its person;
 * - A8 the project's pay-to address never links; at most LINKED_ACCOUNTS.linkAttemptsPerDay link attempts a day.
 * No manual merges (owner, 2026-11-04). Nothing here calls a network.
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

/** The person this account belongs to, made ('first') if it has none yet. */
export async function personOf(sql: Sql, account: number, kind?: Kind): Promise<Person> {
  const now = await readPersonOf(sql, account);
  if (now) return now;
  const k = kind ?? (await kindOf(sql, account));
  if (!k) throw new Error('unknown account');
  try {
    return await sql.begin(async (tx) => {
      const [p] = await tx<{ id: string }[]>`insert into studio.people default values returning id`;
      await tx`insert into studio.person_accounts (person_id, kind, account, how) values (${p.id}, ${k}, ${account}, 'first')`;
      return { personId: Number(p.id), members: [{ kind: k, account }] };
    });
  } catch (e) {
    // Someone else made it first (A1's index): read theirs.
    if ((e as { code?: string }).code === '23505') {
      const again = await readPersonOf(sql, account);
      if (again) return again;
    }
    throw e;
  }
}

/** Who a sign-in acts as: the person's Farcaster, else Lens, else Bluesky account; else the wallet signed in. */
export function actingNumber(members: readonly Member[], signedIn: number): number {
  for (const k of ORDER.slice(0, 3)) {
    const m = members.find((x) => x.kind === k);
    if (m) return m.account;
  }
  return signedIn;
}

/**
 * The number a request acts as (src/lib/auth.ts getPerson, while on): the signed-in account's person's acting number.
 * Never throws: a database that can't answer gives the account itself, which grants nothing it doesn't have alone.
 */
export async function actingFor(sql: Sql | null, signedIn: number): Promise<number> {
  if (!sql || !linkedOn()) return signedIn;
  try {
    const p = await readPersonOf(sql, signedIn);
    return p ? actingNumber(p.members, signedIn) : signedIn;
  } catch (e) {
    console.error('linked accounts: read failed', (e as { code?: string }).code ?? (e as Error).name);
    return signedIn;
  }
}

/**
 * What a daily count covers for this acting number (A3): the person's id (rows written while linked) and every account
 * the person has now (rows from before it joined). Off, or no person: the number alone.
 */
export async function countScope(sql: Sql, number: number): Promise<{ personId: number | null; numbers: number[] }> {
  if (!linkedOn()) return { personId: null, numbers: [number] };
  const p = await readPersonOf(sql, number);
  if (!p) return { personId: null, numbers: [number] };
  return { personId: p.personId, numbers: [...new Set([number, ...p.members.map((m) => m.account)])] };
}

/** The account's history, oldest first. */
async function historyOf(sql: Sql, account: number) {
  const rows = await sql<{ person_id: string; how: string; linked_at: Date; unlinked_at: Date | null }[]>`
    select person_id, how, linked_at, unlinked_at from studio.person_accounts where account = ${account} order by linked_at, id`;
  return rows.map((r) => ({ personId: Number(r.person_id), how: r.how, linkedAt: new Date(r.linked_at), unlinkedAt: r.unlinked_at ? new Date(r.unlinked_at) : null }));
}

/** The person the account last joined by a link (not its own 'first' one), or null. */
const lastLinkedPerson = (h: Awaited<ReturnType<typeof historyOf>>) => [...h].reverse().find((r) => r.how !== 'first')?.personId ?? null;

/**
 * A2: the wait, if this account left a person less than relinkWaitDays ago and isn't back in that person now. Returns
 * the person it left (only it may take the account back early) and when the wait ends. Decided by the database clock.
 */
export async function waitOf(sql: Sql, account: number): Promise<{ left: number; until: Date } | null> {
  const [r] = await sql<{ person_id: string; until: Date; back: boolean }[]>`
    select e.person_id, e.unlinked_at + make_interval(days => ${LINKED_ACCOUNTS.relinkWaitDays}::int) as until,
      exists (select 1 from studio.person_accounts a where a.account = e.account and a.unlinked_at is null and a.person_id = e.person_id) as back
    from studio.person_accounts e
    where e.account = ${account} and e.unlinked_at is not null and e.how <> 'first'
      and e.unlinked_at > now() - make_interval(days => ${LINKED_ACCOUNTS.relinkWaitDays}::int)
    order by e.unlinked_at desc limit 1`;
  if (!r || r.back) return null;
  return { left: Number(r.person_id), until: new Date(r.until) };
}

/** A2, for free counts and checks: when the last wait among this acting number's person's accounts ends, or null. */
export async function personWaitUntil(sql: Sql, number: number): Promise<Date | null> {
  if (!linkedOn()) return null;
  const p = await readPersonOf(sql, number);
  let until: Date | null = null;
  for (const m of p?.members ?? [{ kind: 'farcaster' as Kind, account: number }]) {
    const w = await waitOf(sql, m.account);
    if (w && (!until || w.until > until)) until = w.until;
  }
  return until;
}
export const blockedByWait = async (sql: Sql, number: number) => (await personWaitUntil(sql, number)) !== null;

/** A5: the moves this account made in the window, and whether joining `to` now would be one more. */
export async function movesOf(sql: Sql, account: number, to: number): Promise<{ moves: number; isMove: boolean }> {
  const h = await historyOf(sql, account);
  const since = Date.now() - LINKED_ACCOUNTS.movesWindowDays * 86_400_000;
  let moves = 0;
  let last: number | null = null;
  for (const r of h) {
    if (r.how === 'first') continue;
    if (r.personId !== last && r.linkedAt.getTime() > since) moves++;
    last = r.personId;
  }
  return { moves, isMove: lastLinkedPerson(h) !== to };
}

/**
 * A7: whether this account is held by a challenge: it submitted (challenge_marks) or published an eligible version, or
 * its check made someone's version eligible, in a challenge not yet paid out (LINKED_ACCOUNTS.frozenChallenges).
 */
export async function frozenBy(sql: Sql, account: number): Promise<string | null> {
  const open = LINKED_ACCOUNTS.frozenChallenges;
  if (open.length === 0) return null;
  const [r] = await sql<{ challenge: string }[]>`
    select challenge from studio.challenge_marks where fid = ${account} and challenge in ${sql(open as string[])}
    union all
    select challenge from studio.challenge_eligibility where (fid = ${account} or via_account = ${account}) and eligible and challenge in ${sql(open as string[])}
    limit 1`;
  return r?.challenge ?? null;
}

export type LinkResult =
  | { ok: true; created: boolean; personId: number }
  | { ok: false; why: 'off' | 'same' | 'payment-address' | 'attempts' | 'belongs-to-someone' | 'one-of-kind' | 'wallets' | 'moves' | 'frozen' | 'unknown' }
  | { ok: false; why: 'wait'; until: string };

/**
 * Link `adding` to the person of `current`, with both sign-ins already checked by the caller in one request
 * (src/app/api/linked-accounts). `address` is the adding wallet's address, for A8's pay-to check. `how` is 'signed',
 * or 'verified' for the automatic wallet link. Refused with the rule that stops it; nothing is changed then, except
 * that the attempt is counted (A8).
 */
export async function link(
  sql: Sql,
  current: { account: number; kind?: Kind },
  adding: { account: number; kind?: Kind; address?: string },
  how: 'signed' | 'verified' = 'signed',
): Promise<LinkResult> {
  if (!linkedOn()) return { ok: false, why: 'off' };
  if (current.account === adding.account) return { ok: false, why: 'same' };
  if (adding.address && IMAGES.prepaid.payTo && adding.address.toLowerCase() === IMAGES.prepaid.payTo.toLowerCase()) return { ok: false, why: 'payment-address' };
  const addKind = adding.kind ?? (await kindOf(sql, adding.account));
  if (!addKind || (how === 'verified' && addKind !== 'wallet')) return { ok: false, why: 'unknown' };
  const me = await personOf(sql, current.account, current.kind);
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.linked-accounts'))`;
    // A8: attempts, counted before anything else is decided, so probing costs attempts too.
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from studio.person_link_attempts
      where person_id = ${me.personId} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
    await tx`insert into studio.person_link_attempts (person_id) values (${me.personId})`;
    if (n >= LINKED_ACCOUNTS.linkAttemptsPerDay) return { ok: false as const, why: 'attempts' as const };
    const members = await membersOf(t, me.personId);
    if (members.some((m) => m.account === adding.account)) return { ok: true as const, created: false, personId: me.personId };
    // A4: two people never merge. The account joining must be alone (or have no person yet).
    const theirs = await readPersonOf(t, adding.account);
    if (theirs && theirs.members.length > 1) return { ok: false as const, why: 'belongs-to-someone' as const };
    // A7: an account a challenge holds stays where it is.
    if (await frozenBy(t, adding.account)) return { ok: false as const, why: 'frozen' as const };
    // A6.
    if (addKind === 'wallet' ? members.filter((m) => m.kind === 'wallet').length >= LINKED_ACCOUNTS.maxWallets : members.some((m) => m.kind === addKind)) {
      return { ok: false as const, why: addKind === 'wallet' ? ('wallets' as const) : ('one-of-kind' as const) };
    }
    // A2: the 30-day wait, unless it is coming back to the person it left.
    const wait = await waitOf(t, adding.account);
    if (wait && wait.left !== me.personId) return { ok: false as const, why: 'wait' as const, until: wait.until.toISOString() };
    // A5.
    const mv = await movesOf(t, adding.account, me.personId);
    if (mv.isMove && mv.moves >= LINKED_ACCOUNTS.maxMoves) return { ok: false as const, why: 'moves' as const };
    if (theirs) await tx`update studio.person_accounts set unlinked_at = now(), ended_by = 'person' where account = ${adding.account} and unlinked_at is null`;
    await tx`insert into studio.person_accounts (person_id, kind, account, how) values (${me.personId}, ${addKind}, ${adding.account}, ${how})`;
    return { ok: true as const, created: true, personId: me.personId };
  });
}

export type UnlinkResult = { ok: true } | { ok: false; why: 'off' | 'none' | 'last' | 'frozen' };

/**
 * Unlink one of the person's accounts (by any of the person's sign-ins; the account itself needn't sign in, so a lost
 * wallet can be removed). The account becomes a person of its own again; its wait (A2) starts. Never the last one.
 */
export async function unlink(sql: Sql, signedIn: number, account: number, endedBy: 'person' | 'unverified' = 'person'): Promise<UnlinkResult> {
  if (!linkedOn()) return { ok: false, why: 'off' };
  const me = await readPersonOf(sql, signedIn);
  if (!me || !me.members.some((m) => m.account === account)) return { ok: false, why: 'none' };
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.linked-accounts'))`;
    const members = await membersOf(t, me.personId);
    const m = members.find((x) => x.account === account);
    if (!m) return { ok: false as const, why: 'none' as const };
    if (members.length === 1) return { ok: false as const, why: 'last' as const };
    if (await frozenBy(t, account)) return { ok: false as const, why: 'frozen' as const };
    await tx`update studio.person_accounts set unlinked_at = now(), ended_by = ${endedBy} where account = ${account} and unlinked_at is null`;
    const [p] = await tx<{ id: string }[]>`insert into studio.people default values returning id`;
    await tx`insert into studio.person_accounts (person_id, kind, account, how) values (${p.id}, ${m.kind}, ${account}, 'first')`;
    return { ok: true as const };
  });
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
 * "A person passes if any linked account does" (owner, 2026-11-04), for free counts at Generate: true if any of the
 * person's accounts has a current stored pass (anyCurrentPass; no lookup here), or is invited; false while any of
 * them is in its 30-day wait (A2). Off: false (the gate decides as before).
 */
export async function personPasses(sql: Sql, number: number): Promise<boolean> {
  if (!linkedOn()) return false;
  const p = await readPersonOf(sql, number);
  if (!p) return false;
  if (await blockedByWait(sql, number)) return false;
  // Admins and invited FIDs pass at the gate already: a person with a Farcaster account always acts as it.
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
  if (!p || (await blockedByWait(sql, number))) return { ...none, personId: p?.personId ?? null };
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

/**
 * Free counts for this acting number, as linking changes them (for the gate and the count): 'none' while any of the
 * person's accounts is in its 30-day wait (A2); 'free' if a linked account passes (personPasses); null when linking is
 * off or decides nothing, so the caller's own rule stands.
 */
export async function linkedFree(sql: Sql, number: number): Promise<'free' | 'none' | null> {
  if (!linkedOn()) return null;
  try {
    if (await blockedByWait(sql, number)) return 'none';
    return (await personPasses(sql, number)) ? 'free' : null;
  } catch (e) {
    console.error('linked accounts: free check failed', (e as { code?: string }).code ?? (e as Error).name);
    return 'none';
  }
}

const TODAY_START = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;

/** Today's count for a person (A3): every row with the person's id, or made by an account the person has now. */
export async function countToday(sql: Sql, table: 'image_asks' | 'remix_asks', number: number): Promise<number> {
  const s = await countScope(sql, number);
  const [r] =
    table === 'image_asks'
      ? await sql<{ n: number }[]>`select count(*)::int as n from studio.image_asks where (fid in ${sql(s.numbers)} or person_id = ${s.personId}) and at >= ${sql.unsafe(TODAY_START)}`
      : await sql<{ n: number }[]>`select count(*)::int as n from studio.remix_asks where (person in ${sql(s.numbers)} or person_id = ${s.personId}) and at >= ${sql.unsafe(TODAY_START)}`;
  return r?.n ?? 0;
}

/** Counts one Generate for this acting number, with the person's id while linking is on. */
export async function countOne(sql: Sql, table: 'image_asks' | 'remix_asks', number: number): Promise<void> {
  const personId = linkedOn() ? (await readPersonOf(sql, number))?.personId ?? null : null;
  if (table === 'image_asks') {
    if (personId === null) await sql`insert into studio.image_asks (fid) values (${number})`;
    else await sql`insert into studio.image_asks (fid, person_id) values (${number}, ${personId})`;
  } else if (personId === null) await sql`insert into studio.remix_asks (person) values (${number})`;
  else await sql`insert into studio.remix_asks (person, person_id) values (${number}, ${personId})`;
}
