import 'server-only';
import type postgres from 'postgres';
import { SOCIAL_SIGN_IN } from '../config';
import { socialPerson } from '../people';
import { subjectOk, type SocialKind, type SocialSession } from './session';

/**
 * Lens and Bluesky accounts and their links (migration NEXT_signin_lens_bluesky.sql; branch signin-lens-bluesky).
 *
 * studio.social_accounts: one row per Lens account (its address) or Bluesky account (its DID), with the handle seen at
 * the last sign-in. Made at the first sign-in, after the proof was checked.
 * studio.social_links: a Lens or Bluesky account linked to a Farcaster ID, or a Bluesky account linked to a Lens
 * account, made only with both sign-ins in one request (src/app/api/social-link). Ending a link sets unlinked_at and
 * ended_by 'person'. At most one active link per account.
 *
 * Who a Lens or Bluesky sign-in is (getPerson): the linked Farcaster ID; for Bluesky linked to Lens, whoever that Lens
 * account is (its Farcaster ID if it has one, else the Lens account); otherwise the account itself (src/lib/people.ts).
 */
type Sql = postgres.Sql;

const missing = (e: unknown) => (e as { code?: string }).code === '42P01';

/** The account for this Lens address or Bluesky DID, made on first sign-in; the handle is refreshed each time. */
export async function socialAccountFor(sql: Sql, kind: SocialKind, subject: string, handle: string | null): Promise<number> {
  if (!subjectOk(kind, subject)) throw new Error('bad subject');
  const h = handle && handle.length <= 253 ? handle : null;
  const [r] = await sql`insert into studio.social_accounts (kind, subject, handle) values (${kind}, ${subject}, ${h})
    on conflict (kind, subject) do update set handle = excluded.handle, last_sign_in_at = now()
    returning id::int as id`;
  return r.id;
}

export interface SocialAccountRow {
  id: number;
  kind: SocialKind;
  subject: string;
  handle: string | null;
}

export async function socialAccount(sql: Sql, id: number): Promise<SocialAccountRow | null> {
  try {
    const [r] = await sql`select id::int as id, kind, subject, handle from studio.social_accounts where id = ${id}`;
    return (r as SocialAccountRow | undefined) ?? null;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export type SocialLinkTarget = { fid: number } | { lensAccount: number };
export interface ActiveSocialLink {
  id: number;
  target: SocialLinkTarget;
  linkedAt: string;
}

/** The account's active link, or null (also while the table isn't there). */
export async function activeSocialLink(sql: Sql, account: number): Promise<ActiveSocialLink | null> {
  try {
    const [r] = await sql`select id::int as id, fid::int as fid, lens_account_id::int as lens, linked_at from studio.social_links
      where account_id = ${account} and unlinked_at is null`;
    if (!r) return null;
    return { id: r.id, target: r.fid ? { fid: r.fid } : { lensAccount: r.lens }, linkedAt: new Date(r.linked_at).toISOString() };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/**
 * The person a Lens or Bluesky sign-in acts as (see the top of this file). Never throws: a database that can't answer
 * gives the account itself, which has no free generations and no balance, so nothing is granted by an error.
 */
export async function personForSocial(sql: Sql | null, s: Pick<SocialSession, 'account' | 'kind'>): Promise<number> {
  const own = socialPerson(s.account);
  if (!sql) return own;
  try {
    const l = await activeSocialLink(sql, s.account);
    if (!l) return own;
    if ('fid' in l.target) return l.target.fid;
    // Bluesky linked to a Lens account: that account's own link, one step only.
    if (s.kind !== 'bluesky') return own;
    const lens = l.target.lensAccount;
    const ll = await activeSocialLink(sql, lens);
    return ll && 'fid' in ll.target ? ll.target.fid : socialPerson(lens);
  } catch (e) {
    console.error('social links: read failed', (e as { code?: string }).code ?? (e as Error).name);
    return own;
  }
}

export type SocialLinkResult =
  | { ok: true; created: boolean }
  | { ok: false; why: 'not-yet' | 'linked-elsewhere' | 'lens-to-lens' | 'bad-target' }
  /** The 30-day wait (owner, 2026-11-04): unlinked on `unlinkedAt`, it can be linked to a different account from `until`. */
  | { ok: false; why: 'wait'; unlinkedAt: string; until: string };

const sameTarget = (a: SocialLinkTarget, b: SocialLinkTarget) =>
  'fid' in a && 'fid' in b ? a.fid === b.fid : 'lensAccount' in a && 'lensAccount' in b && a.lensAccount === b.lensAccount;

/**
 * The 30-day wait (owner, 2026-11-04: "An account you unlink can be linked to a different account only after 30
 * days."): the account's latest ended link, if it ended less than SOCIAL_SIGN_IN.relinkWaitDays ago; null otherwise.
 * Linking again to the account it was linked to is allowed at any time. Decided by the database's clock.
 */
export async function relinkWait(sql: Sql, account: number): Promise<{ target: SocialLinkTarget; unlinkedAt: string; until: string } | null> {
  const [r] = await sql`select fid::int as fid, lens_account_id::int as lens, unlinked_at,
      unlinked_at + make_interval(days => ${SOCIAL_SIGN_IN.relinkWaitDays}::int) as until
    from studio.social_links
    where account_id = ${account} and unlinked_at is not null
      and unlinked_at > now() - make_interval(days => ${SOCIAL_SIGN_IN.relinkWaitDays}::int)
    order by unlinked_at desc limit 1`;
  if (!r) return null;
  return { target: r.fid ? { fid: r.fid } : { lensAccount: r.lens }, unlinkedAt: new Date(r.unlinked_at).toISOString(), until: new Date(r.until).toISOString() };
}

/**
 * Link, with both proofs already checked by the caller (src/app/api/social-link): the account's own sign-in, and the
 * Farcaster sign-in (fid) or the Lens sign-in (lensAccount) it is linked to. Only a Bluesky account links to a Lens
 * account. Linking again to the same target changes nothing; a different target needs an unlink first, and then the
 * 30-day wait (relinkWait).
 */
export async function linkSocial(sql: Sql, account: { id: number; kind: SocialKind }, target: SocialLinkTarget): Promise<SocialLinkResult> {
  if ('fid' in target ? !Number.isInteger(target.fid) || target.fid <= 0 : !Number.isInteger(target.lensAccount) || target.lensAccount <= 0) return { ok: false, why: 'bad-target' };
  if ('lensAccount' in target && account.kind !== 'bluesky') return { ok: false, why: 'lens-to-lens' };
  try {
    const now = await activeSocialLink(sql, account.id);
    if (now) return sameTarget(now.target, target) ? { ok: true, created: false } : { ok: false, why: 'linked-elsewhere' };
    const wait = await relinkWait(sql, account.id);
    if (wait && !sameTarget(wait.target, target)) return { ok: false, why: 'wait', unlinkedAt: wait.unlinkedAt, until: wait.until };
    if ('fid' in target) await sql`insert into studio.social_links (account_id, fid) values (${account.id}, ${target.fid})`;
    else {
      const [lens] = await sql`select kind from studio.social_accounts where id = ${target.lensAccount}`;
      if (lens?.kind !== 'lens') return { ok: false, why: 'bad-target' };
      await sql`insert into studio.social_links (account_id, lens_account_id) values (${account.id}, ${target.lensAccount})`;
    }
    return { ok: true, created: true };
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { ok: false, why: 'linked-elsewhere' };
    if (missing(e)) return { ok: false, why: 'not-yet' };
    throw e;
  }
}

/**
 * The accounts linked to this Farcaster ID, or (Bluesky) to this Lens account: for the You page, each with Unlink.
 * Empty while the table isn't there.
 */
export async function linkedToMe(sql: Sql, me: SocialLinkTarget): Promise<{ account: number; kind: SocialKind; handle: string | null; linkedAt: string }[]> {
  try {
    const rows = 'fid' in me
      ? await sql`select a.id::int as account, a.kind, a.handle, l.linked_at from studio.social_links l join studio.social_accounts a on a.id = l.account_id
          where l.fid = ${me.fid} and l.unlinked_at is null order by l.linked_at`
      : await sql`select a.id::int as account, a.kind, a.handle, l.linked_at from studio.social_links l join studio.social_accounts a on a.id = l.account_id
          where l.lens_account_id = ${me.lensAccount} and l.unlinked_at is null order by l.linked_at`;
    return rows.map((r) => ({ account: r.account, kind: r.kind as SocialKind, handle: r.handle ?? null, linkedAt: new Date(r.linked_at).toISOString() }));
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
}

/**
 * Unlink, by the person on the other side: the Farcaster ID (or Lens account) the account is linked to may end the
 * link without the account's own sign-in (so a lost Lens wallet or Bluesky login can still be removed). Only a link to
 * `me` ends; any other account's link is left alone.
 */
export async function unlinkFrom(sql: Sql, me: SocialLinkTarget, account: number): Promise<'done' | 'none' | 'not-yet'> {
  try {
    const rows = 'fid' in me
      ? await sql`update studio.social_links set unlinked_at = now(), ended_by = 'person' where account_id = ${account} and fid = ${me.fid} and unlinked_at is null returning id`
      : await sql`update studio.social_links set unlinked_at = now(), ended_by = 'person' where account_id = ${account} and lens_account_id = ${me.lensAccount} and unlinked_at is null returning id`;
    return rows.length > 0 ? 'done' : 'none';
  } catch (e) {
    if (missing(e)) return 'not-yet';
    throw e;
  }
}

/** Unlink, by the person: the active link ends ('person'). */
export async function unlinkSocial(sql: Sql, account: number): Promise<'done' | 'none' | 'not-yet'> {
  try {
    const rows = await sql`update studio.social_links set unlinked_at = now(), ended_by = 'person' where account_id = ${account} and unlinked_at is null returning id`;
    return rows.length > 0 ? 'done' : 'none';
  } catch (e) {
    if (missing(e)) return 'not-yet';
    throw e;
  }
}
