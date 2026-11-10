import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, CLOSED_IMAGES, IMAGES, closedChoiceOn, imagesDailySpendCapUsd } from '../config';
import { CLOSED_MODEL_IDS } from './sheet-models';
import { balanceUsd, debit, priceUsd } from '../wallet/credits';
import { paysFor } from './price';
import { countsRemixes, isWalletNumber, remixesLeft, remixRefusal, type RemixRefusal } from './remixes';
import { isSocialPerson } from '../people';
import { freeFor } from '../social/free';

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

export type Refusal = 'limit' | 'spend' | 'balance' | 'prepaid-spend' | 'no-free' | 'closed-limit' | 'closed-spend' | RemixRefusal;
export type Funded = 'free' | 'prepaid';
/** Only a wallet account pays from a balance (not a Lens or Bluesky account, whose numbers are also below zero); Lens and Bluesky accounts use the free count when freeFor allows. */
export const fundedBy = (fid: number): Funded => (isWalletNumber(fid) ? 'prepaid' : 'free');

/** This person's daily Generate count: IMAGES.perDayFor if they are on it, else IMAGES.generationsPerDay. */
export function perDay(fid: number): number {
  return IMAGES.perDayFor[fid] ?? IMAGES.generationsPerDay;
}

/** For a wallet account: how many text-to-image Generates its balance pays for. */
export async function generationsLeft(sql: Sql, fid: number): Promise<number> {
  // Never asks Lens (the count is shown when the maker opens); a decision already made counts, none yet shows the count.
  if (isSocialPerson(fid) && (await freeFor(sql, fid, { lookUp: false }))?.free === false) return 0;
  if (isWalletNumber(fid)) return paysFor(await balanceUsd(sql, -fid), priceUsd(IMAGES.reserveUsd));
  // With closed models offered (closedChoiceOn: the challenge's model row, or the sheet form's picker), a closed model's
  // picture is a row in pool 'closed' (0040_remix_model_choice.sql) and counts as CLOSED_IMAGES.countsAs (3) of the
  // day's free pictures. Off, the query is the one the site has always run, so nothing needs the new column.
  const n = closedChoiceOn()
    ? sql`coalesce(sum(case when pool = 'closed' then ${CLOSED_IMAGES.countsAs} else 1 end), 0)::int`
    : sql`count(*)::int`;
  const [r] = await sql`select ${n} as n from studio.image_asks where fid = ${fid} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  // Pictures given back today (a FLUX picture fal's safety checker blocked; 0041_image_asks_back.sql), once that table exists.
  const back = (await backTable(sql)) ? Number((await sql<{ n: number }[]>`select count(*)::int as n from studio.image_asks_back where fid = ${fid} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`)[0]?.n ?? 0) : 0;
  return Math.max(0, Math.min(perDay(fid), perDay(fid) - (r?.n ?? 0) + back));
}

/** Whether pictures can be given back on this database yet (0041_image_asks_back.sql applied). */
async function backTable(sql: Sql): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select to_regclass('studio.image_asks_back') is not null as ok`;
  return Boolean(r?.ok);
}

/**
 * Gives one open picture back to today's count (owner, 2026-11-09): a challenge picture by the open model that fal's
 * safety checker blocked. studio.image_asks stays append-only; this adds a row to studio.image_asks_back (the person
 * number and the time, as image_asks keeps), which generationsLeft subtracts. The spend stays recorded against the caps.
 * Returns whether it was given back (false before the table exists: the picture counts, as before).
 */
export async function giveBack(sql: Sql, fid: number): Promise<boolean> {
  if (isWalletNumber(fid) || !(await backTable(sql))) return false;
  // At most CHALLENGE.blockedGivenBackPerDay a person a UTC day (owner, 2026-11-09), under the person's lock.
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.fid'), ${fid}::int)`;
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from studio.image_asks_back where fid = ${fid} and at >= ${tx.unsafe(UTC_DAY)}`;
    if (Number(r?.n ?? 0) >= CHALLENGE.blockedGivenBackPerDay) return false;
    await tx`insert into studio.image_asks_back (fid) values (${fid})`;
    return true;
  });
}


/** Today's free spend on closed models, reserved and real (image_costs by model; the prompt checks count in the open total). */
export async function closedSpentToday(sql: Sql): Promise<number> {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${sql.unsafe(TODAY)} and funded = 'free' and model in ${sql(CLOSED_MODEL_IDS as string[])}`;
  return r?.usd ?? 0;
}

/** The closed site-wide cap now: its own, never above the free cap of the moment. */
// (A destructured name: scripts/test-challenge.ts refuses the open cap read straight from its config in this file.)
const { dailySpendCapUsd: closedDailyCapUsd } = CLOSED_IMAGES;
// Owner, 2026-11-09: never within CLOSED_IMAGES.openFloorUsd of the free cap, so closed spending can never stop the open
// model (the challenge: $25 free, $20 closed; outside it, $2 free, no closed pictures).
export const closedCapUsd = (now: Date = new Date()) => Math.max(0, Math.min(closedDailyCapUsd, imagesDailySpendCapUsd(now) - CLOSED_IMAGES.openFloorUsd));
/**
 * Would one more closed picture (reserving `reserveUsd`) be refused by the closed caps now ('closed-spend')? Read
 * without the lock, for the screen's starting model only (owner, 2026-11-09: never start on a model that will refuse);
 * reserve() decides under the lock.
 */
export async function closedCapReached(sql: Sql, reserveUsd: number): Promise<boolean> {
  const [today] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${sql.unsafe(TODAY)} and funded = 'free'`;
  return (await closedSpentToday(sql)) + reserveUsd > closedCapUsd() || today.usd + reserveUsd > closedTotalCapUsd();
}
/** A closed picture also stops once the day's whole free spend (open and closed, prompt checks included) would leave the open model less than its floor. */
const closedTotalCapUsd = (now: Date = new Date()) => imagesDailySpendCapUsd(now) - CLOSED_IMAGES.openFloorUsd;

export async function publishesLeft(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.elements
    where element_type = 'image' and created_by_fid = ${fid} and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, IMAGES.publishesPerDay - (r?.n ?? 0));
}

/** Which model a Generate uses, and its worst case: the text-to-image model unless given (step 4: the edit model). */
export interface Spend {
  model: { id: string; host: string };
  reserveUsd: number;
  /**
   * A sheet's view inside a remix (owner, 2026-11-04: count remixes, not pictures): its remix's id, the units it uses
   * (src/lib/images/remixes.ts, remixUnits) and whether this view starts it. Counted as a remix only for people
   * countsRemixes() names, and only once studio.sheet_remix_asks exists (0037_remix_count.sql); otherwise as a picture.
   */
  remix?: { id: string; units: number; starts: boolean; slot: 'front' | 'side' | 'back' };
  /** 'closed': a closed model's picture (model choice): counts as CLOSED_IMAGES.countsAs pictures, with its own count and cap, inside the free cap. */
  pool?: 'open' | 'closed';
}

/** The start of today (UTC), as the other daily counts read it. */
const UTC_DAY = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;

/** Whether remixes are counted on this database yet (0037_remix_count.sql applied). */
async function remixTable(sql: Sql): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select to_regclass('studio.sheet_remix_asks') is not null as ok`;
  return Boolean(r?.ok);
}

/** The units of the remixes this person started today (each remix once, at its first view). */
async function remixesUsedToday(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql<{ n: number }[]>`select coalesce(sum(units), 0)::int as n from (
      select distinct on (remix) remix, units, at from studio.sheet_remix_asks where fid = ${fid} order by remix, at) x
    where x.at >= ${sql.unsafe(UTC_DAY)}`;
  return Number(r?.n ?? 0);
}

/**
 * For the form: how many remixes this person has left today, or null when their views count as pictures (an admin,
 * an invited maker, a wallet account, or a database without studio.sheet_remix_asks).
 */
export async function remixesLeftToday(sql: Sql, fid: number): Promise<number | null> {
  if (!countsRemixes(fid) || !(await remixTable(sql))) return null;
  return remixesLeft(await remixesUsedToday(sql, fid));
}
const DEFAULT_SPEND: Spend = { model: IMAGES.model, reserveUsd: IMAGES.reserveUsd };

/**
 * Counts this Generate and reserves its worst case, or says which cap it would pass. A style's
 * sample and a sheet's view are Generates too (step 4): the same count, the same caps.
 */
export async function reserve(sql: Sql, fid: number, spend: Spend = DEFAULT_SPEND): Promise<{ ok: true; left: number; debitId?: number } | { ok: false; refusal: Refusal }> {
  // A Lens or Bluesky account without free generations (src/lib/social/free.ts) gets none, whichever route asks.
  if (isSocialPerson(fid) && !(await freeFor(sql, fid)).free) return { ok: false, refusal: 'no-free' };
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.images.fid'), ${fid}::int)`;
    // Closed models are for the free path only, for now (a wallet account's prepaid Generate: a decision owed).
    if (isWalletNumber(fid) && spend.pool === 'closed') return { ok: false as const, refusal: 'closed-limit' as const };
    if (isWalletNumber(fid)) {
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
    if (closed && !closedChoiceOn()) return { ok: false as const, refusal: 'closed-limit' as const };
    // A sheet's view inside a remix, for someone who counts remixes (owner, 2026-11-04): the remix count, not the pictures'.
    const t = tx as unknown as Sql;
    if (spend.remix && countsRemixes(fid) && (await remixTable(t))) {
      const used = await remixesUsedToday(t, fid);
      const [tr] = await tx<{ n: number }[]>`select count(*)::int as n from studio.sheet_remix_asks where remix = ${spend.remix.id} and fid = ${fid}`;
      const refusal = remixRefusal({ starts: spend.remix.starts, units: spend.remix.units, used, tries: Number(tr?.n ?? 0) });
      if (refusal) return { ok: false as const, refusal };
      const [day] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'free'`;
      if (day.usd + spend.reserveUsd > imagesDailySpendCapUsd()) return { ok: false as const, refusal: 'spend' as const };
      if (closed && ((await closedSpentToday(t)) + spend.reserveUsd > closedCapUsd() || day.usd + spend.reserveUsd > closedTotalCapUsd())) return { ok: false as const, refusal: 'closed-spend' as const };
      await tx`insert into studio.sheet_remix_asks ${tx({ remix: spend.remix.id, fid, units: spend.remix.units, slot: spend.remix.slot })}`;
      await addCost(t, 'free', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
      return { ok: true as const, left: remixesLeft(used + (spend.remix.starts ? spend.remix.units : 0)) };
    }
    // A closed picture needs CLOSED_IMAGES.countsAs of the day's free pictures (no separate per-person count: owner, 2026-11-08).
    const weight = closed ? CLOSED_IMAGES.countsAs : 1;
    const left = await generationsLeft(t, fid);
    if (left < weight) return { ok: false as const, refusal: closed && left > 0 ? ('closed-limit' as const) : ('limit' as const) };
    const [today] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = ${tx.unsafe(TODAY)} and funded = 'free'`;
    if (today.usd + spend.reserveUsd > imagesDailySpendCapUsd()) return { ok: false as const, refusal: 'spend' as const };
    if (closed && ((await closedSpentToday(tx as unknown as Sql)) + spend.reserveUsd > closedCapUsd() || today.usd + spend.reserveUsd > closedTotalCapUsd())) return { ok: false as const, refusal: 'closed-spend' as const };
    if (closed) await tx`insert into studio.image_asks (fid, pool) values (${fid}, 'closed')`;
    else await tx`insert into studio.image_asks (fid) values (${fid})`;
    await addCost(tx as unknown as Sql, 'free', 'reserved', spend.model.id, '', '', 1, spend.reserveUsd);
    return { ok: true as const, left: left - weight };
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
