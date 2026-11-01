import 'server-only';
import type postgres from 'postgres';
import { ADMINS, CHALLENGE } from '../config';
import { buildGraph, type CreditGraph, type EligibilityRow, type LinkRow, type VersionRow } from './graph';

/**
 * Reads one character's credit graph from the database (read-only: selects only), starting at the owner's final
 * version and following studio.links back to the book. The eligibility is the one stored at publish
 * (studio.challenge_eligibility, NEXT_remix_challenge.sql); without that table every maker reads as having no stored
 * decision (so their credit goes to the Lake), never looked up again.
 */
type Sql = postgres.Sql;

async function versionsByIds(sql: Sql, ids: string[]): Promise<VersionRow[]> {
  if (!ids.length) return [];
  const rows = await sql`
    select v.id, v.element_id, e.element_type, v.version_no, e.created_by_fid, coalesce(en.name, '') as entity, coalesce(en.kind, '') as entity_kind,
           e.status, v.body, v.created_at
    from studio.element_versions v join studio.elements e on e.id = v.element_id left join studio.entities en on en.id = e.entity_id
    where v.id in ${sql(ids)}`;
  return rows.map((r) => ({
    id: String(r.id),
    elementId: String(r.element_id),
    elementType: String(r.element_type),
    versionNo: Number(r.version_no),
    makerFid: Number(r.created_by_fid),
    entity: String(r.entity),
    entityKind: String(r.entity_kind),
    status: String(r.status),
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Whether studio.challenge_eligibility exists (asked first, so a missing table never aborts a read-only transaction). */
async function hasEligibility(sql: Sql): Promise<boolean> {
  const [r] = await sql`select to_regclass('studio.challenge_eligibility') is not null as ok`;
  return Boolean(r?.ok);
}

export async function loadGraph(sql: Sql, character: string, finalVersionId: string): Promise<CreditGraph> {
  const versions = new Map<string, VersionRow>();
  const links: LinkRow[] = [];
  let todo = [finalVersionId];
  while (todo.length) {
    const got = await versionsByIds(sql, todo.filter((id) => !versions.has(id)));
    for (const v of got) versions.set(v.id, v);
    const designs = got.filter((v) => v.elementType === 'design');
    // Each design's first version too (a later version inherits its fork origin).
    const firsts = designs.length
      ? (await sql`select v.id from studio.element_versions v where v.element_id in ${sql(designs.map((d) => d.elementId))} and v.version_no = 1`).map((r) => String(r.id))
      : [];
    const firstRows = await versionsByIds(sql, firsts.filter((id) => !versions.has(id)));
    for (const v of firstRows) versions.set(v.id, v);
    const from = [...designs.map((d) => d.id), ...firstRows.map((v) => v.id)];
    const ls = from.length ? await sql`select from_version_id, to_version_id, kind from studio.links where from_version_id in ${sql(from)}` : [];
    const next: string[] = [];
    for (const l of ls) {
      const row: LinkRow = { from: String(l.from_version_id), to: String(l.to_version_id), kind: l.kind as LinkRow['kind'] };
      if (!links.some((x) => x.from === row.from && x.to === row.to && x.kind === row.kind)) links.push(row);
      if (!versions.has(row.to)) next.push(row.to);
    }
    todo = [...new Set(next)];
  }
  let eligibility: EligibilityRow[] = [];
  if (await hasEligibility(sql)) {
    const ids = [...versions.keys()];
    eligibility = (await sql`select version_id, fid, decision, eligible from studio.challenge_eligibility where challenge = ${CHALLENGE.id} and version_id in ${sql(ids)}`).map((r) => ({
      versionId: String(r.version_id),
      fid: Number(r.fid),
      decision: r.decision as EligibilityRow['decision'],
      eligible: Boolean(r.eligible),
    }));
  }
  return buildGraph({ character, final: finalVersionId, versions: [...versions.values()], links, eligibility, admins: ADMINS });
}

/** Everyone with a stored entry decision for the character's sheets (eligible or not): they can't be its jurors. */
export async function entrantsFor(sql: Sql, characterName: string): Promise<Set<number>> {
  if (!(await hasEligibility(sql))) return new Set();
  {
    const rows = await sql`
      select distinct x.fid from studio.challenge_eligibility x
      join studio.element_versions v on v.id = x.version_id join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
      where x.challenge = ${CHALLENGE.id} and en.kind = 'character' and en.name = ${characterName}`;
    return new Set(rows.map((r) => Number(r.fid)));
  }
}
