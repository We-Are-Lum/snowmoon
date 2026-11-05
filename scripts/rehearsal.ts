/**
 * The rehearsal app (branch contest, 2026-11-04; rehearsal 1, Farcaster only), for the owner, at http://127.0.0.1:3000
 * (Bluesky's loopback sign-in needs 127.0.0.1, not "localhost").
 *
 *   npm run rehearsal:db     first, in its own terminal (the rehearsal database; leave it running)
 *   npm run rehearsal        then this: builds the app for the rehearsal and starts it (Ctrl-C stops it)
 *   npm run rehearsal -- --no-build   start the last rehearsal build again without building
 *
 * The build itself runs with no database at all (STUDIO_DATABASE_URL empty: the rehearsal database takes one
 * connection at a time, and the build's workers would each open one); pages read the rehearsal database once served.
 *
 * The app's settings are .env.local, overlaid by /Users/nathan/snowmoon/.env.rehearsal.local (its values are read here
 * and handed to the app, never printed), then the rehearsal's own:
 * - CHALLENGE_REHEARSAL=on (and its browser twin): the challenge `rehearsal-<yyyymmdd>`, open from the start of today
 *   (Pacific), public on this server, admins eligible (src/lib/challenge/rehearsal-switch.ts);
 * - STUDIO_DATABASE_URL: the rehearsal database on this machine. It refuses to start if, after everything is
 *   overlaid, the database would be anywhere else, or if the rehearsal database isn't answering;
 * - REHEARSAL_STORE and R2_IMAGES_PUBLIC_URL: pictures are kept in ~/snowmoon-rehearsal-db/store and served by this
 *   server; the R2 keys are blanked, so nothing can be written to the real buckets.
 * Everything else is real: sign-in with Farcaster, the Neynar check, the prompt check, image generation (it costs
 * what it costs on the site), and the post check at Submit, which reads the post from Farcaster through Neynar.
 */
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { REHEARSAL_DB_PORT, REHEARSAL_ORIGIN, rehearsalDbUrl } from './lib/rehearsal';

const ROOT = path.resolve(import.meta.dirname, '..');
const OVERLAY = process.env.REHEARSAL_ENV_FILE || '/Users/nathan/snowmoon/.env.rehearsal.local';
const STORE = path.join(os.homedir(), 'snowmoon-rehearsal-db', 'store');
const MARK = path.join(ROOT, '.next', 'REHEARSAL_BUILD');

/** KEY=VALUE lines (comments and blanks skipped; one pair of surrounding quotes removed). Values are never printed. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** The app's settings for the rehearsal, or why it must not start. Pure, so scripts/test-rehearsal.ts can prove it. */
export function rehearsalEnv(base: Record<string, string | undefined>, local: Record<string, string>, overlay: Record<string, string>, port: number = REHEARSAL_DB_PORT): { env: Record<string, string>; refused: string | null } {
  const want = rehearsalDbUrl(port);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (typeof v === 'string') env[k] = v;
  Object.assign(env, local, overlay);
  // The overlay may not move the database: say so rather than quietly replacing it.
  if (overlay.STUDIO_DATABASE_URL !== undefined && overlay.STUDIO_DATABASE_URL !== want) return { env, refused: 'the rehearsal settings set STUDIO_DATABASE_URL to somewhere other than the rehearsal database' };
  Object.assign(env, {
    STUDIO_DATABASE_URL: want,
    CHALLENGE_REHEARSAL: 'on',
    NEXT_PUBLIC_CHALLENGE_REHEARSAL: 'on',
    REHEARSAL_STORE: STORE,
    R2_IMAGES_PUBLIC_URL: `${REHEARSAL_ORIGIN}/api/rehearsal/file`,
    // No way to write to the real buckets from the rehearsal.
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    NEXT_PUBLIC_URL: REHEARSAL_ORIGIN,
  });
  for (const k of ['VERCEL', 'VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV', 'REHEARSAL_TEST_SIGNIN', 'REHEARSAL_TEST_POSTS']) delete env[k];
  // Any other database address in the settings must be this one too.
  for (const k of ['STUDIO_DATABASE_URL', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING']) {
    if (env[k] !== undefined && env[k] !== '' && env[k] !== want) return { env, refused: `${k} would point somewhere other than the rehearsal database` };
  }
  return { env, refused: null };
}

const listening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => {
      s.end();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });

if (path.basename(process.argv[1] ?? '') === 'rehearsal.ts') {
  const port = Number(process.env.REHEARSAL_DB_PORT) || REHEARSAL_DB_PORT;
  if (!existsSync(OVERLAY)) {
    console.error(`rehearsal: ${OVERLAY} is missing (the rehearsal's keys).`);
    process.exit(1);
  }
  const local = existsSync(path.join(ROOT, '.env.local')) ? parseEnv(readFileSync(path.join(ROOT, '.env.local'), 'utf8')) : {};
  const overlay = parseEnv(readFileSync(OVERLAY, 'utf8'));
  for (const k of ['IMAGES_TICKET_SECRET', 'NEYNAR_API_KEY']) if (!overlay[k]) console.error(`rehearsal: ${k} has no value in ${OVERLAY}; that step won't work.`);
  const { env, refused } = rehearsalEnv(process.env, local, overlay, port);
  if (refused) {
    console.error(`rehearsal: refused to start: ${refused}.`);
    process.exit(1);
  }
  if (!(await listening(port))) {
    console.error(`rehearsal: the rehearsal database isn't answering at ${rehearsalDbUrl(port)}. Start it first: npm run rehearsal:db`);
    process.exit(1);
  }
  if (await listening(3000)) {
    console.error('rehearsal: something is already using port 3000. Stop it first.');
    process.exit(1);
  }
  const next = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!process.argv.includes('--no-build') || !existsSync(MARK)) {
    console.log('rehearsal: building the app for the rehearsal (a few minutes)…');
    const b = spawnSync(process.execPath, [next, 'build'], { cwd: ROOT, env: { ...env, STUDIO_DATABASE_URL: '', NODE_OPTIONS: '--max-old-space-size=3072' } as unknown as NodeJS.ProcessEnv, stdio: 'inherit' });
    if (b.status !== 0) {
      console.error('rehearsal: the build failed.');
      process.exit(1);
    }
    writeFileSync(MARK, `rehearsal build, ${new Date().toISOString()}\n`);
  }
  console.log(`rehearsal: starting at ${REHEARSAL_ORIGIN} (Ctrl-C stops it).`);
  const app = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', '3000'], { cwd: ROOT, env: env as unknown as NodeJS.ProcessEnv, stdio: 'inherit' });
  const stop = () => app.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  app.on('exit', (code) => process.exit(code ?? 0));
  // The cached pages were built without a database and stay as built for their first minute (revalidate 60); after
  // that, one visit each renders them from the rehearsal's. So it says "ready" about a minute after it starts.
  for (let i = 0; i < 120; i++) {
    if (await fetch(REHEARSAL_ORIGIN).then((r) => r.ok, () => false)) {
      console.log('rehearsal: started; getting the challenge pages ready (about a minute)…');
      await new Promise((r) => setTimeout(r, 62_000));
      for (const p of ['/challenge', '/challenge/rules']) await fetch(REHEARSAL_ORIGIN + p).catch(() => null);
      await new Promise((r) => setTimeout(r, 5000));
      console.log(`rehearsal: ready. Open ${REHEARSAL_ORIGIN}/challenge`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
