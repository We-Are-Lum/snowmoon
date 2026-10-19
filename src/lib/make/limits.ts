import type postgres from 'postgres';
import { CHAT } from '../config';
import { spentToday, type Refusal } from '../chat/limits';
import { MAKE } from './draft';

/**
 * The coach's daily count (owner, 2026-10-19: "coach 50 a day"): MAKE.coachPerDay messages per person per UTC day,
 * counted in studio.coach_calls (draft migration 0017): one row per message, the person (a FID, or minus a wallet
 * account's number) and the time, nothing else. Its own count, apart from the reading assistant's. Rows older than
 * MAKE.coachCountDays are deleted as new ones come in.
 *
 * The day's spend cap is the assistant's (CHAT.dailySpendCapUsd across everyone, summed from studio.chat_costs, where
 * the coach's model calls are added too): the same lock, so a coach message and a question can't both slip under it.
 */
export async function reserveCoach(sql: postgres.Sql, person: number, worstUsd: number): Promise<{ ok: true; left: number } | { ok: false; reason: Refusal }> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.chat.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext(${'snowmoon.make.coach.' + person}))`;
    await tx`delete from studio.coach_calls where at < now() - make_interval(days => ${MAKE.coachCountDays})`;
    const [{ n }] = await tx`select count(*)::int as n from studio.coach_calls where person = ${person} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
    if (n >= MAKE.coachPerDay) return { ok: false as const, reason: 'limit' as const };
    if ((await spentToday(tx as unknown as postgres.Sql)) + worstUsd > CHAT.dailySpendCapUsd) return { ok: false as const, reason: 'spend' as const };
    await tx`insert into studio.coach_calls (person) values (${person})`;
    return { ok: true as const, left: MAKE.coachPerDay - n - 1 };
  });
}
