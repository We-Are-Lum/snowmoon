import type postgres from 'postgres';
import type { CallRecord, Refusal } from '../chat/limits';
import { MAKE } from './draft';

/**
 * The coach's own limits (owner, 2026-10-19), apart from the reading assistant's:
 * - a daily count per person: MAKE.coachPerDay for a Farcaster account or a wallet with at least one payment,
 *   MAKE.coachPerDayUnpaidWallet for a wallet that has never paid. Counted in studio.coach_calls (draft migration
 *   0017): one row per message, the person (a FID, or minus a wallet account's number) and the time, nothing else.
 *   Rows older than MAKE.coachCountDays are deleted as new ones come in.
 * - a daily spend cap across everyone, MAKE.coachSpendCapUsd, summed from its own cost rows (studio.coach_costs:
 *   daily totals of model calls with no person, no request id and no time of day, like the assistant's chat_costs).
 */
type Sql = postgres.Sql;

/** A person's daily count: a wallet account that has never paid gets fewer. */
export async function coachPerDay(sql: Sql, person: number): Promise<number> {
  if (person > 0) return MAKE.coachPerDay;
  const [r] = await sql`select exists (select 1 from studio.wallet_payments where account_id = ${-person}) as paid`;
  return r.paid ? MAKE.coachPerDay : MAKE.coachPerDayUnpaidWallet;
}

export async function coachSpentToday(sql: Sql): Promise<number> {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.coach_costs where day = (now() at time zone 'utc')::date`;
  return r.usd as number;
}

/**
 * Take one of today's coach messages for this person, or say why not. Locks per person and for the spend check, so
 * parallel requests cannot both slip under a limit; the spend check reserves the worst case of a message.
 */
export async function reserveCoach(sql: Sql, person: number, worstUsd: number): Promise<{ ok: true; left: number } | { ok: false; reason: Refusal; perDay?: number }> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.make.coach.spend'))`;
    await tx`select pg_advisory_xact_lock(hashtext(${'snowmoon.make.coach.' + person}))`;
    await tx`delete from studio.coach_calls where at < now() - make_interval(days => ${MAKE.coachCountDays})`;
    const perDay = await coachPerDay(t, person);
    const [{ n }] = await tx`select count(*)::int as n from studio.coach_calls where person = ${person} and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
    if (n >= perDay) return { ok: false as const, reason: 'limit' as const, perDay };
    if ((await coachSpentToday(t)) + worstUsd > MAKE.coachSpendCapUsd) return { ok: false as const, reason: 'spend' as const };
    await tx`insert into studio.coach_calls (person) values (${person})`;
    return { ok: true as const, left: perDay - n - 1 };
  });
}

/** One coach model call's cost, added to the day's totals in studio.coach_costs. */
export async function recordCoach(sql: Sql, c: Omit<CallRecord, 'kind'> & { kind: 'answer' | 'guard' }): Promise<void> {
  await sql`insert into studio.coach_costs (kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
            values (${c.kind}, ${c.model}, ${c.provider ?? ''}, ${c.guard ?? ''}, 1, ${c.promptTokens}, ${c.completionTokens}, ${c.costUsd})
            on conflict (day, kind, model, provider, guard) do update set
              calls = studio.coach_costs.calls + 1,
              prompt_tokens = studio.coach_costs.prompt_tokens + excluded.prompt_tokens,
              completion_tokens = studio.coach_costs.completion_tokens + excluded.completion_tokens,
              cost_usd = studio.coach_costs.cost_usd + excluded.cost_usd`;
}
