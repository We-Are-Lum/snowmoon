import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';

/**
 * Caps for readers' images (decision 10). A Generate is counted under the person's FID in
 * studio.image_asks (the daily limit, nothing else). Money is counted only as daily totals in
 * studio.image_costs, with no FID and no row per call, so no cost can be matched to a person
 * (owner, 2026-10-08, the assistant's rule). Under one lock, before any model is called:
 * the person's count and today's spend across everyone, with the worst case of this Generate
 * added to 'reserved' (the $1 all-days test cap was removed by the owner, 2026-10-09); afterwards the reservation is replaced by the real costs.
 */
type Sql = postgres.Sql;
const TODAY = `(now() at time zone 'utc')::date`;

export type Refusal = 'limit' | 'spend';

export async function generationsLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.image_asks where fid = ${fid} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, IMAGES.generationsPerDay - (r?.n ?? 0));
}

export async function publishesLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.elements
    where element_type = 'image' and created_by_fid = ${fid} and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, IMAGES.publishesPerDay - (r?.n ?? 0));
}

/** Counts this Generate and reserves its worst case, or says which cap it would pass. */
export async function reserve(sql: Sql, fid: number): Promise<{ ok: true; left: number } | { ok: false; refusal: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.fid'), ${fid}::int)`;
    const left = await generationsLeft(tx as unknown as Sql, fid);
    if (left <= 0) return { ok: false as const, refusal: 'limit' as const };
    const [today] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)}`;
    if (today.usd + IMAGES.reserveUsd > IMAGES.dailySpendCapUsd) return { ok: false as const, refusal: 'spend' as const };
    await tx`insert into studio.image_asks (fid) values (${fid})`;
    await addCost(tx as unknown as Sql, 'reserved', IMAGES.model.id, '', '', 1, IMAGES.reserveUsd);
    return { ok: true as const, left: left - 1 };
  });
}

/** Replaces the reservation with what was really spent. Safe to call once per reserve(). */
export async function settle(
  sql: Sql,
  spent: { guard?: { costUsd: number; provider: string | null; verdict: 'ok' | 'blocked' }; image?: { costUsd: number; verdict: 'ok' | 'nsfw' } },
) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await addCost(t, 'reserved', IMAGES.model.id, '', '', -1, -IMAGES.reserveUsd);
    if (spent.guard) await addCost(t, 'guard', IMAGES.guardModel, spent.guard.provider ?? '', spent.guard.verdict, 1, spent.guard.costUsd);
    if (spent.image) await addCost(t, 'image', IMAGES.model.id, IMAGES.model.host, spent.image.verdict, 1, spent.image.costUsd);
  });
}

async function addCost(sql: Sql, kind: string, model: string, provider: string, verdict: string, calls: number, usd: number) {
  await sql`insert into studio.image_costs (kind, model, provider, verdict, calls, cost_usd)
    values (${kind}, ${model}, ${provider}, ${verdict}, ${calls}, ${usd})
    on conflict (day, kind, model, provider, verdict)
    do update set calls = studio.image_costs.calls + excluded.calls, cost_usd = studio.image_costs.cost_usd + excluded.cost_usd`;
}
