/**
 * Paying per person, the server side (src/lib/balance/person.ts; DRAFT, PERSON_BALANCE off). Drafted by a coding
 * agent (Claude, a closed model by Anthropic). Fails (exit 1) on any problem.
 *
 *   npm run test:person-balance-code
 *
 * No network: Base is a stub, every migration (with NEXT_person_balance) runs in an in-memory Postgres (PGlite),
 * talked to as studio_writer. No real payment, no production call. Checks:
 * - the signed statement: accepted only for this domain, Base, our nonce, our statement, the session's own person
 *   (never another person, never a wallet account) and that address's real signature;
 * - claims: off while the switch is off; a payment from the intent's wallet credited once, to the intent's person
 *   only; another person's intent, a used intent, a payment from another wallet, too early, too late, refused; one
 *   transaction never credited twice across a person and a wallet account, either order;
 * - spending (Pictures' reserve and paidPicture): free first; then the balance, at the wallets' price, counted as
 *   prepaid, with no per-person cap but the site-wide prepaid cap; while off, nothing changes; a Generate that gives no
 *   picture is credited back to the same person once.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeAbiParameters, keccak256, pad, toHex, type PublicClient } from 'viem';
import { IMAGES, PERSON_BALANCE } from '../src/lib/config';

process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const json = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v));

check('the switch is off in the code as committed', PERSON_BALANCE.enabled === false);

const { newNonce } = await import('../src/lib/wallet/session');
const { payMessage, verifyPayIntent, recordIntent, claim, personBalanceUsd, personCreditBack, holdsPersonBalance } = await import('../src/lib/balance/person');
const me = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const other = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const FID = 424242;
const SKY = -1_000_000_042;
const offline = { verifySiweMessage: async () => false } as unknown as PublicClient;
const msg = (person: number, o: { domain?: string; nonce?: string; address?: `0x${string}` } = {}) =>
  payMessage({ domain: o.domain ?? 'snowmoon.party', uri: 'https://snowmoon.party', address: o.address ?? me.address, person, nonce: o.nonce ?? newNonce()! });

// --- The signed statement -------------------------------------------------------------------------------------------
check('who holds a person balance: a Farcaster ID and a Bluesky account, never a wallet account or zero', holdsPersonBalance(FID) && holdsPersonBalance(SKY) && !holdsPersonBalance(-5) && !holdsPersonBalance(-999_999_999) && !holdsPersonBalance(0));
{
  const m = msg(FID);
  check('a wallet\'s statement for this person is accepted', (await verifyPayIntent(m, await me.signMessage({ message: m }), 'snowmoon.party', FID, offline)) === me.address.toLowerCase());
  check('the same statement from another person\'s session is refused', (await verifyPayIntent(m, await me.signMessage({ message: m }), 'snowmoon.party', SKY, offline)) === null);
  const w = msg(-5);
  check('a statement for a wallet account is refused', (await verifyPayIntent(w, await me.signMessage({ message: w }), 'snowmoon.party', -5, offline)) === null);
  const d = msg(FID, { domain: 'evil.example' });
  check('a statement for another domain is refused', (await verifyPayIntent(d, await me.signMessage({ message: d }), 'snowmoon.party', FID, offline)) === null);
  const n = msg(FID, { nonce: 'a'.repeat(74) });
  check('a nonce we did not issue is refused', (await verifyPayIntent(n, await me.signMessage({ message: n }), 'snowmoon.party', FID, offline)) === null);
  check('someone else signing my address is refused', (await verifyPayIntent(m, await other.signMessage({ message: m }), 'snowmoon.party', FID, offline)) === null);
  const plain = m.replace(/Add payments from this wallet[^\n]*/, 'Sign in to Snowmoon.');
  check('a different statement (a plain sign-in) is refused', (await verifyPayIntent(plain, await me.signMessage({ message: plain }), 'snowmoon.party', FID, offline)) === null);
  const sky = msg(SKY);
  check('a Bluesky person\'s statement is accepted for that person', (await verifyPayIntent(sky, await me.signMessage({ message: sky }), 'snowmoon.party', SKY, offline)) === me.address.toLowerCase());
}

// --- The database ---------------------------------------------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
const PORT = 54339;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
type Sql = Parameters<typeof claim>[0];
const S = sql as unknown as Sql;

// --- Base, stubbed ----------------------------------------------------------------------------------------------------
const P = IMAGES.prepaid as { payTo: `0x${string}` | null };
const US = '0x000000000000000000000000000000000000beef' as const;
P.payTo = US;
const transferTopic = keccak256(toHex('Transfer(address,address,uint256)'));
const usdcLog = (from: string, value: bigint) => ({
  address: IMAGES.prepaid.usdc, data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  topics: [transferTopic, pad(from as `0x${string}`), pad(US)],
});
const tx = (label: string) => keccak256(toHex(label)) as `0x${string}`;
function base(o: { from?: string; usd?: number; at?: number } = {}) {
  return {
    getTransactionReceipt: async () => ({ status: 'success', blockNumber: 100n, logs: [usdcLog(o.from ?? me.address, BigInt(Math.round((o.usd ?? 5) * 1e6)))] }),
    getBlockNumber: async () => 110n,
    getBlock: async () => ({ timestamp: BigInt(Math.floor((o.at ?? Date.now()) / 1000)), transactions: [] }),
    getTransaction: async () => ({ to: IMAGES.prepaid.usdc, from: o.from ?? me.address, value: 0n }),
  } as unknown as PublicClient;
}

// --- Claims ---------------------------------------------------------------------------------------------------------
const PB = PERSON_BALANCE as { enabled: boolean };
const fidIntent = await recordIntent(S, FID, me.address);
check('while off, a claim is refused and nothing is credited', (await claim(S, FID, fidIntent, tx('a'), base())).ok === false && (await personBalanceUsd(S, FID)) === 0);
PB.enabled = true;
const why = (r: Awaited<ReturnType<typeof claim>>) => (r.ok ? 'ok' : r.why);
check('another person can\'t claim through my intent', why(await claim(S, SKY, fidIntent, tx('a'), base())) === 'not-yours');
check('a payment from another wallet is refused', why(await claim(S, FID, fidIntent, tx('a'), base({ from: other.address }))) === 'not-from-you');
check('a payment made well before the intent is refused', why(await claim(S, FID, fidIntent, tx('a'), base({ at: Date.now() - 3600_000 }))) === 'too-early');
const r1 = await claim(S, FID, fidIntent, tx('a'), base());
check('a $5 payment from the intent\'s wallet is credited to the person', r1.ok && r1.usd === 5 && r1.balanceUsd === 5, json(r1));
check('the same intent is used once', why(await claim(S, FID, fidIntent, tx('b'), base())) === 'used');
const again = await recordIntent(S, FID, me.address);
check('the same transaction through a new intent: already added', why(await claim(S, FID, again, tx('a'), base())) === 'already');
{
  const { accountFor, credit } = await import('../src/lib/wallet/credits');
  const acct = await accountFor(S, me.address);
  check('the wallet signing in itself can\'t add the person\'s transaction again', !(await credit(S, acct, { txHash: tx('a'), token: 'USDC', amount: 5_000_000n, usd: 5, blockNumber: 100n })));
  check('a wallet payment, credited to the wallet account first…', await credit(S, acct, { txHash: tx('w'), token: 'USDC', amount: 5_000_000n, usd: 5, blockNumber: 100n }));
  check('…can\'t then be claimed by a person', why(await claim(S, FID, again, tx('w'), base())) === 'already');
}
await db.exec(`reset role; insert into studio.person_pay_intents (person, address, created_at) values (${FID}, '${me.address.toLowerCase()}', now() - interval '2 days'); set role studio_writer;`);
const [{ id: oldIntent }] = await sql`select id::text as id from studio.person_pay_intents where created_at < now() - interval '1 day'`;
check('a payment more than a day after the intent is refused', why(await claim(S, FID, oldIntent, tx('c'), base())) === 'too-late');
const skyIntent = await recordIntent(S, SKY, other.address);
const r2 = await claim(S, SKY, skyIntent, tx('s'), base({ from: other.address, usd: 1 }));
check('a Bluesky person is credited too, to its own balance only', r2.ok && (await personBalanceUsd(S, SKY)) === 1 && (await personBalanceUsd(S, FID)) === 5, json(r2));
let threw = false;
await recordIntent(S, -5, me.address).catch(() => (threw = true));
check('no intent for a wallet account', threw);

// --- Spending (Pictures) --------------------------------------------------------------------------------------------
const { reserve, settle } = await import('../src/lib/images/limits');
const { priceUsd } = await import('../src/lib/wallet/credits');
const { paidPicture } = await import('../src/lib/images/paid');
const price = priceUsd(IMAGES.reserveUsd);
const free = async (person: number) => (await sql`select count(*)::int as n from studio.image_asks where fid = ${person}`)[0].n as number;
const r3 = await reserve(S, FID);
check('free first: a Generate with free ones left is free, not charged', r3.ok && !r3.personDebitId && r3.funded === undefined && (await personBalanceUsd(S, FID)) === 5 && (await free(FID)) === 1, json(r3));
if (r3.ok) await settle(S, {}, undefined, 'free');
await db.exec(`reset role; insert into studio.image_asks (fid) select ${FID} from generate_series(1, ${IMAGES.generationsPerDay}); set role studio_writer;`);
PB.enabled = false;
const r4 = await reserve(S, FID);
check('while off, a person with a balance and no free ones left is refused as before (limit)', !r4.ok && r4.refusal === 'limit' && (await personBalanceUsd(S, FID)) === 5, json(r4));
PB.enabled = true;
const r5 = await reserve(S, FID);
check('free ones used up: the Generate is paid from the person\'s balance at the wallets\' price, counted as prepaid', r5.ok && r5.funded === 'prepaid' && typeof r5.personDebitId === 'number' && Math.abs((await personBalanceUsd(S, FID)) - (5 - price)) < 1e-6, json(r5));
check('…and not counted as a free one', (await free(FID)) === IMAGES.generationsPerDay + 1);
if (r5.ok) await settle(S, {}, undefined, 'prepaid');
const prepaidReserved = (await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where funded = 'prepaid'`)[0].usd as number;
check('the reservation was counted as prepaid and settled', Math.abs(prepaidReserved) < 1e-9, String(prepaidReserved));
// No per-person cap: many in a row, while the balance lasts.
let n = 0;
while (n < 2000) {
  const r = await reserve(S, FID);
  if (!r.ok) break;
  await settle(S, {}, undefined, 'prepaid');
  n++;
}
const paidCount = Math.floor((5 - price) / price + 1e-9);
check(`no per-person cap: as many as the balance covers (${n})`, n === paidCount, `${n} vs ${paidCount}`);
const r6 = await reserve(S, FID);
check('an exhausted balance gives the free refusal (limit)', !r6.ok && r6.refusal === 'limit', json(r6));
// The site-wide prepaid cap still applies.
await db.exec(`reset role; insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('prepaid', 'image', 'x', 'x', 'ok', 1, ${IMAGES.prepaid.dailyCapUsd}); set role studio_writer;`);
await db.exec(`reset role; insert into studio.image_asks (fid) select 434343 from generate_series(1, ${IMAGES.generationsPerDay}); set role studio_writer;`);
const capIntent = await recordIntent(S, 434343, other.address);
await claim(S, 434343, capIntent, tx('cap'), base({ from: other.address, usd: 2 }));
const r7 = await reserve(S, 434343);
check('the site-wide prepaid daily cap still applies', !r7.ok && r7.refusal === 'prepaid-spend' && (await personBalanceUsd(S, 434343)) === 2, json(r7));
await db.exec(`reset role; delete from studio.image_costs where funded = 'prepaid'; set role studio_writer;`);

// A paid Generate that gives no picture is credited back to the same person, once.
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  delete process.env.VERCEL;
  const before = await personBalanceUsd(S, 434343);
  const req = new Request('https://snowmoon.party/api/images/generate', { method: 'POST' });
  const out = await paidPicture(S, 434343, req, { checkText: 'a quiet lake', make: async () => { throw new Error('unused'); } });
  check('a paid Generate whose prompt check fails is credited back to the person in full', !out.ok && out.extra.creditedBack === true && Math.abs((await personBalanceUsd(S, 434343)) - before) < 1e-6, json(out));
  const [{ id: lastDebit }] = await sql`select max(id)::int as id from studio.person_debits where person = 434343`;
  check('…once only', !(await personCreditBack(S, lastDebit, 'failed')));
  const wc = (await sql`select count(*)::int as n from studio.wallet_credits`)[0].n;
  check('…and nothing goes to a wallet account', wc === 0);
  globalThis.fetch = realFetch;
}

await sql.end();
await server.stop();
await db.close();
if (failures.length) {
  console.log(`test:person-balance-code: ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`test:person-balance-code: ${passed} checks passed (statement, claims, spending, credit-back)`);
process.exit(0);
