/**
 * Publish the house narration to R2 and write a public index per chapter.
 *
 *   npm run publish:narration                upload everything not yet uploaded
 *   npm run publish:narration -- --chapter=3 one chapter
 *   npm run publish:narration -- --dry-run   list what would be uploaded
 *
 * Inputs: the recipes committed by scripts/narrate.py (content/snowmoon/recipes/
 * narration/chapter-N.json) and the local audio in narration-out/ (per-block
 * WAVs encoded to AAC in narration-out/chapter-N/aac/, plus the stitched
 * chapter .m4a). Every uploaded key carries the file's sha256, so re-runs skip
 * what is already there and objects are cached forever.
 *
 * Output: content/snowmoon/narration/<voice>/chapter-N.json, committed. It lists
 * each block's public URL, sha256, duration, and start time in the stitched
 * chapter file. scripts/seed-narration.ts writes the database rows from it, and
 * the player reads it.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, r2, sha256File } from './lib/r2';

const ROOT = path.resolve(import.meta.dirname, '..');
const RECIPES = path.join(ROOT, 'content/snowmoon/recipes/narration');
const AUDIO = path.join(ROOT, 'narration-out');
const VOICE = 'kokoro-af_heart';
const OUT = path.join(ROOT, 'content/snowmoon/narration', VOICE);
// Per-block files are re-encoded from the generated WAVs for the web.
const BLOCK_ENCODING = { codec: 'aac', bitrate: '64k', channels: 1, container: 'm4a', tool: 'ffmpeg' };

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const dryRun = process.argv.includes('--dry-run');

interface RecipeBlock {
  idx: number;
  kind: string;
  block_sha256: string;
  file?: string | null;
  sha256?: string;
  duration_ms?: number;
  start_ms?: number;
  silence_ms?: number;
  text?: string;
  read_aloud_status?: string;
}

async function main() {
  const only = arg('chapter');
  const chapters = only ? [Number(only)] : Array.from({ length: 32 }, (_, i) => i + 1);
  const store = dryRun ? null : r2();
  await mkdir(OUT, { recursive: true });
  let uploaded = 0;
  let skipped = 0;

  for (const n of chapters) {
    const recipe = JSON.parse(await readFile(path.join(RECIPES, `chapter-${n}.json`), 'utf8'));
    const blocks: RecipeBlock[] = recipe.blocks;
    const prefix = `narration/${VOICE}/c${n}`;

    const segments = await pool(
      blocks.filter((b) => b.file),
      8,
      async (b) => {
        const file = path.join(AUDIO, `chapter-${n}`, 'aac', `c${n}-b${String(b.idx).padStart(3, '0')}.m4a`);
        const sha = await sha256File(file);
        const key = `${prefix}/b${String(b.idx).padStart(3, '0')}-${sha.slice(0, 12)}.m4a`;
        let url = `${process.env.R2_PUBLIC_URL ?? '<R2_PUBLIC_URL>'}/${key}`;
        if (store) {
          const r = await store.put(key, file, 'audio/mp4');
          url = r.url;
          r.uploaded ? uploaded++ : skipped++;
        }
        return {
          idx: b.idx,
          kind: b.kind,
          block_sha256: b.block_sha256,
          url,
          sha256: sha,
          bytes: (await stat(file)).size,
          duration_ms: b.duration_ms!,
          start_ms: b.start_ms!,
          source_wav_sha256: b.sha256!,
          text: b.text!,
          ...(b.read_aloud_status ? { read_aloud_status: b.read_aloud_status } : {}),
        };
      },
    );

    const chapterFile = path.join(AUDIO, `chapter-${n}`, recipe.stitched.m4a);
    const chapterSha = await sha256File(chapterFile);
    if (chapterSha !== recipe.stitched.m4a_sha256) throw new Error(`chapter ${n}: stitched m4a does not match its recipe`);
    const chapterKey = `narration/${VOICE}/chapter-${n}-${chapterSha.slice(0, 12)}.m4a`;
    let chapterUrl = `${process.env.R2_PUBLIC_URL ?? '<R2_PUBLIC_URL>'}/${chapterKey}`;
    if (store) {
      const r = await store.put(chapterKey, chapterFile, 'audio/mp4');
      chapterUrl = r.url;
      r.uploaded ? uploaded++ : skipped++;
    }

    const index = {
      work_id: recipe.work_id,
      chapter: n,
      voice: VOICE,
      label: 'Synthetic narration · Kokoro-82M, stock voice af_heart',
      license: 'GPL-3.0',
      recipe: `content/snowmoon/recipes/narration/chapter-${n}.json`,
      model: recipe.model,
      voice_detail: recipe.voice,
      settings: recipe.settings,
      block_encoding: BLOCK_ENCODING,
      chapter_file: {
        url: chapterUrl,
        sha256: chapterSha,
        bytes: (await stat(chapterFile)).size,
        duration_ms: recipe.total_duration_ms,
      },
      breaks: blocks.filter((b) => b.kind === 'break').map((b) => ({ idx: b.idx, start_ms: b.start_ms, silence_ms: b.silence_ms })),
      segments: segments.sort((a, b) => a.idx - b.idx),
    };
    if (!dryRun) await writeFile(path.join(OUT, `chapter-${n}.json`), JSON.stringify(index, null, 2) + '\n');
    console.log(`chapter ${n}: ${segments.length} segments, ${Math.round(recipe.total_duration_ms / 60000)} min`);
  }
  console.log(dryRun ? 'dry run: nothing uploaded' : `uploaded ${uploaded}, already there ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
