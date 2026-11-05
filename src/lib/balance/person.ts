import 'server-only';
import type postgres from 'postgres';
import { isAddressEqual, recoverMessageAddress, type Hash, type PublicClient } from 'viem';
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { IMAGES, PERSON_BALANCE } from '../config';
import { isFarcasterPerson, isSocialPerson } from '../people';
import { chain, readPayment, type Payment } from '../wallet/chain';
import { nonceOk } from '../wallet/session';
import { priceUsd, type CreditReason } from '../wallet/credits';

/**
 * Paying per person (owner, 2026-11-04; DRAFT; docs/proposals/person-balance.md; migration NEXT_person_balance).
 * Drafted by a coding agent (Claude, a closed model by Anthropic). Behind PERSON_BALANCE.enabled, which is off.
 *
 * A Farcaster, Lens or Bluesky person has a prepaid balance of its own: payments - debits + credit-backs, in
 * studio.person_payments, person_debits and person_credits, keyed by the person number. Wallet accounts keep theirs
 * (src/lib/wallet/credits.ts). A payment comes from a browser wallet:
 * 1. the wallet signs a Sign-In with Ethereum message naming the session's person (payMessage); the server checks it
 *    (verifyPayIntent) and keeps an intent: the person and the wallet's address (recordIntent);
 * 2. the wallet pays on Base, as a wallet account does;
 * 3. the server credits the payment (claim) only to the intent's person, only for this session's person, once per
 *    intent, from the intent's address (readPayment), in the intent's time window, and only if the transaction was
 *    never credited to anyone (studio.paid_transactions, filled by the migration's trigger on both payment tables).
 * Payments are final: never paid back as money.
 */
type Sql = postgres.Sql;

/** Who can hold a person balance: a Farcaster ID or a Lens or Bluesky account, never a wallet account. */
export const holdsPersonBalance = (person: number) => isFarcasterPerson(person) || isSocialPerson(person);
export const personBalanceOn = () => Boolean(PERSON_BALANCE.enabled && IMAGES.prepaid.enabled && IMAGES.prepaid.payTo);

const STATEMENT = 'Add payments from this wallet to a prepaid balance on Snowmoon. Payments are final.';
const requestId = (person: number) => `person:${person}`;

/** The message the wallet signs: our domain, Base, our nonce, and the person it pays for. DRAFT wording. */
export function payMessage(o: { domain: string; uri: string; address: `0x${string}`; person: number; nonce: string; issuedAt?: Date }): string {
  return createSiweMessage({
    domain: o.domain,
    uri: o.uri,
    address: o.address,
    chainId: IMAGES.prepaid.chainId,
    nonce: o.nonce,
    version: '1',
    issuedAt: o.issuedAt ?? new Date(),
    statement: STATEMENT,
    requestId: requestId(o.person),
  });
}

/**
 * The wallet address that signed this message to pay for `person`, if the message is ours (domain, Base, our nonce,
 * current), names exactly this person, and is really signed by that address (smart wallets through Base).
 */
export async function verifyPayIntent(message: string, signature: `0x${string}`, domain: string, person: number, client: PublicClient = chain()): Promise<`0x${string}` | null> {
  if (!holdsPersonBalance(person)) return null;
  let m;
  try {
    m = parseSiweMessage(message);
  } catch {
    return null;
  }
  if (!m.address || !m.nonce || m.chainId !== IMAGES.prepaid.chainId || !nonceOk(m.nonce)) return null;
  if (m.requestId !== requestId(person) || m.statement !== STATEMENT) return null;
  if (!validateSiweMessage({ message: m, domain })) return null;
  const signer = await recoverMessageAddress({ message, signature }).catch(() => null);
  if (signer && isAddressEqual(signer, m.address)) return m.address.toLowerCase() as `0x${string}`;
  const ok = await client.verifySiweMessage({ message, signature, domain, nonce: m.nonce }).catch(() => false);
  return ok ? (m.address.toLowerCase() as `0x${string}`) : null;
}

/** Keeps the intent; its id goes back to the page, which sends it with the payment's hash. */
export async function recordIntent(sql: Sql, person: number, address: string): Promise<string> {
  if (!holdsPersonBalance(person)) throw new Error('not a person balance');
  const [r] = await sql`insert into studio.person_pay_intents (person, address) values (${person}, ${address.toLowerCase()}) returning id::text as id`;
  return r.id;
}

export type Claim =
  | { ok: true; usd: number; token: 'USDC' | 'ETH'; balanceUsd: number }
  | { ok: false; why: 'off' | 'not-yours' | 'used' | 'too-early' | 'too-late' | 'already' | Extract<Payment, { ok: false }>['why'] };

/**
 * Credits a payment to `person` through one of its intents. `person` is the session's; the intent must be theirs
 * (otherwise 'not-yours', with nothing said about whose it is). Read from Base through `client` (tests: a stub).
 */
export async function claim(sql: Sql, person: number, intentId: string, txHash: Hash, client: PublicClient = chain()): Promise<Claim> {
  if (!personBalanceOn() || !holdsPersonBalance(person)) return { ok: false, why: 'off' };
  if (!/^[0-9a-f-]{36}$/i.test(intentId) || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, why: 'not-yours' };
  const [intent] = await sql`select person::float8 as person, address, extract(epoch from created_at)::float8 as at,
      exists (select 1 from studio.person_payments p where p.intent_id = i.id) as used
    from studio.person_pay_intents i where id = ${intentId}`;
  if (!intent || intent.person !== person) return { ok: false, why: 'not-yours' };
  if (intent.used) return { ok: false, why: 'used' };
  const hash = txHash.toLowerCase() as Hash;
  const [done] = await sql`select 1 from studio.paid_transactions where tx_hash = ${hash}`;
  if (done) return { ok: false, why: 'already' };
  const p = await readPayment(hash, intent.address, client);
  if (!p.ok) return p;
  const block = await client.getBlock({ blockNumber: p.blockNumber });
  const t = Number(block.timestamp);
  if (t < intent.at - PERSON_BALANCE.earlyMinutes * 60) return { ok: false, why: 'too-early' };
  if (t > intent.at + PERSON_BALANCE.intentHours * 3600) return { ok: false, why: 'too-late' };
  let rows;
  try {
    rows = await sql`insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number)
      values (${hash}, ${intentId}, ${person}, ${IMAGES.prepaid.chainId}, ${p.token}, ${p.amount.toString()}, ${p.usd}, ${p.blockNumber.toString()})
      on conflict (tx_hash) do nothing returning 1`;
  } catch (e) {
    // Another claim used this intent at the same moment (intent_id is unique).
    if ((e as { code?: string }).code === '23505') return { ok: false, why: 'used' };
    throw e;
  }
  if (!rows.length) return { ok: false, why: 'already' };
  return { ok: true, usd: p.usd, token: p.token, balanceUsd: await personBalanceUsd(sql, person) };
}

/** payments - debits + credit-backs. Credits already given always count. */
export async function personBalanceUsd(sql: Sql, person: number): Promise<number> {
  if (!holdsPersonBalance(person)) return 0;
  const [r] = await sql`select
      coalesce((select sum(usd) from studio.person_payments where person = ${person}), 0)::float8
    - coalesce((select sum(usd) from studio.person_debits where person = ${person}), 0)::float8
    + coalesce((select sum(usd) from studio.person_credits where person = ${person}), 0)::float8 as usd`;
  return Math.round((r?.usd ?? 0) * 1e6) / 1e6;
}

/** What a Generate cost the person, taken when it is pressed (inside the caller's lock). Its id, for a credit-back. */
export async function personDebit(sql: Sql, person: number, usd: number): Promise<number> {
  const [r] = await sql`insert into studio.person_debits (person, usd) values (${person}, ${usd}) returning id::int as id`;
  return r.id;
}

/**
 * Inside reserve()'s transaction and locks, once the free path has refused: pays this Generate from the person's
 * balance if it covers the price, under the site-wide prepaid daily cap (`prepaidSpentToday`, daily totals without a
 * person). No per-person cap. null: not for this person (switch off, a wallet account) or the balance doesn't cover
 * it, so the caller keeps its free refusal.
 */
export async function payFromPersonBalance(
  tx: Sql,
  person: number,
  reserveUsd: number,
  prepaidSpentToday: () => Promise<number>,
): Promise<{ ok: true; debitId: number; balanceAfter: number; price: number } | { ok: false; refusal: 'prepaid-spend' } | null> {
  if (!personBalanceOn() || !holdsPersonBalance(person)) return null;
  let balance: number;
  try {
    balance = await personBalanceUsd(tx, person);
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return null; // the migration isn't applied: no balances
    throw e;
  }
  const price = priceUsd(reserveUsd);
  if (balance < price) return null;
  if ((await prepaidSpentToday()) + reserveUsd > IMAGES.prepaid.dailyCapUsd) return { ok: false, refusal: 'prepaid-spend' };
  const debitId = await personDebit(tx, person, price);
  return { ok: true, debitId, balanceAfter: balance - price, price };
}

/** A Generate that gave no picture: its person debit back to the same person, once, for exactly what was taken. Never throws. */
export async function personCreditBack(sql: Sql, debitId: number | undefined, reason: CreditReason): Promise<boolean> {
  if (!IMAGES.prepaid.creditBack || !debitId) return false;
  try {
    const rows = await sql`insert into studio.person_credits (debit_id, person, usd, reason)
      select id, person, usd, ${reason} from studio.person_debits where id = ${debitId}
      on conflict (debit_id) do nothing returning 1`;
    return rows.length > 0;
  } catch (e) {
    console.error('person credit back failed', (e as Error).name);
    return false;
  }
}
