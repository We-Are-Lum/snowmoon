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

check('the switch is on in the code as committed (with the browser side and the approved legal lines)', PERSON_BALANCE.enabled === true);
(PERSON_BALANCE as { enabled: boolean }).enabled = false; // the claims below start with it off

const { newNonce } = await import('../src/lib/wallet/session');
const { payMessage, verifyPayIntent, recordIntent, claim, personBalanceUsd, personCreditBack, holdsPersonBalance, accountWords, statementFor } = await import('../src/lib/balance/person');
const me = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const other = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const FID = 424242;
const SKY = -1_000_000_042;
const offline = { verifySiweMessage: async () => false } as unknown as PublicClient;
const WORDS = (person: number) => (person > 0 ? `your Farcaster account @alice (FID ${person})` : person <= -1e9 ? 'your Bluesky account @alice.bsky.social' : 'a wallet');
const msg = (person: number, o: { domain?: string; nonce?: string; address?: `0x${string}`; words?: string } = {}) =>
  payMessage({ domain: o.domain ?? 'snowmoon.party', uri: 'https://snowmoon.party', address: o.address ?? me.address, person, words: o.words ?? WORDS(person), nonce: o.nonce ?? newNonce()! });

// --- The signed statement -------------------------------------------------------------------------------------------
check('who holds a person balance: a Farcaster ID and a Bluesky account, never a wallet account or zero', holdsPersonBalance(FID) && holdsPersonBalance(SKY) && !holdsPersonBalance(-5) && !holdsPersonBalance(-999_999_999) && !holdsPersonBalance(0));
{
  const m = msg(FID);
  check('a wallet\'s statement for this person is accepted', (await verifyPayIntent(m, await me.signMessage({ message: m }), 'snowmoon.party', FID, WORDS(FID), offline)) === me.address.toLowerCase());
  check('the same statement from another person\'s session is refused', (await verifyPayIntent(m, await me.signMessage({ message: m }), 'snowmoon.party', SKY, WORDS(SKY), offline)) === null);
  const w = msg(-5);
  check('a statement for a wallet account is refused', (await verifyPayIntent(w, await me.signMessage({ message: w }), 'snowmoon.party', -5, WORDS(-5), offline)) === null);
  const d = msg(FID, { domain: 'evil.example' });
  check('a statement for another domain is refused', (await verifyPayIntent(d, await me.signMessage({ message: d }), 'snowmoon.party', FID, WORDS(FID), offline)) === null);
  const n = msg(FID, { nonce: 'a'.repeat(74) });
  check('a nonce we did not issue is refused', (await verifyPayIntent(n, await me.signMessage({ message: n }), 'snowmoon.party', FID, WORDS(FID), offline)) === null);
  check('someone else signing my address is refused', (await verifyPayIntent(m, await other.signMessage({ message: m }), 'snowmoon.party', FID, WORDS(FID), offline)) === null);
  const plain = m.replace(/Add payments from this wallet[^\n]*/, 'Sign in to Snowmoon.');
  check('a different statement (a plain sign-in) is refused', (await verifyPayIntent(plain, await me.signMessage({ message: plain }), 'snowmoon.party', FID, WORDS(FID), offline)) === null);
  check('the statement names the account in words, and the request id by number', m.includes(statementFor(WORDS(FID))) && m.includes('@alice (FID 424242)') && m.includes('Request ID: person:424242'), m);
  check('a statement whose words name another account (an old name) is refused', (await verifyPayIntent(m, await me.signMessage({ message: m }), 'snowmoon.party', FID, 'your Farcaster account @bob (FID 424242)', offline)) === null);
  check('no words for the account (a Lens or Bluesky account we don\'t have): refused', (await verifyPayIntent(m, await me.signMessage({ message: m }), 'snowmoon.party', FID, null, offline)) === null);
  check('words: a Farcaster account with its name', (await accountWords(null, FID, async () => 'alice')) === 'your Farcaster account @alice (FID 424242)');
  check('words: a Farcaster account whose name can\'t be read', (await accountWords(null, FID, async () => { throw new Error('down'); })) === 'your Farcaster account FID 424242');
  check('words: none for a wallet account', (await accountWords(null, -5)) === null);
  const sky = msg(SKY);
  check('a Bluesky person\'s statement is accepted for that person', (await verifyPayIntent(sky, await me.signMessage({ message: sky }), 'snowmoon.party', SKY, WORDS(SKY), offline)) === me.address.toLowerCase());
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
check('while off, a claim is refused and nothing is credited', (await claim(S, FID, tx('a'), base(), fidIntent)).ok === false && (await personBalanceUsd(S, FID)) === 0);
PB.enabled = true;
const why = (r: Awaited<ReturnType<typeof claim>>) => (r.ok ? 'ok' : r.why);
check('another person can\'t claim through my intent', why(await claim(S, SKY, tx('a'), base(), fidIntent)) === 'not-yours');
check('a payment from another wallet is refused', why(await claim(S, FID, tx('a'), base({ from: other.address }), fidIntent)) === 'not-from-you');
check('a payment made well before the intent is refused', why(await claim(S, FID, tx('a'), base({ at: Date.now() - 3600_000 }), fidIntent)) === 'too-early');
const r1 = await claim(S, FID, tx('a'), base(), fidIntent);
check('a $5 payment from the intent\'s wallet is credited to the person', r1.ok && r1.usd === 5 && r1.balanceUsd === 5, json(r1));
check('the same intent is used once', why(await claim(S, FID, tx('b'), base(), fidIntent)) === 'used');
const again = await recordIntent(S, FID, me.address);
check('the same transaction through a new intent: already added', why(await claim(S, FID, tx('a'), base(), again)) === 'already');
{
  const { accountFor, credit } = await import('../src/lib/wallet/credits');
  const acct = await accountFor(S, me.address);
  check('the wallet signing in itself can\'t add the person\'s transaction again', !(await credit(S, acct, { txHash: tx('a'), token: 'USDC', amount: 5_000_000n, usd: 5, blockNumber: 100n })));
  check('a wallet payment, credited to the wallet account first…', await credit(S, acct, { txHash: tx('w'), token: 'USDC', amount: 5_000_000n, usd: 5, blockNumber: 100n }));
  check('…can\'t then be claimed by a person', why(await claim(S, FID, tx('w'), base(), again)) === 'already');
}
await db.exec(`reset role; insert into studio.person_pay_intents (person, address, created_at) values (${FID}, '${me.address.toLowerCase()}', now() - interval '2 days'); set role studio_writer;`);
const [{ id: oldIntent }] = await sql`select id::text as id from studio.person_pay_intents where created_at < now() - interval '1 day'`;
check('a payment more than a day after the intent is refused', why(await claim(S, FID, tx('c'), base(), oldIntent)) === 'too-late');
const skyIntent = await recordIntent(S, SKY, other.address);
const r2 = await claim(S, SKY, tx('s'), base({ from: other.address, usd: 1 }), skyIntent);
check('a Bluesky person is credited too, to its own balance only', r2.ok && (await personBalanceUsd(S, SKY)) === 1 && (await personBalanceUsd(S, FID)) === 5, json(r2));
// By its hash alone (the page keeps only the hash, Privacy §3): the person's own signed wallets are tried.
{
  const P2 = 515151;
  check('by hash, before any wallet signed for the person: no intent', why(await claim(S, P2, tx('h1'), base())) === 'no-intent');
  await recordIntent(S, P2, other.address);
  await recordIntent(S, P2, me.address);
  const h = await claim(S, P2, tx('h1'), base());
  check('by hash: found from the paying wallet\'s own intent and credited', h.ok && (await personBalanceUsd(S, P2)) === 5, json(h));
  check('by hash: a payment from a wallet that never signed for the person is refused', why(await claim(S, P2, tx('h2'), base({ from: '0x00000000000000000000000000000000000c0ffe' }))) === 'not-from-you');
  check('by hash: the wallet\'s one intent is used; a second payment needs a new signature', why(await claim(S, P2, tx('h3'), base())) !== 'ok');
  check('by hash: another person can\'t take it through their own intents', why(await claim(S, FID, tx('h4'), base({ from: other.address }))) !== 'ok' && (await personBalanceUsd(S, FID)) === 5);
  const r = await claim(S, P2, tx('h5'), base({ from: other.address, usd: 2 }));
  check('by hash: the person\'s other wallet still has its own intent', r.ok && (await personBalanceUsd(S, P2)) === 7, json(r));
}
// The account in words, for a Lens and a Bluesky account (studio.social_accounts).
{
  await db.exec(`reset role; insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:z72i7hdynmk6r22z27h6tvur', 'alice.bsky.social'), ('lens', '0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'lens/alice'), ('bluesky', 'did:plc:abcdefghijklmnopqrstuvwx', null); set role studio_writer;`);
  const ids = (await sql`select id::int as id, kind, handle from studio.social_accounts order by id`) as unknown as { id: number; kind: string; handle: string | null }[];
  const { socialPerson } = await import('../src/lib/people');
  const [sky, lens, bare] = ids.map((r) => socialPerson(r.id));
  check('words: a Bluesky account by its handle', (await accountWords(S, sky)) === 'your Bluesky account @alice.bsky.social');
  check('words: a Lens account by its username', (await accountWords(S, lens)) === 'your Lens account lens/alice');
  check('words: a Bluesky account without a handle, by its DID', (await accountWords(S, bare)) === 'your Bluesky account did:plc:abcdefghijklmnopqrstuvwx');
  check('words: none for a Lens or Bluesky account we don\'t have', (await accountWords(S, socialPerson(999))) === null);
}
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
await claim(S, 434343, tx('cap'), base({ from: other.address, usd: 2 }), capIntent);
const r7 = await reserve(S, 434343);
check('the site-wide prepaid daily cap still applies', !r7.ok && r7.refusal === 'prepaid-spend' && (await personBalanceUsd(S, 434343)) === 2, json(r7));
await db.exec(`reset role; delete from studio.image_costs where funded = 'prepaid'; set role studio_writer;`);

// Paying without the free check (owner, 2026-11-04): the gate lets a refused person pay, only from their balance.
{
  const { mayGenerate } = await import('../src/lib/images/gate');
  process.env.APP_LEGAL_PAGES = 'terms+privacy';
  process.env.SNOWMOON_ALERT_URL = 'https://example.invalid/alert';
  delete process.env.NEYNAR_API_KEY; // Neynar can't be asked: the free check refuses ('unreachable')
  const G = 616161;
  const orPay = { reserveUsd: IMAGES.reserveUsd };
  const g0 = await mayGenerate(S, G, orPay);
  check('the free check refuses, and with no balance the refusal stands', !g0.ok && g0.reason === 'unreachable', json(g0));
  await recordIntent(S, G, me.address);
  await claim(S, G, tx('g'), base({ usd: 1 }));
  const g1 = await mayGenerate(S, G, orPay);
  check('with a balance that covers it: let through, paid only', g1.ok && g1.paidOnly === true, json(g1));
  const g2 = await mayGenerate(S, G);
  check('a route that doesn\'t take a person balance (Remix, design names) still gets the refusal', !g2.ok, json(g2));
  PB.enabled = false;
  const g3 = await mayGenerate(S, G, orPay);
  check('while off, the refusal stands', !g3.ok, json(g3));
  PB.enabled = true;
  const before = await free(G);
  const r = await reserve(S, G, undefined, { paidOnly: true });
  check('paid only: charged to the balance, never a free one', r.ok && r.funded === 'prepaid' && (await free(G)) === before && Math.abs((await personBalanceUsd(S, G)) - (1 - price)) < 1e-6, json(r));
  if (r.ok) await settle(S, {}, undefined, 'prepaid');
  const E = 626262;
  const r0 = await reserve(S, E, undefined, { paidOnly: true });
  check('paid only with an empty balance: refused as balance, no free one used', !r0.ok && r0.refusal === 'balance' && (await free(E)) === 0, json(r0));
  delete process.env.APP_LEGAL_PAGES;
  delete process.env.SNOWMOON_ALERT_URL;
  const g4 = await mayGenerate(S, G, orPay);
  check('the launch order still applies to everyone, paying or not', !g4.ok && g4.reason === 'not-open', json(g4));
}

// Remix frames: the Remix route lets a person's balance pay; an agent's approved frame never does (Terms 6b).
{
  const R = await import('../src/lib/remix/limits');
  const { REMIX } = await import('../src/lib/config');
  const X = 717171;
  await recordIntent(S, X, me.address);
  await claim(S, X, tx('x'), base({ usd: 1 }));
  await db.exec(`reset role; insert into studio.remix_asks (person) select ${X} from generate_series(1, ${REMIX.generationsPerDay}); set role studio_writer;`);
  const spend = { model: IMAGES.editModel, reserveUsd: REMIX.reserveUsd(2) };
  const agent = await R.reserve(S, X, spend);
  check('Remix, as an agent\'s frame (no person balance): free ones used up is refused, nothing charged', !agent.ok && agent.refusal === 'limit' && (await personBalanceUsd(S, X)) === 1, json(agent));
  const route = await R.reserve(S, X, spend, { personBalance: true });
  check('Remix, from the Remix route: free ones used up, paid from the person\'s balance at the wallets\' price', route.ok && route.funded === 'prepaid' && Math.abs((await personBalanceUsd(S, X)) - (1 - priceUsd(spend.reserveUsd))) < 1e-6, json(route));
  if (route.ok) await R.settle(S, {}, spend, 'prepaid');
  PB.enabled = false;
  const off = await R.reserve(S, X, spend, { personBalance: true });
  check('Remix, while off: refused as before', !off.ok && off.refusal === 'limit', json(off));
  PB.enabled = true;
  const Y = 727272;
  const only = await R.reserve(S, Y, spend, { personBalance: true, paidOnly: true });
  check('Remix, paid only with no balance: refused as balance, no free frame used', !only.ok && only.refusal === 'balance' && (await sql`select count(*)::int as n from studio.remix_asks where person = ${Y}`)[0].n === 0, json(only));
}

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
