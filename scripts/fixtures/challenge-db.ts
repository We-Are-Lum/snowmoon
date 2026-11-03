/**
 * Local data for check:ui's /challenge landing checks (owner, 2026-11-04): an in-memory Postgres (PGlite) with the
 * migrations, three published sheets each of Zei and Bai from before the window (the triptych while the bases aren't
 * picked), none of Gladias (the empty state), and eight remixes of Zei and Bai (the random selection and the feed),
 * served on a local port. Nothing here touches the live database. The pictures reuse two seeded illustrations' public
 * files, so nothing new is uploaded.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PICS = ['https://media.snowmoon.party/images/seed/c1/c1-b013-sky-bridge-64be33275e53.jpg', 'https://media.snowmoon.party/images/seed/c1/c1-b005-toy-drone-ea7f59a8c05f.jpg'];
const nameOf = (slug: string) => (JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/designs/characters', `${slug}.json`), 'utf8')) as { name: string }).name;
const id = (kind: number, n: number) => `${String(kind).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Each character's sheets (newest first, as the triptych shows them) and its remixes (newest first, as the feed does). */
export const FIXTURE_CHALLENGE = (() => {
  const sheets: Record<string, string[]> = { zei: [], bai: [] };
  const remixes: { versionId: string; character: string; createdAt: string; from: string; title: string }[] = [];
  let n = 0;
  for (const c of ['zei', 'bai']) for (let i = 0; i < 3; i++) sheets[c].push(id(3, ++n));
  // Newest first: the sheets were made on 20 Oct, one hour apart, the first listed the newest.
  for (let i = 0; i < 8; i++) {
    const character = i % 2 ? 'bai' : 'zei';
    remixes.push({ versionId: id(5, i + 1), character, createdAt: new Date(Date.UTC(2026, 9, 30, 20 - i)).toISOString(), from: sheets[character][i % 3], title: `Remix ${i + 1}` });
  }
  return { sheets, remixes };
})();

export async function startChallengeDb(port: number): Promise<{ url: string; stop: () => Promise<void> }> {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  }
  await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  const entity: Record<string, string> = {};
  for (const [i, c] of ['zei', 'bai', 'gladias'].entries()) {
    entity[c] = id(1, i + 1);
    await db.query(`insert into studio.entities (id, work_id, kind, name) values ($1,'snowmoon','character',$2)`, [entity[c], nameOf(c)]);
  }
  const body = (title: string, pic: string) =>
    JSON.stringify({ title, text: 'Fixture sheet.', samples: [], views: { front: { url: pic, sha256: 'a'.repeat(64), recipe: { prompt: 'p', model: 'z-image-turbo', endpoint: 'e', host: 'fal.ai', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.003, made_at: '2026-10-20T00:00:00Z', width: 576, height: 768, checks: { prompt: { model: 'g', verdict: 'ok' }, host_safety_checker: 'passed' }, assist: null } } }, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null });
  let e = 0;
  const design = async (character: string, versionId: string, at: string, title: string, pic: string, fid: number) => {
    const element = id(4, ++e);
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status, created_at) values ($1,'snowmoon','design',$2,$3,'published',$4)`, [element, fid, entity[character], at]);
    await db.query(`insert into studio.element_versions (id, element_id, version_no, body, created_at) values ($1,$2,1,$3,$4)`, [versionId, element, body(title, pic), at]);
  };
  for (const c of ['zei', 'bai'] as const) {
    for (const [i, v] of FIXTURE_CHALLENGE.sheets[c].entries()) await design(c, v, new Date(Date.UTC(2026, 9, 20, 12 - i)).toISOString(), `Sheet ${i + 1}`, PICS[i % 2], 6786);
  }
  for (const [i, r] of FIXTURE_CHALLENGE.remixes.entries()) {
    await design(r.character, r.versionId, r.createdAt, r.title, PICS[i % 2], 500 + i);
    await db.query(`insert into studio.links (from_version_id, to_version_id, kind) values ($1,$2,'remixed_from')`, [r.versionId, r.from]);
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
