import 'server-only';
import { after } from 'next/server';
import { ToolInputError } from '../../agent/tools';
import { appUrl } from '../../config';
import { joinPractice, runClock, sideOf, SoloError, type SoloMatch } from './solo';
import { lookupName } from '../../names';
import type { Side } from '../versions/engine';
import { liveCount, load, save, StoreError } from './store';
import { planSoon, settle } from './quiet';

/**
 * Reading and changing one person's match, the same way for the connector's tools and the live page's Take turn
 * (owner, 2026-11-03: "same quiet-time rules as the tools").
 */
export const NOT_YOURS = 'no match of yours with that id (see minpentai_list_my_matches)';

/** One of the person's matches, after its quiet time (quiet.ts settle): a call's timing says nothing about planning. */
export async function mineFor(person: number, id: unknown): Promise<{ m: SoloMatch; version: number; side: Side }> {
  if (typeof id !== 'string') throw new ToolInputError('match_id must be a match id');
  // Someone else's match, or none, is told so at once: its timing is not this person's to learn from.
  const peek = await load(id);
  const side = peek ? sideOf(peek.m, person) : null;
  if (!peek || !side) throw new ToolInputError(NOT_YOURS);
  const r = peek.m.versus ? await clocked(id) : await settle(id);
  if (!r) throw new ToolInputError(NOT_YOURS);
  return { ...r, side };
}

/**
 * A practice match, read with its clock run (solo.ts runClock): an overdue turn is played for the side that is late,
 * saved, and the players are told, before anything else is answered.
 */
export async function clocked(id: string): Promise<{ m: SoloMatch; version: number; played?: true } | null> {
  for (let i = 0; i < 4; i++) {
    const r = await load(id);
    if (!r || !r.m.versus) return r;
    const turn = r.m.turn;
    if (!runClock(r.m, new Date().toISOString())) return r;
    try {
      await save(r.m, r.version);
      if (r.m.turn !== turn || r.m.end) notifyTurn(r.m);
      return { m: r.m, version: r.version + 1, played: true };
    } catch (e) {
      if (!(e instanceof StoreError)) throw e;
    }
  }
  return load(id);
}

/**
 * "Your turn" (owner, 2026-11-03): to each player who opted in, a short alert on their own private ntfy topic, sent
 * after the answer. It says only that a turn opened (or the match ended), with a link to their matches: no board, no
 * orders, no names.
 */
export function notifyTurn(m: SoloMatch) {
  const v = m.versus;
  if (!v) return;
  const topics = (['C', 'A'] as const).map((side) => v.notify[side]).filter((t): t is string => !!t);
  if (!topics.length) return;
  const text = m.end ? 'Your Minpentai practice match has ended.' : 'Your turn in a Minpentai practice match.';
  after(async () => {
    for (const t of topics) await fetch(`https://ntfy.sh/${t}`, { method: 'POST', body: text, headers: { Click: `${appUrl()}/minpentai/practice`, Title: 'Snowmoon' } }).catch(() => undefined);
  });
}

/**
 * Runs a change on one of the person's matches and saves it; the engine's words come back as the error. A save that
 * meets another (the computer's plan being stored) is tried again on the fresh match, never shown. If the change opened
 * a new turn, the computer plans it just after this answer is sent.
 */
export async function changeFor<T>(person: number, id: unknown, f: (m: SoloMatch, side: Side) => T): Promise<T> {
  let r = await mineFor(person, id);
  for (let i = 0; ; i++) {
    const { m, version, side } = r;
    const turn = m.turn, over = !!m.end;
    let out: T;
    try { out = f(m, side); } catch (e) { if (e instanceof SoloError) throw new ToolInputError(e.message); throw e; }
    try {
      await save(m, version);
      if (m.turn !== turn && !m.end && !over) planSoon(m.id);
      if ((m.turn !== turn || (m.end && !over)) && m.versus) notifyTurn(m);
      return out;
    } catch (e) {
      if (!(e instanceof StoreError) || i >= 4) throw e instanceof StoreError ? new ToolInputError('Something went wrong on our side. Try again in a moment.') : e;
      const again = await load(m.id);
      if (!again) throw new ToolInputError(NOT_YOURS);
      r = { ...again, side };
    }
  }
}

/** A person's name as the other player sees it: their Farcaster name, or "a wallet account". */
export async function nameOf(person: number): Promise<string> {
  if (person > 0) return (await lookupName(person).catch(() => null)) ?? `FID ${person}`;
  return 'a wallet account';
}

/** At most this many unfinished matches a person has at once, against the computer and people together. */
export const MAX_LIVE = 5;

/** Joins a practice match as Amber (tool or page): checks, saves with retries, returns the match and Amber's link secret. */
export async function joinFor(person: number, o: { matchId: unknown; invite?: string; showName: boolean; agent: SoloMatch['agent'] }): Promise<{ m: SoloMatch; secret: string }> {
  if ((await liveCount(person)) >= MAX_LIVE) throw new ToolInputError(`you already have ${MAX_LIVE} live matches; finish or resign one first`);
  const name = await nameOf(person);
  for (let i = 0; ; i++) {
    const r = typeof o.matchId === 'string' ? await load(o.matchId) : null;
    if (!r || !r.m.versus) throw new ToolInputError('no practice match waiting for a player with that id');
    let secret: string;
    try { secret = joinPractice(r.m, { person, name, showName: o.showName, agent: o.agent, invite: o.invite, now: new Date().toISOString() }); } catch (e) { if (e instanceof SoloError) throw new ToolInputError(e.message); throw e; }
    try {
      await save(r.m, r.version);
      return { m: r.m, secret };
    } catch (e) {
      if (!(e instanceof StoreError) || i >= 3) throw e instanceof StoreError ? new ToolInputError('Something went wrong on our side. Try again in a moment.') : e;
    }
  }
}
