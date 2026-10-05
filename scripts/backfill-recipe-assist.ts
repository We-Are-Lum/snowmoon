/**
 * Fill studio.recipe_assist (migration 0005) for narration recipes written
 * before recipes.assist was filled in. The assist record comes from the
 * committed narration recipe each database recipe names (params.recipe_file),
 * so the database says the same thing as the repo (principle 3).
 *
 *   npx tsx --env-file=.env.local scripts/backfill-recipe-assist.ts           dry run: counts only
 *   npx tsx --env-file=.env.local scripts/backfill-recipe-assist.ts --write   insert, as studio_writer
 *
 * Skips recipes that already have assist (column or side table). Append-only:
 * a row, once written, is never changed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { SYSTEM_FID } from '../src/lib/config';

const WRITE = process.argv.includes('--write');
const url = process.env.STUDIO_DATABASE_URL;
if (!url) throw new Error('STUDIO_DATABASE_URL is not set');
const sql = postgres(url, { prepare: false, max: 1 });

const rows = await sql<{ id: string; recipe_file: string | null }[]>`
  select r.id, r.params->>'recipe_file' as recipe_file
  from studio.recipes r
  join studio.narration_segments s on s.recipe_id = r.id
  where r.assist is null
    and not exists (select 1 from studio.recipe_assist a where a.recipe_id = r.id)`;

const files = new Map<string, unknown>();
const assistFor = (rel: string) => {
  if (!files.has(rel)) files.set(rel, JSON.parse(readFileSync(path.join(process.cwd(), rel), 'utf8')).assist ?? null);
  return files.get(rel);
};
const todo = rows.flatMap((r) => {
  const assist = r.recipe_file ? assistFor(r.recipe_file) : null;
  return assist ? [{ recipe_id: r.id, assist: sql.json(assist as never), source: r.recipe_file!, recorded_by_fid: SYSTEM_FID }] : [];
});
console.log(`${rows.length} narration recipes without assist; ${todo.length} have a committed record to copy`);
if (rows.length !== todo.length) console.log(`${rows.length - todo.length} name no recipe file with assist; left as they are`);
if (WRITE && todo.length) {
  await sql.begin(async (tx) => {
    for (let i = 0; i < todo.length; i += 500) await tx`insert into studio.recipe_assist ${tx(todo.slice(i, i + 500))}`;
  });
  console.log(`wrote ${todo.length} rows`);
} else if (!WRITE) console.log('dry run: pass --write to insert');
await sql.end();
