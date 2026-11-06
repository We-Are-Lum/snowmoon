/**
 * The rehearsal switch and the rehearsal's start script (branch contest, 2026-11-04), on stand-ins: no server, no
 * network, no database. check:principles P6w proves the switch against production on every run; this proves the rest.
 *
 *   npm run test:rehearsal
 */
import { rehearsalChallenge, rehearsalOn, rehearsalOnInBrowser, pacificDay, pacificDayStart, REHEARSAL_BASE_IDS, LOCAL_DB_URL } from '../src/lib/challenge/rehearsal-switch';
import { rehearsalEnv, parseEnv } from './rehearsal';
import { rehearsalDbUrl } from './lib/rehearsal';
import { CHALLENGE } from '../src/lib/config';
import { readFileSync } from 'node:fs';

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);

const local = rehearsalDbUrl();
const on = { CHALLENGE_REHEARSAL: 'on', STUDIO_DATABASE_URL: local };
check('on: CHALLENGE_REHEARSAL=on, on this machine, with the rehearsal database', rehearsalOn(on));
check('off without CHALLENGE_REHEARSAL=on (also "1", "true")', !rehearsalOn({ STUDIO_DATABASE_URL: local }) && !rehearsalOn({ ...on, CHALLENGE_REHEARSAL: '1' }) && !rehearsalOn({ ...on, CHALLENGE_REHEARSAL: 'true' }));
for (const [what, env] of [
  ['VERCEL_ENV=production', { ...on, VERCEL_ENV: 'production' }],
  ['VERCEL_ENV=preview', { ...on, VERCEL_ENV: 'preview' }],
  ['VERCEL=1', { ...on, VERCEL: '1' }],
  ['NEXT_PUBLIC_VERCEL_ENV=production', { ...on, NEXT_PUBLIC_VERCEL_ENV: 'production' }],
  ['the production pooler', { ...on, STUDIO_DATABASE_URL: 'postgres://studio_writer.ref:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres' }],
  ['a database at a look-alike host', { ...on, STUDIO_DATABASE_URL: 'postgres://u@127.0.0.1.evil.example:5432/postgres' }],
] as const) check(`off with ${what}`, !rehearsalOn(env));
check('a database on this machine is one the switch accepts; the pooler isn\'t', LOCAL_DB_URL.test(local) && !LOCAL_DB_URL.test('postgres://a:b@db.example.supabase.co:5432/postgres'));
check('in the browser: the build\'s flag and a page on 127.0.0.1 or localhost only', rehearsalOnInBrowser('on', undefined, '127.0.0.1') && rehearsalOnInBrowser('on', undefined, 'localhost') && !rehearsalOnInBrowser('on', undefined, 'snowmoon.party') && !rehearsalOnInBrowser('on', 'production', '127.0.0.1') && !rehearsalOnInBrowser(undefined, undefined, '127.0.0.1'));

// The rehearsal's challenge.
const now = new Date('2026-11-04T23:30:00-08:00');
const r = rehearsalChallenge({ opens: '2026-11-06T17:00:00Z', closes: '2026-11-23T08:00:00Z', results: '2026-12-04T17:00:00Z' }, now);
check('its id is rehearsal-<yyyymmdd>, the Pacific day', r.id === 'rehearsal-20261104', r.id);
check('it opens at the start of today, Pacific', r.dates.opens === '2026-11-04T08:00:00.000Z', r.dates.opens);
check('every date moves by the same amount (the spacing is kept)', Date.parse(r.dates.closes) - Date.parse(r.dates.opens) === Date.parse('2026-11-23T08:00:00Z') - Date.parse('2026-11-06T17:00:00Z') && Date.parse(r.dates.results) - Date.parse(r.dates.closes) === Date.parse('2026-12-04T17:00:00Z') - Date.parse('2026-11-23T08:00:00Z'));
check('the id fits challenge_marks\' check (^[a-z0-9-]{1,40}$)', /^[a-z0-9-]{1,40}$/.test(r.id));
check('Pacific days: 23:59 and 00:00 are two days; a DST morning starts at 07:00 or 08:00 UTC', pacificDay(new Date('2026-11-10T23:59:00-08:00')) === '2026-11-10' && pacificDay(new Date('2026-11-11T00:00:00-08:00')) === '2026-11-11' && pacificDayStart(new Date('2026-07-01T12:00:00-07:00')).toISOString() === '2026-07-01T07:00:00.000Z' && pacificDayStart(new Date('2026-11-04T12:00:00-08:00')).toISOString() === '2026-11-04T08:00:00.000Z');
check('this process has no switch on (the tests run as production would read it)', !rehearsalOn(process.env) && CHALLENGE.id === 'remix-2026-11');
check('the stand-in bases: one per character, three for Deluin and Gladias, as CHALLENGE.baseCount', CHALLENGE.characters.every((c) => REHEARSAL_BASE_IDS[c]?.length === CHALLENGE.baseCount[c]));

// The dress run's stand-ins are not on this branch (they live on contest-rehearsal, which never merges).
const auth = readFileSync('src/lib/auth.ts', 'utf8');
const posts = readFileSync('src/lib/challenge/posts.ts', 'utf8');
check('no test sign-in and no stand-in casts on this branch: the real Farcaster sign-in and Neynar only', !/rehearsal-test-|rehearsalTest|REHEARSAL_TEST/.test(auth + posts + readFileSync('src/lib/challenge/rehearsal-switch.ts', 'utf8')));

// The start script: the database must be the rehearsal's.
const base = { PATH: '/usr/bin' };
const ok = rehearsalEnv(base, { STUDIO_DATABASE_URL: 'postgres://studio_writer.x:y@pooler.supabase.com:6543/postgres', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' }, { NEYNAR_API_KEY: 'n' });
check('the rehearsal\'s database replaces .env.local\'s production one', ok.refused === null && ok.env.STUDIO_DATABASE_URL === local, String(ok.refused));
check('the R2 keys are blanked and pictures go to the rehearsal store', ok.env.R2_ACCESS_KEY_ID === '' && ok.env.R2_SECRET_ACCESS_KEY === '' && /snowmoon-rehearsal-db\/store$/.test(ok.env.REHEARSAL_STORE) && ok.env.R2_IMAGES_PUBLIC_URL === 'http://127.0.0.1:3000/api/rehearsal/file');
check('the switch is on in the app\'s settings and the overlay\'s keys are passed on', ok.env.CHALLENGE_REHEARSAL === 'on' && ok.env.NEXT_PUBLIC_CHALLENGE_REHEARSAL === 'on' && ok.env.NEYNAR_API_KEY === 'n' && rehearsalOn(ok.env));
check('the dress run\'s stand-ins are never on for the owner\'s rehearsal', rehearsalEnv({ ...base, REHEARSAL_TEST_SIGNIN: 'on', REHEARSAL_TEST_POSTS: '/x' }, {}, {}).env.REHEARSAL_TEST_SIGNIN === undefined);
check('refused: the overlay moves the database elsewhere', rehearsalEnv(base, {}, { STUDIO_DATABASE_URL: 'postgres://u:p@db.example.com:5432/postgres' }).refused !== null);
check('refused: another database variable points elsewhere', rehearsalEnv(base, { POSTGRES_URL: 'postgres://u:p@db.example.com:5432/postgres' }, {}).refused !== null);
check('refused: VERCEL_ENV is dropped from the app\'s settings (and the switch would ignore it anyway)', rehearsalEnv({ ...base, VERCEL_ENV: 'production' }, {}, {}).env.VERCEL_ENV === undefined);
proof('a start script that lets the overlay set the database is caught', ((overlay: Record<string, string>) => ({ ...{ STUDIO_DATABASE_URL: local }, ...overlay }).STUDIO_DATABASE_URL !== local)({ STUDIO_DATABASE_URL: 'postgres://u:p@db.example.com:5432/postgres' }) && rehearsalEnv(base, {}, { STUDIO_DATABASE_URL: 'postgres://u:p@db.example.com:5432/postgres' }).refused !== null);
check('env files: quotes removed, comments skipped', JSON.stringify(parseEnv('# c\nA="x y"\nB=\'z\'\nexport C=1\n')) === JSON.stringify({ A: 'x y', B: 'z', C: '1' }));

// The rehearsal store: under the switch only, the readers' key form only.
const store = readFileSync('src/lib/images/store.ts', 'utf8');
check('the store goes local only under the switch, with an absolute folder', /return REHEARSAL\.on && dir && path\.isAbsolute\(dir\) \? dir : null;/.test(store));
check('every R2 write and read has the local branch first', (store.match(/if \(rehearsalStore\(\)\)/g) ?? []).length >= 6);

// The app's own modules under the switch, in a child process each (the config is read once per process).
{
  const { spawnSync } = await import('node:child_process');
  const probe = (env: Record<string, string>) => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/lib/rehearsal-probe.ts'], { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' });
    try {
      return JSON.parse(r.stdout.trim().split('\n').pop() ?? '');
    } catch {
      return { error: r.stderr.slice(0, 300) };
    }
  };
  const p = probe({ CHALLENGE_REHEARSAL: 'on', STUDIO_DATABASE_URL: local });
  check('switch on: the id is rehearsal-<today, Pacific>, public, open now', p.on === true && p.id === `rehearsal-${pacificDay(new Date()).replaceAll('-', '')}` && p.public === true && Date.parse(p.opens) <= Date.now() && Date.parse(p.closes) > Date.now(), JSON.stringify(p).slice(0, 300));
  check('switch on: signed out sees the challenge on that server', p.visibleSignedOut === true);
  check('switch on: admins are eligible (the owner, invited, is eligible as invited, not refused as an admin)', Array.isArray(p.admins) && p.admins.length === 0 && p.owner === 'invited');
  check('switch on: the stand-in bases are the challenge\'s bases', JSON.stringify(p.bases) === JSON.stringify(REHEARSAL_BASE_IDS));
  check('switch on: a link to http://127.0.0.1:3000 counts as the remix\'s page; another port doesn\'t; snowmoon.party still does', p.rehearsalLink === true && p.otherPortLink === false && p.siteLink === true);
  const prod = probe({ CHALLENGE_REHEARSAL: 'on', STUDIO_DATABASE_URL: local, VERCEL_ENV: 'production', VERCEL: '1' });
  check('switch with VERCEL_ENV=production: everything as committed (remix-2026-11, not public, admins not eligible, no rehearsal link)', prod.on === false && prod.id === 'remix-2026-11' && prod.public === false && prod.owner === 'admin' && prod.rehearsalLink === false && prod.visibleSignedOut === false, JSON.stringify(prod).slice(0, 300));
  const pooler = probe({ CHALLENGE_REHEARSAL: 'on', STUDIO_DATABASE_URL: 'postgres://studio_writer.x:y@aws-0-us-west-1.pooler.supabase.com:6543/postgres' });
  check('switch with the production database: off', pooler.on === false && pooler.id === 'remix-2026-11');
}

console.log(`test:rehearsal: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
