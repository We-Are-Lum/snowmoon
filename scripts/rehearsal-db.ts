/**
 * The rehearsal's own database (branch contest, 2026-11-04; rehearsal 1, Farcaster only).
 *
 *   npm run rehearsal:db            start it (leave it running; Ctrl-C stops it)
 *   npm run rehearsal:db -- --reset delete its data first, then start fresh
 *
 * A Postgres on this machine (PGlite, through its socket server), never a production database: its data lives in
 * ~/snowmoon-rehearsal-db/data, and it listens on 127.0.0.1 only (REHEARSAL_DB_PORT, default 54329). The first time,
 * it creates the roles the app and the migrations expect (anon, authenticated, service_role; studio_writer comes from
 * 0001) and applies every numbered migration in supabase/migrations in order, then the unnumbered ones the contest
 * needs (REHEARSAL_NEXT below); later starts apply only what is new. Each file is recorded with its sha256 in
 * rehearsal_meta.applied; a file that changed since it was applied is reported, not re-run (use --reset).
 *
 * It also seeds the bases to start from, as stand-ins: one sheet per challenge character (three for Deluin and
 * Gladias), each the front view drafted on branch challenge-styles (docs/starting-sheet-drafts/bases/*-edit.jpg,
 * FLUX.2 [klein] 4B edit, an open model, with the recipe recorded in that branch's ledger.json), by the owner's FID
 * and dated the day before the rehearsal opens. Their pictures go into the rehearsal's own store
 * (~/snowmoon-rehearsal-db/store, served by /api/rehearsal/file), never to R2. Nothing here is published anywhere.
 *
 * The app connects as the postgres user here (PGlite has one user); the roles and grants are created so the
 * migrations apply as written, and scripts/test-challenge-daily-sql.ts checks studio_writer's grants on its own copy.
 */
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { REHEARSAL_BASE_IDS, REHEARSAL_DB_PORT, rehearsalDbUrl } from './lib/rehearsal';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOME = path.join(os.homedir(), 'snowmoon-rehearsal-db');
const DATA = path.join(HOME, 'data');
const STORE = path.join(HOME, 'store');
/**
 * The unnumbered migrations the contest needs, in order. None since 2026-11-06: they were numbered at merge (0037–0039,
 * applied on production by the owner). A rehearsal database that applied them under their old NEXT_ names keeps them:
 * RENAMED says which numbered file each one became, so it isn't run again.
 */
// NEXT_check_decisions is numbered 0034 on main (applied); 0035/0036 are numbered too. The SQL pack's order after them:
// remix_count (3), challenge_daily (4), social_lens_challenge (6).
export const REHEARSAL_NEXT: string[] = [];
const RENAMED: Record<string, string> = { '0037_remix_count.sql': 'NEXT_remix_count.sql', '0038_challenge_daily.sql': 'NEXT_challenge_daily.sql', '0039_social_lens_challenge.sql': 'NEXT_social_lens_challenge.sql' };

const port = Number(process.env.REHEARSAL_DB_PORT) || REHEARSAL_DB_PORT;
if (process.argv.includes('--reset')) {
  rmSync(DATA, { recursive: true, force: true });
  rmSync(STORE, { recursive: true, force: true });
  console.log(`rehearsal:db: deleted ${DATA} and ${STORE}`);
}
mkdirSync(HOME, { recursive: true });
const fresh = !existsSync(DATA);
const db = new PGlite(DATA);
await db.waitReady;

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists rehearsal_meta;
  create table if not exists rehearsal_meta.applied (file text primary key, sha256 text not null, at timestamptz not null default now());`);

const dir = path.join(ROOT, 'supabase/migrations');
const numbered = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const missingNext = REHEARSAL_NEXT.filter((f) => !existsSync(path.join(dir, f)));
if (missingNext.length) throw new Error(`rehearsal:db: missing ${missingNext.join(', ')} (run it from the contest branch)`);
const applied = new Map((await db.query<{ file: string; sha256: string }>('select file, sha256 from rehearsal_meta.applied')).rows.map((r) => [r.file, r.sha256]));
for (const f of [...numbered, ...REHEARSAL_NEXT]) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  const had = applied.get(f);
  // Applied before under its unnumbered name (2026-11-06): recorded under the new name, not run again.
  if (!had && RENAMED[f] && applied.has(RENAMED[f])) {
    await db.query('insert into rehearsal_meta.applied (file, sha256) values ($1, $2)', [f, sha(text)]);
    console.log(`rehearsal:db: ${f} was applied as ${RENAMED[f]}; recorded, not re-run`);
    continue;
  }
  if (had) {
    if (had !== sha(text)) console.log(`rehearsal:db: ${f} changed since it was applied; not re-run (npm run rehearsal:db -- --reset to start fresh)`);
    continue;
  }
  await db.exec(text);
  await db.query('insert into rehearsal_meta.applied (file, sha256) values ($1, $2)', [f, sha(text)]);
  console.log(`rehearsal:db: applied ${f}`);
}

// The seeded bases (stand-ins), once.
const characters = ['zei', 'gladias', 'bai', 'seila', 'deluin', 'mu'];
const descriptorOf = (slug: string) => (JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/designs/characters', `${slug}.json`), 'utf8')) as { descriptor: string }).descriptor;
const nameOf = (slug: string) => (JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/designs/characters', `${slug}.json`), 'utf8')) as { name: string }).name;
const fromStyles = (rel: string): Buffer => {
  for (const ref of ['origin/challenge-styles', 'challenge-styles']) {
    try {
      return execFileSync('git', ['-C', ROOT, 'show', `${ref}:${rel}`], { maxBuffer: 64 * 1024 * 1024 });
    } catch {
      /* try the next */
    }
  }
  throw new Error(`rehearsal:db: can't read ${rel} from branch challenge-styles (git fetch origin challenge-styles first)`);
};
const seeded = (await db.query<{ n: number }>(`select count(*)::int as n from studio.element_versions where id = $1`, [REHEARSAL_BASE_IDS.zei[0]])).rows[0].n > 0;
if (!seeded) {
  await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  const ledger = JSON.parse(fromStyles('docs/starting-sheet-drafts/bases/ledger.json').toString('utf8')) as { calls: { kind: string; file?: string; sha256?: string; recipe?: Record<string, unknown> }[] };
  // The day before the rehearsal opens (it opens at the start of today, Pacific): "made before the window".
  const made = new Date(Date.now() - 36 * 3600_000).toISOString();
  const styles = ['core', 'mood', 'quiet'];
  // The styles the drafts were made in, published here as they are recorded in each draft's recipe (the remix form
  // needs a published style for the views).
  const styleOf = new Map<string, { version_id: string; title: string; text: string }>();
  for (const x of ledger.calls) {
    const st = x.kind === 'image' && x.file && /-(core|mood|quiet)-edit\.jpg$/.test(x.file) ? (x.recipe?.style as { version_id: string; title: string; text: string } | undefined) : undefined;
    if (st && !styleOf.has(st.version_id)) styleOf.set(st.version_id, st);
  }
  for (const [k, st] of [...styleOf.values()].entries()) {
    const entity = `00000000-0000-4000-8000-0000000005${String(10 + k)}`;
    await db.query(`insert into studio.entities (id, work_id, kind, name) values ($1,'snowmoon','style',$2) on conflict do nothing`, [entity, st.title]);
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status, created_at) values ($1,'snowmoon','design',6786,$2,'published',$3)`, [st.version_id.replace(/^.{8}/, '0000e1e5'), entity, made]);
    await db.query(`insert into studio.element_versions (id, element_id, version_no, body, created_at) values ($1,$2,1,$3,$4)`, [st.version_id, st.version_id.replace(/^.{8}/, '0000e1e5'), JSON.stringify({ title: st.title, text: st.text, samples: [], views: {}, by_name: 'naaate', by_name_source: 'relay', assist: null }), made]);
  }
  for (const [ci, c] of characters.entries()) {
    const ids = REHEARSAL_BASE_IDS[c];
    const name = nameOf(c);
    const entity = `00000000-0000-4000-8000-0000000000${String(10 + ci)}`;
    await db.query(`insert into studio.entities (id, work_id, kind, name) values ($1,'snowmoon','character',$2) on conflict do nothing`, [entity, name]);
    for (const [i, versionId] of ids.entries()) {
      const file = `bases/${c}-front-${styles[i]}-edit.jpg`;
      const call = ledger.calls.find((x) => x.kind === 'image' && x.file === file);
      if (!call?.recipe || !call.sha256) throw new Error(`rehearsal:db: no recipe for ${file} in the ledger`);
      const bytes = fromStyles(`docs/starting-sheet-drafts/${file}`);
      if (sha(bytes) !== call.sha256) throw new Error(`rehearsal:db: ${file} doesn't match its recipe's sha256`);
      const key = `images/readers/${call.sha256.slice(0, 32)}.jpg`;
      mkdirSync(path.join(STORE, 'public', path.dirname(key)), { recursive: true });
      writeFileSync(path.join(STORE, 'public', key), bytes);
      const element = versionId.replace(/^.{8}/, '0000e1e0');
      const st = call.recipe.style as { version_id: string; title: string };
      const body = {
        title: `${name.split(' ')[0]}, rehearsal stand-in (${st.title})`,
        // The character's own description (content/snowmoon/designs/characters), as a remix's views are made from it.
        text: descriptorOf(c),
        samples: [],
        views: { front: { url: `http://127.0.0.1:3000/api/rehearsal/file/${key}`, sha256: call.sha256, recipe: call.recipe } },
        by_name: 'naaate',
        by_name_source: 'relay',
        assist: null,
        role: null,
        style: { version_id: st.version_id, title: st.title },
      };
      await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status, created_at) values ($1,'snowmoon','design',6786,$2,'published',$3)`, [element, entity, made]);
      await db.query(`insert into studio.element_versions (id, element_id, version_no, body, created_at) values ($1,$2,1,$3,$4)`, [versionId, element, JSON.stringify(body), made]);
    }
  }
  console.log(`rehearsal:db: seeded ${characters.reduce((n, c) => n + REHEARSAL_BASE_IDS[c].length, 0)} stand-in bases (pictures in ${STORE})`);
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`rehearsal:db: ${fresh ? 'created and ' : ''}listening at ${rehearsalDbUrl(port)} (data in ${DATA}). Leave this running; Ctrl-C stops it.`);
const stop = async () => {
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
