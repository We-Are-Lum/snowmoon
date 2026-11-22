/**
 * P8j (owner, 2026-11-22; lettering, part C): every picture whose words a model drew has its lettering record, its book
 * phrases are word for word at their blocks, its own phrases name their person, its read-back read the published file
 * and said "match", and its prompt ends with the lettering line, never the no-text line. The rule is
 * src/lib/images/lettering.ts p8jProblems; this file holds its planted faults (one for each point, proved by
 * scripts/test-lettering.ts and planted together by check:principles) and the read of the lettered pictures.
 */
import type postgres from 'postgres';
import type { LetteredPicture, LetteringRecord } from '../../src/lib/images/lettering';

type Pic = LetteredPicture & { record: LetteringRecord };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Each planted fault, from a well-made book picture and a well-made own-words picture. */
export const P8J_PLANTS: Record<string, (book: Pic, own: Pic) => LetteredPicture[]> = {
  'no lettering record': (b) => [{ ...clone(b), record: null }],
  'a book phrase not in its block': (b) => {
    const x = clone(b);
    x.record.phrases = x.record.phrases.map((p) => (p.source === 'book' ? { ...p, block: 'c1-b1' } : p));
    return [x];
  },
  'own words without by_fid': (_b, o) => {
    const x = clone(o);
    x.record.phrases = x.record.phrases.map((p) => ({ text: p.text, source: 'own' }) as never);
    return [x];
  },
  'a read-back that said mismatch': (b) => {
    const x = clone(b);
    (x.record.readback as { verdict: string }).verdict = 'mismatch';
    return [x];
  },
  'a read-back of another file than the published one': (b) => [{ ...clone(b), sha256: 'f'.repeat(64) }],
  'a prompt without the lettering line': (b) => [{ ...clone(b), prompt: b.prompt.replace(b.record.line, '') }],
  'a prompt with the no-text line': (b) => [{ ...clone(b), prompt: `${b.prompt}\n\nNo text, no lettering, no signs with words.` }],
  'cropped, not padded': (b) => {
    const x = clone(b);
    (x.record as { fit: string }).fit = 'crop';
    return [x];
  },
  'body and record name different words': (b) => [{ ...clone(b), body: [{ text: 'Something else', drawn_by: 'model' }] }],
};

/**
 * The lettered pictures in a database (read-only): challenge pictures whose version's body has an item drawn_by 'model'
 * or whose recipe has a lettering record, and chapter-picture versions whose recipe has one.
 */
export async function letteredPictures(sql: postgres.Sql): Promise<LetteredPicture[]> {
  const images = await sql<{ id: string; sha256: string; prompt: string | null; body: { lettering?: { text: string; drawn_by?: string }[] } | null; record: LetteringRecord | null }[]>`
    select v.id::text, v.asset_sha256 as sha256, r.prompt, v.body, r.params->'lettering' as record
    from studio.element_versions v join studio.elements e on e.id = v.element_id left join studio.recipes r on r.id = v.recipe_id
    where e.element_type = 'image'
      and (r.params ? 'lettering' or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v.body->'lettering') = 'array' then v.body->'lettering' else '[]'::jsonb end) x where x->>'drawn_by' = 'model'))`;
  const chapter = (await sql<{ to_regclass: string | null }[]>`select to_regclass('studio.chapter_picture_versions')`)[0]?.to_regclass
    ? await sql<{ id: string; job_id: string; sha256: string; prompt: string; record: LetteringRecord | null }[]>`
        select id::text, job_id, sha256, prompt, recipe->'lettering' as record from studio.chapter_picture_versions where recipe ? 'lettering'`
    : [];
  return [
    ...images.map((i) => ({ where: `image ${i.id}`, sha256: i.sha256, prompt: i.prompt ?? '', body: (i.body?.lettering ?? []).filter((x) => x.drawn_by === 'model'), record: i.record })),
    ...chapter.map((c) => ({ where: `chapter picture ${c.job_id} version ${c.id}`, sha256: c.sha256, prompt: c.prompt, body: null, record: c.record })),
  ];
}
