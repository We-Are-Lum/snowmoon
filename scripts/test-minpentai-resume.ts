/**
 * Resume's rows carry their ruleset (owner, 2026-10-30): src/lib/minpentai/snap/resume.ts's own save and load,
 * run against a real Postgres (PGlite through pglite-socket, as the site's client connects) with the migration
 * chain applied in order: 0025, 0029 (the moves check fix) and 0031_minpentai_resume_ruleset.sql.
 *   npm run test:minpentai-resume
 * Checks: a new row stores its ruleset; saving a new match over an existing row (the ON CONFLICT update) replaces
 * the ruleset too, both ways, so a row can't keep an old ruleset for a new match; a row saved before the column
 * existed loads as ruleset 1; the moves check refuses a malformed match; dropping a match deletes its row.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = ['0025_minpentai_snap_resume.sql', '0029_minpentai_resume_moves_check.sql', '0031_minpentai_resume_ruleset.sql'];

async function main() {
  const pg = new PGlite();
  await pg.exec('create role studio_writer; create role anon; create role authenticated; create schema studio;');
  // A row as today's code (before the ruleset column) saves it.
  for (const f of MIGRATIONS) {
    if (f === '0031_minpentai_resume_ruleset.sql') await pg.query(`insert into studio.mp_snap_resume (fid, lvl, ver, rule, moves) values (111, 0, '', 'diag', '1btfdzl.1.FYFICyHeQ2')`);
    await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  }
  const srv = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
  await srv.start();
  process.env.STUDIO_DATABASE_URL = `postgres://postgres@127.0.0.1:${(srv as unknown as { port: number }).port}/postgres`;
  const { load, save, drop } = await import('../src/lib/minpentai/snap/resume');
  const { db } = await import('../src/lib/db');
  const P = { t: 'g' as const, x: 3, y: 2, dx: 1, dy: 0 };
  const match = (rs: 1 | 2, seed: number, turns = 1) => ({ seed, lvl: 2, ver: '', rule: '' as const, turns: Array.from({ length: turns }, () => [P]), rs });
  const row = async (fid: number) => (await pg.query<{ ruleset: number; moves: string }>('select ruleset, moves from studio.mp_snap_resume where fid = $1', [fid])).rows[0];
  let checks = 0;
  const ok = (cond: boolean, what: string) => { checks++; assert.ok(cond, what); };

  try {
    // A row saved before the column existed: ruleset 1.
    ok((await row(111)).ruleset === 1, 'a row saved before the column has ruleset 1');
    ok((await load(111))?.rs === 1, 'and loads as ruleset 1');

    // A new row stores its ruleset.
    await save(222, match(2, 1001));
    ok((await row(222)).ruleset === 2, 'a new ruleset 2 match is saved with ruleset 2');
    ok((await load(222))?.rs === 2, 'and loads as ruleset 2');

    // A new match over an existing row (ON CONFLICT ... DO UPDATE) replaces the ruleset, both ways.
    await save(222, match(1, 1002, 2));
    const r1 = await row(222);
    ok(r1.ruleset === 1 && r1.moves.startsWith((1002).toString(36) + '.2.'), `saving a ruleset 1 match over a ruleset 2 row stores ruleset 1 (got ${r1.ruleset})`);
    ok((await load(222))?.rs === 1, 'and loads as ruleset 1');
    await save(222, match(2, 1003));
    ok((await row(222)).ruleset === 2, 'and back to ruleset 2 for the next match');
    // The old row too: today's code saved it with no ruleset; a new match under ruleset 2 replaces it.
    await save(111, match(2, 1004));
    ok((await row(111)).ruleset === 2, 'a ruleset 2 match over a row saved before the column stores ruleset 2');

    // The moves check (0029) still refuses a malformed match; the ruleset check refuses out of range.
    await assert.rejects(pg.query(`insert into studio.mp_snap_resume (fid, lvl, ver, rule, moves) values (333, 0, '', '', 'not a match')`));
    for (const bad of [0, 100]) await assert.rejects(pg.query(`insert into studio.mp_snap_resume (fid, lvl, ver, rule, moves, ruleset) values (333, 0, '', '', '1btfdzl.0.', $1)`, [bad]), `ruleset ${bad} refused`);
    checks += 3;

    // Dropping a match deletes its row.
    await drop(222);
    ok(!(await row(222)), 'drop deletes the row');
  } finally {
    await db()?.end({ timeout: 1 });
    await srv.stop();
  }
  console.log(`minpentai resume: ${checks} checks passed (migrations ${MIGRATIONS.join(', ')})`);
}

main().catch((e) => { console.error('FAIL', e instanceof Error ? e.message : e); process.exit(1); });
