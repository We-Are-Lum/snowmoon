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
import { checkJob } from '../illustration-check/jobs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { adminName, isAddedId, isChapterKind, namesAWork, parseRefLink, PICTURE_HOSTS, recipePath, type Look, type PickedRef } from './shared';

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
 * Every sentence in REF_WORDING was drafted by the coding agent (2026-11-21) and reread by the owner 2026-11-21 (the
 * review page of #204), with the Keep refusal in his own words, except those marked DRAFT below (2026-11-24).
 *
 * Since 2026-11-24 (Garance's request, relayed by the owner): a picture's own address (pictures.snowmoon.party, and
 * media.snowmoon.party for the edition's committed pictures) reads to what it is, and the edition's own chapter
 * pictures can be references: a redone or added picture an admin kept (kind `chapter`, credited to the admin the
 * chapter credits: "after @garance’s chapter 3 picture"), or a committed one (kind `edition`, "after the edition’s
 * chapter 1 picture"). Never a draft (its file is never on the public bucket and its id is refused), never one an admin
 * hid (studio.seeded_hidden), never an added picture taken off its chapter; a kept version a later keep replaced stays
 * usable (owner on #233, 2026-11-24). Their records are read here; nothing here writes (P5j).
 */
type Sql = postgres.Sql;

const COUNT: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three' };

export const REF_WORDING = {
  // DRAFT wording (coding agent, 2026-11-24; the owner's reread of 2026-11-21 covered the first form, without picture addresses).
  notALink: 'That isn’t a link to a picture on snowmoon.party. Paste the address of a remix (/challenge/p/…), a picture (/image/…), a sheet or base (/references/designs/…), or a picture’s own address (pictures.snowmoon.party/images/…).',
  notFound: 'No picture on the site has that address.',
  hidden: 'That picture has been hidden by its maker or a moderator, so it can’t be a reference.',
  unpublished: 'That picture isn’t published, so it can’t be a reference.',
  noPicture: 'That sheet has no front view to send.',
  style: 'That is a style, not a picture: choose it as the look instead.',
  tooMany: (n: number) => `Up to ${n} ${n === 1 ? 'picture' : 'pictures'} here: three references in all, counting the character sheets (a redo’s picture shown now counts as one).`,
  twice: 'That picture is already picked.',
  shortQuery: 'Type at least two letters.',
  // DRAFT wording (coding agent, 2026-11-24): an added picture taken off its chapter, a sheet's other view, a redo's own
  // picture, and Keep after a chapter picture was taken off. A replaced one stays usable (owner on #233, 2026-11-24).
  takenOff: 'That picture was taken off its chapter, so it can’t be a reference.',
  otherView: 'That is one of a sheet’s other views: only a sheet’s front view is sent. Paste the sheet’s page or its front view’s address.',
  shownAlready: 'That is the picture this redo starts from: it is already reference picture 1.',
  keepOff: (whats: string[]) =>
    `This draft can’t be kept: ${COUNT[whats.length] ?? String(whats.length)} of its references (${whats.join(', ')}) ${whats.length === 1 ? 'has' : 'have'} been taken off ${whats.length === 1 ? 'its chapter' : 'their chapters'} since. Make another draft with other references.`,
  // Owner, 2026-11-21: "If a reference was hidden in the meantime, Keep is refused with a plain message and the admin can
  // try again with other references." The draft stays a draft. The owner's own words (2026-11-21): "This draft can't be
  // kept: one of its references (@name's Bai remix) has been hidden since. Make another draft with other references."
  // For several, the same pattern: "two of its references (…, …) have been hidden since" (at most three can be sent).
  keepHidden: (whats: string[]) =>
    `This draft can’t be kept: ${COUNT[whats.length] ?? String(whats.length)} of its references (${whats.join(', ')}) ${whats.length === 1 ? 'has' : 'have'} been hidden since. Make another draft with other references.`,
  lookHidden: (label: string) => `The saved look, “${label}”, has been hidden since it was saved. Choose another look first.`,
} as const;

export type RefRefusal = 'not-a-link' | 'not-found' | 'hidden' | 'unpublished' | 'no-picture' | 'style' | 'taken-off' | 'other-view';
export type Resolved = { ok: true; ref: PickedRef } | { ok: false; reason: RefRefusal; error: string };
const refuse = (reason: RefRefusal): Resolved => ({
  ok: false,
  reason,
  error: { 'not-a-link': REF_WORDING.notALink, 'not-found': REF_WORDING.notFound, hidden: REF_WORDING.hidden, unpublished: REF_WORDING.unpublished, 'no-picture': REF_WORDING.noPicture, style: REF_WORDING.style, 'taken-off': REF_WORDING.takenOff, 'other-view': REF_WORDING.otherView }[reason],
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
  if (typeof id === 'string' && EDITION_JOB.test(id)) return resolveEdition(sql, id);
  if (typeof id !== 'string' || !UUID.test(id)) return refuse('not-found');
  const [r] = await sql<Row[]>`
    select v.id::text as version_id, v.element_id::text as element_id, v.asset_url, v.asset_sha256, v.body, e.element_type, e.status,
      e.created_by_fid, e.work_id, en.kind as entity_kind, en.name as entity, rc.params
    from studio.element_versions v join studio.elements e on e.id = v.element_id
    left join studio.entities en on en.id = e.entity_id left join studio.recipes rc on rc.id = v.recipe_id
    where v.id = ${id.toLowerCase()}`;
  // Not a reader's picture or a sheet: perhaps one of the edition's chapter pictures an admin made (2026-11-24).
  if (!r) return resolveChapterPicture(sql, id.toLowerCase());
  if (r.work_id !== WORK_ID || !['image', 'design'].includes(r.element_type)) return refuse('not-found');
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

/**
 * The edition's chapter pictures as references (2026-11-24). A job an admin hid is a row in studio.seeded_hidden
 * (src/app/api/admin/hide); an added picture taken off its chapter has a latest decision with no version.
 */
const EDITION_JOB = /^c\d{1,2}-b\d{1,4}-[a-z0-9-]{1,80}$/;
const missingTable = (e: unknown) => (e as { code?: string })?.code === '42P01' || /does not exist/.test(String((e as Error)?.message ?? e));

/** Which of these jobs an admin hid (studio.seeded_hidden; none before 0030_admin_picks). */
export async function hiddenJobs(sql: Sql, jobs: string[]): Promise<Set<string>> {
  const want = [...new Set(jobs.filter((j) => typeof j === 'string' && EDITION_JOB.test(j)))];
  if (!want.length) return new Set();
  const rows = await sql<{ image_id: string }[]>`select image_id from studio.seeded_hidden where image_id in ${sql(want)}`.catch((e) => {
    if (missingTable(e)) return [];
    throw e;
  });
  return new Set(rows.map((r) => r.image_id));
}

/**
 * Which of these added pictures an admin took off its chapter (owner, 2026-11-19: "Undo for a new picture is 'take it
 * off the chapter'"): its latest decision shows no version. A redo whose job shows another version, or the committed
 * file again, was replaced, not taken off, and stays usable (owner on #233, 2026-11-24). None before 0042.
 */
export async function takenOffJobs(sql: Sql, jobs: string[]): Promise<Set<string>> {
  const want = [...new Set(jobs.filter((j) => typeof j === 'string' && isAddedId(j)))];
  if (!want.length) return new Set();
  const rows = await sql<{ job_id: string; version_id: string | null }[]>`
    select distinct on (job_id) job_id, version_id::text from studio.chapter_picture_decisions where job_id in ${sql(want)}
    order by job_id, decided_at desc, id desc`.catch((e) => {
    if (missingTable(e)) return [];
    throw e;
  });
  return new Set(rows.filter((r) => r.version_id === null).map((r) => r.job_id));
}

/** A version's first keep: who kept it and its public file (null for a draft never kept). */
type FirstKeep = { by_fid: string; by_handle: string | null; public_url: string };
const firstKeepOf = async (sql: Sql, versionId: string): Promise<FirstKeep | null> =>
  (await sql<FirstKeep[]>`select by_fid, by_handle, public_url from studio.chapter_picture_decisions
    where version_id = ${versionId} and public_url is not null order by decided_at, id limit 1`)[0] ?? null;

/** The edition's committed pictures (content/snowmoon/illustrations/published.json): job, chapter, address and sha256. */
type Seed = { id: string; chapter: number; url: string; sha256: string };
let seeds: Seed[] | null = null;
const seedPictures = (): Seed[] =>
  (seeds ??= (() => {
    try {
      const j = JSON.parse(readFileSync(path.join(process.cwd(), 'content', WORK_ID, 'illustrations', 'published.json'), 'utf8')) as { images?: Partial<Seed>[] };
      return (j.images ?? []).filter((x): x is Seed => typeof x.id === 'string' && typeof x.url === 'string' && typeof x.sha256 === 'string' && SHA.test(x.sha256) && Number.isInteger(x.chapter));
    } catch {
      return [];
    }
  })());

/** What a chapter picture is, as the caption and the prompt say it: "chapter 3 picture". */
const chapterWhat = (chapter: number) => `chapter ${chapter} picture`;
/** The edition's own pictures are credited to the edition: "after the edition’s chapter 1 picture". DRAFT wording. */
export const EDITION_BY = 'the edition';

/**
 * A chapter picture version an admin made (studio.chapter_picture_versions), by its id: any version an admin kept,
 * whether its chapter shows it now or a later keep replaced it (owner on #233, 2026-11-24). A draft never kept is
 * refused as not published; one whose job an admin hid as hidden; an added picture taken off its chapter as taken off.
 * Credited to the admin who kept it; its file is the kept one on the readers' bucket, with the version's sha256.
 */
async function resolveChapterPicture(sql: Sql, id: string): Promise<Resolved> {
  const [v] = await sql<{ id: string; job_id: string; chapter: number; sha256: string }[]>`
    select id::text, job_id, chapter, sha256 from studio.chapter_picture_versions where id = ${id}`.catch((e) => {
    if (missingTable(e)) return [];
    throw e;
  });
  if (!v) return refuse('not-found');
  const kept = await firstKeepOf(sql, v.id);
  if (!kept) return refuse('unpublished');
  if ((await hiddenJobs(sql, [v.job_id])).has(v.job_id)) return refuse('hidden');
  if ((await takenOffJobs(sql, [v.job_id])).has(v.job_id)) return refuse('taken-off');
  if (!SHA.test(v.sha256)) return refuse('not-found');
  const byFid = Number(kept.by_fid);
  return {
    ok: true,
    ref: { versionId: v.id, kind: 'chapter', what: chapterWhat(v.chapter), by: adminName(byFid, kept.by_handle), byFid, href: recipePath(v.id), url: kept.public_url, sha256: v.sha256, job: v.job_id },
  };
}

/**
 * One of the edition's committed pictures, by its job's id: refused only once an admin hid it (a committed picture
 * can't be taken off; one a kept redo replaced stays usable, owner on #233, 2026-11-24).
 */
async function resolveEdition(sql: Sql, jobId: string): Promise<Resolved> {
  const s = seedPictures().find((x) => x.id === jobId);
  if (!s) return refuse('not-found');
  if ((await hiddenJobs(sql, [s.id])).has(s.id)) return refuse('hidden');
  return { ok: true, ref: { versionId: s.id, kind: 'edition', what: chapterWhat(s.chapter), by: EDITION_BY, byFid: 0, href: `/chapter/${s.chapter}`, url: s.url, sha256: s.sha256, job: s.id } };
}

/**
 * A picture's own address on the readers' bucket, read to what it is (2026-11-24): a reader's picture (its version's
 * file), a sheet's front view (the newest version of that sheet showing it), or a kept chapter picture (a decision's
 * public file). Only addresses the site recorded as published files are matched: a draft's file is never on the
 * bucket, and a hidden picture's record still names its address, so it is found and then refused as hidden.
 */
async function fromFile(sql: Sql, hex: string): Promise<Resolved> {
  const key = `images/readers/${hex}.jpg`;
  const bases = [...new Set([...PICTURE_HOSTS.map((h) => `https://${h}`), (process.env.R2_IMAGES_PUBLIC_URL ?? '').replace(/\/$/, '')].filter(Boolean))];
  const urls = bases.map((b) => `${b}/${key}`);
  const [image] = await sql<{ id: string }[]>`select v.id::text as id from studio.element_versions v where v.asset_url in ${sql(urls)} order by v.created_at desc limit 1`;
  if (image) return resolveReference(sql, image.id);
  const [sheet] = await sql<{ id: string }[]>`select v.id::text as id from studio.element_versions v where v.body->'views'->'front'->>'url' in ${sql(urls)} order by v.version_no desc, v.created_at desc limit 1`;
  if (sheet) return resolveReference(sql, sheet.id);
  const [view] = await sql<{ id: string }[]>`select v.id::text as id from studio.element_versions v
    where jsonb_typeof(v.body->'views') = 'object' and exists (select 1 from jsonb_each(v.body->'views') w where w.value->>'url' in ${sql(urls)}) limit 1`;
  if (view) {
    // Another view of a sheet: its maker's hide still wins first.
    const r = await resolveReference(sql, view.id);
    return r.ok ? refuse('other-view') : r;
  }
  const [chapter] = await sql<{ id: string }[]>`select version_id::text as id from studio.chapter_picture_decisions where public_url in ${sql(urls)} and version_id is not null order by decided_at desc, id desc limit 1`.catch((e) => {
    if (missingTable(e)) return [];
    throw e;
  });
  if (chapter) return resolveChapterPicture(sql, chapter.id);
  return refuse('not-found');
}

/** A pasted link, read on the server to the version it names, then checked as above. */
export async function referenceFromLink(sql: Sql, link: unknown): Promise<Resolved> {
  const parsed = parseRefLink(link);
  if (!parsed) return refuse('not-a-link');
  if (parsed.page === 'file') return fromFile(sql, parsed.id);
  if (parsed.page === 'seed') {
    const s = seedPictures().find((x) => new URL(x.url).pathname === parsed.id);
    return s ? resolveEdition(sql, s.id) : refuse('not-found');
  }
  if (parsed.page === 'chapter') return resolveChapterPicture(sql, parsed.id);
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
  for (const id of await chapterMatches(sql, q, slugs)) {
    const r = await resolveReference(sql, id);
    if (r.ok) out.push(r.ref);
  }
  return out;
}

/**
 * The chapter pictures admins redid or added and kept (2026-11-24), the ones replaced since included, since they can
 * be picked (owner on #233), matching the search: by chapter ("chapter 3", "ch 3", "c3"), by a character the job's
 * scene or its sheets name, or by a word that starts in the admin's note, the job's id or the keeper's handle. Never a
 * draft, a hidden one or a taken-off one. In book order, the one each chapter shows now first, then newest; at most 12.
 */
async function chapterMatches(sql: Sql, q: string, slugs: string[]): Promise<string[]> {
  type K = { id: string; job_id: string; chapter: number; note: string; refs: unknown; by_handle: string | null; kept_at: Date; shown: boolean };
  const kept = await sql<K[]>`
    with latest as (select distinct on (job_id) job_id, version_id from studio.chapter_picture_decisions order by job_id, decided_at desc, id desc)
    select distinct on (v.id) v.id::text, v.job_id, v.chapter, v.note, v.recipe->'references' as refs, d.by_handle, d.decided_at as kept_at,
      exists (select 1 from latest l where l.version_id = v.id) as shown
    from studio.chapter_picture_versions v join studio.chapter_picture_decisions d on d.version_id = v.id and d.public_url is not null
    order by v.id, d.decided_at, d.id`.catch((e) => {
    if (missingTable(e)) return [] as K[];
    throw e;
  });
  if (!kept.length) return [];
  const jobs = kept.map((r) => r.job_id);
  const [hidden, off] = await Promise.all([hiddenJobs(sql, jobs), takenOffJobs(sql, jobs)]);
  const ch = /^(?:chapter|ch\.?|c)\s*(\d{1,2})$/i.exec(q)?.[1];
  const escaped = q.replace(/[.*+?^$()|[\]{}\\]/g, (c) => `\\${c}`);
  const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, 'iu');
  const castOf = (jobId: string) => checkJob(jobId)?.cast.map((c) => c.slug) ?? [];
  const sheetsOf = (refs: unknown) => (Array.isArray(refs) ? refs.map((x) => String((x as { sheet?: unknown })?.sheet ?? '')).filter(Boolean) : []);
  return kept
    .filter((r) => !hidden.has(r.job_id) && !off.has(r.job_id))
    .filter((r) =>
      ch ? r.chapter === Number(ch) : word.test(r.note) || word.test(r.job_id) || (r.by_handle ? word.test(r.by_handle) : false) || [...castOf(r.job_id), ...sheetsOf(r.refs)].some((x) => slugs.includes(x)),
    )
    .sort((a, b) => a.chapter - b.chapter || a.job_id.localeCompare(b.job_id) || Number(b.shown) - Number(a.shown) || new Date(b.kept_at).getTime() - new Date(a.kept_at).getTime())
    .slice(0, 12)
    .map((r) => r.id);
}

/**
 * Each picked chapter picture's state now (2026-11-24), by its versionId: 'hidden' once an admin hid its job, 'off'
 * once an added picture was taken off its chapter, 'published' otherwise (replaced since included; owner on #233). For
 * the check at Keep.
 */
export async function chapterRefStatuses(sql: Sql, refs: Pick<PickedRef, 'versionId' | 'kind' | 'job'>[]): Promise<Map<string, 'published' | 'hidden' | 'off'>> {
  const mine = refs.filter((x) => isChapterKind(x.kind));
  const out = new Map<string, 'published' | 'hidden' | 'off'>();
  if (!mine.length) return out;
  const jobOf = (x: (typeof mine)[number]) => x.job ?? (x.kind === 'edition' ? x.versionId : '');
  const [hidden, off] = await Promise.all([hiddenJobs(sql, mine.map(jobOf)), takenOffJobs(sql, mine.map(jobOf))]);
  for (const x of mine) {
    const job = jobOf(x);
    out.set(x.versionId.toLowerCase(), hidden.has(job) ? 'hidden' : off.has(job) ? 'off' : 'published');
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
 * The kept chapter pictures made after one of the edition's chapter pictures (2026-11-24), by its job, for the admin
 * Hide route's seeded hide: a hide reaches their captions (P5f). Empty before the chapter-picture migration.
 */
export async function picturesMadeAfterJob(sql: Sql, jobId: string): Promise<{ jobId: string; chapter: number }[]> {
  if (!EDITION_JOB.test(jobId)) return [];
  return sql<{ jobId: string; chapter: number }[]>`
    select distinct d.job_id as "jobId", d.chapter from studio.chapter_picture_decisions d
    join studio.chapter_picture_versions cv on cv.id = d.version_id
    where exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(cv.recipe->'picked') = 'array' then cv.recipe->'picked' else '[]'::jsonb end) x
      where x->>'kind' in ('chapter', 'edition') and x->>'job' = ${jobId})`.catch(() => []);
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
