import 'server-only';
import type postgres from 'postgres';
import { isAddressEqual, recoverMessageAddress, type Hash, type PublicClient } from 'viem';
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { IMAGES, PERSON_BALANCE } from '../config';
import { isFarcasterPerson, isSocialPerson, socialAccountOf } from '../people';
import { lookupName } from '../names';
import { socialAccount } from '../social/accounts';
import { chain, readPayment, type Payment } from '../wallet/chain';
import { nonceOk } from '../wallet/session';
import { priceUsd, type CreditReason } from '../wallet/credits';

/**
 * Paying per person (owner, 2026-11-04; DRAFT; docs/proposals/person-balance.md; migration NEXT_person_balance).
 * Drafted by a coding agent (Claude, a closed model by Anthropic). Behind PERSON_BALANCE.enabled.
 *
 * A Farcaster, Lens or Bluesky person has a prepaid balance of its own: payments - debits + credit-backs, in
 * studio.person_payments, person_debits and person_credits, keyed by the person number. Wallet accounts keep theirs
 * (src/lib/wallet/credits.ts). A payment comes from a browser wallet:
 * 1. the wallet signs a Sign-In with Ethereum message naming the session's person, in words and by number (payMessage);
 *    the server checks it (verifyPayIntent) and keeps an intent: the person and the wallet's address (recordIntent);
 * 2. the wallet pays on Base, as a wallet account does;
 * 3. the server credits the payment (claim, by its hash) only to this session's person, through one of their own
 *    intents, once per intent, from that intent's address (readPayment), in its time window, and only if the
 *    transaction was never credited to anyone (studio.paid_transactions, filled by the migration's trigger on both
 *    payment tables).
 * Payments are final: never paid back as money.
 */
type Sql = postgres.Sql;

/** Who can hold a person balance: a Farcaster ID or a Lens or Bluesky account, never a wallet account. */
export const holdsPersonBalance = (person: number) => isFarcasterPerson(person) || isSocialPerson(person);
export const personBalanceOn = () => Boolean(PERSON_BALANCE.enabled && IMAGES.prepaid.enabled && IMAGES.prepaid.payTo);

const requestId = (person: number) => `person:${person}`;

/**
 * The account a payment goes to, in words, for the statement the wallet shows (owner, 2026-11-04: "names the account
 * in words"): "your Farcaster account @name (FID n)", "your Lens account lens/name", "your Bluesky account @handle".
 * Without a name: the FID, the Lens account's address, or the Bluesky DID. Read again when the signature comes back,
 * and the two must match. Null: not a person balance, or a Lens or Bluesky account we don't have.
 */
export async function accountWords(sql: Sql | null, person: number, nameOf: (fid: number) => Promise<string | null> = lookupName): Promise<string | null> {
  if (isFarcasterPerson(person)) {
    const name = await nameOf(person).catch(() => null);
    return name ? `your Farcaster account @${name} (FID ${person})` : `your Farcaster account FID ${person}`;
  }
  if (!isSocialPerson(person) || !sql) return null;
  const a = await socialAccount(sql, socialAccountOf(person));
  if (!a) return null;
  if (a.kind === 'lens') return `your Lens account ${a.handle ?? a.subject}`;
  return a.handle ? `your Bluesky account @${a.handle}` : `your Bluesky account ${a.subject}`;
}
/** The statement for that account. DRAFT wording. One line (EIP-4361 statements have no line breaks). */
export const statementFor = (words: string) => `Add payments from this wallet to the prepaid balance of ${words.replace(/[\r\n]+/g, ' ')} on Snowmoon. Payments are final.`;

/** The message the wallet signs: our domain, Base, our nonce, and the account it pays for, in words and by number. */
export function payMessage(o: { domain: string; uri: string; address: `0x${string}`; person: number; words: string; nonce: string; issuedAt?: Date }): string {
  return createSiweMessage({
    domain: o.domain,
    uri: o.uri,
    address: o.address,
    chainId: IMAGES.prepaid.chainId,
    nonce: o.nonce,
    version: '1',
    issuedAt: o.issuedAt ?? new Date(),
    statement: statementFor(o.words),
    requestId: requestId(o.person),
  });
}

/**
 * The wallet address that signed this message to pay for `person`, if the message is ours (domain, Base, our nonce,
 * current), names exactly this person (the request id) and this account in words (`words`, read again now), and is
 * really signed by that address (smart wallets through Base).
 */
export async function verifyPayIntent(message: string, signature: `0x${string}`, domain: string, person: number, words: string | null, client: PublicClient = chain()): Promise<`0x${string}` | null> {
  if (!holdsPersonBalance(person) || !words) return null;
  let m;
  try {
    m = parseSiweMessage(message);
  } catch {
    return null;
  }
  if (!m.address || !m.nonce || m.chainId !== IMAGES.prepaid.chainId || !nonceOk(m.nonce)) return null;
  if (m.requestId !== requestId(person) || m.statement !== statementFor(words)) return null;
  if (!validateSiweMessage({ message: m, domain })) return null;
  const signer = await recoverMessageAddress({ message, signature }).catch(() => null);
  if (signer && isAddressEqual(signer, m.address)) return m.address.toLowerCase() as `0x${string}`;
  const ok = await client.verifySiweMessage({ message, signature, domain, nonce: m.nonce }).catch(() => false);
  return ok ? (m.address.toLowerCase() as `0x${string}`) : null;
}

/** Keeps the intent. The page needs nothing back but that it was kept: a claim finds it from the payment. */
export async function recordIntent(sql: Sql, person: number, address: string): Promise<string> {
  if (!holdsPersonBalance(person)) throw new Error('not a person balance');
  const [r] = await sql`insert into studio.person_pay_intents (person, address) values (${person}, ${address.toLowerCase()}) returning id::text as id`;
  return r.id;
}

export type Claim =
  | { ok: true; usd: number; token: 'USDC' | 'ETH'; balanceUsd: number }
  | { ok: false; why: 'off' | 'not-yours' | 'used' | 'too-early' | 'too-late' | 'already' | 'no-intent' | Extract<Payment, { ok: false }>['why'] };

/** The most wallets one claim tries (each is one read of the transaction on Base). */
const MAX_WALLETS = 5;

/**
 * Credits a payment to `person`, the session's. By its hash alone (the page keeps only the hash, as for a wallet
 * account; Privacy §3): the person's unused intents are tried, newest wallet first, and the payment must come from
 * one of their wallets and fall in that intent's window. With `intentId`: only that intent, which must be the person's
 * (otherwise 'not-yours', with nothing said about whose it is). Read from Base through `client` (tests: a stub).
 */
export async function claim(sql: Sql, person: number, txHash: Hash, client: PublicClient = chain(), intentId?: string): Promise<Claim> {
  if (!personBalanceOn() || !holdsPersonBalance(person)) return { ok: false, why: 'off' };
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash) || (intentId !== undefined && !/^[0-9a-f-]{36}$/i.test(intentId))) return { ok: false, why: 'not-yours' };
  const hash = txHash.toLowerCase() as Hash;
  type Intent = { id: string; person: number; address: string; at: number; used: boolean };
  let intents: Intent[];
  if (intentId) {
    const rows = (await sql`select id::text as id, person::float8 as person, address, extract(epoch from created_at)::float8 as at,
        exists (select 1 from studio.person_payments p where p.intent_id = i.id) as used
      from studio.person_pay_intents i where id = ${intentId}`) as unknown as Intent[];
    if (!rows[0] || rows[0].person !== person) return { ok: false, why: 'not-yours' };
    if (rows[0].used) return { ok: false, why: 'used' };
    intents = rows;
  } else {
    // Unused intents young enough for a payment we'd still credit (IMAGES.prepaid.maxAgeDays, plus the window).
    intents = (await sql`select id::text as id, person::float8 as person, address, extract(epoch from created_at)::float8 as at, false as used
      from studio.person_pay_intents i
      where person = ${person} and created_at > now() - make_interval(days => ${IMAGES.prepaid.maxAgeDays + 1})
        and not exists (select 1 from studio.person_payments p where p.intent_id = i.id)
      order by created_at desc limit 50`) as unknown as Intent[];
    if (!intents.length) return { ok: false, why: 'no-intent' };
  }
  const [done] = await sql`select 1 from studio.paid_transactions where tx_hash = ${hash}`;
  if (done) return { ok: false, why: 'already' };

  // Which of the person's wallets sent it: the first whose reading of the transaction pays us.
  const wallets = [...new Set(intents.map((i) => i.address))].slice(0, MAX_WALLETS);
  let p: Payment | null = null;
  let from = '';
  for (const w of wallets) {
    const r = await readPayment(hash, w, client);
    if (r.ok || (r.why !== 'not-from-you' && r.why !== 'not-to-us')) {
      p = r;
      from = w;
      break;
    }
    p ??= r;
  }
  if (!p || !p.ok) return p ?? { ok: false, why: 'not-from-you' };
  const t = Number((await client.getBlock({ blockNumber: p.blockNumber })).timestamp);
  // That wallet's intent whose window holds the payment: at most earlyMinutes after the payment, at most intentHours
  // before it. The latest such intent.
  const early = PERSON_BALANCE.earlyMinutes * 60;
  const late = PERSON_BALANCE.intentHours * 3600;
  const own = intents.filter((i) => i.address === from);
  const fits = own.filter((i) => t >= i.at - early && t <= i.at + late).sort((a, b) => b.at - a.at)[0];
  if (!fits) return { ok: false, why: own.every((i) => t < i.at - early) ? 'too-early' : 'too-late' };
  let rows;
  try {
    rows = await sql`insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number)
      values (${hash}, ${fits.id}, ${person}, ${IMAGES.prepaid.chainId}, ${p.token}, ${p.amount.toString()}, ${p.usd}, ${p.blockNumber.toString()})
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
