import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { alertPrepaid } from './alert';
import { balanceUsd, debit, priceUsd } from '../wallet/credits';

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
 * 'prepaid' in image_costs, against IMAGES.prepaid.safetyCapUsd rather than the free cap. A wallet's
 * Generates are also counted in image_asks under its (negative) id, for its own daily count,
 * IMAGES.prepaid.perDay (owner, 2026-10-14).
 */
type Sql = postgres.Sql;
const TODAY = `(now() at time zone 'utc')::date`;

export type Refusal = 'limit' | 'spend' | 'balance' | 'prepaid-spend' | 'wallet-limit';
export type Funded = 'free' | 'prepaid';
export const fundedBy = (fid: number): Funded => (fid < 0 ? 'prepaid' : 'free');

/** Whether `now` falls on one of the bounty weekend's UTC days (IMAGES.weekend). */
export function weekendOn(now: Date = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  return day >= IMAGES.weekend.fromUtcDay && day <= IMAGES.weekend.toUtcDay;
}

/**
 * This person's daily Generate count: IMAGES.perDayFor if they are on it; a wallet account's
 * IMAGES.prepaid.perDay; on the bounty weekend IMAGES.weekend.perDay; else IMAGES.generationsPerDay.
 */
export function perDay(fid: number, now: Date = new Date()): number {
  return IMAGES.perDayFor[fid] ?? (fid < 0 ? IMAGES.prepaid.perDay : weekendOn(now) ? IMAGES.weekend.perDay : IMAGES.generationsPerDay);
}

async function asksToday(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.image_asks where fid = ${fid} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return r?.n ?? 0;
}

/** How many images this person may publish a day: IMAGES.publishesPerDayFor if they are on it, else IMAGES.publishesPerDay. */
export function imagePublishesPerDay(fid: number): number {
  return IMAGES.publishesPerDayFor[fid] ?? IMAGES.publishesPerDay;
}

/** How many styles or sheets this person may publish a day: IMAGES.designs.publishesPerDayFor if they are on it, else IMAGES.designs.publishesPerDay. */
export function designsPerDay(fid: number): number {
  return IMAGES.designs.publishesPerDayFor[fid] ?? IMAGES.designs.publishesPerDay;
}

/** How many Generates are left today; for a wallet account, also no more than its balance pays for. */
export async function generationsLeft(sql: Sql, fid: number): Promise<number> {
  const byCount = Math.max(0, perDay(fid) - (await asksToday(sql, fid)));
  if (fid < 0) return Math.min(byCount, Math.floor((await balanceUsd(sql, -fid)) / priceUsd(IMAGES.reserveUsd)));
  return byCount;
}

export async function publishesLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.elements
    where element_type = 'image' and created_by_fid = ${fid} and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, imagePublishesPerDay(fid) - (r?.n ?? 0));
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
export async function reserve(sql: Sql, fid: number, spend: Spend = DEFAULT_SPEND): Promise<{ ok: true; left: number } | { ok: false; refusal: Refusal }> {
  const r = await reserveIn(sql, fid, spend);
  // The prepaid circuit breaker's alerts, outside the lock; an alert never stops a Generate.
  if (r.ok && r.crossed) for (const share of r.crossed) await alertPrepaid(sql, share);
  return r.ok ? { ok: true, left: r.left } : r;
}

async function reserveIn(sql: Sql, fid: number, spend: Spend): Promise<{ ok: true; left: number; crossed?: number[] } | { ok: false; refusal: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.fid'), ${fid}::int)`;
    if (fid < 0) {
      const t = tx as unknown as Sql;
      const price = priceUsd(spend.reserveUsd);
      const asked = await asksToday(t, fid);
      if (asked >= perDay(fid)) return { ok: false as const, refusal: 'wallet-limit' as const };
      const balance = await balanceUsd(t, -fid);
      if (balance < price) return { ok: false as const, refusal: 'balance' as const };
      const [paid] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'prepaid'`;
      const cap = IMAGES.prepaid.safetyCapUsd;
      if (paid.usd + spend.reserveUsd > cap) return { ok: false as const, refusal: 'prepaid-spend' as const };
      await debit(t, -fid, price);
      await tx`insert into studio.image_asks (fid) values (${fid})`;
      await addCost(t, 'prepaid', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
      // Shares of the circuit breaker this reservation reaches; the last one before the cap counts as 100%.
      const after = paid.usd + spend.reserveUsd;
      const crossed = IMAGES.prepaid.alertAt.filter((a) => paid.usd < a * cap && (after >= a * cap || (a === 1 && after + spend.reserveUsd > cap)));
      const left = Math.min(perDay(fid) - asked - 1, Math.floor((balance - price) / priceUsd(IMAGES.reserveUsd)));
      return { ok: true as const, left, crossed };
    }
    const left = await generationsLeft(tx as unknown as Sql, fid);
    if (left <= 0) return { ok: false as const, refusal: 'limit' as const };
    const [today] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'free'`;
    if (today.usd + spend.reserveUsd > IMAGES.dailySpendCapUsd) return { ok: false as const, refusal: 'spend' as const };
    await tx`insert into studio.image_asks (fid) values (${fid})`;
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
  return today.usd + worst <= IMAGES.dailySpendCapUsd;
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
