/**
 * Image making for everyone (owner, 2026-10-09): the Neynar gate, the caps, and report alerts.
 * Fails (exit 1) on any problem.
 *
 *   npm run test:images-gate
 *
 * No call leaves the machine. Runs every migration in an in-memory Postgres (PGlite), talks to it
 * as studio_writer, and stands a local HTTP server in for Neynar and for ntfy. Checks:
 * - The gate: a score of 0.7 or more passes; 0.69 is refused with the score shown; Neynar down,
 *   answering 500, too slow, no key, or no score in its answer: refused, nothing kept and nothing
 *   counted. Invited FIDs skip the lookup (the stand-in hears nothing). The lookup carries only
 *   the FID. A second Generate within a day asks again only after the day is over.
 * - The launch order: outside the invited list, refused until the legal pages are built and the
 *   alert is set.
 * - The generate route refuses at the gate before it counts, reserves or calls a model.
 * - The caps: no all-days cap; $2 a day across everyone; 10 Generates and 3 publishes per person.
 * - Alerts: a planted report sends exactly one push, "Snowmoon: 1 reports waiting", with nothing
 *   else in it; a second within the hour sends none; after the hour a hide sends one with the new
 *   count; with SNOWMOON_ALERT_URL unset nothing is sent, and nothing throws.
 */
import path from 'node:path';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { IMAGES, imagesDailySpendCapUsd } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');

// --- Stand-ins for Neynar and ntfy ------------------------------------------------
type Heard = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
let heard: Heard[] = [];
/** How the Neynar stand-in answers, per FID. */
let neynar: (fid: number) => { status: number; body: unknown; delayMs?: number } = () => ({ status: 500, body: {} });
let ntfyStatus = 200;
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    heard.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
    if (req.url?.startsWith('/neynar/')) {
      const fid = Number(new URL(req.url, 'http://x').searchParams.get('fids'));
      const a = neynar(fid);
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(a.status, { 'content-type': 'application/json' }).end(JSON.stringify(a.body));
      }, a.delayMs ?? 0);
    } else res.writeHead(ntfyStatus).end('{}');
  });
});
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
const STUB = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
const user = (fid: number, score: number) => ({ status: 200, body: { users: [{ fid, username: 'x', score, experimental: { neynar_user_score: score } }] } });
const toNeynar = () => heard.filter((h) => h.url.startsWith('/neynar/'));
const toNtfy = () => heard.filter((h) => h.url.startsWith('/ntfy/'));

// Headers Node's fetch adds by itself; anything beyond these (and the key) would be ours.
const DEFAULT_HEADERS = ['host', 'connection', 'accept', 'accept-language', 'sec-fetch-mode', 'user-agent', 'accept-encoding'];

// --- The database -------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
const PORT = 54333;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
type Sql = Parameters<typeof import('../src/lib/images/limits').reserve>[0];
const S = sql as unknown as Sql;

const { NEYNAR } = await import('../src/lib/images/neynar');
const { mayGenerate, GATE_WORDING } = await import('../src/lib/images/gate');
const { keptDecision, neynarRule } = await import('../src/lib/images/neynar');
const CD = await import('../src/lib/checks/decisions');
const { reserve, settle, generationsLeft, publishesLeft } = await import('../src/lib/images/limits');
const { alertReports, alertBody, reportsWaiting } = await import('../src/lib/images/alert');

NEYNAR.url = `${STUB}/neynar/v2/farcaster/user/bulk`;
NEYNAR.timeoutMs = 400;
process.env.NEYNAR_API_KEY = 'test-neynar-key';
process.env.SNOWMOON_ALERT_URL = `${STUB}/ntfy/snowmoon-test`;
process.env.APP_LEGAL_PAGES = 'terms+privacy';
const quiet = console.error;
console.error = () => {};

const counted = async (fid: number) => {
  const [r] = await sql`select (select count(*)::int from studio.image_asks where fid = ${fid}) as asks,
    (select count(*)::int from studio.image_costs where kind = 'reserved' and calls <> 0) as reserved`;
  return r;
};
/** Decisions kept for a FID (any threshold), and every kept score (none, from the migration on). */
const kept = async (fid: number) => (await sql`select count(*)::int as n from studio.check_decisions where network = 'farcaster' and account = ${String(fid)}`)[0].n;
const scores = async () => (await pg.query<{ n: number }>(`select count(*)::int as n from studio.image_scores`)).rows[0].n;
const age = (fid: number, interval: string) => pg.exec(`update studio.check_decisions set decided_at = now() - interval '${interval}' where network = 'farcaster' and account = '${fid}'`);

/** What the generate route does with the gate: refuse first, or count and reserve. */
async function attempt(fid: number) {
  const g = await mayGenerate(S, fid);
  if (!g.ok) return g;
  const r = await reserve(S, fid);
  if (r.ok) await settle(S, {});
  return { ok: true as const, reserved: r.ok };
}

// --- The gate ------------------------------------------------------------------------
neynar = (fid) => (fid === 100 ? user(100, 0.85) : fid === 101 ? user(101, 0.69) : fid === 103 ? user(103, 0.7) : { status: 500, body: {} });

heard = [];
const pass = await attempt(100);
check('a score of 0.85 passes', pass.ok === true, JSON.stringify(pass));
const asked = toNeynar();
check('one lookup for a first Generate', asked.length === 1, String(asked.length));
if (asked[0]) {
  check('the lookup asks for the FID and nothing else', asked[0].url === '/neynar/v2/farcaster/user/bulk?fids=100', asked[0].url);
  check('the lookup is a GET with no body', asked[0].method === 'GET' && asked[0].body === '');
  check('the lookup carries the key', asked[0].headers['x-api-key'] === 'test-neynar-key');
  const extra = Object.keys(asked[0].headers).filter((h) => h !== 'x-api-key' && !DEFAULT_HEADERS.includes(h));
  check('the lookup carries no other header (no cookie, no token, no name)', extra.length === 0, extra.join(', '));
  check('the lookup sends no cookie or authorization', !asked[0].headers.cookie && !asked[0].headers.authorization);
}

// No score kept (owner, 2026-11-04): only the decision, when, and the threshold.
const [d100] = await sql`select * from studio.check_decisions where network = 'farcaster' and account = '100'`;
check('a decision is kept: passed, when, the threshold', d100?.passed === true && d100.threshold === neynarRule(IMAGES.neynarMinScore) && d100.decided_at instanceof Date, JSON.stringify(d100));
check('no score kept: the decision row holds no number, and image_scores stays empty', d100 !== undefined && !Object.values(d100).some((v) => typeof v === 'number' || (typeof v === 'string' && /^0\.\d+$/.test(v))) && (await scores()) === 0, JSON.stringify(d100));
{
  // Planted: a gate that still keeps the score. It must be caught by the same two checks.
  await pg.exec(`reset role; insert into studio.image_scores (fid, score) values (100, 0.85); set role studio_writer;`);
  proof('a kept score is caught', (await scores()) === 1);
  await pg.exec(`reset role; delete from studio.image_scores; set role studio_writer;`);
}
check('the writer can no longer keep a score', await sql`insert into studio.image_scores (fid, score) values (1, 0.9)`.then(() => false, () => true));

// A pass is reused for 90 days with no lookup.
heard = [];
await attempt(100);
check('a second Generate the same day does not ask Neynar', toNeynar().length === 0, String(toNeynar().length));
await age(100, '89 days 23 hours');
heard = [];
check('a pass 89 days 23 hours old passes with no lookup', (await attempt(100)).ok === true && toNeynar().length === 0, String(toNeynar().length));
{
  // Planted: a pass treated as current for only a day (the old score cache) is caught.
  const real = (await import('../src/lib/config')).CHECKS.passDays;
  (await import('../src/lib/config')).CHECKS.passDays = 1;
  heard = [];
  await attempt(100);
  proof('a pass kept only a day would ask Neynar again', toNeynar().length === 1);
  (await import('../src/lib/config')).CHECKS.passDays = real;
  await age(100, '89 days 23 hours');
}
await age(100, '90 days 1 minute');
heard = [];
await attempt(100);
check('after 90 days it asks again', toNeynar().length === 1, String(toNeynar().length));

heard = [];
check('exactly 0.7 passes', (await attempt(103)).ok === true);

// A fail is not asked again before 24 hours.
const before101 = await counted(101);
heard = [];
const low = await mayGenerate(S, 101);
check('0.69 is refused with 403', !low.ok && low.status === 403 && low.reason === 'score', JSON.stringify(low));
if (!low.ok) {
  check('the refusal says the score just looked up, and the threshold', low.error === GATE_WORDING.below(0.69) && low.error.includes('Yours is 0.69') && low.error.includes('0.7 or more'), low.error);
  check('the refusal says everything else still works', /Reading, listening, saving cards and everything else still work/.test(low.error));
}
check('a fail is kept as a decision, not a score', (await kept(101)) >= 1 && (await keptDecision(S, 101, IMAGES.neynarMinScore))?.passed === false);
neynar = (fid) => (fid === 101 ? user(101, 0.95) : fid === 100 ? user(100, 0.85) : fid === 103 ? user(103, 0.7) : { status: 500, body: {} });
await age(101, '23 hours 59 minutes');
heard = [];
const low2 = await attempt(101);
const after101 = await counted(101);
check('a fail 23 hours 59 minutes old is refused again without asking Neynar', !low2.ok && toNeynar().length === 0, String(toNeynar().length));
if (!low2.ok) check('the kept fail says when it can be checked again, and no score', low2.error === GATE_WORDING.belowKept(new Date(Date.now() + 60_000)) && !/Yours is/.test(low2.error), low2.error);
check('a refused check counts nothing', !low2.ok && after101.asks === 0 && after101.reserved === before101.reserved, JSON.stringify(after101));
{
  // Planted: a fail treated as current for no time at all would ask again at once.
  const C = (await import('../src/lib/config')).CHECKS;
  const real = C.failHours;
  C.failHours = 0;
  heard = [];
  await mayGenerate(S, 101);
  proof('a fail re-checked before 24 hours is caught', toNeynar().length === 1);
  C.failHours = real;
  await CD.decide(S, 'farcaster', '101', false, neynarRule(IMAGES.neynarMinScore));
}
await age(101, '24 hours 1 minute');
heard = [];
check('after 24 hours a fail is asked again (and now passes)', (await attempt(101)).ok === true && toNeynar().length === 1);
check('the status reads the kept decision without asking Neynar', await (async () => { heard = []; const v = await keptDecision(S, 101, IMAGES.neynarMinScore); return v?.passed === true && toNeynar().length === 0; })());
check('a score just under is never shown as 0.70', GATE_WORDING.below(0.6999).includes('Yours is 0.69'));
check('the kept-fail wording: "about 1 hour" and "about 24 hours"', GATE_WORDING.belowKept(new Date(Date.now() + 1000)).includes('about 1 hour.') && GATE_WORDING.belowKept(new Date(Date.now() + 86_400_000 - 1000)).includes('about 24 hours.'));

// Re-checked early: the threshold changed.
{
  const real = IMAGES.neynarMinScore;
  (IMAGES as { neynarMinScore: number }).neynarMinScore = 0.8;
  heard = [];
  const r = await mayGenerate(S, 100);
  check('a new threshold asks again, at once, though a pass is current under the old one', toNeynar().length === 1 && r.ok === true, `${toNeynar().length} ${JSON.stringify(r)}`);
  (IMAGES as { neynarMinScore: number }).neynarMinScore = real;
  heard = [];
  await mayGenerate(S, 100);
  proof('a reader that ignored the threshold would not have asked', toNeynar().length === 0);
}

// Re-checked early: a report, or a picture hidden by a moderator, an admin or a rule. Exercised through the API the
// routes call (markForRecheck / recheckMaker); the routes' wiring is checked in their source below.
heard = [];
await attempt(103);
check('a current pass: no lookup', toNeynar().length === 0);
await CD.recheckMaker(S, 103);
heard = [];
await attempt(103);
check('after a report or hide, the next Generate asks Neynar again', toNeynar().length === 1, String(toNeynar().length));
{
  const route = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
  const report = route('src/app/api/images/[id]/report/route.ts');
  check('every report withdraws the maker\'s pass, after the report is logged', report.indexOf('await recheckMaker(sql, el.byFid)') > report.indexOf("step: 'reported'"));
  check('a moderator\'s hide withdraws the maker\'s pass', /await recheckMaker\(sql, el\.byFid\)/.test(route('src/app/api/moderate/route.ts')));
  check('an admin\'s hide withdraws the maker\'s pass', /await recheckMaker\(sql, el\.byFid\)/.test(route('src/app/api/admin/hide/route.ts')));
  check('an admin\'s hide of a remix frame withdraws the maker\'s pass', /if \(role === 'maintainer' \|\| CHECKS\.recheckOnOwnHide\) await recheckMaker\(sql, f\.person\)/.test(route('src/lib/remix/hide.ts')));
  check('a maker\'s own hide does so only if the owner turns it on', /if \(CHECKS\.recheckOnOwnHide\) await recheckMaker\(sql, el\.byFid\)/.test(route('src/app/api/images/[id]/hide/route.ts')));
  proof('a report route without the re-check is caught', report.replace('await recheckMaker(sql, el.byFid)', '').indexOf('await recheckMaker(sql, el.byFid)') < 0);
}

// Every way Neynar can fail: refused, nothing kept, nothing counted.
const failing: [string, () => void, () => void][] = [
  ['answers 500', () => (neynar = () => ({ status: 500, body: {} })), () => {}],
  ['is too slow', () => (neynar = (f) => ({ ...user(f, 0.9), delayMs: 1500 })), () => {}],
  ['has no score in its answer', () => (neynar = (f) => ({ status: 200, body: { users: [{ fid: f, username: 'x' }] } })), () => {}],
  ['answers with no user', () => (neynar = () => ({ status: 200, body: { users: [] } })), () => {}],
  ['answers for another FID', () => (neynar = () => user(1, 0.9)), () => {}],
  ['is down', () => (NEYNAR.url = 'http://127.0.0.1:9/neynar/v2/farcaster/user/bulk'), () => (NEYNAR.url = `${STUB}/neynar/v2/farcaster/user/bulk`)],
  ['has no key here', () => delete process.env.NEYNAR_API_KEY, () => (process.env.NEYNAR_API_KEY = 'test-neynar-key')],
];
for (const [what, set, unset] of failing) {
  set();
  heard = [];
  const r = await attempt(102);
  const c = await counted(102);
  check(`Neynar ${what}: refused with 503`, !r.ok && r.status === 503 && r.reason === 'unreachable', JSON.stringify(r));
  if (!r.ok) check(`Neynar ${what}: says it can't be reached`, r.error === GATE_WORDING.unreachable);
  check(`Neynar ${what}: nothing kept`, (await kept(102)) === 0);
  check(`Neynar ${what}: nothing counted or reserved`, c.asks === 0 && c.reserved === 0, JSON.stringify(c));
  if (what === 'has no key here') check('with no key, nothing is sent', toNeynar().length === 0);
  unset();
}
await new Promise((r) => setTimeout(r, 1200)); // let the slow answer finish
check(GATE_WORDING.unreachable.slice(0, 40), /Neynar, which scores Farcaster accounts, can’t be reached/.test(GATE_WORDING.unreachable));

// Invited FIDs skip the lookup.
neynar = () => user(6786, 0.1);
heard = [];
const inv = await attempt(IMAGES.invited[0]);
check('an invited FID passes without a lookup', inv.ok === true && toNeynar().length === 0, `${JSON.stringify(inv)} ${toNeynar().length}`);
check('an invited FID gets no kept row', (await kept(IMAGES.invited[0])) === 0);

// The launch order.
neynar = (f) => user(f, 0.95);
for (const [what, name, value] of [['the alert is not set', 'SNOWMOON_ALERT_URL', process.env.SNOWMOON_ALERT_URL], ['the legal pages are not built', 'APP_LEGAL_PAGES', 'terms+privacy']] as const) {
  delete process.env[name];
  heard = [];
  const r = await attempt(104);
  check(`while ${what}: refused with 503`, !r.ok && r.status === 503 && r.reason === 'not-open', JSON.stringify(r));
  check(`while ${what}: Neynar is not asked`, toNeynar().length === 0);
  check(`while ${what}: nothing counted`, (await counted(104)).asks === 0);
  check(`while ${what}: an invited FID still passes`, (await mayGenerate(S, IMAGES.invited[0])).ok === true);
  process.env[name] = value;
}
process.env.APP_LEGAL_PAGES = 'missing';
check('a build without the pages refuses', !(await mayGenerate(S, 104)).ok);
process.env.APP_LEGAL_PAGES = 'terms+privacy';

// The route refuses at the gate before counting, reserving or calling a model.
{
  const src = readFileSync(path.join(ROOT, 'src/app/api/images/generate/route.ts'), 'utf8');
  const at = (s: string) => src.indexOf(s);
  check('the generate route calls the gate', at('await mayGenerate(') > 0);
  // Step 4: counting, reserving, the prompt check and the model all happen in paidPicture (paid.ts), in that order.
  check('the gate comes before the count and the reservation', at('await mayGenerate(') > 0 && at('await mayGenerate(') < at('await paidPicture('));
  const paidSrc = readFileSync(path.join(ROOT, 'src/lib/images/paid.ts'), 'utf8');
  const pat = (s: string) => paidSrc.indexOf(s);
  check('the gate comes before the prompt check and the image model', at('await mayGenerate(') < at('makeImage(prompt)') && pat('await reserve(') > 0 && pat('await reserve(') < pat('checkPrompt(job.checkText') && pat('checkPrompt(job.checkText') < pat('await job.make()'));
  // Samples and views for designs: invited FIDs only (owner, 2026-10-10), then the same gate before anything is paid.
  const sample = readFileSync(path.join(ROOT, 'src/app/api/designs/sample/route.ts'), 'utf8');
  const sat = (s: string) => sample.indexOf(s);
  // The remix challenge (owner, 2026-10-31): views also open while challengeSheetsOpen() (the window, and Privacy's words).
  check('samples and views are for invited FIDs only (or a sheet\'s views while the remix challenge opens them), with the drafted refusal', sat('if (!IMAGES.invited.includes(fid) && !viewForChallenge) return no(IMAGE_WORDING.designs.form.notInvited') > 0 && sat('challengeSheetsOpen() ?') > 0 && sat('challengeSheetsOpen() ?') < sat('if (!IMAGES.invited.includes(fid) && !viewForChallenge)'));
  check('samples and views go through the same gate before anything is counted', sat('await mayGenerate(') > sat('hasConsented(fid)') && sat('await mayGenerate(') < sat('await paidPicture('));
  const publish = readFileSync(path.join(ROOT, 'src/app/api/designs/route.ts'), 'utf8');
  const dat = (s: string) => publish.indexOf(s);
  check('publishing a design is for invited FIDs only (or a challenge character\'s fork while the remix challenge opens them), with the drafted refusal', dat('if (!IMAGES.invited.includes(fid) && !(await openForChallenge(sql, mode, kind, body.from))) return no(IMAGE_WORDING.designs.form.notInvited') > 0 && dat('await mayGenerate(') > dat('openForChallenge('));
  {
    const picks = readFileSync(path.join(ROOT, 'src/app/api/designs/picks/route.ts'), 'utf8');
    // Picks opened to everyone signed in, Farcaster or wallet (owner, 2026-10-19, e749871; Privacy names them).
    // Making styles and sheets stays invited-only (the two checks above). Same rule as test:designs.
    const code = picks.replace(/\/\*[\s\S]*?\*\//g, '');
    check('picks are open to everyone signed in: no invite gate, a sign-in is required for GET, POST and DELETE', !/invited/.test(code) && /getPerson\(request\)/.test(code) && /status: 401/.test(code) && (code.match(/const w = await who\(request\);\s*if \('error' in w\) return w\.error;/g) ?? []).length === 3);
    // At Generate too, Farcaster accounts invited or not and wallet accounts (owner, 2026-10-23: "open picks to everyone
    // at Generate, wallets too"). The daily limits and the gate are unchanged: picks add text, or pictures through the same paid path.
    const statusCode = readFileSync(path.join(ROOT, 'src/app/api/images/status/route.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('the composer is offered every signed-in person\'s own picks, invited or not, wallet accounts too', /composerPicks\(picks\)/.test(statusCode) && !/invited \?\s*picks/.test(statusCode) && (statusCode.match(/picks: offer\(picks\)/g) ?? []).length === 2 && !/picks: \{ styles: \[\]/.test(statusCode));
    const genCode = readFileSync(path.join(ROOT, 'src/app/api/images/generate/route.ts'), 'utf8');
    check('Generate takes only the person\'s own picks, and opening picks adds no way around the gate or the caps', /\(await myPicks\(sql, fid\)\)\.filter\(\(p\) => p\.available\)/.test(genCode) && genCode.indexOf('await mayGenerate(') < genCode.indexOf('await myPicks(') && genCode.indexOf('await myPicks(') < genCode.indexOf('await paidPicture(') && !/invited/.test(genCode.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
    check('the composer links to My picks for everyone signed in', !/status\.invited && \(\s*<p className="ic-note">\s*<Link href="\/images\/picks">/.test(readFileSync(path.join(ROOT, 'src/components/image-composer.tsx'), 'utf8')));
  }
  check('publishing a design passes the gate before the name\'s paid check', dat('await mayGenerate(') > 0 && dat('await mayGenerate(') < dat('await checkWords('));
  check('the gate\'s refusal is returned at once', /if \(!gate\.ok\) return no\(gate\.error, gate\.status/.test(src));
  check('no invited-only refusal is left', !/invited readers only/.test(src));
  const nx = readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8');
  check('next.config.ts derives APP_LEGAL_PAGES from both page files', /APP_LEGAL_PAGES: legalPages\(\)/.test(nx) && /has\('terms'\) && has\('privacy'\)/.test(nx));
}

// --- A pick used as text doesn't change a Generate's cost (owner, 2026-10-23: "If a pick raises the price, ...") ------
// A picked style or sheet adds only text: the same model, the same picture size (fal bills by megapixel), so the
// image's worst case is unchanged. The text does lengthen the prompt check; even with every pick at its longest,
// counted as one token per byte, that stays inside the reserve's margin over the image. Pictures sent as references
// do change it (the edit model): test:wallet checks that price is shown and charged.
{
  const { CHAT } = await import('../src/lib/config');
  const { finalPrompt } = await import('../src/lib/images/rules');
  const fal = readFileSync(path.join(ROOT, 'src/lib/images/fal.ts'), 'utf8');
  check('a text-to-image Generate is billed by its picture size only, not its prompt', /return call\(IMAGES\.model\.endpoint, \{ prompt \}, settings, \(\(size\.width \* size\.height\) \/ 1e6\) \* IMAGES\.pricePerMp\)/.test(fal));
  const long = (n: number) => 'x'.repeat(n);
  const T = IMAGES.designs.textMaxChars;
  // The person's words, a style, every sheet (characters and a place) at their longest, and room for the edition's shorthand.
  const worstPrompt = finalPrompt(long(IMAGES.promptMaxChars), long(T), [...Array.from({ length: IMAGES.designs.maxCharacters + 1 }, () => long(T)), long(1000)]);
  const plain = finalPrompt(long(IMAGES.promptMaxChars), long(T), []);
  const guardPrice = CHAT.prices[IMAGES.guardModel];
  const system = Buffer.byteLength(readFileSync(path.join(ROOT, 'config/prompts/image-guard.md'), 'utf8'));
  const guardWorst = (prompt: string) => (system + Buffer.byteLength(prompt)) * guardPrice.input + 400 * guardPrice.output;
  const imageWorst = 1 * IMAGES.pricePerMp; // fal may round up to 1 MP
  const guardSrc = readFileSync(path.join(ROOT, 'src/lib/images/guard.ts'), 'utf8');
  // A sheet's views get their own budget (IMAGES.designs.guardMaxTokens, owner 2026-11-03; test:designs checks its reserve); Pictures keeps 400.
  const generateSrc = readFileSync(path.join(ROOT, 'src/app/api/images/generate/route.ts'), 'utf8');
  check('the Pictures prompt check answers in at most 400 tokens', /maxTokens = 400\)/.test(guardSrc) && /checkPrompt\(job\.checkText, request, job\.guardMaxTokens\)/.test(readFileSync(path.join(ROOT, 'src/lib/images/paid.ts'), 'utf8')) && !/guardMaxTokens/.test(generateSrc));
  check('with every pick at its longest, the prompt check still fits the reserve, so picks as text leave the price as it is', imageWorst + guardWorst(worstPrompt) <= IMAGES.reserveUsd, `${imageWorst} + ${guardWorst(worstPrompt).toFixed(6)} vs ${IMAGES.reserveUsd} (no picks: ${guardWorst(plain).toFixed(6)})`);
}

// --- The caps -------------------------------------------------------------------------
check('no all-days cap in the settings', !('totalSpendCapUsd' in IMAGES));
await pg.exec(`insert into studio.image_costs (day, kind, model, provider, verdict, calls, cost_usd) values ((now() at time zone 'utc')::date - 3, 'image', 'old', 'fal.ai', 'ok', 1, 50)`);
const old = await reserve(S, 200);
check('spending on earlier days does not stop a Generate', old.ok, JSON.stringify(old));
if (old.ok) await settle(S, {});
for (let i = 0; i < IMAGES.generationsPerDay - 1; i++) {
  const r = await reserve(S, 200);
  if (r.ok) await settle(S, {});
}
const eleventh = await reserve(S, 200);
check('10 Generates a day per person, then refused', (await generationsLeft(S, 200)) === 0 && !eleventh.ok && eleventh.refusal === 'limit', JSON.stringify(eleventh));
await sql`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`;
for (let i = 0; i < IMAGES.publishesPerDay; i++) await sql`insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'image', 201)`;
check('3 publishes a day per person', (await publishesLeft(S, 201)) === 0 && (await publishesLeft(S, 202)) === IMAGES.publishesPerDay);
const [spentToday] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = (now() at time zone 'utc')::date`;
await sql`insert into studio.image_costs (kind, model, provider, verdict, calls, cost_usd) values ('image', 'today', 'fal.ai', 'ok', 1, ${imagesDailySpendCapUsd() - spentToday.usd - IMAGES.reserveUsd / 2})`;
const capped = await reserve(S, 203);
check('$2 a day across everyone, then refused', !capped.ok && capped.refusal === 'spend', JSON.stringify(capped));
check('the daily cap is $2 outside the remix challenge window', IMAGES.dailySpendCapUsd === 2 && IMAGES.generationsPerDay === 10 && IMAGES.publishesPerDay === 3 && IMAGES.label === 'Trial');

// --- Report alerts ----------------------------------------------------------------------
const el = async (by: number) => (await sql`insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', ${by}, 'published') returning id`)[0].id as string;
// Each step a few milliseconds after the last, so "the latest step" is never a tie on `at` (it was flaky).
const log = async (element_id: string, step: string, by_fid: number, role: string, reason: string | null = null, note: string | null = null) => {
  await new Promise((r) => setTimeout(r, 3));
  return sql`insert into studio.removal_log ${sql({ element_id, step, by_fid, role, reason, note })}`;
};
const A = await el(777001), B = await el(777002), C = await el(777003);
const REPORTER = 424242;

check('nothing waiting at first', (await reportsWaiting(S)) === 0);
heard = [];
check('with nothing waiting, nothing is sent', (await alertReports(S)) === 'none-waiting' && toNtfy().length === 0);

await log(A, 'reported', REPORTER, 'reader', 'spam', 'a private note about the prompt');
heard = [];
const first = await alertReports(S);
const pushes = toNtfy();
check('a planted report sends one push', first === 'sent' && pushes.length === 1, `${first} ${pushes.length}`);
if (pushes[0]) {
  check('the push says only "Snowmoon: 1 reports waiting"', pushes[0].body === 'Snowmoon: 1 reports waiting', pushes[0].body);
  check('the push is a POST', pushes[0].method === 'POST');
  const extra = Object.keys(pushes[0].headers).filter((h) => !['content-type', 'content-length', ...DEFAULT_HEADERS].includes(h));
  check('the push has no header but Content-Type (no title, tags or click link)', extra.length === 0 && pushes[0].headers['content-type'] === 'text/plain', extra.join(', '));
  const b = pushes[0].body + JSON.stringify(pushes[0].headers);
  check('the push carries no FID, image id, reason, note or link', ![String(REPORTER), '777001', A, 'spam', 'note', 'http', 'image'].some((x) => b.includes(x)), b);
}
check('the body has the owner\'s exact form', alertBody(3) === 'Snowmoon: 3 reports waiting');

await log(B, 'reported', REPORTER + 1, 'reader', 'other');
heard = [];
check('a second report within the hour sends none', (await alertReports(S)) === 'too-soon' && toNtfy().length === 0);

// Two servers at once: only one may send.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
heard = [];
const sql2 = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
const both = await Promise.all([alertReports(S), alertReports(sql2 as unknown as Sql)]);
check('two servers at once send one push', toNtfy().length === 1 && both.filter((x) => x === 'sent').length === 1, `${both} ${toNtfy().length}`);
await sql2.end();

// After the hour, a hide sends one, with the new count.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
await sql`update studio.elements set status = 'hidden' where id = ${C}`;
await log(C, 'hidden', 777003, 'author');
await log(A, 'reported', REPORTER + 2, 'reader', 'violence');
heard = [];
const hid = await alertReports(S);
check('after the hour, a hide sends one push with the new count', hid === 'sent' && toNtfy().length === 1 && toNtfy()[0].body === 'Snowmoon: 3 reports waiting', `${hid} ${toNtfy()[0]?.body}`);

// What "waiting" means: a dismissal clears an image's reports; a rule-hide stays until a moderator looks.
await log(A, 'dismissed', 6786, 'moderator');
check('a dismissal clears that image\'s reports', (await reportsWaiting(S)) === 1);
const D = await el(777004);
await log(D, 'reported', REPORTER, 'reader', 'minor');
await log(D, 'hidden', 0, 'rule', 'minor', 'one "minor" report');
check('a rule-hide still waits for a moderator', (await reportsWaiting(S)) === 2);
await log(D, 'hidden', 6786, 'moderator');
check('a moderator\'s hide takes it off the list', (await reportsWaiting(S)) === 1);

// ntfy failing: nothing throws, and the hour is given back.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
ntfyStatus = 500;
check('a failing push does not throw', (await alertReports(S)) === 'failed');
ntfyStatus = 200;
heard = [];
check('after a failed push the next one goes out', (await alertReports(S)) === 'sent' && toNtfy().length === 1);

// Unset: nothing sent, nothing thrown; the report itself was stored.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
delete process.env.SNOWMOON_ALERT_URL;
const E = await el(777005);
await log(E, 'reported', REPORTER, 'reader', 'spam');
heard = [];
check('with SNOWMOON_ALERT_URL unset nothing is sent', (await alertReports(S)) === 'unset' && toNtfy().length === 0);
check('the report is stored all the same', (await sql`select count(*)::int as n from studio.removal_log where element_id = ${E} and step = 'reported'`)[0].n === 1);
process.env.SNOWMOON_ALERT_URL = `${STUB}/ntfy/snowmoon-test`;
{
  const broken = postgres('postgres://nobody@127.0.0.1:9/none', { max: 1, connect_timeout: 1 });
  check('a database failure does not throw', (await alertReports(broken as unknown as Sql)) === 'failed');
  await broken.end({ timeout: 0 });
}
for (const f of ['src/app/api/images/[id]/report/route.ts', 'src/app/api/images/[id]/hide/route.ts']) {
  const src = readFileSync(path.join(ROOT, f), 'utf8');
  check(`${f} sends the alert after the answer, never failing it`, /after\(\(\) => alertReports\(sql\)\.then\(\(\) => undefined, \(\) => undefined\)\)/.test(src));
}

// --- Private, as the other per-person tables -------------------------------------------------
await sql.end();
for (const role of ['anon', 'authenticated']) {
  for (const t of ['image_scores', 'check_decisions', 'alert_state']) {
    await pg.exec(`set role ${role}`);
    try {
      await pg.query(`select count(*) from studio.${t}`);
      failures.push(`${role} can read studio.${t}`);
    } catch {
      passed++;
    }
    await pg.exec('reset role');
  }
}
await pg.exec('set role studio_writer');
try {
  await pg.exec('delete from studio.alert_state');
  failures.push('studio_writer can delete from alert_state');
} catch {
  passed++;
}
await pg.exec('reset role');
await server.stop();
stub.close();
console.error = quiet;

if (failures.length) {
  console.error(`\nIMAGE GATE TESTS FAILED (${failures.length}, ${passed} passed):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`image gate tests passed: ${passed} checks (Neynar gate, launch order, caps, report alerts, privacy)`);
process.exit(0);
