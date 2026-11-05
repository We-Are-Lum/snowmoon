/**
 * Who may ask the assistant (step 1 of "the assistant for any account", owner 2026-11-05; src/lib/chat/gate.ts), on
 * stand-ins: Neynar, Lens's API and Bluesky's AppView are replaced (fetch is stubbed and every call recorded), and every
 * migration runs in an in-memory Postgres (PGlite), talked to as studio_writer. Never a production database, never a
 * real network check, never a model.
 *
 *   npm run test:chat-gate
 *
 * - A1 the switches off (today): any FID asks, with no lookup; a wallet, and a Lens or Bluesky account not linked to a
 *   FID, are refused (403) with no lookup, each with the panel's words.
 * - A2 a Lens or Bluesky account linked to a FID asks as that FID (personForSocial), whatever the switches; a Bluesky
 *   account linked to a Lens account is that Lens account.
 * - A3 anyAccount on, Lens: a pass asks; a fail is refused (403) and never shows the score; Lens unreachable is 503; the
 *   decision is stored and reused (no second lookup); the status never asks Lens; a decision made at an image counts.
 * - A4 anyAccount on, Bluesky: a pass asks; new, idle and a stored fail are refused with their reason; unreachable is
 *   503; the status never asks the AppView; with the Bluesky check off, refused as not open.
 * - A5 the one rule (owner, 2026-11-05: Farcaster accounts pass Neynar too), with anyAccount on: a FID passing Neynar
 *   asks, one failing is refused with its score; invited FIDs and admins skip it, as for images; the status never asks
 *   Neynar; a kept image decision counts; Neynar unreachable is 503. Off (today): the failing FID asks, unasked.
 * - A6 wallets are refused with the switch off or on.
 * - A7 the daily limit per account: a Lens account's 30 questions, then refused; another account and a FID are counted
 *   apart; a linked Lens account uses its FID's count. chat_calls takes social numbers (≤ -1,000,000,000) as they are:
 *   no migration needed.
 * - A8 the routes: both go through mayAsk, the status with lookUp false, the ask with lookUp true before ask().
 * Each rule is also run on a planted violation, which it must catch.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 54361;
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
process.env.NEYNAR_API_KEY = 'test-only-not-a-key';

const { PGlite } = await import('@electric-sql/pglite');
const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');

// Every outside call is recorded; Neynar answers with the planted score; nothing else is answered.
const fetched: string[] = [];
let neynarScore: number | null = 0.9;
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  fetched.push(u);
  if (u.includes('neynar')) {
    if (neynarScore === null) return new Response('{}', { status: 500 });
    const fid = Number(new URL(u).searchParams.get('fids'));
    return Response.json({ users: [{ fid, score: neynarScore }] });
  }
  return new Response('{}', { status: 599 });
}) as typeof fetch;

const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql') && !f.startsWith('NEXT_')).sort();
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of migrations) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const { db } = await import('../src/lib/db');
const sql = db()!;
await sql`set role studio_writer`;

const { ASSISTANT, CHAT, SOCIAL_SIGN_IN, ADMINS, IMAGES } = await import('../src/lib/config');
const { mayAsk } = await import('../src/lib/chat/gate');
const { ASK_WORDING } = await import('../src/lib/chat/who-can-ask');
const accounts = await import('../src/lib/social/accounts');
const people = await import('../src/lib/people');
const decisions = await import('../src/lib/checks/decisions');
const { neynarRule } = await import('../src/lib/images/neynar');
const { lensRule } = await import('../src/lib/social/lens-check');
const { thresholdKey } = await import('../src/lib/social/bluesky-check');
const { reserve, usedToday } = await import('../src/lib/chat/limits');
const bsky = SOCIAL_SIGN_IN.bluesky.check as { on: boolean };
const lensCfg = SOCIAL_SIGN_IN.lens as { minScore: number | null };

const sw = (anyAccount: boolean) => {
  ASSISTANT.anyAccount = anyAccount;
};
const lensAddr = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const lensAccount = async (n: number) => {
  const id = await accounts.socialAccountFor(sql as never, 'lens', lensAddr(n), `lens/fixture${n}`);
  return { id, person: people.socialPerson(id), subject: lensAddr(n) };
};
const blueskyAccount = async (n: number) => {
  const did = `did:plc:${'abcdefghijklmnopqrstuvwxyz234567'[n % 32]}${'fixtureaccount'}${'abcdefghij'[Math.floor(n / 32) % 10]}zzzzzzzz`;
  const id = await accounts.socialAccountFor(sql as never, 'bluesky', did, `fixture${n}.bsky.social`);
  return { id, person: people.socialPerson(id), subject: did };
};
let lensCalls = 0;
const lensScore = (score: number | null) => async () => (lensCalls++, score);
let bskyCalls = 0;
const NOW = Date.now();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
const facts = (age: number, posts: number) => async () => (bskyCalls++, { createdAt: iso(age), posts: Array.from({ length: posts }, (_, i) => ({ createdAt: iso(i + 1), indexedAt: iso(i + 1) })) });
const unreachable = async () => {
  bskyCalls++;
  throw new Error('unreachable');
};

const FID = 424242;
const FID2 = 424243;

// --- A1 switches off: today's behaviour --------------------------------------------------------------------------
{
  sw(false);
  fetched.length = 0;
  const f = await mayAsk(sql, FID, { lookUp: true });
  check('A1 off: a FID asks', f.ok && f.person === FID);
  check('A1 off: a FID is never looked up (no Neynar call)', fetched.length === 0, fetched.join(', '));
  const w = await mayAsk(sql, -42, { lookUp: true });
  check('A1 off: a wallet is refused 403 with the Farcaster-only words', !w.ok && w.status === 403 && w.reason === 'wallet' && w.account === 'wallet' && w.error === 'Asking questions needs a Farcaster account. Sign in with one to ask.', JSON.stringify(w));
  const L = await lensAccount(1);
  const B = await blueskyAccount(1);
  lensCalls = 0;
  bskyCalls = 0;
  const l = await mayAsk(sql, L.person, { lookUp: true, deps: { lensScore: lensScore(5000), bluesky: facts(400, 10) } });
  const b = await mayAsk(sql, B.person, { lookUp: true, deps: { lensScore: lensScore(5000), bluesky: facts(400, 10) } });
  check('A1 off: a Lens account not linked to a FID is refused 403 (social-off), even with a passing score', !l.ok && l.status === 403 && l.reason === 'social-off' && l.account === 'lens', JSON.stringify(l));
  check('A1 off: a Bluesky account not linked to a FID is refused 403 (social-off)', !b.ok && b.status === 403 && b.reason === 'social-off' && b.account === 'bluesky', JSON.stringify(b));
  check('A1 off: neither is looked up', lensCalls === 0 && bskyCalls === 0 && fetched.length === 0);
  check('A1 off: the refusal says a Farcaster account is needed (the words check:ui looks for)', !l.ok && l.error.startsWith('Asking questions needs a Farcaster account.'));
  check('A1 off: the panel line names Farcaster only', ASK_WORDING.who() === 'Asking questions needs a Farcaster account.');
  const noDb = await mayAsk(null, B.person, { lookUp: false, signedInAs: 'bluesky' });
  check('A1 off: without a database, a Bluesky sign-in is still refused as social-off (not "unavailable")', !noDb.ok && noDb.reason === 'social-off' && noDb.account === 'bluesky');
  check('A1 off: without a database, a FID still asks', (await mayAsk(null, FID, { lookUp: false })).ok);
  // Planted: the switch on lets the Lens account through.
  sw(true);
  const planted = await mayAsk(sql, L.person, { lookUp: true, deps: { lensScore: lensScore(5000) } });
  proof('A1 with anyAccount planted on, the unlinked Lens account would ask', planted.ok);
  sw(false);
}

// --- A2 linked accounts count as the FID --------------------------------------------------------------------------
{
  const L = await lensAccount(2);
  const B = await blueskyAccount(2);
  const B3 = await blueskyAccount(3);
  const L3 = await lensAccount(3);
  check('A2 link Lens to a FID', (await accounts.linkSocial(sql as never, { id: L.id, kind: 'lens' }, { fid: FID })).ok);
  check('A2 link Bluesky to another FID', (await accounts.linkSocial(sql as never, { id: B.id, kind: 'bluesky' }, { fid: FID2 })).ok);
  check('A2 link a Bluesky account to an unlinked Lens account', (await accounts.linkSocial(sql as never, { id: B3.id, kind: 'bluesky' }, { lensAccount: L3.id })).ok);
  const pl = await accounts.personForSocial(sql as never, { account: L.id, kind: 'lens' });
  const pb = await accounts.personForSocial(sql as never, { account: B.id, kind: 'bluesky' });
  const pb3 = await accounts.personForSocial(sql as never, { account: B3.id, kind: 'bluesky' });
  check('A2 a linked Lens account signs in as its FID', pl === FID, String(pl));
  check('A2 a linked Bluesky account signs in as its FID', pb === FID2, String(pb));
  check('A2 a Bluesky account linked to a Lens account signs in as that Lens account', pb3 === L3.person, String(pb3));
  neynarScore = 0.9;
  for (const any of [false, true]) {
    sw(any);
    const a = await mayAsk(sql, pl, { lookUp: true });
    const b = await mayAsk(sql, pb, { lookUp: true });
    check(`A2 (anyAccount ${any}) the linked accounts ask as their FIDs`, a.ok && a.person === FID && a.account === 'farcaster' && b.ok && b.person === FID2);
  }
  sw(true);
  lensCalls = 0;
  const viaLens = await mayAsk(sql, pb3, { lookUp: true, deps: { lensScore: lensScore(5000) } });
  check('A2 (anyAccount on) a Bluesky account linked to a Lens account is checked as that Lens account (Lens score)', viaLens.ok && viaLens.person === L3.person && viaLens.account === 'lens' && lensCalls === 1);
  sw(false);
}

// --- A3 Lens, anyAccount on ---------------------------------------------------------------------------------------
{
  sw(true);
  const P = await lensAccount(10);
  const F = await lensAccount(11);
  const U = await lensAccount(12);
  const S = await lensAccount(13);
  lensCalls = 0;
  const st = await mayAsk(sql, P.person, { lookUp: false, deps: { lensScore: lensScore(5000) } });
  check('A3 the status, with no decision yet, says the account can ask and asks Lens nothing', st.ok && lensCalls === 0);
  const p = await mayAsk(sql, P.person, { lookUp: true, deps: { lensScore: lensScore(5000) } });
  check('A3 a Lens account at or above the score asks, under its own number', p.ok && p.person === P.person && p.account === 'lens' && lensCalls === 1);
  const kept = await decisions.currentDecision(sql as never, 'lens', P.subject, lensRule(lensCfg.minScore!));
  check('A3 the pass is stored in the shared store (lens, its address, the rule)', kept?.passed === true);
  const again = await mayAsk(sql, P.person, { lookUp: true, deps: { lensScore: lensScore(0) } });
  check('A3 the next question reuses the decision: no second lookup', again.ok && lensCalls === 1);
  const f = await mayAsk(sql, F.person, { lookUp: true, deps: { lensScore: lensScore(10) } });
  check('A3 a Lens account below the score is refused 403 (lens-score)', !f.ok && f.status === 403 && f.reason === 'lens-score');
  check('A3 the refusal never shows the score', !f.ok && !/\b10\b/.test(f.error) && f.error.includes((lensCfg.minScore ?? 0).toLocaleString('en-US')), !f.ok ? f.error : '');
  lensCalls = 0;
  const fs = await mayAsk(sql, F.person, { lookUp: false, deps: { lensScore: lensScore(5000) } });
  check('A3 the status reads the kept fail and refuses, asking Lens nothing', !fs.ok && fs.reason === 'lens-score' && lensCalls === 0);
  const u = await mayAsk(sql, U.person, { lookUp: true, deps: { lensScore: lensScore(null) } });
  check('A3 Lens unreachable is 503, and nothing is stored', !u.ok && u.status === 503 && u.reason === 'lens-unreachable' && (await decisions.currentDecision(sql as never, 'lens', U.subject, lensRule(lensCfg.minScore!))) === null);
  await decisions.decide(sql as never, 'lens', S.subject, true, lensRule(lensCfg.minScore!));
  lensCalls = 0;
  const shared = await mayAsk(sql, S.person, { lookUp: true, deps: { lensScore: lensScore(0) } });
  check('A3 a decision made at an image (same store, same rule) counts: no lookup', shared.ok && lensCalls === 0);
  const was = lensCfg.minScore;
  lensCfg.minScore = null;
  const closed = await mayAsk(sql, P.person, { lookUp: true, deps: { lensScore: lensScore(5000) } });
  check('A3 with the Lens score off (null), Lens accounts are refused as not open', !closed.ok && closed.reason === 'lens-not-open');
  lensCfg.minScore = was;
  // Planted: a threshold of 0 lets the account below it ask (so the refusal above came from the score).
  lensCfg.minScore = 0;
  const zero = await mayAsk(sql, (await lensAccount(14)).person, { lookUp: true, deps: { lensScore: lensScore(10) } });
  proof('A3 with the score needed planted at 0, the account below 1,000 would ask', zero.ok);
  lensCfg.minScore = was;
  sw(false);
}

// --- A4 Bluesky, anyAccount on ------------------------------------------------------------------------------------
{
  sw(true);
  const P = await blueskyAccount(20);
  const N = await blueskyAccount(21);
  const I = await blueskyAccount(22);
  const U = await blueskyAccount(23);
  bskyCalls = 0;
  const st = await mayAsk(sql, P.person, { lookUp: false, deps: { bluesky: facts(400, 10) } });
  check('A4 the status, with no decision yet, says the account can ask and asks Bluesky nothing', st.ok && bskyCalls === 0);
  const p = await mayAsk(sql, P.person, { lookUp: true, deps: { bluesky: facts(400, 10) } });
  check('A4 a Bluesky account that passes asks, under its own number', p.ok && p.person === P.person && p.account === 'bluesky' && bskyCalls === 1);
  check('A4 the pass is stored (bluesky, the DID, the rule)', (await decisions.currentDecision(sql as never, 'bluesky', P.subject, thresholdKey()))?.passed === true);
  await mayAsk(sql, P.person, { lookUp: true, deps: { bluesky: facts(1, 0) } });
  check('A4 the next question reuses it: no second lookup', bskyCalls === 1);
  const n = await mayAsk(sql, N.person, { lookUp: true, deps: { bluesky: facts(3, 10) } });
  check('A4 a new account is refused 403 (bluesky-new)', !n.ok && n.status === 403 && n.reason === 'bluesky-new');
  const i = await mayAsk(sql, I.person, { lookUp: true, deps: { bluesky: facts(400, 1) } });
  check('A4 an idle account is refused 403 (bluesky-idle)', !i.ok && i.status === 403 && i.reason === 'bluesky-idle');
  bskyCalls = 0;
  const kept = await mayAsk(sql, N.person, { lookUp: true, deps: { bluesky: facts(400, 10) } });
  check('A4 a stored fail is refused as failed, with no new lookup within the day', !kept.ok && kept.reason === 'bluesky-failed' && bskyCalls === 0);
  const ks = await mayAsk(sql, I.person, { lookUp: false });
  check('A4 the status refuses a kept fail', !ks.ok && ks.reason === 'bluesky-failed');
  const u = await mayAsk(sql, U.person, { lookUp: true, deps: { bluesky: unreachable } });
  check('A4 Bluesky unreachable is 503, nothing stored', !u.ok && u.status === 503 && u.reason === 'bluesky-unreachable' && (await decisions.currentDecision(sql as never, 'bluesky', U.subject, thresholdKey())) === null);
  bsky.on = false;
  const off = await mayAsk(sql, P.person, { lookUp: true, deps: { bluesky: facts(400, 10) } });
  check('A4 with the Bluesky check off, Bluesky accounts are refused as not open (no check, no free questions)', !off.ok && off.reason === 'bluesky-not-open');
  bsky.on = true;
  check('A4 the panel line names all three networks when on', ASK_WORDING.who() === 'Asking questions needs a Farcaster, Lens or Bluesky account that passes its check.');
  sw(false);
}

// --- A5 the one rule: Neynar for FIDs --------------------------------------------------------------------------------------------
{
  const PASS = 500001;
  const FAIL = 500002;
  const KEPT = 500003;
  const DOWN = 500004;
  sw(true);
  fetched.length = 0;
  const st = await mayAsk(sql, PASS, { lookUp: false });
  check('A5 the status, with no decision yet, asks Neynar nothing', st.ok && fetched.length === 0);
  neynarScore = 0.95;
  const p = await mayAsk(sql, PASS, { lookUp: true });
  check('A5 a FID above the score asks; Neynar receives the FID only', p.ok && fetched.length === 1 && new URL(fetched[0]).search === `?fids=${PASS}`, fetched.join(', '));
  neynarScore = 0.31;
  const f = await mayAsk(sql, FAIL, { lookUp: true });
  check('A5 a FID below the score is refused 403 with its score (as images do)', !f.ok && f.status === 403 && f.reason === 'neynar-score' && f.error.includes('0.31'), JSON.stringify(f));
  fetched.length = 0;
  const fs = await mayAsk(sql, FAIL, { lookUp: false });
  check('A5 the status refuses the kept fail without asking Neynar', !fs.ok && fs.reason === 'neynar-score' && fetched.length === 0);
  await decisions.decide(sql as never, 'farcaster', String(KEPT), true, neynarRule(IMAGES.neynarMinScore));
  const k = await mayAsk(sql, KEPT, { lookUp: true });
  check('A5 a pass decided at an image counts: no lookup', k.ok && fetched.length === 0);
  neynarScore = null;
  const d = await mayAsk(sql, DOWN, { lookUp: true });
  check('A5 Neynar unreachable is 503 (refused, not let through)', !d.ok && d.status === 503 && d.reason === 'neynar-unreachable');
  fetched.length = 0;
  check('A5 an admin skips the check, as for images', (await mayAsk(sql, ADMINS[0], { lookUp: true })).ok && fetched.length === 0);
  if (IMAGES.invited.length) check('A5 an invited FID skips the check, as for images', (await mayAsk(sql, IMAGES.invited[0], { lookUp: true })).ok && fetched.length === 0);
  sw(false);
  check('A5 off (today): the FID failing Neynar asks', (await mayAsk(sql, FAIL, { lookUp: true })).ok);
  fetched.length = 0;
  check('A5 off (today): no FID is looked up', (await mayAsk(sql, 500099, { lookUp: true })).ok && fetched.length === 0);
  proof('A5 with the switch planted on, the failing FID would be refused (so off really is the no-check path)', !f.ok);
}

// --- A6 wallets ---------------------------------------------------------------------------------------------------
for (const any of [false, true]) {
  sw(any);
  const w = await mayAsk(sql, -77, { lookUp: true });
  check(`A6 a wallet is refused (anyAccount ${any})`, !w.ok && w.status === 403 && w.reason === 'wallet');
  if (any) check('A6 on: the wallet words name all three networks', !w.ok && w.error === 'Asking questions needs a Farcaster, Lens or Bluesky account. Sign in with one to ask.');
}
sw(false);

// --- A7 the limit, per account ------------------------------------------------------------------------------------
{
  const A = await lensAccount(30);
  const Bb = await blueskyAccount(30);
  check('A7 a social number is at most -1,000,000,000', A.person <= -1_000_000_000 && Bb.person <= -1_000_000_000);
  const results: boolean[] = [];
  for (let i = 0; i < CHAT.messagesPerDay + 1; i++) results.push((await reserve(sql as never, A.person, 0)).ok);
  check(`A7 a Lens account gets ${CHAT.messagesPerDay} questions, then is refused`, results.slice(0, -1).every(Boolean) && results.at(-1) === false);
  const r = await reserve(sql as never, A.person, 0);
  check('A7 the refusal is the limit', !r.ok && r.reason === 'limit');
  check('A7 chat_calls keeps the social number as it is', (await usedToday(sql as never, A.person)) === CHAT.messagesPerDay);
  check('A7 another account (Bluesky) is counted apart', (await usedToday(sql as never, Bb.person)) === 0 && (await reserve(sql as never, Bb.person, 0)).ok);
  const before = await usedToday(sql as never, FID);
  check('A7 a FID is counted apart from the Lens account', (await reserve(sql as never, FID, 0)).ok && (await usedToday(sql as never, FID)) === before + 1);
  // A Lens account linked to FID (A2) asks as FID: its questions are FID's.
  const L2 = await accounts.personForSocial(sql as never, { account: (await lensAccount(2)).id, kind: 'lens' });
  check('A7 a linked Lens account uses its FID\'s count', L2 === FID && (await usedToday(sql as never, L2)) === before + 1);
  const [row] = await sql`select fid from studio.chat_calls where fid = ${A.person} limit 1`;
  check('A7 the row reads back as the same number', Number(row?.fid) === A.person);
  proof('A7 a planted shared count (one number for every account) would have refused the Bluesky account', (await usedToday(sql as never, A.person)) >= CHAT.messagesPerDay);
}

// --- A8 the routes ------------------------------------------------------------------------------------------------
{
  const ask = readFileSync(path.join(ROOT, 'src/app/api/chat/ask/route.ts'), 'utf8');
  const status = readFileSync(path.join(ROOT, 'src/app/api/chat/status/route.ts'), 'utf8');
  check('A8 the ask route goes through the gate with lookUp true, before ask()', /mayAsk\(sql, person, \{ lookUp: true/.test(ask) && ask.indexOf('mayAsk(') < ask.indexOf('await ask('));
  check('A8 the status route goes through the gate with lookUp false (never a lookup)', /mayAsk\(.*\{ lookUp: false/.test(status) && !/lookUp: true/.test(status));
  check('A8 neither route keeps the old Farcaster-only gate (fid < 0)', !/fid < 0/.test(ask) && !/fid < 0/.test(status));
  check('A8 both count the question under getPerson\'s person', /fid: person/.test(ask) && /usedToday\(sql, person\)/.test(status));
  const cfg = readFileSync(path.join(ROOT, 'src/lib/config.ts'), 'utf8');
  check('A8 the switch is off in config (until the owner says otherwise), and there is no separate Farcaster switch', /anyAccount: false as boolean/.test(cfg) && !/checkFarcaster/.test(cfg));
}

await sql.end();
await server.stop();
await pg.close();
if (failures.length) {
  console.error(`chat gate tests FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`chat gate tests passed: ${passed} checks`);
