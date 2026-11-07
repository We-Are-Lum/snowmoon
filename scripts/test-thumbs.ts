/**
 * Speed fix 1 (owner, 2026-11-06): small copies of readers' pictures, saved at publish time, used by lists, with a
 * backfill. Every check has a planted violation that must fail. Runs on this machine only: the store under the
 * rehearsal switch (a folder, never R2), PGlite for the backfill's database, a local HTTP server for the "public
 * bucket". Nothing is sent anywhere. Written by the coding agent (Claude, by Anthropic), 2026-11-07.
 *
 *   npm run test:thumbs
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const tmp = mkdtempSync(path.join(tmpdir(), 'thumbs-'));

// ---- The "public bucket": a local server over the store's public half ----
const PUB_DIR = path.join(tmp, 'public');
const http = createServer((req, res) => {
  const f = path.join(PUB_DIR, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!f.startsWith(PUB_DIR) || !existsSync(f)) { res.writeHead(404).end(); return; }
  const body = readFileSync(f);
  res.writeHead(200, { 'Content-Type': f.endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
});
await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
const PUBLIC = `http://127.0.0.1:${(http.address() as { port: number }).port}`;

// The store under the rehearsal switch: a folder on this machine, never R2 (src/lib/images/store.ts).
const DB_PORT = 54393;
const DB_URL = `postgres://studio_writer@127.0.0.1:${DB_PORT}/postgres`;
const ENV = { CHALLENGE_REHEARSAL: 'on', REHEARSAL_STORE: tmp, R2_IMAGES_PUBLIC_URL: PUBLIC, STUDIO_DATABASE_URL: DB_URL, VERCEL: '', VERCEL_ENV: '', NEXT_PUBLIC_VERCEL_ENV: '' };
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PRIVATE_BUCKET']) delete process.env[k];
Object.assign(process.env, ENV);
const store = await import('../src/lib/images/store');
const { THUMBS, thumbKeyFor, thumbUrl, thumbSrcSet } = await import('../src/lib/images/thumb-url');
check('the test runs on the local store only (rehearsal switch on, no R2 keys)', store.rehearsalStore() === tmp && store.missingStorage().length > 0);

/** A picture as publish makes it: a 1024 × 576 JPEG, with EXIF that a copy must not carry. */
const picture = async (seed: number, w = 1024, h = 576) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: (seed * 53) % 255, g: (seed * 97) % 255, b: 120 } } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="#fff"/></svg>`) }])
    .withExif({ IFD0: { Artist: 'someone@example.test', ImageDescription: 'personal note' } })
    .jpeg({ quality: 90 })
    .toBuffer();

// ---- 1. At publish: the original, then its copies beside it ----
const a = await picture(1);
const aSha = sha(a);
const aUrl = await store.putPublic(aSha, a, 'image/jpeg');
const aFile = path.join(PUB_DIR, store.keyFor(aSha));
check('publish: the original is stored under its own key, its bytes unchanged (sha256 the same)', existsSync(aFile) && sha(readFileSync(aFile)) === aSha && aUrl === `${PUBLIC}/${store.keyFor(aSha)}`);
const made = THUMBS.widths.map((w) => path.join(PUB_DIR, thumbKeyFor(aSha, w)));
check('publish: a 320 and a 640 copy are made beside it, under the predictable key', made.every(existsSync), made.filter((f) => !existsSync(f)).join(', '));
const metas = await Promise.all(made.filter(existsSync).map((f) => sharp(readFileSync(f)).metadata()));
check('publish: each copy is WebP at its width, the original\'s shape kept', metas.length === 2 && metas.every((m, k) => m.format === 'webp' && m.width === THUMBS.widths[k] && Math.abs(m.height! / m.width! - 576 / 1024) < 0.01), JSON.stringify(metas.map((m) => [m.format, m.width, m.height])));
check('publish: the copies are much smaller than the original', made.filter(existsSync).every((f) => readFileSync(f).length < a.length / 3), made.filter(existsSync).map((f) => readFileSync(f).length).join(' ') + ` vs ${a.length}`);
check('privacy: the original\'s EXIF is not in any copy (a copy adds no data, and drops metadata)', (await sharp(a).metadata()).exif !== undefined && metas.every((m) => m.exif === undefined && !readFileSync(made[0]).includes('someone@example.test')));
check('publish: the copies\' address is read off the original\'s', thumbUrl(aUrl, 320) === `${PUBLIC}/${thumbKeyFor(aSha, 320)}` && thumbUrl(aUrl, 640) === `${PUBLIC}/${thumbKeyFor(aSha, 640)}`);
// Planted: book media and other addresses have no copies.
check('planted: book media, routes and other files have no copy address', [
  'https://media.snowmoon.party/images/seed/c1/c1-b005-toy-drone-ea7f59a8c05f.jpg',
  '/api/pieces/image/123',
  `${PUBLIC}/images/readers/${aSha.slice(0, 32)}.png`,
  `${PUBLIC}/images/readers/thumbs/${aSha.slice(0, 32)}-w320.webp`,
  null,
].every((u) => thumbUrl(u, 320) === null && thumbSrcSet(u) === null));
// A small original is never enlarged.
const small = await picture(2, 300, 400);
await store.putPublic(sha(small), small, 'image/jpeg');
const smallMeta = await sharp(readFileSync(path.join(PUB_DIR, thumbKeyFor(sha(small), 640)))).metadata();
check('publish: a copy is never wider than its original', smallMeta.width === 300, String(smallMeta.width));
// Planted: an original that isn't an image still publishes; there is just no copy.
const junk = Buffer.from('not an image');
const junkUrl = await store.putPublic(sha(junk), junk, 'image/jpeg');
check('planted: a copy that cannot be made never fails the publish (original stored, no copy)', junkUrl.endsWith(store.keyFor(sha(junk))) && existsSync(path.join(PUB_DIR, store.keyFor(sha(junk)))) && !existsSync(path.join(PUB_DIR, thumbKeyFor(sha(junk), 320))));

// ---- 2. Hidden with the original, back with it ----
await store.moveToPrivate(aSha);
check('hide: the original and both copies leave the public half', !existsSync(aFile) && made.every((f) => !existsSync(f)));
check('hide: they are kept privately', [store.keyFor(aSha), ...THUMBS.widths.map((w) => thumbKeyFor(aSha, w))].every((k) => existsSync(path.join(tmp, 'private', k))));
await store.restorePublic(aSha);
check('unhide: the original and its copies are back, the original byte for byte', existsSync(aFile) && sha(readFileSync(aFile)) === aSha && made.every(existsSync));

// ---- 3. Lists use the copy; a picture's own page keeps the original ----
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
/** A list's source: its picture through ThumbImg, and no plain <img> drawing that same picture. */
const usesThumb = (code: string, expr: string) => new RegExp(`<ThumbImg[^>]*src=\\{${expr.replace(/[.?]/g, '\\$&')}\\}`).test(code) && !new RegExp(`<img[^>]*src=\\{${expr.replace(/[.?]/g, '\\$&')}\\}`).test(code);
const LISTS: [string, string[]][] = [
  ['src/components/home-feed.tsx', ['im.url']],
  ['src/components/challenge-card.tsx', ['t.thumb', 'big.thumb']],
  ['src/components/challenge-remix-card.tsx', ['r.thumb']],
  ['src/components/image-feed.tsx', ['im.url']],
  ['src/components/reference-cards.tsx', ['im.url']],
  ['src/components/pictures-latest.tsx', ['it.design.thumb']],
  ['src/components/design-index.tsx', ['s.thumb']],
];
// Home "Just made" (#124): NearThumb waits until near the screen, then draws the copy.
const home = src('src/components/home-feed.tsx');
const nearUsesThumb = (code: string) => /<NearThumb src=\{im\.url\}/.test(code) ? /if \(near\) return <ThumbImg src=\{src\}/.test(code) && !/<img[^>]*src=\{(near \? )?src/.test(code) : usesThumb(code, 'im.url');
check('lists: src/components/home-feed.tsx shows the copy once near the screen (NearThumb, #124)', nearUsesThumb(home));
check('planted: NearThumb drawing the original is caught', !nearUsesThumb(home.replace('if (near) return <ThumbImg src={src}', 'if (near) return <img src={src}')));
for (const [f, exprs] of LISTS.filter(([f]) => f !== 'src/components/home-feed.tsx')) check(`lists: ${f} shows the copy (${exprs.join(', ')})`, exprs.every((e) => usesThumb(src(f), e)));
check('planted: a list drawing the original with a plain <img> is caught', !usesThumb(src('src/components/image-feed.tsx').replace(/<ThumbImg src=\{im\.url\}/, '<img src={im.url}'), 'im.url'));
check('the picture\'s own page keeps the original', /<img src=\{im\.url\}/.test(src('src/app/image/[id]/page.tsx')) && !/<ThumbImg/.test(src('src/app/image/[id]/page.tsx')));
const ti = src('src/components/thumb-img.tsx');
check('ThumbImg falls back to the original when a copy is missing (onError, and on mount for a failure before start-up)', /onError/.test(ti) && /naturalWidth === 0/.test(ti) && /src=\{small \?\? src\}/.test(ti));
check('ThumbImg offers both copies by width', thumbSrcSet(aUrl) === `${thumbUrl(aUrl, 320)} 320w, ${thumbUrl(aUrl, 640)} 640w`);
const { readerImageView } = await import('../src/lib/ai-declared');
const v = readerImageView({ versionId: '00000000-0000-0000-0000-000000000000', by: '@x', chapter: 1, listCopyOf: aUrl });
check('recipe: opened from a list, it says the list shows a smaller copy and the original is unchanged', /smaller copy/.test(v.copy?.text ?? '') && /original is unchanged/.test(v.copy?.text ?? '') && /no model/.test(v.copy?.text ?? ''));
check('planted: a picture with no copy (book media) gets no such line', readerImageView({ versionId: null, by: '@x', chapter: 1, listCopyOf: 'https://media.snowmoon.party/images/seed/c1/x.jpg' }).copy === undefined);

// ---- 4. The backfill ----
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const server = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1' });
await server.start();
const q = async <T>(f: (s: postgres.Sql) => Promise<T>) => { const s = postgres(DB_URL, { prepare: false, max: 1, onnotice: () => {} }); try { return await f(s); } finally { await s.end(); } };

/** Old pictures: in the public half with no copies, as everything published before this. */
const old = async (seed: number) => {
  const b = await picture(seed);
  const s = sha(b);
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(path.join(PUB_DIR, 'images/readers'), { recursive: true });
  writeFileSync(path.join(PUB_DIR, store.keyFor(s)), b);
  return { sha: s, url: `${PUBLIC}/${store.keyFor(s)}`, bytes: b };
};
const img1 = await old(11); // an image element, by asset_url
const img2 = await old(12); // a sheet: its front in the body
const gone = await old(13); // published, but its file has left the public half (hidden by moderation)
rmSync(path.join(PUB_DIR, store.keyFor(gone.sha)));
const draft = await old(14); // a draft element: not published, never backfilled
await q(async (s) => {
  const el = async (status: string) => (await s`insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', 6786, ${status}) returning id`)[0].id;
  await s`insert into studio.element_versions (element_id, version_no, asset_url, asset_sha256) values (${await el('published')}, 1, ${img1.url}, ${img1.sha})`;
  await s`insert into studio.element_versions (element_id, version_no, body) values (${await el('published')}, 1, ${s.json({ views: { front: { url: img2.url, sha256: img2.sha } } })})`;
  await s`insert into studio.element_versions (element_id, version_no, asset_url, asset_sha256) values (${await el('published')}, 1, ${gone.url}, ${gone.sha})`;
  await s`insert into studio.element_versions (element_id, version_no, asset_url, asset_sha256) values (${await el('draft')}, 1, ${draft.url}, ${draft.sha})`;
  // A row a reader might really have: a hidden image's record keeps its address.
  await s`insert into studio.element_versions (element_id, version_no, asset_url, asset_sha256) values (${await el('hidden')}, 1, ${draft.url}, ${draft.sha})`;
});
const exec = (args: string[]) => new Promise<{ status: number | null; out: string }>((resolve) => {
  const p = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['--conditions=react-server', 'scripts/backfill-thumbs.ts', `--db=${DB_URL}`, '--set-role=studio_writer', `--public-base=${PUBLIC}`, '--list', ...args], { cwd: ROOT, env: { ...process.env, ...ENV } });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (status) => resolve({ status, out }));
});
const copies = () => (existsSync(path.join(PUB_DIR, 'images/readers/thumbs')) ? readdirSync(path.join(PUB_DIR, 'images/readers/thumbs')).length : 0);
const before = copies();
const counts = () => q(async (s) => JSON.stringify((await s`select (select count(*)::int from studio.elements) e, (select count(*)::int from studio.element_versions) v`)[0]));
const rowsBefore = await counts();

const dry = await exec([]);
check('backfill: the dry run exits 0, says it wrote nothing', dry.status === 0 && /Dry run: nothing written, nothing uploaded\./.test(dry.out), dry.out.slice(-600));
check('backfill: the dry run writes no copy', copies() === before, `${copies()} vs ${before}`);
// aUrl isn't in the database (published by the test above), so: img1, img2 to make; gone not public; draft unseen.
check('backfill: the dry run counts 2 to make, 1 not public, and leaves drafts and hidden records out', /would make copies for: 2 pictures/.test(dry.out) && /not public now .*: 1/.test(dry.out) && /readers' pictures named by published records: 3/.test(dry.out), dry.out);
check('backfill: the dry run gives the real byte counts', /w320: [\d.]+ MB in all/.test(dry.out) && /w640: [\d.]+ MB in all/.test(dry.out) && /to write: [\d.]+ MB in 4 files/.test(dry.out));
const noGo = await exec(['--apply']);
check('planted: --apply without --confirm-owner-go is refused, nothing written', noGo.status === 2 && /confirm-owner-go/.test(noGo.out) && copies() === before, noGo.out.slice(-300));
const go = await exec(['--apply', '--confirm-owner-go']);
check('backfill: --apply --confirm-owner-go makes the 4 copies through putThumbs', go.status === 0 && /copies made for: 2 pictures/.test(go.out) && copies() === before + 4, go.out.slice(-600));
check('backfill: the copies match what publish makes', [img1, img2].every((x) => THUMBS.widths.every((w) => existsSync(path.join(PUB_DIR, thumbKeyFor(x.sha, w))))));
check('backfill: no copy for the picture no longer public, nor for the draft\'s', THUMBS.widths.every((w) => !existsSync(path.join(PUB_DIR, thumbKeyFor(gone.sha, w))) && !existsSync(path.join(PUB_DIR, thumbKeyFor(draft.sha, w)))));
check('backfill: originals unchanged', [img1, img2].every((x) => sha(readFileSync(path.join(PUB_DIR, store.keyFor(x.sha)))) === x.sha));
check('backfill: no database row changed', (await counts()) === rowsBefore);
const again = await exec([]);
check('backfill: run again, there is nothing to make', again.status === 0 && /would make copies for: 0 pictures/.test(again.out) && /already have their copies: 2/.test(again.out), again.out.slice(-400));

await server.stop();
await db.close();
http.close();
rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`\ntest:thumbs FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\ntest:thumbs passed: ${passed} checks`);
process.exit(0);
