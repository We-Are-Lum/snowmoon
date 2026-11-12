/**
 * Local data for check:ui's /challenge landing checks (owner, 2026-11-04): an in-memory Postgres (PGlite) with the
 * migrations, three published sheets each of Zei and Bai from before the window, newer than its remixes (the triptych while the bases aren't
 * picked), none of Gladias (the empty state), and eight remixes of Zei and Bai (the random selection and the feed),
 * served on a local port. Nothing here touches the live database. The pictures reuse two seeded illustrations' public
 * files, so nothing new is uploaded.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { CHALLENGE } from '../../src/lib/config';
import { MOMENTS } from '../../src/lib/challenge/moments';
import { gatePglite } from '../lib/pglite-gate';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PICS = ['https://media.snowmoon.party/images/seed/c1/c1-b013-sky-bridge-64be33275e53.jpg', 'https://media.snowmoon.party/images/seed/c1/c1-b005-toy-drone-ea7f59a8c05f.jpg'];
const nameOf = (slug: string) => (JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/designs/characters', `${slug}.json`), 'utf8')) as { name: string }).name;
const id = (kind: number, n: number) => `${String(kind).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Each character's sheets (newest first, as the triptych shows them) and its remixes (newest first, as the feed does),
 * and two published styles (the remix screen's Style row; owner, 2026-11-08): Zei's sheets are made in the first.
 */
export const FIXTURE_CHALLENGE = (() => {
  const styles = [
    { element: id(8, 1), version: id(9, 1), name: 'Quiet, warm light', text: 'Quiet, warm light; soft shadows, calm colours.' },
    { element: id(8, 2), version: id(9, 2), name: 'Printed', text: 'Printed: flat inks, visible halftone, a slightly off register.' },
  ];
  const sheets: Record<string, string[]> = { zei: [], bai: [] };
  const remixes: { versionId: string; character: string; createdAt: string; from: string; title: string }[] = [];
  let n = 0;
  // Once the owner has picked a character's bases (CHALLENGE.bases), its first sheet is its first base, by that id, so
  // /challenge shows it (only bases are shown then); the others stay fixture sheets that aren't bases.
  for (const c of ['zei', 'bai']) for (let i = 0; i < 3; i++) sheets[c].push(i === 0 && CHALLENGE.bases[c]?.[0] ? CHALLENGE.bases[c][0] : id(3, ++n));
  // Newest first. The sheets were made on 2 Nov, one hour apart, the first listed the newest, after the remixes (30 Oct),
  // so before the bases are picked the triptych shows them (the newest sheets of the character).
  for (let i = 0; i < 8; i++) {
    const character = i % 2 ? 'bai' : 'zei';
    remixes.push({ versionId: id(5, i + 1), character, createdAt: new Date(Date.UTC(2026, 9, 30, 20 - i)).toISOString(), from: sheets[character][i % 3], title: `Remix ${i + 1}` });
  }
  // Inside the entry window (owner, 2026-11-12, admin examples): two submitted entries of Zei and, made between them, an
  // admin's picture submitted with its post (an "Admin example", never an entry). Newest first. Added only when
  // check:ui asks (addEntries), after the feed's checks, so the remixes above stay the feed's whole list until then.
  const entries = [
    { versionId: id(10, 1), fid: 900, example: false, createdAt: '2026-11-12T12:00:00.000Z' },
    { versionId: id(10, 2), fid: 6786, example: true, createdAt: '2026-11-12T11:00:00.000Z' },
    { versionId: id(10, 3), fid: 901, example: false, createdAt: '2026-11-12T10:00:00.000Z' },
  ].map((x, i) => ({ ...x, character: 'zei', post: { handle: `fixture${x.fid}`, url: `https://farcaster.xyz/fixture${x.fid}/0x${String(i + 1).repeat(8)}`, id: `0x${String(i + 1).repeat(40)}` } }));
  return { sheets, remixes, styles, entries };
})();

export async function startChallengeDb(port: number): Promise<{ url: string; stop: () => Promise<void>; addEntries: () => Promise<void> }> {
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
  // The published styles (studio.entities kind 'style', each with one published design).
  for (const [i, st] of FIXTURE_CHALLENGE.styles.entries()) {
    const en = id(1, 10 + i);
    await db.query(`insert into studio.entities (id, work_id, kind, name) values ($1,'snowmoon','style',$2)`, [en, st.name]);
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status, created_at) values ($1,'snowmoon','design',6786,$2,'published',$3)`, [st.element, en, new Date(Date.UTC(2026, 9, 20, 10 - i)).toISOString()]);
    await db.query(`insert into studio.element_versions (id, element_id, version_no, body, created_at) values ($1,$2,1,$3,$4)`, [st.version, st.element, JSON.stringify({ title: st.name, text: st.text, samples: [{ url: PICS[i % 2], sha256: 'b'.repeat(64) }], views: {}, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null }), new Date(Date.UTC(2026, 9, 20, 10 - i)).toISOString()]);
  }
  const body = (title: string, pic: string, style: { version_id: string; title: string } | null = null) =>
    JSON.stringify({ title, text: 'Fixture sheet.', samples: [], views: { front: { url: pic, sha256: 'a'.repeat(64), recipe: { prompt: 'p', model: 'z-image-turbo', endpoint: 'e', host: 'fal.ai', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.003, made_at: '2026-10-20T00:00:00Z', width: 576, height: 768, checks: { prompt: { model: 'g', verdict: 'ok' }, host_safety_checker: 'passed' }, assist: null } } }, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style });
  let e = 0;
  const design = async (character: string, versionId: string, at: string, title: string, pic: string, fid: number, style: { version_id: string; title: string } | null = null) => {
    const element = id(4, ++e);
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status, created_at) values ($1,'snowmoon','design',$2,$3,'published',$4)`, [element, fid, entity[character], at]);
    await db.query(`insert into studio.element_versions (id, element_id, version_no, body, created_at) values ($1,$2,1,$3,$4)`, [versionId, element, body(title, pic, style), at]);
  };
  // Zei's sheets are made in the first style, so the remix screen starts on it; Bai's have none (it starts on the first).
  const zeiStyle = { version_id: FIXTURE_CHALLENGE.styles[0].version, title: FIXTURE_CHALLENGE.styles[0].name };
  for (const c of ['zei', 'bai'] as const) {
    for (const [i, v] of FIXTURE_CHALLENGE.sheets[c].entries()) await design(c, v, new Date(Date.UTC(2026, 10, 2, 12 - i)).toISOString(), `Sheet ${i + 1}`, PICS[i % 2], 6786, c === 'zei' ? zeiStyle : null);
  }
  // The remixes are challenge pictures (entries as pictures, CHALLENGE.pictureEntries; branch challenge-moments), each as
  // /api/images/publish writes one: a recipe with params.challenge, the image, its anchor, and a 'uses' link to the
  // character's first sheet (its base once the bases are picked). With pictures off, sheet remixes, as before.
  for (const [i, r] of FIXTURE_CHALLENGE.remixes.entries()) {
    if (!CHALLENGE.pictureEntries) {
      await design(r.character, r.versionId, r.createdAt, r.title, PICS[i % 2], 500 + i);
      await db.query(`insert into studio.links (from_version_id, to_version_id, kind) values ($1,$2,'remixed_from')`, [r.versionId, r.from]);
      continue;
    }
    // With the moments on, each at one of its character's moments; with them off (CHALLENGE.moments, owner 2026-11-08),
    // as the simpler remix screen makes them: no moment, a style, anchored to the character's first passage. The first
    // two keep a moment either way (pictures made before the switch), which no page may show.
    const m = CHALLENGE.moments || i < 2 ? MOMENTS.find((x) => x.characters.includes(r.character))! : null;
    const anchor = m ? { chapter: m.chapter, start: m.start, end: m.end } : { chapter: 2, start: 2, end: 2 };
    const recipe = id(6, i + 1), element = id(7, i + 1), base = FIXTURE_CHALLENGE.sheets[r.character][0];
    const st = FIXTURE_CHALLENGE.styles[i % 2];
    const challenge = m
      ? { character: r.character, moment: m.id, scene: m.scene, from: base, fromKind: 'sheet' }
      : { character: r.character, from: base, fromKind: 'sheet', model: 'flux2-klein-4b-edit', style: { choice: 'published', id: `style:${st.element}`, elementId: st.element, label: st.name, text: st.text } };
    await db.query(`insert into studio.recipes (id, source, provider, model, model_version, prompt, params, seed, cost_usd, created_by_fid, created_at) values ($1,'in_app','fal.ai','flux2-klein-4b-edit','e','p',$2,1,0.009,$3,$4)`,
      [recipe, JSON.stringify({ user_prompt: r.title, by_name: `fixture${500 + i}`, anchor, challenge }), 500 + i, r.createdAt]);
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, status, created_at) values ($1,'snowmoon','image',$2,'published',$3)`, [element, 500 + i, r.createdAt]);
    await db.query(`insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id, created_at) values ($1,$2,1,$3,$4,$5,$6,$7)`, [r.versionId, element, JSON.stringify({ lettering: [] }), PICS[i % 2], String(i + 1).repeat(64).slice(0, 64), recipe, r.createdAt]);
    await db.query(`insert into studio.anchors (version_id, work_id, chapter, start_idx, end_idx) values ($1,'snowmoon',$2,$3,$4)`, [r.versionId, anchor.chapter, anchor.start, anchor.end]);
    await db.query(`insert into studio.links (from_version_id, to_version_id, kind) values ($1,$2,'uses')`, [r.versionId, base]);
  }
  // The entries and the admin example (FIXTURE_CHALLENGE.entries), as Submit leaves them: each a challenge picture of Zei
  // from its first sheet, with its eligibility decided at publish and its post listed; the two entries also have their
  // row in studio.challenge_marks, the admin example none (owner, 2026-11-12).
  const addEntries = async () => {
    if (!CHALLENGE.pictureEntries) return;
    const base = FIXTURE_CHALLENGE.sheets.zei[0];
    for (const [i, x] of FIXTURE_CHALLENGE.entries.entries()) {
      const recipe = id(11, i + 1), element = id(12, i + 1);
      const challenge = { character: x.character, from: base, fromKind: 'sheet', model: 'flux2-klein-4b-edit' };
      await db.query(`insert into studio.recipes (id, source, provider, model, model_version, prompt, params, seed, cost_usd, created_by_fid, created_at) values ($1,'in_app','fal.ai','flux2-klein-4b-edit','e','p',$2,1,0.009,$3,$4)`,
        [recipe, JSON.stringify({ user_prompt: `Entry ${i + 1}`, by_name: `fixture${x.fid}`, anchor: { chapter: 2, start: 2, end: 2 }, challenge }), x.fid, x.createdAt]);
      await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, status, created_at) values ($1,'snowmoon','image',$2,'published',$3)`, [element, x.fid, x.createdAt]);
      await db.query(`insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id, created_at) values ($1,$2,1,$3,$4,$5,$6,$7)`, [x.versionId, element, JSON.stringify({ lettering: [] }), PICS[i % 2], String(i + 7).repeat(64).slice(0, 64), recipe, x.createdAt]);
      await db.query(`insert into studio.anchors (version_id, work_id, chapter, start_idx, end_idx) values ($1,'snowmoon',2,2,2)`, [x.versionId]);
      await db.query(`insert into studio.links (from_version_id, to_version_id, kind) values ($1,$2,'uses')`, [x.versionId, base]);
      await db.query(`insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible) values ($1,$2,$3,$4,$5)`, [x.versionId, CHALLENGE.id, x.fid, x.example ? 'admin' : 'passed', !x.example]);
      await db.query(`insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid) values ($1,'farcaster',$2,$3,$4,$5,$6)`, [x.versionId, x.post.id, x.post.handle, x.createdAt, x.post.url, x.fid]);
      if (!x.example) await db.query(`insert into studio.challenge_marks (challenge, fid, character, version_id, marked_at) values ($1,$2,$3,$4,$5)`, [CHALLENGE.id, x.fid, x.character, x.versionId, x.createdAt]);
    }
  };
  // The site holds PGlite's one session through the socket; addEntries' direct writes wait until it is between
  // pipelines (scripts/lib/pglite-gate.ts), so they never land inside one of the site's queries.
  gatePglite(db);
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  return {
    addEntries,
    url: `postgres://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
