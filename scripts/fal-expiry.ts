/**
 * fal storage expiry (owner, 2026-10-25: "Expiry: 24 hours, not 1"; docs/proposals/fal-storage-order.md step 2).
 * Nothing here runs a model or spends anything. Each step runs only when asked:
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/fal-expiry.ts get     the account's storage settings
 *   … scripts/fal-expiry.ts put       a fresh GET, then PUT it with only expiration_duration_seconds set to 86400,
 *                                     then GET again. Refuses if the fresh GET holds anything but the two known fields
 *                                     or an initial_acl other than null (the PUT replaces the whole object).
 *   … scripts/fal-expiry.ts make      uploads a small test file to fal storage the way @fal-ai/client does
 *                                     (rest.fal.ai/storage/upload/initiate, fal-cdn-v3), after the PUT
 *   … scripts/fal-expiry.ts check     reads the test file with a CDN token and anonymously; says how old it is
 *
 * The test file's link, time and sha256 are kept in private/fal-expiry-test.json (gitignored). The owner's checks: at
 * 24 and 25 hours after it was made. FAL_KEY reaches fal in a header only; it is never printed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SETTINGS = 'https://api.fal.ai/v1/storage/settings';
const EXPIRY_S = 86400;
const STATE = path.join(process.cwd(), 'private', 'fal-expiry-test.json');

const key = process.env.FAL_KEY;
if (!key) throw new Error('FAL_KEY is not set');
const auth = { Authorization: `Key ${key}` };

type Settings = { expiration_duration_seconds: number | null; initial_acl: unknown };

async function getSettings(): Promise<Settings> {
  const r = await fetch(SETTINGS, { headers: auth, signal: AbortSignal.timeout(30_000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`GET settings: ${r.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as Settings;
}

async function put() {
  const before = await getSettings();
  console.log('GET before:', JSON.stringify(before));
  const extra = Object.keys(before).filter((k) => k !== 'expiration_duration_seconds' && k !== 'initial_acl');
  if (extra.length) throw new Error(`Refused: the settings hold more than the two known fields (${extra.join(', ')}); the PUT would drop them.`);
  if (before.initial_acl !== null) throw new Error(`Refused: initial_acl is ${JSON.stringify(before.initial_acl)}, not null; the owner's PUT sets it to null.`);
  const body = { expiration_duration_seconds: EXPIRY_S, initial_acl: null };
  const r = await fetch(SETTINGS, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const text = await r.text();
  console.log(`PUT ${JSON.stringify(body)}: ${r.status} ${text.slice(0, 300)}`);
  if (!r.ok) throw new Error('PUT failed; nothing else done.');
  const after = await getSettings();
  console.log('GET after:', JSON.stringify(after));
  if (after.expiration_duration_seconds !== EXPIRY_S || after.initial_acl !== null) throw new Error('The GET after the PUT does not show the new settings.');
}

async function make() {
  const s = await getSettings();
  if (s.expiration_duration_seconds !== EXPIRY_S) throw new Error(`Refused: the expiry is ${s.expiration_duration_seconds}, not ${EXPIRY_S}; run put first.`);
  const made = new Date().toISOString();
  const bytes = Buffer.from(`snowmoon fal expiry test, made ${made}; safe to delete\n`);
  const init = await fetch('https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: 'text/plain', file_name: `expiry-test-${Date.now()}.txt` }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await init.json().catch(() => null)) as { upload_url?: string; file_url?: string } | null;
  if (!init.ok || !j?.upload_url || !j.file_url) throw new Error(`upload initiate: ${init.status}`);
  const up = await fetch(j.upload_url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bytes, signal: AbortSignal.timeout(60_000) });
  if (!up.ok) throw new Error(`upload: ${up.status}`);
  mkdirSync(path.dirname(STATE), { recursive: true });
  const state = { url: j.file_url, made, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, settings: s };
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  console.log(`made ${made}, ${bytes.length} bytes; link kept in ${path.relative(process.cwd(), STATE)}`);
  console.log(`checks due: 24 h ${new Date(Date.parse(made) + 24 * 3600e3).toISOString()}, 25 h ${new Date(Date.parse(made) + 25 * 3600e3).toISOString()}`);
  await check();
}

async function cdnToken(): Promise<string> {
  const r = await fetch('https://rest.fal.ai/storage/auth/token?storage_type=fal-cdn-v3', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiration_seconds: 600 }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json().catch(() => null)) as { token?: string } | null;
  if (!r.ok || !j?.token) throw new Error(`CDN token: ${r.status}`);
  return j.token;
}

async function check() {
  if (!existsSync(STATE)) throw new Error('No test file yet: run make.');
  const s = JSON.parse(readFileSync(STATE, 'utf8')) as { url: string; made: string; sha256: string; size: number };
  const ageH = (Date.now() - Date.parse(s.made)) / 3600e3;
  const read = async (headers: Record<string, string>) => {
    const r = await fetch(s.url, { headers, cache: 'no-store', signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!r) return 'no answer';
    const b = Buffer.from(await r.arrayBuffer());
    const same = r.ok && createHash('sha256').update(b).digest('hex') === s.sha256;
    return `${r.status}${r.ok ? (same ? ', same bytes' : ', DIFFERENT bytes') : ''}`;
  };
  const owner = await read({ Authorization: `Bearer ${await cdnToken()}` });
  const anon = await read({});
  console.log(`${new Date().toISOString()}: test file ${ageH.toFixed(2)} h old; with our token: ${owner}; anonymous: ${anon}`);
}

const cmd = process.argv[2];
const steps: Record<string, () => Promise<unknown>> = { get: async () => console.log(JSON.stringify(await getSettings())), put, make, check };
if (!steps[cmd]) {
  console.error('Usage: fal-expiry.ts get | put | make | check');
  process.exit(2);
}
await steps[cmd]().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
