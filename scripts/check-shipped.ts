/**
 * "Shipped" means verified live. Fails (exit 1) unless the deployment at the
 * target URL is running the expected commit and serves the core routes.
 *
 *   npm run check:shipped                         target NEXT_PUBLIC_URL, expect local HEAD
 *   npm run check:shipped -- --url=https://...    another target
 *   npm run check:shipped -- --commit=<sha>       expect a specific commit
 */
import { execSync } from 'node:child_process';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const base = (arg('url') ?? process.env.NEXT_PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base) {
  console.error('No target: pass --url=... or set NEXT_PUBLIC_URL');
  process.exit(1);
}
const expected = arg('commit') ?? execSync('git rev-parse HEAD').toString().trim();

const failures: string[] = [];

async function get(path: string) {
  const res = await fetch(base + path, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  return { status: res.status, body: await res.text() };
}

async function check(label: string, fn: () => Promise<string | null>) {
  try {
    const problem = await fn();
    if (problem) failures.push(`${label}: ${problem}`);
    else console.log(`ok   ${label}`);
  } catch (e) {
    failures.push(`${label}: ${(e as Error).message}`);
  }
}

await check('/api/version reports expected commit', async () => {
  const r = await get('/api/version');
  if (r.status !== 200) return `HTTP ${r.status}`;
  const { commit } = JSON.parse(r.body) as { commit?: string };
  return commit === expected ? null : `deployed ${commit}, expected ${expected}`;
});

await check('chapter 1 renders with addressable blocks', async () => {
  const r = await get('/chapter/1');
  if (r.status !== 200) return `HTTP ${r.status}`;
  for (const needle of ['id="c1-b0"', 'id="c1-b1"', 'class="block screen"', 'class="block figure"', 'class="block quote"', 'Gladias']) {
    if (!r.body.includes(needle)) return `missing ${needle}`;
  }
  return null;
});

await check('chapter 32 renders', async () => {
  const r = await get('/chapter/32');
  return r.status === 200 && r.body.includes('id="c32-b0"') ? null : `HTTP ${r.status} or missing c32-b0`;
});

await check('about page carries attribution and no-token statement', async () => {
  const r = await get('/about');
  if (r.status !== 200) return `HTTP ${r.status}`;
  for (const needle of ['Vitalik Buterin', 'GNU General Public License v3', 'not affiliated', 'There is no token']) {
    if (!r.body.includes(needle)) return `missing "${needle}"`;
  }
  return null;
});

await check('farcaster manifest', async () => {
  const r = await get('/.well-known/farcaster.json');
  if (r.status !== 200) return `HTTP ${r.status}`;
  const m = JSON.parse(r.body);
  if (!m.miniapp?.homeUrl) return 'no miniapp.homeUrl';
  if (!m.accountAssociation && !base.includes('localhost')) return 'no accountAssociation (set FARCASTER_* env vars)';
  return null;
});

await check('auth endpoint rejects anonymous and forged tokens', async () => {
  const anon = await get('/api/auth/me');
  if (anon.status !== 401) return `no token: expected 401, got ${anon.status}`;
  const forged = await fetch(base + '/api/auth/me', { headers: { authorization: 'Bearer not.a.jwt' } });
  return forged.status === 401 ? null : `forged token: expected 401, got ${forged.status}`;
});

if (failures.length) {
  console.error(`\nNOT SHIPPED (${base}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`\nshipped: ${base} is running ${expected}`);
