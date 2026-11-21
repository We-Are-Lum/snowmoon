import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, WORK_ID } from '../config';
import { bookCharacter, bookCharacters } from '../images/designs';
import { byline } from '../images/byline';
import { imageByVersion } from '../images/data';
import { blockedName } from '../images/rules';
import { publishedStyles } from '../challenge/make';
import { basesOf } from '../challenge/rules';
import { callNameOf } from '../challenge/names';
import { namesAWork, parseRefLink, type Look, type PickedRef } from './shared';

/**
 * Other people's published pictures as references for the edition's chapter pictures, and any published style as the
 * look (owner's request via Garance, 2026-11-21). Reads only: nothing here writes (the writes are in ./admin.ts, P5j).
 *
 * What can be picked: a published picture with a file on the readers' bucket, which is a remix-challenge picture, any
 * other reader's picture, a base (a challenge character's sheet on CHALLENGE.bases) or a character's or place's sheet
 * (its front view). Never a hidden one (its maker or a moderator hid it: studio.elements.status 'hidden'), never one
 * not published, never a style (a style is chosen as the look), and never the edition's own committed pictures (those
 * are redone, not referenced). Every check is made on the server from the version id, at pick time, again at Make,
 * and again at Keep (src/lib/chapter-pictures/pictures.ts): hides win (P5f).
 *
 * What it sends: only the picture's file, checked against its sha256 (src/lib/images/reference-picture.ts), as the
 * character sheets are sent. Nothing about its maker goes to the model; their handle goes only into the recipe and the
 * caption, as their own page already shows it. No country is kept for anyone, makers included, so there is no maker's
 * country rule to apply; the closed models' country rule is the admin's own, for the request (src/lib/images/countries.ts).
 * Every sentence in REF_WORDING is DRAFT wording (coding agent, 2026-11-21).
 */
type Sql = postgres.Sql;

export const REF_WORDING = {
  notALink: 'That isn’t a link to a picture on snowmoon.party. Paste the address of a remix (/challenge/p/…), a picture (/image/…), or a sheet or base (/references/designs/…).',
  notFound: 'No picture on the site has that address.',
  hidden: 'That picture has been hidden by its maker or a moderator, so it can’t be a reference.',
  unpublished: 'That picture isn’t published, so it can’t be a reference.',
  noPicture: 'That sheet has no front view to send.',
  style: 'That is a style, not a picture: choose it as the look instead.',
  tooMany: (n: number) => `Up to ${n} ${n === 1 ? 'picture' : 'pictures'} here: three references in all, counting the character sheets (a redo’s picture shown now counts as one).`,
  twice: 'That picture is already picked.',
  shortQuery: 'Type at least two letters.',
  // Owner, 2026-11-21: "If a reference was hidden in the meantime, Keep is refused with a plain message and the admin can
  // try again with other references." The draft stays a draft.
  keepHidden: (whats: string[]) =>
    `This draft can’t be kept: ${whats.length === 1 ? 'a picture it was made after' : 'pictures it was made after'} (${whats.join(', ')}) ${whats.length === 1 ? 'has' : 'have'} been hidden since. Make another draft with other references.`,
  lookHidden: (label: string) => `The saved look, “${label}”, has been hidden since it was saved. Choose another look first.`,
} as const;

export type RefRefusal = 'not-a-link' | 'not-found' | 'hidden' | 'unpublished' | 'no-picture' | 'style';
export type Resolved = { ok: true; ref: PickedRef } | { ok: false; reason: RefRefusal; error: string };
const refuse = (reason: RefRefusal): Resolved => ({
  ok: false,
  reason,
  error: { 'not-a-link': REF_WORDING.notALink, 'not-found': REF_WORDING.notFound, hidden: REF_WORDING.hidden, unpublished: REF_WORDING.unpublished, 'no-picture': REF_WORDING.noPicture, style: REF_WORDING.style }[reason],
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;

type Row = {
  version_id: string; element_id: string; asset_url: string | null; asset_sha256: string | null; body: Record<string, unknown> | null;
  element_type: string; status: string; created_by_fid: number; work_id: string; entity_kind: string | null; entity: string | null; params: Record<string, unknown> | null;
};

/** Is this design (by its element or version id) one of a challenge character's bases? */
const isBase = (elementId: string, versionId: string) =>
  Object.keys(CHALLENGE.bases).some((c) => basesOf(c).some((id) => id === elementId.toLowerCase() || id === versionId.toLowerCase()));

/** A version id, looked up and checked: a published picture, with its kind, what it is, its maker and its file. */
export async function resolveReference(sql: Sql, id: unknown): Promise<Resolved> {
  if (typeof id !== 'string' || !UUID.test(id)) return refuse('not-found');
  const [r] = await sql<Row[]>`
    select v.id::text as version_id, v.element_id::text as element_id, v.asset_url, v.asset_sha256, v.body, e.element_type, e.status,
      e.created_by_fid, e.work_id, en.kind as entity_kind, en.name as entity, rc.params
    from studio.element_versions v join studio.elements e on e.id = v.element_id
    left join studio.entities en on en.id = e.entity_id left join studio.recipes rc on rc.id = v.recipe_id
    where v.id = ${id.toLowerCase()}`;
  if (!r || r.work_id !== WORK_ID || !['image', 'design'].includes(r.element_type)) return refuse('not-found');
  if (r.status === 'hidden') return refuse('hidden');
  if (r.status !== 'published') return refuse('unpublished');
  if (r.element_type === 'image') {
    // As its own page shows it (a linked wallet's picture under its Farcaster name; src/lib/images/data.ts).
    const im = await imageByVersion(sql, r.version_id);
    if (!im || !SHA.test(im.sha256) || !im.url) return refuse('not-found');
    const character = (r.params?.challenge as { character?: unknown } | undefined)?.character;
    const remix = typeof character === 'string' && character.length > 0;
    // As the challenge calls a character ("Zei", "Lord Ephelion"; src/lib/challenge/names.ts).
    const name = remix ? callNameOf(bookCharacter(character as string)?.name ?? (character as string)) : '';
    return {
      ok: true,
      ref: { versionId: r.version_id, kind: remix ? 'remix' : 'picture', what: remix ? `${name} remix` : 'picture', by: byline(im.byName, im.byFid), byFid: im.byFid, href: remix ? `/challenge/p/${r.version_id}` : `/image/${r.version_id}`, url: im.url, sha256: im.sha256 },
    };
  }
  if (r.entity_kind === 'style') return refuse('style');
  const body = (r.body ?? {}) as { views?: { front?: { url?: unknown; sha256?: unknown } }; by_name?: unknown };
  const front = body.views?.front;
  if (typeof front?.url !== 'string' || typeof front.sha256 !== 'string' || !SHA.test(front.sha256)) return refuse('no-picture');
  const base = r.entity_kind === 'character' && isBase(r.element_id, r.version_id);
  const by = byline(typeof body.by_name === 'string' ? body.by_name : null, Number(r.created_by_fid));
  return {
    ok: true,
    ref: { versionId: r.version_id, kind: base ? 'base' : 'sheet', what: `${r.entity_kind === 'character' && r.entity ? callNameOf(r.entity) : (r.entity ?? 'a')} ${base ? 'base' : 'sheet'}`, by, byFid: Number(r.created_by_fid), href: `/references/designs/${r.version_id}`, url: front.url, sha256: front.sha256 },
  };
}

/** A pasted link, read on the server to the version it names, then checked as above. */
export async function referenceFromLink(sql: Sql, link: unknown): Promise<Resolved> {
  const parsed = parseRefLink(link);
  if (!parsed) return refuse('not-a-link');
  return resolveReference(sql, parsed.id);
}

/**
 * Published pictures whose maker, character or words (a remix's words are its title), or a sheet's title or its
 * character or place, match the search; newest first, at most 12 of each (pictures, then sheets and bases). For the
 * admins' picker only.
 */
export async function searchReferences(sql: Sql, raw: unknown): Promise<PickedRef[]> {
  const q = typeof raw === 'string' ? raw.trim().replace(/^@/, '').slice(0, 60) : '';
  if (q.length < 2) return [];
  const pat = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const slugs = bookCharacters().filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).map((c) => c.slug);
  const images = await sql<{ id: string }[]>`
    select v.id::text as id from studio.elements e join studio.element_versions v on v.element_id = e.id join studio.recipes rc on rc.id = v.recipe_id
    where e.element_type = 'image' and e.status = 'published' and e.work_id = ${WORK_ID} and rc.source = 'in_app' and v.asset_url is not null
      and (rc.params->>'by_name' ilike ${pat} or rc.params->>'user_prompt' ilike ${pat} or rc.params->'challenge'->>'character' ilike ${pat}
        ${slugs.length ? sql`or rc.params->'challenge'->>'character' in ${sql(slugs)} or exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(rc.params->'sheets'->'characters') = 'array' then rc.params->'sheets'->'characters' else '[]'::jsonb end) s where s in ${sql(slugs)})` : sql``})
    order by v.created_at desc limit 12`;
  const designs = await sql<{ id: string }[]>`
    select v.id::text as id from studio.elements e join studio.entities en on en.id = e.entity_id
    join lateral (select * from studio.element_versions vv where vv.element_id = e.id order by vv.version_no desc limit 1) v on true
    where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind in ('character', 'location')
      and v.body->'views'->'front'->>'url' is not null
      and (en.name ilike ${pat} or v.body->>'title' ilike ${pat} or v.body->>'by_name' ilike ${pat})
    order by v.created_at desc limit 12`;
  const out: PickedRef[] = [];
  for (const { id } of [...images, ...designs]) {
    const r = await resolveReference(sql, id);
    if (r.ok) out.push(r.ref);
  }
  return out;
}

/** Each version's element status now ('published', 'hidden', …), or 'missing'. For the checks at Make and at Keep. */
export async function referenceStatuses(sql: Sql, ids: string[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x) => UUID.test(x)).map((x) => x.toLowerCase()))];
  const out = new Map<string, string>(want.map((x) => [x, 'missing']));
  if (!want.length) return out;
  const rows = await sql<{ id: string; status: string }[]>`select v.id::text as id, e.status from studio.element_versions v join studio.elements e on e.id = v.element_id where v.id in ${sql(want)}`;
  for (const r of rows) out.set(r.id, r.status);
  return out;
}

/** One style the look picker lists: any published, visible style (the remix challenge's marked), with its version and maker. */
export interface StyleChoice {
  id: string;
  label: string;
  text: string;
  versionNo: number;
  by: string;
  byFid: number;
  /** One of the remix challenge's styles (CHALLENGE.offeredStyles). */
  challenge: boolean;
}

/**
 * The styles an admin may choose as the look: every published style (a style its maker or a moderator hid is not
 * published, so never listed), at its newest version, newest first as References lists them, except one whose words
 * name someone on the blocked list or an artist, studio or film (the looks' rule). The whole prompt, the style's
 * words included, still goes through the site's prompt check before any picture is made.
 */
export async function styleChoices(sql: Sql): Promise<StyleChoice[]> {
  const offered = new Set(CHALLENGE.offeredStyles.map((s) => s.trim()));
  return (await publishedStyles(sql))
    .filter((s) => !blockedName(s.text) && !namesAWork(s.text) && !blockedName(s.label) && !namesAWork(s.label))
    .map((s) => ({ id: s.versionId, label: s.label, text: s.text, versionNo: s.versionNo, by: byline(s.byName, s.byFid), byFid: s.byFid, challenge: offered.has(s.label.trim()) }));
}

/** A saved look is still usable: a written line always; a style only while its design is published (hides win). */
export async function lookUsable(sql: Sql, look: Look | null): Promise<boolean> {
  if (look?.kind !== 'style') return true;
  return (await referenceStatuses(sql, [look.versionId])).get(look.versionId.toLowerCase()) === 'published';
}

/**
 * The kept chapter pictures made after any version of this element (a picked reference or a sheet picture), for the
 * Hide routes: a hide reaches their captions (P5f). Empty before the chapter-picture migration.
 */
export async function picturesMadeAfter(sql: Sql, elementId: string): Promise<{ jobId: string; chapter: number }[]> {
  if (!UUID.test(elementId)) return [];
  return sql<{ jobId: string; chapter: number }[]>`
    select distinct d.job_id as "jobId", d.chapter from studio.chapter_picture_decisions d
    join studio.chapter_picture_versions cv on cv.id = d.version_id
    where exists (
      select 1 from jsonb_array_elements(coalesce(cv.recipe->'picked', '[]'::jsonb) || coalesce(cv.recipe->'references', '[]'::jsonb)) x
      join studio.element_versions ev on ev.id::text = x->>'versionId' where ev.element_id = ${elementId})`.catch(() => []);
}
