/**
 * Linked accounts, the code (src/lib/linked/accounts.ts; DRAFT, LINKED_ACCOUNTS off). Drafted by a coding agent
 * (Claude, a closed model by Anthropic). Fails (exit 1) on any problem.
 *
 *   npm run test:linked-accounts
 *
 * No network, no production: every migration (with NEXT_linked_accounts) in an in-memory Postgres (PGlite), talked to
 * as studio_writer; only the clock is moved, as the table owner, to stand in for days passing. Made-up accounts only.
 * Each abuse rule A1–A8 is tried by a planted violation that must be refused, and the allowed case beside it must
 * work: linking with both sign-ins, unlinking, counts and free remixes per person (A3), "passes if any linked account
 * does" (anyCurrentPass), the 3 wallets, the refusal's next step ("Link another account" + prepay; never prepay on
 * Submit), and the challenge's public id per account.
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
const { LINKED_WORDING } = await import('../src/lib/linked/wording');
const { decide } = await import('../src/lib/checks/decisions');
const { neynarRule } = await import('../src/lib/images/neynar');
const { lensRule } = await import('../src/lib/social/lens-check');
const images = await import('../src/lib/images/limits');
const remix = await import('../src/lib/remix/limits');
const { mayGenerate } = await import('../src/lib/images/gate');
type Sql = Parameters<typeof A.link>[0];
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
/** Days pass for one account: its ended rows ended `days` earlier, and its rows began earlier too. */
const daysPass = (account: number, days: number) =>
  asOwner(`update studio.person_accounts set linked_at = linked_at - interval '${days} days', unlinked_at = unlinked_at - interval '${days} days' where account = ${account};`);

const wallet = async (n: number) => -Number((await sql`insert into studio.wallet_accounts (address) values (${'0x77' + String(n).padStart(38, '0')}) returning id`)[0].id);
const social = async (kind: 'lens' | 'bluesky', n: number) => {
  const subject = kind === 'lens' ? '0x66' + String(n).padStart(38, '0') : `did:plc:${'abcdefghijklmnopqrstuvwx'.slice(0, 20)}${'wxyz'[n % 4]}${'abc'[n % 3]}${'de'[n % 2]}${'fghij'[n % 5]}`;
  const [r] = await sql`insert into studio.social_accounts (kind, subject, handle) values (${kind}, ${subject}, ${kind === 'lens' ? `lens/madeup${n}` : `madeup${n}.bsky.social`}) returning id`;
  return { number: -(1e9 + Number(r.id)), subject };
};
const why = (r: { ok: boolean; why?: string }) => (r.ok ? 'ok' : r.why);
/** A new day for A8's count (the tests make more than 10 links for one person). */
const newDay = () => asOwner(`update studio.person_link_attempts set at = at - interval '1 day';`);

// --- Off: nothing changes -------------------------------------------------------------------------------------------
const F1 = 770001;
const W1 = await wallet(1);
check('off: link refuses, nothing written', why(await A.link(S, { account: F1, kind: 'farcaster' }, { account: W1, kind: 'wallet' })) === 'off' && (await sql`select count(*)::int as n from studio.person_accounts where account in (${F1}, ${W1})`)[0].n === 0);
check('off: a sign-in acts as itself', (await A.actingFor(S, W1)) === W1);
check('off: counts cover the number alone, the free check decides alone', json(await A.countScope(S, F1)) === json({ personId: null, numbers: [F1] }) && (await A.linkedFree(S, F1)) === null);

L.enabled = true;
process.env.APP_LEGAL_PAGES = 'terms+privacy';
process.env.SNOWMOON_ALERT_URL = 'https://example.invalid/alert';
delete process.env.NEYNAR_API_KEY;
const lensMin = SOCIAL_SIGN_IN.lens as { minScore: number | null };
lensMin.minScore ??= 1000;
const P = IMAGES.prepaid as { payTo: `0x${string}` | null };
P.payTo = '0x000000000000000000000000000000000000beef';

// --- Linking with both sign-ins; who a sign-in acts as ------------------------------------------------------------
const r1 = await A.link(S, { account: F1, kind: 'farcaster' }, { account: W1, kind: 'wallet', address: '0x7700000000000000000000000000000000000001' });
check('a wallet links to a Farcaster account', r1.ok && r1.created, json(r1));
check('linking it again changes nothing', (await A.link(S, { account: F1, kind: 'farcaster' }, { account: W1, kind: 'wallet' })).ok);
check('the linked wallet acts as the Farcaster account', (await A.actingFor(S, W1)) === F1);
const L1 = await social('lens', 1);
const B1 = await social('bluesky', 1);
check('a Lens account links (from the wallet\'s sign-in: any of the person\'s sign-ins will do)', why(await A.link(S, { account: W1, kind: 'wallet' }, { account: L1.number, kind: 'lens' })) === 'ok');
check('a Bluesky account links', why(await A.link(S, { account: L1.number, kind: 'lens' }, { account: B1.number, kind: 'bluesky' })) === 'ok');
check('Lens and Bluesky sign-ins act as the Farcaster account', (await A.actingFor(S, L1.number)) === F1 && (await A.actingFor(S, B1.number)) === F1);
{
  const L9 = await social('lens', 9);
  const B9 = await social('bluesky', 9);
  await A.link(S, { account: L9.number, kind: 'lens' }, { account: B9.number, kind: 'bluesky' });
  check('without Farcaster, a Lens and Bluesky person acts as the Lens account', (await A.actingFor(S, B9.number)) === L9.number);
}

// --- A1 and A4: one person per account; two people never merge ----------------------------------------------------
const F2 = 770002;
check('A1/A4 planted: another person takes an account that belongs to someone with other accounts → refused', why(await A.link(S, { account: F2, kind: 'farcaster' }, { account: W1, kind: 'wallet' })) === 'belongs-to-someone');
{
  const F2p = await A.personOf(S, F2, 'farcaster');
  let err = '';
  // Straight to PGlite (the same session, as studio_writer), not through the socket: see A7's note.
  await db.query(`insert into studio.person_accounts (person_id, kind, account, how) values ($1, 'wallet', $2, 'signed')`, [F2p.personId, W1]).catch((e) => (err = e.code));
  check('A1 planted in the database: a second active row for one account → refused by the index', err === '23505', err);
}
check('A4 planted: a Farcaster account with its own linked accounts joining another person → refused (no merges)', why(await A.link(S, { account: F2, kind: 'farcaster' }, { account: F1, kind: 'farcaster' })) === 'belongs-to-someone');
check('the same account twice → refused', why(await A.link(S, { account: F1 }, { account: F1 })) === 'same');

// --- A6: one of each network, up to 3 wallets -----------------------------------------------------------------------
const F3 = 770003;
check('A6 planted: a second Farcaster account → refused', why(await A.link(S, { account: F1 }, { account: F3, kind: 'farcaster' })) === 'one-of-kind');
check('A6 planted: a second Lens account → refused', why(await A.link(S, { account: F1 }, { account: (await social('lens', 2)).number, kind: 'lens' })) === 'one-of-kind');
check('A6 planted: a second Bluesky account → refused', why(await A.link(S, { account: F1 }, { account: (await social('bluesky', 2)).number, kind: 'bluesky' })) === 'one-of-kind');
const W2 = await wallet(2);
const W3 = await wallet(3);
const W4 = await wallet(4);
check('a second and a third wallet link', why(await A.link(S, { account: F1 }, { account: W2, kind: 'wallet' })) === 'ok' && why(await A.link(S, { account: F1 }, { account: W3, kind: 'wallet' })) === 'ok');
check('A6 planted: a fourth wallet → refused', why(await A.link(S, { account: F1 }, { account: W4, kind: 'wallet' })) === 'wallets');
{
  const p = (await A.readPersonOf(S, F1))!;
  let err = '';
  await db.query(`insert into studio.person_accounts (person_id, kind, account, how) values ($1, 'wallet', $2, 'signed')`, [p.personId, W4]).catch((e) => (err = e.code));
  check('A6 planted in the database: a fourth wallet → refused by the trigger', err === '23514', err);
  check('the person has 6 accounts: Farcaster, Lens, Bluesky and 3 wallets', p.members.length === 6, json(p.members));
}

// --- A8: the pay-to address; attempts a day -------------------------------------------------------------------------
check('A8 planted: the project\'s pay-to address → refused', why(await A.link(S, { account: F3, kind: 'farcaster' }, { account: W4, kind: 'wallet', address: P.payTo! })) === 'payment-address');
{
  const F8 = 770008;
  const tries: string[] = [];
  for (let i = 0; i < LINKED_ACCOUNTS.linkAttemptsPerDay; i++) tries.push(String(why(await A.link(S, { account: F8, kind: 'farcaster' }, { account: F1, kind: 'farcaster' }))));
  check('A8: the first 10 attempts are decided on their merits (here: refused, no merges)', tries.every((t) => t === 'belongs-to-someone'), tries.join());
  const W8 = await wallet(8);
  check('A8 planted: an 11th attempt in a day → refused, even for a link that would work', why(await A.link(S, { account: F8, kind: 'farcaster' }, { account: W8, kind: 'wallet' })) === 'attempts');
}

await newDay();
// --- Unlinking ------------------------------------------------------------------------------------------------------
check('unlinking an account that isn\'t mine → refused', why(await A.unlink(S, F3, W1)) === 'none');
check('the third wallet unlinks (from the Farcaster sign-in; the wallet needn\'t sign in)', why(await A.unlink(S, F1, W3)) === 'ok');
check('…and acts as itself again', (await A.actingFor(S, W3)) === W3);
{
  const lone = await A.personOf(S, F3, 'farcaster');
  check('the last account can\'t be unlinked', why(await A.unlink(S, F3, F3)) === 'last' && lone.members.length === 1);
}

await newDay();
// --- A2: the 30-day wait --------------------------------------------------------------------------------------------
{
  const r = await A.link(S, { account: F2 }, { account: W3, kind: 'wallet' });
  const until = !r.ok && r.why === 'wait' ? new Date(r.until).getTime() : 0;
  check('A2 planted: the unlinked wallet joins someone else the same day → refused, with the date it can', !r.ok && r.why === 'wait' && Math.abs(until - (Date.now() + 30 * 86_400_000)) < 120_000, json(r));
  check('A2: coming back to the person it left is allowed at once (and isn\'t a move)', why(await A.link(S, { account: F1 }, { account: W3, kind: 'wallet' })) === 'ok');
  await A.unlink(S, F1, W3);
  await daysPass(W3, 29);
  check('A2 planted: after 29 days → still refused', why(await A.link(S, { account: F2 }, { account: W3, kind: 'wallet' })) === 'wait');
  await daysPass(W3, 2);
  check('A2: after 31 days → allowed', why(await A.link(S, { account: F2 }, { account: W3, kind: 'wallet' })) === 'ok');
}
{
  // While an account is in its wait, the person it is in gets no free counts and passes no check.
  await decide(S, 'lens', L1.subject, true, lensRule(lensMin.minScore!));
  check('the Lens account has a current pass', (await A.personPasses(S, F1)) === true);
  check('unlink the Lens account', why(await A.unlink(S, F1, L1.number)) === 'ok');
  check('A2 planted: alone in its wait, the Lens account\'s own pass gives nothing (no free counts, no check)', (await A.linkedFree(S, L1.number)) === 'none' && (await A.personPasses(S, L1.number)) === false);
  check('A2: …so Pictures has none for it today', (await images.generationsLeft(S, L1.number)) === 0);
  const g = await mayGenerate(S, L1.number);
  check('A2: the gate refuses free images with the wait\'s words', !g.ok && g.reason === 'wait' && g.error === LINKED_WORDING.wait((await A.personWaitUntil(S, L1.number))!.toISOString()), json(g));
  const L1b = await social('bluesky', 3);
  await A.link(S, { account: L1.number, kind: 'lens' }, { account: L1b.number, kind: 'bluesky' });
  check('A2 planted: adding a fresh account to the waiting one doesn\'t free it (the person still has no free counts)', (await A.linkedFree(S, L1b.number)) === 'none');
}

await newDay();
// --- A5: 2 moves in 365 days ----------------------------------------------------------------------------------------
{
  const M = await social('lens', 5);
  const [Fa, Fb, Fc] = [770051, 770052, 770053];
  check('A5: first move (a Lens account joins A)', why(await A.link(S, { account: Fa, kind: 'farcaster' }, { account: M.number, kind: 'lens' })) === 'ok');
  await A.unlink(S, Fa, M.number);
  await daysPass(M.number, 31);
  check('A5: second move (to B, after the wait)', why(await A.link(S, { account: Fb, kind: 'farcaster' }, { account: M.number, kind: 'lens' })) === 'ok');
  await A.unlink(S, Fb, M.number);
  await daysPass(M.number, 31);
  check('A5 planted: a third move inside 365 days (to C) → refused', why(await A.link(S, { account: Fc, kind: 'farcaster' }, { account: M.number, kind: 'lens' })) === 'moves');
  check('A5: going back to the person it last left isn\'t a move → allowed', why(await A.link(S, { account: Fb, kind: 'farcaster' }, { account: M.number, kind: 'lens' })) === 'ok');
  await A.unlink(S, Fb, M.number);
  await daysPass(M.number, 400);
  check('A5: once the moves are more than 365 days old → allowed again', why(await A.link(S, { account: Fc, kind: 'farcaster' }, { account: M.number, kind: 'lens' })) === 'ok');
}

await newDay();
// --- A3: caps and free remixes per person ---------------------------------------------------------------------------
{
  const [Fp, Fq] = [770031, 770032];
  const Lp = await social('lens', 31);
  // The Lens account made 4 pictures and 2 remix frames today on its own, before it joined.
  for (let i = 0; i < 4; i++) await sql`insert into studio.image_asks (fid) values (${Lp.number})`;
  for (let i = 0; i < 2; i++) await sql`insert into studio.remix_asks (person) values (${Lp.number})`;
  await decide(S, 'farcaster', String(Fp), true, neynarRule(IMAGES.neynarMinScore));
  const before = await images.generationsLeft(S, Fp);
  await A.link(S, { account: Fp, kind: 'farcaster' }, { account: Lp.number, kind: 'lens' });
  check('A3: an account joining brings today\'s pictures with it', (await images.generationsLeft(S, Fp)) === before - 4, `${before} → ${await images.generationsLeft(S, Fp)}`);
  check('A3: …and today\'s remix frames', (await remix.generationsLeft(S, Fp, 0.05)) === remix.perDay(Fp) - 2);
  const r = await images.reserve(S, Fp);
  check('a Generate is counted with the person', r.ok && (await sql`select count(*)::int as n from studio.image_asks where fid = ${Fp} and person_id is not null`)[0].n === 1, json(r));
  if (r.ok) await images.settle(S, {});
  await A.unlink(S, Fp, Lp.number);
  check('A3: after the Lens account leaves, the person keeps the Generate made while linked; the Lens account takes back its own earlier rows', (await A.countToday(S, 'image_asks', Fp)) === 1, String(await A.countToday(S, 'image_asks', Fp)));
  check('A3 planted: the Lens account that left gets no free count today (its wait)', (await images.generationsLeft(S, Lp.number)) === 0);
  // Rotating: a fresh account joins Fq, makes pictures, leaves; Fq's count still holds them.
  const Lr = await social('lens', 32);
  await decide(S, 'farcaster', String(Fq), true, neynarRule(IMAGES.neynarMinScore));
  await A.link(S, { account: Fq, kind: 'farcaster' }, { account: Lr.number, kind: 'lens' });
  for (let i = 0; i < 3; i++) {
    const g = await images.reserve(S, await A.actingFor(S, Lr.number));
    if (g.ok) await images.settle(S, {});
  }
  const q1 = await images.generationsLeft(S, Fq);
  await A.unlink(S, Fq, Lr.number);
  check('A3 planted: rotating an account out never frees a count for the person', (await images.generationsLeft(S, Fq)) === q1, `${q1} → ${await images.generationsLeft(S, Fq)}`);
}

await newDay();
// --- Passes if any linked account does; the refusal's next step ------------------------------------------------------
{
  const Fx = 770041;
  await decide(S, 'farcaster', String(Fx), false, neynarRule(IMAGES.neynarMinScore));
  const g0 = await mayGenerate(S, Fx);
  check('a Farcaster account below the check, alone: refused…', !g0.ok && g0.reason === 'score', json(g0));
  const lines = LINKED_WORDING.refusal(['lens', 'bluesky']);
  check('…with the approved next step: link a network not linked yet, or prepay; the detail kept under "Why?"', !g0.ok && g0.error === lines.join(' ') && lines[1] === 'Link a Lens or Bluesky account that passes, or sign in with a wallet and prepay.' && !!g0.why && json(g0.canLink) === json(['lens', 'bluesky']), json(g0));
  const Lx = await social('lens', 41);
  await decide(S, 'lens', Lx.subject, true, lensRule(lensMin.minScore!));
  await A.link(S, { account: Fx, kind: 'farcaster' }, { account: Lx.number, kind: 'lens' });
  const g1 = await mayGenerate(S, Fx);
  check('anyCurrentPass: with a passing Lens account linked, the person passes (no lookup)', g1.ok, json(g1));
  check('…and gets the free count', (await images.generationsLeft(S, Fx)) > 0);
  const Wx = await wallet(41);
  await A.link(S, { account: Fx }, { account: Wx, kind: 'wallet' });
  const Bx = await social('bluesky', 41);
  await A.link(S, { account: Fx }, { account: Bx.number, kind: 'bluesky' });
  check('every network linked: line 2 is the interim prepay line', LINKED_WORDING.refusal([])[1] === 'You can still make them: sign in with a wallet and prepay.');
  check('Submit\'s refusal never offers prepay, whichever networks are missing', [[], ['lens'], ['farcaster', 'lens', 'bluesky']].every((m) => !/prepay|wallet/i.test(LINKED_WORDING.submitRefusal(m as never).join(' '))));
  check('Submit\'s next step: "Link a Farcaster account that passes, then publish a new version and submit it."', LINKED_WORDING.submitRefusal(['farcaster'])[1] === 'Link a Farcaster account that passes, then publish a new version and submit it.');
}

await newDay();
// --- A4 and A7: the challenge ---------------------------------------------------------------------------------------
{
  await asOwner(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
    insert into studio.elements (id, work_id, element_type, created_by_fid) values ('7a111111-1111-4111-8111-111111111111','snowmoon','text',770061);
    insert into studio.element_versions (element_id, version_no, body) values ('7a111111-1111-4111-8111-111111111111', 1, '{}'), ('7a111111-1111-4111-8111-111111111111', 2, '{}');`);
  const [v1, v2] = (await sql`select id from studio.element_versions where element_id = '7a111111-1111-4111-8111-111111111111' order by version_no`).map((r) => String(r.id));
  const [Fa, Fb] = [770061, 770062];
  const Ls = await social('lens', 61);
  await decide(S, 'farcaster', String(Fa), false, neynarRule(0.7));
  await decide(S, 'farcaster', String(Fb), false, neynarRule(0.7));
  await decide(S, 'lens', Ls.subject, true, lensRule(lensMin.minScore!));
  await A.link(S, { account: Fa, kind: 'farcaster' }, { account: Ls.number, kind: 'lens' });
  const pa = await A.challengePass(S, Fa, 'test-challenge', 0.7);
  check('the challenge: a person passes through their linked Lens account, and which one is kept', pa.passed && pa.via === 'lens' && pa.viaAccount === Ls.number, json(pa));
  await sql`insert into studio.challenge_eligibility ${sql({ version_id: v1, challenge: 'test-challenge', fid: Fa, decision: 'passed', eligible: true, person_id: pa.personId, via: pa.via, via_account: pa.viaAccount })}`;
  // The Lens account moves to B after its wait (the challenge isn't frozen for 'test-challenge').
  await A.unlink(S, Fa, Ls.number);
  await daysPass(Ls.number, 31);
  check('the Lens account joins B after its wait', why(await A.link(S, { account: Fb, kind: 'farcaster' }, { account: Ls.number, kind: 'lens' })) === 'ok');
  const pb = await A.challengePass(S, Fb, 'test-challenge', 0.7);
  check('A4 planted: in the same challenge, the account that passed for A never passes for B', !pb.passed, json(pb));
  check('A4: in another challenge it may', (await A.challengePass(S, Fb, 'other-challenge', 0.7)).passed);
  // A7: a submission in a challenge not yet paid out holds the account.
  const Lf = await social('lens', 62);
  const Fc = 770063;
  await A.link(S, { account: Fc, kind: 'farcaster' }, { account: Lf.number, kind: 'lens' });
  // With the SQL pack's item 5, challenge_marks.fid takes a Lens or Bluesky account's number; without it (this branch's
  // folder), only a FID: then the account is held by an eligible version its check made instead. (No failing insert:
  // the PGlite socket server answers the query after an error response out of turn.)
  const [{ social: marksTakeSocial }] = await sql`select pg_get_constraintdef(oid) like '%-1000000000%' as social from pg_constraint where conname = 'challenge_marks_fid_check'`;
  if (marksTakeSocial) await sql`insert into studio.challenge_marks ${sql({ challenge: LINKED_ACCOUNTS.frozenChallenges[0], fid: Lf.number, character: 'zei', version_id: v2 })}`;
  else await sql`insert into studio.challenge_eligibility ${sql({ version_id: v2, challenge: LINKED_ACCOUNTS.frozenChallenges[0], fid: Fc, decision: 'passed', eligible: true, via: 'lens', via_account: Lf.number })}`;
  check('A7 planted: an account with an entry in a challenge not yet paid out can\'t be unlinked', why(await A.unlink(S, Fc, Lf.number)) === 'frozen');
  const Fd = 770064;
  const Ld = await social('lens', 64);
  await sql`insert into studio.challenge_marks ${sql({ challenge: LINKED_ACCOUNTS.frozenChallenges[0], fid: Fd, character: 'zei', version_id: v2 })}`;
  check('A7 planted: a Farcaster account with a submission can\'t join another person either', why(await A.link(S, { account: Ld.number, kind: 'lens' }, { account: Fd, kind: 'farcaster' })) === 'frozen');
  const fz = LINKED_ACCOUNTS as { frozenChallenges: readonly string[] };
  const keep = fz.frozenChallenges;
  fz.frozenChallenges = [];
  check('A7: after the payout (the challenge removed from the list), it can leave', why(await A.unlink(S, Fc, Lf.number)) === 'ok');
  fz.frozenChallenges = keep;
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

await sql.end();
await server.stop();
await db.close();
console.log(`test:linked-accounts: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const x of failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
