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
 *   empty balance is refused; there are no refunds, even when nothing comes back; prepaid costs are counted apart from free ones,
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
P.payTo = null;
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
const { reserve, settle, generationsLeft } = await import('../src/lib/images/limits');
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
check('a Generate stays paid for when nothing comes back (no refunds)', Math.abs((await balanceUsd(S, acct)) - (1 - price)) < 1e-6);
const debitSigns = await sql`select count(*)::int as n from studio.wallet_debits where usd <= 0`;
check('no debit is ever negative', debitSigns[0].n === 0);
const asks = await sql`select count(*)::int as n from studio.image_asks where fid = ${-acct}`;
check('a wallet Generate is counted for its own daily limit, under the wallet account', asks[0].n === 1);
const [costs] = await sql`select coalesce(sum(cost_usd) filter (where funded = 'prepaid'), 0)::float8 as prepaid, coalesce(sum(cost_usd) filter (where funded = 'free'), 0)::float8 as free from studio.image_costs`;
check('prepaid costs are counted apart, still with no person', costs.prepaid > 0 && costs.free === 0, JSON.stringify(costs));
await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('free', 'image', 'test', 'fal.ai', 'ok', 1, ${IMAGES.dailySpendCapUsd})`;
const freeStopped = await reserve(S, 6787);
const paidGoes = await reserve(S, -acct);
check('the free cap stops free Generates but not paying ones', !freeStopped.ok && freeStopped.refusal === 'spend' && paidGoes.ok, JSON.stringify({ freeStopped, paidGoes }));

// Per wallet: 300 a day, counted like a free account's; another wallet is not affected (owner, 2026-10-14).
const { perDay, publishesLeft } = await import('../src/lib/images/limits');
check('a wallet may make 300 a day', perDay(-acct) === 300 && IMAGES.prepaid.perDay === 300);
const rich = await accountFor(S, '0x' + 'ab'.repeat(20));
await credit(S, rich, { txHash: '0x' + '11'.repeat(32), token: 'USDC', amount: 100_000_000n, usd: 100, blockNumber: 101n });
const second = await accountFor(S, '0x' + 'cd'.repeat(20));
await credit(S, second, { txHash: '0x' + '22'.repeat(32), token: 'USDC', amount: 5_000_000n, usd: 5, blockNumber: 102n });
await sql`insert into studio.image_asks (fid) select ${-rich} from generate_series(1, 299)`;
const r300 = await reserve(S, -rich);
const r301 = await reserve(S, -rich);
const otherGoes = await reserve(S, -second);
check('the 300th Generate goes, the 301st is refused with its own reason', r300.ok && !r301.ok && r301.refusal === 'wallet-limit', JSON.stringify({ r300, r301 }));
check('a refused Generate is not charged', !r301.ok && Math.abs((await balanceUsd(S, rich)) - (100 - price)) < 1e-6);
check('one wallet at its limit does not stop another', otherGoes.ok);
check('generationsLeft says 0 for a wallet at its limit, whatever its balance', (await generationsLeft(S, -rich)) === 0);
const { LIMIT_SAY } = await import('../src/lib/images/paid');
check('the wallet limit has a clear message', LIMIT_SAY['wallet-limit'](300) === 'This wallet has reached today’s limit of 300 images. Your balance is untouched; you can make more after 00:00 UTC.');
// Publishes: the same 3 a day for a wallet account.
await sql`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`;
for (let i = 0; i < IMAGES.publishesPerDay; i++) await sql`insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'image', ${-second})`;
check('a wallet account may publish 3 images a day, like anyone', (await publishesLeft(S, -second)) === 0 && IMAGES.publishesPerDay === 3);

// --- Our failures are credited back; blocked and dropped stay charged (owner, 2026-10-14) -----
{
  const { paidPicture } = await import('../src/lib/images/paid');
  const { refund } = await import('../src/lib/wallet/credits');
  const who = await accountFor(S, '0x00000000000000000000000000000000000000aa');
  await credit(S, who, { txHash: '0x' + 'ab'.repeat(32), token: 'USDC', amount: 1_000_000n, usd: 1, blockNumber: 1n });
  const req = new Request('http://localhost/api/images/generate');
  const ok = async () => ({ allow: true, category: null, costUsd: 0.0001, provider: 'groq' });
  const down = async (): Promise<never> => { throw new Error('timeout'); };
  const made = (nsfw: boolean) => async () => ({ bytes: Buffer.from(''), contentType: 'image/png', seed: 1, requestId: 'r', nsfw, costUsd: 0.005, settings: {} });
  const bal = () => balanceUsd(S, who);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

  const checkDown = await paidPicture(sql, -who, req, { checkText: 'a quiet café', check: down, make: made(false) });
  check('the prompt check not answering costs nothing', !checkDown.ok && checkDown.status === 503 && near(await bal(), 1), String(await bal()));
  const modelDown = await paidPicture(sql, -who, req, { checkText: 'a quiet café', check: ok, make: down });
  check('the image model not answering costs nothing', !modelDown.ok && modelDown.status === 503 && near(await bal(), 1), String(await bal()));
  const blockedName = await paidPicture(sql, -who, req, { checkText: 'Vitalik Buterin at a café', check: ok, make: made(false) });
  check('a prompt naming someone on the blocked list stays charged', !blockedName.ok && near(await bal(), 1 - price), String(await bal()));
  const blockedRule = await paidPicture(sql, -who, req, { checkText: 'a quiet café', check: async () => ({ allow: false, category: 'violence', costUsd: 0.0001, provider: 'groq' }), make: made(false) });
  check('a prompt the check blocks stays charged', !blockedRule.ok && near(await bal(), 1 - 2 * price), String(await bal()));
  const dropped = await paidPicture(sql, -who, req, { checkText: 'a quiet café', check: ok, make: made(true) });
  check('an image the safety checker drops stays charged', !dropped.ok && near(await bal(), 1 - 3 * price), String(await bal()));
  const good = await paidPicture(sql, -who, req, { checkText: 'a quiet café', check: ok, make: made(false) });
  check('an image that comes back is charged once', good.ok && near(await bal(), 1 - 4 * price), String(await bal()));
  const refunds = await sql`select reason, usd::float8 as usd from studio.wallet_refunds where account_id = ${who} order by id`;
  check('each outage is credited back once, for the whole price, with its reason',
    refunds.length === 2 && refunds[0].reason === 'check-unavailable' && refunds[1].reason === 'model-unavailable' && refunds.every((x) => near(x.usd, price)),
    JSON.stringify(refunds));
  const [lastDebit] = await sql`select id::int as id from studio.wallet_debits where account_id = ${who} order by id limit 1`;
  check('a debit is never credited back twice', !(await refund(S, lastDebit.id, 'check-unavailable')) && near(await bal(), 1 - 4 * price));
  let badReason = false;
  try { await refund(S, lastDebit.id + 1000, 'blocked' as never); } catch { badReason = true; }
  const [none] = await sql`select count(*)::int as n from studio.wallet_refunds where reason not in ('check-unavailable', 'model-unavailable')`;
  check('no refund reason other than our two failures exists', none.n === 0, String(badReason));
  const free = await paidPicture(sql, 6786, req, { checkText: 'a quiet café', check: down, make: made(false) });
  const [freeRefunds] = await sql`select count(*)::int as n from studio.wallet_refunds`;
  check('a free Generate that fails writes no refund', !free.ok && freeRefunds.n === 2);
}

// The site-wide circuit breaker: $200 a day across every wallet, alerts at 50% and 100%, once each.
check('the circuit breaker is $200 a day', IMAGES.prepaid.safetyCapUsd === 200);
const sent: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (_u: unknown, init?: { body?: unknown }) => { sent.push(String(init?.body)); return new Response('ok'); }) as typeof fetch;
process.env.SNOWMOON_ALERT_URL = 'https://ntfy.invalid/test';
const [sofar] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = (now() at time zone 'utc')::date and funded = 'prepaid'`;
await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('prepaid', 'image', 'half', 'fal.ai', 'ok', 1, ${100 - sofar.usd - IMAGES.reserveUsd / 2})`;
const half = await reserve(S, -second);
const halfAgain = await reserve(S, -second);
check('the 50% alert goes once', half.ok && halfAgain.ok && sent.length === 1 && /50% of today's \$200/.test(sent[0]), JSON.stringify(sent));
await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('prepaid', 'image', 'full', 'fal.ai', 'ok', 1, ${100 - IMAGES.reserveUsd * 3})`;
const last = await reserve(S, -second);
const capped = await reserve(S, -second);
check('the last Generate before the cap sends the 100% alert', last.ok && sent.length === 2 && /100%/.test(sent[1]), JSON.stringify(sent));
check('then prepaid is refused for everyone', !capped.ok && capped.refusal === 'prepaid-spend', JSON.stringify(capped));
check('the alerts name no wallet, amount or person', sent.every((b) => !/0x|FID|\$\d+\.\d/.test(b)));
globalThis.fetch = realFetch;
delete process.env.SNOWMOON_ALERT_URL;

// --- Private, and append-only --------------------------------------------------------------
await sql`reset role`;
const readable = await sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'studio' and c.relname in ('wallet_accounts', 'wallet_payments', 'wallet_debits', 'wallet_refunds')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`;
check('no wallet table is publicly readable', readable.length === 0, readable.map((r) => r.t).join(', '));
const writable = await sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'studio' and c.relname in ('wallet_accounts', 'wallet_payments', 'wallet_debits', 'wallet_refunds')
  and (has_table_privilege('studio_writer', c.oid, 'update') or has_table_privilege('studio_writer', c.oid, 'delete'))`;
check('accounts, payments, debits and refunds are append-only for the app', writable.length === 0, writable.map((r) => r.t).join(', '));

await sql.end();
await server.stop();
await db.close();
if (failures.length) {
  console.error(`WALLET TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`wallet tests passed: ${passed} checks (sign-in, sessions, payments read from Base, the balance, caps, privacy)`);
