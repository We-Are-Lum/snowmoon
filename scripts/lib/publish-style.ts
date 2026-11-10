import type postgres from 'postgres';
import { CHALLENGE, WORK_ID } from '../../src/lib/config';
import { BASE_STYLE, type OfferedStyle } from '../../src/lib/challenge/base-style';
import { makeDesign, styleNameTaken } from '../../src/lib/images/designs';
import { MAINTAINER_FID } from './launch-publish';

/**
 * Publishing the bases' style, "Animated series" (owner, 2026-11-09), as a style of FID 6786's (the maintainer, as the
 * bases are): its text word for word (src/lib/challenge/base-style.ts), no sample pictures (so no recipe to add). The
 * plan reads only; apply writes one style through the site's own makeDesign. Shared by scripts/publish-style.ts and its
 * test (scripts/test-model-choice.ts C19), which runs it on a local database.
 */
type Sql = postgres.Sql;
export interface StylePlan {
  exists: { versionId: string; elementId: string; sameText: boolean } | null;
  nameTaken: boolean;
  /** Each base (CHALLENGE.bases), and whether its front's recipe records exactly this style's text. */
  bases: { character: string; versionId: string; matches: boolean | null }[];
  body: Record<string, unknown>;
}

export const styleBody = (byName = 'naaate', style: OfferedStyle = BASE_STYLE) => ({ title: style.title, text: style.text, samples: [], views: {}, by_name: byName, by_name_source: 'relay', assist: null, role: 'maintainer', style: null });

export async function planStyle(sql: Sql | postgres.TransactionSql, style: OfferedStyle = BASE_STYLE): Promise<StylePlan> {
  const s = sql as unknown as Sql;
  const [ex] = await s<{ version_id: string; element_id: string; text: string }[]>`
    select v.id::text as version_id, e.id::text as element_id, coalesce(v.body->>'text', '') as text
    from studio.entities en join studio.elements e on e.entity_id = en.id join studio.element_versions v on v.element_id = e.id
    where en.work_id = ${WORK_ID} and en.kind = 'style' and lower(en.name) = lower(${style.title}) and e.status = 'published'
    order by v.version_no desc limit 1`;
  const bases: StylePlan['bases'] = [];
  for (const c of CHALLENGE.characters) {
    for (const id of (CHALLENGE.bases as Record<string, string[]>)[c] ?? []) {
      const [v] = await s<{ t: string | null }[]>`select body->'views'->'front'->'recipe'->'style'->>'text' as t from studio.element_versions where id::text = ${id}`;
      bases.push({ character: c, versionId: id, matches: v ? (v.t ?? '').trim() === style.text : null });
    }
  }
  return { exists: ex ? { versionId: ex.version_id, elementId: ex.element_id, sameText: ex.text.trim() === style.text } : null, nameTaken: await styleNameTaken(s as never, style.title), bases, body: styleBody('naaate', style) };
}

export async function applyStyle(sql: Sql, byName = 'naaate', style: OfferedStyle = BASE_STYLE): Promise<{ versionId: string; elementId: string }> {
  return makeDesign(sql as never, { fid: MAINTAINER_FID, mode: 'create', kind: 'style', styleName: style.title, body: styleBody(byName, style) as never });
}
