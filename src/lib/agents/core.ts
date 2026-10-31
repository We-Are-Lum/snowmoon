import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import { AGENTS, appUrl } from '../config';
import { db } from '../db';

/**
 * Agents that act for a person (owner, 2026-10-20; docs/agents/design.md). This file holds what every
 * route shares: the switch, tokens, finding the agent behind a request, and its daily counts.
 *
 * An agent's token is opaque ("sa1_" + 32 random bytes); only its sha256 is stored. It is never a
 * Farcaster or wallet sign-in: getFid and getPerson (src/lib/auth.ts) never accept it, so an agent can
 * never act as a person anywhere on the site.
 */
type Sql = postgres.Sql;

/** The local tests' switch: never on Vercel. */
export const agentsTestOn = () => process.env.AGENTS_TEST === '1' && !process.env.VERCEL;
export const agentsOn = () => AGENTS.enabled || agentsTestOn();
/** Public pages (agents.md, /p): off while agents are for the allowlist only. The tests can turn them on. */
export const agentsPublic = () => AGENTS.public || (agentsTestOn() && process.env.AGENTS_TEST_PUBLIC === '1');

/**
 * Who may use agents (owner, 2026-10-20: "for my account only"): AGENTS.people (the owner's FID and wallet).
 * The local tests name their own people in AGENTS_TEST_ALLOW (FIDs or addresses, comma-separated; never on
 * Vercel). A wallet account is matched by its address.
 */
export async function allowed(person: number | null): Promise<boolean> {
  if (person === null || !agentsOn()) return false;
  const test = agentsTestOn() ? (process.env.AGENTS_TEST_ALLOW ?? '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean) : [];
  if (person > 0) return AGENTS.people.fids.includes(person) || test.includes(String(person));
  const [w] = await sql()<{ address: string }[]>`select address from studio.wallet_accounts where id = ${-person}`;
  const a = w?.address?.toLowerCase();
  // Compared lowercase on both sides, so a checksummed address in AGENTS.people.wallets still matches.
  return !!a && (AGENTS.people.wallets.some((w) => w.toLowerCase() === a) || test.includes(a));
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const newToken = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

/** The site's own address, as OAuth names it (issuer) and as the connector's URL. */
export const issuer = () => appUrl();
export const resourceUrl = () => `${appUrl()}${AGENTS.resourcePath}`;

export type Scope = (typeof AGENTS.scopes)[number] | 'play';
/** Whether the "play" scope can be granted and used (AGENTS.minpentaiPlay; the local tests can turn it on). */
export const playOn = () => AGENTS.minpentaiPlay || (agentsTestOn() && process.env.MINPENTAI_PLAY_TEST === '1');
/** The scopes a person can grant now. */
export const grantable = (): Scope[] => [...AGENTS.scopes, ...(playOn() ? (['play'] as const) : [])];

export interface Agent {
  id: string;
  person: number;
  route: 'oauth' | 'wallet' | 'key';
  name: string;
  scopes: Scope[];
  clientId: string | null;
  address: string | null;
  /** A personal key's spend cap in US dollars (null for the other routes). */
  spendCapUsd: number | null;
}

/**
 * The credential on a request: an access token ("sa1_…", from OAuth or a wallet sign-in) as a bearer token, or
 * a personal agent key ("sk1_…") as a bearer token or in the X-Snowmoon-Key header. Never logged anywhere.
 */
function credentialOf(request: Request): { token: string; kind: 'access' | 'key' } | null {
  const bearer = (request.headers.get('authorization') ?? '').match(/^Bearer\s+((sa1|sk1)_[A-Za-z0-9_-]{20,80})$/);
  if (bearer) return { token: bearer[1], kind: bearer[2] === 'sk1' ? 'key' : 'access' };
  const key = (request.headers.get(AGENTS.key.header) ?? '').trim().match(/^sk1_[A-Za-z0-9_-]{20,80}$/);
  return key ? { token: key[0], kind: 'key' } : null;
}

export function sql(): Sql {
  const s = db();
  if (!s) throw new Error('no database');
  return s;
}

/** The live agent behind a bearer token for this resource, or null (expired, revoked, unknown, or a person's token). */
export async function agentFromRequest(request: Request): Promise<Agent | null> {
  const cred = credentialOf(request);
  if (!cred) return null;
  const s = sql();
  const [row] = await s<{ id: string; person: string; route: 'oauth' | 'wallet' | 'key'; name: string; scopes: string[]; client_id: string | null; address: string | null; spend_cap_usd: string | null }[]>`
    select a.id, a.person, a.route, a.name, a.scopes, a.client_id, a.address, a.spend_cap_usd
    from studio.agent_tokens t join studio.agents a on a.id = t.agent_id
    where t.token_hash = ${sha256(cred.token)} and t.kind = ${cred.kind} and t.revoked_at is null and t.expires_at > now()
      and t.resource = ${resourceUrl()}
      and a.revoked_at is null and a.expires_at > now()
      and (a.route <> 'wallet' or a.link_signature is not null)
      and (t.kind <> 'key' or a.route = 'key')`;
  if (!row) return null;
  // The allowlist is checked on every request too, so taking someone off it stops their agents at once.
  if (!(await allowed(Number(row.person)))) return null;
  await s`update studio.agents set last_used_at = now() where id = ${row.id}`;
  return { id: row.id, person: Number(row.person), route: row.route, name: row.name, scopes: row.scopes as Scope[], clientId: row.client_id, address: row.address, spendCapUsd: row.spend_cap_usd === null ? null : Number(row.spend_cap_usd) };
}

/** An access token (and, for OAuth, a refresh token) for an agent. */
export async function issueTokens(s: Sql, agentId: string, resource: string, withRefresh: boolean) {
  const access = newToken('sa1_');
  await s`insert into studio.agent_tokens (token_hash, agent_id, kind, resource, expires_at)
    values (${sha256(access)}, ${agentId}, 'access', ${resource}, now() + make_interval(mins => ${AGENTS.accessMinutes}))`;
  let refresh: string | null = null;
  if (withRefresh) {
    refresh = newToken('sr1_');
    await s`insert into studio.agent_tokens (token_hash, agent_id, kind, resource, expires_at)
      values (${sha256(refresh)}, ${agentId}, 'refresh', ${resource}, now() + make_interval(days => ${AGENTS.refreshDays}))`;
  }
  return { access_token: access, token_type: 'Bearer', expires_in: AGENTS.accessMinutes * 60, ...(refresh ? { refresh_token: refresh } : {}) };
}

export type Counted = 'drafts' | 'notes' | 'images' | 'reads';

/** An agent's daily counts: its person's own (AGENTS.limitsFor) if they have them, else the defaults. */
export const dailyLimits = (person: number) => ({ ...AGENTS.limits, ...(AGENTS.limitsFor[person] ?? {}) });

/**
 * Counts one more of `what` for the agent today and says whether it is within its limits. Images also
 * have a per-minute brake, a per-person total across all their agents, and a site-wide brake.
 */
export async function countOk(agent: Agent, what: Counted): Promise<{ ok: true } | { ok: false; why: string }> {
  const s = sql();
  if (what === 'reads') {
    const [r] = await s<{ n: number }[]>`
      insert into studio.agent_counts (agent_id, day, what, n) values (${agent.id}, (now() at time zone 'utc')::date, ${'reads@' + new Date().toISOString().slice(0, 16)}, 1)
      on conflict (agent_id, day, what) do update set n = studio.agent_counts.n + 1 returning n`;
    return r.n > AGENTS.limits.readsPerMinute ? { ok: false, why: `at most ${AGENTS.limits.readsPerMinute} reads a minute` } : { ok: true };
  }
  const limit = dailyLimits(agent.person)[what];
  if (what === 'images') {
    const [m] = await s<{ n: number }[]>`
      insert into studio.agent_counts (agent_id, day, what, n) values (${agent.id}, (now() at time zone 'utc')::date, ${'images@' + new Date().toISOString().slice(0, 16)}, 1)
      on conflict (agent_id, day, what) do update set n = studio.agent_counts.n + 1 returning n`;
    if (m.n > AGENTS.limits.imagesPerMinute) return { ok: false, why: `at most ${AGENTS.limits.imagesPerMinute} images a minute` };
    const [p] = await s<{ n: number }[]>`select coalesce(sum(c.n), 0)::int as n from studio.agent_counts c join studio.agents a on a.id = c.agent_id
      where a.person = ${agent.person} and c.what = 'images' and c.day = (now() at time zone 'utc')::date`;
    if (p.n >= AGENTS.perPersonImages) return { ok: false, why: `your person's agents have brought in ${AGENTS.perPersonImages} images today, the most for one day` };
    const [w] = await s<{ n: number }[]>`select coalesce(sum(n), 0)::int as n from studio.agent_counts where what = 'images' and day = (now() at time zone 'utc')::date`;
    if (w.n >= AGENTS.siteImagesPerDay) return { ok: false, why: 'bringing in images has reached today’s limit for everyone; more tomorrow (00:00 UTC)' };
  }
  const [r] = await s<{ n: number }[]>`
    insert into studio.agent_counts (agent_id, day, what, n) values (${agent.id}, (now() at time zone 'utc')::date, ${what}, 1)
    on conflict (agent_id, day, what) do update set n = studio.agent_counts.n + 1 returning n`;
  if (r.n > limit) return { ok: false, why: `at most ${limit} ${what} a day for one agent; more tomorrow (00:00 UTC)` };
  return { ok: true };
}
