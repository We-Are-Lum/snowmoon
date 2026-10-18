/**
 * Publish step (b) for a scene's version: upload its cut and poster to R2 (media.snowmoon.party, where
 * the site already serves the book's media) under names carrying their sha256, so the URLs in the
 * migration seed and the built-in fallback are known before the upload and can't point at other bytes.
 *
 *   npm run publish:scene-video -- --dry      the URLs only, no keys needed; checks they match the seed
 *   npm run publish:scene-video               uploads (needs the R2 keys in .env.local; see README "Media")
 *
 * The cut must be faststart (its moov before its mdat) so it plays while it loads; this checks it and
 * stops otherwise. Version 1 of Fifteen Days (owner, 2026-10-17: publish v5 as is; poster = the café master):
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { r2, sha256File } from './lib/r2';

const ROOT = path.resolve(import.meta.dirname, '..');
const VERSION = {
  seed: 'fifteen-days',
  version: 1,
  // The cut as committed on scenes-sound (publish step (a), v6: 7ee4580), and its sha256.
  mp4: 'scenes-out/fifteen-days/cuts/coverage-v6/coverage-v6.mp4',
  mp4Sha256: '9391f90d6dcad7906fed8553c57abb42503517d41d8305dc06e057e8faaf4d93',
  // The café master (cov-cafe-MASTER-wave-K7), as a JPEG.
  poster: 'adaptations/fifteen-days/versions/1-poster.jpg',
  posterSha256: '3caad9b7565656b388992b7fa81a078a1e2612d28bb2923729cf6505af584a32',
};
const PUBLIC = 'https://media.snowmoon.party';
const key = (kind: 'cut' | 'poster', sha: string) => `scenes/${VERSION.seed}/v${VERSION.version}/${VERSION.seed}-${kind === 'cut' ? '' : 'poster-'}${sha.slice(0, 12)}.${kind === 'cut' ? 'mp4' : 'jpg'}`;
export const VIDEO_URL = `${PUBLIC}/${key('cut', VERSION.mp4Sha256)}`;
export const POSTER_URL = `${PUBLIC}/${key('poster', VERSION.posterSha256)}`;

const dry = process.argv.includes('--dry');
const problems: string[] = [];
// The seed and the fallback must already name these URLs.
for (const f of ['supabase/migrations/0012_adaptations.sql', 'src/lib/adaptation-pages.ts']) {
  const t = await readFile(path.join(ROOT, f), 'utf8');
  if (!t.includes(VIDEO_URL)) problems.push(`${f} does not name ${VIDEO_URL}`);
  if (!t.includes(POSTER_URL)) problems.push(`${f} does not name ${POSTER_URL}`);
}
for (const [file, want] of [[VERSION.mp4, VERSION.mp4Sha256], [VERSION.poster, VERSION.posterSha256]] as const) {
  const p = path.join(ROOT, file);
  if (!existsSync(p)) problems.push(`${file} is not here (merge scenes-sound first)`);
  else if ((await sha256File(p)) !== want) problems.push(`${file}: sha256 is not ${want}`);
}
if (existsSync(path.join(ROOT, VERSION.mp4))) {
  // Top-level boxes in order: faststart puts moov before mdat.
  const b = await readFile(path.join(ROOT, VERSION.mp4));
  const order: string[] = [];
  for (let i = 0; i + 8 <= b.length && order.length < 8; ) {
    let size = b.readUInt32BE(i);
    order.push(b.toString('latin1', i + 4, i + 8));
    if (size === 1) size = Number(b.readBigUInt64BE(i + 8));
    if (size < 8) break;
    i += size;
  }
  if (order.indexOf('moov') < 0 || order.indexOf('moov') > order.indexOf('mdat')) problems.push(`${VERSION.mp4} is not faststart (boxes: ${order.join(', ')})`);
}
console.log(`video  ${VIDEO_URL}\nposter ${POSTER_URL}`);
if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
if (dry) {
  console.log('dry run: the files match and the seed names their URLs; nothing uploaded');
  process.exit(0);
}
const store = r2();
if (store.publicUrl !== PUBLIC) throw new Error(`R2_PUBLIC_URL is ${store.publicUrl}, expected ${PUBLIC}`);
for (const [kind, file, sha, type] of [['cut', VERSION.mp4, VERSION.mp4Sha256, 'video/mp4'], ['poster', VERSION.poster, VERSION.posterSha256, 'image/jpeg']] as const) {
  const { url, uploaded } = await store.put(key(kind, sha), path.join(ROOT, file), type);
  console.log(`${uploaded ? 'uploaded' : 'already there'}: ${url}`);
}
