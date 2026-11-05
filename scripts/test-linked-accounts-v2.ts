/**
 * Linked accounts v2 (src/lib/linked/v2.ts), on an in-memory Postgres (PGlite) with the real migration
 * (NEXT_linked_accounts, after main's 0001..0036, the SQL pack's items 3, 4, 6 and NEXT_person_balance). Never a
 * production database. Drafted by a coding agent (Claude, a closed model by Anthropic).
 *
 *   npm run test:linked-accounts-v2
 *
 * The owner's tests (docs/proposals/linked-accounts-v2.md, section 6a), dates 2026-2027 at noon Pacific:
 * - T0: with the switch off (LINKED_ACCOUNTS.enabled false, as shipped) every action answers 'off' and changes nothing;
 * - T1: the chain (Farcaster A + Lens B; B unlinked; Lens C linked; A unlinked after C becomes main; Farcaster D);
 * - T2: at every step, a sign-in that isn't main is refused each main-only action; it may make, spend, submit (if
 *   social) and unlink itself;
 * - T3: recovering the main sign-in (no notification is built or sent);
 * - T7: the 30-day wait for joining AND starting, and A5;
 * - T10: self-unlink.
 * Each has planted faults that must fail it. The actions run as studio_writer.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { LINKED_ACCOUNTS } from '../src/lib/config';
import * as v2 from '../src/lib/linked/v2';
import type { Config, Db, Result } from '../src/lib/linked/v2';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const log: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  log.push(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` (${detail})`}`);
};
const ON: Config = { ...LINKED_ACCOUNTS, enabled: true };

// --- The database ---------------------------------------------------------------------------------------------------
const gitShow = (ref: string) => execFileSync('git', ['show', ref], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
async function fresh(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort())
    await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  const doc = gitShow('origin/sql-pack:docs/legal/sql-pack-2026-11-04.md');
  const pack = new Map<string, string>();
  for (const m of doc.matchAll(/^### (\d[A-D])\. [^\n]*\n[\s\S]*?```sql\n([\s\S]*?)\n```/gm)) pack.set(m[1], m[2]);
  for (const k of ['3', '4', '6']) await pg.exec(pack.get(`${k}B`)!);
  const pb = readFileSync(path.join(ROOT, 'supabase/migrations/NEXT_person_balance.sql'), 'utf8');
  await pg.exec(pb.slice(pb.indexOf('-- B. THE MIGRATION'), pb.indexOf('-- C. READ-BACK')));
  const la = readFileSync(path.join(ROOT, 'supabase/migrations/NEXT_linked_accounts.sql'), 'utf8');
  await pg.exec(la.slice(la.indexOf('-- B. THE MIGRATION.'), la.indexOf('-- C. READ-BACK')));
  await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;`);
  return pg;
}

/** PGlite as the module's Db: a top-level tx runs as studio_writer; nested ones are savepoints. */
function adapter(pg: PGlite): Db {
  let depth = 0;
  let sp = 0;
  const db: Db = {
    q: async (text, params = []) => (await pg.query(text, params)).rows as never,
    tx: async (fn) => {
      if (depth === 0 && !(await inTx(pg))) {
        depth++;
        await pg.exec('begin; set local role studio_writer;');
        try {
          const r = await fn(db);
          await pg.exec('commit;');
          return r;
        } catch (e) {
          await pg.exec('rollback;');
          throw e;
        } finally {
          depth--;
        }
      }
      const name = `s${++sp}`;
      depth++;
      await pg.exec(`savepoint ${name}`);
      try {
        const r = await fn(db);
        await pg.exec(`release savepoint ${name}`);
        return r;
      } catch (e) {
        await pg.exec(`rollback to savepoint ${name}`);
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return db;
}
let manualTx = false;
const inTx = async (_pg: PGlite) => manualTx;
/** Runs f and undoes everything it did (a variant that must not change the chain). */
async function undo<T>(pg: PGlite, f: () => Promise<T>): Promise<T> {
  await pg.exec('begin;');
  manualTx = true;
  try {
    return await f();
  } finally {
    manualTx = false;
    await pg.exec('rollback;');
  }
}

// Noon Pacific (PST, UTC-8) on a date.
const noon = (d: string) => new Date(`${d}T20:00:00Z`);
const why = (r: Result<object>) => (r.ok ? 'ok' : r.why);
const tryWhy = async (f: () => Promise<Result<object>>) => {
  try {
    return why(await f());
  } catch (e) {
    return `db-error: ${(e as Error).message}`;
  }
};

// Made-up sign-ins: Farcaster A 700001 and D 700004; Lens B and C (social_accounts); Q's and R's mains 700020/700030;
// a wallet W of S's for the submit refusal.
type Ids = { A: number; B: number; C: number; D: number; Fq: number; Fr: number; W: number; fresh: number[] };
async function people(pg: PGlite): Promise<Ids> {
  const lens = async (sub: string, handle: string) =>
    -(1e9 + Number((await pg.query<{ id: number }>(`insert into studio.social_accounts (kind, subject, handle) values ('lens', $1, $2) returning id`, [sub, handle])).rows[0].id));
  const B = await lens('0x77000000000000000000000000000000000000b0', 'lens/madeup-b');
  const C = await lens('0x77000000000000000000000000000000000000c0', 'lens/madeup-c');
  const W = -Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ('0x7700000000000000000000000000000000000001') returning id`)).rows[0].id);
  const fresh = [];
  for (let i = 0; i < 4; i++) fresh.push(-Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ($1) returning id`, [`0x77000000000000000000000000000000000001${i}0`])).rows[0].id));
  return { A: 700001, B, C, D: 700004, Fq: 700020, Fr: 700030, W, fresh };
}

/** Old-style rows a sign-in makes (the code leaves person_id null; the trigger stamps it): a remix, a work, a payment. */
let n = 0;
async function makeWork(pg: PGlite, who: number, at: Date, usd = 0) {
  n++;
  await pg.query(`insert into studio.remix_asks (person, at) values ($1, $2)`, [who, at.toISOString()]);
  const el = (await pg.query<{ id: string }>(`insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'text', $1) returning id`, [who])).rows[0].id;
  const ver = (await pg.query<{ id: string }>(`insert into studio.element_versions (element_id, version_no, body) values ($1, 1, '{}') returning id`, [el])).rows[0].id;
  if (usd > 0) {
    const intent = (await pg.query<{ id: string }>(`insert into studio.person_pay_intents (person, address) values ($1, '0x7700000000000000000000000000000000000fff') returning id`, [who])).rows[0].id;
    await pg.query(`insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number) values ($1, $2, $3, 8453, 'USDC', $4, $5, 1)`, [
      `0x${n.toString(16).padStart(64, '0')}`, intent, who, usd * 1e6, usd,
    ]);
  }
  return { element: el, version: ver };
}
async function submit(pg: PGlite, who: number, version: string, at: Date) {
  await pg.query(`insert into studio.challenge_marks (challenge, fid, character, version_id, marked_at) values ('remix-2026-11', $1, 'zei', $2, $3)`, [who, version, at.toISOString()]);
}

// --- T0: the switch off --------------------------------------------------------------------------------------------
{
  const pg = await fresh();
  const db = adapter(pg);
  const ids = await people(pg);
  const snap = async () =>
    JSON.stringify([
      (await pg.query(`select * from studio.people order by id`)).rows,
      (await pg.query(`select * from studio.person_accounts order by id`)).rows,
      (await pg.query(`select * from studio.person_mains order by id`)).rows,
      (await pg.query(`select * from studio.main_requests order by id`)).rows,
      (await pg.query(`select * from studio.prize_claims order by id`)).rows,
      (await pg.query(`select * from studio.person_joins`)).rows,
    ]);
  const s0 = await snap();
  check('T0: the switch is off as shipped (LINKED_ACCOUNTS.enabled)', LINKED_ACCOUNTS.enabled === false);
  const t = noon('2026-11-06');
  const answers = [
    await v2.signIn(db, ids.A, t),
    await v2.link(db, { actor: ids.A, add: ids.B, now: t }),
    await v2.unlink(db, { actor: ids.A, target: ids.A, now: t }),
    await v2.chooseMain(db, { actor: ids.A, to: ids.A, now: t }),
    await v2.requestMain(db, { actor: ids.A, now: t }),
    await v2.cancelRequest(db, { actor: ids.A, now: t }),
    await v2.claimPrize(db, { actor: ids.A, challenge: 'remix-2026-11', versionId: '7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', payout: '0x7700000000000000000000000000000000000aaa', now: t }),
    await v2.join(db, { actor: ids.A, other: ids.Fq, now: t }),
    await v2.ownerFor(db, ids.A),
    await v2.submitter(db, ids.A),
  ];
  check('T0: with the switch off, every v2 action answers "off"', answers.every((r) => !r.ok && r.why === 'off'), answers.map(why).join());
  check('T0: …and changes nothing', (await snap()) === s0);
  // Today's code path: an old-style insert still goes in and is stamped only when the sign-in has an account (none).
  await makeWork(pg, ids.A, t);
  check('T0: an old-style insert still goes in, unstamped while the sign-in has no Snowmoon account', (await pg.query<{ p: unknown }>(`select person_id as p from studio.remix_asks where person = $1`, [ids.A])).rows[0]?.p === null);
  await pg.close();
}

// --- T1 and T2: the chain, and takeover through a non-main at every step --------------------------------------------
const pg = await fresh();
const db = adapter(pg);
const I = await people(pg);
const D = (s: string) => noon(s);

// Another Snowmoon account Q (main Fq) and R (main Fr), for joins.
check('setup: Q and R start', (await v2.signIn(db, I.Fq, D('2026-11-01'), ON)).ok && (await v2.signIn(db, I.Fr, D('2026-11-01'), ON)).ok);
const Q = (await v2.accountOf(db, I.Fq))!;

/** T2 at one date: every non-main is refused each main-only action; its allowed actions are allowed (and undone). */
async function takeover(date: Date, main: number, nonMains: number[], gone: number[]) {
  for (const x of [...nonMains, ...gone]) {
    const expect = gone.includes(x) ? 'not-linked' : 'not-main';
    const label = `T2 ${date.toISOString().slice(0, 10)}: ${x === I.A ? 'A' : x === I.B ? 'B' : x === I.C ? 'C' : x === I.D ? 'D' : x}`;
    const fresh = I.fresh[0];
    const tries: [string, () => Promise<Result<object>>][] = [
      ['link a new sign-in', () => v2.link(db, { actor: x, add: fresh, now: date }, ON)],
      ['unlink another sign-in', () => v2.unlink(db, { actor: x, target: main, now: date }, ON)],
      ['choose itself as main', () => v2.chooseMain(db, { actor: x, to: x, now: date }, ON)],
      ['choose another as main', () => v2.chooseMain(db, { actor: x, to: main, now: date }, ON)],
      ['claim a prize', () => v2.claimPrize(db, { actor: x, challenge: 'remix-2026-11', versionId: '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', payout: '0x7700000000000000000000000000000000000bbb', now: date }, ON)],
      ['change a payout address', () => v2.setPayout(db, { actor: x, challenge: 'remix-2026-11', versionId: '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', payout: '0x7700000000000000000000000000000000000ccc', now: date }, ON)],
      ['join S to another account, with that account\'s main', () => v2.join(db, { actor: x, other: I.Fq, now: date }, ON)],
    ];
    for (const [what, f] of tries) {
      const got = await undo(pg, () => tryWhy(f));
      check(`${label} (${gone.includes(x) ? 'left S' : 'not main'}) tries to ${what}: refused`, got === expect, got);
    }
    if (gone.includes(x)) continue;
    const S = await v2.accountOf(db, main);
    // The database refuses it too: a claim by a non-main, inserted directly as studio_writer.
    const direct = await undo(pg, async () => {
      await pg.exec('set local role studio_writer;');
      return pg
        .query(`insert into studio.prize_claims (challenge, version_id, person_id, claimed_via, payout_address) values ('remix-2026-11', '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', $1, $2, '0x7700000000000000000000000000000000000bbb')`, [S, x])
        .then(() => 'went in', (e: Error) => e.message);
    });
    check(`${label}: the database refuses its prize claim too`, /only the main sign-in/.test(direct), direct);
    const own = await v2.ownerFor(db, x, ON);
    check(`${label}: may make and spend (its rows are stamped with S)`, own.ok && own.person === S);
    const sub = await v2.submitter(db, x, ON);
    const social = v2.isSocial(await v2.kindOf(db, x));
    check(`${label}: ${social ? 'may submit (a social sign-in)' : 'may not submit (a wallet)'}`, social ? sub.ok : !sub.ok && sub.why === 'social-only', why(sub));
    const self = await undo(pg, async () => {
      const before = await v2.ownedCount(db, 'remix_asks', S!);
      const r = await v2.unlink(db, { actor: x, target: x, now: date }, ON);
      return `${why(r)}/${(await v2.ownedCount(db, 'remix_asks', S!)) === before}/${await v2.accountOf(db, x)}`;
    });
    check(`${label}: may unlink itself, taking nothing`, self === 'ok/true/null', self);
  }
}

// 6 Nov: A signs in, making S; pays $2.00; remixes and submits.
check('T1 6 Nov: A signs in, making S', (await v2.signIn(db, I.A, D('2026-11-06'), ON)).ok);
const S = (await v2.accountOf(db, I.A))!;
check('T1 6 Nov: A is main of S', (await v2.mainOf(db, S, D('2026-11-06'))) === I.A);
const workA = await makeWork(pg, I.A, D('2026-11-06'), 2);
await submit(pg, I.A, workA.version, D('2026-11-06'));
// A release-window fixture: made by B's sign-in before v2, recorded under A's FID.
await makeWork(pg, I.A, D('2026-11-06'));
// 7 Nov: A (main) links Lens B; B pays $1.00, remixes and submits.
check('T1 7 Nov: A (main) links Lens B', why(await v2.link(db, { actor: I.A, add: I.B, now: D('2026-11-07') }, ON)) === 'ok');
const workB = await makeWork(pg, I.B, D('2026-11-07'), 1);
const sb = await v2.submitter(db, I.B, ON);
check('T1 7 Nov: B submits; the record names B', sb.ok && sb.recordAccount === I.B);
await submit(pg, I.B, workB.version, D('2026-11-07'));
// A wallet sign-in of S can't submit (T5's refusal).
check('T1 7 Nov: A links wallet W', why(await v2.link(db, { actor: I.A, add: I.W, now: D('2026-11-07') }, ON)) === 'ok');
await takeover(D('2026-11-07'), I.A, [I.B, I.W], []);
// 11 Dec: A (main) unlinks B.
check('T1 11 Dec: A (main) unlinks B', why(await v2.unlink(db, { actor: I.A, target: I.B, now: D('2026-12-11') }, ON)) === 'ok');
check('T1 11 Dec: A (main) unlinks W', why(await v2.unlink(db, { actor: I.A, target: I.W, now: D('2026-12-11') }, ON)) === 'ok');
// 12 Dec: A (main) links Lens C.
check('T1 12 Dec: A (main) links Lens C (A6: B has gone)', why(await v2.link(db, { actor: I.A, add: I.C, now: D('2026-12-12') }, ON)) === 'ok');
await takeover(D('2026-12-12'), I.A, [I.C], [I.B]);
// 13 Dec: A chooses C as main, then C (main) unlinks A.
check('T1 13 Dec: A chooses C as main', why(await v2.chooseMain(db, { actor: I.A, to: I.C, now: D('2026-12-13') }, ON)) === 'ok');
check('T1 13 Dec: C (main) unlinks A', why(await v2.unlink(db, { actor: I.C, target: I.A, now: D('2026-12-13') }, ON)) === 'ok');
// 14 Dec: C (main) links Farcaster D.
check('T1 14 Dec: C (main) links Farcaster D (A6: A has gone)', why(await v2.link(db, { actor: I.C, add: I.D, now: D('2026-12-14') }, ON)) === 'ok');
await takeover(D('2026-12-14'), I.C, [I.D], [I.A, I.B]);

/** The state after 14 Dec, as the owner wrote it; returns what's wrong (empty: right). */
async function afterChain(passes: (n: number) => boolean, passImpl = v2.accountPasses): Promise<string[]> {
  const bad: string[] = [];
  const signIns = (await v2.signInsOf(db, S)).map((s) => s.account).sort();
  if (JSON.stringify(signIns) !== JSON.stringify([I.C, I.D].sort())) bad.push(`S = ${signIns}`);
  if ((await v2.mainOf(db, S, D('2026-12-15'))) !== I.C) bad.push('C is not main');
  if ((await v2.ownedCount(db, 'remix_asks', S)) !== 3) bad.push(`S owns ${await v2.ownedCount(db, 'remix_asks', S)} remixes, not 3`);
  if ((await v2.ownedCount(db, 'challenge_marks', S)) !== 2) bad.push('S does not own both entries');
  const [els] = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.row_owners where tbl = 'elements' and studio.owner_of(person_id) = $1`, [S])).rows;
  if (els.n !== 3) bad.push(`S owns ${els.n} works, not 3`);
  const [bal] = (await pg.query<{ usd: string }>(`select coalesce(sum(usd), 0)::text as usd from studio.person_payments where studio.owner_of(person_id) = $1`, [S])).rows;
  if (Number(bal.usd) !== 3) bad.push(`S's payments are $${bal.usd}, not $3.00`);
  for (const [x, name] of [[I.A, 'A'], [I.B, 'B']] as const) {
    if ((await v2.accountOf(db, x)) !== null) bad.push(`${name} is still in a Snowmoon account`);
    const [o] = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.remix_asks where person = $1 and studio.owner_of(person_id) <> $2`, [x, S])).rows;
    if (o.n > 0) bad.push(`${name}'s work left S`);
    const [p] = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.person_payments where person = $1 and studio.owner_of(person_id) <> $2`, [x, S])).rows;
    if (p.n > 0) bad.push(`${name}'s payment left S`);
  }
  const record = (await pg.query<{ fid: number }>(`select fid::bigint as fid from studio.challenge_marks where challenge = 'remix-2026-11' order by marked_at`)).rows.map((r) => Number(r.fid));
  if (JSON.stringify(record) !== JSON.stringify([I.A, I.B])) bad.push(`the record names ${record}, not A's FID and B's Lens number`);
  const [name] = (await pg.query<{ account: number }>(`select account::bigint as account from studio.person_names where person_id = $1 order by at desc, id desc limit 1`, [S])).rows;
  if (![I.C, I.D].includes(Number(name.account))) bad.push(`the byline still shows ${name.account}`);
  if (await passImpl(db, S, (x) => passes(x))) bad.push('S passes on A\'s or B\'s check');
  return bad;
}
const passAB = (x: number) => x === I.A || x === I.B;
const t1 = await afterChain(passAB);
check('T1 after 14 Dec: S = {C (main), D} owns all A\'s and B\'s work, both entries and $3.00; A and B own nothing; the record names A\'s FID and B\'s Lens number; S passes only on C\'s or D\'s own checks', t1.length === 0, t1.join('; '));
check('T1: S passes once C has its own pass', await v2.accountPasses(db, S, (x) => x === I.C));
check('T1: A can\'t start a Snowmoon account until 12 Jan (A2)', await undo(pg, async () => {
  const r = await v2.signIn(db, I.A, D('2027-01-11'), ON);
  return !r.ok && r.why === 'wait-start' && r.until?.toISOString() === D('2027-01-12').toISOString();
}));
check('T1: B can\'t start one until 10 Jan (A2)', await undo(pg, async () => {
  const r = await v2.signIn(db, I.B, D('2027-01-09'), ON);
  return !r.ok && r.why === 'wait-start' && r.until?.toISOString() === D('2027-01-10').toISOString();
}));

// Planted faults that must fail T1.
async function plantT1(label: string, sqlText: string | null, passImpl?: typeof v2.accountPasses) {
  const bad = await undo(pg, async () => {
    if (sqlText) await pg.exec(sqlText);
    return afterChain(passAB, passImpl);
  });
  check(`T1 planted: ${label} — fails the test`, bad.length > 0, bad.join('; ') || 'not caught');
}
await plantT1('A\'s work leaves with A (restamped to an account of its own)', `insert into studio.people (id, public_id) overriding system value values (999001, 'zzzzzzzz'); update studio.remix_asks set person_id = 999001 where person = ${I.A};`);
await plantT1('B\'s balance leaves with B', `insert into studio.people (id, public_id) overriding system value values (999002, 'zzzzzzzy'); update studio.person_payments set person_id = 999002 where person = ${I.B};`);
await plantT1('B\'s entry leaves with B', `insert into studio.people (id, public_id) overriding system value values (999003, 'zzzzzzzx'); update studio.challenge_marks set person_id = 999003 where fid = ${I.B};`);
await plantT1('a byline still showing A\'s name after A left', `alter table studio.person_names disable trigger person_names_member; insert into studio.person_names (person_id, account, at) values (${S}, ${I.A}, '2026-12-15T00:00:00Z');`);
await plantT1('S passing on A\'s check (the pass read from ended sign-ins too)', null, async (d, p, passes) => {
  const rows = await d.q<{ account: string }>(`select account from studio.person_accounts where person_id = $1`, [p]);
  return rows.some((r) => passes(Number(r.account), 'farcaster'));
});
await plantT1('the record rewritten to S\'s current main', `update studio.challenge_marks set fid = ${I.D} where fid = ${I.A};`);

// Planted faults that must fail T2: a module whose main check is gone lets a non-main through.
{
  const got = await undo(pg, async () => {
    await pg.exec(`create or replace function studio.main_of(p bigint) returns bigint language sql stable as $fn$ select ${I.D}::bigint $fn$;`);
    return tryWhy(() => v2.chooseMain(db, { actor: I.D, to: I.D, now: D('2026-12-15') }, ON));
  });
  check('T2 planted: the main check answers any sign-in as main — a non-main gets through, so T2 fails', got === 'ok', got);
  const got2 = await undo(pg, async () => {
    await pg.exec(`drop trigger prize_claims_check on studio.prize_claims; set local role studio_writer;`);
    return pg.query(`insert into studio.prize_claims (challenge, version_id, person_id, claimed_via, payout_address) values ('remix-2026-11', '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', $1, $2, '0x7700000000000000000000000000000000000bbb')`, [S, I.D]).then(() => 'went in', (e: Error) => e.message);
  });
  check('T2 planted: the claim trigger dropped — a non-main\'s claim goes in, so T2\'s database check fails', got2 === 'went in', got2);
}

// --- T7: the 30 days and A5 -----------------------------------------------------------------------------------------
check('T7 12 Dec: B, unlinked on 11 Dec, signing in alone to start an account: refused until 10 Jan noon', await undo(pg, async () => {
  const r = await v2.signIn(db, I.B, D('2026-12-12'), ON);
  return !r.ok && r.why === 'wait-start' && r.until?.toISOString() === D('2027-01-10').toISOString();
}));
check('T7 10 Jan 11:59: still refused', await undo(pg, async () => why(await v2.signIn(db, I.B, new Date(D('2027-01-10').getTime() - 60_000), ON)) === 'wait-start'));
check('T7 10 Jan noon: B may start one', await undo(pg, async () => why(await v2.signIn(db, I.B, D('2027-01-10'), ON)) === 'ok'));
check('T7 20 Dec: Q joins B (link by Q\'s main): refused (A2)', why(await v2.link(db, { actor: I.Fq, add: I.B, now: D('2026-12-20') }, ON)) === 'wait-join');
check('T7 20 Dec: the database refuses it too', await undo(pg, async () => {
  await pg.exec('set local role studio_writer;');
  return pg.query(`insert into studio.person_accounts (person_id, kind, account, how, linked_at) values ($1, 'lens', $2, 'signed', $3)`, [Q, I.B, D('2026-12-20').toISOString()]).then(() => false, (e: Error) => /30 days/.test(e.message));
}));
check('T7 20 Dec: B rejoins S: no wait and not a move, but refused (A6: C is there)', why(await v2.link(db, { actor: I.C, add: I.B, now: D('2026-12-20') }, ON)) === 'kind-taken');
check('T7 20 Dec, variant without C: B rejoins S at once', await undo(pg, async () => {
  const a = await v2.chooseMain(db, { actor: I.C, to: I.D, now: D('2026-12-20') }, ON);
  const b = await v2.unlink(db, { actor: I.D, target: I.C, now: D('2026-12-20') }, ON);
  const c = await v2.link(db, { actor: I.D, add: I.B, now: D('2026-12-20') }, ON);
  return `${why(a)}${why(b)}${why(c)}` === 'okokok';
}));
check('T7 11 Jan: Q joins B: allowed (move 2)', why(await v2.link(db, { actor: I.Fq, add: I.B, now: D('2027-01-11') }, ON)) === 'ok');
check('T7 1 Feb: B leaves Q (self-unlink)', why(await v2.unlink(db, { actor: I.B, target: I.B, now: D('2027-02-01') }, ON)) === 'ok');
{
  const r = await v2.link(db, { actor: I.Fr, add: I.B, now: D('2027-03-05') }, ON);
  check('T7 5 Mar: R joins B: refused (A5: a third move), until 7 Nov 2027', !r.ok && r.why === 'moves' && r.until?.toISOString().slice(0, 10) === '2027-11-07', `${why(r)} ${!r.ok ? r.until?.toISOString() : ''}`);
}
check('T7 8 Nov 2027: R joins B: allowed', why(await v2.link(db, { actor: I.Fr, add: I.B, now: D('2027-11-08') }, ON)) === 'ok');
// Planted: a shorter wait, more moves; each must fail T7.
{
  const short = await undo(pg, async () => tryWhy(() => v2.link(db, { actor: I.Fq, add: I.A, now: D('2026-12-20') }, { ...ON, relinkWaitDays: 3 })));
  check('T7 planted: a 3-day wait in the code — the module lets A join Q within 30 days (only the database stops it), so T7 fails', short !== 'wait-join', short);
  const moves = await undo(pg, async () => {
    const a = await v2.unlink(db, { actor: I.B, target: I.B, now: D('2027-11-09') }, ON);
    return `${why(a)}/${await tryWhy(() => v2.link(db, { actor: I.Fq, add: I.B, now: D('2027-12-20') }, { ...ON, maxMoves: 9 }))}`;
  });
  check('T7 planted: 9 moves a year — a move A5 refuses is allowed, so T7 fails', moves === 'ok/ok', moves);
}

// --- T10: self-unlink ------------------------------------------------------------------------------------------------
{
  const before = await v2.ownedCount(db, 'remix_asks', S);
  check('T10 15 Dec: D (not main) unlinks itself: allowed, takes nothing', await undo(pg, async () => why(await v2.unlink(db, { actor: I.D, target: I.D, now: D('2026-12-15') }, ON)) === 'ok' && (await v2.ownedCount(db, 'remix_asks', S)) === before));
  const r = await undo(pg, async () => {
    const a = await v2.unlink(db, { actor: I.C, target: I.C, now: D('2026-12-15'), nextMain: I.D }, ON);
    return `${why(a)}/${await v2.mainOf(db, S, D('2026-12-15'))}`;
  });
  check('T10 15 Dec: the main (C) unlinks itself after naming D the next main', r === `ok/${I.D}`, r);
  const only = await undo(pg, async () => {
    const out: string[] = [];
    out.push(why(await v2.unlink(db, { actor: I.C, target: I.C, now: D('2026-12-15') }, ON)));
    out.push(why(await v2.unlink(db, { actor: I.D, target: I.D, now: D('2026-12-16') }, ON)));
    out.push(String((await v2.signInsOf(db, S)).length));
    out.push(String((await v2.ownedCount(db, 'remix_asks', S)) === before));
    const started = await pg.exec('savepoint x; set local role studio_writer;').then(() =>
      pg.query(`with p as (insert into studio.people default values returning id) insert into studio.person_accounts (person_id, kind, account, how, linked_at) select id, 'farcaster', $1, 'first', $2 from p`, [I.D, D('2026-12-20').toISOString()]).then(() => 'went in', () => 'refused'),
    );
    await pg.exec('rollback to savepoint x;');
    out.push(started);
    out.push(why(await v2.signIn(db, I.D, D('2026-12-17'), ON)));
    out.push(String((await v2.accountOf(db, I.D)) === S));
    return out.join('/');
  });
  check('T10: the only sign-in unlinks itself; the work stays; it can\'t start a new account for 30 days; signing in with it rejoins its own at once', only === 'ok/ok/0/true/refused/ok/true', only);
}

await pg.close();

// --- T3: recovering the main sign-in (a fresh chain: S = {A (main), B} from 7 Nov) ---------------------------------
{
  const pg3 = await fresh();
  const d3 = adapter(pg3);
  const J = await people(pg3);
  await v2.signIn(d3, J.A, D('2026-11-06'), ON);
  await v2.link(d3, { actor: J.A, add: J.B, now: D('2026-11-07') }, ON);
  const S3 = (await v2.accountOf(d3, J.A))!;
  const r1 = await v2.requestMain(d3, { actor: J.B, now: D('2026-11-08') }, ON);
  check('T3 8 Nov: B asks to become main, effective 8 Dec', r1.ok && r1.effective.toISOString() === D('2026-12-08').toISOString());
  const banner = await v2.pendingRequest(d3, S3, D('2026-11-08'));
  check('T3 8 Nov: the banner shows for every sign-in of S (A and B read the same pending request)', banner?.requestedBy === J.B && (await v2.accountOf(d3, J.A)) === (await v2.accountOf(d3, J.B)));
  const v2src = readFileSync(path.join(ROOT, 'src/lib/linked/v2.ts'), 'utf8');
  check('T3: no notification is built or sent (no network call in the module; no token table)', !/\bfetch\(|https?:\/\//.test(v2src.replace(/^\s*\*.*$/gm, '')) && (await pg3.query(`select to_regclass('studio.miniapp_tokens') as t`)).rows[0] && (await pg3.query<{ t: unknown }>(`select to_regclass('studio.miniapp_tokens') as t`)).rows[0].t === null);
  check('T3: a second request while one is pending: refused', why(await v2.requestMain(d3, { actor: J.B, now: D('2026-11-08') }, ON)) === 'pending');
  /** The variant: not cancelled. */
  const notCancelled = async () => {
    const out: string[] = [];
    out.push(why(await v2.unlink(d3, { actor: J.B, target: J.A, now: D('2026-12-07') }, ON)));
    out.push(why(await v2.claimPrize(d3, { actor: J.B, challenge: 'remix-2026-11', versionId: '7ccccccc-cccc-4ccc-8ccc-cccccccccccc', payout: '0x7700000000000000000000000000000000000ddd', now: D('2026-12-07') }, ON)));
    out.push(String((await v2.mainOf(d3, S3, new Date(D('2026-12-08').getTime() - 60_000))) === J.A));
    out.push(String((await v2.mainOf(d3, S3, D('2026-12-08'))) === J.B));
    out.push(why(await v2.claimPrize(d3, { actor: J.B, challenge: 'remix-2026-11', versionId: '7ccccccc-cccc-4ccc-8ccc-cccccccccccc', payout: '0x7700000000000000000000000000000000000ddd', now: D('2026-12-08') }, ON)));
    return out.join('/');
  };
  const nc = await undo(pg3, notCancelled);
  check('T3 variant, not cancelled: on 7 Dec B still can\'t unlink A or claim; A is main until 8 Dec noon; from 8 Dec noon B is main and may claim', nc === 'not-main/not-main/true/true/ok', nc);
  const un = await undo(pg3, async () => {
    const a = await v2.unlink(d3, { actor: J.A, target: J.B, now: D('2026-11-20') }, ON);
    const [r] = (await pg3.query<{ how: string }>(`select ended_how as how from studio.main_requests where person_id = $1`, [S3])).rows;
    return `${why(a)}/${r?.how}`;
  });
  check('T3 variant: A unlinks B on 20 Nov — the request ends', un === 'ok/unlinked', un);
  check('T3 9 Nov: B tries to cancel its own request: refused (only the main)', why(await v2.cancelRequest(d3, { actor: J.B, now: D('2026-11-09') }, ON)) === 'only-main-cancels');
  check('T3 9 Nov: A cancels it', why(await v2.cancelRequest(d3, { actor: J.A, now: D('2026-11-09') }, ON)) === 'ok');
  check('T3: B stays non-main after 8 Dec', (await v2.mainOf(d3, S3, D('2026-12-09'))) === J.A);
  const ev = (await pg3.query<{ how: string; by: number }>(`select ended_how as how, ended_by::bigint as by from studio.main_requests where person_id = $1`, [S3])).rows;
  check('T3: the events keep the request and its cancellation (by A)', ev.length === 1 && ev[0].how === 'cancelled' && Number(ev[0].by) === J.A);
  // Planted: a pending request treated as effective before day 30 must fail the test.
  const early = await undo(pg3, async () => {
    await v2.requestMain(d3, { actor: J.B, now: D('2026-11-10') }, ON);
    await pg3.exec(`alter table studio.main_requests drop constraint main_requests_thirty_days; update studio.main_requests set effective_at = '${D('2026-11-20').toISOString()}' where ended_at is null;`);
    return (await v2.mainOf(d3, S3, D('2026-12-07'))) === J.A;
  });
  check('T3 planted: a request effective before day 30 — B is main on 7 Dec, so the test fails', early === false);
  await pg3.close();
}

for (const l of log) console.log(l);
console.log(`\ntest:linked-accounts-v2: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const x of failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
