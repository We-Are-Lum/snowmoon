import type postgres from 'postgres';
import { SHEET_HELP } from '../config';

/**
 * "Ask for help"'s own limits (owner, 2026-10-31), apart from the assistant's and the coach's, with the coach's
 * reserve-then-record pattern (src/lib/make/limits.ts):
 * - SHEET_HELP.perDay messages per person (FID) per UTC day, counted in studio.sheet_help_calls
 *   (supabase/migrations/NEXT_sheet_help.sql): one row per message, the FID and the time, nothing else. Rows older
 *   than two days are deleted as new ones come in. A declined reply counts.
 * - SHEET_HELP.dailySpendCapUsd a day across everyone, summed from studio.sheet_help_costs: daily totals of model calls
 *   with no person, no request id and no time of day, like the assistant's chat_costs. The worst case of a message is
 *   reserved before any model call, so the cap is never overshot.
 */
type Sql = postgres.Sql;
export type HelpRefusal = 'limit' | 'spend';
const KEEP_DAYS = 2;

export async function helpSpentToday(sql: Sql): Promise<number> {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.sheet_help_costs where day = (now() at time zone 'utc')::date`;
  return r.usd as number;
}

/** Take one of today's messages for this FID, or say why not. Locks per FID and for the spend check. */
export async function reserveHelp(sql: Sql, fid: number, worstUsd: number): Promise<{ ok: true; left: number } | { ok: false; reason: HelpRefusal }> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.sheet-help.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext(${'snowmoon.sheet-help.' + fid}))`;
    await tx`delete from studio.sheet_help_calls where at < now() - make_interval(days => ${KEEP_DAYS})`;
    const [{ n }] = await tx`select count(*)::int as n from studio.sheet_help_calls where fid = ${fid} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
    if (n >= SHEET_HELP.perDay) return { ok: false as const, reason: 'limit' as const };
    if ((await helpSpentToday(t)) + worstUsd > SHEET_HELP.dailySpendCapUsd) return { ok: false as const, reason: 'spend' as const };
    await tx`insert into studio.sheet_help_calls (fid) values (${fid})`;
    return { ok: true as const, left: SHEET_HELP.perDay - n - 1 };
  });
}

export interface HelpCall {
  kind: 'answer' | 'guard';
  model: string;
  provider: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  guard?: 'ok' | 'flagged' | 'none' | null;
}

/** One model call's cost, added to the day's totals. Deliberately no FID, request id or time. */
export async function recordHelp(sql: Sql, c: HelpCall): Promise<void> {
  await sql`insert into studio.sheet_help_costs (kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
            values (${c.kind}, ${c.model}, ${c.provider ?? ''}, ${c.guard ?? ''}, 1, ${c.promptTokens}, ${c.completionTokens}, ${c.costUsd})
            on conflict (day, kind, model, provider, guard) do update set
              calls = studio.sheet_help_costs.calls + 1,
              prompt_tokens = studio.sheet_help_costs.prompt_tokens + excluded.prompt_tokens,
              completion_tokens = studio.sheet_help_costs.completion_tokens + excluded.completion_tokens,
              cost_usd = studio.sheet_help_costs.cost_usd + excluded.cost_usd`;
}
