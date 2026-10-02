/**
 * Load the committed chapter JSON into `works` and `text_blocks`. Safe to re-run.
 *
 *   npm run seed:text               write to Supabase (needs .env.local)
 *   npm run seed:text -- --dry-run  print what would be written, no credentials needed
 *
 * Upserts on (work_id, chapter, idx). `read_aloud` is never touched here, so
 * hand-written overrides survive a re-seed. Rows past the end of a chapter
 * (if the source ever shrinks) are deleted.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Block } from './lib/parse-chapter';

const ROOT = path.resolve(import.meta.dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const WORK = {
  id: 'snowmoon',
  title: 'Snowmoon',
  license: 'GPL-3.0',
  source_url: 'https://vitalik.eth.limo/snowmoon/',
};
const CHAPTERS = 32;

async function main() {
  const chapters = [];
  for (let n = 1; n <= CHAPTERS; n++) {
    const doc = JSON.parse(await readFile(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8'));
    chapters.push({ n, blocks: doc.blocks as Block[] });
  }
  const total = chapters.reduce((s, c) => s + c.blocks.length, 0);

  if (dryRun) {
    console.log(`dry run: would upsert works(${WORK.id}) and ${total} text_blocks across ${CHAPTERS} chapters`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const w = await db.from('works').upsert(WORK, { onConflict: 'id' });
  if (w.error) throw w.error;

  for (const { n, blocks } of chapters) {
    const rows = blocks.map((b) => ({
      work_id: WORK.id,
      chapter: n,
      idx: b.idx,
      kind: b.kind,
      content: b.content,
      content_hash: b.sha256,
      data: b.data ?? null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const r = await db.from('text_blocks').upsert(rows.slice(i, i + 500), { onConflict: 'work_id,chapter,idx' });
      if (r.error) throw r.error;
    }
    const d = await db.from('text_blocks').delete().eq('work_id', WORK.id).eq('chapter', n).gte('idx', blocks.length);
    if (d.error) throw d.error;
    console.log(`chapter ${n}: ${rows.length} blocks`);
  }
  console.log(`seeded ${total} text_blocks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
