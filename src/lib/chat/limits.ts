import type postgres from 'postgres';
import { CHAT } from '../config';

/**
 * The daily limit (CHAT.messagesPerDay per FID) and the day's spend cap
 * (CHAT.dailySpendCapUsd across everyone), counted in studio.chat_calls
 * (migration 0006), which holds counts and cost, never content. Days are UTC.
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
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_calls where at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
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

export interface CallRecord {
  fid: number;
  kind: 'search' | 'answer' | 'guard';
  model: string;
  provider: string | null;
  requestId: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  guard?: 'ok' | 'flagged' | 'none' | null;
}

export async function record(sql: postgres.Sql, c: CallRecord): Promise<void> {
  await sql`insert into studio.chat_calls (fid, kind, model, provider, request_id, prompt_tokens, completion_tokens, cost_usd, guard)
            values (${c.fid}, ${c.kind}, ${c.model}, ${c.provider}, ${c.requestId}, ${c.promptTokens}, ${c.completionTokens}, ${c.costUsd}, ${c.guard ?? null})`;
}
