import type postgres from 'postgres';
import aliases from '../../../config/aliases.json';
import { blockFacts } from '../reading';
import { CHAT, WORK_ID } from '../config';
import { blockIdOk, chapterOf } from './sanitize';

/**
 * Retrieval for the reading assistant: Postgres full-text search over
 * studio.text_blocks (migration 0006), never past the chapter limit. No
 * embedding model (docs/proposals/chat.md, section 2).
 */
export interface Passage {
  id: string;
  chapter: number;
  idx: number;
  kind: string;
  content: string;
}

export interface Retrieved {
  passages: Passage[];
  /** True when later chapters match the question better than the allowed ones. */
  heldBack: boolean;
}

const SEARCH_KINDS = ['paragraph', 'quote', 'screen'];

/**
 * BM25-style scoring in Postgres. Each word of the question (stemmed) counts by how rare
 * it is in the book, so "Jahen" or "hedge" outweighs "Zei", who is in 400 blocks; shorter
 * blocks score a little higher for the same words. Ranks only: plain full-text ranking
 * (ts_rank_cd) ignores rarity, and put the answering block in front of the model for 18
 * of 50 test questions (docs/proposals/chat-eval/).
 * $1 question, $2 work, $4 block kinds.
 */
/** The old ranking (ts_rank_cd over an OR of the question's words), kept for comparison. */
const RANKED = `
with scored as (
  select chapter, idx, kind, content, ts_rank_cd(search, q) as score
    from studio.text_blocks,
         to_tsquery('english', coalesce(nullif(array_to_string(tsvector_to_array(to_tsvector('english', $1)), ' | '), ''), 'nomatch_nomatch')) q
   where work_id = $2 and kind = any($4) and search @@ q
)`;

const SCORED = `
with terms as (
  select distinct quote_literal(lex)::tsquery as q
    from unnest(tsvector_to_array(to_tsvector('english', $1))) as lex
), stats as (
  select count(*)::float8 as n, avg(length(search))::float8 as avglen
    from studio.text_blocks where work_id = $2 and kind = any($4)
), idf as (
  select t.q, ln(1 + (s.n - c.n + 0.5) / (c.n + 0.5)) as w
    from terms t cross join stats s
    cross join lateral (
      select count(*)::float8 as n from studio.text_blocks b where b.work_id = $2 and b.kind = any($4) and b.search @@ t.q
    ) c
   where c.n > 0
), cand as (
  select b.chapter, b.idx, b.kind, b.content, b.search
    from studio.text_blocks b
   where b.work_id = $2 and b.kind = any($4)
     and b.search @@ (select coalesce(string_agg(q::text, ' | ')::tsquery, 'nomatch_nomatch'::tsquery) from idf)
), scored as (
  select c.chapter, c.idx, c.kind, c.content,
         sum(i.w * 2.2 / (1 + 1.2 * (0.25 + 0.75 * greatest(length(c.search), 1) / (select avglen from stats)))) as score
    from cand c join idf i on c.search @@ i.q
   group by c.chapter, c.idx, c.kind, c.content
)`;

/**
 * The question plus the other forms of any name it uses (config/aliases.json), so
 * "Bai" also searches "Jahen" and "Veridian" also searches "Veridia".
 */
export function expandAliases(question: string): string {
  const extra = new Set<string>();
  for (const g of aliases.groups) {
    const hit = g.match.some((form) => new RegExp(`(^|[^\\p{L}])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, form[0] === form[0].toLowerCase() ? 'iu' : 'u').test(question));
    if (hit) for (const w of g.add) extra.add(w);
  }
  return extra.size ? `${question} ${[...extra].join(' ')}` : question;
}

/** How many hits, and how many blocks around each hit go with it. Tuned on the 50 questions. */
export interface RetrieveOptions {
  hits?: number;
  before?: number;
  after?: number;
  scoring?: 'bm25' | 'rank';
  /**
   * Block ids ranked by an embedding search, best first, already within the limit. When
   * given, they are fused with the word search by reciprocal rank (k = 60) before the top
   * hits are taken. Evaluation only for now (docs/proposals/chat-eval/); the app passes none.
   */
  dense?: string[];
}

export async function retrieve(
  sql: postgres.Sql,
  rawQuestion: string,
  limit: number,
  attached: string[] = [],
  opts: RetrieveOptions = {},
): Promise<Retrieved> {
  const { hits: nHits = CHAT.passages, before = CHAT.neighbours.before, after = CHAT.neighbours.after, scoring = 'bm25', dense } = opts;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('bad chapter limit');
  const question = expandAliases(rawQuestion);
  const base = scoring === 'bm25' ? SCORED : RANKED;
  const words = (await sql.unsafe(`${base} select chapter, idx, kind, content, score as rank from scored where chapter <= $3 order by score desc, chapter, idx limit $5`, [
    question, WORK_ID, limit, SEARCH_KINDS, dense ? 50 : nHits,
  ])) as unknown as (Passage & { rank: number })[];
  let hits: { chapter: number; idx: number; rank: number }[] = words;
  if (dense) {
    const fused = new Map<string, number>();
    const add = (id: string, r: number) => fused.set(id, (fused.get(id) ?? 0) + 1 / (60 + r));
    words.forEach((h, r) => add(`c${h.chapter}-b${h.idx}`, r));
    dense.filter((id) => blockIdOk(id) && chapterOf(id)! <= limit).slice(0, 50).forEach(add);
    hits = [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, nHits)
      .map(([id]) => ({ chapter: chapterOf(id)!, idx: Number(id.split('-b')[1]), rank: words[0]?.rank ?? 0 }));
  }

  // The same search past the limit: only its best score is used, never its text.
  const later = (await sql.unsafe(`${base} select max(score) as rank from scored where chapter > $3`, [question, WORK_ID, limit, SEARCH_KINDS])) as unknown as {
    rank: number | null;
  }[];
  const best = Number(hits[0]?.rank ?? 0);
  const laterBest = Number(later[0]?.rank ?? 0);
  const heldBack = laterBest > 0 && laterBest > best * 1.5;

  // Attached blocks (ask about this) and each hit's neighbour before it.
  const wanted = new Map<string, { chapter: number; idx: number }>();
  for (const id of attached) {
    if (!blockIdOk(id)) throw new Error(`not a block id: ${id}`);
    const ch = chapterOf(id)!;
    if (ch > limit) throw new Error(`${id} is past chapter ${limit}`);
    const idx = Number(id.split('-b')[1]);
    for (let k = Math.max(0, idx - Math.max(1, before)); k <= idx + Math.max(1, after); k++) wanted.set(`c${ch}-b${k}`, { chapter: ch, idx: k });
  }
  for (const h of hits) {
    for (let k = Math.max(0, h.idx - before); k <= h.idx + after; k++) wanted.set(`c${h.chapter}-b${k}`, { chapter: h.chapter, idx: k });
  }
  const passages = await blocksById(sql, [...wanted.keys()], limit);
  // Readable text only (no headings or breaks), in book order.
  return { passages: passages.filter((p) => SEARCH_KINDS.includes(p.kind) || p.kind === 'figure'), heldBack };
}

/** The stored blocks for these ids that exist and are within the limit, in book order. */
export async function blocksById(sql: postgres.Sql, ids: string[], limit: number): Promise<Passage[]> {
  const pairs = ids.filter(blockIdOk).map((id) => ({ ch: chapterOf(id)!, idx: Number(id.split('-b')[1]) })).filter((p) => p.ch <= limit);
  if (!pairs.length) return [];
  const rows = (await sql.unsafe(
    `select b.chapter, b.idx, b.kind, b.content
       from studio.text_blocks b
       join unnest($2::int[], $3::int[]) as w(chapter, idx) on w.chapter = b.chapter and w.idx = b.idx
      where b.work_id = $1
      order by b.chapter, b.idx`,
    [WORK_ID, pairs.map((p) => p.ch), pairs.map((p) => p.idx)],
  )) as unknown as Omit<Passage, 'id'>[];
  return rows.map((r) => ({ ...r, id: `c${r.chapter}-b${r.idx}` }));
}

/** ¶ labels (readable blocks counted 1..N, as in the reader) for blocks in these chapters. */
export async function labels(sql: postgres.Sql, chapters: number[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(chapters)];
  if (!uniq.length) return out;
  const rows = (await sql.unsafe(
    `select chapter, idx, kind, content from studio.text_blocks where work_id = $1 and chapter = any($2) order by chapter, idx`,
    [WORK_ID, uniq],
  )) as unknown as { chapter: number; idx: number; kind: string; content: string }[];
  for (const ch of uniq) {
    const blocks = rows.filter((r) => r.chapter === ch);
    blockFacts(blocks as never).forEach((f, i) => {
      if (f.label !== null) out.set(`c${ch}-b${blocks[i].idx}`, f.label);
    });
  }
  return out;
}
