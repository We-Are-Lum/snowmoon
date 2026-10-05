import 'server-only';
import { randomUUID } from 'node:crypto';
import { appUrl, CARD_SAVES_PER_DAY, WORK_ID } from './config';
import { db } from './db';
import type { QuoteCardSpec, TextBody } from './element-body';
import { quoteQuery, resolveQuote, type Quote } from './quote';

/**
 * Saved quote cards (brief §4f, step 2). A saved card is a `text` element:
 * version 1 holds the quoted words and the card spec, an anchor ties it to the
 * passage, and its recipe records how the card is drawn, all in one transaction
 * (brief rule 1). Likes live in `studio.likes` (migration 0003), never in
 * `ratings`: a like never enters rating normalization or the score, and "most
 * liked" sorts by distinct likers (brief §6 rule 4).
 * The seeded image is recorded by id in the spec; it becomes a `uses` link when
 * images are elements (Milestone 4).
 */
export interface SavedCard {
  versionId: string;
  createdBy: number;
  createdAt: string;
  likes: number;
  spec: QuoteCardSpec;
  quote: Quote;
  cardUrl: string;
  sharePath: string;
}

const range = (s: QuoteCardSpec) => (s.from === s.to ? `${s.from}` : `${s.from}-${s.to}`);
export const cardImageUrl = (s: QuoteCardSpec) => `${appUrl()}/api/card/${s.chapter}/${range(s)}${quoteQuery(s.q, s.img)}`;

export class CardError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Check a requested card against the book and return its canonical spec. */
export function cardSpec(input: { chapter: number; range: string; q?: string | null; img?: string | null }): { spec: QuoteCardSpec; quote: Quote } {
  const quote = resolveQuote(input.chapter, input.range, input.q ?? null, input.img ?? null);
  if (!quote) throw new CardError('That quote is not in the book', 400);
  const spec: QuoteCardSpec = {
    kind: 'quote_card',
    chapter: quote.chapter,
    from: quote.from,
    to: quote.to,
    q: input.q ? input.q : null,
    img: quote.image?.id ?? null,
  };
  return { spec, quote };
}

/** Save a card for `fid`. Saving the same card twice returns the first one. */
export async function saveCard(fid: number, spec: QuoteCardSpec, quote: Quote): Promise<{ versionId: string; created: boolean }> {
  const sql = db();
  if (!sql) throw new CardError('Saving is not available here', 503);

  const [existing] = await sql<{ id: string }[]>`
    select v.id from studio.element_versions v
    join studio.elements e on e.id = v.element_id
    where e.created_by_fid = ${fid} and e.element_type = 'text' and e.status = 'published'
      and v.body->'card' = ${sql.json(spec as never)}::jsonb
    limit 1`;
  if (existing) return { versionId: existing.id, created: false };

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from studio.elements
    where created_by_fid = ${fid} and element_type = 'text' and created_at > now() - interval '1 day'`;
  if (n >= CARD_SAVES_PER_DAY) throw new CardError(`You can save up to ${CARD_SAVES_PER_DAY} cards a day`, 429);

  const elementId = randomUUID();
  const versionId = randomUUID();
  const recipeId = randomUUID();
  const body: TextBody = { text: quote.text, card: spec };
  await sql.begin(async (tx) => {
    await tx`insert into studio.recipes ${tx({
      id: recipeId,
      source: 'in_app',
      provider: 'snowmoon',
      model: 'quote-card',
      model_version: process.env.APP_COMMIT ?? 'unknown',
      prompt: null,
      params: tx.json({ renderer: 'src/app/api/card/[n]/[range]/route.tsx', spec } as never),
      cost_usd: 0,
      created_by_fid: fid,
    })}`;
    await tx`insert into studio.elements ${tx({ id: elementId, work_id: WORK_ID, element_type: 'text', created_by_fid: fid })}`;
    await tx`insert into studio.element_versions ${tx({
      id: versionId,
      element_id: elementId,
      version_no: 1,
      body: tx.json(body as never),
      asset_url: cardImageUrl(spec),
      recipe_id: recipeId,
    })}`;
    await tx`insert into studio.anchors ${tx({ version_id: versionId, work_id: WORK_ID, chapter: spec.chapter, start_idx: spec.from, end_idx: spec.to })}`;
  });
  return { versionId, created: true };
}

type Row = { version_id: string; created_by_fid: string; created_at: Date; likes: number; body: TextBody };

function toCard(r: Row): SavedCard | null {
  const spec = r.body.card;
  if (!spec) return null;
  const quote = resolveQuote(spec.chapter, range(spec), spec.q, spec.img);
  if (!quote) return null;
  return {
    versionId: r.version_id,
    createdBy: Number(r.created_by_fid),
    createdAt: r.created_at.toISOString(),
    likes: r.likes,
    spec,
    quote,
    cardUrl: cardImageUrl(spec),
    sharePath: `/card/${r.version_id}`,
  };
}

const CARD_ROWS = `
  select v.id as version_id, e.created_by_fid, v.created_at, v.body,
    (select count(*)::int from studio.likes l where l.version_id = v.id) as likes
  from studio.element_versions v
  join studio.elements e on e.id = v.element_id
  where e.work_id = $1 and e.element_type = 'text' and e.status = 'published' and v.body ? 'card'`;

/**
 * Saved cards, most liked first (ties: newest) or newest first. Cards have no
 * ratings yet, so "most liked" is the order (rule 4: where nothing in a list is
 * ranked by ratings, order by likes).
 */
export async function listCards(sort: 'top' | 'new', limit = 60): Promise<SavedCard[]> {
  const sql = db();
  if (!sql) return [];
  const order = sort === 'top' ? 'likes desc, created_at desc' : 'created_at desc';
  const rows = await sql.unsafe<Row[]>(`select * from (${CARD_ROWS}) c order by ${order} limit ${Number(limit)}`, [WORK_ID]);
  return rows.map(toCard).filter((c): c is SavedCard => c !== null);
}

export async function getCard(versionId: string): Promise<SavedCard | null> {
  const sql = db();
  if (!sql || !/^[0-9a-f-]{36}$/.test(versionId)) return null;
  const [row] = await sql.unsafe<Row[]>(`${CARD_ROWS} and v.id = $2`, [WORK_ID, versionId]);
  return row ? toCard(row) : null;
}

/** Like or unlike a saved card. Returns the new count and the caller's state. */
export async function setLike(versionId: string, fid: number, like: boolean): Promise<{ likes: number; liked: boolean }> {
  const sql = db();
  if (!sql) throw new CardError('Likes are not available here', 503);
  if (!(await getCard(versionId))) throw new CardError('No such card', 404);
  if (like) {
    await sql`insert into studio.likes ${sql({ version_id: versionId, fid })} on conflict (version_id, fid) do nothing`;
  } else {
    await sql`delete from studio.likes where version_id = ${versionId} and fid = ${fid}`;
  }
  return likeState(versionId, fid);
}

export async function likeState(versionId: string, fid: number | null): Promise<{ likes: number; liked: boolean }> {
  const sql = db();
  if (!sql) return { likes: 0, liked: false };
  const [r] = await sql<{ likes: number; mine: boolean }[]>`
    select (select count(*)::int from studio.likes where version_id = ${versionId}) as likes,
           exists (select 1 from studio.likes where version_id = ${versionId} and fid = ${fid ?? -1}) as mine`;
  return { likes: r.likes, liked: r.mine };
}
