/**
 * Publish the project's seeded key-moment images to R2 and write a public index.
 *
 *   npm run publish:images             convert, upload what is missing, write the index
 *   npm run publish:images -- --dry-run
 *
 * Reads the job files (content/snowmoon/illustrations/chapter-N.json) and the
 * local renders (images-out/chapter-N/<id>.png), converts each to JPEG for the
 * web, and uploads it under a key carrying its sha256. Images listed in
 * EXCLUDED are left out (review found them still showing cloned characters).
 *
 * A job with `lettering` is published from images-out/chapter-N/<id>.lettered.png,
 * which scripts/letter-images.py draws in code from the job's lettering items.
 *
 * Output: content/snowmoon/illustrations/published.json, committed. Until
 * Milestone 4 puts images in the database as elements, the player reads this
 * index; each entry points back to its recipe in content/snowmoon/recipes/images/.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pool, r2, sha256File } from './lib/r2';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const EXCLUDED = new Map([
  ['c26-b132-drone-escape', 'the same man appears twice, even after a rewrite with one rider'],
  ['c27-b071-tea-robot', 'the robot takes on the reference man\'s face and clothes'],
]);

async function main() {
  const store = dryRun ? null : r2();
  const webDir = path.join(ROOT, 'images-out', 'web');
  await mkdir(webDir, { recursive: true });
  const jobs: {
    chapter: number;
    idx: number;
    id: string;
    setting: string | null;
    location: string | null;
    characters: string[];
    lettering: unknown[] | null;
  }[] = [];
  for (let n = 1; n <= 32; n++) {
    const spec = JSON.parse(await readFile(path.join(ROOT, `content/snowmoon/illustrations/chapter-${n}.json`), 'utf8'));
    for (const j of spec.jobs) {
      if (EXCLUDED.has(j.id)) continue;
      jobs.push({
        chapter: n,
        idx: j.idx,
        id: j.id,
        setting: j.setting ?? null,
        location: j.location ?? null,
        characters: (j.characters ?? []).map((c: string) => path.basename(c, '.json')),
        lettering: j.lettering ?? null,
      });
    }
  }

  let uploaded = 0;
  const entries = await pool(jobs, 6, async (j) => {
    const bare = path.join(ROOT, 'images-out', `chapter-${j.chapter}`, `${j.id}.png`);
    const png = j.lettering ? bare.replace(/\.png$/, '.lettered.png') : bare;
    const jpg = path.join(webDir, `${j.id}.jpg`);
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-q:v', '3', jpg]);
    const sha = await sha256File(jpg);
    const key = `images/seed/c${j.chapter}/${j.id}-${sha.slice(0, 12)}.jpg`;
    let url = `${process.env.R2_PUBLIC_URL ?? '<R2_PUBLIC_URL>'}/${key}`;
    if (store) {
      const r = await store.put(key, jpg, 'image/jpeg');
      url = r.url;
      if (r.uploaded) uploaded++;
    }
    return {
      ...j,
      url,
      sha256: sha,
      png_sha256: await sha256File(bare),
      ...(j.lettering ? { lettered_png_sha256: await sha256File(png), lettering: j.lettering } : {}),
      width: 1024,
      height: 576,
      recipe: `content/snowmoon/recipes/images/chapter-${j.chapter}.json`,
    };
  });

  const index = {
    about:
      'Key-moment images seeded by the project as a starting point, not canon. Rendered locally with FLUX.2 [klein] 4B; each entry links to its recipe. Shown by the player until Milestone 4 stores images as elements.',
    license: 'GPL-3.0',
    excluded: Object.fromEntries(EXCLUDED),
    images: entries.sort((a, b) => a.chapter - b.chapter || a.idx - b.idx),
  };
  if (!dryRun) await writeFile(path.join(ROOT, 'content/snowmoon/illustrations/published.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`${entries.length} images, ${uploaded} uploaded${dryRun ? ' (dry run)' : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
