/**
 * Publish the remix challenge's bases (2026-11-06 launch): each picked base (scripts/lib/launch-picks.json) as a
 * published character sheet from FID 6786, the maintainer (principle 4's maintainer path; body.role 'maintainer'), with
 * the views that exist (front always; side and back where they were made from that same front), each view's recipe as
 * the drafts' ledger recorded it (the closed model and its maker, the prompt, the reference pictures by sha256 with what
 * they are, Midjourney and Garance's brought-in pictures among them, the request id and the cost). Written by the coding
 * agent (Claude, a closed model by Anthropic), lane B, 2026-11-05 night. DRAFT.
 *
 * Runs ONLY on the owner's machine, with his own env files (.env.local, .env.storage.local), which agents never read.
 *
 *   npx tsx --conditions=react-server --env-file-if-exists=.env.local --env-file-if-exists=.env.storage.local \
 *     scripts/publish-bases.ts [--drafts=<dir>] [--out=<file>]                      dry run: reads only
 *   … scripts/publish-bases.ts --apply --confirm-owner-go --out=launch-bases-published.json      publish
 *
 * The dry run reads the database in one read-only transaction and prints every upload (key, sha256, file), every body
 * and what each base lacks. --apply refuses: without --confirm-owner-go; while CHALLENGE.public is on (this replaces
 * seed-designs' "refuses from CHALLENGE.dates.opens": bases go up after the launch PR is live, before the flip); for any
 * base closedBaseRefusal refuses (closed-model bases wait for CHALLENGE.closedBasesAllowed); if any file's sha256 is not
 * the pinned one or any recipe is incomplete; without the site's storage settings. Idempotent: a base whose front is
 * already a published sheet of 6786's is skipped. It writes through the site's own functions (putPublic, makeDesign),
 * then prints the version ids and the CHALLENGE.bases lines, and with --out writes them for import-first-remixes.
 * Options: --name=<byline> (default naaate) --db=<url> --storage-dir=<dir> (a stand-in for R2; local test database
 * only) --set-role=studio_writer (tests).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { CHALLENGE, WORK_ID } from '../src/lib/config';
import { keyFor } from '../src/lib/images/store';
import { MAINTAINER_FID, applyGate, planBase, readLedger, readPicks, type Body } from './lib/launch-publish';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (k: string) => {
  const a = process.argv.findLast((x) => x === `--${k}` || x.startsWith(`--${k}=`)); // the last one given wins
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : '') : null;
};
const has = (k: string) => process.argv.includes(`--${k}`);
const APPLY = has('apply');
const DRAFTS = arg('drafts') || '/Users/nathan/snowmoon-challenge-styles/docs/starting-sheet-drafts';
const PICKS = arg('picks') || path.join(ROOT, 'scripts/lib/launch-picks.json');
const BY_NAME = arg('name') || 'naaate';
const STORAGE_DIR = arg('storage-dir');
const OUT = arg('out');
const url = arg('db') || process.env.STUDIO_DATABASE_URL;
if (!url) { console.error('No database: set STUDIO_DATABASE_URL or --db. Nothing done.'); process.exit(2); }
const local = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
if (STORAGE_DIR && !local) { console.error('--storage-dir is for a local test database only. Nothing done.'); process.exit(2); }
/** Tests only (a local database and stand-in storage): the switches as the launch PR will have them. */
const testCfg = STORAGE_DIR && local && process.env.LAUNCH_PUBLISH_TEST_CONFIG ? (JSON.parse(process.env.LAUNCH_PUBLISH_TEST_CONFIG) as { public?: boolean; closedBasesAllowed?: boolean }) : {};
const isPublic = testCfg.public ?? CHALLENGE.public;
const closedAllowed = testCfg.closedBasesAllowed ?? CHALLENGE.closedBasesAllowed;

const say = (s = '') => console.log(s);
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
if (arg('set-role')) await sql.unsafe(`set role ${arg('set-role')!.replace(/[^a-z_]/g, '')}`);
const finish = async (code: number) => { await sql.end(); await new Promise((r) => process.stdout.write('', () => r(null))); process.exit(code); };

const { bookCharacter, makeDesign } = await import('../src/lib/images/designs');
const { closedBaseRefusal } = await import('../src/lib/challenge/bases');
const { IMAGES } = await import('../src/lib/config');
const picks = readPicks(PICKS);
const ledger = readLedger(DRAFTS);
const plans = picks.bases.map((b) => planBase(DRAFTS, ledger, b, BY_NAME, IMAGES.designs?.textMaxChars ?? 600));

/** A base already published: a sheet of 6786's whose front is this picture. */
const existing = async (tx: postgres.Sql | postgres.TransactionSql, front: string) => {
  const [r] = await tx`select v.id::text as version_id, e.id::text as element_id from studio.elements e join studio.element_versions v on v.element_id = e.id
    where e.element_type = 'design' and e.work_id = ${WORK_ID} and e.created_by_fid = ${MAINTAINER_FID} and e.status = 'published'
      and v.body->'views'->'front'->>'sha256' = ${front} order by v.version_no limit 1`;
  return r ? { versionId: String(r.version_id), elementId: String(r.element_id) } : null;
};
const before = await sql.begin('read only', async (tx) => {
  const out: Record<string, { versionId: string; elementId: string } | null> = {};
  for (const p of plans) out[p.pick.key] = p.pics.find((x) => x.slot === 'front') ? await existing(tx, p.pick.views.front!.sha256) : null;
  return out;
});
const PUBLIC = (process.env.R2_IMAGES_PUBLIC_URL || 'https://pictures.snowmoon.party').replace(/\/$/, '');

say(`publish-bases: ${APPLY ? 'APPLY' : 'DRY RUN (reads only; nothing written, nothing uploaded)'}`);
say(`database: ${new URL(url).hostname}; drafts: ${DRAFTS}; picks: ${path.relative(ROOT, PICKS)}`);
say(`as FID ${MAINTAINER_FID}, byline "${BY_NAME}", role maintainer${STORAGE_DIR ? `; STAND-IN storage ${STORAGE_DIR}` : ''}`);
say(`CHALLENGE.public ${isPublic}; CHALLENGE.closedBasesAllowed ${closedAllowed}${testCfg.public !== undefined || testCfg.closedBasesAllowed !== undefined ? ' (test settings)' : ' (as committed)'}`);
const refusals: string[] = [];
for (const p of plans) {
  say();
  say(`-- ${p.pick.key}: ${bookCharacter(p.pick.character)?.name ?? p.pick.character}, "${p.pick.title}"${p.pick.current_default ? ' (current default)' : ''}`);
  if (before[p.pick.key]) { say(`SKIP: already published, version ${before[p.pick.key]!.versionId}`); continue; }
  for (const x of p.pics) say(`  ${x.slot.padEnd(5)} ${keyFor(x.sha256)}  sha256 ${x.sha256}  from ${x.file}  ${x.recipe.model} (${x.recipe.host})${x.recipe.credit ? `  credit: ${x.recipe.credit.join('; ')}` : ''}`);
  if (p.missing.length) say(`  missing: ${p.missing.join(', ')}${p.pick.missing ? ` (${p.pick.missing})` : ''}`);
  for (const pr of p.problems) { say(`  PROBLEM: ${pr}`); refusals.push(`${p.pick.key}: ${pr}`); }
  const body = p.body(Object.fromEntries(p.pics.map((x) => [x.slot, `${PUBLIC}/${keyFor(x.sha256)}`])));
  const why = closedBaseRefusal(body as never, closedAllowed);
  if (why) { say(`  REFUSED while it stands: ${why}`); refusals.push(`${p.pick.key}: ${why}`); }
  if (!bookCharacter(p.pick.character)) refusals.push(`${p.pick.key}: ${p.pick.character} is not one of the book's characters`);
  if (!CHALLENGE.characters.includes(p.pick.character)) refusals.push(`${p.pick.key}: ${p.pick.character} is not a challenge character`);
  say(`  body: ${JSON.stringify(body)}`);
}
const gate = applyGate({ apply: APPLY, confirmed: has('confirm-owner-go'), isPublic, refusals });
if (!APPLY) {
  say();
  if (refusals.length) say(`--apply would refuse: ${refusals.length} problem(s) above.`);
  say('Dry run: nothing written, nothing uploaded.');
  await finish(0);
}
if (gate.length) { for (const g of gate) say(`Refusing --apply: ${g}.`); say('Nothing done.'); await finish(3); }
if (!STORAGE_DIR) {
  const { storageReady, missingStorage, BOOK_MEDIA_BUCKET } = await import('../src/lib/images/store');
  if (!storageReady() || process.env.R2_BUCKET === BOOK_MEDIA_BUCKET) {
    say(`Refusing --apply: the site's storage settings are needed (the readers' bucket). Missing: ${missingStorage().join(', ') || 'none'}. Nothing done.`);
    await finish(4);
  }
}
const put = async (s: string, bytes: Buffer): Promise<string> => {
  if (STORAGE_DIR) {
    const f = path.join(STORAGE_DIR, keyFor(s));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, bytes);
    return `${PUBLIC}/${keyFor(s)}`;
  }
  const { putPublic } = await import('../src/lib/images/store');
  return putPublic(s, bytes, 'image/jpeg');
};
type Sql = Parameters<typeof makeDesign>[0];
const published: Record<string, { character: string; versionId: string; elementId: string; frontSha256: string; current_default: boolean; skipped: boolean }> = {};
say();
for (const p of plans) {
  const ex = await existing(sql, p.pick.views.front!.sha256);
  if (ex) { published[p.pick.key] = { character: p.pick.character, ...ex, frontSha256: p.pick.views.front!.sha256, current_default: p.pick.current_default, skipped: true }; say(`${p.pick.key}: exists, skipped (version ${ex.versionId})`); continue; }
  const urls: Record<string, string> = {};
  for (const x of p.pics) urls[x.slot] = await put(x.sha256, x.bytes);
  const out = await makeDesign(sql as unknown as Sql, { fid: MAINTAINER_FID, mode: 'create', kind: 'character', character: bookCharacter(p.pick.character)!, body: p.body(urls) as unknown as Body as never });
  published[p.pick.key] = { character: p.pick.character, ...out, frontSha256: p.pick.views.front!.sha256, current_default: p.pick.current_default, skipped: false };
  say(`${p.pick.key}: published, version ${out.versionId} (element ${out.elementId})`);
}
// The CHALLENGE.bases lines for the config PR: the current default first, then the others in the picks' order.
const lines = CHALLENGE.characters.map((c) => {
  const ks = Object.entries(published).filter(([, v]) => v.character === c).sort((a, b) => Number(b[1].current_default) - Number(a[1].current_default));
  return `    ${c}: [${ks.map(([, v]) => `'${v.versionId}'`).join(', ')}],`;
});
say();
say('CHALLENGE.bases for the config PR (version ids; the current default first):');
for (const l of lines) say(l);
if (OUT) writeFileSync(OUT, JSON.stringify({ written_at: new Date().toISOString(), database: new URL(url).hostname, bases: published }, null, 1));
say(OUT ? `written: ${OUT}` : '');
say('done.');
await finish(0);
