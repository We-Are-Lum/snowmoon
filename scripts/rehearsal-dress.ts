/**
 * The rehearsal's dress run (branch contest, 2026-11-04), by an agent before the owner's rehearsal 1: the owner's
 * path on the rehearsal server with test persons only. No new account on any network, no real post, nothing in
 * production.
 *
 *   npm run rehearsal:db                  (in another terminal, first)
 *   npx tsx scripts/rehearsal-dress.ts [--no-build]
 *
 * The server is the rehearsal's (scripts/rehearsal.ts's settings: the rehearsal database, the rehearsal store, the R2
 * keys blanked), plus the dress run's stand-ins, which only work under the rehearsal switch: sign-in as two test
 * FIDs no real account has (REHEARSAL_TEST_SIGNIN), and Farcaster casts read from a local file instead of Neynar
 * (REHEARSAL_TEST_POSTS). Its own ticket secret is made up here, and Neynar's key is a placeholder: the owner's keys
 * in .env.rehearsal.local are not used. The test persons' Neynar decisions are seeded as passed, so Neynar is never
 * asked. Real: the prompt check (Groq, from .env.local) and the pictures (fal, from .env.local), three views, a few
 * cents; the byline lookup asks Farcaster's public API for the test FID's name (no key, nothing written).
 *
 * The path: /challenge shows the bases; a test person agrees to the words screen, remixes Deluin's base (front, side,
 * back), publishes, adds a (stand-in) cast, submits; the entry is on /challenge/entries and its page; a cast by
 * someone else and one without the link are refused; withdraw; a second submission the same Pacific day is refused.
 */
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { rehearsalEnv, parseEnv } from './rehearsal';
import { REHEARSAL_BASE_IDS, REHEARSAL_ORIGIN, rehearsalDbUrl } from './lib/rehearsal';
import { CHALLENGE, IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOME = path.join(os.homedir(), 'snowmoon-rehearsal-db');
const POSTS = path.join(HOME, 'dress-run-casts.json');
const A = 2147483601;
const B = 2147483602;
const results: string[] = [];
let failed = 0;
const step = (label: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  console.log(results.at(-1));
};
const listening = (port: number) => new Promise<boolean>((r) => { const s = net.connect({ host: '127.0.0.1', port }, () => { s.end(); r(true); }); s.once('error', () => r(false)); });

if (!(await listening(54329))) throw new Error('start the rehearsal database first: npm run rehearsal:db');
if (await listening(3000)) throw new Error('port 3000 is in use');

const local = parseEnv(readFileSync(path.join(ROOT, '.env.local'), 'utf8'));
const { env, refused } = rehearsalEnv(process.env, local, { IMAGES_TICKET_SECRET: randomBytes(32).toString('hex'), NEYNAR_API_KEY: 'dress-run-placeholder-not-a-key' });
if (refused) throw new Error(refused);
Object.assign(env, { REHEARSAL_TEST_SIGNIN: 'on', REHEARSAL_TEST_POSTS: POSTS });
writeFileSync(POSTS, '{}');

const store = () => (existsSync(path.join(HOME, 'store/public/images/readers')) ? readdirSync(path.join(HOME, 'store/public/images/readers')).length : 0);
const storeBefore = store();

// Seed: the test persons' Neynar decisions, passed (so Neynar is never asked).
const sql = postgres(rehearsalDbUrl(), { max: 1, prepare: false });
for (const fid of [A, B]) for (const t of [...new Set([IMAGES.neynarMinScore, CHALLENGE.neynarMinScore])].map((m) => `neynar-score>=${m}`)) await sql`insert into studio.check_decisions (network, account, threshold, passed) values ('farcaster', ${String(fid)}, ${t}, true) on conflict (network, account, threshold) do update set passed = true, decided_at = now()`;
const base = REHEARSAL_BASE_IDS.deluin[1];
const [srcRow] = await sql<{ style: string | null }[]>`select body->'style'->>'version_id' as style from studio.element_versions where id = ${base}`;
const style = srcRow?.style;
if (!style) throw new Error('the stand-in base has no style: npm run rehearsal:db -- --reset');
// The rehearsal database takes one connection at a time: this one closes before the server starts.
await sql.end();
let published: string | null = null;
let cost = 0;

const next = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!process.argv.includes('--no-build')) {
  const b = spawnSync(process.execPath, [next, 'build'], { cwd: ROOT, env: { ...env, NODE_OPTIONS: '--max-old-space-size=3072' }, stdio: 'inherit' });
  if (b.status !== 0) throw new Error('build failed');
  writeFileSync(path.join(ROOT, '.next', 'REHEARSAL_BUILD'), `rehearsal build (dress run), ${new Date().toISOString()}\n`);
}
const app = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', '3000'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
app.stdout.on('data', (d) => (log += d));
app.stderr.on('data', (d) => (log += d));
try {
  for (let i = 0; !(await fetch(REHEARSAL_ORIGIN).then((r) => r.ok, () => false)); i++) {
    if (i > 90) throw new Error('the server did not start');
    await new Promise((r) => setTimeout(r, 1000));
  }
  const as = (fid: number) => ({ authorization: `Bearer rehearsal-test-${fid}`, 'content-type': 'application/json' });
  const get = (p: string, fid?: number) => fetch(REHEARSAL_ORIGIN + p, { headers: fid ? as(fid) : {} });
  const post = (p: string, body: unknown, fid: number, method = 'POST') => fetch(REHEARSAL_ORIGIN + p, { method, headers: as(fid), body: JSON.stringify(body) });

  // 1. /challenge, signed out: public on this server, the stand-in bases.
  const ch = await get('/challenge');
  const chHtml = await ch.text();
  step('/challenge answers 200 signed out on the rehearsal server', ch.status === 200, String(ch.status));
  step('/challenge shows Deluin\'s three stand-in bases', (chHtml.match(/Deluin, rehearsal stand-in \(/g) ?? []).length >= 3);
  step('/challenge has the "Every entry" link', chHtml.includes('/challenge/entries'));

  // 2. Signed in (a test person): status, then the words screen.
  const st = (await (await get('/api/images/status', A)).json()) as { ready?: boolean; eligible?: boolean | null; consented?: boolean };
  step('a test person is signed in and passes the check (kept decision, no Neynar call)', st.ready === true && st.eligible === true, JSON.stringify(st).slice(0, 160));
  const c = (await (await get('/api/consent', A)).json()) as { wording?: { sha256: string } };
  const agreed = await post('/api/consent', { sha256: c.wording?.sha256 }, A);
  step('they agree to how their words are published', agreed.ok, String(agreed.status));

  // 3. Remix Deluin's "Mood" base: front (from the base's front view), side, back.
  const desc = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/designs/characters/deluin.json'), 'utf8')).descriptor as string;
  const text = `${desc} He wears a long red scarf.`.slice(0, 600);

  const view = async (slot: 'front' | 'side' | 'back', extra: Record<string, unknown>) => {
    const r = await post('/api/designs/sample', { slot, index: 0, kind: 'character', text, style, ...extra }, A);
    const o = (await r.json().catch(() => ({}))) as { ticket?: string; image?: string; remix?: string; error?: string; costUsd?: number };
    return { ok: r.ok && Boolean(o.ticket && o.image), o, status: r.status };
  };
  const front = await view('front', { source: base });
  step('Remix: the front view, made from the base\'s front view (real model)', front.ok, front.ok ? '' : `${front.status} ${front.o.error ?? ''}`);
  if (!front.ok) throw new Error('stopping: no front view');
  const remix = front.o.remix ? { remix: front.o.remix } : {};
  const side = await view('side', { front: { ticket: front.o.ticket, image: front.o.image }, ...remix });
  const back = side.ok ? await view('back', { front: { ticket: front.o.ticket, image: front.o.image }, ...remix }) : side;
  step('Remix: side and back, inside the same remix', side.ok && back.ok, `${side.status}/${back.status} ${side.o.error ?? back.o.error ?? ''}`);

  // 4. Publish.
  const views = Object.fromEntries([['front', front], ['side', side], ['back', back]].filter(([, v]) => (v as typeof front).ok).map(([k, v]) => [k, { ticket: (v as typeof front).o.ticket, image: (v as typeof front).o.image }]));
  const pub = await post('/api/designs', { mode: 'fork', kind: 'character', title: 'Deluin in a red scarf (dress run)', text, character: 'deluin', from: base, views }, A);
  const pubOut = (await pub.json().catch(() => ({}))) as { versionId?: string; page?: string; challenge?: { kind: string; text: string } | null; error?: string };
  step('Publish: the remix is published, and the confirmation says it can be submitted', pub.ok && Boolean(pubOut.versionId) && pubOut.challenge?.kind === 'candidate', `${pub.status} ${pubOut.error ?? JSON.stringify(pubOut.challenge)}`);
  const v = pubOut.versionId!;
  const page = await (await get(`/references/designs/${v}`)).text();
  step('its page is served, with its pictures from the rehearsal store (not R2)', page.includes(`${REHEARSAL_ORIGIN}/api/rehearsal/file/images/readers/`) && !page.includes('pictures.snowmoon.party/images/readers'));
  published = v;

  // 5. The (stand-in) cast and Submit.
  const hash = (n: number) => `0x${String(n).repeat(40).slice(0, 40)}`;
  const link = `${REHEARSAL_ORIGIN}/references/designs/${v}`;
  writeFileSync(POSTS, JSON.stringify({
    [hash(1)]: { cast: { hash: hash(1), author: { fid: A, username: 'dress-run-a' }, text: `My Deluin remix ${link}`, timestamp: new Date().toISOString(), embeds: [{ url: link }] } },
    [hash(2)]: { cast: { hash: hash(2), author: { fid: B, username: 'dress-run-b' }, text: `Someone else's cast ${link}`, timestamp: new Date().toISOString(), embeds: [{ url: link }] } },
    [hash(3)]: { cast: { hash: hash(3), author: { fid: A, username: 'dress-run-a' }, text: 'A cast with no link', timestamp: new Date().toISOString(), embeds: [] } },
  }));
  const notMine = await post('/api/challenge/submit', { versionId: v, castHash: hash(2) }, A);
  step('Submit with someone else\'s cast is refused', notMine.status === 403, `${notMine.status} ${((await notMine.json().catch(() => ({}))) as { error?: string }).error ?? ''}`);
  const noLink = await post('/api/challenge/submit', { versionId: v, castHash: hash(3) }, A);
  step('Submit with a cast that doesn\'t link to the remix is refused', noLink.status === 422, `${noLink.status} ${((await noLink.json().catch(() => ({}))) as { error?: string }).error ?? ''}`);
  const sub = await post('/api/challenge/submit', { versionId: v, castHash: hash(1) }, A);
  const subOut = (await sub.json().catch(() => ({}))) as { submitted?: string; left?: number; error?: string };
  step('Submit with their own cast linking to the remix\'s rehearsal page', sub.ok && subOut.submitted === v, `${sub.status} ${subOut.error ?? `left today: ${subOut.left}`}`);

  // 6. Browse and the page.
  const entries = await (await get('/challenge/entries')).text();
  step('the entry is on /challenge/entries', entries.includes(v));
  const deluinOnly = await (await get('/challenge/entries?character=deluin')).text();
  const zeiOnly = await (await get('/challenge/entries?character=zei')).text();
  step('the character filter: on Deluin\'s, not on Zei\'s', deluinOnly.includes(v) && !zeiOnly.includes(v));
  const page2 = await (await get(`/references/designs/${v}`)).text();
  step('its page lists the post with "See the conversation on Farcaster" and no counts', page2.includes('See the conversation on Farcaster') && !/\b\d+ (likes|recasts|replies)\b/i.test(page2));

  // 7. Withdraw, then a second submission the same Pacific day.
  const w = await post('/api/challenge/submit', { versionId: v }, A, 'DELETE');
  step('Withdraw', w.ok, String(w.status));
  const entries2 = await (await get('/challenge/entries')).text();
  step('after withdrawing, it is not on /challenge/entries', !entries2.includes(v));
  const again = await post('/api/challenge/submit', { versionId: v, castHash: hash(1) }, A);
  const againOut = (await again.json().catch(() => ({}))) as { error?: string };
  step('a second submission the same Pacific day is refused', again.status === 409 && /today/.test(againOut.error ?? ''), `${again.status} ${againOut.error ?? ''}`);

  // 8. Nothing touched production.
  step('the server\'s database was the rehearsal\'s, and its R2 keys were blank', env.STUDIO_DATABASE_URL === rehearsalDbUrl() && env.R2_ACCESS_KEY_ID === '' && env.R2_SECRET_ACCESS_KEY === '');
  step('the pictures went to the rehearsal store', store() >= storeBefore + 3, `${storeBefore} → ${store()}`);
  step('the server never tried R2 (no R2 error in its log)', !/r2\.cloudflarestorage|missing R2_/i.test(log));
} finally {
  app.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 2000));
  if (await listening(3000)) app.kill('SIGKILL');
  // Its connection closes when the server stops (or within 10 s idle); then read what the remix's pictures cost.
  await new Promise((r) => setTimeout(r, 11_000));
  if (published) {
    const q = postgres(rehearsalDbUrl(), { max: 1, prepare: false });
    const [spent] = await q<{ usd: number | null }[]>`select (select sum((v.value->'recipe'->>'cost_usd')::numeric) from jsonb_each(body->'views') v)::float as usd from studio.element_versions where id = ${published}`.catch(() => [{ usd: null }]);
    await q.end();
    cost = Number(spent?.usd ?? 0);
    results.push(`model spend, from the published recipes: $${cost.toFixed(4)}`);
    console.log(results.at(-1));
  }
  writeFileSync(path.join(HOME, 'dress-run-log.txt'), `${results.join('\n')}\n\n--- server log ---\n${log}`);
}
console.log(`\nrehearsal dress run: ${results.length - failed} ok, ${failed} failed (log: ${path.join(HOME, 'dress-run-log.txt')})`);
process.exit(failed ? 1 : 0);
