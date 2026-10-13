/**
 * Wallet sign-in and prepaid generations (owner, 2026-10-13). Fails (exit 1) on any problem.
 *
 *   npm run test:wallet
 *
 * No network: Base is a stub, and every migration runs in an in-memory Postgres (PGlite), talked
 * to as studio_writer. Checks:
 * - Sign-in: our nonce (good, changed, expired); a real Sign-In with Ethereum signature for this
 *   domain and Base is accepted; another domain, another chain, another signer or our nonce changed
 *   are refused. The session token reads back, a changed one doesn't, and only getPerson takes it
 *   (as minus the account number); getFid never does.
 * - Payments read from Base: USDC to us from this wallet; ETH priced at the block; from someone else,
 *   to someone else, failed, still confirming, too old, too small; nothing when payTo isn't set.
 * - The balance: a payment is credited once; a Generate is paid at the estimate plus the markup; an
 *   empty balance is refused; a refund gives it back; prepaid costs are counted apart from free ones,
 *   so the free daily cap doesn't stop a paying account and prepaid spend has its own cap.
 * - Nothing new is publicly readable; payments and debits can't be changed or deleted.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { encodeAbiParameters, keccak256, pad, toHex, type PublicClient } from 'viem';
import { IMAGES } from '../src/lib/config';

process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

// --- Sign-in ---------------------------------------------------------------------
const { newNonce, nonceOk, signSession, readSession } = await import('../src/lib/wallet/session');
const nonce = newNonce()!;
check('a nonce of ours is good', nonceOk(nonce));
check('a changed nonce is refused', !nonceOk(nonce.slice(0, 10) + (nonce[10] === 'a' ? 'b' : 'a') + nonce.slice(11)));
{
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60_000;
  check('a nonce older than ten minutes is refused', !nonceOk(nonce));
  Date.now = realNow;
}

const { verifySignIn } = await import('../src/lib/wallet/chain');
const me = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const other = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const offline = {} as PublicClient; // an ordinary wallet's signature never needs Base
const siwe = (o: Partial<Parameters<typeof createSiweMessage>[0]> = {}) =>
  createSiweMessage({ address: me.address, chainId: 8453, domain: 'snowmoon.party', nonce: newNonce()!, uri: 'https://snowmoon.party', version: '1', issuedAt: new Date(), ...o });
const m1 = siwe();
check('a real sign-in is accepted', (await verifySignIn(m1, await me.signMessage({ message: m1 }), 'snowmoon.party', offline)) === me.address.toLowerCase());
const m2 = siwe({ domain: 'evil.example' });
check('a sign-in for another domain is refused', (await verifySignIn(m2, await me.signMessage({ message: m2 }), 'snowmoon.party', offline)) === null);
const m3 = siwe({ chainId: 1 });
check('a sign-in for another chain is refused', (await verifySignIn(m3, await me.signMessage({ message: m3 }), 'snowmoon.party', offline)) === null);
const m4 = siwe({ nonce: 'a'.repeat(74) });
check('a nonce we did not issue is refused', (await verifySignIn(m4, await me.signMessage({ message: m4 }), 'snowmoon.party', offline)) === null);
const m5 = siwe();
const stub = { verifySiweMessage: async () => false } as unknown as PublicClient;
check('someone else signing my address is refused', (await verifySignIn(m5, await other.signMessage({ message: m5 }), 'snowmoon.party', stub)) === null);

const token = signSession(7, me.address)!;
check('a session reads back', readSession(token)?.account === 7 && readSession(token)?.address === me.address.toLowerCase());
const [p0, body, sig] = token.split('.');
const forged = Buffer.from(JSON.stringify({ account: 8, address: me.address.toLowerCase(), exp: 9e9 })).toString('base64url');
check('a changed session is refused', readSession(`${p0}.${forged}.${sig}`) === null && readSession(`${p0}.${body}.x${sig}`) === null);
const { getFid, getPerson } = await import('../src/lib/auth');
const req = new Request('https://snowmoon.party/api/images/status', { headers: { authorization: `Bearer ${token}` } });
check('getPerson takes a wallet session as minus its account', (await getPerson(req)) === -7);
check('getFid never takes a wallet session', (await getFid(req)) === null);

// --- Payments read from Base ---------------------------------------------------------
const { readPayment } = await import('../src/lib/wallet/chain');
const P = IMAGES.prepaid as { payTo: `0x${string}` | null };
const US = '0x000000000000000000000000000000000000beef' as const;
const hash = keccak256(toHex('pay')) as `0x${string}`;
const transferTopic = keccak256(toHex('Transfer(address,address,uint256)'));
const usdcLog = (from: string, to: string, value: bigint) => ({
  address: IMAGES.prepaid.usdc, data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  topics: [transferTopic, pad(from as `0x${string}`), pad(to as `0x${string}`)],
});
function base(o: { status?: string; logs?: unknown[]; head?: bigint; ageDays?: number; to?: string; from?: string; value?: bigint } = {}) {
  return {
    getTransactionReceipt: async () => ({ status: o.status ?? 'success', blockNumber: 100n, logs: o.logs ?? [] }),
    getBlockNumber: async () => o.head ?? 110n,
    getBlock: async () => ({ timestamp: BigInt(Math.floor(Date.now() / 1000 - (o.ageDays ?? 0) * 86400)) }),
    getTransaction: async () => ({ to: o.to ?? US, from: o.from ?? me.address, value: o.value ?? 0n }),
    readContract: async () => [1n, 250000000000n, 0n, 0n, 1n], // $2,500.00000000
  } as unknown as PublicClient;
}
check('nothing is read while payTo is not set', !(await readPayment(hash, me.address, base({ logs: [usdcLog(me.address, US, 5_000_000n)] }))).ok);
P.payTo = US;
const u = await readPayment(hash, me.address, base({ logs: [usdcLog(me.address, US, 5_000_000n)] }));
check('USDC to us from this wallet is $5', u.ok && u.token === 'USDC' && u.usd === 5, JSON.stringify(u, (_, v) => (typeof v === 'bigint' ? String(v) : v)));
const e = await readPayment(hash, me.address, base({ value: 2n * 10n ** 15n }));
check('0.002 ETH at $2,500 is $5', e.ok && e.token === 'ETH' && e.usd === 5, JSON.stringify(e, (_, v) => (typeof v === 'bigint' ? String(v) : v)));
const why = async (c: PublicClient) => {
  const r = await readPayment(hash, me.address, c);
  return r.ok ? 'ok' : r.why;
};
check('USDC from another wallet is not mine', (await why(base({ logs: [usdcLog(other.address, US, 5_000_000n)] }))) === 'not-from-you');
check('USDC to someone else is not to us', (await why(base({ logs: [usdcLog(me.address, other.address, 5_000_000n)] }))) === 'not-to-us');
check('ETH from another wallet is not mine', (await why(base({ value: 10n ** 16n, from: other.address }))) === 'not-from-you');
check('a failed transaction pays nothing', (await why(base({ status: 'reverted' }))) === 'failed');
check('a payment still confirming waits', (await why(base({ head: 101n, logs: [usdcLog(me.address, US, 5_000_000n)] }))) === 'pending');
check('an old payment is not added here', (await why(base({ ageDays: 8, logs: [usdcLog(me.address, US, 5_000_000n)] }))) === 'old');
check('a payment under the minimum is too small', (await why(base({ logs: [usdcLog(me.address, US, 100_000n)] }))) === 'too-small');

// --- The balance -----------------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
const PORT = 54336;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1 });
await sql`set role studio_writer`;
const { accountFor, balanceUsd, credit, priceUsd } = await import('../src/lib/wallet/credits');
const { reserve, settle, refund, generationsLeft } = await import('../src/lib/images/limits');
type Sql = Parameters<typeof reserve>[0];
const S = sql as unknown as Sql;

const acct = await accountFor(S, me.address);
check('an account is made once per address', acct === (await accountFor(S, me.address.toUpperCase().replace('0X', '0x'))));
const price = priceUsd(IMAGES.reserveUsd);
check('the price is the estimate plus 30%', Math.abs(price - IMAGES.reserveUsd * 1.3) < 1e-6, String(price));
check('an empty balance is refused', !(await reserve(S, -acct)).ok);
const pay = { txHash: hash, token: 'USDC' as const, amount: 1_000_000n, usd: 1, blockNumber: 100n };
check('a payment is credited', await credit(S, acct, pay));
check('the same payment is not credited twice', !(await credit(S, acct, pay)) && (await balanceUsd(S, acct)) === 1);
check('$1 pays for this many images', (await generationsLeft(S, -acct)) === Math.floor(1 / price));
const r1 = await reserve(S, -acct);
check('a Generate is paid from the balance', r1.ok && Math.abs((await balanceUsd(S, acct)) - (1 - price)) < 1e-6);
await settle(S, { guard: { costUsd: 0.0001, provider: 'groq', verdict: 'ok' } }, undefined, 'prepaid');
await refund(S, -acct);
check('a refund gives it back', (await balanceUsd(S, acct)) === 1);
const asks = await sql`select count(*)::int as n from studio.image_asks where fid = ${-acct}`;
check('a wallet Generate is not counted against a daily limit', asks[0].n === 0);
const [costs] = await sql`select coalesce(sum(cost_usd) filter (where funded = 'prepaid'), 0)::float8 as prepaid, coalesce(sum(cost_usd) filter (where funded = 'free'), 0)::float8 as free from studio.image_costs`;
check('prepaid costs are counted apart, still with no person', costs.prepaid > 0 && costs.free === 0, JSON.stringify(costs));
await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('free', 'image', 'test', 'fal.ai', 'ok', 1, ${IMAGES.dailySpendCapUsd})`;
const freeStopped = await reserve(S, 6787);
const paidGoes = await reserve(S, -acct);
check('the free cap stops free Generates but not paying ones', !freeStopped.ok && freeStopped.refusal === 'spend' && paidGoes.ok, JSON.stringify({ freeStopped, paidGoes }));
await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('prepaid', 'image', 'test', 'fal.ai', 'ok', 1, ${IMAGES.prepaid.dailyCapUsd})`;
const capped = await reserve(S, -acct);
check('prepaid spend has its own daily cap', !capped.ok && capped.refusal === 'prepaid-spend', JSON.stringify(capped));

// --- Private, and append-only --------------------------------------------------------------
await sql`reset role`;
const readable = await sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'studio' and c.relname in ('wallet_accounts', 'wallet_payments', 'wallet_debits')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`;
check('no wallet table is publicly readable', readable.length === 0, readable.map((r) => r.t).join(', '));
const writable = await sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'studio' and c.relname in ('wallet_accounts', 'wallet_payments', 'wallet_debits')
  and (has_table_privilege('studio_writer', c.oid, 'update') or has_table_privilege('studio_writer', c.oid, 'delete'))`;
check('accounts, payments and debits are append-only for the app', writable.length === 0, writable.map((r) => r.t).join(', '));

await sql.end();
await server.stop();
await db.close();
if (failures.length) {
  console.error(`WALLET TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`wallet tests passed: ${passed} checks (sign-in, sessions, payments read from Base, the balance, caps, privacy)`);
