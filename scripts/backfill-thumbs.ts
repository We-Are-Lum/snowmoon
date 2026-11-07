/**
 * Backfill: the small copies for lists (src/lib/images/thumb-url.ts) for every readers' picture published before the
 * site made them at publish time (speed fix 1, owner 2026-11-06). Written by the coding agent (Claude, by Anthropic),
 * 2026-11-07, DRAFT for the owner.
 *
 *   npm run backfill:thumbs                                   dry run: counts and estimated bytes; writes nothing
 *   npm run backfill:thumbs -- --apply --confirm-owner-go     makes the missing copies (owner's go only; needs the R2 keys)
 *
 * What it reads, read-only (one `begin read only … rollback` transaction): every readers' picture address in a
 * published element's version (its asset_url and its body: a sheet's views and samples, a challenge picture) and in
 * every remix frame not hidden. Then, over the public address only: whether the original is public now (a hidden
 * picture's file has left the public bucket, so it is skipped and never gets a public copy) and whether its copies
 * exist already (skipped). For each picture still missing a copy it downloads the original and resizes it in memory, so
 * the byte counts are the real ones, not a guess.
 *
 * --apply writes those copies through the site's own putThumbs (src/lib/images/store.ts), the same function publish
 * uses, beside the original. It never changes an original, a record or a row. It is refused without
 * --confirm-owner-go. Running it twice makes nothing the second time.
 *
 * Options: --db=<url> (default STUDIO_DATABASE_URL) --set-role=<role> (tests) --public-base=<url> (default
 * R2_IMAGES_PUBLIC_URL, else https://pictures.snowmoon.party) --limit=<n> --list (print every picture).
 */
import postgres from 'postgres';
import { THUMBS, thumbUrl } from '../src/lib/images/thumb-url';
import { makeThumbs } from '../src/lib/images/thumbs';

const arg = (k: string) => {
  const a = process.argv.findLast((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : '') : null;
};
const has = (k: string) => process.argv.includes(`--${k}`);
const APPLY = has('apply');
const GO = has('confirm-owner-go');
const LIST = has('list');
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;
const PUBLIC = (arg('public-base') || process.env.R2_IMAGES_PUBLIC_URL || 'https://pictures.snowmoon.party').replace(/\/$/, '');
const say = (s = '') => console.log(s);

if (APPLY && !GO) {
  console.error('backfill-thumbs: --apply needs --confirm-owner-go (the owner\'s go). Nothing done.');
  process.exit(2);
}
const url = arg('db') || process.env.STUDIO_DATABASE_URL;
if (!url) { console.error('backfill-thumbs: no database (STUDIO_DATABASE_URL or --db). Nothing done.'); process.exit(2); }

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const finish = async (code: number) => { await sql.end(); await new Promise((r) => process.stdout.write('', () => r(null))); process.exit(code); };

/** Every readers' picture address under the public base, in the text given. */
const esc = PUBLIC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ADDRESS = new RegExp(`${esc}/images/readers/[0-9a-f]{32}\\.jpg`, 'g');

class Rollback extends Error {}
let texts: string[] = [];
try {
  await sql.begin('read only', async (tx) => {
    if (arg('set-role')) await tx.unsafe(`set local role ${arg('set-role')!.replace(/[^a-z_]/g, '')}`);
    const versions = await tx`select coalesce(v.asset_url, '') || ' ' || v.body::text as t
      from studio.element_versions v join studio.elements e on e.id = v.element_id where e.status = 'published'`;
    const frames = await tx`select image_url as t from studio.remix_frames where not hidden`;
    texts = [...versions, ...frames].map((r) => String(r.t ?? ''));
    throw new Rollback();
  });
} catch (e) {
  if (!(e instanceof Rollback)) { console.error('backfill-thumbs: the read failed:', (e as Error).message); await finish(1); }
}

const originals = [...new Set(texts.flatMap((t) => t.match(ADDRESS) ?? []))].sort().slice(0, LIMIT);
say(`backfill-thumbs: ${APPLY ? 'APPLY (writes the missing copies)' : 'DRY RUN (reads only; nothing written, nothing uploaded)'}`);
say(`database: ${new URL(url).hostname} (one read-only transaction, rolled back); public base: ${PUBLIC}`);
say(`copies: ${THUMBS.widths.map((w) => `${w} px`).join(' and ')} wide, ${THUMBS.format} q${THUMBS.quality}`);
say(`readers' pictures named by published records: ${originals.length}`);

const head = async (u: string) => (await fetch(u, { method: 'HEAD', cache: 'no-store' }).catch(() => null))?.status ?? 0;
type Row = { url: string; state: 'not public' | 'has copies' | 'made' | 'would make' | 'failed'; original?: number; thumbs?: Record<number, number>; note?: string };
const rows: Row[] = [];
let i = 0;
const work = async () => {
  while (i < originals.length) {
    const u = originals[i++];
    if ((await head(u)) !== 200) { rows.push({ url: u, state: 'not public' }); continue; }
    const have = await Promise.all(THUMBS.widths.map((w) => head(thumbUrl(u, w)!)));
    if (have.every((s) => s === 200)) { rows.push({ url: u, state: 'has copies' }); continue; }
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) { rows.push({ url: u, state: 'not public' }); continue; }
      const bytes = Buffer.from(await r.arrayBuffer());
      const hex = u.match(/([0-9a-f]{32})\.jpg$/)![1];
      const thumbs = await makeThumbs(hex, bytes);
      const sizes = Object.fromEntries(thumbs.map((t) => [t.w, t.bytes.length]));
      if (APPLY) {
        const { putThumbs } = await import('../src/lib/images/store');
        const keys = await putThumbs(hex, bytes);
        rows.push({ url: u, state: keys.length === THUMBS.widths.length ? 'made' : 'failed', original: bytes.length, thumbs: sizes });
      } else rows.push({ url: u, state: 'would make', original: bytes.length, thumbs: sizes });
    } catch (e) {
      rows.push({ url: u, state: 'failed', note: (e as Error).name });
    }
  }
};
await Promise.all(Array.from({ length: 6 }, work));

const by = (s: Row['state']) => rows.filter((r) => r.state === s);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const todo = [...by('would make'), ...by('made')];
const sum = (f: (r: Row) => number) => todo.reduce((n, r) => n + f(r), 0);
if (LIST) for (const r of rows.sort((a, b) => a.url.localeCompare(b.url))) say(`  ${r.state.padEnd(10)} ${r.url}${r.original ? `  original ${kb(r.original)}  ${THUMBS.widths.map((w) => `w${w} ${kb(r.thumbs![w])}`).join('  ')}` : ''}${r.note ? `  ${r.note}` : ''}`);
say(`not public now (hidden or gone; skipped, no copy made): ${by('not public').length}`);
say(`already have their copies: ${by('has copies').length}`);
say(`${APPLY ? 'copies made for' : 'would make copies for'}: ${todo.length} pictures`);
if (todo.length) {
  const orig = sum((r) => r.original!);
  for (const w of THUMBS.widths) {
    const t = sum((r) => r.thumbs![w]);
    say(`  w${w}: ${mb(t)} in all, ${kb(t / todo.length)} each on average`);
  }
  say(`  originals: ${mb(orig)} in all, ${kb(orig / todo.length)} each on average (unchanged)`);
  say(`  ${APPLY ? 'written' : 'to write'}: ${mb(sum((r) => THUMBS.widths.reduce((n, w) => n + r.thumbs![w], 0)))} in ${todo.length * THUMBS.widths.length} files`);
}
if (by('failed').length) say(`failed: ${by('failed').length}`);
say(APPLY ? 'done.' : 'Dry run: nothing written, nothing uploaded.');
await finish(by('failed').length ? 1 : 0);
