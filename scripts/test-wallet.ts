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
 *   empty balance is refused; while credit-back is off, nothing comes back even when nothing is made; while on (since
 *   2026-10-22), a Generate that gives no picture (check or model didn't answer, prompt refused, picture dropped) is
 *   credited back once, for exactly its debit; turned off after credits were given, the balance still counts them
 *   and only new credits stop, and turned back on it credits as before; a picture made stays charged; prepaid costs are counted apart from free ones,
 *   so the free daily cap doesn't stop a paying account and prepaid spend has its own cap.
 * - Wallet ↔ Farcaster links (owner, 2026-10-22): verified (Neynar stood in: exactly one FID, two FIDs, none, a
 *   custody address, Neynar down, the lookup off), signed (both proofs through the route, each alone refused),
 *   the daily re-check (at most once a day; a verified link ends when its FID drops the verification, recorded as
 *   'unverified', and can come back later; a tapped link is never re-checked; an unlinked wallet is never looked up;
 *   Neynar down keeps the link),
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
import { IMAGES, REMIX } from '../src/lib/config';

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
check('the price is the estimate plus 30%, rounded up to the nearest $0.001', Math.abs(price - Math.ceil(IMAGES.reserveUsd * 1.3 * 1000 - 1e-9) / 1000) < 1e-9 && price >= IMAGES.reserveUsd * 1.3, String(price));
check('every price is a whole number of tenths of a cent ($0.001)', [IMAGES.reserveUsd, ...[1, 2, 3, 4].map((n) => REMIX.reserveUsd(n)), IMAGES.editReserveUsd(1)].every((r) => Math.abs(priceUsd(r) * 1000 - Math.round(priceUsd(r) * 1000)) < 1e-9));
check('an empty balance is refused', !(await reserve(S, -acct)).ok);
const pay = { txHash: hash, token: 'USDC' as const, amount: 1_000_000n, usd: 1, blockNumber: 100n };
check('a payment is credited', await credit(S, acct, pay));
check('the same payment is not credited twice', !(await credit(S, acct, pay)) && (await balanceUsd(S, acct)) === 1);
check('$1 pays for this many images', (await generationsLeft(S, -acct)) === Math.floor(1 / price));
const r1 = await reserve(S, -acct);
check('a Generate is paid from the balance', r1.ok && Math.abs((await balanceUsd(S, acct)) - (1 - price)) < 1e-6);
await settle(S, { guard: { costUsd: 0.0001, provider: 'groq', verdict: 'ok' } }, undefined, 'prepaid');
check('settling the real costs never changes what was charged (only a credit-back adds to the balance)', Math.abs((await balanceUsd(S, acct)) - (1 - price)) < 1e-6);
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

  // On since 2026-10-22, with Terms 6a (reading B). The off path is still checked: a failure stays charged.
  check('credit-back is on, with the reread Terms 6a', P.creditBack === true);
  P.creditBack = false;
  const offBefore = await balanceUsd(S, acct);
  const off = await paidPicture(S, -acct, req, { checkText: 'a quiet lake', make: unused });
  check('while off, a failed Generate stays charged', !off.ok && off.status === 503 && Math.abs((await balanceUsd(S, acct)) - (offBefore - price)) < 1e-6 && (await credits()) === 0, JSON.stringify(off));

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
  // Reading B (owner, 2026-10-22): a refused prompt gives no picture, so it is credited back too.
  const pic = { role: 'layout', name: 'layout', src: null, file: null, fileSha256: null, bytes: Buffer.from('x'), contentType: 'image/jpeg', width: 8, height: 8 } as never;
  const refused = await generate(S, -acct, req, 'TEST-BLOCK', [pic]);
  check('a refused prompt (the rules check) is credited back in full, and the person is told', !refused.ok && refused.status === 422 && Math.abs((await balanceUsd(S, acct)) - b1) < 1e-6 && (await credits()) === 3 && refused.error.endsWith(IMAGE_WORDING.prepaid.creditedBack), JSON.stringify(refused));
  delete process.env.REMIX_TEST_FAKES;
  const reasonOf = async () => (await sql`select reason from studio.wallet_credits order by id desc limit 1`)[0].reason as string;
  check('…recorded as refused', (await reasonOf()) === 'refused');
  // A blocked name (no check is asked); the name is read from the list at run time, never written here.
  const named = (JSON.parse(readFileSync(path.join(ROOT, 'config', 'image-blocked-names.json'), 'utf8')) as { names: string[] }).names[0];
  const b3 = await balanceUsd(S, acct);
  const blocked = await paidPicture(S, -acct, req, { checkText: `a portrait of ${named}`, make: unused });
  check('a prompt naming someone on the blocked list is credited back in full', !blocked.ok && blocked.status === 422 && Math.abs((await balanceUsd(S, acct)) - b3) < 1e-6 && (await reasonOf()) === 'refused', blocked.ok ? 'made' : blocked.error);
  // The safety checker drops the frame: made, then dropped, so no picture; credited back.
  process.env.REMIX_TEST_FAKES = '1';
  const b4 = await balanceUsd(S, acct);
  const dropped = await generate(S, -acct, req, 'a quiet lake TEST-NSFW', [pic]);
  check('a frame the safety checker drops is credited back in full, recorded as dropped', !dropped.ok && dropped.status === 422 && Math.abs((await balanceUsd(S, acct)) - b4) < 1e-6 && (await reasonOf()) === 'dropped' && dropped.error.endsWith(IMAGE_WORDING.prepaid.creditedBack), JSON.stringify(dropped.ok ? 'made' : dropped));
  // A frame that is made stays charged.
  const b5 = await balanceUsd(S, acct);
  const nBefore = await credits();
  const madeOk = await generate(S, -acct, req, 'a quiet lake', [pic]);
  check('a frame that is made stays charged', madeOk.ok && Math.abs((await balanceUsd(S, acct)) - (b5 - priceUsd(IMAGES.editReserveUsd(1)))) < 1e-6 && (await credits()) === nBefore, madeOk.ok ? '' : madeOk.error);
  delete process.env.REMIX_TEST_FAKES;

  // "The price shown" (Terms 6a): prices are shown as charged, never rounded for show.
  const { exactDollars } = await import('../src/lib/wallet/price-text');
  check('a price is shown in three decimals, exactly as charged', [IMAGES.reserveUsd, ...[1, 2, 3, 4].map((n) => REMIX.reserveUsd(n))].every((r) => /^\d+\.\d{3}$/.test(exactDollars(priceUsd(r))) && Number(exactDollars(priceUsd(r))) === priceUsd(r)) && exactDollars(0.009) === '0.009' && exactDollars(0.054) === '0.054', [IMAGES.reserveUsd, ...[1, 2, 3, 4].map((n) => REMIX.reserveUsd(n))].map((r) => `${exactDollars(priceUsd(r))}=${priceUsd(r)}`).join(' '));

  // Once per debit, for exactly what it took, to the same account.
  const [last] = await sql`select id::int as id, usd::float8 as usd from studio.wallet_debits order by id desc limit 1`;
  const b2 = await balanceUsd(S, acct);
  check('a debit is credited back once only', (await creditBack(S, last.id, 'failed')) && !(await creditBack(S, last.id, 'failed')) && Math.abs((await balanceUsd(S, acct)) - (b2 + last.usd)) < 1e-6);
  const [same] = await sql`select count(*)::int as n from studio.wallet_credits c join studio.wallet_debits d on d.id = c.debit_id where c.usd <> d.usd or c.account_id <> d.account_id`;
  check('every credit is its own debit’s amount, to its own account', same.n === 0);
  check('a free Generate has nothing to credit back', !(await creditBack(S, undefined, 'failed')));

  // Turning it off stops new credits, never hides the ones already given (owner, 2026-10-23).
  const given = await credits();
  const bOn = await balanceUsd(S, acct);
  P.creditBack = false;
  check('turned off after credits were given: the balance still counts them', given > 0 && Math.abs((await balanceUsd(S, acct)) - bOn) < 1e-6, JSON.stringify({ given, bOn }));
  const offAgain = await paidPicture(S, -acct, req, { checkText: 'a quiet lake', make: unused });
  check(
    'while off, a failed Generate stays charged, makes no credit and doesn’t say "added back"',
    !offAgain.ok && Math.abs((await balanceUsd(S, acct)) - (bOn - price)) < 1e-6 && (await credits()) === given && !offAgain.error.includes(IMAGE_WORDING.prepaid.creditedBack) && offAgain.extra.creditedBack === undefined,
    JSON.stringify(offAgain),
  );
  const [offDebit] = await sql`select id::int as id from studio.wallet_debits order by id desc limit 1`;
  check('while off, nothing can be credited back', !(await creditBack(S, offDebit.id, 'failed')) && (await credits()) === given);
  P.creditBack = true;
  const bBack = await balanceUsd(S, acct);
  const onAgain = await paidPicture(S, -acct, req, { checkText: 'a quiet lake', make: unused });
  check('turned back on: a failed Generate is credited back as before, and the person is told', !onAgain.ok && Math.abs((await balanceUsd(S, acct)) - bBack) < 1e-6 && (await credits()) === given + 1 && onAgain.error.endsWith(IMAGE_WORDING.prepaid.creditedBack), JSON.stringify(onAgain));
  P.creditBack = true;
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

// --- Wallet ↔ Farcaster links (owner, 2026-10-22; migration 0026_wallet_links.sql) -------------------------------
{
  const L = await import('../src/lib/wallet/links');
  const { WALLET_LINKS } = await import('../src/lib/config');
  const WL = WALLET_LINKS as { lookUp: boolean; offer: boolean };
  check('the automatic Neynar lookup ships on, with the Privacy line the owner reread (2026-10-22)', WL.lookUp === true);
  check('the signed offer is on (no new outside service)', WL.offer === true);
  const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
  const ONE = addr(0xa1), TWO = addr(0xa2), DOWN = addr(0xa3), NONE = addr(0xa4), LAZY = addr(0xa5), CUSTODY = addr(0xa6), BARE = addr(0xa7);
  const acc = async (a: string) => accountFor(S, a);
  const realFetch = globalThis.fetch;
  let calls = 0;
  const user = (fid: number, verified: string[]) => ({ object: 'user', fid, username: `u${fid}`, custody_address: addr(fid), verified_addresses: { eth_addresses: verified, sol_addresses: [] } });
  // What Neynar says now, for the re-check tests (address → FIDs that verify it), and addresses for which it is down.
  const now: Record<string, number[]> = {};
  const neynarDown = new Set<string>();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    if (u.hostname !== 'api.neynar.com') throw new Error(`unexpected fetch ${u.hostname}`);
    calls++;
    const a = u.searchParams.get('addresses')!;
    if (u.searchParams.get('address_types') !== 'verified_address') return new Response('{}', { status: 400 });
    if (a === DOWN || neynarDown.has(a)) throw new TypeError('fetch failed');
    if (a in now) return new Response(JSON.stringify({ [a]: now[a].map((f) => user(f, [a])) }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (a === NONE) return new Response(JSON.stringify({ code: 'NotFound' }), { status: 404 });
    const by: Record<string, unknown[]> = {
      [ONE]: [user(5001, [ONE])],
      [TWO]: [user(5002, [TWO]), user(5003, [TWO.toUpperCase().replace('0X', '0x')])],
      [LAZY]: [user(5004, [LAZY])],
      // A custody address is not a verification: Neynar may group it under the address, but it doesn't count.
      [CUSTODY]: [user(5005, [])],
      // The two seeded wallets, still verified by their FIDs.
      '0x003276c5c24cdaff1d804170ab5cbb914f51f78a': [user(6852, ['0x003276c5c24cdaff1d804170ab5cbb914f51f78a'])],
      '0x317a1ea96dc4b10c1ea60e3af59c472316d31303': [user(193912, ['0x317a1ea96dc4b10c1ea60e3af59c472316d31303'])],
      [String(IMAGES.prepaid.payTo).toLowerCase()]: [user(5006, [String(IMAGES.prepaid.payTo).toLowerCase()])],
    };
    return new Response(JSON.stringify({ [a]: by[a] ?? [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  process.env.NEYNAR_API_KEY = 'test-key';

  // While off: nothing goes to Neynar, nothing is linked.
  WL.lookUp = false;
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
    ['add a link already unlinked', `insert into studio.wallet_links (account_id, fid, how, unlinked_at, ended_by) values (${accBare}, 7, 'signed', now(), 'person')`],
    ['end a link without saying how', `update studio.wallet_links set unlinked_at = now() where account_id = ${accLuis} and unlinked_at is null`],
    ['end a tapped link as no longer verified', `update studio.wallet_links set unlinked_at = now(), ended_by = 'unverified' where account_id = ${accLuis} and unlinked_at is null`],
  ];
  check('the direct checks run as studio_writer', (await db.query<{ r: string }>('select current_user as r')).rows[0].r === 'studio_writer');
  for (const [what, q] of tries) {
    const r = await db.query(q).then((x) => `allowed (${x.affectedRows ?? 0} rows)`, (e) => (e as Error).message);
    check(`the app can't ${what}`, !r.startsWith('allowed'), r);
  }
  check('after the refusals, the link is as it was', (await L.linkedFidFor(S, accLuis, LUIS)) === 6852 && (await sql`select count(*)::int as n from studio.wallet_links where account_id = ${accLuis}`)[0].n === 2);
  await sql`update studio.wallet_links set unlinked_at = null where account_id = ${accOne}`;
  check('the app can\'t undo an unlink', (await L.readLink(S, accOne)).active === null);

  // --- Looked up again at most once a day; a verified link ends when the FID drops the verification (owner, 2026-10-22).
  const age = (account: number) => sql`update studio.wallet_fid_lookups set fetched_at = now() - interval '25 hours' where account_id = ${account}`;
  const rows = async (account: number) => (await sql`select fid::int as fid, how, unlinked_at, ended_by from studio.wallet_links where account_id = ${account} order by id`) as unknown as { fid: number; how: string; unlinked_at: Date | null; ended_by: string | null }[];
  const RE = addr(0xc1), SG = addr(0xc2), DN = addr(0xc3), BOTH = addr(0xc4);
  const accRe = await acc(RE), accSg = await acc(SG), accDn = await acc(DN), accBoth = await acc(BOTH);
  now[RE] = [5010];
  check('re-check: a verified wallet is linked', (await L.linkedFidFor(S, accRe, RE)) === 5010);
  now[RE] = [];
  const c0 = calls;
  const sameDay = [await L.linkedFidFor(S, accRe, RE), await L.linkedFidFor(S, accRe, RE), await L.linkedFidFor(S, accRe, RE)];
  check('a linked wallet is looked up again at most once a day: within the day, Neynar isn\'t asked and the link stays', sameDay.every((f) => f === 5010) && calls === c0);
  await age(accRe);
  const after = await L.linkedFidFor(S, accRe, RE);
  const reRows = await rows(accRe);
  check('a day later, it is looked up once, and the verified link ends when that FID no longer verifies the address', after === null && calls === c0 + 1 && reRows.length === 1 && reRows[0].unlinked_at !== null && reRows[0].ended_by === 'unverified', JSON.stringify(reRows));
  check('…recorded as ended because the verification was dropped, not by the person', reRows[0].ended_by === 'unverified' && !(await L.readLink(S, accRe)).personUnlinked);
  check('…and the wallet signs in as itself (LINKED_WALLETS doesn\'t bring it back), its work the wallet\'s again', (await L.linkedFidFor(S, accRe, RE)) === null && !(await C.linkedTo(S, [-accRe])).has(-accRe));
  // Chosen: a link that ended automatically can come back, because the person didn't unlink it.
  now[RE] = [5011];
  await age(accRe);
  const back = await L.linkedFidFor(S, accRe, RE);
  const reRows2 = await rows(accRe);
  check('a wallet whose verified link ended automatically is linked again later if a FID verifies it (a new row)', back === 5011 && reRows2.length === 2 && reRows2[1].how === 'verified' && reRows2[1].unlinked_at === null, JSON.stringify(reRows2));
  // Still verified, alongside another FID: kept (the link's FID still verifies it).
  now[BOTH] = [5040];
  await L.linkedFidFor(S, accBoth, BOTH);
  now[BOTH] = [5040, 5041];
  await age(accBoth);
  check('a verified link whose FID still verifies the address is kept, even if another FID verifies it too', (await L.linkedFidFor(S, accBoth, BOTH)) === 5040 && (await rows(accBoth)).length === 1);
  // A tapped link is never re-checked or ended.
  check('re-check: a tapped link', (await L.link(S, accSg, SG, 5020, 'signed')).ok);
  now[SG] = [];
  await age(accSg);
  const c1 = calls;
  const sg = [await L.linkedFidFor(S, accSg, SG), (await L.autoLink(S, accSg, SG)).linked];
  check('a tapped (signed) link is never looked up again or ended', sg.every((f) => f === 5020) && calls === c1 && (await rows(accSg)).every((r) => r.unlinked_at === null));
  // A wallet the person unlinked is never looked up again (ONE, unlinked above), even a day later.
  now[ONE] = [5001];
  await age(accOne);
  const c2 = calls;
  const one = [await L.linkedFidFor(S, accOne, ONE), (await L.autoLink(S, accOne, ONE)).linked];
  check('a wallet the person unlinked is never looked up again, even when a FID verifies it', one[0] === null && one[1] === null && calls === c2 && (await rows(accOne)).every((r) => r.unlinked_at !== null && r.ended_by === 'person'), JSON.stringify({ one, calls, c2 }));
  // Neynar down during a re-check: the link is kept.
  now[DN] = [5030];
  check('re-check: linked before Neynar went down', (await L.linkedFidFor(S, accDn, DN)) === 5030);
  neynarDown.add(DN);
  await age(accDn);
  const c3 = calls;
  const dn = await L.linkedFidFor(S, accDn, DN);
  check('Neynar down during a re-check keeps the link (and nothing is kept from the failed lookup)', dn === 5030 && calls === c3 + 1 && (await rows(accDn)).every((r) => r.unlinked_at === null) && (await sql`select count(*)::int as n from studio.wallet_fid_lookups where account_id = ${accDn}`)[0].n === 0);
  // While the lookup is off, nothing is re-checked.
  WL.lookUp = false;
  neynarDown.delete(DN);
  now[DN] = [];
  const c4 = calls;
  check('while the lookup is off, a verified link is kept and nothing is sent', (await L.linkedFidFor(S, accDn, DN)) === 5030 && calls === c4);

  WL.lookUp = true;
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
  {
    // The 30-day note (owner, 2026-10-22), in the owner's words, gone on its own after WALLET_LINKS.announceUntil.
    const { LINK_NOTE, linkNoteShown } = await import('../src/lib/wallet/announce');
    const { WALLET_LINKS: WLN } = await import('../src/lib/config');
    const until = WLN.announceUntil;
    check('the note is in the owner\'s words', LINK_NOTE === 'New: if your wallet is verified on Farcaster, it now links to that account automatically. Privacy §7.');
    check('the note ends 30 days after the earliest merge day (2026-11-21 or later)', until >= '2026-11-21');
    check('the note shows before its end date, through the whole last day', linkNoteShown(new Date('2026-10-22T12:00:00Z')) && linkNoteShown(new Date(`${until}T23:59:59Z`)));
    check('…and is gone after it, with no deploy', !linkNoteShown(new Date(Date.parse(`${until}T00:00:00Z`) + 24 * 3600 * 1000)) && !linkNoteShown(new Date('2027-01-01T00:00:00Z')));
    const you = readFileSync('src/components/you-page.tsx', 'utf8');
    check('the note is in the wallet panel and on the Dashboard, by the dated helper', /linkNoteShown\(\)/.test(panel) && /\{linkHint && <LinkNote \/>\}/.test(panel) && (you.match(/<LinkNote className="you-note" \/>/g) ?? []).length === 2);
  }
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
    check('the Farcaster sign-in without naming a wallet unlinks nothing', fcDel.status === 401 && (await person(asWallet)) === 9001);
    const delAs = (tok: string, wallet: unknown) => route.DELETE(new Request('https://snowmoon.party/api/wallet-link', { method: 'DELETE', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ wallet }) }));
    const otherDel = await delAs(await farcaster(9002), LINKER);
    check('another Farcaster account can\'t unlink a wallet linked to someone else', otherDel.status === 409 && (await person(asWallet)) === 9001);
    const { walletLinksOf } = await import('../src/lib/wallet/links');
    check('the linked Farcaster account sees the wallet among its links', (await walletLinksOf(S, 9001)).some((r) => r.account === acctL));
    const fidDel = await delAs(fc, LINKER.toUpperCase().replace('0X', '0x'));
    const [byFid] = await sql`select ended_by from studio.wallet_links where account_id = ${acctL} and unlinked_at is not null`;
    check('either side can unlink: the linked Farcaster account unlinks the wallet, ended by the person, and the wallet signs in as itself again', fidDel.ok && (await person(asWallet)) === -acctL && byFid?.ended_by === 'person' && !(await walletLinksOf(S, 9001)).some((r) => r.account === acctL));
    check('…and unlinking it again from the Farcaster side finds nothing', (await delAs(fc, LINKER)).status === 409);
    // Linked again (a new row), to unlink from the wallet's side.
    const again2 = await post({ authorization: `Bearer ${fc}`, 'x-wallet-session': wTok }, { fid: 9001 });
    check('linked again with both proofs', again2.ok && (await person(asWallet)) === 9001);
    const del = await route.DELETE(new Request('https://snowmoon.party/api/wallet-link', { method: 'DELETE', headers: { authorization: `Bearer ${wTok}` } }));
    check('the wallet unlinks itself, and signs in as itself again', del.ok && (await person(asWallet)) === -acctL);
    const [u] = await sql`select count(*)::int as n from studio.wallet_links where account_id = ${acctL} and unlinked_at is not null`;
    check('…and both ended links are kept, with their unlinked_at', u.n === 2);
    (https as { get: unknown }).get = realGet;
    syncBuiltinESMExports();
    delete process.env.NEXT_PUBLIC_URL;
  }
}

// --- Picks at Generate for a wallet account, and the price shown is the price charged (owner, 2026-10-23) ---------
// "#38: (a) open picks to everyone at Generate, wallets too. If a pick raises the price, the Generate price must
// include it." Through the real routes: /api/images/status (what the composer shows) and /api/images/generate (what
// reserve() takes), for a wallet account, without a pick, with a pick (its text only) and with the pick's pictures
// as references. Nothing paid is called: the prompt check is offline, so each Generate is credited back.
{
  const { createHash } = await import('node:crypto');
  const { db: routeDb } = await import('../src/lib/db');
  const D = routeDb()!;
  const S = D as unknown as Sql;
  const Des = await import('../src/lib/images/designs');
  const { referenceCount, generateReserveUsd, paysFor } = await import('../src/lib/images/price');
  const { recordConsent, consentWording } = await import('../src/lib/consent');
  const { loadChapter } = await import('../src/lib/book');
  const status = await import('../src/app/api/images/status/route');
  const gen = await import('../src/app/api/images/generate/route');
  const env = { FAL_KEY: process.env.FAL_KEY, R2: process.env.R2_IMAGES_PUBLIC_URL, LEGAL: process.env.APP_LEGAL_PAGES, ALERT: process.env.SNOWMOON_ALERT_URL };
  process.env.FAL_KEY = 'test-not-a-key';
  process.env.R2_IMAGES_PUBLIC_URL = 'https://pictures.test';
  process.env.APP_LEGAL_PAGES = 'terms+privacy';
  process.env.SNOWMOON_ALERT_URL = 'https://alerts.test/x';
  // Three views, served from the public bucket stand-in with their own sha256; anything else is offline (the prompt check too).
  const views = ['front', 'side', 'back'].map((k) => {
    const bytes = Buffer.from(`view ${k}`);
    return { k, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), url: `https://pictures.test/${k}.jpg` };
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const v = views.find((x) => x.url === url);
    if (v) return new Response(v.bytes);
    throw new Error('offline');
  }) as typeof fetch;
  const viewPic = (v: (typeof views)[number]) => ({ url: v.url, sha256: v.sha256, recipe: { prompt: 'p', model: 'flux2-klein-4b-edit', endpoint: 'fal-ai/flux-2/klein/4b/edit', host: 'fal.ai', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.01, made_at: '2026-10-23T00:00:00Z', width: 576, height: 768, checks: { prompt: { model: 'g', verdict: 'ok' as const }, host_safety_checker: 'passed' as const }, assist: null } });
  // An earlier check fills today's prepaid cap on purpose; this one starts from an empty day.
  await db.exec(`reset role; delete from studio.image_costs where funded = 'prepaid'; set role studio_writer;`);
  await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  const sheet = await Des.makeDesign(S, { fid: 6786, mode: 'create', kind: 'character', character: Des.bookCharacter('zei')!, body: { title: '', text: 'Eighteen, slight, short dark hair', samples: [], views: { front: viewPic(views[0]), side: viewPic(views[1]), back: viewPic(views[2]) }, by_name: 'nate', by_name_source: 'relay', assist: null } });

  const payer = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
  const acctP = await accountFor(S, payer.address);
  await credit(S, acctP, { txHash: keccak256(toHex('picks price payment')), token: 'USDC', amount: 1_000_000n, usd: 1, blockNumber: 100n });
  await recordConsent(-acctP, consentWording().sha256);
  const auth = { authorization: `Bearer ${signSession(acctP, payer.address)}` };
  const ch = loadChapter(1)!;
  const start = ch.blocks[0].idx;
  const shown = async () => (await (await status.GET(new Request(`https://snowmoon.party/api/images/status?chapter=1&start=${start}&end=${start}`, { headers: auth }))).json()) as {
    prepaid?: { balanceUsd: number; priceUsd: number; pricesUsd: number[] }; picks: { characters: { versionId: string; views: number }[] }; eligible: boolean;
  };
  const lastDebit = async () => (await D`select id::int as id, usd::float8 as usd from studio.wallet_debits where account_id = ${acctP} order by id desc limit 1`)[0] as { id: number; usd: number } | undefined;
  const creditOf = async (id: number) => (await D`select usd::float8 as usd from studio.wallet_credits where debit_id = ${id}`)[0]?.usd as number | undefined;
  const generate = (extra: Record<string, unknown>) =>
    gen.POST(new Request('https://snowmoon.party/api/images/generate', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ chapter: 1, start, end: start, prompt: 'a quiet lake at dusk', style: 'techno-vistas', ...extra }) }));
  // The composer's own price: pricesUsd[n], n counted from the chosen sheets' views as the server counts them.
  const composerPrice = (st: Awaited<ReturnType<typeof shown>>, chosen: string[], reference: boolean) => {
    const chips = st.picks.characters.filter((c) => chosen.includes(c.versionId));
    const n = reference && chips.some((c) => c.views > 0) ? referenceCount(chips.map((c) => c.views)) : 0;
    return st.prepaid!.pricesUsd[n];
  };
  const tryOne = async (label: string, st: Awaited<ReturnType<typeof shown>>, chosen: string[], reference: boolean) => {
    const price = composerPrice(st, chosen, reference);
    const before = await balanceUsd(S, acctP);
    const prev = (await lastDebit())?.id ?? 0;
    const res = await generate({ characters: chosen, reference });
    const out = await res.json();
    const d = await lastDebit();
    const charged = d && d.id !== prev ? d.usd : null;
    check(`${label}: the price shown is the amount charged`, charged !== null && Math.abs(charged - price) < 1e-9, JSON.stringify({ price, charged, status: res.status, out }));
    check(`${label}: the Generate stopped at the offline prompt check, after the charge`, res.status === 503 && /prompt check did not answer/.test(out.error) && out.creditedBack === true, JSON.stringify(out));
    check(`${label}: credited back exactly what was charged`, d !== undefined && (await creditOf(d.id)) === d.usd && Math.abs((await balanceUsd(S, acctP)) - before) < 1e-9);
    return price;
  };

  const none = await shown();
  check('a wallet account is told every Generate price it can start, as reserve() charges it', Array.isArray(none.prepaid?.pricesUsd) && none.prepaid!.pricesUsd.length === IMAGES.maxReferences + 1 && none.prepaid!.pricesUsd.every((p, n) => p === priceUsd(generateReserveUsd(n))) && none.prepaid!.priceUsd === priceUsd(IMAGES.reserveUsd), JSON.stringify(none.prepaid));
  check('a wallet account may generate here (the test setup)', none.eligible === true);
  check('no pick yet: none offered', none.picks.characters.length === 0);
  const p0 = await tryOne('a wallet Generate without a pick', none, [], false);

  await Des.setPick(S, -acctP, sheet.versionId);
  const withPick = await shown();
  check('a wallet account is offered its own picks at Generate', withPick.picks.characters.map((c) => c.versionId).join() === sheet.versionId && withPick.picks.characters[0].views === 3, JSON.stringify(withPick.picks));
  const p1 = await tryOne('a wallet Generate with a pick (its text added)', withPick, [sheet.versionId], false);
  check('a pick used as text does not change the price', p1 === p0);
  const p2 = await tryOne('a wallet Generate with a pick and its pictures as references', withPick, [sheet.versionId], true);
  check('a pick\'s pictures as references raise the price, and the price shown includes them', p2 === priceUsd(IMAGES.editReserveUsd(3)) && p2 > p0, `${p0} ${p2}`);
  check('the balance counts Generates in whole tenths of a cent', paysFor(0.018, 0.009) === 2 && paysFor(0.0179, 0.009) === 1 && paysFor(1, 0) === 0);
  // Someone else's pick is never used, wallet or not.
  const other2 = await accountFor(S, other.address);
  check('a wallet account can\'t use another account\'s pick', (await Des.myPicks(S, -other2)).length === 0);

  globalThis.fetch = realFetch;
  for (const [k, v] of [['FAL_KEY', env.FAL_KEY], ['R2_IMAGES_PUBLIC_URL', env.R2], ['APP_LEGAL_PAGES', env.LEGAL], ['SNOWMOON_ALERT_URL', env.ALERT]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
// The composer and Generate count reference pictures with the same helper, and price them with the same reserve.
{
  const composer = readFileSync(path.join(ROOT, 'src/components/image-composer.tsx'), 'utf8');
  const genSrc = readFileSync(path.join(ROOT, 'src/app/api/images/generate/route.ts'), 'utf8');
  const statusSrc = readFileSync(path.join(ROOT, 'src/app/api/images/status/route.ts'), 'utf8');
  check('the composer shows pricesUsd[the reference pictures it will send]', /referenceCount\(sheetChips\.map\(\(c\) => c\.views\)\)/.test(composer) && /pricesUsd\?\.\[references\]/.test(composer) && /priceOnButton\(exactDollars\(shownPrice\)\)/.test(composer));
  check('Generate reserves generateReserveUsd(the pictures it sends), and the status route prices the same', /reserveUsd: generateReserveUsd\(pictures\.length\)/.test(genSrc) && /priceUsd\(generateReserveUsd\(n\)\)/.test(statusSrc));
  check('Generate no longer refuses a wallet account\'s reference pictures', !/aren’t available for wallet accounts/.test(genSrc));
}

{ const { db: d } = await import('../src/lib/db'); await d()?.end(); }
await server.stop();
await db.close();
if (failures.length) {
  console.error(`WALLET TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`wallet tests passed: ${passed} checks (sign-in, sessions, payments read from Base, the balance, caps, privacy)`);
