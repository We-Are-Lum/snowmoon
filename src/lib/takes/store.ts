import 'server-only';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { IMAGES, TAKES } from '../config';
import { putPublicKey, storageReady } from '../images/store';
import { balanceUsd, debit, priceUsd } from '../wallet/credits';
import { perDay as picturesPerDay } from '../images/limits';
import { takesFakes } from './convert';

/**
 * Converted takes (studio.line_takes, DRAFT migration 0016) and their caps, the same shape as Remix's
 * (src/lib/remix/limits.ts): a count per person per day in studio.take_asks, and money only as daily
 * totals in studio.take_costs (no person, no row per call). Wallet accounts pay from their prepaid
 * balance at cost plus the markup, under the prepaid daily cap. Only converted takes are stored.
 */
type Sql = postgres.Sql;
const TODAY = `(now() at time zone 'utc')::date`;
export type Refusal = 'limit' | 'spend' | 'balance' | 'prepaid-spend';
export const perDay = (person: number) => (person in IMAGES.perDayFor ? picturesPerDay(person) : TAKES.perDay);

export interface Take {
  id: string;
  cue: string;
  speaker: string;
  person: number;
  audioUrl: string;
  audioSha256: string;
  seconds: number;
  byName: string | null;
  recipe: Record<string, unknown>;
  createdAt: string;
}

const testStore = () => (takesFakes() && process.env.TAKES_TEST_STORE ? process.env.TAKES_TEST_STORE : null);
export const takeStorageReady = () => Boolean(testStore()) || storageReady();

export async function putTake(sha256: string, bytes: Buffer, contentType: string): Promise<string> {
  const dir = testStore();
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${sha256}.wav`), bytes);
    return `/test-takes/${sha256}.wav`;
  }
  return putPublicKey(`takes/${sha256.slice(0, 32)}.wav`, bytes, contentType);
}

async function addCost(tx: Sql, funded: 'free' | 'prepaid', kind: 'convert' | 'reserved', calls: number, usd: number) {
  await tx`insert into studio.take_costs (funded, kind, model, calls, cost_usd) values (${funded}, ${kind}, ${TAKES.model.id}, ${calls}, ${usd})
    on conflict (day, funded, kind, model) do update set calls = studio.take_costs.calls + excluded.calls, cost_usd = studio.take_costs.cost_usd + excluded.cost_usd`;
}

export async function takesLeft(sql: Sql, person: number): Promise<number> {
  if (person < 0) return Math.floor((await balanceUsd(sql, -person)) / priceUsd(TAKES.reserveUsd));
  const [r] = await sql`select count(*)::int as n from studio.take_asks where person = ${person} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Math.max(0, perDay(person) - (r?.n ?? 0));
}

/** Before any call: the person's count (or balance) and today's spend, under one lock; the worst case is reserved. */
export async function reserveTake(sql: Sql, person: number): Promise<{ ok: true } | { ok: false; refusal: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.takes.spend'))`;
    const t = tx as unknown as Sql;
    if (person < 0) {
      const price = priceUsd(TAKES.reserveUsd);
      if ((await balanceUsd(t, -person)) < price) return { ok: false as const, refusal: 'balance' as const };
      const [paid] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.take_costs where day = ${tx.unsafe(TODAY)} and funded = 'prepaid'`;
      if (paid.usd + TAKES.reserveUsd > IMAGES.prepaid.dailyCapUsd) return { ok: false as const, refusal: 'prepaid-spend' as const };
      await debit(t, -person, price);
      await addCost(t, 'prepaid', 'reserved', 0, TAKES.reserveUsd);
      return { ok: true as const };
    }
    if ((await takesLeft(t, person)) <= 0) return { ok: false as const, refusal: 'limit' as const };
    const [free] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.take_costs where day = ${tx.unsafe(TODAY)} and funded = 'free'`;
    if (free.usd + TAKES.reserveUsd > TAKES.dailyFreeCapUsd) return { ok: false as const, refusal: 'spend' as const };
    await tx`insert into studio.take_asks (person) values (${person})`;
    await addCost(t, 'free', 'reserved', 0, TAKES.reserveUsd);
    return { ok: true as const };
  });
}

/** After the call (made or failed): the reservation is replaced by the real cost. No refunds to a wallet, as in Pictures. */
export async function settleTake(sql: Sql, person: number, costUsd: number): Promise<void> {
  const funded = person < 0 ? 'prepaid' : 'free';
  await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await addCost(t, funded, 'reserved', 0, -TAKES.reserveUsd);
    if (costUsd > 0) await addCost(t, funded, 'convert', 1, costUsd);
  });
}

type Row = { id: string; cue: string; speaker: string; person: string; audio_url: string; audio_sha256: string; seconds: number; by_name: string | null; recipe: Record<string, unknown>; created_at: Date };
const toTake = (r: Row): Take => ({ id: r.id, cue: r.cue, speaker: r.speaker, person: Number(r.person), audioUrl: r.audio_url, audioSha256: r.audio_sha256, seconds: Number(r.seconds), byName: r.by_name, recipe: r.recipe, createdAt: r.created_at.toISOString() });

export async function saveTake(sql: Sql, t: { adaptationId: number; versionId: number; cue: string; person: number; speaker: string; recipe: Record<string, unknown>; audioUrl: string; audioSha256: string; seconds: number; costUsd: number; byName: string | null }): Promise<Take> {
  const [r] = await sql<Row[]>`insert into studio.line_takes (adaptation_id, version_id, cue, person, speaker, recipe, audio_url, audio_sha256, seconds, cost_usd, by_name)
    values (${t.adaptationId}, ${t.versionId}, ${t.cue}, ${t.person}, ${t.speaker}, ${sql.json(t.recipe as never)}, ${t.audioUrl}, ${t.audioSha256}, ${t.seconds}, ${t.costUsd}, ${t.byName})
    returning id, cue, speaker, person, audio_url, audio_sha256, seconds, by_name, recipe, created_at`;
  return toTake(r);
}

/** Every shown take of one line, newest first: public, like Remix frames at their links. */
export async function lineTakes(sql: Sql, versionId: number, cue: string): Promise<Take[]> {
  const rows = await sql<Row[]>`select id, cue, speaker, person, audio_url, audio_sha256, seconds, by_name, recipe, created_at
    from studio.line_takes where version_id = ${versionId} and cue = ${cue} and not hidden order by created_at desc limit 50`;
  return rows.map(toTake);
}
