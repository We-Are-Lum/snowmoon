/**
 * The maintainer's erasure of one remix frame's files (docs/removal.md, step 2, item 3): the picture from the readers'
 * bucket and the private bucket and, for a GPT Image frame, its original PNG from the private bucket (owner,
 * 2026-10-19: "Delete a PNG whenever its frame is deleted"). Run by the maintainer on their own machine, never from
 * the site, and only after the frame is hidden and the erasure is approved and recorded.
 *
 *   npx tsx --conditions=react-server scripts/erase-remix-frame.ts <frame id>            what would be deleted
 *   npx tsx --conditions=react-server scripts/erase-remix-frame.ts <frame id> --delete   deletes it
 *
 * Needs STUDIO_DATABASE_URL (read only here) and the R2 variables. Prints keys and sha256s, never a credential or URL.
 * The row itself is tombstoned in the SQL Editor, as postgres, as the procedure says; this script does not write to
 * the database.
 */
import postgres from 'postgres';
import { frameById, eraseFrameFiles, originalKeyOf } from '../src/lib/remix/frames';
import { keyFor } from '../src/lib/images/store';

const [id, flag] = process.argv.slice(2);
if (!id) {
  console.error('usage: erase-remix-frame.ts <frame id> [--delete]');
  process.exit(2);
}
const url = process.env.STUDIO_DATABASE_URL;
if (!url) {
  console.error('STUDIO_DATABASE_URL is not set');
  process.exit(2);
}
const sql = postgres(url, { prepare: false, max: 1 });
try {
  const f = await frameById(sql, id);
  if (!f) throw new Error('no such frame');
  if (!f.hidden) throw new Error('the frame is not hidden: hide it first (docs/removal.md, step 2 needs it hidden)');
  const original = originalKeyOf(f.recipe);
  console.log(`frame ${f.id}: picture ${keyFor(f.imageSha256)} (sha256 ${f.imageSha256}), public and private copies`);
  console.log(original ? `original PNG (private bucket): ${original}` : 'no original PNG (not a GPT Image frame)');
  if (flag !== '--delete') {
    console.log('nothing deleted; run again with --delete');
  } else {
    const r = await eraseFrameFiles(f);
    console.log(`deleted: ${r.deleted.join('; ')}`);
    console.log('record each key and sha256 above in the removal log, as step 3 says');
  }
} catch (e) {
  console.error(`stopped: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
