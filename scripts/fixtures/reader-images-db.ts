/**
 * Local data for check:ui's readers'-image screens: an in-memory Postgres (PGlite) with the
 * migrations and two published readers' images in Chapter 1 (one with a Farcaster name, one
 * with only a FID), served on a local port. Nothing here touches the live database. The images
 * reuse two seeded illustrations' public files, so nothing new is uploaded.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const ROOT = path.resolve(import.meta.dirname, '../..');

export const FIXTURE_IMAGES = [
  {
    version: '11111111-1111-4111-8111-111111111111', element: '21111111-1111-4111-8111-111111111111', recipe: '31111111-1111-4111-8111-111111111111',
    url: 'https://media.snowmoon.party/images/seed/c1/c1-b013-sky-bridge-64be33275e53.jpg', start: 3, end: 5, name: 'naaate',
    prompt: 'A footbridge high between two towers at dawn, mist below, one small figure crossing.',
  },
  {
    version: '12222222-2222-4222-8222-222222222222', element: '22222222-2222-4222-8222-222222222222', recipe: '32222222-2222-4222-8222-222222222222',
    url: 'https://media.snowmoon.party/images/seed/c1/c1-b005-toy-drone-ea7f59a8c05f.jpg', start: 4, end: 5, name: null,
    prompt: 'A small toy drone hovering over a quiet path under tall trees.',
  },
] as const;

/** The first image is of Gladias on the Kalimar footpaths (sheets as text, 2026-10-10): its page says "In this image". */
export const FIXTURE_SHEETS = {
  characters: ['gladias'],
  place: 'kalimar-footpaths',
  added: [
    { kind: 'character', slug: 'gladias', name: 'Gladias', text: 'Gladias: (fixture shorthand).' },
    { kind: 'place', slug: 'kalimar-footpaths', name: 'the footpaths of the Kalimar district', text: 'The place, the footpaths of the Kalimar district: (fixture shorthand).' },
  ],
};

/**
 * A remix page (owner, 2026-11-04: every remix page is a landing page with its link preview): a base sheet of Zei by
 * the maintainer, a published remix of it by @remixer, and two that must never preview: a hidden remix and a draft.
 * Their pictures reuse the two seeded illustrations' public files (landscape; the card keeps any picture's proportions).
 * Only with { designs: true }, so the screens that count pictures see the same data as before.
 */
const view = (url: string, sha: string) => ({
  url,
  sha256: sha.repeat(64),
  recipe: { prompt: 'Zei, front view (fixture).', model: 'z-image-turbo', endpoint: 'fal-ai/z-image/turbo', host: 'fal.ai', settings: { steps: 8 }, seed: 7, request_id: 'fixture-view', cost_usd: 0.003, made_at: '2026-11-06T18:00:00Z', width: 1024, height: 576 },
});
export const FIXTURE_DESIGNS = {
  entity: '41111111-1111-4111-8111-111111111111',
  base: { element: '51111111-1111-4111-8111-111111111111', version: '61111111-1111-4111-8111-111111111111', fid: 6786, name: 'naaate', status: 'published', url: FIXTURE_IMAGES[0].url },
  remix: { element: '52222222-2222-4222-8222-222222222222', version: '62222222-2222-4222-8222-222222222222', fid: 4242, name: 'remixer', status: 'published', url: FIXTURE_IMAGES[1].url },
  hidden: { element: '53333333-3333-4333-8333-333333333333', version: '63333333-3333-4333-8333-333333333333', fid: 4243, name: 'hider', status: 'hidden', url: FIXTURE_IMAGES[1].url },
  draft: { element: '54444444-4444-4444-8444-444444444444', version: '64444444-4444-4444-8444-444444444444', fid: 4244, name: 'drafter', status: 'draft', url: FIXTURE_IMAGES[1].url },
} as const;

async function addDesigns(db: PGlite) {
  const D = FIXTURE_DESIGNS;
  await db.query(`insert into studio.entities (id, work_id, kind, name, setting, first_chapter) values ($1,'snowmoon','character','Zei Leimin','dzego',1)`, [D.entity]);
  for (const [i, k] of (['base', 'remix', 'hidden', 'draft'] as const).entries()) {
    const x = D[k];
    const body = { title: k === 'base' ? '' : 'Zei in winter', text: 'Zei Leimin: (fixture sheet text).', samples: [], views: { front: view(x.url, String(i + 5)) }, by_name: x.name, by_name_source: 'relay', assist: null, role: k === 'base' ? 'maintainer' : null, style: null };
    await db.query(`insert into studio.elements (id, work_id, element_type, entity_id, created_by_fid, status) values ($1,'snowmoon','design',$2,$3,$4)`, [x.element, D.entity, x.fid, x.status]);
    await db.query(`insert into studio.element_versions (id, element_id, version_no, body) values ($1,$2,1,$3)`, [x.version, x.element, JSON.stringify(body)]);
    if (k !== 'base') await db.query(`insert into studio.links (from_version_id, to_version_id, kind) values ($1,$2,'remixed_from')`, [x.version, D.base.version]);
  }
}

export async function startReaderImagesDb(port: number, opts: { designs?: boolean } = {}): Promise<{ url: string; stop: () => Promise<void> }> {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  }
  await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x')`);
  for (const [i, im] of FIXTURE_IMAGES.entries()) {
    await db.query(
      `insert into studio.recipes (id, source, provider, model, model_version, prompt, params, seed, cost_usd, created_by_fid)
       values ($1,'in_app','fal.ai','z-image-turbo','fal-ai/z-image/turbo',$2,$3,42,0.003,6786)`,
      [im.recipe, `${im.prompt} No text, no lettering, no signs with words.`, JSON.stringify({ user_prompt: im.prompt, settings: { steps: 8 }, request_id: `fixture-${i}`, by_name: im.name, ...(i === 0 ? { sheets: FIXTURE_SHEETS } : {}) })],
    );
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid) values ($1,'snowmoon','image',6786)`, [im.element]);
    await db.query(
      `insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values ($1,$2,1,'{"lettering":[]}',$3,$4,$5)`,
      [im.version, im.element, im.url, String(i).repeat(64), im.recipe],
    );
    await db.query(`insert into studio.anchors (version_id, work_id, chapter, start_idx, end_idx) values ($1,'snowmoon',1,$2,$3)`, [im.version, im.start, im.end]);
  }
  if (opts.designs) await addDesigns(db);
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 6 });
  await server.start();
  return {
    url: `postgres://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
