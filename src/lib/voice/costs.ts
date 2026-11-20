import 'server-only';
import type postgres from 'postgres';
import { VOICE } from '../config';
import { isAdmin } from '../admins';

/**
 * Voice costs, as daily totals in studio.voice_costs (no person, no request id; NEXT_ephelion_voice.sql), and the caps
 * (src/lib/config.ts VOICE.caps). A call reserves its worst case first, then settles at its real cost. The owner's
 * standing rule (2026-11-20): once a day's measured credits are more than 20% over its estimates, every call is refused
 * until the next UTC day.
 */
export type Funded = 'free' | 'admin';
export type CostKind = 'convert' | 'transcribe' | 'reading';
export const fundedFor = (fid: number): Funded => (isAdmin(fid) ? 'admin' : 'free');
export const usdFor = (credits: number) => (credits * VOICE.rates.usdPer1000Credits) / 1000;
const TODAY = "((now() at time zone 'utc')::date)";

export interface Today {
  credits: number;
  usd: number;
  estimated: number;
  measured: number;
  conversionsByPerson: number;
}

export async function today(sql: postgres.Sql, funded: Funded, fid: number): Promise<Today> {
  const [r] = await sql`
    select coalesce(sum(greatest(credits, estimated_credits)), 0)::float8 as credits, coalesce(sum(cost_usd), 0)::float8 as usd,
      coalesce(sum(estimated_credits) filter (where kind <> 'reserved' and credits > 0), 0)::float8 as estimated,
      coalesce(sum(credits) filter (where kind <> 'reserved' and estimated_credits > 0), 0)::float8 as measured
    from studio.voice_costs where day = ${sql.unsafe(TODAY)} and funded = ${funded}`;
  const [a] = await sql`select count(*)::int as n from studio.voice_asks where fid = ${fid} and at >= ${sql.unsafe(TODAY)}`;
  return { credits: r.credits, usd: r.usd, estimated: r.estimated, measured: r.measured, conversionsByPerson: a.n };
}

/** Why a call can't run now, or null. `whole`: a whole-take conversion, which counts against the person's daily number. */
export async function refusal(sql: postgres.Sql, fid: number, estimatedCredits: number, whole: boolean): Promise<string | null> {
  const funded = fundedFor(fid);
  const t = await today(sql, funded, fid);
  if (t.estimated > 0 && t.measured > VOICE.caps.overEstimate * t.estimated)
    return `Today's voice calls cost more than ${Math.round((VOICE.caps.overEstimate - 1) * 100)}% over their estimates (${t.measured} credits against ${t.estimated}). Calls are stopped until tomorrow (UTC) so an admin can look.`;
  const capCredits = funded === 'admin' ? VOICE.caps.adminDailyCredits : VOICE.caps.dailyCredits;
  const capUsd = funded === 'admin' ? VOICE.caps.adminDailyUsd : VOICE.caps.dailyUsd;
  if (t.credits + estimatedCredits > capCredits || t.usd + usdFor(estimatedCredits) > capUsd) return "Today's voice allowance is used up. It resets at midnight UTC.";
  if (whole && t.conversionsByPerson >= VOICE.caps.perPersonConversions) return `You've converted ${VOICE.caps.perPersonConversions} whole takes today. Redo single sentences, or come back tomorrow.`;
  return null;
}

const upsert = (sql: postgres.Sql, row: { kind: string; model: string; funded: Funded; verdict: string; calls: number; seconds: number; characters: number; credits: number; estimated: number; usd: number }) => sql`
  insert into studio.voice_costs (kind, model, funded, verdict, calls, seconds, characters, credits, estimated_credits, cost_usd)
  values (${row.kind}, ${row.model}, ${row.funded}, ${row.verdict}, ${row.calls}, ${row.seconds}, ${row.characters}, ${row.credits}, ${row.estimated}, ${row.usd})
  on conflict (day, funded, kind, model, verdict) do update set
    calls = studio.voice_costs.calls + excluded.calls, seconds = studio.voice_costs.seconds + excluded.seconds,
    characters = studio.voice_costs.characters + excluded.characters, credits = studio.voice_costs.credits + excluded.credits,
    estimated_credits = studio.voice_costs.estimated_credits + excluded.estimated_credits, cost_usd = studio.voice_costs.cost_usd + excluded.cost_usd`;

/** Hold a call's worst case. Returns the settle function, to be called once with the call's outcome. */
export async function reserve(sql: postgres.Sql, fid: number, model: string, estimatedCredits: number, whole: boolean) {
  const funded = fundedFor(fid);
  await upsert(sql, { kind: 'reserved', model, funded, verdict: '', calls: 1, seconds: 0, characters: 0, credits: 0, estimated: estimatedCredits, usd: usdFor(estimatedCredits) });
  if (whole) await sql`insert into studio.voice_asks (fid) values (${fid})`;
  let settled = false;
  return async (e: { kind: CostKind; ok: boolean; seconds: number; characters?: number; estimatedCredits: number; credits: number | null; usd?: number }) => {
    if (!settled) {
      settled = true;
      await upsert(sql, { kind: 'reserved', model, funded, verdict: '', calls: -1, seconds: 0, characters: 0, credits: 0, estimated: -estimatedCredits, usd: -usdFor(estimatedCredits) });
    }
    // An unknown real cost is counted at the estimate, and left out of the over-estimate rule (it has no measurement).
    const credits = e.credits ?? 0;
    const usd = e.usd ?? usdFor(e.credits ?? e.estimatedCredits);
    await upsert(sql, {
      kind: e.kind,
      model: e.kind === 'transcribe' ? VOICE.models.transcribe : model,
      funded,
      verdict: e.ok ? 'ok' : 'failed',
      calls: 1,
      seconds: e.seconds,
      characters: e.characters ?? 0,
      credits: e.credits === null ? e.estimatedCredits : credits,
      estimated: e.credits === null ? 0 : e.estimatedCredits,
      usd,
    });
  };
}
