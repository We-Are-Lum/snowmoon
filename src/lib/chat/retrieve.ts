import type postgres from 'postgres';
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

/** "Why does Deluin invite Zei?" -> 'deluin' | 'invit' | 'zei' (any word may match; rank decides). */
const orQuery = `to_tsquery('english', coalesce(nullif(array_to_string(tsvector_to_array(to_tsvector('english', $1)), ' | '), ''), 'nomatch_nomatch'))`;

export async function retrieve(sql: postgres.Sql, question: string, limit: number, attached: string[] = []): Promise<Retrieved> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('bad chapter limit');
  const hits = (await sql.unsafe(
    `select chapter, idx, kind, content, ts_rank_cd(search, q) as rank
       from studio.text_blocks, ${orQuery} q
      where work_id = $2 and chapter <= $3 and kind = any($4) and search @@ q
      order by rank desc, chapter, idx
      limit $5`,
    [question, WORK_ID, limit, SEARCH_KINDS, CHAT.passages],
  )) as unknown as (Passage & { rank: number })[];

  // The same query past the limit: only its best rank is used, never its text.
  const later = (await sql.unsafe(
    `select max(ts_rank_cd(search, q)) as rank
       from studio.text_blocks, ${orQuery} q
      where work_id = $2 and chapter > $3 and kind = any($4) and search @@ q`,
    [question, WORK_ID, limit, SEARCH_KINDS],
  )) as unknown as { rank: number | null }[];
  const best = hits[0]?.rank ?? 0;
  const laterBest = Number(later[0]?.rank ?? 0);
  const heldBack = laterBest > 0 && laterBest > best * 1.5;

  // Attached blocks (ask about this) and each hit's neighbour before it.
  const wanted = new Map<string, { chapter: number; idx: number }>();
  for (const id of attached) {
    if (!blockIdOk(id)) throw new Error(`not a block id: ${id}`);
    const ch = chapterOf(id)!;
    if (ch > limit) throw new Error(`${id} is past chapter ${limit}`);
    const idx = Number(id.split('-b')[1]);
    wanted.set(id, { chapter: ch, idx });
    if (idx > 0) wanted.set(`c${ch}-b${idx - 1}`, { chapter: ch, idx: idx - 1 });
  }
  for (const h of hits) {
    wanted.set(`c${h.chapter}-b${h.idx}`, h);
    if (h.idx > 0) wanted.set(`c${h.chapter}-b${h.idx - 1}`, { chapter: h.chapter, idx: h.idx - 1 });
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
