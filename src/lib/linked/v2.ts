import type postgres from 'postgres';
import { IMAGES, LINKED_ACCOUNTS } from '../config';
import { V2_REFUSALS, type V2Why } from './v2-wording';

/**
 * Linked accounts v2 (owner, 2026-11-05; docs/proposals/linked-accounts-v2.md on designs-2026-11-05; migration
 * NEXT_linked_accounts). DRAFT, behind LINKED_ACCOUNTS.enabled (off): with the switch off every action here answers
 * 'off' and touches nothing. Drafted by a coding agent (Claude, a closed model by Anthropic).
 *
 * The Snowmoon account (studio.people) OWNS its rows: each row carries the sign-in number that made it and the owner
 * stamp (person_id; for public tables, studio.row_owners). Sign-ins are ways in. The main sign-in (studio.person_mains,
 * the latest row) alone links and unlinks others, chooses another main, claims a prize and gives its payout address,
 * and joins the account to another (with that one's main). Any sign-in makes, spends, asks for a new main and unlinks
 * itself; a social sign-in also submits. Unlinking moves nothing. A sign-in that was unlinked can neither join another
 * Snowmoon account nor start one for 30 days (A2), and may rejoin its own at once. A5: 2 moves in 365 days. A6: one
 * Farcaster, Lens and Bluesky account and 3 wallets. A8: 10 link attempts a day. A request for a new main takes effect
 * 30 days after it was made unless the main cancels it (no notification is sent: design only). The database refuses
 * the same things (triggers and indexes in the migration) as a backstop.
 *
 * Dates come from the caller (`now`), so the tests can walk the owner's chain across months; routes pass new Date().
 * Every action locks the Snowmoon accounts it touches, in ascending id order, and checks again inside the transaction.
 */

export type Kind = 'farcaster' | 'wallet' | 'lens' | 'bluesky';
type Row = Record<string, unknown>;

/** The database, as the actions need it: postgres.js in the app, PGlite in the tests. */
export type Db = {
  q<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
};

export function fromPostgres(sql: postgres.Sql | postgres.TransactionSql): Db {
  return {
    q: async <T extends Row>(text: string, params: unknown[] = []) => (await sql.unsafe(text, params as never[])) as unknown as T[],
    tx: async <T>(fn: (db: Db) => Promise<T>) =>
      'begin' in sql ? ((await (sql as postgres.Sql).begin((t) => fn(fromPostgres(t)))) as T) : fn(fromPostgres(sql)),
  };
}

export type Config = Pick<typeof LINKED_ACCOUNTS, 'enabled' | 'relinkWaitDays' | 'maxMoves' | 'movesWindowDays' | 'maxWallets' | 'linkAttemptsPerDay'>;
export type Refused = { ok: false; why: V2Why; message: string; until?: Date };
export type Done<T = object> = { ok: true } & T;
export type Result<T = object> = Done<T> | Refused;

const DAY = 86_400_000;
const no = (why: V2Why, until?: Date): Refused => ({ ok: false, why, message: V2_REFUSALS[why](until), ...(until ? { until } : {}) });
const OFF = no('off');
const recoveryDays = 30;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date) => d.toISOString();

/** The kind of a sign-in number (src/lib/people.ts): FID > 0; wallet −id; Lens/Bluesky −(10⁹ + id). */
export async function kindOf(db: Db, n: number): Promise<Kind | null> {
  if (n > 0) return 'farcaster';
  if (n < 0 && n > -1e9) return 'wallet';
  if (n > -1e9) return null;
  const [r] = await db.q<{ kind: string }>(`select kind from studio.social_accounts where id = $1`, [-n - 1e9]);
  return r?.kind === 'lens' || r?.kind === 'bluesky' ? r.kind : null;
}
export const isSocial = (k: Kind | null) => k === 'farcaster' || k === 'lens' || k === 'bluesky';

/** The Snowmoon account a sign-in is a way into now, or null. */
export async function accountOf(db: Db, n: number): Promise<number | null> {
  const [r] = await db.q<{ p: string }>(`select person_id as p from studio.person_accounts where account = $1 and unlinked_at is null`, [n]);
  return num(r?.p);
}

export async function signInsOf(db: Db, p: number): Promise<{ account: number; kind: Kind; linkedAt: Date }[]> {
  const rows = await db.q<{ account: string; kind: Kind; linked_at: Date }>(
    `select account, kind, linked_at from studio.person_accounts where person_id = $1 and unlinked_at is null order by linked_at, id`,
    [p],
  );
  return rows.map((r) => ({ account: Number(r.account), kind: r.kind, linkedAt: new Date(r.linked_at) }));
}

async function lock(db: Db, ...people: number[]) {
  // A transaction-scoped advisory lock per Snowmoon account (studio_writer can't update studio.people, so no row lock).
  for (const p of [...new Set(people)].sort((a, b) => a - b)) await db.q(`select pg_advisory_xact_lock(52810, $1::int)`, [p]);
}

/** A request for a new main that is due takes effect (at its effective time). */
async function settle(db: Db, p: number, now: Date) {
  const [r] = await db.q<{ id: string; new_main: string; effective_at: Date }>(
    `select id, new_main, effective_at from studio.main_requests where person_id = $1 and ended_at is null and effective_at <= $2`,
    [p, iso(now)],
  );
  if (!r) return;
  await db.q(`update studio.main_requests set ended_at = effective_at, ended_how = 'done' where id = $1`, [r.id]);
  await db.q(`insert into studio.person_mains (person_id, account, how, at) values ($1, $2, 'recovery', $3)`, [p, r.new_main, iso(new Date(r.effective_at))]);
}

/** The main sign-in now (a due recovery request first takes effect). */
export async function mainOf(db: Db, p: number, now: Date): Promise<number | null> {
  await settle(db, p, now);
  const [r] = await db.q<{ m: string }>(`select studio.main_of($1) as m`, [p]);
  return num(r?.m);
}

/** The last time this sign-in left a Snowmoon account (not by a join), and which one. */
async function lastLeft(db: Db, n: number): Promise<{ person: number; at: Date } | null> {
  const [r] = await db.q<{ person_id: string; unlinked_at: Date; ended_by: string }>(
    `select person_id, unlinked_at, ended_by from studio.person_accounts where account = $1 and unlinked_at is not null order by unlinked_at desc, id desc limit 1`,
    [n],
  );
  return r && r.ended_by !== 'joined' ? { person: Number(r.person_id), at: new Date(r.unlinked_at) } : null;
}

/** A2: until when this sign-in can't join `into` (null: it can). Rejoining the account it left has no wait. */
async function waitUntil(db: Db, n: number, into: number | null, now: Date, cfg: Config): Promise<Date | null> {
  const left = await lastLeft(db, n);
  if (!left || left.person === into) return null;
  const until = new Date(left.at.getTime() + cfg.relinkWaitDays * DAY);
  return now < until ? until : null;
}

/** A5: moves in the window, counting this one; a rejoin of the account it left isn't a move. */
async function movesBlockedUntil(db: Db, n: number, into: number, now: Date, cfg: Config): Promise<Date | null> {
  const left = await lastLeft(db, n);
  if (left?.person === into) return null;
  const rows = await db.q<{ linked_at: Date }>(
    `select a.linked_at from studio.person_accounts a
     where a.account = $1 and a.how in ('signed', 'verified', 'joined') and a.linked_at > $2
       and not exists (select 1 from studio.person_accounts b where b.account = a.account and b.unlinked_at is not null
                       and b.unlinked_at <= a.linked_at and b.person_id = a.person_id)
     order by a.linked_at`,
    [n, iso(new Date(now.getTime() - cfg.movesWindowDays * DAY))],
  );
  if (rows.length < cfg.maxMoves) return null;
  return new Date(new Date(rows[rows.length - cfg.maxMoves].linked_at).getTime() + cfg.movesWindowDays * DAY);
}

/** Only the main sign-in: the actor's Snowmoon account, or the refusal. */
async function asMain(db: Db, actor: number, now: Date): Promise<Result<{ person: number }>> {
  const p = await accountOf(db, actor);
  if (p === null) return no('not-linked');
  await lock(db, p);
  if ((await mainOf(db, p, now)) !== actor) return no('not-main');
  return { ok: true, person: p };
}

async function kindRoom(db: Db, p: number, kind: Kind, cfg: Config): Promise<V2Why | null> {
  const ins = await signInsOf(db, p);
  if (kind === 'wallet') return ins.filter((s) => s.kind === 'wallet').length >= cfg.maxWallets ? 'wallets' : null;
  return ins.some((s) => s.kind === kind) ? 'kind-taken' : null;
}

const NAME_ORDER: Kind[] = ['farcaster', 'lens', 'bluesky', 'wallet'];

// --- Signing in ------------------------------------------------------------------------------------------------------

/**
 * Signing in alone with a sign-in: its Snowmoon account, or a new one (it becomes the main and the name) unless it left
 * one less than 30 days ago. A new account's earlier unstamped rows are then stamped with it.
 */
export async function signIn(db: Db, n: number, now: Date, cfg: Config = LINKED_ACCOUNTS): Promise<Result<{ person: number; created: boolean }>> {
  if (!cfg.enabled) return OFF;
  return db.tx(async (t) => {
    const p = await accountOf(t, n);
    if (p !== null) return { ok: true, person: p, created: false };
    const kind = await kindOf(t, n);
    if (!kind) return no('not-linked');
    // It left a Snowmoon account that has no sign-in left (it was the only one): signing in with it rejoins that one,
    // at once (owner, T10), as its main.
    const left = await lastLeft(t, n);
    if (left && (await signInsOf(t, left.person)).length === 0) {
      await lock(t, left.person);
      await t.q(`insert into studio.person_accounts (person_id, kind, account, how, linked_at) values ($1, $2, $3, 'signed', $4)`, [left.person, kind, n, iso(now)]);
      if ((await mainOf(t, left.person, now)) !== n)
        await t.q(`insert into studio.person_mains (person_id, account, how, by_account, at) values ($1, $2, 'next', $2, $3)`, [left.person, n, iso(now)]);
      return { ok: true, person: left.person, created: false };
    }
    const until = await waitUntil(t, n, null, now, cfg);
    if (until) return no('wait-start', until);
    const [{ id }] = await t.q<{ id: string }>(`insert into studio.people (created_at) values ($1) returning id`, [iso(now)]);
    const person = Number(id);
    await t.q(`insert into studio.person_accounts (person_id, kind, account, how, linked_at) values ($1, $2, $3, 'first', $4)`, [person, kind, n, iso(now)]);
    await t.q(`insert into studio.person_mains (person_id, account, how, at) values ($1, $2, 'first', $3)`, [person, n, iso(now)]);
    await t.q(`insert into studio.person_names (person_id, account, at) values ($1, $2, $3)`, [person, n, iso(now)]);
    await t.q(`select studio.stamp_unowned($1)`, [n]);
    return { ok: true, person, created: true };
  });
}

// --- Main-only actions ---------------------------------------------------------------------------------------------

/** The main links a sign-in that is in no Snowmoon account (both proofs are checked by the route before this). */
export async function link(db: Db, a: { actor: number; add: number; now: Date; how?: 'signed' | 'verified'; address?: string }, cfg: Config = LINKED_ACCOUNTS): Promise<Result> {
  if (!cfg.enabled) return OFF;
  // A8: the project's pay-to address never links.
  if (a.address && IMAGES.prepaid.payTo && a.address.toLowerCase() === IMAGES.prepaid.payTo.toLowerCase()) return no('payment-address');
  return db.tx(async (t) => {
    const m = await asMain(t, a.actor, a.now);
    if (!m.ok) return m;
    const p = m.person;
    await t.q(`insert into studio.person_link_attempts (person_id, at) values ($1, $2)`, [p, iso(a.now)]);
    const [{ n }] = await t.q<{ n: string }>(`select count(*) as n from studio.person_link_attempts where person_id = $1 and at > $2`, [p, iso(new Date(a.now.getTime() - DAY))]);
    if (Number(n) > cfg.linkAttemptsPerDay) return no('attempts');
    const kind = await kindOf(t, a.add);
    if (!kind) return no('not-linked');
    const there = await accountOf(t, a.add);
    if (there === p) return { ok: true };
    if (there !== null) return no('has-account');
    const room = await kindRoom(t, p, kind, cfg);
    if (room) return no(room);
    const wait = await waitUntil(t, a.add, p, a.now, cfg);
    if (wait) return no('wait-join', wait);
    const moves = await movesBlockedUntil(t, a.add, p, a.now, cfg);
    if (moves) return no('moves', moves);
    await t.q(`insert into studio.person_accounts (person_id, kind, account, how, linked_at) values ($1, $2, $3, $4, $5)`, [p, kind, a.add, a.how ?? 'signed', iso(a.now)]);
    // What it made before, with no Snowmoon account, now belongs to this one ("before and after linking").
    await t.q(`select studio.stamp_unowned($1)`, [a.add]);
    return { ok: true };
  });
}

/** The main chooses another main. */
export async function chooseMain(db: Db, a: { actor: number; to: number; now: Date }, cfg: Config = LINKED_ACCOUNTS): Promise<Result> {
  if (!cfg.enabled) return OFF;
  return db.tx(async (t) => {
    const m = await asMain(t, a.actor, a.now);
    if (!m.ok) return m;
    if ((await accountOf(t, a.to)) !== m.person) return no('not-linked');
    await t.q(`insert into studio.person_mains (person_id, account, how, by_account, at) values ($1, $2, 'chosen', $3, $4)`, [m.person, a.to, a.actor, iso(a.now)]);
    return { ok: true };
  });
}

/**
 * Unlink: any sign-in may unlink itself (the main first names the next main, by default the oldest remaining); only
 * the main unlinks another, and never the last one. Nothing moves; a request by or for it ends; the name moves on.
 */
export async function unlink(db: Db, a: { actor: number; target: number; now: Date; nextMain?: number }, cfg: Config = LINKED_ACCOUNTS): Promise<Result> {
  if (!cfg.enabled) return OFF;
  return db.tx(async (t) => {
    const p = await accountOf(t, a.actor);
    if (p === null) return no('not-linked');
    await lock(t, p);
    if ((await accountOf(t, a.target)) !== p) return no('not-linked');
    const main = await mainOf(t, p, a.now);
    const self = a.actor === a.target;
    if (!self && main !== a.actor) return no('not-main');
    const rest = (await signInsOf(t, p)).filter((s) => s.account !== a.target);
    if (!self && rest.length === 0) return no('last-sign-in');
    if (a.target === main && rest.length > 0) {
      const next = a.nextMain ?? rest[0].account;
      if (!rest.some((s) => s.account === next)) return no('not-linked');
      await t.q(`insert into studio.person_mains (person_id, account, how, by_account, at) values ($1, $2, 'next', $3, $4)`, [p, next, a.actor, iso(a.now)]);
    }
    await t.q(
      `update studio.main_requests set ended_at = $2, ended_how = 'unlinked', ended_by = $3 where person_id = $1 and ended_at is null and (requested_by = $4 or new_main = $4)`,
      [p, iso(a.now), a.actor, a.target],
    );
    const [name] = await t.q<{ account: string }>(`select account from studio.person_names where person_id = $1 order by at desc, id desc limit 1`, [p]);
    if (name && Number(name.account) === a.target && rest.length > 0) {
      const next = [...rest].sort((x, y) => NAME_ORDER.indexOf(x.kind) - NAME_ORDER.indexOf(y.kind))[0];
      await t.q(`insert into studio.person_names (person_id, account, by_account, at) values ($1, $2, $3, $4)`, [p, next.account, a.actor, iso(a.now)]);
    }
    await t.q(`update studio.person_accounts set unlinked_at = $2, ended_by = $3, ended_via = $4 where account = $1 and unlinked_at is null`, [
      a.target, iso(a.now), self ? 'self' : 'main', a.actor,
    ]);
    return { ok: true };
  });
}

/** A prize claim, or a new payout address for it: the main sign-in only (the database checks it again). */
export async function claimPrize(db: Db, a: { actor: number; challenge: string; versionId: string; payout: string; now: Date }, cfg: Config = LINKED_ACCOUNTS): Promise<Result> {
  if (!cfg.enabled) return OFF;
  return db.tx(async (t) => {
    const m = await asMain(t, a.actor, a.now);
    if (!m.ok) return m;
    await t.q(`insert into studio.prize_claims (challenge, version_id, person_id, claimed_via, payout_address, at) values ($1, $2, $3, $4, $5, $6)`, [
      a.challenge, a.versionId, m.person, a.actor, a.payout.toLowerCase(), iso(a.now),
    ]);
    return { ok: true };
  });
}
export const setPayout = claimPrize;

/**
 * Joining two Snowmoon accounts: the main of each, in one request. The older survives; the other's sign-ins move to it
 * (A6, A2 and A5 checked for each); its rows keep their stamp and resolve through studio.person_joins.
 */
export async function join(db: Db, a: { actor: number; other: number; now: Date }, cfg: Config = LINKED_ACCOUNTS): Promise<Result<{ into: number }>> {
  if (!cfg.enabled) return OFF;
  return db.tx(async (t) => {
    const p = await accountOf(t, a.actor);
    const q = await accountOf(t, a.other);
    if (p === null || q === null) return no('not-linked');
    if (p === q) return no('same-account');
    await lock(t, p, q);
    if ((await mainOf(t, p, a.now)) !== a.actor || (await mainOf(t, q, a.now)) !== a.other) return no('not-main');
    const [into, from] = p < q ? [p, q] : [q, p];
    const moving = await signInsOf(t, from);
    const staying = await signInsOf(t, into);
    for (const k of ['farcaster', 'lens', 'bluesky'] as Kind[]) if (moving.some((s) => s.kind === k) && staying.some((s) => s.kind === k)) return no('kind-taken');
    if (moving.filter((s) => s.kind === 'wallet').length + staying.filter((s) => s.kind === 'wallet').length > cfg.maxWallets) return no('wallets');
    for (const s of moving) {
      const moves = await movesBlockedUntil(t, s.account, into, a.now, cfg);
      if (moves) return no('moves', moves);
    }
    const intoMain = (await mainOf(t, into, a.now))!;
    const fromMain = (await mainOf(t, from, a.now))!;
    await t.q(`insert into studio.person_joins (from_person, into_person, from_main, into_main, at) values ($1, $2, $3, $4, $5)`, [from, into, fromMain, intoMain, iso(a.now)]);
    await t.q(`update studio.main_requests set ended_at = $2, ended_how = 'unlinked', ended_by = $3 where person_id = $1 and ended_at is null`, [from, iso(a.now), a.actor]);
    for (const s of moving) {
      await t.q(`update studio.person_accounts set unlinked_at = $2, ended_by = 'joined', ended_via = $3 where account = $1 and unlinked_at is null`, [s.account, iso(a.now), a.actor]);
      await t.q(`insert into studio.person_accounts (person_id, kind, account, how, linked_at) values ($1, $2, $3, 'joined', $4)`, [into, s.kind, s.account, iso(a.now)]);
    }
    return { ok: true, into };
  });
}

// --- Recovery ------------------------------------------------------------------------------------------------------

/** A sign-in that isn't main asks for a new main (itself or another sign-in). No notification is sent (design only). */
export async function requestMain(db: Db, a: { actor: number; newMain?: number; now: Date }, cfg: Config = LINKED_ACCOUNTS): Promise<Result<{ effective: Date }>> {
  if (!cfg.enabled) return OFF;
  return db.tx(async (t) => {
    const p = await accountOf(t, a.actor);
    if (p === null) return no('not-linked');
    await lock(t, p);
    if ((await mainOf(t, p, a.now)) === a.actor) return no('is-main');
    const to = a.newMain ?? a.actor;
    if ((await accountOf(t, to)) !== p) return no('not-linked');
    const [open] = await t.q(`select 1 from studio.main_requests where person_id = $1 and ended_at is null`, [p]);
    if (open) return no('pending');
    const effective = new Date(a.now.getTime() + recoveryDays * DAY);
    await t.q(`insert into studio.main_requests (person_id, requested_by, new_main, requested_at, effective_at) values ($1, $2, $3, $4, $4::timestamptz + interval '30 days')`, [
      p, a.actor, to, iso(a.now),
    ]);
    return { ok: true, effective };
  });
}

/** Only the main sign-in cancels a pending request. */
export async function cancelRequest(db: Db, a: { actor: number; now: Date }, cfg: Config = LINKED_ACCOUNTS): Promise<Result> {
  if (!cfg.enabled) return OFF;
  return db.tx(async (t) => {
    const p = await accountOf(t, a.actor);
    if (p === null) return no('not-linked');
    await lock(t, p);
    if ((await mainOf(t, p, a.now)) !== a.actor) return no('only-main-cancels');
    const r = await t.q(`update studio.main_requests set ended_at = $2, ended_how = 'cancelled', ended_by = $3 where person_id = $1 and ended_at is null returning id`, [p, iso(a.now), a.actor]);
    return r.length ? { ok: true } : no('no-request');
  });
}

/** The pending request, for the banner on every sign-in's You page. */
export async function pendingRequest(db: Db, p: number, now: Date): Promise<{ requestedBy: number; newMain: number; requestedAt: Date; effectiveAt: Date } | null> {
  await settle(db, p, now);
  const [r] = await db.q<{ requested_by: string; new_main: string; requested_at: Date; effective_at: Date }>(
    `select requested_by, new_main, requested_at, effective_at from studio.main_requests where person_id = $1 and ended_at is null`,
    [p],
  );
  return r ? { requestedBy: Number(r.requested_by), newMain: Number(r.new_main), requestedAt: new Date(r.requested_at), effectiveAt: new Date(r.effective_at) } : null;
}

// --- Any sign-in ---------------------------------------------------------------------------------------------------

/** Making or spending: any sign-in; the row's owner stamp is its Snowmoon account now. */
export async function ownerFor(db: Db, actor: number, cfg: Config = LINKED_ACCOUNTS): Promise<Result<{ person: number }>> {
  if (!cfg.enabled) return OFF;
  const p = await accountOf(db, actor);
  return p === null ? no('not-linked') : { ok: true, person: p };
}

/** Submitting a challenge entry: a social sign-in only (the own-post check needs one); the record names it. */
export async function submitter(db: Db, actor: number, cfg: Config = LINKED_ACCOUNTS): Promise<Result<{ person: number; recordAccount: number }>> {
  if (!cfg.enabled) return OFF;
  const o = await ownerFor(db, actor, cfg);
  if (!o.ok) return o;
  if (!isSocial(await kindOf(db, actor))) return no('social-only');
  return { ok: true, person: o.person, recordAccount: actor };
}

/** The Snowmoon account passes while a linked social sign-in has a current pass (checks stay with the social account). */
export async function accountPasses(db: Db, p: number, passes: (n: number, kind: Kind) => Promise<boolean> | boolean): Promise<boolean> {
  for (const s of await signInsOf(db, p)) if (isSocial(s.kind) && (await passes(s.account, s.kind))) return true;
  return false;
}

/** The challenge's makers hook: Snowmoon accounts that shared a sign-in at any time in [open, close], or were joined, count as one maker. */
export async function makerGroups(db: Db, people: number[], open: Date, close: Date): Promise<number[][]> {
  const parent = new Map<number, number>(people.map((p) => [p, p]));
  const find = (x: number): number => {
    const y = parent.get(x) ?? x;
    if (y === x) return x;
    const r = find(y);
    parent.set(x, r);
    return r;
  };
  const unite = (x: number, y: number) => {
    if (!parent.has(x)) parent.set(x, x);
    if (!parent.has(y)) parent.set(y, y);
    parent.set(find(x), find(y));
  };
  const rows = await db.q<{ a: string; b: string }>(
    `select x.person_id as a, y.person_id as b from studio.person_accounts x join studio.person_accounts y on x.account = y.account and x.person_id < y.person_id
     where x.linked_at <= $2 and coalesce(x.unlinked_at, 'infinity') >= $1 and y.linked_at <= $2 and coalesce(y.unlinked_at, 'infinity') >= $1
     union select from_person, into_person from studio.person_joins`,
    [iso(open), iso(close)],
  );
  for (const r of rows) unite(Number(r.a), Number(r.b));
  const groups = new Map<number, number[]>();
  for (const p of people) groups.set(find(p), [...(groups.get(find(p)) ?? []), p]);
  return [...groups.values()];
}

/** Rows of an owned private table that belong to a Snowmoon account now (stamps resolve through joins). */
export async function ownedCount(db: Db, table: string, p: number): Promise<number> {
  if (!/^[a-z_]+$/.test(table)) throw new Error('table');
  const [r] = await db.q<{ n: string }>(`select count(*) as n from studio.${table} where studio.owner_of(person_id) = $1`, [p]);
  return Number(r.n);
}
