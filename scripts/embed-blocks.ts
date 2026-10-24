/**
 * The book's vectors for the reading assistant's embedding search (studio.block_vectors,
 * NEXT_chat_block_vectors.sql). Computed on this machine with the same model and code the server uses for
 * questions (src/lib/chat/embed.ts), never by a service.
 *
 *   CHAT_EMBED_DIR=~/snowmoon-refs/chat-embed npx tsx scripts/embed-blocks.ts            compute → private/chat-vectors/<model>.json
 *   STUDIO_DATABASE_URL=… npx tsx scripts/embed-blocks.ts --load                          load that file into the database (upsert)
 *
 * Each readable block (paragraph, quote, screen) is embedded with the two readable blocks before it, as
 * measured in docs/proposals/chat-eval/search/. A block whose content_hash has changed since is re-embedded the
 * next time this runs (the file records each block's hash).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { EMBED, embedTexts, windowText } from '../src/lib/chat/embed';
import { WORK_ID } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
export const VECTORS_FILE = path.join(ROOT, 'private/chat-vectors', `${EMBED.id}.json`);
const KINDS = new Set(['paragraph', 'quote', 'screen']);
const CHAPTERS = 32;

export interface VectorRow { chapter: number; idx: number; content_hash: string; v: number[] }

/** Load the computed vectors into studio.block_vectors (as studio_writer), replacing this model's rows. */
export async function loadVectors(sql: postgres.Sql, file = VECTORS_FILE): Promise<number> {
  const data = JSON.parse(await readFile(file, 'utf8')) as { model: string; rows: VectorRow[] };
  if (data.model !== EMBED.id) throw new Error(`${file} holds ${data.model}, not ${EMBED.id}`);
  for (let i = 0; i < data.rows.length; i += 200) {
    const batch = data.rows.slice(i, i + 200).map((r) => ({ work_id: WORK_ID, chapter: r.chapter, idx: r.idx, model: data.model, content_hash: r.content_hash, embedding: `[${r.v.join(',')}]` }));
    await sql`insert into studio.block_vectors ${sql(batch, 'work_id', 'chapter', 'idx', 'model', 'content_hash', 'embedding')}
              on conflict (work_id, model, chapter, idx) do update set content_hash = excluded.content_hash, embedding = excluded.embedding`;
  }
  return data.rows.length;
}

async function compute() {
  const old = existsSync(VECTORS_FILE) ? (JSON.parse(await readFile(VECTORS_FILE, 'utf8')) as { rows: VectorRow[] }).rows : [];
  const have = new Map(old.map((r) => [`${r.chapter}-${r.idx}-${r.content_hash}`, r]));
  const todo: { chapter: number; idx: number; content_hash: string; text: string }[] = [];
  const rows: VectorRow[] = [];
  for (let n = 1; n <= CHAPTERS; n++) {
    const doc = JSON.parse(await readFile(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8')) as { blocks: { idx: number; kind: string; content: string; sha256: string }[] };
    const plain = doc.blocks.map((b) => (KINDS.has(b.kind) ? b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''));
    doc.blocks.forEach((b, k) => {
      if (!KINDS.has(b.kind)) return;
      const kept = have.get(`${n}-${b.idx}-${b.sha256}`);
      if (kept) rows.push(kept);
      else todo.push({ chapter: n, idx: b.idx, content_hash: b.sha256, text: windowText(plain, k) });
    });
  }
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += 32) {
    const batch = todo.slice(i, i + 32);
    const vs = await embedTexts(batch.map((b) => b.text));
    batch.forEach((b, j) => rows.push({ chapter: b.chapter, idx: b.idx, content_hash: b.content_hash, v: vs[j].map((x) => Math.round(x * 1e6) / 1e6) }));
  }
  rows.sort((a, b) => a.chapter - b.chapter || a.idx - b.idx);
  await mkdir(path.dirname(VECTORS_FILE), { recursive: true });
  await writeFile(VECTORS_FILE, JSON.stringify({ model: EMBED.id, source: EMBED.source, files: EMBED.files, computed: new Date().toISOString(), rows }) + '\n');
  console.log(`${rows.length} blocks (${todo.length} embedded now, in ${((Date.now() - t0) / 1000).toFixed(1)} s) → ${VECTORS_FILE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--load')) {
    const url = process.env.STUDIO_DATABASE_URL;
    if (!url) throw new Error('STUDIO_DATABASE_URL is not set');
    const sql = postgres(url, { prepare: false, max: 1 });
    try {
      console.log(`loaded ${await loadVectors(sql)} vectors`);
    } finally {
      await sql.end();
    }
  } else await compute();
}
