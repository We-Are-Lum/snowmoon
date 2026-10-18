import 'server-only';
import type postgres from 'postgres';
import { IMAGES, REMIX, remixFreeOn } from '../config';
import { balanceUsd, debit, priceUsd } from '../wallet/credits';
import { perDay as picturesPerDay } from '../images/limits';

/**
 * Remix's caps, the same shape as Pictures' (src/lib/images/limits.ts), in its own tables
 * (migration 0013): a Generate is counted under the person in studio.remix_asks (the daily count,
 * nothing else); money only as daily totals in studio.remix_costs, with no person and no row per
 * call. Under one lock, before any model is called: the person's count and today's free spend
 * across everyone, with this Generate's worst case added to 'reserved'; afterwards the
 * reservation is replaced by the real costs. Wallet accounts (person below zero) pay from their
 * prepaid balance instead, as in Pictures, under the same prepaid daily cap.
 */
type Sql = postgres.Sql;
const TODAY = `(now() at time zone 'utc')::date`;

export type Refusal = 'limit' | 'spend' | 'balance' | 'prepaid-spend' | 'free-off';
export type Funded = 'free' | 'prepaid';
export const fundedBy = (person: number): Funded => (person < 0 ? 'prepaid' : 'free');
/** The owner's higher Pictures count (IMAGES.perDayFor) applies here too; everyone else gets REMIX.generationsPerDay. */
export const perDay = (person: number) => (person in IMAGES.perDayFor ? picturesPerDay(person) : REMIX.generationsPerDay);

export interface Spend {
  model: { id: string; host: string };
  reserveUsd: number;
}

export async function generationsLeft(sql: Sql, person: number, reserveUsd: number): Promise<number> {
  if (person < 0) return Math.floor((await balanceUsd(sql, -person)) / priceUsd(reserveUsd));
  const [r] = await sql`select count(*)::int as n from studio.remix_asks where person = ${person} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, perDay(person) - (r?.n ?? 0));
}

/** Today's free spend across everyone, and whether one more worst case still fits under the cap. */
export async function freeSpendToday(sql: Sql): Promise<number> {
  const [t] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.remix_costs where day = ${sql.unsafe(TODAY)} and funded = 'free'`;
  return t.usd;
}

export async function reserve(sql: Sql, person: number, spend: Spend): Promise<{ ok: true; left: number } | { ok: false; refusal: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.remix.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.remix.person'), ${person}::int)`;
    const t = tx as unknown as Sql;
    if (person < 0) {
      const price = priceUsd(spend.reserveUsd);
      const balance = await balanceUsd(t, -person);
      if (balance < price) return { ok: false as const, refusal: 'balance' as const };
      const [paid] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.remix_costs where day = ${tx.unsafe(TODAY)} and funded = 'prepaid'`;
      if (paid.usd + spend.reserveUsd > IMAGES.prepaid.dailyCapUsd) return { ok: false as const, refusal: 'prepaid-spend' as const };
      await debit(t, -person, price);
      await addCost(t, 'prepaid', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
      return { ok: true as const, left: Math.floor((balance - price) / price) };
    }
    if (!remixFreeOn()) return { ok: false as const, refusal: 'free-off' as const };
    const left = await generationsLeft(t, person, spend.reserveUsd);
    if (left <= 0) return { ok: false as const, refusal: 'limit' as const };
    if ((await freeSpendToday(t)) + spend.reserveUsd > REMIX.dailyFreeCapUsd) return { ok: false as const, refusal: 'spend' as const };
    await tx`insert into studio.remix_asks (person) values (${person})`;
    await addCost(t, 'free', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
    return { ok: true as const, left: left - 1 };
  });
}

/** Replaces the reservation with what was really spent. Call once per reserve(). */
export async function settle(
  sql: Sql,
  spent: { guard?: { costUsd: number; provider: string | null; verdict: 'ok' | 'blocked' }; image?: { costUsd: number; verdict: 'ok' | 'nsfw' } },
  spend: Spend,
  funded: Funded,
) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await addCost(t, funded, 'reserved', spend.model.id, '', '', -1, -spend.reserveUsd);
    if (spent.guard) await addCost(t, funded, 'guard', IMAGES.guardModel, spent.guard.provider ?? '', spent.guard.verdict, 1, spent.guard.costUsd);
    if (spent.image) await addCost(t, funded, 'image', spend.model.id, spend.model.host, spent.image.verdict, 1, spent.image.costUsd);
  });
}

async function addCost(sql: Sql, funded: Funded, kind: string, model: string, provider: string, verdict: string, calls: number, usd: number) {
  await sql`insert into studio.remix_costs (funded, kind, model, provider, verdict, calls, cost_usd)
    values (${funded}, ${kind}, ${model}, ${provider}, ${verdict}, ${calls}, ${usd})
    on conflict (day, funded, kind, model, provider, verdict)
    do update set calls = studio.remix_costs.calls + excluded.calls, cost_usd = studio.remix_costs.cost_usd + excluded.cost_usd`;
}
