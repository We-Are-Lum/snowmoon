/**
 * The search check (owner, 2026-10-24): why the answering block of a question doesn't reach the model, and
 * which changes to retrieval fix that, measured on all 50 questions so regressions show. Free: PGlite with
 * the book, the search words already saved by the Claude trial (no model calls), and optional embedding
 * ranks made locally (scripts/eval-embed.py).
 *
 *   QUESTIONS=fresh-questions.json SEARCH_WORDS=…/search-words.json DENSE=…/dense-bge-small.json \
 *     npx tsx scripts/eval-search.ts OUT.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { expandAliases, retrieve, type RetrieveOptions } from '../src/lib/chat/retrieve';
import { WORK_ID } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIMIT = 15;
interface Q { id: string; question: string; gold: string[] }
const questions = JSON.parse(await readFile(path.join(ROOT, 'docs/proposals/chat-eval', process.env.QUESTIONS ?? 'fresh-questions.json'), 'utf8')) as Q[];
const savedWords: Record<string, string> = process.env.SEARCH_WORDS ? JSON.parse(await readFile(process.env.SEARCH_WORDS, 'utf8')) : {};
const dense = process.env.DENSE ? (JSON.parse(await readFile(process.env.DENSE, 'utf8')) as { model: string; ranks: Record<string, string[]> }) : null;
/** The search words as the app adds them: letters, digits and hyphens, at most 20. */
const words = (q: Q) => ((savedWords[q.question] ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).slice(0, 20).join(' ');

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0002_v5.sql', '0003_likes.sql', '0004_private_ratings_and_likes.sql', '0005_public_prompts_and_consent.sql', '0006_chat.sql', '0007_chat_costs_without_person.sql'])
  await pg.exec(await readFile(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon', 'Snowmoon', 'GPL-3.0', 'x'); set role studio_writer;`);
const server = new PGLiteSocketServer({ db: pg, port: 54335, host: '127.0.0.1' });
await server.start();
const URL = 'postgres://studio_writer@127.0.0.1:54335/postgres';
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: URL } });
const sql = postgres(URL, { prepare: false, max: 1 });
await sql`set role studio_writer`;

/** The BM25 ranking of src/lib/chat/retrieve.ts (SCORED), copied here to read a block's rank. */
const SCORED = `
with terms as (select distinct quote_literal(lex)::tsquery as q from unnest(tsvector_to_array(to_tsvector('english', $1))) as lex),
stats as (select count(*)::float8 as n, avg(length(search))::float8 as avglen from studio.text_blocks where work_id = $2 and kind = any($4)),
idf as (select t.q, ln(1 + (s.n - c.n + 0.5) / (c.n + 0.5)) as w from terms t cross join stats s
  cross join lateral (select count(*)::float8 as n from studio.text_blocks b where b.work_id = $2 and b.kind = any($4) and b.search @@ t.q) c where c.n > 0),
cand as (select b.chapter, b.idx, b.search from studio.text_blocks b where b.work_id = $2 and b.kind = any($4)
  and b.search @@ (select coalesce(string_agg(q::text, ' | ')::tsquery, 'nomatch_nomatch'::tsquery) from idf)),
scored as (select c.chapter, c.idx, sum(i.w * 2.2 / (1 + 1.2 * (0.25 + 0.75 * greatest(length(c.search), 1) / (select avglen from stats)))) as score
  from cand c join idf i on c.search @@ i.q group by c.chapter, c.idx)`;
const KINDS = ['paragraph', 'quote', 'screen'];
async function ranking(query: string): Promise<string[]> {
  const rows = (await sql.unsafe(`${SCORED} select chapter, idx from scored where chapter <= $3 order by score desc, chapter, idx limit 400`, [expandAliases(query), WORK_ID, LIMIT, KINDS])) as unknown as { chapter: number; idx: number }[];
  return rows.map((r) => `c${r.chapter}-b${r.idx}`);
}
const lexemes = async (s: string) => ((await sql`select tsvector_to_array(to_tsvector('english', ${s})) as l`)[0].l as string[]);

/** Reciprocal-rank fusion of id lists (k = 60). */
const fuse = (lists: string[][]) => {
  const m = new Map<string, number>();
  for (const l of lists) l.forEach((id, r) => m.set(id, (m.get(id) ?? 0) + 1 / (60 + r)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
};

type Variant = { name: string; note: string; run: (q: Q) => Promise<string[]> };
const send = (q: Q, opts: RetrieveOptions = {}, query = `${q.question} ${words(q)}`) => retrieve(sql, query, LIMIT, [], opts).then((r) => r.passages.map((p) => p.id));
const variants: Variant[] = [
  { name: 'live', note: 'question + search words, 12 hits, 2 blocks either side (today)', run: (q) => send(q) },
  { name: 'hits-16', note: '16 hits, ±2', run: (q) => send(q, { hits: 16 }) },
  { name: 'hits-20', note: '20 hits, ±2', run: (q) => send(q, { hits: 20 }) },
  { name: 'hits-24', note: '24 hits, ±2', run: (q) => send(q, { hits: 24 }) },
  { name: 'wide-3', note: '12 hits, ±3', run: (q) => send(q, { before: 3, after: 3 }) },
  { name: 'after-4', note: '12 hits, 2 before and 4 after', run: (q) => send(q, { before: 2, after: 4 }) },
  { name: 'question-only', note: 'the question alone, no search words, 12 hits ±2', run: (q) => send(q, {}, q.question) },
  {
    name: 'split-fused', note: 'question alone and question + words searched separately, fused, 12 hits ±2',
    run: async (q) => send(q, { dense: fuse([await ranking(q.question), await ranking(`${q.question} ${words(q)}`)]) }),
  },
];
if (dense) {
  variants.push(
    { name: 'bge', note: `+ ${dense.model} (local), fused, 12 hits ±2`, run: (q) => send(q, { dense: dense.ranks[q.id] }) },
    { name: 'bge-16', note: `+ ${dense.model}, fused, 16 hits ±2`, run: (q) => send(q, { dense: dense.ranks[q.id], hits: 16 }) },
    { name: 'bge-after-4', note: `+ ${dense.model}, fused, 12 hits, 2 before 4 after`, run: (q) => send(q, { dense: dense.ranks[q.id], before: 2, after: 4 }) },
    { name: 'bge-question-only', note: `the question alone (no search words) + ${dense.model}, fused, 12 hits ±2`, run: (q) => send(q, { dense: dense.ranks[q.id] }, q.question) },
    { name: 'bge-question-only-16', note: `the question alone + ${dense.model}, fused, 16 hits ±2`, run: (q) => send(q, { dense: dense.ranks[q.id], hits: 16 }, q.question) },
    {
      name: 'bge-split', note: `question alone, question + words, and ${dense.model}, fused, 12 hits ±2`,
      run: async (q) => send(q, { dense: fuse([await ranking(q.question), dense.ranks[q.id]]) }),
    },
    {
      name: 'bge-split-16', note: `question alone, question + words, and ${dense.model}, fused, 16 hits ±2`,
      run: async (q) => send(q, { dense: fuse([await ranking(q.question), dense.ranks[q.id]]), hits: 16 }),
    },
    { name: 'bge-16-after-4', note: `+ ${dense.model}, fused, 16 hits, 2 before 4 after`, run: (q) => send(q, { dense: dense.ranks[q.id], hits: 16, before: 2, after: 4 }) },
  );
}

const textOf = new Map<string, string>();
for (let n = 1; n <= LIMIT; n++) {
  const doc = JSON.parse(await readFile(path.join(ROOT, `content/snowmoon/text/chapter-${n}.json`), 'utf8')) as { blocks: { idx: number; content: string }[] };
  for (const b of doc.blocks) textOf.set(`c${n}-b${b.idx}`, b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

try {
  const table: Record<string, unknown>[] = [];
  const perQuestion: Record<string, Record<string, boolean>> = {};
  for (const v of variants) {
    let hit = 0, best = 0, blocks = 0, chars = 0;
    for (const q of questions) {
      const sent = await v.run(q);
      const h = q.gold.some((g) => sent.includes(g));
      (perQuestion[q.id] ??= {})[v.name] = h;
      hit += h ? 1 : 0;
      best += sent.includes(q.gold[0]) ? 1 : 0;
      blocks += sent.length;
      chars += sent.reduce((n, id) => n + (textOf.get(id)?.length ?? 0), 0);
    }
    const row = { variant: v.name, note: v.note, hit, best, blocks_avg: Math.round(blocks / questions.length), prompt_tokens_avg: Math.round(chars / questions.length / 4) };
    table.push(row);
    console.log(`${v.name.padEnd(16)} ${hit}/${questions.length} (best block ${best}); ~${row.blocks_avg} blocks, ~${row.prompt_tokens_avg} tokens of passages — ${v.note}`);
  }

  // Each miss of the live search: where the answering block ranks, how near the nearest hit is, which words they share.
  const misses = [];
  for (const q of questions.filter((x) => !perQuestion[x.id].live)) {
    const query = `${q.question} ${words(q)}`;
    const rank = await ranking(query);
    const qRank = await ranking(q.question);
    const top = rank.slice(0, 12);
    const goldInfo = [];
    for (const g of q.gold) {
      const [c, i] = g.slice(1).split('-b').map(Number);
      const near = top.filter((h) => h.startsWith(`c${c}-b`)).map((h) => Number(h.split('-b')[1]) - i).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
      const ql = new Set(await lexemes(expandAliases(query)));
      goldInfo.push({
        id: g,
        text: textOf.get(g),
        rank_with_words: rank.indexOf(g) + 1 || null,
        rank_question_only: qRank.indexOf(g) + 1 || null,
        rank_bge: dense ? dense.ranks[q.id].indexOf(g) + 1 || null : undefined,
        nearest_hit_offset: near ?? null,
        shared_terms: (await lexemes(textOf.get(g) ?? '')).filter((l) => ql.has(l)),
      });
    }
    misses.push({ id: q.id, question: q.question, words: words(q), fixed_by: Object.entries(perQuestion[q.id]).filter(([, h]) => h).map(([k]) => k), gold: goldInfo });
  }
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify({ questions: questions.length, limit: LIMIT, dense: dense?.model ?? null, variants: table, per_question: perQuestion, misses }, null, 1) + '\n');
} finally {
  await sql.end();
  await server.stop();
}
