/**
 * /admin/bounty (owner, 2026-11-23; branch bounty-review): the admins' private review of the poidh backstory bounty's
 * claims and the challenge's entries. No network, no production database: Base is a stub answering as PoidhV3 does, the
 * database an in-memory Postgres (PGlite) with every numbered migration and then NEXT_bounty_review.sql, read as
 * studio_writer. Fails (exit 1) on any problem; each rule is proven on a planted fault ("proof: …").
 *
 *   npm run test:bounty-review
 *
 * - NEXT_bounty_review.sql: who runs it; A is B word for word; A leaves everything as it was; B applies twice; C's
 *   read-back passes and keeps nothing; D undoes it; studio_writer's rights are exactly the site's, anon and
 *   authenticated have none; planted faults make C fail.
 * - The gate: signed out and a non-admin get 404 from every answer before anything is read on Base or in the database.
 * - The claims: every claim on the bounty, newest first, with its name, description, claimer (and name when the site
 *   links that wallet), time; only this bounty's; read-only calls only (no write function in the ABI or the code).
 * - Labels: on, off, note set and cleared, each in the log with who; unknown claims and entries refused; labels without
 *   the tables say so.
 * - Hints: the rules read from the bounty's own words (the real text, 2026-11-23); paragraphs, the link and its
 *   character, before the close, the address's count; text without a rule gives "unknown", never a value of ours.
 * - Pictures from a stranger's URL: https to a public host only, redirects re-checked, size capped.
 * - P5: nothing but the admin review's own files reads the review tables or the review code; P5b passes by the 404 gate.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { ADMINS, BOUNTY_REVIEW } from '../src/lib/config';
import { p5bProblems } from './lib/p5b';
import { gatePglite } from './lib/pglite-gate';
import type { EntriesOf } from '../src/lib/review/review';

process.env.FARCASTER_API_URL = 'http://127.0.0.1:9';
delete process.env.BASE_RPC_URL;
const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.(tsx?|css|sql|json)$/.test(d.name) ? [`${dir}/${d.name}`] : []));

// --- The migration file -------------------------------------------------------------------------------------------
const FILE = 'supabase/migrations/NEXT_bounty_review.sql';
const text = read(FILE);
const at = (h: string) => text.indexOf(`\n-- ${h}`);
const between = (a: string, b: string | null) => text.slice(text.indexOf('\n', at(a) + 1) + 1, b ? at(b) : text.length);
const strip = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const dry = strip(between('A. DRY RUN', 'B. MIGRATION'));
const mig = strip(between('B. MIGRATION', 'C. READ-BACK'));
/** The pasted part of a commented section: its lines from "-- begin;" through its last "-- rollback;" or "-- commit;", without "-- ". */
const uncomment = (s: string) => {
  const lines = s.split('\n');
  const i = lines.findIndex((l) => l === '-- begin;');
  const j = lines.map((l, k) => (/^-- (rollback|commit);$/.test(l) ? k : -1)).filter((k) => k > i).pop() ?? -1;
  return i < 0 || j < 0 ? '' : lines.slice(i, j + 1).map((l) => l.replace(/^-- ?/, '')).join('\n');
};
const readBack = uncomment(between('C. READ-BACK', 'D. UNDO'));
const undo = uncomment(between('D. UNDO', null));
check('the file says who runs it (postgres, in the Supabase SQL Editor)', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text));
check('it has no number yet (NEXT_), and says it is not applied', path.basename(FILE).startsWith('NEXT_') && /NOT APPLIED/.test(text));
check('A ends in rollback, B in commit, C in a rolled-back read-back ending READ-BACK PASSED, then D', dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && readBack.startsWith('begin;') && readBack.trim().endsWith('rollback;') && /READ-BACK PASSED/.test(readBack) && /drop table/.test(undo));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back inserts and deletes realistic rows in every table', ['review_labels', 'review_notes', 'review_log'].every((t) => new RegExp(`insert into studio\\.${t}`).test(readBack) && new RegExp(`delete from studio\\.${t}`).test(readBack)));
check('the read-back sets no role (the SQL Editor cannot)', !/set role/i.test(readBack));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const snapshot = async () => {
  const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
  return [
    await q(`select table_name, column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name like 'review\\_%' order by 1, 2`),
    await q(`select tablename, policyname from pg_policies where schemaname = 'studio' and tablename like 'review\\_%' order by 1, 2`),
    await q(`select count(*) from information_schema.tables where table_schema = 'studio'`),
  ].join('\n');
};
const before = await snapshot();
await pg.exec(dry);
check('the dry run leaves everything as it was', (await snapshot()) === before);
check('before B, there are no review tables', !/review_labels/.test(before));
await pg.exec(mig);
let twice = true;
try {
  await pg.exec(mig);
} catch {
  twice = false;
}
check('the migration applies, and applies again (safe to run twice)', twice);
const runReadBack = async (sqlText: string) => {
  const notices: string[] = [];
  try {
    await pg.exec(sqlText);
  } catch (e) {
    await pg.exec('rollback;').catch(() => {});
    return { ok: false, why: String((e as Error).message) };
  }
  return { ok: true, why: notices.join(' ') };
};
const rb = await runReadBack(readBack);
check('the read-back passes', rb.ok, rb.why);
check('the read-back keeps nothing', Number((await pg.query<{ n: number }>(`select (select count(*) from studio.review_labels) + (select count(*) from studio.review_notes) + (select count(*) from studio.review_log) as n`)).rows[0].n) === 0);
const priv = async (role: string, t: string, p: string) => (await pg.query<{ v: boolean }>(`select has_table_privilege('${role}', 'studio.${t}', '${p}') as v`)).rows[0].v;
const rights = async (role: string, t: string) => (await Promise.all(['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map(async (p) => ((await priv(role, t, p)) ? p : '')))).filter(Boolean).join(',');
check("studio_writer on review_labels: select, insert, delete (no update)", (await rights('studio_writer', 'review_labels')) === 'select,insert,delete');
check("studio_writer on review_notes: select, insert, update, delete", (await rights('studio_writer', 'review_notes')) === 'select,insert,update,delete');
check("studio_writer on review_log: select, insert only", (await rights('studio_writer', 'review_log')) === 'select,insert');
for (const r of ['anon', 'authenticated']) for (const t of ['review_labels', 'review_notes', 'review_log']) check(`${r} has no rights on ${t}`, (await rights(r, t)) === '');
// Planted faults: each must make the read-back fail.
for (const [name, plant] of [
  ['an update grant on the labels', 'grant update on studio.review_labels to studio_writer;'],
  ['a read grant to anon', 'grant select on studio.review_notes to anon;'],
  ['row level security off', 'alter table studio.review_log disable row level security;'],
  ['a dropped label check', 'alter table studio.review_labels drop constraint review_labels_label_check;'],
  ['a note check that refuses every note', "alter table studio.review_notes add constraint plant check (note = '');"],
] as const) {
  await pg.exec(`begin; ${plant}`);
  const r = await runReadBack(readBack.replace(/^begin;/, 'savepoint s;').replace(/rollback;\s*$/, 'rollback to savepoint s;'));
  await pg.exec('rollback;').catch(() => {});
  proof(`the read-back fails on ${name}`, !r.ok && /READ-BACK FAILED|violates/.test(r.why));
}
// D, then B again.
await pg.exec(undo);
check('D removes the three tables', !/review_labels/.test(await snapshot()));
await pg.exec(mig);
check('B applies again after D', /review_labels/.test(await snapshot()));

// --- The site, as studio_writer -----------------------------------------------------------------------------------
const gate = gatePglite(pg);
const server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await server.start();
const PORT = (server as unknown as { port: number }).port;
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const R = await import('../src/lib/review/review');
const C = await import('../src/lib/review/chain');
type Sql = Parameters<typeof R.reviewView>[0];
const S = sql as unknown as NonNullable<Sql>;
const admin = ADMINS[0];

// A linked wallet: its claims show under @zeimaker.
const LINKED = '0x' + 'ab'.repeat(20);
const STRANGER = '0x' + 'cd'.repeat(20);
await pg.exec(`
  insert into studio.wallet_accounts (address) values ('${LINKED}');
  insert into studio.wallet_links (account_id, fid, how) select id, 900001, 'signed' from studio.wallet_accounts where address = '${LINKED}';
  insert into studio.entities (id, work_id, kind, name) values ('70000000-0000-4000-8000-000000000001','snowmoon','character','Bai Jahen') on conflict do nothing;
  insert into studio.recipes (id, source, provider, model, prompt, params, created_by_fid) values
    ('73333333-3333-4333-8333-333333333333','in_app','fal','m','p','{"by_name":"zeimaker","challenge":{"character":"bai","moment":""},"user_prompt":"Bai at the board"}', 900001);
  insert into studio.elements (id, work_id, element_type, created_by_fid, status) values ('71111111-1111-4111-8111-111111111111','snowmoon','image',900001,'published');
  insert into studio.element_versions (id, element_id, version_no, body, asset_url, recipe_id) values
    ('72222222-2222-4222-8222-222222222222','71111111-1111-4111-8111-111111111111', 1, '{}', 'https://pictures.snowmoon.party/images/readers/abc.jpg', '73333333-3333-4333-8333-333333333333');`);

// The bounty's real text (read on Base, 2026-11-23), and claims shaped like the real ones.
const BOUNTY_TEXT = `Give a Snowmoon character a backstory people will remember.

1. Make a picture of one of the challenge's characters at [snowmoon.party/challenge](https://snowmoon.party/challenge): pick a character, remix a picture, publish.
2. Write its backstory: one to three paragraphs, in your own words.
3. Submit a claim here with your picture, your backstory, and the link to your picture's page.

What makes a good backstory:
- It fits in one breath. Someone could retell it in a sentence.
- Keep it mostly true to the book. Where the book speaks, follow it, though stretching and creative license are allowed; where it's silent, please invent!

The winner: the backstory that makes a character someone you'd love, hate, or can't stop thinking about, while staying mostly true to the book. One winner, picked by Friday 4 December. Additional prizes may also be given out.

The rules:
- Entries close Sunday 29 November, 11:59pm PT.
- The picture must be made on snowmoon.party.
- Up to three entries per person.
- By entering, you share your backstory under GPL-3.0, like everything on snowmoon.party.

Snowmoon is a novel by Vitalik Buterin, published under GPL-3.0. snowmoon.party is an independent adaptation, not affiliated with him.
`;
const CREATED = 1794509919;
const t = (iso: string) => Math.floor(Date.parse(iso) / 1000);
type StubClaim = { id: number; issuer: string; bounty: number; name: string; description: string; createdAt: number; uri: string | null };
const CLAIMS: StubClaim[] = [
  { id: 4255, issuer: LINKED, bounty: 560, name: 'Bai — the board', description: 'link: https://snowmoon.party/challenge/p/72222222-2222-4222-8222-222222222222\n\nFirst paragraph.\n\nSecond paragraph.', createdAt: t('2026-11-12T19:24:59Z'), uri: 'https://pictures.snowmoon.party/images/readers/abc.jpg' },
  { id: 4258, issuer: STRANGER, bounty: 560, name: 'Mu — four paragraphs', description: 'One.\n\nTwo.\n\nThree.\n\nFour.', createdAt: t('2026-11-13T07:57:54Z'), uri: 'ipfs://QmX' },
  { id: 4300, issuer: STRANGER, bounty: 560, name: 'Late', description: 'Just one paragraph, after the close.', createdAt: t('2026-11-30T08:00:30Z'), uri: null },
  { id: 4299, issuer: STRANGER, bounty: 560, name: 'Last minute', description: 'Made at 23:59:30 Pacific.', createdAt: t('2026-11-30T07:59:30Z'), uri: null },
  { id: 4301, issuer: STRANGER, bounty: 560, name: 'Fourth from one address', description: 'https://snowmoon.party/challenge/p/99999999-9999-4999-8999-999999999999\n\nA page that has no picture.', createdAt: t('2026-11-20T10:00:00Z'), uri: null },
  { id: 9999, issuer: STRANGER, bounty: 561, name: 'Another bounty', description: 'x', createdAt: t('2026-11-20T10:00:00Z'), uri: null },
];
const LIST = [4255, 4258, 4299, 4300, 4301, 9999];
let calls = 0;
const writes: string[] = [];
const stub = {
  readContract: async (a: { functionName: string; args: readonly bigint[] }) => {
    calls++;
    if (a.functionName !== 'bounties') throw new Error('unexpected');
    return [BigInt(a.args[0]), '0x5bE8bDC96c423f265FC589ff8611e4C72eE94dCA', 'Snowmoon Character Backstory', BOUNTY_TEXT, 33000000000000000n, '0x0000000000000000000000000000000000000000', BigInt(CREATED), 0n];
  },
  multicall: async (a: { contracts: { functionName: string; args: readonly bigint[] }[] }) => {
    calls++;
    return a.contracts.map((c) => {
      if (!['bountyClaims', 'claims', 'tokenURI'].includes(c.functionName)) writes.push(c.functionName);
      if (c.functionName === 'bountyClaims') {
        const i = Number(c.args[1]);
        return i < LIST.length ? { status: 'success', result: BigInt(LIST[i]) } : { status: 'failure', error: new Error('revert') };
      }
      const cl = CLAIMS.find((x) => x.id === Number(c.args[0]));
      if (!cl) return { status: 'failure', error: new Error('revert') };
      if (c.functionName === 'claims') return { status: 'success', result: [BigInt(cl.id), cl.issuer, BigInt(cl.bounty), '0x5bE8bDC96c423f265FC589ff8611e4C72eE94dCA', cl.name, cl.description, BigInt(cl.createdAt), false] };
      return cl.uri ? { status: 'success', result: cl.uri } : { status: 'failure', error: new Error('no uri') };
    });
  },
} as unknown as Parameters<typeof C.readOnChain>[0];
const noEntries: EntriesOf = async () => ({ entries: [] });
const ENTRY = '72222222-2222-4222-8222-222222222222';
const oneEntry: EntriesOf = async () => ({ entries: [{ versionId: ENTRY, elementId: '71111111-1111-4111-8111-111111111111', character: 'bai', person: 900001, createdAt: '2026-11-12T19:00:00.000Z', forked: true, maker: 900001, versionNo: 1, title: 'Bai at the board', byName: 'zeimaker', thumb: 'https://pictures.snowmoon.party/images/readers/abc.jpg' }] });

// The gate.
{
  let reads = 0;
  const spy = new Proxy(S as object, { get: (tt, k) => ((reads++, Reflect.get(tt, k))) }) as NonNullable<Sql>;
  calls = 0;
  for (const who of [null, 501]) {
    check(`${who === null ? 'signed out' : 'a non-admin'}: the view is 404`, (await R.reviewView(spy, who, { reader: stub, entriesOf: noEntries })).status === 404);
    check(`${who === null ? 'signed out' : 'a non-admin'}: a label change is 404`, (await R.changeMarks(spy, who, { kind: 'bounty_claim', subject: '560:4255', label: 'good', on: true }, { reader: stub, entriesOf: noEntries })).status === 404);
    check(`${who === null ? 'signed out' : 'a non-admin'}: a picture is 404`, (await R.claimPictureFor(who, '4255', { reader: stub, picture: async () => ({ jpeg: Buffer.from('x') }) })).status === 404);
  }
  check('… and nothing was read on Base or in the database for them', reads === 0 && calls === 0, `db ${reads}, chain ${calls}`);
  check('an admin without a database: 503', (await R.reviewView(null, admin, { reader: stub })).status === 503);
}

// The view.
const v1 = await R.reviewView(S, admin, { reader: stub, entriesOf: noEntries });
check('an admin: 200', v1.status === 200);
const view = (v1 as { body: import('../src/lib/review/types').ReviewView }).body;
check('every claim on this bounty, and none from another', view.claims.length === 5 && !view.claims.some((c) => c.id === 9999), view.claims.map((c) => c.id).join(','));
check('newest first', view.claims.map((c) => c.id).join(',') === '4300,4299,4301,4258,4255', view.claims.map((c) => c.id).join(','));
const c4255 = view.claims.find((c) => c.id === 4255)!;
check('a claim has its name, description, address and time', c4255.title === 'Bai — the board' && c4255.description.startsWith('link:') && c4255.claimer.address === LINKED && c4255.createdAt === '2026-11-12T19:24:59.000Z');
check("a linked wallet's claim shows its site name", c4255.claimer.name === '@zeimaker', String(c4255.claimer.name));
check("a stranger's claim shows no name", view.claims.find((c) => c.id === 4258)!.claimer.name === null);
check('the bounty is quoted from its own text', view.bounty?.name === 'Snowmoon Character Backstory' && view.bounty.rules.includes('Entries close Sunday 29 November, 11:59pm PT.') && view.bounty.steps.length === 3 && view.bounty.amountEth === '0.033');
check('the page says which Base reader it used (Base’s public endpoint here)', view.bounty?.rpc === 'https://mainnet.base.org');
check('labels are ready once the tables are there', view.labelsReady);
const hint = (id: number, key: string) => view.claims.find((c) => c.id === id)!.hints.find((h) => h.key === key)!;
check('hint: a link to a published remix, with its character', hint(4255, 'link').state === 'yes' && /Bai/.test(hint(4255, 'link').text) && c4255.linked[0]?.characterName === 'Bai');
check('hint: a link to a page with no published picture is a "no", said so', hint(4301, 'link').state === 'no' && /no published picture/.test(hint(4301, 'link').text));
check('hint: no link at all is a "no"', hint(4258, 'link').state === 'no');
check('hint: two paragraphs, the link line left out, is within one to three', hint(4255, 'paragraphs').state === 'yes' && /^2 paragraphs/.test(hint(4255, 'paragraphs').text) && hint(4255, 'paragraphs').rule === "2. Write its backstory: one to three paragraphs, in your own words.");
check('hint: four paragraphs is a "no"', hint(4258, 'paragraphs').state === 'no');
check('hint: 23:59:30 Pacific on 29 Nov is before the close', hint(4299, 'onTime').state === 'yes');
check('hint: 00:00:30 Pacific on 30 Nov is after the close', hint(4300, 'onTime').state === 'no' && hint(4300, 'onTime').rule === 'Entries close Sunday 29 November, 11:59pm PT.');
check("hint: an address's fourth claim is over the three per person", hint(4300, 'perPerson').state === 'no' && /4th claim of 4/.test(hint(4300, 'perPerson').text) && hint(4258, 'perPerson').state === 'yes');
check('every hint quotes the bounty’s own words when the bounty says it', view.claims.every((c) => c.hints.every((h) => h.rule === null || BOUNTY_TEXT.includes(h.rule))));

// Rules read from the text; a text without them gives "unknown".
{
  const Ru = await import('../src/lib/review/rules');
  const r = Ru.readRules(BOUNTY_TEXT, CREATED);
  check('the close is read: the first instant after 23:59 Pacific on Sun 29 Nov 2026', r.close?.endsAt === '2026-11-30T08:00:00.000Z', r.close?.endsAt);
  check('paragraphs one to three, three per person, made on snowmoon.party', r.paragraphs?.min === 1 && r.paragraphs.max === 3 && r.perPerson?.max === 3 && r.madeHere === 'The picture must be made on snowmoon.party.');
  const bare = Ru.readRules('Write anything.', CREATED);
  const hs = Ru.hintsFor(bare, { description: 'A.\n\nB.', createdAt: '2026-11-20T00:00:00Z' }, { pages: [], pictures: [] }, { n: 1, of: 1 });
  check('without the rules in the text, the hints say "unknown" (no value of ours)', ['paragraphs', 'onTime', 'perPerson'].every((k) => hs.find((h) => h.key === k)!.state === 'unknown' && hs.find((h) => h.key === k)!.rule === null));
  proof('a close in summer time is read in Pacific daylight time', Ru.readRules('The rules:\n- Entries close Sunday 5 July, 11:59pm PT.', t('2026-06-01T00:00:00Z')).close?.endsAt === '2026-07-06T07:00:00.000Z');
  check('paragraphs: a "Picture made on snowmoon.party: <link>" line and an "Image: <link>" line are not paragraphs', Ru.paragraphsOf('Picture made on snowmoon.party: https://snowmoon.party/challenge/p/x\nImage: https://pictures.snowmoon.party/a.jpg\n\nOne.\n\nTwo.').length === 2);
  check('paragraphs: a sentence with a link in it is still a paragraph', Ru.paragraphsOf('Read about how Zei found the shard at https://snowmoon.party/challenge/p/x and what he did with it after.').length === 1);
}

// Labels.
const ch = (fid: number, c: Parameters<typeof R.changeMarks>[2], entriesOf = noEntries) => R.changeMarks(S, fid, c, { reader: stub, entriesOf });
check('a label on', (await ch(admin, { kind: 'bounty_claim', subject: '560:4255', label: 'followed_directions', on: true })).status === 200);
check('the same label on again changes nothing', (await ch(admin, { kind: 'bounty_claim', subject: '560:4255', label: 'followed_directions', on: true })).status === 200);
check('a second admin sets "Top"', (await ch(ADMINS[1], { kind: 'bounty_claim', subject: '560:4255', label: 'top', on: true })).status === 200);
check('a note', (await ch(admin, { kind: 'bounty_claim', subject: '560:4255', note: '  Strong hook; check the Su line.  ' })).status === 200);
check('a label off', (await ch(admin, { kind: 'bounty_claim', subject: '560:4255', label: 'top', on: false })).status === 200);
check('a label on a claim of another bounty: 404', (await ch(admin, { kind: 'bounty_claim', subject: '561:9999', label: 'good', on: true })).status === 404);
check('a label on a claim not on the bounty: 404', (await ch(admin, { kind: 'bounty_claim', subject: '560:1', label: 'good', on: true })).status === 404);
check('a fourth label: 400', (await ch(admin, { kind: 'bounty_claim', subject: '560:4255', label: 'winner', on: true })).status === 400);
check('a note over 280 characters: 400', (await ch(admin, { kind: 'bounty_claim', subject: '560:4255', note: 'x'.repeat(281) })).status === 400);
check('an entry that is not an entry: 404', (await ch(admin, { kind: 'challenge_entry', subject: ENTRY, label: 'good', on: true })).status === 404);
check('a challenge entry: "Good"', (await ch(admin, { kind: 'challenge_entry', subject: ENTRY, label: 'good', on: true }, oneEntry)).status === 200);
const v2 = ((await R.reviewView(S, admin, { reader: stub, entriesOf: oneEntry })) as { body: import('../src/lib/review/types').ReviewView }).body;
const m = v2.claims.find((c) => c.id === 4255)!.marks;
check('the claim reads back: "Followed directions" by the admin, "Top" gone, the note trimmed with who', m.labels.length === 1 && m.labels[0].label === 'followed_directions' && /^(@|FID )/.test(m.labels[0].by) && m.note?.text === 'Strong hook; check the Su line.', JSON.stringify(m));
check('the entry tab lists the entry with its label', v2.entries.length === 1 && v2.entries[0].marks.labels[0]?.label === 'good' && v2.entries[0].characterName === 'Bai');
check('clearing the note', (await ch(admin, { kind: 'bounty_claim', subject: '560:4255', note: '' })).status === 200 && Number((await pg.query<{ n: number }>(`select count(*)::int as n from studio.review_notes`)).rows[0].n) === 0);
const log = (await pg.query<{ change: string; label: string | null; by_fid: string }>(`select change, label, by_fid::text from studio.review_log order by id`)).rows;
check('every change is in the log, with who (and the repeat "on" is not)', log.map((l) => `${l.change}:${l.label ?? ''}:${l.by_fid}`).join(' ') === `label_on:followed_directions:${admin} label_on:top:${ADMINS[1]} note_set::${admin} label_off:top:${admin} label_on:good:${admin} note_cleared::${admin}`, log.map((l) => l.change).join(' '));
check('nothing was asked of Base but reads', writes.length === 0);

// Without the tables (as on a database where NEXT_bounty_review.sql isn't applied): every query that names them fails
// as Postgres fails it (42P01); the page still lists the claims and says labels can't be saved.
{
  const noTable = () => Object.assign(new Error('relation does not exist'), { code: '42P01' });
  const names = (q: unknown) => Array.isArray(q) && (q as string[]).join('').includes('review_');
  const away = new Proxy(S as unknown as (...a: unknown[]) => unknown, {
    apply: (fn, self, args) => (names(args[0]) ? Promise.reject(noTable()) : Reflect.apply(fn, self, args)),
    get: (o, k) => (k === 'begin' ? async () => { throw noTable(); } : Reflect.get(o, k)),
  }) as unknown as NonNullable<Sql>;
  const v3 = ((await R.reviewView(away, admin, { reader: stub, entriesOf: noEntries })) as { body: import('../src/lib/review/types').ReviewView }).body;
  check('without the tables: claims listed, labelsReady false', v3.claims.length === 5 && v3.labelsReady === false);
  check('without the tables: a label change answers 503', (await R.changeMarks(away, admin, { kind: 'bounty_claim', subject: '560:4255', label: 'good', on: true }, { reader: stub, entriesOf: noEntries })).status === 503);
}

// Pictures.
{
  const I = await import('../src/lib/review/remote-image');
  check('a picture: the tokenURI comes from Base, not the request', (await R.claimPictureFor(admin, '4255', { reader: stub, picture: async (u) => (u === 'https://pictures.snowmoon.party/images/readers/abc.jpg' ? { jpeg: Buffer.from('ok') } : null) })).status === 200);
  check('a picture for a claim not on the bounty: 404', (await R.claimPictureFor(admin, '9999', { reader: stub, picture: async () => ({ jpeg: Buffer.from('x') }) })).status === 404);
  check('a picture that cannot be read: 502, the claim still listed', (await R.claimPictureFor(admin, '4258', { reader: stub, picture: async () => null })).status === 502);
  for (const u of ['http://example.com/a.jpg', 'https://127.0.0.1/a.jpg', 'https://localhost/a.jpg', 'https://[::1]/a.jpg', 'https://intranet/a.jpg', 'https://a.internal/x', 'https://u:p@example.com/a', 'https://example.com:8443/a']) check(`not fetched: ${u}`, I.allowedUrl(u) === null);
  check('fetched: https to a public host name', I.allowedUrl('https://beige-impossible-dragon-883.mypinata.cloud/ipfs/Qm') !== null);
  for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'not-an-ip']) check(`a private address is refused: ${ip}`, I.privateAddress(ip));
  check('a public address is allowed', !I.privateAddress('104.16.1.1') && !I.privateAddress('2606:4700::1'));

  // DNS rebinding (owner, 2026-11-23): the check is the connection's own lookup. A host whose first answer is public and
  // whose second is 127.0.0.1 is refused at the connection, through the real node:https path (no request is sent: the
  // lookup refuses before any socket connects).
  {
    const asked: string[] = [];
    const rebinding: import('../src/lib/review/remote-image').Resolve = async (h) => (asked.push(h), asked.length === 1 ? ['104.16.1.1'] : ['127.0.0.1']);
    await rebinding('rebind.example'); // the answer a separate check before the fetch would have seen: public
    let threw = '';
    try {
      await I.cappedFetch('https://rebind.example/x.png', { resolve: rebinding });
    } catch (e) {
      threw = (e as Error).message;
    }
    check('DNS rebinding: a second lookup of 127.0.0.1 is refused by the connection itself', threw === 'host not allowed' && asked.length === 2, `${threw}; lookups ${asked.length}`);
    const lk = I.guardedLookup(async () => ['93.184.216.34', '10.0.0.7']);
    const out = await new Promise<string>((done) => (lk as unknown as (h: string, o: object, cb: (e: Error | null) => void) => void)('mixed.example', { all: true }, (e) => done(e ? e.message : 'connected')));
    check('a host with one public and one private address is refused (every address the socket might use)', out === 'host not allowed');
    const one = I.guardedLookup(async () => ['93.184.216.34']);
    const got = await new Promise<string>((done) => (one as unknown as (h: string, o: object, cb: (e: Error | null, a?: unknown, f?: number) => void) => void)('public.example', {}, (e, a, f) => done(e ? e.message : `${a}/${f}`)));
    check('a public address is handed to the connection (one-address form)', got === '93.184.216.34/4');
    const src = read('src/lib/review/remote-image.ts');
    check('every hop goes through the guarded lookup (node:https with lookup, no global fetch)', /httpsGet\(url, \{ lookup: lookupFn/.test(src) && !/\bawait fetch\(|fetcher\(/.test(src));
  }

  // The logic of hops and the byte cap, with a stand-in for the connection.
  type G = import('../src/lib/review/remote-image').Getter;
  const getter = (routes: Record<string, () => { status: number; type?: string; location?: string; body?: Buffer }>): G => async (u) => {
    const r = (routes[u.href] ?? (() => ({ status: 404 })))();
    return { status: r.status, location: r.location ?? null, contentType: r.type ?? '', body: (async function* () { if (r.body) yield new Uint8Array(r.body); })(), cancel: () => {} };
  };
  let threw = '';
  try {
    await I.cappedFetch('https://a.example/x', { getter: getter({ 'https://a.example/x': () => ({ status: 302, location: 'http://169.254.169.254/latest' }) }) });
  } catch (e) {
    threw = (e as Error).message;
  }
  check('a redirect to a private address is not followed', threw === 'url not allowed');
  threw = '';
  try {
    await I.cappedFetch('https://a.example/big', { getter: getter({ 'https://a.example/big': () => ({ status: 200, body: Buffer.alloc(I.MAX_BYTES + 1) }) }) });
  } catch (e) {
    threw = (e as Error).message;
  }
  check('a body over the cap is dropped', threw === 'too large');

  // Raster only (owner, 2026-11-23): JPEG, PNG, WebP, GIF and AVIF, by their bytes and sharp's reading; never SVG.
  const sharp = (await import('sharp')).default;
  const base = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#88a' } });
  const rasters: Record<string, Buffer> = {
    jpeg: await base().jpeg().toBuffer(), png: await base().png().toBuffer(), webp: await base().webp().toBuffer(), gif: await base().gif().toBuffer(), avif: await base().avif().toBuffer(),
  };
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>');
  const one = (body: Buffer, type: string) => getter({ 'https://img.example/p': () => ({ status: 200, type, body }) });
  for (const [k, b] of Object.entries(rasters)) {
    const pic = await I.claimPicture('https://img.example/p', 1200, { getter: one(b, `image/${k}`) });
    check(`${k.toUpperCase()}: accepted, known by its bytes, drawn again as a JPEG`, I.rasterKind(b) === k && pic?.kind === k && pic.jpeg[0] === 0xff && pic.jpeg[1] === 0xd8, `${I.rasterKind(b)} ${pic?.kind}`);
  }
  check('SVG sent as image/svg+xml: refused', (await I.claimPicture('https://img.example/p', 1200, { getter: one(svg, 'image/svg+xml') })) === null);
  check('SVG sent as image/png (a lying type): refused, the bytes decide', (await I.claimPicture('https://img.example/p', 1200, { getter: one(svg, 'image/png') })) === null);
  check('SVG named by JSON metadata: refused', (await I.claimPicture('https://meta.example/m.json', 1200, { getter: getter({ 'https://meta.example/m.json': () => ({ status: 200, type: 'application/json', body: Buffer.from(JSON.stringify({ image: 'https://img.example/s.svg' })) }), 'https://img.example/s.svg': () => ({ status: 200, type: 'image/png', body: svg }) }) })) === null);
  check('HTML: refused', (await I.claimPicture('https://img.example/p', 1200, { getter: one(Buffer.from('<!doctype html><img src=x>'), 'text/html') })) === null);
  const heic = await base().heif({ compression: 'hevc' }).toBuffer().catch(() => null);
  if (heic) check('HEIC (not one of the five): refused', I.rasterKind(heic) === null && (await I.claimPicture('https://img.example/p', 1200, { getter: one(heic, 'image/heic') })) === null);
  proof('a JPEG header on SVG bytes is refused by sharp’s reading', (await I.claimPicture('https://img.example/p', 1200, { getter: one(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), svg]), 'image/jpeg') })) === null);
  const pic = await I.claimPicture('https://meta.example/m.json', 1200, { getter: getter({ 'https://meta.example/m.json': () => ({ status: 200, type: 'application/json', body: Buffer.from(JSON.stringify({ image: 'https://img.example/p.png' })) }), 'https://img.example/p.png': () => ({ status: 200, type: 'image/png', body: rasters.png }) }) });
  check('JSON naming a PNG: the picture, drawn again as a JPEG', pic !== null && pic.kind === 'png' && pic.from === 'https://img.example/p.png');
  check('ipfs:// goes through the configured gateway', I.toHttps('ipfs://QmA') === `${BOUNTY_REVIEW.ipfsGateway}QmA`);
}

// --- P5: the labels are private --------------------------------------------------------------------------------
{
  const OWN = new Set(['src/lib/review/review.ts', 'src/lib/review/types.ts', 'src/lib/review/rules.ts', 'src/lib/review/chain.ts', 'src/lib/review/remote-image.ts', 'src/app/api/admin/bounty/route.ts', 'src/app/api/admin/bounty/marks/route.ts', 'src/app/api/admin/bounty/image/route.ts', 'src/app/admin/bounty/page.tsx', 'src/app/admin/bounty/not-found.tsx', 'src/components/admin-bounty-review.tsx', 'src/styles/admin-bounty.css']);
  const files = walk('src').map((f) => ({ file: f, text: read(f) }));
  const TABLES = /\breview_(labels|notes|log)\b/;
  const CODE = /from ['"](~\/lib\/review\/|\.\.?\/(\.\.\/)*review\/|\.\/review\/)|lib\/review\//;
  const problems = (fs: { file: string; text: string }[]) => fs.filter((f) => !OWN.has(f.file) && (TABLES.test(f.text) || CODE.test(f.text))).map((f) => f.file);
  check('P5: only the admin review’s own files read the review tables or the review code', problems(files).length === 0, problems(files).join(', '));
  proof('a public page reading review_labels is caught', problems([...files, { file: 'src/app/challenge/entries/page.tsx', text: 'await sql`select * from studio.review_labels`' }]).length === 1);
  proof('a feed importing the review code is caught', problems([...files, { file: 'src/lib/feed.ts', text: "import { reviewView } from './review/review';" }]).length === 1);
  check('the review tables are in no read API, agent tool or feed file (src/app/api outside admin/bounty)', !files.some((f) => f.file.startsWith('src/app/api/') && !f.file.startsWith('src/app/api/admin/bounty/') && TABLES.test(f.text)));
  const { P5B_PLANTS, REVIEW_DIR } = await import('./lib/p5b');
  check('P5b (the owner\'s line, 2026-11-23): only src/lib/review writes or reads the review tables, on the real files', p5bProblems(files).filter((x) => /private review tables/.test(x)).length === 0 && REVIEW_DIR === 'src/lib/review/');
  proof('P5b catches a route outside src/lib/review writing studio.review_labels', p5bProblems([P5B_PLANTS.reviewWriteElsewhere]).some((x) => /writes the private review tables/.test(x)));
  proof('P5b catches a feed reading studio.review_labels', p5bProblems([P5B_PLANTS.reviewReadInFeed]).some((x) => /reads the private review tables/.test(x)));
  check('P5b lets src/lib/review write them', p5bProblems([{ file: 'src/lib/review/review.ts', text: "await tx`insert into studio.review_labels (kind) values ('x')`;" }]).filter((x) => /private review tables/.test(x)).length === 0);
  check('principles.md carries the owner\'s P5b line word for word', read('docs/principles.md').includes('admin code may write `studio.admin_picks`, and nothing else; and, from /admin/bounty only, its private review tables (studio.review_labels, studio.review_notes, studio.review_log), which no public page, feed or tool reads.'));
  const mine = files.filter((f) => OWN.has(f.file));
  check('P5b passes on the new files (the review sorts behind its own 404 gate)', p5bProblems(mine).length === 0, p5bProblems(mine).join('; '));
  const lib = mine.find((f) => f.file === 'src/lib/review/review.ts')!;
  proof('P5b catches the review sorting without its 404 gate', p5bProblems([{ ...lib, text: lib.text.replace(/if \(!isAdmin\(fid\)\) return \{ status: 404[^\n]*/g, 'const admin = isAdmin(fid);') }]).length > 0);
  check('the page is always "not found", dynamic, noindex', /notFound\(\);/.test(read('src/app/admin/bounty/page.tsx')) && /index: false/.test(read('src/app/admin/bounty/page.tsx')));
  check('the routes answer private, never shared-cached', ['route.ts', 'marks/route.ts'].every((f) => /private, no-store/.test(read(`src/app/api/admin/bounty/${f}`))) && /private, max-age/.test(read('src/app/api/admin/bounty/image/route.ts')));
  const chainSrc = read('src/lib/review/chain.ts');
  const abiLines = [...chainSrc.matchAll(/'function [^']+'/g)].map((m) => m[0]);
  check('read-only on Base: every function in the ABI is a view, and nothing sends a transaction', abiLines.length === 4 && abiLines.every((l) => / view returns /.test(l)) && !/createClaim|sendTransaction|writeContract|WalletClient|eth_sendRawTransaction/.test(chainSrc));
  proof('a write function in the ABI is caught', ![...abiLines, "'function createClaim(uint256 bountyId, string name, string description, string uri)'"].every((l) => / view returns /.test(l)));
  check('the browser never loads a claimer’s host: pictures come from /api/admin/bounty/image', !/<img[^>]+src=\{c\.(uri|pictureHost)/.test(read('src/components/admin-bounty-review.tsx')) && /\/api\/admin\/bounty\/image\?claim=/.test(read('src/components/admin-bounty-review.tsx')));
}

check('no protocol errors on the test database', gate.protocolErrors().length === 0);
await sql.end({ timeout: 1 });
await server.stop();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
process.exit(0);
