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
  const lettering = JSON.parse(await readFile(path.join(ROOT, 'content/snowmoon/recipes/images/lettering.json'), 'utf8').catch(() => '{"images":[]}'));
  const letteringFor = new Map<string, { input: { sha256: string }; output: { sha256: string } }>(
    lettering.images.map((r: { id: string; input: { sha256: string }; output: { sha256: string } }) => [r.id, r]),
  );

  /** Convert one PNG to JPEG and upload it under a key carrying its sha256. */
  async function publish(png: string, name: string, chapter: number) {
    const jpg = path.join(webDir, `${name}.jpg`);
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-q:v', '3', jpg]);
    const sha = await sha256File(jpg);
    const key = `images/seed/c${chapter}/${name}-${sha.slice(0, 12)}.jpg`;
    let url = `${process.env.R2_PUBLIC_URL ?? '<R2_PUBLIC_URL>'}/${key}`;
    if (store) {
      const r = await store.put(key, jpg, 'image/jpeg');
      url = r.url;
      if (r.uploaded) uploaded++;
    }
    return { url, sha256: sha, png_sha256: await sha256File(png) };
  }

  const entries = await pool(jobs, 6, async (j) => {
    const clean = path.join(ROOT, 'images-out', `chapter-${j.chapter}`, `${j.id}.png`);
    const base = {
      chapter: j.chapter,
      idx: j.idx,
      id: j.id,
      setting: j.setting,
      location: j.location,
      characters: j.characters,
      width: 1024,
      height: 576,
      recipe: `content/snowmoon/recipes/images/chapter-${j.chapter}.json`,
    };
    if (!j.lettering) {
      const p = await publish(clean, j.id, j.chapter);
      return { ...base, url: p.url, sha256: p.sha256, png_sha256: p.png_sha256 };
    }
    // Lettered: publish both, so a remix can start from the clean render.
    const rec = letteringFor.get(j.id);
    const lettered = clean.replace(/\.png$/, '.lettered.png');
    if (!rec || rec.input.sha256 !== (await sha256File(clean)) || rec.output.sha256 !== (await sha256File(lettered))) {
      throw new Error(`${j.id}: lettering.json does not match the files; run scripts/letter-images.py`);
    }
    const c = await publish(clean, j.id, j.chapter);
    const l = await publish(lettered, `${j.id}.lettered`, j.chapter);
    return {
      ...base,
      // What the reader shows.
      url: l.url,
      sha256: l.sha256,
      png_sha256: l.png_sha256,
      clean: { ...c, note: 'The render without lettering: the starting point for a remix.' },
      lettered: { ...l, record: 'content/snowmoon/recipes/images/lettering.json' },
      lettering: j.lettering,
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
