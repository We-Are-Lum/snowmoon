import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, WORK_ID } from '../config';
import type { DesignBody, DesignPicture } from '../element-body';
import { closedModel, modelName } from '../images/recipe-lines';
import { basesOf } from './rules';

type Sql = postgres.Sql | postgres.TransactionSql;

/**
 * Bases made by closed models (owner, 2026-11-04). Bases and references may be made by several models, closed ones
 * included, each labelled with its maker as every recipe is (src/lib/images/recipe-lines.ts). A base whose pictures
 * name a closed model is refused until CHALLENGE.closedBasesAllowed is true, which waits for the owner's reread of the
 * Terms and Privacy lines that name the providers (check:principles P6s). A model that isn't on config/models.json is
 * refused always: nothing says whether it is open. Remixers' models are not affected: the fork form is unchanged.
 */

/** The closed models (and models not on the list) a design's pictures were made with, each named with its maker. */
export function closedModelsIn(body: Pick<DesignBody, 'samples' | 'views'>): { model: string; label: string; listed: boolean }[] {
  const pics: DesignPicture[] = [...(body.samples ?? []), ...(['front', 'side', 'back'] as const).flatMap((k) => (body.views?.[k] ? [body.views[k]!] : []))];
  const out = new Map<string, { model: string; label: string; listed: boolean }>();
  for (const p of pics) {
    const id = p.recipe?.model;
    if (!id) continue;
    const c = closedModel(id);
    if (!c) out.set(id, { model: id, label: `${id} (not on the model list)`, listed: false });
    else if (c.closed) out.set(id, { model: id, label: `${modelName(id)}, a closed model${c.maker ? ` by ${c.maker}` : ''}`, listed: true });
  }
  return [...out.values()];
}

/**
 * Why a design can't be a base yet, or null when it can. For the script that publishes the bases (call it before
 * writing) and for the bases read below. `allowed` is CHALLENGE.closedBasesAllowed.
 */
export function closedBaseRefusal(body: Pick<DesignBody, 'samples' | 'views'>, allowed: boolean = CHALLENGE.closedBasesAllowed): string | null {
  const found = closedModelsIn(body);
  const unlisted = found.filter((f) => !f.listed);
  if (unlisted.length) return `made with ${unlisted.map((f) => f.label).join(', ')}: add the model to config/models.json first`;
  if (found.length && !allowed) return `made with ${found.map((f) => f.label).join(', ')}: a closed-model base waits for CHALLENGE.closedBasesAllowed (the owner's reread of the Terms and Privacy lines)`;
  return null;
}

/**
 * The configured bases (CHALLENGE.bases) that are refused, with why: each base id read from the database (an element
 * id: every version of it; a version id: that version) and checked with closedBaseRefusal. Read-only. An id that is no
 * published sheet isn't listed here (startingSheets leaves it out). Empty while no bases are picked.
 */
export async function refusedBases(sql: Sql, bases: Record<string, readonly string[]> = CHALLENGE.bases, allowed: boolean = CHALLENGE.closedBasesAllowed): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(Object.keys(bases).flatMap((c) => basesOf(c, bases)))];
  if (!ids.length) return out;
  const rows = await sql`
    select e.id::text as element_id, v.id::text as version_id, v.body from studio.elements e
    join studio.element_versions v on v.element_id = e.id
    where e.element_type = 'design' and e.work_id = ${WORK_ID} and (e.id::text in ${sql(ids)} or v.id::text in ${sql(ids)})`;
  for (const r of rows) {
    const why = closedBaseRefusal((r.body ?? {}) as DesignBody, allowed);
    if (!why) continue;
    for (const id of [String(r.element_id), String(r.version_id)]) if (ids.includes(id) && !out.has(id)) out.set(id, why);
  }
  return out;
}
