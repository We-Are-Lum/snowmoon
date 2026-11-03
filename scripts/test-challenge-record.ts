/**
 * The challenge record (docs/proposals/challenge-record.md; owner, 2026-11-01 and 2026-11-02): fingerprints, not
 * copies. Stand-ins only: PGlite (in memory) with every migration on main and made-up entries; no network, no upload.
 * Fails (exit 1) on any problem.
 *
 *   npm run test:challenge-record
 *
 * Covers the exact field list; versions hidden before the export recorded by id only; no titles, texts, prompts,
 * names or picture addresses in a per-version row (each proven on a planted violation); the recipe sha256 recomputed
 * from the recipe as the page shows it; the parents; determinism (built twice, and from shuffled rows); RFC 8785 and
 * the offline CID on known vectors; the read happening in a read-only transaction; and no upload path.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { ADMINS } from '../src/lib/config';
import { howMade } from '../src/lib/images/recipe-lines';
import { HIDDEN_KEYS, PICTURE_KEYS, TOP_KEYS, VERSION_KEYS, buildEntriesRecord, canonicalize, offlineCid, pageRecipe, recipeSha256, recordBytes, recordProblems, sha256Hex, type EntriesRecord, type RecordVersion } from '../src/lib/challenge-record/record';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

// --- RFC 8785 and the offline CID, on known vectors ---------------------------------------------------------------
// RFC 8785 §3.2.2's own example, input and output.
const rfcIn = JSON.parse('{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}');
check('RFC 8785: the RFC’s example (§3.2.2) gives the RFC’s output', canonicalize(rfcIn) === '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}', canonicalize(rfcIn));
check('RFC 8785: keys sorted by UTF-16 code units (the RFC’s sorting example)', canonicalize({ '€': 'Euro Sign', '\r': 'Carriage Return', 'דּ': 'Hebrew Letter Dalet With Dagesh', '1': 'One', '😀': 'Emoji: Grinning Face', '\u0080': 'Control', 'ö': 'Latin Small Letter O With Diaeresis' }) === '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}');
check('RFC 8785: refuses a number that is not finite', (() => { try { canonicalize({ x: Infinity }); return false; } catch { return true; } })());
check('RFC 8785: refuses a lone surrogate', (() => { try { canonicalize('\ud800'); return false; } catch { return true; } })());
// Known CIDs: what `ipfs add --cid-version=1 --raw-leaves` prints for these files.
check('offline CID: "hello\\n" is bafkreicysg23kiwv34eg2d7qweipxwosdo2py4ldv42nbauguluen5v6am', offlineCid(Buffer.from('hello\n')) === 'bafkreicysg23kiwv34eg2d7qweipxwosdo2py4ldv42nbauguluen5v6am');
check('offline CID: "hello world" is bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e', offlineCid(Buffer.from('hello world')) === 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e');
check('offline CID: a file over one 1 MiB chunk is not computed (it needs a UnixFS tree)', offlineCid(Buffer.alloc(1048577)) === null && offlineCid(Buffer.alloc(1048576)) !== null);

// --- The database: main's migrations, made-up entries -------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql') && !f.startsWith('NEXT_')).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const DS = await import('../src/lib/images/designs');
const BAI = DS.bookCharacter('bai')!.name;
const ZEI = DS.bookCharacter('zei')!.name;
const OWNER = ADMINS[0];
const u = (n: string) => `00000000-0000-0000-0000-${n.padStart(12, '0')}`;
const hex = (c: string) => c.repeat(64).slice(0, 64);
const SECRET = { title: 'Bai in the snow TITLE-XYZ', text: 'A heavier coat TEXT-XYZ', prompt: 'PROMPT-XYZ a girl of eighteen', name: 'byname-xyz', url: 'https://media.snowmoon.party/test/URL-XYZ' };
const recipe = (n: string, extra: Record<string, unknown> = {}) => ({
  prompt: `${SECRET.prompt} ${n}`, model: 'z-image-turbo', endpoint: 'fal-ai/z-image/turbo', host: 'fal.ai', settings: { steps: 8, converted: { from: 'png', sha256: hex('c'), to: 'jpg' } }, seed: 42, request_id: `req-${n}`, cost_usd: 0.003, made_at: '2026-11-10T12:00:00.000Z', width: 576, height: 768, references: [{ sha256: hex('d'), what: 'the front view' }], checks: { prompt: { model: 'openai/gpt-oss-safeguard-20b', verdict: 'ok' }, host_safety_checker: 'passed' }, assist: null, style: { version_id: u('99'), title: 'Style', text: 'STYLE-TEXT-XYZ' }, ...extra,
});
const body = (n: string, sha: string) => JSON.stringify({ title: `${SECRET.title} ${n}`, text: `${SECRET.text} ${n}`, samples: [], views: { front: { url: `${SECRET.url}/${n}-front.jpg`, sha256: hex(sha), recipe: recipe(`${n}-front`) }, side: { url: `${SECRET.url}/${n}-side.jpg`, sha256: hex(String.fromCharCode(sha.charCodeAt(0) + 1)), recipe: recipe(`${n}-side`) } }, by_name: SECRET.name, by_name_source: 'relay', assist: null, role: null, style: null });
// Elements: S (the owner's starting sheet, before the window); A (FID 500's fork of S, v1 and v2); B (501's fork of A
// v1, also crediting S with 'uses'); H (502's fork of S, hidden since); C (503's fork of H); L (504's fork of S, below
// the score: not an entry); Z (505's Zei fork, a second character); I (an image using A v2: not credit).
const els: [string, string, number, string, string][] = [
  ['eS', BAI, OWNER, 'published', '2026-11-01T10:00:00Z'], ['eA', BAI, 500, 'published', '2026-11-08T10:00:00Z'], ['eB', BAI, 501, 'published', '2026-11-09T10:00:00Z'],
  ['eH', BAI, 502, 'hidden', '2026-11-09T11:00:00Z'], ['eC', BAI, 503, 'published', '2026-11-10T10:00:00Z'], ['eL', BAI, 504, 'published', '2026-11-11T10:00:00Z'], ['eZ', ZEI, 505, 'published', '2026-11-12T10:00:00Z'],
];
const entity = { [BAI]: u('e1'), [ZEI]: u('e2') };
await db.exec(`insert into studio.entities (id, work_id, kind, name) values ('${u('e1')}','snowmoon','character','${BAI}'), ('${u('e2')}','snowmoon','character','${ZEI}')`);
const EL: Record<string, string> = { S: u('50'), A: u('a0'), B: u('b0'), H: u('d0'), C: u('c0'), L: u('f0'), Z: u('e0') };
const el = (x: string) => EL[x];
for (const [e, name, fid, status, at] of els) await db.exec(`insert into studio.elements (id, work_id, element_type, entity_id, created_by_fid, status, created_at) values ('${el(e.slice(1))}','snowmoon','design','${entity[name]}',${fid},'${status}','${at}')`);
await db.exec(`insert into studio.elements (id, work_id, element_type, created_by_fid, status) values ('${u('90')}','snowmoon','image',500,'published')`);
const V = { S: u('51'), A: u('a1'), A2: u('a2'), B: u('b1'), H: u('d1'), C: u('c1'), L: u('f1'), Z: u('e9'), I: u('99a') };
const vers: [string, string, number, string, string][] = [
  [V.S, 'S', 1, '2026-11-01T10:00:00Z', '1'], [V.A, 'A', 1, '2026-11-08T10:00:00Z', '3'], [V.A2, 'A', 2, '2026-11-10T09:00:00Z', '5'], [V.B, 'B', 1, '2026-11-09T10:00:00Z', '7'],
  [V.H, 'H', 1, '2026-11-09T11:00:00Z', 'a'], [V.C, 'C', 1, '2026-11-10T10:00:00Z', 'b'], [V.L, 'L', 1, '2026-11-11T10:00:00Z', 'e'], [V.Z, 'Z', 1, '2026-11-12T10:00:00Z', '0'],
];
for (const [id, e, no, at, sha] of vers) await db.query(`insert into studio.element_versions (id, element_id, version_no, body, created_at) values ($1, $2, $3, $4::jsonb, $5)`, [id, el(e), no, body(e + no, sha), at]);
await db.exec(`insert into studio.element_versions (id, element_id, version_no, created_at) values ('${V.I}','${u('90')}',1,'2026-11-12T00:00:00Z')`);
const link = (f: string, t: string, k: string) => db.exec(`insert into studio.links (from_version_id, to_version_id, kind) values ('${f}','${t}','${k}')`);
await link(V.A, V.S, 'remixed_from');
await link(V.B, V.A, 'remixed_from');
await link(V.B, V.S, 'uses');
await link(V.H, V.S, 'remixed_from');
await link(V.C, V.H, 'remixed_from');
await link(V.L, V.S, 'remixed_from');
await link(V.Z, V.S, 'remixed_from');
await link(V.I, V.A2, 'uses');
// Eligibility, decided at publish (0033): 500, 501, 503 and 505 passed; 504 below.
for (const [v, fid, d] of [[V.A, 500, 'passed'], [V.A2, 500, 'passed'], [V.B, 501, 'passed'], [V.C, 503, 'passed'], [V.L, 504, 'below'], [V.Z, 505, 'passed']] as const) {
  await db.exec(`insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible) values ('${v}','remix-2026-11',${fid},'${d}',${d === 'passed'})`);
}

const PORT = 54391;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
const LR = await import('../src/lib/challenge-record/load');
const once = () => sql.begin('read only', (tx) => LR.readEntriesRecord(tx as unknown as postgres.Sql));
const first = await once();
const second = await once();
const rec = first.record;
const rows = rec.versions;
const row = (id: string) => rows.find((r) => r.id === id) as RecordVersion | undefined;

// --- Which versions, the exact field list ------------------------------------------------------------------------
check('entries: A v2 (500’s latest), B, C and Z; not L (below the score)', first.entries === 4, String(first.entries));
check('record: the entries and what they were built on: S, A v1, A v2, B, H (by id), C, Z; not L, not the image', JSON.stringify(rows.map((r) => r.id).sort()) === JSON.stringify([V.S, V.A, V.A2, V.B, V.H, V.C, V.Z].sort()), rows.map((r) => r.id.slice(-3)).join());
check('record: the top-level keys, exactly', JSON.stringify(Object.keys(rec)) === JSON.stringify(TOP_KEYS));
check('record: every published row has exactly id, character, maker_fid, published_at, entry, pictures, built_on', rows.filter((r) => !('hidden_before_export' in r)).every((r) => JSON.stringify(Object.keys(r)) === JSON.stringify(VERSION_KEYS)));
check('record: every picture has exactly view, sha256, recipe_sha256', rows.flatMap((r) => ('pictures' in r ? r.pictures : [])).every((p) => JSON.stringify(Object.keys(p)) === JSON.stringify(PICTURE_KEYS)));
check('record: the checker finds nothing wrong', recordProblems(rec).length === 0, recordProblems(rec).join('; '));
check('entry flags: entries true; what they were built on false', row(V.A2)!.entry && row(V.B)!.entry && row(V.C)!.entry && row(V.Z)!.entry && !row(V.A)!.entry && !row(V.S)!.entry);
check('maker FID and publish time', row(V.B)!.maker_fid === 501 && row(V.B)!.published_at === '2026-11-09T10:00:00.000Z' && row(V.S)!.maker_fid === OWNER);
check('character slugs', row(V.Z)!.character === 'zei' && row(V.B)!.character === 'bai');
check('pictures: front then side, with the stored sha256', JSON.stringify(row(V.B)!.pictures.map((p) => p.view)) === '["front","side"]' && row(V.B)!.pictures[0].sha256 === hex('7') && row(V.B)!.pictures[1].sha256 === hex('8'));
check('order: by publish time, then id; versions by id only last', rows.at(-1)!.id === V.H && rows.slice(0, -1).every((r, i, a) => i === 0 || (a[i - 1] as RecordVersion).published_at <= (r as RecordVersion).published_at));

// --- Hidden versions: by id only ---------------------------------------------------------------------------------
check('hidden: H (hidden since) is recorded by id only', JSON.stringify(row(V.H)) === JSON.stringify({ id: V.H, hidden_before_export: true }) && JSON.stringify(Object.keys(row(V.H)!)) === JSON.stringify(HIDDEN_KEYS));
check('hidden: C still credits H by id', JSON.stringify(row(V.C)!.built_on) === JSON.stringify([{ version: V.H, kind: 'remixed_from' }]));
proof('a hidden row holding its maker is caught', recordProblems({ ...rec, versions: rows.map((r) => (r.id === V.H ? { ...r, maker_fid: 502 } : r)) }).some((p) => /hidden version holds more/.test(p)));

// --- Parents -----------------------------------------------------------------------------------------------------
check('parents: B credits A v1 (remixed_from), then S (uses)', JSON.stringify(row(V.B)!.built_on) === JSON.stringify([{ version: V.A, kind: 'remixed_from' }, { version: V.S, kind: 'uses' }]));
check('parents: A v2 inherits its fork origin, S', JSON.stringify(row(V.A2)!.built_on) === JSON.stringify([{ version: V.S, kind: 'fork-origin' }]));
check('parents: A v1 credits S', JSON.stringify(row(V.A)!.built_on) === JSON.stringify([{ version: V.S, kind: 'remixed_from' }]));
check('parents: the starting sheet was made from the book (no parents)', row(V.S)!.built_on.length === 0);
check('parents: the image that uses A v2 is not in the record', !rows.some((r) => r.id === V.I));

// --- No copies: titles, texts, prompts, names, picture addresses -------------------------------------------------
const text = recordBytes(rec).toString('utf8');
for (const [what, s] of Object.entries({ ...SECRET, style: 'STYLE-TEXT-XYZ', request: 'req-', media: 'media.snowmoon.party' })) check(`no copies: no ${what} anywhere in the record`, !text.includes(s.split(' ')[0]));
const planted = (f: (r: RecordVersion) => Record<string, unknown>) => recordProblems({ ...rec, versions: rows.map((r) => (r.id === V.B ? f(r as RecordVersion) : r)) });
proof('a title in a row is caught', planted((r) => ({ ...r, title: SECRET.title })).length > 0);
proof('a text in a row is caught', planted((r) => ({ ...r, text: SECRET.text })).length > 0);
proof('a byline name in a row is caught', planted((r) => ({ ...r, by_name: SECRET.name })).length > 0);
proof('a prompt in a picture is caught', planted((r) => ({ ...r, pictures: r.pictures.map((p) => ({ ...p, prompt: SECRET.prompt })) })).length > 0);
proof('a picture address in a picture is caught', planted((r) => ({ ...r, pictures: r.pictures.map((p) => ({ ...p, url: SECRET.url })) })).length > 0);
proof('a picture address hidden as its view is caught', planted((r) => ({ ...r, pictures: r.pictures.map((p) => ({ ...p, view: SECRET.url })) })).length > 0);
proof('a name hidden as the character is caught', planted((r) => ({ ...r, character: 'Bai the archer' })).length > 0);
proof('a title hidden as a sha256 is caught', planted((r) => ({ ...r, pictures: r.pictures.map((p) => ({ ...p, sha256: SECRET.title })) })).length > 0);
proof('a text hidden in a link is caught', planted((r) => ({ ...r, built_on: [{ version: V.A, kind: 'remixed_from', note: SECRET.text }] })).length > 0);
proof('an extra top-level key is caught', recordProblems({ ...rec, notes: 'x' }).length > 0);
proof('buildEntriesRecord refuses a picture without a sha256', (() => {
  try {
    buildEntriesRecord({ challenge: 'remix-2026-11', site: 's', window: rec.window, characters: rec.characters, entries: [{ versionId: 'x', character: 'bai' }], versions: [{ id: 'x', elementId: 'ex', elementType: 'design', versionNo: 1, makerFid: 500, entity: BAI, entityKind: 'character', status: 'published', body: { views: { front: { url: 'u' } } }, createdAt: '2026-11-10T00:00:00Z' }], links: [], slugOf: LR.slugOf });
    return false;
  } catch (e) {
    return /no sha256/.test((e as Error).message);
  }
})());

// --- The recipe fingerprint, recomputed from the recipe as the page shows it -------------------------------------
const stored = recipe('B1-front');
// What the page shows (src/app/references/designs/[id]/page.tsx: the prompt, then howMade's line), written by hand.
const asShown = {
  schema: 'snowmoon.recipe/1', prompt: stored.prompt, model: 'z-image-turbo', endpoint: 'fal-ai/z-image/turbo', host: 'fal.ai', seed: 42, request_id: 'req-B1-front', cost_usd: 0.003, made_on: '2026-11-10',
  references: [{ sha256: hex('d'), what: 'the front view' }], settings: { converted: { from: 'png', sha256: hex('c'), to: 'jpg' } },
  checks: { prompt: { model: 'openai/gpt-oss-safeguard-20b', verdict: 'ok' }, host_safety_checker: 'passed' },
};
check('recipe: recomputed by hand from what the page shows, it matches the record', sha256Hex(canonicalize(asShown)) === row(V.B)!.pictures[0].recipe_sha256);
const line = howMade(stored as Parameters<typeof howMade>[0], hex('7'), hex('7'), true).map((r) => r.text).join('');
check('recipe: every value in snowmoon.recipe/1 is on the page (its line or its prompt)', ['z-image-turbo', 'fal-ai/z-image/turbo', 'fal.ai', 'Seed 42', 'request req-B1-front', '$0.0030', '2026-11-10', hex('d').slice(0, 12), hex('c').slice(0, 12), 'gpt-oss-safeguard-20b', "host's safety checker"].every((s) => line.includes(s)), line);
check('recipe: a setting the page doesn’t show (steps) doesn’t change it', recipeSha256({ ...stored, settings: { ...stored.settings, steps: 50 } }) === recipeSha256(stored));
check('recipe: width, height and the style text (not shown) don’t change it', recipeSha256({ ...stored, width: 1, height: 2, style: { version_id: u('98'), title: 'Other', text: 'other' } }) === recipeSha256(stored));
check('recipe: the time of day (shown as the date only) doesn’t change it', recipeSha256({ ...stored, made_at: '2026-11-10T23:59:59.000Z' }) === recipeSha256(stored));
proof('a changed prompt changes it', recipeSha256({ ...stored, prompt: 'another prompt' }) !== recipeSha256(stored));
proof('a changed seed changes it', recipeSha256({ ...stored, seed: 43 }) !== recipeSha256(stored));
proof('a changed check changes it', recipeSha256({ ...stored, checks: { prompt: null, host_safety_checker: 'passed' } }) !== recipeSha256(stored));
check('recipe: an unrecorded seed and request read as null ("not recorded")', (() => { const p = pageRecipe({ ...stored, seed: null, request_id: null }); return p.seed === null && p.request_id === null; })());
check('recipe: the starting sheets’ recipes (made elsewhere, no checks) still fingerprint', /^[0-9a-f]{64}$/.test(recipeSha256({ prompt: 'p', model: 'gpt-image-2.5', endpoint: 'x', host: 'outside the site', seed: null, request_id: null, cost_usd: 0, made_at: '2026-10-31T00:00:00Z', checks: null, assist: { model: 'claude-coding-agent', drafted: ['prompt'] } })));

// --- Determinism -------------------------------------------------------------------------------------------------
check('deterministic: built twice from the database, the same bytes', recordBytes(first.record).equals(recordBytes(second.record)));
check('deterministic: the same sha256 and CID', sha256Hex(recordBytes(first.record)) === sha256Hex(recordBytes(second.record)) && offlineCid(recordBytes(first.record)) === offlineCid(recordBytes(second.record)) && offlineCid(recordBytes(first.record))!.startsWith('bafkrei'));
{
  // Rebuilt from the same rows, shuffled.
  const R = await import('../src/lib/deep-funding/load');
  const got = await sql.begin('read only', (tx) => R.loadRows(tx as unknown as postgres.Sql, [V.A2, V.B, V.C, V.Z]));
  const input = (rev: boolean) => ({
    challenge: rec.challenge, site: rec.site, window: rec.window, characters: rec.characters,
    entries: (rev ? [...[V.A2, V.B, V.C, V.Z]].reverse() : [V.A2, V.B, V.C, V.Z]).map((id) => ({ versionId: id, character: id === V.Z ? 'zei' : 'bai' })),
    versions: rev ? [...got.versions.values()].reverse() : [...got.versions.values()],
    links: rev ? [...got.links].reverse() : got.links,
    slugOf: LR.slugOf,
  });
  const a = recordBytes(buildEntriesRecord(input(false)));
  const b = recordBytes(buildEntriesRecord(input(true)));
  check('deterministic: rows and entries in another order give the same bytes', a.equals(b) && a.equals(recordBytes(rec)));
  proof('a planted clock in the record changes its bytes (so a timestamp would be caught by the twice-build check)', !recordBytes({ ...rec, versions: [...rec.versions] } as EntriesRecord).equals(Buffer.from(canonicalize({ ...rec, exported_at: new Date().toISOString() }))));
}
check('bytes: RFC 8785, UTF-8, no trailing newline', recordBytes(rec).toString('utf8') === canonicalize(rec) && !recordBytes(rec).toString('utf8').endsWith('\n'));

// --- Read-only, no upload ----------------------------------------------------------------------------------------
{
  let refused = false;
  try {
    await sql.begin('read only', (tx) => tx`insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 500, 'bai', ${V.B})`);
  } catch {
    refused = true;
  }
  proof('a write inside the read-only transaction is refused (the export reads that way)', refused);
  const script = read('scripts/challenge-record.ts');
  check('script: reads in sql.begin(\'read only\', …) only', /sql\.begin\('read only'/.test(script) && !/\binsert\b|\bupdate\b|\bdelete\b/i.test(script.replace(/^\s*\*.*$/gm, '')));
  const code = [script, read('src/lib/challenge-record/record.ts'), read('src/lib/challenge-record/load.ts')].join('\n');
  check('no upload path: no fetch, no HTTP client, no pinning service or IPFS API', !/\bfetch\(|https?\.request|axios|FormData|pinata|filebase|storacha|web3\.storage|\/api\/v0\/add|pinFile|pinJSON/i.test(code));
  check('script: writes only into challenge-record-out', [...script.matchAll(/writeFileSync\(([^,]+),/g)].every((m) => m[1].includes('OUT')));
}
check('npm scripts: challenge-record and test:challenge-record', /"challenge-record": "tsx --conditions=react-server --env-file-if-exists=\.env\.local scripts\/challenge-record\.ts"/.test(read('package.json')) && /"test:challenge-record"/.test(read('package.json')));

await sql.end();
await server.stop();
await db.close();
console.log(`test:challenge-record: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
