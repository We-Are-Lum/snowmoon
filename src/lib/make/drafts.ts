import type postgres from 'postgres';
import { cleanDraft, MAKE, type Draft } from './draft';

/**
 * Draft adaptations (studio.adaptation_drafts, draft migration supabase/drafts/0017_adaptation_drafts.sql): private
 * to the person who wrote them. Every read and write is scoped to that person here; another person's draft reads as
 * missing (404), never as forbidden, so ids reveal nothing.
 */
type Sql = postgres.Sql;

export interface SavedDraft {
  id: string;
  title: string;
  draft: Draft;
  updatedAt: string;
}

const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const row = (r: Record<string, unknown>): SavedDraft => ({ id: String(r.id), title: String(r.title), draft: cleanDraft(r.draft), updatedAt: new Date(r.updated_at as string).toISOString() });

export async function listDrafts(sql: Sql, person: number): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const rs = await sql`select id, title, updated_at from studio.adaptation_drafts where person = ${person} order by updated_at desc limit ${MAKE.draftsMax}`;
  return rs.map((r) => ({ id: String(r.id), title: String(r.title), updatedAt: new Date(r.updated_at as string).toISOString() }));
}

export async function getDraft(sql: Sql, person: number, id: string): Promise<SavedDraft | null> {
  if (!isId(id)) return null;
  const [r] = await sql`select * from studio.adaptation_drafts where id = ${id} and person = ${person}`;
  return r ? row(r) : null;
}

export async function createDraft(sql: Sql, person: number, raw: unknown): Promise<{ ok: true; draft: SavedDraft } | { ok: false; error: string }> {
  const d = cleanDraft(raw);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${'snowmoon.make.drafts.' + person}))`;
    const [{ n }] = await tx`select count(*)::int as n from studio.adaptation_drafts where person = ${person}`;
    if (n >= MAKE.draftsMax) return { ok: false as const, error: `You have ${MAKE.draftsMax} drafts. Delete one to start another.` };
    const [r] = await tx`insert into studio.adaptation_drafts (person, title, draft) values (${person}, ${d.title}, ${tx.json(d as never)}) returning *`;
    return { ok: true as const, draft: row(r) };
  });
}

export async function updateDraft(sql: Sql, person: number, id: string, raw: unknown): Promise<SavedDraft | null> {
  if (!isId(id)) return null;
  const d = cleanDraft(raw);
  const [r] = await sql`update studio.adaptation_drafts set title = ${d.title}, draft = ${sql.json(d as never)} where id = ${id} and person = ${person} returning *`;
  return r ? row(r) : null;
}

export async function deleteDraft(sql: Sql, person: number, id: string): Promise<boolean> {
  if (!isId(id)) return false;
  const rs = await sql`delete from studio.adaptation_drafts where id = ${id} and person = ${person} returning id`;
  return rs.length === 1;
}
