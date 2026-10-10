import 'server-only';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Side } from '../play-game/game';
import type { LadderProgress, LobbyView, MatchView, Person } from '../play-game/live-types';
import { readProgress, recordResult } from './ladder';
import {
  RULES_VERSION, Refused, advance, askRematch, createMatch, leave, playTurn, resign, touch, type LiveMatch,
} from './match';
import { viewFor } from './view';

/**
 * Minpentai Play's rows (supabase/migrations/0009_minpentai_play.sql), through db() as
 * studio_writer. Every match change happens under the match row's lock (select … for update),
 * resolves what is due first (deadlines are lazy: any request on the match resolves them) and
 * bumps the version. Creating a match takes both players' advisory locks, in FID order, so a
 * player can't end up in two matches at once.
 *
 * Errors a person can act on are thrown as Refused(status, message).
 */
type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;

export const READY_MS = 3 * 60_000;
export const CHALLENGE_MS = 20_000;
export const INVITE_MS = 24 * 3600_000;
export const MAX_OPEN_INVITES = 5;
/** A poll writes the seen time only when it is this much older (fewer writes). */
const SEEN_WRITE_MS = 2_000;

const at = (ms: number) => new Date(ms);
const ms = (d: unknown) => (d instanceof Date ? d.getTime() : new Date(String(d)).getTime());
export const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isFid = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 2 ** 53;
const isToken = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(s);

// --- The ladder -------------------------------------------------------------------

export async function getLadder(sql: Sql, fid: number): Promise<LadderProgress> {
  const [r] = await sql`select opened, rec from studio.mp_progress where fid = ${fid}`;
  return r ? readProgress(r.opened, r.rec) : readProgress(1, {});
}

export async function postLadder(sql: Sql, fid: number, body: unknown): Promise<LadderProgress> {
  return sql.begin(async (tx) => {
    await tx`insert into studio.mp_progress (fid) values (${fid}) on conflict (fid) do nothing`;
    const [r] = await tx`select opened, rec from studio.mp_progress where fid = ${fid} for update`;
    const next = recordResult(readProgress(r.opened, r.rec), body);
    await tx`update studio.mp_progress set opened = ${next.opened}, rec = ${tx.json(next.rec as never)}, updated_at = now() where fid = ${fid}`;
    return next;
  });
}

// --- Blocks -------------------------------------------------------------------------

async function blockedEither(q: Tx | Sql, a: number, b: number): Promise<boolean> {
  const [r] = await q`select 1 from studio.mp_blocks where (fid = ${a} and blocked_fid = ${b}) or (fid = ${b} and blocked_fid = ${a}) limit 1`;
  return !!r;
}

export async function block(sql: Sql, fid: number, other: unknown): Promise<{ ok: true }> {
  if (!isFid(other)) throw new Refused(400, 'Bad FID');
  if (other === fid) throw new Refused(400, "You can't block yourself.");
  await sql.begin(async (tx) => {
    await tx`insert into studio.mp_blocks (fid, blocked_fid) values (${fid}, ${other}) on conflict do nothing`;
    await tx`update studio.mp_challenges set status = 'cancelled' where status = 'open'
      and ((from_fid = ${fid} and to_fid = ${other}) or (from_fid = ${other} and to_fid = ${fid}))`;
  });
  return { ok: true };
}

// --- The lobby ----------------------------------------------------------------------

export async function lobbyView(sql: Sql | Tx, fid: number, now: number): Promise<LobbyView> {
  const t = at(now);
  const [me] = await sql`select username, ready_until from studio.mp_lobby where fid = ${fid} and ready_until > ${t}`;
  const ready = await sql`select l.fid, l.username from studio.mp_lobby l
    where l.ready_until > ${t} and l.fid <> ${fid}
      and not exists (select 1 from studio.mp_blocks b where (b.fid = ${fid} and b.blocked_fid = l.fid) or (b.fid = l.fid and b.blocked_fid = ${fid}))
    order by l.ready_at desc, l.fid limit 100`;
  const incoming = await sql`select c.id, c.from_fid, c.from_username, c.expires_at from studio.mp_challenges c
    where c.to_fid = ${fid} and c.status = 'open' and c.expires_at > ${t}
      and not exists (select 1 from studio.mp_blocks b where (b.fid = ${fid} and b.blocked_fid = c.from_fid) or (b.fid = c.from_fid and b.blocked_fid = ${fid}))
    order by c.created_at desc`;
  const [out] = await sql`select id, to_fid, to_username, expires_at from studio.mp_challenges
    where from_fid = ${fid} and status = 'open' and expires_at > ${t} limit 1`;
  const [match] = await sql`select id from studio.mp_matches where status = 'live' and (fid_c = ${fid} or fid_a = ${fid}) order by created_at desc limit 1`;
  return {
    me: { ready: !!me, username: me ? String(me.username) : null, readyUntilMs: me ? ms(me.ready_until) : null },
    ready: ready.map((r) => ({ fid: Number(r.fid), username: String(r.username) })),
    incoming: incoming.map((c) => ({ id: String(c.id), from: { fid: Number(c.from_fid), username: String(c.from_username) }, msLeft: Math.max(0, ms(c.expires_at) - now) })),
    outgoing: out ? { id: String(out.id), to: { fid: Number(out.to_fid), username: String(out.to_username) }, msLeft: Math.max(0, ms(out.expires_at) - now) } : null,
    match: match ? { id: String(match.id) } : null,
    serverNow: now,
  };
}

/** Ready for 3 minutes (repeat to stay). `username` must already be verified by the caller. */
export async function goReady(sql: Sql, fid: number, username: string, now: number): Promise<LobbyView> {
  return sql.begin(async (tx) => {
    await lockFids(tx, [fid]);
    if (await liveMatchOf(tx, fid, now)) throw new Refused(409, 'Finish your match first.');
    await tx`insert into studio.mp_lobby (fid, username, ready_at, ready_until) values (${fid}, ${username}, ${at(now)}, ${at(now + READY_MS)})
      on conflict (fid) do update set username = excluded.username, ready_until = excluded.ready_until,
        ready_at = case when studio.mp_lobby.ready_until <= ${at(now)} then excluded.ready_at else studio.mp_lobby.ready_at end`;
    return lobbyView(tx, fid, now);
  });
}

export async function stopReady(sql: Sql, fid: number, now: number): Promise<LobbyView> {
  return sql.begin(async (tx) => {
    await tx`delete from studio.mp_lobby where fid = ${fid}`;
    await tx`update studio.mp_challenges set status = 'cancelled' where status = 'open' and (from_fid = ${fid} or to_fid = ${fid})`;
    return lobbyView(tx, fid, now);
  });
}

// --- Challenges ---------------------------------------------------------------------

export async function challenge(sql: Sql, fid: number, toFid: unknown, now: number): Promise<{ id: string }> {
  if (!isFid(toFid)) throw new Refused(400, 'Bad FID');
  if (toFid === fid) throw new Refused(400, "You can't challenge yourself.");
  return sql.begin(async (tx) => {
    await lockFids(tx, [fid]);
    const t = at(now);
    const [me] = await tx`select username from studio.mp_lobby where fid = ${fid} and ready_until > ${t}`;
    if (!me) throw new Refused(409, 'Mark yourself ready first.');
    const [them] = await tx`select username from studio.mp_lobby where fid = ${toFid} and ready_until > ${t}`;
    // A block reads exactly like someone who is no longer ready.
    if (!them || (await blockedEither(tx, fid, toFid))) throw new Refused(409, 'They are no longer ready.');
    await tx`update studio.mp_challenges set status = 'cancelled' where from_fid = ${fid} and status = 'open' and expires_at <= ${t}`;
    const [open] = await tx`select 1 from studio.mp_challenges where from_fid = ${fid} and status = 'open'`;
    if (open) throw new Refused(409, 'You already have a challenge waiting for an answer.');
    const id = randomUUID();
    await tx`insert into studio.mp_challenges ${tx({
      id, from_fid: fid, from_username: String(me.username), to_fid: toFid, to_username: String(them.username),
      created_at: t, expires_at: at(now + CHALLENGE_MS), status: 'open',
    })}`;
    return { id };
  });
}

export async function acceptChallenge(sql: Sql, fid: number, id: unknown, now: number): Promise<{ matchId: string }> {
  if (!isUuid(id)) throw new Refused(404, 'No such challenge');
  return sql.begin(async (tx) => {
    const [c0] = await tx`select from_fid from studio.mp_challenges where id = ${id} and to_fid = ${fid}`;
    if (!c0) throw new Refused(404, 'No such challenge');
    const from = Number(c0.from_fid);
    await lockFids(tx, [fid, from]);
    const [c] = await tx`select * from studio.mp_challenges where id = ${id} for update`;
    if (c.status !== 'open' || ms(c.expires_at) <= now || (await blockedEither(tx, fid, from))) throw new Refused(409, 'This challenge is no longer open.');
    if (await liveMatchOf(tx, fid, now)) throw new Refused(409, 'Finish your match first.');
    if (await liveMatchOf(tx, from, now)) throw new Refused(409, 'They are in another match now.');
    // The challenger plays Cyan; the one who accepts plays Amber.
    const matchId = await insertMatch(tx, { fid: from, username: String(c.from_username) }, { fid, username: String(c.to_username) }, now, null);
    await tx`update studio.mp_challenges set status = 'accepted', match_id = ${matchId} where id = ${id}`;
    await clearLobby(tx, [fid, from]);
    return { matchId };
  });
}

/** Decline a challenge to me, or take back my own. */
export async function declineChallenge(sql: Sql, fid: number, id: unknown): Promise<{ ok: true }> {
  if (!isUuid(id)) throw new Refused(404, 'No such challenge');
  const r = await sql`update studio.mp_challenges set status = case when to_fid = ${fid} then 'declined' else 'cancelled' end
    where id = ${id} and status = 'open' and (to_fid = ${fid} or from_fid = ${fid}) returning id`;
  if (!r.length) {
    const [c] = await sql`select 1 from studio.mp_challenges where id = ${id} and (to_fid = ${fid} or from_fid = ${fid})`;
    if (!c) throw new Refused(404, 'No such challenge');
  }
  return { ok: true };
}

// --- Invites ------------------------------------------------------------------------

export async function createInvite(sql: Sql, fid: number, username: string, now: number): Promise<{ token: string }> {
  return sql.begin(async (tx) => {
    await lockFids(tx, [fid]);
    const [n] = await tx`select count(*)::int as n from studio.mp_invites where from_fid = ${fid} and used_by is null and expires_at > ${at(now)}`;
    if (n.n >= MAX_OPEN_INVITES) throw new Refused(429, `You have ${MAX_OPEN_INVITES} invite links waiting. Each lasts 24 hours.`);
    const token = randomBytes(16).toString('base64url');
    await tx`insert into studio.mp_invites ${tx({ token, from_fid: fid, from_username: username, created_at: at(now), expires_at: at(now + INVITE_MS) })}`;
    return { token };
  });
}

export async function readInvite(sql: Sql, fid: number, token: unknown, now: number): Promise<{ from: Person; open: boolean }> {
  if (!isToken(token)) throw new Refused(404, 'This invite link is not valid.');
  const [i] = await sql`select * from studio.mp_invites where token = ${token}`;
  if (!i) throw new Refused(404, 'This invite link is not valid.');
  const from = Number(i.from_fid);
  // A block reads exactly like a used invite.
  const open = i.used_by === null && ms(i.expires_at) > now && !(from !== fid && (await blockedEither(sql, fid, from)));
  return { from: { fid: from, username: String(i.from_username) }, open };
}

/** `username` must already be verified by the caller. The inviter plays Cyan. */
export async function acceptInvite(sql: Sql, fid: number, username: string, token: unknown, now: number): Promise<{ matchId: string }> {
  if (!isToken(token)) throw new Refused(404, 'This invite link is not valid.');
  return sql.begin(async (tx) => {
    const [i0] = await tx`select from_fid from studio.mp_invites where token = ${token}`;
    if (!i0) throw new Refused(404, 'This invite link is not valid.');
    const from = Number(i0.from_fid);
    if (from === fid) throw new Refused(400, 'This is your own invite. Send the link to someone else.');
    await lockFids(tx, [fid, from]);
    const [i] = await tx`select * from studio.mp_invites where token = ${token} for update`;
    if (i.used_by !== null || ms(i.expires_at) <= now || (await blockedEither(tx, fid, from))) throw new Refused(409, 'This invite is no longer open.');
    if (await liveMatchOf(tx, fid, now)) throw new Refused(409, 'Finish your match first.');
    if (await liveMatchOf(tx, from, now)) throw new Refused(409, 'They are in another match now. Try the link again later.');
    const matchId = await insertMatch(tx, { fid: from, username: String(i.from_username) }, { fid, username }, now, null);
    await tx`update studio.mp_invites set used_by = ${fid}, used_at = ${at(now)}, match_id = ${matchId} where token = ${token}`;
    await clearLobby(tx, [fid, from]);
    return { matchId };
  });
}

// --- Matches ------------------------------------------------------------------------

async function lockFids(tx: Tx, fids: number[]) {
  for (const f of [...new Set(fids)].sort((a, b) => a - b)) {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.minpentai.play'), (${f}::bigint % 2147483647)::int)`;
  }
}

async function clearLobby(tx: Tx, fids: number[]) {
  await tx`delete from studio.mp_lobby where fid in ${tx(fids)}`;
  await tx`update studio.mp_challenges set status = 'cancelled' where status = 'open' and (from_fid in ${tx(fids)} or to_fid in ${tx(fids)})`;
}

type Row = Record<string, unknown>;
interface Loaded { row: Row; m: LiveMatch; version: number }

function load(row: Row): Loaded {
  const m = row.state as LiveMatch;
  m.seen = { C: ms(row.last_seen_c), A: ms(row.last_seen_a) };
  return { row, m, version: Number(row.version) };
}

const stored = (m: LiveMatch) => ({ ...m, seen: undefined });

async function save(tx: Tx, l: Loaded, changed: boolean) {
  const { m, row } = l;
  const seenC = at(m.seen.C), seenA = at(m.seen.A);
  if (!changed) {
    if (m.seen.C - ms(row.last_seen_c) >= SEEN_WRITE_MS || m.seen.A - ms(row.last_seen_a) >= SEEN_WRITE_MS) {
      await tx`update studio.mp_matches set last_seen_c = ${seenC}, last_seen_a = ${seenA} where id = ${String(row.id)}`;
    }
    return;
  }
  const status = !m.over ? 'live' : m.over.kind === 'cancelled' ? 'cancelled' : 'over';
  const [r] = await tx`update studio.mp_matches set
      state = ${tx.json(stored(m) as never)}, version = version + 1, status = ${status},
      act_deadline = ${m.over ? null : at(m.deadline)}, last_seen_c = ${seenC}, last_seen_a = ${seenA},
      result = ${m.over ? tx.json(m.over as never) : null}, ended_at = ${m.over ? at(m.over.at) : null}
    where id = ${String(row.id)} returning version`;
  l.version = Number(r.version);
}

async function insertMatch(tx: Tx, c: Person, a: Person, now: number, rematchOf: string | null): Promise<string> {
  const seed = randomInt(0, 2 ** 32);
  const m = createMatch(seed, now);
  const id = randomUUID();
  await tx`insert into studio.mp_matches ${tx({
    id, fid_c: c.fid, fid_a: a.fid, username_c: c.username, username_a: a.username,
    rules_version: RULES_VERSION, rule: m.rule, seed, status: 'live', version: 1,
    state: tx.json(stored(m) as never), act_deadline: at(m.deadline),
    last_seen_c: at(now), last_seen_a: at(now), rematch_of: rematchOf, created_at: at(now),
  })}`;
  return id;
}

/** The player's match that has not ended, after resolving what is due (a stale match may end here). */
async function liveMatchOf(tx: Tx, fid: number, now: number): Promise<string | null> {
  const rows = await tx`select * from studio.mp_matches where status = 'live' and (fid_c = ${fid} or fid_a = ${fid}) order by created_at for update`;
  let live: string | null = null;
  for (const row of rows) {
    const l = load(row);
    // Not a request from either player, so nobody's seen time moves.
    const changed = advance(l.m, now);
    await save(tx, l, changed);
    if (!l.m.over) live = String(row.id);
  }
  return live;
}

function sideOf(row: Row, fid: number): Side | null {
  return Number(row.fid_c) === fid ? 'C' : Number(row.fid_a) === fid ? 'A' : null;
}

function opponentOf(row: Row, side: Side): Person {
  return side === 'C' ? { fid: Number(row.fid_a), username: String(row.username_a) } : { fid: Number(row.fid_c), username: String(row.username_c) };
}

export type MatchAction = 'turn' | 'resign' | 'leave' | 'rematch';

/**
 * GET (action null; returns 'unchanged' when `v` is the current version) or one of the actions,
 * under the match's row lock. Every call counts as the player being there.
 */
export async function onMatch(sql: Sql, fid: number, id: unknown, now: number, action: MatchAction | null, body?: unknown, v?: number | null): Promise<MatchView | 'unchanged'> {
  if (!isUuid(id)) throw new Refused(404, 'No such match');
  const out = await sql.begin(async (tx): Promise<MatchView | 'unchanged' | Refused> => {
    const [row] = await tx`select * from studio.mp_matches where id = ${id} for update`;
    const side = row ? sideOf(row, fid) : null;
    if (!row || !side) return new Refused(404, 'No such match');
    const l = load(row);
    let changed = touch(l.m, side, now);
    try {
      if (action === 'turn') { playTurn(l.m, side, body, now); changed = true; }
      else if (action === 'resign') { resign(l.m, side, now); changed = true; }
      else if (action === 'leave') { leave(l.m, side, now); changed = true; }
      else if (action === 'rematch') {
        const before = JSON.stringify(l.m.rm);
        const both = askRematch(l.m, side, now);
        changed = changed || JSON.stringify(l.m.rm) !== before;
        if (both) {
          const c = { fid: Number(row.fid_c), username: String(row.username_c) }, a = { fid: Number(row.fid_a), username: String(row.username_a) };
          await lockFids(tx, [c.fid, a.fid]);
          if (await blockedEither(tx, c.fid, a.fid)) throw new Refused(409, 'No rematch after this match.');
          if ((await liveMatchOf(tx, c.fid, now)) || (await liveMatchOf(tx, a.fid, now))) throw new Refused(409, 'One of you is in another match now.');
          l.m.rm!.matchId = await insertMatch(tx, c, a, now, String(row.id));
          await clearLobby(tx, [c.fid, a.fid]);
          changed = true;
        }
      }
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      // A refused action still records that the player was there, and whatever came due.
      await save(tx, l, changed);
      return e;
    }
    await save(tx, l, changed);
    if (action === null && v !== undefined && v !== null && v === l.version) return 'unchanged';
    return viewFor(l.m, side, now, { id: String(row.id), version: l.version, opponent: opponentOf(row, side) });
  });
  if (out instanceof Refused) throw out;
  return out;
}
