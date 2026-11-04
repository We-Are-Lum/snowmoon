import 'server-only';
import type postgres from 'postgres';
import type { Ancestor } from './rules';

/**
 * Each design's remix line (owner, 2026-11-03: entries are forks of a base or of a remix of one): starting from the
 * design, the version its first version was remixed from and that version's design, then that design's, nearest
 * first, up to 64 steps. Links are append-only (src/lib/images/designs.ts), so a line never changes once made. A
 * design made from scratch has an empty line. Read-only.
 */
export async function remixLines(sql: postgres.Sql, elementIds: string[]): Promise<Map<string, Ancestor[]>> {
  const out = new Map<string, Ancestor[]>(elementIds.map((id) => [id, []]));
  if (!elementIds.length) return out;
  const rows = await sql<{ start: string; element_id: string; version_id: string; depth: number }[]>`
    with recursive line (start, element_id, version_id, depth) as (
      select e.id, tv.element_id, tv.id, 1
      from studio.elements e
      join studio.element_versions v1 on v1.element_id = e.id and v1.version_no = 1
      join studio.links l on l.from_version_id = v1.id and l.kind = 'remixed_from'
      join studio.element_versions tv on tv.id = l.to_version_id
      where e.id in ${sql(elementIds)}
      union all
      select line.start, tv.element_id, tv.id, line.depth + 1
      from line
      join studio.element_versions v1 on v1.element_id = line.element_id and v1.version_no = 1
      join studio.links l on l.from_version_id = v1.id and l.kind = 'remixed_from'
      join studio.element_versions tv on tv.id = l.to_version_id
      where line.depth < 64
    )
    select start::text, element_id::text, version_id::text, depth from line order by start, depth`;
  for (const r of rows) out.get(String(r.start))?.push({ elementId: String(r.element_id), versionId: String(r.version_id) });
  return out;
}
