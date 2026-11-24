/**
 * Website sessions (owner, 2026-11-23; branch session-30d): the site's own 30-day session for every website sign-in,
 * and "Sign out on every device". No network, no production database: an in-memory Postgres (PGlite) with every
 * numbered migration, then 0051_session_ends.sql part by part; the real routes are called with real Request objects.
 * Fails (exit 1) on any problem; each rule is proven on a planted fault ("proof: …").
 *
 *   npm run test:sessions
 *
 * - 0051_session_ends.sql: who runs it; A is B word for word; A changes nothing; B applies twice; C passes and keeps
 *   nothing; D undoes it; studio_writer may select, insert, update (no delete); anon and authenticated nothing.
 * - Lengths: Farcaster on the website, wallet, Lens and Bluesky all last 30 days (SESSIONS.hours).
 * - The Farcaster session: accepted by getFid and by real routes (/api/auth/me, an admin route), as the bearer; an
 *   expired one, a forged one (changed body, another key, another kind's token, a bad signature) and one ended by
 *   "Sign out on every device" are refused; a session issued after the sign-out works.
 * - Wallet and Lens/Bluesky sessions: the same three refusals; a linked wallet's session ends with its FID's sign-out;
 *   the side headers (X-Wallet-Session, X-Social-Session) are checked the same way.
 * - Old tokens: a wallet or Lens/Bluesky token from before (no issue time) counts as issued 24 hours before it expires.
 * - Without the table nothing is ended and the button answers "not available yet".
 * - Fail closed (owner, 2026-11-23): any other read error throws, so no route answers 401 (the page keeps its session)
 *   and an ended session never gets through; the real routes, in a process whose database is unreachable.
 * - One way in: only src/lib/auth.ts verifies a Farcaster token (and the sign-in route, once, to issue the session);
 *   no route reads the Authorization header for a sign-in itself; no cookie.
 */
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { gatePglite } from './lib/pglite-gate';

process.env.FARCASTER_API_URL = 'http://127.0.0.1:9';
process.env.IMAGES_TICKET_SECRET = 'test-secret-'.padEnd(48, 'x');
const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- The migration file -------------------------------------------------------------------------------------------
const FILE = 'supabase/migrations/0051_session_ends.sql';
const text = read(FILE);
const at = (h: string) => text.indexOf(`\n-- ${h}`);
const between = (a: string, b: string | null) => text.slice(text.indexOf('\n', at(a) + 1) + 1, b ? at(b) : text.length);
const strip = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const uncomment = (s: string) => {
  const lines = s.split('\n');
  const i = lines.findIndex((l) => l === '-- begin;');
  const j = lines.map((l, k) => (/^-- (rollback|commit);$/.test(l) ? k : -1)).filter((k) => k > i).pop() ?? -1;
  return i < 0 || j < 0 ? '' : lines.slice(i, j + 1).map((l) => l.replace(/^-- ?/, '')).join('\n');
};
const dry = strip(between('A. DRY RUN', 'B. MIGRATION'));
const mig = strip(between('B. MIGRATION', 'C. READ-BACK'));
const readBack = uncomment(between('C. READ-BACK', 'D. UNDO'));
const undo = uncomment(between('D. UNDO', null));
check('the file says who runs it (postgres, in the Supabase SQL Editor); numbered 0051, applied by the owner', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text) && /APPLIED by the owner/.test(text) && path.basename(FILE) === '0051_session_ends.sql');
check('A ends in rollback, B in commit, C is a rolled-back read-back ending READ-BACK PASSED, D drops the table', dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && readBack.startsWith('begin;') && readBack.trim().endsWith('rollback;') && /READ-BACK PASSED/.test(readBack) && /drop table/.test(undo));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back inserts and deletes realistic rows, and sets no role', /insert into studio\.session_ends/.test(readBack) && /delete from studio\.session_ends/.test(readBack) && !/set role/i.test(readBack));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < path.basename(FILE)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const shape = async () => JSON.stringify((await pg.query(`select column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name = 'session_ends' order by 1`)).rows);
const before = await shape();
await pg.exec(dry);
check('the dry run leaves everything as it was', (await shape()) === before && before === '[]');
await pg.exec(mig);
let twice = true;
try {
  await pg.exec(mig);
} catch {
  twice = false;
}
check('the migration applies, and applies again', twice);
const runReadBack = async (sqlText: string) => {
  try {
    await pg.exec(sqlText);
    return { ok: true, why: '' };
  } catch (e) {
    await pg.exec('rollback;').catch(() => {});
    return { ok: false, why: String((e as Error).message) };
  }
};
const rb = await runReadBack(readBack);
check('the read-back passes and keeps nothing', rb.ok && Number((await pg.query<{ n: number }>(`select count(*)::int as n from studio.session_ends`)).rows[0].n) === 0, rb.why);
const priv = async (role: string, p: string) => (await pg.query<{ v: boolean }>(`select has_table_privilege('${role}', 'studio.session_ends', '${p}') as v`)).rows[0].v;
const rights = async (role: string) => (await Promise.all(['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map(async (p) => ((await priv(role, p)) ? p : '')))).filter(Boolean).join(',');
check('studio_writer: select, insert, update (no delete)', (await rights('studio_writer')) === 'select,insert,update');
check('anon and authenticated: nothing', (await rights('anon')) === '' && (await rights('authenticated')) === '');
for (const [name, plant] of [
  ['a delete grant', 'grant delete on studio.session_ends to studio_writer;'],
  ['a read grant to anon', 'grant select on studio.session_ends to anon;'],
  ['row level security off', 'alter table studio.session_ends disable row level security;'],
  ['the person check dropped', 'alter table studio.session_ends drop constraint session_ends_person_check;'],
] as const) {
  await pg.exec(`begin; ${plant}`);
  const r = await runReadBack(readBack.replace(/^begin;/, 'savepoint s;').replace(/rollback;\s*$/, 'rollback to savepoint s;'));
  await pg.exec('rollback;').catch(() => {});
  proof(`the read-back fails on ${name}`, !r.ok && /READ-BACK FAILED/.test(r.why));
}
await pg.exec(undo);
check('D removes the table', (await shape()) === '[]');
// B again, before the site connects. (With the table missing, this harness's one shared PGlite session stalls after the
// site's "no such table" error; a real database doesn't. The missing-table behaviour is tested on its own below.)
await pg.exec(mig);

// --- The site, on the test database -----------------------------------------------------------------------------
const server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await server.start();
const PORT = (server as unknown as { port: number }).port;
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
const gate = gatePglite(pg);
const { ADMINS, SESSIONS, IMAGES, SOCIAL_SIGN_IN } = await import('../src/lib/config');
const F = await import('../src/lib/farcaster-session');
const Wl = await import('../src/lib/wallet/session');
const So = await import('../src/lib/social/session');
const A = await import('../src/lib/auth');
const me = await import('../src/app/api/auth/me/route');
const activity = await import('../src/app/api/admin/activity/route');
const endAll = await import('../src/app/api/auth/sign-out-everywhere/route');
const req = (url: string, token: string | null, extra: Record<string, string> = {}, method = 'GET') => new Request(`http://localhost${url}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } });
const fidOf = async (token: string | null) => A.getFid(req('/x', token));
const meStatus = async (token: string | null) => (await me.GET(req('/api/auth/me', token))).status;
const adminStatus = async (token: string | null) => (await activity.GET(req('/api/admin/activity?days=7', token))).status;
const ADMIN = ADMINS[0];
const PERSON = 777001;

// Lengths.
check('every website sign-in lasts 30 days: Farcaster on the website, wallet, Lens, Bluesky', SESSIONS.hours === 720 && IMAGES.prepaid.sessionHours === 720 && SOCIAL_SIGN_IN.sessionHours === 720);
{
  const t = F.signFarcasterSession(PERSON)!;
  const body = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()) as { sub: number; exp: number; at: number };
  check('the Farcaster session lasts 30 days, and the page reads its FID and expiry as it read Farcaster’s token (sub, exp)', body.sub === PERSON && Math.abs(body.exp - (Date.now() / 1000 + 30 * 86400)) < 5 && Math.abs(body.at - Date.now()) < 5000);
  const w = Wl.readSession(Wl.signSession(5, '0x' + 'ab'.repeat(20)))!;
  check('a wallet session lasts 30 days', Math.abs(w.exp - (Date.now() / 1000 + 30 * 86400)) < 5);
  const s = So.readSocialSession(So.signSocialSession({ account: 7, kind: 'bluesky', subject: 'did:plc:' + 'a'.repeat(24), handle: 'x.bsky.social' }))!;
  check('a Lens or Bluesky session lasts 30 days', Math.abs(s.exp - (Date.now() / 1000 + 30 * 86400)) < 5);
}

// The Farcaster session.
const good = F.signFarcasterSession(PERSON)!;
check('a Farcaster session signs in (getFid)', (await fidOf(good)) === PERSON);
check('… and a real route takes it as the bearer (/api/auth/me: 200)', (await meStatus(good)) === 200);
const adminGood = F.signFarcasterSession(ADMIN)!;
check('… and an admin route takes it the same way (/api/admin/activity: 200 for an admin)', (await adminStatus(adminGood)) === 200);
check('… a non-admin’s session gets the admin route’s 404', (await adminStatus(good)) === 404);
{
  // Without the table (as before 0051_session_ends.sql is applied): every query on it fails as Postgres fails it.
  const SE = await import('../src/lib/session-ends');
  // A stand-in for postgres.js: a query (a tagged template) fails with this code; a helper call (sql(list)) is a fragment.
  const failing = (code: string) => ((q: unknown) => (Array.isArray(q) && 'raw' in (q as object) ? Promise.reject(Object.assign(new Error('relation does not exist'), { code })) : { fragment: q })) as unknown as Parameters<typeof SE.sessionEnded>[0];
  const noTable = failing('42P01');
  check('without the table, nothing is ended (sign-ins work as before)', (await SE.sessionEnded(noTable, [PERSON], 0)) === false);
  check('without the table, "Sign out on every device" says it isn’t here yet, and the route answers 503 for that', (await SE.endEverywhere(noTable!, [PERSON])).ok === false && /if \(!r\.ok\) return NextResponse\.json\(\{ error: 'Not available yet' \}, \{ status: 503/.test(read('src/app/api/auth/sign-out-everywhere/route.ts')));
  const broken = failing('57P01');
  const thrown = await SE.sessionEnded(broken, [PERSON], 0).then(() => null, (e: unknown) => e);
  check('fail closed (owner, 2026-11-23): any other read error throws SessionCheckUnavailable, never "not ended"', thrown instanceof SE.SessionCheckUnavailable && (thrown as { code?: string }).code === '57P01');
}

// Expired and forged.
const expired = F.signFarcasterSession(PERSON, -1)!;
check('an expired Farcaster session is refused (getFid null, /api/auth/me 401, admin 404)', (await fidOf(expired)) === null && (await meStatus(expired)) === 401 && (await adminStatus(F.signFarcasterSession(ADMIN, -1)!)) === 404);
{
  const [, body, sig] = adminGood.split('.');
  const other = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), sub: ADMINS[1] })).toString('base64url');
  const forgedBody = `f1.${other}.${sig}`;
  const forgedSig = `f1.${body}.${Buffer.from('not the signature').toString('base64url')}`;
  const unsigned = `f1.${body}.`;
  const extra = `${adminGood}.x`;
  const otherKind = Wl.signSession(5, '0x' + 'ab'.repeat(20))!.replace(/^w1\./, 'f1.');
  for (const [name, t] of [['another FID in the body', forgedBody], ['a bad signature', forgedSig], ['no signature', unsigned], ['an extra part', extra], ['a wallet token relabelled f1', otherKind]] as const) {
    check(`a forged session is refused: ${name} (getFid null, admin 404)`, (await fidOf(t)) === null && (await adminStatus(t)) === 404);
  }
  const old = process.env.IMAGES_TICKET_SECRET;
  process.env.IMAGES_TICKET_SECRET = 'another-secret-'.padEnd(48, 'y');
  const otherKey = F.signFarcasterSession(ADMIN)!;
  process.env.IMAGES_TICKET_SECRET = old;
  check('a session signed with another key is refused', (await fidOf(otherKey)) === null && (await adminStatus(otherKey)) === 404);
  check('a random token that is neither a session nor Quick Auth is refused', (await fidOf('eyJhbGciOiJIUzI1NiJ9.e30.x')) === null && (await meStatus('garbage')) === 401);
}

// "Sign out on every device".
const WALLET = '0x' + 'cd'.repeat(20);
await pg.exec(`insert into studio.wallet_accounts (address) values ('${WALLET}'), ('0x${'ef'.repeat(20)}')`);
const acct = Number((await pg.query<{ id: number }>(`select id::int as id from studio.wallet_accounts where address = '${WALLET}'`)).rows[0].id);
const lone = Number((await pg.query<{ id: number }>(`select id::int as id from studio.wallet_accounts where address = '0x${'ef'.repeat(20)}'`)).rows[0].id);
await pg.exec(`insert into studio.wallet_links (account_id, fid, how) values (${acct}, ${PERSON}, 'signed')`);
const walletTok = Wl.signSession(acct, WALLET)!;
const loneTok = Wl.signSession(lone, '0x' + 'ef'.repeat(20))!;
const lensTok = So.signSocialSession({ account: 41, kind: 'lens', subject: '0x' + '12'.repeat(20), handle: 'lens/x' })!;
const adminBefore = F.signFarcasterSession(ADMIN)!;
check('before: the Farcaster, linked wallet, lone wallet, Lens and admin sessions all work', (await fidOf(good)) === PERSON && (await A.getWallet(req('/x', walletTok))) !== null && (await A.getWallet(req('/x', loneTok))) !== null && (await A.getSocial(req('/x', lensTok))) !== null && (await adminStatus(adminBefore)) === 200);
await sleep(5);
const end = await endAll.POST(req('/api/auth/sign-out-everywhere', good, {}, 'POST'));
check('"Sign out on every device" (POST, the person’s own session): 200', end.status === 200);
check('… the session that tapped it is over too (/api/auth/me 401)', (await meStatus(good)) === 401 && (await fidOf(good)) === null);
check('… the wallet linked to that FID is signed out (its session, and as X-Wallet-Session beside a sign-in)', (await A.getWallet(req('/x', walletTok))) === null && (await A.walletFrom(walletTok)) === null && (await A.getPerson(req('/x', walletTok))) === null);
check('… another person’s sessions are not (a lone wallet, a Lens account, an admin)', (await A.getWallet(req('/x', loneTok))) !== null && (await A.getSocial(req('/x', lensTok))) !== null && (await adminStatus(adminBefore)) === 200);
await sleep(5);
const after = F.signFarcasterSession(PERSON)!;
check('a session issued after it works', (await fidOf(after)) === PERSON && (await meStatus(after)) === 200);
// An admin signs out everywhere: their admin route refuses the older session (404), a newer one works.
await endAll.POST(req('/api/auth/sign-out-everywhere', adminBefore, {}, 'POST'));
check('an admin session ended by "Sign out on every device" gets the admin route’s 404', (await adminStatus(adminBefore)) === 404);
await sleep(5);
check('… and a new admin session after it gets 200', (await adminStatus(F.signFarcasterSession(ADMIN)!)) === 200);
// A Lens account signs out everywhere from its own sign-in.
check('a Lens sign-in can sign out everywhere (200), and its session is then refused, also as X-Social-Session', (await endAll.POST(req('/api/auth/sign-out-everywhere', lensTok, {}, 'POST'))).status === 200 && (await A.getSocial(req('/x', lensTok))) === null && (await A.socialFrom(lensTok)) === null);
check('a lone wallet signs out everywhere: its session is refused', (await endAll.POST(req('/api/auth/sign-out-everywhere', loneTok, {}, 'POST'))).status === 200 && (await A.getWallet(req('/x', loneTok))) === null);
check('signed out, the button’s route answers 401', (await endAll.POST(req('/api/auth/sign-out-everywhere', null, {}, 'POST'))).status === 401);
check('one row per person, kept with when (the FID, the admin, the Lens account, the lone wallet)', Number((await pg.query<{ n: number }>(`select count(*)::int as n from studio.session_ends`)).rows[0].n) === 4);
proof('a session issued before the moment is refused even when the moment is in the same second', await (async () => {
  const t = F.signFarcasterSession(PERSON)!;
  await sleep(2);
  await endAll.POST(req('/api/auth/sign-out-everywhere', t, {}, 'POST'));
  return (await fidOf(t)) === null;
})());

// Fail closed (owner, 2026-11-23): when studio.session_ends can't be read, no route answers 401 (the page would forget
// its session) and an ended session never gets through. Run in its own process whose database is a closed port, so
// every read fails at once, as in an outage (this harness's one shared PGlite session can't be made to fail and carry
// on). Next answers an uncaught error with 500; the routes that catch answer "try again" (503).
{
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(path.join(ROOT, 'node_modules/.bin/tsx'), ['--conditions=react-server', path.join(ROOT, 'scripts/lib/sessions-outage.ts')], {
    env: { ...process.env, STUDIO_DATABASE_URL: 'postgres://studio_writer@127.0.0.1:9/postgres', DB_SILENT_MS: '3000' },
    encoding: 'utf8',
    timeout: 120_000,
  });
  const r = JSON.parse(out.trim().split('\n').pop()!) as Record<string, unknown>;
  const no401 = (v: unknown) => v !== 401 && v !== 200 && v !== 404;
  check('outage: a session never gets through (getFid throws, not its FID)', r.getFid === 'unavailable', String(r.getFid));
  check('outage: /api/auth/me answers no 401 (it throws: Next answers 500)', r.me === 'unavailable', String(r.me));
  check('outage: an admin route answers no 401 or 404 (it throws: 500)', r.admin === 'unavailable', String(r.admin));
  check('outage: wallet and Lens sessions, and the side header, don’t get through', r.wallet === 'unavailable' && r.walletSide === 'unavailable' && r.lens === 'unavailable', `${r.wallet} ${r.walletSide} ${r.lens}`);
  check('outage: a route that catches answers "try again" (503), not 401', r.hide === 503, String(r.hide));
  check('outage: "Sign out on every device" answers no 401', no401(r.endAll), String(r.endAll));
}

// Old tokens (before this release): no issue time; counted as issued 24 hours before they expire.
{
  const sign = (prefix: string, label: string, payload: object) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const key = createHmac('sha256', process.env.IMAGES_TICKET_SECRET!).update(label).digest();
    return `${prefix}.${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const oldWallet = sign('w1', 'wallet:session', { account: lone, address: '0x' + 'ef'.repeat(20), exp });
  const w = Wl.readSession(oldWallet);
  check('an old wallet token (no issue time) still reads, counted as issued 24 hours before it expires', w !== null && w.at === (exp - 86400) * 1000);
  check('… and it was ended by the lone wallet’s sign-out, which came after that', (await A.getWallet(req('/x', oldWallet))) === null);
  const oldLens = sign('s1', 'social:session', { account: 42, kind: 'lens', subject: '0x' + '34'.repeat(20), handle: null, exp });
  const s = So.readSocialSession(oldLens);
  check('an old Lens token still reads the same way', s !== null && s.at === (exp - 86400) * 1000 && (await A.getSocial(req('/x', oldLens))) !== null);
}

// --- One way in ---------------------------------------------------------------------------------------------------
{
  const files = walk('src').map((f) => ({ file: f, text: read(f) }));
  const verifies = files.filter((f) => /verifyJwt\(|from '@farcaster\/quick-auth'/.test(f.text)).map((f) => f.file).sort();
  check('only src/lib/auth.ts verifies a Farcaster token for a request (the sign-in routes use Farcaster’s server to issue the session)', JSON.stringify(verifies) === JSON.stringify(['src/app/api/auth/web/start/route.ts', 'src/app/api/auth/web/status/route.ts', 'src/lib/auth.ts']), verifies.join(', '));
  const ALLOWED_AUTH_READERS = new Set(['src/lib/auth.ts', 'src/lib/voice/flag.ts', 'src/lib/make/flag.ts', 'src/lib/agents/core.ts', 'src/lib/agents/oauth.ts', 'src/app/mcp/route.ts', 'src/app/api/agent/v1/[tool]/route.ts', 'src/app/api/oauth/token/route.ts']);
  const readers = files.filter((f) => /headers\.get\(\s*['"]authorization['"]\s*\)/i.test(f.text) && !ALLOWED_AUTH_READERS.has(f.file)).map((f) => f.file);
  check('no other file reads the Authorization header itself (test-only flags and agent tokens are named)', readers.length === 0, readers.join(', '));
  const status = read('src/app/api/auth/web/status/route.ts');
  check('the sign-in route verifies Farcaster’s token once, then hands the page the site’s session (never Farcaster’s token)', /verifyJwt\(\{ token: farcasterToken/.test(status) && /signFarcasterSession\(fid\)/.test(status) && /state: 'completed', token,/.test(status) && !/state: 'completed', token: farcasterToken/.test(status));
  const cookies = files.filter((f) => /set-cookie|cookies\(\)\.set|document\.cookie/i.test(f.text)).map((f) => f.file);
  check('no cookie anywhere for a sign-in', cookies.length === 0, cookies.join(', '));
  const sideReaders = files.filter((f) => f.file.startsWith('src/app/') && /readSession\(request\.headers|readSocialSession\(request\.headers/.test(f.text)).map((f) => f.file);
  check('the side headers (X-Wallet-Session, X-Social-Session) go through walletFrom / socialFrom, never the bare signature check', sideReaders.length === 0, sideReaders.join(', '));
  proof('a route reading X-Wallet-Session with the bare signature check is caught', [{ file: 'src/app/api/x/route.ts', text: "const w = readSession(request.headers.get('x-wallet-session'));" }].filter((f) => /readSession\(request\.headers/.test(f.text)).length === 1);
  const { PRIVACY, LEGAL, legalKey } = await import('../src/lib/legal');
  const privacy = PRIVACY.sections.flatMap((x) => x.body.flat()).join('\n');
  check('Privacy carries the owner’s reread words (2026-11-23): §3 "30 days unless you sign out", and the §4 line, word for word; the hour is gone; the reread key matches', privacy.includes('on the website, your sign-in, which lasts 30 days unless you sign out, a note of a Bluesky sign-in under way') && PRIVACY.sections.find((x) => x.n === 4)!.body.flat().includes('If you choose "Sign out on every device" on your You page: when you chose it, so that sign-ins made before then stop working.') && !/about an hour/.test(privacy) && LEGAL.ownerReread.privacy?.words === legalKey(PRIVACY));
}

check('no protocol errors on the test database', gate.protocolErrors().length === 0);
await server.stop();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
process.exit(0);
