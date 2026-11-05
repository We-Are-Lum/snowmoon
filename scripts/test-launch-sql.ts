/**
 * The launch release's migrations (docs/launch/release-2026-11-06.md), tested on an in-memory Postgres (PGlite). Never a
 * production database. Adapted from branch sql-pack's scripts/test-sql-pack.ts (2026-11-04/05), for the launch of
 * 2026-11-06:
 *
 *   node_modules/.bin/tsx scripts/test-launch-sql.ts
 *
 * The base is main's migrations as they are on this branch, 0001..0036 (0034_check_decisions, 0035_signin_lens_bluesky
 * and 0036_social_bluesky_check are applied on production). The SQL pack's items 1, 2 and 5 are those three, so they are
 * checked as records: their B blocks (read from origin/sql-pack's doc) are main's files word for word, their read-backs
 * (C, D) hold on the base, and their planted faults are still caught.
 *
 * The pending ones are read from the release doc, so what is tested is what the owner pastes, in apply order: 3
 * (NEXT_remix_count → 0037), 4 (NEXT_challenge_daily → 0038), 6 (NEXT_social_lens_challenge → 0039). For each:
 * - its blocks have the promised shape (A is B ending in rollback; C is one select; D is one do block, with no
 *   `set role` and no temporary table, raising "READ-BACK FAILED");
 * - B is the launch branch's file word for word (origin/challenge-moments), and contest's (origin/contest);
 * - A leaves nothing; B applies; C (in a read-only transaction) is all true; D passes and leaves every row as it was;
 * - B twice is safe;
 * - planted faults, each in a rolled-back transaction, are caught by C or D.
 * Then the conflicts: re-running 0033 after 0038, re-running 0036 after 0039, re-running 0034, and every C and D at the
 * end. Then the whole run is repeated with one planted fault in a pasted block, which must make the test fail.
 *
 * PGlite runs as a superuser, unlike Supabase's postgres role: the blocks use nothing a superuser alone may do.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/launch/release-2026-11-06.md');
const LAUNCH_BRANCH = process.env.LAUNCH_BRANCH ?? 'challenge-moments';
const ALSO_BRANCHES = ['contest'];

const gitShow = (ref: string, file: string) => {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

const K_ALL = ['1', '2', '5', '3', '4', '6'] as const;
type K = (typeof K_ALL)[number];
const APPLIED: K[] = ['1', '2', '5'];
const APPLY_ORDER: K[] = ['3', '4', '6'];
const SOURCE: Record<K, { files: { ref: string; file: string }[]; name: string; twiceSafe: boolean; from?: string }> = {
  '1': { files: [{ ref: 'HEAD', file: 'supabase/migrations/0034_check_decisions.sql' }], name: '0034_check_decisions', twiceSafe: true },
  '2': { files: [{ ref: 'HEAD', file: 'supabase/migrations/0035_signin_lens_bluesky.sql' }], name: '0035_signin_lens_bluesky', twiceSafe: false, from: '-- B. THE MIGRATION' },
  '5': { files: [{ ref: 'HEAD', file: 'supabase/migrations/0036_social_bluesky_check.sql' }], name: '0036_social_bluesky_check', twiceSafe: true, from: '-- B. THE MIGRATION' },
  '3': { files: [LAUNCH_BRANCH, ...ALSO_BRANCHES].map((b) => ({ ref: `origin/${b}`, file: 'supabase/migrations/NEXT_remix_count.sql' })), name: 'NEXT_remix_count (0037 at merge)', twiceSafe: true },
  '4': { files: [LAUNCH_BRANCH, ...ALSO_BRANCHES].map((b) => ({ ref: `origin/${b}`, file: 'supabase/migrations/NEXT_challenge_daily.sql' })), name: 'NEXT_challenge_daily (0038 at merge)', twiceSafe: true, from: '-- 2. The migration.' },
  '6': { files: [LAUNCH_BRANCH, ...ALSO_BRANCHES].map((b) => ({ ref: `origin/${b}`, file: 'supabase/migrations/NEXT_social_lens_challenge.sql' })), name: 'NEXT_social_lens_challenge (0039 at merge)', twiceSafe: true, from: '-- B. THE MIGRATION' },
};

const stripComments = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const body = (s: string, end: 'commit;' | 'rollback;') => {
  const t = stripComments(s);
  return t.startsWith('begin;') && t.endsWith(end) ? t.slice('begin;'.length, -end.length).trim() : null;
};
const readBlocks = (text: string, keys: string[]) => {
  const m = new Map<string, string>();
  for (const x of text.matchAll(/^### (\d[A-D])\. [^\n]*\n[\s\S]*?```sql\n([\s\S]*?)\n```/gm)) if (keys.includes(x[1][0])) m.set(x[1], x[2]);
  return m;
};

const PLANTS: Record<K, [string, string][]> = {
  '1': [
    ['missing grant: studio_writer loses delete on check_decisions', `revoke delete on studio.check_decisions from studio_writer;`],
    ['missing policy: writer_update dropped', `drop policy writer_update on studio.check_decisions;`],
    ['constraint dropped: the account-shape check', `alter table studio.check_decisions drop constraint check_decisions_account_shape;`],
    ['a kept score left behind', `insert into studio.image_scores (fid, score) values (6852, 0.8);`],
  ],
  '2': [
    ['constraint dropped: the one-active-link index', `drop index studio.social_links_one_active;`],
    ['missing policy: writer_unlink dropped', `drop policy writer_unlink on studio.social_links;`],
  ],
  '5': [
    ['constraint dropped: account must match the number', `alter table studio.challenge_eligibility drop constraint challenge_eligibility_account_matches;`],
    ['challenge_marks takes a wallet\'s number', `alter table studio.challenge_marks drop constraint challenge_marks_fid_check; alter table studio.challenge_marks add constraint challenge_marks_fid_check check (fid <> 0);`],
  ],
  '3': [
    ['constraint dropped: units may be anything', `alter table studio.sheet_remix_asks drop constraint sheet_remix_asks_units_check;`],
    ['missing grant: studio_writer loses insert', `revoke insert on studio.sheet_remix_asks from studio_writer;`],
    ['extra grant: studio_writer may delete', `grant delete on studio.sheet_remix_asks to studio_writer;`],
    ['wrong column type: units as integer', `alter table studio.sheet_remix_asks alter column units type integer;`],
    ['missing policy: writer_insert dropped', `drop policy writer_insert on studio.sheet_remix_asks;`],
    ['fid check takes a wallet\'s number', `alter table studio.sheet_remix_asks drop constraint sheet_remix_asks_fid_check; alter table studio.sheet_remix_asks add constraint sheet_remix_asks_fid_check check (fid <> 0);`],
    ['fid check not widened (FIDs only): a Bluesky account refused', `alter table studio.sheet_remix_asks drop constraint sheet_remix_asks_fid_check; alter table studio.sheet_remix_asks add constraint sheet_remix_asks_fid_check check (fid > 0);`],
    ['fid check dropped', `alter table studio.sheet_remix_asks drop constraint sheet_remix_asks_fid_check;`],
    ['public access: anon may read', `grant select on studio.sheet_remix_asks to anon;`],
  ],
  '4': [
    ['missing policy: writer_withdraw dropped', `drop policy writer_withdraw on studio.challenge_marks;`],
    ['missing grant: 0033 re-run, which takes the column grant', stripComments(readFileSync(path.join(ROOT, 'supabase/migrations/0033_remix_challenge.sql'), 'utf8')).replace(/^begin;/, '').replace(/commit;$/, '')],
    ['extra grant: delete', `grant delete on studio.challenge_marks to studio_writer;`],
    ['extra grant: update of the whole row', `grant update on studio.challenge_marks to studio_writer;`],
    ['constraint dropped: withdrawn before submitted', `alter table studio.challenge_marks drop constraint challenge_marks_withdrawn_after_marked;`],
    ['constraint dropped: the character check', `alter table studio.challenge_marks drop constraint challenge_marks_character_check;`],
    ['public access: anon may read the marks', `grant select on studio.challenge_marks to anon;`],
    ['the day index dropped', `drop index studio.challenge_marks_day;`],
  ],
  '6': [
    ['the old account check back (0036\'s, no lens)', `alter table studio.challenge_eligibility drop constraint challenge_eligibility_account_check; alter table studio.challenge_eligibility add constraint challenge_eligibility_account_check check (account in ('farcaster', 'bluesky'));`],
    ['account check dropped (anything accepted)', `alter table studio.challenge_eligibility drop constraint challenge_eligibility_account_check;`],
    ['account must match the number dropped', `alter table studio.challenge_eligibility drop constraint challenge_eligibility_account_matches;`],
    ['public access: anon may read challenge_eligibility', `grant select on studio.challenge_eligibility to anon;`],
  ],
};

/** One whole run. `fault` replaces text in one pasted block, to show the test fails on a planted fault in the doc. */
async function run(fault?: { block: string; from: string; to: string }) {
  const failures: string[] = [];
  let passed = 0;
  const log: string[] = [];
  const check = (label: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
    log.push(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  };

  // The blocks: 1, 2 and 5 from the SQL pack (origin/sql-pack; applied as 0034, 0035, 0036); 3, 4, 6 from the release doc.
  const pack = gitShow('origin/sql-pack', 'docs/legal/sql-pack-2026-11-04.md');
  if (pack === null) throw new Error('cannot read origin/sql-pack:docs/legal/sql-pack-2026-11-04.md (git fetch first)');
  const blocks = new Map([...readBlocks(pack, APPLIED), ...readBlocks(readFileSync(DOC, 'utf8'), APPLY_ORDER)]);
  if (fault) {
    const b = blocks.get(fault.block);
    if (!b || !b.includes(fault.from)) throw new Error(`fault: block ${fault.block} has no "${fault.from}"`);
    blocks.set(fault.block, b.replace(fault.from, fault.to));
  }
  const get = (id: string) => {
    const b = blocks.get(id);
    if (!b) throw new Error(`no block ${id}`);
    return b;
  };
  const want = [...APPLIED, ...APPLY_ORDER].flatMap((k) => ['A', 'B', 'C', 'D'].map((x) => k + x));
  check('the release doc has 3A–3D, 4A–4D, 6A–6D in order, and the pack has 1, 2, 5', [...blocks.keys()].sort().join() === [...want].sort().join(), [...blocks.keys()].join());
  const docOrder = [...readBlocks(readFileSync(DOC, 'utf8'), APPLY_ORDER).keys()].join();
  check('the release doc gives them in apply order (3, then 4, then 6)', docOrder === APPLY_ORDER.flatMap((k) => ['A', 'B', 'C', 'D'].map((x) => k + x)).join(), docOrder);

  const REAL = ['0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'did:plc:z72i7hdynmk6r22z27h6tvur', "bsky.app'", '6786', '193912', 'lens/stani'];
  for (const k of APPLY_ORDER) for (const x of ['C', 'D']) check(`${k}${x} uses only made-up accounts`, !REAL.some((r) => get(`${k}${x}`).includes(r)));

  // The base: main's migrations, 0001..0036.
  const dir = path.join(ROOT, 'supabase/migrations');
  const numbered = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  check('main has its numbered migrations up to 0036 (34 files) and nothing unnumbered', numbered.length === 34 && numbered.at(-1)!.startsWith('0036_') && !readdirSync(dir).some((f) => f.startsWith('NEXT_')), `${numbered.length} files, last ${numbered.at(-1)}`);
  // The next free numbers: nothing on origin/main past 0036.
  const onMain = execFileSync('git', ['ls-tree', '--name-only', 'origin/main', 'supabase/migrations/'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\/\d{4}_/.test(f)).sort();
  check('origin/main ends at 0036, so the pending ones take 0037, 0038, 0039', onMain.at(-1)?.includes('/0036_') === true, onMain.at(-1) ?? '');

  const pg = new PGlite();
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of numbered) await pg.exec(readFileSync(path.join(dir, f), 'utf8'));
  await pg.exec(`
    insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
    insert into studio.elements (id, work_id, element_type, created_by_fid) values ('71111111-1111-4111-8111-111111111111','snowmoon','text',2147483645);
    insert into studio.element_versions (element_id, version_no, body) values ('71111111-1111-4111-8111-111111111111', 1, '{}'), ('71111111-1111-4111-8111-111111111111', 2, '{}'), ('71111111-1111-4111-8111-111111111111', 3, '{}');
    insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible)
      select id, 'remix-2026-11', 2147483645, 'invited', true from studio.element_versions where version_no = 1;
    insert into studio.challenge_marks (challenge, fid, character, version_id)
      select 'remix-2026-11', 2147483645, 'bai', id from studio.element_versions where version_no = 1;`);

  async function snapshot(): Promise<string> {
    const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
    const parts = [
      await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'studio' order by 1, 2`),
      await q(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as d from pg_constraint where connamespace = 'studio'::regnamespace order by 1, 2`),
      await q(`select indexname, indexdef from pg_indexes where schemaname = 'studio' order by 1`),
      await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'studio' order by 1, 2`),
      await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'studio' order by 1, 2, 3`),
      await q(`select table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'studio' order by 1, 2, 3, 4`),
      await q(`select relname, relrowsecurity from pg_class where relnamespace = 'studio'::regnamespace and relkind = 'r' order by 1`),
    ];
    const tables = (await pg.query<{ t: string }>(`select tablename as t from pg_tables where schemaname = 'studio' order by 1`)).rows.map((r) => r.t);
    for (const t of tables) parts.push(`${t}:${await q(`select * from studio.${t} order by 1`)}`);
    return parts.join('\n');
  }
  const diff = (a: string, b: string) => {
    const x = a.split('\n');
    const y = b.split('\n');
    const i = x.findIndex((l, n) => l !== y[n]);
    return i < 0 ? '' : `first difference: ${(x[i] ?? '').slice(0, 200)} → ${(y[i] ?? '').slice(0, 200)}`;
  };
  type Row = { n?: number; what: string; ok: boolean | null };
  async function readBackA(k: K, readOnly = true): Promise<{ rows: Row[]; error?: string }> {
    try {
      if (readOnly) await pg.exec('begin read only;');
      return { rows: (await pg.query<Row>(get(`${k}C`))).rows };
    } catch (e) {
      return { rows: [], error: (e as Error).message };
    } finally {
      if (readOnly) await pg.exec('rollback;');
    }
  }
  async function readBackB(k: K): Promise<string | null> {
    try {
      await pg.exec(get(`${k}D`));
      return null;
    } catch (e) {
      await pg.exec('rollback;').catch(() => {});
      return (e as Error).message;
    }
  }
  const allTrue = (r: { rows: Row[]; error?: string }) => !r.error && r.rows.length > 0 && r.rows.every((x) => x.ok === true);
  const falseRows = (r: { rows: Row[]; error?: string }) => (r.error ? [`error: ${r.error}`] : r.rows.filter((x) => x.ok !== true).map((x) => `${x.n ?? ''} ${x.what}`.trim()));
  const caughtBy: string[] = [];
  async function plant(k: K, label: string, sql: string) {
    const before = await snapshot();
    await pg.exec('begin;');
    let a: string[] = [];
    let b: string | null = null;
    try {
      await pg.exec(sql);
      a = falseRows(await readBackA(k, false));
      await pg.exec('savepoint before_b;');
      try {
        await pg.exec(get(`${k}D`));
      } catch (e) {
        b = (e as Error).message;
      }
      await pg.exec('rollback to savepoint before_b;');
    } catch (e) {
      a = [`the plant itself failed: ${(e as Error).message}`];
    }
    await pg.exec('rollback;');
    const byB = b !== null && /READ-BACK FAILED/.test(b);
    const byA = a.length > 0 && !a[0].startsWith('the plant itself failed');
    const how = [byA ? `(a) false: ${a.join('; ')}` : '', byB ? `(b) ${b!.replace(/^.*?(READ-BACK FAILED)/s, '$1')}` : ''].filter(Boolean).join(' | ');
    check(`${k} planted: ${label} — caught`, byA || byB, a.join('; ') || b || 'neither read-back noticed');
    caughtBy.push(`| ${k} | ${label} | ${how || 'NOT CAUGHT'} |`);
    check(`${k} planted: ${label} — rolled back, nothing left`, (await snapshot()) === before);
  }

  const summary: string[] = [];
  for (const k of [...APPLIED, ...APPLY_ORDER]) {
    const src = SOURCE[k];
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((x) => get(k + x));
    check(`${k} A is B with rollback in place of commit`, body(A, 'rollback;') !== null && body(A, 'rollback;') === body(B, 'commit;'));
    const c = stripComments(C).replace(/'(?:[^']|'')*'/g, "''");
    check(`${k} C is one read-only select`, /^select\b/i.test(c) && c.endsWith(';') && c.slice(0, -1).split(';').length === 1 && !/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i.test(c));
    const d = stripComments(D);
    check(`${k} D is one do block: no set role, no temp table, raises READ-BACK FAILED`, /^do \$\$/.test(d) && d.endsWith('end $$;') && d.split('$$').length === 3 && !/set\s+role/i.test(d) && !/\btemp(orary)?\b/i.test(d) && /READ-BACK FAILED/.test(d) && /READ-BACK PASSED/.test(d));
    for (const { ref, file } of src.files) {
      const text = gitShow(ref, file);
      if (text === null) {
        check(`${k} B: ${ref}:${file} exists`, false);
        continue;
      }
      const from = src.from ? text.slice(text.indexOf(src.from)) : text;
      const m = /^begin;$[\s\S]*?^commit;$/m.exec(from);
      check(`${k} B is ${ref}'s ${file.split('/').pop()}, word for word`, (m ? m[0] : '').trim() === B.trim());
    }

    if (APPLIED.includes(k)) {
      const a = await readBackA(k);
      check(`${k} (applied as ${src.name}) C is all true on the base (${a.rows.length} rows), read only`, allTrue(a), falseRows(a).join('; '));
      const before = await snapshot();
      const b = await readBackB(k);
      check(`${k} (applied) D passes on the base`, b === null, b ?? '');
      check(`${k} (applied) D leaves nothing`, (await snapshot()) === before);
      for (const [label, sql] of PLANTS[k]) await plant(k, label, sql);
      summary.push(`| ${k} | ${src.name}, applied | (in the base) | ${a.rows.length} of ${a.rows.length} on the base | ${b === null ? 'yes' : 'NO'} | — |`);
      continue;
    }

    const s0 = await snapshot();
    let err: string | null = null;
    await pg.exec(A).catch((e: Error) => (err = e.message));
    check(`${k} A (dry run) runs without an error`, err === null, err ?? '');
    const s1 = await snapshot();
    check(`${k} A (dry run) leaves nothing`, s0 === s1, diff(s0, s1));
    err = null;
    await pg.exec(B).catch((e: Error) => (err = e.message));
    check(`${k} B (migration) applies`, err === null, err ?? '');
    const a = await readBackA(k);
    check(`${k} C (read-back a) is all true (${a.rows.length} rows), read only`, allTrue(a), falseRows(a).join('; '));
    const before = await snapshot();
    const b = await readBackB(k);
    check(`${k} D (read-back b) passes`, b === null, b ?? '');
    const after = await snapshot();
    check(`${k} D (read-back b) leaves nothing`, before === after, diff(before, after));
    err = null;
    await pg.exec(B).catch((e: Error) => (err = e.message));
    const again = await snapshot();
    check(`${k} B run twice: no error, nothing changes`, err === null && again === after, err ?? diff(after, again));
    check(`${k} C still all true after the second run`, allTrue(await readBackA(k)));
    check(`${k} D still passes after the second run`, (await readBackB(k)) === null);
    for (const [label, sql] of PLANTS[k]) await plant(k, label, sql);
    summary.push(`| ${k} | ${src.name} | yes | ${a.rows.filter((r) => r.ok === true).length} of ${a.rows.length} | ${b === null && before === after ? 'yes' : 'NO'} | ${err === null && again === after ? 'safe, no change' : 'NOT SAFE'} |`);
  }

  // Conflicts and the end state.
  const done = await snapshot();
  for (const k of [...APPLIED, ...APPLY_ORDER]) check(`at the end: ${k}C still all true`, allTrue(await readBackA(k)), falseRows(await readBackA(k)).join('; '));
  for (const k of [...APPLIED, ...APPLY_ORDER]) check(`at the end: ${k}D still passes`, (await readBackB(k)) === null);
  // The existing mark (made before 0038) is still a standing submission.
  const standing = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.challenge_marks where fid = 2147483645 and withdrawn_at is null`)).rows[0].n;
  check('a mark made before 0038 is kept and stands (withdrawn_at null)', standing === 1, String(standing));

  // Re-running 0033 after 0038 removes Withdraw's column grant; running 4B again restores it.
  await pg.exec(readFileSync(path.join(dir, '0033_remix_challenge.sql'), 'utf8'));
  const r4 = await readBackA('4');
  check('conflict: re-running 0033 after 0038 turns Withdraw off (4C row 2 false)', falseRows(r4).length === 1 && /update of withdrawn_at only/.test(falseRows(r4)[0]), falseRows(r4).join('; '));
  await pg.exec(get('4B'));
  check('conflict: running 4B again restores it, and the database is as it was', allTrue(await readBackA('4')) && (await snapshot()) === done, diff(done, await snapshot()));

  // Re-running 0036 after 0039 takes Lens back out of the account check (no Lens row yet) or stops (with one).
  const f36 = readFileSync(path.join(dir, '0036_social_bluesky_check.sql'), 'utf8');
  const m36 = /^begin;$[\s\S]*?^commit;$/m.exec(f36.slice(f36.indexOf('-- B. THE MIGRATION')))![0];
  await pg.exec(m36);
  const r6 = await readBackA('6');
  check('conflict: re-running 0036 after 0039 takes Lens out (6C row 1 false)', falseRows(r6).length === 1 && /lens/.test(falseRows(r6)[0]), falseRows(r6).join('; '));
  await pg.exec(get('6B'));
  check('conflict: running 6B again restores it, and the database is as it was', allTrue(await readBackA('6')) && (await snapshot()) === done, diff(done, await snapshot()));

  // Re-running 0034 (pack 1B) changes nothing.
  await pg.exec(get('1B'));
  check('re-running 0034 after 0037..0039 changes nothing', (await snapshot()) === done, diff(done, await snapshot()));
  await pg.close();
  return { passed, failures, log, summary, caughtBy };
}

const good = await run();
for (const l of good.log) console.log(l);
console.log('\nSummary (for the doc):\n| # | Migration | A leaves nothing, B applies | C | D passes, keeps nothing | B twice |\n|---|---|---|---|---|---|');
for (const l of good.summary) console.log(l);
console.log('\nPlanted faults (for the doc):\n| # | Planted | Caught by |\n|---|---|---|');
for (const l of good.caughtBy) console.log(l);

// A planted fault in a pasted block must make the run fail: 4B loses Withdraw's column grant; 6B forgets Lens.
const faults = [
  { block: '4B', from: 'grant update (withdrawn_at) on studio.challenge_marks to studio_writer;', to: '' },
  { block: '6B', from: "check (account in ('farcaster', 'bluesky', 'lens'))", to: "check (account in ('farcaster', 'bluesky'))" },
  { block: '3C', from: "= 'id:bigint,remix:uuid,fid:bigint,units:smallint,slot:text,at:timestamp with time zone'", to: "= 'id:bigint'" },
];
let faultsOk = true;
for (const f of faults) {
  const r = await run(f);
  const caught = r.failures.length > 0;
  console.log(`planted fault in the doc (${f.block}: ${f.from.slice(0, 60)}…): ${caught ? `the test fails, as it must (${r.failures.length} failures, first: ${r.failures[0].slice(0, 140)})` : 'NOT CAUGHT'}`);
  if (!caught) faultsOk = false;
}

console.log(`\ntest-launch-sql: ${good.passed} passed, ${good.failures.length} failed; planted-fault runs ${faultsOk ? 'all failed, as they must' : 'NOT ALL CAUGHT'}`);
if (good.failures.length || !faultsOk) {
  for (const x of good.failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
