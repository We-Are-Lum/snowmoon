import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, IMAGES, WORK_ID } from '../config';
import { bookCharacter } from '../images/designs';
import { refusedBases } from './bases';
import { remixLines } from './lineage';
import { momentById } from './moments';
import { basesOf } from './rules';

/**
 * The challenge's pictures (owner, 2026-11-05; docs/proposals/challenge-moments.md §2.1): one picture of a challenge
 * character at one of the challenge's moments, made through the site's image pipeline from the remix screen
 * (/challenge/make). What it is is in its recipe, which the server signed before publishing (the ticket's `challenge`,
 * recorded as the recipe's params.challenge: the character remixed, the moment, and the picture it started from); its
 * links say what it was built on: a `uses` link to the base sheet it started from, or a `remixed_from` link to the
 * challenge picture it started from. No migration: the challenge tables and anchors take any element version.
 *
 * A picture counts as a remix for the challenge (picturesCount) when its moment is one of the fifteen, its character is
 * a challenge character (at any of the fifteen: owner, answer 4, "Surprise me" draws from all of them; answer 10, it
 * counts for the character remixed, the others drawn from their current default looks), and its line reaches one of
 * that character's bases: itself or a picture it was remixed from, step by step, `uses` a base (while the character
 * has no bases yet, any sheet of that character).
 * Read-only.
 */
type Sql = postgres.Sql | postgres.TransactionSql;

export interface ChallengePicture {
  versionId: string;
  elementId: string;
  /** The character remixed (CHALLENGE.characters' slug). */
  character: string;
  /** The moment's id (src/lib/challenge/moments.ts). */
  moment: string;
  /** The version it started from (a base sheet or another challenge picture). */
  from: string | null;
  byName: string | null;
  byFid: number;
  thumb: string | null;
  createdAt: string;
  /** Its words, as written (the recipe's user prompt): shown on its page. */
  words: string;
  /** Hidden or not published: never listed. */
  status: string;
}

const row = (r: Record<string, unknown>): ChallengePicture => {
  const p = (r.params ?? {}) as { challenge?: { character?: string; moment?: string; from?: string }; by_name?: string; user_prompt?: string };
  return {
    versionId: String(r.version_id), elementId: String(r.element_id), character: p.challenge?.character ?? '', moment: p.challenge?.moment ?? '',
    from: p.challenge?.from ?? null, byName: p.by_name ?? null, byFid: Number(r.created_by_fid), thumb: (r.asset_url as string | null) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(), words: p.user_prompt ?? '', status: String(r.status),
  };
};

/** Every published challenge picture of the six (a valid moment and character), newest first, or one by its version. */
export async function challengePictures(sql: Sql, opts: { versionId?: string; includeHidden?: boolean } = {}): Promise<ChallengePicture[]> {
  const rows = await sql`
    select e.id as element_id, e.created_by_fid, e.status, v.id as version_id, v.asset_url, date_trunc('milliseconds', v.created_at) as created_at, r.params
    from studio.elements e
    join studio.element_versions v on v.element_id = e.id and v.version_no = 1
    join studio.recipes r on r.id = v.recipe_id
    where e.element_type = 'image' and e.work_id = ${WORK_ID} and r.params ? 'challenge'
      ${opts.includeHidden ? sql`` : sql`and e.status = 'published'`}
      ${opts.versionId ? sql`and v.id = ${opts.versionId}` : sql``}
    order by date_trunc('milliseconds', v.created_at) desc, e.id desc`;
  return rows.map(row).filter((p) => CHALLENGE.characters.includes(p.character) && momentById(p.moment) !== null);
}

/** One step of a picture's line: the pictures it was remixed from (nearest first), then itself. */
type Step = { elementId: string; versionId: string };

/**
 * Whether each picture counts as a remix for the challenge: a valid moment and character (checked by
 * challengePictures), and its line reaches one of its character's bases through `uses` (a base by its element or
 * version id; a refused base doesn't count). While the character has no bases yet, a `uses` link to any published sheet
 * of that character counts, as sheets did before the bases.
 */
export async function picturesCount(sql: Sql, pics: ChallengePicture[], bases: Record<string, readonly string[]> = CHALLENGE.bases): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>(pics.map((p) => [p.versionId, false]));
  if (!pics.length) return out;
  const lines = await remixLines(sql as postgres.Sql, pics.map((p) => p.elementId));
  const steps = new Map<string, Step[]>(pics.map((p) => [p.versionId, [{ elementId: p.elementId, versionId: p.versionId }, ...(lines.get(p.elementId) ?? [])]]));
  const all = [...new Set([...steps.values()].flat().map((s) => s.versionId))];
  const used = await sql<{ from_version_id: string; to_version: string; to_element: string; entity: string }[]>`
    select l.from_version_id::text, tv.id::text as to_version, te.id::text as to_element, en.name as entity
    from studio.links l
    join studio.element_versions tv on tv.id = l.to_version_id
    join studio.elements te on te.id = tv.element_id and te.element_type = 'design' and te.status = 'published'
    join studio.entities en on en.id = te.entity_id and en.kind = 'character'
    where l.kind = 'uses' and l.from_version_id in ${sql(all)}`;
  const refused = await refusedBases(sql, bases);
  for (const p of pics) {
    const name = bookCharacter(p.character)?.name;
    const picked = basesOf(p.character, bases).filter((id) => !refused.has(id));
    const anyBase = basesOf(p.character, bases).length === 0;
    const mine = new Set(steps.get(p.versionId)!.map((s) => s.versionId));
    out.set(p.versionId, used.some((u) => mine.has(u.from_version_id) && u.entity === name && (anyBase || picked.includes(u.to_version.toLowerCase()) || picked.includes(u.to_element.toLowerCase()))));
  }
  return out;
}

/**
 * What the remix screen starts from (/challenge/make?from=<version>): one of a challenge character's published sheets
 * (a base, or before the bases are picked its newest sheet) by its front view, or a published challenge picture. Null
 * for anything else. `sha256` is the reference picture's, so the server reads exactly the bytes it names.
 */
export type Source =
  | { kind: 'sheet'; versionId: string; character: string; url: string; sha256: string; width: number; height: number; text: string; title: string; by: string | null; byFid: number; versionNo: number; moment: null }
  | { kind: 'picture'; versionId: string; character: string; url: string; sha256: string; width: number; height: number; moment: string; by: string | null; byFid: number };

export async function sourceOf(sql: Sql, versionId: string): Promise<Source | null> {
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return null;
  const [d] = await sql`
    select v.id, v.body, v.version_no, e.created_by_fid, en.name from studio.element_versions v
    join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
    where v.id = ${versionId} and e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind = 'character'`;
  if (d) {
    const character = CHALLENGE.characters.find((s) => bookCharacter(s)?.name === String(d.name));
    const b = (d.body ?? {}) as { views?: { front?: { url: string; sha256: string; recipe?: { width?: number; height?: number } } }; text?: string; title?: string; by_name?: string | null };
    const f = b.views?.front;
    if (!character || !f) return null;
    // Once the character's bases are picked, only a base is a sheet to start from (by its element or version id).
    const picked = basesOf(character);
    if (picked.length) {
      const [e] = await sql<{ element_id: string }[]>`select element_id::text from studio.element_versions where id = ${versionId}`;
      if (!picked.includes(String(d.id).toLowerCase()) && !picked.includes(String(e?.element_id ?? '').toLowerCase())) return null;
    }
    return { kind: 'sheet', versionId: String(d.id), character, url: f.url, sha256: f.sha256, width: f.recipe?.width ?? 576, height: f.recipe?.height ?? 768, text: b.text ?? '', title: b.title ?? '', by: b.by_name ?? null, byFid: Number(d.created_by_fid), versionNo: Number(d.version_no), moment: null };
  }
  const [p] = await challengePictures(sql, { versionId });
  if (!p || !p.thumb) return null;
  const [v] = await sql<{ asset_sha256: string }[]>`select asset_sha256 from studio.element_versions where id = ${versionId}`;
  return { kind: 'picture', versionId: p.versionId, character: p.character, url: p.thumb, sha256: v.asset_sha256, width: IMAGES.size.width, height: IMAGES.size.height, moment: p.moment, by: p.byName, byFid: p.byFid };
}

/**
 * A character's current default look (owner, answer 10): the front view of its first base (CHALLENGE.bases, in the
 * order the owner listed them: the current default look first), or before the bases are picked its newest published
 * sheet. For the other characters in a moment, sent as reference pictures. Null when there is none.
 */
export async function defaultLook(sql: Sql, character: string): Promise<Extract<Source, { kind: 'sheet' }> | null> {
  const name = bookCharacter(character)?.name;
  if (!name) return null;
  const first = basesOf(character)[0] ?? null;
  const rows = await sql`
    select v.id from studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
    where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind = 'character' and en.name = ${name}
      ${first ? sql`and (v.id::text = ${first} or e.id::text = ${first})` : sql``}
    order by v.created_at desc limit 1`;
  if (!rows[0]) return null;
  const s = await sourceOf(sql, String(rows[0].id));
  return s?.kind === 'sheet' ? s : null;
}
