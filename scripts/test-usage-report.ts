/**
 * The usage report (scripts/usage-report.ts). No network, no production database: an in-memory Postgres (PGlite) with
 * every migration, read as studio_writer. Fails (exit 1) on any problem.
 *
 *   npm run test:usage
 *
 * - Every count's category names only category columns, and its number is an aggregate; planted faults are caught.
 * - One read-only transaction; UTC days; distinct people are distinct over the span, not a sum of days.
 * - Pictures by model, open or closed; remixes and entries per character; claims and posts once their tables exist.
 * - No private value (a FID, a name, an address, a DID, a handle, a question, a prompt or a backstory) is in the answer.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { CHALLENGE } from '../src/lib/config';
import { DEFS, checkDefs, checkRows, report, type Report } from './usage-report';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted fault was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const throws = (f: () => void) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

// --- The count rules ------------------------------------------------------------------------------------------------
check('every count names only categories and returns an aggregate', checkDefs(DEFS).length === 0, checkDefs(DEFS).join('; '));
const base = DEFS[0];
proof('a category naming a FID is caught', checkDefs([{ ...base, key: 'fid::text' }]).length > 0);
proof('a category naming a person through an alias is caught', checkDefs([{ ...base, key: `'x' || m.fid` }]).length > 0);
proof('a category reading a prompt from params is caught', checkDefs([{ ...base, key: `r.params->>'user_prompt'` }]).length > 0);
proof('a category reading a backstory is caught', checkDefs([{ ...base, key: `v.body->'backstory'->>'text'` }]).length > 0);
proof('a number that is not an aggregate is caught', checkDefs([{ ...base, n: 'max(fid)' }]).length > 0);
proof('an answer holding a FID is refused', throws(() => checkRows('p', ['Questions 900001'])));
proof('an answer holding an address is refused', throws(() => checkRows('p', ['0x' + 'ab'.repeat(20)])));
proof('an answer holding a DID is refused', throws(() => checkRows('p', ['did:plc:abc'])));
proof('an answer holding free text is refused', throws(() => checkRows('p', ['what is "the snow moon"?'])));
check('plain labels pass', !throws(() => checkRows('p', ['Pictures made: gpt-image-2.5-sunburst (closed)', 'Entries submitted: zei'])));

// --- The database ---------------------------------------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);

// The migrations leave a few rows of their own (a seeded name, wallets, read-back accounts): counted from here.
const [seeded] = (await pg.query<{ fc: number; w: number; bs: number }>(`select
  (select count(distinct person) from studio.account_names)::int as fc, (select count(*) from studio.wallet_accounts)::int as w,
  (select count(*) from studio.social_accounts where kind = 'bluesky')::int as bs`)).rows;
const ASKER = 777001;
const MAKER = 900001;
const WALLET = '0x' + 'ab'.repeat(20);
const DID = 'did:plc:' + 'a'.repeat(24);
const TODAY = `(now() at time zone 'utc')::date`;
// 23:30 UTC yesterday: it must count on yesterday's UTC day.
const LATE = `((${TODAY})::timestamp - interval '30 minutes') at time zone 'utc'`;
const OLD = `now() - interval '40 days'`;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await pg.exec(`
  insert into studio.account_names (fname, person) values ('zeimaker', ${MAKER}), ('askername', ${ASKER});
  insert into studio.account_names (fname, person, seen_at) values ('oldname', ${ASKER}, ${OLD});
  insert into studio.wallet_accounts (address) values ('${WALLET}');
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', '${DID}', 'someone.bsky.social');
  insert into studio.chat_calls (fid, model, at) values (${ASKER}, 'm', now()), (${ASKER}, 'm', now()), (${MAKER}, 'm', ${LATE}), (${ASKER}, 'm', ${LATE}), (${ASKER}, 'm', ${OLD});
  insert into studio.chat_costs (day, kind, model, calls, cost_usd) values (${TODAY}, 'answer', 'm', 2, 0.25), (${TODAY}, 'guard', 'g', 2, 0.01), (${TODAY} - 40, 'answer', 'm', 1, 1);
  insert into studio.image_costs (kind, model, verdict, calls, cost_usd, funded) values
    ('image', 'z-image-turbo', 'ok', 3, 0.009, 'free'), ('image', 'gpt-image-2.5-sunburst', 'ok', 1, 0.2, 'free'),
    ('image', 'gpt-image-2.5-sunburst', 'nsfw', 1, 0.2, 'free'), ('reserved', 'z-image-turbo', '', 0, 0.5, 'free');
  insert into studio.image_asks (fid, at, pool) values (${ASKER}, now(), 'open'), (${ASKER}, now(), 'closed'), (${MAKER}, now(), 'open');
  insert into studio.image_asks_back (fid) values (${ASKER});
  insert into studio.entities (id, work_id, kind, name) values ('${id(1)}', 'snowmoon', 'character', 'Zei');
  insert into studio.elements (id, work_id, element_type, entity_id, created_by_fid, status) values
    ('${id(11)}', 'snowmoon', 'design', '${id(1)}', ${MAKER}, 'published'),
    ('${id(12)}', 'snowmoon', 'design', '${id(1)}', ${MAKER}, 'published'),
    ('${id(13)}', 'snowmoon', 'image', null, ${MAKER}, 'published'),
    ('${id(14)}', 'snowmoon', 'image', null, ${MAKER}, 'published'),
    ('${id(15)}', 'snowmoon', 'image', null, ${MAKER}, 'hidden');
  insert into studio.recipes (id, source, model, prompt, params, created_by_fid) values
    ('${id(21)}', 'in_app', 'z-image-turbo', 'SECRET PROMPT', '{"user_prompt":"SECRET WORDS","by_name":"zeimaker"}', ${MAKER}),
    ('${id(22)}', 'in_app', 'gpt-image-2.5-sunburst', 'SECRET PROMPT', '{"user_prompt":"SECRET WORDS","challenge":{"character":"zei","from":"${id(32)}","fromKind":"sheet"}}', ${MAKER}),
    ('${id(23)}', 'in_app', 'z-image-turbo', 'p', '{"challenge":{"character":"zei","fromKind":"sheet"}}', ${MAKER});
  insert into studio.element_versions (id, element_id, version_no, body, recipe_id) values
    ('${id(31)}', '${id(11)}', 1, '{"title":"Zei in snow"}', null),
    ('${id(32)}', '${id(12)}', 1, '{"title":"Zei remixed"}', null),
    ('${id(33)}', '${id(13)}', 1, '{}', '${id(21)}'),
    ('${id(34)}', '${id(14)}', 1, '{"backstory":{"text":"SECRET BACKSTORY","at":"2026-11-16T00:00:00Z"}}', '${id(22)}'),
    ('${id(35)}', '${id(15)}', 1, '{}', '${id(23)}');
  insert into studio.links (from_version_id, to_version_id, kind) values ('${id(32)}', '${id(31)}', 'remixed_from'), ('${id(34)}', '${id(32)}', 'uses');
  insert into studio.challenge_marks (challenge, fid, character, version_id, marked_at) values ('${CHALLENGE.id}', ${MAKER}, 'zei', '${id(34)}', now());
  insert into studio.challenge_marks (challenge, fid, character, version_id, marked_at, withdrawn_at) values ('${CHALLENGE.id}', ${ASKER}, 'zei', '${id(33)}', ${LATE}, now());
  insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible) values ('${id(34)}', '${CHALLENGE.id}', ${MAKER}, 'passed', true);
  insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid) values
    ('${id(34)}', 'bluesky', 'abc123', 'someone.bsky.social', now(), 'https://bsky.app/profile/${DID}/post/abc123', ${MAKER});
`);
const PORT = 54393;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;

const line = (r: Report, key: string) => r.lines.find((l) => l.key === key);
const today = (r: Report) => r.days[r.days.length - 1];
const yesterday = (r: Report) => r.days[r.days.length - 2];
try {
  const r = await report(sql);
  const json = JSON.stringify(r);
  check('read as studio_writer, read-only', r.meta.role === 'studio_writer' && r.meta.ro === 'on', JSON.stringify(r.meta));
  check('14 UTC days, oldest first, ending today', r.days.length === 14 && r.days[13] === r.meta.today && r.days[0] === r.meta.first && r.days[0] < r.days[1]);

  const q = line(r, 'Questions asked');
  check('questions: 4 in the 14 days, 5 all time, 2 today, 2 yesterday (23:30 UTC)', q?.window === 4 && q.allTime === 5 && q.byDay[today(r)] === 2 && q.byDay[yesterday(r)] === 2, JSON.stringify(q));
  const a = line(r, 'Distinct askers');
  check('askers: distinct over the span (2), not a sum of days (3)', a?.window === 2 && a.allTime === 2 && a.byDay[yesterday(r)] === 2 && a.byDay[today(r)] === 1 && a.distinct, JSON.stringify(a));
  const s = line(r, 'Spend, all kinds (USD)');
  check('assistant spend: 0.26 in the window, 1.26 all time, by kind', Math.abs((s?.window ?? 0) - 0.26) < 1e-9 && Math.abs((s?.allTime ?? 0) - 1.26) < 1e-9 && line(r, 'Spend: guard (USD)')?.window === 0.01, JSON.stringify(s));

  const fc = line(r, 'Farcaster: people whose latest recorded sign-in was that day (not new)');
  check('Farcaster: one per person, on their latest sign-in (the asker\'s older name does not count twice)', (fc?.byDay[today(r)] ?? 0) >= 2 && fc?.allTime === seeded.fc + 2, JSON.stringify({ fc, seeded }));
  check('wallet and Bluesky: new accounts', line(r, 'Wallet: new accounts (first sign-in)')?.allTime === seeded.w + 1 && line(r, 'Bluesky: new accounts (first sign-in)')?.allTime === seeded.bs + 1, JSON.stringify(seeded));

  check('pictures made by model, open and closed (the nsfw-dropped one and the reservation left out)',
    line(r, 'Pictures made: z-image-turbo (open)')?.window === 3 && line(r, 'Pictures made: gpt-image-2.5-sunburst (closed)')?.window === 1 &&
    line(r, 'Pictures made, all open models')?.window === 3 && line(r, 'Pictures made, all closed models')?.window === 1, JSON.stringify(r.lines.filter((l) => l.key.startsWith('Pictures made'))));
  check('Generates by pool, and given back', line(r, 'Generates counted in the daily limit, pool: closed')?.window === 1 && line(r, 'Generates counted in the daily limit, pool: open')?.window === 2 && line(r, 'Generates given back to the daily limit')?.window === 1);
  check('published pictures: still published only, by model', line(r, 'Published pictures (not challenge): z-image-turbo (open)')?.window === 1 && line(r, 'Published challenge pictures: gpt-image-2.5-sunburst (closed)')?.window === 1 && !r.lines.some((l) => l.key === 'Published challenge pictures: z-image-turbo (open)'));
  check('remixes per character: challenge pictures and sheets', line(r, 'Remixes published, challenge pictures: zei (from a sheet)')?.window === 1 && line(r, 'Remixes published, character sheets: Zei')?.window === 1);

  check('entries: submitted, withdrawn, standing (eligible), per character', line(r, 'Entries submitted: zei')?.window === 2 && line(r, 'Entries withdrawn: zei')?.byDay[today(r)] === 1 && line(r, 'Entries standing (not withdrawn, eligible at publish): zei')?.window === 1);
  check('backstories at publish, per character', line(r, 'Challenge pictures published with a backstory: zei')?.window === 1);
  check('the claim tables are listed as not here (unmerged branch)', r.missing.some((m) => m.includes('claims_sent')) && r.missing.some((m) => m.includes('backstory_added')), r.missing.join('; '));
  check('a count with no rows still shows, as zeros', line(r, 'Remix frames made (none recorded)')?.allTime === 0 && line(r, 'Posts linked to a picture: bluesky') !== undefined);
  check('posts by network', line(r, 'Posts linked to a picture: bluesky')?.window === 1);

  for (const [what, value] of [['an asker\'s FID', String(ASKER)], ['a maker\'s FID', String(MAKER)], ['a wallet address', WALLET], ['a DID', DID], ['a handle', 'someone.bsky.social'], ['a Farcaster name', 'askername'], ['a name', 'zeimaker'], ['a prompt', 'SECRET'], ['a title', 'Zei in snow']] as const)
    check(`no private value in the answer: ${what}`, !json.includes(value));
  proof('the value scan finds a planted FID', JSON.stringify({ ...r, planted: ASKER }).includes(String(ASKER)));

  // A write inside the report's own transaction kind is refused.
  let refused = '';
  await sql.begin('read only', async (tx) => tx`insert into studio.image_asks (fid) values (1)`).catch((e) => (refused = (e as { code?: string }).code ?? 'error'));
  check('a write inside a read-only transaction is refused (25006)', refused === '25006', refused);

  // The claim tables, once there (shape as branch challenge-backstory-bounty's NEXT_challenge_bounty_claims.sql).
  await pg.exec(`reset role;
    create table studio.challenge_backstories (id bigint generated always as identity primary key, version_id uuid not null, fid bigint not null, text text not null, added_at timestamptz not null default now());
    create table studio.challenge_bounty_claims (id bigint generated always as identity primary key, bounty_id bigint not null, version_id uuid not null, fid bigint not null,
      title text not null, description text not null, pinned_at timestamptz not null default now(), tx_hash text, sent_at timestamptz, wallet text, outcome text, claim_id bigint, confirmed_at timestamptz);
    insert into studio.challenge_backstories (version_id, fid, text) values ('${id(34)}', ${MAKER}, 'SECRET LATER');
    insert into studio.challenge_bounty_claims (bounty_id, version_id, fid, title, description, tx_hash, sent_at, wallet, outcome, claim_id, confirmed_at) values
      (560, '${id(34)}', ${MAKER}, 'SECRET TITLE', 'SECRET DESC', null, null, null, null, null, null),
      (560, '${id(34)}', ${MAKER}, 'SECRET TITLE', 'SECRET DESC', '0x${'1'.repeat(64)}', now(), '${WALLET}', 'confirmed', 7, now()),
      (560, '${id(34)}', ${ASKER}, 'SECRET TITLE', 'SECRET DESC', '0x${'2'.repeat(64)}', now(), '${WALLET}', 'reverted', null, now()),
      (560, '${id(34)}', ${ASKER}, 'SECRET TITLE', 'SECRET DESC', '0x${'3'.repeat(64)}', now(), '${WALLET}', null, null, null);
    grant select on studio.challenge_backstories, studio.challenge_bounty_claims to studio_writer;
    set role studio_writer;`);
  const r2 = await report(sql);
  check('claims once there: 4 prepared, 3 sent by 2 people, 1 confirmed, 1 reverted; 1 backstory added',
    line(r2, 'Backstory claims prepared (pinned)')?.window === 4 && line(r2, 'Backstory claims sent')?.window === 3 && line(r2, 'Distinct people sending claims')?.window === 2 &&
    line(r2, 'Backstory claims confirmed')?.window === 1 && line(r2, 'Backstory claims reverted')?.window === 1 && line(r2, 'Backstories added after publish')?.window === 1 && r2.missing.length === 0,
    JSON.stringify(r2.lines.filter((l) => /claim|Backstor/.test(l.key))) + r2.missing.join('; '));
  check('no claim text, hash or wallet in the answer', !/SECRET|0x1111|0x2222/.test(JSON.stringify(r2)) && !JSON.stringify(r2).includes(WALLET));
} finally {
  await sql.end({ timeout: 2 });
  await server.stop();
  await pg.close();
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
