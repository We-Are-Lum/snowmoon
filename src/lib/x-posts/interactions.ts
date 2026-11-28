import type postgres from 'postgres';
import { X_POSTS } from '../config';
import { editCard, editReply, NO_PINGS, postCard, xCreatePost, xDeletePost, type XEnv } from './apis';
import { card, cid, parseCid } from './card';
import { mentionsIn, postText, xLength } from './count';
import { verifyDiscord } from './signatures';
import {
  approvalsOf, checkDelete, claim, edit, finishPost, getProposal, isReady, logDeleteFailed, logOf, logWouldPost, markDeleted, mayDelete, mayEdit, mayWithdraw,
  propose, setMessage, toggleApproval, withdraw, type Moved, type Who,
} from './store';
import { BUTTON, COMMAND, CONFIRM, EDIT_BOX, REPLY } from './wording';

/**
 * Discord's requests to POST /api/discord/interactions (owner, 2026-11-25; plan docs/proposals/x-posts.md): the
 * /xpost command, the cards' buttons and the edit box. Every request is checked first: Discord's Ed25519 signature
 * (401 without it), then the server, then the team role, and every write goes through src/lib/x-posts/store.ts, which
 * locks the card and checks its state. The answer goes back within Discord's 3 seconds; slower work (drawing the card
 * again, X) runs after it, in `later`.
 */

type Sql = postgres.Sql;
export type Deps = { sql: Sql | null; env: XEnv; now?: number };
export type Answer = { status: number; body: unknown; later?: () => Promise<void> };

type Member = { user?: { id?: string; username?: string; global_name?: string | null }; nick?: string | null; roles?: string[] };
type Interaction = {
  type: number;
  token?: string;
  guild_id?: string;
  member?: Member;
  data?: { name?: string; custom_id?: string; options?: { name: string; value: unknown }[]; components?: { components?: { custom_id?: string; value?: string }[] }[] };
};

/** The command Discord shows, registered by the owner from /admin/x-posts. */
export const COMMANDS = [
  {
    name: COMMAND.name,
    description: COMMAND.description,
    type: 1,
    contexts: [0],
    options: [
      { type: 3, name: 'text', description: COMMAND.text, required: true, max_length: 4000 },
      { type: 3, name: 'link', description: COMMAND.link, required: false, max_length: 2000 },
      { type: 5, name: 'confirm', description: COMMAND.confirm, required: false },
    ],
  },
];

const json = (body: unknown, status = 200): Answer => ({ status, body });
/** A reply only the clicker sees; never pings anyone. */
const only = (content: string, components: unknown[] = []): Answer => json({ type: 4, data: { content, flags: 64, components, allowed_mentions: NO_PINGS } });
/** Replaces the message the button was on (here: the clicker's own confirmation). */
const replace = (content: string): Answer => json({ type: 7, data: { content, components: [], allowed_mentions: NO_PINGS } });
const confirmRow = (label: string, custom: string, style: 1 | 2 | 4) => [{ type: 1, components: [{ type: 2, style, label, custom_id: custom }] }];
const movedReply = (m: Moved) => ('gone' in m ? REPLY.gone : REPLY.already[m.moved as keyof typeof REPLY.already] ?? REPLY.gone);

/** Checks the post as it will go out; the error to show, or the clean text and link. */
export function validate(rawText: string, rawLink: string | null, confirmed: boolean): { error: string } | { body: string; link: string | null } {
  const body = rawText.replace(/\r\n/g, '\n').trim();
  const link = rawLink?.trim() ? rawLink.trim() : null;
  if (!body) return { error: REPLY.empty };
  if (link && (!/^https:\/\/[^\s]+$/.test(link) || link.length > 2000)) return { error: REPLY.badLink };
  const n = xLength(postText(body, link));
  if (n > X_POSTS.maxWeighted) return { error: REPLY.tooLong(n, X_POSTS.maxWeighted) };
  const m = mentionsIn(body);
  if (m.length && !confirmed) return { error: REPLY.mention(m[0]) };
  return { body, link };
}

const whoOf = (m: Member | undefined): Who | null => {
  const id = m?.user?.id;
  if (!id || !/^\d{17,20}$/.test(id)) return null;
  const name = (m?.nick || m?.user?.global_name || m?.user?.username || id).slice(0, 100);
  return { id, name };
};

/** Draws a card again in #x-posts from the database (it never writes the card's row). */
export async function refreshCard(sql: Sql, env: XEnv, id: number): Promise<void> {
  const p = await getProposal(sql, id);
  if (!p?.discord_message_id) return;
  const log = await logOf(sql, id);
  const to = [...log].reverse().find((l) => l.event === 'redrafted_to')?.other_proposal_id ?? null;
  const otherId = p.redraft_of ?? to;
  const other = otherId ? await getProposal(sql, otherId) : null;
  await editCard(env, p.discord_message_id, card(env, { p, approvals: await approvalsOf(sql, id), log, otherMessageId: other?.discord_message_id ?? null }));
}

/** Puts a new card in the channel and records its message (only while it is open). */
async function placeCard(sql: Sql, env: XEnv, id: number): Promise<void> {
  const p = await getProposal(sql, id);
  if (!p) return;
  const log = await logOf(sql, id);
  const old = p.redraft_of ? await getProposal(sql, p.redraft_of) : null;
  const messageId = await postCard(env, card(env, { p, approvals: await approvalsOf(sql, id), log, otherMessageId: old?.discord_message_id ?? null }));
  if (messageId) await setMessage(sql, id, messageId);
  if (old) await refreshCard(sql, env, old.id);
}

/** A ready card: posted for real (X_POSTS.post), or, while posting is off, logged as "would post". */
export async function postWhenReady(sql: Sql, env: XEnv, id: number, who: Who | null): Promise<void> {
  if (!X_POSTS.post) {
    await logWouldPost(sql, id);
    await refreshCard(sql, env, id);
    return;
  }
  const c = await claim(sql, id, who, env.leads);
  if (!('claimed' in c)) {
    await refreshCard(sql, env, id);
    return;
  }
  await refreshCard(sql, env, id);
  const r = await xCreatePost(env, c.text);
  await finishPost(sql, id, who, c.price, r);
  await refreshCard(sql, env, id);
}

export async function handleInteraction(raw: string, headers: Headers, deps: Deps): Promise<Answer> {
  const { sql, env } = deps;
  if (!X_POSTS.cards) return json({ error: 'Not found' }, 404);
  if (!verifyDiscord(env.publicKey, headers.get('x-signature-ed25519'), headers.get('x-signature-timestamp'), raw, deps.now)) return json({ error: 'invalid request signature' }, 401);
  let i: Interaction;
  try {
    i = JSON.parse(raw) as Interaction;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  if (i.type === 1) return json({ type: 1 });
  if (!sql) return only(REPLY.off);
  if (!env.guildId || i.guild_id !== env.guildId) return only(REPLY.wrongServer);
  const who = whoOf(i.member);
  if (!who || !env.roleId || !(i.member?.roles ?? []).includes(env.roleId)) return only(REPLY.notTeam);

  // /xpost
  if (i.type === 2 && i.data?.name === COMMAND.name) {
    const opt = (n: string) => i.data?.options?.find((o) => o.name === n)?.value;
    const v = validate(String(opt('text') ?? ''), typeof opt('link') === 'string' ? (opt('link') as string) : null, opt('confirm') === true);
    if ('error' in v) return only(v.error);
    const id = await propose(sql, who, v.body, v.link);
    return { ...only(REPLY.proposed), later: () => placeCard(sql, env, id) };
  }

  // The edit box, saved.
  if (i.type === 5) {
    const c = parseCid(i.data?.custom_id ?? '');
    if (!c || c.action !== 'edit-save') return only(REPLY.gone);
    const fields = Object.fromEntries((i.data?.components ?? []).flatMap((r) => r.components ?? []).map((f) => [f.custom_id ?? '', f.value ?? '']));
    const v = validate(fields.post ?? '', fields.link ?? null, true);
    if ('error' in v) return only(v.error);
    const r = await edit(sql, c.id, who, v.body, v.link);
    if ('notAllowed' in r) return only(REPLY.notProposer);
    if (!('edited' in r)) return only(movedReply(r));
    return { ...only(REPLY.savedEdit), later: () => refreshCard(sql, env, c.id) };
  }

  if (i.type !== 3) return only(REPLY.gone);
  const c = parseCid(i.data?.custom_id ?? '');
  if (!c) return only(REPLY.gone);
  const { id } = c;

  switch (c.action) {
    case 'approve': {
      const r = await toggleApproval(sql, id, who, env.leads);
      if (!('approved' in r)) return only(movedReply(r));
      return {
        ...only(r.approved ? REPLY.approved(r.count, X_POSTS.approvals) : REPLY.unapproved),
        later: () => (r.becameReady ? postWhenReady(sql, env, id, who) : refreshCard(sql, env, id)),
      };
    }
    case 'edit': {
      const p = await getProposal(sql, id);
      if (!p || (p.status !== 'open' && p.status !== 'failed')) return only(movedReply(p ? { moved: p.status } : { gone: true }));
      if (!mayEdit(p, who)) return only(REPLY.notProposer);
      return json({
        type: 9,
        data: {
          custom_id: cid('edit-save', id),
          title: EDIT_BOX.title,
          components: [
            { type: 1, components: [{ type: 4, custom_id: 'post', label: EDIT_BOX.post, style: 2, required: true, max_length: 4000, value: p.body }] },
            { type: 1, components: [{ type: 4, custom_id: 'link', label: EDIT_BOX.link, style: 1, required: false, max_length: 2000, value: p.link ?? '' }] },
          ],
        },
      });
    }
    case 'withdraw': {
      const p = await getProposal(sql, id);
      if (!p || (p.status !== 'open' && p.status !== 'failed')) return only(movedReply(p ? { moved: p.status } : { gone: true }));
      if (!mayWithdraw(p, who, env.leads)) return only(p.source === 'site' ? REPLY.notLead : REPLY.notProposer);
      return only(CONFIRM.withdraw, confirmRow(BUTTON.withdraw, cid('withdraw-yes', id), 4));
    }
    case 'withdraw-yes': {
      const r = await withdraw(sql, id, who, env.leads);
      if ('notAllowed' in r) return replace(REPLY.notProposer);
      if (!('withdrawn' in r)) return replace(movedReply(r));
      return { ...replace(REPLY.withdrawnDone), later: () => refreshCard(sql, env, id) };
    }
    case 'delete':
    case 'redraft': {
      const r = await checkDelete(sql, id, who, env.leads);
      if ('notAllowed' in r) return only(REPLY.notDeleter);
      if (!('ok' in r)) return only(c.action === 'redraft' && 'moved' in r && r.moved !== 'posted' && r.moved !== 'deleted' ? REPLY.notRedraftable : movedReply(r));
      return c.action === 'delete'
        ? only(CONFIRM.delete, confirmRow(BUTTON.delete, cid('delete-yes', id), 4))
        : only(CONFIRM.redraft, confirmRow(BUTTON.redraft, cid('redraft-yes', id), 2));
    }
    case 'delete-yes':
    case 'redraft-yes': {
      const redraft = c.action === 'redraft-yes';
      const r = await checkDelete(sql, id, who, env.leads);
      if ('notAllowed' in r) return replace(REPLY.notDeleter);
      if (!('ok' in r)) return replace(redraft && 'moved' in r && r.moved !== 'posted' && r.moved !== 'deleted' ? REPLY.notRedraftable : movedReply(r));
      const token = i.token ?? '';
      return {
        ...replace(REPLY.deleting),
        later: async () => {
          const d = await xDeletePost(env, r.xPostId);
          if (!d.ok) {
            await logDeleteFailed(sql, id, who, d.reason);
            await editReply(env, token, REPLY.deleteFailed(d.reason));
            return;
          }
          const m = await markDeleted(sql, id, who, { redraft });
          if (!('deleted' in m)) {
            await editReply(env, token, movedReply(m));
            return;
          }
          if (m.redraftId) await placeCard(sql, env, m.redraftId);
          else await refreshCard(sql, env, id);
          await editReply(env, token, m.redraftId ? REPLY.redraftedDone : REPLY.deletedDone);
        },
      };
    }
    case 'retry': {
      const p = await getProposal(sql, id);
      if (!p || !['open', 'failed', 'unknown'].includes(p.status)) return only(movedReply(p ? { moved: p.status } : { gone: true }));
      if (!X_POSTS.post) return only(REPLY.postOff);
      const approvals = await approvalsOf(sql, id);
      // A held card (open) waits for a lead; a failed or unanswered one, for anyone who approved it or a lead.
      if (p.status === 'open' ? !env.leads.includes(who.id) : !mayDelete(approvals, who, env.leads)) return only(REPLY.notRetrier);
      if (!isReady(approvals, env.leads)) return only(REPLY.notReady);
      return { ...only(REPLY.tryingAgain), later: () => postWhenReady(sql, env, id, who) };
    }
    default:
      return only(REPLY.gone);
  }
}
