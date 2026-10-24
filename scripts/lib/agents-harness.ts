/**
 * The local stage for agents (owner, 2026-10-20): every migration (0019 included, DRAFT) in an in-memory
 * Postgres, the built site under `next start` with AGENTS_TEST=1 (never on Vercel), stand-ins for
 * Farcaster's name API and Base, and two people signed in with wallet sessions made with a test secret
 * (a Farcaster sign-in can't be made offline). Nothing here reaches a real database, R2 or a real scan:
 * images go to a temporary folder, and the scan is a labelled stand-in that matches only planted hashes.
 * Used by scripts/test-agents.ts and scripts/demo-agents.ts.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer as createHttp } from 'node:http';
import { createServer as createNet } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { failOnProtocolErrors, gatePglite } from './pglite-gate';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const SECRET = 'z'.repeat(48);
process.env.IMAGES_TICKET_SECRET = SECRET;

export const A = '0xa11ce0000000000000000000000000000000a11c';
export const B = '0xb0b0000000000000000000000000000000000b0b';
export const C = '0xc0de00000000000000000000000000000000c0de';
/** Not on the allowlist: everyone else, who must see nothing new. */
export const D = '0xd00d00000000000000000000000000000000d00d';

const stubUrlRef = { url: '' };
const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

export interface Stage {
  BASE: string;
  pg: PGlite;
  people: { A: { person: number; token: string; address: string }; B: { person: number; token: string; address: string }; C: { person: number; token: string; address: string }; D: { person: number; token: string; address: string } };
  store: string;
  stop: () => Promise<void>;
  serverErr: () => string;
  /** Everything the server printed (stdout and stderr), to prove a key never appears in it. */
  serverLog: () => string;
}

export async function startStage(opts: { scanner?: string; port?: number; transcript?: string; public?: boolean } = {}): Promise<Stage> {
  const { signSession } = await import('../../src/lib/wallet/session');
  const pg = new PGlite({ extensions: { vector } });
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of migrations) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  const account = async (addr: string) => -Number((await pg.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ($1) returning id`, [addr])).rows[0].id);
  const pA = await account(A);
  const pB = await account(B);
  const pC = await account(C);
  const pD = await account(D);
  // A has a $5 prepaid balance (a wallet account pays for its frames, as on the site).
  await pg.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ($1, $2, 8453, 'USDC', 5000000, 5, 1)`, ['0x' + 'a'.repeat(64), -pA]);
  // A made version 2 of Fifteen Days here, so A's agent can edit it (the owner's own versions, in production).
  // Versions are fixed by a trigger (0012); here, in the test database only, it is lifted for this one setup row.
  await pg.exec('alter table studio.adaptation_versions disable trigger user');
  await pg.query(`update studio.adaptation_versions set author_person = $1 where id = 2`, [pA]);
  await pg.exec('alter table studio.adaptation_versions enable trigger user');
  // A and B have agreed to how their own words are published (the current own-words consent), so they can post notes.
  const { consentWording } = await import('../../src/lib/consent');
  const { sha256 } = consentWording();
  for (const p of [pA, pB]) await pg.query(`insert into studio.contributor_consents (fid, kind, consent_text_sha256) values ($1, 'own_words', $2)`, [p, sha256]).catch(async () => {
    const cols = (await pg.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='studio' and table_name='contributor_consents'`)).rows.map((r) => r.column_name);
    throw new Error(`contributor_consents columns: ${cols.join(', ')}`);
  });
  await pg.exec('set role studio_writer');
  const dbPort = await freePort();
  failOnProtocolErrors(gatePglite(pg), 'agents');
  const dbServer = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
  await dbServer.start();

  // Farcaster's name API: nobody here has a Farcaster name (both people are wallets), so every lookup is "not found".
  const stub = createHttp((req, res) => {
    // Client metadata documents and key sets, at https://cimd.test/… (oauth.ts reads them here off Vercel).
    if (req.method === 'GET' && (req.url ?? '').startsWith('/cimd/')) {
      const doc = cimdDocs.get((req.url ?? '').slice('/cimd'.length));
      res.writeHead(doc ? 200 : 404, { 'content-type': 'application/json' });
      res.end(JSON.stringify(doc ?? {}));
      return;
    }
    // fal's video endpoint, stood in: a video test answers with a link to a tiny file served here.
    if (req.method === 'POST' && (req.url ?? '').startsWith('/fal-ai/')) {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ video: { url: `${stubUrlRef.url}/video.mp4` }, request_id: 'test-video-1' }));
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/video.mp4') {
      res.writeHead(200, { 'content-type': 'video/mp4' });
      res.end(Buffer.from('fake mp4 bytes for the video test stand-in'));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const msg = JSON.parse(body || '{}');
        const one = (m: { id: number }) => ({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'stub' } });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(Array.isArray(msg) ? msg.map(one) : one(msg)));
      });
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  const stubUrl = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
  stubUrlRef.url = stubUrl;

  const port = opts.port ?? (await freePort());
  const BASE = `http://localhost:${port}`;
  const store = mkdtempSync(path.join(tmpdir(), 'agents-store-'));
  const { VERCEL_ENV: _drop, ...env } = process.env;
  const next: ChildProcess = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(port)], {
    cwd: ROOT,
    env: {
      ...env, NODE_ENV: 'production', NEXT_PUBLIC_URL: BASE,
      STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${dbPort}/postgres`,
      FARCASTER_API_URL: stubUrl, BASE_RPC_URL: stubUrl, IMAGES_TICKET_SECRET: SECRET,
      AGENTS_TEST: '1', AGENT_API_TEST: '1', AGENTS_TEST_ALLOW: [A, B, C].join(','), AGENTS_TEST_OWNER: String(pA), AGENTS_TEST_PUBLIC: opts.public === false ? '' : '1',
      AGENTS_TEST_FAL_URL: stubUrl, AGENTS_TEST_CIMD_URL: `${stubUrl}/cimd`, REMIX_TEST_FAKES: '1', AGENTS_TEST_STORE: store, AGENTS_TEST_SCANNER: opts.scanner ?? 'none-planted', AGENTS_TEST_TRANSCRIPT: opts.transcript ?? 'Bai tells Zei to slow down, and this time he listens.',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverErr = '';
  let serverLog = '';
  next.stdout?.on('data', (d) => (serverLog += d));
  next.stderr?.on('data', (d) => { serverErr += d; serverLog += d; if (process.env.AGENTS_DEBUG) process.stderr.write(d); });
  for (let i = 0; i < 80; i++) {
    if (await fetch(BASE + '/about').then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const people = {
    A: { person: pA, token: signSession(-pA, A)!, address: A },
    B: { person: pB, token: signSession(-pB, B)!, address: B },
    C: { person: pC, token: signSession(-pC, C)!, address: C },
    D: { person: pD, token: signSession(-pD, D)!, address: D },
  };
  return {
    BASE, pg, people, store,
    serverErr: () => serverErr,
    serverLog: () => serverLog,
    stop: async () => {
      next.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      stub.close();
      await dbServer.stop();
      await pg.close();
    },
  };
}

/** What the stand-in serves at https://cimd.test/<path> (key: "/<path>"): metadata documents and key sets, set by a test. */
export const cimdDocs = new Map<string, unknown>();

/** The OAuth dance a connector does, scripted: register, the person's Allow, the code for tokens. */
export async function connect(BASE: string, personToken: string, clientName: string, scope = 'read drafts images notes') {
  const { createHash, randomBytes } = await import('node:crypto');
  const redirect = 'http://127.0.0.1:53682/callback';
  const reg = await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: clientName, redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) });
  const client = (await reg.json()) as { client_id: string };
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'st-' + clientName, scope, resource: `${BASE}/mcp` });
  const approve = await fetch(`${BASE}/api/oauth/approve`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${personToken}` }, body: JSON.stringify({ query: q.toString(), allow: true }) });
  const to = new URL(((await approve.json()) as { to: string }).to);
  const tok = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: to.searchParams.get('code')!, code_verifier: verifier, client_id: client.client_id, redirect_uri: redirect, resource: `${BASE}/mcp` }) });
  const tokens = (await tok.json()) as { access_token: string; refresh_token: string };
  return { client: client.client_id, query: q, redirect: to, verifier, ...tokens };
}

/** One MCP call with an agent's token. */
export async function mcp(BASE: string, token: string, method: string, params: Record<string, unknown> = {}) {
  const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return { status: r.status, headers: r.headers, body: (await r.json().catch(() => null)) as { result?: { structuredContent?: Record<string, unknown>; isError?: boolean; content?: { text: string }[]; tools?: { name: string; annotations: Record<string, unknown> }[] }; error?: { message: string } } | null };
}

export async function tool(BASE: string, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(BASE, token, 'tools/call', { name, arguments: args });
  const res = r.body?.result;
  return { ok: res?.isError === false, out: (res?.structuredContent ?? {}) as Record<string, unknown> & { version?: string; piece?: string }, error: res?.isError ? res.content?.[0]?.text ?? '' : null };
}
