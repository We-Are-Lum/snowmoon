import type postgres from 'postgres';
import { X_POSTS } from '../config';
import { linksIn, postText } from './count';

/**
 * The X posts tables (migration NEXT_x_posts.sql, applied 2026-11-25): studio.x_proposals (one row per card),
 * studio.x_approvals (who approves now) and studio.x_post_log (append-only). Only src/lib/x-posts reads or writes them.
 *
 * Every write locks its card (select … for update) and checks its state first, inside one transaction. A card that has
 * moved on (posting, posted, deleted, withdrawn) is never updated: the caller gets its state back and tells the person
 * (owner, 2026-11-25: the database refuses any change to a posted card but marking it deleted, so no handler may try).
 */

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;
export type Who = { id: string; name: string };
export type Status = 'open' | 'posting' | 'posted' | 'failed' | 'unknown' | 'withdrawn' | 'deleted';
export type Proposal = {
  id: number;
  source: 'team' | 'site';
  proposer_discord_id: string | null;
  proposer_name: string | null;
  body: string;
  link: string | null;
  subject_kind: string | null;
  subject_id: string | null;
  status: Status;
  discord_message_id: string | null;
  x_post_id: string | null;
  redraft_of: number | null;
  created_at: Date;
  posted_at: Date | null;
  deleted_at: Date | null;
};
export type Approval = { discord_user_id: string; discord_name: string; approved_at: Date };
export type LogRow = { id: number; event: string; actor_discord_id: string | null; actor_name: string | null; other_proposal_id: number | null; detail: string | null; cost_usd: string | null; at: Date };

const COLS = 'id, source, proposer_discord_id, proposer_name, body, link, subject_kind, subject_id, status, discord_message_id, x_post_id, redraft_of, created_at, posted_at, deleted_at';
const norm = (p: Proposal): Proposal => ({ ...p, id: Number(p.id), redraft_of: p.redraft_of === null ? null : Number(p.redraft_of) });

async function lock(tx: Tx, id: number): Promise<Proposal | null> {
  const [p] = await tx.unsafe<Proposal[]>(`select ${COLS} from studio.x_proposals where id = $1 for update`, [id]);
  return p ? norm(p) : null;
}

export async function getProposal(sql: Sql | Tx, id: number): Promise<Proposal | null> {
  const [p] = await sql.unsafe<Proposal[]>(`select ${COLS} from studio.x_proposals where id = $1`, [id]);
  return p ? norm(p) : null;
}
export const approvalsOf = (sql: Sql | Tx, id: number) => sql<Approval[]>`select discord_user_id, discord_name, approved_at from studio.x_approvals where proposal_id = ${id} order by approved_at, discord_user_id`;
export const logOf = async (sql: Sql | Tx, id: number) => (await sql<LogRow[]>`select id, event, actor_discord_id, actor_name, other_proposal_id, detail, cost_usd::text, at from studio.x_post_log where proposal_id = ${id} order by id`).map((r) => ({ ...r, id: Number(r.id), other_proposal_id: r.other_proposal_id === null ? null : Number(r.other_proposal_id) }));

/** 3 distinct people, at least one a lead. */
export const isReady = (approvals: { discord_user_id: string }[], leads: string[]) => approvals.length >= X_POSTS.approvals && approvals.some((a) => leads.includes(a.discord_user_id));

/** What X charges for this post, as priced: a link (explicit, or a bare domain X links by itself) costs more. */
export const priceOf = (body: string, link: string | null) => (linksIn(postText(body, link)).length ? X_POSTS.priceUsd.postWithLink : X_POSTS.priceUsd.post);

const log = (tx: Tx, id: number, event: string, who: Who | null, extra: { body?: string | null; link?: string | null; x_post_id?: string | null; cost_usd?: number | null; other?: number | null; detail?: string | null } = {}) =>
  tx`insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, body, link, x_post_id, cost_usd, other_proposal_id, detail)
     values (${id}, ${event}, ${who?.id ?? null}, ${who?.name ?? null}, ${extra.body ?? null}, ${extra.link ?? null}, ${extra.x_post_id ?? null}, ${extra.cost_usd ?? null}, ${extra.other ?? null}, ${extra.detail ?? null})`;

/** A state the card has moved on to: the caller tells the person, and nothing was written. */
export type Moved = { moved: Status } | { gone: true };
const moved = (p: Proposal | null): Moved => (p ? { moved: p.status } : { gone: true });

// --- Proposing ----------------------------------------------------------------------------------------------------

/** A team card: the proposal, the proposer's own approval (it counts), the log row. */
export async function propose(sql: Sql, who: Who, body: string, link: string | null): Promise<number> {
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string }[]>`insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, link) values ('team', ${who.id}, ${who.name}, ${body}, ${link}) returning id`;
    const id = Number(r.id);
    await tx`insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (${id}, ${who.id}, ${who.name})`;
    await log(tx, id, 'proposed', who, { body, link });
    return id;
  });
}

/** The card's Discord message, once it is in the channel. Only an open card that has none yet. */
export async function setMessage(sql: Sql, id: number, messageId: string): Promise<boolean> {
  const r = await sql`update studio.x_proposals set discord_message_id = ${messageId}, updated_at = now() where id = ${id} and status = 'open' and discord_message_id is null`;
  return r.count === 1;
}

// --- Approving ----------------------------------------------------------------------------------------------------

export type ApproveResult = Moved | { approved: boolean; count: number; ready: boolean; becameReady: boolean };

/** Approve, or take an approval back (a second click). Only an open card. */
export async function toggleApproval(sql: Sql, id: number, who: Who, leads: string[]): Promise<ApproveResult> {
  return sql.begin(async (tx) => {
    const p = await lock(tx, id);
    if (!p || p.status !== 'open') return moved(p);
    const before = await approvalsOf(tx, id);
    const had = before.some((a) => a.discord_user_id === who.id);
    if (had) await tx`delete from studio.x_approvals where proposal_id = ${id} and discord_user_id = ${who.id}`;
    else await tx`insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (${id}, ${who.id}, ${who.name})`;
    await log(tx, id, had ? 'unapproved' : 'approved', who);
    const after = await approvalsOf(tx, id);
    const ready = isReady(after, leads);
    return { approved: !had, count: after.length, ready, becameReady: ready && !isReady(before, leads) };
  });
}

/** Posting is off: the card reached its approvals, and the log says it would have posted. */
export async function logWouldPost(sql: Sql, id: number): Promise<void> {
  await sql.begin(async (tx) => {
    const p = await lock(tx, id);
    if (p?.status === 'open') await log(tx, id, 'would_post', null);
  });
}

// --- Editing and withdrawing --------------------------------------------------------------------------------------

export type EditResult = Moved | { notAllowed: true } | { edited: true };

/**
 * A new text and link. A team card: its proposer only. A site suggestion: anyone on the team, who becomes its proposer
 * (owner, 2026-11-25). Approvals start again from the editor's own. An open card, or one X refused (it opens again).
 */
export async function edit(sql: Sql, id: number, who: Who, body: string, link: string | null): Promise<EditResult> {
  return sql.begin(async (tx) => {
    const p = await lock(tx, id);
    if (!p || (p.status !== 'open' && p.status !== 'failed')) return moved(p);
    if (p.source === 'team' && p.proposer_discord_id !== who.id) return { notAllowed: true };
    await tx`update studio.x_proposals set body = ${body}, link = ${link}, proposer_discord_id = ${who.id}, proposer_name = ${who.name}, status = 'open', updated_at = now() where id = ${id} and status in ('open', 'failed')`;
    await tx`delete from studio.x_approvals where proposal_id = ${id}`;
    await tx`insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (${id}, ${who.id}, ${who.name})`;
    await log(tx, id, 'edited', who, { body, link });
    return { edited: true };
  });
}

/** Who may edit: for the Edit button, before the box opens (the save checks again). */
export const mayEdit = (p: Proposal, who: Who) => p.source === 'site' || p.proposer_discord_id === who.id;
/** Who may withdraw: a team card's proposer; a site suggestion, only a lead (owner, 2026-11-25). */
export const mayWithdraw = (p: Proposal, who: Who, leads: string[]) => (p.source === 'team' ? p.proposer_discord_id === who.id : leads.includes(who.id));

export type WithdrawResult = Moved | { notAllowed: true } | { withdrawn: true };
export async function withdraw(sql: Sql, id: number, who: Who, leads: string[]): Promise<WithdrawResult> {
  return sql.begin(async (tx) => {
    const p = await lock(tx, id);
    if (!p || (p.status !== 'open' && p.status !== 'failed')) return moved(p);
    if (!mayWithdraw(p, who, leads)) return { notAllowed: true };
    await tx`update studio.x_proposals set status = 'withdrawn', updated_at = now() where id = ${id} and status in ('open', 'failed')`;
    await log(tx, id, 'withdrawn', who);
    return { withdrawn: true };
  });
}

// --- Posting (release 2: X_POSTS.post) ----------------------------------------------------------------------------

/** What X has charged this calendar month (UTC), as priced, from the log. */
export async function spentThisMonth(sql: Sql | Tx): Promise<number> {
  const [r] = await sql<{ usd: string }[]>`select coalesce(sum(cost_usd), 0)::text as usd from studio.x_post_log where at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`;
  return Number(r.usd);
}
/** Posts that went out today (Pacific), from the log. */
export async function postsToday(sql: Sql | Tx): Promise<number> {
  const [r] = await sql<{ n: string }[]>`select count(*)::text as n from studio.x_post_log where event = 'posted' and at >= date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles'`;
  return Number(r.n);
}

export type ClaimResult = Moved | { notReady: true } | { held: 'month' | 'day' } | { claimed: true; text: string; price: number };

/**
 * Claims a ready card for posting: open (or failed/unknown, to try again) to posting, in one step, so it posts at most
 * once. Held, and logged, when this month's spending or today's posts would go over.
 */
export async function claim(sql: Sql, id: number, who: Who | null, leads: string[]): Promise<ClaimResult> {
  return sql.begin(async (tx) => {
    const p = await lock(tx, id);
    if (!p || !['open', 'failed', 'unknown'].includes(p.status)) return moved(p);
    if (!isReady(await approvalsOf(tx, id), leads)) return { notReady: true };
    const price = priceOf(p.body, p.link);
    if ((await spentThisMonth(tx)) + price > X_POSTS.monthlyUsd) {
      await log(tx, id, 'held', who, { detail: 'month' });
      return { held: 'month' };
    }
    if ((await postsToday(tx)) >= X_POSTS.perDay) {
      await log(tx, id, 'held', who, { detail: 'day' });
      return { held: 'day' };
    }
    await tx`update studio.x_proposals set status = 'posting', updated_at = now() where id = ${id} and status in ('open', 'failed', 'unknown')`;
    return { claimed: true, text: postText(p.body, p.link), price };
  });
}

/** X's answer for a claimed card: posted (frozen from now on), refused (nothing posted) or no answer (it may be on X). */
export async function finishPost(sql: Sql, id: number, who: Who | null, price: number, r: { ok: true; id: string } | { ok: false; refused: boolean; reason: string }): Promise<void> {
  await sql.begin(async (tx) => {
    const p = await lock(tx, id);
    if (p?.status !== 'posting') return;
    if (r.ok) {
      await tx`update studio.x_proposals set status = 'posted', x_post_id = ${r.id}, posted_at = now(), updated_at = now() where id = ${id} and status = 'posting'`;
      await log(tx, id, 'posted', who, { x_post_id: r.id, cost_usd: price });
    } else if (r.refused) {
      await tx`update studio.x_proposals set status = 'failed', updated_at = now() where id = ${id} and status = 'posting'`;
      await log(tx, id, 'post_failed', who, { detail: r.reason });
    } else {
      // Counted as charged: X may have posted it.
      await tx`update studio.x_proposals set status = 'unknown', updated_at = now() where id = ${id} and status = 'posting'`;
      await log(tx, id, 'post_unknown', who, { cost_usd: price, detail: r.reason });
    }
  });
}

// --- Deleting and redrafting --------------------------------------------------------------------------------------

/** Who may delete a posted card (or try again on one): anyone who approved it, and the leads always. */
export const mayDelete = (approvals: { discord_user_id: string }[], who: Who, leads: string[]) => leads.includes(who.id) || approvals.some((a) => a.discord_user_id === who.id);

export type DeleteCheck = Moved | { notAllowed: true } | { ok: true; xPostId: string };
/** Before asking X: the card must be posted, and the clicker allowed. Writes nothing. */
export async function checkDelete(sql: Sql, id: number, who: Who, leads: string[]): Promise<DeleteCheck> {
  const p = await getProposal(sql, id);
  if (!p || p.status !== 'posted' || !p.x_post_id) return moved(p);
  if (!mayDelete(await approvalsOf(sql, id), who, leads)) return { notAllowed: true };
  return { ok: true, xPostId: p.x_post_id };
}

export type MarkDeletedResult = Moved | { deleted: true; redraftId: number | null };

/**
 * After X deleted the post: marks the card deleted and, for Delete and redraft, starts the new card, in ONE transaction
 * that first requires the old card to be posted, with its X post (owner, 2026-11-25: the database alone accepts a redraft
 * of a card that was never posted, so this check is the code's). The new card is a team card with the clicker as
 * proposer and their approval; it keeps the work it is about; each card's log names the other.
 */
export async function markDeleted(sql: Sql, id: number, who: Who | null, opts: { redraft: boolean; onHide?: boolean }): Promise<MarkDeletedResult> {
  return sql.begin(async (tx) => {
    const p = await lock(tx, id);
    if (!p || p.status !== 'posted' || !p.x_post_id) return moved(p);
    if (opts.redraft && !who) return moved(p);
    await tx`update studio.x_proposals set status = 'deleted', deleted_at = now() where id = ${id} and status = 'posted'`;
    await log(tx, id, opts.onHide ? 'auto_deleted' : 'deleted', opts.onHide ? null : who, { x_post_id: p.x_post_id, cost_usd: X_POSTS.priceUsd.delete, detail: opts.onHide ? 'hidden on the site' : null });
    if (!opts.redraft || !who) return { deleted: true, redraftId: null };
    const [r] = await tx<{ id: string }[]>`insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, link, subject_kind, subject_id, redraft_of)
      values ('team', ${who.id}, ${who.name}, ${p.body}, ${p.link}, ${p.subject_kind}, ${p.subject_id}, ${id}) returning id`;
    const redraftId = Number(r.id);
    await tx`insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (${redraftId}, ${who.id}, ${who.name})`;
    await log(tx, id, 'redrafted_to', who, { other: redraftId });
    await log(tx, redraftId, 'redrafted_from', who, { body: p.body, link: p.link, other: id });
    return { deleted: true, redraftId };
  });
}

export async function logDeleteFailed(sql: Sql, id: number, who: Who, reason: string): Promise<void> {
  await sql`insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, detail) values (${id}, 'delete_failed', ${who.id}, ${who.name}, ${reason.slice(0, 1000)})`;
}

// --- The admin page -----------------------------------------------------------------------------------------------

export type AdminLogRow = { at: string; proposal: number; event: string; who: string | null; detail: string | null; cost: string | null; body: string };
export async function adminLog(sql: Sql, limit = 200): Promise<{ rows: AdminLogRow[]; spent: number; today: number }> {
  const rows = await sql<{ at: Date; proposal_id: string; event: string; actor_name: string | null; detail: string | null; cost_usd: string | null; body: string }[]>`
    select l.at, l.proposal_id, l.event, l.actor_name, l.detail, l.cost_usd::text, p.body
    from studio.x_post_log l join studio.x_proposals p on p.id = l.proposal_id order by l.id desc limit ${limit}`;
  return {
    rows: rows.map((r) => ({ at: r.at.toISOString(), proposal: Number(r.proposal_id), event: r.event, who: r.actor_name ?? (['suggested', 'auto_withdrawn', 'auto_deleted'].includes(r.event) ? 'snowmoon.party' : null), detail: r.detail, cost: r.cost_usd, body: r.body.slice(0, 140) })),
    spent: await spentThisMonth(sql),
    today: await postsToday(sql),
  };
}
