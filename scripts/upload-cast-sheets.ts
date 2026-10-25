/**
 * Puts the cast sheets into the private bucket for the owner's drift grids (/you/illustrations/characters; owner,
 * 2026-10-25), under review/cast-sheets/. Nothing is published. Each file must have the sha256 the cast recipe
 * (content/snowmoon/recipes/images/cast.json) records, or it is skipped. Needs the production storage variables
 * (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PRIVATE_BUCKET, R2_IMAGES_PUBLIC_URL).
 *
 *   npx tsx --conditions=react-server --env-file=<production env> scripts/upload-cast-sheets.ts [folder]   (default images-out/cast)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { missingStorage, putPrivate } from '../src/lib/images/store';
import { castSheets, sheetKey } from '../src/lib/illustration-check/sheets';

async function main() {
  const dir = path.resolve(process.argv[2] ?? 'images-out/cast');
  const missing = missingStorage();
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  let put = 0;
  for (const s of castSheets().values()) {
    const f = path.join(dir, s.file);
    if (!existsSync(f)) {
      console.log(`skip ${s.slug}: no ${s.file} in ${dir}`);
      continue;
    }
    const bytes = readFileSync(f);
    if (createHash('sha256').update(bytes).digest('hex') !== s.sha256) {
      console.log(`skip ${s.slug}: ${s.file} is not the file the cast recipe records`);
      continue;
    }
    await putPrivate(sheetKey(s), bytes, 'image/png');
    put++;
    console.log(`put ${sheetKey(s)}`);
  }
  console.log(`${put} of ${castSheets().size} sheets in the private bucket`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
