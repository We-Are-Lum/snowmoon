import 'server-only';
import type postgres from 'postgres';
import { CLOSED_IMAGES, IMAGES, imagesDailySpendCapUsd } from '../config';
import { CLOSED_MODEL_IDS } from './sheet-models';
import { balanceUsd, debit, priceUsd } from '../wallet/credits';
import { paysFor } from './price';

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

export type Refusal = 'limit' | 'spend' | 'balance' | 'prepaid-spend' | 'closed-limit' | 'closed-spend';
export type Funded = 'free' | 'prepaid';
export const fundedBy = (fid: number): Funded => (fid < 0 ? 'prepaid' : 'free');

/** This person's daily Generate count: IMAGES.perDayFor if they are on it, else IMAGES.generationsPerDay. */
export function perDay(fid: number): number {
  return IMAGES.perDayFor[fid] ?? IMAGES.generationsPerDay;
}

/** For a wallet account: how many text-to-image Generates its balance pays for. */
export async function generationsLeft(sql: Sql, fid: number): Promise<number> {
  if (fid < 0) return paysFor(await balanceUsd(sql, -fid), priceUsd(IMAGES.reserveUsd));
  // With model choice on, closed models' pictures count apart (pool 'closed', NEXT_remix_model_choice.sql); off, the
  // query is the one the site has always run, so nothing needs the new column.
  const open = IMAGES.designs.modelChoice ? sql`and pool = 'open'` : sql``;
  const [r] = await sql`select count(*)::int as n from studio.image_asks where fid = ${fid} ${open} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, perDay(fid) - (r?.n ?? 0));
}

/** Closed models' own daily count for this person (CLOSED_IMAGES.perPersonPerDay), apart from the open one. */
export async function closedLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.image_asks where fid = ${fid} and pool = 'closed' and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, CLOSED_IMAGES.perPersonPerDay - (r?.n ?? 0));
}

/** Today's free spend on closed models, reserved and real (image_costs by model; the prompt checks count in the open total). */
export async function closedSpentToday(sql: Sql): Promise<number> {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${sql.unsafe(TODAY)} and funded = 'free' and model in ${sql(CLOSED_MODEL_IDS as string[])}`;
  return r?.usd ?? 0;
}

/** The closed site-wide cap now: its own, never above the free cap of the moment. */
// (A destructured name: scripts/test-challenge.ts refuses the open cap read straight from its config in this file.)
const { dailySpendCapUsd: closedDailyCapUsd } = CLOSED_IMAGES;
export const closedCapUsd = (now: Date = new Date()) => Math.min(closedDailyCapUsd, imagesDailySpendCapUsd(now));

export async function publishesLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.elements
    where element_type = 'image' and created_by_fid = ${fid} and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, IMAGES.publishesPerDay - (r?.n ?? 0));
}

/** Which model a Generate uses, and its worst case: the text-to-image model unless given (step 4: the edit model). */
export interface Spend {
  model: { id: string; host: string };
  reserveUsd: number;
  /** 'closed': a closed model's picture (model choice): its own count and its own cap, inside the free cap. */
  pool?: 'open' | 'closed';
}
const DEFAULT_SPEND: Spend = { model: IMAGES.model, reserveUsd: IMAGES.reserveUsd };

/**
 * Counts this Generate and reserves its worst case, or says which cap it would pass. A style's
 * sample and a sheet's view are Generates too (step 4): the same count, the same caps.
 */
export async function reserve(sql: Sql, fid: number, spend: Spend = DEFAULT_SPEND): Promise<{ ok: true; left: number; debitId?: number } | { ok: false; refusal: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.fid'), ${fid}::int)`;
    // Closed models are for the free path only, for now (a wallet account's prepaid Generate: a decision owed).
    if (fid < 0 && spend.pool === 'closed') return { ok: false as const, refusal: 'closed-limit' as const };
    if (fid < 0) {
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
    const closed = spend.pool === 'closed';
    if (closed && !IMAGES.designs.modelChoice) return { ok: false as const, refusal: 'closed-limit' as const };
    const left = closed ? await closedLeft(tx as unknown as Sql, fid) : await generationsLeft(tx as unknown as Sql, fid);
    if (left <= 0) return { ok: false as const, refusal: closed ? ('closed-limit' as const) : ('limit' as const) };
    const [today] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'free'`;
    if (today.usd + spend.reserveUsd > imagesDailySpendCapUsd()) return { ok: false as const, refusal: 'spend' as const };
    if (closed && (await closedSpentToday(tx as unknown as Sql)) + spend.reserveUsd > closedCapUsd()) return { ok: false as const, refusal: 'closed-spend' as const };
    if (closed) await tx`insert into studio.image_asks (fid, pool) values (${fid}, 'closed')`;
    else await tx`insert into studio.image_asks (fid) values (${fid})`;
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
