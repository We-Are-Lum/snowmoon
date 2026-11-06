/**
 * The admin activity page (owner, 2026-11-05; docs/proposals/admin-activity.md). No network, no production database:
 * an in-memory Postgres (PGlite) with every migration, read as studio_writer. Fails (exit 1) on any problem.
 *
 *   npm run test:admin-activity
 *
 * - The gate: 404 signed out and to a non-admin, before anything is read; 200 to an admin; the route never caches.
 * - One read-only transaction: a write inside it is refused.
 * - Counts whose table or column isn't there yet are left out without an error, and appear once it is.
 * - Pacific days for timed rows, UTC days for the cost tables; totals add up (balances = paid − spent + added back).
 * - Public rows only: hidden work is counted under Safety and listed nowhere; no private person value (an asker's
 *   FID, a wallet's address, a DID, a reporter) is anywhere in the answer.
 * - P5b's exception (owner, 2026-11-05) and P6aa's count rules, each proven to fail on a planted fault ("proof: …").
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { ADMINS, CHALLENGE } from '../src/lib/config';
import { P5B_PLANTS, p5bProblems } from './lib/p5b';
import { defProblems, defs, TZ } from '../src/lib/admin-activity-defs';

// No network: Farcaster's name lookups go to a closed local port and fail at once (src/lib/names.ts), as when Farcaster is down.
process.env.FARCASTER_API_URL = 'http://127.0.0.1:9';
const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted fault was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));

// --- P5b: admin code hides and picks; only an admin-only page (404 to everyone else) may sort ----------------------
{
  const src = walk('src').map((f) => ({ file: f, text: read(f) }));
  check('P5b passes on the real files', p5bProblems(src).length === 0, p5bProblems(src).join('; '));
  for (const [name, f] of Object.entries(P5B_PLANTS)) proof(`P5b catches the "${name}" fault`, p5bProblems([f]).length > 0);
  const lib = src.find((f) => f.file === 'src/lib/admin-activity.ts')!;
  check('the dashboard sorts, and passes P5b by its own 404 gate', /order by|\.sort\(/.test(lib.text) && p5bProblems([lib]).length === 0);
  proof('the dashboard with its 404 gate turned into a plain isAdmin check is caught', p5bProblems([{ ...lib, text: lib.text.replace(/if \(!isAdmin\(fid\)\) return \{ status: 404[^\n]*/, 'const admin = isAdmin(fid);') }]).length > 0);
  check('an admin-only page sorting by counts passes', p5bProblems([{ file: 'src/app/admin/x/page.tsx', text: "if (!isAdmin(fid)) return NextResponse.json({}, { status: 404 });\nrows.sort((a, b) => b.n - a.n);" }]).length === 0);
}

// --- P6aa: every count is a total ---------------------------------------------------------------------------------
const DEFS = defs(CHALLENGE.id);
check('every count names only categories and returns an aggregate', DEFS.every((d) => defProblems(d).length === 0), DEFS.flatMap(defProblems).join('; '));
proof('a key that names a FID is caught', defProblems({ id: 'p', section: 'making', unit: 'count', key: 'fid::text', n: 'count(*)', from: 'studio.image_asks where true', ts: 'at' }).length > 0);
proof('a key that names a person through a table alias is caught', defProblems({ id: 'p', section: 'making', unit: 'count', key: `'x' || x.person`, n: 'count(*)', from: 'studio.remix_asks x where true', ts: 'x.at' }).length > 0);
proof('a number that is not an aggregate is caught', defProblems({ id: 'p', section: 'making', unit: 'count', key: `'x'`, n: 'max(fid)', from: 'studio.image_asks where true', ts: 'at' }).length > 0);
{
  const route = read('src/app/api/admin/activity/route.ts');
  check('the route has GET only and answers private, no-store', !/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/.test(route) && /'Cache-Control': 'private, no-store'/.test(route) && /headers: NO_STORE/.test(route));
  const page = read('src/app/admin/activity/page.tsx');
  check('the page is always "not found", dynamic, noindex', /notFound\(\);/.test(page) && /dynamic = 'force-dynamic'/.test(page) && /index: false/.test(page) && !/title/.test(page.replace(/\/\*[\s\S]*?\*\//g, '')));
  const comp = read('src/components/admin-activity.tsx');
  check('the browser asks only for an admin, and holds none of the section titles', /admin = auth\.kind === 'signed-in' && isAdmin\(auth\.fid\)/.test(comp) && !/Sign-ins by network|Spend by kind/.test(comp));
}

// --- The database -----------------------------------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(read(`supabase/migrations/${f}`));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);

// People. Public: @zeimaker (FID 900001), who publishes. Private only: FID 777001 asks for pictures and questions; a wallet
// pays; a Bluesky account signs in; FID 555001 reports.
const WALLET = '0x' + 'ab'.repeat(20);
const DID = 'did:plc:' + 'a'.repeat(24);
const ASKER = 777001;
const REPORTER = 555001;
// 23:30 Pacific yesterday (07:30 UTC today in winter): it must count on yesterday's Pacific day.
const LATE = `(((now() at time zone '${TZ}')::date::timestamp - interval '30 minutes') at time zone '${TZ}')`;
await pg.exec(`
  insert into studio.account_names (fname, person) values ('zeimaker', 900001), ('asker', ${ASKER});
  insert into studio.wallet_accounts (address) values ('${WALLET}');
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', '${DID}', 'someone.bsky.social');
  insert into studio.image_asks (fid, at) values (${ASKER}, now()), (${ASKER}, now()), (900001, now()), (${ASKER}, ${LATE});
  insert into studio.chat_calls (fid, model) values (${ASKER}, 'm'), (${ASKER}, 'm');
  insert into studio.chat_costs (kind, model, calls, cost_usd) values ('answer', 'm', 2, 0.25);
  insert into studio.image_costs (kind, model, verdict, calls, cost_usd, funded) values ('image', 'z', 'ok', 3, 0.009, 'free'), ('reserved', 'z', '', 0, 0.5, 'free');
  insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ('0x${'1'.repeat(64)}', 1, 8453, 'USDC', 5000000, 5, 1);
  insert into studio.wallet_debits (account_id, usd) values (1, 1.5), (1, 0.5);
  insert into studio.wallet_credits (debit_id, account_id, usd, reason) values (2, 1, 0.5, 'failed');
  insert into studio.entities (id, work_id, kind, name) values ('00000000-0000-0000-0000-0000000000e1', 'snowmoon', 'character', 'Zei');
  insert into studio.elements (id, work_id, element_type, entity_id, created_by_fid, status) values
    ('00000000-0000-0000-0000-0000000000a1', 'snowmoon', 'design', '00000000-0000-0000-0000-0000000000e1', 900001, 'published'),
    ('00000000-0000-0000-0000-0000000000a2', 'snowmoon', 'design', '00000000-0000-0000-0000-0000000000e1', 900001, 'published'),
    ('00000000-0000-0000-0000-0000000000a3', 'snowmoon', 'design', '00000000-0000-0000-0000-0000000000e1', 900002, 'hidden');
  insert into studio.element_versions (id, element_id, version_no, body) values
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1, '{"title":"Zei in snow","by_name":"zeimaker"}'),
    ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 1, '{"title":"Zei remixed","by_name":"zeimaker"}'),
    ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a3', 1, '{"title":"Hidden sheet","by_name":"hiddenmaker"}');
  insert into studio.links (from_version_id, to_version_id, kind) values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'remixed_from');
  insert into studio.removal_log (element_id, step, by_fid, role, reason, note) values
    ('00000000-0000-0000-0000-0000000000a3', 'reported', ${REPORTER}, 'reader', 'spam', 'a private note'),
    ('00000000-0000-0000-0000-0000000000a3', 'hidden', 6786, 'moderator', null, null);
  insert into studio.remix_frames (adaptation_id, version_id, shot_id, person, own_words, prompt, recipe, image_url, image_sha256, cost_usd, by_name, hidden, hidden_by, hidden_role, hidden_at) values
    (1, 2, 'first', 900001, 'snow', 'p', '{}', 'https://media.snowmoon.party/f1.jpg', '${'c'.repeat(64)}', 0.01, 'zeimaker', false, null, null, null),
    (1, 2, 'first', 900003, 'hidden words', 'p', '{}', 'https://media.snowmoon.party/f2.jpg', '${'d'.repeat(64)}', 0.01, 'hiddenframer', true, 900003, 'maker', now());
`);

// A wallet linked to @zeimaker's FID makes a frame: it must show under the FID, as the frame page shows it.
await pg.exec(`
  insert into studio.wallet_links (account_id, fid, how) select id, 900001, 'signed' from studio.wallet_accounts where address = '${WALLET}';
  insert into studio.remix_frames (adaptation_id, version_id, shot_id, person, own_words, prompt, recipe, image_url, image_sha256, cost_usd, by_name, created_at)
    select 1, 2, 'first', -id, 'linked', 'p', '{}', 'https://media.snowmoon.party/f3.jpg', '${'e'.repeat(64)}', 0.01, 'walletname-x', now() + interval '1 minute' from studio.wallet_accounts where address = '${WALLET}';
`);
const PORT = 54391;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const A = await import('../src/lib/admin-activity');
type Sql = Parameters<typeof A.adminActivity>[0];
const S = sql as unknown as Sql;
const admin = ADMINS[0];

{
  let reads = 0;
  const spy = new Proxy(S as object, { get: (t, k) => ((reads++, Reflect.get(t, k))) }) as Sql;
  const out = await A.adminActivity(spy, null);
  check('signed out: 404, and nothing read', out.status === 404 && reads === 0);
  const non = await A.adminActivity(spy, 501);
  check('a non-admin: 404, and nothing read', non.status === 404 && reads === 0);
  check('an admin without a database: 503', (await A.adminActivity(null, admin)).status === 503);
}

let refused = '';
try {
  await sql.begin('read only', async (tx) => tx`insert into studio.image_asks (fid) values (1)`);
} catch (e) {
  refused = (e as { code?: string }).code ?? 'error';
}
check('a write inside the read-only transaction is refused (25006)', refused === '25006', refused);

const got = await A.adminActivity(S, admin, { days: 30 });
check('an admin: 200', got.status === 200, JSON.stringify(got.body).slice(0, 300));
const v = got.body as Exclude<typeof got.body, { error: string }>;
const metric = (key: string) => v.sections.flatMap((s) => s.metrics).find((m) => m.key === key);
const json = JSON.stringify(v);

check('30 days, newest first, Pacific and UTC', v.days === 30 && v.dayList.length === 30 && v.dayListUtc.length === 30 && v.dayList[0] > v.dayList[1]);
check('days: anything but 7, 30 or 90 is 30', A.daysFrom('5') === 30 && A.daysFrom('90') === 90 && A.daysFrom(null) === 30);
{
  const asks = metric('Pictures asked for');
  check('pictures asked for: 4 in all, 3 today', asks?.total === 4 && asks.byDay[v.dayList[0]] === 3, JSON.stringify(asks));
  check('a 23:30 Pacific ask counts on that Pacific day (yesterday), not the UTC day', asks?.byDay[v.dayList[1]] === 1, JSON.stringify(asks?.byDay));
  check('people who made pictures: 2 (distinct, a total)', metric('People who made pictures or frames')?.total === 2);
  check('assistant questions: 2, from 1 person', metric('Assistant questions')?.total === 2 && metric('People asking the assistant')?.total === 1);
  check('assistant spend on its UTC day', metric('Assistant: answer')?.byDay[v.dayListUtc[0]] === 0.25);
  const img = metric('Images: image (ok) · free');
  check('image spend by kind, verdict and funding; reserved apart', img?.total === 0.009 && metric('Images: reserved (in flight)')?.total === 0.5, JSON.stringify(img));
  check('balances held = paid − spent + added back (5 − 2 + 0.5)', metric('Wallet balances held, all accounts')?.total === 3.5 && metric('Wallet accounts holding a balance')?.total === 1);
  const [base] = (await pg.query<{ fc: number; w: number }>(`select (select count(distinct person) from studio.account_names)::int as fc, (select count(*) from studio.wallet_accounts)::int as w`)).rows;
  check('sign-ins: Farcaster latest, wallet and Bluesky first (as the tables hold them)', metric('Farcaster: people whose latest sign-in was that day (total: ever seen)')?.total === base.fc && metric('Wallet: new accounts (first sign-in)')?.total === base.w && metric('Bluesky: new accounts (first sign-in)')?.total === 1 && (metric('Farcaster: people whose latest sign-in was that day (total: ever seen)')?.byDay[v.dayList[0]] ?? 0) >= 2, JSON.stringify(base));
  check('safety: a report by reason, a moderator\'s hide by role, hidden counts', metric('Reports: spam')?.total === 1 && metric('Actions: hidden · moderator')?.total === 1 && metric('Hidden now: design')?.total === 1 && metric('Remix frames hidden, by maker')?.total === 1);
  check('published: one version, one remix', metric('Sheet and style versions (not remixes)')?.total === 1 && metric('Remix versions')?.total === 1);
}
{
  const list = (id: string) => v.lists.find((l) => l.id === id)?.rows ?? [];
  check('newest versions: the public sheet with its byline and link', list('versions').some((r) => r.by === '@zeimaker' && r.href === '/references/designs/00000000-0000-0000-0000-0000000000b1'));
  check('newest remixes: the remix', list('remixes').length === 1 && list('remixes')[0].title === 'Zei remixed');
  check('frames: the shown ones only (not the hidden one)', list('frames').length === 2 && list('frames').every((r) => r.href?.startsWith('/remix/')));
  check('a linked wallet\'s frame shows under its FID, as the frame page shows it (credit, then frameByline)', list('frames')[0]?.by === 'FID 900001' && !json.includes('walletname-x'), JSON.stringify(list('frames')));
  check('scene versions: under their handle and fixed link, as the scene pages (sceneHandleFor)', list('scenes').some((r) => r.by === '@naaate' && r.href === '/@naaate/1/v/2'), JSON.stringify(list('scenes')));
  check('no bases set: said so', v.lists.some((l) => l.id === 'bases' && /no bases set/.test(l.title)));
  check('hidden work is listed nowhere', !/Hidden sheet|hiddenmaker|hiddenframer|hidden words/.test(json));
  for (const [what, value] of [['an asker\'s FID', String(ASKER)], ['a reporter\'s FID', String(REPORTER)], ['a wallet address', WALLET], ['a DID', DID], ['a reporter\'s note', 'a private note'], ['a Bluesky handle', 'someone.bsky.social'], ['a private name', 'asker"']] as const)
    check(`no private person value in the answer: ${what}`, !json.includes(value));
  proof('the value scan finds a planted asker FID', JSON.stringify({ ...v, planted: ASKER }).includes(String(ASKER)));
}
{
  const optional = ['sheet_remix_asks', 'sheet_remix_people', 'coach_spend', 'person_paid', 'person_owed', 'withdrawals'];
  check('optional counts missing here are left out, without an error', optional.every((id) => v.notHere.includes(id)), v.notHere.join());
  // PGlite is one session: the site's role is the test's too, so the test steps out of it to add the tables.
  await pg.exec(`reset role;
    create table studio.sheet_remix_asks (id bigint generated always as identity primary key, remix uuid not null, fid bigint not null, units smallint not null, slot text not null, at timestamptz not null default now());
    insert into studio.sheet_remix_asks (remix, fid, units, slot) values ('00000000-0000-0000-0000-0000000000b2', ${ASKER}, 3, 'front');
    alter table studio.challenge_marks add column withdrawn_at timestamptz;
    insert into studio.challenge_marks (challenge, fid, character, version_id, marked_at, withdrawn_at) values ('${CHALLENGE.id}', 900001, 'zei', '00000000-0000-0000-0000-0000000000b2', now() - interval '1 hour', now());
    grant select on studio.sheet_remix_asks to studio_writer;
    set role studio_writer;`);
  const again = await A.adminActivity(S, admin, { days: 7 });
  const w = again.body as typeof v;
  const m2 = (key: string) => w.sections.flatMap((s) => s.metrics).find((m) => m.key === key);
  check('once there, sheet remixes and withdrawals are counted', again.status === 200 && m2('Sheet remix views asked for')?.total === 3 && m2('Withdrawn: zei')?.total === 1 && !w.notHere.includes('withdrawals'), JSON.stringify(w.notHere));
  check('7 days', w.dayList.length === 7);
}
{
  const who = await A.adminActivity(S, admin, { who: '@zeimaker' });
  const b = who.body as typeof v;
  check('one person: their public work only, no private counts', who.status === 200 && b.who === '@zeimaker' && b.lists.find((l) => l.id === 'versions')?.rows.length === 1 && b.sections.length === 0);
  const nobody = await A.adminActivity(S, admin, { who: 'nobody-here' });
  check('an unknown person: everyone, with who null', (nobody.body as typeof v).who === null);
}

await sql.end();
await server.stop();
await pg.close();
console.log(`admin activity: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
