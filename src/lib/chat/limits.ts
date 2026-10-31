import type postgres from 'postgres';
import { CHAT } from '../config';

/**
 * The daily limit (CHAT.messagesPerDay per FID), counted in studio.chat_calls:
 * one row per question, with the FID and the time. The day's spend cap
 * (CHAT.dailySpendCapUsd across everyone), summed from studio.chat_costs: daily
 * totals of the model calls, with no FID, no request id and no time of day, so
 * no cost can be matched to a question (migration 0007). Neither holds content.
 * Days are UTC.
 *
 * Make mode (routing C, owner 2026-10-30) has its own limits, kept in the same two tables with no migration:
 * - a make conversation is a chat_calls row whose model is CHAT.make.model (FID and time, as for a question);
 *   CHAT.make.conversationsPerDay of them per FID per day. They don't count against CHAT.messagesPerDay;
 * - make spend is the chat_costs rows whose model is CHAT.make.model, capped at CHAT.make.dailySpendCapUsd.
 *   The chat's own cap (book questions, and the routing call) sums every other row.
 */
export type Refusal = 'limit' | 'spend';
export type MakeRefusal = 'make-limit' | 'make-spend';

/** Worst case for one question: a full answer plus a full guard check. */
export function worstCaseUsd(maxAnswerTokens: number, maxGuardTokens: number, inputTokens = 8000): number {
  const a = CHAT.prices[CHAT.model];
  const g = CHAT.prices[CHAT.guardModel];
  return inputTokens * a.input + maxAnswerTokens * a.output + inputTokens * g.input + maxGuardTokens * g.output;
}

export async function usedToday(sql: postgres.Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.chat_calls where fid = ${fid} and kind = 'ask' and model <> ${CHAT.make.model} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return r.n as number;
}

export async function spentToday(sql: postgres.Sql): Promise<number> {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs where day = (now() at time zone 'utc')::date and model <> ${CHAT.make.model}`;
  return r.usd as number;
}

/** Make conversations this FID started today (UTC). */
export async function makeStartedToday(sql: postgres.Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.chat_calls where fid = ${fid} and kind = 'ask' and model = ${CHAT.make.model} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return r.n as number;
}

/** Make mode's spend today (UTC), across everyone. */
export async function makeSpentToday(sql: postgres.Sql): Promise<number> {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs where day = (now() at time zone 'utc')::date and model = ${CHAT.make.model}`;
  return r.usd as number;
}

/** The chat's spend check alone (no message taken): for the routing call, which runs before a turn is known to be a question. */
export async function chatSpendOk(sql: postgres.Sql, worstUsd: number): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.chat.spend'))`;
    return (await spentToday(tx as unknown as postgres.Sql)) + worstUsd <= CHAT.dailySpendCapUsd;
  });
}

/**
 * May this make call go ahead? For a new conversation (`fid` given), also this person's count. Takes nothing: a
 * conversation is recorded (makeStart) only once its first call has been answered, so an outage costs nobody one.
 */
export async function makeCheck(sql: postgres.Sql, worstUsd: number, fid?: number): Promise<{ ok: true } | { ok: false; reason: MakeRefusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.chat.make.spend'))`;
    if (fid !== undefined && (await makeStartedToday(tx as unknown as postgres.Sql, fid)) >= CHAT.make.conversationsPerDay) return { ok: false as const, reason: 'make-limit' as const };
    if ((await makeSpentToday(tx as unknown as postgres.Sql)) + worstUsd > CHAT.make.dailySpendCapUsd) return { ok: false as const, reason: 'make-spend' as const };
    return { ok: true as const };
  });
}

/** Record a new make conversation for this FID (a chat_calls row: FID, time, CHAT.make.model). Returns how many are left today. */
export async function makeStart(sql: postgres.Sql, fid: number): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${'snowmoon.chat.fid.' + fid}))`;
    await tx`insert into studio.chat_calls (fid, kind, model) values (${fid}, 'ask', ${CHAT.make.model})`;
    return Math.max(0, CHAT.make.conversationsPerDay - (await makeStartedToday(tx as unknown as postgres.Sql, fid)));
  });
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
