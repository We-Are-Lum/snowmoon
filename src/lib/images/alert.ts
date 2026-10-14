import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';

/**
 * Report alerts (owner, 2026-10-09): when an image is reported or hidden, an ntfy push to
 * SNOWMOON_ALERT_URL saying only "Snowmoon: N reports waiting". No image, prompt, FID, name, URL
 * or reason; no header but Content-Type. At most one per IMAGES.alertEveryMinutes across every
 * server: the send time is claimed in studio.alert_state (migration 0010) in one statement, so two
 * servers can't both send. Never throws: an alert failing never breaks a report or a hide.
 *
 * "Reports waiting" is the moderator queue (reportQueue in data.ts): images whose latest step
 * among reported / hidden / dismissed is a report, or a hide by a stated rule (which stays until a
 * moderator looks). N counts the reports on those images made since each one's last dismissal.
 */
type Sql = postgres.Sql;

export async function reportsWaiting(sql: Sql): Promise<number> {
  const [r] = await sql`
    with last as (
      select distinct on (element_id) element_id, step, role from studio.removal_log
      where step in ('reported', 'hidden', 'dismissed') order by element_id, at desc),
    queued as (select element_id from last where step = 'reported' or (step = 'hidden' and role = 'rule'))
    select count(*)::int as n from studio.removal_log l join queued q on q.element_id = l.element_id
    where l.step = 'reported' and l.at > coalesce(
      (select max(d.at) from studio.removal_log d where d.element_id = l.element_id and d.step = 'dismissed'), '-infinity')`;
  return r?.n ?? 0;
}

export const alertBody = (n: number) => `Snowmoon: ${n} reports waiting`;

/** Sends one alert if one is due. Resolves to what happened, for the tests and the log. */
export async function alertReports(sql: Sql): Promise<'sent' | 'unset' | 'none-waiting' | 'too-soon' | 'failed'> {
  const url = process.env.SNOWMOON_ALERT_URL;
  if (!url) {
    console.log('report alert: SNOWMOON_ALERT_URL not set');
    return 'unset';
  }
  try {
    const n = await reportsWaiting(sql);
    if (n <= 0) return 'none-waiting';
    const every = Number(IMAGES.alertEveryMinutes);
    const [claimed] = await sql`
      insert into studio.alert_state (kind, sent_at) values ('reports', now())
      on conflict (kind) do update set sent_at = now()
      where studio.alert_state.sent_at < now() - make_interval(mins => ${every}::int)
      returning sent_at::text as t`;
    if (!claimed) return 'too-soon';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: alertBody(n),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return 'sent';
      console.error('report alert: HTTP', res.status);
    } catch (e) {
      console.error('report alert: failed', (e as Error).name);
    }
    // Not sent: give the hour back, so the next report tries again.
    await sql`update studio.alert_state set sent_at = '-infinity' where kind = 'reports' and sent_at = ${claimed.t}::timestamptz`;
    return 'failed';
  } catch (e) {
    console.error('report alert: failed', (e as { code?: string }).code ?? (e as Error).name);
    return 'failed';
  }
}

export const prepaidAlertBody = (share: number) =>
  `Snowmoon: prepaid images reached ${Math.round(share * 100)}% of today's $${IMAGES.prepaid.safetyCapUsd} safety cap`;

/**
 * The prepaid circuit breaker's alerts (owner, 2026-10-14): one ntfy push at each share of
 * IMAGES.prepaid.safetyCapUsd, at most once per UTC day per share across every server (claimed in
 * studio.alert_state as 'prepaid-50' or 'prepaid-100', migration 0012). Only the share and the cap:
 * no wallet, amount per person or prompt. Never throws.
 */
export async function alertPrepaid(sql: Sql, share: number): Promise<'sent' | 'unset' | 'already' | 'failed'> {
  const url = process.env.SNOWMOON_ALERT_URL;
  if (!url) {
    console.log('prepaid alert: SNOWMOON_ALERT_URL not set');
    return 'unset';
  }
  try {
    const kind = `prepaid-${Math.round(share * 100)}`;
    const [claimed] = await sql`
      insert into studio.alert_state (kind, sent_at) values (${kind}, now())
      on conflict (kind) do update set sent_at = now()
      where studio.alert_state.sent_at < date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      returning sent_at::text as t`;
    if (!claimed) return 'already';
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: prepaidAlertBody(share), signal: AbortSignal.timeout(5000) });
    if (res.ok) return 'sent';
    console.error('prepaid alert: HTTP', res.status);
  } catch (e) {
    // Before migration 0012 the claim itself fails (alert_state allows only 'reports').
    console.error('prepaid alert: failed', (e as { code?: string }).code ?? (e as Error).name);
  }
  return 'failed';
}
