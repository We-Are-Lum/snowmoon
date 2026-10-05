/**
 * Write the house narration into the database from the published index
 * (content/snowmoon/narration/<voice>/chapter-N.json, made by publish-narration).
 *
 *   npm run seed:narration                  every chapter that has no house narration yet
 *   npm run seed:narration -- --chapter=3   one chapter
 *   npm run seed:narration -- --dry-run     print what would be written
 *
 * One transaction per chapter: a recipe per spoken block (the exact text sent
 * to the model, the model and revision, voice, settings), the narration, its
 * segments, and the house_narrations row. recipes and narration_segments are
 * append-only, so a chapter that already has a house narration is skipped,
 * never rewritten. Connects as studio_writer.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { SYSTEM_FID, WORK_ID } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const VOICE = 'kokoro-af_heart';
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const only = arg('chapter');
  const chapters = only ? [Number(only)] : Array.from({ length: 32 }, (_, i) => i + 1);
  const url = process.env.STUDIO_DATABASE_URL;
  if (!dryRun && !url) throw new Error('STUDIO_DATABASE_URL is not set (see README, "Database")');
  const sql = dryRun ? null : postgres(url!, { prepare: false, max: 1 });

  try {
    for (const n of chapters) {
      const index = JSON.parse(await readFile(path.join(ROOT, 'content/snowmoon/narration', VOICE, `chapter-${n}.json`), 'utf8'));
      const segs = index.segments as {
        idx: number;
        url: string;
        sha256: string;
        duration_ms: number;
        text: string;
        source_wav_sha256: string;
        block_sha256: string;
        read_aloud_status?: string;
      }[];
      if (dryRun || !sql) {
        console.log(`chapter ${n}: would write ${segs.length} recipes, 1 narration, ${segs.length} segments, 1 house row`);
        continue;
      }
      const [have] = await sql`select narration_id from studio.house_narrations where work_id = ${WORK_ID} and chapter = ${n}`;
      if (have) {
        console.log(`chapter ${n}: already has a house narration, skipped`);
        continue;
      }
      const narrationId = randomUUID();
      const recipeAssist = JSON.parse(await readFile(path.join(ROOT, index.recipe), 'utf8')).assist ?? null;
      const recipes = segs.map((s) => ({
        id: randomUUID(),
        source: 'in_app',
        provider: 'local',
        model: index.model.repo,
        model_version: index.model.revision,
        prompt: s.text,
        params: sql.json({
          voice: index.voice_detail,
          settings: index.settings,
          model: index.model,
          block_encoding: index.block_encoding,
          block_sha256: s.block_sha256,
          source_wav_sha256: s.source_wav_sha256,
          recipe_file: index.recipe,
          ...(s.read_aloud_status ? { read_aloud_status: s.read_aloud_status } : {}),
        }),
        cost_usd: 0,
        // Which inputs a model drafted (principle 3), from the committed recipe.
        assist: recipeAssist ? sql.json(recipeAssist) : null,
        created_by_fid: SYSTEM_FID,
      }));
      await sql.begin(async (tx) => {
        await tx`insert into studio.recipes ${tx(recipes)}`;
        await tx`insert into studio.narrations ${tx({
          id: narrationId,
          work_id: WORK_ID,
          chapter: n,
          label: index.label,
          created_by_fid: SYSTEM_FID,
        })}`;
        await tx`insert into studio.narration_segments ${tx(
          segs.map((s, i) => ({
            narration_id: narrationId,
            idx: s.idx,
            asset_url: s.url,
            asset_sha256: s.sha256,
            duration_ms: s.duration_ms,
            recipe_id: recipes[i].id,
          })),
        )}`;
        await tx`insert into studio.house_narrations ${tx({ work_id: WORK_ID, chapter: n, narration_id: narrationId })}`;
      });
      console.log(`chapter ${n}: wrote ${segs.length} segments`);
    }
  } finally {
    await sql?.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
