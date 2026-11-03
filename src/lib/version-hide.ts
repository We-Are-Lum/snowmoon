import 'server-only';
import { actsFor } from './wallet/credit';
import type postgres from 'postgres';
import { isAdmin } from './admins';

/**
 * "Hide" on a published scene version (studio.adaptation_versions.hidden, migration 0012: the one
 * column that may change), from the You page (owner, 2026-10-18: "your work … each with Hide"). The
 * same rule as remix frames and storyboards: its maker hides their own, the maintainer hides anything.
 * A hidden version leaves every public read at once (0012's public_read policy and shownVersion), and
 * /@<handle>/<id> then shows that person's latest public version, or "nothing here yet".
 *
 * Who hid it is recorded only once the DRAFT migration 0015 adds hidden_by, hidden_role and hidden_at.
 * Before that, a hide still works, but nobody can bring the version back from the site (we couldn't
 * tell a maker's hide from the maintainer's), so the answer says so; the maintainer can in the SQL Editor.
 */
type Sql = postgres.Sql;
export type VersionHideResult =
  | { ok: true; hidden: boolean; by: 'maker' | 'maintainer' | null; canUnhide: boolean }
  | { ok: false; status: number; error: string };

/**
 * Whether 0015's columns are there. Asked each time (one small catalogue read), not by trying the
 * query and catching the error, so a database without 0015 is never sent a failing statement.
 */
export async function hiddenByRecorded(sql: Sql): Promise<boolean> {
  const [r] = await sql`select exists (select 1 from information_schema.columns
    where table_schema = 'studio' and table_name = 'adaptation_versions' and column_name = 'hidden_role') as has`;
  return Boolean(r?.has);
}

async function read(sql: Sql, id: number): Promise<{ author: number; hidden: boolean; role: 'maker' | 'maintainer' | null | undefined } | null> {
  if (await hiddenByRecorded(sql)) {
    const [r] = await sql`select author_person, hidden, hidden_role from studio.adaptation_versions where id = ${id}`;
    return r ? { author: Number(r.author_person), hidden: Boolean(r.hidden), role: (r.hidden_role as 'maker' | 'maintainer' | null) ?? null } : null;
  }
  const [r] = await sql`select author_person, hidden from studio.adaptation_versions where id = ${id}`;
  return r ? { author: Number(r.author_person), hidden: Boolean(r.hidden), role: undefined } : null;
}

export async function setVersionHidden(sql: Sql, person: number, id: number, hide: boolean): Promise<VersionHideResult> {
  const v = await read(sql, id);
  if (!v) return { ok: false, status: 404, error: 'No such scene' };
  // A linked wallet's earlier scenes are its FID's (owner, 2026-10-22; src/lib/wallet/credit.ts).
  const maker = await actsFor(sql, person, v.author);
  const maint = isAdmin(person);
  // DRAFT wording for the owner.
  if (!maker && !maint) return { ok: false, status: 403, error: 'Only the person who made this scene can hide it.' };
  const recorded = v.role !== undefined;
  if (hide) {
    if (v.hidden) return { ok: true, hidden: true, by: v.role ?? null, canUnhide: recorded && v.role !== null && (v.role === 'maintainer' ? maint : maker) };
    const role = maker ? 'maker' : 'maintainer';
    if (recorded) await sql`update studio.adaptation_versions set hidden = true, hidden_by = ${person}, hidden_role = ${role}, hidden_at = now() where id = ${id}`;
    else await sql`update studio.adaptation_versions set hidden = true where id = ${id}`;
    return { ok: true, hidden: true, by: recorded ? role : null, canUnhide: recorded };
  }
  if (!v.hidden) return { ok: true, hidden: false, by: null, canUnhide: false };
  // DRAFT wording for the owner.
  // Not recorded: before 0015, or hidden before it ran (role null). Either could be the maintainer's hide.
  if (!recorded || v.role === null) return { ok: false, status: 409, error: 'A hidden scene can’t be brought back from the site yet. Ask the maintainer.' };
  if (v.role === 'maintainer' && !maint) return { ok: false, status: 403, error: 'This was hidden by the maintainer; only the maintainer can bring it back.' };
  if (v.role !== 'maintainer' && !maker) return { ok: false, status: 403, error: 'Only its maker can bring this back.' };
  await sql`update studio.adaptation_versions set hidden = false, hidden_by = null, hidden_role = null, hidden_at = null where id = ${id}`;
  return { ok: true, hidden: false, by: null, canUnhide: false };
}
