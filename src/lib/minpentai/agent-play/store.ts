/**
 * Where agent-play matches are kept (draft, 2026-10-31): studio.mp_agent_matches, one row a match, the whole
 * match as JSON (solo.ts SoloMatch), the real board included. Only the server reads it; every answer to a side
 * goes through solo.ts viewFor or simulate. Needs NEXT_minpentai_agent_matches.sql (not applied).
 *
 * Saves are guarded by a version number, so two calls for the same match at once can't both apply a turn: the
 * second finds the version moved and fails ("try again").
 */
import { randomBytes } from 'node:crypto';
import { db } from '~/lib/db';
import type { SoloMatch } from './solo';

export class StoreError extends Error {}
const need = () => {
  const sql = db();
  if (!sql) throw new StoreError('agent play needs the site database');
  return sql;
};

/** A new match id: 12 of a-z0-9. */
export const newId = () => {
  const b = randomBytes(12), A = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...b].map((x) => A[x % 36]).join('');
};
/** A new match's seed, from the server's random numbers (never from the agent). */
export const newSeed = () => randomBytes(4).readUInt32BE(0) % 2_147_483_647 || 1;

export async function insert(m: SoloMatch): Promise<void> {
  const sql = need();
  await sql`insert into studio.mp_agent_matches (id, person, agent_id, ruleset, level, state, over)
    values (${m.id}, ${m.person}, ${m.agent.id}, ${m.ruleset}, ${m.level}, ${sql.json(m as never)}, false)`;
}

export async function load(id: string): Promise<{ m: SoloMatch; version: number } | null> {
  if (!/^[a-z0-9]{12}$/.test(id)) return null;
  const sql = need();
  const [r] = await sql<{ state: SoloMatch; version: number }[]>`select state, version from studio.mp_agent_matches where id = ${id}`;
  return r ? { m: r.state, version: r.version } : null;
}

export async function save(m: SoloMatch, version: number): Promise<void> {
  const sql = need();
  const rows = await sql`update studio.mp_agent_matches set state = ${sql.json(m as never)}, over = ${!!m.end}, version = version + 1, updated_at = now()
    where id = ${m.id} and version = ${version} returning id`;
  if (!rows.length) throw new StoreError('the match changed while this call ran; try again');
}

export async function listFor(person: number, limit = 20): Promise<{ id: string; ruleset: string; level: number; over: boolean; updated_at: string }[]> {
  const sql = need();
  return await sql`select id, ruleset, level, over, updated_at from studio.mp_agent_matches where person = ${person} order by updated_at desc limit ${limit}`;
}

/** Live (unfinished) matches a person has: at most 5 at once. */
export async function liveCount(person: number): Promise<number> {
  const sql = need();
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from studio.mp_agent_matches where person = ${person} and not over`;
  return r?.n ?? 0;
}
