/**
 * "Posts that link here" (branch social-read): checks on fixtures, with no network and no live database.
 *
 *   npm run test:social-read
 *
 * - Parsing: Neynar's embed-URL feed and Bluesky's searchPosts answers (synthetic, shaped like the real ones of
 *   2026-10-29) keep only the hash or at:// URI, the handle, plain text, the time and which of our pages each links to;
 *   a labelled Bluesky post or author is left out; a post dated after Bluesky saw it is placed when Bluesky saw it.
 * - Page keys: every way of linking to an adaptation, a fixed version, a chapter or an image finds its page.
 * - Order: newest first, nothing else; at most SOCIAL_READ.perPage; a hidden post never shows.
 * - The draft migration (supabase/migrations/NEXT_social_read.sql) in PGlite: studio_writer reads and adds, can't
 *   change or delete; anon and authenticated read nothing; a malformed id is refused.
 * - Fail closed, end to end (src/lib/social/read.ts, served over a local socket): off, nothing; on but no table, nothing;
 *   with the table, the page's posts, and a hidden one gone.
 * - The rendered section: the label, plain text in a blockquote, the network, @handle, the date and a link out; no
 *   <img>, <script>, <iframe> or style, and nothing from the networks but those words and links.
 */
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { execFileSync } from 'node:child_process';
import { SOCIAL_READ } from '../src/lib/config';
import { type SocialPost, hiddenFrom, newestFirst, pageKey, parseBlueskySearch, parseNeynarFeed, postsForPage } from '../src/lib/social/parse';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passes = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passes++;
  else failures.push(what);
};
const eq = (a: unknown, b: unknown, what: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ---------------------------------------------------------------------------
// Page keys.
// ---------------------------------------------------------------------------
eq(pageKey('/@Naaate/12-the-dog-at-dawn'), '/@naaate/12', 'adaptation with words');
eq(pageKey('/@naaate/12'), '/@naaate/12', 'adaptation bare');
eq(pageKey('/%40naaate/12/'), '/@naaate/12', 'adaptation, encoded @ and trailing slash');
eq(pageKey('/adaptation/12/by/naaate'), '/@naaate/12', 'adaptation, internal path');
eq(pageKey('/@naaate/12-x/v/3'), '/@naaate/12/v/3', 'fixed version with words');
eq(pageKey('/adaptation/12/by/naaate/v/3'), '/@naaate/12/v/3', 'fixed version, internal path');
eq(pageKey('/@naaate/12/storyboard'), '/@naaate/12/storyboard', 'a storyboard is its own page');
eq(pageKey('/chapter/03'), '/chapter/3', 'chapter');
eq(pageKey('/chapter/3/pronunciation'), '/chapter/3/pronunciation', 'chapter subpage is its own page');
eq(pageKey('/image/11111111-1111-4111-8111-111111111111'), '/image/11111111-1111-4111-8111-111111111111', 'image');

// ---------------------------------------------------------------------------
// Neynar's feed (filter_type=embed_url).
// ---------------------------------------------------------------------------
const H = (n: number) => `0x${String(n).padStart(40, 'a')}`;
const neynar = {
  casts: [
    {
      object: 'cast',
      hash: H(1),
      author: { fid: 6786, username: 'naaate', display_name: 'Nate', pfp_url: 'https://imagedelivery.net/x.png', score: 0.9 },
      text: 'Watch this https://snowmoon.party/@naaate/12-dog\u0007',
      timestamp: '2026-10-28T10:00:00.000Z',
      embeds: [{ url: 'https://snowmoon.party/@naaate/12-dog', metadata: { image: { url: 'https://x' } } }],
      reactions: { likes_count: 999, recasts_count: 5 },
      replies: { count: 3 },
    },
    { hash: H(2), author: { username: 'reader' }, text: 'chapter 3!', timestamp: '2026-10-27T10:00:00Z', embeds: [{ url: 'https://www.snowmoon.party/chapter/3#c3-b10' }] },
    { hash: H(3), author: { username: 'other' }, text: 'not ours', timestamp: '2026-10-29T10:00:00Z', embeds: [{ url: 'https://example.com/chapter/3' }] },
    { hash: 'not-a-hash', author: { username: 'bad' }, text: 'x', timestamp: '2026-10-29T10:00:00Z', embeds: [{ url: 'https://snowmoon.party/chapter/3' }] },
    { hash: H(4), author: { username: 'quoter' }, text: 'q', timestamp: '2026-10-26T10:00:00Z', embeds: [{ cast_id: { fid: 1, hash: H(9) } }] },
  ],
  next: { cursor: 'abc' },
};
const fc = parseNeynarFeed(neynar);
eq(fc.map((p) => p.id), [H(1), H(2)], 'Neynar: only casts that link to us, with a real hash');
eq(Object.keys(fc[0]).sort(), ['at', 'handle', 'id', 'network', 'pages', 'text', 'url'], 'Neynar: only the kept fields (no avatar, name, counts or score)');
eq(fc[0].text, 'Watch this https://snowmoon.party/@naaate/12-dog', 'Neynar: control characters removed');
eq(fc[0].url, `https://farcaster.xyz/naaate/${H(1).slice(0, 10)}`, 'Neynar: the link to the cast');
eq(fc[1].pages, ['/chapter/3'], 'Neynar: www and #block still find the chapter');
eq(parseNeynarFeed({}), [], 'Neynar: an odd answer gives nothing');
eq(parseNeynarFeed(null), [], 'Neynar: no answer gives nothing');

// ---------------------------------------------------------------------------
// Bluesky's searchPosts (domain=snowmoon.party, sort=latest).
// ---------------------------------------------------------------------------
const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const bpost = (rkey: string, extra: Record<string, unknown> = {}, record: Record<string, unknown> = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`,
  cid: 'bafy',
  author: { did, handle: 'reader.bsky.social', displayName: 'Reader', avatar: 'https://cdn.bsky.app/img/avatar/x.jpg', labels: [] },
  record: {
    $type: 'app.bsky.feed.post',
    text: 'An image from Snowmoon',
    createdAt: '2026-10-28T12:00:00.000Z',
    facets: [{ index: { byteStart: 0, byteEnd: 10 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://snowmoon.party/image/11111111-1111-4111-8111-111111111111' }] }],
    ...record,
  },
  embed: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://snowmoon.party/x', thumb: 'https://cdn.bsky.app/img/x.jpg' } },
  likeCount: 50,
  indexedAt: '2026-10-28T12:00:01.000Z',
  labels: [],
  ...extra,
});
const bsky = {
  posts: [
    bpost('3mabc1'),
    bpost('3mabc2', { labels: [{ val: 'porn', src: 'did:plc:mod' }] }),
    bpost('3mabc3', { author: { did, handle: 'quiet.bsky.social', labels: [{ val: '!no-unauthenticated' }] } }),
    bpost('3mabc4', {}, { createdAt: '2027-01-01T00:00:00.000Z' }),
    bpost('3mabc5', {}, { facets: [], embed: { $type: 'app.bsky.embed.external', external: { uri: 'https://snowmoon.party/chapter/2' } } }),
    bpost('3mabc6', { author: { did, handle: 'handle.invalid' } }),
    bpost('3mabc7', {}, { facets: [], embed: { $type: 'app.bsky.embed.recordWithMedia', media: { external: { uri: 'https://snowmoon.party/chapter/4' } } } }),
    bpost('3mabc8', {}, { facets: [] }),
  ],
  hitsTotal: 8,
};
const bs = parseBlueskySearch(bsky);
eq(bs.map((p) => p.id.split('/').pop()), ['3mabc1', '3mabc4', '3mabc5', '3mabc7'], 'Bluesky: labelled posts and authors, invalid handles and posts with no link of ours are left out');
eq(Object.keys(bs[0]).sort(), ['at', 'handle', 'id', 'network', 'pages', 'text', 'url'], 'Bluesky: only the kept fields');
eq(bs[0].url, `https://bsky.app/profile/${did}/post/3mabc1`, 'Bluesky: the link to the post (by DID, which a rename does not break)');
eq(bs[1].at, '2026-10-28T12:00:01.000Z', 'Bluesky: a post dated in the future is placed when Bluesky saw it');
eq(bs[2].pages, ['/chapter/2'], 'Bluesky: the link card counts');
eq(bs[3].pages, ['/chapter/4'], 'Bluesky: a link card with media counts');
ok(!JSON.stringify(bs).includes('cdn.bsky.app'), 'Bluesky: no avatar or thumbnail kept');
const long = parseBlueskySearch({ posts: [bpost('3mlong', {}, { text: 'x'.repeat(2000) })] })[0];
eq([...long.text].length, SOCIAL_READ.maxChars, 'a long post is cut to maxChars');
ok(long.text.endsWith('…'), 'a cut post ends with …');

// ---------------------------------------------------------------------------
// Order and hiding.
// ---------------------------------------------------------------------------
const img = '/image/11111111-1111-4111-8111-111111111111';
const mk = (id: string, at: string, page = img): SocialPost => ({ network: 'bluesky', id: `at://${did}/app.bsky.feed.post/${id}`, handle: 'h.bsky.social', text: id, at, url: 'https://bsky.app/x', pages: [page] });
const pile = [mk('a', '2026-10-01T00:00:00Z'), mk('c', '2026-10-03T00:00:00Z'), mk('b', '2026-10-02T00:00:00Z'), mk('c', '2026-10-03T00:00:00Z'), mk('z', '2026-10-09T00:00:00Z', '/chapter/1')];
eq(postsForPage(pile, img, hiddenFrom([])).map((p) => p.text), ['c', 'b', 'a'], 'newest first, each once, only this page');
eq(postsForPage(pile, img, hiddenFrom([{ network: 'bluesky', post_id: `at://${did}/app.bsky.feed.post/c` }])).map((p) => p.text), ['b', 'a'], 'a hidden post never shows');
eq(postsForPage([...fc, ...bs], '/@naaate/12', hiddenFrom([])).map((p) => p.handle), ['naaate'], 'a cast reaches its adaptation page');
const many = Array.from({ length: 40 }, (_, i) => mk(`m${i}`, new Date(Date.UTC(2026, 9, 1, i)).toISOString()));
const shown = postsForPage(many, img, hiddenFrom([]));
eq(shown.length, SOCIAL_READ.perPage, 'at most perPage');
eq(shown[0].text, 'm39', 'the newest is first');
ok([...shown].sort(newestFirst).every((p, i) => p === shown[i]), 'the order is newestFirst');

// ---------------------------------------------------------------------------
// The draft migration, and read.ts end to end, on PGlite.
// ---------------------------------------------------------------------------
async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}
async function database(withTable: boolean) {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    if (!withTable && f === 'NEXT_social_read.sql') continue;
    await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  }
  return db;
}
const tries = async (db: PGlite, q: string) => db.exec(q).then(() => true, () => false);

{
  const db = await database(true);
  // Safe to run twice.
  ok(await tries(db, readFileSync(path.join(ROOT, 'supabase/migrations/NEXT_social_read.sql'), 'utf8')), 'the migration runs twice');
  ok(/\nrollback;\s*$/.test(readFileSync(path.join(ROOT, 'supabase/drafts/NEXT_social_read.DRY-RUN.sql'), 'utf8')), 'the dry run ends in rollback;');
  const body = (f: string) => readFileSync(path.join(ROOT, f), 'utf8').replace(/^--.*$/gm, '').replace(/\b(commit|rollback);/g, '').trim();
  eq(body('supabase/drafts/NEXT_social_read.DRY-RUN.sql'), body('supabase/migrations/NEXT_social_read.sql'), 'the dry run is the migration');
  const cast = H(1);
  await db.exec('set role studio_writer');
  ok(await tries(db, `insert into studio.social_hidden (network, post_id, by_fid, reason) values ('farcaster', '${cast}', 6786, 'writer_asked')`), 'studio_writer can hide a cast');
  ok(await tries(db, `insert into studio.social_hidden (network, post_id, by_fid, reason) values ('bluesky', 'at://${did}/app.bsky.feed.post/3mabc1', 6786, 'terms')`), 'studio_writer can hide a Bluesky post');
  ok(!(await tries(db, `insert into studio.social_hidden (network, post_id, by_fid, reason) values ('farcaster', '0x12', 6786, 'terms')`)), 'a malformed hash is refused');
  ok(!(await tries(db, `insert into studio.social_hidden (network, post_id, by_fid, reason) values ('bluesky', '${cast}', 6786, 'terms')`)), 'a hash as a Bluesky id is refused');
  ok(!(await tries(db, `insert into studio.social_hidden (network, post_id, by_fid, reason) values ('farcaster', '${H(5)}', 6786, 'because')`)), 'an unknown reason is refused');
  ok(!(await tries(db, `update studio.social_hidden set reason = 'terms'`)), 'studio_writer cannot change a hide');
  ok(!(await tries(db, `delete from studio.social_hidden`)), 'studio_writer cannot undo a hide');
  eq((await db.query<{ n: number }>('select count(*)::int as n from studio.social_hidden')).rows[0].n, 2, 'studio_writer reads the hide list');
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    const r = await db.query<{ n: number }>('select count(*)::int as n from studio.social_hidden').then((x) => x.rows[0].n, () => null);
    ok(r === null || r === 0, `${role} cannot read the hide list`);
    await db.exec('reset role');
  }
  await db.close();
}

// read.ts, through a local socket, with a fixture in place of the networks.
const dir = mkdtempSync(path.join(tmpdir(), 'social-read-'));
const fixtureFile = path.join(dir, 'posts.json');
writeFileSync(fixtureFile, JSON.stringify([...fc, ...bs]));
process.env.SOCIAL_READ_FIXTURE = fixtureFile;
delete process.env.VERCEL_ENV;
const read = await import('../src/lib/social/read');
const { db: appDb } = await import('../src/lib/db');
// The section as rendered, for these posts (in a separate process: see scripts/lib/render-social-posts.ts).
const render = (posts: SocialPost[]) =>
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'scripts/lib/render-social-posts.ts')], { input: JSON.stringify(posts), encoding: 'utf8', cwd: ROOT });

{
  // One database, first without the table (before the migration), then with it.
  const pg = await database(false);
  const port = await freePort();
  const server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1' });
  await server.start();
  process.env.STUDIO_DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/postgres`;
  const sql = appDb();
  try {
    process.env.SOCIAL_READ_PREVIEW = '0';
    eq((await read.postsLinkingTo(img)).length, 0, 'off: nothing');
    process.env.SOCIAL_READ_PREVIEW = '1';
    eq((await read.postsLinkingTo(img)).length, 0, 'on, before the migration: nothing (fail closed)');
    eq(await read.hiddenPosts(), null, 'on, before the migration: the hide list reads as unknown');
    eq(render(await read.postsLinkingTo(img)), '', 'on, before the migration: the section is not rendered');

    await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations/NEXT_social_read.sql'), 'utf8'));
    await pg.exec(`insert into studio.social_hidden (network, post_id, by_fid, reason) values ('bluesky', 'at://${did}/app.bsky.feed.post/3mabc5', 6786, 'writer_asked')`);
    eq((await read.postsLinkingTo(img)).map((p) => p.id.split('/').pop()), ['3mabc4', '3mabc1'], 'on, with the table: the page\u2019s posts, newest first');
    eq((await read.postsLinkingTo('/chapter/2')).length, 0, 'on, with the table: a hidden post is gone');
    eq((await read.postsLinkingTo('/chapter/3')).map((p) => p.network), ['farcaster'], 'on, with the table: the cast linking to chapter 3');
    const html = render(await read.postsLinkingTo(img));
    ok(html.includes('Posts that link here'), 'rendered: the label');
    ok(html.includes('<blockquote') && html.includes('An image from Snowmoon'), 'rendered: the text as a quotation');
    ok(html.includes('Bluesky · @reader.bsky.social · <time dateTime="2026-10-28T12:00:01.000Z">2026-10-28</time>'), 'rendered: network, @handle and date');
    ok(html.includes(`href="https://bsky.app/profile/${did}/post/3mabc1"`) && html.includes('rel="nofollow noopener noreferrer ugc"'), 'rendered: the link out');
    ok(html.includes('snowmoon@wearelum.xyz'), 'rendered: how to ask for removal');
    ok(!/<img|<script|<iframe|<video|<audio|style=|srcset/i.test(html), 'rendered: no picture, script, frame or style from the networks');
    ok(html.indexOf('3mabc4') < html.indexOf('3mabc1'), 'rendered: newest first');
    writeFileSync(fixtureFile, JSON.stringify([{ ...bs[0], text: '<img src=x onerror=alert(1)>' }]));
    const xss = render(await read.postsLinkingTo(img));
    ok(!xss.includes('<img') && xss.includes('&lt;img'), 'rendered: a post\u2019s text is text, never markup');
  } finally {
    await sql?.end({ timeout: 1 }).catch(() => {});
    await server.stop();
    await pg.close();
  }
}

console.log(`${passes} pass, ${failures.length} fail`);
if (failures.length) {
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
process.exit(0);
