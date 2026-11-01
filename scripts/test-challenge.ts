/**
 * The remix challenge (owner, 2026-10-31; docs/proposals/remix-challenge-plan.md, branch remix-challenge). Stand-ins
 * only: no network (every network call goes to a recording stand-in), no paid call, no production database (an
 * in-memory Postgres, PGlite, with every migration including NEXT_remix_challenge.sql). Fails (exit 1) on any problem.
 *
 *   npm run test:challenge
 *
 * Each rule is also proven to fail on a planted violation ("proof: …" lines): the check is run on a bad input and
 * must report it.
 * - Eligibility (decided once at publish and stored; pages never ask Neynar): invited, or a Neynar score at or above the
 *   threshold; refused: below it, no score, a wallet account, admins. The spend cap ($15 in the window, $2 outside),
 *   sheets opening only in the window and once Privacy says so, the rules copy (forks only, three entrants, a bounty per character,
 *   the mint as a plan), and the count of distinct entrants per character.
 * - One entry per person per character: the latest in the window, or the one marked; a mark of something else is
 *   ignored; a wallet and its FID are one person.
 * - The window's edges, in Pacific time, from CHALLENGE.dates; every date shown is built from it, and no page or
 *   wording file writes a date itself.
 * - The post address: the exact host allow-list; look-alike hosts, sub-domains, IPs, other schemes, ports and user
 *   name tricks are refused.
 * - The server never fetches the pasted address: every request goes to an API host, and a request elsewhere is refused.
 * - A post that doesn't link to the version's page is refused.
 * - "Posted on" holds no image, avatar, embed or script.
 * - The migration: the read-back (both parts) passes on it; marks and posts work; without the tables, nothing breaks.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { ADMINS, CHALLENGE, IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
/** A proof: the rule, run on a planted violation, must report it. */
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
}

const R = await import('../src/lib/challenge/rules');
const L = await import('../src/lib/challenge/post-links');

// --- Eligibility -------------------------------------------------------------------------------------------------
const lists = { admins: [6786, 193912], invited: [6786, 6852], min: 0.7 };
const el = (maker: number, score: number | null) => R.eligibility({ maker, score }, lists);
check('an invited FID is eligible without a score', el(6852, null).eligible && el(6852, null).why === 'invited');
check('a score at the threshold (0.7) passes', el(500, 0.7).eligible && el(500, 0.7).why === 'passed');
check('a score above the threshold is eligible', el(500, 0.93).eligible);
check('refused: a score just below the threshold (0.699)', !el(500, 0.699).eligible && el(500, 0.699).why === 'below');
check('refused: no score (Neynar did not answer at publish)', !el(500, null).eligible && el(500, null).why === 'unchecked');
check('refused: a wallet account, even with a high score (wallets can’t make sheets yet; owner, 2026-10-31)', !el(-7, 0.99).eligible && el(-7, 0.99).why === 'not-a-farcaster-account');
check('refused: an admin, even invited (6786)', !el(6786, 1).eligible && el(6786, 1).why === 'admin');
check('refused: an admin with a high score (193912)', !el(193912, 0.99).eligible && el(193912, 0.99).why === 'admin');
check('the real lists: every admin is refused', ADMINS.every((a) => R.eligibility({ maker: a, score: 1 }).why === 'admin'));
check('the challenge\'s own threshold, fixed at 0.7 (CHALLENGE.neynarMinScore), is the one applied', CHALLENGE.neynarMinScore === 0.7 && R.eligibility({ maker: 999999, score: 0.7 }).eligible && !R.eligibility({ maker: 999999, score: 0.699 }).eligible);
check('the challenge threshold does not follow IMAGES.neynarMinScore', /min: CHALLENGE\.neynarMinScore/.test(read('src/lib/challenge/who.ts')) && !/IMAGES\.neynarMinScore/.test(read('src/lib/challenge/who.ts')));
proof('a threshold read from IMAGES (which may change) is caught', /IMAGES\.neynarMinScore/.test(read('src/lib/challenge/who.ts').replace('CHALLENGE.neynarMinScore', 'IMAGES.neynarMinScore')));
check('a stored decision is read back with the lists applied again (an admin never, invited always, else as decided)', R.fromDecision(193912, 'passed').why === 'admin' && R.fromDecision(6852, null).eligible && R.fromDecision(500, 'passed').eligible && !R.fromDecision(500, 'below').eligible && !R.fromDecision(500, null).eligible);
proof('an admin let through is caught', R.eligibility({ maker: 77, score: 1 }, { ...lists, admins: [77] }).why === 'admin' && R.eligibility({ maker: 77, score: 1 }, { ...lists, admins: [] }).eligible);
proof('a wallet path let back in is caught', R.eligibility({ maker: -7, score: 0.99 }, lists).eligible === false && el(-7, 0.99).why !== 'passed');

// --- The window, in Pacific time ---------------------------------------------------------------------------------
const D0 = CHALLENGE.dates;
check('opens at the launch call: Fri 6 Nov 2026, 09:00 Pacific', R.pacificWallTime(D0.opens) === '2026-11-06 09:00', R.pacificWallTime(D0.opens));
check('the last minute is Sun 22 Nov 2026, 23:59 Pacific', R.pacificWallTime(new Date(Date.parse(D0.closes) - 60_000).toISOString()) === '2026-11-22 23:59');
check('results: Fri 4 Dec 2026, 09:00 Pacific', R.pacificWallTime(D0.results) === '2026-12-04 09:00');
check('the shortlist vote and jurors: Tue 1 Dec 2026, 00:00 Pacific', R.pacificWallTime(D0.shortlistOpens) === '2026-12-01 00:00');
check('… to the end of Thu 3 Dec 2026 (its last minute 23:59 Pacific)', R.pacificWallTime(new Date(Date.parse(D0.shortlistCloses) - 60_000).toISOString()) === '2026-12-03 23:59');
check('the mint opens Tue 8 Dec 2026, 09:00 Pacific', R.pacificWallTime(D0.mintOpens) === '2026-12-08 09:00');
check('the mint closes at the Fri 18 Dec 2026 call, 09:00 Pacific', R.pacificWallTime(D0.mintCloses) === '2026-12-18 09:00');
check('the mint close is shown as the call time, not a minute earlier', R.dateText('mintCloses', { time: true }) === 'Friday 18 December, 09:00 Pacific', R.dateText('mintCloses', { time: true }));
check('the phases come in order', [D0.opens, D0.closes, D0.shortlistOpens, D0.shortlistCloses, D0.results, D0.mintOpens, D0.mintCloses].every((x, i, a) => i === 0 || Date.parse(a[i - 1]) <= Date.parse(x)));
const at = (iso: string, deltaMs: number) => new Date(Date.parse(iso) + deltaMs);
check('the opening instant is in', R.inWindow(at(D0.opens, 0)));
check('a millisecond before opening is out', !R.inWindow(at(D0.opens, -1)));
check('23:59:59.999 Pacific on the last day is in', R.inWindow(at(D0.closes, -1)));
check('midnight Pacific after the last day is out', !R.inWindow(at(D0.closes, 0)));
check('the window crosses no clock change (PST throughout): 23:59 Pacific is 07:59 UTC the next day', new Date(Date.parse(D0.closes) - 60_000).toISOString() === '2026-11-23T07:59:00.000Z');
check('dateText builds the deadline from the config', R.dateText('closes', { time: true }) === 'Sunday 22 November, 23:59 Pacific', R.dateText('closes', { time: true }));
check('windowText spans the window', R.windowText() === '6 to 22 November', R.windowText());
// The free spend cap: $15 inside the window, $2 outside, by itself (owner, 2026-10-31).
{
  const C = await import('../src/lib/config');
  check('spend cap: $2 a millisecond before the window opens', C.imagesDailySpendCapUsd(at(D0.opens, -1)) === 2);
  check('spend cap: $15 at the opening instant', C.imagesDailySpendCapUsd(at(D0.opens, 0)) === 15);
  check('spend cap: $15 at 23:59:59.999 Pacific on the last day', C.imagesDailySpendCapUsd(at(D0.closes, -1)) === 15);
  check('spend cap: back to $2 at the close', C.imagesDailySpendCapUsd(at(D0.closes, 0)) === 2);
  check('spend cap: $2 today (before the launch)', C.imagesDailySpendCapUsd(new Date('2026-10-31T20:00:00Z')) === 2);
  check('the base caps are unchanged ($2 outside; IMAGES.invited unchanged)', IMAGES.dailySpendCapUsd === 2 && CHALLENGE.dailySpendCapUsd === 15 && IMAGES.invited.join() === '6786,6852');
  const limits = read('src/lib/images/limits.ts');
  check('the spend check reads the cap through imagesDailySpendCapUsd()', (limits.match(/imagesDailySpendCapUsd\(\)/g) ?? []).length === 2 && !/IMAGES\.dailySpendCapUsd/.test(limits));
  proof('a cap read straight from IMAGES (never $15) is caught', /IMAGES\.dailySpendCapUsd/.test(limits.replace('imagesDailySpendCapUsd()', 'IMAGES.dailySpendCapUsd')));
  proof('a cap that stays at $15 after the close is caught', ((t: Date) => (t.getTime() >= Date.parse(D0.opens) ? 15 : 2))(at(D0.closes, 0)) !== C.imagesDailySpendCapUsd(at(D0.closes, 0)));
}
check('a date moved in the config moves in the text', R.dateText('closes', { time: true }, { ...D0, closes: '2026-11-18T08:00:00Z' }) === 'Tuesday 17 November, 23:59 Pacific');
check('phase: before, open, closed', R.phase(at(D0.opens, -1)) === 'before' && R.phase(at(D0.opens, 0)) === 'open' && R.phase(at(D0.closes, 0)) === 'closed');
proof('a window ending at 23:59 (losing its last minute) is caught', !R.inWindow(at(D0.closes, -1), { opens: D0.opens, closes: new Date(Date.parse(D0.closes) - 60_000).toISOString() }));

// --- No date written into a page or wording file (owner, 2026-10-31) ---------------------------------------------
const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const DATE_IN_COPY = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b|\\b${MONTH}\\s+\\d{1,2}\\b|\\b20\\d\\d-\\d\\d-\\d\\d\\b|\\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\\s+\\d`, 'i');
const COPY_FILES = /^src\/app\/challenge\/|^src\/lib\/challenge\/(?!rules\.ts$)|^src\/components\/(challenge-[a-z-]+|posted-on|post-link-field)\.tsx$/;
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function hardCodedDates(files: { file: string; text: string }[]): string[] {
  return files.filter((f) => COPY_FILES.test(f.file)).flatMap((f) => {
    const m = stripComments(f.text).match(DATE_IN_COPY);
    return m ? [`${f.file}: "${m[0]}"`] : [];
  });
}
const copyFiles = walk('src').filter((f) => COPY_FILES.test(f)).map((f) => ({ file: f, text: read(f) }));
check('the page and wording files exist', copyFiles.some((f) => f.file === 'src/app/challenge/page.tsx') && copyFiles.some((f) => f.file === 'src/lib/challenge/wording.ts'));
const dated = hardCodedDates(copyFiles);
check('no page or wording file writes a challenge date itself (all from CHALLENGE.dates)', dated.length === 0, dated.join('; '));
proof('a date written into the rules is caught', hardCodedDates([{ file: 'src/lib/challenge/wording.ts', text: "export const X = 'From 6 to 17 November, make your own version';" }]).length === 1);
proof('a weekday-and-date line is caught', hardCodedDates([{ file: 'src/app/challenge/page.tsx', text: '<p>On Friday 20 November we show them</p>' }]).length === 1);
proof('an ISO date in a component is caught', hardCodedDates([{ file: 'src/components/challenge-share.tsx', text: "const until = '2026-11-17';" }]).length === 1);

// --- One entry per person per character -------------------------------------------------------------------------
const inW = (min: number) => at(D0.opens, min * 60_000).toISOString();
const cand = (versionId: string, person: number, character: string, minutes: number, forked = true) => ({ versionId, elementId: `e-${versionId}`, character, person, createdAt: inW(minutes), forked });
const cs = [cand('a1', 500, 'bai', 10), cand('a2', 500, 'bai', 20), cand('a3', 500, 'zei', 5), cand('b1', 501, 'bai', 15), cand('c1', 502, 'bai', 30), cand('o1', 503, 'bai', -1), cand('n1', 504, 'bai', 40, false)];
const ok = (p: number) => p !== 502;
const chosen = R.chooseEntries(cs, new Map(), ok);
check('one entry per person per character', chosen.map((c) => c.versionId).sort().join() === 'a2,a3,b1', chosen.map((c) => c.versionId).join());
check('the latest version counts by default', chosen.find((c) => c.person === 500 && c.character === 'bai')?.versionId === 'a2');
check('entries are newest first', chosen.map((c) => c.versionId).join() === 'a2,b1,a3');
const marked = R.chooseEntries(cs, new Map([[R.markKey(500, 'bai'), 'a1']]), ok);
check('a marked version counts instead of the latest', marked.find((c) => c.person === 500 && c.character === 'bai')?.versionId === 'a1');
const badMark = R.chooseEntries(cs, new Map([[R.markKey(500, 'bai'), 'b1']]), ok);
check("a mark of someone else's version is ignored (the latest counts)", badMark.find((c) => c.person === 500 && c.character === 'bai')?.versionId === 'a2');
check('versions made before the window are not entries', !chosen.some((c) => c.versionId === 'o1'));
check('a new sheet that is not a fork is not an entry', !chosen.some((c) => c.versionId === 'n1'));
check('an ineligible person has no entry', !chosen.some((c) => c.person === 502));
check('a wallet and its linked FID are one person', R.chooseEntries([cand('w1', 600, 'zei', 1), cand('w2', 600, 'zei', 2)], new Map(), () => true).length === 1);
proof('two entries for one person and character are caught', (() => {
  const planted = [...chosen, { ...chosen[0], versionId: 'dup' }];
  return new Set(planted.map((c) => R.markKey(c.person, c.character))).size !== planted.length;
})());

// --- The post address: the host allow-list ----------------------------------------------------------------------
const good: [string, string][] = [
  ['https://farcaster.xyz/naaate/0x0a1b2c3d', 'farcaster'],
  ['https://warpcast.com/naaate/0x0a1b2c3d', 'farcaster'],
  ['https://bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h', 'bluesky'],
  ['https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3mz6hon3w6c2h', 'bluesky'],
  ['https://hey.xyz/posts/1q4tkta5f47sz8032wm', 'lens'],
  ['  https://hey.xyz/posts/1q4tkta5f47sz8032wm/  ', 'lens'],
  ['https://BSKY.APP/profile/someone.bsky.social/post/3mz6hon3w6c2h', 'bluesky'],
];
for (const [u, n] of good) {
  const r = L.readPostAddress(u);
  check(`accepted: ${u.trim()}`, r.ok && r.ref.network === n, JSON.stringify(r));
}
const bad = [
  'http://farcaster.xyz/naaate/0x0a1b2c3d',
  'https://farcaster.xyz.evil.com/naaate/0x0a1b2c3d',
  'https://evilfarcaster.xyz/naaate/0x0a1b2c3d',
  'https://www.bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h',
  'https://bsky.app.evil.com/profile/someone.bsky.social/post/3mz6hon3w6c2h',
  'https://staging.bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h',
  'https://hey.xyz.co/posts/1q4tkta5f47sz8032wm',
  'https://heẏ.xyz/posts/1q4tkta5f47sz8032wm',
  'https://xn--hey-xyz.com/posts/abc',
  'https://1.2.3.4/posts/1q4tkta5f47sz8032wm',
  'https://127.0.0.1/naaate/0x0a1b2c3d',
  'https://[::1]/posts/abc',
  'https://2130706433/posts/abc',
  'https://0x7f000001/posts/abc',
  'https://localhost/posts/abc',
  'javascript:alert(1)//hey.xyz/posts/abc',
  'ftp://hey.xyz/posts/abc',
  'data:text/html,hey.xyz/posts/abc',
  'file:///etc/passwd',
  'https://hey.xyz@evil.com/posts/abc',
  'https://evil.com@hey.xyz/posts/abc',
  'https://user:pass@hey.xyz/posts/abc',
  'https://hey.xyz:8443/posts/abc',
  'https://evil.com\\@hey.xyz/posts/abc',
  'https://evil.com\\hey.xyz/posts/abc',
  'https://hey.xyz/posts/abc def',
  'https://hey.xyz/posts/../../admin',
  'https://hey.xyz/u/someone',
  'https://bsky.app/profile/someone.bsky.social',
  'https://farcaster.xyz/~/compose?text=x',
  'hey.xyz/posts/abc',
  '//hey.xyz/posts/abc',
  `https://hey.xyz/posts/${'a'.repeat(400)}`,
  '',
];
for (const u of bad) {
  const r = L.readPostAddress(u);
  check(`refused: ${JSON.stringify(u).slice(0, 80)}`, !r.ok, JSON.stringify(r));
}
check('refused: not a string', !L.readPostAddress(42).ok && !L.readPostAddress(null).ok);
check('a cast hash from composeCast is read only as a full hash', L.castFromHash(`0x${'a'.repeat(40)}`).ok && !L.castFromHash('0xabc').ok && !L.castFromHash('https://evil.com').ok);
{
  // Proof: a looser host rule (ends with the network's host) would let a look-alike through; the real rule doesn't.
  const loose = (u: string) => ['farcaster.xyz', 'bsky.app', 'hey.xyz'].some((h) => new URL(u).hostname.endsWith(h));
  proof('a suffix match lets "evilfarcaster.xyz" through, and the real allow-list refuses it', loose('https://evilfarcaster.xyz/a/0x0a1b2c3d') && !L.readPostAddress('https://evilfarcaster.xyz/a/0x0a1b2c3d').ok);
}

// --- The server never fetches the pasted address ----------------------------------------------------------------
process.env.NEYNAR_API_KEY = 'test-key-not-real';
const P = await import('../src/lib/challenge/posts');
const VERSION = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const page = `https://snowmoon.party/references/designs/${VERSION}`;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const DID = 'did:plc:abcdefghijklmnopqrstuvwx';
function standIn(link: string) {
  const asked: string[] = [];
  const f = async (url: string, init?: RequestInit) => {
    asked.push(url);
    const u = new URL(url);
    if (u.hostname === 'api.neynar.com') {
      if ((init?.headers as Record<string, string>)?.['x-api-key'] !== 'test-key-not-real') return json({}, 401);
      return json({ cast: { hash: `0x0a1b2c3d${'e'.repeat(32)}`, author: { username: 'naaate', pfp_url: 'https://imagedelivery.net/avatar.png', display_name: 'Nate' }, text: `my Bai ${link}`, timestamp: '2026-11-07T10:00:00Z', embeds: [{ url: link }], reactions: { likes_count: 9 } } });
    }
    if (u.pathname.endsWith('resolveHandle')) return json({ did: DID });
    if (u.pathname.endsWith('getPosts')) return json({ posts: [{ uri: `at://${DID}/app.bsky.feed.post/3mz6hon3w6c2h`, author: { handle: 'someone.bsky.social', avatar: 'https://cdn.bsky.app/avatar.jpg', labels: [] }, record: { text: `Zei! ${link}`, createdAt: '2026-11-08T10:00:00Z', facets: [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }] }] }, indexedAt: '2026-11-08T10:00:01Z', labels: [], likeCount: 3 }] });
    if (u.hostname === 'api.lens.xyz') return json({ data: { post: { __typename: 'Post', id: '2537194911', slug: '1q4tkta5f47sz8032wm', timestamp: '2026-11-09T10:00:00Z', author: { username: { localName: 'someone' } }, metadata: { __typename: 'TextOnlyMetadata', content: `Bai ${link}` } } } });
    return json({}, 404);
  };
  return { asked, f: f as (url: string, init?: RequestInit) => Promise<Response> };
}
const pasted = ['https://warpcast.com/naaate/0x0a1b2c3d', 'https://bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h', 'https://hey.xyz/posts/1q4tkta5f47sz8032wm'];
for (const addr of pasted) {
  const s = standIn(page);
  const r = L.readPostAddress(addr);
  const got = r.ok ? await P.verifiedPost(r.ref, VERSION, s.f) : null;
  check(`${addr}: read from its network's API and listed`, Boolean(got?.ok), JSON.stringify(got));
  check(`${addr}: every request went to an API host`, s.asked.length > 0 && s.asked.every((u) => (L.API_HOSTS as readonly string[]).includes(new URL(u).hostname)), s.asked.join(' '));
  check(`${addr}: the pasted address was never requested`, s.asked.every((u) => u !== addr && new URL(u).hostname !== new URL(addr).hostname), s.asked.join(' '));
  if (got?.ok) {
    check(`${addr}: the kept post has no avatar, name, picture, counts or words`, Object.keys(got.post).sort().join() === 'at,handle,id,links,network,url' && !/avatar|pfp|imagedelivery|likes/.test(JSON.stringify({ ...got.post, links: [] })));
    check(`${addr}: the address shown is rebuilt on the network's own host`, ['farcaster.xyz', 'bsky.app', 'hey.xyz'].includes(new URL(got.post.url).hostname));
  }
}
{
  const s = standIn(page);
  const got = await P.verifiedPost(L.castFromHash(`0x0a1b2c3d${'e'.repeat(32)}`).ok ? (L.castFromHash(`0x0a1b2c3d${'e'.repeat(32)}`) as { ok: true; ref: never }).ref : (null as never), VERSION, s.f);
  check("the Farcaster app's new cast (composeCast's hash) is read by hash from Neynar", got.ok && s.asked.length === 1 && s.asked[0].includes('type=hash'), s.asked.join(' '));
}
{
  // Proof: an API address pointed at the network's own site (as if fetching the pasted page) is refused before any request.
  const keep = L.POST_APIS.lensGraphql;
  L.POST_APIS.lensGraphql = 'https://hey.xyz/posts/1q4tkta5f47sz8032wm';
  const s = standIn(page);
  const r = await P.fetchPost({ network: 'lens', slug: '1q4tkta5f47sz8032wm' }, s.f);
  L.POST_APIS.lensGraphql = keep;
  proof('a request to the pasted host (hey.xyz) is refused and never sent', !r.ok && s.asked.length === 0);
}
{
  const s = standIn(page);
  const keep = process.env.NEYNAR_API_KEY;
  delete process.env.NEYNAR_API_KEY;
  const r = await P.fetchPost({ network: 'farcaster', username: 'naaate', hash: '0x0a1b2c3d' }, s.f);
  process.env.NEYNAR_API_KEY = keep;
  check('without a Neynar key, Farcaster posts are not read (and nothing is asked)', !r.ok && s.asked.length === 0);
}

// --- A post that doesn't link to the page is refused -------------------------------------------------------------
for (const [label, link] of [
  ['another version', `https://snowmoon.party/references/designs/${OTHER}`],
  ['the site home', 'https://snowmoon.party/'],
  ['a look-alike host with the same path', `https://snowmoon.party.evil.com/references/designs/${VERSION}`],
  ['an evil host with our host as user name', `https://snowmoon.party@evil.com/references/designs/${VERSION}`],
  ['a longer path', `https://snowmoon.party/references/designs/${VERSION}/x`],
] as const) {
  const s = standIn(link);
  const r = await P.verifiedPost({ network: 'lens', slug: '1q4tkta5f47sz8032wm' }, VERSION, s.f);
  check(`refused: a post linking to ${label}`, !r.ok && r.why === P.POSTS_WORDING.noLink, JSON.stringify(r));
}
check('a link with www., a trailing slash or in capitals counts', L.linksToVersion({ links: [`www.snowmoon.party/references/designs/${VERSION.toUpperCase()}/`] }, VERSION));
proof('a matcher that only checks the path would take the look-alike host', `https://snowmoon.party.evil.com/references/designs/${VERSION}`.includes(`/references/designs/${VERSION}`) && !L.linksToVersion({ links: [`https://snowmoon.party.evil.com/references/designs/${VERSION}`] }, VERSION));
{
  const labelled = { posts: [{ uri: `at://${DID}/app.bsky.feed.post/3mz6hon3w6c2h`, author: { handle: 'someone.bsky.social', labels: [{ val: '!no-unauthenticated' }] }, record: { text: page, createdAt: '2026-11-08T10:00:00Z' }, indexedAt: '2026-11-08T10:00:01Z', labels: [] }] };
  check('a Bluesky post whose author asked not to be shown off Bluesky is refused', L.parseBskyPosts(labelled, '3mz6hon3w6c2h') === 'labelled');
}

// --- "Posted on": text and a link only -------------------------------------------------------------------------
const MEDIA = /<(img|picture|video|audio|iframe|embed|object|source|svg|image|script|link|style)\b|background(-image)?\s*:|url\(|srcset=/i;
const items = [
  { id: '2', network: 'bluesky' as const, handle: 'someone.bsky.social', at: '2026-11-08T10:00:00.000Z', url: `https://bsky.app/profile/${DID}/post/3mz6hon3w6c2h` },
  { id: '1', network: 'farcaster' as const, handle: 'naaate', at: '2026-11-07T10:00:00.000Z', url: 'https://farcaster.xyz/naaate/0x0a1b2c3d' },
];
// Rendered in a separate process (scripts/lib/render-challenge.ts: react-dom/server isn't available under react-server).
const rendered = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'scripts/lib/render-challenge.ts')], { input: JSON.stringify({ versionId: VERSION, posts: items }), encoding: 'utf8', cwd: ROOT })) as { postedOn: string; share: string };
const html = rendered.postedOn;
check('"Posted on" renders', /Posted on/.test(html) && /Bluesky · @someone\.bsky\.social · 2026-11-08/.test(html) && /href="https:\/\/farcaster\.xyz\/naaate\/0x0a1b2c3d"/.test(html), html.slice(0, 300));
check('"Posted on" has no image, avatar, embed, script or style', !MEDIA.test(html), (html.match(MEDIA) ?? [''])[0]);
check('"Posted on" keeps the server\'s order (newest first)', html.indexOf('someone.bsky.social') < html.indexOf('naaate'));
check('"Posted on" links only to the networks\' own hosts', [...html.matchAll(/href="([^"]+)"/g)].every((m) => ['farcaster.xyz', 'bsky.app', 'hey.xyz'].includes(new URL(m[1]).hostname)));
proof('an avatar planted in "Posted on" is caught', MEDIA.test(html.replace('</li>', '<img src="https://cdn.bsky.app/avatar.jpg" alt=""></li>')));
const share = rendered.share;
check('the share buttons are plain links, no outside script or picture', !MEDIA.test(share) && /bsky\.app\/intent\/compose/.test(share) && /hey\.xyz\/\?text=/.test(share) && /farcaster\.xyz\/~\/compose/.test(share), share.slice(0, 300));
check('the share links carry the page link', share.includes(encodeURIComponent(`/references/designs/${VERSION}`)) || share.includes(`%2Freferences%2Fdesigns%2F${VERSION}`));
check('the guidance line is shown', share.includes('If you’re remixing someone’s post, quote or reply to it on the same network. Always include your version’s link.'));

// --- The rules copy (owner's decisions, 2026-10-31) -------------------------------------------------------------
const W = (await import('../src/lib/challenge/wording')).CHALLENGE_WORDING;
const copy = [W.intro(), W.next(), W.bounty(), ...W.rules(), W.adminsLine].join(' ');
const MINT_PLAN = 'We plan to mint each final version as an open edition, with what it raises split among everyone it was built on, including the We Are Lum team. Details come with the mint page.';
const PROMISES = /\b(will be minted|is then minted|minted as|reward pot|extra reward|split on|token for you|you will (get|receive)|guaranteed?|\$\s?\d|\d+\s?(ETH|USDC|dollars))\b|\bwallet\b/i;
function copyProblems(t: string): string[] {
  const p: string[] = [];
  if (!t.includes(MINT_PLAN)) p.push('the mint is not said as the owner\'s plan sentence');
  const m = t.match(PROMISES);
  if (m) p.push(`promises or a wallet path: "${m[0]}"`);
  if (!/A new sheet made from scratch isn’t an entry/.test(t)) p.push('it does not say only remixes (forks) count');
  if (!new RegExp(`at least ${['zero', 'one', 'two', 'three', 'four', 'five'][CHALLENGE.minEntrants] ?? CHALLENGE.minEntrants} different people`).test(t)) p.push('the minimum number of entrants is missing or not the config\'s');
  if (!/one poidh bounty for each character, six in all, on Ethereum mainnet/i.test(t)) p.push('the bounties are not one per character, on Ethereum mainnet');
  if (!/must be an entry for that character/.test(t)) p.push('claims are not limited to entries for that character');
  if (!/a little ETH on mainnet for gas/.test(t)) p.push('the gas note is missing');
  if (!/can pay out even if its character has fewer than/.test(t) || !/if no claim fits, Nate cancels it/.test(t)) p.push('the minimum or the cancel rule for bounties is missing');
  return p;
}
check('the rules copy: the owner\'s mint sentence, forks only, three entrants, a bounty per character on mainnet, no promises, no wallet path', copyProblems(copy).length === 0, copyProblems(copy).join('; '));
check('the rules name the six characters in the owner\'s order', W.intro().includes('Zei, Bai, Gladias, Seila, Deluin or Mu'));
proof('a promised mint is caught', copyProblems(copy.replace(MINT_PLAN, 'Each version is then minted as an open edition in Snowmoon WIP.')).length > 0);
proof('a reward pot is caught', copyProblems(`${copy} Plus an extra reward pot.`).length > 0);
proof('a wallet path back in the rules is caught', copyProblems(`${copy} Or a wallet linked to one.`).length > 0);
proof('one bounty for the whole challenge (the old rule) is caught', copyProblems(copy.replace(/one poidh bounty for each character, six in all, on Ethereum mainnet/i, 'one poidh bounty for the whole challenge')).length > 0);
proof('a bounty on Base instead of mainnet is caught', copyProblems(copy.replace('on Ethereum mainnet', 'on Base')).length > 0);
check('the judging line names the character', W.bountyFor('Zei') === 'The bounty for Zei: the remix that most changes how we see Zei while staying true to the book.');
check('bounty addresses and the amount are unset until the owner sets them', CHALLENGE.characters.every((c) => c in CHALLENGE.bounties && CHALLENGE.bounties[c] === null) && CHALLENGE.bountyAmount === null);
check('no amount is shown while it is unset', !/ ETH each/.test(W.bounty()));
proof('rules without "forks only" are caught', copyProblems(copy.replace('A new sheet made from scratch isn’t an entry.', '')).length > 0);

// --- Sheets open to everyone only inside the window, and only once Privacy says so -------------------------------
{
  const O = await import('../src/lib/challenge/open-sheets');
  const { PRIVACY } = await import('../src/lib/legal');
  const said = structuredClone(PRIVACY);
  (said.sections.find((x) => x.n === 4)!.body[1] as string[]).push('If you take part in the remix challenge: …');
  check('openSheets is on in the config (owner, 2026-10-31)', CHALLENGE.openSheets === true);
  check('sheets are not open before the window, even with the Privacy words', !O.challengeSheetsOpen(at(D0.opens, -1), said));
  check('sheets open at the opening instant, once Privacy describes the challenge', O.challengeSheetsOpen(at(D0.opens, 0), said));
  check('sheets are open at 23:59:59.999 Pacific on the last day', O.challengeSheetsOpen(at(D0.closes, -1), said));
  check('sheets close again at the close', !O.challengeSheetsOpen(at(D0.closes, 0), said));
  check('as the Privacy page reads today (no challenge words), sheets stay invited-only even in the window', !O.challengeSheetsOpen(at(D0.opens, 0)));
  proof('an opening that ignores the window is caught', ((t: Date) => CHALLENGE.openSheets && O.privacyDescribesChallenge(said))(at(D0.closes, 0)) !== O.challengeSheetsOpen(at(D0.closes, 0), said));
}

// --- The database: the migration, its read-back, marks, posts, and life without the tables ------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
await db.exec(read('supabase/migrations/NEXT_remix_challenge.sql'));
check('the migration is safe to run twice', true);
const dry = read('supabase/drafts/NEXT_remix_challenge.DRY-RUN.sql');
const mig = read('supabase/migrations/NEXT_remix_challenge.sql');
check('the dry run is the migration ending in rollback', dry.slice(dry.indexOf('begin;')).replace(/-- The dry run keeps nothing\.\nrollback;\n$/, 'commit;\n') === mig.slice(mig.indexOf('begin;')));
// A published version for the read-back to use (it runs on the database directly, before the client connects).
await db.exec(`insert into studio.entities (id, work_id, kind, name) values ('00000000-0000-0000-0000-00000000e0e0','snowmoon','style','Read-back style');
  insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000000-0000-0000-0000-00000000b0b0','snowmoon','design',6786,'00000000-0000-0000-0000-00000000e0e0','published');
  insert into studio.element_versions (id, element_id, version_no) values ('00000000-0000-0000-0000-00000000f0f0','00000000-0000-0000-0000-00000000b0b0',1);`);
// The read-back, part (a): one SELECT, every row true; part (b): the DO block raises nothing.
const rb = read('supabase/drafts/READ-BACK-remix_challenge.sql');
const partA = rb.slice(rb.indexOf('select c.what'), rb.indexOf(') c;') + 4);
const partB = rb.slice(rb.indexOf('do $$'), rb.lastIndexOf('end $$;') + 7);
const rowsA = await db.query<{ what: string; ok: boolean }>(partA);
check('read-back (a): every row is true', rowsA.rows.length === 17 && rowsA.rows.every((r) => r.ok === true), JSON.stringify(rowsA.rows.filter((r) => !r.ok)));
let bErr = '';
try {
  await db.exec(partB);
} catch (e) {
  bErr = (e as Error).message;
}
check('read-back (b): the DO block passes', bErr === '', bErr);
check('read-back (b): leaves no rows behind', (await db.query<{ n: number }>('select (select count(*) from studio.challenge_marks) + (select count(*) from studio.version_posts) as n')).rows[0].n == 0);
{
  // Proof: on a table that refuses a realistic row, part (b) fails.
  await db.exec(`alter table studio.version_posts add constraint planted check (handle <> 'naaate')`);
  let err = '';
  try {
    await db.exec(partB);
  } catch (e) {
    err = (e as Error).message;
  }
  await db.exec(`alter table studio.version_posts drop constraint planted`);
  proof('read-back (b) fails when a realistic row is refused', /READ-BACK FAILED|violates/.test(err));
  await db.exec(`grant update on studio.challenge_marks to studio_writer`);
  const r2 = await db.query<{ ok: boolean }>(partA);
  await db.exec(`revoke update on studio.challenge_marks from studio_writer`);
  proof('read-back (a) shows false when studio_writer may update marks', r2.rows.some((r) => r.ok === false));
  await db.exec(`alter table studio.challenge_eligibility add column score numeric`);
  const r3 = await db.query<{ what: string; ok: boolean }>(partA);
  await db.exec(`alter table studio.challenge_eligibility drop column score`);
  proof('read-back (a) shows false when a score column is kept', r3.rows.some((r) => r.ok === false && /no score/.test(r.what)));
}

const PORT = 54377;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const connect = () => postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
let sql = connect();
/**
 * After a statement that fails on purpose, a new connection: PGlite's socket server (one connection at a time) can
 * hand the next statement's answer to the wrong query after an error, a stand-in quirk seen 2026-10-31. Production
 * Postgres answers each statement with its own result.
 */
async function reconnect() {
  await sql.end();
  sql = connect();
  S = sql as unknown as Sql;
}
const DS = await import('../src/lib/images/designs');
type Sql = Parameters<typeof DS.listDesigns>[0];
let S = sql as unknown as Sql;
const pic = (n: number) => ({ url: `https://pictures.example/${n}.jpg`, sha256: String(n).repeat(64).slice(0, 64), recipe: { prompt: 'p', model: 'z-image-turbo', endpoint: 'e', host: 'fal.ai', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.003, made_at: new Date().toISOString(), width: 576, height: 768, checks: { prompt: { model: 'g', verdict: 'ok' as const }, host_safety_checker: 'passed' as const }, assist: null } });
const sheet = (text: string, n: number) => ({ title: '', text, samples: [], views: { front: pic(n) }, by_name: 'x', by_name_source: 'relay' as const, assist: null, role: null, style: null });
const bai = DS.bookCharacter('bai')!;
const zeiC = DS.bookCharacter('zei')!;
// Before the window: the starting sheets.
const baiStart = await DS.makeDesign(S, { fid: 6786, mode: 'create', kind: 'character', character: bai, body: sheet('Eighteen, sharp eyes', 1) });
const zeiStart = await DS.makeDesign(S, { fid: 6852, mode: 'create', kind: 'character', character: zeiC, body: sheet('Eighteen, slight', 2) });
// The challenge, in a window around now (the config is the one place dates live; the test moves it here).
const E = await import('../src/lib/challenge/entries');
const realDates = { ...CHALLENGE.dates };
await new Promise((r) => setTimeout(r, 20));
CHALLENGE.dates.opens = new Date().toISOString();
CHALLENGE.dates.closes = new Date(Date.now() + 3_600_000).toISOString();
CHALLENGE.entries = true;
await sql`insert into studio.image_scores (fid, score) values (500, 0.81), (501, 0.42)`;
const Rec = await import('../src/lib/challenge/record');
// Every outside call is recorded (and answered "unavailable"): publishing may ask Neynar once; viewing never may.
const realFetch = globalThis.fetch;
const calls: string[] = [];
globalThis.fetch = (async (u: string | URL | Request) => {
  calls.push(String(u instanceof Request ? u.url : u));
  return new Response('{}', { status: 503 });
}) as typeof fetch;
process.env.NEYNAR_API_KEY = 'test-key-not-real';
/** Publish as the route does: the version, then its eligibility, decided once and stored. */
const { PRIVACY: P0 } = await import('../src/lib/legal');
const privacySaid = structuredClone(P0);
(privacySaid.sections.find((x) => x.n === 4)!.body[1] as string[]).push('If you take part in the remix challenge: …');
async function publish(m: Parameters<typeof DS.makeDesign>[1]) {
  const out = await DS.makeDesign(S, m);
  await Rec.recordEligibility(S, out.versionId, m.fid, new Date(), privacySaid);
  return out;
}
const f500a = await publish({ fid: 500, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet('Bai, older', 3) });
const f500b = await publish({ fid: 500, mode: 'version', kind: 'character', fromVersionId: f500a.versionId, body: sheet('Bai, older, scar', 4) });
const f501 = await publish({ fid: 501, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet('Bai, low score', 5) });
const fAdmin = await publish({ fid: 193912, mode: 'fork', kind: 'character', fromVersionId: zeiStart.versionId, body: sheet('Zei, by an admin', 6) });
const f6852 = await publish({ fid: 6852, mode: 'fork', kind: 'character', fromVersionId: zeiStart.versionId, body: sheet('Zei, invited', 7) });
const fOfEntry = await publish({ fid: 6852, mode: 'fork', kind: 'character', fromVersionId: f500a.versionId, body: sheet('Bai, from an entry', 8) });
const f502 = await publish({ fid: 502, mode: 'fork', kind: 'character', fromVersionId: zeiStart.versionId, body: sheet('Zei, Neynar down', 9) });
const fScratch = await publish({ fid: 503, mode: 'create', kind: 'character', character: zeiC, body: sheet('Zei from scratch', 10) });
check('publishing asked Neynar only for the one maker it had no score for (502), once', calls.length === 1 && calls[0].includes('api.neynar.com') && calls[0].includes('502'), calls.join(' '));
const stored = await sql<{ version_id: string; decision: string; eligible: boolean }[]>`select version_id, decision, eligible from studio.challenge_eligibility`;
const cols = await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_eligibility'`;
check('the stored decision keeps no score (owner, 2026-11-01)', !cols.some((c) => /score/.test(c.column_name)), cols.map((c) => c.column_name).join());
const dec = (v: string) => stored.find((r) => r.version_id === v);
check('stored at publish: passed (0.81 ≥ 0.7), eligible, the score not kept', dec(f500a.versionId)?.decision === 'passed' && dec(f500a.versionId)?.eligible === true);
check('stored at publish: below (0.42), not eligible', dec(f501.versionId)?.decision === 'below' && dec(f501.versionId)?.eligible === false);
check('stored at publish: an admin', dec(fAdmin.versionId)?.decision === 'admin' && dec(fAdmin.versionId)?.eligible === false);
check('stored at publish: invited, no score asked', dec(f6852.versionId)?.decision === 'invited');
check('stored at publish: Neynar down means unchecked (not eligible)', dec(f502.versionId)?.decision === 'unchecked' && dec(f502.versionId)?.eligible === false);
check('a sheet made from scratch gets no decision (not an entry)', !dec(fScratch.versionId));
{
  const extra = await DS.makeDesign(S, { fid: 504, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet('Bai, before the reread', 11) });
  const r = await Rec.recordEligibility(S, extra.versionId, 504);
  const [row] = await sql`select 1 from studio.challenge_eligibility where version_id = ${extra.versionId}`;
  check('nothing is stored about a maker while the Privacy page does not describe the challenge (as today)', r === 'not-stored' && !row);
  proof('a recorder that ignores the Privacy words would store it', (await Rec.recordEligibility(S, extra.versionId, 504, new Date(), privacySaid)) === 'stored');
}
calls.length = 0;
const st = await E.standing(S);
const ids = st.entries.map((e) => e.versionId);
check('entries: the latest of a person with a passing score', ids.includes(f500b.versionId) && !ids.includes(f500a.versionId));
check('entries: a fork of another entry counts', ids.includes(fOfEntry.versionId));
check('entries: an invited person', ids.includes(f6852.versionId));
check('entries: not a score below the threshold', !ids.includes(f501.versionId));
check('entries: not a version whose maker could not be checked', !ids.includes(f502.versionId));
check('entries: not a new sheet made from scratch (forks only)', !ids.includes(fScratch.versionId));
check('entries: not an admin; the admin is listed apart', !ids.includes(fAdmin.versionId) && st.byAdmins.some((v) => v.versionId === fAdmin.versionId));
check('entries: not the starting sheets made before the window', !ids.includes(baiStart.versionId) && !ids.includes(zeiStart.versionId));
check('entries: one per person per character', ids.length === 3, ids.join());
check('entrants per character: Bai 2 (500, 6852), Zei 1 (6852), others 0, in CHALLENGE order', [...st.entrants].map(([c, n]) => `${c}:${n}`).join() === 'zei:1,bai:2,gladias:0,seila:0,deluin:0,mu:0', [...st.entrants].map(([c, n]) => `${c}:${n}`).join());
check('three entrants are needed (CHALLENGE.minEntrants)', CHALLENGE.minEntrants === 3 && !R.enoughEntrants(2) && R.enoughEntrants(3));
proof('a count that adds one person twice is caught', R.entrantCounts([{ person: 1, character: 'bai' }, { person: 1, character: 'bai' }]).get('bai') === 1);
check('the version page: Entry on the entry, the admin line on the admin\'s', (await E.versionStanding(S, f500b.versionId))?.kind === 'entry' && (await E.versionStanding(S, fAdmin.versionId))?.kind === 'admin' && (await E.versionStanding(S, f501.versionId)) === null);
await E.startingSheets(S, 'bai');
check('viewing pages (the challenge, version pages, starting sheets) made no outside call at all', calls.length === 0, calls.join(' '));
{
  const Ny = await import('../src/lib/images/neynar');
  await Ny.lookUp(S, 777);
  proof('a Neynar lookup during a page view would be caught', calls.some((u) => u.includes('api.neynar.com')));
  calls.length = 0;
  const pageCode = ['src/lib/challenge/entries.ts', 'src/app/challenge/page.tsx', 'src/app/references/designs/[id]/page.tsx'].map((f) => ({ f, t: read(f) }));
  const asks = (t: string) => /from '[^']*(images\/neynar|challenge\/record)'|\blookUp\(|recordEligibility\(/.test(t);
  check('no page-side code imports the Neynar lookup or the publish-time recorder', pageCode.every((x) => !asks(x.t)), pageCode.filter((x) => asks(x.t)).map((x) => x.f).join());
  proof('a page that imports the lookup is caught', asks("import { lookUp } from '../images/neynar';"));
}
check('marking: only your own version', !(await E.markEntry(S, 501, f500a.versionId)).ok);
check('marking: your earlier version', (await E.markEntry(S, 500, f500a.versionId)).ok);
const st2 = await E.standing(S);
check('a marked version counts instead of the latest', st2.entries.some((e) => e.versionId === f500a.versionId) && !st2.entries.some((e) => e.versionId === f500b.versionId));
check('marking after the window closes is refused', !(await E.markEntry(S, 500, f500b.versionId, new Date(Date.parse(CHALLENGE.dates.closes)))).ok);
check('the sheets to start from are those made before the window', (await E.startingSheets(S, 'bai')).map((s) => s.versionId).join() === baiStart.versionId);

globalThis.fetch = realFetch;

// "Posted on" in the database.
CHALLENGE.posts = true;
const post = (id: string, at: string, network: 'farcaster' | 'lens' = 'lens') => ({ network, id, handle: 'someone', at, url: network === 'lens' ? `https://hey.xyz/posts/${id}` : `https://farcaster.xyz/someone/0x0a1b2c3d`, links: [] });
check('a post is kept', (await P.addPost(S, { versionId: f500b.versionId, person: 500, post: post('aaa', '2026-11-07T10:00:00Z') })).ok);
const again = await P.addPost(S, { versionId: f500b.versionId, person: 501, post: post('aaa', '2026-11-07T10:00:00Z') });
check('the same post is kept once per version', again.ok && !again.added);
await P.addPost(S, { versionId: f500b.versionId, person: -3, post: post('bbb', '2026-11-09T10:00:00Z') });
const listed = await P.postsFor(S, f500b.versionId);
check('posts are listed newest first', listed.map((p) => p.url.split('/').pop()).join() === 'bbb,aaa');
check('only the person who added it can remove it', !(await P.removeOwnPost(S, listed[0].id, 500)) && (await P.removeOwnPost(S, listed[0].id, -3)));
let wrongHost = '';
try {
  await sql`insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid) values (${f500b.versionId}, 'lens', 'x', 'someone', now(), 'https://evil.example/posts/x', 5)`;
} catch (e) {
  wrongHost = (e as { code?: string }).code ?? 'error';
}
await reconnect();
check('the table refuses an address on another host', wrongHost === '23514', wrongHost);
const keepLimit = CHALLENGE.postsPerPersonPerDay;
CHALLENGE.postsPerPersonPerDay = 1;
check('a daily limit per person', !(await P.addPost(S, { versionId: f500b.versionId, person: 500, post: post('ccc', '2026-11-10T10:00:00Z') })).ok);
CHALLENGE.postsPerPersonPerDay = keepLimit;

// Without the tables (before the owner applies the migration): nothing breaks.
await sql`drop table studio.challenge_marks`;
await sql`drop table studio.version_posts`;
await reconnect();
const st3 = await E.standing(S);
await reconnect();
check('without the marks table, everyone\'s latest version counts', st3.entries.some((e) => e.versionId === f500b.versionId) && st3.entries.length === 3);
await sql`drop table studio.challenge_eligibility`;
await reconnect();
const st4 = await E.standing(S);
await reconnect();
check('without the eligibility table, only invited makers count (no score is ever looked up on a page)', st4.entries.length === 2 && st4.entries.every((e) => e.person === 6852), st4.entries.map((e) => e.person).join());
const nm = await E.markEntry(S, 500, f500a.versionId);
await reconnect();
check('without the marks table, marking says "not available yet"', !nm.ok && nm.why === E.MARK_WORDING.notYet);
check('without the posts table, nothing is listed', (await P.postsFor(S, f500b.versionId)).length === 0);
await reconnect();
// A stand-in database without the table (PGlite's socket server can stall a connection after a run of failed
// statements, a stand-in quirk; production Postgres answers each with its error, as this stand-in does).
const missingTable = (() => Promise.reject(Object.assign(new Error('relation "studio.version_posts" does not exist'), { code: '42P01' }))) as unknown as Sql;
const np = await P.addPost(missingTable, { versionId: f500b.versionId, person: 500, post: post('ddd', '2026-11-10T10:00:00Z') });
check('without the posts table, adding says "not available yet"', !np.ok && np.why === P.POSTS_WORDING.notYet);

// Switched off (as shipped): nothing is shown or asked.
CHALLENGE.entries = false;
check('entries off: nothing listed, no badge', (await E.standing(S)).entries.length === 0 && (await E.versionStanding(S, f500b.versionId)) === null);
Object.assign(CHALLENGE.dates, realDates);
await sql.end();
await server.stop();

// As committed, the switches are off until the owner's reread.
const cfg = read('src/lib/config.ts');
check('as committed, CHALLENGE.entries and posts are off until the reread; openSheets is on (it waits for the window and the Privacy words by itself)', /\n  entries: false as boolean,\n  posts: false as boolean,/.test(cfg) && /\n  openSheets: true as boolean,/.test(cfg));

console.log(`test:challenge: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
process.exit(0);
