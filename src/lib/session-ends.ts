import 'server-only';
import type postgres from 'postgres';

/**
 * "Sign out on every device" (owner, 2026-11-23; branch session-30d; studio.session_ends, NEXT_session_ends.sql): one
 * row per person, the moment they last chose it. Every session issued before that moment is over: src/lib/auth.ts
 * checks it on every request that carries the site's own session (Farcaster on the website, wallet, Lens, Bluesky),
 * for the person it signs in as and the account it is. Farcaster's own Quick Auth token, inside the Farcaster app, is
 * Farcaster's and isn't affected.
 *
 * Without the table (before the migration is applied) nothing is ended. If the database can't be read, a session is
 * not ended either (and the error's code is logged): a hiccup must not sign everyone out, since a 401 makes the page
 * forget its session.
 */
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
    if (code !== '42P01') console.error('session-ends: read failed', code ?? (e as Error).name);
    return false;
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
