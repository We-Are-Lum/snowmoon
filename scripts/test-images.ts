/**
 * Readers' images, slice 1 (docs/proposals/add-an-image.md). Fails (exit 1) on any problem.
 *
 *   npm run test:images
 *
 * No paid call is made. Runs migrations 0001–0008 in an in-memory Postgres (PGlite) and talks to
 * it as studio_writer, the app's role. Checks:
 * - A draft's signed record: the server's own signature is accepted; a changed record, another
 *   secret or an expired one is refused.
 * - The rules: blocked names as whole words; the exact prompt sent ends with the no-words line;
 *   the style text is the committed style plus the passage's setting.
 * - The caps: 10 Generates a day per FID, the day's spend cap and the trial's total cap, each
 *   checked with the worst case reserved first; settling replaces the reservation with real costs.
 * - No cost can be joined to a person (owner, 2026-10-08, the assistant's rule): image_costs has no
 *   person or request column, no time finer than a date, no row number; a second person's
 *   Generate adds to the day's totals without adding a row. image_asks has no row number either.
 * - Nothing new is publicly readable; the counted rows and the removal log are append-only.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

// --- The signed record ----------------------------------------------------------
process.env.IMAGES_TICKET_SECRET = 'x'.repeat(40);
const { signTicket, readTicket } = await import('../src/lib/images/ticket');
const base = {
  v: 1 as const, fid: 6786, chapter: 1, start: 3, end: 5, userPrompt: 'A foot path under tall trees', style: null, prompt: 'p',
  model: 'z-image-turbo', endpoint: 'fal-ai/z-image/turbo', host: 'fal.ai', settings: {}, seed: 1, requestId: 'r', sha256: 'a'.repeat(64),
  width: 1024, height: 576, costUsd: 0.003, guard: { model: 'g', verdict: 'ok' as const }, at: new Date().toISOString(),
};
const tok = signTicket(base);
check('a signed record reads back', readTicket(tok)?.fid === 6786);
const [body, sig] = tok.split('.');
const changed = Buffer.from(JSON.stringify({ ...base, fid: 1 })).toString('base64url');
check('a changed record is refused', readTicket(`${changed}.${sig}`) === null);
check('a record without a signature is refused', readTicket(body) === null);
check('an expired record is refused', readTicket(signTicket({ ...base, at: new Date(Date.now() - (IMAGES.ticketHours + 1) * 3600_000).toISOString() })) === null);
process.env.IMAGES_TICKET_SECRET = 'y'.repeat(40);
check('another secret is refused', readTicket(tok) === null);

// --- Signed names (decision 12) ----------------------------------------------------
{
  const { signName, readName } = await import('../src/lib/names');
  const proof = signName(6786, 'naaate');
  check('a signed name reads back for its FID', readName(proof, 6786) === 'naaate');
  check('a signed name is refused for another FID', readName(proof, 42) === null);
  const [pb, ps] = (proof ?? '').split('.');
  const forged = Buffer.from(JSON.stringify({ fid: 6786, username: 'someone', at: Date.now() })).toString('base64url');
  check('a changed name is refused', readName(`${forged}.${ps}`, 6786) === null);
  check('a name without a signature is refused', readName(pb, 6786) === null);
  check('an odd name is never signed', signName(6786, 'not a <name>') === null);
  const old = Buffer.from(JSON.stringify({ fid: 6786, username: 'naaate', at: Date.now() - 31 * 86400_000 })).toString('base64url');
  const { createHmac } = await import('node:crypto');
  const oldSig = createHmac('sha256', Buffer.from(process.env.IMAGES_TICKET_SECRET!)).update(`name:${old}`).digest('base64url');
  check('an old signed name is refused', readName(`${old}.${oldSig}`, 6786) === null);
}

// --- The rules ------------------------------------------------------------------
const { blockedName, finalPrompt, styleText } = await import('../src/lib/images/rules');
check('a blocked name is caught', blockedName('Vitalik walking on the sky bridge') === 'Vitalik');
check('blocked names ignore case', blockedName('portrait of BUTERIN') !== null);
check('only whole words', blockedName('a muskrat by the river') === null);
check('a prompt with no name passes', blockedName('Gladias on the sky bridge at dusk') === null);
const fp = finalPrompt('A drone over the trees', 'STYLE');
check('the exact prompt keeps the reader\'s words first', fp.startsWith('A drone over the trees'));
check('the exact prompt asks for no words', fp.endsWith(IMAGES.suffix));
const st = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/designs/styles/techno-vistas.json'), 'utf8'));
check('the style text is the committed style and the setting', styleText('techno-vistas', 'veridia') === `${st.prompt} ${st.settings.veridia}`);

// --- The database ---------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
const PORT = 54331;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1 });
await sql`set role studio_writer`;
const { reserve, settle, generationsLeft } = await import('../src/lib/images/limits');
type Sql = Parameters<typeof reserve>[0];
const S = sql as unknown as Sql;

const r1 = await reserve(S, 6786);
check('a first Generate is counted', r1.ok && r1.left === IMAGES.generationsPerDay - 1, JSON.stringify(r1));
const [reserved] = await sql`select calls, cost_usd::float8 as usd from studio.image_costs where kind = 'reserved'`;
check('its worst case is reserved', reserved?.calls === 1 && Math.abs(reserved.usd - IMAGES.reserveUsd) < 1e-9, JSON.stringify(reserved));
await settle(S, { guard: { costUsd: 0.0001, provider: 'groq', verdict: 'ok' }, image: { costUsd: 0.003, verdict: 'ok' } });
const [after] = await sql`select (select cost_usd::float8 from studio.image_costs where kind = 'reserved') as reserved,
  (select sum(cost_usd)::float8 from studio.image_costs where kind <> 'reserved') as spent`;
check('settling takes the reservation back', Math.abs(after.reserved) < 1e-9, JSON.stringify(after));
check('settling records the real costs', Math.abs(after.spent - 0.0031) < 1e-9, JSON.stringify(after));

// A second person: their Generate adds to the day's totals and adds no cost row.
const rowsBefore = (await sql`select count(*)::int as n from studio.image_costs`)[0].n;
await reserve(S, 42);
await settle(S, { guard: { costUsd: 0.0001, provider: 'groq', verdict: 'ok' }, image: { costUsd: 0.003, verdict: 'ok' } });
const rowsAfter = (await sql`select count(*)::int as n from studio.image_costs`)[0].n;
check('a second person\'s costs add to the totals, not a row', rowsAfter === rowsBefore, `${rowsBefore} → ${rowsAfter}`);
const [calls] = await sql`select calls from studio.image_costs where kind = 'image'`;
check('the day\'s image total counts both', calls?.calls === 2);

// No cost can be joined to a person.
const cols = (t: string) => sql`select column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name = ${t}`;
const costCols = await cols('image_costs');
const names = costCols.map((c) => String(c.column_name));
check('image_costs has no person or request column', !names.some((n) => /fid|person|user|request|ip/.test(n)), names.join(', '));
check('image_costs keeps no time finer than a date', !costCols.some((c) => /time/.test(String(c.data_type))), costCols.map((c) => `${c.column_name}:${c.data_type}`).join(', '));
const identity = await sql`select table_name, column_name from information_schema.columns where table_schema = 'studio' and table_name in ('image_costs', 'image_asks')
  and (is_identity = 'YES' or column_default like 'nextval%')`;
check('no row numbers on image_costs or image_asks', identity.length === 0, JSON.stringify(identity));
const askCols = (await cols('image_asks')).map((c) => String(c.column_name)).sort().join(',');
check('image_asks holds only the FID and the time', askCols === 'at,fid', askCols);

// The caps.
for (let i = 0; i < IMAGES.generationsPerDay - 1; i++) {
  const r = await reserve(S, 6786);
  if (r.ok) await settle(S, {});
}
check('the daily limit stops the 11th Generate', (await generationsLeft(S, 6786)) === 0 && !(await reserve(S, 6786)).ok);
await sql`insert into studio.image_costs (kind, model, provider, verdict, calls, cost_usd) values ('image', 'test', 'fal.ai', 'ok', 1, ${IMAGES.totalSpendCapUsd})`;
const r3 = await reserve(S, 7);
check('the trial\'s total cap stops a Generate', !r3.ok && (r3.refusal === 'spend' || r3.refusal === 'trial-spend'), JSON.stringify(r3));

// Private, and append-only where it should be.
await sql`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`;
const [el] = await sql`insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'image', 6786) returning id`;
await sql`insert into studio.removal_log ${sql({ element_id: el.id, step: 'reported', by_fid: 9, role: 'reader', reason: 'spam' })}`;
await sql.end();
// Append-only, checked on the database directly with the role set for each statement (over the
// socket the role is per connection, and a reconnect would run as the superuser).
for (const [what, q] of [
  ['update image_asks', 'update studio.image_asks set fid = 1'],
  ['delete image_asks', 'delete from studio.image_asks'],
  ['update removal_log', "update studio.removal_log set note = 'x'"],
  ['delete removal_log', 'delete from studio.removal_log'],
  ['delete image_costs', 'delete from studio.image_costs'],
] as const) {
  await db.exec('set role studio_writer');
  try {
    await db.exec(q);
    failures.push(`studio_writer can ${what}`);
  } catch {
    passed++;
  }
  await db.exec('reset role');
}
for (const role of ['anon', 'authenticated']) {
  for (const t of ['image_asks', 'image_costs', 'removal_log']) {
    await db.exec(`set role ${role}`);
    try {
      const r = await db.query<{ n: number }>(`select count(*)::int as n from studio.${t}`);
      failures.push(`${role} can read studio.${t} (${r.rows[0].n} rows)`);
    } catch {
      passed++;
    }
    await db.exec('reset role');
  }
}
await server.stop();

if (failures.length) {
  console.error(`\nIMAGE TESTS FAILED (${failures.length}, ${passed} passed):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`image tests passed: ${passed} checks (signed drafts, rules, caps, costs without a person, privacy)`);
