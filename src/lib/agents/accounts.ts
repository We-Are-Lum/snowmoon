import 'server-only';
import { isAddress, recoverMessageAddress, isAddressEqual } from 'viem';
import { AGENTS } from '../config';
import { handleFor } from '../adaptation-pages';
import { verifySignIn } from '../wallet/chain';
import { issueTokens, newToken, resourceUrl, sha256, sql, type Scope } from './core';

/**
 * A person's agents, as /you shows them, and the third way in: an agent with its own wallet, for
 * people who run fleets of agents (design v1, owner 2026-10-19). The person names the agent's address
 * on /you; the agent signs the link message that names its person; then it signs in with that wallet
 * whenever it needs a token. Revoking (one tap on /you) ends every token at once.
 */
export interface AgentRow {
  id: string;
  name: string;
  route: 'oauth' | 'wallet' | 'key';
  scopes: Scope[];
  address: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  waitingForSignature: boolean;
  /** A key's spend cap, and what its approved drafts have spent so far (US dollars). */
  spendCapUsd: number | null;
  spentUsd: number;
}

export async function agentsOf(person: number): Promise<AgentRow[]> {
  const rows = await sql()<{ id: string; name: string; route: 'oauth' | 'wallet' | 'key'; scopes: string[]; address: string | null; created_at: Date; expires_at: Date; last_used_at: Date | null; link_signature: string | null; spend_cap_usd: string | null; spent: number }[]>`
    select a.id, a.name, a.route, a.scopes, a.address, a.created_at, a.expires_at, a.last_used_at, a.link_signature, a.spend_cap_usd,
      (select coalesce(sum(pv.spent_usd), 0)::float8 from studio.piece_versions pv where pv.agent_id = a.id) as spent
    from studio.agents a where a.person = ${person} and a.revoked_at is null and a.expires_at > now() order by a.created_at`;
  return rows.map((r) => ({
    id: r.id, name: r.name, route: r.route, scopes: r.scopes as Scope[], address: r.address,
    createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    waitingForSignature: r.route === 'wallet' && !r.link_signature,
    spendCapUsd: r.spend_cap_usd === null ? null : Number(r.spend_cap_usd), spentUsd: Number(r.spent),
  }));
}

/**
 * A personal agent key (owner, 2026-10-20): for a client that sends a key in a header rather than signing in
 * (Muse). Drafts only, a spend cap the person sets, 30 days. The key is returned here once and never again:
 * only its sha256 is stored, and it is never logged.
 */
export async function createKey(person: number, name: string, capUsd: number): Promise<{ id: string; key: string; expiresAt: string; spendCapUsd: number }> {
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
  if (!clean) throw new Error('Give the key a name, such as the app it’s for.');
  if (!Number.isFinite(capUsd) || capUsd < 0 || capUsd > AGENTS.key.capUsd.max) throw new Error(`The spend cap is from $0 to $${AGENTS.key.capUsd.max}.`);
  const cap = Math.round(capUsd * 100) / 100;
  const s = sql();
  return await s.begin(async (tx) => {
    const [live] = await tx<{ n: number }[]>`select count(*)::int as n from studio.agents where person = ${person} and revoked_at is null and expires_at > now()`;
    if (live.n >= AGENTS.perPerson) throw new Error(`You already have ${AGENTS.perPerson} agents. Disconnect one first.`);
    const [a] = await tx<{ id: string; expires_at: Date }[]>`insert into studio.agents (person, route, name, scopes, expires_at, spend_cap_usd)
      values (${person}, 'key', ${clean}, ${[...AGENTS.key.scopes]}, now() + make_interval(days => ${AGENTS.key.days}), ${cap}) returning id, expires_at`;
    const key = newToken('sk1_');
    await tx`insert into studio.agent_tokens (token_hash, agent_id, kind, resource, expires_at) values (${sha256(key)}, ${a.id}, 'key', ${resourceUrl()}, ${a.expires_at})`;
    return { id: a.id, key, expiresAt: new Date(a.expires_at).toISOString(), spendCapUsd: cap };
  });
}

/** Disconnect: the agent and every token it holds stop at once. Its drafts stay with the person. */
export async function revoke(person: number, agentId: string): Promise<boolean> {
  const s = sql();
  return await s.begin(async (tx) => {
    const [a] = await tx<{ id: string }[]>`update studio.agents set revoked_at = now() where id = ${agentId} and person = ${person} and revoked_at is null returning id`;
    if (!a) return false;
    await tx`update studio.agent_tokens set revoked_at = now() where agent_id = ${agentId} and revoked_at is null`;
    return true;
  });
}

export function linkMessage(handle: string, name: string, address: string, scopes: Scope[], agentId: string) {
  return [
    'Snowmoon Party agent link',
    `I am an agent of @${handle} on snowmoon.party.`,
    `Agent: ${name}`,
    `Address: ${address}`,
    `Scopes: ${scopes.join(', ')}`,
    `Link: ${agentId}`,
  ].join('\n');
}

/** The person names a wallet agent: it waits for the agent's signature. */
export async function startWalletLink(person: number, address: string, name: string, scopes: Scope[]) {
  if (!isAddress(address)) throw new Error('That isn’t a wallet address.');
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
  if (!clean) throw new Error('Give the agent a name.');
  const handle = (await handleFor(person)) ?? String(person);
  const s = sql();
  const [live] = await s<{ n: number }[]>`select count(*)::int as n from studio.agents where person = ${person} and revoked_at is null and expires_at > now()`;
  if (live.n >= AGENTS.perPerson) throw new Error(`You already have ${AGENTS.perPerson} agents. Disconnect one first.`);
  const addr = address.toLowerCase();
  const [taken] = await s`select 1 from studio.agents where address = ${addr} and route = 'wallet' and revoked_at is null`;
  if (taken) throw new Error('That wallet is already an agent.');
  const [{ id }] = await s<{ id: string }[]>`insert into studio.agents (person, route, name, address, scopes, expires_at)
    values (${person}, 'wallet', ${clean}, ${addr}, ${scopes}, now() + make_interval(days => ${AGENTS.linkDays})) returning id`;
  const message = linkMessage(handle, clean, addr, scopes, id);
  await s`update studio.agents set link_message = ${message} where id = ${id}`;
  return { id, message };
}

/** The agent signs the link message with its wallet (an ordinary wallet's signature). */
export async function finishWalletLink(agentId: string, signature: `0x${string}`): Promise<boolean> {
  const s = sql();
  const [a] = await s<{ address: string; link_message: string }[]>`select address, link_message from studio.agents
    where id = ${agentId} and route = 'wallet' and revoked_at is null and link_signature is null and expires_at > now()`;
  if (!a) return false;
  const signer = await recoverMessageAddress({ message: a.link_message, signature }).catch(() => null);
  if (!signer || !isAddressEqual(signer, a.address as `0x${string}`)) return false;
  await s`update studio.agents set link_signature = ${signature} where id = ${agentId}`;
  return true;
}

/** A linked wallet agent signs in (Sign-In with Ethereum, our nonce and domain) for an hour's token. */
export async function walletAgentToken(message: string, signature: `0x${string}`, domain: string) {
  const address = await verifySignIn(message, signature, domain);
  if (!address) return null;
  const s = sql();
  const [a] = await s<{ id: string; scopes: string[] }[]>`select id, scopes from studio.agents
    where address = ${address} and route = 'wallet' and revoked_at is null and link_signature is not null and expires_at > now()`;
  if (!a) return null;
  return { ...(await issueTokens(s, a.id, resourceUrl(), false)), scope: a.scopes.join(' ') };
}

/** "agent of @handle": how an agent is named wherever its work appears. */
export async function agentLabel(person: number, agentName: string | null) {
  const handle = (await handleFor(person)) ?? `${person}`;
  const short = handle.startsWith('0x') ? `${handle.slice(0, 6)}…${handle.slice(-4)}` : handle;
  return { handle, short, label: agentName ? `${agentName}, agent of @${short}` : `@${short}` };
}
