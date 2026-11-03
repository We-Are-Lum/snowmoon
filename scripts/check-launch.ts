/**
 * The remix challenge's launch check (docs/launch-2026-11-06.md). Read-only: it writes nothing anywhere.
 *
 *   npm run check:launch -- --url=https://snowmoon.party            (live: run at 09:01 PT on Fri 6 Nov)
 *   npm run check:launch -- --at=2026-11-06T17:00:00Z               (dry: no network, the code's expectations at that instant)
 *
 * Live mode compares what production serves with what the code expects at this moment:
 * - the deployed commit (/api/version), and that the code read here (config, legal texts, src/lib/challenge) is the
 *   same as that commit's, so the expectations below are the deployed code's;
 * - /challenge: its served deadline line ("Entries open …" before, "Entries close …" while open);
 * - the six starting sheets: each character's section on /challenge lists at least one sheet, and that sheet's page
 *   carries the fork switch (challengeOpen) as expected: true while open (a signed-in account sees the fork action and
 *   publishing passes the invited-only gate for that fork), false before;
 * - the free image cap: no public route serves it, so it is computed from the deployed code at this instant, and,
 *   with STUDIO_DATABASE_URL set, today's free spend is read in a read-only transaction to show what is left;
 * - sign-in: POST /api/auth/web/start answers with a Farcaster link and a QR code (this opens a five-minute channel on
 *   Farcaster's relay, as tapping "Sign in" does; nothing is stored on snowmoon.party; skip with --skip-signin);
 * - bounties: each character whose CHALLENGE.bounties address is set shows its poidh link, the others show none, and
 *   the amount appears once set.
 * Neither the channel token nor any key is printed. Exit 1 on any failure.
 *
 * Dry mode (--at) needs nothing but the code: it prints the phase, the deadline line /challenge should show, whether
 * sheets are open to everyone, the cap, the bounties set, and whether the launch kit's hand-written dates match
 * CHALLENGE.dates. scripts/test-check-launch.ts tests it.
 *
 * Admin-only (owner, 2026-11-04): while CHALLENGE.public is off, it expects everything off at any instant: /challenge
 * answers 404 signed out and names nothing of the challenge, sheets stay invited-only, entries aren't taken, the cap is
 * IMAGES.dailySpendCapUsd ($2). The starting-sheet and bounty sections, which read /challenge, are skipped then.
 *
 * Drafted by Claude Code (Claude, a closed model by Anthropic) for the owner, 2026-11-02.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CHALLENGE, IMAGES, imagesDailySpendCapUsd } from '../src/lib/config';
import { dateText, entriesOpen, phase, pacificWallTime } from '../src/lib/challenge/rules';
import { CHALLENGE_WORDING as W } from '../src/lib/challenge/wording';
import { privacyDescribesChallenge } from '../src/lib/challenge/open-sheets';
import { requireTarget } from './lib/target';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => args.includes(`--${name}`);

/** The launch kit's hand-written dates (docs/proposals/challenge-launch-kit.md, 2026-11-01), as the posts write them. */
const KIT_DATES: Record<'opens' | 'closes' | 'results', string> = { opens: 'Fri 6 Nov, 09:00 PT', closes: 'Sun 22 Nov, 23:59 PT', results: 'Fri 4 Dec' };

/** A config date written the way the kit writes it ("Fri 6 Nov, 09:00 PT"), from CHALLENGE.dates only. */
function kitStyle(key: 'opens' | 'closes' | 'results'): string {
  const long = dateText(key, { time: key !== 'results' }); // "Friday 6 November, 09:00 Pacific"
  const m = /^(\w{3})\w* (\d+) (\w{3})\w*(?:, (\d\d:\d\d) Pacific)?$/.exec(long);
  if (!m) return long;
  return `${m[1]} ${m[2]} ${m[3]}${m[4] ? `, ${m[4]} PT` : ''}`;
}

const callName = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);
const bountySet = () => CHALLENGE.characters.filter((s) => CHALLENGE.bounties[s]);

interface Expected {
  at: string;
  /** CHALLENGE.public: the owner's switch. Off: admin-only, /challenge answers 404 and nothing opens by date. */
  public: boolean;
  entriesTaken: boolean;
  pacific: string;
  phase: 'before' | 'open' | 'closed';
  deadlineLine: string;
  sheetsOpenToEveryone: boolean;
  privacyDescribesChallenge: boolean;
  capUsd: number;
  bounties: string[];
  bountyAmount: string | null;
  kitDatesMatch: boolean;
}

/** What the code says the site should be at an instant: no network, no database. */
function expectedAt(at: Date): Expected {
  const ph = phase(at);
  const privacy = privacyDescribesChallenge();
  const pub = CHALLENGE.public as boolean;
  return {
    at: at.toISOString(),
    public: pub,
    entriesTaken: entriesOpen(at),
    pacific: pacificWallTime(at.toISOString()),
    phase: ph,
    deadlineLine: !pub ? 'not found (admin-only: CHALLENGE.public is off)' : ph === 'before' ? W.opensOn() : ph === 'open' ? W.deadline() : W.closed(),
    sheetsOpenToEveryone: pub && CHALLENGE.openSheets && ph === 'open' && privacy,
    privacyDescribesChallenge: privacy,
    capUsd: imagesDailySpendCapUsd(at),
    bounties: bountySet(),
    bountyAmount: CHALLENGE.bountyAmount,
    kitDatesMatch: (['opens', 'closes', 'results'] as const).every((k) => kitStyle(k) === KIT_DATES[k]),
  };
}

let failures = 0;
const ok = (pass: boolean, what: string) => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${what}`);
  if (!pass) failures++;
};
const note = (what: string) => console.log(`note ${what}`);
const label = (ph: Expected['phase']) => (ph === 'before' ? 'BEFORE LAUNCH' : ph === 'open' ? 'OPEN' : 'CLOSED');

function printExpected(e: Expected) {
  console.log(`at ${e.at} (${e.pacific} Pacific): ${label(e.phase)} by the dates; CHALLENGE.public ${e.public ? 'on' : 'OFF: admin-only, nothing opens by date'}`);
  console.log(`  entries taken: ${e.entriesTaken ? 'yes' : 'no'}`);
  console.log(`  /challenge should say: "${e.deadlineLine}"`);
  console.log(`  sheets open to everyone who passes the gate: ${e.sheetsOpenToEveryone ? 'yes' : 'no'} (openSheets ${CHALLENGE.openSheets ? 'on' : 'off'}, Privacy describes the challenge: ${e.privacyDescribesChallenge ? 'yes' : 'no'})`);
  console.log(`  free image cap: $${e.capUsd} (IMAGES $${IMAGES.dailySpendCapUsd} outside the window, CHALLENGE $${CHALLENGE.dailySpendCapUsd} inside)`);
  console.log(`  entries listed: ${CHALLENGE.entries ? 'on' : 'off'}; "Posted on": ${CHALLENGE.posts ? 'on' : 'off'}`);
  console.log(`  bounty links set: ${e.bounties.length ? e.bounties.join(', ') : 'none'}; amount: ${e.bountyAmount ?? 'not set'}`);
  for (const k of ['opens', 'closes', 'results'] as const) console.log(`  kit date ${k}: config gives "${kitStyle(k)}", kit writes "${KIT_DATES[k]}"${kitStyle(k) === KIT_DATES[k] ? '' : '  <- MISMATCH'}`);
}

// ---------------------------------------------------------------------------------------------
// Dry mode: --at=<ISO>, no network.
// ---------------------------------------------------------------------------------------------
const atArg = arg('at');
if (atArg !== undefined) {
  const at = new Date(atArg);
  if (!/^\d{4}-\d\d-\d\dT/.test(atArg) || Number.isNaN(at.getTime())) {
    console.error(`check:launch: --at needs an ISO instant, e.g. --at=2026-11-06T17:00:00Z (got "${atArg}")`);
    process.exit(1);
  }
  if (args.some((a) => a.startsWith('--url='))) {
    console.error('check:launch: --at is the dry mode (no network); leave out --url');
    process.exit(1);
  }
  const e = expectedAt(at);
  console.log('check:launch dry run (no network; from the code in this checkout)');
  printExpected(e);
  console.log(`expected ${JSON.stringify(e)}`);
  process.exit(e.kitDatesMatch ? 0 : 1);
}

// ---------------------------------------------------------------------------------------------
// Live mode: --url=<target>. GETs only, plus the sign-in start (see the header).
// ---------------------------------------------------------------------------------------------
const BASE = requireTarget('check:launch');
const UA = { 'User-Agent': 'snowmoon-check-launch' };

async function get(p: string): Promise<{ status: number; text: string }> {
  const r = await fetch(`${BASE}${p}`, { headers: UA, cache: 'no-store', redirect: 'manual' });
  return { status: r.status, text: await r.text() };
}

/** /challenge's section for one character: from its heading's section to the next. */
function section(html: string, slug: string): string {
  const start = html.indexOf(`aria-labelledby="ch-${slug}"`);
  if (start < 0) return '';
  const end = html.indexOf('</section>', start);
  return html.slice(start, end < 0 ? undefined : end);
}
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

const now = new Date();
const exp = expectedAt(now);
console.log(`check:launch against ${BASE}`);
printExpected(exp);
ok(exp.kitDatesMatch, 'the launch kit\'s dates match CHALLENGE.dates');

// 1. The deployed commit, and that the expectations are its code's.
const version = await get('/api/version').catch(() => ({ status: 0, text: '' }));
let commit = '';
try {
  commit = String(JSON.parse(version.text).commit ?? '');
} catch {
  /* reported below */
}
ok(version.status === 200 && /^[0-9a-f]{40}$/.test(commit), `/api/version answers with a commit (${commit ? commit.slice(0, 7) : `status ${version.status}`})`);
if (commit) {
  const paths = ['src/lib/config.ts', 'src/lib/legal.ts', 'src/lib/challenge'];
  try {
    execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' });
    let same = true;
    try {
      execFileSync('git', ['-C', ROOT, 'diff', '--quiet', commit, '--', ...paths], { stdio: 'ignore' });
    } catch {
      same = false;
    }
    ok(same, `the challenge code here matches the deployed commit ${commit.slice(0, 7)} (${paths.join(', ')})${same ? '' : ': check out that commit, or the expectations are not production\'s'}`);
  } catch {
    ok(false, `the deployed commit ${commit.slice(0, 7)} isn't in this checkout: run git fetch origin main first`);
  }
}

// 2. /challenge's served state. The page is regenerated at most every 60 s, so just after 09:00 it may still be the
// "before" copy for a minute: retry a few times when close to a boundary.
const nearBoundary = [CHALLENGE.dates.opens, CHALLENGE.dates.closes].some((d) => Math.abs(now.getTime() - Date.parse(d)) < 10 * 60_000);
let page = await get('/challenge');
for (let i = 0; nearBoundary && i < 4 && !unescape(page.text).includes(exp.deadlineLine); i++) {
  note('/challenge still shows the earlier copy (cached up to 60 s); trying again in 30 s');
  await new Promise((r) => setTimeout(r, 30_000));
  page = await get('/challenge');
}
const html = unescape(page.text);
if (!exp.public) {
  // Admin-only: a signed-out GET is the usual "not found", with nothing of the challenge in it.
  ok(page.status === 404, `/challenge answers 404 signed out (${page.status}): admin-only, CHALLENGE.public is off`);
  const named = /Remix the cast|remix challenge/i.exec(html);
  ok(!named, `/challenge's HTML names nothing of the challenge${named ? ` (found "${named[0]}")` : ''}`);
  const home = unescape((await get('/')).text);
  const homeNamed = /Remix the cast|remix challenge/i.exec(home);
  ok(!homeNamed, `the home page names nothing of the challenge${homeNamed ? ` (found "${homeNamed[0]}")` : ''}`);
  ok(!exp.sheetsOpenToEveryone && !exp.entriesTaken && exp.capUsd === IMAGES.dailySpendCapUsd, `the code opens nothing: sheets invited-only, no entries, cap $${exp.capUsd}`);
  note('starting sheets and bounties are on /challenge, which is admin-only: not checked signed out');
}
if (exp.public) ok(page.status === 200, `/challenge answers 200 (${page.status})`);
const served = /Entries (open|close|closed) [A-Z][a-z]+day \d+ [A-Z][a-z]+, \d\d:\d\d Pacific\./.exec(html)?.[0] ?? '(no deadline line found)';
if (exp.public) ok(served === exp.deadlineLine, `/challenge says "${served}" (expected "${exp.deadlineLine}": ${label(exp.phase)})`);
const servedPhase = !exp.public ? 'admin-only' : served.startsWith('Entries open') ? 'before' : served.startsWith('Entries closed') ? 'closed' : served.startsWith('Entries close') ? 'open' : 'unknown';

// 3. The six starting sheets, and the fork switch on each first one.
const sheetLinks: Record<string, string | null> = {};
for (const slug of exp.public ? CHALLENGE.characters : []) {
  const s = section(html, slug);
  const id = /href="\/references\/designs\/([0-9a-f-]{36})"/.exec(s)?.[1] ?? null;
  sheetLinks[slug] = id;
  ok(Boolean(s) && id !== null, `${callName(slug)}: /challenge lists a starting sheet${id ? ` (${id.slice(0, 8)})` : s.includes('No sheet of') ? ': "No sheet of ' + callName(slug) + ' is published yet"' : ': section missing'}`);
}
for (const slug of CHALLENGE.characters) {
  const id = sheetLinks[slug];
  if (!id) continue;
  const p = await get(`/references/designs/${id}`).catch(() => ({ status: 0, text: '' }));
  const m = /\\?"challengeOpen\\?":(true|false)/.exec(p.text);
  const open = m ? m[1] === 'true' : null;
  ok(p.status === 200 && open === exp.sheetsOpenToEveryone, `${callName(slug)}: its sheet page answers ${p.status}, fork open to everyone who passes the gate: ${open === null ? 'not found' : open ? 'yes' : 'no'} (expected ${exp.sheetsOpenToEveryone ? 'yes' : 'no'})`);
}

// 4. The free image cap: from the deployed code (checked above); today's spend from a read-only transaction.
note(`free image cap now: $${exp.capUsd}, from the deployed code at ${exp.at} (no public route serves the cap)`);
if (process.env.STUDIO_DATABASE_URL && !flag('no-db')) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.STUDIO_DATABASE_URL, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 15 });
  const ROLLBACK = new Error('rollback');
  try {
    await sql
      .begin('read only', async (tx) => {
        const [who] = await tx`select current_user as u, current_setting('transaction_read_only') as ro`;
        const [spent] = await tx`select coalesce(sum(cost_usd), 0)::float8 as usd, count(*)::int as n from studio.image_costs where day = (now() at time zone 'utc')::date and funded = 'free'`;
        ok(who.ro === 'on', `database read as ${who.u}, read-only transaction (${who.ro})`);
        note(`free image spend today (UTC): $${Number(spent.usd).toFixed(4)} of $${exp.capUsd}, $${Math.max(0, exp.capUsd - Number(spent.usd)).toFixed(4)} left (${spent.n} rows)`);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  } catch (e) {
    ok(false, `database read failed (${(e as { code?: string }).code ?? (e as Error).name})`);
  } finally {
    await sql.end({ timeout: 5 });
  }
} else {
  note('database not read (no STUDIO_DATABASE_URL, or --no-db): today\'s spend not shown');
}

// 5. Sign-in starts: a Farcaster link and a QR code. The token and the link are not printed.
if (flag('skip-signin')) {
  note('sign-in start skipped (--skip-signin)');
} else {
  const r = await fetch(`${BASE}/api/auth/web/start`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
  const body = r ? ((await r.json().catch(() => ({}))) as { url?: unknown; qr?: unknown; channelToken?: unknown; error?: unknown }) : {};
  let host = '';
  try {
    host = typeof body.url === 'string' ? new URL(body.url).hostname : '';
  } catch {
    host = '';
  }
  const good = r?.status === 200 && /(^|\.)farcaster\.xyz$/.test(host) && typeof body.qr === 'string' && body.qr.includes('<svg') && typeof body.channelToken === 'string';
  ok(good, `sign-in start answers ${r?.status ?? 'nothing'} with ${good ? `a link on ${host} and a QR code` : typeof body.error === 'string' ? `"${body.error}"` : 'no link'}`);
}

// 6. Bounties: links for the characters whose address is set, none for the others; the amount once set.
for (const slug of exp.public ? CHALLENGE.characters : []) {
  const s = section(html, slug);
  const link = /href="(https:\/\/(?:www\.)?poidh\.xyz\/[^"]*)"/.exec(s)?.[1] ?? null;
  const want = CHALLENGE.bounties[slug];
  if (want) ok(link !== null && link === new URL(want).toString(), `${callName(slug)}: bounty link shown (${link ?? 'none'})`);
  else ok(link === null, `${callName(slug)}: no bounty link yet (address not set)${link ? `, but the page links ${link}` : ''}`);
}
if (exp.public && CHALLENGE.bountyAmount) ok(html.includes(`, ${CHALLENGE.bountyAmount} each`), `the bounty paragraph names the amount (${CHALLENGE.bountyAmount})`);
else note('bounty amount not set (CHALLENGE.bountyAmount is null)');

console.log(`\ncheck:launch: production is ${servedPhase === 'admin-only' ? 'ADMIN-ONLY (404 signed out)' : servedPhase === 'before' ? 'BEFORE LAUNCH' : servedPhase === 'open' ? 'OPEN' : servedPhase === 'closed' ? 'CLOSED' : 'UNKNOWN'} (served), the code expects ${label(exp.phase)}; cap $${exp.capUsd}; ${failures ? `${failures} failed` : 'every check passed'}`);
process.exit(failures ? 1 : 0);
