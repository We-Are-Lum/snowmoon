import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';

/**
 * Caps for readers' images (decision 10). A Generate is counted under the person's FID in
 * studio.image_asks (the daily limit, nothing else). Money is counted only as daily totals in
 * studio.image_costs, with no FID and no row per call, so no cost can be matched to a person
 * (owner, 2026-10-08, the assistant's rule). Under one lock, before any model is called:
 * the person's count, today's spend and the trial's total spend, each with the worst case of
 * this Generate added to 'reserved'; afterwards the reservation is replaced by the real costs.
 */
type Sql = postgres.Sql;
const TODAY = `(now() at time zone 'utc')::date`;

export type Refusal = 'limit' | 'spend' | 'trial-spend';

export async function generationsLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.image_asks where fid = ${fid} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, IMAGES.generationsPerDay - (r?.n ?? 0));
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
export async function reserve(sql: Sql, fid: number, spend: Spend = DEFAULT_SPEND): Promise<{ ok: true; left: number } | { ok: false; refusal: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.fid'), ${fid}::int)`;
    const left = await generationsLeft(tx as unknown as Sql, fid);
    if (left <= 0) return { ok: false as const, refusal: 'limit' as const };
    const [today] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)}`;
    if (today.usd + spend.reserveUsd > IMAGES.dailySpendCapUsd) return { ok: false as const, refusal: 'spend' as const };
    const [all] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs`;
    if (all.usd + spend.reserveUsd > IMAGES.totalSpendCapUsd) return { ok: false as const, refusal: 'trial-spend' as const };
    await tx`insert into studio.image_asks (fid) values (${fid})`;
    await addCost(tx as unknown as Sql, 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
    return { ok: true as const, left: left - 1 };
  });
}

/**
 * A check of words alone (step 4, decision 1: a design's name): no picture, so not counted as a
 * Generate, but its cost is kept in the day's totals and it is refused when the spend caps are reached.
 */
export async function wordsCheckFits(sql: Sql): Promise<boolean> {
  const [today] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${sql.unsafe(TODAY)}`;
  const [all] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs`;
  const worst = IMAGES.reserveUsd - IMAGES.pricePerMp;
  return today.usd + worst <= IMAGES.dailySpendCapUsd && all.usd + worst <= IMAGES.totalSpendCapUsd;
}

export async function recordGuard(sql: Sql, guard: { costUsd: number; provider: string | null; verdict: 'ok' | 'blocked' }) {
  await addCost(sql, 'guard', IMAGES.guardModel, guard.provider ?? '', guard.verdict, 1, guard.costUsd);
}

/** Replaces the reservation with what was really spent. Safe to call once per reserve(). */
export async function settle(
  sql: Sql,
  spent: { guard?: { costUsd: number; provider: string | null; verdict: 'ok' | 'blocked' }; image?: { costUsd: number; verdict: 'ok' | 'nsfw' } },
  spend: Spend = DEFAULT_SPEND,
) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await addCost(t, 'reserved', spend.model.id, '', '', -1, -spend.reserveUsd);
    if (spent.guard) await addCost(t, 'guard', IMAGES.guardModel, spent.guard.provider ?? '', spent.guard.verdict, 1, spent.guard.costUsd);
    if (spent.image) await addCost(t, 'image', spend.model.id, spend.model.host, spent.image.verdict, 1, spent.image.costUsd);
  });
}

async function addCost(sql: Sql, kind: string, model: string, provider: string, verdict: string, calls: number, usd: number) {
  await sql`insert into studio.image_costs (kind, model, provider, verdict, calls, cost_usd)
    values (${kind}, ${model}, ${provider}, ${verdict}, ${calls}, ${usd})
    on conflict (day, kind, model, provider, verdict)
    do update set calls = studio.image_costs.calls + excluded.calls, cost_usd = studio.image_costs.cost_usd + excluded.cost_usd`;
}
