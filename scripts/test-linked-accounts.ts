/**
 * Linked accounts, the READ side on v2's model (src/lib/linked/accounts.ts) and the code that uses it (the gate, the
 * daily counts, bylines), with every change made through v2 (src/lib/linked/v2.ts). DRAFT, LINKED_ACCOUNTS off.
 * Drafted by a coding agent (Claude, a closed model by Anthropic). Fails (exit 1) on any problem.
 *
 *   npm run test:linked-accounts
 *
 * Rewritten 2026-11-05 (owner: retire v1's linking code and its test): v1's behaviour (the acting number, a sign-in
 * becoming its own person on unlink, the A2 count block, the A7 freeze) is no longer tested, and its absence is.
 * The rules of who may change sign-ins, the waits and A5 are in test:linked-accounts-v2 (T1-T10); kept here: the switch
 * off, A6 and A8 through v2 with the real route's inputs, counts per Snowmoon account (A3), "passes if a linked social
 * account does", the refusal's next step, the challenge's public ids, and bylines while linked.
 * No network, no production: every migration (with NEXT_linked_accounts) in an in-memory Postgres (PGlite), talked to
 * as studio_writer through postgres.js, as the app does. Made-up accounts only.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { IMAGES, LINKED_ACCOUNTS, SOCIAL_SIGN_IN } from '../src/lib/config';

process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const json = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v));

const L = LINKED_ACCOUNTS as { enabled: boolean };
check('the switch is off in the code as committed', L.enabled === false);

// --- The database ---------------------------------------------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
const PORT = 54341;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const A = await import('../src/lib/linked/accounts');
const V = await import('../src/lib/linked/v2');
const { LINKED_WORDING } = await import('../src/lib/linked/wording');
const { decide } = await import('../src/lib/checks/decisions');
const { neynarRule } = await import('../src/lib/images/neynar');
const { lensRule } = await import('../src/lib/social/lens-check');
const images = await import('../src/lib/images/limits');
const remix = await import('../src/lib/remix/limits');
const { mayGenerate } = await import('../src/lib/images/gate');
type Sql = Parameters<typeof A.countToday>[0];
const S = sql as unknown as Sql;

/** As the table owner (only to move the clock back, standing in for days passing, and to add fixtures). */
async function asOwner(text: string) {
  await sql.unsafe('reset role');
  try {
    await sql.unsafe(text);
  } finally {
    await sql.unsafe('set role studio_writer');
  }
}

const wallet = async (n: number) => -Number((await sql`insert into studio.wallet_accounts (address) values (${'0x77' + String(n).padStart(38, '0')}) returning id`)[0].id);
const social = async (kind: 'lens' | 'bluesky', n: number) => {
  const subject = kind === 'lens' ? '0x66' + String(n).padStart(38, '0') : `did:plc:${'abcdefghijklmnopqrstuvwx'.slice(0, 20)}${'wxyz'[n % 4]}${'abc'[n % 3]}${'de'[n % 2]}${'fghij'[n % 5]}`;
  const [r] = await sql`insert into studio.social_accounts (kind, subject, handle) values (${kind}, ${subject}, ${kind === 'lens' ? `lens/madeup${n}` : `madeup${n}.bsky.social`}) returning id`;
  return { number: -(1e9 + Number(r.id)), subject };
};
const why = (r: { ok: boolean; why?: string }) => (r.ok ? 'ok' : r.why);
/** A new day for A8's count (the tests make more than 10 links for one person). */
const newDay = () => asOwner(`update studio.person_link_attempts set at = at - interval '1 day';`);

// --- v1's linking is retired ----------------------------------------------------------------------------------------
{
  const src = readFileSync(path.join(ROOT, 'src/lib/linked/accounts.ts'), 'utf8');
  const gone = ['link', 'unlink', 'personOf', 'actingFor', 'actingNumber', 'waitOf', 'personWaitUntil', 'blockedByWait', 'movesOf', 'frozenBy'];
  const still = gone.filter((f) => new RegExp(`export (async )?(function|const) ${f}\\b`).test(src));
  check('retired: accounts.ts exports none of v1\'s linking (link, unlink, the acting number, the wait block, A5, A7)', still.length === 0, still.join());
  check('retired: no A7 freeze in the config', !('frozenChallenges' in LINKED_ACCOUNTS));
  const words = readFileSync(path.join(ROOT, 'src/lib/linked/wording.ts'), 'utf8');
  check('retired: v1\'s link, unlink and wait words are gone', !/\b(link|unlink|wait): [{(]/.test(words) && !/frozen/.test(words));
  const route = readFileSync(path.join(ROOT, 'src/app/api/linked-accounts/route.ts'), 'utf8');
  check('the route changes sign-ins only through v2, and answers 404 while off in each handler', !/from '~\/lib\/linked\/accounts'.*\b(link|unlink)\b/.test(route) && (route.match(/if \(!LINKED_ACCOUNTS\.enabled\) return off\(\);/g) ?? []).length === 3 && /v2\.link\(/.test(route) && /v2\.unlink\(/.test(route));
  const auth = readFileSync(path.join(ROOT, 'src/lib/auth.ts'), 'utf8');
  check('getPerson while on: the sign-in\'s own number, through v2\'s sign-in', /signInV2\(/.test(auth) && !/actingFor/.test(auth));
}

// --- Off: nothing changes -------------------------------------------------------------------------------------------
const D = V.fromPostgres(S);
const F1 = 770001;
const W1 = await wallet(1);
check('off: v2 link refuses, nothing written', why(await V.link(D, { actor: F1, add: W1, now: new Date() })) === 'off' && (await sql`select count(*)::int as n from studio.person_accounts where account in (${F1}, ${W1})`)[0].n === 0);
check('off: counts cover the number alone, the free check decides alone', json(await A.countScope(S, F1)) === json({ personId: null, numbers: [F1] }) && (await A.linkedFree(S, F1)) === null && (await A.personPasses(S, F1)) === false && (await A.displayAccountOf(S, W1)) === W1);

L.enabled = true;
process.env.APP_LEGAL_PAGES = 'terms+privacy';
process.env.SNOWMOON_ALERT_URL = 'https://example.invalid/alert';
delete process.env.NEYNAR_API_KEY;
const lensMin = SOCIAL_SIGN_IN.lens as { minScore: number | null };
lensMin.minScore ??= 1000;
const P = IMAGES.prepaid as { payTo: `0x${string}` | null };
P.payTo = '0x000000000000000000000000000000000000beef';
const now = () => new Date();

// --- Linking through v2 (the main), as the route calls it ------------------------------------------------------------
check('a Farcaster sign-in starts its Snowmoon account (and is its main)', why(await V.signIn(D, F1, now())) === 'ok');
const p1 = (await V.accountOf(D, F1))!;
check('the main links a wallet', why(await V.link(D, { actor: F1, add: W1, now: now(), address: '0x7700000000000000000000000000000000000001' })) === 'ok');
check('linking it again changes nothing', why(await V.link(D, { actor: F1, add: W1, now: now() })) === 'ok' && (await V.signInsOf(D, p1)).length === 2);
const L1 = await social('lens', 1);
const B1 = await social('bluesky', 1);
check('the wallet (not main) can\'t link a Lens account', why(await V.link(D, { actor: W1, add: L1.number, now: now() })) === 'not-main');
check('the main links a Lens and a Bluesky account', why(await V.link(D, { actor: F1, add: L1.number, now: now() })) === 'ok' && why(await V.link(D, { actor: F1, add: B1.number, now: now() })) === 'ok');
check('every sign-in is in one Snowmoon account, each keeping its own number', (await A.readPersonOf(S, B1.number))?.personId === p1 && (await A.readPersonOf(S, W1))?.personId === p1);

// --- A6 and A8 ----------------------------------------------------------------------------------------------------
check('A6 planted: a second Farcaster account → refused', why(await V.link(D, { actor: F1, add: 770003, now: now() })) === 'kind-taken');
check('A6 planted: a second Lens account → refused', why(await V.link(D, { actor: F1, add: (await social('lens', 2)).number, now: now() })) === 'kind-taken');
check('A6 planted: a second Bluesky account → refused', why(await V.link(D, { actor: F1, add: (await social('bluesky', 2)).number, now: now() })) === 'kind-taken');
const [W2, W3, W4] = [await wallet(2), await wallet(3), await wallet(4)];
check('a second and a third wallet link', why(await V.link(D, { actor: F1, add: W2, now: now() })) === 'ok' && why(await V.link(D, { actor: F1, add: W3, now: now() })) === 'ok');
check('A6 planted: a fourth wallet → refused', why(await V.link(D, { actor: F1, add: W4, now: now() })) === 'wallets');
await newDay();
check('A8 planted: the project\'s pay-to address → refused', why(await V.link(D, { actor: F1, add: W4, now: now(), address: P.payTo! })) === 'payment-address');
{
  const F8 = 770008;
  await V.signIn(D, F8, now());
  const tries: string[] = [];
  for (let i = 0; i < LINKED_ACCOUNTS.linkAttemptsPerDay; i++) tries.push(String(why(await V.link(D, { actor: F8, add: F1, now: now() }))));
  check('A8: the first 10 attempts are decided on their merits (here: refused, the sign-in is in another account)', tries.every((t) => t === 'has-account'), tries.join());
  check('A8 planted: an 11th attempt in a day → refused, even for a link that would work', why(await V.link(D, { actor: F8, add: await wallet(8), now: now() })) === 'attempts');
}
await newDay();

// --- A3: counts per Snowmoon account ----------------------------------------------------------------------------------
{
  const [Fp, Fq] = [770031, 770032];
  const Lp = await social('lens', 31);
  // The Lens account made 4 pictures and 2 remix frames today on its own, with no Snowmoon account yet.
  for (let i = 0; i < 4; i++) await sql`insert into studio.image_asks (fid) values (${Lp.number})`;
  for (let i = 0; i < 2; i++) await sql`insert into studio.remix_asks (person) values (${Lp.number})`;
  await decide(S, 'farcaster', String(Fp), true, neynarRule(IMAGES.neynarMinScore));
  await V.signIn(D, Fp, now());
  const before = await images.generationsLeft(S, Fp);
  await V.link(D, { actor: Fp, add: Lp.number, now: now() });
  check('A3: a sign-in joining brings today\'s pictures with it (they now belong to the account)', (await images.generationsLeft(S, Fp)) === before - 4, `${before} → ${await images.generationsLeft(S, Fp)}`);
  check('A3: …and today\'s remix frames', (await remix.generationsLeft(S, Fp, 0.05)) === remix.perDay(Fp) - 2);
  check('A3: …the same count from the Lens sign-in itself', (await images.generationsLeft(S, Lp.number)) === before - 4);
  const r = await images.reserve(S, Fp);
  check('a Generate is stamped with the Snowmoon account', r.ok && (await sql`select count(*)::int as n from studio.image_asks where fid = ${Fp} and person_id = ${(await V.accountOf(D, Fp))!}`)[0].n === 1, json(r));
  if (r.ok) await images.settle(S, {});
  await V.unlink(D, { actor: Fp, target: Lp.number, now: now() });
  check('A3: after the Lens sign-in leaves, the account keeps every row it owns (5 today); unlinking frees no count', (await A.countToday(S, 'image_asks', Fp)) === 5, String(await A.countToday(S, 'image_asks', Fp)));
  check('A3: the Lens sign-in that left can\'t start an account of its own for 30 days', why(await V.signIn(D, Lp.number, now())) === 'wait-start');
  const Lr = await social('lens', 32);
  await decide(S, 'farcaster', String(Fq), true, neynarRule(IMAGES.neynarMinScore));
  await V.signIn(D, Fq, now());
  await V.link(D, { actor: Fq, add: Lr.number, now: now() });
  for (let i = 0; i < 3; i++) {
    const g = await images.reserve(S, Lr.number);
    if (g.ok) await images.settle(S, {});
  }
  const q1 = await images.generationsLeft(S, Fq);
  await V.unlink(D, { actor: Fq, target: Lr.number, now: now() });
  check('A3 planted: rotating a sign-in out never frees a count for the account', (await images.generationsLeft(S, Fq)) === q1, `${q1} → ${await images.generationsLeft(S, Fq)}`);
}

await newDay();
// --- Passes if a linked social account does; the refusal's next step ------------------------------------------------
{
  const Fx = 770041;
  await decide(S, 'farcaster', String(Fx), false, neynarRule(IMAGES.neynarMinScore));
  await V.signIn(D, Fx, now());
  const g0 = await mayGenerate(S, Fx);
  check('a Farcaster account below the check, alone: refused…', !g0.ok && g0.reason === 'score', json(g0));
  const lines = LINKED_WORDING.refusal(['lens', 'bluesky']);
  check('…with the approved next step: link a network not linked yet, or prepay; the detail kept under "Why?"', !g0.ok && g0.error === lines.join(' ') && lines[1] === 'Link a Lens or Bluesky account that passes, or sign in with a wallet and prepay.' && !!g0.why && json(g0.canLink) === json(['lens', 'bluesky']), json(g0));
  const Lx = await social('lens', 41);
  await decide(S, 'lens', Lx.subject, true, lensRule(lensMin.minScore!));
  await V.link(D, { actor: Fx, add: Lx.number, now: now() });
  const g1 = await mayGenerate(S, Fx);
  check('anyCurrentPass: with a passing Lens account linked, the account passes (no lookup)', g1.ok, json(g1));
  check('…and gets the free count', (await images.generationsLeft(S, Fx)) > 0);
  await V.unlink(D, { actor: Fx, target: Lx.number, now: now() });
  check('planted: once the passing Lens account is unlinked, its pass counts for nothing in the account', !(await mayGenerate(S, Fx)).ok);
  check('every network linked: line 2 is the interim prepay line', LINKED_WORDING.refusal([])[1] === 'You can still make them: sign in with a wallet and prepay.');
  check('Submit\'s refusal never offers prepay, whichever networks are missing', [[], ['lens'], ['farcaster', 'lens', 'bluesky']].every((m) => !/prepay|wallet/i.test(LINKED_WORDING.submitRefusal(m as never).join(' '))));
  check('Submit\'s next step: "Link a Farcaster account that passes, then publish a new version and submit it."', LINKED_WORDING.submitRefusal(['farcaster'])[1] === 'Link a Farcaster account that passes, then publish a new version and submit it.');
}

// --- The challenge record's public id; the networks still to link -------------------------------------------------
{
  const Bp = await social('bluesky', 71);
  check('public id: a FID in digits', (await A.publicIdOf(S, 770071)) === '770071');
  check('public id: a Bluesky account by its DID, a Lens account by its address', (await A.publicIdOf(S, Bp.number)) === Bp.subject && (await A.publicIdOf(S, L1.number)) === L1.subject);
  check('public id: a wallet has none (never an entry)', (await A.publicIdOf(S, W1)) === null);
  check('the networks still to link, in order', json(A.missingNetworks([{ kind: 'wallet', account: W1 }, { kind: 'lens', account: L1.number }])) === json(['farcaster', 'bluesky']));
  check('no person id leaves the database in any public table', (await sql`select count(*)::int as n from information_schema.column_privileges where table_schema = 'studio' and column_name = 'person_id' and grantee = 'anon'`)[0].n === 0);
}

// --- Bylines while linked: the account's chosen name -----------------------------------------------------------------
await newDay();
{
  const credit = await import('../src/lib/wallet/credit');
  const Fb = 770081;
  const Wb = await wallet(81);
  const Lb = await social('lens', 81);
  const Wo = await wallet(82); // someone else's wallet, never linked to Fb
  check('byline: before linking, a wallet\'s and a Lens account\'s work is under its own name', (await credit.linkedTo(S, [Wb, Lb.number])).size === 0);
  await V.signIn(D, Fb, now());
  for (const acc of [Wb, Lb.number]) await V.link(D, { actor: Fb, add: acc, now: now() });
  check('byline: while linked, the work of every sign-in shows under the chosen name (the Farcaster account)', (await credit.linkedTo(S, [Wb])).get(Wb) === Fb && (await credit.linkedTo(S, [Lb.number])).get(Lb.number) === Fb);
  check('byline: the chosen name\'s page lists the work of both', json((await credit.walletsOf(S, Fb)).sort()) === json([Wb, Lb.number].sort()));
  check('planted: someone else\'s wallet is never shown under this account', !(await credit.linkedTo(S, [Wo])).has(Wo) && !(await credit.actsFor(S, Fb, Wo)));
  // Without Farcaster: a Bluesky account's work shows under the account's chosen name, the Lens username.
  const Ln = await social('lens', 83);
  const Bn = await social('bluesky', 83);
  await V.signIn(D, Ln.number, now());
  await V.link(D, { actor: Ln.number, add: Bn.number, now: now() });
  const shown = await credit.credit(S, [{ by: Bn.number, name: 'madeup83.bsky.social' as string | null }], (x) => x.by, (x, by, name) => ({ ...x, by, name }));
  check('byline: without Farcaster, a Bluesky account\'s work shows under the chosen Lens username', shown[0].by === Ln.number && shown[0].name === 'lens/madeup83', json(shown));
  L.enabled = false;
  check('off: bylines are as before', (await credit.linkedTo(S, [Bn.number])).size === 0 && (await credit.walletsOf(S, Ln.number)).length === 0);
  L.enabled = true;
}

await sql.end();
await server.stop();
await db.close();
console.log(`test:linked-accounts: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const x of failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
