/**
 * "Record your own takes", v1 (owner, 2026-10-19), end to end against an in-memory Postgres (PGlite,
 * every migration including the DRAFT 0016) with the conversion model stood in (TAKES_TEST_FAKES=1).
 *   npm run test:takes
 * Checks: switched off answers nothing; sign-in, line, type and size are checked; consent first; a
 * wallet account pays from its balance; only the converted take is stored, and the recording is never
 * stored, in the database or the file store, only its sha256; the recipe says AI-converted and names the
 * published target voice; the line's takes list shows it; the free count and free cap hold.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { failOnProtocolErrors, gatePglite } from './lib/pglite-gate';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
process.env.APP_LEGAL_PAGES = 'terms+privacy';
process.env.SNOWMOON_ALERT_URL = 'http://127.0.0.1:9/never';
process.env.NEXT_PUBLIC_URL = 'https://snowmoon.party';
const STORE = mkdtempSync(path.join(tmpdir(), 'takes-'));
process.env.TAKES_TEST_STORE = STORE;

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const acct = Number((await db.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ('0x${'1'.repeat(40)}') returning id`)).rows[0].id);
const other = Number((await db.query<{ id: number }>(`insert into studio.wallet_accounts (address) values ('0x${'2'.repeat(40)}') returning id`)).rows[0].id);
await db.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ($1, $2, 8453, 'USDC', 5000000, 5, 1)`, ['0x' + 'a'.repeat(64), acct]);
const { consentWording } = await import('../src/lib/consent');
await db.query(`insert into studio.contributor_consents (fid, kind, consent_text_sha256) values ($1, 'own_words', $2)`, [-acct, consentWording().sha256]);
await db.exec('set role studio_writer');
const PORT = 54371;
failOnProtocolErrors(gatePglite(db), 'test:takes');
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;

const { TAKES } = await import('../src/lib/config');
const { signSession } = await import('../src/lib/wallet/session');
const { GET, POST } = await import('../src/app/api/takes/route');
const { balanceUsd } = await import('../src/lib/wallet/credits');
const { db: siteDb } = await import('../src/lib/db');
const S = siteDb()!;

const me = signSession(acct, '0x' + '1'.repeat(40))!;
const them = signSession(other, '0x' + '2'.repeat(40))!;
const LINE = 'adaptation=1&version=2&cue=b1-1';
// A recording with a marker that must never reach the database or the file store.
const MARK = 'RAW-PERFORMANCE-' + 'z'.repeat(16);
const raw = Buffer.concat([Buffer.from(MARK), Buffer.alloc(4000, 7)]);
const post = (q: string, body: Buffer | null, type = 'audio/webm', token: string | null = me) =>
  POST(new Request(`https://snowmoon.party/api/takes?${q}`, { method: 'POST', headers: { 'content-type': type, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body }));

delete process.env.TAKES_TEST_FAKES;
check('switched off (TAKES.enabled false): nothing is answered', TAKES.enabled === false && (await post(LINE, raw)).status === 404 && (await GET(new Request(`https://snowmoon.party/api/takes?${LINE}`))).status === 404);
process.env.TAKES_TEST_FAKES = '1';

check('signed out is refused', (await post(LINE, raw, 'audio/webm', null)).status === 401);
check('a line that is not in the version is refused', (await post('adaptation=1&version=2&cue=nope-9', raw)).status === 404);
check('a file type that is not a browser recording is refused', (await post(LINE, raw, 'image/png')).status === 415 && (await post(LINE, raw, 'application/octet-stream')).status === 415);
check(`a recording over ${TAKES.maxBytes} bytes is refused`, (await post(LINE, Buffer.alloc(TAKES.maxBytes + 1))).status === 413);
check('an empty recording is refused', (await post(LINE, Buffer.alloc(0))).status === 413);
const noConsent = await post(LINE, raw, 'audio/webm', them);
check('consent comes first', noConsent.status === 403 && (await noConsent.json()).reason === 'consent');

const before = await balanceUsd(S, acct);
const ok = await post(LINE, raw);
const j = (await ok.json()) as { id?: string; url?: string; seconds?: number; label?: string };
check('a recording is converted and saved to the line', ok.status === 200 && !!j.id && /^\/test-takes\/[0-9a-f]{64}\.wav$/.test(j.url ?? '') && /AI-converted/.test(j.label ?? ''), JSON.stringify(j));
const [row] = await S`select cue, speaker, person, recipe, audio_sha256, seconds, cost_usd from studio.line_takes where id = ${j.id ?? '00000000-0000-0000-0000-000000000000'}`;
const recipe = row?.recipe as Record<string, any> | undefined;
check('the take is attached to its line and maker', row?.cue === 'b1-1' && row?.speaker === 'Zei' && Number(row?.person) === -acct);
check('the recipe says AI-converted, names the model and the published target voice', /AI-converted/.test(recipe?.label ?? '') && recipe?.model?.endpoint === 'fal-ai/chatterbox/speech-to-speech' && /^\/editor\/1\/v\d+\/.+\.(wav|m4a)$/.test(recipe?.target_voice?.served ?? '') && /^[0-9a-f]{64}$/.test(recipe?.target_voice?.sha256 ?? ''));
check('the recording is in the recipe only as a sha256, marked not kept', recipe?.performance?.kept === false && recipe?.performance?.sha256 === createHash('sha256').update(raw).digest('hex'));
const dump = (await S`select row_to_json(t)::text as t from studio.line_takes t`).map((r) => r.t).join('\n') + (await S`select row_to_json(t)::text as t from studio.take_costs t`).map((r) => r.t).join('\n');
check('the recording never reaches the database', !dump.includes(MARK) && !dump.includes(raw.toString('base64').slice(0, 40)));
const files = readdirSync(STORE);
check('only the converted take is in the file store, never the recording', files.length === 1 && files.every((f) => !readFileSync(path.join(STORE, f)).includes(Buffer.from(MARK))) && createHash('sha256').update(readFileSync(path.join(STORE, files[0]))).digest('hex') === row?.audio_sha256);
const after = await balanceUsd(S, acct);
check('a wallet account pays from its balance at cost plus the markup', after < before && before - after < 0.03, `${before} → ${after}`);
const costs = await S`select funded, kind, calls, cost_usd from studio.take_costs`;
check('costs are daily totals with no person', costs.every((c) => !('person' in c)) && costs.some((c) => c.kind === 'convert' && Number(c.calls) === 1));
const list = await GET(new Request(`https://snowmoon.party/api/takes?${LINE}`));
const lj = (await list.json()) as { takes?: { id: string; label: string }[] };
check("the line's takes list shows it, with its label", list.ok && lj.takes?.[0]?.id === j.id && /AI-converted/.test(lj.takes?.[0]?.label ?? ''));

// The free count and the free cap (a Farcaster account; checked on the store, since a Farcaster sign-in can't be made offline).
const { reserveTake, settleTake } = await import('../src/lib/takes/store');
const fid = 424242;
let n = 0;
while ((await reserveTake(S, fid)).ok && n < 50) { await settleTake(S, fid, 0.001); n++; }
check(`a Farcaster account gets ${TAKES.perDay} takes a day`, n === TAKES.perDay, String(n));
await S`insert into studio.take_costs (funded, kind, model, calls, cost_usd) values ('free', 'convert', 'chatterbox-vc', 0, ${TAKES.dailyFreeCapUsd}) on conflict (day, funded, kind, model) do update set cost_usd = studio.take_costs.cost_usd + excluded.cost_usd`;
const capped = await reserveTake(S, 777);
check('the free cap across everyone holds', !capped.ok && capped.refusal === 'spend');

// The route sends the recording only to the converter and its sha256; it never stores or logs it.
const route = readFileSync(path.join(ROOT, 'src/app/api/takes/route.ts'), 'utf8');
const convert = readFileSync(path.join(ROOT, 'src/lib/takes/convert.ts'), 'utf8');
check('the code never stores or logs the recording', !/putTake\(\s*raw|writeFileSync|console\.[a-z]+\([^)]*raw/.test(route + convert) && /putTake\(sha256, made\.bytes/.test(route));

await S.end({ timeout: 1 });
await server.stop();
await db.close();
if (failures.length) {
  console.error(`TAKES TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`test:takes: all ${passed} checks pass`);
