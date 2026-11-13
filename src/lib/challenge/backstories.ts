import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { checkWords } from '../images/paid';
import { BACKSTORY_WORDING, storedBackstory, type StoredBackstory } from './backstory';

/**
 * Backstories (owner, 2026-11-09): written at publish for new challenge pictures, in the new version's body
 * (src/app/api/images/publish/route.ts). Since 2026-11-12 (owner's spec) a picture's maker can also
 * add or change one on its page: each save is a new row of studio.challenge_backstories (NEXT_challenge_bounty_claims.sql),
 * append-only, and the newest row is the picture's backstory. element_versions stays append-only: a published body is
 * never edited. Without the table (the migration not yet applied), the body's backstory is the only one. Hiding follows
 * the picture.
 */
type Sql = postgres.Sql;

/** The prompt check on a backstory: blocked names, then the same guard with the larger budget (1,200 tokens). */
export const checkBackstory = (sql: Sql, request: Request, text: string, refused: string = BACKSTORY_WORDING.refused) =>
  checkWords(sql, request, text, { maxTokens: IMAGES.designs.guardMaxTokens, refused });

/** A version's backstory, from its body; null when it has none. */
export const backstoryOf = (body: unknown): StoredBackstory | null => storedBackstory((body as { backstory?: unknown } | null | undefined)?.backstory);

/** A picture's backstory now, with where it came from: the newest added row (its id), else its body's, else none. */
export type CurrentBackstory = StoredBackstory & { id: string | null };

const missing = (e: unknown) => (e as { code?: string })?.code === '42P01';

/** The newest backstory its maker added on its page, or null (none, or no table yet). */
export async function addedBackstory(sql: Sql, versionId: string): Promise<CurrentBackstory | null> {
  try {
    const [r] = await sql<{ id: string; text: string; added_at: Date }[]>`
      select id::text, text, added_at from studio.challenge_backstories where version_id = ${versionId} order by added_at desc, id desc limit 1`;
    return r ? { id: r.id, text: r.text, at: new Date(r.added_at).toISOString() } : null;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** The picture's backstory: the newest added one, else the one written at publish (its body), else null. */
export async function currentBackstory(sql: Sql, versionId: string, body: unknown): Promise<CurrentBackstory | null> {
  const added = await addedBackstory(sql, versionId);
  if (added) return added;
  const b = backstoryOf(body);
  return b ? { ...b, id: null } : null;
}

/** Keep a new backstory for a picture (a new row; nothing is updated or deleted). */
export async function addBackstory(sql: Sql, a: { versionId: string; person: number; text: string }): Promise<CurrentBackstory> {
  const [r] = await sql<{ id: string; added_at: Date }[]>`
    insert into studio.challenge_backstories (version_id, fid, text) values (${a.versionId}, ${a.person}, ${a.text}) returning id::text, added_at`;
  return { id: r.id, text: a.text, at: new Date(r.added_at).toISOString() };
}
