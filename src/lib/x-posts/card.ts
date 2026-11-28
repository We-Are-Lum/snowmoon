import { X_POSTS } from '../config';
import type { DiscordMessage, XEnv } from './apis';
import { postText, xLength } from './count';
import { isReady, priceOf, type Approval, type LogRow, type Proposal } from './store';
import { BUTTON, CARD } from './wording';

/**
 * A card in #x-posts, drawn from the database: its post, who proposed and approved it, its state, and the buttons that
 * state allows. Discord shows the same buttons to everyone; the site checks who clicked (src/lib/x-posts/interactions.ts).
 */

/** A button's custom_id: "xp:<action>:<proposal id>". */
export const cid = (action: string, id: number) => `xp:${action}:${id}`;
export const parseCid = (s: string): { action: string; id: number } | null => {
  const m = /^xp:([a-z-]{2,20}):(\d{1,15})$/.exec(s);
  return m ? { action: m[1], id: Number(m[2]) } : null;
};

const COLOR = { open: 0x5865f2, posted: 0x1d9bf0, done: 0x80848e, problem: 0xed4245 } as const;
const button = (label: string, custom_id: string, style: 1 | 2 | 4) => ({ type: 2, style, label, custom_id });
const row = (...buttons: unknown[]) => ({ type: 1, components: buttons });

/** "Nov 25, 2026", Pacific. */
export const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
export const messageLink = (env: XEnv, messageId: string | null) => (messageId ? `https://discord.com/channels/${env.guildId}/${env.channelId}/${messageId}` : 'the new card');
export const xLink = (env: XEnv, id: string) => `https://x.com/${env.account}/status/${id}`;
const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');

export type CardInput = {
  p: Proposal;
  approvals: Approval[];
  log: LogRow[];
  /** The other card of a redraft (the old one for a redraft, the new one for a redrafted card): its message ID. */
  otherMessageId?: string | null;
};

export function card(env: XEnv, { p, approvals, log, otherMessageId = null }: CardInput): DiscordMessage {
  const last = (events: string[]) => [...log].reverse().find((l) => events.includes(l.event));
  const text = postText(p.body, p.link);
  const notes: string[] = [];
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  let color: number = COLOR.open;
  let components: unknown[] = [];

  const redraftFrom = log.find((l) => l.event === 'redrafted_from');
  if (redraftFrom) notes.push(CARD.redraftOf(messageLink(env, otherMessageId), redraftFrom.actor_name ?? ''));
  if (p.proposer_name) fields.push({ name: '​', value: CARD.proposedBy(p.proposer_name), inline: true });
  const names = approvals.map((a) => a.discord_name);
  fields.push({ name: '​', value: CARD.approvedBy(names, approvals.length, X_POSTS.approvals), inline: true });

  if (p.status === 'open' || p.status === 'failed' || p.status === 'unknown') {
    if (!approvals.some((a) => env.leads.includes(a.discord_user_id))) fields.push({ name: '​', value: CARD.needsLead, inline: true });
    fields.push({ name: '​', value: CARD.length(xLength(text), X_POSTS.maxWeighted, priceOf(p.body, p.link)) });
    const edited = last(['edited', 'approved', 'unapproved', 'would_post', 'held']);
    if (edited?.event === 'edited') notes.push(CARD.edited(edited.actor_name ?? ''));
    const state = last(['would_post', 'held', 'edited', 'unapproved', 'post_failed', 'post_unknown']);
    if (p.status === 'open' && state?.event === 'would_post' && isReady(approvals, env.leads)) notes.push(CARD.wouldPost);
    if (p.status === 'open' && state?.event === 'held') notes.push(state.detail === 'day' ? CARD.heldDay(X_POSTS.perDay) : CARD.held(X_POSTS.monthlyUsd));
  }
  if (p.status === 'open') {
    const held = last(['held', 'edited', 'unapproved'])?.event === 'held';
    components = [row(button(BUTTON.approve, cid('approve', p.id), 1), button(BUTTON.edit, cid('edit', p.id), 2), button(BUTTON.withdraw, cid('withdraw', p.id), 4), ...(held ? [button(BUTTON.retry, cid('retry', p.id), 2)] : []))];
  } else if (p.status === 'posting') {
    notes.push(CARD.posting);
  } else if (p.status === 'failed') {
    color = COLOR.problem;
    notes.push(CARD.failed(last(['post_failed'])?.detail ?? 'no reason given'));
    components = [row(button(BUTTON.retry, cid('retry', p.id), 1), button(BUTTON.edit, cid('edit', p.id), 2), button(BUTTON.withdraw, cid('withdraw', p.id), 4))];
  } else if (p.status === 'unknown') {
    color = COLOR.problem;
    notes.push(CARD.unknown(env.account));
    components = [row(button(BUTTON.retry, cid('retry', p.id), 1))];
  } else if (p.status === 'posted') {
    color = COLOR.posted;
    notes.push(CARD.posted(day(p.posted_at!), xLink(env, p.x_post_id!), names));
    components = [row(button(BUTTON.delete, cid('delete', p.id), 4), button(BUTTON.redraft, cid('redraft', p.id), 2))];
  } else if (p.status === 'withdrawn') {
    color = COLOR.done;
    const w = last(['withdrawn', 'auto_withdrawn']);
    notes.push(CARD.withdrawn(w?.actor_name ?? 'snowmoon.party', day(w?.at ?? new Date())));
  } else if (p.status === 'deleted') {
    color = COLOR.done;
    const d = last(['deleted', 'auto_deleted'])!;
    const redraft = last(['redrafted_to']);
    if (d?.event === 'auto_deleted') notes.push(CARD.deletedOnHide(day(d.at)));
    else if (redraft) notes.push(CARD.redrafted(redraft.actor_name ?? '', day(d?.at ?? new Date()), messageLink(env, otherMessageId)));
    else notes.push(CARD.deleted(d?.actor_name ?? '', day(d?.at ?? new Date())));
  }

  return {
    embeds: [
      {
        title: p.source === 'site' ? CARD.siteTitle : CARD.teamTitle,
        description: [quote(text), ...notes].join('\n\n').slice(0, 4000),
        color,
        fields,
        footer: { text: CARD.footer(env.account, X_POSTS.approvals) },
      },
    ],
    components,
  };
}
