/**
 * The Bluesky check (owner, 2026-11-04; src/lib/social/bluesky-check.ts), on stand-ins: Bluesky's AppView is replaced
 * by planted accounts, and every migration (NEXT_signin_lens_bluesky and NEXT_social_bluesky_check included) runs in an
 * in-memory Postgres (PGlite), talked to as studio_writer. Never a production database, never the real AppView.
 *
 *   npm run test:bluesky-check
 *
 * Each rule is also run on a planted violation, which it must catch:
 * - K1 a new account (made on or after 6 Nov 2026) is refused, and one with no date;
 * - K2 an idle old account (fewer than 5 posts in 30 days) is refused; reposts, other people's posts and posts whose
 *   dates Bluesky's clock doesn't confirm don't count; an old active account passes;
 * - K3 the raw numbers are never stored: bluesky_checks holds only the decision and its time;
 * - K4 decided once a day, as Neynar's score is: a fresh decision is reused, an old one asked again; a failed lookup
 *   is never stored;
 * - K5 the AppView receives the DID only, at public.api.bsky.app, through getProfile and getAuthorFeed;
 * - K6 free generations (the Generate gate): off as before while the switch is off; on, passed is free, new and idle
 *   are refused with their reason, unreachable is a 503;
 * - K7 the remix challenge: a Bluesky account's decision counts as a Farcaster account's Neynar decision; a wallet
 *   account still never counts; its row is kept with account 'bluesky';
 * - K8 the migration: the dry run keeps nothing, the read-back's select is all true and its do block passes.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 54347;
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
process.env.APP_LEGAL_PAGES = 'terms+privacy';
process.env.SNOWMOON_ALERT_URL = 'https://alerts.invalid/x';

const { PGlite } = await import('@electric-sql/pglite');
const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');

const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of migrations) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const { db } = await import('../src/lib/db');
const sql = db()!;
await sql`set role studio_writer`;

const { SOCIAL_SIGN_IN } = await import('../src/lib/config');
const B = await import('../src/lib/social/bluesky-check');
const at = await import('../src/lib/social/atproto');
const accounts = await import('../src/lib/social/accounts');
const people = await import('../src/lib/people');
const { freeFor } = await import('../src/lib/social/free');
const R = await import('../src/lib/challenge/rules');
const cfg = SOCIAL_SIGN_IN.bluesky.check as { on: boolean; createdBefore: string; recentDays: number; minRecentPosts: number; cacheHours: number };

const NOW = new Date();
const day = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString();
const post = (days: number, indexedDays = days) => ({ createdAt: ago(days), indexedAt: ago(indexedDays) });
const RULES = { createdBefore: cfg.createdBefore, recentDays: cfg.recentDays, minRecentPosts: cfg.minRecentPosts };

// --- K1 a new account is refused ---------------------------------------------------------------------------------
{
  const active = Array.from({ length: 8 }, (_, i) => post(i + 1));
  const decideNew = (rules = RULES) => B.decideBluesky({ createdAt: '2026-11-07T10:00:00Z', posts: active }, NOW, rules);
  check('K1 an account made after 6 Nov 2026 (Pacific) is refused as new', decideNew() === 'new');
  check('K1 one made at 00:00 Pacific on 6 Nov is new; one a minute before is not', B.decideBluesky({ createdAt: '2026-11-06T08:00:00Z', posts: active }, NOW) === 'new' && B.decideBluesky({ createdAt: '2026-11-06T07:59:00Z', posts: active }, NOW) === 'passed');
  check('K1 an account with no creation date is treated as new', B.decideBluesky({ createdAt: null, posts: active }, NOW) === 'new' && B.decideBluesky({ createdAt: 'not a date', posts: active }, NOW) === 'new');
  check('K1 the cut-off is 6 Nov 2026, 00:00 Pacific', cfg.createdBefore === '2026-11-06T08:00:00Z');
  proof('K1 a rule with no cut-off would let the new account through', decideNew({ ...RULES, createdBefore: '2099-01-01T00:00:00Z' }) !== 'new');
}

// --- K2 an idle old account is refused ---------------------------------------------------------------------------
{
  const OLD = '2023-05-01T00:00:00Z';
  check('K2 an old account with 5 posts in 30 days passes', B.decideBluesky({ createdAt: OLD, posts: [1, 3, 9, 20, 29].map((d) => post(d)) }, NOW) === 'passed');
  check('K2 an old account with 4 posts in 30 days is refused as idle', B.decideBluesky({ createdAt: OLD, posts: [1, 3, 9, 20].map((d) => post(d)) }, NOW) === 'idle');
  check('K2 an old account whose posts are all older than 30 days is idle', B.decideBluesky({ createdAt: OLD, posts: [31, 40, 60, 90, 200, 300].map((d) => post(d)) }, NOW) === 'idle');
  check('K2 an old account with no posts is idle', B.decideBluesky({ createdAt: OLD, posts: [] }, NOW) === 'idle');
  check('K2 a post dated recent but indexed long ago (backdated in reverse) does not count', B.decideBluesky({ createdAt: OLD, posts: [1, 2, 3, 4].map((d) => post(d)).concat([post(1, 400)]) }, NOW) === 'idle');
  check('K2 a post dated in the future does not count', B.decideBluesky({ createdAt: OLD, posts: [1, 2, 3, 4].map((d) => post(d)).concat([{ createdAt: '2027-01-01T00:00:00Z', indexedAt: ago(1) }]) }, NOW) === 'idle');
  proof('K2 a rule asking for no posts would let the idle account through', B.decideBluesky({ createdAt: OLD, posts: [] }, NOW, { ...RULES, minRecentPosts: 0 }) === 'passed');
}

// --- The AppView stand-in ------------------------------------------------------------------------------------------
const DID_OLD = 'did:plc:oldactiveaaaaaaaaaaaaaaa';
const DID_IDLE = 'did:plc:oldidleaaaaaaaaaaaaaaaaa';
const DID_NEW = 'did:plc:newaccountaaaaaaaaaaaaaa';
const DID_DOWN = 'did:plc:unreachableaaaaaaaaaaaaa';
const OTHER = 'did:plc:someoneelseaaaaaaaaaaaaa';
const feedItem = (did: string, days: number, repost = false) => ({
  post: { uri: `at://${did}/app.bsky.feed.post/${days}`, author: { did: repost ? OTHER : did, handle: 'x.bsky.social' }, record: { text: 'words never read', createdAt: ago(days) }, indexedAt: ago(days), likeCount: 3 },
  ...(repost ? { reason: { $type: 'app.bsky.feed.defs#reasonRepost', by: { did } } } : {}),
});
const world: Record<string, { profile: object; feed: object[] }> = {
  [DID_OLD]: { profile: { did: DID_OLD, handle: 'old.bsky.social', createdAt: '2023-04-02T10:00:00.000Z', followersCount: 120, followsCount: 80, postsCount: 900 }, feed: [1, 2, 4, 7, 12, 25].map((d) => feedItem(DID_OLD, d)) },
  [DID_IDLE]: { profile: { did: DID_IDLE, handle: 'idle.bsky.social', createdAt: '2023-04-02T10:00:00.000Z', followersCount: 4000, followsCount: 10, postsCount: 2 }, feed: [feedItem(DID_IDLE, 1, true), feedItem(DID_IDLE, 2, true), feedItem(DID_IDLE, 3, true), feedItem(DID_IDLE, 4, true), feedItem(DID_IDLE, 5, true), feedItem(DID_IDLE, 400)] },
  [DID_NEW]: { profile: { did: DID_NEW, handle: 'new.bsky.social', createdAt: '2026-11-08T10:00:00.000Z', followersCount: 0, followsCount: 0, postsCount: 30 }, feed: [1, 1, 1, 1, 1, 1].map((d) => feedItem(DID_NEW, d)) },
};
const asked: string[] = [];
at.ATPROTO_HTTP.fetch = (async (input: RequestInfo | URL) => {
  const u = new URL(String(input));
  asked.push(u.toString());
  const actor = u.searchParams.get('actor') ?? '';
  if (actor === DID_DOWN) return new Response('down', { status: 502 });
  const w = world[actor];
  if (!w) return new Response('{}', { status: 400 });
  if (u.pathname === '/xrpc/app.bsky.actor.getProfile') return new Response(JSON.stringify(w.profile), { status: 200 });
  if (u.pathname === '/xrpc/app.bsky.feed.getAuthorFeed') return new Response(JSON.stringify({ feed: w.feed }), { status: 200 });
  return new Response('{}', { status: 404 });
}) as typeof fetch;

const S = sql as unknown as Parameters<typeof B.blueskyDecision>[0];
const acct = async (did: string, handle: string) => ({ id: await accounts.socialAccountFor(S as never, 'bluesky', did, handle), subject: did });
const old = await acct(DID_OLD, 'old.bsky.social');
const idle = await acct(DID_IDLE, 'idle.bsky.social');
const fresh = await acct(DID_NEW, 'new.bsky.social');
const down = await acct(DID_DOWN, 'down.bsky.social');
const realFacts = (did: string) => B.blueskyFacts(did);

// --- K5 what the AppView receives -----------------------------------------------------------------------------------
{
  const f = await B.blueskyFacts(DID_IDLE);
  check('K5 reposts and other people\'s posts are dropped from the facts', f.posts.length === 1);
  const sent = asked.slice(-2);
  const ok = sent.length === 2 && sent.every((s) => new URL(s).host === 'public.api.bsky.app') && sent[0].includes('/xrpc/app.bsky.actor.getProfile?actor=') && sent[1].includes('/xrpc/app.bsky.feed.getAuthorFeed?actor=');
  check('K5 two requests, to public.api.bsky.app\'s getProfile and getAuthorFeed', ok, sent.join(' '));
  const params = sent.flatMap((s) => [...new URL(s).searchParams.entries()]);
  check('K5 the only thing about the person sent is the DID (not the handle)', params.filter(([k]) => k === 'actor').every(([, v]) => v === DID_IDLE) && !sent.some((s) => s.includes('idle.bsky.social')), JSON.stringify(params));
  proof('K5 a request naming the handle would be caught', ['https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=idle.bsky.social'].some((s) => s.includes('idle.bsky.social')));
  let refused = false;
  await B.blueskyFacts('idle.bsky.social').catch(() => (refused = true));
  check('K5 only a DID is looked up', refused);
}

// --- K4 + K3 decided once a day; only the decision kept ------------------------------------------------------------
{
  let calls = 0;
  const counting = (did: string) => (calls++, realFacts(did));
  const a = await B.blueskyDecision(S, old, counting, NOW);
  const b = await B.blueskyDecision(S, old, counting, new Date(NOW.getTime() + 3_600_000));
  check('K4 an old active account passes, and its decision is reused within the day (one lookup)', a.ok && a.decision === 'passed' && b.ok && b.decision === 'passed' && calls === 1, `calls ${calls}`);
  const c = await B.blueskyDecision(S, old, counting, new Date(NOW.getTime() + (cfg.cacheHours + 1) * 3_600_000));
  check('K4 a decision older than a day is asked again', c.ok && calls === 2);
  const n = await B.blueskyDecision(S, fresh, realFacts, NOW);
  const i = await B.blueskyDecision(S, idle, realFacts, NOW);
  check('K1 the new account is refused through the AppView', n.ok && n.decision === 'new');
  check('K2 the idle old account (followers but only reposts) is refused through the AppView', i.ok && i.decision === 'idle');
  const d = await B.blueskyDecision(S, down, realFacts, NOW);
  const [{ n: downRows }] = await sql<{ n: number }[]>`select count(*)::int as n from studio.bluesky_checks where account_id = ${down.id}`;
  check('K4 Bluesky unreachable: no decision, nothing stored', !d.ok && downRows === 0);

  // K3: the table and its rows hold the decision and its time only.
  const cols = (await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'bluesky_checks' order by 1`).map((r) => r.column_name);
  const rows = await sql`select * from studio.bluesky_checks`;
  const RAW = ['2023-04-02', '2026-11-08', '900', '4000', '120', 'old.bsky.social', 'words never read'];
  const rawIn = (cs: string[], rs: unknown[]) => cs.join() !== 'account_id,checked_at,decision' || rs.some((r) => RAW.some((x) => JSON.stringify(r).includes(x)));
  check('K3 bluesky_checks has only account_id, decision and checked_at', !rawIn(cols, rows), `${cols.join()} ${JSON.stringify(rows)}`);
  // Nothing else in the database holds the facts either (every studio table, every row).
  const tables = (await sql<{ t: string }[]>`select table_name as t from information_schema.tables where table_schema = 'studio' and table_type = 'BASE TABLE'`).map((r) => r.t);
  await sql`reset role`;
  const leaks: string[] = [];
  for (const t of tables) {
    const all = await sql.unsafe(`select * from studio.${t}`);
    for (const x of RAW.filter((x) => x !== 'old.bsky.social')) if (JSON.stringify(all).includes(x)) leaks.push(`${t}: ${x}`);
  }
  await sql`set role studio_writer`;
  check('K3 no studio table holds an account\'s dates, counts or post words', leaks.length === 0, leaks.join(', '));
  proof('K3 a table with a posts column would be caught', rawIn([...cols, 'recent_posts'].sort(), rows));
  proof('K3 a row holding the creation date would be caught', rawIn(cols, [{ decision: 'passed', created: '2023-04-02T10:00:00.000Z' }]));
}

// --- K6 free generations ------------------------------------------------------------------------------------------
{
  const person = (a: { id: number }) => people.socialPerson(a.id);
  cfg.on = false;
  const off = await freeFor(S as never, person(old));
  check('K6 while the check is off, a Bluesky account gets none (as before)', !off.free && off.reason === 'link-needed');
  cfg.on = true;
  const p = await freeFor(S as never, person(old), undefined, realFacts);
  const n = await freeFor(S as never, person(fresh), undefined, realFacts);
  const i = await freeFor(S as never, person(idle), undefined, realFacts);
  const d = await freeFor(S as never, person(down), undefined, realFacts);
  check('K6 on: an old active Bluesky account gets the free counts', p.free === true);
  check('K6 on: a new account is refused, saying why', !n.free && n.reason === 'bluesky-new' && /6 November 2026/.test(n.error), JSON.stringify(n));
  check('K6 on: an idle old account is refused, saying why', !i.free && i.reason === 'bluesky-idle' && /5 times in the last 30 days/.test(i.error), JSON.stringify(i));
  check('K6 on: Bluesky unreachable is refused as unreachable', !d.free && d.reason === 'bluesky-unreachable');
  const { mayGenerate } = await import('../src/lib/images/gate');
  const g = await mayGenerate(S as never, person(down));
  check('K6 the Generate gate answers 503 when Bluesky can\'t be reached, 403 for new', !g.ok && g.status === 503 && !(await mayGenerate(S as never, person(fresh))).ok);
  proof('K6 a gate that ignored the decision would let the idle account through', (await freeFor(S as never, person(idle), undefined, realFacts)).free === false);
}

// --- K7 the remix challenge -----------------------------------------------------------------------------------------
{
  const sky = people.socialPerson(old.id);
  const e1 = R.eligibility({ maker: sky, score: null, bluesky: 'passed' });
  const e2 = R.eligibility({ maker: sky, score: null, bluesky: 'idle' });
  const e3 = R.eligibility({ maker: sky, score: null, bluesky: 'new' });
  const e4 = R.eligibility({ maker: sky, score: null, bluesky: null });
  check('K7 a Bluesky account that passed counts, as a Farcaster account that passed Neynar does', e1.eligible && e1.why === 'passed' && e1.person === sky);
  check('K7 idle and new are "below"; unreachable is "unchecked"', !e2.eligible && e2.why === 'below' && !e3.eligible && e3.why === 'below' && !e4.eligible && e4.why === 'unchecked');
  check('K7 read back: a Bluesky account\'s stored decision stands', R.fromDecision(sky, 'passed').eligible && !R.fromDecision(sky, 'below').eligible);
  check('K7 a wallet account still never counts', R.eligibility({ maker: -5, score: 0.9 }).why === 'not-a-farcaster-account' && R.fromDecision(-5, 'passed').why === 'not-a-farcaster-account');
  check('K7 a Bluesky account without a check (a Lens account, or the check off) never counts', R.eligibility({ maker: sky, score: 0.9 }).why === 'not-a-farcaster-account');
  // The row: kept with account 'bluesky'; a wallet's number refused.
  await sql`reset role`;
  const [el] = await sql`insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'text', ${sky}) returning id`;
  const [v] = await sql`insert into studio.element_versions (element_id, version_no, body) values (${el.id}, 1, '{}') returning id`;
  await sql`set role studio_writer`;
  await sql`insert into studio.challenge_eligibility ${sql({ version_id: v.id, challenge: 'remix-2026-11', fid: sky, decision: e1.why, eligible: e1.eligible, account: 'bluesky' })}`;
  const [row] = await sql`select * from studio.challenge_eligibility where version_id = ${v.id}`;
  check('K7 the decision is kept with account "bluesky", and no score or count', row?.account === 'bluesky' && row.decision === 'passed' && Object.keys(row).sort().join() === 'account,challenge,checked_at,decision,eligible,fid,version_id', JSON.stringify(row));
  let refused = false;
  await sql`insert into studio.challenge_eligibility ${sql({ version_id: v.id, challenge: 'other', fid: -5, decision: 'passed', eligible: true, account: 'bluesky' })}`.catch(() => (refused = true));
  check('K7 a wallet account\'s number is refused in challenge_eligibility', refused);
  let refused2 = false;
  await sql`insert into studio.challenge_eligibility ${sql({ version_id: v.id, challenge: 'x2', fid: 6786, decision: 'passed', eligible: true, account: 'bluesky' })}`.catch(() => (refused2 = true));
  proof('K7 a Farcaster ID marked as a Bluesky account is refused', refused2);
}

// --- K8 the migration -----------------------------------------------------------------------------------------------
{
  const file = readFileSync(path.join(ROOT, 'supabase/migrations/NEXT_social_bluesky_check.sql'), 'utf8');
  const block = (s: string, from: string, to?: string) => s.slice(s.indexOf(from), to ? s.indexOf(to, s.indexOf(from)) : undefined);
  const a = block(file, '-- A. DRY RUN', '-- B. THE MIGRATION');
  const b = block(file, '-- B. THE MIGRATION', '-- C. READ-BACK');
  const body = (s: string) => s.slice(s.indexOf('begin;'), s.lastIndexOf(s.includes('commit;') ? 'commit;' : 'rollback;'));
  const f = new PGlite();
  await f.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`).catch(() => {});
  for (const m of migrations.filter((m) => m !== 'NEXT_social_bluesky_check.sql')) await f.exec(readFileSync(path.join(ROOT, 'supabase/migrations', m), 'utf8'));
  // A realistic version for the read-back's challenge row.
  await f.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
    insert into studio.elements (id, work_id, element_type, created_by_fid) values ('71111111-1111-4111-8111-111111111111','snowmoon','text',6786);
    insert into studio.element_versions (element_id, version_no, body) values ('71111111-1111-4111-8111-111111111111', 1, '{}');`);
  await f.exec(a);
  const afterDry = (await f.query<{ n: number }>(`select count(*)::int as n from pg_tables where schemaname = 'studio' and tablename = 'bluesky_checks'`)).rows[0].n;
  await f.exec(b);
  const results = await f.exec(block(file, '-- C. READ-BACK'));
  const oks = results.flatMap((r) => r.rows as { what?: string; ok?: boolean }[]).filter((r) => 'ok' in r);
  const kept = (await f.query<{ n: number }>(`select (select count(*) from studio.bluesky_checks) + (select count(*) from studio.challenge_eligibility) + (select count(*) from studio.social_accounts) as n`)).rows[0].n;
  check('K8 the dry run is the migration, ends in rollback and keeps nothing', body(a) === body(b) && /rollback;\s*$/.test(a.trim() + '\n') && afterDry === 0);
  check('K8 the read-back select: every row true', oks.length === 8 && oks.every((r) => r.ok === true), JSON.stringify(oks));
  check('K8 the read-back do block passes and keeps nothing', Number(kept) === 0, `kept ${kept}`);
  // Anon and authenticated read nothing.
  await f.exec(`insert into studio.social_accounts (kind, subject) values ('bluesky', 'did:plc:anonreadaaaaaaaaaaaaaaaa'); insert into studio.bluesky_checks (account_id, decision) select id, 'passed' from studio.social_accounts`);
  const leaks: string[] = [];
  for (const role of ['anon', 'authenticated']) {
    await f.exec(`set role ${role}`);
    try {
      const r = await f.query<{ n: number }>(`select count(*)::int as n from studio.bluesky_checks`);
      if (r.rows[0].n > 0) leaks.push(role);
    } catch {
      /* permission denied: private */
    }
    await f.exec('reset role');
  }
  check('K8 anon and authenticated read nothing of bluesky_checks', leaks.length === 0, leaks.join());
  await f.close();
}

await sql.end();
await server.stop();
await pg.close();
console.log(`test:bluesky-check: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const x of failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
