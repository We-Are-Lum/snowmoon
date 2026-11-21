/**
 * A throwaway local database for the voice slice's screenshots (PGlite, every migration, NEXT_ephelion_voice
 * included), on 127.0.0.1. Nothing in it is real; it is gone when this stops.   tsx scripts/voice-demo-db.ts --port=54382
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const ROOT = path.resolve(import.meta.dirname, '..');
const port = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 54382);
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
// Two published sheets for the storyboard's pickers (stand-ins: not the site's real sheets).
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const body = (title: string, text: string) => JSON.stringify({ title, text, samples: [], views: {}, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null });
await pg.query(`insert into studio.entities (id, work_id, kind, name) values ('00000001-0000-4000-8000-000000000101','snowmoon','style','Ink and wash'), ('00000001-0000-4000-8000-000000000102','snowmoon','character','Ephelion')`);
await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000008-0000-4000-8000-000000000101','snowmoon','design',6786,'00000001-0000-4000-8000-000000000101','published'), ('00000008-0000-4000-8000-000000000102','snowmoon','design',6786,'00000001-0000-4000-8000-000000000102','published')`);
await pg.query(`insert into studio.element_versions (id, element_id, version_no, body) values ('00000009-0000-4000-8000-000000000101','00000008-0000-4000-8000-000000000101',1,$1), ('00000009-0000-4000-8000-000000000102','00000008-0000-4000-8000-000000000102',1,$2)`, [
  body('Ink and wash', 'Ink and wash: loose black ink lines, grey washes, paper texture.'),
  body('Ephelion', 'Lord Ephelion: a tall man in a dark coat with a high collar.'),
]);
await new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1' }).start();
console.log(`voice demo database on 127.0.0.1:${port}`);
