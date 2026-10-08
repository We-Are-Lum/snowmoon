import type postgres from 'postgres';
import { CHAT } from '../config';

/**
 * The daily limit (CHAT.messagesPerDay per FID), counted in studio.chat_calls:
 * one row per question, with the FID and the time. The day's spend cap
 * (CHAT.dailySpendCapUsd across everyone), summed from studio.chat_costs: daily
 * totals of the model calls, with no FID, no request id and no time of day, so
 * no cost can be matched to a question (migration 0007). Neither holds content.
 * Days are UTC.
 */
export type Refusal = 'limit' | 'spend';

/** Worst case for one question: a full answer plus a full guard check. */
export function worstCaseUsd(maxAnswerTokens: number, maxGuardTokens: number, inputTokens = 8000): number {
  const a = CHAT.prices[CHAT.model];
  const g = CHAT.prices[CHAT.guardModel];
  return inputTokens * a.input + maxAnswerTokens * a.output + inputTokens * g.input + maxGuardTokens * g.output;
}

export async function usedToday(sql: postgres.Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.chat_calls where fid = ${fid} and kind = 'ask' and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return r.n as number;
}

export async function spentToday(sql: postgres.Sql): Promise<number> {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs where day = (now() at time zone 'utc')::date`;
  return r.usd as number;
}

/**
 * Take one of today's messages for this FID, or say why not. Locks per FID and
 * for the spend check, so parallel requests cannot both slip under a limit; the
 * spend check reserves the worst case of a call, so the cap is never overshot.
 */
export async function reserve(sql: postgres.Sql, fid: number, worstUsd: number): Promise<{ ok: true; left: number } | { ok: false; reason: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.chat.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext(${'snowmoon.chat.fid.' + fid}))`;
    const used = await usedToday(tx as unknown as postgres.Sql, fid);
    if (used >= CHAT.messagesPerDay) return { ok: false as const, reason: 'limit' as const };
    const spent = await spentToday(tx as unknown as postgres.Sql);
    if (spent + worstUsd > CHAT.dailySpendCapUsd) return { ok: false as const, reason: 'spend' as const };
    await tx`insert into studio.chat_calls (fid, kind, model) values (${fid}, 'ask', ${CHAT.model})`;
    return { ok: true as const, left: CHAT.messagesPerDay - used - 1 };
  });
}

/** One model call's cost. Deliberately no FID, request id or time: it is added to the day's totals. */
export interface CallRecord {
  kind: 'search' | 'answer' | 'guard';
  model: string;
  provider: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  guard?: 'ok' | 'flagged' | 'none' | null;
}

export async function record(sql: postgres.Sql, c: CallRecord): Promise<void> {
  await sql`insert into studio.chat_costs (kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
            values (${c.kind}, ${c.model}, ${c.provider ?? ''}, ${c.guard ?? ''}, 1, ${c.promptTokens}, ${c.completionTokens}, ${c.costUsd})
            on conflict (day, kind, model, provider, guard) do update set
              calls = studio.chat_costs.calls + 1,
              prompt_tokens = studio.chat_costs.prompt_tokens + excluded.prompt_tokens,
              completion_tokens = studio.chat_costs.completion_tokens + excluded.completion_tokens,
              cost_usd = studio.chat_costs.cost_usd + excluded.cost_usd`;
}
