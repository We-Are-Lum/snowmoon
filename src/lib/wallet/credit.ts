import 'server-only';
import type postgres from 'postgres';
import { LINKED_WALLETS, WALLET_LINKS } from '../config';
import { lookupName } from '../names';
import { configLink, isPayTo } from './links';

/**
 * A linked wallet's earlier work, shown under its Farcaster name (owner, 2026-10-22: after linking, "earlier wallet
 * work shows under the Farcaster name"; this replaced the earlier "don't reassign" default).
 *
 * Shown, not rewritten: every record keeps who made it (the wallet account, minus its number, as the recipes and
 * the publish records say, principle 4). Pages read a linked wallet's work as its FID's: the byline, the profile,
 * the Dashboard and Hide. Unlinking shows it as the wallet's again. While WALLET_LINKS.creditEarlierWork is off,
 * nothing here changes anything.
 */
type Sql = postgres.Sql;

const missing = (e: unknown) => (e as { code?: string }).code === '42P01';

/** For each linked wallet account among `persons` (negative person numbers): the FID its work is shown under. */
export async function linkedTo(sql: Sql | null, persons: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = [...new Set(persons.filter((p) => p < 0).map((p) => -p))];
  if (!sql || !ids.length || !WALLET_LINKS.creditEarlierWork) return out;
  let rows: { id: number; address: string; fid: number | null; ever: boolean }[];
  try {
    rows = (await sql`select a.id::int as id, a.address,
        (select l.fid::int from studio.wallet_links l where l.account_id = a.id and l.unlinked_at is null limit 1) as fid,
        exists (select 1 from studio.wallet_links l where l.account_id = a.id) as ever
      from studio.wallet_accounts a where a.id in ${sql(ids)}`) as unknown as typeof rows;
  } catch (e) {
    // The links table isn't there yet: LINKED_WALLETS only.
    if (!missing(e)) {
      console.error('wallet credit: read failed', (e as { code?: string }).code ?? (e as Error).name);
      return out;
    }
    try {
      rows = ((await sql`select id::int as id, address from studio.wallet_accounts where id in ${sql(ids)}`) as unknown as { id: number; address: string }[]).map((r) => ({ ...r, fid: null, ever: false }));
    } catch {
      return out;
    }
  }
  for (const r of rows) {
    if (isPayTo(r.address)) continue;
    const fid = r.fid ?? (r.ever ? null : configLink(r.address));
    if (fid) out.set(-r.id, fid);
  }
  return out;
}

/** The wallet accounts (as negative person numbers) whose work is shown under this FID. */
export async function walletsOf(sql: Sql | null, fid: number): Promise<number[]> {
  if (!sql || fid <= 0 || !WALLET_LINKS.creditEarlierWork) return [];
  try {
    const rows = await sql`select a.id::int as id, a.address,
        exists (select 1 from studio.wallet_links l where l.account_id = a.id and l.unlinked_at is null and l.fid = ${fid}) as linked,
        exists (select 1 from studio.wallet_links l where l.account_id = a.id) as ever
      from studio.wallet_accounts a
      where exists (select 1 from studio.wallet_links l where l.account_id = a.id and l.unlinked_at is null and l.fid = ${fid})
         or a.address in ${sql(configAddresses(fid))}`;
    return rows.filter((r) => !isPayTo(r.address) && (r.linked || (!r.ever && configLink(r.address) === fid))).map((r) => -r.id);
  } catch (e) {
    if (!missing(e)) return [];
    try {
      const rows = await sql`select id::int as id, address from studio.wallet_accounts where address in ${sql(configAddresses(fid))}`;
      return rows.filter((r) => !isPayTo(r.address)).map((r) => -r.id);
    } catch {
      return [];
    }
  }
}

/** LINKED_WALLETS' addresses for a FID; never empty (an `in ()` list needs one), so a placeholder that matches nothing. */
function configAddresses(fid: number): string[] {
  const a = Object.entries(LINKED_WALLETS).filter(([, f]) => f === fid).map(([k]) => k);
  return a.length ? a : ['-'];
}

/** May `person` act on what `maker` made (Hide): the maker itself, or the FID a linked wallet maker is shown under. */
export async function actsFor(sql: Sql | null, person: number, maker: number): Promise<boolean> {
  if (person === maker) return true;
  if (person <= 0 || maker >= 0) return false;
  return (await linkedTo(sql, [maker])).get(maker) === person;
}

/**
 * Items whose maker is a linked wallet, shown under the FID: `set` gets the FID and its Farcaster name (null if
 * Farcaster doesn't answer, shown as "FID n"). Others come back as they were.
 */
export async function credit<T>(sql: Sql | null, items: T[], maker: (t: T) => number, set: (t: T, fid: number, name: string | null) => T): Promise<T[]> {
  const links = await linkedTo(sql, items.map(maker));
  if (!links.size) return items;
  const names = new Map<number, string | null>();
  for (const fid of new Set(links.values())) names.set(fid, await lookupName(fid).catch(() => null));
  return items.map((t) => {
    const fid = links.get(maker(t));
    return fid ? set(t, fid, names.get(fid) ?? null) : t;
  });
}
