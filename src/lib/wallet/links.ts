import 'server-only';
import type postgres from 'postgres';
import { IMAGES, LINKED_WALLETS, WALLET_LINKS } from '../config';

/**
 * Wallet ↔ Farcaster links (owner, 2026-10-22: "After you are signed in with a wallet you can have an offer to sign
 * in with Farcaster to associate the account with this wallet. If we can't just use neynar to find out if the wallet
 * is already associated."). A linked wallet's sign-in is that FID everywhere getPerson is used.
 *
 * Kept in studio.wallet_links (migration 0026_wallet_links.sql): a row per link, 'verified' (the FID verified the
 * address on Farcaster) or 'signed' (both sign-ins, same session, confirmed). Ending a link sets unlinked_at and
 * ended_by: 'person' (unlinked on the You page) or 'unverified' (owner, 2026-10-22: "a linked wallet is looked up
 * again at most once a day, and an automatic ('verified') link ends if that FID no longer verifies the address. A
 * link I made by tapping isn't affected."). At most one active link per wallet.
 * - A wallet the person unlinked is never looked up again.
 * - A wallet whose verified link ended automatically can be looked up and linked again (the person didn't unlink it).
 * Until the table exists, LINKED_WALLETS (config) is read instead; after, it is read only for a wallet the table has
 * never had a row for, so an ended link always wins.
 *
 * Never linked, whatever anyone claims: the project's payment address (IMAGES.prepaid.payTo).
 *
 * Earlier work (owner, 2026-10-22): what the wallet made before linking shows under the Farcaster name
 * (src/lib/wallet/credit.ts), without rewriting any record; its prepaid balance stays on the wallet account.
 */
type Sql = postgres.Sql;

export type How = 'verified' | 'signed';
export interface Link {
  /** The row (null for a LINKED_WALLETS link). */
  id?: number;
  fid: number;
  how: How | 'config';
  linkedAt: string | null;
}
/** What the table says about a wallet account: its active link, and whether it ever had one (an unlink counts). */
export interface LinkRead {
  /** False when the table isn't there yet (the migration isn't applied). */
  table: boolean;
  active: Link | null;
  ever: boolean;
  /** The person unlinked this wallet at some point: never looked up again. */
  personUnlinked: boolean;
}
const NO_TABLE: LinkRead = { table: false, active: null, ever: false, personUnlinked: false };

/** The project's payment address: never a sign-in wallet's link. */
export const isPayTo = (address: string) => !!IMAGES.prepaid.payTo && address.toLowerCase() === IMAGES.prepaid.payTo.toLowerCase();

/** The FID LINKED_WALLETS gives an address, or null (never for the payment address). */
export const configLink = (address: string): number | null => (isPayTo(address) ? null : LINKED_WALLETS[address.toLowerCase()] ?? null);

const missing = (e: unknown) => (e as { code?: string }).code === '42P01';

/** The table's view of a wallet account. A missing table reads as { table: false }. Other errors throw. */
export async function readLink(sql: Sql, account: number): Promise<LinkRead> {
  try {
    const rows = await sql`select id::int as id, fid::int as fid, how, linked_at, unlinked_at, ended_by from studio.wallet_links
      where account_id = ${account} order by linked_at desc, id desc`;
    const a = rows.find((r) => r.unlinked_at === null);
    return {
      table: true,
      ever: rows.length > 0,
      personUnlinked: rows.some((r) => r.ended_by === 'person'),
      active: a ? { id: a.id, fid: a.fid, how: a.how, linkedAt: new Date(a.linked_at).toISOString() } : null,
    };
  } catch (e) {
    if (missing(e)) return NO_TABLE;
    throw e;
  }
}

/**
 * The FID a wallet signs in as, or null: the table's active link; LINKED_WALLETS when the table isn't there or has
 * never had a row for this wallet. Never throws: a database that can't answer falls back to LINKED_WALLETS, so a
 * wallet sign-in is never refused because of this.
 */
export async function linkedFidFor(sql: Sql | null, account: number, address: string): Promise<number | null> {
  if (isPayTo(address)) return null;
  if (!sql) return configLink(address);
  try {
    const r = await readLink(sql, account);
    // A tapped link is never re-checked; nor is anything while the lookup is off.
    if (r.active && (r.active.how !== 'verified' || !WALLET_LINKS.lookUp)) return r.active.fid;
    if (r.personUnlinked) return null;
    // Lazily, on a signed-in request: a verified link checked again (at most once a day: the lookup is kept a day),
    // or a wallet with no link looked up.
    if (r.table && WALLET_LINKS.lookUp) {
      const auto = await autoLinkOnce(sql, account, address);
      if (auto.linked || r.ever || r.active) return auto.linked;
    }
    return r.ever ? null : configLink(address);
  } catch (e) {
    console.error('wallet links: read failed', (e as { code?: string }).code ?? (e as Error).name);
    return configLink(address);
  }
}

/** The link shown on the You page: the table's, or LINKED_WALLETS' when the table has none. */
export async function linkOf(sql: Sql | null, account: number, address: string): Promise<{ link: Link | null; table: boolean }> {
  if (isPayTo(address)) return { link: null, table: false };
  const r = sql ? await readLink(sql, account).catch(() => NO_TABLE) : NO_TABLE;
  if (r.active) return { link: r.active, table: r.table };
  const c = r.ever ? null : configLink(address);
  return { link: c ? { fid: c, how: 'config', linkedAt: null } : null, table: r.table };
}

export type LinkResult = { ok: true; fid: number; how: How; created: boolean } | { ok: false; why: 'payment-address' | 'linked-elsewhere' | 'not-yet' };

/**
 * Link a wallet account to a FID. The caller has checked the proofs: for 'signed', a wallet session for this account
 * and a Farcaster sign-in for this FID, in the same request; for 'verified', Neynar's answer. Linking again to the
 * same FID changes nothing; a wallet linked to another FID must be unlinked first.
 */
export async function link(sql: Sql, account: number, address: string, fid: number, how: How): Promise<LinkResult> {
  if (isPayTo(address)) return { ok: false, why: 'payment-address' };
  if (!Number.isInteger(fid) || fid <= 0) throw new Error('bad fid');
  try {
    const r = await readLink(sql, account);
    if (!r.table) return { ok: false, why: 'not-yet' };
    if (r.active) return r.active.fid === fid ? { ok: true, fid, how: r.active.how as How, created: false } : { ok: false, why: 'linked-elsewhere' };
    await sql`insert into studio.wallet_links (account_id, fid, how) values (${account}, ${fid}, ${how})`;
    return { ok: true, fid, how, created: true };
  } catch (e) {
    // Two links at once for one wallet: the unique index keeps one; answer with whichever it kept.
    if ((e as { code?: string }).code === '23505') {
      const again = await readLink(sql, account);
      if (again.active?.fid === fid) return { ok: true, fid, how: again.active.how as How, created: false };
      return { ok: false, why: 'linked-elsewhere' };
    }
    if (missing(e)) return { ok: false, why: 'not-yet' };
    throw e;
  }
}

/** Unlink, by the person: the active link ends ('person'), and the wallet is never looked up again. 'not-yet' while the table isn't there (LINKED_WALLETS can't be unlinked here). */
export async function unlink(sql: Sql, account: number): Promise<'done' | 'none' | 'not-yet'> {
  try {
    const rows = await sql`update studio.wallet_links set unlinked_at = now(), ended_by = 'person' where account_id = ${account} and unlinked_at is null returning id`;
    return rows.length > 0 ? 'done' : 'none';
  } catch (e) {
    if (missing(e)) return 'not-yet';
    throw e;
  }
}

// --- The automatic link: Neynar's user by verified address (WALLET_LINKS.lookUp) --------------------------------

/**
 * Where the lookup goes (docs.neynar.com, "Fetch bulk users by Eth or Sol address": GET
 * /v2/farcaster/user/bulk-by-address/?addresses=…&address_types=verified_address, x-api-key; the answer groups users
 * by address; no user is a 404). Neynar receives the address and nothing else. Mutable only for the tests.
 */
export const NEYNAR_BY_ADDRESS = { url: 'https://api.neynar.com/v2/farcaster/user/bulk-by-address/', timeoutMs: 4000 };

export type Lookup = { ok: true; fids: number[]; fromCache: boolean } | { ok: false; why: string };

const FRESH = () => `now() - make_interval(hours => ${Number(WALLET_LINKS.lookupCacheHours)})`;

/** The FIDs that verified this address, from the cache or Neynar. Never throws; a failed lookup is never kept. */
export async function verifiedFids(sql: Sql, account: number, address: string): Promise<Lookup> {
  if (!WALLET_LINKS.lookUp) return { ok: false, why: 'off' };
  if (isPayTo(address)) return { ok: false, why: 'payment address' };
  const a = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return { ok: false, why: 'bad address' };
  try {
    await sql`delete from studio.wallet_fid_lookups where fetched_at <= ${sql.unsafe(FRESH())}`;
    const [kept] = await sql`select fids from studio.wallet_fid_lookups where account_id = ${account} and fetched_at > ${sql.unsafe(FRESH())}`;
    if (kept) return { ok: true, fids: (kept.fids as (string | number)[]).map(Number), fromCache: true };
  } catch (e) {
    return { ok: false, why: missing(e) ? 'not-yet' : 'cache' };
  }
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return { ok: false, why: 'no NEYNAR_API_KEY' };
  let fids: number[];
  try {
    const res = await fetch(`${NEYNAR_BY_ADDRESS.url}?addresses=${a}&address_types=verified_address`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(NEYNAR_BY_ADDRESS.timeoutMs),
      redirect: 'error',
    });
    if (res.status === 404) fids = [];
    else if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    else {
      const body = (await res.json()) as Record<string, unknown>;
      const users = Object.entries(body ?? {}).find(([k]) => k.toLowerCase() === a)?.[1];
      // Counted only if the user's own verified addresses include this one (a custody address is not a verification).
      const found = (Array.isArray(users) ? users : []).filter((u: { fid?: unknown; verified_addresses?: { eth_addresses?: unknown } }) => {
        const eth = u?.verified_addresses?.eth_addresses;
        return Number.isInteger(Number(u?.fid)) && Number(u.fid) > 0 && Array.isArray(eth) && eth.some((x) => String(x).toLowerCase() === a);
      });
      fids = [...new Set(found.map((u: { fid?: unknown }) => Number(u.fid)))].sort((x, y) => x - y);
    }
  } catch (e) {
    return { ok: false, why: (e as Error).name };
  }
  try {
    await sql`insert into studio.wallet_fid_lookups (account_id, fids) values (${account}, ${sql.array(fids)}::bigint[])
      on conflict (account_id) do update set fids = excluded.fids, fetched_at = now()`;
  } catch (e) {
    console.error('wallet links: could not keep the lookup', (e as { code?: string }).code ?? (e as Error).name);
  }
  return { ok: true, fids, fromCache: false };
}

export type AutoLink = { linked: number | null; why: string };

/**
 * On a wallet's signed-in request (getPerson, lazily; not in the sign-in route, whose P4a exemption says it writes
 * only the account row). The lookup's answer is kept a day, so Neynar is asked at most once a day per wallet.
 * - No active link, and the person never unlinked it: if exactly one Farcaster account has verified the address,
 *   link it ('verified'). Two or more: no link.
 * - An active 'verified' link: if its FID no longer verifies the address, the link ends ('unverified'); then, as
 *   above, a single other FID that verifies it is linked instead.
 * - An active 'signed' link, or a wallet the person unlinked: nothing is looked up.
 * Never throws. Neynar (or the database) down: an active link is kept, and a wallet without one signs in as itself.
 */
export async function autoLink(sql: Sql, account: number, address: string): Promise<AutoLink> {
  const r0 = await readLink(sql, account).catch(() => NO_TABLE);
  const keep: AutoLink = { linked: r0.active?.fid ?? null, why: 'kept' };
  try {
    if (!WALLET_LINKS.lookUp) return { ...keep, why: 'off' };
    if (isPayTo(address)) return { linked: null, why: 'payment address' };
    const r = r0;
    if (!r.table) return { linked: null, why: 'not-yet' };
    if (r.active && r.active.how !== 'verified') return { linked: r.active.fid, why: 'signed' };
    if (!r.active && r.personUnlinked) return { linked: null, why: 'unlinked before' };
    const found = await verifiedFids(sql, account, address);
    if (!found.ok) return { ...keep, why: found.why };
    if (r.active) {
      if (found.fids.includes(r.active.fid)) return { linked: r.active.fid, why: 'still verified' };
      await sql`update studio.wallet_links set unlinked_at = now(), ended_by = 'unverified'
        where id = ${r.active.id!} and unlinked_at is null and how = 'verified'`;
      keep.linked = null;
    }
    if (found.fids.length !== 1) return { linked: null, why: r.active ? 'no longer verified' : found.fids.length ? 'more than one account' : 'no account' };
    const l = await link(sql, account, address, found.fids[0], 'verified');
    return l.ok ? { linked: l.fid, why: 'verified' } : { linked: null, why: l.why };
  } catch (e) {
    console.error('wallet links: automatic link failed', (e as { code?: string }).code ?? (e as Error).name);
    return { ...keep, why: 'error' };
  }
}

/** One automatic link at a time per wallet on this server: a page's parallel first requests ask Neynar once. */
const inFlight = new Map<number, Promise<AutoLink>>();
function autoLinkOnce(sql: Sql, account: number, address: string): Promise<AutoLink> {
  let p = inFlight.get(account);
  if (!p) {
    p = autoLink(sql, account, address).finally(() => inFlight.delete(account));
    inFlight.set(account, p);
  }
  return p;
}
