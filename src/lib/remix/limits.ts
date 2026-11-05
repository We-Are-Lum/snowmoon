import 'server-only';
import type postgres from 'postgres';
import { IMAGES, REMIX, remixFreeOn } from '../config';
import { balanceUsd, debit, priceUsd } from '../wallet/credits';
import { perDay as picturesPerDay } from '../images/limits';
import { isSocialPerson, isWalletPerson } from '../people';
import { countOne, countToday, linkedFree, linkedOn } from '../linked/accounts';
import { freeFor } from '../social/free';
import { payFromPersonBalance, personBalanceOn } from '../balance/person';

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

export type Refusal = 'limit' | 'spend' | 'balance' | 'prepaid-spend' | 'free-off' | 'no-free';
export type Funded = 'free' | 'prepaid';
/** Only a wallet account pays from a balance; Lens and Bluesky accounts use the free count when freeFor allows. */
export const fundedBy = (person: number): Funded => (isWalletPerson(person) ? 'prepaid' : 'free');
/** The owner's higher Pictures count (IMAGES.perDayFor) applies here too; everyone else gets REMIX.generationsPerDay. */
export const perDay = (person: number) => (person in IMAGES.perDayFor ? picturesPerDay(person) : REMIX.generationsPerDay);

export interface Spend {
  model: { id: string; host: string };
  reserveUsd: number;
}

export async function generationsLeft(sql: Sql, person: number, reserveUsd: number): Promise<number> {
  // Never asks Lens (the count is shown when the maker opens); a decision already made counts, none yet shows the count.
  const linked = await linkedFree(sql, person);
  if (linked === 'none') return 0;
  if (linked !== 'free' && isSocialPerson(person) && (await freeFor(sql, person, { lookUp: false }))?.free === false) return 0;
  if (isWalletPerson(person)) return Math.floor((await balanceUsd(sql, -person)) / priceUsd(reserveUsd));
  if (linkedOn()) return Math.max(0, perDay(person) - (await countToday(sql, 'remix_asks', person)));
  const [r] = await sql`select count(*)::int as n from studio.remix_asks where person = ${person} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, perDay(person) - (r?.n ?? 0));
}

/** Today's free spend across everyone, and whether one more worst case still fits under the cap. */
export async function freeSpendToday(sql: Sql): Promise<number> {
  const [t] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.remix_costs where day = ${sql.unsafe(TODAY)} and funded = 'free'`;
  return t.usd;
}

export async function reserve(
  sql: Sql,
  person: number,
  spend: Spend,
  /**
   * Paying per person (PERSON_BALANCE): `personBalance` lets a Farcaster, Lens or Bluesky person's own balance pay when
   * the free path refuses (the Remix route only; an agent's approved frame never does, Terms 6b); `paidOnly`: the gate
   * refused free frames but let them pay, so only the balance pays.
   */
  opts: { personBalance?: boolean; paidOnly?: boolean } = {},
): Promise<{ ok: true; left: number; debitId?: number; personDebitId?: number; funded?: Funded } | { ok: false; refusal: Refusal }> {
  const mayPay = Boolean(opts.personBalance && personBalanceOn());
  const paidOnly = mayPay && Boolean(opts.paidOnly);
  // A Lens or Bluesky account without free generations (src/lib/social/free.ts) gets none, whichever route asks.
  const linked = await linkedFree(sql, person);
  const noFree = paidOnly || linked === 'none' || (linked !== 'free' && isSocialPerson(person) && !(await freeFor(sql, person)).free);
  if (noFree && !mayPay) return { ok: false, refusal: 'no-free' };
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.remix.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.remix.person'), ${person}::int)`;
    const t = tx as unknown as Sql;
    if (isWalletPerson(person)) {
      const price = priceUsd(spend.reserveUsd);
      const balance = await balanceUsd(t, -person);
      if (balance < price) return { ok: false as const, refusal: 'balance' as const };
      const [paid] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.remix_costs where day = ${tx.unsafe(TODAY)} and funded = 'prepaid'`;
      if (paid.usd + spend.reserveUsd > IMAGES.prepaid.dailyCapUsd) return { ok: false as const, refusal: 'prepaid-spend' as const };
      const debitId = await debit(t, -person, price);
      await addCost(t, 'prepaid', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
      return { ok: true as const, left: Math.floor((balance - price) / price), debitId };
    }
    // Free first; when the free path refuses, a person's own balance pays if it covers the price (mayPay).
    const orPay = async (refusal: 'limit' | 'spend' | 'no-free' | 'free-off') => {
      const paid = mayPay
        ? await payFromPersonBalance(t, person, spend.reserveUsd, async () => {
            const [p] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.remix_costs where day = ${tx.unsafe(TODAY)} and funded = 'prepaid'`;
            return p.usd;
          })
        : null;
      if (!paid) return paidOnly && refusal === 'no-free' ? { ok: false as const, refusal: 'balance' as const } : { ok: false as const, refusal };
      if (!paid.ok) return paid;
      await addCost(t, 'prepaid', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
      return { ok: true as const, left: Math.floor(paid.balanceAfter / paid.price), personDebitId: paid.debitId, funded: 'prepaid' as const };
    };
    if (noFree) return orPay('no-free');
    if (!remixFreeOn()) return orPay('free-off');
    const left = await generationsLeft(t, person, spend.reserveUsd);
    if (left <= 0) return orPay('limit');
    if ((await freeSpendToday(t)) + spend.reserveUsd > REMIX.dailyFreeCapUsd) return orPay('spend');
    await countOne(t, 'remix_asks', person);
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
