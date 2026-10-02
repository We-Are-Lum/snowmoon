/**
 * Load the committed chapter JSON into studio.works and studio.text_blocks. Safe to re-run.
 *
 *   npm run seed:text               write to the database (needs STUDIO_DATABASE_URL)
 *   npm run seed:text -- --dry-run  print what would be written, no credentials needed
 *
 * Connects as `studio_writer`, the role that can only touch the `studio` schema
 * (migration 0001). Upserts on (work_id, chapter, idx). `read_aloud` is never
 * touched here, so hand-written overrides survive a re-seed. Rows past the end
 * of a chapter (if the source ever shrinks) are deleted. One transaction.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
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
  const chapters: { n: number; blocks: Block[] }[] = [];
  for (let n = 1; n <= CHAPTERS; n++) {
    const doc = JSON.parse(await readFile(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8'));
    chapters.push({ n, blocks: doc.blocks });
  }
  const total = chapters.reduce((s, c) => s + c.blocks.length, 0);

  if (dryRun) {
    console.log(`dry run: would upsert studio.works(${WORK.id}) and ${total} studio.text_blocks across ${CHAPTERS} chapters`);
    return;
  }

  const url = process.env.STUDIO_DATABASE_URL;
  if (!url) throw new Error('Set STUDIO_DATABASE_URL (the studio_writer connection string), e.g. in .env.local');
  // Transaction-mode poolers do not support prepared statements.
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into studio.works ${tx(WORK)}
        on conflict (id) do update set title = excluded.title, license = excluded.license, source_url = excluded.source_url`;

      for (const { n, blocks } of chapters) {
        const rows = blocks.map((b) => ({
          work_id: WORK.id,
          chapter: n,
          idx: b.idx,
          kind: b.kind,
          content: b.content,
          content_hash: b.sha256,
          data: b.data ? tx.json(b.data as unknown as postgres.JSONValue) : null,
        }));
        for (let i = 0; i < rows.length; i += 500) {
          await tx`
            insert into studio.text_blocks ${tx(rows.slice(i, i + 500))}
            on conflict (work_id, chapter, idx) do update set
              kind = excluded.kind, content = excluded.content,
              content_hash = excluded.content_hash, data = excluded.data`;
        }
        await tx`delete from studio.text_blocks where work_id = ${WORK.id} and chapter = ${n} and idx >= ${blocks.length}`;
        console.log(`chapter ${n}: ${rows.length} blocks`);
      }
    });
    console.log(`seeded ${total} text_blocks`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
