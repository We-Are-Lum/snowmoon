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

export async function startReaderImagesDb(port: number): Promise<{ url: string; stop: () => Promise<void> }> {
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
      [im.recipe, `${im.prompt} No text, no lettering, no signs with words.`, JSON.stringify({ user_prompt: im.prompt, settings: { steps: 8 }, request_id: `fixture-${i}`, by_name: im.name })],
    );
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid) values ($1,'snowmoon','image',6786)`, [im.element]);
    await db.query(
      `insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values ($1,$2,1,'{"lettering":[]}',$3,$4,$5)`,
      [im.version, im.element, im.url, String(i).repeat(64), im.recipe],
    );
    await db.query(`insert into studio.anchors (version_id, work_id, chapter, start_idx, end_idx) values ($1,'snowmoon',1,$2,$3)`, [im.version, im.start, im.end]);
  }
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  return {
    url: `postgres://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
