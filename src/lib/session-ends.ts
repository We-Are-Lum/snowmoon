import 'server-only';
import type postgres from 'postgres';

/**
 * "Sign out on every device" (owner, 2026-11-23; branch session-30d; studio.session_ends, 0051_session_ends.sql): one
 * row per person, the moment they last chose it. Every session issued before that moment is over: src/lib/auth.ts
 * checks it on every request that carries the site's own session (Farcaster on the website, wallet, Lens, Bluesky),
 * for the person it signs in as and the account it is. Farcaster's own Quick Auth token, inside the Farcaster app, is
 * Farcaster's and isn't affected.
 *
 * Without the table (before the migration is applied: 42P01) nothing is ended. Any other error reading it fails closed
 * (owner, 2026-11-23): sessionEnded throws SessionCheckUnavailable, so the route answers 500 or 503, never 401. The page
 * forgets its session only on a 401, so it keeps it through an outage, and an ended session never works during one.
 */
export class SessionCheckUnavailable extends Error {
  constructor(readonly code: string | undefined) {
    super('the sign-in check could not be read');
    this.name = 'SessionCheckUnavailable';
  }
}
type Sql = postgres.Sql;

const people = (persons: (number | null | undefined)[]) => [...new Set(persons.filter((p): p is number => Number.isSafeInteger(p) && p !== 0))];

/** Whether a session issued at `at` (ms) for any of these people was ended by "Sign out on every device". */
export async function sessionEnded(sql: Sql | null, persons: (number | null | undefined)[], at: number): Promise<boolean> {
  const ps = people(persons);
  if (!sql || !ps.length) return false;
  try {
    const rows = await sql`select 1 from studio.session_ends where person in ${sql(ps)} and ended_at > ${new Date(at)} limit 1`;
    return rows.length > 0;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === '42P01') return false;
    console.error('session-ends: read failed', code ?? (e as Error).name);
    throw new SessionCheckUnavailable(code);
  }
}

/** End every session of these people issued before now. */
export async function endEverywhere(sql: Sql, persons: (number | null | undefined)[]): Promise<{ ok: true; at: string } | { ok: false; why: 'not-here' }> {
  const ps = people(persons);
  try {
    const [r] = await sql<{ at: Date }[]>`
      insert into studio.session_ends ${sql(ps.map((person) => ({ person })))}
      on conflict (person) do update set ended_at = now()
      returning ended_at as at`;
    return { ok: true, at: new Date(r?.at ?? Date.now()).toISOString() };
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return { ok: false, why: 'not-here' };
    throw e;
  }
}
