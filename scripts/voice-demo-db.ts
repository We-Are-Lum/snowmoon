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
await new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1' }).start();
console.log(`voice demo database on 127.0.0.1:${port}`);
