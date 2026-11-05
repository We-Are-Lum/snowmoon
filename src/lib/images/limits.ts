import 'server-only';
import type postgres from 'postgres';
import { IMAGES, imagesDailySpendCapUsd } from '../config';
import { balanceUsd, debit, priceUsd } from '../wallet/credits';
import { paysFor } from './price';
import { isSocialPerson, isWalletPerson } from '../people';
import { freeFor } from '../social/free';
import { payFromPersonBalance, personBalanceOn } from '../balance/person';
import { countOne, countToday, linkedFree, linkedOn } from '../linked/accounts';

/**
 * Caps for readers' images (decision 10). A Generate is counted under the person's FID in
 * studio.image_asks (the daily limit, nothing else). Money is counted only as daily totals in
 * studio.image_costs, with no FID and no row per call, so no cost can be matched to a person
 * (owner, 2026-10-08, the assistant's rule). Under one lock, before any model is called:
 * the person's count and today's spend across everyone, with the worst case of this Generate
 * added to 'reserved' (the $1 all-days test cap was removed by the owner, 2026-10-09); afterwards the reservation is replaced by the real costs.
 *
 * Wallet accounts (person number below zero; owner, 2026-10-13) are prepaid instead: no daily count;
 * each Generate is paid from the balance at priceUsd(its worst case), and its costs are counted as
 * 'prepaid' in image_costs, against IMAGES.prepaid.dailyCapUsd rather than the free cap.
 */
type Sql = postgres.Sql;
const TODAY = `(now() at time zone 'utc')::date`;

export type Refusal = 'limit' | 'spend' | 'balance' | 'prepaid-spend' | 'no-free';
export type Funded = 'free' | 'prepaid';
/** Only a wallet account pays from a balance; Lens and Bluesky accounts use the free count when freeFor allows. */
export const fundedBy = (fid: number): Funded => (isWalletPerson(fid) ? 'prepaid' : 'free');

/** This person's daily Generate count: IMAGES.perDayFor if they are on it, else IMAGES.generationsPerDay. */
export function perDay(fid: number): number {
  return IMAGES.perDayFor[fid] ?? IMAGES.generationsPerDay;
}

/** For a wallet account: how many text-to-image Generates its balance pays for. */
export async function generationsLeft(sql: Sql, fid: number): Promise<number> {
  // Never asks Lens (the count is shown when the maker opens); a decision already made counts, none yet shows the count.
  // Linked accounts (LINKED_ACCOUNTS, off): none while an account of the person is in its 30-day wait; a linked pass
  // gives the free count; the count covers the person (src/lib/linked/accounts.ts).
  const linked = await linkedFree(sql, fid);
  if (linked === 'none') return 0;
  if (linked !== 'free' && isSocialPerson(fid) && (await freeFor(sql, fid, { lookUp: false }))?.free === false) return 0;
  if (isWalletPerson(fid)) return paysFor(await balanceUsd(sql, -fid), priceUsd(IMAGES.reserveUsd));
  if (linkedOn()) return Math.max(0, perDay(fid) - (await countToday(sql, 'image_asks', fid)));
  const [r] = await sql`select count(*)::int as n from studio.image_asks where fid = ${fid} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, perDay(fid) - (r?.n ?? 0));
}

export async function publishesLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.elements
    where element_type = 'image' and created_by_fid = ${fid} and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, IMAGES.publishesPerDay - (r?.n ?? 0));
}

/** Which model a Generate uses, and its worst case: the text-to-image model unless given (step 4: the edit model). */
export interface Spend {
  model: { id: string; host: string };
  reserveUsd: number;
}
const DEFAULT_SPEND: Spend = { model: IMAGES.model, reserveUsd: IMAGES.reserveUsd };

/**
 * Counts this Generate and reserves its worst case, or says which cap it would pass. A style's
 * sample and a sheet's view are Generates too (step 4): the same count, the same caps.
 */
export async function reserve(
  sql: Sql,
  fid: number,
  spend: Spend = DEFAULT_SPEND,
  /**
   * The gate refused free generations but let this person pay (mayGenerate's `paidOnly`, PERSON_BALANCE on): only the
   * balance pays, and an empty one is refused as 'balance'.
   */
  opts: { paidOnly?: boolean } = {},
): Promise<{ ok: true; left: number; debitId?: number; personDebitId?: number; funded?: Funded } | { ok: false; refusal: Refusal }> {
  const paidOnly = Boolean(opts.paidOnly && personBalanceOn());
  // A Lens or Bluesky account without free generations (src/lib/social/free.ts) gets none, whichever route asks; with
  // PERSON_BALANCE on, it may still pay from its own balance (below).
  const linked = await linkedFree(sql, fid);
  const noFree = paidOnly || linked === 'none' || (linked !== 'free' && isSocialPerson(fid) && !(await freeFor(sql, fid)).free);
  if (noFree && !personBalanceOn()) return { ok: false, refusal: 'no-free' };
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.fid'), ${fid}::int)`;
    if (isWalletPerson(fid)) {
      const t = tx as unknown as Sql;
      const price = priceUsd(spend.reserveUsd);
      const balance = await balanceUsd(t, -fid);
      if (balance < price) return { ok: false as const, refusal: 'balance' as const };
      const [paid] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'prepaid'`;
      if (paid.usd + spend.reserveUsd > IMAGES.prepaid.dailyCapUsd) return { ok: false as const, refusal: 'prepaid-spend' as const };
      const debitId = await debit(t, -fid, price);
      await addCost(t, 'prepaid', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
      return { ok: true as const, left: paysFor(balance - price, priceUsd(IMAGES.reserveUsd)), debitId };
    }
    const t = tx as unknown as Sql;
    // Free first; when the free path refuses, a Farcaster, Lens or Bluesky person pays from its own balance if it
    // covers the price (PERSON_BALANCE, off; src/lib/balance/person.ts). No per-person cap on paid Generates.
    const orPay = async (refusal: 'limit' | 'spend' | 'no-free') => {
      const paid = await payFromPersonBalance(t, fid, spend.reserveUsd, async () => {
        const [p] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'prepaid'`;
        return p.usd;
      });
      if (!paid) return { ok: false as const, refusal };
      if (!paid.ok) return paid;
      await addCost(t, 'prepaid', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
      return { ok: true as const, left: paysFor(paid.balanceAfter, priceUsd(IMAGES.reserveUsd)), personDebitId: paid.debitId, funded: 'prepaid' as const };
    };
    if (noFree) {
      const r = await orPay('no-free');
      return !r.ok && paidOnly && r.refusal === 'no-free' ? { ok: false as const, refusal: 'balance' as const } : r;
    }
    const left = await generationsLeft(t, fid);
    if (left <= 0) return orPay('limit');
    const [today] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'free'`;
    if (today.usd + spend.reserveUsd > imagesDailySpendCapUsd()) return orPay('spend');
    await countOne(tx as unknown as Sql, 'image_asks', fid);
    await addCost(tx as unknown as Sql, 'free', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
    return { ok: true as const, left: left - 1 };
  });
}

/**
 * A check of words alone (step 4, decision 1: a design's name): no picture, so not counted as a
 * Generate, but its cost is kept in the day's totals and it is refused when the daily spend cap is reached
 * (the all-days cap is gone, owner 2026-10-09).
 */
export async function wordsCheckFits(sql: Sql): Promise<boolean> {
  const [today] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${sql.unsafe(TODAY)} and funded = 'free'`;
  const worst = IMAGES.reserveUsd - IMAGES.pricePerMp;
  return today.usd + worst <= imagesDailySpendCapUsd();
}

export async function recordGuard(sql: Sql, guard: { costUsd: number; provider: string | null; verdict: 'ok' | 'blocked' }) {
  await addCost(sql, 'free', 'guard', IMAGES.guardModel, guard.provider ?? '', guard.verdict, 1, guard.costUsd);
}

/** Replaces the reservation with what was really spent. Safe to call once per reserve(). */
export async function settle(
  sql: Sql,
  spent: { guard?: { costUsd: number; provider: string | null; verdict: 'ok' | 'blocked' }; image?: { costUsd: number; verdict: 'ok' | 'nsfw' } },
  spend: Spend = DEFAULT_SPEND,
  funded: Funded = 'free',
) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await addCost(t, funded, 'reserved', spend.model.id, '', '', -1, -spend.reserveUsd);
    if (spent.guard) await addCost(t, funded, 'guard', IMAGES.guardModel, spent.guard.provider ?? '', spent.guard.verdict, 1, spent.guard.costUsd);
    if (spent.image) await addCost(t, funded, 'image', spend.model.id, spend.model.host, spent.image.verdict, 1, spent.image.costUsd);
  });
}

async function addCost(sql: Sql, funded: Funded, kind: string, model: string, provider: string, verdict: string, calls: number, usd: number) {
  await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd)
    values (${funded}, ${kind}, ${model}, ${provider}, ${verdict}, ${calls}, ${usd})
    on conflict (day, funded, kind, model, provider, verdict)
    do update set calls = studio.image_costs.calls + excluded.calls, cost_usd = studio.image_costs.cost_usd + excluded.cost_usd`;
}
