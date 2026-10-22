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
 *   empty balance is refused; while credit-back is off (today), nothing comes back even when nothing is made; once on, a
 *   Generate that fails (check or model didn't answer) is credited back once, for exactly its debit, a refused prompt
 *   stays charged; prepaid costs are counted apart from free ones,
 *   so the free daily cap doesn't stop a paying account and prepaid spend has its own cap.
 * - Wallet ↔ Farcaster links (owner, 2026-10-22): verified (Neynar stood in: exactly one FID, two FIDs, none, a
 *   custody address, Neynar down, the lookup off), signed (both proofs through the route, each alone refused),
 *   unlink (never undone by the app, never relinked automatically, LINKED_WALLETS doesn't override it), the payment
 *   address never linked, the two LINKED_WALLETS seeds, and earlier work shown under the FID (not rewritten).
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
function base(o: { status?: string; logs?: unknown[]; head?: bigint; ageDays?: number; to?: string; from?: string; value?: bigint; rise?: bigint; blockTxs?: { hash: string; to: string | null }[] } = {}) {
  return {
    getTransactionReceipt: async () => ({ status: o.status ?? 'success', blockNumber: 100n, logs: o.logs ?? [] }),
    getBlockNumber: async () => o.head ?? 110n,
    getBlock: async () => ({ timestamp: BigInt(Math.floor(Date.now() / 1000 - (o.ageDays ?? 0) * 86400)), transactions: o.blockTxs ?? [{ hash, to: o.to ?? US }] }),
    getBalance: async ({ blockNumber }: { blockNumber: bigint }) => (blockNumber === 100n ? 10n ** 18n + (o.rise ?? 0n) : 10n ** 18n),
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

// Smart wallets: ETH arrives as an internal transfer (2026-10-18, the owner's first ETH payment).
const EP7 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const opTopic = keccak256(toHex('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)'));
const userOp = (sender: string, success: boolean, ep = EP7) => ({
  address: ep,
  data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }], [1n, success, 1000n, 1000n]),
  topics: [opTopic, keccak256(toHex('op')), pad(sender as `0x${string}`), pad('0x0000000000000000000000000000000000000000')],
});
const BUNDLER = '0x00000000000000000000000000000000000b0b1e';
const sw = await readPayment(hash, me.address, base({ to: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', from: BUNDLER, logs: [userOp(me.address, true)], rise: 2n * 10n ** 15n }));
check('smart wallet (4337): ETH credited from payTo\'s rise, $5', sw.ok && sw.token === 'ETH' && sw.usd === 5 && sw.amount === 2n * 10n ** 15n, JSON.stringify(sw, (_, v) => (typeof v === 'bigint' ? String(v) : v)));
check('smart wallet (4337, EntryPoint v0.6) too', (await why(base({ to: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', from: BUNDLER, logs: [userOp(me.address, true, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789')], rise: 2n * 10n ** 15n }))) === 'ok');
check('smart wallet (7702, the wallet sends a batch to itself): credited', (await why(base({ to: me.address, from: me.address, rise: 2n * 10n ** 15n }))) === 'ok');
check('a failed user operation pays nothing', (await why(base({ to: EP7, from: BUNDLER, logs: [userOp(me.address, false)], rise: 2n * 10n ** 15n }))) === 'not-to-us');
check('another wallet\'s user operation is not mine', (await why(base({ to: EP7, from: BUNDLER, logs: [userOp(other.address, true)], rise: 2n * 10n ** 15n }))) === 'not-to-us');
check('someone else also paid payTo in that block: refused', (await why(base({ to: EP7, from: BUNDLER, logs: [userOp(me.address, true)], rise: 4n * 10n ** 15n, blockTxs: [{ hash, to: EP7 }, { hash: keccak256(toHex('other')), to: US }] }))) === 'shared-block');
check('no rise in payTo\'s balance: nothing paid', (await why(base({ to: EP7, from: BUNDLER, logs: [userOp(me.address, true)], rise: 0n }))) === 'not-to-us');
check('an ordinary wallet\'s plain ETH payment still works without a balance read', (await why(base({ value: 2n * 10n ** 15n }))) === 'ok');

// --- A payment's hash, as pasted (owner, 2026-10-15) ------------------------------------
{
  const { txHashFrom } = await import('../src/lib/wallet/hash');
  const h = '0x' + 'aB'.repeat(32);
  check('a pasted hash is read, lower case, spaces trimmed', txHashFrom(`  ${h}\n`) === h.toLowerCase());
  check('a block explorer link gives its hash', txHashFrom(`https://basescan.org/tx/${h}?x=1`) === h.toLowerCase());
  check('too short, too long or not hex is refused', txHashFrom(h.slice(0, -1)) === null && txHashFrom(h + 'a') === null && txHashFrom('0x' + 'g'.repeat(64)) === null);
  check('two different hashes are refused; the same one twice is fine', txHashFrom(`${h} 0x${'cd'.repeat(32)}`) === null && txHashFrom(`${h} ${h.toLowerCase()}`) === h.toLowerCase());
  check('an address is not a hash', txHashFrom(me.address) === null);
}

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
// --- Credit back a failed Generate (owner, 2026-10-21; migration 0022, IMAGES.prepaid.creditBack) ---------------
{
  const { creditBack } = await import('../src/lib/wallet/credits');
  const { paidPicture } = await import('../src/lib/images/paid');
  const { generate } = await import('../src/lib/remix/make');
  const { IMAGE_WORDING } = await import('../src/lib/images/wording');
  const P = IMAGES.prepaid as { creditBack: boolean };
  const credits = async () => (await sql`select count(*)::int as n from studio.wallet_credits`)[0].n as number;
  const req = new Request('https://snowmoon.party/api/images/generate', { method: 'POST' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  delete process.env.VERCEL;
  const unused = async (): Promise<never> => {
    throw new Error('unused');
  };

  // Off (today, until 0022 and the Terms): a failure stays charged, and the credits table is never read.
  check('credit-back is off until the owner turns it on', P.creditBack === false);
  const offBefore = await balanceUsd(S, acct);
  const off = await paidPicture(S, -acct, req, { checkText: 'a quiet lake', make: unused });
  check('while off, a failed Generate stays charged (as the Terms say today)', !off.ok && off.status === 503 && Math.abs((await balanceUsd(S, acct)) - (offBefore - price)) < 1e-6 && (await credits()) === 0, JSON.stringify(off));

  P.creditBack = true;
  // Pictures: the prompt check didn't answer, so nothing was made.
  const b0 = await balanceUsd(S, acct);
  const failedCheck = await paidPicture(S, -acct, req, { checkText: 'a quiet lake', make: unused });
  check('a Pictures Generate whose prompt check fails is credited back in full', !failedCheck.ok && Math.abs((await balanceUsd(S, acct)) - b0) < 1e-6 && (await credits()) === 1, JSON.stringify({ failedCheck, b0 }));
  check('the person is told it was added back', !failedCheck.ok && failedCheck.error.endsWith(IMAGE_WORDING.prepaid.creditedBack) && failedCheck.extra.creditedBack === true);

  // Remix: the prompt check passes (the local stand-in), the model fails (no pictures to send), nothing was made.
  process.env.REMIX_TEST_FAKES = 'guard';
  const b1 = await balanceUsd(S, acct);
  const failedModel = await generate(S, -acct, req, 'a quiet lake', []);
  check('a Remix frame whose model fails is credited back in full', !failedModel.ok && failedModel.status === 503 && Math.abs((await balanceUsd(S, acct)) - b1) < 1e-6 && (await credits()) === 2, JSON.stringify(failedModel));
  // A refused prompt is not a failure: it stays charged until the owner decides otherwise.
  const pic = { role: 'layout', name: 'layout', src: null, file: null, fileSha256: null, bytes: Buffer.from('x'), contentType: 'image/jpeg', width: 8, height: 8 } as never;
  const refused = await generate(S, -acct, req, 'TEST-BLOCK', [pic]);
  const remixPrice = priceUsd(IMAGES.editReserveUsd(1));
  check('a refused prompt stays charged', !refused.ok && refused.status === 422 && Math.abs((await balanceUsd(S, acct)) - (b1 - remixPrice)) < 1e-6 && (await credits()) === 2, JSON.stringify(refused));
  delete process.env.REMIX_TEST_FAKES;

  // Once per debit, for exactly what it took, to the same account.
  const [last] = await sql`select id::int as id, usd::float8 as usd from studio.wallet_debits order by id desc limit 1`;
  const b2 = await balanceUsd(S, acct);
  check('a debit is credited back once only', (await creditBack(S, last.id, 'failed')) && !(await creditBack(S, last.id, 'failed')) && Math.abs((await balanceUsd(S, acct)) - (b2 + last.usd)) < 1e-6);
  const [same] = await sql`select count(*)::int as n from studio.wallet_credits c join studio.wallet_debits d on d.id = c.debit_id where c.usd <> d.usd or c.account_id <> d.account_id`;
  check('every credit is its own debit’s amount, to its own account', same.n === 0);
  check('a free Generate has nothing to credit back', !(await creditBack(S, undefined, 'failed')));
  P.creditBack = false;
  globalThis.fetch = realFetch;
}

const debitSigns = await sql`select count(*)::int as n from studio.wallet_debits where usd <= 0`;
check('no debit is ever negative', debitSigns[0].n === 0);
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

// --- Wallet ↔ Farcaster links (owner, 2026-10-22; DRAFT migration NEXT_wallet_links.sql) ------------------------
{
  const L = await import('../src/lib/wallet/links');
  const { WALLET_LINKS } = await import('../src/lib/config');
  const WL = WALLET_LINKS as { lookUp: boolean; offer: boolean };
  check('the automatic Neynar lookup is switched off until the owner rereads the Privacy line', WL.lookUp === false);
  check('the signed offer is on (no new outside service)', WL.offer === true);
  const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
  const ONE = addr(0xa1), TWO = addr(0xa2), DOWN = addr(0xa3), NONE = addr(0xa4), LAZY = addr(0xa5), CUSTODY = addr(0xa6), BARE = addr(0xa7);
  const acc = async (a: string) => accountFor(S, a);
  const realFetch = globalThis.fetch;
  let calls = 0;
  const user = (fid: number, verified: string[]) => ({ object: 'user', fid, username: `u${fid}`, custody_address: addr(fid), verified_addresses: { eth_addresses: verified, sol_addresses: [] } });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    if (u.hostname !== 'api.neynar.com') throw new Error(`unexpected fetch ${u.hostname}`);
    calls++;
    const a = u.searchParams.get('addresses')!;
    if (u.searchParams.get('address_types') !== 'verified_address') return new Response('{}', { status: 400 });
    if (a === DOWN) throw new TypeError('fetch failed');
    if (a === NONE) return new Response(JSON.stringify({ code: 'NotFound' }), { status: 404 });
    const by: Record<string, unknown[]> = {
      [ONE]: [user(5001, [ONE])],
      [TWO]: [user(5002, [TWO]), user(5003, [TWO.toUpperCase().replace('0X', '0x')])],
      [LAZY]: [user(5004, [LAZY])],
      // A custody address is not a verification: Neynar may group it under the address, but it doesn't count.
      [CUSTODY]: [user(5005, [])],
      [String(IMAGES.prepaid.payTo).toLowerCase()]: [user(5006, [String(IMAGES.prepaid.payTo).toLowerCase()])],
    };
    return new Response(JSON.stringify({ [a]: by[a] ?? [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  process.env.NEYNAR_API_KEY = 'test-key';

  // While off: nothing goes to Neynar, nothing is linked.
  const accOne = await acc(ONE);
  const off = await L.autoLink(S, accOne, ONE);
  check('while the lookup is off, no address goes to Neynar and nothing is linked', off.linked === null && off.why === 'off' && calls === 0 && (await L.linkedFidFor(S, accOne, ONE)) === null && calls === 0);

  WL.lookUp = true;
  // A wallet with no link.
  const accBare = await acc(BARE);
  check('a wallet no one has linked or verified signs in as itself', (await L.linkedFidFor(S, accBare, BARE)) === null && (await L.readLink(S, accBare)).active === null);
  // Verified: exactly one FID verified the address.
  const v = await L.autoLink(S, accOne, ONE);
  const vr = await L.readLink(S, accOne);
  check('a wallet that exactly one Farcaster account verified is linked to it, as verified', v.linked === 5001 && vr.active?.fid === 5001 && vr.active?.how === 'verified', JSON.stringify({ v, vr }));
  check('…and signs in as that FID from then on', (await L.linkedFidFor(S, accOne, ONE)) === 5001);
  // Two FIDs claim one address: never linked automatically; the answer is kept a day, so Neynar isn't asked again.
  const accTwo = await acc(TWO);
  const before2 = calls;
  const t = await L.autoLink(S, accTwo, TWO);
  const t2 = await L.verifiedFids(S, accTwo, TWO);
  check('two Farcaster accounts claiming one address: not linked automatically', t.linked === null && t.why === 'more than one account' && (await L.readLink(S, accTwo)).ever === false, JSON.stringify(t));
  check('the lookup is kept (like the score cache): asked once, then answered from the cache', calls === before2 + 1 && t2.ok && t2.fromCache && t2.fids.join() === '5002,5003', JSON.stringify(t2));
  // Neynar down: plain wallet, nothing kept, quickly.
  const accDown = await acc(DOWN);
  const d0 = Date.now();
  const down = await L.autoLink(S, accDown, DOWN);
  const [keptDown] = await sql`select count(*)::int as n from studio.wallet_fid_lookups where account_id = ${accDown}`;
  check('Neynar down: the wallet signs in as itself, nothing is linked, the failure is not kept', down.linked === null && (await L.linkedFidFor(S, accDown, DOWN)) === null && keptDown.n === 0 && Date.now() - d0 < 3000, JSON.stringify(down));
  const accNone = await acc(NONE);
  check('no Farcaster account verified it (Neynar answers 404): not linked, and the answer is kept', (await L.autoLink(S, accNone, NONE)).why === 'no account' && (await L.verifiedFids(S, accNone, NONE)).ok);
  const accCustody = await acc(CUSTODY);
  check('a custody address that no one verified is not linked', (await L.autoLink(S, accCustody, CUSTODY)).linked === null);
  // Lazily, on the first getPerson-style read.
  const accLazy = await acc(LAZY);
  check('the automatic link happens lazily on the first signed-in request', (await L.linkedFidFor(S, accLazy, LAZY)) === 5004 && (await L.readLink(S, accLazy)).active?.how === 'verified');
  // The payment address is never linked: not automatically, not signed, not even if Neynar says one account verified it.
  const payTo = String(IMAGES.prepaid.payTo);
  const accPay = await acc(payTo);
  const callsPay = calls;
  const payAuto = await L.autoLink(S, accPay, payTo);
  const paySigned = await L.link(S, accPay, payTo, 6786, 'signed');
  check('the payment address is never linked (automatic or signed), and never sent to Neynar', payAuto.linked === null && !paySigned.ok && paySigned.why === 'payment-address' && calls === callsPay && (await L.linkedFidFor(S, accPay, payTo)) === null && (await L.readLink(S, accPay)).ever === false);

  // Seeded links (LINKED_WALLETS, as 'verified').
  const LUIS = '0x003276c5c24cdaff1d804170ab5cbb914f51f78a', GARANCE = '0x317a1ea96dc4b10c1ea60e3af59c472316d31303';
  const accLuis = await acc(LUIS), accGarance = await acc(GARANCE);
  const luis = await L.readLink(S, accLuis), garance = await L.readLink(S, accGarance);
  check('the two LINKED_WALLETS entries are seeded as verified links', luis.active?.fid === 6852 && luis.active.how === 'verified' && garance.active?.fid === 193912 && garance.active.how === 'verified');

  // Earlier work shows under the Farcaster name (owner, 2026-10-22), shown, not rewritten (src/lib/wallet/credit.ts).
  const C = await import('../src/lib/wallet/credit');
  const shownAs = await C.linkedTo(S, [-accLuis, -accBare, -accPay, 6852]);
  check('a linked wallet\'s work is shown under its FID; an unlinked wallet\'s and the payment address\'s are not', shownAs.get(-accLuis) === 6852 && !shownAs.has(-accBare) && !shownAs.has(-accPay) && !shownAs.has(6852));
  const pics = await C.credit(S, [{ byFid: -accLuis, byName: '0x0032…f78a' as string | null }, { byFid: -accBare, byName: '0x0000…00a7' as string | null }], (x) => x.byFid, (x, fid, name) => ({ ...x, byFid: fid, byName: name }));
  check('…as the FID, in the byline', pics[0].byFid === 6852 && pics[1].byFid === -accBare && pics[1].byName === '0x0000…00a7');
  check('the FID can hide its linked wallet\'s earlier work; nobody else can', (await C.actsFor(S, 6852, -accLuis)) && !(await C.actsFor(S, 6786, -accLuis)) && !(await C.actsFor(S, 6852, -accBare)) && !(await C.actsFor(S, -accLuis, 6852)));
  check('the FID\'s own page lists its linked wallet\'s work', (await C.walletsOf(S, 6852)).includes(-accLuis) && !(await C.walletsOf(S, 6786)).includes(-accLuis));
  const [kept] = await sql`select count(*)::int as n from studio.wallet_accounts where id = ${accLuis}`;
  check('nothing is rewritten: the wallet account is still there, the records unchanged', kept.n === 1);
  {
    const WC = WALLET_LINKS as { creditEarlierWork: boolean };
    WC.creditEarlierWork = false;
    check('with crediting off, earlier work stays the wallet\'s', (await C.linkedTo(S, [-accLuis])).size === 0 && !(await C.actsFor(S, 6852, -accLuis)));
    WC.creditEarlierWork = true;
  }

  // Unlink: the link ends, the wallet is itself again, the config map doesn't bring it back, nothing relinks it automatically.
  check('unlink ends the link', (await L.unlink(S, accOne)) === 'done' && (await L.linkedFidFor(S, accOne, ONE)) === null);
  const again = await L.autoLink(S, accOne, ONE);
  check('…and the automatic lookup never relinks an unlinked wallet', again.linked === null && again.why === 'unlinked before');
  check('unlinking twice finds nothing to unlink', (await L.unlink(S, accOne)) === 'none');
  check('an unlinked seeded wallet stays unlinked (LINKED_WALLETS doesn\'t override an unlink)', (await L.unlink(S, accLuis)) === 'done' && (await L.linkedFidFor(S, accLuis, LUIS)) === null);
  check('…and its earlier work shows as the wallet\'s again', !(await C.linkedTo(S, [-accLuis])).has(-accLuis) && !(await C.actsFor(S, 6852, -accLuis)) && !(await C.walletsOf(S, 6852)).includes(-accLuis));
  const relink = await L.link(S, accLuis, LUIS, 6852, 'signed');
  check('linking again after an unlink is a new row (the old one keeps its unlinked_at)', relink.ok && relink.created && (await L.linkedFidFor(S, accLuis, LUIS)) === 6852 && (await sql`select count(*)::int as n from studio.wallet_links where account_id = ${accLuis}`)[0].n === 2);
  const elsewhere = await L.link(S, accLuis, LUIS, 6786, 'signed');
  check('a linked wallet can\'t be linked to another FID without unlinking first', !elsewhere.ok && elsewhere.why === 'linked-elsewhere');

  // Append-friendly: the app can add and read, and only set unlinked_at once.
  // Run on the database directly (same session, still as studio_writer): a refused statement sent through the
  // socket can leave the next answer out of step (scripts/lib/pglite-gate.ts), which made this check flaky.
  const tries: [string, string][] = [
    ['change the FID', `update studio.wallet_links set fid = 1 where account_id = ${accLuis}`],
    ['delete a link', `delete from studio.wallet_links where account_id = ${accLuis}`],
    ['add a second active link', `insert into studio.wallet_links (account_id, fid, how) values (${accLuis}, 7, 'signed')`],
    ['add a link already unlinked', `insert into studio.wallet_links (account_id, fid, how, unlinked_at) values (${accBare}, 7, 'signed', now())`],
  ];
  check('the direct checks run as studio_writer', (await db.query<{ r: string }>('select current_user as r')).rows[0].r === 'studio_writer');
  for (const [what, q] of tries) {
    const r = await db.query(q).then((x) => `allowed (${x.affectedRows ?? 0} rows)`, (e) => (e as Error).message);
    check(`the app can't ${what}`, !r.startsWith('allowed'), r);
  }
  check('after the refusals, the link is as it was', (await L.linkedFidFor(S, accLuis, LUIS)) === 6852 && (await sql`select count(*)::int as n from studio.wallet_links where account_id = ${accLuis}`)[0].n === 2);
  await sql`update studio.wallet_links set unlinked_at = null where account_id = ${accOne}`;
  check('the app can\'t undo an unlink', (await L.readLink(S, accOne)).active === null);

  WL.lookUp = false;
  globalThis.fetch = realFetch;
  delete process.env.NEYNAR_API_KEY;
}

// --- Private, and append-only --------------------------------------------------------------
await sql`reset role`;
const readable = await sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'studio' and c.relname in ('wallet_accounts', 'wallet_payments', 'wallet_debits', 'wallet_credits', 'wallet_links', 'wallet_fid_lookups')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`;
check('no wallet table is publicly readable', readable.length === 0, readable.map((r) => r.t).join(', '));
const writable = await sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'studio' and c.relname in ('wallet_accounts', 'wallet_payments', 'wallet_debits', 'wallet_credits', 'wallet_links')
  and (has_table_privilege('studio_writer', c.oid, 'update') or has_table_privilege('studio_writer', c.oid, 'delete'))`;
check('accounts, payments, debits, credits and links are append-only for the app (a link\'s unlinked_at is its one settable column)', writable.length === 0, writable.map((r) => r.t).join(', '));

await sql.end();
// --- Adding a payment by its hash: the claim route, end to end (owner, 2026-10-15) ---------
{
  // One connection at a time: the test's own is closed, and the route's (src/lib/db.ts) is used.
  process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
  const { db: routeDb } = await import('../src/lib/db');
  const D = routeDb()!;
  await D`set role studio_writer`;
  const S = D as unknown as Sql;
  const sql = D;
  const { useChainForTests } = await import('../src/lib/wallet/chain');
  const { POST } = await import('../src/app/api/wallet/claim/route');
  const mine = await accountFor(S, me.address);
  const theirs = await accountFor(S, other.address);
  const as = (account: number, address: string, body: unknown) =>
    POST(new Request('https://snowmoon.party/api/wallet/claim', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${signSession(account, address)}` }, body: JSON.stringify(body) }));
  const lost = keccak256(toHex('lost payment')) as `0x${string}`;
  const before = await balanceUsd(S, mine);

  useChainForTests(base({ logs: [usdcLog(other.address, US, 2_000_000n)] }));
  const fromOther = await as(mine, me.address, { txHash: lost });
  check('a payment sent from another wallet is refused and adds nothing', fromOther.status === 422 && (await fromOther.json()).reason === 'not-from-you' && (await balanceUsd(S, mine)) === before);

  useChainForTests({ ...base(), getBlockNumber: async () => { throw new Error('429 Too Many Requests'); } } as unknown as PublicClient);
  const limited = await as(mine, me.address, { txHash: lost });
  const lj = await limited.json();
  check('a Base read that fails (a rate limit) says retry and adds nothing', limited.status === 503 && lj.retry === true && (await balanceUsd(S, mine)) === before, JSON.stringify(lj));

  useChainForTests(base({ logs: [usdcLog(me.address, US, 2_000_000n)] }));
  const good = await as(mine, me.address, { txHash: lost.toUpperCase().replace('0X', '0x') });
  const gj = await good.json();
  check('my own payment, pasted later, is added once for its amount', good.ok && gj.added === 2 && Math.abs((await balanceUsd(S, mine)) - (before + 2)) < 1e-6, JSON.stringify(gj));
  const again = await as(mine, me.address, { txHash: lost });
  check('the same hash again is refused as already added', again.status === 409 && (await again.json()).reason === 'already' && Math.abs((await balanceUsd(S, mine)) - (before + 2)) < 1e-6);
  const theirTry = await as(theirs, other.address, { txHash: lost });
  check('another wallet pasting my hash gets nothing', !theirTry.ok && (await balanceUsd(S, theirs)) === 0);

  const anon = await POST(new Request('https://snowmoon.party/api/wallet/claim', { method: 'POST', body: JSON.stringify({ txHash: lost }) }));
  check('adding a payment needs a wallet sign-in', anon.status === 401);
  const bad = await as(mine, me.address, { txHash: 'basescan.org/tx/' + lost });
  check('the route takes only a bare hash (the box extracts it first)', bad.status === 400);
  const [rows] = await sql`select count(*)::int as n from studio.wallet_payments where tx_hash = ${lost}`;
  check('one payment row for the hash, whatever was tried', rows.n === 1);

  // The owner's first ETH payment (2026-10-18, 0xe1f5f745…717d): from a smart wallet, through EntryPoint v0.6,
  // with no value on the transaction. The reader then refused it as "not to us"; the device took that as final
  // and forgot the hash, so the fixed reader never saw it again. Now: that refusal keeps the hash, and the same
  // hash, tried again, is added.
  const { forgetsPending } = await import('../src/lib/wallet/pending');
  const firstEth = keccak256(toHex('first eth payment')) as `0x${string}`;
  const EP6 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
  const beforeEth = await balanceUsd(S, mine);
  useChainForTests(base({ to: EP6, from: BUNDLER, logs: [userOp(me.address, true, EP6)], rise: 0n }));
  const then = await as(mine, me.address, { txHash: firstEth });
  const tj = await then.json();
  check('reproduced: a smart-wallet payment the reader can\'t see is refused as not to us', then.status === 422 && tj.reason === 'not-to-us' && (await balanceUsd(S, mine)) === beforeEth, JSON.stringify(tj));
  check('…and the device keeps its hash (a "not to us" may be our own misreading)', forgetsPending(tj.reason) === false);
  useChainForTests(base({ to: EP6, from: BUNDLER, logs: [userOp(me.address, true, EP6)], rise: 413487687184325n }));
  const later = await as(mine, me.address, { txHash: firstEth });
  const lj2 = await later.json();
  check('…and the kept hash, tried again with the fixed reader, is added once', later.ok && lj2.added > 1 && lj2.added < 1.1 && (await balanceUsd(S, mine)) > beforeEth, JSON.stringify(lj2));
  check('only "already", "failed" and "old" let the device forget a payment', ['already', 'failed', 'old'].every((r) => forgetsPending(r)) && ['not-to-us', 'not-from-you', 'too-small', 'shared-block', undefined].every((r) => !forgetsPending(r)));
  const panel = readFileSync('src/components/wallet.tsx', 'utf8');
  check('the wallet panel tries a remembered payment again when it opens', /tried\.current = true;\s*void claim\(pending, 3\)/.test(panel));

  // --- Linking, end to end: both proofs (owner, 2026-10-22) -------------------------------------------------
  {
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const { createRequire, syncBuiltinESMExports } = await import('node:module');
    const { EventEmitter } = await import('node:events');
    const { Readable } = await import('node:stream');
    // Farcaster's sign-in server, stood in for: our own key in place of auth.farcaster.xyz's (its JWKS is read with https.get).
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256', use: 'sig' };
    const https = createRequire(import.meta.url)('node:https') as typeof import('node:https');
    const realGet = https.get;
    (https as { get: unknown }).get = ((url: string | URL, ...rest: unknown[]) => {
      if (!String(url).startsWith('https://auth.farcaster.xyz/')) return (realGet as (...a: unknown[]) => unknown)(url, ...rest);
      const req = Object.assign(new EventEmitter(), { destroy() {} });
      setImmediate(() => req.emit('response', Object.assign(Readable.from([Buffer.from(JSON.stringify({ keys: [jwk] }))]), { statusCode: 200 })));
      return req;
    }) as typeof https.get;
    syncBuiltinESMExports();
    process.env.NEXT_PUBLIC_URL = 'https://snowmoon.party';
    const farcaster = (fid: number, key = privateKey) =>
      new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'test' }).setIssuer('https://auth.farcaster.xyz').setAudience('snowmoon.party').setSubject(String(fid)).setIssuedAt().setExpirationTime('1h').sign(key);
    const route = await import('../src/app/api/wallet-link/route');
    const { getPerson: person } = await import('../src/lib/auth');
    const LINKER = '0x00000000000000000000000000000000000000b1';
    const acctL = await accountFor(S, LINKER);
    const wTok = signSession(acctL, LINKER)!;
    const post = (h: Record<string, string>, body: unknown) => route.POST(new Request('https://snowmoon.party/api/wallet-link', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }));
    const asWallet = new Request('https://snowmoon.party/api/you', { headers: { authorization: `Bearer ${wTok}` } });
    const fc = await farcaster(9001);

    check('linking: a stood-in Farcaster sign-in reads as its FID (the test\'s own check)', (await person(new Request('https://snowmoon.party/x', { headers: { authorization: `Bearer ${fc}` } }))) === 9001);
    check('a wallet with no link signs in as minus its account', (await person(asWallet)) === -acctL);
    const onlyFc = await post({ authorization: `Bearer ${fc}` }, { fid: 9001 });
    check('linking with only the Farcaster sign-in is refused', onlyFc.status === 401 && (await person(asWallet)) === -acctL);
    const onlyW = await post({ authorization: `Bearer ${wTok}`, 'x-wallet-session': wTok }, { fid: 9001 });
    check('linking with only the wallet sign-in is refused (the wallet can\'t name its own FID)', onlyW.status === 401 && (await person(asWallet)) === -acctL);
    const { privateKey: otherKey } = await generateKeyPair('ES256');
    const forgedFc = await post({ authorization: `Bearer ${await farcaster(9001, otherKey)}`, 'x-wallet-session': wTok }, { fid: 9001 });
    check('a Farcaster token we can\'t verify is refused', forgedFc.status === 401);
    const changedW = await post({ authorization: `Bearer ${fc}`, 'x-wallet-session': wTok.slice(0, -2) + (wTok.endsWith('A') ? 'BB' : 'AA') }, { fid: 9001 });
    check('a changed wallet token is refused', changedW.status === 401);
    const otherFid = await post({ authorization: `Bearer ${fc}`, 'x-wallet-session': wTok }, { fid: 9002 });
    check('the FID shown must be the FID signed in: otherwise nothing is linked', otherFid.status === 409 && (await person(asWallet)) === -acctL);
    const ok = await post({ authorization: `Bearer ${fc}`, 'x-wallet-session': wTok }, { fid: 9001 });
    const okj = await ok.json();
    check('with both proofs, the wallet is linked as signed', ok.ok && okj.linked?.fid === 9001 && okj.linked?.how === 'signed', JSON.stringify(okj));
    check('…and the wallet then signs in as that FID', (await person(asWallet)) === 9001);
    const { actsFor } = await import('../src/lib/wallet/credit');
    check('…and its earlier work is the FID\'s (byline and Hide)', await actsFor(S, 9001, -acctL));
    const steal = await post({ authorization: `Bearer ${await farcaster(9002)}`, 'x-wallet-session': wTok }, { fid: 9002 });
    check('another Farcaster account can\'t take a linked wallet', steal.status === 409 && (await person(asWallet)) === 9001);
    const payW = signSession(await accountFor(S, String(IMAGES.prepaid.payTo)), String(IMAGES.prepaid.payTo))!;
    const pay = await post({ authorization: `Bearer ${fc}`, 'x-wallet-session': payW }, { fid: 9001 });
    check('the payment address can\'t be linked, even with both proofs', pay.status === 403);
    // Unlink.
    const anonDel = await route.DELETE(new Request('https://snowmoon.party/api/wallet-link', { method: 'DELETE' }));
    check('unlinking needs the wallet\'s sign-in', anonDel.status === 401 && (await person(asWallet)) === 9001);
    const fcDel = await route.DELETE(new Request('https://snowmoon.party/api/wallet-link', { method: 'DELETE', headers: { authorization: `Bearer ${fc}` } }));
    check('the Farcaster sign-in alone can\'t unlink the wallet', fcDel.status === 401);
    const del = await route.DELETE(new Request('https://snowmoon.party/api/wallet-link', { method: 'DELETE', headers: { authorization: `Bearer ${wTok}` } }));
    check('the wallet unlinks itself, and signs in as itself again', del.ok && (await person(asWallet)) === -acctL);
    const [u] = await sql`select count(*)::int as n from studio.wallet_links where account_id = ${acctL} and unlinked_at is not null`;
    check('…and the link is kept, with its unlinked_at', u.n === 1);
    (https as { get: unknown }).get = realGet;
    syncBuiltinESMExports();
    delete process.env.NEXT_PUBLIC_URL;
  }
}

{ const { db: d } = await import('../src/lib/db'); await d()?.end(); }
await server.stop();
await db.close();
if (failures.length) {
  console.error(`WALLET TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`wallet tests passed: ${passed} checks (sign-in, sessions, payments read from Base, the balance, caps, privacy)`);
