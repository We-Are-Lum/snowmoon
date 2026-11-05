import 'server-only';
import type postgres from 'postgres';
import { ASSISTANT, IMAGES, SOCIAL_SIGN_IN } from '../config';
import { isAdmin } from '../admins';
import { recheckAt } from '../checks/decisions';
import { checkNeynar, keptDecision, shown } from '../images/neynar';
import { isSocialPerson, isWalletPerson, socialAccountOf } from '../people';
import { socialAccount, type SocialAccountRow } from '../social/accounts';
import { lensDecision } from '../social/lens-check';
import { BLUESKY_CHECK_WORDING, blueskyDecision, keptBlueskyDecision, type BlueskyFacts } from '../social/bluesky-check';
import { FREE_WORDING } from '../social/free';
import { ASK_WORDING, type AccountKind } from './who-can-ask';

/**
 * Who may ask the assistant (step 1 of "the assistant for any account", owner 2026-11-05). Decided before anything is
 * counted: a refusal uses no question and calls no model. `person` is getPerson's answer, so a wallet, Lens or Bluesky
 * account linked to a Farcaster account is that FID here, and counts as it; a Bluesky account linked to a Lens account
 * is that Lens account (or its FID).
 *
 * - A FID (or an account linked to one): while ASSISTANT.anyAccount is off (today), asks with no check. When it is on
 *   (the owner's one rule, 2026-11-05), it must pass the Neynar score images use (IMAGES.neynarMinScore); invited FIDs
 *   and admins skip it, as they do for images.
 * - A wallet account (not linked): refused, 403, whichever switch (no payments for questions yet).
 * - A Lens or Bluesky account (not linked to a FID): refused, 403, while ASSISTANT.anyAccount is off (today). When it is
 *   on, it asks if its account passes its network's check, the same decision images use: the Lens score
 *   (SOCIAL_SIGN_IN.lens.minScore) or the Bluesky check (SOCIAL_SIGN_IN.bluesky.check), counted under its own number.
 *
 * When a network is asked: only at a question (`lookUp: true`, the ask route), and only when the account has no current
 * decision in studio.check_decisions under today's rule (a pass is kept 90 days, a fail a day; a decision made at an
 * image counts here, and one made here counts there). The status route (`lookUp: false`) never asks anyone: with no
 * decision yet it answers "can ask", and the question decides. What is sent: to Neynar the FID; to Lens's API the Lens account's address; to Bluesky's public AppView the account's DID.
 * Nothing else about the person or the question. Only the decision is kept, as for images.
 *
 * `deps` stand in for the networks in the tests only.
 */
type Sql = postgres.Sql;

export type AskRefusalReason =
  | 'wallet'
  | 'social-off'
  | 'neynar-score'
  | 'neynar-unreachable'
  | 'lens-not-open'
  | 'lens-score'
  | 'lens-unreachable'
  | 'bluesky-not-open'
  | 'bluesky-new'
  | 'bluesky-idle'
  | 'bluesky-failed'
  | 'bluesky-unreachable'
  | 'account-unreadable';

export type AskGate =
  | { ok: true; person: number; account: AccountKind }
  | { ok: false; status: 403 | 503; error: string; reason: AskRefusalReason; account: AccountKind };

export interface AskGateDeps {
  lensScore?: (address: string) => Promise<number | null>;
  bluesky?: (did: string) => Promise<BlueskyFacts>;
}

const no = (status: 403 | 503, reason: AskRefusalReason, error: string, account: AccountKind): AskGate => ({ ok: false, status, reason, error, account });

/**
 * `sql` may be null (a deployment without the database): a wallet, and a Lens or Bluesky account while anyAccount is
 * off, are refused without it, and a FID asks without it while anyAccount is off; anything that needs a decision
 * answers "can't check right now" (503). `signedInAs` is the sign-in's own kind, for the panel's words when the account
 * row can't be read.
 */
export async function mayAsk(sql: Sql | null, person: number, opts: { lookUp: boolean; deps?: AskGateDeps; signedInAs?: AccountKind | null }): Promise<AskGate> {
  if (person > 0) return farcaster(sql, person, opts.lookUp);
  if (isWalletPerson(person) || !isSocialPerson(person)) return no(403, 'wallet', ASK_WORDING.wallet(), 'wallet');
  let row: SocialAccountRow | null = null;
  let unreadable = !sql;
  if (sql) {
    try {
      row = await socialAccount(sql, socialAccountOf(person));
    } catch (e) {
      console.error('chat gate: account unreadable', (e as { code?: string }).code ?? (e as Error).name);
      unreadable = true;
    }
  }
  const kind: AccountKind = row ? (row.kind === 'bluesky' ? 'bluesky' : 'lens') : opts.signedInAs === 'bluesky' ? 'bluesky' : 'lens';
  // Today (anyAccount off): refused whatever the account, with no lookup and no database needed.
  if (!ASSISTANT.anyAccount) return no(403, 'social-off', ASK_WORDING.socialOff, kind);
  if (!sql || unreadable || !row) return no(503, 'account-unreadable', ASK_WORDING.accountUnreadable, kind);
  return row.kind === 'lens' ? lens(sql, person, row, opts) : bluesky(sql, person, row, opts);
}

async function farcaster(sql: Sql | null, fid: number, lookUp: boolean): Promise<AskGate> {
  const ok: AskGate = { ok: true, person: fid, account: 'farcaster' };
  if (!ASSISTANT.anyAccount || IMAGES.invited.includes(fid) || isAdmin(fid)) return ok;
  if (!sql) return no(503, 'neynar-unreachable', ASK_WORDING.neynarUnreachable, 'farcaster');
  const min = IMAGES.neynarMinScore;
  if (!lookUp) {
    // The status: a kept decision only, never Neynar. No decision (or the store unreadable): the question decides.
    const kept = await keptDecision(sql, fid, min).catch(() => null);
    if (kept && !kept.passed) return no(403, 'neynar-score', ASK_WORDING.neynarBelowKept(recheckAt(kept)), 'farcaster');
    return ok;
  }
  const r = await checkNeynar(sql, fid, min);
  if (!r.ok) {
    console.error('chat gate: Neynar check failed', r.why);
    return no(503, 'neynar-unreachable', ASK_WORDING.neynarUnreachable, 'farcaster');
  }
  if (r.passed) return ok;
  return no(403, 'neynar-score', r.score !== null ? ASK_WORDING.neynarBelow(shown(r.score)) : ASK_WORDING.neynarBelowKept(recheckAt(r)), 'farcaster');
}

async function lens(sql: Sql, person: number, row: SocialAccountRow, opts: { lookUp: boolean; deps?: AskGateDeps }): Promise<AskGate> {
  if (SOCIAL_SIGN_IN.lens.minScore === null) return no(403, 'lens-not-open', ASK_WORDING.lensNotOpen, 'lens');
  const d = await lensDecision(sql, row.subject, { lookUp: opts.lookUp, score: opts.deps?.lensScore });
  if (d === 'passed' || d === 'unknown') return { ok: true, person, account: 'lens' };
  if (d === 'unreachable') return no(503, 'lens-unreachable', FREE_WORDING.lensUnreachable, 'lens');
  return no(403, 'lens-score', ASK_WORDING.lensBelow(), 'lens');
}

async function bluesky(sql: Sql, person: number, row: SocialAccountRow, opts: { lookUp: boolean; deps?: AskGateDeps }): Promise<AskGate> {
  if (!SOCIAL_SIGN_IN.bluesky.check.on) return no(403, 'bluesky-not-open', ASK_WORDING.blueskyNotOpen, 'bluesky');
  const ok: AskGate = { ok: true, person, account: 'bluesky' };
  if (!opts.lookUp) {
    const kept = await keptBlueskyDecision(sql, row.subject).catch(() => null);
    return kept === 'failed' ? no(403, 'bluesky-failed', ASK_WORDING.blueskyFailed(), 'bluesky') : ok;
  }
  const d = opts.deps?.bluesky ? await blueskyDecision(sql, row, opts.deps.bluesky) : await blueskyDecision(sql, row);
  if (!d.ok) return no(503, 'bluesky-unreachable', BLUESKY_CHECK_WORDING.unreachable, 'bluesky');
  if (d.decision === 'passed') return ok;
  if (d.decision === 'new') return no(403, 'bluesky-new', ASK_WORDING.blueskyNew(), 'bluesky');
  if (d.decision === 'idle') return no(403, 'bluesky-idle', ASK_WORDING.blueskyIdle(), 'bluesky');
  return no(403, 'bluesky-failed', ASK_WORDING.blueskyFailed(), 'bluesky');
}
