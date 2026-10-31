import 'server-only';
import type postgres from 'postgres';
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

export type SocialLinkResult = { ok: true; created: boolean } | { ok: false; why: 'not-yet' | 'linked-elsewhere' | 'lens-to-lens' | 'bad-target' };

/**
 * Link, with both proofs already checked by the caller (src/app/api/social-link): the account's own sign-in, and the
 * Farcaster sign-in (fid) or the Lens sign-in (lensAccount) it is linked to. Only a Bluesky account links to a Lens
 * account. Linking again to the same target changes nothing; a different target needs an unlink first.
 */
export async function linkSocial(sql: Sql, account: { id: number; kind: SocialKind }, target: SocialLinkTarget): Promise<SocialLinkResult> {
  if ('fid' in target ? !Number.isInteger(target.fid) || target.fid <= 0 : !Number.isInteger(target.lensAccount) || target.lensAccount <= 0) return { ok: false, why: 'bad-target' };
  if ('lensAccount' in target && account.kind !== 'bluesky') return { ok: false, why: 'lens-to-lens' };
  try {
    const now = await activeSocialLink(sql, account.id);
    const sameTarget = (a: SocialLinkTarget) => ('fid' in a && 'fid' in target ? a.fid === target.fid : 'lensAccount' in a && 'lensAccount' in target && a.lensAccount === target.lensAccount);
    if (now) return sameTarget(now.target) ? { ok: true, created: false } : { ok: false, why: 'linked-elsewhere' };
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
