import 'server-only';
import type postgres from 'postgres';
import { ADMINS, CHALLENGE, IMAGES } from '../config';
import { checkWords } from '../images/paid';
import { BACKSTORY_WORDING, readBackstory, storedBackstory, type StoredBackstory } from './backstory';

/**
 * Backstories (owner, 2026-11-09). A new challenge picture's goes in its version's body at publish
 * (src/app/api/images/publish/route.ts). A picture already published can't take one there: studio.element_versions is
 * append-only (0001_core.sql's trigger), so for the owner's own pictures and first remixes, "Add backstory" writes one
 * row of studio.challenge_backstories (NEXT_challenge_backstories.sql, NOT APPLIED), keyed by the version, so the
 * picture's page, its id, its version and its lineage (links, recipe) stay exactly as they are. The page reads the
 * body's first, then the table's (only once the table exists). Hiding follows the picture: a hidden element's page is
 * gone, and its backstory with it.
 */
type Sql = postgres.Sql;

/** The prompt check on a backstory: blocked names, then the same guard with the larger budget (1,200 tokens). */
export const checkBackstory = (sql: Sql, request: Request, text: string) =>
  checkWords(sql, request, text, { maxTokens: IMAGES.designs.guardMaxTokens, refused: BACKSTORY_WORDING.refused });

/** Whether studio.challenge_backstories exists on this database (NEXT_challenge_backstories.sql applied). */
export async function backstoriesTable(sql: Sql): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select to_regclass('studio.challenge_backstories') is not null as ok`;
  return Boolean(r?.ok);
}

/** A version's backstory: its body's, else the one added later (the latest row), else null. */
export async function backstoryOf(sql: Sql, versionId: string, body?: unknown): Promise<StoredBackstory | null> {
  const fromBody = storedBackstory((body as { backstory?: unknown } | undefined)?.backstory);
  if (fromBody) return fromBody;
  if (!(await backstoriesTable(sql).catch(() => false))) return null;
  const [r] = await sql<{ text: string; spoils: boolean; added_at: string }[]>`
    select text, spoils, added_at::text from studio.challenge_backstories where version_id = ${versionId} order by added_at desc limit 1`;
  return r ? { text: r.text, spoils: r.spoils, at: new Date(r.added_at).toISOString() } : null;
}

export type AddRefusal = { status: number; error: string };

/**
 * "Add backstory" (admins, on their own published challenge pictures and first remixes): checks who and what, then the
 * prompt check (`check`, injectable for tests), then one row. Nothing else is written or changed.
 */
export async function addBackstory(sql: Sql, who: number, versionId: string, input: unknown, check: (text: string) => Promise<{ ok: true } | { ok: false; status: number; error: string }>): Promise<{ ok: true; backstory: StoredBackstory } | ({ ok: false } & AddRefusal)> {
  if (!ADMINS.includes(who)) return { ok: false, status: 403, error: 'Only an admin can add a backstory here.' };
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return { ok: false, status: 404, error: 'Not found' };
  const [v] = await sql<{ fid: number; element_type: string; status: string; challenge: boolean; body: unknown }[]>`
    select e.created_by_fid::int as fid, e.element_type, e.status, coalesce(r.params ? 'challenge', false) as challenge, v.body
    from studio.element_versions v join studio.elements e on e.id = v.element_id left join studio.recipes r on r.id = v.recipe_id
    where v.id = ${versionId}`;
  const firstRemix = Object.values(CHALLENGE.firstRemixes as Record<string, readonly string[]>).some((l) => l.map((x) => x.toLowerCase()).includes(versionId.toLowerCase()));
  if (!v || v.status !== 'published' || !(v.challenge || firstRemix)) return { ok: false, status: 404, error: 'Not a published challenge picture or first remix.' };
  if (Number(v.fid) !== who) return { ok: false, status: 403, error: 'Only its maker can add a backstory.' };
  const r = readBackstory(input);
  if (!r.ok) return { ok: false, status: 400, error: r.error };
  if (!r.backstory) return { ok: false, status: 400, error: 'Write the backstory first.' };
  if (!(await backstoriesTable(sql))) return { ok: false, status: 503, error: 'Adding a backstory isn’t set up on this database yet.' };
  const c = await check(r.backstory.text);
  if (!c.ok) return { ok: false, status: c.status, error: c.error };
  const [row] = await sql<{ added_at: string }[]>`insert into studio.challenge_backstories ${sql({ version_id: versionId, text: r.backstory.text, spoils: r.backstory.spoils, added_by: who })} returning added_at::text`;
  return { ok: true, backstory: { ...r.backstory, at: new Date(row.added_at).toISOString() } };
}
